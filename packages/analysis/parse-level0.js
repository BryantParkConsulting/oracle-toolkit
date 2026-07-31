'use strict';
// Stream-parse an Essbase level-0 COLUMN export (data1.txt) and compute REAL
// cube stats without loading the 453MB file into memory.
//
// Format (column export):
//   line 1            : dense column header — Period members ("BegBalance" "TP1"… "Period")
//   block-header line : the SPARSE member combo of one existing block
//                       (…"Version" "Scenario" "Currency" "Years"  ← last 4, by convention)
//   data line         : "<Account>" <val|#Mi> <val…>   (the block's Account × Period values)
//
// Usage:  unzip -p level0.zip data1.txt | node tools/parse-level0.js [out.json]
const fs = require('fs');
const readline = require('readline');

const OUT = process.argv[2] || 'clients/squarespace/level0-summary.json';
const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });

let lineNo = 0;
let colHeader = null;          // the Period member columns
let blocks = 0, dataRows = 0, dataCells = 0, missingCells = 0, zeroCells = 0;
const byVersion = {}, byScenario = {}, byYears = {}, bySVY = {}, bySY = {};
const sparseDimCounts = {};    // how many quoted tokens per block header (sanity)
const accounts = new Set();
const bump = (o, k) => { if (k != null) o[k] = (o[k] || 0) + 1; };

// quoted-token splitter: pulls every "…" token out of a line
function quoted(line) {
  const out = []; const re = /"([^"]*)"/g; let m;
  while ((m = re.exec(line)) !== null) out.push(m[1]);
  return out;
}

rl.on('line', (raw) => {
  lineNo++;
  const line = raw.replace(/^﻿/, '').trim();
  if (!line) return;
  const q = quoted(line);

  // Column header: first non-empty line, contains the dense Period members.
  if (!colHeader) { colHeader = q; return; }

  // Block header = many quoted tokens (the sparse combo). Data row = exactly
  // ONE quoted token (the account) followed by numbers/#Mi.
  if (q.length >= 3) {
    blocks++;
    bump(sparseDimCounts, q.length);
    // Convention: the LAST four sparse members are Version, Scenario, Currency, Years.
    const years = q[q.length - 1], scenario = q[q.length - 3], version = q[q.length - 4];
    bump(byVersion, version); bump(byScenario, scenario); bump(byYears, years);
    bump(bySVY, `${scenario} | ${version} | ${years}`);
    bump(bySY, `${scenario}||${years}`);
  } else if (q.length === 1) {
    dataRows++;
    accounts.add(q[0]);
    // count value cells vs #Missing on this data row
    const after = line.slice(line.indexOf('"' + q[0] + '"') + q[0].length + 2);
    const toks = after.trim().split(/\s+/).filter(Boolean);
    for (const t of toks) { if (t === '#Mi' || t === '#Missing') missingCells++; else if (/^-?\d/.test(t)) { dataCells++; if (parseFloat(t) === 0) zeroCells++; } }
  }
  if (lineNo % 2000000 === 0) process.stderr.write(`  …${(lineNo / 1e6).toFixed(0)}M lines, ${blocks.toLocaleString()} blocks\n`);
});

rl.on('close', () => {
  const top = (o, n = Infinity) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n)
    .reduce((m, [k, v]) => (m[k] = v, m), {});
  const summary = {
    generatedFromLines: lineNo,
    denseColumns: colHeader,                    // dense dim #1 = these column members (e.g. Period)
    denseRowSample: [...accounts].slice(0, 25), // dense dim #2 = the row members (e.g. Account)
    sparseDimCount: Math.max(...Object.keys(sparseDimCounts).map(Number).concat([0])),
    totals: {
      blocks, dataRows, dataCells, missingCells, zeroCells,
      densityPct: dataCells + missingCells ? +(100 * dataCells / (dataCells + missingCells)).toFixed(2) : null,
      distinctAccountsWithData: accounts.size,
    },
    sparseDimTokenCounts: sparseDimCounts,
    blocksByVersion: top(byVersion),
    blocksByScenario: top(byScenario),
    blocksByYears: top(byYears),
    blocksByScenarioVersionYear: top(bySVY, 60),
    blocksByScenarioYear: bySY,   // full scenario×year matrix (for cleanup analysis)
  };
  fs.writeFileSync(OUT, JSON.stringify(summary, null, 1));
  // human report
  const n = x => x.toLocaleString('en-US');
  console.log(`\n═══ Level-0 cube stats (Squarespace) ═══`);
  console.log(`Existing blocks: ${n(blocks)}   ·   data rows: ${n(dataRows)}   ·   accounts w/ data: ${n(accounts.size)}`);
  console.log(`Cells: ${n(dataCells)} with data, ${n(missingCells)} #Missing  →  density ${summary.totals.densityPct}%`);
  console.log(`\nBlocks by YEAR:`);
  for (const [k, v] of Object.entries(summary.blocksByYears)) console.log(`  ${k.padEnd(10)} ${n(v)}`);
  console.log(`\nBlocks by SCENARIO (top):`);
  for (const [k, v] of Object.entries(summary.blocksByScenario)) console.log(`  ${String(k).padEnd(24)} ${n(v)}`);
  console.log(`\nBlocks by VERSION:`);
  for (const [k, v] of Object.entries(summary.blocksByVersion)) console.log(`  ${String(k).padEnd(16)} ${n(v)}`);
  console.log(`\n✓ wrote ${OUT}`);
});
