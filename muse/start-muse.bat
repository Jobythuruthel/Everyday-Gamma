@echo off
rem MUSE kiosk launcher for Windows. Double-click, or add to Startup for auto-run.
cd /d "%~dp0"
if "%ADMIN_PIN%"=="" set /p ADMIN_PIN=Set operator PIN for this session: 
start "MUSE server" /min cmd /c "node --no-warnings server.js >> data\server.log 2>&1"
timeout /t 2 /nobreak >nul
start "" chrome --kiosk --noerrdialogs --disable-pinch --overscroll-history-navigation=0 --use-fake-ui-for-media-stream --user-data-dir="%~dp0data\chrome" http://localhost:9206/
