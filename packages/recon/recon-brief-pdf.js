'use strict';
// Standalone, shareable technical brief: "Why Total Revenue and Income may not reconcile".
// Pulls from clients/<CLIENT>/{revenue-recon.json, level0/*-source.json, activity-report.json}
// and the live LCM rule text, renders a compact BPC-branded PDF via debug Chrome (CDP :9222).
//   node tools/recon-brief-pdf.js [CLIENT]
const fs = require('fs');
const path = require('path');
const PORT = process.env.CDP_PORT || 9222;
const ROOT = path.join(__dirname, '..');
const CLIENT = process.argv[2] || 'talogy';
const CAP = CLIENT[0].toUpperCase() + CLIENT.slice(1);
const dir = path.join(ROOT, 'clients', CLIENT);
const J = f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
const RR = J('revenue-recon.json');
const AR = J('activity-report.json');
const SRC = { OEP_FS: J('level0/OEP_FS-source.json'), RevPlan: J('level0/RevPlan-source.json') };
const VER = 'v' + new Date().toISOString().slice(0, 10) + '.' + String(new Date().getHours()).padStart(2, '0') + String(new Date().getMinutes()).padStart(2, '0');

// ── BPC design tokens ────────────────────────────────────────────────
const NAVY = '#1F3C51', SAGE = '#619C8A', GOLD = '#F2CC5F', ORANGE = '#EC8842', DANGER = '#C9512E', GRAY = '#9AA3AB';
const b64 = f => fs.existsSync(f) ? fs.readFileSync(f).toString('base64') : '';
const LOGO = b64(path.join(ROOT, 'desgincode', 'assets', 'logo', 'bpc-logo.png'));
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const ICON = {
  OK: `<svg viewBox="0 0 24 24" width="13" height="13" style="vertical-align:-2px"><circle cx="12" cy="12" r="11" fill="${SAGE}"/><path d="M7 12.5l3.2 3.2L17 8.5" stroke="#fff" stroke-width="2.3" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  X: `<svg viewBox="0 0 24 24" width="13" height="13" style="vertical-align:-2px"><circle cx="12" cy="12" r="11" fill="${DANGER}"/><path d="M8.2 8.2l7.6 7.6M15.8 8.2l-7.6 7.6" stroke="#fff" stroke-width="2.3" stroke-linecap="round"/></svg>`,
  WARN: `<svg viewBox="0 0 24 24" width="13" height="13" style="vertical-align:-2px"><circle cx="12" cy="12" r="11" fill="${GOLD}"/><rect x="10.9" y="5.5" width="2.2" height="9" rx="1.1" fill="${NAVY}"/><circle cx="12" cy="17.6" r="1.5" fill="${NAVY}"/></svg>`,
  IDEA: `<svg viewBox="0 0 24 24" width="13" height="13" style="vertical-align:-2px"><path d="M12 2.2a7 7 0 0 0-4.2 12.6c.6.5.95 1.05.95 1.85v.55h6.5v-.55c0-.8.35-1.35.95-1.85A7 7 0 0 0 12 2.2z" fill="${GOLD}"/><rect x="8.8" y="18.4" width="6.4" height="1.9" rx=".95" fill="${GOLD}"/><rect x="9.8" y="21" width="4.4" height="1.7" rx=".85" fill="${ORANGE}"/></svg>`,
};

// ── data prep ────────────────────────────────────────────────────────
const SS = RR.savedSearches, H = RR.hierarchy, PM = RR.pushMap || [], G = RR.gaps || {}, LS = RR.loadStructure || {};
const incSearch = LS.incomeSearch || (SS.income[0] || {}).search;
const revSearch = LS.revenueSearch || (SS.revenue[0] || {}).search;
const tgtN = new Set(PM.flatMap(p => p.targets)).size;
const dimsOf = c => new Set(((AR.dimensionsByCube && AR.dimensionsByCube[c]) || []).map(d => d.name));
const rpOnly = [...dimsOf('RevPlan')].filter(d => !dimsOf('OEP_FS').has(d));
const fsOnly = [...dimsOf('OEP_FS')].filter(d => !dimsOf('RevPlan').has(d));

// representative @XWRITE excerpt from the actual rule
function ruleExcerpt() {
  const base = path.join(dir, 'CALC-Calculation Manager', 'resource', 'Planning');
  let file = null;
  if (fs.existsSync(base)) for (const app of fs.readdirSync(base)) {
    const f = path.join(base, app, 'RevPlan', 'Rules', 'REV_Push to OEP_FS');
    if (fs.existsSync(f)) { file = f; break; }
  }
  if (!file) return null;
  let txt = fs.readFileSync(file, 'utf8').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&').replace(/&quot;/g, '"');
  const sc = (txt.match(/<script type="calcscript">([\s\S]*?)<\/script>/) || [])[1] || '';
  const lines = sc.split('\n').map(l => l.replace(/\s+$/, ''));
  const start = lines.findIndex(l => /@XWRITE/.test(l));
  if (start < 0) return null;
  const end = lines.findIndex((l, i) => i > start && /\)\s*$/.test(l) && !/@XWRITE/.test(l));
  return lines.slice(Math.max(0, start - 2), (end > 0 ? end + 1 : start + 16)).join('\n').trim();
}
const EXCERPT = ruleExcerpt();

// ── small charts ─────────────────────────────────────────────────────
const BUCKET_COLOR = {
  'NetSuite load (FDMEE)': SAGE, 'Manual adjustment': GOLD, 'Calc rule (calculated)': NAVY,
  'Trend-based forecast': ORANGE, 'Cross-module push (Integration)': ORANGE, 'Allocation': GRAY,
  'Direct input (manual)': '#C9A227', 'Workforce push': DANGER,
};
function sourceBar(label, focusByBucket) {
  const entries = Object.entries(focusByBucket).sort((a, b) => b[1] - a[1]);
  const tot = entries.reduce((s, [, v]) => s + v, 0) || 1;
  let x = 0;
  const segs = entries.map(([b, v]) => { const w = 100 * v / tot; const s = `<rect x="${x}%" y="0" width="${w}%" height="22" fill="${BUCKET_COLOR[b] || GRAY}"/>`; x += w; return s; }).join('');
  const legend = entries.map(([b, v]) => `<span style="font-size:8.3px;color:#434343;margin-right:12px;white-space:nowrap"><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${BUCKET_COLOR[b] || GRAY};margin-right:3px"></span>${b} <b>${(100 * v / tot).toFixed(1)}%</b></span>`).join('');
  return `<div style="margin:7px 0"><div style="font-size:9px;font-weight:600;color:${NAVY};margin-bottom:3px">${label} <span style="font-weight:400;color:#767676">— ${tot.toLocaleString()} level-0 data cells</span></div>
    <svg viewBox="0 0 100 22" width="100%" height="22" preserveAspectRatio="none" style="border-radius:3px;overflow:hidden">${segs}</svg>
    <div style="margin-top:5px">${legend}</div></div>`;
}

// ── lineage diagram (two saved searches → two cubes → two figures) ────
function lineage() {
  const shorten = s => (s || '?').replace('customsearch_nspbcs_all_transactions', 'cs_…');
  const W = 720, top = 34, rowH = 86, hB = 46;
  const x0 = 8, bw0 = 188, x1 = 205, bw1 = 150, x2 = 372, bw2 = 120, x3 = 512, bw3 = 150;
  const yI = top + 4, yR = top + rowH + 4, H_ = top + 2 * rowH + 26;
  const box = (x, y, w, t, sub, color) => `<rect x="${x}" y="${y}" width="${w}" height="${hB}" rx="7" fill="#fff" stroke="${color}" stroke-width="1.6"/><rect x="${x}" y="${y}" width="4.5" height="${hB}" rx="2" fill="${color}"/><text x="${x + 12}" y="${y + 18}" font-size="9.5" font-weight="600" fill="${NAVY}" font-family="Sarabun">${t}</text><text x="${x + 12}" y="${y + 33}" font-size="7.8" fill="#6b7280" font-family="Sarabun">${sub}</text>`;
  const arr = (ax, ay, bx, by) => `<path d="M${ax} ${ay} C ${(ax + bx) / 2} ${ay}, ${(ax + bx) / 2} ${by}, ${bx} ${by}" stroke="#94A6B3" stroke-width="1.4" fill="none" marker-end="url(#a)"/>`;
  const hdr = (x, t) => `<text x="${x}" y="18" font-size="9" font-weight="700" letter-spacing=".05em" fill="${SAGE}" font-family="Sarabun">${t}</text>`;
  let s = `<defs><marker id="a" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto"><path d="M0,0 L7,3 L0,6 Z" fill="#94A6B3"/></marker><marker id="ag" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto"><path d="M0,0 L7,3 L0,6 Z" fill="${ORANGE}"/></marker></defs>`;
  s += hdr(x0, 'NETSUITE SAVED SEARCH') + hdr(x1, 'FDMEE LOAD') + hdr(x2, 'CUBE') + hdr(x3, 'BUSINESS FIGURE');
  s += box(x0, yI, bw0, shorten(incSearch), 'income / financials', SAGE) + box(x1, yI, bw1, 'Financial Actuals', 'into OEP_FS', SAGE) + box(x2, yI, bw2, 'OEP_FS', 'Financials', SAGE) + box(x3, yI, bw3, 'INCOME', H.incomeLeaves.length + ' GL accounts', NAVY);
  s += arr(x0 + bw0, yI + hB / 2, x1, yI + hB / 2) + arr(x1 + bw1, yI + hB / 2, x2, yI + hB / 2) + arr(x2 + bw2, yI + hB / 2, x3, yI + hB / 2);
  s += box(x0, yR, bw0, shorten(revSearch), 'revenue', GOLD) + box(x1, yR, bw1, 'RevPlan Actuals', 'into RevPlan', GOLD) + box(x2, yR, bw2, 'RevPlan', 'Revenue (custom)', GOLD) + box(x3, yR, bw3, 'Total Revenue', H.revLeaves.length + ' categories', NAVY);
  s += arr(x0 + bw0, yR + hB / 2, x1, yR + hB / 2) + arr(x1 + bw1, yR + hB / 2, x2, yR + hB / 2) + arr(x2 + bw2, yR + hB / 2, x3, yR + hB / 2);
  // second path: revenue load (RevPlan Actuals) also lands in OEP_FS via the *_OEPFS rules
  const mY = (yI + hB + yR) / 2;
  s += `<path d="M${x1 + bw1 * 0.55} ${yR} C ${x1 + bw1 * 0.55 + 16} ${yR - 26}, ${x2} ${yI + hB + 16}, ${x2 + 26} ${yI + hB}" stroke="${ORANGE}" stroke-width="1.5" fill="none" stroke-dasharray="4 3" marker-end="url(#ag)"/>`;
  s += `<text x="${x0 + 2}" y="${mY + 3}" font-size="7.6" fill="${ORANGE}" font-family="Sarabun">RevPlan Actuals also loads OEP_FS &#8594; revenue reaches Financials twice (the _OEPFS rules)</text>`;
  const bx = x3 + bw3 + 5;
  s += `<path d="M${bx} ${yI + hB / 2} C ${bx + 14} ${yI + hB / 2}, ${bx + 14} ${yR + hB / 2}, ${bx} ${yR + hB / 2}" stroke="${DANGER}" stroke-width="1.7" fill="none" stroke-dasharray="4 3"/><text x="${bx - 2}" y="${(yI + yR) / 2 + hB / 2 + 3}" font-size="13" font-weight="700" fill="${DANGER}" font-family="Sarabun">&#8800;</text>`;
  const by = top + rowH - 4;
  s += `<rect x="${x2 - 4}" y="${by}" width="${(x3 + bw3) - (x2 - 4)}" height="19" rx="9" fill="#FBF3D6" stroke="${GOLD}" stroke-width="1"/><text x="${x2 + 6}" y="${by + 13}" font-size="7.8" fill="${NAVY}" font-family="Sarabun">only structural bridge: @XWRITE push · ${PM.length} categories &#8594; ${tgtN} GL accounts</text>`;
  return `<svg viewBox="0 0 ${W} ${H_}" width="100%" style="max-width:720px">${s}</svg>`;
}

// ── tables ───────────────────────────────────────────────────────────
const ssRows = arr => arr.map(r => `<tr><td>${esc(r.dataSource)}</td><td><code>${esc(r.search)}</code></td></tr>`).join('');
const pushRows = PM.map(m => `<tr><td>${esc(m.src)}</td><td>${esc(m.targets.join(', '))}</td></tr>`).join('');

// ── HTML ─────────────────────────────────────────────────────────────
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
  @page { margin: 13mm 12mm; }
  * { box-sizing: border-box; }
  body { font-family:'Sarabun',Arial,sans-serif; font-weight:300; color:${NAVY}; font-size:11px; line-height:1.5; -webkit-font-smoothing:antialiased; }
  .brand { display:flex; align-items:flex-end; justify-content:space-between; border-bottom:2px solid ${NAVY}; padding-bottom:9px; margin-bottom:12px; }
  .brand img { height:26px; }
  .brand .eyebrow { font-size:9px; font-weight:600; letter-spacing:.13em; text-transform:uppercase; color:${SAGE}; }
  h1 { font-weight:300; font-size:23px; letter-spacing:-.02em; margin:6px 0 2px; }
  h2 { font-weight:600; font-size:13px; margin:16px 0 6px; padding-bottom:4px; border-bottom:1px solid #D9D9D9; }
  h1,h2 { break-after:avoid; }
  p,li { break-inside:avoid; }
  p { margin:5px 0; } ul { margin:4px 0 8px 18px; padding:0; } li { margin:3px 0; }
  table { border-collapse:collapse; width:100%; margin:8px 0; font-size:10px; }
  th { background:${NAVY}; color:#fff; font-weight:500; text-align:left; padding:5px 8px; }
  td { padding:4px 8px; border-bottom:1px solid #EEE; vertical-align:top; }
  tr:nth-child(even) td { background:#FAFAFA; }
  code { font-family:'JetBrains Mono',monospace; font-size:.88em; background:#F3F3F3; padding:1px 4px; border-radius:2px; color:${NAVY}; }
  pre { font-family:'JetBrains Mono',monospace; font-size:8.4px; line-height:1.5; background:${NAVY}; color:#E8EDF2; border-radius:6px; padding:10px 13px; white-space:pre; overflow:hidden; margin:8px 0; break-inside:avoid; }
  .muted { color:#767676; font-size:9.5px; }
  .lead { font-size:11.5px; color:#2b4a5e; background:#F4F7F6; border-left:3px solid ${SAGE}; padding:9px 12px; border-radius:0 6px 6px 0; margin:8px 0 12px; }
  .card { border:1px solid #EEE; border-radius:8px; padding:11px 13px; margin:9px 0; box-shadow:0 1px 2px rgba(31,60,81,.06); break-inside:avoid; }
  .ct { font-size:10px; font-weight:600; color:${NAVY}; margin-bottom:5px; }
  .cap { font-size:9.3px; color:#767676; margin-top:6px; line-height:1.4; border-top:1px solid #F3F3F3; padding-top:5px; }
  .foot { margin-top:14px; padding-top:8px; border-top:1px solid #EEE; font-size:8.6px; color:#9AA3AB; }
  .two { display:flex; gap:10px; } .two > div { flex:1; }
</style></head><body>
  <div class="brand"><img src="data:image/png;base64,${LOGO}"/><span class="eyebrow">Technical Brief · Confidential · ${VER}</span></div>
  <h1>Why <span style="color:${SAGE}">Total Revenue</span> and <span style="color:${ORANGE}">Income</span> may not reconcile</h1>
  <p class="muted">NetSuite Planning &amp; Budgeting (${esc(AR.app ? AR.app.name : 'PAI_PLN')}) · ${esc(CAP)} · prepared by Bryant Park Consulting. Findings derived from the LCM export, the calc rules, and the level-0 data export — presented as <b>suggested explanations to validate</b>, not certainties.</p>

  <div class="lead"><b>In one line:</b> <code>Income</code> (Financials) and <code>Total Revenue</code> (Revenue module) are loaded from <b>two different NetSuite saved searches</b> into two cubes that share <b>${H.common.length} account members</b>. They are linked only by a hard-coded push rule — so they tie only if both searches return the same revenue and the push is complete. Today, several structural reasons make that unlikely.</div>

  <h2>The five reasons, ranked</h2>
  <ul>
    <li>${ICON.X} <b>Two different NetSuite saved searches feed the two figures.</b> Income loads from <code>${esc(incSearch)}</code>; revenue from <code>${esc(revSearch)}</code>. They are separate saved-search objects — any difference in their <b>criteria</b> (account scope, posting vs non-posting, transaction type, eliminations, main-line) makes them disagree at the source.</li>
    <li>${ICON.X} <b>The two account hierarchies share ${H.common.length} level-0 members.</b> <code>INCOME</code> = ${H.incomeLeaves.length} NetSuite GL accounts (A4000…); <code>Total Revenue</code> = ${H.revLeaves.length} planning categories (Testing Revenue, Subscription Revenue…). Different grain — they are not the same accounts.</li>
    <li>${ICON.WARN} <b>The only bridge is a hard-coded <code>@XWRITE</code> push</b> (rule <code>REV_Push to OEP_FS</code>), mapping ${PM.length} revenue categories to ${tgtN} GL accounts, one-to-one. New accounts or categories do not map automatically.</li>
    <li>${ICON.X} <b>In the real data, Income is 100% NetSuite-loaded.</b> The push does not reconcile the income accounts at level 0 — and ${G.incomeNoPush ? `${G.incomeNoPush.length} of the ${G.incomeLeaves} income accounts are never a push target` : 'most income accounts are never a push target'}.</li>
    <li>${ICON.WARN} <b>Total Revenue carries adjustments &amp; calc that Income does not</b> (manual adjustments, calc rules — see the data-source breakdown), and RevPlan has an extra <b>${rpOnly.join(', ') || 'Integration'}</b> dimension OEP_FS lacks, so the two are summed over different spaces.</li>
  </ul>

  <div class="card"><div class="ct">Data lineage — two separate saved searches feed the two figures</div>${lineage()}
    <div class="cap">Both figures originate in NetSuite but from <b>different</b> saved searches, land in different cubes, and are then compared. The dashed red link (&#8800;) is the reconciliation the business expects; the model never enforces it.</div></div>

  <h2>Evidence 1 — data load structure (which saved search lands where)</h2>
  <p>Joined from the FDMEE import formats + data-load rules. These are the saved searches actually wired into the live loads:</p>
  <table><thead><tr><th>NetSuite saved search</th><th>Source</th><th>Target cube</th><th>Cat.</th><th>Target area / hierarchy</th></tr></thead><tbody>
    ${(LS.dataLoads || []).map(d => `<tr><td><code>${esc(d.search)}</code></td><td>${esc(d.dataSource.replace('PBCS - ', ''))}</td><td>${esc(d.targetCubes.join(' + '))}</td><td>${esc(d.categories.join(', '))}</td><td>${esc(d.area)}</td></tr>`).join('')}
  </tbody></table>
  ${LS.unwired && LS.unwired.length ? `<p>${ICON.X} <b>${LS.unwired.length} more "all transactions" saved searches are defined but NOT wired into any import format</b> (likely legacy/unused): ${LS.unwired.map(u => `<code>${esc(u.search)}</code>`).join(', ')}.</p>` : ''}
  <p>${ICON.IDEA} <b>Fastest way to confirm the gap:</b> diff the <b>Criteria</b> tabs of <code>${esc(incSearch)}</code> (Income) and <code>${esc(revSearch)}</code> (Revenue) in NetSuite. The names are above; the filter criteria live in NetSuite, not in the LCM.</p>

  <h2>Evidence 2 — the push rule that bridges them (<code>REV_Push to OEP_FS</code>)</h2>
  <p>Each revenue category is written into one GL account via <code>@XWRITE</code>, many-to-one. This is the <i>only</i> structural connection between the two figures:</p>
  <table><thead><tr><th>Revenue category (source)</th><th>GL account (target)</th></tr></thead><tbody>${pushRows}</tbody></table>
  ${EXCERPT ? `<p class="muted" style="margin-top:8px">Representative excerpt from the rule (Essbase calc script):</p><pre>${esc(EXCERPT)}</pre>` : ''}
  ${G.revNoPush && G.revNoPush.length ? `<p>${ICON.WARN} <b>${G.revNoPush.length} revenue categories are not in the push</b> (${G.revNoPush.map(s => `<code>${esc(s)}</code>`).join(', ')}). <code>Total Net</code> is a calculated subtotal (expected); the others may be handled by the Groovy <code>RevPlan2FinRpt</code> data-map path — verify before treating as orphans.</p>` : ''}

  <h2>Evidence 3 — what actually feeds each figure (from the level-0 data)</h2>
  <div class="card"><div class="ct">Source of every level-0 data cell, by figure (Plan Element)</div>
    ${sourceBar('INCOME — the ' + H.incomeLeaves.length + ' GL accounts', SRC.OEP_FS.focusByBucket)}
    ${sourceBar('TOTAL REVENUE — the ' + H.revLeaves.length + ' categories', SRC.RevPlan.focusByBucket)}
    <div class="cap">Read from the real exported data (${SRC.OEP_FS.totalCells.toLocaleString()} + ${SRC.RevPlan.totalCells.toLocaleString()} cells across the two cubes). <b>Income is fed 100% by the NetSuite load.</b> <b>Total Revenue is ~96% NetSuite load</b> plus manual adjustments and calc that Income does not carry — a second reason the totals diverge.</div></div>

  <h2>Recommended next steps</h2>
  <ul>
    <li>${ICON.IDEA} <b>Diff the two saved searches' criteria in NetSuite</b> (<code>${esc(incSearch)}</code> vs <code>${esc(revSearch)}</code>) — the most likely root cause.</li>
    <li>${ICON.IDEA} <b>Decide the intent:</b> should <code>Total Revenue</code> equal <code>Income</code>? If yes, align the searches (or the push); if no, document the intended difference so the comparison stops being treated as a reconciliation.</li>
    <li>${ICON.IDEA} <b>Pin a common POV</b> (Scenario, Version, Year, Period, Entity, Currency) and aggregate over the non-shared dimension(s) — ${rpOnly.length ? `RevPlan's <b>${rpOnly.join(', ')}</b> dimension in particular` : 'the module-specific dimensions'} — before comparing totals.</li>
  </ul>

  <div class="foot">Bryant Park Consulting · NetSuite Planning &amp; Budgeting · ${esc(CAP)} · ${VER}. Counts and mappings are exact from the LCM export and the level-0 data; the cause of the divergence should be confirmed against the live NetSuite saved searches before any change.</div>
</body></html>`;

const htmlFile = path.join(dir, 'recon-brief.html');
fs.writeFileSync(htmlFile, html);
const pdfFile = path.join(dir, 'recon-brief.pdf');
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
