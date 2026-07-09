# =============================================================================
# install-startup-folder.ps1 — Alternativa a install-autostart.ps1 para
# cuando el registro en Task Scheduler falla por permisos (p.ej. entornos
# sandboxeados). Coloca un acceso directo en la carpeta de Inicio de Windows
# ("shell:startup") que lanza el supervisor de forma completamente oculta
# al iniciar sesión. Solo requiere acceso normal al sistema de archivos —
# ningún permiso especial de Windows.
#
# Uso:  powershell -ExecutionPolicy Bypass -File scripts\install-startup-folder.ps1
# Quitar:  powershell -ExecutionPolicy Bypass -File scripts\uninstall-startup-folder.ps1
# =============================================================================

$root = Split-Path -Parent $PSScriptRoot
$vbsPath = Join-Path $root 'scripts\Tradelink-Silent-Launcher.vbs'
$startup = [Environment]::GetFolderPath('Startup')
$lnkPath = Join-Path $startup 'Tradelink AutoStart.lnk'

if (-not (Test-Path $vbsPath)) {
    Write-Error "No se encontró $vbsPath"
    exit 1
}

$WshShell = New-Object -ComObject WScript.Shell
$shortcut = $WshShell.CreateShortcut($lnkPath)
$shortcut.TargetPath = 'wscript.exe'
$shortcut.Arguments = "`"$vbsPath`""
$shortcut.WorkingDirectory = $root
$shortcut.Description = 'Arranca y supervisa Tradelink (API + frontend) al iniciar sesión, oculto.'
$shortcut.Save()

if (-not (Test-Path $lnkPath)) {
    Write-Error "El acceso directo no se creó en $lnkPath"
    exit 1
}

Write-Host "Acceso directo creado: $lnkPath"
Write-Host "Se activará en el próximo inicio de sesión de Windows."
Write-Host "Para arrancarlo ahora mismo sin reiniciar sesión: wscript.exe `"$vbsPath`""
