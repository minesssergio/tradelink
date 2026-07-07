# 📐 RULES.md — Reglas de Desarrollo del Trading Journal

> Este archivo es la **ley del proyecto**. Ningún código debe escribirse, refactorizarse o eliminarse sin que estas reglas se cumplan.

## 1. Principio Harness Engineering

- La carpeta `/docs` es la **fuente de verdad** del proyecto.
- **REGLA DE ORO**: No se puede sugerir refactorizaciones masivas ni escribir código que altere la arquitectura sin **antes** proponer la actualización de los archivos `.md` correspondientes en `/docs`.
- Todo cambio arquitectónico requiere:
  1. Actualización del documento `.md` relevante.
  2. Revisión y aprobación del cambio documental.
  3. Implementación del código.

## 2. Seguridad

- **NUNCA** hardcodear secrets, API keys, tokens o credenciales en el código fuente.
- Todas las credenciales van en `.env` (local) o en variables de entorno del hosting.
- `.env` **SIEMPRE** debe estar en `.gitignore`.
- Los tokens de Schwab se almacenan en Supabase con Row Level Security (RLS) activado.
- Las operaciones de tokens se realizan exclusivamente desde el backend (server-side) usando `SUPABASE_SERVICE_ROLE_KEY`.

## 3. Desacoplamiento

- La lógica de negocio **NO** debe depender de APIs específicas de Vercel, AWS, o cualquier plataforma.
- Toda la lógica debe ser portable: un módulo TypeScript/Node.js estándar que pueda ejecutarse en:
  - Vercel Functions
  - Un VPS genérico de Linux (Oracle Cloud)
  - Un contenedor Docker
  - Un Cron Job del sistema
- Las dependencias de plataforma se aíslan en adaptadores (adapter pattern).

## 4. Convenciones de Código

### Naming
- Archivos: `camelCase.ts` (ej. `schwabAuth.ts`)
- Tipos/Interfaces: `PascalCase` con sufijo descriptivo (ej. `SchwabTokenResponse`)
- Constantes: `UPPER_SNAKE_CASE` (ej. `SCHWAB_TOKEN_URL`)
- Funciones: `camelCase` verbales (ej. `exchangeCodeForTokens`)

### Error Handling
- Toda función que haga I/O debe manejar errores explícitamente.
- Los errores se tipan con un `SchwabErrorCode` enum.
- Se usa un logger estructurado (JSON) para toda salida — nunca `console.log` directo.

### Logging
- Formato: JSON estructurado a stdout.
- Campos obligatorios: `timestamp`, `level`, `service`, `message`, `context`.
- Niveles: `info`, `warn`, `error`.
- En producción: nunca loggear tokens completos, solo los últimos 4 caracteres.

## 5. Base de Datos (Supabase)

- Toda tabla debe tener `Row Level Security (RLS)` habilitado.
- Las políticas RLS deben scoping a `auth.uid() = user_id`.
- Las migraciones SQL se almacenan en `/supabase/migrations/` con prefijo numérico.
- Nunca usar `USING (true)` en tablas con datos sensibles.

## 6. Testing

- Las funciones de lógica de negocio deben ser puras (entrada → salida) para facilitar testing.
- Las dependencias externas (DB, API) se inyectan, nunca se importan directamente en la lógica core.

## 7. Git

- Commits semánticos: `feat:`, `fix:`, `docs:`, `refactor:`, `chore:`.
- Un PR no se aprueba si rompe la compilación TypeScript (`tsc --noEmit`).
- Los archivos `.md` en `/docs` se revisan con la misma rigurosidad que el código.
