# 🔌 API_SPEC.md — Especificación de la API Backend

> Este documento define los endpoints REST expuestos por el Backend (`services/api`) para ser consumidos por el Frontend (o cualquier otro cliente).

## Base URL
Local: `http://localhost:3001/api/v1`
Producción: `TBD`

## Autenticación
Todos los endpoints protegidos requieren el token JWT de **Supabase Auth** en los headers:
```http
Authorization: Bearer <SUPABASE_JWT_TOKEN>
```
El backend usa este JWT para extraer el `user_id` de forma segura.

---

## 1. Módulo Schwab (Auth & ETL)

### 1.1 Generar URL de Autorización
- **GET** `/schwab/auth-url`
- **Auth Requerida:** Sí
- **Respuesta (200 OK):**
  ```json
  {
    "url": "https://api.schwabapi.com/v1/oauth/authorize?client_id=..."
  }
  ```

### 1.2 Intercambiar Código OAuth
- **POST** `/schwab/callback`
- **Auth Requerida:** Sí
- **Body (JSON):**
  ```json
  {
    "code": "C0.b2F1dGgy..."
  }
  ```
- **Respuesta (200 OK):**
  ```json
  {
    "success": true,
    "message": "Tokens saved successfully"
  }
  ```

### 1.3 Disparar Sincronización ETL
- **POST** `/schwab/sync`
- **Auth Requerida:** Sí
- **Body (JSON):** *(Opcional)*
  ```json
  {
    "startDate": "2026-04-01T00:00:00.000Z"
  }
  ```
- **Respuesta (200 OK):**
  ```json
  {
    "success": true,
    "accountsProcessed": 5,
    "positionsProcessed": 11,
    "transactionsProcessed": 753
  }
  ```

---

## 2. Módulo Portafolio (Data Layer)

*(Estos endpoints consultan directamente las tablas cacheadas de Supabase para evitar rate limits de Schwab y ser ultrarrápidos).*

**Modelo de visibilidad (account-centric)**: el backend primero resuelve los `account_hash` vinculados al usuario autenticado (filas suyas en `schwab_accounts`) y luego consulta posiciones/transacciones con el cliente `service_role` scoped a esos hashes. Esto es necesario porque los `UNIQUE` de esas tablas no incluyen `user_id` (ver `SCHEMA.md`): la fila física pertenece al usuario que ejecutó el último sync, pero la visibilidad se otorga a todo usuario que haya vinculado la cuenta. Un `accountHash` que no pertenece al usuario responde `403`.

### 2.1 Obtener Cuentas
- **GET** `/portfolio/accounts`
- **Auth Requerida:** Sí
- **Respuesta (200 OK):**
  ```json
  {
    "data": [
      {
        "id": "uuid",
        "account_hash": "...",
        "account_number_masked": "***1234",
        "type": "MARGIN",
        "equity": 6144.61,
        "cash_balance": 1747.37,
        "last_sync_at": "2026-07-06T00:40:00Z"
      }
    ]
  }
  ```

### 2.2 Obtener Posiciones
- **GET** `/portfolio/positions`
- **Auth Requerida:** Sí
- **Respuesta (200 OK):**
  ```json
  {
    "data": [
      {
        "id": "uuid",
        "account_hash": "...",
        "symbol": "IBIT",
        "asset_type": "EQUITY",
        "long_quantity": 42,
        "average_price": 38.11,
        "market_value": 1511.16,
        "current_day_pnl": -0.84,
        "open_pnl": -89.46
      }
    ]
  }
  ```

### 2.3 Obtener Balances en Vivo
- **GET** `/portfolio/balances`
- **Auth Requerida:** Sí
- Consulta la **API de Schwab en tiempo real** (no la caché de Supabase): Net Liq, variación del día, fondos disponibles, cash y valor de posiciones por cuenta. Usar con moderación (rate limits de Schwab).
- `day_change` = `net_liq` actual − `initial_net_liq` (balances de apertura del día que reporta Schwab).
- `available_funds`/`buying_power`: en cuentas MARGIN vienen de `availableFunds`/`buyingPower`; en cuentas CASH, de `cashAvailableForTrading`.
- **Respuesta (200 OK):**
  ```json
  {
    "data": [
      {
        "account_hash": "...",
        "account_number": "77075350",
        "type": "CASH",
        "net_liq": 5828.68,
        "initial_net_liq": 5847.78,
        "day_change": -19.10,
        "cash": 1360.06,
        "available_funds": 1360.06,
        "buying_power": 1360.06,
        "positions_value": 4468.62,
        "position_count": 8
      }
    ]
  }
  ```

### 2.4 Obtener Transacciones
- **GET** `/portfolio/transactions`
- **Auth Requerida:** Sí
- **Query Params:**
  - `accountHash` (opcional): Filtrar por cuenta (debe pertenecer al usuario; si no, `403`).
  - `type` (opcional): Ej. `TRADE`, `DIVIDEND_OR_INTEREST`.
  - `limit` (opcional): Si se omite, devuelve **todo el historial** (paginado internamente en bloques de 1000 — el motor FIFO del frontend necesita todas las transacciones).
  - `offset` (opcional): Default 0.
- **Respuesta (200 OK):**
  ```json
  {
    "data": [
      {
        "id": "uuid",
        "transaction_id": 123456789,
        "type": "TRADE",
        "status": "SETTLED",
        "time": "2026-06-01T15:30:00Z",
        "net_amount": -1500.00,
        "description": "BOUGHT 42 IBIT @ 38.11"
      }
    ]
  }
  ```
