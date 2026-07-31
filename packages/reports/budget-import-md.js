'use strict';
// budget-import-md.js
// Generate clients/<CLIENT>/budget-import-guide.md from clients/<CLIENT>/tenant-kb.json.
// KB-driven and generic: it detects the standard NSPB NetSuite-template budgeting
// artifacts (OpEx + driver schedules, Workforce roster→comp→aggregate, the
// Copy-Fcst-to-Budget seed rule, the planning substitution variables) and writes a
// client-facing guide. Degrades gracefully when an artifact is absent.
//   node tools/budget-import-md.js <CLIENT>
// Node built-ins only. Pairs with budget-import-pdf.js (md → BPC PDF).
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const CLIENT = (process.argv[2] || process.env.CLIENT || 'demo').trim();
const dir = path.join(ROOT, 'clients', CLIENT);
const CAP = CLIENT[0].toUpperCase() + CLIENT.slice(1);
const kb = JSON.parse(fs.readFileSync(path.join(dir, 'tenant-kb.json'), 'utf8'));

const forms = kb.forms || [];
const rules = kb.rules || [];
const subs = kb.substitutionVariables || [];
const appName = kb.appName || 'NetSuite';

// ── helpers ──────────────────────────────────────────────────────────
const sig = f => `${f.path || ''} ${f.name || ''}`;
const findForms = re => forms.filter(f => re.test(sig(f)));
const findRule = re => rules.find(r => re.test(r.name || ''));
const isInput = f => f.kind === 'input';
const sub = name => { const v = subs.find(s => (s.name || '').toLowerCase() === name.toLowerCase()); return v ? String(v.value).replace(/^["']|["']$/g, '') : null; };
const esc = s => String(s).replace(/\|/g, '\\|');
// clip to n chars on a word boundary, with an ellipsis if truncated
const clip = (s, n = 72) => { s = String(s || '').replace(/\s+/g, ' ').trim(); if (s.length <= n) return s; return s.slice(0, s.lastIndexOf(' ', n) > 0 ? s.lastIndexOf(' ', n) : n).trim() + '…'; };
// a markdown table row of forms, "Form | Purpose"
const formRows = (fs_, purpose) => fs_.map(f => `| **${esc(f.name)}**${isInput(f) ? '' : ' *(read-only)*'} | ${esc(purpose ? purpose(f) : clip(f.description) || '—')} |`).join('\n');

// ── detect the standard budgeting rules ──────────────────────────────
const R = {
  seed:     findRule(/copy.*f\.?o?r?e?c?a?s?t.*to.*budget(?!.*workforce)/i) || findRule(/copy.*fcst.*to.*budget(?!.*work)/i),
  seedWf:   findRule(/copy.*f\.?o?r?e?c?a?s?t.*to.*budget.*work/i),
  opexSave: findRule(/^form_?opex$/i) || findRule(/form_?opex/i),
  comp:     findRule(/calc\.?comp/i) || findRule(/calculate.*comp/i),
  aggWf:    findRule(/aggregate.*(wf|workforce)/i),
  clearWf:  findRule(/clear.*(wf|workforce) ?exp/i) || findRule(/clear.*(wf|workforce)/i),
};

// ── form groups (by path/name, not by cube number) ───────────────────
// Workforce forms are scoped by their path so other modules' "Assumption"/"Roster"
// forms (e.g. Indirect Expenses allocation assumptions) don't leak in.
const wfAll = forms.filter(f => /Workforce/i.test(f.path || ''));
const G = {
  opexMain:   findForms(/OpEx/i).filter(f => !/Infolet/i.test(f.name)),
  advertising: findForms(/Advertising/i),
  travel:     findForms(/Travel|T&E|T&amp;E/i),
  indirect:   findForms(/Indirect Expense|Allocation/i).filter(f => !/COGS|Department(?!s)/i.test(f.name)),
  wfManage:   wfAll.filter(f => /Roster|New Hire|Employee (Update|Status)|Department (Update|Roster)/i.test(f.name)),
  wfSetup:    wfAll.filter(f => /SetUp|Set Up|Assumption|Pay Schedule/i.test(sig(f))),
  wfReports:  wfAll.filter(f => !isInput(f) && /Report|Compensation|Headcount|Benefit|Expense|Overview/i.test(f.name)),
};

// ── planning POV (substitution variables) ────────────────────────────
const POV = [
  ['CurrentScenario', sub('CurrentScenario'), 'The active planning scenario'],
  ['CurrentVersion', sub('CurrentVersion'), 'The working version'],
  ['FcstYr1', sub('FcstYr1'), 'First forecast / budget year'],
  ['FcstYr2', sub('FcstYr2'), 'Second forecast / budget year'],
  ['CurrentYr', sub('CurrentYr'), 'Current planning year'],
  ['CurrentMonth', sub('CurrentMonth'), 'Current period'],
  ['LastClosedMonth', sub('LastClosedMonth'), 'Last actualized period'],
].filter(r => r[1]);

const fd = kb.fdmee || {};
const dsCount = (fd.datasources || []).length;
const intCount = (fd.integrations || []).length;
const inputCount = forms.filter(isInput).length;

// ── seed-rule body (DATACOPY) for the callout ────────────────────────
function ruleSnippet(r, max = 160) {
  if (!r || !r.body) return null;
  const m = String(r.body).match(/DATACOPY[\s\S]{0,120}?;/i);
  if (m) return m[0].replace(/\s+/g, ' ').trim().slice(0, max);
  return null;
}
const seedSnippet = ruleSnippet(R.seed);

// ── compose ──────────────────────────────────────────────────────────
const L = [];
const P = (...x) => L.push(x.join(''));

P(`# ${CAP} — Loading Budget Data into NSPB`);
P('');
P(`### A practical guide to how budget data enters your NetSuite Planning & Budgeting application — with a focus on OpEx and Workforce`);
P('');
P(`> **Scope.** This guide describes how budget figures are entered, calculated, and consolidated in *your* NSPB application (app **HP-${appName}**), using the actual forms, business rules, and dimension structure found in your environment. Everything below reflects your current configuration. Where we suggest a way of working, it is offered as a **recommended approach to validate with your team**, not a prescription.`);
P('');
P('---');
P('');

// 1. three doors
P('## 1. How data gets into NSPB — the three doors');
P('');
P('In NSPB, budget data never lives in one place you "upload a file" to. It enters through one of three doors, and then **business rules** turn raw input into a calculated budget.');
P('');
P('| Door | What it is | When you use it |');
P('|---|---|---|');
P(`| **1. Input forms** | Web grids you type into; saving runs a rule | Day-to-day planning, adjustments, what-if |`);
P('| **2. SmartView (Excel)** | The native Excel add-in: paste a block, Submit | Bulk entry, copy from a spreadsheet model |');
P(`| **3. Data Management / FDMEE** | Rule-driven load from a file or ${appName} | Actuals, mass loads, repeatable imports |`);
P('');
P(`**Key idea:** for **OpEx and Workforce budgets**, doors 1 and 2 (forms and SmartView) are the primary path — you enter *drivers and assumptions*, and the rules compute the budgeted dollars. Door 3 (Data Management) is used in your app mainly to bring in **Actuals** from ${appName}${dsCount ? ` (${dsCount} datasources / ${intCount} integrations configured)` : ''} for variance reporting, and can optionally be used for bulk budget loads (see §5).`);
P('');

// 2. POV
P('## 2. Your budget point-of-view (where the numbers land)');
P('');
P('Every value in NSPB sits at an intersection of all dimensions. For budgeting, the coordinates that matter most are set by these substitution variables in your app today:');
P('');
if (POV.length) {
  P('| Variable | Current value | Meaning |');
  P('|---|---|---|');
  POV.forEach(([n, v, m]) => P(`| \`${n}\` | **${esc(v)}** | ${m} |`));
} else {
  P('_The planning substitution variables were not captured in this export; confirm the active Scenario, Version and forecast years with your admin._');
}
P('');
if (R.seed) {
  P(`> **How your budget is seeded.** Your application contains the rule **\`${esc(R.seed.name)}\`**${seedSnippet ? `, which performs:\n> \`${esc(seedSnippet)}\`` : '.'}`);
  P(`> In practice this means the **Budget scenario is typically seeded by copying a chosen Forecast year into a chosen Budget year**, and then refined.${R.seedWf ? ` A matching rule, \`${esc(R.seedWf.name)}\`, does the same for the Workforce cube.` : ''} The year is usually a runtime prompt, so the same rule works each cycle. *Recommended to confirm with your admin which forecast year you copy from at the start of each budget round.*`);
  P('');
}

// 3. OpEx
P('## 3. Loading **OpEx** budget');
P('');
if (G.opexMain.length) {
  P('Your OpEx budget is built two ways: **driver-based expenses entered directly on the OpEx forms**, and **detailed driver schedules** (advertising, travel, allocations) that roll up into OpEx.');
  P('');
  P('### 3a. Direct OpEx entry');
  P('');
  P('Navigate to **Planning → OpEx**. The working forms:');
  P('');
  P('| Form | Purpose |');
  P('|---|---|');
  P(formRows(G.opexMain.slice(0, 10), f => f.description ? clip(f.description, 66) : (
    /Trend/i.test(f.name) ? 'Drive forecast from a trend type + adjustment %' :
    /Adjustment/i.test(f.name) ? 'Apply a top-side adjustment without touching detail' :
    /Department/i.test(f.name) ? 'Entry grid — budget by account × department' :
    /Flex/i.test(f.name) ? 'Flexible ad-hoc layout for power users' :
    /Report/i.test(f.name) ? 'Review / validation view' : 'OpEx entry / review')));
  P('');
  if (R.opexSave) {
    P(`**What happens on save.** Saving an OpEx form runs the rule **\`${esc(R.opexSave.name)}\`**, which recalculates expense for the forecast years based on the **trend type and adjustment percentage** you set, across departments, classes, locations and subsidiaries. So you don't type every cell — you set the **driver (trend + %)** and the rule projects the months.`);
    P('');
    P('> **Recommended workflow:** (1) set the trend basis on the OpEx Trend form, (2) review the projection on OpEx by Department, (3) apply any one-off corrections on the Top Level Adjustment form so detail stays auditable.');
    P('');
  }
} else {
  P(`_No forms matching "OpEx" were found in this application; operating-expense planning may be organized under a different module name. Confirm with your admin._`);
  P('');
}
const schedules = [
  ['Advertising', G.advertising],
  ['Travel & Expense', G.travel],
  ['Indirect Expense / Allocations', G.indirect],
].filter(([, fs_]) => fs_.length);
if (schedules.length) {
  P('### 3b. Driver-based expense schedules');
  P('');
  P('These specialized sub-modules feed OpEx. Each has a *Setup/Input* form (where you enter assumptions) and read-only *Schedule/Trend* views — budgeting them means entering the **assumption**, not the result:');
  P('');
  P('| Module | Input forms (enter here) |');
  P('|---|---|');
  schedules.forEach(([name, fs_]) => {
    const ins = fs_.filter(isInput).slice(0, 4).map(f => f.name).join(', ') || fs_.slice(0, 3).map(f => f.name).join(', ');
    P(`| **${name}** | ${esc(ins)} |`);
  });
  P('');
}

// 4. Workforce
P('## 4. Loading **Workforce** budget');
P('');
if (G.wfManage.length || G.wfSetup.length) {
  P('Workforce is a roster-driven model in its own cube. The flow is: **maintain the roster → set assumptions → run the comp calc → push the result into OpEx.**');
  P('');
  if (G.wfManage.length) {
    P('### Step 1 — Maintain employees');
    P('');
    P('| Form | Use |');
    P('|---|---|');
    P(formRows(G.wfManage.slice(0, 8), f => (
      /New Hire/i.test(f.name) ? 'Add to-be-hired (TBH) positions for the budget' :
      /Update/i.test(f.name) ? "Change an employee's attributes (status, salary, type)" :
      /Status/i.test(f.name) ? 'Confirm active / inactive' :
      /Roster/i.test(f.name) ? 'View and edit existing employees' : 'Maintain employees')));
    P('');
  }
  if (G.wfSetup.length) {
    P('### Step 2 — Set assumptions');
    P('');
    P('| Form | Drives |');
    P('|---|---|');
    P(formRows(G.wfSetup.slice(0, 6), f => (
      /Annual/i.test(f.name) ? 'Yearly rates (merit, benefits %, etc.)' :
      /Monthly/i.test(f.name) ? 'Month-level drivers' :
      /Location/i.test(f.name) ? 'Location-specific rates' :
      /Pay/i.test(f.name) ? 'How compensation spreads across periods' : 'Workforce assumptions')));
    P('');
  }
  if (R.comp) {
    P('### Step 3 — Calculate compensation');
    P('');
    P(`Run the rule **\`${esc(R.comp.name)}\`**. It clears the employee-expense and headcount accounts for the forecast years, then recalculates **existing + TBH** employees from the roster and assumptions. This is what turns "a roster + rates" into "budgeted salary, benefits, taxes and headcount."`);
    P('');
  }
  if (R.aggWf) {
    P('### Step 4 — Push Workforce into the financial budget');
    P('');
    P(`Workforce expense must reach the financial (Plan) cube to appear in OpEx and the P&L. Your app does this with **\`${esc(R.aggWf.name)}\`**, which aggregates the calculated employee expenses into OpEx${R.clearWf ? `. There is also **\`${esc(R.clearWf.name)}\`** to reset before a fresh push` : ''}.`);
    P('');
    P(`> **Recommended Workforce budget sequence:** update roster / add TBH → set assumptions → \`${esc((R.comp || {}).name || 'CalcComp')}\` → \`${esc(R.aggWf.name)}\` — then verify totals on Total Compensation and Headcount by Department.`);
    P('');
  }
  if (G.wfReports.length) {
    P(`**Reviewing Workforce results (read-only):** ${G.wfReports.slice(0, 8).map(f => f.name).join(' · ')}.`);
    P('');
  }
} else {
  P('_No Workforce forms were detected in this application — the Workforce module may not be installed. If you plan headcount and compensation elsewhere, confirm the approach with your admin._');
  P('');
}

// 5. bulk loading
P('## 5. Bulk loading (when forms are too slow)');
P('');
P('For a large budget you usually don\'t type form-by-form. Two suggested approaches, to validate against your governance:');
P('');
P('**A. SmartView paste (recommended for most cases).** Open the relevant input form in the Excel SmartView add-in, paste a prepared block at the matching POV, and **Submit**. Saving triggers the same rules as the web form, so calculations stay consistent. Best for: a planner moving a finished Excel model into NSPB.');
P('');
P(`**B. Data Management load (recommended for repeatable / high-volume).**${dsCount ? ` Your environment already has **${dsCount} ${appName} datasources** wired through Data Management.` : ''} The same machinery can load a **budget** file by targeting the budget POV (Scenario = Budget, Version, budget year). Best for: an annual bulk seed, or syncing budget from an external system on a schedule.`);
P('');
P(`> Today these integrations are oriented to **Actuals** (for variance). Re-using them for budget loads is feasible but should be **scoped and tested with your admin** before a live cycle, since a misaimed load rule can overwrite planned data.`);
P('');

// 6. cycle
P('## 6. Putting it together — the budget cycle');
P('');
P('```');
const seedName = (R.seed || {}).name || 'Copy Fcst to Budget';
const compName = (R.comp || {}).name || 'CalcComp';
const aggName = (R.aggWf || {}).name || 'Aggregate WF Expenses';
P(`1. Seed        ${seedName}  (Forecast year -> Budget year)`);
P(`2. OpEx        Enter drivers on OpEx + schedules -> save runs ${(R.opexSave || {}).name || 'the OpEx rule'}`);
P(`3. Workforce   Roster + assumptions -> ${compName} -> ${aggName}`);
P('4. Consolidate Aggregation rolls Department/Class up to totals');
P('5. Review      OpEx Report, Total Compensation, Income Statement dashboard');
P('6. Variance    Actuals (Data Management) vs Budget on the variance forms');
P('```');
P('');

// 7. checklist
P('## 7. Pre-submission checklist (suggested)');
P('');
P('- [ ] Confirmed the **source forecast year** before running the budget-seed rule.');
P('- [ ] OpEx drivers (trend + adjustment %) reviewed before projecting.');
P('- [ ] All **TBH positions** added on the New Hires forms before the comp calc.');
P(`- [ ] Ran **${compName}**, then **${aggName}** (in that order).`);
P('- [ ] Workforce totals tie out vs the OpEx employee-expense lines.');
P('- [ ] Spot-checked a department against the prior cycle.');
P('- [ ] For any bulk load: tested on a **scratch version** first, not the working version.');
P('');
P('---');
P('');

// quick ref
P('### Quick reference — rules used in budgeting');
P('');
P('| Rule | Cube | What it does |');
P('|---|---|---|');
const qr = [
  [R.seed, 'Seeds Budget by copying a Forecast year'],
  [R.seedWf, 'Same, for the Workforce cube'],
  [R.opexSave, 'Projects OpEx from trend + adjustment % on save'],
  [R.comp, 'Recalculates employee comp & headcount from the roster'],
  [R.aggWf, 'Pushes Workforce expense up into OpEx'],
  [R.clearWf, 'Resets WF expense before a fresh aggregation'],
].filter(([r]) => r);
qr.forEach(([r, d]) => P(`| \`${esc(r.name)}\` | ${esc(r.cube || '—')} | ${d} |`));
P('');
P(`*Prepared by BPC. Figures and artifact names reflect the ${CAP} NSPB application (HP-${appName}) as captured from the current configuration. Suggested workflows should be validated with your team before a live budget cycle.*`);

fs.writeFileSync(path.join(dir, 'budget-import-guide.md'), L.join('\n') + '\n');
console.log(`✓ wrote clients/${CLIENT}/budget-import-guide.md  (OpEx forms: ${G.opexMain.length}, WF forms: ${G.wfManage.length + G.wfSetup.length}, rules detected: ${qr.length}/6)`);
