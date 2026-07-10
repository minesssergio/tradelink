# AGENTS.md — Harness para desarrollo continuo de Tradelink

Guía para **cualquier asistente de IA** (Claude Code, Cursor, Copilot, Codeium, Cody, Windsurf, etc.) y para humanos que hagan mejoras futuras sin romper lo construido. Este archivo sigue la convención [agents.md](https://agents.md) — la mayoría de herramientas de IA lo leen automáticamente; si la tuya no lo hace, pégalo como contexto inicial.

## Antes de tocar código

1. Lee `docs/RULES.md` (la ley del proyecto) y este archivo (invariantes críticos).
2. Cambios de arquitectura o esquema: **primero** actualiza el `.md` correspondiente en `docs/`, después el código.
3. Verifica SIEMPRE antes de dar algo por terminado:
   ```bash
   cd services/schwab && npx tsc --noEmit
   cd services/api    && npx tsc --noEmit
   cd frontend         && npm test -- --run     # vitest (motor de trades)
   cd frontend         && npm run build          # tsc -b + vite build
   ```
4. Si tocas `frontend/src/lib/tradeEngine.ts` (el motor de FIFO/lotes), corre y en lo posible **amplía**
   `frontend/src/lib/tradeEngine.test.ts` — es la lógica más crítica y más fácil de romper en silencio.

## Cómo correr y verificar

- `start.bat` arranca API (3001) + frontend (5173). Usuario de la app: `sergioferrufino@gmail.com` (Supabase Auth).
- Sync manual: `cd services/schwab && npx tsx src/index.ts --sync [--user <uuid>] [--start-date <ISO>]`.
- El sync toca la API real de Schwab: úsalo con moderación, y NUNCA guardes/reutilices refresh tokens viejos (Schwab los invalida al rotar).
- En la app misma, el botón **Sync** de la barra de filtros hace lo mismo sin salir del navegador.
- En producción, `POST /api/v1/cron/sync` (protegido por `CRON_SECRET`) corre automático lun-vie 22:00 UTC vía Vercel Cron — sincroniza a todos los usuarios con token ACTIVE. Ver `docs/DEPLOYMENT.md` sección 5.

## Multi-tenancy (varios usuarios, cada uno con sus propias credenciales Schwab)

- **Aislamiento verificado en dos capas independientes**: RLS (`auth.uid() = user_id`, las 7 tablas) +
  filtro por `account_hash` en la API (`getUserAccountHashes`). Dos usuarios con cuentas Schwab reales
  distintas nunca comparten datos — sus `account_hash` nunca coinciden.
- El diseño "account-centric" (ver invariante de arriba) es **intencional** para el caso de una cuenta
  Schwab compartida por dos logins (ej. familia); si nunca vas a soportar eso, no hace falta cambiarlo,
  solo tenlo presente al auditar.
- **Signup público está abierto** (`Login.tsx`, cualquiera con la URL puede crear cuenta — email/password
  o Google OAuth). Si vas a invitar gente específica, restringir esto en Supabase Dashboard →
  Authentication → Settings (o usar invite-only) es responsabilidad del operador, no algo que el código fuerce.
- **Login con Google**: el botón existe en `Login.tsx` (`signInWithOAuth`), pero requiere habilitar el
  provider en Supabase Dashboard → Authentication → Providers → Google, con Client ID/Secret creados en
  Google Cloud Console (OAuth consent screen + credentials, redirect URI
  `https://zjnkohzrgrwmezsmihfv.supabase.co/auth/v1/callback`). Hasta entonces el botón devuelve
  "provider is not enabled".
- **Aislamiento verificado con test real** (2026-07-10): usuario recién creado → 0 filas en los 6
  endpoints del API de producción y 0 filas por acceso directo con su JWT a las 7 tablas RLS. El usuario
  de prueba `isolation-test@tradelink.local` existe en Auth para repetir la prueba; el artefacto
  `admin@tradingjournal.local` quedó con sus vínculos `is_active=false` (sin visibilidad).
- El mismo `SCHWAB_CLIENT_ID`/`SECRET` (una sola app registrada en Schwab) sirve para todos los usuarios
  — es el patrón estándar de OAuth multi-tenant, cada quien autoriza su propia cuenta por separado vía
  Settings → Connect Schwab.

## Invariantes que NO se pueden regresar

| Invariante | Dónde | Por qué |
|---|---|---|
| Multiplicador ×100 en opciones | `frontend/src/lib/tradeEngine.ts` | Sin él, el PnL de opciones queda 100× subestimado (el usuario opera mayormente opciones de SPY) |
| Expiraciones como cierres | `tradeEngine.ts` (`RECEIVE_AND_DELIVER`, positionEffect CLOSING, precio 0) | Sin ellas, los lotes expirados quedan abiertos para siempre |
| Lotes por `cuenta\|símbolo` | `tradeEngine.ts` | El mismo símbolo en dos cuentas jamás se cruza en el motor |
| Método de lotes configurable, default **HIGH_COST** | `tradeEngine.ts` + `FilterContext` + Settings | Las cuentas Schwab del usuario usan High Cost, NO FIFO |
| Visibilidad account-centric | `services/api/src/controllers/portfolio.controller.ts` | Los UNIQUE de positions/transactions no incluyen `user_id`; leer por user_id rompe la visibilidad |
| Posiciones = snapshot (borrar obsoletas) | `services/schwab/src/etl/etlLoader.ts` | Sin `deleteStalePositions`, las posiciones cerradas se acumulan como fantasmas |
| Refresh proactivo de tokens | `services/schwab/src/lib/schwabApi.ts` | Un 401 marca la sesión NEEDS_REAUTH y desconecta a Schwab |
| Trade engine usa transactions, no orders | ETL + frontend | El endpoint de orders no reporta precios de expiración ITM ni movimientos de cash |
| Paginación completa de transacciones | `portfolio.controller.ts` (sin `limit` → todo el historial) | El motor FIFO necesita todas las transacciones para emparejar |
| Sync incremental por cuenta | `services/schwab/src/etl/syncCursor.ts` | Cada sync parte del `MAX(time)`/`MAX(entered_time)` ya guardado, no de una ventana fija — así la BD acumula historia para siempre sin depender de la retención de Schwab. No reintroducir un default de "últimos N días" en los call sites (API/CLI) |
| `dataVersion` en `FilterContext` | `FilterContext.tsx` + `usePortfolioData.ts` | El botón Sync incrementa esta versión para forzar refetch; si un hook nuevo no la observa, quedará mostrando datos viejos tras sincronizar |
| Alias de cuenta en `user_account_aliases` (BD, RLS por usuario), nunca hardcodeados en código | `FilterContext.tsx` + migración 006 | App multi-usuario: un mapeo hardcodeado de cuenta→nombre expone datos personales en el bundle JS público. Los alias viven en la fila privada de cada usuario (localStorage es solo caché de arranque; la BD gana). No reintroducir `DEFAULT_ACCOUNT_NAMES` ni similar |
| Cron de sync usa `CRON_SECRET`, nunca JWT de usuario | `server.ts` (`cronAuthMiddleware`) | El endpoint `/api/v1/cron/sync` no tiene un usuario logueado — Vercel Cron manda `Authorization: Bearer $CRON_SECRET` automáticamente. Fail-safe: sin la env var, responde 500 (nunca corre sin secreto) |

## Testing

- `frontend/src/lib/tradeEngine.test.ts` (Vitest) cubre: cada método de lotes (FIFO/LIFO/HIGH_COST/LOW_COST),
  multiplicador de opciones, expiraciones como cierre, aislamiento de lotes por cuenta, prorrateo de fees,
  reversión de posición (long→short en la misma ejecución) y `calculateStats` (incluye duración
  promedio ganadoras/perdedoras, rachas, expectancy).
- `frontend/src/lib/analytics.test.ts` (Vitest) cubre `breakdownBy`, `underlyingOf`/`instrumentKind`,
  `durationBucketOf`, `advancedStats` y `rollingWinRate` — el motor detrás de Breakdowns/Insights/Win-Rate Charts.
- `services/schwab/src/etl/syncCursor.test.ts` (Vitest) cubre las funciones puras del cursor incremental
  (`resolveIncrementalStart`, `chunkDateRange`).
- `frontend/src/lib/syncHealth.test.ts` (Vitest) cubre la lógica pura del banner de salud del sync
  (`evaluateSyncHealth`: NEEDS_REAUTH crítico, sync viejo >3 días warning, onboarding silencioso).
- Correr: `npm test` (watch) o `npm test -- --run` (una vez, para CI) en `frontend/` o `services/schwab/`.
- `services/api` no tiene tests aún — es I/O-heavy (HTTP, Supabase); si le agregas lógica pura nueva,
  sepárala en una función testeable e inyecta las dependencias externas (regla 6 de `RULES.md`).

## CI

- `.github/workflows/ci.yml` corre en cada push/PR a `main`: typecheck de `services/schwab` y `services/api`,
  tests de `frontend`, y build de producción del `frontend`. Un PR con la CI en rojo no se debe mergear.

## Estado de la BD (Supabase remoto)

- No hay acceso DDL desde el entorno local (solo service_role = DML). Las migraciones nuevas
  van a `supabase/migrations/` y se aplican A MANO en el SQL Editor del Dashboard.
- **Todas aplicadas (001–005)**, vía Supabase CLI (`supabase login --token ... && supabase link --project-ref
  zjnkohzrgrwmezsmihfv && supabase db push`) el 2026-07-09. Si en el futuro se agregan migraciones nuevas,
  repetir `supabase db push` (login/link solo la primera vez); el mecanismo de degradación elegante
  (`skippedMissingTables`, avisos de setup en las páginas) sigue ahí por si alguna migración nueva
  queda pendiente.
- Usuarios en Auth: `sergioferrufino@gmail.com` (real, token ACTIVE) y `admin@tradingjournal.local`
  (artefacto de pruebas, NEEDS_REAUTH; sus transacciones son visibles para el usuario real por account-hash).

## Datos del usuario

- 5 cuentas Schwab (nombres sembrados en `FilterContext`): SMINESS ···3203, Growth_26 ···3062 (margin),
  Trending_26 ···4886, Swing_26 ···5350, Spy_26 ···8936.
- Los alias/filtros/método de lotes del frontend persisten en `localStorage` (claves `tradelink-*`).

## Trampa conocida: artefactos .js junto a los .ts

NUNCA debe haber archivos `.js` compilados dentro de `services/schwab/src/` (ni `services/api/src/`).
Los imports usan especificadores `.js` (estilo ESM de TS); si existe un `.js` real en disco, tsx lo
prefiere sobre el `.ts` y el servidor ejecuta CÓDIGO VIEJO silenciosamente (pasó el 2026-07-08: el
endpoint /schwab/sync corría un ETL obsoleto). El build correcto emite a `dist/` (ver tsconfig).
Si el comportamiento del API no coincide con el código, revisa esto primero:
```bash
Get-ChildItem -Recurse services\schwab\src -Filter *.js   # PowerShell
```

## Motor de analítica (breakdowns / insights)

`frontend/src/lib/analytics.ts` es el módulo CANÓNICO para desgloses por dimensión (símbolo, día,
hora, duración, tipo de instrumento) y hallazgos automáticos — usado por `Breakdowns.tsx`, `Insights.tsx`
y `WinRateCharts.tsx`. Provee `breakdownBy`, `underlyingOf`/`instrumentKind` (parsing de símbolos OCC),
`weekdayOf`/`hourBucketOf` (NY timezone-aware), `durationBucketOf`/`DURATION_ORDER`, `WEEKDAY_ORDER`,
`advancedStats` (expectancy, streaks, fee drag) y `generateInsights` (revenge trading, sobreoperación,
peor subyacente/día). **No crear un segundo módulo de analítica** — si necesitas un nuevo breakdown,
agrega una función aquí reutilizando `breakdownBy`. `calculateStats` en `tradeEngine.ts` es deliberadamente
más liviano (KPIs básicos colocados con el motor de matching); su solape parcial con `advancedStats` es
intencional, no un bug a corregir.

## Convenciones

- Estilo UI: dark glassmorphism con clases `glass-card`, `btn`, `input-glass` (ver `frontend/src/index.css`).
- Páginas de datos consumen los hooks `usePortfolioData` / `useFilteredPositions` / `useLiveBalances`
  (`frontend/src/hooks/usePortfolioData.ts`) — no fetchees a mano en las páginas.
- Los filtros globales (cuenta, fechas) viven en `FilterContext`; toda página analítica debe respetarlos.
- Campos de fecha usan `frontend/src/components/DateInput.tsx` (abre el calendario nativo al hacer click en cualquier parte del campo, no solo en el ícono).
- Logs del backend: JSON estructurado vía `logger` — nunca `console.log` en `services/schwab`.
- Commits semánticos (`feat:`, `fix:`, `docs:`...). No commitear `.env`, dumps ni `Ejemplos/`.
