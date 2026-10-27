@echo off
title Artemia Pisonet - Kiosk Terminal Setup
echo ========================================================
echo [1/4] Setting up Windows Kiosk Security Policies...
echo ========================================================

:: 1. Disable Windows Key (Win, Win+S Search, Win+R Run, Win+E, Win+D, etc.)
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Policies\Explorer" /v "NoWinKeys" /t REG_DWORD /d 1 /f >nul 2>&1

:: 2. Disable Task Manager (Blocks Ctrl+Shift+Esc bypass)
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Policies\System" /v "DisableTaskMgr" /t REG_DWORD /d 1 /f >nul 2>&1

:: 3. Disable Search Box and Cortana on Taskbar
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Search" /v "SearchboxTaskbarMode" /t REG_DWORD /d 0 /f >nul 2>&1

:: 4. Disable Taskbar Context Menu (Right-click on taskbar)
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Policies\Explorer" /v "NoTrayContextMenu" /t REG_DWORD /d 1 /f >nul 2>&1

:: 5. Disable Windows Run Dialog (Win+R)
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Policies\Explorer" /v "NoRun" /t REG_DWORD /d 1 /f >nul 2>&1

:: 6. Disable Windows Search Bar integration
reg add "HKCU\Software\Policies\Microsoft\Windows\Explorer" /v "DisableSearch" /t REG_DWORD /d 1 /f >nul 2>&1

echo [2/4] Setting up Artemia Customer Terminal Auto-Start...
set TARGET_EXE=%~dp0Artemia Customer Terminal.exe
set SHORTCUT_VBS=%TEMP%\create_pisonet_shortcut.vbs

echo Set oWS = WScript.CreateObject("WScript.Shell") > "%SHORTCUT_VBS%"
echo sLinkFile = oWS.ExpandEnvironmentStrings("%%APPDATA%%\Microsoft\Windows\Start Menu\Programs\Startup\ArtemiaCustomerTerminal.lnk") >> "%SHORTCUT_VBS%"
echo Set oLink = oWS.CreateShortcut(sLinkFile) >> "%SHORTCUT_VBS%"
echo oLink.TargetPath = "%TARGET_EXE%" >> "%SHORTCUT_VBS%"
echo oLink.WorkingDirectory = "%~dp0" >> "%SHORTCUT_VBS%"
echo oLink.Description = "Artemia Customer Terminal Kiosk" >> "%SHORTCUT_VBS%"
echo oLink.Save >> "%SHORTCUT_VBS%"

cscript //nologo "%SHORTCUT_VBS%" >nul 2>&1
del "%SHORTCUT_VBS%" >nul 2>&1

:: Instant Windows Run Registry startup entry
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "ArtemiaCustomerTerminal" /t REG_SZ /d "\"%TARGET_EXE%\"" /f >nul 2>&1

echo [3/4] Installing Anti-Cheat Process Guardian Watchdog...
set GUARDIAN_VBS=%~dp0ArtemiaGuardian.vbs
(
echo Set WshShell = CreateObject^("WScript.Shell"^)
echo Set objWMIService = GetObject^("winmgmts:\\.\root\cimv2"^)
echo Do
echo   Set colProcesses = objWMIService.ExecQuery^("SELECT * FROM Win32_Process WHERE Name = 'Artemia Customer Terminal.exe'"^)
echo   If colProcesses.Count = 0 Then
echo     WshShell.Run """%TARGET_EXE%""", 1, False
echo   End If
echo   WScript.Sleep 2500
echo Loop
) > "%GUARDIAN_VBS%"

reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "ArtemiaGuardian" /t REG_SZ /d "wscript.exe \"%GUARDIAN_VBS%\"" /f >nul 2>&1
start "" wscript.exe "%GUARDIAN_VBS%"

echo [4/4] Configuration Successful!
echo.
echo ========================================================
echo [SUCCESS] PC is now in SECURE PISONET KIOSK MODE!
echo - Windows Key / Search Bar / Task Manager: BLOCKED
echo - Terminal Window: PERMANENTLY LOCKED (Cannot be closed)
echo - Anti-Cheat Guardian: ACTIVE (Auto-respawns if killed)
echo - Auto-Start on Boot: ENABLED
echo - Desktop Access: LOCKED until customer signs in with time
echo ========================================================
pause
