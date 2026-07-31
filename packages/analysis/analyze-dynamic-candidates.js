'use strict';
// Refined dynamic-calc candidate analysis using the LCM's PARENT-CHILD data.
// For every STORED upper-level member in the Plan cube's sparse dimensions,
// count its direct children and tier the conversion risk:
//   SAFE     ≤3 children, no formula — query-time cost is negligible
//   MODERATE 4–10 children — fine in Hybrid, verify hot reports
//   REVIEW   >10 children or has formula — wide aggregation, test first
// Output: clients/<c>/dynamic-candidates.json + dynamic-calc-candidates.csv
//   node tools/analyze-dynamic-candidates.js [CLIENT] [LCM_DIM_DIR]
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const CLIENT = process.argv[2] || 'squarespace';
const DIMDIR = process.argv[3] || path.join(ROOT, 'lcm-export', 'Squarespace',
  'HP-NetSuite', 'resource', 'Global Artifacts', 'Common Dimensions', 'Standard Dimensions');

// Plan cube sparse dims we analyze (Account/Period are dense — excluded by design).
const SPARSE = ['Department', 'Location', 'Tracker', 'Subsidiary', 'Class', 'Item', 'Relationship'];

// minimal CSV splitter that honors quotes
function splitCsv(line) {
  const out = []; let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQ = !inQ; cur += ch; }
    else if (ch === ',' && !inQ) { out.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out.map(s => s.replace(/^"|"$/g, ''));
}

// some dims are exported per-cube instead of in Common Dimensions
const ALT_DIRS = [path.join(ROOT, 'lcm-export', 'Squarespace', 'HP-NetSuite', 'resource', 'Cube', 'Plan', 'Standard Dimensions')];

function analyzeDim(dim) {
  let file = path.join(DIMDIR, dim + '.csv');
  if (!fs.existsSync(file)) file = ALT_DIRS.map(d => path.join(d, dim + '.csv')).find(f => fs.existsSync(f));
  if (!file || !fs.existsSync(file)) return null;
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  // find the member-table header: "<Dim>, Parent, Alias..."
  const hIdx = lines.findIndex(l => l.startsWith(dim + ', Parent,') || l.startsWith(dim + ',Parent,'));
  if (hIdx < 0) return null;
  const header = splitCsv(lines[hIdx]);
  const col = (name) => header.findIndex(h => h === name);
  const cMember = 0, cParent = col('Parent');
  const cStorage = col('Data Storage');
  const cStoragePlan = col('Data Storage (Plan)');
  const cFormula = col('Formula');

  const members = new Map();          // name -> {parent, storage, hasFormula}
  const children = new Map();         // parent -> count
  for (let i = hIdx + 1; i < lines.length; i++) {
    const l = lines[i];
    if (!l || l.startsWith('#')) continue;
    const f = splitCsv(l);
    if (f.length < 5 || !f[cMember]) continue;
    const name = f[cMember], parent = f[cParent] || '';
    const storage = ((cStoragePlan >= 0 && f[cStoragePlan]) || f[cStorage] || '').toLowerCase();
    const hasFormula = !!(cFormula >= 0 && f[cFormula] && f[cFormula] !== '<none>');
    if (!members.has(name)) members.set(name, { parent, storage, hasFormula });
    if (parent) children.set(parent, (children.get(parent) || 0) + 1);
  }

  const tiers = { SAFE: [], MODERATE: [], REVIEW: [] };
  for (const [name, m] of members) {
    const kids = children.get(name) || 0;
    if (kids === 0) continue;                                   // level-0 — never convert
    if (m.storage !== 'store' && m.storage !== 'never share') continue; // already dynamic/label/shared
    const entry = { name, children: kids, storage: m.storage, formula: m.hasFormula };
    if (m.hasFormula || kids > 10) tiers.REVIEW.push(entry);
    else if (kids > 3) tiers.MODERATE.push(entry);
    else tiers.SAFE.push(entry);
  }
  for (const t of Object.values(tiers)) t.sort((a, b) => a.children - b.children);
  return { dim, totalStoredParents: tiers.SAFE.length + tiers.MODERATE.length + tiers.REVIEW.length, tiers };
}

const results = SPARSE.map(analyzeDim).filter(Boolean);
const n = x => x.toLocaleString('en-US');

console.log('═══ Dynamic-calc candidates by conversion risk (Plan sparse dims) ═══\n');
let tot = { SAFE: 0, MODERATE: 0, REVIEW: 0 };
for (const r of results) {
  const s = r.tiers.SAFE.length, m = r.tiers.MODERATE.length, v = r.tiers.REVIEW.length;
  tot.SAFE += s; tot.MODERATE += m; tot.REVIEW += v;
  console.log(`${r.dim.padEnd(14)} stored parents: ${String(r.totalStoredParents).padStart(4)}  →  SAFE(≤3 kids): ${String(s).padStart(4)} · MODERATE(4-10): ${String(m).padStart(3)} · REVIEW(>10 or formula): ${String(v).padStart(3)}`);
  const ex = r.tiers.SAFE.slice(0, 4).map(e => `${e.name}(${e.children})`).join(', ');
  if (ex) console.log(`               e.g. SAFE: ${ex}`);
}
console.log(`\nTOTAL          SAFE: ${n(tot.SAFE)} · MODERATE: ${n(tot.MODERATE)} · REVIEW: ${n(tot.REVIEW)}`);

// persist
const outDir = path.join(ROOT, 'clients', CLIENT);
fs.writeFileSync(path.join(outDir, 'dynamic-candidates.json'), JSON.stringify({ results, totals: tot }, null, 1));
const rows = ['dimension,member,direct_children,storage,has_formula,tier'];
for (const r of results) for (const [tier, list] of Object.entries(r.tiers))
  for (const e of list) rows.push([r.dim, JSON.stringify(e.name), e.children, e.storage, e.formula, tier].join(','));
fs.writeFileSync(path.join(outDir, 'dynamic-calc-candidates.csv'), rows.join('\n'));
console.log(`\n✓ wrote clients/${CLIENT}/dynamic-candidates.json + dynamic-calc-candidates.csv (${rows.length - 1} members)`);
