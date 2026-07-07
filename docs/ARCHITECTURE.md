# 🏗️ ARCHITECTURE.md — Arquitectura del Trading Journal

> Visión de alto nivel del sistema. Documento vivo que evoluciona con el proyecto.

## 1. Visión General

Trading Journal Web es una aplicación multi-tenant para traders que operan en Charles Schwab. Permite importar trades automáticamente, analizar rendimiento, y llevar un diario de operaciones.

## 2. Principios Arquitectónicos

1. **Docs-First (Harness Engineering)**: La carpeta `/docs` gobierna toda decisión técnica.
2. **Desacoplamiento Total**: Lógica de negocio independiente de la plataforma de hosting.
3. **Multi-Tenant Seguro**: Row Level Security en PostgreSQL garantiza aislamiento de datos.
4. **Modularidad**: Cada servicio es un módulo independiente con interfaz clara.
5. **Portabilidad**: De Vercel a Docker/VPS sin reescribir lógica core.

## 3. Diagrama de Componentes

```
┌─────────────────────────────────────────────────────────┐
│                      FRONTEND                           │
│              (Vercel / Lovable - React)                  │
└─────────────┬───────────────────────────┬───────────────┘
              │ API Calls                 │ Auth
              ▼                           ▼
┌─────────────────────────┐   ┌──────────────────────────┐
│   API Layer             │   │   Supabase Auth          │
│   (Platform Adapter)    │   │   (JWT + RLS)            │
└─────────────┬───────────┘   └──────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────┐
│                   SERVICES LAYER                        │
│  ┌─────────────────┐  ┌──────────────────┐              │
│  │ schwab/          │  │ analytics/       │  (Fase 2)   │
│  │  - authService   │  │  - tradeParser   │              │
│  │  - tokenRotation │  │  - performance   │              │
│  │  - dataSync      │  │  - reports       │              │
│  └────────┬─────────┘  └──────────────────┘              │
│           │                                              │
│           ▼                                              │
│  ┌─────────────────┐                                     │
│  │ Schwab API      │                                     │
│  │ (External)      │                                     │
│  └─────────────────┘                                     │
└─────────────────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────┐
│              SUPABASE (PostgreSQL)                       │
│  ┌──────────────┐  ┌───────────────┐  ┌──────────────┐  │
│  │schwab_tokens │  │ trades        │  │ journal      │  │
│  │(RLS)         │  │ (RLS)(Fase 2) │  │ (RLS)(Fase 2)│  │
│  └──────────────┘  └───────────────┘  └──────────────┘  │
└─────────────────────────────────────────────────────────┘
```

## 4. Stack Tecnológico

| Capa | Tecnología | Justificación |
|:-----|:-----------|:--------------|
| Frontend | React (Vercel/Lovable) | Ecosistema TypeScript, rápido prototipado |
| Backend/Services | TypeScript/Node.js | Tipado estricto, portable |
| Base de Datos | Supabase (PostgreSQL) | RLS nativo, Auth integrado, Edge Functions |
| Broker API | Charles Schwab API | Acciones y Opciones |
| Hosting Inicial | Vercel | Deploy inmediato, cron jobs |
| Hosting Final | Oracle Cloud VPS + Docker | Control total, costo fijo |

## 5. Fases del Proyecto

| Fase | Descripción | Estado |
|:-----|:------------|:-------|
| **Fase 1** | Motor OAuth 2.0 + Rotación de Tokens | ✅ Terminado |
| **Fase 2** | ETL: Sync de trades y posiciones | ✅ Terminado |
| **Fase 3** | Dashboard + Analytics (Backend API) | ✅ Terminado |
| **Fase 4** | Journal + Notas + Screenshots | 🔨 Notas CRUD listo (migración 003 pendiente de aplicar) |
| **Fase 5** | Reports + Métricas avanzadas | ✅ Reports + filtros globales + equity/drawdown + Account Growth |
| **Fase 5b** | Orders stream + snapshots de balance | ✅ Código listo (migraciones 004/005 pendientes de aplicar) |
| **Fase 6** | Despliegue web (Vercel + Supabase) | 🔨 Preparado (ver `DEPLOYMENT.md`) |

## 5.1 Filtros Globales del Frontend (cuenta + fechas)

El frontend tiene un `FilterContext` (`frontend/src/context/FilterContext.tsx`) que gobierna **todas** las páginas de análisis (Dashboard, Trades, Positions, Transactions, Calendar y Reports):

- **Selector de cuentas** multi-selección con alias editables ("Swing", "Growth"…). Los alias y la selección persisten en `localStorage` — no requieren columnas nuevas en la BD.
- **Rango de fechas** con presets (7D/30D/90D/YTD). Semántica: las transacciones se filtran por `time`; los trades cerrados se construyen con el motor FIFO a partir de transacciones filtradas **solo por cuenta** y luego se filtran por `closeDate` — así una posición abierta antes del rango cierra correctamente dentro de él.
- **Lotes por cuenta**: el motor (`frontend/src/lib/tradeEngine.ts`) agrupa lotes por `account_hash|symbol`; el mismo símbolo en dos cuentas jamás se cruza.
- **Método de selección de lotes configurable** (FIFO / LIFO / High Cost / Low Cost): debe reflejar el "Default Lot Selection Method" de cada cuenta en Schwab. Default global **High Cost** (la configuración real del usuario), con override por cuenta en Settings; persiste en `localStorage` (`tradelink-lot-methods`). Tax Lot Optimizer no es reproducible client-side (usa High Cost como proxy). El PnL total realizado es invariante al método cuando las posiciones cierran completas; lo que cambia es la asignación por trade (win rate, avg win/loss, duraciones).
- La barra (`FilterBar`) vive en `DashboardLayout` y se oculta en Settings/Journal/AI.
- Hooks de datos: `frontend/src/hooks/usePortfolioData.ts` (`usePortfolioData`, `useFilteredPositions`).

## 6. Seguridad

- **Autenticación**: Supabase Auth (JWT)
- **Autorización**: Row Level Security (PostgreSQL)
- **Tokens de Schwab**: Almacenados server-side, accesibles solo por el usuario dueño
- **Secrets**: Variables de entorno (nunca en código fuente)
- **HTTPS**: Obligatorio en todos los endpoints
