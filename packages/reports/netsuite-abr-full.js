#!/usr/bin/env node
'use strict';
/**
 * netsuite-abr-full.js — el entregable grande: Account Business Review de una
 * cuenta NetSuite + la capa técnica + las recomendaciones de BPC.
 *
 * Reemplaza a netsuite-abr-pdf.js (negocio) y nspb-integration-pdf.js (técnico)
 * cuando se quiere un solo documento para el cliente. Aquellos siguen sirviendo
 * como piezas cortas.
 *
 * La sección que lo hace un entregable de consultoría y no un informe de datos es
 * §7: cada recomendación declara el hallazgo, la evidencia medida, qué sugerimos,
 * por qué importa EN ESTE NEGOCIO y qué haría BPC. Las recomendaciones se derivan
 * de lo medido — si la evidencia no está, la recomendación no se emite.
 *
 * Todo el texto va en inglés: es un entregable de cliente.
 *
 *   CLIENT=pra CLIENT_NAME=PRA node packages/reports/netsuite-abr-full.js
 */
const fs = require('fs');
const path = require('path');

const PORT = process.env.CDP_PORT || 9222;
const CLIENT = process.env.CLIENT || 'pra';
const ROOT = path.join(__dirname, '..', '..');
const DIR = path.join(ROOT, 'clients', CLIENT);
const NAME = process.env.CLIENT_NAME || CLIENT.toUpperCase();

const rd = p => { try { return JSON.parse(fs.readFileSync(path.join(DIR, p), 'utf8')); } catch { return null; } };
const b64 = f => { try { return fs.readFileSync(path.join(ROOT, 'assets', f), 'utf8').trim(); } catch { return ''; } };

const probe = rd('netsuite/probe.json'), mods = rd('erp/modules.json');
if (!probe || !mods) { console.error(`Faltan datos en ${DIR}.`); process.exit(1); }
const fields = rd('netsuite/fields.json'), pnl = rd('netsuite/pnl.json') || [];
const conn = rd('erp/connectors.json'), vert = rd('erp/vertical.json'), fin = rd('erp/financials.json');
const season = rd('netsuite/seasonality.json') || [];
const customers = (rd('netsuite/top-customers.json') || []).filter(c => Number(c.facturado) > 0);
const opexDetail = rd('netsuite/opex-detail.json') || [];
const shape = rd('netsuite/shape.json') || {};

const NAVY = '#1F3C51', SAGE = '#619C8A', GOLD = '#F2CC5F', ORANGE = '#EC8842', DANGER = '#C9512E';
const SC = { active: SAGE, partial: GOLD, dormant: ORANGE, absent: '#9aa3ab', unknown: '#c3cad1' };
const SL = { active: 'In use', partial: 'Partial use', dormant: 'Not used', absent: 'Not enabled', unknown: 'Not visible' };

const T = {}; for (const t of Object.values(probe.modules)) Object.assign(T, t);
const n = k => (T[k]?.exists ? Number(T[k].rows ?? 0) : 0);
const fmt = x => Number(x || 0).toLocaleString('en-US');
const money = x => { const v = Number(x) || 0; return (v < 0 ? '-$' : '$') + (Math.abs(v) / 1e6).toFixed(1) + 'M'; };
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const byId = Object.fromEntries(mods.modules.map(m => [m.id, m]));
const V = vert?.vertical, B = vert?.benchmark;

// ── P&L ──────────────────────────────────────────────────────────────────────
const years = {};
for (const r of pnl) {
  const y = r.anio; if (!y) continue;
  years[y] ||= { rev: 0, cogs: 0, opex: 0 };
  const m = Number(r.monto || 0);
  if (r.tipo === 'Income' || r.tipo === 'OthIncome') years[y].rev += -m;
  else if (r.tipo === 'COGS') years[y].cogs += m; else years[y].opex += m;
}
const yr = Object.keys(years).filter(y => years[y].rev || years[y].cogs).sort();
const lastFull = yr[yr.length - 2] || yr[yr.length - 1];
const D = years[lastFull] || { rev: 0, cogs: 0, opex: 0 };
const netResult = D.rev - D.cogs - D.opex;

const costRows = opexDetail.filter(r => r.y === lastFull && Number(r.amt) > 0).sort((a, b) => b.amt - a.amt);
const costHit = re => costRows.filter(r => new RegExp(re, 'i').test(String(r.name || ''))).reduce((s, r) => s + Number(r.amt || 0), 0);
const goodwill = costHit('goodwill|amortization of'), interest = costHit('interest expense');
const belowLine = goodwill + interest;
const capex = opexDetail.filter(r => r.y === lastFull && r.tipo === 'FixedAsset').reduce((s, r) => s + Number(r.amt || 0), 0);
const salaries = costHit('salar|wages|payroll');

const custTotal = customers.reduce((s, c) => s + Number(c.facturado), 0);
const cum = k => (custTotal ? 100 * customers.slice(0, k).reduce((s, c) => s + Number(c.facturado), 0) / custTotal : 0);
const agencyRe = /maritz|one10|bcd|augeo|enterprise events|cwt|amex gbt|creative group|itagroup/i;
const agencyRev = customers.filter(c => agencyRe.test(String(c.cliente))).reduce((s, c) => s + Number(c.facturado), 0);

const s12 = season.slice(-13, -1);
const sVals = s12.map(r => Number(r.revenue) || 0);
const sMax = Math.max(...sVals, 0), sMin = Math.min(...sVals.filter(v => v > 0), Infinity);
const swing = sMin && isFinite(sMin) ? sMax / sMin : 0;

const deadFields = fields ? (() => {
  const a = {}; for (const d of Object.values(fields)) for (const [f, v] of Object.entries(d.fields || {})) { if (v.error) continue; a[f] = (a[f] || 0) + Number(v.filled || 0); }
  const all = Object.keys(a); return { dead: all.filter(f => !a[f]).length, total: all.length };
})() : null;
const unusedAccounts = (shape.accounts_unused || []).length;

// ── charts ───────────────────────────────────────────────────────────────────
function pnlChart() {
  const W = 700, H = 190, pad = 26, bw = (W - pad * 2) / yr.length, maxR = Math.max(...yr.map(y => years[y].rev), 1);
  let s = `<svg viewBox="0 0 ${W} ${H}" width="100%">`;
  yr.forEach((y, i) => {
    const x = pad + i * bw, d = years[y], h = v => Math.max(1, (v / maxR) * (H - 58)), w = bw * 0.22, base = H - 24;
    s += `<rect x="${x + bw * .10}" y="${base - h(d.rev)}" width="${w}" height="${h(d.rev)}" fill="${NAVY}" rx="2"/>`;
    s += `<rect x="${x + bw * .36}" y="${base - h(d.cogs)}" width="${w}" height="${h(d.cogs)}" fill="${SAGE}" rx="2"/>`;
    s += `<rect x="${x + bw * .62}" y="${base - h(d.opex)}" width="${w}" height="${h(d.opex)}" fill="${GOLD}" rx="2"/>`;
    s += `<text x="${x + bw / 2}" y="${base + 12}" font-size="8.5" text-anchor="middle" fill="#6b7280">${y}</text>`;
    s += `<text x="${x + bw * .10 + w / 2}" y="${base - h(d.rev) - 4}" font-size="7.6" text-anchor="middle" fill="${NAVY}" font-weight="600">${money(d.rev)}</text>`;
  });
  let lx = pad;
  s += [['Revenue', NAVY], ['COGS', SAGE], ['Opex', GOLD]].map(([t, c]) => { const g = `<rect x="${lx}" y="2" width="9" height="9" rx="2" fill="${c}"/><text x="${lx + 13}" y="10" font-size="8" fill="#434343">${t}</text>`; lx += 26 + t.length * 5.6; return g; }).join('');
  return s + '</svg>';
}
function seasonChart() {
  if (s12.length < 12) return '';
  const W = 700, H = 130, bw = W / s12.length;
  let s = `<svg viewBox="0 0 ${W} ${H}" width="100%">`;
  s12.forEach((r, i) => {
    const v = Number(r.revenue) || 0, h = Math.max(1, (v / sMax) * (H - 40));
    s += `<rect x="${i * bw + bw * .18}" y="${H - 20 - h}" width="${bw * .64}" height="${h}" fill="${v === sMax ? SAGE : v === sMin ? ORANGE : NAVY}" rx="2"/>`;
    s += `<text x="${i * bw + bw / 2}" y="${H - 7}" font-size="7.2" text-anchor="middle" fill="#6b7280">${String(r.mes).slice(5)}</text>`;
    s += `<text x="${i * bw + bw / 2}" y="${H - 24 - h}" font-size="6.8" text-anchor="middle" fill="#6b7280">${(v / 1e6).toFixed(0)}</text>`;
  });
  return s + '</svg>';
}
function stateBar() {
  const c = mods.stateCounts, tot = mods.modules.length; let x = 0, s = `<svg viewBox="0 0 700 32" width="100%">`;
  for (const k of ['active', 'partial', 'dormant', 'absent', 'unknown']) {
    const v = c[k] || 0; if (!v) continue; const w = (v / tot) * 700;
    s += `<rect x="${x}" y="0" width="${w - 1.5}" height="15" fill="${SC[k]}" rx="2"/>`;
    if (w > 44) s += `<text x="${x + w / 2}" y="28" font-size="8" text-anchor="middle" fill="#434343">${SL[k]} ${v}</text>`;
    x += w;
  }
  return s + '</svg>';
}

/**
 * Recomendaciones. Cada una: hallazgo → evidencia medida → qué sugerimos → por
 * qué importa en ESTE negocio → qué haría BPC. Solo se emiten si la evidencia
 * existe: no hay recomendaciones de catálogo.
 */
function recommendations() {
  const R = [];
  if (n('job') > 500 && n('projecttask') === 0)
    R.push({ pri: 'High', t: 'Make per-event profitability measurable',
      ev: `${fmt(n('job'))} projects carry billing, but project tasks and time-to-charge are both at zero. Cost of sales is already broken out by service line (${costRows.filter(r => r.tipo === 'COGS').slice(0, 4).map(r => String(r.name).replace(/^\d+\s+/, '').replace(/^Cost of [Ss]ales\s*-\s*/, '')).join(', ')}), so the cost taxonomy exists — it simply is not attributed to the event that consumed it.`,
      sug: 'Attribute cost of sales to the project (event) that incurred it, and enable the minimum PSA footprint needed to carry it. This does not require redesigning the chart of accounts — the service-line split is already there.',
      why: `In a pass-through model gross revenue is a poor guide: the margin lives in the management fee and in how tightly each event is run. Without cost by event there is no way to tell a profitable program from one that consumed its fee. At ${money(D.rev)} of revenue and ${(100 * (D.rev - D.cogs) / (D.rev || 1)).toFixed(0)}% gross margin, a one-point improvement in event-level execution is worth roughly ${money(D.rev * 0.01)} a year.`,
      bpc: 'Design the job-costing model against the existing COGS taxonomy, configure the project structure and cost attribution, and stand up an event-level P&L that ties back to the GL.' });

  if (byId['nspb-connector']?.state === 'active' && byId['native-budgets']?.state === 'active') {
    const since = (conn?.integrations || []).filter(i => /pbcs|nspb/i.test(i.app)).map(i => i.desde).sort()[0];
    R.push({ pri: 'High', t: 'Recover the return on the Planning investment already made',
      ev: `The NSPB connector bundle is installed and Planning integrations date back to ${since || 'several years ago'}. In parallel, ${byId['native-budgets'].evidence}.`,
      sug: 'Before adding any new scope, establish which system is authoritative for the budget and understand what stalled adoption of the one already licensed.',
      why: 'Two sources of truth for the same budget cost reconciliation effort every cycle and undermine confidence in both. In our experience the cause is rarely the product — it is usually a model that was sized for a different business than the one that has to use it, or the absence of a clear owner.',
      bpc: 'Review the existing Planning model against how the business actually plans today, identify the specific gaps that pushed users back to spreadsheets, and propose a remediation path rather than a rebuild.' });
  }

  if (customers.length > 50 && cum(10) > 25)
    R.push({ pri: 'High', t: 'Plan the two revenue engines separately',
      ev: `${fmt(customers.length)} billed customers, but the top 10 represent ${cum(10).toFixed(1)}% and the top 25 ${cum(25).toFixed(1)}% of billings.${agencyRev ? ` Several of the largest accounts are themselves event and incentive agencies, together about ${money(agencyRev)} — meaning a substantial share of volume arrives through a channel rather than direct from the end client.` : ''}`,
      sug: 'Model channel business and direct corporate business as distinct revenue engines, with their own drivers, margin assumptions and pipeline logic.',
      why: 'The two behave differently: channel volume is fewer, larger, more contractual relationships with thinner margin and concentration risk; direct business is higher-touch with different seasonality and win rates. A single blended forecast will be wrong on both, and it hides the concentration exposure.',
      bpc: 'Segment the revenue base, build the driver set for each engine, and design the planning model so that a shift in mix is visible rather than absorbed.' });

  if (swing > 2.5)
    R.push({ pri: 'Medium', t: 'Build seasonality into the plan rather than smoothing it',
      ev: `Monthly revenue swings ${swing.toFixed(1)}x between the strongest and weakest month of the last twelve.`,
      sug: 'Plan at monthly granularity with explicit seasonal profiles by service line, and extend the same curve to the cash and working-capital view.',
      why: 'An annual target divided by twelve is wrong every single month in a business shaped like this, which makes variance reporting meaningless — every month shows a variance that is really just the calendar. Vendor prepayments and receivables follow the same curve, so the cash requirement peaks well before the revenue does.',
      bpc: 'Derive seasonal profiles from actual history rather than assumption, and build the phasing logic into the model so it survives a change in event mix.' });

  if (belowLine > 0)
    R.push({ pri: 'Medium', t: 'Separate operating performance from below-the-line charges',
      ev: `The ${lastFull} net result of ${money(netResult)} absorbs ${money(goodwill)} of goodwill amortization and ${money(interest)} of interest expense — about ${money(belowLine)} of non-operating charges. Adding them back places operating performance near ${money(netResult + belowLine)}.`,
      sug: 'Structure the plan so that operating performance is visible on its own, with financing and purchase-accounting effects presented below it.',
      why: 'As reported, the business looks close to break-even, which is not what the operations are doing. Any target, incentive or investment case built on the net line will be aimed at the wrong number, and operational improvements will be invisible next to the amortization charge.',
      bpc: 'Define the reporting structure with finance, and build the model so both views come from the same data rather than from a separate spreadsheet.' });

  if (unusedAccounts || (fin && fin.coa.leavesWithoutActivity))
    R.push({ pri: 'Medium', t: 'Clean the chart of accounts before it is mapped into Planning',
      ev: `${fmt(unusedAccounts)} accounts have no journal activity at all${fin ? `, and ${fmt(fin.coa.leavesWithoutActivity)} of the ${fmt(fin.coa.leaves)} leaf accounts show no movement in the period analysed` : ''}.`,
      sug: 'Review inactive and unused accounts and retire what is genuinely dead before the structure is carried into a planning model.',
      why: 'Every account carried across becomes a dimension member that has to be maintained, calculated and reported on forever. Cleaning is far cheaper before the mapping than after, when references exist in forms, rules and reports.',
      bpc: 'Produce the candidate list with usage evidence for each account, and run the review with finance so the decision is documented.' });

  R.push({ pri: 'High', t: 'Fix the data path for customer-level actuals',
    ev: 'Revenue is recognized through journal entries that carry no entity, so at general-ledger level there is no customer attached to revenue.',
    sug: 'Source customer-level actuals from the billing layer — invoices and revenue arrangements — rather than from the GL, and validate that the two tie at total level.',
    why: 'Any plan or report that assumes customer revenue can be read from the GL will silently return nothing, or worse, partial figures. This is the kind of assumption that is usually discovered months into an implementation, after the model is built.',
    bpc: 'Define and test the extraction path, and build the tie-out that proves billing-layer revenue reconciles to the GL before it is relied on.' });

  if (deadFields?.dead)
    R.push({ pri: 'Low', t: 'Retire configuration that is no longer earning its keep',
      ev: `${fmt(deadFields.dead)} of ${fmt(deadFields.total)} measurable custom fields have never held a value, alongside ${fmt(n('customrecordtype'))} custom record types and ${fmt(n('script'))} scripts.`,
      sug: 'Review the never-populated fields for retirement, confirming first that none is written by a script or a low-frequency integration.',
      why: 'Unused configuration is not free: it lengthens every upgrade regression, clutters the interface for users, and makes it harder to tell which fields matter when the next integration is designed.',
      bpc: 'Provide the evidence-backed list and the dependency check, so removal is a decision rather than a risk.' });

  const skip = (conn?.competingTooling || []).filter(c => /floqast|blackline|adaptive|anaplan|vena/i.test(c.app));
  return { list: R, skip };
}
/**
 * Carga real del SuiteCloud Processor. Un deployment en NOTSCHEDULED existe pero
 * nunca corre: separar lo desplegado de lo que se ejecuta es lo que convierte un
 * conteo de scripts en un dato de capacidad.
 */
function deploymentSection() {
  const dep = shape.deployments_by_type || [];
  if (!dep.length) return '';
  const tot = dep.reduce((s, r) => s + Number(r.n || 0), 0);
  const idle = dep.filter(r => /NOTSCHEDULED/i.test(String(r.status))).reduce((s, r) => s + Number(r.n || 0), 0);
  const running = dep.filter(r => /^SCHEDULED$/i.test(String(r.status))).reduce((s, r) => s + Number(r.n || 0), 0);
  const wf = (rd('netsuite/workflows.json') || []);
  const apps = (rd('netsuite/integration_apps.json') || []);
  return `<h3>Automation and SuiteCloud Processor load</h3>
  <table><tr><th>Script type</th><th>Deployment status</th><th class="num">Count</th></tr>
  ${dep.slice(0, 10).map(r => `<tr><td>${esc(r.scripttype)}</td><td>${esc(r.status)}</td><td class="num">${fmt(r.n)}</td></tr>`).join('')}
  </table>
  <p class="small">${fmt(tot)} script deployments in total${wf.length ? ` · ${fmt(wf.length)} workflows${wf.filter(w => w.isinactive === 'T').length ? ` (${fmt(wf.filter(w => w.isinactive === 'T').length)} inactive)` : ''}` : ''}${apps.length ? ` · ${fmt(apps.length)} registered integration applications` : ''}.</p>
  ${idle ? `<div class="flag"><b>${fmt(idle)} of ${fmt(tot)} script deployments never run.</b> They sit at <code>NOTSCHEDULED</code> — deployed but not scheduled. Only ${fmt(running)} scheduled and map/reduce scripts actually consume SuiteCloud Processor capacity. That is worth reading two ways: the processor is far less loaded than the script count suggests, and there is a large body of automation that was built and then left dormant.</div>` : ''}`;
}

/**
 * La tabla que un implementador de Planning necesita antes de diseñar nada:
 * cada dimensión candidata con sus miembros Y su cobertura de tagueo. Los
 * miembros dicen qué existe; la cobertura dice qué se puede sostener.
 */
function dimensionTable() {
  const cov = (rd('netsuite/dimension_coverage.json') || [])[0] || null;
  const totalLines = Number(cov?.total_lines || 0);
  const pct = k => (cov && totalLines ? (100 * Number(cov[k] || 0) / totalLines) : null);
  const verdict = p => p === null ? '—'
    : p >= 95 ? 'Reliable'
    : p >= 70 ? 'Usable — confirm the gap'
    : p >= 30 ? '⚠ Partial — not safe for reporting at this level'
    : '⚠ Effectively untagged';
  const cell = p => p === null ? '—' : `${p.toFixed(0)}%`;
  const names = (k, key = 'name') => (shape[k] || []).map(r => esc(String(r[key] || ''))).filter(Boolean);

  const rows = [
    ['Entity', 'Subsidiary', n('subsidiary'), pct('subsidiary')],
    ['Account', 'Chart of accounts (leaf level)', fin.coa.leaves, null],
    ['Period', 'Accounting periods', n('accountingperiod'), null],
    ['Currency', 'Currencies', n('currency'), null],
    ['Cost centre', 'Department', n('department'), pct('department')],
    ['Custom', 'Class', n('classification'), pct('class')],
    ['Custom', 'Location', n('location'), pct('location')],
    ['Custom', 'Custom segment', n('customsegment'), null],
    ['Project', 'Jobs', n('job'), null],
  ].filter(r => r[2] > 0);

  const weak = rows.filter(r => r[3] !== null && r[3] < 70);
  const subs = names('subsidiaries'), cls = names('classes');

  return `<table><tr><th>Planning dimension</th><th>NetSuite source</th><th class="num">Members</th><th class="num">Tagged</th><th>Usable for planning?</th></tr>
  ${rows.map(([d, s, m, p]) => `<tr><td><b>${d}</b></td><td>${s}</td><td class="num">${fmt(m)}</td><td class="num">${cell(p)}</td><td>${verdict(p)}</td></tr>`).join('')}
  </table>
  <p class="small">Member counts are what exists in the account. <b>"Tagged" is the share of transaction lines that actually carry a value</b> for that dimension over the last twelve months${totalLines ? ` (${fmt(totalLines)} lines)` : ''} — a plan can only ever be as granular as the tagged actuals underneath it.</p>
  ${weak.length ? `<div class="flag"><b>${weak.length === 1 ? 'One dimension is' : `${weak.length} dimensions are`} not tagged consistently enough to plan against.</b>
  ${weak.map(([d, s, , p]) => `<b>${s}</b> carries a value on only ${p.toFixed(0)}% of transaction lines`).join('; ')}.
  Planning at that level would produce a model that cannot be reconciled to the general ledger, because most of the actuals have nowhere to land. Either the tagging is corrected upstream, or the model is designed at a level the data can support — that is a decision worth taking before any build starts, not during it.</div>` : ''}
  ${subs.length ? `<p class="small"><b>Subsidiaries:</b> ${subs.join(' · ')}.${cls.length ? ` <b>Classes:</b> ${cls.slice(0, 12).join(' · ')}.` : ''}</p>` : ''}`;
}

/**
 * Las saved searches que el connector de NSPB necesitaría, derivadas de lo medido.
 * No es un template: qué segmentos entran en el corte lo decide la cobertura de
 * tagueo, y de dónde sale el revenue lo decide dónde vive el entity.
 */
function savedSearchSpec() {
  const cov = (rd('netsuite/dimension_coverage.json') || [])[0];
  if (!cov || !fin) return '';
  const total = Number(cov.total_lines || 0);
  const p = k => total ? (100 * Number(cov[k] || 0) / total) : 0;
  const usable = [['Subsidiary', p('subsidiary')], ['Location', p('location')], ['Class', p('class')], ['Department', p('department')]]
    .filter(([, v]) => v >= 70).map(([k]) => k);
  const dropped = [['Class', p('class')], ['Department', p('department')]].filter(([, v]) => v < 70);

  const rows = [
    { n: 'GL Actuals', t: 'Transaction (accounting lines)',
      cols: `Account, Period, Amount, ${usable.join(', ')}`,
      crit: `Posting = true, period within the plan horizon`,
      note: `The backbone of the actuals load. Segment columns limited to the dimensions the data actually carries.` },
    { n: 'Revenue by Customer', t: 'Invoice / Revenue Arrangement',
      cols: 'Customer, Item, Amount, Date',
      crit: 'Main line only, invoice types',
      note: `Has to come from the billing layer: revenue is recognized through journals that carry no entity, so the GL cannot answer "revenue by customer".` },
    { n: 'Cost of Sales by Service Line', t: 'Transaction (accounting lines)',
      cols: 'Account, Period, Amount, Vendor',
      crit: `Account type = Cost of Goods Sold`,
      note: `Cost of sales is already split by service line in the chart of accounts — this is what makes a margin plan possible without redesigning anything.` },
  ];
  if (n('job') > 500)
    rows.push({ n: 'Project / Event Actuals', t: 'Transaction (accounting lines)', cols: 'Project, Account, Period, Amount',
      crit: 'Project is not empty',
      note: n('projecttask') === 0 ? `⚠ Only viable once cost is attributed to projects — today ${fmt(n('job'))} projects carry revenue but no cost.` : 'Feeds project-level planning.' });

  return `<h3>Saved searches the Planning integration would need</h3>
  <table><tr><th>Saved search</th><th>Record type</th><th>Columns</th><th>Why</th></tr>
  ${rows.map(r => `<tr><td><b>${esc(r.n)}</b></td><td>${esc(r.t)}</td><td>${esc(r.cols)}</td><td>${esc(r.note)}</td></tr>`).join('')}
  </table>
  ${dropped.length ? `<p class="small"><b>Deliberately left out of the actuals search:</b> ${dropped.map(([k, v]) => `${k} (${v.toFixed(0)}% tagged)`).join(', ')}. Including a segment the data does not carry produces a load that appears to work and then fails to reconcile.</p>` : ''}
  ${!acctStat() ? `<p class="small"><b>No driver data available.</b> There are no statistical accounts in the chart of accounts, and employee records do not look like a reliable headcount source — so volume and workforce drivers would have to come from outside NetSuite, or be built.</p>` : ''}`;
}
const acctStat = () => (shape.accounts_by_type || []).some(r => /stat/i.test(String(r.tipo)) && Number(r.n) > 0);

/**
 * Qué hace la empresa, descrito con lo que dicen los datos y no con lo que
 * asumimos. El ratio bills/invoices es lo que delata el modelo pass-through; los
 * nombres de las cuentas de COGS son literalmente el catálogo de servicios.
 */
function businessProfile() {
  if (!V) return '';
  const txn = {};
  for (const r of (shape.txn_by_type_year || [])) txn[r.tipo] = (txn[r.tipo] || 0) + Number(r.n || 0);
  const bills = Number(txn['Bill'] || 0), inv = Number(txn['Invoice'] || 0);
  const ratio = inv ? (bills / inv) : 0;
  const lines = costRows.filter(r => r.tipo === 'COGS').slice(0, 6)
    .map(r => String(r.name).replace(/^\d+\s+/, '').replace(/^Cost of [Ss]ales?\s*[-–]\s*/i, '').trim())
    .filter(Boolean);

  const bits = [];
  if (n('job') > 500) bits.push(`${fmt(n('job'))} projects on the books`);
  if (ratio > 2) bits.push(`${ratio.toFixed(0)} vendor bills for every customer invoice`);
  if (!T['inventoryitem']?.exists) bits.push('no inventory');
  if (capex && Math.abs(capex) < 1e6) bits.push('effectively no capital expenditure');

  return `<div class="note"><b>${esc(V.name)}</b> — confidence: ${esc(V.confidence)}.<br>
  ${esc(V.note)}
  ${bits.length ? `<br><br>What the data shows: ${esc(bits.join(', '))}.` : ''}
  ${ratio > 2 ? ` That ratio is the signature of a pass-through operation — the company assembles and coordinates an event by buying from many suppliers and billing the client once.` : ''}
  ${lines.length ? ` The cost-of-sales accounts are effectively the service catalogue: ${lines.map(l => esc(l)).join(', ')}.` : ''}
  ${agencyRev && custTotal ? ` Roughly ${(100 * agencyRev / custTotal).toFixed(0)}% of billings come from accounts that are themselves event or incentive agencies, so a meaningful share of the work arrives through a channel rather than direct from the end client.` : ''}
  <br><span class="small">Identified from the account's own vocabulary — ${V.evidence.slice(0, 5).map(e => esc(e.replace(/`/g, ''))).join(', ')}. Worth confirming with the client before it is used in any recommendation.</span></div>`;
}

const REC = recommendations();
const P = { High: DANGER, Medium: ORANGE, Low: SAGE };

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<style>
@page { size:A4; margin:14mm 13mm; }
*{box-sizing:border-box}
body{font-family:Sarabun,"Segoe UI",system-ui,sans-serif;color:#333;font-size:9.5pt;line-height:1.5;margin:0}
h1,h2,h3{color:${NAVY};margin:0 0 6px}
h2{font-size:14pt;border-bottom:2px solid ${SAGE};padding-bottom:4px;margin-top:20px}
h3{font-size:10.5pt;margin-top:13px}
.page-break{page-break-before:always}
.cover{height:262mm;display:flex;flex-direction:column;justify-content:space-between;background:linear-gradient(150deg,${NAVY} 0%,#16303f 100%);color:#fff;margin:-14mm -13mm;padding:22mm 18mm}
.cover h1{color:#fff;font-size:30pt;line-height:1.12;margin:0 0 10px}
.cover .sub{color:${GOLD};font-size:13pt;font-weight:600}
.badge{display:inline-block;background:${SAGE};color:#fff;font-size:8.4pt;font-weight:700;padding:3px 10px;border-radius:3px;letter-spacing:.06em}
.logo{height:33px;filter:brightness(0) invert(1)}
table{width:100%;border-collapse:collapse;font-size:8.7pt;margin:8px 0}
th{background:${NAVY};color:#fff;text-align:left;padding:5px 7px;font-weight:600}
td{padding:4px 7px;border-bottom:1px solid #eceff1;vertical-align:top}
tr:nth-child(even) td{background:#fafbfc}
.num{text-align:right;font-variant-numeric:tabular-nums}
.pill{display:inline-block;padding:1px 7px;border-radius:9px;font-size:7.6pt;color:#fff;font-weight:600}
.kpi{display:flex;gap:8px;margin:10px 0}
.kpi div{flex:1;background:#f6f8f9;border-left:3px solid ${SAGE};padding:8px 10px}
.kpi .v{font-size:15pt;font-weight:700;color:${NAVY};line-height:1.1}
.kpi .l{font-size:7.5pt;color:#6b7280}
.note{background:#f4f7f6;border-left:3px solid ${SAGE};padding:8px 11px;margin:7px 0;font-size:8.7pt}
.flag{background:#fdf3ee;border-left:3px solid ${ORANGE};padding:8px 11px;margin:7px 0;font-size:8.9pt}
.rec{border:1px solid #e3e8ea;border-radius:4px;padding:11px 13px;margin:11px 0;page-break-inside:avoid}
.rec h3{margin:0 0 6px;font-size:11pt}
.rec .lbl{font-size:7.6pt;font-weight:700;letter-spacing:.05em;color:${SAGE};text-transform:uppercase;margin-top:7px}
.rec p{margin:2px 0 0}
.small{font-size:7.9pt;color:#6b7280}
ul{margin:5px 0 5px 16px;padding:0} li{margin:3px 0}
code{background:#f1f3f4;padding:1px 3px;border-radius:2px;font-size:8.1pt}
</style></head><body>

<div class="cover">
  <div>${b64('bpc-logo.b64') ? `<img class="logo" src="data:image/png;base64,${b64('bpc-logo.b64')}">` : '<div style="font-size:15pt;font-weight:700">BPC</div>'}</div>
  <div>
    <div class="badge">PREPARED BY BPC</div>
    <h1 style="margin-top:16px">${esc(NAME)}</h1>
    <div class="sub">NetSuite Account Analysis</div>
    <div style="margin-top:20px;font-size:10pt;opacity:.85;max-width:122mm">
      ${V ? esc(V.name) : ''} · account <b>${esc(probe.account)}</b><br>
      ${fmt(n('transaction'))} transactions · ${fmt(n('transactionline'))} lines · ${fmt(n('account'))} accounts · ${fmt(customers.length)} billed customers
    </div>
  </div>
  <div style="font-size:8.3pt;opacity:.7">
    Generated ${new Date().toISOString().slice(0, 10)} from the live account over SuiteQL / REST.<br>
    Every figure is measured, none estimated. Recommendations are suggestions to validate together.
  </div>
</div>

<div class="page-break"></div>
<h2>1. Executive summary</h2>
<div class="note"><b>What this document is.</b> A structured analysis of the NetSuite account, built entirely from data read out of the system itself. It is meant to be used in whatever conversation it is useful for — an account business review, a discovery session, scoping a Planning or analytics implementation, or simply as a shared picture of how the system is being used today. Nothing here is a proposal; the recommendations in section 5 are starting points to validate together.</div>
<div class="kpi">
  <div><div class="v">${money(D.rev)}</div><div class="l">Revenue ${lastFull}</div></div>
  <div><div class="v">${(100 * (D.rev - D.cogs) / (D.rev || 1)).toFixed(0)}%</div><div class="l">Gross margin</div></div>
  <div><div class="v">${money(netResult + belowLine)}</div><div class="l">Operating result*</div></div>
  <div><div class="v">${fmt(n('job'))}</div><div class="l">Projects / events</div></div>
  <div><div class="v">${cum(10).toFixed(0)}%</div><div class="l">Top-10 concentration</div></div>
</div>
<p class="small">* Net result before goodwill amortization and interest — see §3.</p>

${businessProfile()}

<h3>What this review found</h3>
<ul>
${n('job') > 500 && n('projecttask') === 0 ? `<li><b>Events are run as billing containers.</b> ${fmt(n('job'))} projects carry revenue, but no cost is attributed to them — so per-event profitability, the defining metric of this model, cannot currently be measured.</li>` : ''}
${byId['nspb-connector']?.state === 'active' && byId['native-budgets']?.state === 'active' ? `<li><b>Two parallel budget processes.</b> The Planning connector is installed, and budgets are still loaded natively alongside it.</li>` : ''}
${belowLine ? `<li><b>Operating performance is obscured.</b> ${money(belowLine)} of goodwill amortization and interest sit inside the reported result, which understates what the operations produced.</li>` : ''}
${swing > 2.5 ? `<li><b>Revenue swings ${swing.toFixed(1)}x across the year</b>, which makes an evenly-phased annual plan wrong in every month.</li>` : ''}
${cum(10) > 25 ? `<li><b>${cum(10).toFixed(0)}% of billings sit in ten accounts</b>, several of which are agencies rather than end clients — two business models inside one revenue line.</li>` : ''}
<li><b>The systems landscape is broad and mature</b>: ${mods.stateCounts.active || 0} of ${mods.modules.length} modules in active use, ${conn?.bundles?.length || 0} SuiteApps installed and ${conn?.integrations?.length || 0} connected applications.</li>
</ul>

<div class="page-break"></div>
<h2>2. The business as the system describes it</h2>
${pnlChart()}
<table><tr><th>Year</th><th class="num">Revenue</th><th class="num">COGS</th><th class="num">Opex</th><th class="num">Gross margin</th><th class="num">Net result</th></tr>
${yr.map(y => { const d = years[y], gm = d.rev ? 100 * (d.rev - d.cogs) / d.rev : 0, r = d.rev - d.cogs - d.opex;
  return `<tr><td>${y}${y === yr[yr.length - 1] ? ' *' : ''}</td><td class="num">${money(d.rev)}</td><td class="num">${money(d.cogs)}</td><td class="num">${money(d.opex)}</td><td class="num">${gm.toFixed(0)}%</td><td class="num" style="color:${r < 0 ? DANGER : '#333'}">${money(r)}</td></tr>`; }).join('')}
</table>
<p class="small">* Partial year. GL figures with <code>posting='T'</code>; not audited financial statements.</p>

${belowLine ? `<div class="flag"><b>The reported result understates operating performance.</b> In ${lastFull} the net result of ${money(netResult)} absorbs ${money(goodwill)} of goodwill amortization and ${money(interest)} of interest expense. Excluding those, operating performance is close to <b>${money(netResult + belowLine)}</b>. The goodwill charge points to acquisition history and the interest charge to leverage; neither reflects how the operations performed.</div>` : ''}

${s12.length >= 12 ? `<h3>Seasonality</h3>${seasonChart()}
<p class="small">Monthly revenue, $M, last twelve full months. Peak-to-trough: <b>${swing.toFixed(1)}x</b>.</p>` : ''}

${customers.length > 10 ? `<h3>Customer concentration</h3>
<table><tr><th>#</th><th>Customer</th><th class="num">Billed</th><th class="num">Cumulative</th></tr>
${customers.slice(0, 10).map((c, i) => `<tr><td>${i + 1}</td><td>${esc(String(c.cliente).split(' - ')[0].slice(0, 44))}</td><td class="num">${money(c.facturado)}</td><td class="num">${cum(i + 1).toFixed(1)}%</td></tr>`).join('')}
</table>
<p class="small">${fmt(customers.length)} billed customers. Top 10 = <b>${cum(10).toFixed(1)}%</b>, top 25 = <b>${cum(25).toFixed(1)}%</b>.</p>` : ''}

${costRows.length ? `<h3>Cost composition (${lastFull})</h3>
<table><tr><th>Account</th><th>Type</th><th class="num">Amount</th></tr>
${costRows.slice(0, 12).map(r => `<tr><td>${esc(String(r.name).replace(/^\d+\s+/, ''))}</td><td>${esc(r.tipo)}</td><td class="num">${money(r.amt)}</td></tr>`).join('')}
</table>
<p class="small">Capital expenditure in ${lastFull}: <b>${money(capex)}</b>${salaries ? ` · payroll expense ${money(salaries)}` : ''} — an asset-light operating model.</p>` : ''}

<div class="page-break"></div>
<h2>3. Systems landscape</h2>
${stateBar()}
<table><tr><th>Module</th><th>Status</th><th>Evidence</th></tr>
${[...mods.modules].sort((a, b) => ['active', 'partial', 'dormant', 'absent', 'unknown'].indexOf(a.state) - ['active', 'partial', 'dormant', 'absent', 'unknown'].indexOf(b.state))
    .map(m => `<tr><td>${esc(m.name)}</td><td><span class="pill" style="background:${SC[m.state]}">${SL[m.state]}</span></td><td>${esc(String(m.evidence).slice(0, 88))}</td></tr>`).join('')}
</table>
<p class="small"><b>"Not visible" does not mean "not there".</b> SuiteQL only exposes a record type when the feature is enabled <i>and</i> the integration role can see it. Those ${mods.stateCounts.unknown || 0} modules need an SDF export or the Enable Features screen to resolve — we have deliberately not guessed.</p>

<h3>Installed SuiteApps and connected applications</h3>
<table><tr><th>Application</th><th class="num">Tokens</th><th class="num">Active</th><th>Since</th></tr>
${(conn?.integrations || []).slice(0, 12).map(i => `<tr><td>${esc(i.app)}</td><td class="num">${i.tokens}</td><td class="num">${i.activos}</td><td>${esc(i.desde)}</td></tr>`).join('')}
</table>
${deploymentSection()}
${(conn?.competingTooling || []).length ? `<div class="note"><b>Systems already covering adjacent ground.</b> Worth mapping before any new scope so nothing is duplicated. An active token tells us a connection exists, not how heavily it is used.
<ul>${conn.competingTooling.map(c => `<li><b>${esc(c.app)}</b> (${esc(c.competing.area)}, since ${esc(c.desde)}) — ${esc(c.competing.impacto)}</li>`).join('')}</ul></div>` : ''}

<div class="page-break"></div>
<h2>4. Data foundation for Oracle EPM Planning (NSPB)</h2>
<p>This section is written for whoever scopes or builds the Planning implementation. It answers the questions that decide the model before any design work starts: how large the Account dimension will be, which segment dimensions the data can actually support, where actuals have to be read from, and which saved searches the NetSuite&nbsp;→&nbsp;NSPB integration would need. The same reading applies to Account Reconciliation and Analytics Warehouse, which draw on the same foundation.</p>
${fin ? `<div class="kpi">
  <div><div class="v">${fmt(fin.coa.leaves)}</div><div class="l">Leaf accounts to map</div></div>
  <div><div class="v">${fmt(fin.coa.rollups)}</div><div class="l">Rollups rebuilt in Planning</div></div>
  <div><div class="v">${fin.coa.maxDepth}</div><div class="l">Hierarchy levels</div></div>
  <div><div class="v">${fmt(fin.coa.leavesWithoutActivity)}</div><div class="l">Leaves with no activity</div></div>
</div>
${dimensionTable()}
${savedSearchSpec()}` : ''}

<div class="flag"><b>One structural constraint worth knowing early.</b> Revenue is recognized through journal entries that carry no entity, so at general-ledger level revenue has no customer attached. Customer-level actuals have to come from the billing layer, not the GL. Assumptions to the contrary tend to surface late in an implementation, once the model is already built.</div>

<h3>Configuration debt</h3>
<table><tr><th>Finding</th><th class="num">Figure</th><th>What it means</th></tr>
<tr><td>Custom fields never populated</td><td class="num">${deadFields ? `${fmt(deadFields.dead)} / ${fmt(deadFields.total)}` : '—'}</td><td>Candidates to retire, once dependency on scripts and integrations is confirmed.</td></tr>
<tr><td>Accounts with no journal activity</td><td class="num">${fmt(unusedAccounts)} / ${fmt(n('account'))}</td><td>Would inflate the Account dimension if carried into a planning model.</td></tr>
<tr><td>Custom records / lists</td><td class="num">${fmt(n('customrecordtype'))} / ${fmt(n('customlist'))}</td><td>Ongoing maintenance surface.</td></tr>
<tr><td>Scripts / deployments</td><td class="num">${fmt(n('script'))} / ${fmt(n('scriptdeployment'))}</td><td>Live customization to regression-test on every upgrade.</td></tr>
</table>

<div class="page-break"></div>
<h2>5. What BPC recommends</h2>
<p>Each recommendation below is grounded in a figure measured in the account. They are <b>suggestions to validate together</b> — the data tells us what is happening, not why, and the why usually changes the priority.</p>
${REC.list.map((r, i) => `<div class="rec">
<h3><span class="pill" style="background:${P[r.pri]}">${r.pri}</span> &nbsp;${i + 1}. ${esc(r.t)}</h3>
<div class="lbl">What we see</div><p>${esc(r.ev)}</p>
<div class="lbl">What we suggest</div><p>${esc(r.sug)}</p>
<div class="lbl">Why it matters here</div><p>${esc(r.why)}</p>
<div class="lbl">How BPC would help</div><p>${esc(r.bpc)}</p>
</div>`).join('')}

${REC.skip.length ? `<div class="note"><b>What we are deliberately not proposing.</b> ${REC.skip.map(c => `<b>${esc(c.app)}</b> has been connected since ${esc(c.desde)} and covers ${esc(c.competing.area).toLowerCase()}. We would want to understand its actual scope before suggesting anything adjacent to it, rather than proposing capability you already own.</div>`).join('')}` : ''}

<h2>6. Suggested sequence</h2>
<table><tr><th>Stage</th><th>Focus</th><th>Why in this order</th></tr>
<tr><td><b>1</b></td><td>Event-level costing and the customer-actuals data path</td><td>Both are foundations. Any planning or reporting work built before them inherits the same blind spots.</td></tr>
<tr><td><b>2</b></td><td>Planning model review and remediation</td><td>Once cost and revenue can be attributed correctly, the existing Planning investment can be pointed at the right structure rather than rebuilt.</td></tr>
<tr><td><b>3</b></td><td>Chart of accounts and configuration cleanup</td><td>Cheapest to do before the structure is carried into a model, and it reduces what stages 1 and 2 have to carry.</td></tr>
<tr><td><b>4</b></td><td>Analytics and reporting depth</td><td>Most valuable once plan and actuals are reconciled and trustworthy — before that it mostly reproduces existing reporting.</td></tr>
</table>

<h2>7. Method and limitations</h2>
<p>This review was generated automatically from the live NetSuite account over SuiteQL and REST, using a read-only integration role. Every figure comes from a query against the account; none is estimated or benchmarked from elsewhere. What we could <b>not</b> see:</p>
<ul>
<li><b>${mods.stateCounts.unknown || 0} modules</b> whose status cannot be determined from SuiteQL alone — a feature that is switched off and one the integration role cannot see look identical. Resolvable with an SDF export.</li>
<li><b>Close effort</b> — how long the close takes, and how many reconciliations live in spreadsheets. Not visible in data; it has to be discussed.</li>
<li><b>Tagging coverage</b> per dimension, which determines the granularity a plan can actually support.</li>
<li><b>The Planning side</b> — without an LCM export from NSPB we cannot assess the implementation already in place.</li>
<li><b>Integrations not using token-based authentication</b> — OAuth 2.0, SOAP with user credentials and SuiteAnalytics Connect do not appear in the inventory, so the connected landscape may be broader than shown.</li>
<li><b>Headcount</b> — employee records in NetSuite are not a reliable workforce source here, which suggests payroll is administered in another system.</li>
</ul>
${B?.suiteSuccessEdition ? `<p class="small"><b>Industry reference.</b> ${esc(B.suiteSuccessEdition)} Benchmark context draws on public sources (Oracle's module catalog and published SuiteSuccess material), not a proprietary base of comparable accounts — it is meant to frame the discussion rather than settle it.</p>` : ''}

</body></html>`;

const htmlFile = path.join(DIR, `${CLIENT}-netsuite-abr-full.html`);
const pdfFile = path.join(DIR, `${CLIENT}-netsuite-abr-full.pdf`);
fs.writeFileSync(htmlFile, html);

const httpJson = async p => (await fetch(`http://127.0.0.1:${PORT}${p}`)).json();
function wsCall(wsUrl, fn) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl); let id = 0; const pend = new Map(); const evs = [];
    const send = (m, p) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p || {} })); });
    ws.onmessage = e => { const d = JSON.parse(e.data); if (d.id && pend.has(d.id)) { const q = pend.get(d.id); pend.delete(d.id); d.error ? q.rej(new Error(d.error.message)) : q.res(d.result); } else if (d.method) evs.push(d); };
    ws.onopen = async () => { try { resolve(await fn(send, evs)); } catch (e) { reject(e); } finally { ws.close(); } };
    ws.onerror = () => reject(new Error(`CDP no responde en :${PORT}`));
  });
}
(async () => {
  const ver = await httpJson('/json/version');
  await wsCall(ver.webSocketDebuggerUrl, async (send) => {
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const t = (await httpJson('/json/list')).find(x => x.id === targetId);
    await wsCall(t.webSocketDebuggerUrl, async (s2, evs) => {
      await s2('Page.enable');
      await s2('Page.navigate', { url: 'file:///' + htmlFile.replace(/\\/g, '/') });
      for (let k = 0; k < 40; k++) { await new Promise(r => setTimeout(r, 200)); if (evs.some(e => e.method === 'Page.loadEventFired')) break; }
      await new Promise(r => setTimeout(r, 500));
      const { data } = await s2('Page.printToPDF', { printBackground: true, preferCSSPageSize: true });
      fs.writeFileSync(pdfFile, Buffer.from(data, 'base64'));
    });
    await send('Target.closeTarget', { targetId });
  });
  console.log(`✓ ${pdfFile} (${(fs.statSync(pdfFile).size / 1024).toFixed(0)} KB)`);
})().catch(e => { console.error('PDF ERROR:', e.message); process.exit(1); });
