@echo off
rem LUMEN hologram launcher for Windows. Put Chrome on the hologram / transparent display output.
rem Optional: set CORTEX_URL=http://<cortex-machine-ip>:4029 to answer follow-up questions and route "Call a person" to CORTEX staff.
cd /d "%~dp0"
if "%ADMIN_PIN%"=="" set /p ADMIN_PIN=Set operator PIN for this session: 
start "LUMEN server" /min cmd /c "node --no-warnings server.js >> data\server.log 2>&1"
timeout /t 2 /nobreak >nul
start "" chrome --kiosk --noerrdialogs --autoplay-policy=no-user-gesture-required --use-fake-ui-for-media-stream --user-data-dir="%~dp0data\chrome" http://localhost:7248/
