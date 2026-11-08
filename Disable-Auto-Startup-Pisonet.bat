@echo off
title Artemia Fleet Agent - Disable Auto-Startup
color 0e
echo ========================================================
echo   ARTEMIA FLEET AGENT - DISABLE AUTO STARTUP
echo ========================================================
echo.

echo [1/2] Gina-tangtang sa Windows Registry Startup...
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "ArtemiaFleetAgent" /f >nul 2>&1

echo [2/2] Gina-tangtang sa Startup folder shortcut...
del "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Artemia Fleet Agent.lnk" >nul 2>&1

echo.
echo ========================================================
echo   AUTOMATIC STARTUP DISABLED
echo ========================================================
echo Dili na mo-run automatically inig on sa computer.
echo Pwede nimo i-enable pag-usab gamit ang Enable-Auto-Startup-Pisonet.bat.
echo ========================================================
echo.
pause

