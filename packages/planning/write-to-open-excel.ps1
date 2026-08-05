<#
  write-to-open-excel.ps1 — write a CSV into a workbook the user already has OPEN in Excel.

    powershell -File write-to-open-excel.ps1 -Csv <file.csv> -Workbook "pra demo" `
               -Sheet Sheet1 -Anchor A1 -Title "PRA - Income Statement FY26"

  Attaches to the RUNNING Excel instance instead of starting a new one, so the user watches
  the grid fill in. Nothing is saved — the workbook is left dirty on purpose.

  TWO THINGS THIS GETS RIGHT, both learned the hard way:

  1. It writes the whole block as ONE 2-D array assignment. Setting cells one at a time is a
     separate cross-process COM call per cell — a 12x9 table is 108 round trips and visibly
     crawls. One assignment is a single call and lands instantly.
  2. Every Range is addressed by STRING ("A1:H12"), never Range($cell1, $cell2). The two-object
     overload is ambiguous through the PowerShell COM binder and throws
     "Unable to cast object of type 'System.Double' to type 'System.String'".
#>
param(
  [Parameter(Mandatory = $true)][string]$Csv,
  [Parameter(Mandatory = $true)][string]$Workbook,
  [string]$Sheet = "",
  [string]$Anchor = "A1",
  [string]$Title = "",
  [string]$Subtitle = "",
  [string]$BoldLines = "Gross Profit,Total Operating Expenses,Operating Income,Net Income",
  [switch]$Clear
)

$ErrorActionPreference = "Stop"
if (-not (Test-Path $Csv)) { throw "CSV not found: $Csv" }

function ColName([int]$n) {
  $s = ""
  # the [string] cast matters: [char] + [string] has no op_Addition and blows up
  while ($n -gt 0) { $m = ($n - 1) % 26; $s = [string][char](65 + $m) + $s; $n = [int](($n - $m) / 26) }
  return $s
}

try { $xl = [Runtime.InteropServices.Marshal]::GetActiveObject("Excel.Application") }
catch { throw "Excel is not running, or it is elevated while this process is not." }

$wb = $null
foreach ($w in $xl.Workbooks) { if ($w.Name -like "*$Workbook*") { $wb = $w; break } }
if ($null -eq $wb) {
  throw "No open workbook matching '$Workbook'. Open: " + (($xl.Workbooks | ForEach-Object { $_.Name }) -join ", ")
}
if ([string]::IsNullOrWhiteSpace($Sheet)) {
  $ws = $wb.ActiveSheet
} else {
  # Reuse the tab if it exists, otherwise append a new one at the end. This is what lets a
  # driver build a whole workbook — one tab per statement — without the user touching Excel.
  $ws = $null
  foreach ($s in $wb.Worksheets) { if ($s.Name -eq $Sheet) { $ws = $s; break } }
  if ($null -eq $ws) {
    $ws = $wb.Worksheets.Add([System.Reflection.Missing]::Value, $wb.Worksheets.Item($wb.Worksheets.Count))
    $ws.Name = $Sheet
  } elseif ($Clear) {
    $ws.Cells.Clear() | Out-Null
  }
}
$ws.Activate() | Out-Null

$rows = @(Import-Csv $Csv)
$cols = @($rows[0].PSObject.Properties.Name)
$nCol = $cols.Count

$anchorCell = $ws.Range($Anchor)
$r0 = [int]$anchorCell.Row
$c0 = [int]$anchorCell.Column
$colFirst = ColName $c0
$colLast = ColName ($c0 + $nCol - 1)

# Repainting and recalc during a bulk write are what make Excel feel slow. Off for the write.
$prevUpdate = $xl.ScreenUpdating
$prevCalc = $xl.Calculation
$xl.ScreenUpdating = $false
try { $xl.Calculation = -4135 } catch { }   # xlCalculationManual

try {
  $row = $r0

  if ($Title -ne "") {
    $ws.Range("$colFirst$row").Value2 = $Title
    $t = $ws.Range("$colFirst$row`:$colLast$row")
    $t.Merge(); $t.Font.Bold = $true; $t.Font.Size = 14
    $row++
  }
  if ($Subtitle -ne "") {
    $ws.Range("$colFirst$row").Value2 = $Subtitle
    $s = $ws.Range("$colFirst$row`:$colLast$row")
    $s.Merge(); $s.Font.Italic = $true; $s.Font.Size = 9; $s.Font.Color = 8421504
    $row += 2
  }

  # ---- one array, one assignment: header + every data row together
  $nRow = $rows.Count + 1
  $grid = New-Object 'object[,]' $nRow, $nCol
  for ($c = 0; $c -lt $nCol; $c++) { $grid[0, $c] = $cols[$c] }
  for ($r = 0; $r -lt $rows.Count; $r++) {
    for ($c = 0; $c -lt $nCol; $c++) {
      $val = $rows[$r].$($cols[$c])
      $num = 0.0
      # NOTE the parentheses: in $grid[$r + 1, $c] PowerShell binds the comma first, so it
      # evaluates $r + (1, $c) — adding an array to an int — and throws "op_Addition".
      if ($c -gt 0 -and [double]::TryParse([string]$val, [ref]$num)) { $grid[($r + 1), $c] = $num }
      else { $grid[($r + 1), $c] = [string]$val }
    }
  }

  $headerRow = $row
  $lastRow = $row + $nRow - 1
  $block = "$colFirst$headerRow`:$colLast$lastRow"
  $ws.Range($block).Value2 = $grid

  # ---- formatting, all range-level (cheap) rather than per cell
  $hdrRange = "$colFirst$headerRow`:$colLast$headerRow"
  $hdr = $ws.Range($hdrRange)
  $hdr.Font.Bold = $true
  $hdr.Interior.Color = 15917529
  $hdr.HorizontalAlignment = -4152
  $hdr.Borders.Item(9).LineStyle = 1
  $ws.Range("$colFirst$headerRow").HorizontalAlignment = -4131

  $colSecond = ColName ($c0 + 1)
  $ws.Range("$colSecond$($headerRow + 1)`:$colLast$lastRow").NumberFormat = '#,##0;[Red](#,##0)'

  $bold = $BoldLines -split ',' | ForEach-Object { $_.Trim() }
  for ($r = 0; $r -lt $rows.Count; $r++) {
    if ($bold -contains [string]$rows[$r].$($cols[0])) {
      $rr = $headerRow + 1 + $r
      $line = $ws.Range("$colFirst$rr`:$colLast$rr")
      $line.Font.Bold = $true
      $line.Borders.Item(8).LineStyle = 1
    }
  }

  $ws.Range("$colLast$headerRow`:$colLast$lastRow").Font.Bold = $true
  $ws.Range($block).EntireColumn.AutoFit() | Out-Null
  $ws.Range("$colFirst$headerRow").EntireColumn.ColumnWidth = 30
}
finally {
  $xl.ScreenUpdating = $prevUpdate
  try { $xl.Calculation = $prevCalc } catch { }
}

Write-Output "Wrote $($rows.Count) lines x $nCol columns into [$($wb.Name)]$($ws.Name) at $Anchor. Not saved."
