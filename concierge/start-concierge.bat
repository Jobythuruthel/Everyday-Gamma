@echo off
rem CONCIERGE kiosk launcher for Windows.
rem Optional: set PRINTER_HOST to the Zebra's IP (find it on the printer's network config label).
rem Optional: set HOST_WEBHOOK to a Make/Zapier/Power Automate URL to send VIP alerts to WhatsApp, Teams or email.
cd /d "%~dp0"
if "%ADMIN_PIN%"=="" set /p ADMIN_PIN=Set staff PIN for this session: 
if "%PRINTER_HOST%"=="" set /p PRINTER_HOST=Zebra printer IP (leave empty to print from the browser): 
start "CONCIERGE server" /min cmd /c "node --no-warnings server.js >> data\server.log 2>&1"
timeout /t 2 /nobreak >nul
start "" chrome --kiosk --noerrdialogs --disable-pinch --overscroll-history-navigation=0 --kiosk-printing --user-data-dir="%~dp0data\chrome" http://localhost:8091/
