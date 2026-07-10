# Tradelink — Trading Journal para Charles Schwab

Journal de trading tipo TradesViz conectado a una cuenta real de Charles Schwab vía OAuth 2.0: sincroniza cuentas, posiciones, transacciones y órdenes a Supabase, y muestra dashboards analíticos (PnL, win-rate, equity curve, calendario, crecimiento de cuenta).

**En producción**: https://tradelink-frontend.vercel.app (API en https://tradelink-api.vercel.app) — ver [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Arranque rápido (local)

```
start.bat          ← doble clic: arranca API (3001) + frontend (5173) y abre el navegador
```

o manualmente:

```bash
cd services/api && npm run dev      # API gateway en :3001
cd frontend && npm run dev          # SPA en :5173
```

Credenciales: copia `.env.example` → `.env` (raíz) y crea `frontend/.env.local` (ver `docs/DEPLOYMENT.md`). En una máquina nueva: `npm install` en `frontend/`, `services/api/` y `services/schwab/`.

## Estructura

| Ruta | Qué es |
|---|---|
| `services/schwab/` | Librería core: OAuth + rotación de tokens, ETL (extract → transform → load), CLI (`--sync`, `--cron`, `--authorize`) |
| `services/api/` | API gateway Express: valida JWT de Supabase, expone `/api/v1/portfolio/*` y `/api/v1/schwab/*` |
| `frontend/` | React SPA (Vite + Recharts): dashboard, trades, reports, journal, filtros globales |
| `supabase/migrations/` | Esquema de BD (aplicar en orden en el SQL Editor de Supabase) |
| `docs/` | **Fuente de verdad** del proyecto — leer antes de tocar código (empezar por `RULES.md`) |

## Documentación (leer antes de modificar)

1. [docs/RULES.md](docs/RULES.md) — reglas de desarrollo (la "ley" del proyecto)
2. [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — arquitectura, fases y filtros globales del frontend
3. [docs/SCHEMA.md](docs/SCHEMA.md) — esquema de BD y modelo de propiedad de datos
4. [docs/API_SPEC.md](docs/API_SPEC.md) — endpoints del API gateway
5. [docs/SCHWAB_ETL.md](docs/SCHWAB_ETL.md) — OAuth, rotación de tokens y pipeline ETL
6. [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — despliegue a Vercel + Supabase
7. [AGENTS.md](AGENTS.md) — guía para desarrollo asistido por IA sin romper invariantes (funciona con cualquier asistente; `CLAUDE.md` apunta aquí)

## Invariantes críticos (no romper)

- **Motor de trades** (`frontend/src/lib/tradeEngine.ts`): opciones ×100, expiraciones `RECEIVE_AND_DELIVER` como cierres a precio 0, lotes por `cuenta|símbolo`, método de lotes configurable (**High Cost** por defecto — es la configuración real de las cuentas en Schwab).
- **Visibilidad account-centric** (`services/api`): los datos se consultan por los `account_hash` vinculados al usuario, NO por `user_id` de las filas (los UNIQUE de la BD no incluyen `user_id`).
- **Posiciones = snapshot**: cada sync borra posiciones obsoletas.
- **Tokens Schwab**: refresh proactivo antes de cada llamada; el refresh token rota en cada uso (nunca guardar/restaurar tokens viejos).
- El trade engine usa **transactions** (no orders): orders no reporta precios de expiración ITM.

## Testing y CI

```bash
cd frontend && npm test              # vitest --watch
cd frontend && npm test -- --run     # una sola pasada (lo que corre CI)
```

`.github/workflows/ci.yml` corre typecheck + tests + build en cada push/PR a `main`.

## Git

```bash
git remote add origin https://github.com/minesssergio/tradelink.git
git push -u origin main
```

`.env`, dumps de cuentas, capturas personales (`Ejemplos/`) y scratch files están excluidos por `.gitignore` — nunca los fuerces al repo.

## Mantener la app siempre activa (local)

`scripts/install-autostart.ps1` registra una tarea de Windows que arranca API + frontend al iniciar sesión
y los reinicia automáticamente si se caen. Ver [docs/ALWAYS_ON.md](docs/ALWAYS_ON.md).
