'use strict';
// Parse the LCM Navigation Flows to find the MAIN forms/dashboards — the ones
// users are actually pointed to — then enrich each form with the business rule
// it runs (runOnSave/runOnLoad) and its cube, from the form's own XML.
// Output: clients/<c>/navflow.json  (used by architecture-report.js §2.5)
//   node tools/parse-navflow.js <CLIENT>
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const CLIENT = process.argv[2] || 'talogy';
const dir = path.join(ROOT, 'clients', CLIENT);
const hpDir = fs.readdirSync(dir).map(f => path.join(dir, f)).find(f => /HP-/.test(f) && fs.statSync(f).isDirectory());
const RES = path.join(hpDir, 'resource');
const dec = s => { try { return decodeURIComponent(s); } catch (e) { return s; } };

// index every form file by its (decoded) name → path + cube
const formIndex = {};
const cubeDir = path.join(RES, 'Cube');
for (const cube of (fs.existsSync(cubeDir) ? fs.readdirSync(cubeDir) : [])) {
  const fd = path.join(cubeDir, cube, 'Data Forms');
  if (!fs.existsSync(fd)) continue;
  (function walk(d) {
    for (const f of fs.readdirSync(d)) {
      const full = path.join(d, f);
      if (fs.statSync(full).isDirectory()) walk(full);
      else if (f.endsWith('.xml')) { const nm = dec(f.replace(/\.xml$/, '')); if (!formIndex[nm]) formIndex[nm] = { file: full, cube }; }
    }
  })(fd);
}

// pull associated business rules + context menus from a form xml
function formMeta(name) {
  const hit = formIndex[name];
  if (!hit) return null;
  const x = fs.readFileSync(hit.file, 'utf8');
  const rules = [...x.matchAll(/<businessRule[^>]*\bname="([^"]+)"[^>]*\/?>/g)].map(m => {
    const tag = m[0];
    return { name: m[1], runOnSave: /runOnSave="true"/.test(tag), runOnLoad: /runOnLoad="true"/.test(tag) };
  });
  const menus = [...x.matchAll(/<menu>([^<]+)<\/menu>/g)].map(m => m[1]);
  return { cube: hit.cube, rules, menus };
}

// walk a navflow: track the current cluster/card labels, collect form & dashboard refs.
// Each leaf node carries label + refObjectDefId, then (often two) artifactName attrs —
// the FIRST is empty, the real artifact is the next NON-EMPTY one.
function parseFlow(file) {
  const xml = fs.readFileSync(file, 'utf8');
  const out = [];
  let cluster = '', card = '';
  const re = /label="([^"]*)"[^>]*?refObjectDefId="([A-Z_]+)"/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const [, label, refType] = m;
    if (refType === 'CUSTOM_CLUSTER') { cluster = label; continue; }
    if (refType === 'CUSTOM_CARD') { card = label; continue; }
    if (refType !== 'FORMS_RT_TF' && refType !== 'DASHBOARDS_RT_TF') continue;
    // first non-empty artifactName within the node window after this tag
    const win = xml.slice(m.index, m.index + 600);
    const an = [...win.matchAll(/artifactName="([^"]*)"/g)].map(x => x[1]).find(Boolean);
    if (!an) continue;
    out.push({ type: refType === 'FORMS_RT_TF' ? 'form' : 'dashboard', label, name: an, cluster, card });
  }
  return out;
}

const flowsDir = path.join(RES, 'Global Artifacts', 'Navigation Flows');
const flows = {};
const seenForms = new Map();      // form name → {…meta, flows:Set, cards:Set}
for (const f of (fs.existsSync(flowsDir) ? fs.readdirSync(flowsDir) : [])) {
  if (!f.endsWith('.xml')) continue;
  const flowName = f.replace(/\.xml$/, '');
  const refs = parseFlow(path.join(flowsDir, f));
  flows[flowName] = refs.length;
  for (const r of refs) {
    if (r.type !== 'form') continue;
    const key = r.name;
    if (!seenForms.has(key)) {
      const meta = formMeta(r.name) || { cube: '?', rules: [], menus: [] };
      seenForms.set(key, { name: r.name, cube: meta.cube, rules: meta.rules, menus: meta.menus, flows: new Set(), cards: new Set() });
    }
    const e = seenForms.get(key); e.flows.add(flowName); e.cards.add(r.card || r.cluster);
  }
}

const all = [...seenForms.values()].map(e => ({ ...e, flows: [...e.flows], cards: [...e.cards].filter(Boolean) }));
// resolved = the form file exists (real working surface); dangling = nav points at a
// form that isn't in the app (typically a disabled feature, e.g. Cash Flow / Balance Sheet)
const mainForms = all.filter(f => f.cube !== '?').sort((a, b) => (b.rules.length - a.rules.length) || a.name.localeCompare(b.name));
const danglingForms = all.filter(f => f.cube === '?').map(f => f.name);

fs.writeFileSync(path.join(dir, 'navflow.json'), JSON.stringify({ flows, mainForms, danglingForms }, null, 1));
console.log(`Navigation flows: ${Object.keys(flows).join(', ')}`);
console.log(`Real main forms surfaced: ${mainForms.length}  ·  dangling (no file): ${danglingForms.length}`);
for (const f of mainForms) console.log(`  [${f.cube}] ${f.name}${f.rules.length ? '  → runs on save: ' + f.rules.map(r => r.name).join(', ') : '  (no rule)'}`);
if (danglingForms.length) console.log(`\nNav points at ${danglingForms.length} forms with no file (disabled features?): ${danglingForms.slice(0, 10).join(', ')}…`);
console.log(`✓ wrote clients/${CLIENT}/navflow.json`);
