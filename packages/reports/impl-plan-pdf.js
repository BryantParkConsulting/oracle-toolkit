'use strict';
// Talogy NSPB re-implementation plan (decided scope from the 16-Jul working session).
// Self-contained content; pulls a few counts from budget-analysis.json + revenue-recon.json.
//   node tools/impl-plan-pdf.js [client]
const fs = require('fs');
const path = require('path');
const PORT = process.env.CDP_PORT || 9222;
const ROOT = path.join(__dirname, '..');
const CLIENT = process.argv[2] || 'talogy';
const CAP = CLIENT[0].toUpperCase() + CLIENT.slice(1);
const dir = path.join(ROOT, 'clients', CLIENT);
const J = f => { try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch { return {}; } };
const BA = J('budget-analysis.json'), RR = J('revenue-recon.json'), COA = J('coa-profile.json');
const VER = 'v' + new Date().toISOString().slice(0, 10) + '.' + String(new Date().getHours()).padStart(2, '0') + String(new Date().getMinutes()).padStart(2, '0');
const NAVY = '#1F3C51', SAGE = '#619C8A', GOLD = '#F2CC5F', ORANGE = '#EC8842', DANGER = '#C9512E', GRAY = '#9AA3AB';
const b64 = f => fs.existsSync(f) ? fs.readFileSync(f).toString('base64') : '';
const LOGO = b64(path.join(ROOT, 'desgincode', 'assets', 'logo', 'bpc-logo.png'));
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const IC = {
  OK: `<svg viewBox="0 0 24 24" width="13" height="13" style="vertical-align:-2px"><circle cx="12" cy="12" r="11" fill="${SAGE}"/><path d="M7 12.5l3.2 3.2L17 8.5" stroke="#fff" stroke-width="2.3" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  X: `<svg viewBox="0 0 24 24" width="13" height="13" style="vertical-align:-2px"><circle cx="12" cy="12" r="11" fill="${DANGER}"/><path d="M8.2 8.2l7.6 7.6M15.8 8.2l-7.6 7.6" stroke="#fff" stroke-width="2.3" stroke-linecap="round"/></svg>`,
  ADD: `<svg viewBox="0 0 24 24" width="13" height="13" style="vertical-align:-2px"><circle cx="12" cy="12" r="11" fill="${SAGE}"/><path d="M12 7v10M7 12h10" stroke="#fff" stroke-width="2.3" stroke-linecap="round"/></svg>`,
  WARN: `<svg viewBox="0 0 24 24" width="13" height="13" style="vertical-align:-2px"><circle cx="12" cy="12" r="11" fill="${GOLD}"/><rect x="10.9" y="5.5" width="2.2" height="9" rx="1.1" fill="${NAVY}"/><circle cx="12" cy="17.6" r="1.5" fill="${NAVY}"/></svg>`,
};

const DECISIONS = [
  ['Which cube for revenue?', 'Revenue lives in the <b>Financial cube (OEP_FS)</b> — not a separate revenue cube.', 'One model, no cross-cube reconciliation to break.'],
  ['Workforce module', '<b>Dropped.</b> Compensation enters as P&L accounts (5010/5020) by department.', 'Not used in the FY26 budget.'],
  ['Revenue driver model', '<b>Dropped.</b> Revenue is planned as flat category totals.', 'Not used; removes 58 forms / 61 rules of maintenance.'],
  ['Site &amp; Market Segment dims', '<b>Deprecated (both).</b>', 'Obsolete; not used in any loader.'],
  ['Customers / programs', 'Move to a proper <b>Customer dimension sourced from NetSuite</b> — out of Department.', 'Stop overloading Department; recover clean by-customer reporting.'],
  ['Balance Sheet &amp; Cash Flow', '<b>In scope.</b> Cash-flow forecasting needed for <b>loan-covenant</b> reporting (bi-weekly).', 'Business-critical driver, confirmed by David.'],
  ['NetSuite data feed', 'Standard <b>account-number / Division-Department</b> pattern (the <code>__13</code> search); retire the custom <code>__14</code> revenue search.', 'One standard source; the reconciliation gap disappears by construction.'],
  ['Build target', 'Fresh build on a <b>new PBCS pod</b>.', 'Clean re-implementation, not a re-config of the old app.'],
];

const KDA = {
  keep: ['<b>Financials (OEP_FS)</b> as the single planning cube', 'A <b>standard NetSuite feed</b> — account by number, Division Department, Subsidiary=Entity', 'Revenue at the summary-category level, inside Financials'],
  drop: ['<b>Workforce (WFPlan)</b> module', 'The <b>Revenue driver model</b> (volume × rate, 58 forms / 61 rules)', '<b>Site</b> and <b>Market Segment</b> dimensions', 'The custom <b>__14</b> revenue saved search', 'The legacy <b>“Total Department (Pre-2020)”</b> hierarchy'],
  add: ['<b>Balance Sheet + Cash Flow</b> planning (loan-covenant reporting)', 'A clean <b>Customer dimension</b> (from NetSuite’s customer field)', '<b>SuiteProjects / OpenAir</b> revenue forecast feed <span style="color:#767676">(to evaluate)</span>'],
  restructure: [`<b>Department</b>: from <b>11,167</b> members / 9 parallel hierarchies down to real cost centers (budget uses only <b>${(BA.totals && BA.totals.depts) || 346}</b>)`, 'Revenue relocated into the Financial cube'],
};

const DEPS = [
  `${IC.OK} <b>New Chart of Accounts — received (draft, 22-Jul)</b> from Caro's team (${COA.total} accounts, ${COA.summary} summary). Final due 23-Jul (currency on rows 7/125/126/127). <b>Unblocked</b> — Account-dimension mapping can start now.`,
  `${IC.WARN} <b>Segments</b> — client to provide <b>today / tomorrow</b> (Aidan collecting; Custom Segments template shared).`,
  `${IC.WARN} <b>Subsidiaries list</b> — final version due 23-Jul (David), based on the new CoA → Entity dimension.`,
  `${IC.OK} <b>P&L test file — received (21-Jul)</b> from David (Revenue→EBITDA, DATA_EBITDA tab). To process for the auto-mapping test.`,
  `${IC.WARN} <b>Saved-search XMLs</b> — requested from Ravi to complete the NetSuite→PBCS map.`,
  `${IC.WARN} <b>SuiteProjects / OpenAir</b> — confirm feasibility &amp; value of pulling its revenue forecast into PBCS.`,
];
const coaRows = Object.entries(COA.byType || {}).map(([t, n]) => `<tr><td>${esc(t)}</td><td class="num">${n}</td></tr>`).join('');

const SS_REQUEST = [
  ['customsearch_nspbcs_all_transactions__13', 'Financial Actuals → OEP_FS', 'keep — the standard feed'],
  ['customsearch_nspbcs_all_transactions__14', 'RevPlan Actuals → RevPlan (+OEP_FS)', 'retire — custom'],
  ['customsearch_nspbcs_all_transactions__15', 'Total Expense RP', 'review'],
  ['customsearch_nspbcs_all_transactions__16', 'Volume RevPlan', 'review'],
  ['customsearch_nspbcs_rates2', 'FX Rates', 'keep'],
  ['customsearch_nspbcs_newaccts / newdepts / newmktsgmt / newsites / newentity', 'Metadata (dimension builds)', 'keep (rebuild targets)'],
];

const NEXT = {
  Bruno: ['Draft this implementation plan (done — this doc)', 'Share the PBCS data-mapping file with David &amp; Ravi', 'Run the department/entity-hierarchy session &amp; the “which departments have data” cleanup', 'Connect with Bree &amp; Carol on the customer/market-segment change', 'Evaluate SuiteProjects/OpenAir + Balance-Sheet/Cash-Flow scope'],
  David: ['Send the <b>new Chart of Accounts</b>', 'Send a <b>simple P&L</b> to test the auto-mapping'],
  Ravi: ['Export the <b>XML of all saved searches</b> in the table above (for the complete map)'],
};

const decRows = DECISIONS.map(d => `<tr><td>${d[0]}</td><td>${d[1]}</td><td class="muted">${d[2]}</td></tr>`).join('');
const ssRows = SS_REQUEST.map(s => `<tr><td><code>${esc(s[0])}</code></td><td>${s[1]}</td><td>${s[2]}</td></tr>`).join('');
const col = (title, color, items, icon) => `<div class="kd"><div class="kdh" style="color:${color}">${icon} ${title}</div><ul>${items.map(i => `<li>${i}</li>`).join('')}</ul></div>`;

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
  @page { margin: 13mm 12mm; } * { box-sizing: border-box; }
  body { font-family:'Sarabun',Arial,sans-serif; font-weight:300; color:${NAVY}; font-size:11px; line-height:1.5; -webkit-font-smoothing:antialiased; }
  .brand { display:flex; align-items:flex-end; justify-content:space-between; border-bottom:2px solid ${NAVY}; padding-bottom:9px; margin-bottom:12px; }
  .brand img { height:26px; } .brand .eyebrow { font-size:9px; font-weight:600; letter-spacing:.13em; text-transform:uppercase; color:${SAGE}; }
  h1 { font-weight:300; font-size:23px; letter-spacing:-.02em; margin:6px 0 2px; }
  h2 { font-weight:600; font-size:13px; margin:17px 0 6px; padding-bottom:4px; border-bottom:1px solid #D9D9D9; }
  h2 .n { color:${SAGE}; font-weight:700; margin-right:6px; }
  h1,h2 { break-after:avoid; } p,li,tr,.kd { break-inside:avoid; }
  p { margin:5px 0; } ul { margin:3px 0 6px 17px; padding:0; } li { margin:3px 0; }
  table { border-collapse:collapse; width:100%; margin:8px 0; font-size:10px; }
  th { background:${NAVY}; color:#fff; font-weight:500; text-align:left; padding:5px 8px; }
  td { padding:5px 8px; border-bottom:1px solid #EEE; vertical-align:top; } tr:nth-child(even) td { background:#FAFAFA; }
  code { font-family:'JetBrains Mono',monospace; font-size:.86em; background:#F3F3F3; padding:1px 4px; border-radius:2px; color:${NAVY}; }
  .muted { color:#767676; font-size:9.3px; }
  .lead { font-size:11.5px; color:#2b4a5e; background:#F4F7F6; border-left:3px solid ${SAGE}; padding:9px 12px; border-radius:0 6px 6px 0; margin:8px 0 12px; }
  .kdwrap { display:flex; gap:9px; flex-wrap:wrap; margin:8px 0; }
  .kd { flex:1 1 46%; border:1px solid #EEE; border-radius:8px; padding:9px 12px; box-shadow:0 1px 2px rgba(31,60,81,.05); }
  .kdh { font-size:11px; font-weight:700; margin-bottom:4px; }
  .own { display:flex; gap:9px; } .own > div { flex:1; border:1px solid #EEE; border-radius:8px; padding:9px 11px; }
  .own .h { font-weight:600; color:${NAVY}; border-bottom:1px solid #EEE; padding-bottom:3px; margin-bottom:4px; }
  .foot { margin-top:14px; padding-top:8px; border-top:1px solid #EEE; font-size:8.6px; color:${GRAY}; }
</style></head><body>
  <div class="brand"><img src="data:image/png;base64,${LOGO}"/><span class="eyebrow">Re-implementation Plan · Draft · ${VER}</span></div>
  <h1>${esc(CAP)} — NSPB Re-implementation Plan</h1>
  <p class="muted">Scope validated in the ${esc(CAP)} working session (16-Jul). This is the direction we are building — a simplified, single-cube P&L model fed by a standard NetSuite feed. Draft for review; items marked to evaluate/confirm are noted.</p>

  <div class="lead"><b>The shape of the new build:</b> one planning cube (<b>Financials / OEP_FS</b>), fed by <b>one standard NetSuite saved search</b>, with revenue, comp and COS all as P&L accounts by <b>Subsidiary × Department × Account</b>. Workforce, the revenue-driver model, Site and Market Segment are removed; customers move to their own dimension; Balance Sheet + Cash Flow are added for loan-covenant reporting.</p>

  <h2><span class="n">1</span>Decisions confirmed</h2>
  <table><thead><tr><th style="width:22%">Topic</th><th>Decision</th><th style="width:26%">Why</th></tr></thead><tbody>${decRows}</tbody></table>

  <h2><span class="n">2</span>Keep / Drop / Add / Restructure</h2>
  <div class="kdwrap">
    ${col('KEEP', SAGE, KDA.keep, IC.OK)}
    ${col('DROP', DANGER, KDA.drop, IC.X)}
    ${col('ADD', SAGE, KDA.add, IC.ADD)}
    ${col('RESTRUCTURE', GOLD, KDA.restructure, IC.WARN)}
  </div>

  <h2><span class="n">3</span>The NetSuite data feed — one standard source</h2>
  <p>Today two custom saved searches feed two cubes and never reconcile — one keys <b>Account by number</b>, the other by <b>name</b>, landing in different branches of the account tree. The new build uses a <b>single standard feed</b> (<code>__13</code> pattern): account by number mirroring the CoA, Division Department, Subsidiary = Entity. To map every feed end-to-end, we’re requesting the XML of all saved searches:</p>
  <table><thead><tr><th>Saved search</th><th>Feeds</th><th>Disposition</th></tr></thead><tbody>${ssRows}</tbody></table>

  <h2><span class="n">4</span>The new Chart of Accounts — received (draft, 22-Jul)</h2>
  <p>Caro's team shared the NetSuite CoA import template (<code>${esc(COA.file || 'LLH Talogy - Chart of Accounts')}</code>). This <b>becomes the NSPB Account dimension</b>, and its <b>Summary</b> column (already populated) gives the roll-up hierarchy directly.</p>
  <ul>
    <li>${IC.OK} <b>${COA.total} accounts</b> — <b>${COA.summary}</b> summary / roll-up (the Account-dimension parents) + <b>${COA.postable}</b> postable.</li>
    <li>${IC.OK} <b>Full P&L + Balance Sheet</b> (${COA.pnlCount} P&L, ${COA.bsCount} balance-sheet accounts) — confirms the Balance Sheet + Cash Flow scope is real: <b>the accounts already exist</b>, we don't build them from scratch.</li>
    <li>${IC.WARN} <b>Final version due 23-Jul</b> (currency on rows 7/125/126/127) — we can start the old→new mapping off this draft now.</li>
  </ul>
  <div class="two" style="align-items:flex-start"><div>
  <table><thead><tr><th>Account type</th><th class="num">#</th></tr></thead><tbody>${coaRows}</tbody></table>
  </div><div><p class="muted" style="margin-top:2px">The 39 Income accounts here replace the 91 GL income leaves in the old build — a more consolidated revenue view. Bank (122) reflects per-subsidiary bank GLs (each needs one currency). Segments (department / class / location / customer) come next — due today/tomorrow.</p></div></div>

  <h2><span class="n">5</span>Department clean-up (from the LCM)</h2>
  <p>The Department dimension holds <b>11,167 members</b> across <b>9 parallel hierarchies</b> (Total Department, Global Consulting, Global Sales, TalogyGov, plus a legacy <i>“Pre-2020”</i> tree), with <b>175 shared members</b> rolled up multiple ways. It is doing the job of a customer/market-segment dimension. The FY26 budget uses only <b>${(BA.totals && BA.totals.depts) || 346}</b> of them. Plan: <b>collapse Department to real cost centers</b>, move customers/programs to the new Customer dimension, and retire the Pre-2020 tree.</p>

  <h2><span class="n">6</span>Open items &amp; dependencies</h2>
  <ul>${DEPS.map(d => `<li>${d}</li>`).join('')}</ul>

  <h2><span class="n">7</span>Next steps &amp; owners</h2>
  <div class="own">
    ${Object.entries(NEXT).map(([who, items]) => `<div><div class="h">${who}</div><ul>${items.map(i => `<li>${i}</li>`).join('')}</ul></div>`).join('')}
  </div>
  <p>${IC.WARN} <b>Training (next week):</b> a working session for <b>David &amp; Andrew</b> on loading the templates / data into PBCS, plus a follow-up on the Department/Entity hierarchies — key given the prior team has left. <i>Date to confirm.</i></p>

  <div class="foot">Bryant Park Consulting · NetSuite Planning &amp; Budgeting re-implementation · ${esc(CAP)} · ${VER}. Draft plan reflecting the 16-Jul session; scope and counts to be confirmed as the new Chart of Accounts and saved-search exports are received.</div>
</body></html>`;

const htmlFile = path.join(dir, 'impl-plan.html');
fs.writeFileSync(htmlFile, html);
const pdfFile = path.join(dir, 'impl-plan.pdf');
const fileUrl = 'file:///' + htmlFile.replace(/\\/g, '/');
async function httpJson(p) { return (await fetch(`http://127.0.0.1:${PORT}${p}`)).json(); }
function wsCall(wsUrl, fn) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl); let id = 0; const pend = new Map(); const evs = [];
    const send = (m, p) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p || {} })); });
    ws.onmessage = e => { const d = JSON.parse(e.data); if (d.id && pend.has(d.id)) { const q = pend.get(d.id); pend.delete(d.id); d.error ? q.rej(new Error(d.error.message)) : q.res(d.result); } else if (d.method) evs.push(d); };
    ws.onopen = async () => { try { resolve(await fn(send, evs)); } catch (e) { reject(e); } finally { ws.close(); } };
    ws.onerror = () => reject(new Error('CDP not reachable on :' + PORT));
  });
}
(async () => {
  const ver = await httpJson('/json/version');
  await wsCall(ver.webSocketDebuggerUrl, async (send) => {
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const t = (await httpJson('/json/list')).find(x => x.id === targetId);
    await wsCall(t.webSocketDebuggerUrl, async (s2, evs) => {
      await s2('Page.enable'); await s2('Page.navigate', { url: fileUrl });
      for (let k = 0; k < 40; k++) { await new Promise(r => setTimeout(r, 200)); if (evs.some(e => e.method === 'Page.loadEventFired')) break; }
      await new Promise(r => setTimeout(r, 500));
      const { data } = await s2('Page.printToPDF', { printBackground: true, preferCSSPageSize: true });
      fs.writeFileSync(pdfFile, Buffer.from(data, 'base64'));
    });
    await send('Target.closeTarget', { targetId });
  });
  console.log('✓ wrote', path.relative(ROOT, pdfFile), `(${(fs.statSync(pdfFile).size / 1024).toFixed(0)} KB)`);
})().catch(e => { console.error('PDF ERROR:', e.message); process.exit(1); });
