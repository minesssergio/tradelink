# 🟢 ALWAYS_ON.md — Mantener Tradelink siempre activa (local)

Arranca API (3001) + frontend (5173) automáticamente al iniciar sesión en Windows,
y los reinicia solos si alguno se cae. Corre bajo tu cuenta de usuario (no requiere
guardar contraseña ni permisos de administrador).

## Instalar

```powershell
powershell -ExecutionPolicy Bypass -File scripts\install-autostart.ps1
```

Esto registra la Tarea Programada **"Tradelink AutoStart"**, que:
- se activa "Al iniciar sesión" (`AtLogOn`)
- ejecuta `scripts\start-tradelink.ps1`, un supervisor que arranca ambos procesos
  ocultos (sin ventanas de consola) y cada 15s revisa si alguno murió, reiniciando
  solo el que falló (no ambos)
- guarda logs en `logs\api.out.log`, `logs\api.err.log`, `logs\frontend.out.log`,
  `logs\frontend.err.log` (carpeta ignorada por git)

## Arrancarla ya, sin reiniciar sesión

```powershell
Start-ScheduledTask -TaskName 'Tradelink AutoStart'
```

## Ver estado / logs

```powershell
Get-ScheduledTask -TaskName 'Tradelink AutoStart' | Get-ScheduledTaskInfo
Get-Content logs\api.out.log -Tail 30 -Wait
```

## Desinstalar

```powershell
powershell -ExecutionPolicy Bypass -File scripts\uninstall-autostart.ps1
```

Esto solo quita la tarea programada; si los procesos node ya están corriendo,
ciérralos a mano (`Get-Process node | Stop-Process`) o simplemente cierra sesión.

## Importante

- **No combines esto con `start.bat`.** Si la tarea ya está corriendo y además
  haces doble clic en `start.bat`, tendrás dos procesos peleando por los mismos
  puertos (3001/5173) — el segundo fallará al arrancar. Usa uno u otro.
- Esto mantiene la app activa **mientras tu PC esté encendida y con sesión iniciada**.
  Si necesitas acceso desde otro dispositivo o que siga activa con la PC apagada,
  esa es la opción de despliegue en la nube — ver `docs/DEPLOYMENT.md`.
- El supervisor no sincroniza datos de Schwab automáticamente — sigue siendo
  manual vía el botón **Sync** de la app (o `--cron` para rotación de tokens si
  quieres automatizar eso también; no está programado por defecto).
