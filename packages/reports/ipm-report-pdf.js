'use strict';
// Render the IPM / AI Insights section as a standalone, BPC-branded, CLIENT-NEUTRAL
// PDF (for use as a demo / capability sample). Pure-LCM: needs only ipm.json +
// ipm-section.md produced by tools/detect-ipm.js — no level-0 / Activity Report.
//   node tools/ipm-report-pdf.js <CLIENT> [--display "Sample Application"]
// Prints via the debug Chrome (Page.printToPDF over CDP on :9222), same as
// report-to-pdf.js. Output: clients/<client>/ipm-report.pdf
const fs = require('fs');
const path = require('path');
const PORT = process.env.CDP_PORT || 9222;
const ROOT = path.join(__dirname, '..', '..');
const CLIENT = (process.argv[2] || 'demo').toLowerCase();
const dispArg = (() => { const i = process.argv.indexOf('--display'); return i > -1 ? process.argv[i + 1] : null; })();
const dir = path.join(ROOT, 'clients', CLIENT);

const ipm = JSON.parse(fs.readFileSync(path.join(dir, 'ipm.json'), 'utf8'));
let md = fs.readFileSync(path.join(dir, 'ipm-section.md'), 'utf8');
// Client-neutral label — never a real client name. Override with --display.
const DISPLAY = dispArg || 'Sample NSPB Application';
// Re-point the section's "<Client> uses IPM" line at the neutral label.
md = md.replace(/\*\*[A-Za-z0-9 ]+ uses IPM\.\*\*/, `**This application uses IPM.**`)
       .replace(/review with the [A-Za-z0-9 ]+ team/, 'review with the application team');

// ── BPC design tokens (mirror report-to-pdf.js) ──────────────────────
const NAVY = '#1F3C51', SAGE = '#619C8A', GOLD = '#F2CC5F', ORANGE = '#EC8842', DANGER = '#C9512E';
const GRAY = '#D9D9D9';
const LOGO_B64 = fs.readFileSync(path.join(ROOT, 'desgincode', 'assets', 'logo', 'bpc-logo.png')).toString('base64');
const VER = 'v' + new Date().toISOString().slice(0, 10) + '.' +
  String(new Date().getHours()).padStart(2, '0') + String(new Date().getMinutes()).padStart(2, '0');

const noEmoji = s => s.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{2190}-\u{21FF}\u{2300}-\u{23FF}]/gu, '').replace(/\s{2,}/g, ' ').trimStart();

// ── icons (BPC palette) ──────────────────────────────────────────────
const ICON_OK = `<svg viewBox="0 0 24 24" width="13" height="13" style="vertical-align:-2px"><circle cx="12" cy="12" r="11" fill="${SAGE}"/><path d="M7 12.5l3.2 3.2L17 8.5" stroke="#fff" stroke-width="2.3" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const ICON_X = `<svg viewBox="0 0 24 24" width="13" height="13" style="vertical-align:-2px"><circle cx="12" cy="12" r="11" fill="${DANGER}"/><path d="M8.2 8.2l7.6 7.6M15.8 8.2l-7.6 7.6" stroke="#fff" stroke-width="2.3" stroke-linecap="round"/></svg>`;
const ICON_IDEA = `<svg viewBox="0 0 24 24" width="13" height="13" style="vertical-align:-2px"><path d="M12 2.2a7 7 0 0 0-4.2 12.6c.6.5.95 1.05.95 1.85v.55h6.5v-.55c0-.8.35-1.35.95-1.85A7 7 0 0 0 12 2.2z" fill="${GOLD}"/><rect x="8.8" y="18.4" width="6.4" height="1.9" rx=".95" fill="${GOLD}"/><rect x="9.8" y="21" width="4.4" height="1.7" rx=".85" fill="${ORANGE}"/></svg>`;
const ICON_WARN = `<svg viewBox="0 0 24 24" width="13" height="13" style="vertical-align:-2px"><circle cx="12" cy="12" r="11" fill="${GOLD}"/><rect x="10.9" y="5.5" width="2.2" height="9" rx="1.1" fill="${NAVY}"/><circle cx="12" cy="17.6" r="1.5" fill="${NAVY}"/></svg>`;
const icons = s => s.replace(/@@OK@@/g, ICON_OK).replace(/@@X@@/g, ICON_X).replace(/@@IDEA@@/g, ICON_IDEA).replace(/@@WARN@@/g, ICON_WARN);
const esc = s => noEmoji(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = s => icons(esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/`([^`]+)`/g, '<code>$1</code>'));

function mdToHtml(src) {
  const lines = src.split('\n'); const out = []; let i = 0;
  while (i < lines.length) {
    let l = lines[i];
    if (/^# /.test(l)) { out.push(`<h1>${inline(l.slice(2))}</h1>`); i++; continue; }
    if (/^### /.test(l)) { out.push(`<h3>${inline(l.slice(4))}</h3>`); i++; continue; }
    if (/^## /.test(l)) { out.push(`<h2>${inline(l.slice(3))}</h2>`); i++; continue; }
    if (/^---\s*$/.test(l)) { out.push('<hr/>'); i++; continue; }
    if (/^\|/.test(l)) {
      const rows = []; while (i < lines.length && /^\|/.test(lines[i])) { rows.push(lines[i]); i++; }
      const cells = r => r.split('|').slice(1, -1).map(c => c.trim());
      const aligns = cells(rows[1] || '').map(c => /-+:$/.test(c) ? ' class="num"' : '');
      out.push('<table>');
      out.push('<thead><tr>' + cells(rows[0]).map((c, k) => `<th${aligns[k] || ''}>${inline(c)}</th>`).join('') + '</tr></thead>');
      out.push('<tbody>');
      for (const r of rows.slice(2)) out.push('<tr>' + cells(r).map((c, k) => `<td${aligns[k] || ''}>${inline(c)}</td>`).join('') + '</tr>');
      out.push('</tbody></table>'); continue;
    }
    if (/^- /.test(l)) { out.push('<ul>'); while (i < lines.length && /^- /.test(lines[i])) { out.push(`<li>${inline(lines[i].slice(2))}</li>`); i++; } out.push('</ul>'); continue; }
    if (/^\d+\.\s/.test(l)) { out.push('<ol>'); while (i < lines.length && /^\d+\.\s/.test(lines[i])) { out.push(`<li>${inline(lines[i].replace(/^\d+\.\s/, ''))}</li>`); i++; } out.push('</ol>'); continue; }
    if (/^\s*$/.test(l)) { i++; continue; }
    if (/^_.*_$/.test(l)) { out.push(`<p class="muted"><em>${inline(l.slice(1, -1))}</em></p>`); i++; continue; }
    out.push(`<p>${inline(l)}</p>`); i++;
  }
  return out.join('\n');
}

// ── client-neutral cover (IPM stats, not level-0) ────────────────────
function coverPage() {
  const maxHist = Math.max(0, ...ipm.batches.map(b => b.dateRange.historicalPeriod || 0));
  const fut = Math.max(0, ...ipm.batches.map(b => b.dateRange.futurePeriod || 0));
  const stat = (num, label) => `<div class="cstat"><div class="cnum">${num}</div><div class="clab">${label}</div></div>`;
  const stats = [
    stat(ipm.count, `Auto Predict batch${ipm.count > 1 ? 'es' : ''} configured`),
    stat((ipm.jobTypesUsed || []).length, 'insight types in use'),
    stat(`${maxHist}→${fut} mo`, 'history → forecast horizon'),
    stat('ARIMA', 'time-series model family'),
  ].join('');
  return `<section class="cover">
    <div class="cover-photo"><div class="cover-mesh"></div><div class="cover-grad"></div></div>
    <div class="cover-top"><span class="dot"></span>Bryant Park Consulting</div>
    <div class="cover-body">
      <div class="cover-eyebrow">Capability sample · ${new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} · ${VER}</div>
      <h1 class="cover-title">AI / IPM Insights<br/>Footprint Review</h1>
      <div class="cover-rule"></div>
      <p class="cover-sub">${DISPLAY} · what Oracle Intelligent Performance Management (Auto Predict, Prediction, Anomaly &amp; Historical Insights) is configured to do, on which data, with which model settings.</p>
      <div class="cover-stats">${stats}</div>
    </div>
    <div class="cover-foot"><span>bryantparkconsulting.com</span><span>NetSuite Planning &amp; Budgeting</span></div>
  </section>`;
}

const html = `<!doctype html><html><head><meta charset="utf-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
  @page { margin: 15mm 11mm 13mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Sarabun', Arial, sans-serif; font-weight: 300; color: ${NAVY}; font-size: 11px; line-height: 1.55; -webkit-font-smoothing: antialiased; }
  .brand { display:flex; align-items:flex-end; justify-content:space-between; border-bottom: 2px solid ${NAVY}; padding-bottom: 9px; margin-bottom: 16px; }
  .brand img { height: 26px; }
  .brand .eyebrow { font-size:9px; font-weight:600; letter-spacing:.14em; text-transform:uppercase; color:${SAGE}; }
  h1 { font-weight:300; font-size: 26px; letter-spacing:-.02em; color:${NAVY}; margin: 2px 0 1px; }
  h2 { font-weight:600; font-size: 14px; color:${NAVY}; margin: 18px 0 7px; padding-bottom:4px; border-bottom:1px solid ${GRAY}; }
  h3 { font-weight:600; font-size: 11.5px; color:${SAGE}; margin: 12px 0 4px; }
  h1, h2, h3 { break-after: avoid-page; page-break-after: avoid; break-inside: avoid; }
  p, li { break-inside: avoid; page-break-inside: avoid; orphans: 3; widows: 3; }
  p { margin: 5px 0; }
  ul, ol { margin: 4px 0 9px 18px; padding: 0; }
  li { margin: 3px 0; }
  table { border-collapse: collapse; width: 100%; margin: 9px 0; font-size: 9.5px; }
  th { background:${NAVY}; color:#fff; font-weight:500; text-align:left; padding:6px 8px; }
  td { padding:5px 8px; border-bottom:1px solid #EEEEEE; vertical-align:top; }
  tr:nth-child(even) td { background:#FAFAFA; }
  td.num, th.num { text-align:right; font-variant-numeric: tabular-nums; }
  hr { border:0; border-top:1px solid #EEEEEE; margin:16px 0; }
  strong { font-weight:600; color:${NAVY}; }
  code { font-family:'JetBrains Mono',monospace; font-size:.86em; background:#F3F3F3; padding:1px 5px; border-radius:2px; color:${NAVY}; }
  .muted { color:#767676; font-size:9.5px; }
  /* intro callout */
  .callout { background:#F5F8F7; border-left:3px solid ${SAGE}; border-radius:0 6px 6px 0; padding:10px 14px; margin:10px 0 14px; font-size:10px; color:#434343; }

  /* ── Cover ── */
  .cover { position:relative; width:100vw; height:255mm; background:${NAVY}; color:#fff; overflow:hidden; page-break-after:always; margin:-15mm -11mm 0; padding:0; }
  .cover-photo { position:absolute; inset:0 0 0 48%; background:linear-gradient(135deg,#2a5068,#162c3b); }
  .cover-mesh { position:absolute; inset:0; opacity:.5;
    background-image:radial-gradient(circle at 70% 30%, ${SAGE}55 0, transparent 38%), radial-gradient(circle at 85% 70%, ${GOLD}33 0, transparent 30%), radial-gradient(circle at 55% 85%, ${ORANGE}22 0, transparent 34%); }
  .cover-grad { position:absolute; inset:0; background:linear-gradient(90deg, ${NAVY} 0%, rgba(31,60,81,.55) 42%, rgba(31,60,81,.12) 100%); }
  .cover-top { position:absolute; top:20mm; left:18mm; font-size:12px; font-weight:500; display:flex; align-items:center; gap:8px; z-index:3; }
  .cover-top .dot { width:9px; height:9px; border-radius:50%; background:${GOLD}; display:inline-block; }
  .cover-body { position:absolute; left:18mm; right:48%; top:74mm; z-index:3; }
  .cover-eyebrow { font-size:11px; font-weight:600; letter-spacing:.14em; text-transform:uppercase; color:${GOLD}; margin-bottom:14px; }
  .cover-title { font-weight:300; font-size:38px; line-height:1.08; letter-spacing:-.02em; color:#fff; margin:0; }
  .cover-rule { width:54px; height:3px; background:${GOLD}; margin:18px 0; }
  .cover-sub { font-size:12px; line-height:1.6; color:rgba(255,255,255,.8); max-width:340px; font-weight:300; }
  .cover-stats { display:flex; flex-wrap:wrap; gap:10px 26px; margin-top:30px; max-width:360px; }
  .cstat { min-width:120px; }
  .cstat .cnum { font-weight:500; font-size:25px; color:${GOLD}; line-height:1; letter-spacing:-.01em; }
  .cstat .clab { font-size:9.5px; color:rgba(255,255,255,.72); margin-top:4px; }
  .cover-foot { position:absolute; bottom:18mm; left:18mm; right:18mm; display:flex; justify-content:space-between; font-size:9.5px; color:rgba(255,255,255,.6); z-index:3; }
</style></head><body>
  ${coverPage()}
  <div class="brand"><img src="data:image/png;base64,${LOGO_B64}" alt="Bryant Park Consulting"/><span class="eyebrow">AI / IPM Insights Review · Capability sample · ${VER}</span></div>
  <h1>AI / IPM Insights footprint — ${DISPLAY}</h1>
  <div class="callout">This is a <strong>capability sample</strong> produced from an Oracle NSPB LCM export. It shows what Bryant Park Consulting surfaces about an application's built-in AI (Intelligent Performance Management) footprint. All names are from a neutral demo application.</div>
  ${mdToHtml(md).replace(/<h2>AI \/ IPM Insights footprint<\/h2>/, '')}
</body></html>`;

const htmlFile = path.join(dir, 'ipm-report.html');
fs.writeFileSync(htmlFile, html);
const pdfFile = path.join(dir, 'ipm-report.pdf');
const fileUrl = 'file:///' + htmlFile.replace(/\\/g, '/');

async function httpJson(p) { return (await fetch(`http://127.0.0.1:${PORT}${p}`)).json(); }
function wsCall(wsUrl, fn) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl); let id = 0; const pend = new Map(); const evs = [];
    const send = (m, p) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p || {} })); });
    ws.onmessage = e => { const d = JSON.parse(e.data); if (d.id && pend.has(d.id)) { const q = pend.get(d.id); pend.delete(d.id); d.error ? q.rej(new Error(d.error.message)) : q.res(d.result); } else if (d.method) evs.push(d); };
    ws.onopen = async () => { try { resolve(await fn(send, evs)); } catch (e) { reject(e); } finally { ws.close(); } };
    ws.onerror = () => reject(new Error('CDP not reachable on :' + PORT + ' — launch the debug Chrome.'));
  });
}
(async () => {
  const ver = await httpJson('/json/version');
  await wsCall(ver.webSocketDebuggerUrl, async (send) => {
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const list = await httpJson('/json/list');
    const t = list.find(x => x.id === targetId);
    await wsCall(t.webSocketDebuggerUrl, async (s2, evs) => {
      await s2('Page.enable');
      await s2('Page.navigate', { url: fileUrl });
      for (let k = 0; k < 30; k++) { await new Promise(r => setTimeout(r, 200)); if (evs.some(e => e.method === 'Page.loadEventFired')) break; }
      await new Promise(r => setTimeout(r, 400));
      const { data } = await s2('Page.printToPDF', { printBackground: true, preferCSSPageSize: true });
      fs.writeFileSync(pdfFile, Buffer.from(data, 'base64'));
    });
    await send('Target.closeTarget', { targetId });
  });
  console.log('✓ wrote', path.relative(ROOT, pdfFile), `(${(fs.statSync(pdfFile).size / 1024).toFixed(0)} KB)`);
})().catch(e => { console.error('PDF ERROR:', e.message); process.exit(1); });
