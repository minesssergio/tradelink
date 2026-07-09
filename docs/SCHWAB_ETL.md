# 🔄 SCHWAB_ETL.md — Motor de Extracción Charles Schwab

> Documentación completa del módulo de autenticación e ingesta de datos desde la API de Charles Schwab.

## 1. Visión General

Este módulo maneja:
1. **Autenticación OAuth 2.0** — Flujo de autorización inicial y obtención de tokens.
2. **Rotación Automática de Tokens** — Servicio cron para mantener una sesión infinita.
3. **Extracción de Datos** — (Fase 2) Ingesta de trades, posiciones y historial de cuentas.

## 2. Endpoints de Schwab API

| Endpoint | URL | Método |
|:---------|:----|:-------|
| Autorización | `https://api.schwabapi.com/v1/oauth/authorize` | GET (redirect) |
| Token Exchange | `https://api.schwabapi.com/v1/oauth/token` | POST |
| Cuentas | `https://api.schwabapi.com/trader/v1/accounts` | GET |
| Transacciones | `https://api.schwabapi.com/trader/v1/accounts/{hash}/transactions` | GET |

## 3. Flujo OAuth 2.0 Detallado

### 3.1 Autorización Inicial (Three-Legged OAuth)

```
Usuario → GET /api/schwab/authorize
       → Redirect a Schwab Login Micro Site
       → Usuario ingresa credenciales de Schwab
       → Schwab redirige a CALLBACK_URL?code=AUTHORIZATION_CODE
       → Backend intercept el code
       → POST /v1/oauth/token con:
           - grant_type: authorization_code
           - code: AUTHORIZATION_CODE
           - redirect_uri: CALLBACK_URL
           - Authorization: Basic base64(CLIENT_ID:CLIENT_SECRET)
       → Schwab responde:
           {
             "access_token": "...",
             "refresh_token": "...",
             "token_type": "Bearer",
             "expires_in": 1800,       // 30 minutos
             "scope": "api",
             "id_token": "..."
           }
       → Backend guarda tokens en Supabase (tabla schwab_tokens)
```

### 3.2 Ciclo de Vida de Tokens

| Token | Duración | Renovable | Estrategia |
|:------|:---------|:----------|:-----------|
| Access Token | 30 minutos | Sí, via refresh | Refrescar proactivamente cada 25 min |
| Refresh Token | 7 días | Sí, Schwab emite uno nuevo en cada refresh | Rotar preventivamente cada 5 días |

> **⚠️ IMPORTANTE**: Schwab emite un **NUEVO** refresh_token con cada refresh exitoso. El viejo queda invalidado. Esto significa que la rotación debe ser **atómica** (transaccional) para evitar perder el token.

### 3.3 Rotación Automática (Cron)

El servicio de rotación se ejecuta como cron job:

**Frecuencia**: Cada 25 minutos (para access token)
**Frecuencia secundaria**: Cada 5 días (refresh token preventivo)

```
Cron → Lee tokens de Supabase
     → Verifica si access_token expira en < 5 minutos
     → Si sí:
         POST /v1/oauth/token con:
           - grant_type: refresh_token
           - refresh_token: CURRENT_REFRESH_TOKEN
           - Authorization: Basic base64(CLIENT_ID:CLIENT_SECRET)
         → Schwab responde con NUEVOS tokens
         → UPDATE atómico en Supabase (ambos tokens + timestamps)
     → Si el refresh_token expiró (>7 días sin rotación):
         → Marca sesión como NEEDS_REAUTH
         → Loggea alerta crítica
```

### 3.4 Rotación Proactiva en Llamadas de Datos

Además del cron, `fetchWithAuth` (lib/schwabApi.ts) verifica **antes de cada llamada** a la Trader API si el access_token expira en < 60 segundos, y en ese caso rota los tokens en línea (`rotateTokensForUser`). Esto evita que una llamada con token vencido reciba 401 y marque la sesión como `NEEDS_REAUTH` incorrectamente.

### 3.4.0 Sync Incremental (evita re-fetch de historia completa)

Cada cuenta usa su propio cursor: `resolveIncrementalStart` (`services/schwab/src/etl/syncCursor.ts`)
toma el `MAX(time)` ya guardado en `schwab_transactions` (o `MAX(entered_time)` en `schwab_orders`) como
punto de partida, con un pequeño solape hacia atrás para capturar liquidaciones/cambios de estado tardíos:

- **Transacciones**: solape de 3 días.
- **Órdenes**: solape de 7 días (una orden WORKING de hace días puede pasar a FILLED sin que cambie su `entered_time`).
- **Primera vez sin datos**: backfill de 730 días (~2 años), trozado en ventanas de 180 días
  (`chunkDateRange`) por si Schwab limita el rango por llamada.

Esto es clave para retención a largo plazo: la base de datos **nunca borra** transacciones/órdenes, así
que una vez guardado un dato queda para siempre — el sync solo necesita traer lo nuevo desde la última
vez, sin importar cuánta historia retenga Schwab en su propia API. Pasar `startDate`/`endDate` explícitos
(CLI `--start-date`, o el body de `POST /schwab/sync`) sigue funcionando como resync manual de un rango
específico, ignorando el cursor incremental para esa corrida.

### 3.4.1 Semántica de Snapshot en Posiciones

`schwab_positions` es un **snapshot** de las posiciones actuales: en cada sync se upsertan las posiciones vigentes y se **eliminan las filas obsoletas** (posiciones cerradas desde el último sync) vía `deleteStalePositions`. Sin esto, las posiciones cerradas quedarían en la tabla para siempre.

### 3.5 CLI de Sincronización

```
npx tsx src/index.ts --sync [--user <uuid>] [--start-date <ISO>]
```

- Sin `--user`: sincroniza **todos** los usuarios con token `ACTIVE`.
- Sin `--start-date`: últimos 90 días.
- Exit code 1 si algún usuario falla.

## 4. Tabla de Errores y Recuperación

| Error | Código HTTP | Causa | Acción |
|:------|:------------|:------|:-------|
| `invalid_grant` | 400 | Authorization code expirado o ya usado | Reiniciar flujo OAuth |
| `invalid_client` | 401 | Client ID/Secret incorrectos | Verificar .env |
| `unauthorized` | 401 | Access token expirado | Ejecutar refresh |
| `invalid_request` | 400 | Parámetros faltantes o malformados | Revisar payload |
| `server_error` | 500 | Error interno de Schwab | Retry con backoff (máx 3) |
| `rate_limit` | 429 | Demasiadas peticiones | Esperar y reintentar |

## 5. Esquema de Base de Datos

```sql
CREATE TABLE public.schwab_tokens (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    access_token        TEXT NOT NULL,
    refresh_token       TEXT NOT NULL,
    token_type          TEXT NOT NULL DEFAULT 'Bearer',
    scope               TEXT DEFAULT 'api',
    expires_at          TIMESTAMPTZ NOT NULL,
    refresh_expires_at  TIMESTAMPTZ NOT NULL,
    schwab_account_hash TEXT,
    status              TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'NEEDS_REAUTH', 'REVOKED')),
    last_rotation_at    TIMESTAMPTZ,
    rotation_count      INTEGER DEFAULT 0,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id)
);
```

## 6. Estructura de Archivos

```
services/schwab/
├── src/
│   ├── types/schwab.types.ts       → Tipos TypeScript
│   ├── config/schwab.config.ts     → Configuración validada
│   ├── lib/
│   │   ├── schwabAuth.ts           → Core OAuth (authorize, exchange, refresh)
│   │   ├── schwabTokenRotation.ts  → Rotación automática
│   │   └── logger.ts               → Logger estructurado
│   └── db/tokenRepository.ts       → CRUD Supabase
├── package.json
└── tsconfig.json
```

## 7. Variables de Entorno Requeridas

| Variable | Descripción | Ejemplo |
|:---------|:------------|:--------|
| `SCHWAB_CLIENT_ID` | App Key del Developer Portal | `abc123...` |
| `SCHWAB_CLIENT_SECRET` | App Secret del Developer Portal | `xyz789...` |
| `SCHWAB_CALLBACK_URL` | URL de callback registrada | `https://127.0.0.1` |
| `SUPABASE_URL` | URL del proyecto Supabase | `https://xxx.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Key para operaciones server-side | `eyJ...` |

---

## 8. Phase 2: Data Sync (ETL)

El motor ETL es responsable de extraer información financiera y normalizarla en nuestra base de datos, usando los tokens obtenidos en la Fase 1.

### 8.1 Arquitectura del Pipeline ETL

El pipeline se divide en tres componentes principales:

1.  **Extractor (E):** Se encarga de la comunicación pura con Schwab. Inyecta el `Bearer` token (o fuerza un refresh si da 401) y maneja la paginación y `Rate Limits` (HTTP 429).
2.  **Transformer (T):** Recibe el payload JSON crudo de Schwab (que puede ser complejo y tener esquemas dispares para acciones y opciones) y lo mapea a nuestras interfaces `schwab.types.ts`.
3.  **Loader (L):** Recibe los arrays de objetos transformados y hace un **Bulk Upsert** en Supabase usando `service_role` key para optimizar el rendimiento y sortear RLS desde el servidor.

### 8.2 Endpoints Involucrados y Frecuencia

| Endpoint de Schwab | Propósito | Frecuencia Sugerida |
| :--- | :--- | :--- |
| `/trader/v1/accounts?fields=positions` | Extraer accounts hashes, balances y posiciones abiertas (snapshot). | Bajo demanda o cada 1 hora. |
| `/trader/v1/accounts/{hash}/transactions` | Extraer el historial inmutable de trades y transferencias. | End of Day (EOD) o una vez al día. |

### 8.3 Manejo de Duplicados (Idempotencia)

Las operaciones ETL deben ser idempotentes (se pueden correr N veces sin duplicar datos).
-   **Cuentas:** Upsert por `user_id` + `account_hash`.
-   **Posiciones:** Upsert por `account_hash` + `symbol` + `asset_type`. (Al ser un snapshot, los valores simplemente se sobrescriben con los números actuales).
-   **Transacciones:** Insert ignorando conflictos (`ON CONFLICT DO NOTHING` o Upsert sin alterar datos) basado en `account_hash` + `activity_id` (el ID único de transacción proveído por Schwab).
