@echo off
rem ============================================================
rem Tradelink - Arranca API (3001) + Frontend (5173) y abre la app
rem ============================================================
start "Tradelink API (3001)" cmd /k "cd /d "%~dp0services\api" && npm run dev"
start "Tradelink Frontend (5173)" cmd /k "cd /d "%~dp0frontend" && npm run dev"
echo Esperando a que los servidores arranquen...
timeout /t 6 /nobreak >nul
start http://localhost:5173
