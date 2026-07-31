'use strict';
// Standalone PDF: FY26 budget-files load analysis + NSPB re-scope (keep / drop / questions).
// Reads clients/<client>/budget-analysis.json, renders a BPC-branded PDF via debug Chrome (:9222).
//   node tools/budget-analysis-pdf.js [client]
const fs = require('fs');
const path = require('path');
const PORT = process.env.CDP_PORT || 9222;
const ROOT = path.join(__dirname, '..');
const CLIENT = process.argv[2] || 'talogy';
const CAP = CLIENT[0].toUpperCase() + CLIENT.slice(1);
const dir = path.join(ROOT, 'clients', CLIENT);
const A = JSON.parse(fs.readFileSync(path.join(dir, 'budget-analysis.json'), 'utf8'));
const VER = 'v' + new Date().toISOString().slice(0, 10) + '.' + String(new Date().getHours()).padStart(2, '0') + String(new Date().getMinutes()).padStart(2, '0');

const NAVY = '#1F3C51', SAGE = '#619C8A', GOLD = '#F2CC5F', ORANGE = '#EC8842', DANGER = '#C9512E', GRAY = '#9AA3AB';
const b64 = f => fs.existsSync(f) ? fs.readFileSync(f).toString('base64') : '';
const LOGO = b64(path.join(ROOT, 'desgincode', 'assets', 'logo', 'bpc-logo.png'));
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const ICON = {
  OK: `<svg viewBox="0 0 24 24" width="13" height="13" style="vertical-align:-2px"><circle cx="12" cy="12" r="11" fill="${SAGE}"/><path d="M7 12.5l3.2 3.2L17 8.5" stroke="#fff" stroke-width="2.3" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  X: `<svg viewBox="0 0 24 24" width="13" height="13" style="vertical-align:-2px"><circle cx="12" cy="12" r="11" fill="${DANGER}"/><path d="M8.2 8.2l7.6 7.6M15.8 8.2l-7.6 7.6" stroke="#fff" stroke-width="2.3" stroke-linecap="round"/></svg>`,
  WARN: `<svg viewBox="0 0 24 24" width="13" height="13" style="vertical-align:-2px"><circle cx="12" cy="12" r="11" fill="${GOLD}"/><rect x="10.9" y="5.5" width="2.2" height="9" rx="1.1" fill="${NAVY}"/><circle cx="12" cy="17.6" r="1.5" fill="${NAVY}"/></svg>`,
  IDEA: `<svg viewBox="0 0 24 24" width="13" height="13" style="vertical-align:-2px"><path d="M12 2.2a7 7 0 0 0-4.2 12.6c.6.5.95 1.05.95 1.85v.55h6.5v-.55c0-.8.35-1.35.95-1.85A7 7 0 0 0 12 2.2z" fill="${GOLD}"/><rect x="8.8" y="18.4" width="6.4" height="1.9" rx=".95" fill="${GOLD}"/><rect x="9.8" y="21" width="4.4" height="1.7" rx=".85" fill="${ORANGE}"/></svg>`,
};
const povStr = Object.entries(A.grain.pov).map(([k, v]) => `${k} = <b>${esc(v)}</b>`).join(' · ');

// ── module keep / drop (analysis synthesis) ──────────────────────────
const MODULES = [
  { name: 'Financials — OEP_FS', used: 'Yes — all P&L (OpEx, COS, comp, capitalization) by Subsidiary × Department × Account', verdict: 'KEEP', color: SAGE, icon: ICON.OK },
  { name: 'Revenue — RevPlan (category level)', used: 'Partial — 6 flat revenue categories (Testing, Subscription, Consulting, PPC, Catalog, Other)', verdict: 'KEEP (categories only)', color: GOLD, icon: ICON.WARN },
  { name: 'Revenue — driver model (volume × rate, 58 forms / 61 rules)', used: 'No — revenue is loaded as flat monthly numbers, no drivers', verdict: 'DROP', color: DANGER, icon: ICON.X },
  { name: 'Workforce — WFPlan', used: 'No — comp enters as accounts 5010/5020 by Department; "Associate" = account 5003.14 fees', verdict: 'DROP', color: DANGER, icon: ICON.X },
  { name: 'Market Segment (dimension)', used: 'No — absent from every loader', verdict: 'DROP / repurpose', color: DANGER, icon: ICON.X },
  { name: 'Site (dimension)', used: 'No — Site = None in every loader', verdict: 'DROP / repurpose', color: DANGER, icon: ICON.X },
];

const QUESTIONS = [
  `<b>New Chart of Accounts</b> — <b>not provided.</b> The templates are built on the <i>current</i> CoA (${A.coa.matched}/${A.coa.total} accounts match today's NSPB). David's note says Caro/Bree have the NS-reimplementation CoA "for some time," but it wasn't attached. <b>We need it</b> to build the old→new mapping before rebuilding the Account dimension.`,
  `<b>Budget scenario</b> — the files load to <code>Forecast</code>, not a Plan/Budget scenario. Confirm whether FY26 Budget should land in <code>OEP_Plan</code> or <code>OEP_Forecast</code>.`,
  `<b>Balance Sheet / capitalization</b> — the budget includes BS accounts (<code>1720</code>, <code>1730</code>). Balance Sheet is currently <b>off</b> in NSPB. Do they want it in scope?`,
  `<b>Customers / programs</b> — the Department dimension is overloaded with customer/program names (see §Segments). Split into a separate dimension, or keep in Department?`,
  `<b>Revenue target</b> — the loaders use an OEP_FS-style POV (Site, no Market Segment). Confirm whether revenue lands in <code>RevPlan</code> or <code>OEP_FS</code>.`,
];

const loaderRows = A.loaders.map(l => `<tr>
  <td>${esc(l.label)}</td>
  <td>${esc(l.target)}</td>
  <td class="num">${l.rows == null ? '—' : l.rows.toLocaleString()}</td>
  <td class="num">${l.subs == null ? '—' : l.subs}</td>
  <td class="num">${l.depts == null ? '—' : l.depts}</td>
  <td>${l.sampleAccts && l.sampleAccts.length ? esc(l.sampleAccts.slice(0, 2).join(', ')) + (l.accts > 2 ? ` +${l.accts - 2}` : '') : '—'}</td>
</tr>`).join('');

const modRows = MODULES.map(m => `<tr>
  <td>${esc(m.name)}</td><td>${m.used}</td>
  <td style="white-space:nowrap"><span style="color:${m.color};font-weight:600">${m.icon} ${esc(m.verdict)}</span></td>
</tr>`).join('');

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
  @page { margin: 13mm 12mm; }
  * { box-sizing: border-box; }
  body { font-family:'Sarabun',Arial,sans-serif; font-weight:300; color:${NAVY}; font-size:11px; line-height:1.5; -webkit-font-smoothing:antialiased; }
  .brand { display:flex; align-items:flex-end; justify-content:space-between; border-bottom:2px solid ${NAVY}; padding-bottom:9px; margin-bottom:12px; }
  .brand img { height:26px; }
  .brand .eyebrow { font-size:9px; font-weight:600; letter-spacing:.13em; text-transform:uppercase; color:${SAGE}; }
  h1 { font-weight:300; font-size:23px; letter-spacing:-.02em; margin:6px 0 2px; }
  h2 { font-weight:600; font-size:13px; margin:17px 0 6px; padding-bottom:4px; border-bottom:1px solid #D9D9D9; }
  h2 .n { color:${SAGE}; font-weight:700; margin-right:6px; }
  h1,h2 { break-after:avoid; } p,li,tr { break-inside:avoid; }
  p { margin:5px 0; } ul { margin:4px 0 8px 18px; padding:0; } li { margin:4px 0; }
  ol { margin:4px 0 8px 20px; } ol li { margin:6px 0; }
  table { border-collapse:collapse; width:100%; margin:8px 0; font-size:10px; }
  th { background:${NAVY}; color:#fff; font-weight:500; text-align:left; padding:5px 8px; }
  td { padding:5px 8px; border-bottom:1px solid #EEE; vertical-align:top; }
  tr:nth-child(even) td { background:#FAFAFA; }
  td.num, th.num { text-align:right; font-variant-numeric:tabular-nums; }
  code { font-family:'JetBrains Mono',monospace; font-size:.88em; background:#F3F3F3; padding:1px 4px; border-radius:2px; color:${NAVY}; }
  .muted { color:#767676; font-size:9.5px; }
  .lead { font-size:11.5px; color:#2b4a5e; background:#F4F7F6; border-left:3px solid ${SAGE}; padding:9px 12px; border-radius:0 6px 6px 0; margin:8px 0 12px; }
  .pov { background:#FBF3D6; border:1px solid ${GOLD}; border-radius:6px; padding:8px 11px; font-size:10px; margin:8px 0; }
  .stat { display:inline-block; text-align:center; margin-right:22px; }
  .stat .n { font-size:22px; font-weight:600; color:${NAVY}; line-height:1; } .stat .l { font-size:8.5px; color:#767676; }
  .foot { margin-top:14px; padding-top:8px; border-top:1px solid #EEE; font-size:8.6px; color:${GRAY}; }
</style></head><body>
  <div class="brand"><img src="data:image/png;base64,${LOGO}"/><span class="eyebrow">Re-scope Analysis · Confidential · ${VER}</span></div>
  <h1>${esc(CAP)} — FY26 Budget Files &amp; NSPB Re-scope</h1>
  <p class="muted">What the client sent, what already exists in NSPB, what stays, what goes, and the open questions. Derived from the ${A.loaders.filter(l => l.rows).length} loader spreadsheets + the current NSPB LCM. Presented as <b>suggested findings to validate</b>.</p>

  <div class="lead"><b>Bottom line:</b> the FY26 budget is built in Excel at <b>P&amp;L-account × Subsidiary × Department</b> grain and loaded <b>flat</b> — the client does <b>not</b> use the Workforce module or the Revenue driver model. ${A.coa.matched}/${A.coa.total} accounts match the <i>current</i> CoA; the <b>new CoA (NetSuite reimplementation) was not provided</b> and is the main blocker.</div>

  <h2><span class="n">1</span>The budget files they sent</h2>
  <p>Seven loaders, all in the same PBCS format — they vary by <b>${A.grain.varying.join(' · ')}</b>:</p>
  <table><thead><tr><th>Loader</th><th>Target</th><th class="num">Rows</th><th class="num">Subs</th><th class="num">Depts</th><th>Sample accounts</th></tr></thead><tbody>${loaderRows}</tbody></table>
  <div class="pov">${ICON.WARN} <b>Every loader shares one fixed POV:</b> ${povStr}. Two things to confirm: they load to <b>Forecast</b> (not a Budget/Plan scenario) and via <b>Manual Load</b> (bypasses the NetSuite integration — direct data load).</div>
  <p><span class="stat"><span class="n">${A.totals.subs}</span><span class="l">subsidiaries</span></span><span class="stat"><span class="n">${A.totals.depts}</span><span class="l">"departments"</span></span><span class="stat"><span class="n">${A.totals.accts}</span><span class="l">accounts</span></span></p>

  <h2><span class="n">2</span>What exists vs what the budget uses — keep / drop</h2>
  <table><thead><tr><th>Module / dimension (old build)</th><th>Used by the FY26 budget?</th><th>Verdict</th></tr></thead><tbody>${modRows}</tbody></table>
  <p>${ICON.IDEA} The budget confirms, with the client's own files, what the assessment implied: <b>Financials stays as the landing zone; Workforce and the Revenue drivers go.</b></p>

  <h2><span class="n">3</span>Chart of Accounts</h2>
  <p><span class="stat"><span class="n" style="color:${SAGE}">${A.coa.matched}/${A.coa.total}</span><span class="l">match current NSPB CoA</span></span>
     <span class="stat"><span class="n">${A.coa.types.pnl}</span><span class="l">P&amp;L (5xxx)</span></span>
     <span class="stat"><span class="n">${A.coa.types.revenue}</span><span class="l">revenue categories</span></span>
     <span class="stat"><span class="n">${A.coa.types['balance-sheet']}</span><span class="l">balance-sheet (1xxx)</span></span></p>
  <ul>
    <li>${ICON.OK} <b>${A.coa.matched} of ${A.coa.total} budget accounts map cleanly to the current NSPB Account dimension</b> (by alias → A-number). Only <code>${A.coa.unmatched.join('</code>, <code>') || '—'}</code> does not (a calc/derived member).</li>
    <li>${ICON.X} <b>The new CoA was not provided.</b> These templates use the <i>old</i> CoA. The NS-reimplementation CoA (with Caro/Bree) must be obtained to build the <b>old→new mapping</b> before rebuilding the Account dimension.</li>
    <li>${ICON.WARN} The budget mixes <b>P&amp;L (5xxx)</b>, <b>revenue categories</b>, and <b>balance-sheet capitalization (1720, 1730)</b> — the latter needs a Balance Sheet structure, which is <b>off</b> in NSPB today.</li>
  </ul>

  <h2><span class="n">4</span>Segments — the Department problem</h2>
  <p>The Department dimension (<b>${A.deptOverload.total}</b> values) is overloaded — it mixes real cost centers with customer/program names:</p>
  <table><thead><tr><th style="width:50%">Cost centers (belong in Department)</th><th>Customers / programs (do NOT belong in Department)</th></tr></thead><tbody><tr>
    <td>${A.deptOverload.costCenters.map(d => `<code>${esc(d)}</code>`).join('<br>')}</td>
    <td>${A.deptOverload.customers.map(d => `<code>${esc(d)}</code>`).join('<br>')}</td>
  </tr></tbody></table>
  <p>${ICON.IDEA} <b>Suggested:</b> split into two dimensions — a clean <b>Department</b> (cost centers) and a new <b>Customer/Program</b> dimension (or reuse the empty Market Segment) for revenue-by-customer. Overloading Department inflates the dimension and pollutes every report. <b>Subsidiary (${A.totals.subs} entities) is clean</b> → it is the Entity dimension, unchanged.</p>

  <h2><span class="n">5</span>Open questions / blockers</h2>
  <ol>${QUESTIONS.map(q => `<li>${q}</li>`).join('')}</ol>

  <div class="foot">Bryant Park Consulting · NetSuite Planning &amp; Budgeting re-scope · ${esc(CAP)} · ${VER}. Counts are exact from the client's loader spreadsheets and the NSPB LCM; module keep/drop and segment recommendations are to be validated with the ${esc(CAP)} team.</div>
</body></html>`;

const htmlFile = path.join(dir, 'budget-analysis.html');
fs.writeFileSync(htmlFile, html);
const pdfFile = path.join(dir, 'budget-analysis.pdf');
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
      await s2('Page.enable');
      await s2('Page.navigate', { url: fileUrl });
      for (let k = 0; k < 40; k++) { await new Promise(r => setTimeout(r, 200)); if (evs.some(e => e.method === 'Page.loadEventFired')) break; }
      await new Promise(r => setTimeout(r, 500));
      const { data } = await s2('Page.printToPDF', { printBackground: true, preferCSSPageSize: true });
      fs.writeFileSync(pdfFile, Buffer.from(data, 'base64'));
    });
    await send('Target.closeTarget', { targetId });
  });
  console.log('✓ wrote', path.relative(ROOT, pdfFile), `(${(fs.statSync(pdfFile).size / 1024).toFixed(0)} KB)`);
})().catch(e => { console.error('PDF ERROR:', e.message); process.exit(1); });
