@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"

set "LOG=%~dp0uninstall.log"
set "REGKEY=HKCU\Software\Microsoft\Office\16.0\Wef\Developer"
set "WEF=%LOCALAPPDATA%\Microsoft\Office\16.0\Wef"

REM ── Header ──────────────────────────────────────────────────────────
echo NSPB MCP Assistant — Full Uninstaller > "%LOG%"
echo Started at %DATE% %TIME% >> "%LOG%"
echo Registry key: %REGKEY% >> "%LOG%"
echo Wef folder:   %WEF% >> "%LOG%"
echo. >> "%LOG%"

echo =====================================================
echo  NSPB MCP Assistant — Full Uninstall
echo =====================================================
echo.
echo This script will:
echo   1. Close any running Excel processes
echo   2. Remove the NSPB.Adhoc registry entry
echo   3. Clear the Office Wef cache for this user
echo      ^(removes all sideloaded add-in caches, NOT just NSPB^)
echo   4. Optionally remove the legacy NSPB registry value
echo.
echo Log file: %LOG%
echo.

REM ── 1. Close Excel ──────────────────────────────────────────────────
echo [STEP 1] Checking for running Excel instances... >> "%LOG%"
echo [STEP 1] Closing any running Excel...
tasklist /FI "IMAGENAME eq EXCEL.EXE" 2>nul | find /I "EXCEL.EXE" > nul
if %ERRORLEVEL% EQU 0 (
  echo   Found Excel running — terminating... >> "%LOG%"
  echo   Found Excel running — terminating...
  taskkill /F /IM EXCEL.EXE >> "%LOG%" 2>&1
  timeout /t 2 /nobreak > nul
) else (
  echo   No Excel processes running. >> "%LOG%"
  echo   No Excel processes running.
)
echo. >> "%LOG%"

REM ── 2. Delete registry entry ───────────────────────────────────────
echo [STEP 2] Removing registry entry %REGKEY%\NSPB.Adhoc >> "%LOG%"
echo [STEP 2] Removing registry entry NSPB.Adhoc...
reg delete "%REGKEY%" /v "NSPB.Adhoc" /f >> "%LOG%" 2>&1
if errorlevel 1 (
  echo   ^(no NSPB.Adhoc entry found — already clean^) >> "%LOG%"
  echo   ^(no NSPB.Adhoc entry found — already clean^)
) else (
  echo   [OK] NSPB.Adhoc deleted >> "%LOG%"
  echo   [OK] NSPB.Adhoc deleted
)
echo. >> "%LOG%"

REM ── 3. Clear Wef cache ──────────────────────────────────────────────
REM Office stores a cached copy of the manifest + taskpane URL here.
REM Even after the registry entry is deleted, this cache can survive
REM and make Excel try to load the OLD URL. Wiping it forces re-read.
echo [STEP 3] Clearing Wef cache at %WEF% >> "%LOG%"
echo [STEP 3] Clearing Office Wef cache...
if exist "%WEF%" (
  REM Show what's about to be removed
  dir /B "%WEF%" >> "%LOG%" 2>&1
  rmdir /S /Q "%WEF%" 2>>"%LOG%"
  if exist "%WEF%" (
    echo   [WARN] Some Wef files could not be removed ^(probably locked^). >> "%LOG%"
    echo   [WARN] Some Wef files could not be removed.
    echo   Try closing Excel/Word/PowerPoint completely and re-run.
  ) else (
    echo   [OK] Wef cache cleared. Office will re-create it. >> "%LOG%"
    echo   [OK] Wef cache cleared.
  )
) else (
  echo   ^(no Wef folder — nothing to clear^) >> "%LOG%"
  echo   ^(no Wef folder — nothing to clear^)
)
echo. >> "%LOG%"

REM ── 4. Remove legacy registry roots if empty ───────────────────────
REM If the Wef\Developer key has no other values, delete the empty key.
echo [STEP 4] Checking for empty registry parents... >> "%LOG%"
for /f "skip=2 tokens=*" %%v in ('reg query "%REGKEY%" 2^>nul') do (
  set "FOUND_VALUE=1"
)
if not defined FOUND_VALUE (
  reg delete "%REGKEY%" /f >> "%LOG%" 2>&1
  echo   [OK] Removed empty Wef\Developer key >> "%LOG%"
  echo   [OK] Removed empty Wef\Developer key
) else (
  echo   ^(other developer add-ins present — leaving Wef\Developer intact^) >> "%LOG%"
  echo   ^(other developer add-ins present — leaving key intact^)
)
echo. >> "%LOG%"

REM ── 5. Verify ──────────────────────────────────────────────────────
echo [VERIFY] Reading back registry... >> "%LOG%"
reg query "%REGKEY%" /v "NSPB.Adhoc" >> "%LOG%" 2>&1
if errorlevel 1 (
  echo. >> "%LOG%"
  echo SUCCESS - NSPB add-in fully uninstalled. >> "%LOG%"
  echo.
  echo =====================================================
  echo  [SUCCESS] NSPB add-in fully uninstalled
  echo =====================================================
  echo.
  echo You can now run "Install NSPB.bat" to register it again,
  echo or close this window if you wanted to remove it permanently.
) else (
  echo. >> "%LOG%"
  echo WARNING - registry entry still present. >> "%LOG%"
  echo.
  echo =====================================================
  echo  [WARN] Registry entry still present
  echo =====================================================
  echo See log: %LOG%
)

echo.
echo Log: %LOG%
echo.
echo Press any key to close.
pause > nul
endlocal
