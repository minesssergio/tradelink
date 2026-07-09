# 🟢 ALWAYS_ON.md — Mantener Tradelink siempre activa (local)

Arranca API (3001) + frontend (5173) automáticamente al iniciar sesión en Windows,
y los reinicia solos si alguno se cae. Corre bajo tu cuenta de usuario (no requiere
guardar contraseña ni permisos de administrador).

Hay dos formas de instalarlo — **empieza por la Opción A**; si te da "Acceso
denegado" (pasa en algunos entornos restringidos), usa la Opción B, que ya está
**verificada funcionando** en esta máquina.

## Opción A: Tarea Programada de Windows (preferida)

```powershell
powershell -ExecutionPolicy Bypass -File scripts\install-autostart.ps1
```

Registra la Tarea Programada **"Tradelink AutoStart"**, que se activa "Al iniciar
sesión" y además reinicia el supervisor completo si el proceso muere.

Arrancarla ya sin reiniciar sesión: `Start-ScheduledTask -TaskName 'Tradelink AutoStart'`
Ver estado: `Get-ScheduledTask -TaskName 'Tradelink AutoStart' | Get-ScheduledTaskInfo`
Desinstalar: `powershell -ExecutionPolicy Bypass -File scripts\uninstall-autostart.ps1`

## Opción B: Carpeta de Inicio de Windows (sin Task Scheduler)

```powershell
powershell -ExecutionPolicy Bypass -File scripts\install-startup-folder.ps1
```

Coloca un acceso directo oculto en `shell:startup` que lanza el mismo supervisor.
Solo necesita acceso normal al sistema de archivos — ningún permiso especial.

Arrancarlo ya sin reiniciar sesión:
```powershell
wscript.exe "C:\Antigravity\Bitacora julio\scripts\Tradelink-Silent-Launcher.vbs"
```
Desinstalar: `powershell -ExecutionPolicy Bypass -File scripts\uninstall-startup-folder.ps1`

## Cómo funciona el supervisor (igual en ambas opciones)

`scripts\start-tradelink.ps1` arranca API y frontend ocultos (sin ventanas de
consola) y cada 15s revisa si alguno murió, reiniciando **solo el que falló**
(no ambos). Logs en `logs\api.out.log`, `logs\api.err.log`, `logs\frontend.out.log`,
`logs\frontend.err.log` (carpeta ignorada por git).

```powershell
Get-Content logs\api.out.log -Tail 30 -Wait
```

## Importante

- **No combines esto con `start.bat`.** Si el supervisor ya está corriendo y además
  haces doble clic en `start.bat`, tendrás dos procesos peleando por los mismos
  puertos (3001/5173) — el segundo fallará al arrancar. Usa uno u otro.
- Esto mantiene la app activa **mientras tu PC esté encendida y con sesión iniciada**.
  Si necesitas acceso desde otro dispositivo o que siga activa con la PC apagada,
  esa es la opción de despliegue en la nube — ver `docs/DEPLOYMENT.md`.
- El supervisor no sincroniza datos de Schwab automáticamente — sigue siendo
  manual vía el botón **Sync** de la app (o `--cron` para rotación de tokens si
  quieres automatizar eso también; no está programado por defecto).
