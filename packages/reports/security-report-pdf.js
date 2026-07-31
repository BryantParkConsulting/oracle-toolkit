'use strict';
// Render clients/<CLIENT>/security-report.md as a BPC-branded before/after
// security change plan PDF. Self-contained: prints via headless Chrome
// (--print-to-pdf), so it does NOT need the debug Chrome on :9222.
//   node tools/security-report-pdf.js <CLIENT>
// Shares the BPC design shell with report-to-pdf.js / state-report-pdf.js.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const CLIENT = process.argv[2] || 'enfinity';
const dir = path.join(ROOT, 'clients', CLIENT);
const CAP = CLIENT[0].toUpperCase() + CLIENT.slice(1);

// version stamp vYYYY-MM-DD.HHMM from system clock
const d = new Date();
const p2 = n => String(n).padStart(2, '0');
const VER = `v${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}.${p2(d.getHours())}${p2(d.getMinutes())}`;
const DATELONG = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

let md = fs.readFileSync(path.join(dir, 'security-report.md'), 'utf8').replace(/\{\{VER\}\}/g, VER);

// ── BPC design tokens (shared with the optimization/state reports) ──────
const NAVY = '#1F3C51', SAGE = '#619C8A', GOLD = '#F2CC5F', ORANGE = '#EC8842', DANGER = '#C9512E';
const GRAY = '#D9D9D9';
const b64 = f => fs.existsSync(f) ? fs.readFileSync(f).toString('base64') : '';
const LOGO_B64 = b64(path.join(ROOT, 'desgincode', 'assets', 'logo', 'bpc-logo.png'));
const HERO_B64 = b64(path.join(ROOT, 'desgincode', 'assets', 'backgrounds', 'hero-office.png'));
const CIRCLES_B64 = b64(path.join(ROOT, 'desgincode', 'assets', 'patterns', 'circles-pattern.png'));
const noEmoji = s => s.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{2190}-\u{21FF}\u{2300}-\u{23FF}]/gu, '').replace(/\s{2,}/g, ' ').trimStart();

// ── inline status icons (SVG, BPC palette) ──────────────────────────────
const ICON_OK = `<svg viewBox="0 0 24 24" width="13" height="13" style="vertical-align:-2px"><circle cx="12" cy="12" r="11" fill="${SAGE}"/><path d="M7 12.5l3.2 3.2L17 8.5" stroke="#fff" stroke-width="2.3" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const ICON_X = `<svg viewBox="0 0 24 24" width="13" height="13" style="vertical-align:-2px"><circle cx="12" cy="12" r="11" fill="${DANGER}"/><path d="M8.2 8.2l7.6 7.6M15.8 8.2l-7.6 7.6" stroke="#fff" stroke-width="2.3" stroke-linecap="round"/></svg>`;
const ICON_IDEA = `<svg viewBox="0 0 24 24" width="13" height="13" style="vertical-align:-2px"><path d="M12 2.2a7 7 0 0 0-4.2 12.6c.6.5.95 1.05.95 1.85v.55h6.5v-.55c0-.8.35-1.35.95-1.85A7 7 0 0 0 12 2.2z" fill="${GOLD}"/><rect x="8.8" y="18.4" width="6.4" height="1.9" rx=".95" fill="${GOLD}"/><rect x="9.8" y="21" width="4.4" height="1.7" rx=".85" fill="${ORANGE}"/></svg>`;
const ICON_WARN = `<svg viewBox="0 0 24 24" width="13" height="13" style="vertical-align:-2px"><circle cx="12" cy="12" r="11" fill="${GOLD}"/><rect x="10.9" y="5.5" width="2.2" height="9" rx="1.1" fill="${NAVY}"/><circle cx="12" cy="17.6" r="1.5" fill="${NAVY}"/></svg>`;
const icons = s => s.replace(/@@OK@@/g, ICON_OK).replace(/@@X@@/g, ICON_X).replace(/@@IDEA@@/g, ICON_IDEA).replace(/@@WARN@@/g, ICON_WARN);
const esc = s => noEmoji(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = s => icons(esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/`(.+?)`/g, '<code>$1</code>'));

// ── cover ────────────────────────────────────────────────────────────────
function coverPage() {
  const stat = (num, label) => `<div class="cstat"><div class="cnum">${num}</div><div class="clab">${label}</div></div>`;
  const stats = [
    stat('4', 'service administrators'),
    stat('5', 'power users'),
    stat('6', 'Location access groups'),
    stat('2', 'cell-level locks'),
  ].join('');
  return `<section class="cover">
    <div class="cover-photo">
      ${HERO_B64 ? `<img src="data:image/png;base64,${HERO_B64}"/>` : ''}
      <div class="cover-grad"></div>
      ${CIRCLES_B64 ? `<div class="cover-circles" style="background-image:url('data:image/png;base64,${CIRCLES_B64}')"></div>` : ''}
    </div>
    <div class="cover-top"><span class="dot"></span>Bryant Park Consulting</div>
    <div class="cover-body">
      <div class="cover-eyebrow">Confidential · ${DATELONG} · ${VER}</div>
      <h1 class="cover-title">NSPB Security<br/>As Implemented</h1>
      <div class="cover-rule"></div>
      <p class="cover-sub">${CAP} · The role, dimension and cell-level security now in effect after the June 2026 review changes were applied on 17 June 2026.</p>
      <div class="cover-stats">${stats}</div>
    </div>
    <div class="cover-foot"><span>bryantparkconsulting.com</span><span>NetSuite Planning &amp; Budgeting</span></div>
  </section>`;
}

// ── role cards: the four roles, their size and what they can do ─────────
function roleCards() {
  const roles = [
    { name: 'Service Administrator', n: 4, cap: 'Full administration — app, security, metadata and all data', color: NAVY },
    { name: 'Power User', n: 5, cap: 'Plan & run rules, read/write across all regions; no security admin', color: SAGE },
    { name: 'User', n: 11, cap: 'Enter & edit plan data in assigned region; payroll & USD locked', color: GOLD },
    { name: 'Viewer', n: 1, cap: 'Read-only access to forms and reports', color: '#9AA6AE' },
  ];
  const card = r => `<div class="rcard" style="border-top-color:${r.color}">
      <div class="rcard-n" style="color:${r.color}">${r.n}</div>
      <div class="rcard-t">${r.name}</div>
      <div class="rcard-c">${r.cap}</div></div>`;
  return `<div class="rgrid">${roles.map(card).join('')}</div>`;
}

// ── access matrix: group (rows) × region (cols), colored cells ──────────
function accessMatrix() {
  const cols = ['US', 'Europe', 'India', 'Japan', 'Corporate', 'Undefined'];
  const rows = [
    ['All Regions', ['r', 'r', 'r', 'r', 'r', 'r']],
    ['Only US', ['rw', 'no', 'no', 'no', 'no', 'rw']],
    ['Only Europe', ['no', 'rw', 'no', 'no', 'no', 'rw']],
    ['Only India', ['no', 'no', 'rw', 'no', 'no', 'rw']],
    ['Only Japan', ['no', 'no', 'no', 'rw', 'no', 'rw']],
    ['Power User', ['rw', 'rw', 'rw', 'rw', 'rw', 'rw']],
  ];
  const cell = v => v === 'rw' ? '<td class="mx mx-rw">R/W</td>' : v === 'r' ? '<td class="mx mx-r">Read</td>' : '<td class="mx mx-no">—</td>';
  const head = '<tr><th class="mx-h mx-hg">Group \\ Region</th>' + cols.map(c => `<th class="mx-h">${c}</th>`).join('') + '</tr>';
  const body = rows.map(([g, vs]) => `<tr><td class="mx-g">${g}</td>${vs.map(cell).join('')}</tr>`).join('');
  return `<div class="charts"><div class="card"><div class="ct">Region access by group — who can read or write each region</div>
    <table class="matrix"><thead>${head}</thead><tbody>${body}</tbody></table>
    <div class="legend"><span><i class="lg lg-rw"></i>Read / Write</span><span><i class="lg lg-r"></i>Read only</span><span><i class="lg lg-no"></i>No access</span></div>
    <div class="cap">Each regional group writes its own region (plus Undefined_Location). Power User writes everywhere; All Regions reads everywhere without writing.</div></div></div>`;
}

// ── minimal, report-scoped markdown -> HTML ─────────────────────────────
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
      out.push('</tbody></table>');
      continue;
    }
    if (/^- /.test(l)) { out.push('<ul>'); while (i < lines.length && /^- /.test(lines[i])) { out.push(`<li>${inline(lines[i].slice(2))}</li>`); i++; } out.push('</ul>'); continue; }
    if (/^\d+\.\s/.test(l)) { out.push('<ol>'); while (i < lines.length && /^\d+\.\s/.test(lines[i])) { out.push(`<li>${inline(lines[i].replace(/^\d+\.\s/, ''))}</li>`); i++; } out.push('</ol>'); continue; }
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
  h2.newpage { break-before: page; page-break-before: always; }
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
  .muted { color:#767676; font-size:9.5px; }
  .charts { margin: 8px 0 4px; }
  .card { border:1px solid #EEEEEE; border-radius:8px; padding:10px 12px; margin:9px 0; background:#fff; page-break-inside: avoid; box-shadow: 0 1px 2px rgba(31,60,81,.06); }
  .card .ct { font-size:10px; font-weight:600; color:${NAVY}; margin-bottom:5px; letter-spacing:.01em; }
  .cap { font-size:9.5px; color:#767676; margin-top:6px; line-height:1.4; border-top:1px solid #F3F3F3; padding-top:5px; }

  /* role cards */
  .rgrid { display:flex; gap:9px; margin:10px 0 4px; }
  .rcard { flex:1; border:1px solid #EEEEEE; border-top:3px solid ${NAVY}; border-radius:7px; padding:9px 10px 10px; background:#fff; box-shadow:0 1px 2px rgba(31,60,81,.06); page-break-inside:avoid; }
  .rcard-n { font-family:'Sarabun'; font-weight:600; font-size:24px; line-height:1; }
  .rcard-t { font-size:10px; font-weight:600; color:${NAVY}; margin:4px 0 4px; }
  .rcard-c { font-size:8.8px; color:#767676; line-height:1.4; }

  /* access matrix */
  table.matrix { border-collapse:separate; border-spacing:3px; width:100%; margin:6px 0 2px; table-layout:fixed; }
  table.matrix th.mx-h { background:${NAVY}; color:#fff; font-size:8.5px; font-weight:500; text-align:center; padding:5px 3px; border-radius:3px; }
  table.matrix th.mx-hg { text-align:left; width:96px; }
  table.matrix td.mx-g { font-size:9px; font-weight:600; color:${NAVY}; padding:5px 6px; background:#F4F6F7; border-radius:3px; }
  table.matrix td.mx { text-align:center; font-size:8.5px; font-weight:600; padding:5px 2px; border-radius:3px; }
  td.mx-rw { background:${SAGE}; color:#fff; }
  td.mx-r  { background:#E4EDEA; color:${NAVY}; }
  td.mx-no { background:#F7F7F7; color:#C7CDD2; }
  .legend { display:flex; gap:16px; margin-top:8px; font-size:8.5px; color:#767676; }
  .legend i.lg { display:inline-block; width:11px; height:11px; border-radius:2px; vertical-align:-1px; margin-right:4px; }
  .lg-rw { background:${SAGE}; } .lg-r { background:#E4EDEA; border:1px solid #CFE0DA; } .lg-no { background:#F0F0F0; }

  /* cover */
  .cover { position:relative; width:100vw; height:255mm; background:${NAVY}; color:#fff; overflow:hidden; page-break-after:always; margin:-15mm -11mm 0; padding:0; }
  .cover-photo { position:absolute; inset:0 0 0 50%; }
  .cover-photo img { width:100%; height:100%; object-fit:cover; filter:saturate(.65) contrast(1.05); }
  .cover-grad { position:absolute; inset:0; background:linear-gradient(90deg, ${NAVY} 0%, rgba(31,60,81,.55) 42%, rgba(31,60,81,.18) 100%); }
  .cover-circles { position:absolute; inset:0; background-position:center right; background-size:cover; background-repeat:no-repeat; mix-blend-mode:screen; opacity:.42; }
  .cover-top { position:absolute; top:20mm; left:18mm; font-size:12px; font-weight:500; letter-spacing:.02em; display:flex; align-items:center; gap:8px; z-index:3; }
  .cover-top .dot { width:9px; height:9px; border-radius:50%; background:${GOLD}; display:inline-block; }
  .cover-body { position:absolute; left:18mm; right:52%; top:78mm; z-index:3; }
  .cover-eyebrow { font-size:11px; font-weight:600; letter-spacing:.14em; text-transform:uppercase; color:${GOLD}; margin-bottom:14px; }
  .cover-title { font-family:'Sarabun'; font-weight:300; font-size:40px; line-height:1.08; letter-spacing:-.02em; color:#fff; margin:0; }
  .cover-rule { width:54px; height:3px; background:${GOLD}; margin:18px 0; }
  .cover-sub { font-size:12.5px; line-height:1.6; color:rgba(255,255,255,.8); max-width:330px; font-weight:300; }
  .cover-stats { display:flex; flex-wrap:wrap; gap:10px 26px; margin-top:30px; }
  .cstat { min-width:120px; }
  .cstat .cnum { font-family:'Sarabun'; font-weight:500; font-size:25px; color:${GOLD}; line-height:1; letter-spacing:-.01em; }
  .cstat .clab { font-size:9.5px; color:rgba(255,255,255,.72); margin-top:4px; letter-spacing:.02em; }
  .cover-foot { position:absolute; bottom:18mm; left:18mm; right:18mm; display:flex; justify-content:space-between; font-size:9.5px; color:rgba(255,255,255,.6); z-index:3; }
</style></head><body class="bpc">
  ${coverPage()}
  <div class="brand"><img src="data:image/png;base64,${LOGO_B64}" alt="Bryant Park Consulting"/><span class="eyebrow">NSPB Security Change Plan · Confidential · ${VER}</span></div>
  ${(() => {
    let body = mdToHtml(md);
    // each Part opens on a fresh page
    body = body.replace(/<h2>(Part \d)/g, '<h2 class="newpage">$1');
    // inject the role cards after Part 1, the access matrix after Part 3
    body = body.replace(/(<h2[^>]*>Part 1[^<]*<\/h2>)/, '$1' + roleCards());
    body = body.replace(/(<h2[^>]*>Part 3[^<]*<\/h2>)/, '$1' + accessMatrix());
    return body;
  })()}
</body></html>`;

const htmlFile = path.join(dir, 'security-report.html');
fs.writeFileSync(htmlFile, html);
const pdfFile = path.join(dir, `security-report-${CLIENT}-${VER}.pdf`);

// ── print via headless Chrome (no CDP server needed) ────────────────────
function findChrome() {
  const cands = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    path.join(os.homedir(), 'AppData/Local/Google/Chrome/Application/chrome.exe'),
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  ].filter(Boolean);
  for (const c of cands) if (fs.existsSync(c)) return c;
  throw new Error('Chrome/Edge not found; set CHROME_PATH');
}

const chrome = findChrome();
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'bpc-pdf-'));
const fileUrl = 'file:///' + htmlFile.replace(/\\/g, '/');
execFileSync(chrome, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
  `--user-data-dir=${profile}`,
  '--no-pdf-header-footer',
  `--print-to-pdf=${pdfFile}`,
  '--virtual-time-budget=8000',
  fileUrl,
], { stdio: 'ignore', timeout: 90000 });

try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
const kb = (fs.statSync(pdfFile).size / 1024).toFixed(0);
console.log('OK wrote', path.relative(ROOT, pdfFile), `(${kb} KB)`);
