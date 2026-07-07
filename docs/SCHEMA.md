# 🗄️ SCHEMA.md — Esquema de Base de Datos

> Fuente de verdad para el esquema de PostgreSQL (Supabase). Toda migración debe reflejar lo documentado aquí.

## Convenciones

- Todas las tablas usan `UUID` como primary key (`gen_random_uuid()`).
- Toda tabla tiene `created_at` y `updated_at` con tipo `TIMESTAMPTZ`.
- Toda tabla tiene `RLS` habilitado.
- Foreign keys a `auth.users(id)` usan `ON DELETE CASCADE`.
- Nombres de tablas: `snake_case`, plural (ej. `schwab_tokens`, `trades`).
- Nombres de columnas: `snake_case`.

---

## Fase 1: Autenticación Schwab

### Tabla: `schwab_tokens`

Almacena los tokens OAuth 2.0 de cada usuario para acceder a la API de Schwab.

| Columna | Tipo | Nullable | Default | Descripción |
|:--------|:-----|:---------|:--------|:------------|
| `id` | UUID | NO | `gen_random_uuid()` | Primary key |
| `user_id` | UUID | NO | — | FK a `auth.users(id)` |
| `access_token` | TEXT | NO | — | Token de acceso (30 min) |
| `refresh_token` | TEXT | NO | — | Token de refresco (7 días) |
| `token_type` | TEXT | NO | `'Bearer'` | Tipo de token |
| `scope` | TEXT | SÍ | `'api'` | Scope otorgado por Schwab |
| `expires_at` | TIMESTAMPTZ | NO | — | Timestamp de expiración del access_token |
| `refresh_expires_at` | TIMESTAMPTZ | NO | — | Timestamp de expiración del refresh_token |
| `schwab_account_hash` | TEXT | SÍ | — | Hash de la cuenta de Schwab |
| `status` | TEXT | NO | `'ACTIVE'` | Estado: ACTIVE, NEEDS_REAUTH, REVOKED |
| `last_rotation_at` | TIMESTAMPTZ | SÍ | — | Última rotación exitosa |
| `rotation_count` | INTEGER | SÍ | `0` | Contador de rotaciones |
| `created_at` | TIMESTAMPTZ | NO | `now()` | Fecha de creación |
| `updated_at` | TIMESTAMPTZ | NO | `now()` | Última actualización |

**Constraints**:
- `PRIMARY KEY (id)`
- `UNIQUE (user_id)` — Un token set por usuario
- `FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE`
- `CHECK (status IN ('ACTIVE', 'NEEDS_REAUTH', 'REVOKED'))`

**Índices**:
- `idx_schwab_tokens_user_id` en `user_id`
- `idx_schwab_tokens_expires_at` en `expires_at`

**Políticas RLS**:
- `users_own_tokens_select`: `FOR SELECT TO authenticated USING (auth.uid() = user_id)`
- Backend usa `service_role` key para bypass de RLS en operaciones de rotación.

---

## Fase 2: ETL (Extract, Transform, Load)

### Tabla: `schwab_accounts`
Cuentas de brokerage conectadas.
| Columna | Tipo | Nullable | Default | Descripción |
|:--------|:-----|:---------|:--------|:------------|
| `id` | UUID | NO | `gen_random_uuid()` | Primary key |
| `user_id` | UUID | NO | — | FK a `auth.users(id)` |
| `account_hash` | TEXT | NO | — | Hash único provisto por Schwab |
| `account_number` | TEXT | SÍ | — | Últimos 4 dígitos para UI (enmascarado) |
| `is_active` | BOOLEAN | NO | `true` | Estado de la cuenta |
| `created_at` | TIMESTAMPTZ | NO | `now()` | Fecha de creación |
| `updated_at` | TIMESTAMPTZ | NO | `now()` | Última actualización |
**Constraints**: `UNIQUE (user_id, account_hash)`

### Tabla: `schwab_positions`
Snapshot actual de posiciones abiertas en la cuenta. Se actualiza vía Upsert.
| Columna | Tipo | Nullable | Default | Descripción |
|:--------|:-----|:---------|:--------|:------------|
| `id` | UUID | NO | `gen_random_uuid()` | Primary key |
| `user_id` | UUID | NO | — | FK a `auth.users(id)` |
| `account_hash` | TEXT | NO | — | FK lógica a `schwab_accounts(account_hash)` |
| `symbol` | TEXT | NO | — | Ticker (ej. AAPL, SPY) |
| `asset_type` | TEXT | NO | — | EQUITY, OPTION, CASH_EQUIVALENT |
| `quantity` | NUMERIC | NO | — | Cantidad de acciones/contratos |
| `average_price` | NUMERIC | NO | — | Precio promedio de compra |
| `market_value` | NUMERIC | NO | — | Valor actual de mercado |
| `maintenance_requirement` | NUMERIC | SÍ | — | Requerimiento de margen |
| `created_at` | TIMESTAMPTZ | NO | `now()` | Fecha de creación |
| `updated_at` | TIMESTAMPTZ | NO | `now()` | Última actualización |
**Constraints**: `UNIQUE (account_hash, symbol, asset_type)`

### Tabla: `schwab_transactions`
Historial inmutable de operaciones (trades).
| Columna | Tipo | Nullable | Default | Descripción |
|:--------|:-----|:---------|:--------|:------------|
| `id` | UUID | NO | `gen_random_uuid()` | Primary key |
| `user_id` | UUID | NO | — | FK a `auth.users(id)` |
| `account_hash` | TEXT | NO | — | FK lógica a `schwab_accounts(account_hash)` |
| `activity_id` | TEXT | NO | — | ID único de transacción de Schwab |
| `time` | TIMESTAMPTZ | NO | — | Timestamp exacto de la ejecución |
| `type` | TEXT | NO | — | TRADE, DIVIDEND, WIRE, etc. |
| `status` | TEXT | NO | — | Estado de la orden |
| `symbol` | TEXT | SÍ | — | Ticker asociado al trade |
| `instruction` | TEXT | SÍ | — | BUY, SELL, BUY_TO_COVER, etc. |
| `quantity` | NUMERIC | SÍ | — | Cantidad ejecutada |
| `price` | NUMERIC | SÍ | — | Precio de ejecución |
| `amount` | NUMERIC | NO | — | Monto total (Net Amount) |
| `fees` | NUMERIC | SÍ | `0` | Comisiones e impuestos |
| `raw_data` | JSONB | SÍ | — | Payload original crudo (para debug) |
| `created_at` | TIMESTAMPTZ | NO | `now()` | Fecha de importación |
**Constraints**: `UNIQUE (account_hash, activity_id)`

> ⚠️ **Modelo de propiedad**: los `UNIQUE` de `schwab_positions` y `schwab_transactions` NO incluyen `user_id` — una cuenta de Schwab (identificada por `account_hash`) pertenece a un solo registro por posición/transacción, aunque más de un usuario de la app haya vinculado esa cuenta. Por eso el API Gateway resuelve la visibilidad por **cuentas vinculadas**: un usuario ve las posiciones/transacciones de todo `account_hash` que tenga en `schwab_accounts`. Ver `API_SPEC.md`.

---

## Fase 3: Journal

### Tabla: `journal_notes`

Notas diarias del trader (CRUD desde el frontend con RLS completo). Migración: `003_create_journal_notes.sql`.

| Columna | Tipo | Nullable | Default | Descripción |
|:--------|:-----|:---------|:--------|:------------|
| `id` | UUID | NO | `gen_random_uuid()` | Primary key |
| `user_id` | UUID | NO | — | FK a `auth.users(id)` |
| `note_date` | DATE | NO | `CURRENT_DATE` | Día al que pertenece la nota |
| `title` | TEXT | NO | `''` | Título de la nota |
| `content` | TEXT | NO | `''` | Cuerpo de la nota |
| `mood` | TEXT | SÍ | — | confident, neutral, anxious, frustrated, disciplined |
| `tags` | TEXT[] | NO | `'{}'` | Etiquetas libres |
| `created_at` | TIMESTAMPTZ | NO | `now()` | Fecha de creación |
| `updated_at` | TIMESTAMPTZ | NO | `now()` | Última actualización |

**Políticas RLS**: SELECT / INSERT / UPDATE / DELETE, todas scoped a `auth.uid() = user_id`.
**Índices**: `idx_journal_notes_user_date` en `(user_id, note_date DESC)`.

> 🔧 **Pendiente de aplicar**: esta migración aún no se ha ejecutado en el proyecto remoto de Supabase (no hay CLI ni contraseña de BD en el entorno). Ejecutar el SQL de `supabase/migrations/003_create_journal_notes.sql` en el SQL Editor del Dashboard. La página Journal muestra un aviso de setup mientras tanto.
