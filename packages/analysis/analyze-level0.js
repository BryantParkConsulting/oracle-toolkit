'use strict';
// Turn the level-0 block distribution into a "where is the data + what to
// delete" report: % of blocks by version / year / scenario, cumulative
// (Pareto), and deletion candidates (stale/one-off scenarios, old years).
//   node tools/analyze-level0.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const CLIENT = process.env.CLIENT || 'squarespace';
const CDIR = path.join(ROOT, 'clients', CLIENT);
const sum = JSON.parse(fs.readFileSync(path.join(CDIR, 'level0-summary.json'), 'utf8'));
const TOTAL = sum.totals.blocks;
const n = x => x.toLocaleString('en-US');
const pct = x => (100 * x / TOTAL).toFixed(1) + '%';

// A scenario is a DELETE CANDIDATE (stale / one-off) if its name looks like a
// dated copy, test, downside, transfer, LRP draft, or clear/temp artifact.
// keep in sync with tools/optimization-report.js STALE
const STALE = /copy|test|downside|transfer|lrp|clearscenari|_\d+_\d+|\bv\d+\b|backup|old|tmp|draft|no scenario|^forecast_\d/i;
// Years older than the active forecast window are archive candidates.
const ARCHIVE_YEAR = /^FY2[0-3]$|no year/i;

function table(title, obj, opts = {}) {
  console.log(`\n${title}`);
  const rows = Object.entries(obj).sort((a, b) => b[1] - a[1]);
  let cum = 0;
  for (const [k, v] of rows) {
    cum += v;
    const flag = opts.flag ? opts.flag(k, v) : '';
    console.log(`  ${String(k).padEnd(34)} ${n(v).padStart(9)}  ${pct(v).padStart(6)}  cum ${pct(cum).padStart(6)}  ${flag}`);
  }
  return rows;
}

console.log(`═══ Where is the data — ${n(TOTAL)} blocks (density ${sum.totals.densityPct}%) ═══`);

table('BY VERSION', sum.blocksByVersion);
table('BY YEAR (▼ = archive candidate)', sum.blocksByYears, { flag: (k) => ARCHIVE_YEAR.test(k) ? '▼ archive' : '' });
const scnRows = table('BY SCENARIO (✗ = delete candidate)', sum.blocksByScenario, { flag: (k) => STALE.test(k) ? '✗ delete?' : '' });

// Deletion plan: sum the candidates.
const staleScn = scnRows.filter(([k]) => STALE.test(k));
const staleBlocks = staleScn.reduce((s, [, v]) => s + v, 0);
const archiveYears = Object.entries(sum.blocksByYears).filter(([k]) => ARCHIVE_YEAR.test(k));
const archiveBlocks = archiveYears.reduce((s, [, v]) => s + v, 0);

console.log(`\n═══ Deletion / archive plan ═══`);
console.log(`Stale/one-off SCENARIOS: ${staleScn.length} scenarios = ${n(staleBlocks)} blocks (${pct(staleBlocks)} of the cube)`);
console.log(`  → ${staleScn.slice(0, 20).map(([k]) => k).join(', ')}${staleScn.length > 20 ? ' …' : ''}`);
console.log(`Old YEARS (FY20-FY23 + No Year): ${n(archiveBlocks)} blocks (${pct(archiveBlocks)})`);
const combined = staleBlocks + archiveBlocks; // rough (some overlap negligible)
console.log(`\nClearing both ≈ ${n(combined)} blocks  →  ~${pct(combined)} smaller cube.`);

// Persist a compact deletion summary for the chat / KB.
const out = {
  total: TOTAL, densityPct: sum.totals.densityPct,
  staleScenarios: staleScn.map(([k, v]) => ({ scenario: k, blocks: v, pct: +(100 * v / TOTAL).toFixed(2) })),
  staleScenarioBlocks: staleBlocks, staleScenarioPct: +(100 * staleBlocks / TOTAL).toFixed(1),
  archiveYears: archiveYears.map(([k, v]) => ({ year: k, blocks: v, pct: +(100 * v / TOTAL).toFixed(2) })),
  archiveYearBlocks: archiveBlocks, archiveYearPct: +(100 * archiveBlocks / TOTAL).toFixed(1),
  potentialReductionPct: +(100 * combined / TOTAL).toFixed(1),
};
fs.writeFileSync(path.join(CDIR, 'level0-cleanup.json'), JSON.stringify(out, null, 1));
console.log(`\n✓ wrote clients/squarespace/level0-cleanup.json`);
