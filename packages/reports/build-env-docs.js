'use strict';
// ============================================================
// Build rich, web-optimized "My Environment Docs" articles for a client.
//
//   node tools/build-env-docs.js <CLIENT>
//
// Reads the same data the PDF deliverables use (state-report.md +
// modules.json + activity-report.json + audit-summary.json + navflow.json +
// revenue-recon.json + level0/*), reuses the PDF's SVG diagram generators, and
// splits the Current State Assessment into a set of FOCUSED articles — each
// one short and carrying its own graphic — written to:
//
//   clients/<CLIENT>/env-docs/NN-*.md
//
// publish-env-kb.mjs picks these up as curated "extra" docs, so they land in
// the client's "My Environment Docs" Knowledge Base (tree on the left = plain
// text; each article = icons + graphics) and feed the env chat as grounding.
//
// The diagrams are emitted as raw inline SVG/HTML wrapped in <div class="bpc-chart">
// — the hub's kb.css styles that wrapper to match the PDF look. @@OK@@/@@X@@/
// @@WARN@@/@@IDEA@@ markers in the prose are left as-is; the portal's
// cleanCuratedMd() turns them into ✅/❌/⚠️/💡 at render time.
// ============================================================

const fs = require('fs');
const path = require('path');
const makeAnon = require('./anonymize');

const ROOT = path.join(__dirname, '..');
const CLIENT = process.argv[2] || 'talogy';
const dir = path.join(ROOT, 'clients', CLIENT);
const CAP = CLIENT[0].toUpperCase() + CLIENT.slice(1);
const DISPLAY = CAP;

// ── load data (mirrors state-report-pdf.js) ──────────────────────────
const md = fs.readFileSync(path.join(dir, 'state-report.md'), 'utf8');
const VER = (md.match(/\*\*(v\d{4}-\d{2}-\d{2}\.\d{4})\*\*/) || [])[1] || 'v?';
const rawAU = JSON.parse(fs.readFileSync(path.join(dir, 'audit-summary.json'), 'utf8'));
// DEMO_NAME set → emit a fully anonymized copy (client name + user emails/names +
// URLs scrubbed; every number kept) to clients/_demo/env-docs/ for the BPC-only
// sample Knowledge Hub. Real client docs are left untouched. See tools/anonymize.js.
const anon = makeAnon(CAP, rawAU);
// Alias audited users at the DATA level so chart labels are already the alias — a
// truncated SVG label can't leak a real name. scrubText still cleans the prose.
const AU = anon ? anon.aliasAU(rawAU) : rawAU;
const AR = JSON.parse(fs.readFileSync(path.join(dir, 'activity-report.json'), 'utf8'));
const MODS = JSON.parse(fs.readFileSync(path.join(dir, 'modules.json'), 'utf8'));
const L0 = {};
const l0dir = path.join(dir, 'level0');
if (fs.existsSync(l0dir)) for (const c of AR.cubes.map(x => x.name)) {
  const f = path.join(l0dir, `${c}-summary.json`);
  if (fs.existsSync(f)) L0[c] = JSON.parse(fs.readFileSync(f, 'utf8'));
}
const RRp = path.join(dir, 'revenue-recon.json');
const RR = fs.existsSync(RRp) ? JSON.parse(fs.readFileSync(RRp, 'utf8')) : null;

// ── BPC design tokens ────────────────────────────────────────────────
const NAVY = '#1F3C51', SAGE = '#619C8A', GOLD = '#F2CC5F', ORANGE = '#EC8842', DANGER = '#C9512E';
const GRAY = '#D9D9D9';
const fmt = x => Number(x).toLocaleString('en-US');

// each diagram is wrapped so kb.css can scope-style it like the PDF.
// CommonMark ends a raw-HTML block at the first blank (or whitespace-only) line,
// so we strip internal blank lines to keep the whole SVG one contiguous block
// that rehype-raw renders intact.
const clean = s => String(s).split('\n').filter(l => l.trim() !== '').join('\n');
const wrap = svgOrHtml => `<div class="bpc-chart">\n${clean(svgOrHtml)}\n</div>`;
// HTML-escape text pulled from the source markdown into raw HTML cards
const he = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ============================================================
// SVG diagram generators (ported verbatim from state-report-pdf.js /
// recon-brief-pdf.js — pure functions over the loaded data)
// ============================================================

function hbars(data, { w = 540, rowH = 19, labelW = 190 } = {}) {
  const max = Math.max(...data.map(d => d.value)) || 1, barMax = w - labelW - 86;
  let s = ''; const h = data.length * rowH + 8;
  data.forEach((d, i) => {
    const y = i * rowH + 4, bw = (d.value / max) * barMax;
    s += `<text x="0" y="${y + rowH * 0.7}" font-size="8.5" fill="#374151">${d.label}</text>`;
    s += `<rect x="${labelW}" y="${y + 3}" width="${Math.max(bw, 1).toFixed(1)}" height="${rowH - 7}" rx="2" fill="${d.color}"/>`;
    s += `<text x="${labelW + Math.max(bw, 1) + 5}" y="${y + rowH * 0.7}" font-size="8" fill="#6b7280">${d.pct}</text>`;
  });
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" style="max-width:560px">${s}</svg>`;
}
function donut(pct, label, color = NAVY) {
  const r = 42, c = 2 * Math.PI * r, on = c * pct / 100;
  return `<svg viewBox="0 0 120 120" width="120" height="120">
    <circle cx="60" cy="60" r="${r}" fill="none" stroke="#eef2f7" stroke-width="14"/>
    <circle cx="60" cy="60" r="${r}" fill="none" stroke="${color}" stroke-width="14"
      stroke-dasharray="${on.toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 60 60)" stroke-linecap="round"/>
    <text x="60" y="58" font-size="20" font-weight="600" text-anchor="middle" fill="${NAVY}" font-family="Sarabun">${pct}%</text>
    <text x="60" y="74" font-size="8.5" text-anchor="middle" fill="#767676" font-family="Sarabun">${label}</text></svg>`;
}

// ── Module architecture diagram: source → BSO planning → ASO reporting → consumers
function moduleMap() {
  const STATE = { active: SAGE, partial: GOLD, dormant: DANGER, absent: '#C7CDD2' };
  const W = 720, colW = 150;
  const x0 = 8, x1 = 200, x2 = 392, x3 = 560;
  const planMods = MODS.modules.filter(m => m.status.state !== 'absent' && m.cube);
  const absent = MODS.modules.filter(m => m.status.state === 'absent');
  const rpt = MODS.reportingCubes;
  const rowH = 46, top = 64;
  const H = top + Math.max(planMods.length, rpt.length) * rowH + 64;
  const planSize = c => { const cu = AR.cubes.find(x => x.name === c); return cu ? fmt(cu.pageFileMB) + ' MB' : ''; };
  function box(x, y, w, h, title, sub, color, dot) {
    const dotSvg = dot ? `<circle cx="${x + 13}" cy="${y + 15}" r="5" fill="${dot}"/>` : '';
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="7" fill="#fff" stroke="${color}" stroke-width="1.6"/>
      <rect x="${x}" y="${y}" width="4.5" height="${h}" rx="2" fill="${color}"/>
      ${dotSvg}
      <text x="${x + (dot ? 23 : 11)}" y="${y + 18}" font-size="10.5" font-weight="600" fill="${NAVY}" font-family="Sarabun">${title}</text>
      <text x="${x + 11}" y="${y + 33}" font-size="8" fill="#6b7280" font-family="Sarabun">${sub}</text>`;
  }
  let s = '';
  const hdr = (x, t) => `<text x="${x}" y="20" font-size="9" font-weight="700" letter-spacing=".06em" fill="${SAGE}" font-family="Sarabun">${t.toUpperCase()}</text>`;
  s += hdr(x0, 'Source') + hdr(x1, 'Planning cubes (BSO)') + hdr(x2, 'Reporting cubes (ASO)') + hdr(x3, 'Consumers');
  const srcY = top + (planMods.length * rowH) / 2 - 22;
  s += box(x0, srcY, colW - 24, 42, 'NetSuite / loads', fmt(MODS.integration) + ' DM artifacts', NAVY);
  planMods.forEach((m, i) => {
    const y = top + i * rowH;
    const col = STATE[m.status.state];
    s += `<path d="M${x0 + colW - 24} ${srcY + 21} C ${x1 - 24} ${srcY + 21}, ${x1 - 24} ${y + 16}, ${x1} ${y + 16}" stroke="#cbd5e1" stroke-width="1.2" fill="none"/>`;
    s += box(x1, y, colW, 38, m.name.replace(' (custom)', ''), `${m.cube} · ${planSize(m.cube)} · ${m.status.label}`, col, col);
  });
  rpt.forEach((r, i) => {
    const y = top + i * rowH;
    const col = r.empty ? DANGER : SAGE;
    s += `<path d="M${x1 + colW} ${top + Math.min(i, planMods.length - 1) * rowH + 16} C ${x2 - 22} ${top + i * rowH + 16}, ${x2 - 22} ${y + 16}, ${x2} ${y + 16}" stroke="#cbd5e1" stroke-width="1.1" fill="none"/>`;
    s += box(x2, y, colW, 38, r.name, r.empty ? '0 cells — EMPTY' : fmt(r.cells) + ' cells', col, col);
  });
  const conY = top + (rpt.length * rowH) / 2 - 30;
  s += `<path d="M${x2 + colW} ${top + rowH} C ${x3 - 20} ${top + rowH}, ${x3 - 20} ${conY + 28}, ${x3} ${conY + 28}" stroke="#cbd5e1" stroke-width="1.1" fill="none"/>`;
  s += box(x3, conY, colW, 64, 'Smart View · Dashboards', `${fmt(AR.artifacts.financialReports)} FRs · 100% input via ad-hoc grids`, NAVY);
  if (absent.length) {
    const by = H - 40;
    s += `<text x="${x0}" y="${by - 6}" font-size="8.5" font-weight="600" fill="#9aa3ab" font-family="Sarabun">NOT INSTALLED (available in EPBCS):</text>`;
    absent.forEach((m, i) => {
      const cx = x0 + 200 + i * 118;
      s += `<rect x="${cx}" y="${by - 18}" width="110" height="20" rx="10" fill="#F1F3F5" stroke="#D7DCE0" stroke-width="1"/>
        <circle cx="${cx + 13}" cy="${by - 8}" r="4" fill="#C7CDD2"/>
        <text x="${cx + 23}" y="${by - 4}" font-size="8.5" fill="#6b7280" font-family="Sarabun">${m.name}</text>`;
    });
  }
  const lg = [['Active & used', SAGE], ['Partially used', GOLD], ['Dormant', DANGER], ['Not installed', '#C7CDD2']];
  let lx = x0;
  const legend = lg.map(([t, c]) => { const seg = `<circle cx="${lx + 5}" cy="${H - 8}" r="5" fill="${c}"/><text x="${lx + 14}" y="${H - 4}" font-size="8.5" fill="#434343" font-family="Sarabun">${t}</text>`; lx += 22 + t.length * 5.4; return seg; }).join('');
  s += legend;
  return wrap(`<div class="charts"><div class="card"><div class="ct">Oracle EPBCS module map — what is installed, and what is actually used</div>
    <svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:720px">${s}</svg>
    <div class="cap">Each box is a real cube in the application. Colour = usage from the ${AU.windowDays}-day audit. Data flows left to right. Red boxes are built but not running (Workforce, and the empty FinRptH reporting cube); grey chips are Oracle modules never installed.</div></div></div>`);
}

function integrationMap() {
  const ig = MODS.integrations;
  if (!ig) return '';
  const realSrc = ig.sourceSystems.filter(s => /netsuite|erp|fusion|ebs/i.test(s) && !/train/i.test(s));
  const W = 720, H = 250;
  const box = (x, y, w, h, title, sub, color, fill = '#fff') =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="7" fill="${fill}" stroke="${color}" stroke-width="1.5"/>
     <rect x="${x}" y="${y}" width="4.5" height="${h}" rx="2" fill="${color}"/>
     <text x="${x + 11}" y="${y + 17}" font-size="10" font-weight="600" fill="${NAVY}" font-family="Sarabun">${title}</text>
     ${sub ? `<text x="${x + 11}" y="${y + 31}" font-size="8" fill="#6b7280" font-family="Sarabun">${sub}</text>` : ''}`;
  let s = '';
  const hdr = (x, t) => `<text x="${x}" y="16" font-size="9" font-weight="700" letter-spacing=".06em" fill="${SAGE}" font-family="Sarabun">${t.toUpperCase()}</text>`;
  s += hdr(8, 'NetSuite source') + hdr(195, 'Pipelines') + hdr(370, 'Loads defined') + hdr(560, 'Target cubes');
  s += box(8, 95, 150, 50, 'NetSuite ERP', `${realSrc.length} connected source${realSrc.length > 1 ? 's' : ''}`, NAVY);
  ig.pipelines.forEach((p, i) => {
    const y = 60 + i * 70;
    s += `<path d="M158 120 C 178 120, 178 ${y + 20}, 195 ${y + 20}" stroke="#cbd5e1" stroke-width="1.3" fill="none"/>`;
    s += box(195, y, 150, 40, p, p === 'NSDimSync' ? 'metadata sync' : 'data update', SAGE);
  });
  s += box(370, 40, 160, 46, `${ig.metadataLoads.length} metadata loads`, 'dimensions: accts, dept, site, entity', GOLD);
  s += box(370, 150, 160, 46, `${ig.dataLoads.length} data loads`, 'actuals, revenue, FX, trial balance', SAGE);
  s += `<path d="M345 80 C 360 80, 360 63, 370 63" stroke="#cbd5e1" stroke-width="1.2" fill="none"/>`;
  s += `<path d="M345 150 C 360 150, 360 173, 370 173" stroke="#cbd5e1" stroke-width="1.2" fill="none"/>`;
  const bsoNames = AR.cubes.filter(c => c.type === 'BSO').map(c => c.name).join(', ');
  s += box(560, 95, 152, 56, 'BSO planning cubes', bsoNames, NAVY);
  s += `<path d="M530 63 C 545 63, 545 110, 560 110" stroke="#cbd5e1" stroke-width="1.2" fill="none"/>`;
  s += `<path d="M530 173 C 545 173, 545 130, 560 130" stroke="#cbd5e1" stroke-width="1.2" fill="none"/>`;
  const trainCount = ig.sourceSystems.filter(x => /train/i.test(x)).length;
  if (trainCount) s += `<text x="8" y="${H - 8}" font-size="8.5" fill="#9aa3ab" font-family="Sarabun">Note: ${trainCount} leftover "training" source-period mappings remain in the integration config — candidates to clean up.</text>`;
  return wrap(`<div class="charts"><div class="card"><div class="ct">Data integration — NetSuite → NSPB pipelines (${MODS.integration} Data Management artifacts)</div>
    <svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:720px">${s}</svg>
    <div class="cap">${ig.pipelines.length} pipelines move ${ig.metadataLoads.length} metadata feeds (dimensions) and ${ig.dataLoads.length} data feeds (actuals, revenue, FX, trial balance) from NetSuite into the planning cubes. This is the backbone that keeps the application fed — and it is actively maintained.</div></div></div>`);
}

function dataLivesChart() {
  const bso = AR.cubes.filter(c => c.type === 'BSO' && L0[c.name]);
  if (!bso.length) return '';
  const YEARS = ['FY19', 'FY20', 'FY21', 'FY22', 'FY23', 'FY24', 'FY25', 'FY26'];
  const colFor = y => y >= 'FY25' ? SAGE : y >= 'FY24' ? GOLD : '#B8C4CD';
  const panels = bso.map(c => {
    const s = L0[c.name], yd = s.blocksByYear;
    const max = Math.max(...YEARS.map(y => yd[y] || 0)) || 1;
    const bw = 26, gap = 8, h = 90, base = h - 16;
    let bars = '';
    YEARS.forEach((y, i) => {
      const v = yd[y] || 0, bh = (v / max) * (base - 6), x = 8 + i * (bw + gap);
      bars += `<rect x="${x}" y="${base - bh}" width="${bw}" height="${bh.toFixed(1)}" rx="2" fill="${colFor(y)}"/>`;
      bars += `<text x="${x + bw / 2}" y="${base + 10}" font-size="7.5" text-anchor="middle" fill="#6b7280" font-family="Sarabun">${y.replace('FY', "'")}</text>`;
    });
    const fwd = (() => { const tot = Object.values(yd).reduce((a, b) => a + b, 0) || 1; return (100 * ((yd.FY25 || 0) + (yd.FY26 || 0)) / tot); })();
    const W = 8 + YEARS.length * (bw + gap);
    return `<div class="card third">
      <div class="ct">${c.name} — ${fmt(s.totals.blocks)} blocks</div>
      <svg viewBox="0 0 ${W} ${h}" width="100%" style="max-width:280px">${bars}</svg>
      <div class="cap" style="border:0;padding-top:2px">Forward (FY25–26): <b style="color:${fwd < 5 ? DANGER : fwd < 20 ? ORANGE : SAGE}">${fwd.toFixed(1)}%</b> · peak ${Object.entries(yd).sort((a, b) => b[1] - a[1])[0][0]}</div>
    </div>`;
  }).join('');
  return wrap(`<div class="charts">
    <div class="row">${panels}</div>
    <div class="card" style="margin-top:2px"><div class="cap" style="border:0;padding:0">Each panel = real level-0 data per planning cube, by fiscal year. <b style="color:${SAGE}">Green</b> = forward planning years (FY25–26), <b style="color:${GOLD}">gold</b> = FY24, <b style="color:#8a97a1">grey</b> = history. The application holds years of history but almost no forward plan — Revenue (RevPlan) collapses after FY21, evidence the planning process largely stopped.</div></div>
  </div>`);
}

function scenarioMixChart() {
  const cubes = ['OEP_FS', 'RevPlan', 'WFPlan'].filter(c => L0[c]);
  if (!cubes.length) return '';
  const TYPE = { Actual: SAGE, Forecast: NAVY, 'Plan/Budget': GOLD, Other: '#C7CDD2' };
  const classify = s => /actual/i.test(s) ? 'Actual' : /forecast|midyear|prior/i.test(s) ? 'Forecast' : /plan|budget|stretch/i.test(s) ? 'Plan/Budget' : 'Other';
  const rows = cubes.map(c => {
    const agg = {}; for (const [scn, v] of Object.entries(L0[c].blocksByScenario)) { const t = classify(scn); agg[t] = (agg[t] || 0) + v; }
    const tot = Object.values(agg).reduce((a, b) => a + b, 0) || 1;
    let x = 0; const segs = Object.keys(TYPE).filter(t => agg[t]).map(t => { const w = 100 * agg[t] / tot; const s = `<rect x="${x}%" y="0" width="${w}%" height="20" fill="${TYPE[t]}"/>`; x += w; return s; }).join('');
    return `<div style="margin:6px 0"><div style="font-size:8.5px;color:#434343;margin-bottom:2px;font-family:Sarabun">${c}</div><svg viewBox="0 0 100 20" width="100%" height="20" preserveAspectRatio="none">${segs}</svg></div>`;
  }).join('');
  const legend = Object.entries(TYPE).map(([t, c]) => `<span style="font-size:8.3px;color:#434343;margin-right:12px"><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${c};margin-right:3px"></span>${t}</span>`).join('');
  return wrap(`<div class="charts"><div class="card"><div class="ct">Scenario mix per planning cube — what kind of data each holds</div>${rows}<div style="margin-top:6px">${legend}</div>
    <div class="cap">Financials is dominated by Actuals (a history store); Revenue and Workforce are mostly Plan/Forecast with little or no Actuals — consistent with planning that was set up but not sustained.</div></div></div>`);
}

function formsToRules() {
  const p = path.join(dir, 'navflow.json');
  if (!fs.existsSync(p)) return '';
  const NF = JSON.parse(fs.readFileSync(p, 'utf8'));
  const CUBECOL = { OEP_FS: SAGE, RevPlan: GOLD, WFPlan: DANGER };
  const LABEL = { OEP_FS: 'Financials', RevPlan: 'Revenue', WFPlan: 'Workforce' };
  const byCube = {};
  for (const f of NF.mainForms) (byCube[f.cube] = byCube[f.cube] || []).push(f);
  const cols = ['OEP_FS', 'RevPlan', 'WFPlan'].filter(c => byCube[c]).map(cube => {
    const forms = byCube[cube];
    const rules = [...new Set(forms.flatMap(f => f.rules.filter(r => !/^(DEFAULT|CURRENCY)$/.test(r.name)).map(r => r.name)))];
    const chips = forms.slice(0, 7).map(f => `<div style="font-size:8px;color:#434343;padding:2px 0;border-bottom:1px solid #F3F3F3">${f.name.length > 38 ? f.name.slice(0, 37) + '…' : f.name}</div>`).join('');
    return `<div class="card third" style="border-top:3px solid ${CUBECOL[cube]}">
      <div class="ct" style="color:${CUBECOL[cube]}">${LABEL[cube]} — ${forms.length} forms</div>
      ${chips}${forms.length > 7 ? `<div style="font-size:8px;color:#9aa3ab;padding-top:3px">+${forms.length - 7} more</div>` : ''}
      <div class="cap" style="border-top:1px solid #F3F3F3">Save triggers: ${rules.slice(0, 3).map(r => `<b>${r.replace(/_SEQ_/g, ' ').slice(0, 28)}</b>`).join(', ') || 'rollup/currency'}</div>
    </div>`;
  }).join('');
  return wrap(`<div class="charts"><div class="row">${cols}</div>
    <div class="card" style="margin-top:2px"><div class="cap" style="border:0;padding:0">The ${NF.mainForms.length} forms surfaced in navigation, grouped by module. Each module's input forms trigger that module's calc chain on save (Financials→FIN_SEQ, Revenue→REV_SEQ, Workforce→WFP_SEQ) — a coherent, purpose-built design.${NF.danglingForms && NF.danglingForms.length ? ` <b style="color:${DANGER}">Note:</b> navigation also points to ${NF.danglingForms.length} forms that don't exist (disabled Cash Flow / Balance Sheet features).` : ''}</div></div>
  </div>`);
}

function cubeFlowMap() {
  const maps = MODS.dataMaps || [];
  if (!maps.length) return '';
  const edges = {};
  for (const m of maps) { const k = m.source + '→' + m.target; const e = edges[k] || (edges[k] = { source: m.source, target: m.target, count: 0, temps: 0 }); e.count++; if (m.temp) e.temps++; }
  const W = 720;
  const bso = AR.cubes.filter(c => c.type === 'BSO').map(c => c.name);
  const aso = AR.cubes.filter(c => c.type === 'ASO').map(c => c.name);
  const rowH = 64, top = 40;
  const H = top + Math.max(bso.length, aso.length) * rowH + 20;
  const xB = 60, xA = 470, boxW = 180, boxH = 44;
  const posB = {}, posA = {};
  bso.forEach((c, i) => posB[c] = top + i * rowH);
  aso.forEach((c, i) => posA[c] = top + i * rowH);
  const cubeColor = c => c === 'FinRptH' ? DANGER : c === 'WFPlan' ? DANGER : c === 'RevPlan' ? GOLD : SAGE;
  let s = '';
  const hdr = (x, t) => `<text x="${x}" y="20" font-size="9" font-weight="700" letter-spacing=".06em" fill="${SAGE}" font-family="Sarabun">${t.toUpperCase()}</text>`;
  s += hdr(xB, 'Planning cubes (BSO)') + hdr(xA, 'Reporting cubes (ASO)');
  for (const e of Object.values(edges)) {
    const sy = (posB[e.source] != null ? posB[e.source] : posA[e.source]) + boxH / 2;
    const sx = posB[e.source] != null ? xB + boxW : xA;
    const ty = (posA[e.target] != null ? posA[e.target] : posB[e.target]) + boxH / 2;
    const tx = posA[e.target] != null ? xA : xB + boxW;
    const dashed = e.temps === e.count;
    const isBack = posB[e.target] != null;
    const mid = isBack ? xB - 34 : (sx + tx) / 2;
    const col = dashed ? '#C9512E88' : '#94A6B3';
    if (isBack) {
      s += `<path d="M${xB} ${sy} C ${mid} ${sy}, ${mid} ${ty}, ${xB} ${ty}" stroke="${col}" stroke-width="1.6" fill="none" ${dashed ? 'stroke-dasharray="4 3"' : ''} marker-end="url(#arr)"/>`;
    } else {
      s += `<path d="M${sx} ${sy} C ${mid} ${sy}, ${mid} ${ty}, ${tx} ${ty}" stroke="${col}" stroke-width="${1 + Math.min(e.count, 5) * 0.7}" fill="none" ${dashed ? 'stroke-dasharray="4 3"' : ''} marker-end="url(#arr)"/>`;
      s += `<text x="${(sx + tx) / 2}" y="${(sy + ty) / 2 - 5}" font-size="7.8" text-anchor="middle" fill="#6b7280" font-family="Sarabun">${e.count} map${e.count > 1 ? 's' : ''}${e.temps ? ` (${e.temps} temp)` : ''}</text>`;
    }
  }
  s = `<defs><marker id="arr" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto"><path d="M0,0 L7,3 L0,6 Z" fill="#94A6B3"/></marker></defs>` + s;
  const box = (x, y, name, sub, color) => `<rect x="${x}" y="${y}" width="${boxW}" height="${boxH}" rx="7" fill="#fff" stroke="${color}" stroke-width="1.6"/>
    <rect x="${x}" y="${y}" width="4.5" height="${boxH}" rx="2" fill="${color}"/>
    <text x="${x + 12}" y="${y + 18}" font-size="10.5" font-weight="600" fill="${NAVY}" font-family="Sarabun">${name}</text>
    <text x="${x + 12}" y="${y + 33}" font-size="8" fill="#6b7280" font-family="Sarabun">${sub}</text>`;
  for (const c of bso) { const cu = AR.cubes.find(x => x.name === c); s += box(xB, posB[c], c, `${fmt(cu.pageFileMB)} MB page file`, cubeColor(c)); }
  for (const c of aso) {
    const cu = AR.cubes.find(x => x.name === c);
    const fed = Object.values(edges).some(e => e.target === c && e.temps < e.count);
    s += box(xA, posA[c], c, cu.inputCells === 0 ? '0 cells — EMPTY, no map feeds it' : `${fmt(cu.inputCells)} cells${fed ? '' : ' — loaded via DM, no data map'}`, cu.inputCells === 0 ? DANGER : fed ? SAGE : GOLD);
  }
  return wrap(`<div class="charts"><div class="card"><div class="ct">Cube-to-cube data flow — the ${maps.length} data maps (Smart Push)</div>
    <svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:720px">${s}</svg>
    <div class="cap">Arrow thickness = number of data maps on that path; dashed red = "_Temp" leftovers. FinRptH has no inbound flow at all (it is empty), and RevRpt receives data only through Data Management loads — no map connects it to RevPlan.</div></div></div>`);
}

// Generic: build the keep / start-using / remove board from the §4.2 prose of
// THIS client's state-report.md (its three "### <bucket>" sub-sections), so the
// board is correct per client with no hardcoded content. Returns '' if absent.
function decisionBoard() {
  const sec42 = body('decision board') || body('4.2');
  if (!sec42) return '';
  const bucketColor = h =>
    /\bkeep\b/i.test(h) ? SAGE :
    /start\s*using|start-using/i.test(h) ? GOLD :
    /remove|archive|retire/i.test(h) ? DANGER : NAVY;
  const buckets = [];
  for (const part of sec42.split(/\n(?=###\s)/)) {
    const hm = part.match(/^###\s+(.+)/);
    if (!hm) continue;
    const heading = hm[1].replace(/@@\w+@@/g, '').trim();
    const items = [];
    for (const line of part.split('\n')) {
      const bm = line.match(/^\s*-\s+(.+)/);
      if (!bm) continue;
      let raw = bm[1].replace(/@@\w+@@/g, '').replace(/\s*\([\d.\/, –-]+\)\s*$/, '').trim();
      const tm = raw.match(/^\*\*(.+?)\*\*\s*[—:–-]?\s*(.*)$/);
      let title = (tm ? tm[1] : raw.replace(/\*\*/g, '')).trim().slice(0, 60);
      let desc = (tm ? tm[2] : '').replace(/\*\*/g, '').replace(/`/g, '').trim();
      if (desc.length > 100) desc = desc.slice(0, 97).replace(/\s+\S*$/, '') + '…';
      if (title) items.push([title, desc]);
    }
    if (items.length) buckets.push({ heading, color: bucketColor(heading), items: items.slice(0, 6) });
  }
  if (!buckets.length) return '';
  const col = b => `<div class="card third" style="border-top:3px solid ${b.color}">
    <div class="ct" style="color:${b.color}">${he(b.heading)}</div>
    ${b.items.map(([t, s]) => `<div class="sc-row"><span style="width:7px;height:7px;border-radius:50%;background:${b.color};display:inline-block;margin-top:4px;flex-shrink:0"></span><div><b>${he(t)}</b>${s ? `<span class="sc-sub">${he(s)}</span>` : ''}</div></div>`).join('')}
  </div>`;
  return wrap(`<div class="charts"><div class="row">${buckets.map(col).join('')}</div></div>`);
}

function dimensionChart() {
  const D = AR.dimensionsByCube;
  if (!D) return '';
  const CUBECOL = { RevPlan: GOLD, WFPlan: DANGER, OEP_FS: SAGE };
  const rows = [];
  for (const [cube, dims] of Object.entries(D)) for (const d of dims) rows.push({ cube, ...d });
  rows.sort((a, b) => b.stored - a.stored);
  const top = rows.slice(0, 12);
  const maxV = top[0].stored || 1;
  const rowH = 21, labelW = 188, barMax = 280;
  let s = '';
  top.forEach((d, i) => {
    const y = i * rowH + 4, bw = Math.max((d.stored / maxV) * barMax, 1.5);
    s += `<text x="0" y="${y + rowH * 0.7}" font-size="8.3" fill="#374151" font-family="Sarabun">${d.name} <tspan fill="#9aa3ab">(${d.cube}${d.storage === 'Dense' ? ' · dense' : ''})</tspan></text>`;
    s += `<rect x="${labelW}" y="${y + 3}" width="${bw.toFixed(1)}" height="${rowH - 7}" rx="2" fill="${CUBECOL[d.cube] || NAVY}" ${d.storage === 'Dense' ? 'opacity=".45"' : ''}/>`;
    s += `<text x="${labelW + bw + 5}" y="${y + rowH * 0.7}" font-size="8" fill="#6b7280" font-family="Sarabun">${fmt(d.stored)}${d.levels >= 10 ? ' · ' + d.levels + ' levels' : ''}</text>`;
  });
  const legend = Object.entries(CUBECOL).map(([c, col], i) =>
    `<rect x="${labelW + i * 95}" y="${top.length * rowH + 10}" width="9" height="9" rx="2" fill="${col}"/><text x="${labelW + i * 95 + 13}" y="${top.length * rowH + 18}" font-size="8.3" fill="#434343" font-family="Sarabun">${c}</text>`).join('');
  return wrap(`<div class="charts"><div class="card"><div class="ct">Largest dimensions by stored members — colour = cube</div>
    <svg viewBox="0 0 ${labelW + barMax + 110} ${top.length * rowH + 30}" width="100%" style="max-width:600px">${s}${legend}</svg>
    <div class="cap">Department dominates every cube (11,152 stored in OEP_FS, 11 levels deep). Employee and Job exist only for Workforce — they leave the system if that module is retired. Faded bars are dense dimensions (they size the block, not the block count).</div></div></div>`);
}

function planningTimeline() {
  const pw = MODS.planningWindow;
  if (!pw || !pw.yrStart || !pw.yrEnd) return '';
  const y0 = pw.yrStart, y1 = pw.yrEnd, span = y1 - y0;
  const W = 700, x0 = 14, xW = W - 28, barY = 56, barH = 26;
  const xfor = y => x0 + ((y - y0) / span) * xW;
  const fy = y => 'FY' + String(y).slice(2);
  let s = '';
  s += `<rect x="${x0}" y="${barY}" width="${xW}" height="${barH}" rx="4" fill="#EEF1F3"/>`;
  if (pw.yrActual) {
    const w = xfor(pw.yrActual + 1) - x0;
    s += `<rect x="${x0}" y="${barY}" width="${Math.min(w, xW).toFixed(1)}" height="${barH}" rx="4" fill="${SAGE}"/>`;
    s += `<text x="${x0 + 8}" y="${barY + 17}" font-size="9" font-weight="600" fill="#fff" font-family="Sarabun">Actuals → ${pw.actualLoadMonth || ''} ${pw.actualLoadYear || ''}</text>`;
  }
  if (pw.yrFcst1) {
    const fx = xfor(pw.yrFcst1), fw = xfor((pw.yrFcst2 || pw.yrFcst1) + 1) - fx;
    s += `<rect x="${fx.toFixed(1)}" y="${barY}" width="${fw.toFixed(1)}" height="${barH}" rx="4" fill="${GOLD}"/>`;
    s += `<text x="${(fx + 6).toFixed(1)}" y="${barY + 17}" font-size="9" font-weight="600" fill="${NAVY}" font-family="Sarabun">Forecast ${pw.fcst1}–${pw.fcst2 || pw.fcst1}</text>`;
  }
  for (let y = y0; y <= y1; y++) {
    const x = xfor(y + 0.5);
    s += `<text x="${x.toFixed(1)}" y="${barY + barH + 14}" font-size="7.8" text-anchor="middle" fill="#6b7280" font-family="Sarabun">${fy(y)}</text>`;
    s += `<line x1="${xfor(y).toFixed(1)}" y1="${barY}" x2="${xfor(y).toFixed(1)}" y2="${barY + barH}" stroke="#fff" stroke-width="0.6"/>`;
  }
  s += `<text x="${x0}" y="20" font-size="9" font-weight="700" letter-spacing=".05em" fill="${SAGE}" font-family="Sarabun">PLANNING HORIZON ${pw.planStart} → ${pw.planEnd}</text>`;
  const note = (pw.oepCurMnth && pw.paiCurrentMonth && (pw.oepCurMnth !== pw.actualLoadMonth))
    ? `<text x="${x0}" y="${barY + barH + 32}" font-size="8.5" fill="${DANGER}" font-family="Sarabun">⚠ Two period clocks disagree: OEP_CurMnth = ${pw.oepCurMnth}/${pw.oepCurYr} (stale) vs PAI actual load = ${pw.actualLoadMonth}/${pw.actualLoadYear} (current). Align them.</text>` : '';
  s += note;
  const H = barY + barH + (note ? 44 : 24);
  return wrap(`<div class="charts"><div class="card"><div class="ct">Planning window — how time is defined in the model</div>
    <svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:700px">${s}</svg>
    <div class="cap">Green = years with loaded actuals (through ${pw.actualLoadMonth} ${pw.actualLoadYear}); gold = the active forecast window (${pw.fcst1}–${pw.fcst2}); grey = the full plan horizon kept open to ${pw.planEnd}. The forecast window is driven by substitution variables — keep them current each month.</div></div></div>`);
}

function calcAndInventory() {
  const MODCOL = { OEP_FS: SAGE, WFPlan: DANGER, RevPlan: GOLD, FinRpt: NAVY, FinRptH: DANGER, RevRpt: '#8aa0ad', WFRpt: '#8aa0ad' };
  const tr = MODS.topRules;
  const maxR = Math.max(...tr.map(r => r.count)) || 1;
  const rowH = 21, barMax = 250, labelW = 200;
  let bars = '';
  tr.forEach((r, i) => {
    const y = i * rowH + 4, bw = (r.count / maxR) * barMax;
    bars += `<text x="0" y="${y + rowH * 0.7}" font-size="8.3" fill="#374151" font-family="Sarabun">${r.rule.length > 30 ? r.rule.slice(0, 29) + '…' : r.rule}</text>`;
    bars += `<rect x="${labelW}" y="${y + 3}" width="${Math.max(bw, 1).toFixed(1)}" height="${rowH - 7}" rx="2" fill="${MODCOL[r.cube] || NAVY}"/>`;
    bars += `<text x="${labelW + Math.max(bw, 1) + 5}" y="${y + rowH * 0.7}" font-size="8" fill="#6b7280" font-family="Sarabun">${fmt(r.count)}×</text>`;
  });
  const barsSvg = `<svg viewBox="0 0 ${labelW + barMax + 50} ${tr.length * rowH + 8}" width="100%">${bars}</svg>`;
  const inv = Object.entries(MODS.inventoryByCube).filter(([, v]) => v.forms || v.rules);
  const iRowH = 26, iLabelW = 78, iBarMax = 240;
  const maxArt = Math.max(...inv.map(([, v]) => Math.max(v.forms, v.rules))) || 1;
  let irows = '';
  inv.forEach(([c, v], i) => {
    const y = i * iRowH + 14;
    irows += `<text x="0" y="${y + 4}" font-size="8.5" font-weight="600" fill="${NAVY}" font-family="Sarabun">${c}</text>`;
    const fw = (v.forms / maxArt) * iBarMax;
    irows += `<rect x="${iLabelW}" y="${y - 7}" width="${Math.max(fw, 0.5).toFixed(1)}" height="7" rx="1.5" fill="${MODCOL[c] || NAVY}" opacity=".42"/>`;
    irows += `<text x="${iLabelW + Math.max(fw, 0.5) + 4}" y="${y - 1}" font-size="7.5" fill="#6b7280" font-family="Sarabun">${v.forms} forms</text>`;
    const rw = (v.rules / maxArt) * iBarMax, aw = (v.rulesActive / maxArt) * iBarMax;
    irows += `<rect x="${iLabelW}" y="${y + 2}" width="${Math.max(rw, 0.5).toFixed(1)}" height="7" rx="1.5" fill="#E3E7EA"/>`;
    if (aw > 0) irows += `<rect x="${iLabelW}" y="${y + 2}" width="${aw.toFixed(1)}" height="7" rx="1.5" fill="${MODCOL[c] || NAVY}"/>`;
    irows += `<text x="${iLabelW + Math.max(rw, 0.5) + 4}" y="${y + 8}" font-size="7.5" fill="#6b7280" font-family="Sarabun">${v.rulesActive}/${v.rules} rules run</text>`;
  });
  const invSvg = `<svg viewBox="0 0 ${iLabelW + iBarMax + 70} ${inv.length * iRowH + 18}" width="100%">${irows}</svg>`;
  return wrap(`<div class="charts"><div class="row">
    <div class="card half"><div class="ct">Most-executed calculations (${AU.windowDays} days) — colour = module</div>${barsSvg}
      <div class="cap">All real calc volume is the daily Financials actuals chain (green = OEP_FS). Workforce (red) ran a handful of times; everything else is idle.</div></div>
    <div class="card half"><div class="ct">Forms & rules built vs. used, per cube</div>${invSvg}
      <div class="cap">Top bar = forms built; bottom bar = rules (solid = actually executed, grey = dormant). RevPlan has 58 forms and 61 rules — none of those rules ran in the window.</div></div>
  </div></div>`);
}

function revenueLineageMap() {
  if (!RR || !RR.savedSearches) return '';
  const SS = RR.savedSearches, H = RR.hierarchy || {}, PM = RR.pushMap || [], LS = RR.loadStructure || {};
  const inc = { search: LS.incomeSearch || (SS.income[0] || {}).search };
  const rev = { search: LS.revenueSearch || (SS.revenue[0] || {}).search };
  const revL = (H.revLeaves || []).length, incL = (H.incomeLeaves || []).length, common = (H.common || []).length;
  const tgtN = new Set(PM.flatMap(p => p.targets)).size;
  const shorten = s => (s || '?').replace('customsearch_nspbcs_all_transactions', 'cs_…');
  const W = 720, top = 38, rowH = 88, hB = 46;
  const x0 = 8, bw0 = 188, x1 = 205, bw1 = 150, x2 = 372, bw2 = 120, x3 = 512, bw3 = 150;
  const yI = top + 4, yR = top + rowH + 4, H_ = top + 2 * rowH + 30;
  const box = (x, y, w, t, sub, color, fill = '#fff') => `<rect x="${x}" y="${y}" width="${w}" height="${hB}" rx="7" fill="${fill}" stroke="${color}" stroke-width="1.6"/>
    <rect x="${x}" y="${y}" width="4.5" height="${hB}" rx="2" fill="${color}"/>
    <text x="${x + 12}" y="${y + 18}" font-size="9.5" font-weight="600" fill="${NAVY}" font-family="Sarabun">${t}</text>
    <text x="${x + 12}" y="${y + 33}" font-size="7.8" fill="#6b7280" font-family="Sarabun">${sub}</text>`;
  const arr = (ax, ay, bx2, by2) => `<path d="M${ax} ${ay} C ${(ax + bx2) / 2} ${ay}, ${(ax + bx2) / 2} ${by2}, ${bx2} ${by2}" stroke="#94A6B3" stroke-width="1.4" fill="none" marker-end="url(#arl)"/>`;
  const hdr = (x, t) => `<text x="${x}" y="20" font-size="9" font-weight="700" letter-spacing=".05em" fill="${SAGE}" font-family="Sarabun">${t.toUpperCase()}</text>`;
  let s = `<defs><marker id="arl" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto"><path d="M0,0 L7,3 L0,6 Z" fill="#94A6B3"/></marker><marker id="arg" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto"><path d="M0,0 L7,3 L0,6 Z" fill="${ORANGE}"/></marker></defs>`;
  s += hdr(x0, 'NetSuite saved search') + hdr(x1, 'FDMEE load') + hdr(x2, 'Cube') + hdr(x3, 'Business figure');
  s += box(x0, yI, bw0, shorten(inc.search), 'income / financials', SAGE) + box(x1, yI, bw1, 'Financial Actuals', '→ OEP_FS', SAGE)
    + box(x2, yI, bw2, 'OEP_FS', 'Financials', SAGE) + box(x3, yI, bw3, 'INCOME', incL + ' GL accounts', NAVY);
  s += arr(x0 + bw0, yI + hB / 2, x1, yI + hB / 2) + arr(x1 + bw1, yI + hB / 2, x2, yI + hB / 2) + arr(x2 + bw2, yI + hB / 2, x3, yI + hB / 2);
  s += box(x0, yR, bw0, shorten(rev.search), 'revenue', GOLD) + box(x1, yR, bw1, 'RevPlan Actuals', '→ RevPlan', GOLD)
    + box(x2, yR, bw2, 'RevPlan', 'Revenue (custom)', GOLD) + box(x3, yR, bw3, 'Total Revenue', revL + ' categories', NAVY);
  s += arr(x0 + bw0, yR + hB / 2, x1, yR + hB / 2) + arr(x1 + bw1, yR + hB / 2, x2, yR + hB / 2) + arr(x2 + bw2, yR + hB / 2, x3, yR + hB / 2);
  const mY = (yI + hB + yR) / 2;
  s += `<path d="M${x1 + bw1 * 0.55} ${yR} C ${x1 + bw1 * 0.55 + 16} ${yR - 26}, ${x2} ${yI + hB + 16}, ${x2 + 26} ${yI + hB}" stroke="${ORANGE}" stroke-width="1.5" fill="none" stroke-dasharray="4 3" marker-end="url(#arg)"/>`;
  s += `<text x="${x0 + 2}" y="${mY + 3}" font-size="7.6" fill="${ORANGE}" font-family="Sarabun">RevPlan Actuals also loads OEP_FS &#8594; revenue reaches Financials twice (the _OEPFS rules)</text>`;
  const bx = x3 + bw3 + 5;
  s += `<path d="M${bx} ${yI + hB / 2} C ${bx + 14} ${yI + hB / 2}, ${bx + 14} ${yR + hB / 2}, ${bx} ${yR + hB / 2}" stroke="${DANGER}" stroke-width="1.7" fill="none" stroke-dasharray="4 3"/>`;
  s += `<text x="${bx - 2}" y="${(yI + yR) / 2 + hB / 2 + 3}" font-size="13" font-weight="700" fill="${DANGER}" font-family="Sarabun">&#8800;</text>`;
  const by = top + rowH - 4;
  s += `<rect x="${x2 - 4}" y="${by}" width="${(x3 + bw3) - (x2 - 4)}" height="19" rx="9" fill="#FBF3D6" stroke="${GOLD}" stroke-width="1"/>
    <text x="${x2 + 6}" y="${by + 13}" font-size="7.8" fill="${NAVY}" font-family="Sarabun">only structural bridge: @XWRITE push · ${PM.length} categories → ${tgtN} GL accounts</text>`;
  return wrap(`<div class="charts"><div class="card"><div class="ct">Revenue → Financials lineage — two separate NetSuite saved searches feed the two figures</div>
    <svg viewBox="0 0 ${W} ${H_}" width="100%" style="max-width:720px">${s}</svg>
    <div class="cap"><b style="color:${SAGE}">Income</b> and <b style="color:${ORANGE}">Total Revenue</b> are loaded by <b>different</b> NetSuite saved searches into different cubes, then compared. They share <b>${common}</b> of their ${incL}/${revL} level-0 members — the only bridge is the hard-coded <code>@XWRITE</code> push (${PM.length} categories → ${tgtN} GL accounts). The dashed red link (≠) is the reconciliation the business expects but the model never enforces.</div></div></div>`);
}

function usersChart() {
  const users = Object.entries(AU.byUser).sort((a, b) => b[1].count - a[1].count).map(([u, v]) => ({
    label: u.length > 34 ? u.slice(0, 33) + '…' : u, value: v.count,
    pct: fmt(v.count) + ' · last ' + String(v.last).slice(0, 10),
    color: /bryantparkconsulting|@oracle\.com|partner\.com|^SYSTEM$|^System$/i.test(u) ? GRAY : SAGE,
  }));
  return wrap(`<div class="charts"><div class="card"><div class="ct">Audit actions per user (${AU.windowDays} days) — <span style="color:${SAGE}">client</span> vs <span style="color:#9aa3ab">BPC / Oracle / system</span></div>${hbars(users, { rowH: 21 })}
    <div class="cap">Every bar = one user's total audited actions. Green bars are ${DISPLAY} business users; grey are consultants and system accounts. The two heaviest users stopped in Feb/Mar 2026.</div></div></div>`);
}

function rulesAndEntryChart() {
  const mTotalRules = (md.match(/Of \*\*([\d,]+) rules\*\*/) || [])[1] || '155';
  const mExecRules = (md.match(/\*\*(\d+) distinct rules executed\*\*/) || [])[1] || String(Object.values(AU.ruleRuns).length);
  const mForms = (md.match(/\*\*([\d,]+)\*\* forms|\*\*([\d,]+) forms\*\*|([\d,]+) Planning forms/) || []).filter(Boolean)[1] || '172';
  const dataTotal = Object.values(AU.dataChangesByUser || {}).reduce((s, v) => s + v, 0);
  const dormantPct = Math.round(100 * (1 - +mExecRules / +String(mTotalRules).replace(/,/g, '')));
  const bigStat = (num, label, color) => `<div style="text-align:center"><div style="font-family:Sarabun;font-weight:600;font-size:26px;color:${color};line-height:1">${num}</div><div style="font-size:8.5px;color:#767676;margin-top:3px">${label}</div></div>`;
  return wrap(`<div class="charts"><div class="row">
    <div class="card half"><div class="ct">Business rules — dormant share</div><div class="center">${donut(dormantPct, 'never ran in window', DANGER)}
    <div class="impact"><b>${mTotalRules}</b> rules in the app<br/>→ <b>${mExecRules}</b> executed<br/><span style="color:${DANGER}">${dormantPct}% dormant</span></div></div>
    <div class="cap">Dormant is not automatically useless — seasonal rules exist — but each one deserves a keep/retire decision.</div></div>
    <div class="card half"><div class="ct">Where data entry happens</div>
    <div class="center" style="gap:24px">${bigStat(fmt(dataTotal), 'data changes via<br/>Smart View ad-hoc', NAVY)}${bigStat('0', 'data changes via<br/>Planning forms', DANGER)}</div>
    <div class="cap">All audited data input in ${AU.windowDays} days came through ad-hoc grids — the ${mForms} built forms are bypassed.</div></div>
  </div></div>`);
}

// ============================================================
// Parse state-report.md into sections, then assemble focused articles
// ============================================================

function parseSections(src) {
  const parts = src.split(/\n(?=## )/);
  let preamble = '';
  if (!parts[0].startsWith('## ')) preamble = parts.shift();
  const sec = {};
  for (const p of parts) {
    const m = p.match(/^## (.+)/);
    if (!m) continue;
    const title = m[1].trim();
    sec[title] = p.slice(p.indexOf('\n') + 1).replace(/\n+$/, '');
  }
  return { preamble, sec };
}

const { preamble, sec } = parseSections(md);
const titles = Object.keys(sec);
// pick a section whose heading contains the given substring
const find = sub => titles.find(t => t.toLowerCase().includes(sub.toLowerCase()));
const body = sub => { const t = find(sub); return t ? sec[t] : ''; };
const head = sub => { const t = find(sub); return t || sub; };

// Emit a "## heading" + optional diagram + body block
function section(sub, diagram = '') {
  const t = head(sub);
  const b = body(sub);
  if (!b && !diagram) return '';
  return `## ${t}\n\n${diagram ? diagram + '\n\n' : ''}${b}`.trim();
}

// Build one article markdown (first line H1 = title for the publish script).
// `meta` is an optional `<!--env …-->` line (line 2) the publisher parses to place
// the article (section/category). Returns null when the article has no real content.
function article(title, lead, blocks, meta) {
  const real = blocks.filter(b => b && b.trim());
  if (!real.length) return null;
  const parts = [`# ${title}`];
  if (meta) parts.push(meta);
  if (lead) parts.push(lead.trim());
  for (const b of real) parts.push(b.trim());
  return parts.join('\n\n') + '\n';
}

const prepLine = (preamble.split('\n').find(l => l.startsWith('_Prepared')) || '').trim();

// The decision board replaces the §4.2 prose (it IS the visual of that section).
// Falls back to the raw §4.2 prose if the board could not be parsed.
const board = decisionBoard();
const boardBlock = board
  ? `## The decision board — keep, start using, or remove\n\n_The board below summarizes the whole assessment in one view: what is earning its keep, what is built and only needs data or a small push, and what is a candidate to leave the system._\n\n${board}`
  : section('4.2 The decision board');

const ARTICLES = [
  {
    file: '01-executive-summary.md',
    md: article('Executive Summary',
      prepLine,
      [
        moduleMap(),
        section('Executive summary'),
      ]),
  },
  {
    file: '02-modules-and-features.md',
    md: article('Modules, Features & What Was Built',
      '_How the application is put together: which Oracle modules are installed, which Financials features are switched on, and the full artifact inventory._',
      [
        body('Part 1 — What is implemented'),
        section('1.1 Oracle EPBCS modules'),
        section('1.2 Financials features'),
        section('1.3 Artifact inventory'),
        integrationMap(),
      ]),
  },
  {
    file: '03-cube-data-flow.md',
    md: article('Cube Data Flow',
      '_The internal plumbing — how data is copied from the planning cubes into the reporting cubes via data maps (Smart Push)._',
      [
        section('1.4 Data maps', cubeFlowMap()),
      ]),
  },
  {
    file: '04-dimensions-and-data.md',
    md: article('Dimensions & Where the Data Lives',
      '_Are the dimensions healthy or oversized, and where does the real data actually sit — history, or forward plan?_',
      [
        section('1.5 Dimension profile', dimensionChart()),
        section('1.6 Where the data actually lives', dataLivesChart() + '\n\n' + scenarioMixChart()),
      ]),
  },
  {
    file: '05-revenue-vs-income.md',
    md: article('Revenue vs Income — Why They May Not Reconcile',
      '_Why `Total Revenue` (Revenue module) may not tie to `Income` (Financials). The structural reasons — from the metadata, rules and integration — are below, as suggested findings to validate with your team._',
      [
        section('1.7 Revenue-to-Financials lineage', revenueLineageMap()),
        section('3.4 Why'),
      ],
      '<!--env section=report category="Revenue vs Income Reconciliation"-->'),
  },
  {
    file: '06-whats-used-people-rules.md',
    md: article("What's Actually Used — People & Rules",
      '_The 180-day application audit records every rule execution and data change. This is what it shows about who uses the application and how the numbers get in._',
      [
        body('Part 2 — What is actually used (last 180 days)'),
        section('2.1 Users', usersChart()),
        section('2.2 Business rules', rulesAndEntryChart() + '\n\n' + calcAndInventory()),
        section('2.3 Data entry'),
      ]),
  },
  {
    file: '07-whats-used-modules-forms.md',
    md: article("What's Actually Used — Modules & Forms",
      '_Module-by-module activity, and the working data-entry screens users are actually pointed to in the two navigation flows._',
      [
        section('2.4 Module activity timeline'),
        section('2.5 Main forms', formsToRules()),
      ]),
  },
  {
    file: '08-configuration-health.md',
    md: article('Configuration Health & Half-Built Pieces',
      '_Stale settings, cubes that were built but never loaded, and capacity context — the housekeeping layer._',
      [
        section('3.1 Substitution variables', planningTimeline()),
        section('3.2 Built but empty'),
        section('3.3 Capacity'),
      ]),
  },
  {
    file: '09-suggested-changes.md',
    md: article('Suggested Changes & the Decision Board',
      '_Everything in this assessment, distilled into a prioritized set of suggested changes and a keep / start-using / remove board — to review and validate with your team._',
      [
        body('Part 4 — Suggested changes & next steps'),
        section('4.1 Suggested changes'),
        boardBlock,
        section('4.3 What we could analyze next'),
      ]),
  },
].filter(a => a.md);  // drop articles with no content for this client

// ── write ────────────────────────────────────────────────────────────
const outDir = anon ? path.join(ROOT, 'clients', '_demo', 'env-docs') : path.join(dir, 'env-docs');
fs.mkdirSync(outDir, { recursive: true });
// clear old generated files
for (const f of fs.readdirSync(outDir)) if (/^\d\d-.*\.md$/.test(f)) fs.unlinkSync(path.join(outDir, f));

// Optional extra literal scrubs beyond the client name (e.g. an app-code prefix
// that could identify the tenant): DEMO_SCRUB="PAI_=>NW_;OtherCode=>Demo".
const extraScrub = (process.env.DEMO_SCRUB || '').split(';').map(p => p.split('=>')).filter(x => x[0]);
let total = 0;
for (const a of ARTICLES) {
  const p = path.join(outDir, a.file);
  let outMd = a.md;
  if (anon) { outMd = anon.scrubText(outMd); for (const [from, to] of extraScrub) outMd = outMd.split(from).join(to || ''); }
  fs.writeFileSync(p, outMd, 'utf8');
  total += outMd.length;
  console.log(`  ✓ ${a.file.padEnd(34)} ${(outMd.length / 1024).toFixed(1)} KB`);
}
const where = anon ? `clients/_demo/env-docs/  (ANONYMIZED as "${anon.DEMO}")` : `clients/${CLIENT}/env-docs/`;
console.log(`\n✅ ${ARTICLES.length} env-docs articles written to ${where}  (${(total / 1024).toFixed(0)} KB total, ${VER})`);
