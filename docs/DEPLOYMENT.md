# 🚀 DEPLOYMENT.md — Despliegue Web (Vercel + Supabase)

> **✅ Ya desplegado y verificado (2026-07-09):**
> Frontend: https://tradelink-frontend.vercel.app
> API: https://tradelink-api.vercel.app
> Proyectos Vercel: `minedus/tradelink-frontend`, `minedus/tradelink-api`.
> Verificación end-to-end pasó: login real → API prod → Supabase (cuentas) → Schwab en vivo (balances) → CORS correcto.

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

1. Vercel CLI: `vercel login` (o dashboard → **Add New Project** → importa el repo) → **Root Directory: `services/api`**.
2. La entrada serverless ya existe: `services/api/api/index.ts` + `services/api/vercel.json`
   (el `app.listen()` se omite automáticamente cuando `VERCEL=1`).
3. **Root Directory settings (imprescindible, no opcional)**: en Project Settings → Root Directory,
   escribe `services/api` Y activa **"Include files outside of the Root Directory in the Build Step"**.
   Sin esto, `npm run build` falla con `Cannot find module '@trading-journal/schwab-service/...'`
   porque `services/schwab` (referenciada vía `file:../schwab`) nunca se sube.
4. **`installCommand` personalizado** (ya en `services/api/vercel.json`): el install por defecto de
   Vercel solo corre `npm install` en Root Directory — `services/schwab` nunca instalaba sus PROPIAS
   dependencias (`@supabase/supabase-js`, `dotenv`), fallando con `Cannot find module '@supabase/supabase-js'`
   aunque el paquete en sí ya se resolviera. El `installCommand` instala ambos:
   `cd ../schwab && npm install && cd ../api && npm install`.
5. Variables de entorno (Settings → Environment Variables, target Production) — las mismas del `.env` local:
   - `SCHWAB_CLIENT_ID`, `SCHWAB_CLIENT_SECRET` — usa credenciales **rotadas**, nunca las que hayan
     quedado expuestas en texto plano en algún momento.
   - `SCHWAB_CALLBACK_URL` (mismo valor que local, típicamente `https://127.0.0.1`)
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
   - `CORS_ORIGIN` = URL del frontend (`https://tradelink-frontend.vercel.app`)
6. Deploy: `vercel deploy --prod` (o vía dashboard). Verifica: `/health` → `{"status":"OK"}`.

> ⚠️ **Bug real encontrado en el primer deploy**: `helmet@8`'s `.d.cts` declara su export con
> `export {helmet as default}` en vez de `export =`. Bajo `moduleResolution: NodeNext`, esto compila
> bien con `tsc --noEmit` pero falla con `tsc` (build completo — lo que corre `npm run build`) con
> `error TS2349: This expression is not callable`. Fix ya aplicado en `server.ts`: cast explícito
> documentado en el import de helmet. Si actualizas la versión de `helmet`, revisa si el paquete
> corrigió su declaración de tipos antes de quitar el workaround.

## 2. Desplegar el Frontend (`frontend`)

1. `vercel deploy` desde `frontend/` (o dashboard → **Add New Project** → Root Directory: `frontend`, framework: Vite).
2. Variables de entorno (target Production):
   - `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` (los de `frontend/.env.local` — el anon key es
     público por diseño de Supabase, protegido por RLS, no requiere el mismo cuidado que el service role key)
   - `VITE_API_BASE_URL` = `https://tradelink-api.vercel.app/api/v1`
3. `frontend/vercel.json` ya incluye el rewrite SPA (todas las rutas → `index.html`).
4. Deploy: `vercel deploy --prod`.

## 3. Supabase (ya en la nube)

- Auth → URL Configuration: añade la URL del frontend de Vercel a **Site URL** y **Redirect URLs**.
- Verifica que las migraciones 001–005 estén aplicadas (`supabase/migrations/`) — se pueden aplicar
  con `supabase login --token <PAT> && supabase link --project-ref <ref> && supabase db push`.

## 4. Schwab OAuth en producción

- En el portal de desarrolladores de Schwab, el **Callback URL** registrado debe coincidir con
  `SCHWAB_CALLBACK_URL`. El flujo actual (copiar/pegar la URL con `?code=`) funciona igual en producción.

## 5. Sincronización programada (cron) — ✅ implementado

`POST /api/v1/cron/sync` (`services/api/src/controllers/cron.controller.ts`) sincroniza a **todos**
los usuarios con token Schwab `ACTIVE` — cada uno en su propio try/catch, así que uno fallando nunca
bloquea a los demás. Registrado en `services/api/vercel.json`:
```json
"crons": [{ "path": "/api/v1/cron/sync", "schedule": "0 22 * * 1-5" }]
```
Lunes a viernes 22:00 UTC (~después del cierre de mercado). Para cambiar el horario, edita el
`schedule` y redeploy — el plan Hobby de Vercel permite como máximo 1 invocación diaria por cron job.

**Protección**: `CRON_SECRET` (env var) — Vercel manda automáticamente
`Authorization: Bearer ${CRON_SECRET}` al invocar el cron, y el middleware en `server.ts` lo valida.
Sin el header correcto → 401. Sin la variable configurada → 500 (fail-safe, nunca corre sin secreto).

**El botón manual sigue intacto**: "Sync" en la FilterBar y "Force Sync" en Settings llaman a
`POST /api/v1/schwab/sync` (autenticado por JWT de usuario, no por CRON_SECRET) — sin cambios.

Ver logs de ejecuciones: dashboard de Vercel → proyecto `tradelink-api` → pestaña **Cron Jobs**.

## 6. Checklist pre-deploy

- [x] `npm run build` pasa en `frontend/`
- [x] `npx tsc --noEmit` pasa en `services/api` y `services/schwab`
- [x] `.env` NO está commiteado (verifica `git ls-files | findstr .env` → solo `.env.example`)
- [x] Migraciones 001–005 aplicadas en Supabase
- [x] `CORS_ORIGIN` apunta al dominio real del frontend
- [x] Credenciales de Schwab rotadas antes de configurarlas en Vercel

## 7. Redeploy tras cambios de código o variables de entorno

```bash
# API (desde la raíz del repo, para que suba el monorepo completo):
vercel deploy --prod --yes

# Frontend:
cd frontend && vercel deploy --prod --yes
```

Cambiar una variable de entorno en el dashboard **no** redeploya automáticamente — hay que correr
el comando de arriba (o usar el botón "Redeploy" en el dashboard) para que tome efecto.
