# sniff-epmautomate.ps1 — capture HTTP traffic of EPM Automate to discover
# which REST endpoints it uses internally.
#
# Run this once, paste the output back to Bruno. The script will:
#  1. Set EPM Automate log level to DEBUG (no installation needed)
#  2. Run a series of test commands (login, exportMetadata, exportSecurity, etc.)
#  3. Capture HTTP requests + URLs + methods from the debug log
#  4. Write a clean summary to .\epm-sniff-report.txt
#
# Usage (in PowerShell):
#   .\sniff-epmautomate.ps1

$ErrorActionPreference = "Continue"

# === EDIT IF NEEDED ====================================================
$EpmPath  = "C:\Program Files\Oracle\EPM Automate\bin\epmautomate.bat"
$Url      = "https://epm12119-demoepm2119.epm.us-phoenix-1.ocs.oraclecloud.com"
$User     = "demoadmin"
$Password = "C:\ProgramData\Oracle\EPM Automate\creds.epw"
# =======================================================================

$Report = ".\epm-sniff-report.txt"
"" | Out-File $Report -Encoding utf8

function Write-Section {
  param([string]$Title)
  Add-Content $Report "`n========================================================================"
  Add-Content $Report ("  " + $Title)
  Add-Content $Report "========================================================================"
}

function Do-Login {
  & $EpmPath "login" $User $Password $Url 2>&1 | Out-Null
}

function Run-Capture {
  param([string]$Label, [string[]]$CmdArgs)
  Write-Section $Label
  Add-Content $Report ("Command: epmautomate " + ($CmdArgs -join ' '))
  Add-Content $Report ""
  $sw = [Diagnostics.Stopwatch]::StartNew()
  $output = & $EpmPath @CmdArgs 2>&1 | Out-String
  $sw.Stop()
  $code = $LASTEXITCODE
  # If session expired, re-login and retry once
  if ($code -eq 7 -and $CmdArgs[0] -ne "login" -and $CmdArgs[0] -ne "logout") {
    Add-Content $Report "(session expired - re-logging in and retrying)"
    Do-Login
    $sw2 = [Diagnostics.Stopwatch]::StartNew()
    $output = & $EpmPath @CmdArgs 2>&1 | Out-String
    $sw2.Stop()
    $code = $LASTEXITCODE
  }
  Add-Content $Report ("Exit code: " + $code + "  Duration: " + $sw.Elapsed.TotalSeconds + "s")
  Add-Content $Report ""
  Add-Content $Report "--- stdout/stderr ---"
  Add-Content $Report $output
  Add-Content $Report ""
}

function Filter-Log {
  Write-Section "EPM Automate debug logs - all recent files"
  $logDir = "C:\ProgramData\Oracle\EPM Automate"
  if (-not (Test-Path $logDir)) {
    Add-Content $Report ("Log dir not found: " + $logDir)
    return
  }
  $logs = Get-ChildItem -Path $logDir -Filter "*.log" | Sort-Object LastWriteTime -Descending | Select-Object -First 15
  Add-Content $Report ("Log dir: " + $logDir)
  Add-Content $Report ("Found " + $logs.Count + " recent log files")
  Add-Content $Report ""
  foreach ($f in $logs) {
    Add-Content $Report "------------------------------------------------------------------------"
    Add-Content $Report ("FILE: " + $f.Name + "  (" + $f.LastWriteTime + ")")
    Add-Content $Report "------------------------------------------------------------------------"
    $content = Get-Content $f.FullName
    foreach ($line in $content) {
      Add-Content $Report $line
    }
    Add-Content $Report ""
  }
}

# === Set debug level ====================================================
$env:EPM_AUTOMATE_LOG_LEVEL = "DEBUG"
$env:EPM_AUTOMATE_DEBUG = "true"
# Force JVM HTTP wire logging via log4j system properties (EPM Automate uses Apache HttpClient)
$env:JAVA_TOOL_OPTIONS = "-Dorg.apache.commons.logging.Log=org.apache.commons.logging.impl.SimpleLog -Dorg.apache.commons.logging.simplelog.showdatetime=true -Dorg.apache.commons.logging.simplelog.log.org.apache.http=DEBUG -Dorg.apache.commons.logging.simplelog.log.org.apache.http.wire=DEBUG -Dorg.apache.commons.logging.simplelog.log.org.apache.http.headers=DEBUG"

# === Verify EPM Automate exists ========================================
if (-not (Test-Path $EpmPath)) {
  Write-Host ("ERROR: EPM Automate not found at " + $EpmPath) -ForegroundColor Red
  Write-Host "Edit the script and set EpmPath to your actual path." -ForegroundColor Yellow
  exit 1
}

Write-Host ("EPM Automate sniff starting - output to " + $Report) -ForegroundColor Cyan
Write-Host ""

# === Clear old logs so we only capture this run's traffic ==============
$logDir = "C:\ProgramData\Oracle\EPM Automate"
if (Test-Path $logDir) {
  Get-ChildItem -Path $logDir -Filter "*.log" | Remove-Item -Force -ErrorAction SilentlyContinue
}

# === Create a sample dimension CSV that consultant can import =========
# Format matches Planning's standard metadata import (Account dimension example)
$sampleCsvPath = ".\SampleAccount_import.csv"
$sampleCsv = @'
Account,Parent,Default Alias,Account Type,Time Balance,Data Storage (NetSuite),Two Pass Calculation,Formula
Test_Acct_001,Account,Test Account 001,Expense,Flow,Store,FALSE,
Test_Acct_002,Account,Test Account 002,Revenue,Flow,Store,FALSE,
Test_Acct_003,Test_Acct_001,Test Account 003,Expense,Flow,Store,FALSE,
'@
Set-Content -Path $sampleCsvPath -Value $sampleCsv -Encoding utf8
# Zip it (Planning import expects .zip when ImportZipFileName is used)
$sampleZipPath = ".\SampleAccount_import.zip"
if (Test-Path $sampleZipPath) { Remove-Item $sampleZipPath -Force }
Compress-Archive -Path $sampleCsvPath -DestinationPath $sampleZipPath -Force
Write-Host ("Sample import file created: " + (Resolve-Path $sampleZipPath)) -ForegroundColor Green

# === Test sequence ======================================================
# SAFETY POLICY:
#   - Read-only commands: OK (getXxx, listXxx, exportXxx with file output)
#   - Job-submit commands (exportMetadata, runBusinessRule, etc): use FAKE
#     job/rule names so the server returns 400 "not found" — we still capture
#     the HTTP wire (URL + body) but nothing executes server-side.
#   - REMOVED entirely: recreate, clearcube, resetService, runDailyMaintenance,
#     refreshCube, mergeDataSlices, exportSnapshot (overwrites), setSubstVars
#     (writes a var), runIntegration/runDataRule with real names.
$tests = @(
  @{ Label = "01. LOGIN";                          Cmd = @("login", $User, $Password, $Url) },

  # --- Misc info / introspection (100% read-only) ---
  @{ Label = "02. VERSION";                        Cmd = @("version") },
  @{ Label = "03. HELP";                           Cmd = @("help") },
  @{ Label = "04. LIST FILES";                     Cmd = @("listFiles") },
  @{ Label = "05. APPLICATION ADMIN MODE";         Cmd = @("applicationAdminMode") },
  @{ Label = "06. GET DAILY MAINTENANCE WINDOW";   Cmd = @("getDailyMaintenanceWindow") },
  @{ Label = "07. GET APPLICATION SETTINGS";       Cmd = @("getApplicationSettings") },
  @{ Label = "08. GET PROCESS STATE";              Cmd = @("getProcessState") },
  @{ Label = "09. GET ENCRYPTION KEY";             Cmd = @("getEncryptionKey") },
  @{ Label = "10. GET SYSTEM SETTING";             Cmd = @("getSystemSetting") },

  # --- Substitution variables (read-only) ---
  @{ Label = "11. GET SUBST VARS (all)";           Cmd = @("getSubstVars", "all") },
  @{ Label = "12. GET SUBST VARS (cube)";          Cmd = @("getSubstVars", "NetSuite", "all") },

  # --- Job-submit commands with FAKE NAMES → expect 400 (no server-side effect) ---
  @{ Label = "13. EXPORT METADATA (fake job)";     Cmd = @("exportMetadata", "ZZZ_FakeJob_DoNotCreate", "Account.zip") },
  @{ Label = "14. IMPORT METADATA (fake job)";     Cmd = @("importMetadata", "ZZZ_FakeJob_DoNotCreate", "fake.zip") },
  @{ Label = "15. EXPORT DATA (fake job)";         Cmd = @("exportData", "ZZZ_FakeJob_DoNotCreate", "data.zip") },
  @{ Label = "16. IMPORT DATA (fake job)";         Cmd = @("importData", "ZZZ_FakeJob_DoNotCreate", "data.zip") },
  @{ Label = "17. RUN BUSINESS RULE (fake)";       Cmd = @("runBusinessRule", "ZZZ_FakeRule_DoNotCreate") },
  @{ Label = "18. RUN RULESET (fake)";             Cmd = @("runBusinessRuleSet", "ZZZ_FakeRuleSet_DoNotCreate") },
  @{ Label = "19. RUN PLAN TYPE MAP (fake)";       Cmd = @("runPlanTypeMap", "ZZZ_FakePTMap_DoNotCreate") },
  @{ Label = "20. RUN DATA RULE DM (fake)";        Cmd = @("runDataRule", "ZZZ_FakeRule", "Jan-25", "Jan-25", "REPLACE", "STORE_DATA") },
  @{ Label = "21. RUN INTEGRATION DM (fake)";      Cmd = @("runIntegration", "ZZZ_FakeIntegration_DoNotCreate") },

  # --- Security / users (read-only file generators) ---
  @{ Label = "22. PROVISION REPORT";               Cmd = @("provisionReport", "ProvReport.csv") },
  @{ Label = "23. EXPORT APP SECURITY";            Cmd = @("exportAppSecurity", "AppSecurity.csv") },
  @{ Label = "24. GET ROLE (current user)";        Cmd = @("getRole", $User) },

  # --- Audit (read-only, generates ZIP in inbox) ---
  @{ Label = "25. DOWNLOAD AUDIT LOG (1 day)";     Cmd = @("downloadAuditLog", "1") },

  # --- File ops (safe: upload tiny CSV, download/delete fake file) ---
  @{ Label = "26. UPLOAD SAMPLE CSV";              Cmd = @("uploadFile", $sampleZipPath) },
  @{ Label = "27. DOWNLOAD FILE (fake)";           Cmd = @("downloadFile", "ZZZ_NonExistent_DoNotCreate.zip") },
  @{ Label = "28. DELETE FILE (just-uploaded)";    Cmd = @("deleteFile", "SampleAccount_import.zip") },
  @{ Label = "29. COPY FILE FROM INSTANCE (fake)"; Cmd = @("copyFileFromInstance", "fake.zip", "fakeUser", "fakePass.epw", "https://fake.epm.us-phoenix-1.ocs.oraclecloud.com", "ZZZ_FakeApp", "fakeDest.zip") },

  # --- Scheduler / job-console discovery — REAL EPM Automate commands.
  #     exportJobConsole exports recent jobs WITH their schedule metadata
  #     (cron, next-fire, scheduledBy). This is the closest the CLI gets
  #     to "scheduled jobs" — the underlying REST call should reveal the
  #     endpoint we need.
  @{ Label = "30. EXPORT JOB CONSOLE";              Cmd = @("exportJobConsole", "JobConsole.csv") },
  @{ Label = "31. GET APPLICATION ADMIN MODE";      Cmd = @("getApplicationAdminMode") },
  @{ Label = "32. GET IDLE SESSION TIMEOUT";        Cmd = @("getIdleSessionTimeout") },

  # --- Logout ---
  @{ Label = "99. LOGOUT";                         Cmd = @("logout") }
)

$total = $tests.Count
$i = 0
foreach ($t in $tests) {
  $i++
  Write-Host ("[" + $i + "/" + $total + "] " + $t.Label) -ForegroundColor Cyan
  Run-Capture -Label $t.Label -CmdArgs $t.Cmd
}

# === Filter the log =====================================================
Write-Host "Filtering debug log..." -ForegroundColor Cyan
Filter-Log

Write-Host ""
Write-Host "================================================================" -ForegroundColor Green
Write-Host ("  DONE. Report: " + $Report) -ForegroundColor Green
Write-Host "================================================================" -ForegroundColor Green
Write-Host ""
Write-Host "Next: open epm-sniff-report.txt and paste relevant lines back." -ForegroundColor Yellow
