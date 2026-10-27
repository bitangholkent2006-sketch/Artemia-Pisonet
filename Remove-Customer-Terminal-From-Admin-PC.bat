@echo off
title Artemia Pisonet - Restore Admin Device (Remove Client Kiosk)
echo =======================================================================
echo  Restoring Admin / Developer Laptop to Normal Mode
echo  (Removing Artemia Customer Terminal, Watchdog, Autostart, & Policies)
echo =======================================================================
echo.

echo [1/5] Stopping all Customer Terminal processes...
:: Kill the watchdog guardian first so it stops respawning
taskkill /f /im wscript.exe >nul 2>&1
:: Kill the customer terminal executable
taskkill /f /im "Artemia Customer Terminal.exe" >nul 2>&1
:: Kill any dev electron customer terminal instances
taskkill /f /im electron.exe >nul 2>&1
:: Kill keyboard hook if present
taskkill /f /im KioskKeyLock.exe >nul 2>&1
echo Done.

echo [2/5] Removing Startup Shortcuts...
del /f /q "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\ArtemiaCustomerTerminal.lnk" >nul 2>&1
del /f /q "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Artemia*.lnk" >nul 2>&1
echo Done.

echo [3/5] Removing Registry Autostart Entries...
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "ArtemiaGuardian" /f >nul 2>&1
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "ArtemiaCustomerTerminal" /f >nul 2>&1
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "Artemia Pisonet Customer Terminal" /f >nul 2>&1
echo Done.

echo [4/5] Restoring Windows Desktop Policies (Task Manager, Windows Key, Search)...
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Policies\Explorer" /v "NoWinKeys" /f >nul 2>&1
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Policies\System" /v "DisableTaskMgr" /f >nul 2>&1
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Policies\Explorer" /v "NoTrayContextMenu" /f >nul 2>&1
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Policies\Explorer" /v "NoRun" /f >nul 2>&1
reg delete "HKCU\Software\Policies\Microsoft\Windows\Explorer" /v "DisableSearch" /f >nul 2>&1
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Search" /v "SearchboxTaskbarMode" /t REG_DWORD /d 1 /f >nul 2>&1
echo Done.

echo [5/5] Deleting local guardian script...
if exist "dist-client\Artemia Customer Terminal-win32-x64\ArtemiaGuardian.vbs" (
  del /f /q "dist-client\Artemia Customer Terminal-win32-x64\ArtemiaGuardian.vbs" >nul 2>&1
)
echo Done.

echo.
echo =======================================================================
echo  [SUCCESS] This Laptop is now fully RESTORED as an ADMIN device!
echo  - Customer Terminal: CLOSED and UNINSTALLED from Startup
echo  - Guardian Watchdog: TERMINATED and REMOVED
echo  - Windows Key, Task Manager, Run Dialog, & Search: RESTORED
echo =======================================================================
