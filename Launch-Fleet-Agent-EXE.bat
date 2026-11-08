@echo off
title Artemia Fleet Agent - Native Windows Station
cd /d "%~dp0dist-client\Artemia Customer Terminal-win32-x64"
echo ========================================================
echo   STARTING ARTEMIA FLEET AGENT (NATIVE WINDOWS EXE)
echo ========================================================
echo Launching native hardware agent with PowerShell and Screen capture...
start "" "Artemia Customer Terminal.exe"
exit

