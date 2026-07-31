'use strict';
// NSPB CURRENT STATE ASSESSMENT — "what you have vs what you actually use".
// Inputs (clients/<CLIENT>/):
//   HP-*/resource/...        unzipped LCM export (forms, rules, dashboards, subvars)
//   CALC-Calculation Manager LCM calc artifacts (optional)
//   audit-summary.json       from tools/parse-audit.js (usage telemetry)
//   activity-report.json     structured Activity Report (cubes, users, artifacts)
//   access_log.csv           optional — recent UI access log
// Output: clients/<CLIENT>/state-report.md
//   node tools/architecture-report.js [CLIENT]
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const CLIENT = process.argv[2] || 'talogy';
const dir = path.join(ROOT, 'clients', CLIENT);
const CAP = CLIENT[0].toUpperCase() + CLIENT.slice(1);

const AU = JSON.parse(fs.readFileSync(path.join(dir, 'audit-summary.json'), 'utf8'));
const AR = JSON.parse(fs.readFileSync(path.join(dir, 'activity-report.json'), 'utf8'));
// audit logs app-level deployment/launch records under the application name —
// that is not a business rule; drop it from the executed-rules picture
if (AR.app && AU.ruleRuns) delete AU.ruleRuns[AR.app.name];
const n = x => Number(x).toLocaleString('en-US');
const dec = s => decodeURIComponent(s.replace(/%(?![0-9A-F]{2})/gi, '%25'));
// optional: revenue↔financials reconciliation lineage (tools/parse-revenue-recon.js)
const RRp = path.join(dir, 'revenue-recon.json');
const RR = fs.existsSync(RRp) ? JSON.parse(fs.readFileSync(RRp, 'utf8')) : null;

// ── locate the LCM app folder (HP-<app>) ─────────────────────────────
const hpDir = fs.readdirSync(dir).map(f => path.join(dir, f))
  .find(f => /HP-/.test(f) && fs.statSync(f).isDirectory());
const RES = hpDir && path.join(hpDir, 'resource');

function listXml(rel) {
  const p = path.join(RES, rel);
  if (!fs.existsSync(p)) return [];
  const out = [];
  (function walk(d, relPath) {
    for (const f of fs.readdirSync(d)) {
      const full = path.join(d, f);
      if (fs.statSync(full).isDirectory()) walk(full, relPath ? relPath + '/' + f : f);
      else if (f.endsWith('.xml')) out.push({ name: dec(f.replace(/\.xml$/, '')), folder: relPath || '', file: full });
    }
  })(p, '');
  return out;
}

// forms & rules per cube
const cubesDir = path.join(RES, 'Cube');
const cubeNames = fs.existsSync(cubesDir) ? fs.readdirSync(cubesDir) : [];
const formsByCube = {}, rulesByCube = {};
for (const c of cubeNames) {
  formsByCube[c] = listXml(`Cube/${c}/Data Forms`);
  rulesByCube[c] = listXml(`Cube/${c}/Calculation Manager Rules`);
}
const allForms = Object.values(formsByCube).flat();
const allRules = Object.entries(rulesByCube).flatMap(([c, rs]) => rs.map(r => ({ ...r, cube: c })));

// global artifacts
const dashboards = listXml('Global Artifacts/Dashboards');
const navFlows = listXml('Global Artifacts/Navigation Flows');
const smartLists = listXml('Global Artifacts/Smart Lists');
const menus = listXml('Global Artifacts/Custom Menus');
const jobs = listXml('Global Artifacts/Jobs');
const validCombos = listXml('Global Artifacts/Valid Combination Rules');
const reportsLcm = listXml('Global Artifacts/Reports');

// substitution variables (global + per cube)
function subVars() {
  const out = [];
  const dirs = ['Global Artifacts/Substitution Variables', ...cubeNames.map(c => `Cube/${c}/Substitution Variables`)];
  for (const d of dirs) for (const f of listXml(d)) {
    const x = fs.readFileSync(f.file, 'utf8');
    const name = (x.match(/<name>([^<]*)<\/name>/) || [])[1];
    const value = ((x.match(/<value>([^<]*)<\/value>/) || [])[1] || '').replace(/&quot;/g, '"');
    if (name) out.push({ name, value, scope: d.includes('Global') ? 'ALL' : d.split('/')[1] });
  }
  return out;
}
const vars = subVars();

// ── audit cross-reference ────────────────────────────────────────────
const ranNames = new Set(Object.keys(AU.ruleRuns));
const ruleInfo = name => AU.ruleRuns[name];
const dormantRules = allRules.filter(r => !ranNames.has(r.name));
const activeRules = allRules.filter(r => ranNames.has(r.name));
const winDays = AU.windowDays || 180;
const winStart = String(AU.windowStart).slice(0, 10), winEnd = String(AU.windowEnd).slice(0, 10);

// users: real client users vs consultants/system
const isInternal = u => /bryantparkconsulting|@oracle\.com|^SYSTEM$/i.test(u);
const userRows = Object.entries(AU.byUser).map(([u, v]) => ({ user: u, count: v.count, last: String(v.last).slice(0, 10), internal: isInternal(u) }))
  .sort((a, b) => b.count - a.count);
const clientUsers = userRows.filter(u => !u.internal);

// data-entry channel split
const dataTotal = Object.values(AU.dataChangesByUser || {}).reduce((s, v) => s + v, 0);
const adhocOnly = Object.keys(AU.artifactTouch || {}).filter(k => k.startsWith('Data|')).every(k => /Adhoc/i.test(k.slice(5)));

// module activity (by rule-prefix convention: WFP_=Workforce, FIN_/Plan -=Financials, REV/OREV=Revenue)
function lastRun(re) {
  let last = null, count = 0;
  for (const [name, v] of Object.entries(AU.ruleRuns)) if (re.test(name)) { count += v.count; if (!last || v.last > last) last = v.last; }
  return { last: last ? String(last).slice(0, 10) : null, count };
}
const wfAct = lastRun(/^WFP_|Workforce/i);
const finAct = lastRun(/^FIN_|^Plan -/i);
const revAct = lastRun(/^REV|^OREV/i);

// ── Oracle EPBCS module map ──────────────────────────────────────────
// Standard business-process modules → their primary BSO cube + ASO report cube.
// Detection: config folder under Configuration/Module + cube presence + audit activity.
const ACTIVE_DAYS = 60;                                   // rule run within N days = active
const todayMs = Date.parse(AR.reportDate + 'T12:00:00');
const cubeLastRun = {};                                   // cube -> last rule-run ms
for (const v of Object.values(AU.ruleRuns)) { const c = v.cube; if (c && v.last) { const t = Date.parse(v.last); if (!cubeLastRun[c] || t > cubeLastRun[c]) cubeLastRun[c] = t; } }
const moduleDirs = (() => { const p = path.join(RES, 'Configuration', 'Module'); return fs.existsSync(p) ? fs.readdirSync(p).map(s => s.toUpperCase()) : []; })();
const STD_MODULES = [
  { id: 'FINANCIALS', name: 'Financials', cube: 'OEP_FS', rpt: 'FinRpt' },
  { id: 'WORKFORCE', name: 'Workforce', cube: 'WFPlan', rpt: 'WFRpt' },
  { id: 'CAPITAL', name: 'Capital', cube: 'OEP_CPX', rpt: null },
  { id: 'PROJECTS', name: 'Projects', cube: 'OEP_PFP', rpt: null },
  { id: 'STRATMOD', name: 'Strategic Modeling', cube: null, rpt: null },
];
function moduleStatus(m) {
  const cubePresent = m.cube && AR.cubes.some(c => c.name === m.cube);
  const configEnabled = moduleDirs.includes(m.id) || moduleDirs.includes(m.name.toUpperCase());
  if (!cubePresent && !configEnabled) return { state: 'absent', label: 'Not installed' };
  const last = m.cube ? cubeLastRun[m.cube] : null;
  const days = last ? Math.round((todayMs - last) / 86400000) : null;
  if (last && days <= ACTIVE_DAYS) return { state: 'active', label: 'Active', last, days };
  if (cubePresent) return { state: 'dormant', label: last ? `Dormant (${days}d)` : 'Dormant', last, days };
  return { state: 'partial', label: 'Enabled, no cube activity' };
}
// custom cubes (BSO plan cubes not mapped to a standard module, e.g. RevPlan)
const stdCubes = new Set(STD_MODULES.map(m => m.cube).filter(Boolean));
const customModules = AR.cubes.filter(c => c.type === 'BSO' && !stdCubes.has(c.name)).map(c => {
  const last = cubeLastRun[c.name];
  const days = last ? Math.round((todayMs - last) / 86400000) : null;
  const dataChanged = true; // BSO plan cube with input forms — receives data via Smart View
  return { id: c.name, name: c.name + ' (custom)', cube: c.name, rpt: null,
    status: last && days <= ACTIVE_DAYS ? { state: 'active', label: 'Active', days } : { state: 'partial', label: 'Data flows, no module rules', days } };
});
const moduleMap = [...STD_MODULES.map(m => ({ ...m, status: moduleStatus(m) })), ...customModules];
// persist for the PDF diagram
fs.writeFileSync(path.join(dir, 'modules.json'), JSON.stringify({
  modules: moduleMap,
  financialsFeatures: (() => {
    const fp = path.join(RES, 'Configuration', 'Module', 'Financials', 'Features.xml');
    if (!fs.existsSync(fp)) return null;
    const x = fs.readFileSync(fp, 'utf8'); const re = /<feature name="(q_[^"]+)"\s*>\s*<value>(true|false)<\/value>/gi; let m; const on = [], off = [];
    while ((m = re.exec(x)) !== null) (m[2].toLowerCase() === 'true' ? on : off).push(m[1]);
    return { on, off };
  })(),
  reportingCubes: AR.cubes.filter(c => c.type === 'ASO').map(c => ({ name: c.name, cells: c.inputCells, empty: c.inputCells === 0 })),
  integration: AR.artifacts.dataIntegration,
  // ── integration pipeline inventory (FDMEE) ─────────────────────────
  integrations: (() => {
    const fdmRoot = fs.readdirSync(dir).map(f => path.join(dir, f)).find(f => /FDMEE/.test(f) && fs.statSync(f).isDirectory());
    if (!fdmRoot) return null;
    const dsDir = path.join(fdmRoot, 'resource', 'Application Data', 'Datasource Applications');
    const ds = fs.existsSync(dsDir) ? fs.readdirSync(dsDir) : [];
    const isMeta = s => /metadata|account|dept|site|subsidiar|segment|entity|smartlist/i.test(s) && !/actuals|revenue|expense|balance|volume|rates|transaction|consulting/i.test(s);
    const pipeDir = path.join(fdmRoot, 'resource', 'Cross Application Data', 'Pipeline Definition');
    const pipes = fs.existsSync(pipeDir) ? fs.readdirSync(pipeDir).filter(f => f.endsWith('.xml')).map(f => f.replace('.xml', '')) : [];
    const periodDir = path.join(fdmRoot, 'resource', 'Global Setup Artifacts', 'Source Period Mapping');
    const sources = fs.existsSync(periodDir) ? fs.readdirSync(periodDir).filter(f => f.endsWith('.xml')).map(f => f.replace('.xml', '')) : [];
    return {
      pipelines: pipes,
      sourceSystems: sources,
      metadataLoads: ds.filter(isMeta),
      dataLoads: ds.filter(s => !isMeta(s)),
    };
  })(),
  // ── calc activity & inventory per cube/module ──────────────────────
  calcByCube: (() => {
    const o = {};
    for (const [name, v] of Object.entries(AU.ruleRuns)) { if (name === AR.app.name) continue; const c = v.cube || '?'; o[c] = (o[c] || 0) + v.count; }
    return o;
  })(),
  inventoryByCube: Object.fromEntries(cubeNames.map(c => [c, {
    forms: (formsByCube[c] || []).length,
    rules: (rulesByCube[c] || []).length,
    rulesActive: (rulesByCube[c] || []).filter(r => ranNames.has(r.name)).length,
  }])),
  topRules: Object.entries(AU.ruleRuns).filter(([k]) => k !== AR.app.name)
    .sort((a, b) => b[1].count - a[1].count).slice(0, 8)
    .map(([k, v]) => ({ rule: k, cube: v.cube || '', count: v.count, last: String(v.last).slice(0, 10) })),
  // ── data maps (Reporting Mappings) — cube-to-cube flows ─────────────
  dataMaps: (() => {
    const dm = [];
    for (const f of listXml('Global Artifacts/Reporting Mappings')) {
      const x = fs.readFileSync(f.file, 'utf8');
      const src = (x.match(/planType="([^"]+)"/) || [])[1];
      const tgt = (x.match(/repCube="([^"]+)"/) || [])[1];
      if (src && tgt) dm.push({ name: f.name, source: src, target: tgt, temp: /_?temp/i.test(f.name) });
    }
    return dm;
  })(),
  // ── planning window (period definition) from substitution variables ──
  planningWindow: (() => {
    const gv = nm => { const v = vars.find(x => x.name === nm && x.scope === 'ALL') || vars.find(x => x.name === nm); return v ? v.value.replace(/"/g, '') : null; };
    const yr = s => s && /FY(\d\d)/.test(s) ? 2000 + +s.match(/FY(\d\d)/)[1] : null;
    return {
      planStart: gv('OEP_PlanStartYr') || gv('PlanStartYr'),
      planEnd: gv('OEP_PlanEndYr'),
      fcst1: gv('PAI_FcstYear1') || gv('OEP_NextYear'),
      fcst2: gv('PAI_FcstYear2'),
      actualLoadYear: gv('PAI_ActualLoadYear'),
      actualLoadMonth: gv('PAI_ActualLoadMonths'),
      paiCurrentMonth: gv('PAI_CurrentMonth'), paiCurrentYear: gv('PAI_CurrentYear'),
      oepCurMnth: gv('OEP_CurMnth'), oepCurYr: gv('OEP_CurYr'),
      yrStart: yr(gv('OEP_PlanStartYr') || gv('PlanStartYr')), yrEnd: yr(gv('OEP_PlanEndYr')),
      yrActual: yr(gv('PAI_ActualLoadYear')), yrFcst1: yr(gv('PAI_FcstYear1') || gv('OEP_NextYear')), yrFcst2: yr(gv('PAI_FcstYear2')),
    };
  })(),
}, null, 1));

const VER = 'v' + new Date().toISOString().slice(0, 10) + '.' +
  String(new Date().getHours()).padStart(2, '0') + String(new Date().getMinutes()).padStart(2, '0');

const out = [];
const P = s => out.push(s);

P(`# NSPB Current State Assessment — ${CAP}`);
P(`_Prepared by BPC · source: LCM export + ${winDays}-day application Audit (${winStart} → ${winEnd}) + Activity Report · **${VER}**_\n`);

// ════════ EXEC SUMMARY ════════
P(`## Executive summary\n`);
P(`- @@OK@@ **What is implemented:** a full **EPBCS** application (${AR.app.version}) with **${cubeNames.length} cubes** (${AR.cubes.filter(c => c.type === 'BSO').map(c => c.name).join(', ')} BSO + ${AR.cubes.filter(c => c.type === 'ASO').map(c => c.name).join(', ')} ASO), **${n(allForms.length)} forms**, **${n(allRules.length)} business rules**, ${n(dashboards.length)} dashboards, ${n(AR.artifacts.financialReports)} Financial Reports artifacts and ${n(AR.artifacts.dataIntegration)} Data Integration artifacts.`);
P(`- @@X@@ **What is actually used is a small fraction of that.** In the last **${winDays} days** the audit shows **${Object.keys(AU.ruleRuns).length} of ${n(allRules.length)} rules executed**, **${clientUsers.length} real ${CAP} users**, and **every single data change (${n(dataTotal)}) entered through Smart View ad-hoc grids — none through the ${n(allForms.length)} Planning forms**.`);
P(`- @@X@@ **The Workforce module looks abandoned:** its rules last ran **${wfAct.last || 'never in the window'}**, yet its cube (WFPlan) still holds **${n(AR.cubes.find(c => c.name === 'WFPlan').totalBlocks)} blocks / ${n(AR.cubes.find(c => c.name === 'WFPlan').pageFileMB)} MB** of stored aggregations.`);
P(`- @@WARN@@ **Usage is concentrated and shrinking:** the two heaviest users (${clientUsers.slice(0, 2).map(u => u.user).join(', ')}) stopped using the application in ${clientUsers[0] ? clientUsers[0].last.slice(0, 7) : ''}/${clientUsers[1] ? clientUsers[1].last.slice(0, 7) : ''}; today essentially **one person** drives it.`);
P(`- @@IDEA@@ **The opportunity:** decide module by module — *retire what is not used* (or *re-onboard users to what was paid for and built*), refresh the stale configuration (substitution variables still at ${vars.find(v => /CurMnth/i.test(v.name)) ? `"${vars.find(v => /CurMnth/i.test(v.name)).value}"` : 'old periods'}), and simplify the maintenance surface.\n`);
P(`_Everything below is presented as **suggested changes** to review with the ${CAP} team — usage we cannot see (seasonal cycles, planned go-lives, reporting from other tools) may change a conclusion. Window analyzed: ${winDays} days of audit + the Activity Report._\n`);
P(`**How to read this report:** @@OK@@ implemented & in use · @@WARN@@ caution / partially used / verify · @@X@@ implemented but NOT used (or broken) · @@IDEA@@ suggested change to validate.\n`);

// ════════ PART 1 — WHAT YOU HAVE ════════
P(`## Part 1 — What is implemented\n`);
P(`_In plain terms: the full inventory of the application as built._\n`);

P(`## 1.1 Oracle EPBCS modules — installed & active map\n`);
P(`_The diagram above shows every Oracle planning module: green = installed and actively used, yellow = installed but only partially used, red = installed but dormant, grey = not installed. Data flows left to right: NetSuite/source loads → BSO planning cubes → ASO reporting cubes → Smart View, dashboards and reports._\n`);
const activeM = moduleMap.filter(m => m.status.state === 'active');
const dormM = moduleMap.filter(m => m.status.state === 'dormant');
const partM = moduleMap.filter(m => m.status.state === 'partial');
const absentM = moduleMap.filter(m => m.status.state === 'absent');
P(`- @@OK@@ **Active:** ${activeM.map(m => m.name.replace(' (custom)', '')).join(', ') || '—'}.`);
if (partM.length) P(`- @@WARN@@ **Partially used:** ${partM.map(m => `${m.name.replace(' (custom)', '')} (${m.status.label.toLowerCase()})`).join(', ')}.`);
if (dormM.length) P(`- @@X@@ **Dormant (built, paid for, not running):** ${dormM.map(m => `${m.name} — last activity ${m.status.last ? new Date(m.status.last).toISOString().slice(0, 10) : 'n/a'}`).join('; ')}.`);
P(`- ⚪ **Not installed:** ${absentM.map(m => m.name).join(', ') || '—'} — available in EPBCS if a future need appears.`);
const ff = JSON.parse(fs.readFileSync(path.join(dir, 'modules.json'), 'utf8')).financialsFeatures;
let cashOff = false;
if (ff) {
  // human-readable label per known Financials feature flag
  const FEAT = {
    q_cashflow: 'Cash Flow planning', q_revenue_margins: 'Revenue & margins',
    q_rollingforecast: 'Rolling forecast', q_weeklyplanning: 'Weekly planning',
    q_expense: 'Expense planning', q_coa_support: 'Chart-of-accounts support',
    q_curruncy_type_multi: 'Multi-currency', q_is_app_hybrid: 'Hybrid Essbase',
  };
  const lbl = f => FEAT[f] || f.replace(/^q_/, '').replace(/_/g, ' ');
  const onF = ff.on.filter(f => FEAT[f] && f !== 'q_is_app_hybrid');
  const offF = ff.off.filter(f => FEAT[f] && f !== 'q_is_app_hybrid');
  cashOff = ff.off.includes('q_cashflow');
  P(`- @@OK@@ **Inside Financials, the features turned ON:** ${onF.map(lbl).join(', ')} — this is an expense-and-revenue P&L planning footprint.`);
  if (offF.length) P(`- @@WARN@@ **Features turned OFF (licensed but not enabled):** ${offF.map(lbl).join(', ')} — confirm each was intentionally skipped rather than never finished. See 1.2 for the cash-flow opportunity.\n`);
}

// ── 1.2b Financials feature focus: Cash Flow ─────────────────────────
if (cashOff) {
  P(`## 1.2 Financials features — what's on, and the Cash Flow gap\n`);
  P(`_A frequent question: "are we doing anything with cash flow?" The answer for ${CAP} today is **no** — and it is worth understanding why, because the capability is already licensed._\n`);
  P(`- @@X@@ **No cash-flow planning exists today.** Cash Flow is **not a separate module** in EPBCS — it is a **feature inside the Financials module**, and it is turned **off** (\`q_cashflow = false\`). There are **no cash-flow forms, rules, dashboards or accounts** anywhere in the application — only ordinary P&L accounts whose names contain the word "cash" (e.g. "Interest Expense : Cash"), which are not a cash-flow statement.`);
  P(`- @@WARN@@ **It is not a switch.** EPBCS cash flow (indirect method) is driven from the **Balance Sheet**, which is **also off** here (the custom dimensions are flagged \`NoBalanceSheet, NoCashFlow\`). Enabling cash flow first needs a Balance Sheet structure and working-capital drivers — a small, scoped project, not a configuration toggle.`);
  P(`- @@IDEA@@ **The opportunity:** ${CAP} already pays for cash-flow planning inside the Financials license. If liquidity/working-capital planning is a need, the foundation (actuals, P&L, NetSuite integration) is in place — only the Balance Sheet + Cash Flow build is missing. Listed as a START USING item in Section 4.2.\n`);
}

P(`### What the previous team built — model by model\n`);
P(`_In plain terms, as if explaining this application to someone who has never seen it: what each cube was designed to do and how they were meant to work together._\n`);
P(`- **OEP_FS — the Financials engine.** A corporate P&L / expense planning model on Oracle's Financials module. NetSuite actuals load here, currency conversion and consolidation rules run, and Forecast/Plan scenarios live alongside Actuals. This is the spine the rest of the application reports from.`);
P(`- **RevPlan — a custom Revenue model.** Built specifically for ${CAP}'s business (psychometric testing): revenue planned bottom-up by **client, site, testing volumes, fees and average rate per test**, then mapped into the Financials P&L. The 58 forms and 61 rules show a serious, purpose-built revenue-planning process.`);
P(`- **WFPlan — the Workforce model.** Oracle's Workforce module: headcount and compensation planned by **employee, job and department**, then pushed into Financials as a salary/benefits expense. The most detailed model on paper (Employee + Job dimensions) but the least populated in practice.`);
P(`- **FinRpt / RevRpt / WFRpt — the reporting layer.** Aggregate-storage (ASO) mirror cubes built for fast Smart View / dashboard reporting, fed from the three planning cubes through data maps (Section 1.4). **FinRptH** was meant to be the financial *history* cube — but it was never loaded (Section 3.2).`);
P(`- **How it was meant to flow:** NetSuite → OEP_FS (actuals) ; Revenue planned in RevPlan and Workforce in WFPlan → both pushed into OEP_FS → everything pushed out to the ASO reporting cubes → consumed in Smart View, dashboards and Financial Reports. A complete three-stream FP&A design.\n`);

P(`### Cube detail\n`);
P(`| Cube | Type | Module / purpose | Size | Status (from usage data) |`);
P(`|---|---|---|--:|---|`);
const cubeStatus = {
  OEP_FS: ['Financials (EPBCS module)', `@@OK@@ Active — actuals consolidation runs daily (last ${finAct.last})`],
  RevPlan: ['Revenue planning (custom)', `${revAct.count ? '@@WARN@@ Rules ran ' + revAct.count + '× (last ' + revAct.last + ')' : '@@WARN@@ No revenue-prefixed rule executions in the audit window — input appears to flow via Smart View + Financials rules'}`],
  WFPlan: ['Workforce (EPBCS module)', `@@X@@ Rules last ran **${wfAct.last}** — dormant since then`],
  FinRpt: ['Financial reporting (ASO)', `@@OK@@ ${n(AR.cubes.find(c => c.name === 'FinRpt').inputCells)} input cells — receives pushed data`],
  RevRpt: ['Revenue reporting (ASO)', `@@WARN@@ ${n(AR.cubes.find(c => c.name === 'RevRpt').inputCells)} cells but only ${formsByCube.RevRpt ? formsByCube.RevRpt.length : 0} form — consumed via Smart View only`],
  WFRpt: ['Workforce reporting (ASO)', `@@WARN@@ ${n(AR.cubes.find(c => c.name === 'WFRpt').inputCells)} cells — stale if Workforce is dormant`],
  FinRptH: ['Financial reporting - history (ASO)', `@@X@@ **0 input cells — built but EMPTY.** Never loaded`],
};
for (const c of AR.cubes) {
  const sz = c.type === 'BSO' ? `${n(c.pageFileMB)} MB` : `${n(c.sizeMB)} MB`;
  const [purpose, status] = cubeStatus[c.name] || ['—', ''];
  P(`| ${c.name} | ${c.type} | ${purpose} | ${sz} | ${status} |`);
}
P(``);
P(`- @@WARN@@ **Hybrid BSO is disabled** (Activity Report). All upper-level aggregations are stored — WFPlan is 99% upper-level blocks for a module that is not running. Enabling Hybrid (or trimming stored aggregations) is a follow-up optimization conversation.\n`);

P(`## 1.3 Artifact inventory\n`);
P(`| Artifact | Count | Notes |`);
P(`|---|--:|---|`);
P(`| Forms | ${n(allForms.length)} | ${Object.entries(formsByCube).filter(([, f]) => f.length).map(([c, f]) => `${c}: ${f.length}`).join(' · ')} |`);
P(`| Business rules (LCM) | ${n(allRules.length)} | ${Object.entries(rulesByCube).filter(([, r]) => r.length).map(([c, r]) => `${c}: ${r.length}`).join(' · ')} |`);
P(`| Dashboards | ${n(dashboards.length)} | Financials / Revenue / Workforce folders |`);
P(`| Navigation flows | ${n(navFlows.length)} | ${navFlows.map(f => f.name).join(', ')} |`);
P(`| Smart Lists | ${n(smartLists.length)} | — |`);
P(`| Custom menus | ${n(menus.length)} | — |`);
P(`| Scheduled jobs (LCM) | ${n(jobs.length)} | incl. Clear Cube / Export Data / Export Metadata definitions |`);
P(`| Valid combination rules | ${n(validCombos.length)} | — |`);
P(`| Financial Reports | ${n(AR.artifacts.financialReports)} | from Activity Report |`);
P(`| Data Integration artifacts | ${n(AR.artifacts.dataIntegration)} | pipelines/mappings (FDMEE) |`);
P(``);

// ── level-0 data summaries (optional, per cube) ─────────────────────
const L0 = {};
const l0dir = path.join(dir, 'level0');
if (fs.existsSync(l0dir)) for (const c of AR.cubes.map(x => x.name)) {
  const f = path.join(l0dir, `${c}-summary.json`);
  if (fs.existsSync(f)) L0[c] = JSON.parse(fs.readFileSync(f, 'utf8'));
}
const hasL0 = Object.keys(L0).length > 0;
const scnType = s => /actual/i.test(s) ? 'Actual' : /forecast|midyear|prior/i.test(s) ? 'Forecast' : /plan|budget|stretch/i.test(s) ? 'Plan/Budget' : 'Other';
const fwdShare = sum => { const y = sum.blocksByYear || {}; const tot = Object.values(y).reduce((a, b) => a + b, 0) || 1; return 100 * ((y.FY25 || 0) + (y.FY26 || 0)) / tot; };
const lastRealYear = sum => { const y = sum.blocksByYear || {}; return Object.keys(y).filter(k => /^FY\d\d$/.test(k) && y[k] > Math.max(1000, 0.02 * Object.values(y).reduce((a, b) => a + b, 0))).sort().pop() || '—'; };

// ── 1.3 data maps — cube-to-cube flows ──────────────────────────────
const DM = JSON.parse(fs.readFileSync(path.join(dir, 'modules.json'), 'utf8')).dataMaps || [];
if (DM.length) {
  P(`## 1.4 Data maps — how data flows between cubes\n`);
  P(`_The diagram above shows every data map (Smart Push / Reporting Mapping) defined in the application — the internal plumbing that copies data from the planning cubes into the reporting cubes._\n`);
  P(`| Data map | From | To | Note |`);
  P(`|---|---|---|---|`);
  for (const m of DM.sort((a, b) => a.source.localeCompare(b.source) || a.name.localeCompare(b.name)))
    P(`| ${m.name} | ${m.source} | ${m.target} | ${m.temp ? '@@WARN@@ "_Temp" — looks like a leftover test map' : ''} |`);
  P(``);
  const tempMaps = DM.filter(m => m.temp);
  const targets = new Set(DM.map(m => m.target));
  const orphanAso = AR.cubes.filter(c => c.type === 'ASO' && !targets.has(c.name)).map(c => c.name);
  P(`- @@OK@@ **${DM.length} data maps** keep the reporting cubes fed: ${[...new Set(DM.filter(m => !m.temp).map(m => `${m.source} → ${m.target}`))].join(', ')}.`);
  if (orphanAso.length) P(`- @@X@@ **No data map feeds ${orphanAso.join(' or ')}** — ${orphanAso.includes('FinRptH') ? 'consistent with FinRptH being empty; ' : ''}${orphanAso.includes('RevRpt') ? 'RevRpt is loaded directly from Data Management instead, a second path worth confirming on purpose; ' : ''}each orphan needs a finish-or-remove decision.`);
  if (tempMaps.length) P(`- @@WARN@@ **${tempMaps.length} "_Temp" maps** (${tempMaps.map(m => m.name).join(', ')}) look like leftovers from builds/tests — confirm and remove.\n`);
}

// ── 1.4 dimension profile — size, depth, oddities ───────────────────
if (AR.dimensionsByCube) {
  P(`## 1.5 Dimension profile — are the dimensions normal or odd?\n`);
  P(`_Member counts, dense/sparse role and hierarchy depth per planning cube (from the Activity Report outline). This is what tells us whether a dimension is a healthy part of the model, an oversized one, or a candidate to leave with a retired module._\n`);
  P(`| Cube | Dimension | Role | Declared | Stored | Levels | Reading |`);
  P(`|---|---|---|--:|--:|--:|---|`);
  for (const [cube, dims] of Object.entries(AR.dimensionsByCube)) {
    for (const d of dims.slice().sort((a, b) => b.stored - a.stored)) {
      let read = '@@OK@@ Normal';
      if (d.storage === 'Dense') read = '@@OK@@ Dense — correct for ' + d.name;
      if (d.stored >= 5000) read = '@@WARN@@ Largest dimension — the main sparsity driver of this cube';
      else if (d.levels >= 10) read = `@@WARN@@ Very deep hierarchy (${d.levels} levels) — review whether all rollup layers are used`;
      else if (/Currency/.test(d.name) && d.stored > 20) read = `@@WARN@@ ${d.stored} currencies stored — confirm how many actually carry data`;
      else if (/Employee|Job/.test(d.name)) read = '@@X@@ Workforce-only dimension — leaves the system if the module is retired';
      else if (d.stored === d.declared && d.stored > 500) read = '@@OK@@ Flat and clean — every member stored, no alternate rollups';
      else if (d.declared - d.stored > d.declared * 0.3) read = '@@OK@@ Has alternate/shared rollups (normal for reporting views)';
      else if (d.stored <= 12) read = '@@OK@@ Small plumbing dimension — normal in EPBCS';
      P(`| ${cube} | ${d.name} | ${d.storage} | ${n(d.declared)} | ${n(d.stored)} | ${d.levels} | ${read} |`);
    }
  }
  P(``);
  // helper: stored count of a dimension in a given cube (from the AR outline)
  const dimStored = (cube, dim) => { const d = (AR.dimensionsByCube[cube] || []).find(x => x.name === dim); return d ? d.stored : null; };
  const allDims = Object.values(AR.dimensionsByCube).flat();
  if (AR.attributeDims && AR.attributeDims.length) {
    const big = AR.attributeDims.slice().sort((a, b) => b.members - a.members)[0];
    P(`- @@OK@@ **Attributes used correctly:** ${AR.attributeDims.length} attribute dimensions (${AR.attributeDims.map(a => `${a.name} ${a.members}`).join(', ')}) — slicing without inflating the cube. Using ${big.name} (${big.members}) as an attribute instead of a base dimension is exactly right.`);
  }
  // dimensions that appear in multiple cubes with different stored counts
  const multiCube = {};
  for (const [cube, dims] of Object.entries(AR.dimensionsByCube)) for (const d of dims) (multiCube[d.name] = multiCube[d.name] || []).push({ cube, stored: d.stored });
  const dept = multiCube['Department'];
  if (dept && dept.length > 1) P(`- @@WARN@@ **Same-named dimensions differ per cube by design** (EPBCS): Department is ${dept.map(x => `${n(x.stored)} in ${x.cube}`).join(', ')}. Not an error — but each copy is maintained by the metadata sync, so removing a module also removes its maintenance burden.`);
  const cur = allDims.filter(d => d.name === 'Currency')[0];
  if (cur) P(`- @@WARN@@ **Currency: ${n(cur.stored)} stored members${multiCube.Currency && multiCube.Currency.length > 1 ? ' in every cube' : ''}.** If ${CAP} actually plans in a handful of currencies, the rest are dead weight in every block-creation decision — the level-0 data export shows exactly how many carry data (Section 1.6).`);
  const deepest = allDims.slice().sort((a, b) => b.levels - a.levels)[0];
  if (deepest && deepest.levels >= 9) P(`- @@WARN@@ **${deepest.name} reaches ${deepest.levels} levels deep.** Deep hierarchies are valid but slow aggregations and confuse Smart View navigation — verify the bottom layers are really used for reporting.`);
  // module-retirement impact: largest dims unique to a dormant module's cube
  for (const m of dormM) {
    const uniqueDims = (AR.dimensionsByCube[m.cube] || []).filter(d => d.storage === 'Sparse' && (multiCube[d.name] || []).length === 1 && d.stored > 500).sort((a, b) => b.stored - a.stored).slice(0, 3);
    if (uniqueDims.length) P(`- @@X@@ **If ${m.name} is retired** (Section 2.4), ${uniqueDims.map(d => `${d.name} (${n(d.stored)})`).join(', ')} leave with it — among the application's largest maintained hierarchies.`);
  }
  P(``);
}

// ── 1.6 where the data actually lives (from level-0 exports) ─────────
if (hasL0) {
  const bso = AR.cubes.filter(c => c.type === 'BSO' && L0[c.name]);
  P(`## 1.6 Where the data actually lives — by cube, year and scenario\n`);
  P(`_The diagram above reads the real level-0 data exported from each cube. It answers the key question: from which year is there Actuals / Forecast / Budget, and is the application still being used to plan forward — or only to store history?_\n`);
  P(`| Cube | Blocks with data | Year span | Forward (FY25–26) | Reading |`);
  P(`|---|--:|---|--:|---|`);
  for (const c of bso) {
    const s = L0[c.name], y = s.blocksByYear, yrs = Object.keys(y).filter(k => /^FY\d\d$/.test(k)).sort();
    const fwd = fwdShare(s);
    const read = fwd < 5 ? '@@X@@ Almost no forward data — used as a history store, not for planning' : fwd < 20 ? '@@WARN@@ Mostly historical; light forward planning' : '@@OK@@ Active forward planning';
    P(`| ${c.name} | ${n(s.totals.blocks)} | ${yrs[0]}–${yrs[yrs.length - 1]} | ${fwd.toFixed(1)}% | ${read} |`);
  }
  P(``);
  const fs_ = L0.OEP_FS, rp = L0.RevPlan, wf = L0.WFPlan;
  if (fs_) P(`- @@X@@ **Financials (OEP_FS): only ${fwdShare(fs_).toFixed(1)}% of the data is FY25–FY26.** ${(100 * (fs_.blocksByScenario.OEP_Actual || 0) / fs_.totals.blocks).toFixed(0)}% of all blocks are **OEP_Actual** — the cube is overwhelmingly a record of past actuals (peak years ${Object.entries(fs_.blocksByYear).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k]) => k).join(', ')}), not a forward plan.`);
  if (rp) P(`- @@X@@ **Revenue (RevPlan) looks abandoned in the data:** it peaks at **${Object.entries(rp.blocksByYear).sort((a, b) => b[1] - a[1])[0][0]} (${n(Object.entries(rp.blocksByYear).sort((a, b) => b[1] - a[1])[0][1])} blocks)** and collapses to **${n(rp.blocksByYear.FY25 || 0)} in FY25, with no FY24 or FY26 data**. The revenue model was actively used around FY20–FY22 and then effectively stopped — strong evidence it is no longer part of the live process.`);
  if (wf) P(`- @@X@@ **Workforce (WFPlan) never carried weight:** ${n(wf.totals.blocks)} blocks total and **no OEP_Actual scenario at all** — only plan/forecast. Combined with rules dormant since ${wfAct.last}, the data confirms the module was built but barely adopted.`);
  // currency reality
  const curCubes = Object.values(L0).filter(s => s.blocksByCurrency && Object.keys(s.blocksByCurrency).length);
  if (curCubes.length) {
    const maxCur = Math.max(...curCubes.map(s => Object.keys(s.blocksByCurrency).length));
    const reporting = curCubes[0] ? Object.keys(curCubes[0].blocksByCurrency).filter(k => /_Reporting/i.test(k)).length : 0;
    P(`- @@WARN@@ **Currencies: ~${maxCur} carry data** (of 57 stored), and roughly half are \`_Reporting\` conversion copies (USD_Reporting, GBP_Reporting…). So the real input-currency count is small — the rest are currency-conversion outputs, normal but worth confirming the list is current.`);
  }
  P(`- @@IDEA@@ **The big picture:** the application was clearly built as a full FP&A suite (Financials + Revenue + Workforce) and used that way around **FY20–FY22**; today the live footprint is **Financials actuals only**. The level-0 data is the hard proof behind the usage story in Part 2.\n`);
}

// ── 1.7 revenue↔financials lineage — saved searches, push map, grain gap ──
if (RR && RR.savedSearches) {
  const SS = RR.savedSearches, H = RR.hierarchy, PM = RR.pushMap || [];
  const LS = RR.loadStructure;
  const incPrimary = (LS && LS.incomeSearch) || (SS.income[0] || {}).search;
  const revPrimary = (LS && LS.revenueSearch) || (SS.revenue[0] || {}).search;
  P(`## 1.7 Revenue-to-Financials lineage — data load structure and the push\n`);
  P(`_The diagram above traces how actuals reach the two figures the business expects to tie — **Income** (Financials) and **Total Revenue** (Revenue) — and why, structurally, they are not the same members. Source: the FDMEE import formats, data-load rules and calc rules in the LCM._\n`);
  P(`- @@WARN@@ **Income and Revenue are loaded by *different* NetSuite saved searches.** Financials actuals load from \`${incPrimary || '?'}\` into \`OEP_FS\`; revenue actuals load from \`${revPrimary || '?'}\` into \`RevPlan\`. They are sibling copies of the same "all transactions" search but **separate objects** — any difference in their criteria (account scope, posting vs non-posting, transaction type, eliminations, main-line) makes Income ≠ Total Revenue at the source.\n`);
  if (LS && LS.dataLoads.length) {
    P(`**Data load structure — every wired NetSuite saved search, and where it lands** (joined from the FDMEE import formats + data-load rules):\n`);
    P(`| NetSuite saved search | FDMEE source | Target cube | Category | Target area / hierarchy |`);
    P(`|---|---|---|---|---|`);
    for (const d of LS.dataLoads) P(`| \`${d.search || '—'}\` | ${d.dataSource.replace('PBCS - ', '')} | ${d.targetCubes.join(' + ')} | ${d.categories.join(', ')} | ${d.area || ''} |`);
    P(``);
    P(`- @@WARN@@ **\`RevPlan Actuals\` loads into both \`RevPlan\` and \`OEP_FS\`** (the \`*_OEPFS\` rules) — revenue actuals reach Financials through a second path, separate from the GL \`Financial Actuals\` load.`);
    if (LS.unwired.length) P(`- @@X@@ **${LS.unwired.length} more "all transactions" saved searches are defined but NOT wired into any import format** — likely legacy/unused: ${LS.unwired.map(u => `\`${u.search}\``).join(', ')}. The live loads use only the ${LS.dataLoads.length} above; these are cleanup candidates and a common source of "which search feeds what?" confusion.`);
    P(``);
  }
  const dimMeta = SS.metadata.filter(m => m.dimension !== 'Other');
  if (dimMeta.length) {
    P(`**Metadata (dimension build) saved searches — by dimension, incl. Account**\n`);
    P(`| Dimension | NetSuite saved search |`); P(`|---|---|`);
    for (const r of dimMeta) P(`| ${r.dimension} | \`${r.search}\` |`);
    P(``);
  }
  if (H) P(`- @@X@@ **The two revenue hierarchies share zero level-0 members.** \`REV_Revenue Accounts\` has **${H.revLeaves.length} leaves** (planning categories — Testing Revenue, Subscription Revenue…); \`INCOME\` has **${H.incomeLeaves.length} leaves** (the NetSuite GL accounts A4000…). **${H.common.length} in common** — they are modelled at a different grain and are bridged only by a mapping, not by shared members.`);
  if (PM.length) {
    P(`- @@WARN@@ **The bridge is a hard-coded \`@XWRITE\` push** (rule \`REV_Push to OEP_FS\`): each revenue category is written into one GL account, many-to-one. The ${PM.length} mapped categories:\n`);
    P(`| REV category (source) | → GL account (target) |`); P(`|---|---|`);
    for (const m of PM) P(`| ${m.src} | ${m.targets.join(', ')} |`);
    P(``);
  }
}

// ── 1.8 AI / IPM Insights footprint (Auto Predict batches in the LCM) ─
{
  const { detectIPM, renderIpmSection } = require('./detect-ipm');
  const ipm = detectIPM(dir);                 // dir = clients/<client>, holds the HP-* LCM folder
  if (ipm.present) P(renderIpmSection(ipm, CAP, '## 1.8 AI / IPM Insights footprint'));
}

// ════════ PART 2 — WHAT IS USED ════════
P(`## Part 2 — What is actually used (last ${winDays} days)\n`);
P(`_In plain terms: the application audit records every rule execution, data change and admin action. This part compares that against the inventory._\n`);

P(`## 2.1 Users\n`);
P(`| User | Audit actions | Last activity | Who |`);
P(`|---|--:|---|---|`);
for (const u of userRows) P(`| ${u.user} | ${n(u.count)} | ${u.last} | ${u.internal ? 'BPC / Oracle / system' : `**${CAP}**`} |`);
P(``);
P(`- @@X@@ Only **${clientUsers.length} real ${CAP} users** appear in ${winDays} days — and activity is shrinking: **${clientUsers[0].user}** (${n(clientUsers[0].count)} actions) last appeared **${clientUsers[0].last}**, **${clientUsers[1] ? clientUsers[1].user : ''}** last appeared **${clientUsers[1] ? clientUsers[1].last : ''}**.`);
P(`- @@WARN@@ The Activity Report confirms it: **${AR.users.uniqueLast30Days} unique users in 30 days** (including consultants), ~${AR.users.uniqueLast7Days} in the last week. The application currently depends on **one active business user**.`);
P(`- @@IDEA@@ This is the central question for ${CAP}: **is the application meant to be used this little?** If yes — simplify and cut maintenance cost. If no — a re-onboarding push (training, navigation flows, forms that match how users actually work) recovers the investment already made.\n`);

P(`## 2.2 Business rules — executed vs dormant\n`);
P(`Of **${n(allRules.length)} rules** in the application, **${Object.keys(AU.ruleRuns).length} distinct rules executed** in ${winDays} days:\n`);
P(`| Rule | Cube | Runs | Last run |`);
P(`|---|---|--:|---|`);
Object.entries(AU.ruleRuns).sort((a, b) => b[1].count - a[1].count).slice(0, 14)
  .forEach(([k, v]) => P(`| ${k} | ${v.cube || ''} | ${n(v.count)} | ${String(v.last).slice(0, 10)} |`));
P(``);
P(`- @@X@@ **${n(dormantRules.length)} rules (${(100 * dormantRules.length / allRules.length).toFixed(0)}%) did not run once** in ${winDays} days. By cube: ${Object.entries(rulesByCube).filter(([, r]) => r.length).map(([c, r]) => `${c}: ${r.filter(x => !ranNames.has(x.name)).length}/${r.length}`).join(' · ')}.`);
P(`- @@WARN@@ Dormant ≠ useless — some are month-end or annual-planning rules waiting for their season. But **names like ${dormantRules.slice(0, 4).map(r => `\`${r.name}\``).join(', ')}…** should each get a keep/retire decision.`);
P(`- @@OK@@ The rules that DO run are healthy: small, fast (max ${AR.runtimeMetrics.longestCalcExecutionSec}s), mostly parallel — no performance problem.\n`);

P(`## 2.3 Data entry — where the numbers actually come from\n`);
P(`- @@X@@ **All ${n(dataTotal)} data changes in ${winDays} days came through Smart View ad-hoc grids** (audit source: "Adhoc Writeback Grid")${adhocOnly ? ' — there is not a single form-based data change in the audit' : ''}.`);
P(`- @@X@@ That means the **${n(allForms.length)} Planning forms** (with their folders, menus, validations and the ${n(dashboards.length)} dashboards built on them) are **bypassed for input**. Forms may still be opened for viewing, but the data tells us the working tool is Excel.`);
P(`- By user: ${Object.entries(AU.dataChangesByUser).sort((a, b) => b[1] - a[1]).map(([u, c]) => `${u} (${n(c)})`).join(' · ')} — and the two heaviest contributors have stopped (see 2.1).`);
P(`- @@IDEA@@ Decide deliberately: **either lean into Smart View** (retire most forms, keep a curated set, invest in governed templates) **or re-introduce forms** where control/validation matters (workflow, approvals, valid intersections do not exist in ad-hoc).\n`);

P(`## 2.4 Module activity timeline\n`);
P(`| Module | Rule executions (${winDays}d) | Last activity | Verdict |`);
P(`|---|--:|---|---|`);
P(`| Financials (OEP_FS) | ${n(finAct.count)} | ${finAct.last} | @@OK@@ In active use — daily actuals consolidation |`);
P(`| Revenue (RevPlan) | ${n(revAct.count)} | ${revAct.last || '—'} | @@WARN@@ Data flows, but no revenue-specific rule activity — verify the planned process is still followed |`);
P(`| Workforce (WFPlan) | ${n(wfAct.count)} | ${wfAct.last || 'never'} | @@X@@ Dormant since ${wfAct.last} — module-level keep/retire decision needed |`);
P(``);

// ── 2.5 main forms users are pointed to (from navigation flows) ─────
const NFp = path.join(dir, 'navflow.json');
if (fs.existsSync(NFp)) {
  const NF = JSON.parse(fs.readFileSync(NFp, 'utf8'));
  // infer a short purpose from the form name (form names are self-describing in EPBCS)
  const describe = (nm) => {
    const t = nm.toLowerCase();
    if (/exchange rate|currency/.test(t)) return 'Maintains FX rates for currency conversion';
    if (/volume/.test(t)) return 'Enters planned testing volumes (the revenue driver)';
    if (/rate per test/.test(t)) return 'Sets the average price per test';
    if (/cogs|cost of/.test(t)) return 'Plans cost of goods sold';
    if (/site fee|site expense|site direct/.test(t)) return 'Plans site-level fees and expenses';
    if (/testing revenue|practice test|book sales|other revenue/.test(t)) return 'Inputs/derives testing & other revenue';
    if (/testing duration/.test(t)) return 'Captures test duration drivers';
    if (/existing employee|new employee|headcount/.test(t)) return 'Plans headcount by employee';
    if (/benefit/.test(t)) return 'Plans employee benefits';
    if (/bonus/.test(t)) return 'Plans discretionary bonus';
    if (/salary|compensation|pay period/.test(t)) return 'Plans salary / pay calendar';
    if (/expense/.test(t)) return 'Direct expense input by department';
    if (/variance/.test(t)) return 'Reviews actual-vs-plan variances';
    if (/mapping/.test(t)) return 'Maps source data into the model';
    if (/balance sheet|cash flow|financing|investing/.test(t)) return 'Balance-sheet / cash-flow planning';
    return 'Planning / data-entry form';
  };
  const byCube = {};
  for (const f of NF.mainForms) (byCube[f.cube] = byCube[f.cube] || []).push(f);
  const cubeLabel = { OEP_FS: 'Financials (OEP_FS)', RevPlan: 'Revenue (RevPlan)', WFPlan: 'Workforce (WFPlan)' };
  P(`## 2.5 Main forms — what users are pointed to, and the rules behind them\n`);
  P(`_The two navigation flows (${Object.keys(NF.flows).join(' & ')}) define what users actually see. Of the ${n(allForms.length)} forms in the app, **${NF.mainForms.length} are surfaced in navigation** — these are the working data-entry screens. For each, the rule that runs when you click Save is shown (that is the calc the form drives)._\n`);
  for (const cube of ['OEP_FS', 'RevPlan', 'WFPlan']) {
    const forms = (byCube[cube] || []);
    if (!forms.length) continue;
    P(`**${cubeLabel[cube] || cube}** — ${forms.length} forms in navigation:\n`);
    P(`| Form | What it does | Runs on save |`);
    P(`|---|---|---|`);
    for (const f of forms.slice(0, 8)) {
      const rule = f.rules.filter(r => !/^(DEFAULT|CURRENCY)$/.test(r.name)).map(r => r.name)[0] || (f.rules[0] && f.rules[0].name) || '—';
      P(`| ${f.name} | ${describe(f.name)} | \`${rule}\` |`);
    }
    if (forms.length > 8) P(`| _…and ${forms.length - 8} more_ | | |`);
    P(``);
  }
  P(`- @@OK@@ **The forms map cleanly to the three modules' rules:** Financials forms trigger \`FIN_SEQ_*\` expense calcs, Revenue forms trigger \`REV_SEQ_*\` volume/revenue calcs, Workforce forms trigger \`WFP_SEQ_*\` employee calcs — a coherent, purpose-built design.`);
  if (NF.danglingForms && NF.danglingForms.length) P(`- @@X@@ **Navigation points to ${NF.danglingForms.length} forms that do not exist** in the application — e.g. ${NF.danglingForms.slice(0, 5).map(s => `"${s}"`).join(', ')}. These are **Cash Flow / Balance Sheet / Rolling Forecast** screens from the default template whose features are turned off (Section 1.2). Users clicking those menu items hit dead ends — clean the navigation flow to match what's actually enabled.\n`);
}

// ════════ PART 3 — CONFIGURATION HEALTH ════════
P(`## Part 3 — Configuration health & half-built pieces\n`);

P(`## 3.1 Substitution variables — are they current?\n`);
// classify each variable; names like Prior/Old/Last legitimately point backwards
const backwardOk = /prior|old|last|hist|prev/i;
const varRows = vars.sort((a, b) => a.name.localeCompare(b.name)).map(v => {
  let status = '@@OK@@';
  if (/CurMnth|CurrentMonth/i.test(v.name) && !/jun/i.test(v.value)) status = '@@X@@ Stale — should reflect the current month (June 2026; verify against your fiscal calendar)';
  else if (/CurYr|CurrentYr/i.test(v.name) && !/FY2[6-9]/.test(v.value)) status = '@@X@@ Stale — points at ' + v.value + ' (verify against your fiscal calendar)';
  else if (/CurQtr/i.test(v.name) && /1/.test(v.value)) status = '@@WARN@@ Still at quarter 1 — verify';
  else if (/FY2[0-4]\b/.test(v.value) && !backwardOk.test(v.name)) status = '@@WARN@@ Points at an old year — verify';
  return { ...v, status };
});
const varBad = varRows.filter(v => v.status !== '@@OK@@');
P(`Of **${vars.length} substitution variables**, **${varBad.length} look stale or need verification** (the other ${vars.length - varBad.length} are current or intentionally point backwards):\n`);
P(`| Variable | Scope | Value | Status |`);
P(`|---|---|---|---|`);
for (const v of varBad) P(`| ${v.name} | ${v.scope} | ${v.value} | ${v.status} |`);
P(``);
P(`- @@X@@ A stale **current-month variable** silently breaks every form, rule and report that uses it — symptoms look like "the form shows the wrong period". Updating these is a 10-minute fix that should be part of a monthly close checklist.\n`);

P(`## 3.2 Built but empty / half-finished\n`);
P(`- @@X@@ **FinRptH (ASO) has 0 input cells** — a history-reporting cube that was created (with ${formsByCube.FinRptH ? formsByCube.FinRptH.length : 0} form and its own dimensions) but never loaded. Either finish it (load history, point reports at it) or remove it.`);
P(`- @@WARN@@ **All 4 ASO cubes have 0 aggregate views** — queries always hit input-level data. Fine at today's sizes (${AR.cubes.filter(c => c.type === 'ASO').map(c => c.name + ' ' + n(c.sizeMB) + 'MB').join(', ')}), but build default aggregations if reporting grows.`);
P(`- @@WARN@@ **RevRpt and WFRpt each expose ${formsByCube.RevRpt ? formsByCube.RevRpt.length : 0}/${formsByCube.WFRpt ? formsByCube.WFRpt.length : 0} forms** while holding millions of cells — they are Smart View-only surfaces today.`);
P(`- @@X@@ **Outline warnings** (Activity Report): ${AR.outlineWarnings[0].slice(0, 180)}… — dynamic-calc level-0 members without formulas return no data and confuse users; the shared-member generation-2 warnings affect aggregation correctness. A cleanup pass is low-effort.\n`);

P(`## 3.3 Capacity & runtime (context, not a problem)\n`);
P(`- @@OK@@ The application is small and fast: ${n(AR.appSize.essbaseDataGB)} GB Essbase data, slowest calc ${AR.runtimeMetrics.longestCalcExecutionSec}s, ${AR.uiOver2SecPct}% of UI requests over 2s, availability ${AR.operational.availabilityPct}%.`);
P(`- @@WARN@@ **WFPlan stores ${n(AR.cubes.find(c => c.name === 'WFPlan').totalBlocks)} blocks (${n(AR.cubes.find(c => c.name === 'WFPlan').pageFileMB)} MB, 99% upper-level)** for a dormant module — if Workforce stays retired, clearing/archiving it shrinks backups and maintenance windows.`);
P(`- @@OK@@ Smart View ${Object.keys(AR.clientVersions.smartView)[0]} on Excel ${Object.keys(AR.clientVersions.excel)[0]} — current versions.\n`);

// ── 3.4 why Total Revenue ≠ Income — reconciliation analysis ────────
if (RR && RR.hierarchy) {
  const H = RR.hierarchy, G = RR.gaps || {};
  const dimsOf = c => new Set(((AR.dimensionsByCube && AR.dimensionsByCube[c]) || []).map(d => d.name));
  const fsD = dimsOf('OEP_FS'), rpD = dimsOf('RevPlan');
  const fsOnly = [...fsD].filter(d => !rpD.has(d)), rpOnly = [...rpD].filter(d => !fsD.has(d));
  P(`## 3.4 Why \`Total Revenue\` and \`Income\` do not reconcile\n`);
  P(`_The ${CAP} team raised that \`Total Revenue\` (Revenue module) should tie to \`Income\` (Financials), and today it does not. The structural reasons — from the metadata, rules and integration — are below, as **suggested findings to validate**, not certainties._\n`);
  if (H.totalRevenueTree && H.totalRevenueTree.length) {
    P(`- @@OK@@ **\`Total Revenue\` is a calculation, not a load.** It is a \`dynamic calc\` member that aggregates the stored revenue leaves beneath it — the data physically lives in those leaves (fed by the revenue saved searches in §1.7 plus planning input). Its composition:\n`);
    P('```');
    for (const nd of H.totalRevenueTree) P(`${'  '.repeat(nd.depth)}${nd.member}  [${nd.ds}]`);
    P('```');
  }
  if (G.incomeNoPush) P(`- @@X@@ **${n(G.incomeNoPush.length)} of the ${n(G.incomeLeaves)} \`INCOME\` GL accounts never receive a revenue push** — only ${G.incomePushTargets} are push targets. The rest carry NetSuite actuals that the revenue model never plans, so at those accounts the plan is below actual by construction.`);
  if (G.revNoPush && G.revNoPush.length) P(`- @@WARN@@ **${G.revNoPush.length} revenue categories are not in the \`@XWRITE\` push** (${G.revNoPush.map(s => `\`${s}\``).join(', ')}). \`Total Net\` is a dynamic-calc subtotal (expected); verify the others against the Groovy \`RevPlan2FinRpt\` data-map path before treating them as true orphans.`);
  const pushSrc = new Set((RR.pushMap || []).map(p => p.src));
  if (pushSrc.has('Safety Public') && !pushSrc.has('Safety Private')) P(`- @@WARN@@ **Asymmetry to check:** \`Safety Public\` maps to a GL account in the push but \`Safety Private\` maps to nothing — it looks like a missing push line.`);
  if (fsOnly.length || rpOnly.length) {
    const parts = [];
    if (rpOnly.length) parts.push(`RevPlan adds ${rpOnly.map(d => `**${d}**`).join(', ')} (absent from OEP_FS)`);
    if (fsOnly.length) parts.push(`OEP_FS adds ${fsOnly.map(d => `**${d}**`).join(', ')} (absent from RevPlan)`);
    const intg = rpOnly.includes('Integration') ? `RevPlan's **Integration** dimension is exactly where the push lands (the \`Integration Amount – Non-Billable\` member), so ` : '';
    P(`- @@X@@ **The two cubes are not dimensionally identical:** ${parts.join('; ')}. ${intg}\`Total Revenue\` is summed over a different dimensional space than \`Income\` — to tie them, fix a common POV (Scenario, Version, Year, Period, Entity, Currency) and aggregate over the non-shared dimension(s).`);
  }
  P(`- @@IDEA@@ **To prove the root cause in one step:** open the income search and the revenue search (§1.7) side by side in NetSuite and diff their **Criteria** tabs. The saved-search names are recoverable from the LCM (above); their filter criteria live in NetSuite, not in the export.\n`);
}

// ════════ PART 4 — SUGGESTED CHANGES ════════
P(`## Part 4 — Suggested changes & next steps\n`);
P(`## 4.1 Suggested changes (prioritized)\n`);
P(`_@@IDEA@@ marks each **suggested change** — decisions to make together with ${CAP}, validated in test before production._\n`);
P(`1. @@IDEA@@ **Hold a module-by-module keep/retire review** using Section 2.4: Financials = keep (active); Workforce = decide (dormant since ${wfAct.last}); Revenue = confirm the intended process vs. the Smart View reality.`);
if (RR && RR.hierarchy) P(`2. @@IDEA@@ **Resolve the Revenue-to-Financials reconciliation** (Section 3.4): confirm whether \`Total Revenue\` is meant to tie to \`Income\`, diff the two NetSuite saved searches (Section 1.7), and either align their criteria or document the intended difference — this is the gap the ${CAP} team raised.`);
P(`2. @@IDEA@@ **Fix the stale substitution variables** (Section 3.1) and add them to a monthly close checklist — cheapest fix with the most user-visible impact.`);
P(`3. @@IDEA@@ **Decide the data-entry strategy** (Section 2.3): curated Smart View templates as the official channel, or a small set of governed forms — and retire the rest of the ${n(allForms.length)} forms either way.`);
P(`4. @@IDEA@@ **Resolve FinRptH** — finish loading it (history reporting) or remove the empty cube.`);
P(`5. @@IDEA@@ **Retire or archive the dormant rules** after the seasonal check (Section 2.2) — fewer artifacts = faster migrations, clearer Calculation Manager, less audit noise.`);
P(`6. @@IDEA@@ **Clean the outline warnings** (Section 3.2) and re-run the Activity Report to confirm.`);
P(`7. @@IDEA@@ **If usage should grow:** a short re-onboarding plan (navigation-flow refresh + training for the 2 returning users + dashboards that answer their actual questions) — the application is already built and paid for.\n`);

P(`## 4.2 The decision board — keep, start using, or remove\n`);
P(`_The board above summarizes the whole assessment in one view. Three buckets: what is earning its keep, what is already built and only needs data or a small push to deliver value, and what is candidate to leave the system. Every item links back to the evidence section._\n`);

P(`### @@OK@@ KEEP — in use, earning its keep\n`);
P(`- **OEP_FS (Financials)** + its daily actuals chain (Consolidate Actual, ClearSiteCostAllocation, FIN_AllClear) — the heartbeat of the application (2.2/2.4).`);
P(`- **FinRpt (ASO)** — 22.8M cells, fed by ${DM.filter(m => m.target === 'FinRpt' && !m.temp).length} data maps from all three planning cubes (1.3).`);
P(`- **The NetSuite integration** — 2 pipelines, 24 loads; actively maintained and current through May FY26 (1.2).`);
P(`- **Smart View as the de-facto input channel** — it is where 100% of data entry happens today; keep it, but make it official with governed templates (2.3).\n`);

P(`### @@WARN@@ START USING — already built & paid for; needs only data or a small push\n`);
P(`- **FinRptH** — the history-reporting cube exists with its form; it just was never loaded. One data load away from giving ${CAP} clean multi-year reporting without bloating the planning cubes (3.2).`);
P(`- **RevPlan's planning side** — 58 forms + 61 rules for revenue planning (volumes, fees, rate per test) sit ready; today only actuals flow in. If revenue planning is wanted, the build is done — it needs process adoption, not consulting hours (2.2/2.4).`);
P(`- **Dashboards & navigation flows** — 21 dashboards and 2 flows already match the Budget/Forecast processes; with the variables fixed (3.1) they work again and make re-onboarding the returning users easy.`);
P(`- **Valid intersections & approvals** — governance features that come free with the forms if ${CAP} ever moves input back from ad-hoc grids (2.3).`);
if (cashOff) P(`- **Cash Flow planning** — licensed inside the Financials module but never enabled (Section 1.2). A natural next step for liquidity/working-capital planning; note it requires a Balance Sheet structure first, so scope it as a small project, not a configuration toggle.`);
P(``);

P(`### @@X@@ REMOVE / ARCHIVE — unused, stale, or leftovers\n`);
P(`- **Workforce (WFPlan + WFRpt)** — dormant since ${wfAct.last}; if the decision is to retire it, archive a snapshot and clear ~${n(AR.cubes.find(c => c.name === 'WFPlan').pageFileMB)} MB of stored aggregations (2.4/3.3).`);
P(`- **${n(dormantRules.length)} dormant rules** — after a one-cycle seasonal check, retire the clear leftovers first: the \`zz_*\` and \`TEMP_*\` rules are explicitly named as scrap (2.2).`);
P(`- **"_Temp" data maps** (${DM.filter(m => m.temp).map(m => m.name).join(', ') || 'none'}) and the **13 "training" source-period mappings** in Data Management — test debris (1.2/1.3).`);
P(`- **Stale substitution variables** — not "removed" but fixed: align the OEP_* clock with the PAI_* clock and add it to the monthly close checklist (3.1).`);
P(`- **Unused forms after the data-entry decision** — once the channel is official, the bulk of the ${n(allForms.length)} forms can be archived; keep the curated shortlist (2.3).\n`);

P(`## 4.3 What we could analyze next\n`);
P(`- @@IDEA@@ **Form-level usage over time** — with audit enabled going forward, a quarterly re-run shows whether the strategy decisions stick.`);
P(`- @@IDEA@@ **Cube optimization analysis** (the BPC performance deliverable) — if Workforce is kept, its 99%-upper-level storage with Hybrid disabled is the first candidate.`);
P(`- @@IDEA@@ **Financial Reports inventory** — ${n(AR.artifacts.financialReports)} FR artifacts vs. which ones are actually executed (needs FR access logs).`);
P(`- @@IDEA@@ **Data Integration review** — ${n(AR.artifacts.dataIntegration)} DM artifacts vs. the loads that actually run.`);
if (RR) P(`- @@IDEA@@ **Diff the income vs revenue saved searches in NetSuite** (Section 1.7) — the fastest confirmation of why \`Total Revenue\` and \`Income\` disagree.`);
if (RR) P(`- @@IDEA@@ **Reconcile from the level-0 export** — sum the \`INCOME\` GL leaves (OEP_FS) against the \`Total Revenue\` leaves (RevPlan) at a fixed POV and pinpoint the account where the gap opens.\n`);
P(``);

P(`---`);
P(`_Counts are exact from the LCM export (${n(allForms.length)} forms, ${n(allRules.length)} rules) and the ${winDays}-day application audit (${n(AU.totalRecords)} records). Usage conclusions are inferences from telemetry — always confirm intent with the ${CAP} team before retiring artifacts._`);

const file = path.join(dir, 'state-report.md');
fs.writeFileSync(file, out.join('\n'));
console.log('✓ wrote', path.relative(ROOT, file));
console.log(`Forms ${allForms.length} · Rules ${allRules.length} (${dormantRules.length} dormant) · Users ${userRows.length} (${clientUsers.length} client) · Vars ${vars.length}`);
