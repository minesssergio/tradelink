# Quita el acceso directo instalado por install-startup-folder.ps1.
# No detiene procesos node ya corriendo.

$startup = [Environment]::GetFolderPath('Startup')
$lnkPath = Join-Path $startup 'Tradelink AutoStart.lnk'

if (Test-Path $lnkPath) {
    Remove-Item $lnkPath -Force
    Write-Host "Acceso directo eliminado: $lnkPath"
} else {
    Write-Host "No había acceso directo instalado."
}
