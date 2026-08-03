@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"

set "LOG=%~dp0start.log"
set "MANIFEST=%~dp0manifest.xml"

REM ── Header ──────────────────────────────────────────────────────────
echo NSPB MCP Assistant — Start helper > "%LOG%"
echo Started at %DATE% %TIME% >> "%LOG%"
echo Folder:    %~dp0 >> "%LOG%"
echo Manifest:  %MANIFEST% >> "%LOG%"
echo. >> "%LOG%"

echo =====================================================
echo  NSPB MCP Assistant — Starting...
echo =====================================================
echo.
echo Log file: %LOG%
echo.

REM ── 1. Manifest exists? ─────────────────────────────────────────────
if not exist "%MANIFEST%" (
  echo [ERROR] manifest.xml not found at: %MANIFEST% | tee -a "%LOG%"
  echo Make sure you're running this .bat from the Customer_Installer folder.
  echo.
  echo Press any key to close.
  pause > nul
  exit /b 1
)
echo [OK] manifest.xml found >> "%LOG%"
echo [OK] manifest.xml found

REM ── 2. (Node.js check removed — the add-in loads entirely from the
REM        hosted worker URL in manifest.xml; no local server, no Node.) ─

REM ── 4. Registry entry present? ─────────────────────────────────────
reg query "HKCU\Software\Microsoft\Office\16.0\Wef\Developer" /v "NSPB.Adhoc" > nul 2>&1
if errorlevel 1 (
  echo [WARN] Registry entry NSPB.Adhoc not found. >> "%LOG%"
  echo [WARN] Registry entry NSPB.Adhoc not found.
  echo You probably need to run "Install NSPB.bat" first.
  echo.
  echo Press any key to continue anyway, or close this window to abort.
  pause > nul
) else (
  echo [OK] Registry entry NSPB.Adhoc present >> "%LOG%"
  echo [OK] Registry entry NSPB.Adhoc present
)

echo. >> "%LOG%"
echo.

REM ── 5. Launch Excel ─────────────────────────────────────────────────
REM The registry entry from Install.bat is all Excel needs to surface the
REM add-in under Insert > My Add-ins > Shared Folder. We just open Excel.
REM No npx, no office-addin-debugging — that tool needs a package.json
REM and is meant for dev workflows, not installs.
echo [STEP] Opening Excel >> "%LOG%"
echo.
echo =====================================================
echo  [STEP] Opening Excel...
echo =====================================================
echo.
start "" excel
set "EXITCODE=%ERRORLEVEL%"
echo Exit code: %EXITCODE% >> "%LOG%"

if %EXITCODE% NEQ 0 (
  echo.
  echo =====================================================
  echo  [ERROR] Could not start Excel ^(exit code %EXITCODE%^)
  echo =====================================================
  echo.
  echo Possible cause: Excel is not installed or not in PATH.
  echo Open Excel manually instead.
  echo.
  echo Press any key to close.
  pause > nul
  exit /b %EXITCODE%
)

echo.
echo =====================================================
echo  [OK] Excel is opening.
echo =====================================================
echo.
echo To open the NSPB MCP Assistant inside Excel:
echo   1. Open any workbook
echo   2. Insert tab ^> My Add-ins ^> SHARED FOLDER tab
echo   3. Click NSPB MCP Assistant
echo.
echo Log: %LOG%
echo.
echo Press any key to close.
pause > nul
endlocal
