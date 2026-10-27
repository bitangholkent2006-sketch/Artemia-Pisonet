@echo off
title Artemia Pisonet - Auto-Start Installer for Client PC
echo ========================================================
echo Installing Artemia Pisonet Customer Terminal to Windows Startup...
echo ========================================================

set TARGET_DIR=%~dp0
set SHORTCUT_PATH=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\ArtemiaCustomerTerminal.bat

(
  echo @echo off
  echo cd /d "%TARGET_DIR%"
  echo npx electron .
) > "%SHORTCUT_PATH%"

echo.
echo [SUCCESS] Customer Terminal has been installed to Windows Startup!
echo Whenever this PC turns on or restarts, the terminal will launch automatically.
echo Startup file location: %SHORTCUT_PATH%
echo ========================================================
pause
