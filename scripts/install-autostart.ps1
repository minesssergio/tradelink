# =============================================================================
# install-autostart.ps1 — Registra una Tarea Programada de Windows que arranca
# el supervisor de Tradelink (start-tradelink.ps1) al iniciar sesión, y lo
# reinicia automáticamente si el proceso del supervisor termina.
#
# Uso:  powershell -ExecutionPolicy Bypass -File scripts\install-autostart.ps1
# Quitar:  powershell -ExecutionPolicy Bypass -File scripts\uninstall-autostart.ps1
# =============================================================================

$TaskName = 'Tradelink AutoStart'
$root = Split-Path -Parent $PSScriptRoot
$scriptPath = Join-Path $root 'scripts\start-tradelink.ps1'

if (-not (Test-Path $scriptPath)) {
    Write-Error "No se encontró $scriptPath"
    exit 1
}

$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
    -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$scriptPath`""

$trigger = New-ScheduledTaskTrigger -AtLogOn

$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1)

try {
    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `
        -Settings $settings -Description 'Arranca y supervisa Tradelink (API + frontend) al iniciar sesión.' `
        -Force -ErrorAction Stop | Out-Null
} catch {
    Write-Error "No se pudo registrar la tarea: $($_.Exception.Message)"
    Write-Error "Corre este script desde una ventana normal de PowerShell (no hace falta 'Ejecutar como administrador', pero sí un acceso normal al servicio de Task Scheduler)."
    Write-Error "Si sigue fallando (p.ej. en un entorno restringido), usa la alternativa sin Task Scheduler: scripts\install-startup-folder.ps1"
    exit 1
}

if (-not (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue)) {
    Write-Error "El registro no lanzó error pero la tarea no aparece en Task Scheduler. Algo salió mal."
    exit 1
}

Write-Host "Tarea '$TaskName' registrada correctamente. Se activará en el próximo inicio de sesión."
Write-Host "Para arrancarla ahora mismo sin reiniciar sesión: Start-ScheduledTask -TaskName '$TaskName'"
