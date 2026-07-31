'use strict';
// Multi-cube level-0 parser for the Current State Assessment.
// For each cube's column export (data1.txt inside the zip) it maps the sparse
// block-header tokens to that cube's dimensions BY OUTLINE ORDER (taken from
// activity-report.json → dimensionsByCube), then counts blocks/cells by
// scenario, year, scenario×year, version and currency.
//
// Usage: unzip -p clients/<c>/level0/<Cube>.zip data1.txt | \
//          node tools/parse-level0-multi.js <CLIENT> <Cube>
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const ROOT = path.join(__dirname, '..');
const CLIENT = process.argv[2] || 'talogy';
const CUBE = process.argv[3];
const dir = path.join(ROOT, 'clients', CLIENT);
const AR = JSON.parse(fs.readFileSync(path.join(dir, 'activity-report.json'), 'utf8'));

const cubeMeta = AR.cubes.find(c => c.name === CUBE);
const isBSO = cubeMeta && cubeMeta.type === 'BSO';
// sparse dims in outline order (the block-header token order in a BSO column export)
const sparseDims = isBSO && AR.dimensionsByCube && AR.dimensionsByCube[CUBE]
  ? AR.dimensionsByCube[CUBE].filter(d => d.storage === 'Sparse').map(d => d.name)
  : null;
const idx = name => sparseDims ? sparseDims.indexOf(name) : -1;
const iYear = idx('Years'), iScn = idx('Scenario'), iVer = idx('Version'), iCur = idx('Currency');

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
let lineNo = 0, colHeader = null;
let blocks = 0, dataRows = 0, dataCells = 0, zeroCells = 0, missingCells = 0;
const byScn = {}, byYear = {}, byVer = {}, byCur = {}, bySY = {};
const bump = (o, k) => { if (k != null && k !== '') o[k] = (o[k] || 0) + 1; };
function quoted(line) { const o = []; const re = /"([^"]*)"/g; let m; while ((m = re.exec(line)) !== null) o.push(m[1]); return o; }

rl.on('line', (raw) => {
  lineNo++;
  const line = raw.replace(/^﻿/, '').trim();
  if (!line) return;
  const q = quoted(line);
  if (!colHeader) { colHeader = q; return; }

  if (isBSO) {
    // block header = many quoted tokens (sparse combo, outline order); data row = 1 token + values
    if (q.length >= (sparseDims ? sparseDims.length - 1 : 3)) {
      blocks++;
      const yr = iYear >= 0 ? q[iYear] : null, scn = iScn >= 0 ? q[iScn] : null;
      bump(byYear, yr); bump(byScn, scn); bump(byVer, iVer >= 0 ? q[iVer] : null); bump(byCur, iCur >= 0 ? q[iCur] : null);
      if (scn && yr) bump(bySY, `${scn}||${yr}`);
    } else if (q.length === 1) {
      dataRows++;
      const after = line.slice(line.indexOf('"' + q[0] + '"') + q[0].length + 2);
      for (const t of after.trim().split(/\s+/)) { if (!t) continue; if (t === '#Mi' || t === '#Missing') missingCells++; else if (/^-?\d/.test(t)) { dataCells++; if (parseFloat(t) === 0) zeroCells++; } }
    }
  } else {
    // ASO export: each data line carries the full dim combo inline — detect by content
    if (q.length < 3) return;
    dataRows++;
    let yr = null, scn = null;
    for (const t of q) {
      if (/^FY\d\d$/.test(t) || t === 'No Year') yr = t;
      else if (/^OEP_(Actual|Forecast|Plan|Budget)$/i.test(t) || /forecast|budget|actual|plan|stretch|midyear/i.test(t)) { if (!scn) scn = t; }
    }
    bump(byYear, yr); bump(byScn, scn);
    if (scn && yr) bump(bySY, `${scn}||${yr}`);
    for (const t of line.split(/\s+/)) { if (/^-?\d/.test(t)) { dataCells++; if (parseFloat(t) === 0) zeroCells++; } }
  }
  if (lineNo % 4000000 === 0) process.stderr.write(`  …${(lineNo / 1e6).toFixed(0)}M lines, ${blocks.toLocaleString()} blocks\n`);
});

rl.on('close', () => {
  const sort = o => Object.fromEntries(Object.entries(o).sort((a, b) => b[1] - a[1]));
  const summary = {
    cube: CUBE, type: cubeMeta ? cubeMeta.type : '?', generatedFromLines: lineNo,
    sparseDimOrder: sparseDims,
    totals: { blocks, dataRows, dataCells, zeroCells, missingCells,
      densityPct: dataCells + missingCells ? +(100 * dataCells / (dataCells + missingCells)).toFixed(2) : null },
    blocksByScenario: sort(byScn), blocksByYear: sort(byYear),
    blocksByVersion: sort(byVer), blocksByCurrency: sort(byCur),
    blocksByScenarioYear: bySY,
  };
  const outDir = path.join(dir, 'level0');
  fs.writeFileSync(path.join(outDir, `${CUBE}-summary.json`), JSON.stringify(summary, null, 1));
  const n = x => x.toLocaleString('en-US');
  console.log(`\n═══ ${CUBE} (${summary.type}) — ${n(blocks || dataRows)} ${isBSO ? 'blocks' : 'cells'} ═══`);
  console.log('By YEAR:', Object.entries(summary.blocksByYear).map(([k, v]) => `${k}:${n(v)}`).join('  '));
  console.log('By SCENARIO:', Object.entries(summary.blocksByScenario).map(([k, v]) => `${k}:${n(v)}`).join('  '));
  if (Object.keys(byCur).length) console.log('Currencies w/ data:', Object.keys(byCur).length, '→', Object.keys(summary.blocksByCurrency).slice(0, 12).join(', '));
  console.log(`✓ wrote clients/${CLIENT}/level0/${CUBE}-summary.json`);
});
