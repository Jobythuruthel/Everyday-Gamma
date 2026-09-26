@echo off
rem CITADEL kiosk launcher for Windows. Double-click, or add to Startup for auto-run.
cd /d "%~dp0"
if "%ADMIN_PIN%"=="" set /p ADMIN_PIN=Set admin PIN for this session: 
start "CITADEL server" /min cmd /c "node --no-warnings server.js >> data\server.log 2>&1"
timeout /t 2 /nobreak >nul
start "" chrome --kiosk --noerrdialogs --disable-pinch --overscroll-history-navigation=0 --user-data-dir="%~dp0data\chrome" http://localhost:8802/
