@echo off
title Artemia Fleet Agent - Auto-Startup Configuration
color 0b
echo ========================================================
echo   ARTEMIA FLEET AGENT - AUTOMATIC WINDOWS STARTUP
echo ========================================================
echo.

set TARGET_EXE=%~dp0dist-client\Artemia Customer Terminal-win32-x64\Artemia Customer Terminal.exe

if not exist "%TARGET_EXE%" (
  echo [ERROR] Dili makita ang Artemia Customer Terminal.exe!
  echo Siguroha nga naa kini sa dist-client folder.
  pause
  exit /b 1
)

echo [1/2] Gina-rehistro sa Windows Registry Startup (HKCU\Run)...
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "ArtemiaFleetAgent" /t REG_SZ /d "\"%TARGET_EXE%\"" /f >nul 2>&1

echo [2/2] Gina-himo ang Windows Startup Folder Shortcut...
set SHORTCUT_VBS=%TEMP%\create_artemia_shortcut.vbs
echo Set oWS = WScript.CreateObject("WScript.Shell") > "%SHORTCUT_VBS%"
echo sLinkFile = oWS.ExpandEnvironmentStrings("%%APPDATA%%\Microsoft\Windows\Start Menu\Programs\Startup\Artemia Fleet Agent.lnk") >> "%SHORTCUT_VBS%"
echo Set oLink = oWS.CreateShortcut(sLinkFile) >> "%SHORTCUT_VBS%"
echo oLink.TargetPath = "%TARGET_EXE%" >> "%SHORTCUT_VBS%"
echo oLink.WorkingDirectory = "%~dp0dist-client\Artemia Customer Terminal-win32-x64" >> "%SHORTCUT_VBS%"
echo oLink.Description = "Artemia Fleet Agent - Pisonet Maintenance Daemon" >> "%SHORTCUT_VBS%"
echo oLink.Save >> "%SHORTCUT_VBS%"

cscript //nologo "%SHORTCUT_VBS%" >nul 2>&1
del "%SHORTCUT_VBS%" >nul 2>&1

echo.
echo ========================================================
echo   SUCCESS! AUTOMATIC STARTUP ENABLED
echo ========================================================
echo Kada-on o kada-restart sa computer, AWTOMATIKO na nga
echo modagan ang Artemia Fleet Agent sa background!
echo Dili na kinahanglan i-double click ang .bat file!
echo ========================================================
echo.
pause

