'use strict';
// Render a generated optimization-report.md as a styled, BPC-branded PDF using
// the debug Chrome (Page.printToPDF over CDP on port 9222).
//   node tools/report-to-pdf.js <CLIENT>
const fs = require('fs');
const path = require('path');
const PORT = process.env.CDP_PORT || 9222;
const ROOT = path.join(__dirname, '..');
const CLIENT = process.argv[2] || 'squarespace';
const dir = path.join(ROOT, 'clients', CLIENT);
let md = fs.readFileSync(path.join(dir, 'optimization-report.md'), 'utf8');
// ── demo / anonymization layer (active only when DEMO_NAME is set) ───
const anon = require('./anonymize')(CLIENT[0].toUpperCase() + CLIENT.slice(1), null);
const DISPLAY = anon ? anon.DEMO : (CLIENT[0].toUpperCase() + CLIENT.slice(1));
const OUT_SUFFIX = anon ? '-demo' : '';
if (anon) md = anon.scrubText(md);
// version stamp comes from the md (set by optimization-report.js) so they match
const VER = (md.match(/\*\*(v\d{4}-\d{2}-\d{2}\.\d{4})\*\*/) || [])[1] || 'v?';
const L0 = JSON.parse(fs.readFileSync(path.join(dir, 'level0-summary.json'), 'utf8'));
const CL = JSON.parse(fs.readFileSync(path.join(dir, 'level0-cleanup.json'), 'utf8'));
const ARp = path.join(dir, 'activity-report.json');
const AR = fs.existsSync(ARp) ? JSON.parse(fs.readFileSync(ARp, 'utf8')) : null;
const DCp = path.join(dir, 'dynamic-candidates.json');
const DC = fs.existsSync(DCp) ? JSON.parse(fs.readFileSync(DCp, 'utf8')) : null;

// ── BPC design tokens (from desgincode/colors_and_type.css) ──────────
const NAVY = '#1F3C51', SAGE = '#619C8A', GOLD = '#F2CC5F', ORANGE = '#EC8842', DANGER = '#C9512E';
const GRAY = '#D9D9D9';
// chart aliases mapped to BPC palette
const BLUE = NAVY, RED = DANGER, TEAL = SAGE;
// BPC logo (base64) — cached per client; falls back to the design-system asset.
const logoCache = path.join(ROOT, 'clients', CLIENT, '.logo.b64');
const LOGO_B64 = fs.existsSync(logoCache)
  ? fs.readFileSync(logoCache, 'utf8')
  : fs.readFileSync(path.join(ROOT, 'desgincode', 'assets', 'logo', 'bpc-logo.png')).toString('base64');
// strip emoji — non-negotiable for formal BPC deliverables
const noEmoji = s => s.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{2190}-\u{21FF}\u{2300}-\u{23FF}]/gu, '').replace(/\s{2,}/g, ' ').trimStart();
const b64opt = (f) => { const p = path.join(ROOT, 'clients', CLIENT, f); return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : ''; };
const CIRCLES_B64 = b64opt('.circles.b64');
const HERO_B64 = b64opt('.hero.b64');

// ── BPC cover page (navy hero + photo + circle pattern) ──────────────
function coverPage() {
  const plan = AR && AR.cubes.find(c => c.name === 'Plan');
  const stat = (num, label) => `<div class="cstat"><div class="cnum">${num}</div><div class="clab">${label}</div></div>`;
  const stats = [
    AR ? stat(`${AR.appSize.customerDataGB} GB`, 'customer data on disk') : '',
    stat(`${CL.staleScenarios.length} of ${Object.keys(L0.blocksByScenario).length}`, 'scenarios are stale copies'),
    AR ? stat(`${Math.round(AR.runtimeMetrics.longestCalcExecutionSec / 60)} min`, 'slowest calc (CConv_Plan)') : '',
    stat(`-${CL.potentialReductionPct}%`, 'of input blocks clearable'),
  ].filter(Boolean).join('');
  return `<section class="cover">
    <div class="cover-photo">
      ${HERO_B64 ? `<img src="data:image/png;base64,${HERO_B64}"/>` : ''}
      <div class="cover-grad"></div>
      ${CIRCLES_B64 ? `<div class="cover-circles" style="background-image:url('data:image/png;base64,${CIRCLES_B64}')"></div>` : ''}
    </div>
    <div class="cover-top"><span class="dot"></span>Bryant Park Consulting</div>
    <div class="cover-body">
      <div class="cover-eyebrow">Confidential · ${new Date(AR ? AR.reportDate + 'T12:00:00' : '2026-06-11T12:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} · ${VER}</div>
      <h1 class="cover-title">NSPB Cube<br/>Optimization Review</h1>
      <div class="cover-rule"></div>
      <p class="cover-sub">${DISPLAY} · Plan cube size, data distribution &amp; calc-performance analysis, with a prioritized cleanup plan.</p>
      <div class="cover-stats">${stats}</div>
    </div>
    <div class="cover-foot"><span>bryantparkconsulting.com</span><span>NetSuite Planning &amp; Budgeting</span></div>
  </section>`;
}
function fmtShort(x) { return x >= 1e9 ? (x / 1e9).toFixed(1) + 'B' : x >= 1e6 ? (x / 1e6).toFixed(0) + 'M' : x >= 1e3 ? (x / 1e3).toFixed(0) + 'K' : '' + x; }
const fmt = x => Number(x).toLocaleString('en-US');
function vbars(data, { w = 540, h = 170, pad = 26, unit = '' } = {}) {
  const max = Math.max(...data.map(d => d.value)) || 1;
  const gap = (w - pad * 2) / data.length, bw = gap * 0.62;
  let s = '';
  data.forEach((d, i) => {
    const bh = (d.value / max) * (h - pad * 2 - 10);
    const x = pad + i * gap + (gap - bw) / 2, y = h - pad - bh;
    s += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="2" fill="${d.color || BLUE}"/>`;
    s += `<text x="${(x + bw / 2).toFixed(1)}" y="${(y - 3).toFixed(1)}" font-size="7.5" text-anchor="middle" fill="#374151">${d.top || ''}</text>`;
    s += `<text x="${(x + bw / 2).toFixed(1)}" y="${h - pad + 11}" font-size="8" text-anchor="middle" fill="#6b7280">${d.label}</text>`;
  });
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" style="max-width:560px">${s}</svg>`;
}
function hbars(data, { w = 540, rowH = 19 } = {}) {
  const max = Math.max(...data.map(d => d.value)) || 1, labelW = 168, barMax = w - labelW - 86;
  let s = ''; const h = data.length * rowH + 8;
  data.forEach((d, i) => {
    const y = i * rowH + 4, bw = (d.value / max) * barMax;
    s += `<text x="0" y="${y + rowH * 0.7}" font-size="8.5" fill="#374151">${d.label}</text>`;
    s += `<rect x="${labelW}" y="${y + 3}" width="${bw.toFixed(1)}" height="${rowH - 7}" rx="2" fill="${d.color}"/>`;
    s += `<text x="${labelW + bw + 5}" y="${y + rowH * 0.7}" font-size="8" fill="#6b7280">${d.pct}</text>`;
  });
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" style="max-width:560px">${s}</svg>`;
}
// simple pie — slices: [{label, value, color}]
function pie(slices, size = 130) {
  const total = slices.reduce((s, x) => s + x.value, 0) || 1;
  const cx = size / 2, cy = size / 2, r = size / 2 - 4;
  let a0 = -Math.PI / 2, paths = '';
  for (const s of slices) {
    const a1 = a0 + 2 * Math.PI * s.value / total;
    const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
    const large = (a1 - a0) > Math.PI ? 1 : 0;
    paths += `<path d="M${cx},${cy} L${x0.toFixed(1)},${y0.toFixed(1)} A${r},${r} 0 ${large} 1 ${x1.toFixed(1)},${y1.toFixed(1)} Z" fill="${s.color}" stroke="#fff" stroke-width="1.5"/>`;
    a0 = a1;
  }
  const legend = slices.map(s => `<div style="display:flex;align-items:center;gap:5px;font-size:9px;color:#434343"><span style="width:9px;height:9px;border-radius:2px;background:${s.color};display:inline-block"></span>${s.label} — <b>${(100 * s.value / total).toFixed(1)}%</b></div>`).join('');
  return `<div style="display:flex;align-items:center;gap:14px;justify-content:center"><svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">${paths}</svg><div style="display:flex;flex-direction:column;gap:3px">${legend}</div></div>`;
}

function donut(pct, label, color = BLUE) {
  const r = 42, c = 2 * Math.PI * r, on = c * pct / 100;
  return `<svg viewBox="0 0 120 120" width="120" height="120">
    <circle cx="60" cy="60" r="${r}" fill="none" stroke="#eef2f7" stroke-width="14"/>
    <circle cx="60" cy="60" r="${r}" fill="none" stroke="${color}" stroke-width="14"
      stroke-dasharray="${on.toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 60 60)" stroke-linecap="round"/>
    <text x="60" y="58" font-size="20" font-weight="600" text-anchor="middle" fill="${NAVY}" font-family="Sarabun">${pct}%</text>
    <text x="60" y="74" font-size="8.5" text-anchor="middle" fill="#767676" font-family="Sarabun">${label}</text></svg>`;
}

// ── Health scorecard: green check (OK) vs red cross (needs fixing) ───
function scorecard() {
  const plan = AR && AR.cubes.find(c => c.name === 'Plan');
  const ok = [], fix = [];
  if (AR) {
    if (AR.app.hybrid) ok.push(['Hybrid mode is enabled', 'ready to push aggregations to dynamic calc']);
    if (plan && plan.clusteringPct >= 90) ok.push([`Clustering ratio ${plan.clusteringPct}%`, 'data is well-ordered on disk']);
    ok.push(['Dense/sparse design is appropriate', 'Account × Period — no re-architecting needed']);
  }
  const fyShare = ((L0.blocksByYears.FY25 || 0) + (L0.blocksByYears.FY26 || 0)) / L0.totals.blocks;
  if (fyShare > 0.8) ok.push([`${(fyShare * 100).toFixed(0)}% of data in active years`, 'FY25–FY26 — current and relevant']);
  if (AR) ok.push(['UI is responsive', `avg session, only a small % of requests over 2s`]);

  if (plan) {
    fix.push([`Plan page file ${(plan.pageFileMB / 1024).toFixed(0)} GB${AR ? ` (${AR.appSize.customerDataGB} GB on disk)` : ''}`, 'stale scenarios are aggregated too — clearing them cuts it']);
    fix.push([`Aggregations stored for all 47 scenarios (~${(plan.totalBlocks / plan.level0Blocks).toFixed(0)}x per input block)`, 'clear stale scenarios + scope AGG rules to active data']);
  }
  if (AR) {
    fix.push([`CConv_Plan calc runs ${mmss(AR.runtimeMetrics.longestCalcExecutionSec)} min (${(AR.runtimeMetrics.longestCalcExecutionSec / 3600).toFixed(1)} h)`, 'runaway — scope the FIX, run incrementally']);
    const dc = AR.calcScriptsByAvgDuration.find(c => /Datacopy/.test(c.script));
    if (dc) fix.push([`ADMIN Datacopy avg ${mmss(dc.avgSec)} (${dc.execs}×/day)`, 'high-cost repeated copy — tighten scope']);
  }
  fix.push([`${CL.staleScenarios.length} stale/one-off scenarios = ${CL.staleScenarioPct}% of input blocks`, 'clear/archive to shrink size + calc time']);
  if (AR && AR.outlineWarnings.length) fix.push(['Outline warnings present', 'dynamic-calc L0 without formula; shared-descendant members']);

  const rows = (arr, icon) => arr.map(([t, s]) => `<div class="sc-row">${icon}<div><b>${t}</b><span class="sc-sub">${s}</span></div></div>`).join('');
  return `<h2>Health check at a glance</h2>
  <div class="row">
    <div class="card half"><div class="ct" style="color:${SAGE}">Working well</div>${rows(ok, ICON_OK)}</div>
    <div class="card half"><div class="ct" style="color:${DANGER}">Suggested changes</div>${rows(fix, ICON_X)}</div>
  </div>`;
}

function chartsBlock() {
  // blocks by year (calendar order)
  const years = Object.entries(L0.blocksByYears).sort((a, b) => String(a[0]).localeCompare(String(b[0])))
    .map(([k, v]) => ({ label: k.replace('FY', "'").replace('No Year', 'n/a'), value: v, color: /FY2[0-3]/.test(k) ? GRAY : BLUE, top: (100 * v / L0.totals.blocks).toFixed(0) + '%' }));
  // top scenarios keep vs delete
  const stale = new Set(CL.staleScenarios.map(s => s.scenario));
  const scn = Object.entries(L0.blocksByScenario).sort((a, b) => b[1] - a[1]).slice(0, 12)
    .map(([k, v]) => ({ label: k.length > 26 ? k.slice(0, 25) + '…' : k, value: v, pct: (100 * v / L0.totals.blocks).toFixed(1) + '%', color: stale.has(k) ? RED : TEAL }));
  const keepBlocks = L0.totals.blocks - CL.staleScenarioBlocks;
  const plan = AR && AR.cubes.find(c => c.name === 'Plan');
  const tierStat = (num, label, color) => `<div style="text-align:center"><div style="font-family:Sarabun;font-weight:600;font-size:26px;color:${color};line-height:1">${num}</div><div style="font-size:8.5px;color:#767676;margin-top:3px">${label}</div></div>`;
  const leftCard = DC
    ? `<div class="card half"><div class="ct">Stored parents that could compute on the fly (dynamic calc)</div>
        <div class="center" style="gap:22px">${tierStat(DC.totals.SAFE, 'SAFE<br/>(≤3 children)', SAGE)}${tierStat(DC.totals.MODERATE, 'MODERATE<br/>(4–10 children)', GOLD)}${tierStat(DC.totals.REVIEW, 'REVIEW<br/>(wide / formula)', DANGER)}</div>
        <div class="cap">Parents of small hierarchies (e.g. in Department) can stop being pre-calculated and stored — Hybrid computes them at query time with no noticeable cost. Details in Section 3.5.</div></div>`
    : plan
      ? `<div class="card half"><div class="ct">Plan cube — stored blocks</div><div class="center"><div class="impact"><b>${fmt(plan.level0Blocks)}</b> input blocks → <b>${fmt(plan.totalBlocks)}</b> total stored<br/><span style="color:${ORANGE}">${(plan.pageFileMB / 1024).toFixed(0)} GB page file</span></div></div></div>`
      : `<div class="card half"><div class="ct">Block density</div><div class="center">${donut(L0.totals.densityPct, 'cells with data')}</div></div>`;
  // input-data split pie: active vs stale scenarios vs old years
  const oldYearBlocks = Object.entries(L0.blocksByYears).filter(([k]) => /^FY2[0-3]$|No Year/.test(k)).reduce((s, [, v]) => s + v, 0);
  const staleOnly = CL.staleScenarioBlocks;
  const activeBlocks = Math.max(0, L0.totals.blocks - staleOnly - oldYearBlocks);
  const splitPie = pie([
    { label: 'Active — keep', value: activeBlocks, color: SAGE },
    { label: 'Stale scenarios — delete', value: staleOnly, color: DANGER },
    { label: 'Old years — archive', value: oldYearBlocks, color: GRAY },
  ]);
  // page file before/after (estimate)
  const afterGB = plan ? (plan.pageFileMB / 1024) * (1 - CL.potentialReductionPct / 100) : null;
  const beforeAfter = plan ? hbars([
    { label: 'Page file today', value: plan.pageFileMB / 1024, pct: (plan.pageFileMB / 1024).toFixed(0) + ' GB', color: ORANGE },
    { label: 'After cleanup (estimated)', value: afterGB, pct: '~' + afterGB.toFixed(0) + ' GB', color: SAGE },
  ], { rowH: 24 }) : '';
  // Pieces keyed by the report section they illustrate (injected after each heading).
  return {
    s11: `<div class="charts">
    <div class="card"><div class="ct">Blocks by year (grey = archive candidate)</div>${vbars(years)}
      <div class="cap">Each bar = how much of the typed/loaded data sits in that fiscal year. Almost everything lives in FY25–FY26; the grey years are history that can be archived.</div></div>
    <div class="row">
      <div class="card half"><div class="ct">What the input data is made of</div>${splitPie}
        <div class="cap">Green = scenarios in active use (keep). Red = stale one-off copies (delete). Grey = old years (archive).</div></div>
      <div class="card half"><div class="ct">Top scenarios — <span style="color:${TEAL}">keep</span> vs <span style="color:${RED}">delete candidate</span></div>${hbars(scn.slice(0, 8), { w: 420 })}
        <div class="cap">Green = in active use. Red = delete candidates (dated copies, tests, downside runs). Full list in Section 1.2.</div></div>
    </div>
  </div>`,
    s16: `<div class="charts"><div class="row">
      <div class="card half"><div class="ct">Cleanup impact</div><div class="center">
        ${donut(CL.potentialReductionPct, 'of input blocks', SAGE)}
        <div class="impact"><b>${fmt(L0.totals.blocks)}</b> input blocks<br/>→ <b>${fmt(keepBlocks)}</b> after cleanup<br/><span style="color:${SAGE}">−${CL.potentialReductionPct}%</span></div>
      </div>
        <div class="cap">Deleting the stale copies removes ${CL.potentialReductionPct}% of the input data — and their stored summaries go with them.</div></div>
      ${plan ? `<div class="card half"><div class="ct">Plan page file — today vs after cleanup</div>${beforeAfter}
        <div class="cap">Estimated, proportional: if the deleted scenarios are aggregated like the rest, the ${(plan.pageFileMB / 1024).toFixed(0)} GB page file drops to ~${afterGB.toFixed(0)} GB. Validate in a test environment.</div></div>` : ''}
    </div></div>`,
    s21: `<div class="charts">${calcChart()}</div>`,
    s35: `<div class="charts">${leftCard.replace('card half', 'card')}</div>`,
  };
}
function calcChart() {
  if (!AR) return '';
  // exclude the 235-min outlier from the bar scale so the rest are readable; label it separately
  const rows = AR.calcScriptsByAvgDuration.slice(1, 9).map(c => ({
    label: (c.script.length > 30 ? c.script.slice(0, 29) + '…' : c.script) + ` (${c.cube})`,
    value: c.avgSec, pct: mmss(c.avgSec), color: c.avgSec > 400 ? DANGER : c.avgSec > 200 ? ORANGE : NAVY,
  }));
  const top = AR.calcScriptsByAvgDuration[0];
  return `<div class="card"><div class="ct">Slowest calc scripts — average duration (min:sec)</div>
    <div style="font-size:9px;color:${RED};margin-bottom:4px">⚠ Outlier excluded from scale: <b>${top.script}</b> = ${mmss(top.avgSec)} min (${(top.avgSec/3600).toFixed(1)} h)</div>
    ${hbars(rows)}<div class="cap">Average runtime of the slowest calculations. Orange/red bars are the ones worth tuning; the 235-minute outlier dwarfs them all.</div></div>`;
}
function mmss(s){return `${Math.floor(s/60)}:${String(Math.round(s%60)).padStart(2,'0')}`;}

// ── minimal, report-scoped markdown → HTML ───────────────────────────
// inline icons (SVG, BPC palette) — usable in markdown via @@OK@@ / @@X@@ / @@IDEA@@
const ICON_OK = `<svg viewBox="0 0 24 24" width="13" height="13" style="vertical-align:-2px"><circle cx="12" cy="12" r="11" fill="${SAGE}"/><path d="M7 12.5l3.2 3.2L17 8.5" stroke="#fff" stroke-width="2.3" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const ICON_X = `<svg viewBox="0 0 24 24" width="13" height="13" style="vertical-align:-2px"><circle cx="12" cy="12" r="11" fill="${DANGER}"/><path d="M8.2 8.2l7.6 7.6M15.8 8.2l-7.6 7.6" stroke="#fff" stroke-width="2.3" stroke-linecap="round"/></svg>`;
const ICON_IDEA = `<svg viewBox="0 0 24 24" width="13" height="13" style="vertical-align:-2px"><path d="M12 2.2a7 7 0 0 0-4.2 12.6c.6.5.95 1.05.95 1.85v.55h6.5v-.55c0-.8.35-1.35.95-1.85A7 7 0 0 0 12 2.2z" fill="${GOLD}"/><rect x="8.8" y="18.4" width="6.4" height="1.9" rx=".95" fill="${GOLD}"/><rect x="9.8" y="21" width="4.4" height="1.7" rx=".85" fill="${ORANGE}"/></svg>`;
const ICON_WARN = `<svg viewBox="0 0 24 24" width="13" height="13" style="vertical-align:-2px"><circle cx="12" cy="12" r="11" fill="${GOLD}"/><rect x="10.9" y="5.5" width="2.2" height="9" rx="1.1" fill="${NAVY}"/><circle cx="12" cy="17.6" r="1.5" fill="${NAVY}"/></svg>`;
const icons = s => s.replace(/@@OK@@/g, ICON_OK).replace(/@@X@@/g, ICON_X).replace(/@@IDEA@@/g, ICON_IDEA).replace(/@@WARN@@/g, ICON_WARN);
const esc = s => noEmoji(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = s => icons(esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>'));
function mdToHtml(src) {
  const lines = src.split('\n');
  const out = []; let i = 0;
  const closeList = (tag) => { if (tag) out.push(`</${tag}>`); };
  while (i < lines.length) {
    let l = lines[i];
    // fenced code block — monospace card, escaped only (no icon/strong processing)
    if (/^```/.test(l)) {
      i++; const code = [];
      while (i < lines.length && !/^```/.test(lines[i])) { code.push(esc(lines[i])); i++; }
      i++; // closing fence
      out.push(`<pre class="code">${code.join('\n')}</pre>`);
      continue;
    }
    if (/^# /.test(l)) { out.push(`<h1>${inline(l.slice(2))}</h1>`); i++; continue; }
    if (/^### /.test(l)) { out.push(`<h3>${inline(l.slice(4))}</h3>`); i++; continue; }
    if (/^## /.test(l)) { out.push(`<h2>${inline(l.slice(3))}</h2>`); i++; continue; }
    if (/^---\s*$/.test(l)) { out.push('<hr/>'); i++; continue; }
    // table block
    if (/^\|/.test(l)) {
      const rows = []; while (i < lines.length && /^\|/.test(lines[i])) { rows.push(lines[i]); i++; }
      const cells = r => r.split('|').slice(1, -1).map(c => c.trim());
      // honor markdown column alignment: `--:` = right (numeric), else left
      const aligns = cells(rows[1] || '').map(c => /-+:$/.test(c) ? ' class="num"' : '');
      out.push('<table>');
      out.push('<thead><tr>' + cells(rows[0]).map((c, k) => `<th${aligns[k] || ''}>${inline(c)}</th>`).join('') + '</tr></thead>');
      out.push('<tbody>');
      for (const r of rows.slice(2)) out.push('<tr>' + cells(r).map((c, k) => `<td${aligns[k] || ''}>${inline(c)}</td>`).join('') + '</tr>');
      out.push('</tbody></table>');
      continue;
    }
    // unordered list
    if (/^- /.test(l)) {
      out.push('<ul>'); while (i < lines.length && /^- /.test(lines[i])) { out.push(`<li>${inline(lines[i].slice(2))}</li>`); i++; }
      closeList('ul'); continue;
    }
    // ordered list
    if (/^\d+\.\s/.test(l)) {
      out.push('<ol>'); while (i < lines.length && /^\d+\.\s/.test(lines[i])) { out.push(`<li>${inline(lines[i].replace(/^\d+\.\s/, ''))}</li>`); i++; }
      closeList('ol'); continue;
    }
    if (/^\s*$/.test(l)) { i++; continue; }
    // italic-only footer line _..._
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
  /* pagination: never leave a heading dangling at the bottom of a page,
     never split a short paragraph/list item across pages */
  h1, h2, h3 { break-after: avoid-page; page-break-after: avoid; break-inside: avoid; }
  p, li, .sc-row { break-inside: avoid; page-break-inside: avoid; orphans: 3; widows: 3; }
  h2.newpage { break-before: page; page-break-before: always; }
  p { margin: 5px 0; }
  ul, ol { margin: 4px 0 9px 18px; padding: 0; }
  li { margin: 3px 0; }
  table { border-collapse: collapse; width: 100%; margin: 9px 0; font-size: 10px; }
  th { background:${NAVY}; color:#fff; font-weight:500; text-align:left; padding:6px 8px; }
  td { padding:5px 8px; border-bottom:1px solid #EEEEEE; }
  tr:nth-child(even) td { background:#FAFAFA; }
  td.num, th.num { text-align:right; font-variant-numeric: tabular-nums; }
  hr { border:0; border-top:1px solid #EEEEEE; margin:16px 0; }
  strong { font-weight:600; color:${NAVY}; }
  code { font-family:'JetBrains Mono',monospace; font-size:.9em; background:#F3F3F3; padding:1px 5px; border-radius:2px; color:${NAVY}; }
  pre.code { font-family:'JetBrains Mono',monospace; font-size:8.6px; line-height:1.5; background:${NAVY}; color:#E8EDF2; border-radius:6px; padding:10px 13px; white-space:pre; overflow:hidden; margin:7px 0 11px; page-break-inside:avoid; }
  .muted { color:#767676; font-size:9.5px; }
  .charts { margin: 8px 0 4px; }
  .card { border:1px solid #EEEEEE; border-radius:8px; padding:10px 12px; margin:9px 0; background:#fff; page-break-inside: avoid; box-shadow: 0 1px 2px rgba(31,60,81,.06); }
  .card .ct { font-size:10px; font-weight:600; color:${NAVY}; margin-bottom:5px; letter-spacing:.01em; }
  .row { display:flex; gap:9px; }
  .half { flex:1; }
  .center { display:flex; align-items:center; justify-content:center; gap:14px; }
  .impact { font-size:10px; color:#434343; line-height:1.5; }
  .cap { font-size:9.5px; color:#767676; margin-top:6px; line-height:1.4; border-top:1px solid #F3F3F3; padding-top:5px; }
  .sc-row { display:flex; align-items:flex-start; gap:8px; margin:7px 0; }
  .sc-row b { font-weight:600; font-size:10.5px; color:${NAVY}; display:block; }
  .sc-row .sc-sub { font-size:9.5px; color:#767676; display:block; line-height:1.35; }

  /* ── Cover page ── */
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
  <div class="brand"><img src="data:image/png;base64,${LOGO_B64}" alt="Bryant Park Consulting"/><span class="eyebrow">NSPB Cube Optimization · Confidential · ${VER}</span></div>
  ${(() => {
    let body = mdToHtml(md);
    const CH = chartsBlock();
    body = body.replace('<h2>Part 1', scorecard() + '<h2>Part 1');
    // each Part opens on a fresh page
    body = body.replace(/<h2>(Part \d)/g, '<h2 class="newpage">$1');
    body = body.replace(/(<h2>1\.1 [^<]*<\/h2>)/, '$1' + CH.s11);
    body = body.replace(/(<h2>1\.6[^<]*<\/h2>)/, '$1' + CH.s16);
    body = body.replace(/(<h2>2\.1[^<]*<\/h2>)/, '$1' + CH.s21);
    body = body.replace(/(<h2>3\.5[^<]*<\/h2>)/, '$1' + CH.s35);
    return anon ? anon.scrubText(body) : body;   // scrub chart HTML too (raw-JSON labels)
  })()}
</body></html>`;

const htmlFile = path.join(dir, `optimization-report${OUT_SUFFIX}.html`);
fs.writeFileSync(htmlFile, html);
const pdfFile = path.join(dir, `optimization-report${OUT_SUFFIX}.pdf`);
const fileUrl = 'file:///' + htmlFile.replace(/\\/g, '/');

// ── print via CDP ────────────────────────────────────────────────────
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
      // wait for load
      for (let k = 0; k < 30; k++) { await new Promise(r => setTimeout(r, 200)); if (evs.some(e => e.method === 'Page.loadEventFired')) break; }
      await new Promise(r => setTimeout(r, 400));
      const { data } = await s2('Page.printToPDF', { printBackground: true, preferCSSPageSize: true });
      fs.writeFileSync(pdfFile, Buffer.from(data, 'base64'));
    });
    await send('Target.closeTarget', { targetId });
  });
  console.log('✓ wrote', path.relative(ROOT, pdfFile), `(${(fs.statSync(pdfFile).size / 1024).toFixed(0)} KB)`);
})().catch(e => { console.error('PDF ERROR:', e.message); process.exit(1); });
