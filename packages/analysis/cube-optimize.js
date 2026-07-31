'use strict';
// ── REUSABLE CUBE-OPTIMIZATION TEMPLATE ──────────────────────────────
// One command to turn a client's level-0 export + tenant-kb.json into the
// full optimization analysis (block stats → distribution → cleanup plan →
// client report). Re-run for any client: drop their level0.zip and KB, then:
//
//   node tools/cube-optimize.js <CLIENT> [path/to/level0.zip]
//
// Pipeline (each step also runnable on its own):
//   1. parse-level0.js       zip → level0-summary.json   (real block counts)
//   2. analyze-level0.js     → level0-cleanup.json       (% + deletion plan)
//   3. merge into tenant-kb.json (kb.level0)             (so the chat shows it)
//   4. optimization-report.js → optimization-report.md  (client deliverable)
//
// Prereqs: clients/<CLIENT>/tenant-kb.json must exist (from parse-lcm.js).
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const NODE = process.execPath;

const CLIENT = process.argv[2];
if (!CLIENT) { console.error('usage: node tools/cube-optimize.js <CLIENT> [level0.zip]'); process.exit(1); }
const dir = path.join(ROOT, 'clients', CLIENT);
const kbPath = path.join(dir, 'tenant-kb.json');
if (!fs.existsSync(kbPath)) { console.error(`✗ ${kbPath} not found — run parse-lcm.js for ${CLIENT} first.`); process.exit(1); }

// locate the export zip: explicit arg, else clients/<c>/level0.zip, else Downloads/level0.zip
const candidates = [process.argv[3], path.join(dir, 'level0.zip'), path.join(process.env.USERPROFILE || process.env.HOME || '', 'Downloads', 'level0.zip')].filter(Boolean);
const zip = candidates.find(p => p && fs.existsSync(p));
if (!zip) { console.error('✗ level0 export not found. Pass the path: node tools/cube-optimize.js ' + CLIENT + ' C:\\path\\level0.zip'); process.exit(1); }

const summary = path.join(dir, 'level0-summary.json');
const run = (label, fn) => { process.stdout.write(`\n▶ ${label}\n`); fn(); };

// 1. parse the export (stream the unzipped txt through the parser via a shell pipe)
run(`Parsing level-0 export (${path.basename(zip)})…`, () => {
  // unzip -p must exist; fall back to PowerShell Expand if needed.
  try {
    execFileSync(process.platform === 'win32' ? 'bash' : 'sh', ['-c',
      `unzip -p "${zip}" | "${NODE}" "${path.join(__dirname, 'parse-level0.js')}" "${summary}"`],
      { stdio: 'inherit' });
  } catch (e) {
    console.error('  (unzip pipe failed — unzip the export and pipe data1.txt manually, see parse-level0.js header)');
    throw e;
  }
});

// 2. % + deletion plan
run('Computing distribution + cleanup plan…', () => {
  process.env.CLIENT = CLIENT;
  execFileSync(NODE, [path.join(__dirname, 'analyze-level0.js')], { stdio: 'inherit', cwd: ROOT, env: { ...process.env } });
});

// 3. merge into the tenant KB so the chat surfaces it
run('Merging into tenant-kb.json (kb.level0)…', () => {
  const kb = JSON.parse(fs.readFileSync(kbPath, 'utf8'));
  const s = JSON.parse(fs.readFileSync(summary, 'utf8'));
  const c = JSON.parse(fs.readFileSync(path.join(dir, 'level0-cleanup.json'), 'utf8'));
  kb.level0 = { totals: s.totals, blocksByYears: s.blocksByYears, blocksByScenario: s.blocksByScenario, blocksByVersion: s.blocksByVersion, cleanup: c };
  fs.writeFileSync(kbPath, JSON.stringify(kb));
  console.log('  merged. Re-import this tenant-kb.json in the extension to see real data in the chat.');
});

// 4. client report
run('Building optimization report…', () => {
  execFileSync(NODE, [path.join(__dirname, 'optimization-report.js'), CLIENT], { stdio: 'inherit', cwd: ROOT });
});

console.log(`\n✓ Done. Deliverable: clients/${CLIENT}/optimization-report.md`);
console.log(`  → to PDF: use the /pdf skill on that markdown, or any md→pdf converter.`);
