@echo off
title Artemia Pisonet - Unlock PC (Admin Maintenance)
echo ========================================================
echo Restoring Standard Windows Keys & Explorer for Admin...
echo ========================================================

:: Stop Guardian Watchdog
taskkill /f /im wscript.exe >nul 2>&1
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "ArtemiaGuardian" /f >nul 2>&1

:: Restore Windows Policies
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Policies\Explorer" /v "NoWinKeys" /f >nul 2>&1
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Policies\System" /v "DisableTaskMgr" /f >nul 2>&1
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Policies\Explorer" /v "NoTrayContextMenu" /f >nul 2>&1
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Policies\Explorer" /v "NoRun" /f >nul 2>&1
reg delete "HKCU\Software\Policies\Microsoft\Windows\Explorer" /v "DisableSearch" /f >nul 2>&1
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Search" /v "SearchboxTaskbarMode" /t REG_DWORD /d 1 /f >nul 2>&1

:: Stop Kiosk Key Hook
taskkill /f /im KioskKeyLock.exe >nul 2>&1

echo.
echo ========================================================
echo [SUCCESS] Windows Keys, Search Bar, Run, and Task Manager are RESTORED.
echo You can now use the PC normally for maintenance or game updates.
echo ========================================================
pause
