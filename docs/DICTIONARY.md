# 📖 DICTIONARY.md — Glosario del Dominio

> Definiciones unificadas de términos usados en el proyecto. Toda la documentación y el código deben usar estos términos de forma consistente.

## Autenticación & Seguridad

| Término | Definición |
|:--------|:-----------|
| **OAuth 2.0** | Protocolo de autorización estándar usado por Schwab para dar acceso a datos de trading sin compartir contraseñas. |
| **Authorization Code** | Código temporal (de un solo uso) que Schwab envía al callback URL después de que el usuario autoriza la app. Se intercambia por tokens. |
| **Access Token** | Token de corta duración (30 min) que autoriza llamadas a la API de Schwab. Se incluye como `Bearer` en el header `Authorization`. |
| **Refresh Token** | Token de larga duración (7 días) que permite obtener un nuevo Access Token sin re-autenticación del usuario. Schwab emite uno NUEVO con cada refresh. |
| **Token Rotation** | Proceso de usar un Refresh Token para obtener nuevos tokens antes de que expiren, manteniendo una sesión perpetua. |
| **RLS (Row Level Security)** | Mecanismo de PostgreSQL que restringe el acceso a filas de una tabla basándose en la identidad del usuario autenticado. |
| **Service Role Key** | Clave de Supabase que bypasea RLS. Solo se usa en el backend para operaciones administrativas (como cron de rotación de tokens). |
| **Three-Legged OAuth** | Flujo OAuth donde participan tres partes: el usuario, la aplicación, y el proveedor (Schwab). |

## Trading

| Término | Definición |
|:--------|:-----------|
| **Trade** | Una transacción ejecutada: compra o venta de un instrumento financiero. |
| **Position** | Una tenencia actual de un instrumento (acciones/opciones que aún no se han cerrado). |
| **Option** | Contrato derivado que da el derecho (no la obligación) de comprar/vender un activo a un precio determinado. |
| **Account Hash** | Identificador hasheado que Schwab usa para referirse a una cuenta de trading en su API. |
| **Ticker/Symbol** | Código corto que identifica un instrumento financiero (ej. AAPL, SPY). |

## Arquitectura

| Término | Definición |
|:--------|:-----------|
| **ETL** | Extract-Transform-Load. Proceso de extraer datos de Schwab, transformarlos al modelo del journal, y cargarlos en Supabase. |
| **Harness Engineering** | Metodología del proyecto: toda decisión técnica debe estar documentada en `/docs` ANTES de implementarse en código. |
| **Multi-Tenant** | Arquitectura donde múltiples usuarios comparten la misma aplicación pero sus datos están completamente aislados. |
| **Adapter Pattern** | Patrón de diseño que aísla dependencias de plataforma (Vercel, Docker) de la lógica de negocio. |
| **Repository Pattern** | Patrón que encapsula el acceso a datos detrás de una interfaz, separando la lógica de negocio de los detalles de la base de datos. |
| **Cron Job** | Tarea programada que se ejecuta automáticamente a intervalos regulares. |
| **Fail-Fast** | Principio: si una configuración es inválida, la aplicación debe fallar inmediatamente al arrancar, no después. |
