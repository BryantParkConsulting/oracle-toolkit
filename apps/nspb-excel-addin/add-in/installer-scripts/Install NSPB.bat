@echo off
setlocal
cd /d "%~dp0"
set "LOG=%~dp0install.log"
set "MANIFEST=%~dp0manifest.xml"
set "REGKEY=HKCU\Software\Microsoft\Office\16.0\Wef\Developer"

echo NSPB MCP Assistant installer > "%LOG%"
echo Started at %DATE% %TIME% >> "%LOG%"
echo Manifest path: %MANIFEST% >> "%LOG%"
echo Registry key:  %REGKEY% >> "%LOG%"
echo. >> "%LOG%"

if not exist "%MANIFEST%" (
  echo ERROR: manifest.xml not found at %MANIFEST% >> "%LOG%"
  type "%LOG%"
  echo.
  echo Press any key to close.
  pause > nul
  exit /b 1
)

echo Writing registry entry... >> "%LOG%"
reg add "%REGKEY%" /v "NSPB.Adhoc" /t REG_SZ /d "%MANIFEST%" /f >> "%LOG%" 2>&1
if errorlevel 1 (
  echo. >> "%LOG%"
  echo FAILED to write registry key. >> "%LOG%"
  type "%LOG%"
  echo.
  echo Press any key to close.
  pause > nul
  exit /b 1
)

echo. >> "%LOG%"
echo Verification - reading back the key: >> "%LOG%"
reg query "%REGKEY%" /v "NSPB.Adhoc" >> "%LOG%" 2>&1
echo. >> "%LOG%"
echo SUCCESS. The add-in is registered permanently. >> "%LOG%"
echo Close Excel completely, then reopen it. The add-in appears at >> "%LOG%"
echo   Insert ^> My Add-ins ^> Developer Add-ins (or Shared Folder). >> "%LOG%"

type "%LOG%"
echo.
echo ================================================================
echo Log saved to: %LOG%
echo Press any key to close.
echo ================================================================
pause > nul
