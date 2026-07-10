# 🗺️ REBUILD_ROADMAP.md — Hoja de ruta para reconstruir Tradelink desde cero

> Si en el futuro se decide rehacer esta aplicación (con un agente de IA o un equipo humano),
> esta es la hoja de ruta recomendada según estándares de la industria en 2026 — **no** una copia
> de la arquitectura actual. El activo más valioso a trasladar no es el código: es el conocimiento
> de dominio acumulado (ver §7).

## 1. Principios de diseño (lo que la versión actual no tuvo desde el día 1)

1. **Type-safety de extremo a extremo**: un solo grafo de tipos desde la fila de Postgres hasta el
   componente React. Los bugs de "el API cambió y el frontend no se enteró" dejan de existir en compilación.
2. **Multi-tenant desde el primer commit**: aislamiento por usuario diseñado y **testeado en CI**
   antes de la primera feature, no auditado a posteriori.
3. **Jobs de fondo como ciudadanos de primera clase**: la ingestión de datos de brokers es el corazón
   del producto; merece colas, reintentos, rate-limiting por usuario y observabilidad — no un cron plano.
4. **El motor de trades es un paquete puro** sin I/O, con property-based testing. Es la lógica más
   crítica y la más fácil de romper en silencio (lección aprendida: bug de fees dobles, multiplicador ×100).
5. **Migraciones de BD por CI**, nunca a mano en un SQL Editor.

## 2. Stack recomendado

| Capa | Elección | Por qué (vs. lo actual) |
|---|---|---|
| Monorepo | pnpm workspaces + Turborepo | Reemplaza los 3 `package.json` desconectados con `file:../` (fuente del bug de deps en Vercel) |
| Framework | **Next.js (App Router) full-stack** | Colapsa frontend+API en un solo deploy; elimina CORS, el doble proyecto en Vercel y el drift entre ambos |
| Lenguaje | TypeScript estricto en todo | Igual que ahora, pero con un solo tsconfig base compartido |
| BD | Postgres (Supabase o Neon) + **Drizzle ORM** | Esquema como código TypeScript; migraciones generadas, versionadas y aplicadas por CI |
| Auth | Supabase Auth o Clerk | OAuth (Google/Apple) + magic links + password reset **desde el día 1** |
| Validación | **Zod en cada boundary** | Inputs de API, respuestas de Schwab, variables de entorno — todo parseado, nada asumido |
| Capa API | tRPC (o route handlers + Zod) | Type-safety cliente↔servidor sin escribir clientes a mano (`api.ts` actual es manual y frágil) |
| Jobs | **Inngest o Trigger.dev** | Sync por usuario como job individual: reintentos automáticos, fan-out, rate-limit por usuario, dashboard de ejecuciones. Un usuario con backfill de 2 años no bloquea el cron de los demás ni choca con `maxDuration` |
| Data fetching | TanStack Query | Reemplaza los hooks manuales + caché casero + `dataVersion` con invalidación estándar |
| Charts | Recharts (mantener) o ECharts | Lo actual funciona bien |
| Testing | Vitest + **Playwright E2E** + fast-check (property-based) en el motor + **test de aislamiento multi-tenant en CI** | Hoy el E2E y el test de aislamiento son manuales |
| Mocks | MSW con fixtures reales de Schwab | Desarrollar y testear el ETL sin quemar rate-limits del broker |
| Observabilidad | Sentry + pino (logs estructurados) + alertas | Hoy producción está ciega: si el sync falla 8 días seguidos, nadie se entera hasta que Schwab exige re-auth |
| CI/CD | GitHub Actions: typecheck+tests+E2E, preview deploy por PR, migraciones gated | Hoy hay CI básico sin deploy ni migraciones |
| Secrets | Vercel env + rotación documentada; `.env.example` sin valores reales | Lección aprendida: credenciales expuestas en un prompt inicial |

## 3. Modelo de datos (correcciones sobre el actual)

- **`user_id` en todos los UNIQUE** de datos por-cuenta (`(user_id, account_hash, activity_id)`), eliminando
  el modelo "account-centric" actual — que funciona, pero es una rareza que cada auditoría debe re-entender.
  Si dos usuarios comparten una cuenta Schwab real, cada uno tiene SU copia de las filas (el almacenamiento
  es barato; la claridad de ownership no).
- Tabla `broker_connections` genérica (no `schwab_tokens`): `provider`, `credentials` cifradas
  (pgsodium/Vault), `status`, `cursor_state` (JSON con el cursor incremental por stream) — preparada para
  múltiples brokers desde el esquema.
- `sync_runs`: registro de cada ejecución (usuario, duración, filas, error) — auditoría y debugging que hoy
  no existe (los resultados del cron se pierden al responder).
- Todo con RLS **y además** tests de CI que crean dos usuarios y verifican cero filas cruzadas (automatizar
  el `test_isolation.mjs` que hoy se corre a mano).

## 4. Arquitectura de ingestión (la parte que más mejora)

```
Cron (1/día) ──> Job "sync-all" ──fan-out──> Job "sync-user" × N   (Inngest/Trigger.dev)
                                              │  retries: 3, backoff exponencial
                                              │  rate-limit: X req/min por conexión de broker
                                              ├─> BrokerAdapter (interfaz común)
                                              │     ├─ SchwabAdapter    (transactions + orders)
                                              │     ├─ IBKRAdapter      (futuro)
                                              │     └─ TastytradeAdapter(futuro)
                                              └─> cursor incremental por stream (persistido en BD)
```

- **Patrón adaptador de brokers**: `fetchAccounts() / fetchTransactions(cursor) / fetchOrders(cursor)`
  normalizando a un modelo canónico de ejecución. Agregar un broker = un archivo nuevo + fixtures.
- Botón "Sync now" en la UI = disparar el mismo job on-demand (no un endpoint aparte con otra lógica).
- Token refresh como job programado independiente del sync (hoy, si el sync falla 7 días, el refresh
  token de Schwab muere con él).

## 5. Fases de construcción (orden recomendado)

| Fase | Contenido | Criterio de salida |
|---|---|---|
| **0. Fundaciones** (1ª semana) | Monorepo, CI completo, auth con OAuth, esquema Drizzle inicial, RLS + test de aislamiento en CI, Sentry, deploy preview por PR | Dos usuarios de prueba no pueden verse datos, verificado en cada PR |
| **1. Dominio** | Paquete `@tradelink/engine` puro (lotes FIFO/LIFO/HIGH_COST/LOW_COST, ×100 opciones, expiraciones, fees prorrateados, reversiones) portando los 22 tests actuales + property-based; paquete `@tradelink/brokers` con SchwabAdapter + MSW fixtures | El motor reproduce exactamente los números validados contra thinkorswim |
| **2. Ingestión** | Jobs con Inngest: sync incremental por cursor, backfill inicial troceado, `sync_runs`, alertas si un usuario falla N días seguidos | Sync diario automático con reintentos y visibilidad de fallos |
| **3. Analítica + UI** | Dashboard, trades, reports, breakdowns, insights, journal — portando la lógica de `analytics.ts` (ya probada) con TanStack Query | Paridad funcional con la app actual |
| **4. Producto multi-usuario** | Onboarding guiado (conectar broker paso a paso), invitaciones/signup restringido, emails transaccionales (re-auth requerida, resumen semanal), billing con Stripe si se monetiza | Un desconocido puede registrarse y llegar a su primer dashboard sin ayuda |
| **5. Operación** | Dominio propio, backups verificados de Postgres, runbook de incidentes, dashboards de salud del sync | Puedes irte de vacaciones dos semanas |

## 6. Qué NO cambiar (aciertos del diseño actual)

- Motor de lotes configurable por cuenta con **HIGH_COST como default** (la configuración real de Schwab del usuario).
- Trade engine alimentado por **transactions, no orders** (orders no reporta precios de expiración ITM).
- Sync **incremental por cursor** con ventana de solape (3d transacciones / 7d órdenes).
- Posiciones con **semántica de snapshot** (borrar obsoletas en cada sync).
- Refresh **proactivo** de tokens antes de cada llamada al broker.
- Filtros globales (cuenta + fechas) como contexto transversal a todas las vistas analíticas.

## 7. El activo real a trasladar: conocimiento de dominio

Antes de reescribir una sola línea, leer `AGENTS.md` (tabla de invariantes) y los tests de
`tradeEngine.test.ts`. Cada entrada ahí es un bug real que costó encontrar:

- Opciones multiplican ×100; las expiraciones llegan como `RECEIVE_AND_DELIVER` a precio 0.
- Los fees de un lote se consumen proporcionalmente a través de cierres parciales múltiples.
- Schwab rota el refresh token en cada uso y lo mata a los 7 días de inactividad.
- Un `.js` compilado junto a un `.ts` hace que tsx ejecute código viejo en silencio.
- `helmet@8` + NodeNext compila con `--noEmit` pero falla en build completo.
- El API de Schwab limita rangos por llamada → trocear backfills largos.

Estos no se redescubren gratis: son semanas de depuración condensadas.
