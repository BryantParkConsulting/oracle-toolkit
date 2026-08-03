# Minimal sniff: just login + exportJobConsole + logout to capture the
# REST endpoint that EPM Automate uses to read scheduled-job metadata.
# Uses the same env / encrypt pattern as sniff-epmautomate.ps1.

$ErrorActionPreference = "Continue"

$EpmPath  = "C:\Program Files\Oracle\EPM Automate\bin\epmautomate.bat"
$Url      = "https://epm12119-demoepm2119.epm.us-phoenix-1.ocs.oraclecloud.com"
$User     = "demoadmin"
$Password = "C:\ProgramData\Oracle\EPM Automate\creds.epw"
$Report   = ".\schedule-sniff-report.txt"
$logDir   = "C:\ProgramData\Oracle\EPM Automate"

"" | Out-File $Report -Encoding utf8

# Force HTTP wire trace + DEBUG log level
$env:EPM_AUTOMATE_LOG_LEVEL = "DEBUG"
$env:EPM_AUTOMATE_DEBUG = "true"
$env:JAVA_TOOL_OPTIONS = "-Dorg.apache.commons.logging.Log=org.apache.commons.logging.impl.SimpleLog -Dorg.apache.commons.logging.simplelog.showdatetime=true -Dorg.apache.commons.logging.simplelog.log.org.apache.http=DEBUG -Dorg.apache.commons.logging.simplelog.log.org.apache.http.wire=DEBUG -Dorg.apache.commons.logging.simplelog.log.org.apache.http.headers=DEBUG"

# Clean log dir
if (Test-Path $logDir) {
  Get-ChildItem -Path $logDir -Filter "*.log" | Remove-Item -Force -ErrorAction SilentlyContinue
}

function Run-Cmd {
  param([string]$Label, [string[]]$CmdArgs)
  Add-Content $Report "`n========================================================================"
  Add-Content $Report ("  " + $Label)
  Add-Content $Report   "========================================================================"
  Add-Content $Report ("Command: epmautomate " + ($CmdArgs -join ' '))
  $output = & $EpmPath @CmdArgs 2>&1 | Out-String
  Add-Content $Report ("Exit: " + $LASTEXITCODE)
  Add-Content $Report "--- stdout ---"
  Add-Content $Report $output
}

Write-Host "[1/3] Login..." -ForegroundColor Cyan
Run-Cmd -Label "1. LOGIN" -CmdArgs @("login", $User, $Password, $Url)

Write-Host "[2/3] exportJobConsole..." -ForegroundColor Cyan
Run-Cmd -Label "2. EXPORT JOB CONSOLE" -CmdArgs @("exportJobConsole", "JobConsole.csv")

Write-Host "[3/3] Logout..." -ForegroundColor Cyan
Run-Cmd -Label "3. LOGOUT" -CmdArgs @("logout")

# Append all log files
Add-Content $Report "`n========================================================================"
Add-Content $Report "  ALL LOG FILES (entire content)"
Add-Content $Report   "========================================================================"
$logs = Get-ChildItem -Path $logDir -Filter "*.log" | Sort-Object LastWriteTime
foreach ($f in $logs) {
  Add-Content $Report "`n------- FILE: $($f.Name) -------"
  $content = Get-Content $f.FullName
  foreach ($line in $content) { Add-Content $Report $line }
}

Write-Host "DONE. Report: $Report" -ForegroundColor Green
