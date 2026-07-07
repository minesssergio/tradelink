# CLAUDE.md — Harness para desarrollo continuo de Tradelink

Guía para agentes de IA (y humanos) que hagan mejoras futuras sin romper lo construido.

## Antes de tocar código

1. Lee `docs/RULES.md` (la ley del proyecto) y `README.md` (invariantes críticos).
2. Cambios de arquitectura o esquema: **primero** actualiza el `.md` correspondiente en `docs/`, después el código.
3. Verifica SIEMPRE antes de dar algo por terminado:
   ```bash
   cd services/schwab && npx tsc --noEmit
   cd services/api    && npx tsc --noEmit
   cd frontend        && npm run build     # tsc -b + vite build
   ```

## Cómo correr y verificar

- `start.bat` arranca API (3001) + frontend (5173). Usuario de la app: `sergioferrufino@gmail.com` (Supabase Auth).
- Sync manual: `cd services/schwab && npx tsx src/index.ts --sync [--user <uuid>] [--start-date <ISO>]`.
- El sync toca la API real de Schwab: úsalo con moderación, y NUNCA guardes/reutilices refresh tokens viejos (Schwab los invalida al rotar).

## Invariantes que NO se pueden regresar

| Invariante | Dónde | Por qué |
|---|---|---|
| Multiplicador ×100 en opciones | `frontend/src/lib/tradeEngine.ts` | Sin él, el PnL de opciones queda 100× subestimado (el usuario opera mayormente opciones de SPY) |
| Expiraciones como cierres | `tradeEngine.ts` (`RECEIVE_AND_DELIVER`, positionEffect CLOSING, precio 0) | Sin ellas, los lotes expirados quedan abiertos para siempre |
| Lotes por `cuenta\|símbolo` | `tradeEngine.ts` | El mismo símbolo en dos cuentas jamás se cruza en el FIFO |
| Método de lotes configurable, default **HIGH_COST** | `tradeEngine.ts` + `FilterContext` + Settings | Las cuentas Schwab del usuario usan High Cost, NO FIFO |
| Visibilidad account-centric | `services/api/src/controllers/portfolio.controller.ts` | Los UNIQUE de positions/transactions no incluyen `user_id`; leer por user_id rompe la visibilidad |
| Posiciones = snapshot (borrar obsoletas) | `services/schwab/src/etl/etlLoader.ts` | Sin `deleteStalePositions`, las posiciones cerradas se acumulan como fantasmas |
| Refresh proactivo de tokens | `services/schwab/src/lib/schwabApi.ts` | Un 401 marca la sesión NEEDS_REAUTH y desconecta a Schwab |
| Trade engine usa transactions, no orders | ETL + frontend | El endpoint de orders no reporta precios de expiración ITM ni movimientos de cash |
| Paginación completa de transacciones | `portfolio.controller.ts` (sin `limit` → todo el historial) | El motor FIFO necesita todas las transacciones para emparejar |

## Estado de la BD (Supabase remoto)

- No hay acceso DDL desde el entorno local (solo service_role = DML). Las migraciones nuevas
  van a `supabase/migrations/` y se aplican A MANO en el SQL Editor del Dashboard.
- Aplicadas: 001, 002. **Pendientes: 003 (journal_notes), 004 (schwab_orders), 005 (balance_snapshots)** —
  la app degrada elegante mientras tanto (avisos de setup en las páginas; el sync salta esos pasos
  y los reporta en `skippedMissingTables`).
- Usuarios en Auth: `sergioferrufino@gmail.com` (real, token ACTIVE) y `admin@tradingjournal.local`
  (artefacto de pruebas, NEEDS_REAUTH; sus 753+ transacciones son visibles para el usuario real por account-hash).

## Datos del usuario

- 5 cuentas Schwab (nombres sembrados en `FilterContext`): SMINESS ···3203, Growth_26 ···3062 (margin),
  Trending_26 ···4886, Swing_26 ···5350, Spy_26 ···8936.
- Los alias/filtros/método de lotes del frontend persisten en `localStorage` (claves `tradelink-*`).

## Convenciones

- Estilo UI: dark glassmorphism con clases `glass-card`, `btn`, `input-glass` (ver `frontend/src/index.css`).
- Páginas de datos consumen los hooks `usePortfolioData` / `useFilteredPositions` / `useLiveBalances`
  (`frontend/src/hooks/usePortfolioData.ts`) — no fetchees a mano en las páginas.
- Los filtros globales (cuenta, fechas) viven en `FilterContext`; toda página analítica debe respetarlos.
- Logs del backend: JSON estructurado vía `logger` — nunca `console.log` en `services/schwab`.
- Commits semánticos (`feat:`, `fix:`, `docs:`...). No commitear `.env`, dumps ni `Ejemplos/`.
