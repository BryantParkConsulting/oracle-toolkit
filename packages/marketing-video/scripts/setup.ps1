# One-time setup for the marketing mode. Run from anywhere:
#   powershell -ExecutionPolicy Bypass -File packages\marketing-video\scripts\setup.ps1 [-NsPdf <path>] [-PbPdf <path>]
# Pulls what is not in git: npm deps, video-shotcraft SFX + music (Apache-2.0 / Mixkit), Kokoro voice models,
# and (optionally) the assessment PDF pages. Then regenerates every voiceover.
param([string]$NsPdf, [string]$PbPdf)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

npm install --no-audit --no-fund
python -m pip install -q -r requirements.txt

# video-shotcraft (Vincent Wei, Apache-2.0): SFX library + background music
$shot = Join-Path $root '.cache\video-shotcraft'
if (-not (Test-Path $shot)) { git clone --depth 1 https://github.com/Vincentwei1021/video-shotcraft.git $shot }
New-Item -ItemType Directory -Force public\sfx, public\audio, models | Out-Null
$sfx = 'air-woosh-quick','bass-hit-short','camera-lens-shutter','clock-tick-single','data-scan','hit-weak','impact-cine-big',
  'impact-zoom-quick','marker-pen-line','paper-slide','pop','riser-cine','shimmer-sparkle-sweep','sparkle','sweep-short',
  'switch-tap','swoosh-slow','warp-slide','whoosh-fast'
foreach ($s in $sfx) {
  $f = Get-ChildItem "$shot\assets\audio\sfx" -Recurse -Filter "$s.mp3" | Select-Object -First 1
  if (-not $f) { throw "SFX not found in video-shotcraft: $s" }
  Copy-Item $f.FullName public\sfx\ -Force
}
Copy-Item "$shot\assets\audio\bgm\*" public\audio\ -Force

# Kokoro v1.0 voice models (~340 MB)
$rel = 'https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0'
foreach ($m in 'kokoro-v1.0.onnx', 'voices-v1.0.bin') {
  if (-not (Test-Path "models\$m")) { Invoke-WebRequest "$rel/$m" -OutFile "models\$m" }
}

if ($NsPdf -and $PbPdf) { python -X utf8 scripts\pdf-pages.py $NsPdf $PbPdf }

# Voiceovers (wav per scene + src/timing*.json)
$env:PYTHONIOENCODING = 'utf-8'
python -X utf8 vo\tts.py script.json '' timing.json
python -X utf8 vo\tts.py workforce.json wf timing-wf.json
python -X utf8 vo\tts.py revenue.json rv timing-rv.json
python -X utf8 vo\tts.py cash.json cf timing-cf.json
if (Test-Path vo\ms.json) { python -X utf8 vo\tts.py ms.json ms timing-ms.json; python -X utf8 vo\ms_music.py }
Write-Host 'Ready: npm run studio  |  npx remotion render src/index.ts <Composition> out/<name>.mp4 --concurrency=2 --crf=18'
