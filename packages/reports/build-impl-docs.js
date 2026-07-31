'use strict';
// ============================================================
// Build "My Implementation Docs" — implementation-focused curated articles for
// a client, straight from the LCM parse output (clients/<CLIENT>/tenant-kb.json).
//
//   node tools/build-impl-docs.js <CLIENT>
//
// Unlike tools/build-env-docs.js (which needs the usage-AUDIT — state-report.md
// + audit JSONs and answers "what's used vs not"), this generator answers
// "what is IMPLEMENTED, especially the navigation flow" from the tenant-kb ALONE.
// It goes high-level → detail: how it's installed → the planning workflow (nav
// flow) → how the areas connect → how to load data.
//
// Output: clients/<CLIENT>/env-docs/NN-*.md  (publish-env-kb.mjs picks these up
// as curated "extra" docs). Diagrams are raw inline SVG/HTML wrapped in
// <div class="bpc-chart"> and styled by the hub's kb.css. Driven by tenant-kb
// fields navigationFlows / fdmee / dimensions / forms / dashboards — NEVER the
// unreliable `cube` field.
// ============================================================

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CLIENT = process.argv[2] || 'symetri';
const dir = path.join(ROOT, 'clients', CLIENT);
const KB = JSON.parse(fs.readFileSync(path.join(dir, 'tenant-kb.json'), 'utf8'));

const arr = x => (Array.isArray(x) ? x : []);
const s = x => (x == null ? '' : String(x));
const fmt = x => Number(x).toLocaleString('en-US');
const he = x => s(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ── BPC design tokens (same palette as the PDF / build-env-docs) ─────
const NAVY = '#1F3C51', SAGE = '#619C8A', GOLD = '#F2CC5F', ORANGE = '#EC8842', DANGER = '#C9512E';

// CommonMark ends a raw-HTML block at the first blank line → strip internal
// blank lines so rehype-raw renders the whole SVG/HTML as one block.
const clean = x => s(x).split('\n').filter(l => l.trim() !== '').join('\n');
const wrap = svgOrHtml => `<div class="bpc-chart">\n${clean(svgOrHtml)}\n</div>`;

// ── derive the friendly facts from the tenant-kb ────────────────────
const CAP = CLIENT[0].toUpperCase() + CLIENT.slice(1);
// The planning app's own name (e.g. Talogy = "PAI_PLN"). Some instances register
// it as "NetSuite", which collides with the ERP source label — fall back to the
// client name there so the diagrams read cleanly.
const RAWAPP = s(KB.appName);
const APP = (RAWAPP && !/^netsuite$/i.test(RAWAPP)) ? RAWAPP : CAP;
const forms = arr(KB.forms);
const rules = arr(KB.rules);
const dashboards = arr(KB.dashboards);
const navFlows = arr(KB.navigationFlows);
const ds = arr(KB.fdmee && KB.fdmee.datasources);
const integrations = arr(KB.fdmee && KB.fdmee.integrations);
const dims = Object.entries(KB.dimensions || {}).map(([name, v]) => ({
  name, count: Array.isArray(v) ? v.length : (v && v.count) || 0,
}));
const inputForms = forms.filter(f => f.isInput).length;
// every module across all nav flows, in declared (workflow) order
const modules = navFlows.flatMap(n => arr(n.modules).map(m => ({
  flow: s(n.name), module: s(m.module), tabs: arr(m.tabs).map(s).filter(Boolean),
})));

// One-line purpose per module (substring match on the module name; generic
// fallback). Keeps the generator content-free of client specifics.
const MODULE_PURPOSE = [
  [/revenue|gross margin/i, 'Plan revenue and gross margin by product, customer or driver'],
  [/workforce|headcount|compensation/i, 'Plan headcount, salaries and benefits by employee'],
  [/\bopex\b|operating exp/i, 'Plan operating expenses by department'],
  [/budget/i, 'Annual budget input across the P&L'],
  [/income statement|p&l|profit/i, 'Review the planned vs actual P&L'],
  [/balance sheet trend/i, 'Trend analysis of the balance sheet'],
  [/balance sheet/i, 'Plan and review the balance sheet'],
  [/cash ?flow/i, 'Plan cash flow and liquidity'],
  [/capital|capex|asset/i, 'Plan capital expenditure and assets'],
  [/project/i, 'Plan project costs and revenue'],
  [/fx|exchange rate|currency/i, 'Maintain FX rates used for currency conversion'],
  [/days in month|calendar/i, 'Calendar driver — working/calendar days per period'],
  [/version/i, 'Manage plan versions (working, final, what-if)'],
  [/scenario|rollup/i, 'Scenario and rollup configuration'],
  [/template/i, 'Reusable form and calculation templates'],
  [/model/i, 'The underlying planning models (cubes)'],
  [/tag/i, 'Tagging and metadata'],
  [/assumption|driver|rate/i, 'Set the assumptions and drivers other modules use'],
];
const purposeOf = name => (MODULE_PURPOSE.find(([re]) => re.test(name)) || [])[1] || 'Planning module';

// ── small SVG box helper (rounded rect + accent bar + title + sub) ────
function box(x, y, w, h, title, sub, color, fill = '#fff') {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="7" fill="${fill}" stroke="${color}" stroke-width="1.6"/>` +
    `<rect x="${x}" y="${y}" width="4.5" height="${h}" rx="2" fill="${color}"/>` +
    `<text x="${x + 12}" y="${y + 19}" font-size="10.5" font-weight="600" fill="${NAVY}" font-family="Sarabun">${he(title)}</text>` +
    (sub ? `<text x="${x + 12}" y="${y + 34}" font-size="8" fill="#6b7280" font-family="Sarabun">${he(sub)}</text>` : '');
}
const HDR = (x, t) => `<text x="${x}" y="16" font-size="9" font-weight="700" letter-spacing=".06em" fill="${SAGE}" font-family="Sarabun">${he(t.toUpperCase())}</text>`;
const flow = (ax, ay, bx, by) => `<path d="M${ax} ${ay} C ${(ax + bx) / 2} ${ay}, ${(ax + bx) / 2} ${by}, ${bx} ${by}" stroke="#94A6B3" stroke-width="1.4" fill="none" marker-end="url(#ia)"/>`;
const MARKER = `<defs><marker id="ia" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto"><path d="M0,0 L7,3 L0,6 Z" fill="#94A6B3"/></marker></defs>`;

// ============================================================
// Diagram 1 — overview "how it's installed": source → app → consumers + stats
// ============================================================
function overviewMap() {
  const W = 720, H = 150;
  let g = MARKER;
  g += HDR(8, 'Source') + HDR(270, 'Your planning application') + HDR(560, 'Consumers');
  g += box(8, 55, 170, 50, 'NetSuite ERP', `${fmt(ds.length)} data feeds · ${fmt(integrations.length)} metadata syncs`, NAVY);
  g += box(270, 48, 200, 64, APP, `${modules.length} modules · ${fmt(forms.length)} forms · ${fmt(rules.length)} rules`, SAGE);
  g += box(560, 55, 152, 50, 'Smart View · Dashboards', `${fmt(dashboards.length)} dashboards · reports`, NAVY);
  g += flow(178, 80, 270, 80) + flow(470, 80, 560, 80);
  const stat = (n, l, c) => `<div style="flex:1;min-width:96px;text-align:center"><div style="font-family:Sarabun;font-weight:600;font-size:23px;color:${c};line-height:1">${he(n)}</div><div style="font-size:9px;color:#767676;margin-top:3px">${he(l)}</div></div>`;
  const stats = `<div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:6px">` +
    stat(modules.length, 'navigation modules', SAGE) +
    stat(fmt(inputForms) + ' / ' + fmt(forms.length), 'input forms / total', NAVY) +
    stat(fmt(rules.length), 'business rules', GOLD) +
    stat(dims.length, 'dimensions', ORANGE) +
    stat(fmt(dashboards.length), 'dashboards', NAVY) +
    stat(fmt(ds.length), 'data feeds (NetSuite)', SAGE) +
    `</div>`;
  return wrap(`<div class="charts"><div class="card"><div class="ct">How your environment is built — source, application, consumers</div>` +
    `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:720px">${g}</svg>${stats}` +
    `<div class="cap">Your <b>${he(APP)}</b> application is fed from NetSuite (${fmt(ds.length)} data feeds + ${fmt(integrations.length)} metadata syncs), organized into <b>${modules.length} planning modules</b>, and consumed through Smart View, ${fmt(dashboards.length)} dashboards and reports.</div></div></div>`);
}

// ============================================================
// Diagram 2 — navigation flow as numbered workflow steps (centerpiece)
// ============================================================
function navFlowDiagram() {
  if (!modules.length) return '';
  const flowName = navFlows[0] ? s(navFlows[0].name) : 'Navigation flow';
  const cards = modules.map((m, i) => {
    const structural = m.tabs.length === 0;
    const col = structural ? '#9aa3ab' : SAGE;
    const badge = structural ? 'setup' : `${m.tabs.length} screen${m.tabs.length > 1 ? 's' : ''}`;
    return `<div class="sc-row" style="align-items:flex-start">` +
      `<span style="flex-shrink:0;width:22px;height:22px;border-radius:50%;background:${col};color:#fff;font-size:11px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;font-family:Sarabun">${i + 1}</span>` +
      `<div style="flex:1;min-width:0"><b>${he(m.module)}</b> <span style="font-size:11px;color:#9aa3ab">· ${badge}</span>` +
      `<span class="sc-sub">${he(purposeOf(m.module))}</span></div></div>`;
  }).join('');
  return wrap(`<div class="charts"><div class="card" style="border-top:3px solid ${SAGE}">` +
    `<div class="ct">${he(flowName)} — the planning workflow, in order</div>${cards}` +
    `<div class="cap">The navigation flow defines what users see and the <b>intended order</b> of work: earlier modules (assumptions, drivers) are completed before the statements that depend on them. Grey-numbered items are setup/structure, not data-entry screens.</div></div></div>`);
}

// ============================================================
// Diagram 3 — how the planning areas connect (drivers → IS → BS → CF)
// ============================================================
function planningAreaFlow() {
  const has = re => modules.filter(m => re.test(m.module)).map(m => m.module);
  const drivers = [...new Set([
    ...has(/revenue|gross margin/i), ...has(/workforce/i), ...has(/\bopex\b|operating exp/i),
    ...has(/budget/i), ...has(/capital|capex/i), ...has(/project/i),
  ])];
  const is = has(/income statement|p&l|profit/i);
  const bs = [...new Set([...has(/balance sheet/i)])];
  const cf = has(/cash ?flow/i);
  if (!drivers.length && !is.length) return '';
  const W = 720, colW = 168, rowH = 30;
  const xD = 8, xI = 250, xB = 440, xC = 600;
  const dH = Math.max(drivers.length * rowH + 10, 50);
  const H = Math.max(dH + 30, 150);
  const midY = 30 + dH / 2 - 22;
  let g = MARKER;
  g += HDR(xD, 'Drivers — where you input') + HDR(xI, 'Rolls into') + HDR(xB, 'Then') + HDR(xC, 'Then');
  // driver boxes (stacked)
  drivers.forEach((d, i) => { g += box(xD, 30 + i * rowH, colW, rowH - 6, d, '', SAGE); });
  // income statement
  if (is.length) {
    g += box(xI, midY, colW, 44, is[0] || 'Income Statement', 'planned P&L', GOLD);
    drivers.forEach((d, i) => { g += flow(xD + colW, 30 + i * rowH + (rowH - 6) / 2, xI, midY + 22); });
  }
  // balance sheet
  if (bs.length) {
    g += box(xB, midY, 150, 44, bs[0], bs.length > 1 ? `+ ${bs.length - 1} more` : 'planned BS', NAVY);
    if (is.length) g += flow(xI + colW, midY + 22, xB, midY + 22);
  }
  // cash flow
  if (cf.length) {
    const prevX = bs.length ? xB + 150 : (is.length ? xI + colW : xD + colW);
    const prevYok = midY + 22;
    g += box(xC, midY, 112, 44, cf[0], 'liquidity', ORANGE);
    g += flow(prevX, prevYok, xC, midY + 22);
  }
  return wrap(`<div class="charts"><div class="card"><div class="ct">How the planning areas connect</div>` +
    `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:720px">${g}</svg>` +
    `<div class="cap">The driver modules (where you enter data) roll up into the <b>Income Statement</b>${bs.length ? ', then the <b>Balance Sheet</b>' : ''}${cf.length ? ', and finally <b>Cash Flow</b>' : ''} — the standard EPBCS Financials flow. Plan the drivers first; the statements derive from them.</div></div></div>`);
}

// ============================================================
// Diagram 4 — how data loads in (NetSuite → feeds + syncs → app)
// ============================================================
function integrationMap() {
  if (!ds.length && !integrations.length) return '';
  const W = 720, H = 210;
  let g = MARKER;
  g += HDR(8, 'NetSuite source') + HDR(250, 'What it loads') + HDR(540, 'Your application');
  g += box(8, 85, 170, 46, 'NetSuite ERP', '1 connected source', NAVY);
  g += box(250, 36, 200, 46, `${fmt(ds.length)} data feeds`, 'actuals, balances, FX, transactions', SAGE);
  g += box(250, 128, 200, 46, `${fmt(integrations.length)} metadata syncs`, 'dimensions: accounts, dept, class…', GOLD);
  g += box(540, 85, 172, 46, APP, `${modules.length} modules`, NAVY);
  g += flow(178, 108, 250, 59) + flow(178, 108, 250, 151);
  g += flow(450, 59, 540, 100) + flow(450, 151, 540, 116);
  return wrap(`<div class="charts"><div class="card"><div class="ct">How data loads in — NetSuite → ${APP}</div>` +
    `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:720px">${g}</svg>` +
    `<div class="cap">Two kinds of load keep the application current: <b>${fmt(ds.length)} data feeds</b> bring in actuals/balances/FX, and <b>${fmt(integrations.length)} metadata syncs</b> keep dimension members (accounts, departments, classes…) in step with NetSuite. Both run through Data Management (FDMEE).</div></div></div>`);
}

// data-feed category table (strip the "NSPB (Data) PF" prefix, group)
function dataFeedTable() {
  if (!ds.length) return '';
  const cat = {};
  for (const d of ds) {
    let name = s(d.name).replace(/^NSPB\s*\(Data\)\s*/i, '').replace(/^PF\s+/i, '').trim();
    const dash = name.indexOf(' - ');
    const c = dash >= 0 ? name.slice(0, dash).trim() : name;
    const v = dash >= 0 ? name.slice(dash + 3).trim() : '';
    (cat[c] = cat[c] || []).push(v);
  }
  const rows = Object.entries(cat).sort(([a], [b]) => a.localeCompare(b)).map(([c, vs]) => {
    const variants = vs.filter(Boolean);
    return `| ${c} | ${variants.length ? variants.join(', ') : '—'} |`;
  }).join('\n');
  return `### Data feeds by category (${ds.length} feeds, ${Object.keys(cat).length} types)\n\n| Category | Variants |\n| --- | --- |\n${rows}`;
}

// ============================================================
// Assemble the 4 articles (first line H1 = title for the publish script)
// ============================================================
const PREP = `_Generated from your environment export (LCM) · ${s(KB.generatedAt).slice(0, 10) || 'current'} · prepared by BPC_`;

const moduleList = modules
  .map((m, i) => `${i + 1}. **${m.module}**${m.tabs.length ? ` — ${m.tabs.length} input screen${m.tabs.length > 1 ? 's' : ''}` : ' _(setup/structure)_'}: ${purposeOf(m.module)}`)
  .join('\n');

const ARTICLES = [
  {
    file: '01-how-its-built.md',
    md: `# How Your Environment Is Built

${PREP}

${overviewMap()}

## What's implemented

Your **${APP}** application is a full Oracle NSPB (Hyperion Planning) environment:

- **${modules.length} planning modules** organized into one navigation flow (the working order users follow).
- **${fmt(forms.length)} forms** (${fmt(inputForms)} for data entry, the rest for review/reporting).
- **${fmt(rules.length)} business rules** that calculate, roll up and move data.
- **${dims.length} dimensions** — ${dims.slice(0, 8).map(d => d.name).join(', ')}${dims.length > 8 ? '…' : ''}.
- **${fmt(dashboards.length)} dashboards** plus Smart View and report access.
- **${fmt(ds.length)} NetSuite data feeds** and **${fmt(integrations.length)} metadata syncs** keeping it current.

The rest of these guides go from here into detail: the **navigation flow** (how you work), **how the areas connect**, and **how data loads in**. For the full inventory of every form, rule and dimension, see the sections below this one.
`,
  },
  {
    file: '02-navigation-flow.md',
    md: `# Your Navigation Flow

_The navigation flow is the heart of how the application is meant to be used — what each user sees, and the order to work in._

${navFlowDiagram()}

## The modules, in order

${moduleList}

> Work top-to-bottom: the assumption/driver modules feed the statements below them. If a number looks wrong on a statement, check the driver module that feeds it first.
`,
  },
  {
    file: '03-how-areas-connect.md',
    md: `# How the Planning Areas Connect

_Where you input data, and how it rolls up into the financial statements._

${planningAreaFlow()}

## Reading the flow

You enter data in the **driver** modules (revenue, workforce, operating expense, budget). Business rules roll those inputs up into the **Income Statement**, which in turn feeds the **Balance Sheet** and **Cash Flow**. This is the standard Oracle EPBCS Financials design.

Practical takeaway: always plan the drivers **before** reviewing the statements — the statements are calculated from the driver inputs, not entered directly.
`,
  },
  {
    file: '04-how-to-load-data.md',
    md: `# How Data Loads In

_How actuals and master data reach your application from NetSuite._

${integrationMap()}

## Two kinds of load

- **Data feeds (${fmt(ds.length)})** — bring in the numbers: actuals, balances, FX rates and transactions.
- **Metadata syncs (${fmt(integrations.length)})** — keep your dimension members (accounts, departments, classes, currencies…) in step with NetSuite, so new master data shows up automatically.

Both run through **Data Management (FDMEE)**. To load a budget or plan into the application, see the **Budget Loading Guide** in this space.

${dataFeedTable()}
`,
  },
];

// ── write ────────────────────────────────────────────────────────────
const outDir = path.join(dir, 'env-docs');
fs.mkdirSync(outDir, { recursive: true });
for (const f of fs.readdirSync(outDir)) if (/^\d\d-.*\.md$/.test(f)) fs.unlinkSync(path.join(outDir, f));

let total = 0;
for (const a of ARTICLES) {
  fs.writeFileSync(path.join(outDir, a.file), a.md, 'utf8');
  total += a.md.length;
  console.log(`  ✓ ${a.file.padEnd(26)} ${(a.md.length / 1024).toFixed(1)} KB`);
}
console.log(`\n✅ ${ARTICLES.length} implementation-docs articles written to clients/${CLIENT}/env-docs/  (${(total / 1024).toFixed(0)} KB, app "${APP}")`);
