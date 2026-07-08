# Quita la tarea de autoarranque instalada por install-autostart.ps1.
# No detiene procesos node ya corriendo — para eso usa Stop-Process o cierra
# las ventanas si usaste start.bat.

$TaskName = 'Tradelink AutoStart'
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
Write-Host "Tarea '$TaskName' eliminada (si existía)."
