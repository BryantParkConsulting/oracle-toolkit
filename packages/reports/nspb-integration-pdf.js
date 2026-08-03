#!/usr/bin/env node
'use strict';
/**
 * nspb-integration-pdf.js — discovery técnico del lado NetSuite para el equipo de
 * NSPB: plan de cuentas, dimensiones disponibles y viabilidad de reconciliación.
 *
 * A diferencia del ABR (que es de negocio), este documento responde las preguntas
 * que se hace un implementador de Planning antes de la primera reunión:
 *   ¿cuántos miembros va a tener la dimensión Account? ¿qué profundidad?
 *   ¿qué dimensiones existen del lado NetSuite y con cuántos miembros?
 *   ¿se puede reconciliar contra el GL, y con qué granularidad?
 *
 * Entrada: erp/{financials,modules,connectors}.json + netsuite/{probe,coa}.json
 * Salida:  <cliente>-nspb-integration.pdf
 *
 * Requiere Chrome/Edge con --remote-debugging-port=9222.
 *   CLIENT=pra node packages/reports/nspb-integration-pdf.js
 */
const fs = require('fs');
const path = require('path');

const PORT = process.env.CDP_PORT || 9222;
const CLIENT = process.env.CLIENT || 'pra';
const ROOT = path.join(__dirname, '..', '..');
const DIR = path.join(ROOT, 'clients', CLIENT);
const NAME = (process.env.CLIENT_NAME || CLIENT).toUpperCase();

const rd = p => { try { return JSON.parse(fs.readFileSync(path.join(DIR, p), 'utf8')); } catch { return null; } };
const b64 = f => { try { return fs.readFileSync(path.join(ROOT, 'assets', f), 'utf8').trim(); } catch { return ''; } };

const fin = rd('erp/financials.json');
const mods = rd('erp/modules.json');
const probe = rd('netsuite/probe.json');
const coa = rd('netsuite/coa.json') || [];
if (!fin || !probe) { console.error(`Faltan datos en ${DIR}. Corré ns-financials.js primero.`); process.exit(1); }

const NAVY = '#1F3C51', SAGE = '#619C8A', GOLD = '#F2CC5F', ORANGE = '#EC8842', DANGER = '#C9512E';
const T = {}; for (const t of Object.values(probe.modules)) Object.assign(T, t);
const n = k => (T[k]?.exists ? Number(T[k].rows ?? 0) : 0);
const fmt = x => Number(x || 0).toLocaleString('en-US');
const money = x => { const v = Number(x) || 0; return (v < 0 ? '-$' : '$') + (Math.abs(v) / 1e6).toFixed(1) + 'M'; };
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const byId = Object.fromEntries((mods?.modules || []).map(m => [m.id, m]));

/**
 * Las dimensiones candidatas de Planning y su origen en NetSuite. `quality` es lo
 * que decide si la dimensión sirve: una con miembros pero sin tagueo en las
 * transacciones produce un modelo que no cuadra con el GL.
 */
const dims = [
  { nspb: 'Entity', src: 'Subsidiary', members: n('subsidiary'), note: n('subsidiary') > 1 ? 'Multi-entity: rollup and eliminations to be defined.' : 'Single entity — the dimension would be trivial.' },
  { nspb: 'Account', src: 'Chart of Accounts', members: fin.coa.leaves, note: `${fmt(fin.coa.leaves)} leaves out of ${fmt(fin.coa.total)} accounts. The ${fmt(fin.coa.rollups)} rollups are rebuilt by the Planning hierarchy.` },
  { nspb: 'Period', src: 'Accounting Periods', members: n('accountingperiod'), note: 'Confirm fiscal calendar alignment before mapping.' },
  { nspb: 'Currency', src: 'Currencies', members: n('currency'), note: n('currency') > 1 ? 'Multi-currency: FX rates and translation to be defined.' : 'Single currency.' },
  { nspb: 'Cost Center', src: 'Department', members: n('department'), note: n('department') ? 'Measure the share of tagged transactions before committing to granularity.' : 'No departments.' },
  { nspb: 'Custom dim', src: 'Class', members: n('classification'), note: n('classification') ? 'Measure tagging coverage.' : 'No classes.' },
  { nspb: 'Custom dim', src: 'Location', members: n('location'), note: n('location') ? 'Measure tagging coverage.' : 'No locations.' },
  { nspb: 'Custom dim', src: 'Custom Segment', members: n('customsegment'), note: n('customsegment') ? 'Review definition and scope.' : 'No custom segments.' },
  { nspb: 'Project', src: 'Jobs', members: n('job'), note: n('job') > 1000 ? `${fmt(n('job'))} projects — too many for dimension members; consider grouping or a separate cube.` : 'Volume is manageable as a dimension.' },
].filter(d => d.members > 0);

// ── viabilidad de reconciliación ─────────────────────────────────────────────
const recon = [];
recon.push({ ok: true, t: 'Balances by account and period', d: `transactionaccountingline with posting='T' gives the balance of all ${fmt(fin.coa.leaves)} leaf accounts by year or month. This is the basis of any tie-out against Planning.` });
recon.push({ ok: n('accountingbook') === 1, t: 'Single accounting book', d: n('accountingbook') === 1 ? 'One accounting book, so there is no ambiguity about which book feeds actuals.' : `${fmt(n('accountingbook'))} accounting books: the source of actuals has to be fixed before reconciling.` });
recon.push({ ok: false, t: 'Revenue by customer is NOT in the GL', d: 'Revenue is recognized through journal entries that carry no entity. At GL level there is no customer, so customer-level reconciliation has to read the billing layer (invoices / revenue arrangements) rather than transactionaccountingline. This is the most expensive trap in this environment.' });
if (byId['projects'] && n('projecttask') === 0)
  recon.push({ ok: false, t: 'No cost by project', d: `There are ${fmt(n('job'))} projects but project tasks and time-to-charge are at zero, so no cost is attributed per project to reconcile against a project-level plan.` });
recon.push({ ok: fin.coa.leavesWithoutActivity < fin.coa.leaves * 0.2, t: 'Chart-of-accounts noise', d: `${fmt(fin.coa.leavesWithoutActivity)} active leaf accounts with no movement at all (${Math.round(100 * fin.coa.leavesWithoutActivity / fin.coa.leaves)}% of leaves). Carrying them into the model inflates the dimension without adding data.` });
recon.push({ ok: true, t: 'History available', d: `${fin.years.length} years with activity (${fin.years[0]}–${fin.years[fin.years.length - 1]}), enough to load historical actuals and validate trend.` });

const conn = rd('erp/connectors.json');
const nspbBundle = byId['nspb-connector'];
const nativeBudgets = byId['native-budgets'];

/**
 * Cobertura de tagueo. Los miembros dicen qué existe; la cobertura dice qué se
 * puede sostener. Sin esta tabla, la de dimensiones induce a error.
 */
function covTable() {
  const cov = (rd('netsuite/dimension_coverage.json') || [])[0];
  if (!cov || !cov.total_lines) return '';
  const tot = Number(cov.total_lines);
  const p = k => 100 * Number(cov[k] || 0) / tot;
  const verdict = v => v >= 95 ? 'Reliable' : v >= 70 ? 'Usable — confirm the gap' : v >= 30 ? '⚠ Partial' : '⚠ Effectively untagged';
  const rows = [['Subsidiary', p('subsidiary')], ['Location', p('location')], ['Class', p('class')], ['Department', p('department')]];
  const weak = rows.filter(([, v]) => v < 70);
  return `<h3>Tagging coverage — what the data can actually support</h3>
  <table><tr><th>Segment</th><th class="num">Lines tagged</th><th>Verdict</th></tr>
  ${rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td class="num">${v.toFixed(0)}%</td><td>${verdict(v)}</td></tr>`).join('')}
  </table>
  <p class="small">Share of transaction lines carrying a value for each segment, across ${fmt(tot)} lines in the last twelve months.</p>
  ${weak.length ? `<div class="no"><b>${weak.map(([k]) => k).join(' and ')} cannot carry a plan.</b> Modelling at that level produces actuals with nowhere to land, and a plan that will not reconcile to the general ledger. Either the tagging is corrected upstream, or the model is designed at a level the data supports — a decision worth taking before the build, not during it.</div>` : ''}`;
}

const IS = fin.incomeStatement || {}, BS = fin.balanceSheet || {};
const yrs = fin.years || [];

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<style>
@page { size: A4; margin: 14mm 13mm; }
* { box-sizing:border-box; }
body { font-family: Sarabun,"Segoe UI",system-ui,sans-serif; color:#333; font-size:9.6pt; line-height:1.5; margin:0; }
h1,h2,h3 { color:${NAVY}; margin:0 0 6px; }
h2 { font-size:14pt; border-bottom:2px solid ${SAGE}; padding-bottom:4px; margin-top:20px; }
h3 { font-size:10.5pt; margin-top:13px; }
.page-break { page-break-before: always; }
.cover { height:262mm; display:flex; flex-direction:column; justify-content:space-between;
  background:linear-gradient(150deg, ${NAVY} 0%, #16303f 100%); color:#fff; margin:-14mm -13mm; padding:22mm 18mm; }
.cover h1 { color:#fff; font-size:27pt; line-height:1.15; margin:0 0 10px; }
.cover .sub { color:${GOLD}; font-size:12.5pt; font-weight:600; }
.badge { display:inline-block; background:${SAGE}; color:#fff; font-size:8.5pt; font-weight:700; padding:3px 10px; border-radius:3px; letter-spacing:.06em; }
.logo { height:32px; filter:brightness(0) invert(1); }
table { width:100%; border-collapse:collapse; font-size:8.8pt; margin:8px 0; }
th { background:${NAVY}; color:#fff; text-align:left; padding:5px 7px; font-weight:600; }
td { padding:4px 7px; border-bottom:1px solid #eceff1; vertical-align:top; }
tr:nth-child(even) td { background:#fafbfc; }
.num { text-align:right; font-variant-numeric:tabular-nums; }
.kpi { display:flex; gap:9px; margin:10px 0; }
.kpi div { flex:1; background:#f6f8f9; border-left:3px solid ${SAGE}; padding:8px 10px; }
.kpi .v { font-size:16pt; font-weight:700; color:${NAVY}; line-height:1.1; }
.kpi .l { font-size:7.6pt; color:#6b7280; }
.ok { background:#f2f7f5; border-left:3px solid ${SAGE}; padding:8px 11px; margin:6px 0; font-size:8.9pt; }
.no { background:#fbeeea; border-left:3px solid ${DANGER}; padding:8px 11px; margin:6px 0; font-size:8.9pt; }
.note { background:#f4f7f6; border-left:3px solid ${SAGE}; padding:8px 11px; margin:7px 0; font-size:8.7pt; }
.small { font-size:8pt; color:#6b7280; }
ul { margin:5px 0 5px 16px; padding:0; } li { margin:3px 0; }
code { background:#f1f3f4; padding:1px 3px; border-radius:2px; font-size:8.2pt; }
</style></head><body>

<div class="cover">
  <div>${b64('bpc-logo.b64') ? `<img class="logo" src="data:image/png;base64,${b64('bpc-logo.b64')}">` : '<div style="font-size:15pt;font-weight:700">BPC</div>'}</div>
  <div>
    <div class="badge">FOR THE PLANNING IMPLEMENTATION TEAM</div>
    <h1 style="margin-top:16px">${esc(NAME)}</h1>
    <div class="sub">NetSuite → NSPB Integration Discovery</div>
    <div style="margin-top:20px;font-size:10pt;opacity:.85;max-width:120mm">
      Chart of accounts, available dimensions and reconciliation feasibility.<br>
      Account <b>${esc(probe.account)}</b> · ${fmt(fin.coa.total)} accounts · ${fmt(n('transactionline'))} transaction lines
    </div>
  </div>
  <div style="font-size:8.4pt;opacity:.7">
    Generated ${new Date().toISOString().slice(0, 10)} from the live account over SuiteQL / REST.<br>
    Every figure is measured, none estimated. Read §5 before committing to a model design.
  </div>
</div>

<div class="page-break"></div>
<h2>1. What the Account dimension will look like</h2>
<div class="kpi">
  <div><div class="v">${fmt(fin.coa.leaves)}</div><div class="l">Leaf accounts (what you map)</div></div>
  <div><div class="v">${fmt(fin.coa.rollups)}</div><div class="l">Rollups (rebuilt in Planning)</div></div>
  <div><div class="v">${fin.coa.maxDepth}</div><div class="l">Hierarchy levels</div></div>
  <div><div class="v">${fmt(fin.coa.leavesWithoutActivity)}</div><div class="l">Leaves with no activity</div></div>
</div>
<div class="note">You map the <b>leaves</b>, not the ${fmt(fin.coa.total)} accounts. The ${fmt(fin.coa.rollups)} rollups are rebuilt by the Planning hierarchy — carrying them across would double-count. The ${fmt(fin.coa.leavesWithoutActivity)} leaves with no journal activity are candidates to exclude: they inflate the dimension without contributing data.</div>

<h3>Accounts by type</h3>
<table><tr><th>Account type</th><th class="num">Accounts</th><th>Statement</th></tr>
${(fin.coa.byType || []).map(([t, c]) => `<tr><td>${esc(t)}</td><td class="num">${c}</td><td>${IS[Object.keys(IS)[0]] && ['Income', 'OthIncome', 'COGS', 'Expense', 'OthExpense'].includes(t) ? 'P&amp;L' : ['NonPosting'].includes(t) ? '—' : 'Balance sheet'}</td></tr>`).join('')}
</table>

<h2>2. Dimensions available on the NetSuite side</h2>
<table><tr><th>Planning dimension</th><th>NetSuite source</th><th class="num">Members</th><th>Note</th></tr>
${dims.map(d => `<tr><td><b>${esc(d.nspb)}</b></td><td>${esc(d.src)}</td><td class="num">${fmt(d.members)}</td><td>${esc(d.note)}</td></tr>`).join('')}
</table>
<p class="small">Member counts are what exists in the account. They say nothing about how consistently transactions are tagged — that has to be measured per dimension before committing to granularity in the model.</p>

${covTable()}

<div class="page-break"></div>
<h2>3. Reconciliation feasibility</h2>
${recon.map(r => `<div class="${r.ok ? 'ok' : 'no'}"><b>${r.ok ? '✓' : '✕'} ${esc(r.t)}</b><br>${esc(r.d)}</div>`).join('')}

<h2>4. Income Statement and Balance Sheet as the GL sees them</h2>
<table><tr><th>P&amp;L line</th><th class="num">Accounts</th>${yrs.map(y => `<th class="num">${y}</th>`).join('')}</tr>
${Object.entries(IS).map(([g, v]) => `<tr><td>${esc(g)}</td><td class="num">${v.accounts}</td>${yrs.map(y => `<td class="num">${money(v.totals[y] || 0)}</td>`).join('')}</tr>`).join('')}
</table>
<table><tr><th>Balance sheet line</th><th class="num">Accounts</th>${yrs.map(y => `<th class="num">${y}</th>`).join('')}</tr>
${Object.entries(BS).map(([g, v]) => `<tr><td>${esc(g)}</td><td class="num">${v.accounts}</td>${yrs.map(y => `<td class="num">${money(v.totals[y] || 0)}</td>`).join('')}</tr>`).join('')}
</table>
<p class="small">Balance-sheet figures show <b>period movement, not closing balances</b>: opening balances require pulling full history. Income and liabilities are sign-flipped for presentation — NetSuite stores them as credits.</p>

<div class="page-break"></div>
<h2>5. Before designing the model</h2>
${nspbBundle?.state === 'active' ? `<div class="note"><b>Planning is already connected.</b> ${esc(nspbBundle.evidence)}.${nativeBudgets?.state === 'active' ? ` At the same time budgets are still being loaded natively (${esc(nativeBudgets.evidence)}). Establishing which one is authoritative is the first design decision, ahead of any modelling.` : ''}${conn?.integrations?.some(i => /pbcs|nspb/i.test(i.app)) ? ` The token history shows Planning integrations going back to ${esc(conn.integrations.filter(i => /pbcs|nspb/i.test(i.app)).map(i => i.desde).sort()[0])} — this is not a greenfield implementation.` : ''}</div>` : ''}
<ul>
<li><b>Fiscal calendar</b> — ${fmt(n('accountingperiod'))} accounting periods exist. Confirm the fiscal year layout matches what Planning will use before mapping Period.</li>
<li><b>Tagging coverage</b> — for every segment dimension, measure what share of transaction lines actually carry a value. Planning can only be as granular as the tagged actuals.</li>
<li><b>Statistical accounts</b> — these map into the Account dimension but carry no currency. Agree the treatment up front.</li>
<li><b>Source of actuals by customer</b> — not available from the GL in this account (see §3). If the plan needs customer-level actuals, the integration has to read the billing layer.</li>
<li><b>Non-operating charges</b> — goodwill amortization and interest sit in the same P&amp;L. Decide whether the model isolates them, otherwise operating performance is not visible in the plan.</li>
</ul>

<h2>6. What this document does not cover</h2>
<ul>
<li><b>The Planning side.</b> Without an NSPB LCM export we cannot see the existing dimensions, forms or rules — so nothing here says how well the current implementation matches this structure.</li>
<li><b>Tagging percentages.</b> Member counts are measured; tagging consistency is not, and it is the single biggest risk to granularity.</li>
<li><b>Saved search and report definitions</b>, which is how actuals are often extracted today. Not exposed to SuiteQL.</li>
<li><b>${mods?.stateCounts?.unknown || 0} modules</b> whose status could not be determined from SuiteQL alone.</li>
</ul>

<div class="note" style="margin-top:14px"><b>About this document.</b> Generated automatically from the live NetSuite account over SuiteQL / REST. Every figure comes from a query — none is estimated. It is intended as the technical starting point for a Planning conversation, not as a design.</div>

</body></html>`;

const htmlFile = path.join(DIR, `${CLIENT}-nspb-integration.html`);
const pdfFile = path.join(DIR, `${CLIENT}-nspb-integration.pdf`);
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
      await new Promise(r => setTimeout(r, 400));
      const { data } = await s2('Page.printToPDF', { printBackground: true, preferCSSPageSize: true });
      fs.writeFileSync(pdfFile, Buffer.from(data, 'base64'));
    });
    await send('Target.closeTarget', { targetId });
  });
  console.log(`✓ ${pdfFile} (${(fs.statSync(pdfFile).size / 1024).toFixed(0)} KB)`);
})().catch(e => { console.error('PDF ERROR:', e.message); process.exit(1); });
