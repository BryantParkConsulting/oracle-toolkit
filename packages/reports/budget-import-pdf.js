'use strict';
// Render clients/<CLIENT>/budget-import-guide.md as a BPC-branded PDF.
//   node tools/budget-import-pdf.js [CLIENT]
// Self-contained: shares the BPC design shell with state-report-pdf.js but has
// no JSON dependencies — cover stats are read straight from tenant-kb.json.
// Needs the debug Chrome on :9222 (Page.printToPDF over CDP).
const fs = require('fs');
const path = require('path');
const PORT = process.env.CDP_PORT || 9222;
const ROOT = path.join(__dirname, '..', '..');
const CLIENT = process.argv[2] || 'symetri';
const dir = path.join(ROOT, 'clients', CLIENT);
const CAP = CLIENT[0].toUpperCase() + CLIENT.slice(1);
const md = fs.readFileSync(path.join(dir, 'budget-import-guide.md'), 'utf8');
const kb = JSON.parse(fs.readFileSync(path.join(dir, 'tenant-kb.json'), 'utf8'));
const VER = 'v' + new Date().toISOString().slice(0, 10);

// ── BPC design tokens ────────────────────────────────────────────────
const NAVY = '#1F3C51', SAGE = '#619C8A', GOLD = '#F2CC5F', ORANGE = '#EC8842', DANGER = '#C9512E';
const GRAY = '#D9D9D9';
const b64 = f => fs.existsSync(f) ? fs.readFileSync(f).toString('base64') : '';
const LOGO_B64 = b64(path.join(ROOT, 'desgincode', 'assets', 'logo', 'bpc-logo.png'));
const HERO_B64 = b64(path.join(ROOT, 'desgincode', 'assets', 'backgrounds', 'hero-office.png'));
const CIRCLES_B64 = b64(path.join(ROOT, 'desgincode', 'assets', 'patterns', 'circles-pattern.png'));
const noEmoji = s => s.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{2190}-\u{21FF}\u{2300}-\u{23FF}]/gu, '').replace(/\s{2,}/g, ' ').trimStart();
const fmt = x => Number(x).toLocaleString('en-US');

// ── cover stats from the KB ──────────────────────────────────────────
const forms = kb.forms || [];
const inputForms = forms.filter(f => f.kind === 'input').length;
const opexForms = forms.filter(f => /OpEx|Indirect Expense|Advertising|Travel|Rent|Allocation/i.test((f.path || '') + ' ' + (f.name || ''))).length;
const wfForms = forms.filter(f => /Workforce|Employee|Headcount|Compensation|Benefit|Roster/i.test((f.path || '') + ' ' + (f.name || ''))).length;

function coverPage() {
  const stat = (num, label) => `<div class="cstat"><div class="cnum">${num}</div><div class="clab">${label}</div></div>`;
  const stats = [
    stat(`${inputForms}`, 'input forms to plan on'),
    stat(`${opexForms}`, 'OpEx forms & schedules'),
    stat(`${wfForms}`, 'Workforce forms'),
    stat('3', 'ways data enters NSPB'),
  ].join('');
  return `<section class="cover">
    <div class="cover-photo">
      ${HERO_B64 ? `<img src="data:image/png;base64,${HERO_B64}"/>` : ''}
      <div class="cover-grad"></div>
      ${CIRCLES_B64 ? `<div class="cover-circles" style="background-image:url('data:image/png;base64,${CIRCLES_B64}')"></div>` : ''}
    </div>
    <div class="cover-top"><span class="dot"></span>Bryant Park Consulting</div>
    <div class="cover-body">
      <div class="cover-eyebrow">Confidential · ${new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} · ${VER}</div>
      <h1 class="cover-title">Loading Budget<br/>Data into NSPB</h1>
      <div class="cover-rule"></div>
      <p class="cover-sub">${CAP} · How budget figures are entered, calculated and consolidated in your NetSuite Planning &amp; Budgeting application — with a focus on OpEx and Workforce.</p>
      <div class="cover-stats">${stats}</div>
    </div>
    <div class="cover-foot"><span>bryantparkconsulting.com</span><span>NetSuite Planning &amp; Budgeting</span></div>
  </section>`;
}

// ── markdown → HTML (same dialect as state-report-pdf.js) ────────────
const ICON_OK = `<svg viewBox="0 0 24 24" width="13" height="13" style="vertical-align:-2px"><circle cx="12" cy="12" r="11" fill="${SAGE}"/><path d="M7 12.5l3.2 3.2L17 8.5" stroke="#fff" stroke-width="2.3" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const ICON_X = `<svg viewBox="0 0 24 24" width="13" height="13" style="vertical-align:-2px"><circle cx="12" cy="12" r="11" fill="${DANGER}"/><path d="M8.2 8.2l7.6 7.6M15.8 8.2l-7.6 7.6" stroke="#fff" stroke-width="2.3" stroke-linecap="round"/></svg>`;
const icons = s => s.replace(/@@OK@@/g, ICON_OK).replace(/@@X@@/g, ICON_X);
const esc = s => noEmoji(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// inline: bold, code, and [ ] / [x] checkboxes
const inline = s => icons(esc(s)
  .replace(/^\[ \]\s/, '@@X@@ ').replace(/^\[x\]\s/i, '@@OK@@ ')
  .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  .replace(/`([^`]+)`/g, '<code>$1</code>'));
function mdToHtml(src) {
  const lines = src.split('\n');
  const out = []; let i = 0;
  while (i < lines.length) {
    let l = lines[i];
    if (/^```/.test(l)) {
      i++; const code = [];
      while (i < lines.length && !/^```/.test(lines[i])) { code.push(esc(lines[i])); i++; }
      i++;
      out.push(`<pre class="code">${code.join('\n')}</pre>`);
      continue;
    }
    if (/^> /.test(l)) {
      const q = []; while (i < lines.length && /^> /.test(lines[i])) { q.push(inline(lines[i].slice(2))); i++; }
      out.push(`<blockquote class="note">${q.join('<br/>')}</blockquote>`); continue;
    }
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
      out.push('</tbody></table>');
      continue;
    }
    if (/^- \[[ x]\]/i.test(l) || /^- /.test(l)) {
      out.push('<ul>'); while (i < lines.length && /^- /.test(lines[i])) {
        let t = lines[i].slice(2);
        t = t.replace(/^\[ \]\s/, '@@X@@ ').replace(/^\[x\]\s/i, '@@OK@@ ');
        out.push(`<li>${inline(t).replace(/^\[ \]\s/, '')}</li>`); i++;
      }
      out.push('</ul>'); continue;
    }
    if (/^\d+\.\s/.test(l)) {
      out.push('<ol>'); while (i < lines.length && /^\d+\.\s/.test(lines[i])) { out.push(`<li>${inline(lines[i].replace(/^\d+\.\s/, ''))}</li>`); i++; }
      out.push('</ol>'); continue;
    }
    if (/^\s*$/.test(l)) { i++; continue; }
    if (/^_.*_$/.test(l)) { out.push(`<p class="muted"><em>${inline(l.slice(1, -1))}</em></p>`); i++; continue; }
    out.push(`<p>${inline(l)}</p>`); i++;
  }
  return out.join('\n');
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
  h1 { font-family:'Sarabun'; font-weight:300; font-size: 26px; letter-spacing:-.02em; color:${NAVY}; margin: 2px 0 1px; }
  h2 { font-family:'Sarabun'; font-weight:600; font-size: 14px; color:${NAVY}; margin: 18px 0 7px; padding-bottom:4px; border-bottom:1px solid ${GRAY}; }
  h3 { font-family:'Sarabun'; font-weight:600; font-size: 11.5px; color:${SAGE}; margin: 12px 0 4px; }
  h1, h2, h3 { break-after: avoid-page; page-break-after: avoid; break-inside: avoid; }
  p, li { break-inside: avoid; page-break-inside: avoid; orphans: 3; widows: 3; }
  h2 { break-before: page; page-break-before: always; }
  h2:first-of-type { break-before: avoid; page-break-before: avoid; }
  p { margin: 5px 0; }
  ul, ol { margin: 4px 0 9px 18px; padding: 0; }
  li { margin: 3px 0; }
  table { border-collapse: collapse; width: 100%; margin: 9px 0; font-size: 10px; page-break-inside: avoid; }
  th { background:${NAVY}; color:#fff; font-weight:500; text-align:left; padding:6px 8px; }
  td { padding:5px 8px; border-bottom:1px solid #EEEEEE; vertical-align:top; }
  tr:nth-child(even) td { background:#FAFAFA; }
  td.num, th.num { text-align:right; font-variant-numeric: tabular-nums; }
  hr { border:0; border-top:1px solid #EEEEEE; margin:16px 0; }
  strong { font-weight:600; color:${NAVY}; }
  code { font-family:'JetBrains Mono',monospace; font-size:.9em; background:#F3F3F3; padding:1px 5px; border-radius:2px; color:${NAVY}; }
  pre.code { font-family:'JetBrains Mono',monospace; font-size:9px; line-height:1.55; background:${NAVY}; color:#E8EDF2; border-radius:6px; padding:11px 14px; white-space:pre; overflow:hidden; margin:7px 0 11px; page-break-inside:avoid; }
  blockquote.note { border-left:3px solid ${GOLD}; background:#FBF7E6; border-radius:0 6px 6px 0; padding:9px 13px; margin:9px 0; font-size:10px; color:#434343; line-height:1.55; page-break-inside:avoid; }
  blockquote.note strong { color:${NAVY}; }
  .muted { color:#767676; font-size:9.5px; }
  .cover { position:relative; width:100vw; height:255mm; background:${NAVY}; color:#fff; overflow:hidden; page-break-after:always; margin:-15mm -11mm 0; padding:0; }
  .cover-photo { position:absolute; inset:0 0 0 50%; }
  .cover-photo img { width:100%; height:100%; object-fit:cover; filter:saturate(.65) contrast(1.05); }
  .cover-grad { position:absolute; inset:0; background:linear-gradient(90deg, ${NAVY} 0%, rgba(31,60,81,.55) 42%, rgba(31,60,81,.18) 100%); }
  .cover-circles { position:absolute; inset:0; background-position:center right; background-size:cover; background-repeat:no-repeat; mix-blend-mode:screen; opacity:.42; }
  .cover-top { position:absolute; top:20mm; left:18mm; font-size:12px; font-weight:500; letter-spacing:.02em; display:flex; align-items:center; gap:8px; z-index:3; }
  .cover-top .dot { width:9px; height:9px; border-radius:50%; background:${GOLD}; display:inline-block; }
  .cover-body { position:absolute; left:18mm; right:50%; top:74mm; z-index:3; }
  .cover-eyebrow { font-size:11px; font-weight:600; letter-spacing:.14em; text-transform:uppercase; color:${GOLD}; margin-bottom:14px; }
  .cover-title { font-family:'Sarabun'; font-weight:300; font-size:38px; line-height:1.08; letter-spacing:-.02em; color:#fff; margin:0; }
  .cover-rule { width:54px; height:3px; background:${GOLD}; margin:18px 0; }
  .cover-sub { font-size:12px; line-height:1.6; color:rgba(255,255,255,.8); max-width:340px; font-weight:300; }
  .cover-stats { display:flex; flex-wrap:wrap; gap:14px 26px; margin-top:30px; }
  .cstat { min-width:120px; }
  .cstat .cnum { font-family:'Sarabun'; font-weight:500; font-size:25px; color:${GOLD}; line-height:1; letter-spacing:-.01em; }
  .cstat .clab { font-size:9.5px; color:rgba(255,255,255,.72); margin-top:4px; letter-spacing:.02em; }
  .cover-foot { position:absolute; bottom:18mm; left:18mm; right:18mm; display:flex; justify-content:space-between; font-size:9.5px; color:rgba(255,255,255,.6); z-index:3; }
</style></head><body class="bpc">
  ${coverPage()}
  <div class="brand"><img src="data:image/png;base64,${LOGO_B64}" alt="Bryant Park Consulting"/><span class="eyebrow">${CAP} · NSPB Budget Loading Guide · ${VER}</span></div>
  ${mdToHtml(md.replace(/^# .*\n/, '').replace(/^### .*\n/, ''))}
</body></html>`;

const htmlFile = path.join(dir, 'budget-import-guide.html');
fs.writeFileSync(htmlFile, html);
const pdfFile = path.join(dir, 'budget-import-guide.pdf');
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
      await new Promise(r => setTimeout(r, 500));
      const { data } = await s2('Page.printToPDF', { printBackground: true, preferCSSPageSize: true });
      fs.writeFileSync(pdfFile, Buffer.from(data, 'base64'));
    });
    await send('Target.closeTarget', { targetId });
  });
  console.log('✓ wrote', path.relative(ROOT, pdfFile), `(${(fs.statSync(pdfFile).size / 1024).toFixed(0)} KB)`);
})().catch(e => { console.error('PDF ERROR:', e.message); process.exit(1); });
