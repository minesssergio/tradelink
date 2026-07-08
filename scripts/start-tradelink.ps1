# =============================================================================
# start-tradelink.ps1 — Supervisor: mantiene API (3001) y frontend (5173)
# corriendo indefinidamente, reiniciando cada uno por separado si se cae.
# Pensado para ejecutarse como Tarea Programada de Windows (ver
# install-autostart.ps1), pero también puede correrse a mano en una terminal.
# =============================================================================

$root = Split-Path -Parent $PSScriptRoot
$logDir = Join-Path $root 'logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

function Start-Service {
    param([string]$Name, [string]$Dir)
    $out = Join-Path $logDir "$Name.out.log"
    $err = Join-Path $logDir "$Name.err.log"
    Start-Process -FilePath 'cmd.exe' `
        -ArgumentList "/c cd /d `"$Dir`" && npm run dev" `
        -WindowStyle Hidden `
        -RedirectStandardOutput $out `
        -RedirectStandardError $err `
        -PassThru
}

Write-Host "[$(Get-Date -Format s)] Tradelink supervisor starting. Logs: $logDir"

$api = Start-Service -Name 'api' -Dir (Join-Path $root 'services\api')
$frontend = Start-Service -Name 'frontend' -Dir (Join-Path $root 'frontend')

while ($true) {
    Start-Sleep -Seconds 15

    if ($api.HasExited) {
        Write-Host "[$(Get-Date -Format s)] API process died (exit $($api.ExitCode)) — restarting."
        $api = Start-Service -Name 'api' -Dir (Join-Path $root 'services\api')
    }
    if ($frontend.HasExited) {
        Write-Host "[$(Get-Date -Format s)] Frontend process died (exit $($frontend.ExitCode)) — restarting."
        $frontend = Start-Service -Name 'frontend' -Dir (Join-Path $root 'frontend')
    }
}
