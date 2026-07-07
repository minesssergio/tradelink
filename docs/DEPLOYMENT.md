# 🚀 DEPLOYMENT.md — Despliegue Web (Vercel + Supabase)

> La app está preparada para desplegarse como: frontend estático en Vercel + API Express en Vercel (serverless) + Supabase como BD/Auth (ya en la nube).

## Arquitectura en producción

```
Usuario → Vercel (frontend SPA)  →  Vercel (API serverless)  →  Supabase (Postgres + Auth)
                                                              →  Schwab API (OAuth + datos)
```

## 0. Prerrequisitos

- Cuenta en [vercel.com](https://vercel.com) conectada a tu GitHub.
- El repo subido a GitHub (ver README → sección Git).
- Migraciones de Supabase aplicadas (001–005) en el SQL Editor.

## 1. Desplegar el API (`services/api`)

1. En Vercel: **Add New Project** → importa el repo → **Root Directory: `services/api`**.
2. La entrada serverless ya existe: `services/api/api/index.ts` + `services/api/vercel.json`
   (el `app.listen()` se omite automáticamente cuando `VERCEL=1`).
3. Variables de entorno (Settings → Environment Variables) — las mismas del `.env` local:
   - `SCHWAB_CLIENT_ID`, `SCHWAB_CLIENT_SECRET`, `SCHWAB_CALLBACK_URL`
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
   - `CORS_ORIGIN` = URL del frontend (ej. `https://tradelink.vercel.app`)
4. Deploy → anota la URL (ej. `https://tradelink-api.vercel.app`).
5. Verifica: `https://tradelink-api.vercel.app/health` → `{"status":"OK"}`.

> ⚠️ El paquete `@trading-journal/schwab-service` se referencia con `file:../schwab`. En Vercel
> con Root Directory `services/api` esa carpeta queda fuera del deploy. Opciones:
> (a) en Vercel usa **Root Directory = raíz del repo** con `vercel.json` ajustado, o
> (b) configura "Include files outside of Root Directory" (Settings → General) — Vercel lo soporta para monorepos.
> La opción (b) es la recomendada y no requiere cambios de código.

## 2. Desplegar el Frontend (`frontend`)

1. **Add New Project** → mismo repo → **Root Directory: `frontend`** (framework: Vite).
2. Variables de entorno:
   - `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` (los de `frontend/.env.local`)
   - `VITE_API_BASE_URL` = `https://tradelink-api.vercel.app/api/v1`
3. `frontend/vercel.json` ya incluye el rewrite SPA (todas las rutas → `index.html`).
4. Deploy.

## 3. Supabase (ya en la nube)

- Auth → URL Configuration: añade la URL del frontend de Vercel a **Site URL** y **Redirect URLs**.
- Verifica que las migraciones 001–005 estén aplicadas (`supabase/migrations/`).

## 4. Schwab OAuth en producción

- En el portal de desarrolladores de Schwab, el **Callback URL** registrado debe coincidir con
  `SCHWAB_CALLBACK_URL`. El flujo actual (copiar/pegar la URL con `?code=`) funciona igual en producción.

## 5. Sincronización programada (cron)

El sync corre hoy manualmente (botón en Settings o CLI). En producción:

- **Vercel Cron**: crea `services/api/src/routes/cron.routes.ts` que llame a `runSyncJob` y regístralo
  en `vercel.json` → `"crons": [{ "path": "/api/v1/cron/sync", "schedule": "0 22 * * 1-5" }]`.
  Protégelo comparando `Authorization: Bearer ${CRON_SECRET}`.
- **Alternativa local (hoy)**: Programador de tareas de Windows ejecutando
  `npx tsx src/index.ts --sync` en `services/schwab` (los snapshots de balance se acumulan con cada sync).

## 6. Checklist pre-deploy

- [ ] `npm run build` pasa en `frontend/`
- [ ] `npx tsc --noEmit` pasa en `services/api` y `services/schwab`
- [ ] `.env` NO está commiteado (verifica `git ls-files | findstr .env` → solo `.env.example`)
- [ ] Migraciones 001–005 aplicadas en Supabase
- [ ] `CORS_ORIGIN` apunta al dominio real del frontend
