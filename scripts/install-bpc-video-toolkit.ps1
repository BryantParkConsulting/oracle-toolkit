[CmdletBinding()]
param(
  [switch]$SkipPrerequisites,
  [switch]$SkipSkillInstall
)

$ErrorActionPreference = "Stop"
$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$toolkitScript = Join-Path $repoRoot "packages\customer-assessment-video\video-toolkit.ps1"

if (-not (Test-Path -LiteralPath $toolkitScript)) {
  throw "BPC Video Toolkit was not found at $toolkitScript."
}

$toolkitArguments = @("install")
if (-not $SkipPrerequisites) { $toolkitArguments += "-InstallPrerequisites" }
if ($SkipSkillInstall) { $toolkitArguments += "-SkipSkillInstall" }

& $toolkitScript @toolkitArguments
exit $LASTEXITCODE
