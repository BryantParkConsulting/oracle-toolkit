'use strict';
// Spindrift NSPB Enhancement — Scope Definition PDF
// Usage: node tools/scope-definition-pdf.js
// Reads: clients/spindrift/tenant-kb.json  +  the raw Item.csv (for real hierarchy)
// Writes: clients/spindrift/scope-definition.html + .pdf

const fs   = require('fs');
const path = require('path');
const PORT = process.env.CDP_PORT || 9222;
const ROOT = path.join(__dirname, '..', '..');
const CLIENT = 'spindrift';
const dir  = path.join(ROOT, 'clients', CLIENT);

// ── BPC palette ──────────────────────────────────────────────────────
const NAVY = '#1F3C51', SAGE = '#619C8A', GOLD = '#F2CC5F', ORANGE = '#EC8842', DANGER = '#C9512E', GRAY = '#D9D9D9';
const INK = '#374151', SUB = '#6b7280';

// ── assets (same shell as report-to-pdf.js) ──────────────────────────
const b64 = (cache, def) => {
  if (fs.existsSync(cache)) return fs.readFileSync(cache, 'utf8');
  if (fs.existsSync(def))   return fs.readFileSync(def).toString('base64');
  return '';
};
const LOGO_B64    = b64(path.join(dir, '.logo.b64'),    path.join(ROOT, 'desgincode', 'assets', 'logo', 'bpc-logo.png'));
const HERO_B64    = b64(path.join(dir, '.hero.b64'),    path.join(ROOT, 'desgincode', 'assets', 'backgrounds', 'hero-shoppers.png'));
const CIRCLES_B64 = b64(path.join(dir, '.circles.b64'), path.join(ROOT, 'desgincode', 'assets', 'patterns', 'circles-pattern.png'));

// ── KB stats (evidence of the LCM analysis) ──────────────────────────
const kb = JSON.parse(fs.readFileSync(path.join(dir, 'tenant-kb.json'), 'utf8'));
const STAT = {
  forms:        kb.forms.length,
  dashboards:   kb.dashboards.length,
  rules:        kb.rules.length,
  dims:         Object.keys(kb.dimensions).length,
  dimMembers:   Object.values(kb.dimensions).reduce((s, a) => s + a.length, 0),
  items:        (kb.dimensions['Item'] || []).length,
  relationships:(kb.dimensions['Relationship'] || []).length,
  integrations: kb.fdmee.integrations.length,
  subVars:      kb.substitutionVariables.length,
  finReports:   (kb.financialReports || []).length,
};

// ── Real Item hierarchy + platform distribution (parsed from Item.csv) ─
function analyzeItems() {
  const csvPath = path.join(dir, 'HP-NetSuite', 'resource', 'Cube', 'Plan', 'Standard Dimensions', 'Item.csv');
  const raw = fs.readFileSync(csvPath, 'utf8').replace(/^﻿/, '');
  const sep = raw.indexOf('#--!\n');
  const csv = sep !== -1 ? raw.substring(sep + 5) : raw;
  const lines = csv.split(/\r?\n/).filter(l => l.trim());
  const cols = l => { const r = []; let c = '', q = false; for (let i = 0; i < l.length; i++) { const ch = l[i]; if (ch === '"') { if (q && l[i + 1] === '"') { c += '"'; i++; } else q = !q; } else if (ch === ',' && !q) { r.push(c); c = ''; } else c += ch; } r.push(c); return r; };
  const rows = lines.slice(1).map(cols);
  const childrenOf = {};
  rows.forEach(r => { const p = (r[1] || '').trim(); (childrenOf[p] = childrenOf[p] || []).push((r[0] || '').trim()); });
  const isLeaf = n => !childrenOf[n];
  const leaves = rows.filter(r => isLeaf((r[0] || '').trim()));
  const buckets = { Water: 0, Soda: 0, Tea: 0, Spiked: 0, Other: 0 };
  leaves.forEach(r => {
    const a = (r[2] || '').trim();
    const m = a.match(/^\d-(\d)(\d{3})-/);
    if (m) { const d = m[1]; if (d === '4' || d === '5') buckets.Water++; else if (d === '6') buckets.Spiked++; else if (d === '7') buckets.Soda++; else if (d === '8') buckets.Tea++; else buckets.Other++; }
    else buckets.Other++;
  });
  return { leaves: leaves.length, buckets };
}
const ITEMS = analyzeItems();

// Class (channel) members — drives the indirect-COGS diagram
const CHANNELS = (kb.dimensions['Class'] || [])
  .filter(m => m.alias && !/total|undefined|no class/i.test(m.alias))
  .map(m => m.alias);

// ── Scope items ──────────────────────────────────────────────────────
const SCOPE = [
  { id: '1', phase: 'P1', title: 'Platform Members — Aggregators + Level-0 Inputs', hours: 8, cx: 'Medium',
    forms: 'Item dimension · Product Sales Revenue · Summary Sales by Item',
    body: `Add <b>two sets</b> of members to the Item dimension: (1) four <b>platform aggregators</b> — Sparkling Water, Tea, Soda, Spiked — that roll the existing SKUs up for reporting; and (2) four <b>level-0 assumption members</b> (one per platform, flagged non-aggregating with a "~" operator) where the team types the platform-level %. In Essbase an aggregator can't take direct input — consolidation overwrites it — so the dedicated input members are required (in the call we called these the "not-a-real-one / undefined item" members). All ${ITEMS.leaves.toLocaleString()} leaf SKUs are shared via an alternate hierarchy, so each SKU's primary parent is untouched.`,
    auto: true },
  { id: '2', phase: 'P1', title: 'Automatic SKU → Platform Classification (from NetSuite)', hours: 6, cx: 'Medium–High',
    forms: 'Saved search customsearch_nspb_sync_item_pf · integration "Item_NetSuite - Custom" (MD_Item / MD_ItemPackType)',
    body: `New SKUs must classify themselves with <b>no manual step</b> — Spindrift's explicit ask: <i>"leverage what's coming out of NetSuite, like pack type … I don't want to manually add … every time we come up with a SKU."</i> We deliver it the same way pack type already works: <b>extend the existing item feed</b> — add a platform grouping to the saved search <b>customsearch_nspb_sync_item_pf</b> (deterministic from the item code — 4/5xxx&#8594;Water, 7xxx&#8594;Soda, 8xxx&#8594;Tea, 6xxx&#8594;Spiked) and load it through the existing <b>Item_NetSuite&nbsp;-&nbsp;Custom</b> integration alongside MD_ItemPackType, as an alternate (shared-member) rollup. Every metadata sync then self-classifies new SKUs. <b>This modifies the existing integration — it does not create a new one, and adds no new dimension.</b> (A future new platform, e.g. an energy line, is a one-time grouper add.)`,
    auto: true },
  { id: '3', phase: 'P1', title: 'Trade Spend Assumptions by Platform', hours: 8, cx: 'Medium–High',
    forms: 'Discount and Trade Spend Plan · Plan Discount Trade Spend Per Unit · Plan Trade Spends',
    body: `Enter a separate % <b>per platform</b> instead of one blended rate; a push-down rule spreads it to every SKU underneath — Spindrift's example: <i>"the Costco discount is 2% → push that to every single SKU."</i> Supports their existing <b>SmartView upload by platform</b>, with the forms available for fine-tuning. Tea can carry a different trade rate than Water without SKU-by-SKU entry.` },
  { id: '4', phase: 'P2', title: 'Indirect COGS Push-Down to SKU Level', hours: 8, cx: 'High',
    forms: 'Indirect COGS per Unit by customer · Plan Indirect COGS per unit · Indirect COGS Report · Gross Profit Report',
    body: `<b>Spindrift's stated priority 2.</b> Today indirect COGS lives only at the customer/channel level (${CHANNELS.length} channels). New allocation logic spreads it down to the SKU — weighted by sales units — so it rolls back up by platform and completes a full P&L by segment in Smart View. (Revenue &amp; direct COGS already work at SKU level today.)` },
  { id: '5', phase: 'P1', title: 'OpEx Form — Open Question (Q8)', hours: 2, cx: 'Low–Medium',
    forms: 'Plan Indirect-Opex Cost Per Unit · OpEx',
    body: `Answer and implement Q8 from the shared doc (OpEx form behaviour). Scoped as a minor enhancement consistent with the push-down pattern above. <b>Provisional at 2 hrs</b> — confirmed once Spindrift signs off on the Q8 answer; may rise if it needs the same platform push-down.` },
  { id: '6', phase: 'P1', title: 'Documentation & Upload Templates', hours: 2, cx: 'Low',
    forms: 'Trade upload template · member-structure guide',
    body: `Written guide for the new member structure, naming/assignment rules, and a standardized trade-spend upload template — directly addressing the maintainability risk raised in the call (logic being forgotten over time).` },
  { id: '7', phase: 'P1', title: 'DEV → PROD Testing & Promotion', hours: 2, cx: 'Low',
    forms: 'LCM export/import',
    body: `Build and validate entirely in DEV; promote to PROD via LCM once Spindrift approves. Production stays untouched until the FY27 planning cycle is ready to adopt the new structure.` },
];
const TOTAL = SCOPE.reduce((s, i) => s + i.hours, 0);
const P1 = SCOPE.filter(i => i.phase === 'P1').reduce((s, i) => s + i.hours, 0);
const P2 = SCOPE.filter(i => i.phase === 'P2').reduce((s, i) => s + i.hours, 0);
const REC_URL = 'https://us06web.zoom.us/rec/share/K1sYcIN6bvfg_81-NqUOjo1PZQPqK38oBV_uwtnsECqbmC3nWXuk1GqYZWgQCoMK.QQ80kzB5jykzD8On';
const DATE_STR = new Date('2026-06-24T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

// ── SVG helpers ──────────────────────────────────────────────────────
const box = (x, y, w, h, label, o = {}) => {
  const fill = o.fill || '#fff', stroke = o.stroke || NAVY, tc = o.tc || NAVY, fs2 = o.fs || 9.5, rx = o.rx ?? 4;
  const sub = o.sub ? `<text x="${x + w / 2}" y="${y + h / 2 + 9}" font-size="7.5" text-anchor="middle" fill="${o.subc || SUB}">${o.sub}</text>` : '';
  const dy = o.sub ? -2 : 3.3;
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="${o.sw || 1}"${o.dash ? ` stroke-dasharray="${o.dash}"` : ''}/>`
    + `<text x="${x + w / 2}" y="${y + h / 2 + dy}" font-size="${fs2}" font-weight="${o.fw || 600}" text-anchor="middle" fill="${tc}">${label}</text>${sub}`;
};
const line = (x1, y1, x2, y2, o = {}) => `<path d="M${x1} ${y1} L${x2} ${y2}" stroke="${o.stroke || GRAY}" stroke-width="${o.sw || 1.2}"${o.dash ? ` stroke-dasharray="${o.dash}"` : ''} fill="none"${o.arrow ? ' marker-end="url(#ar)"' : ''}/>`;
const elbow = (x1, y1, x2, y2, o = {}) => `<path d="M${x1} ${y1} V${(y1 + y2) / 2} H${x2} V${y2}" stroke="${o.stroke || GRAY}" stroke-width="${o.sw || 1.2}"${o.dash ? ` stroke-dasharray="${o.dash}"` : ''} fill="none"/>`;
const defs = `<defs><marker id="ar" markerWidth="7" markerHeight="7" refX="5.5" refY="3" orient="auto"><path d="M0 0 L6 3 L0 6 z" fill="${SAGE}"/></marker></defs>`;
const svg = (vbW, vbH, inner) => `<svg viewBox="0 0 ${vbW} ${vbH}" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:${vbW}px;display:block;margin:0 auto">${defs}${inner}</svg>`;

// Diagram 1 — current Item hierarchy (by item/pack type)
function svgCurrentTree() {
  let s = '';
  s += box(215, 6, 130, 26, 'TI · Total Item', { fill: NAVY, tc: '#fff', stroke: NAVY, sub: STAT.items.toLocaleString() + ' members', subc: 'rgba(255,255,255,.7)' });
  const l2 = [['Inventory Item', 18], ['Assembly', 158], ['Service', 298], ['Non-inventory', 438]];
  l2.forEach(([t, x]) => { s += elbow(280, 32, x + 52, 66, {}); s += box(x, 66, 104, 24, t, { fs: 8.5 }); });
  // level 3 under Inventory Item and Assembly
  const l3 = [['Merch (50)', 6, SAGE], ['No Pack Type (692)', 118, SAGE], ['~37 pack types', 250, ORANGE], ['e.g. 12oz-3-8pk', 366, ORANGE], ['…2-6pk Tea', 470, ORANGE]];
  l3.forEach(([t, x, c]) => { s += box(x, 112, c === SAGE ? 108 : 98, 22, t, { fs: 7.5, stroke: c, tc: c }); });
  s += elbow(70, 90, 60, 112, {}); s += elbow(70, 90, 172, 112, {});
  s += elbow(210, 90, 299, 112, {}); s += elbow(210, 90, 415, 112, {}); s += elbow(210, 90, 519, 112, {});
  s += `<text x="290" y="150" font-size="7.8" text-anchor="middle" fill="${DANGER}" font-weight="600">Platform (Water / Tea / Soda) is NOT a rollup here — it is buried inside the SKU code &amp; alias.</text>`;
  return svg(580, 158, s);
}

// Diagram 2 — proposed model: L0 input members -> push-down -> SKUs -> rollup -> aggregators
function svgProposedTree() {
  let s = '';
  s += box(170, 2, 240, 22, 'Item · Platform — alternate hierarchy', { fill: SAGE, tc: '#fff', stroke: SAGE, fs: 9 });
  // headers
  s += `<text x="76" y="40" font-size="8" font-weight="700" text-anchor="middle" fill="${ORANGE}">INPUT · level 0 (you type here)</text>`;
  s += `<text x="290" y="40" font-size="8" font-weight="700" text-anchor="middle" fill="${INK}">SHARED SKUs · level 0</text>`;
  s += `<text x="504" y="40" font-size="8" font-weight="700" text-anchor="middle" fill="${NAVY}">AGGREGATORS · rollup</text>`;
  const segs = [['Water %', 'Sparkling Water', ITEMS.buckets.Water], ['Tea %', 'Tea', ITEMS.buckets.Tea], ['Soda %', 'Soda', ITEMS.buckets.Soda], ['Spiked %', 'Spiked', ITEMS.buckets.Spiked]];
  const ys = [50, 80, 110, 140];
  // left = L0 input members (non-aggregating, dashed amber)
  segs.forEach(([t], i) => s += box(10, ys[i], 132, 24, t + '  (~)', { stroke: ORANGE, tc: ORANGE, fs: 8, dash: '4 3' }));
  // center = shared SKU pool
  s += box(228, 50, 124, 114, '', { fill: '#f9fafb', stroke: GRAY });
  s += `<text x="290" y="100" font-size="8.5" font-weight="600" text-anchor="middle" fill="${INK}">Leaf SKUs</text>`;
  s += `<text x="290" y="114" font-size="7.5" text-anchor="middle" fill="${SUB}">${ITEMS.leaves.toLocaleString()} · shared</text>`;
  s += `<text x="290" y="126" font-size="7.5" text-anchor="middle" fill="${SUB}">no duplication</text>`;
  // right = aggregators (solid navy/sage)
  segs.forEach(([, name, n], i) => s += box(438, ys[i], 134, 24, name, { stroke: SAGE, tc: NAVY, fs: 7.8, sub: n.toLocaleString() + ' SKUs', subc: SAGE }));
  // arrows: input -> SKU pool (push-down rule, dashed amber)
  segs.forEach((_, i) => s += line(142, ys[i] + 12, 228, 95, { stroke: ORANGE, dash: '4 3', arrow: true }));
  // arrows: SKU pool -> aggregators (rollup, solid sage)
  segs.forEach((_, i) => s += line(352, 95, 438, ys[i] + 12, { stroke: SAGE, arrow: true }));
  s += `<text x="185" y="180" font-size="7.6" text-anchor="middle" fill="${ORANGE}" font-weight="600">push-down rule writes %</text>`;
  s += `<text x="395" y="180" font-size="7.6" text-anchor="middle" fill="${SAGE}" font-weight="600">SKUs aggregate up</text>`;
  return svg(580, 188, s);
}

// Diagram 3 — SKU distribution by platform (horizontal bars)
function svgPlatformBars() {
  const data = [['Sparkling Water', ITEMS.buckets.Water, SAGE], ['Soda', ITEMS.buckets.Soda, ORANGE], ['Tea', ITEMS.buckets.Tea, GOLD], ['Spiked', ITEMS.buckets.Spiked, NAVY], ['Other / Merch', ITEMS.buckets.Other, GRAY]];
  const max = Math.max(...data.map(d => d[1])), x0 = 120, bw = 380, rh = 24;
  let s = '';
  data.forEach((d, i) => {
    const y = 6 + i * rh, w = Math.max(2, (d[1] / max) * bw);
    s += `<text x="112" y="${y + 13}" font-size="8.5" text-anchor="end" fill="${INK}">${d[0]}</text>`;
    s += `<rect x="${x0}" y="${y + 3}" width="${w}" height="14" rx="2" fill="${d[2]}"/>`;
    s += `<text x="${x0 + w + 5}" y="${y + 14}" font-size="8.5" font-weight="600" fill="${NAVY}">${d[1].toLocaleString()}</text>`;
  });
  return svg(560, 6 + data.length * rh + 4, s);
}

// Diagram 4 — trade spend: blended (before) vs per-platform push-down (after)
function svgTrade() {
  let s = '';
  // BEFORE
  s += `<text x="140" y="12" font-size="8.5" font-weight="700" text-anchor="middle" fill="${DANGER}">TODAY — blended</text>`;
  s += box(70, 22, 140, 24, 'All Sales (one pool)', { fs: 8.5 });
  s += line(140, 46, 140, 64, { arrow: true, stroke: SAGE });
  s += box(78, 64, 124, 22, '1 trade % for all', { stroke: DANGER, tc: DANGER, fs: 8.5 });
  s += line(140, 86, 140, 104, { arrow: true, stroke: SAGE });
  s += box(60, 104, 160, 22, 'Every SKU = same rate', { fill: '#fdf3ef', stroke: DANGER, tc: DANGER, fs: 8 });
  // divider
  s += line(290, 8, 290, 128, { stroke: GRAY, dash: '4 4' });
  // AFTER
  s += `<text x="430" y="12" font-size="8.5" font-weight="700" text-anchor="middle" fill="${SAGE}">PROPOSED — by platform</text>`;
  const rates = [['Water 18%', 304], ['Tea 12%', 392], ['Soda 15%', 480]];
  rates.forEach(([t, x]) => s += box(x, 22, 72, 24, t, { stroke: SAGE, tc: NAVY, fs: 8 }));
  rates.forEach(([, x]) => s += line(x + 36, 46, 430, 64, { arrow: true, stroke: SAGE }));
  s += box(348, 64, 164, 22, 'Auto push-down rule', { fill: '#f0f9f5', stroke: SAGE, tc: NAVY, fs: 8 });
  s += line(430, 86, 430, 104, { arrow: true, stroke: SAGE });
  s += box(350, 104, 160, 22, 'SKU inherits platform rate', { fill: '#f0f9f5', stroke: SAGE, tc: NAVY, fs: 7.5 });
  return svg(560, 134, s);
}

// Diagram 5 — indirect COGS push-down (channel -> SKU -> platform P&L)
function svgCogs() {
  let s = '';
  const ch = CHANNELS.slice(0, 6);
  s += `<text x="92" y="12" font-size="8.5" font-weight="700" text-anchor="middle" fill="${DANGER}">TODAY</text>`;
  s += box(20, 22, 150, 22, 'Indirect COGS', { fs: 8.5 });
  s += box(20, 50, 150, 22, 'at Channel level only', { stroke: DANGER, tc: DANGER, fs: 8 });
  s += `<text x="95" y="92" font-size="7.3" text-anchor="middle" fill="${SUB}">${ch.join(' · ')}</text>`;
  s += `<text x="95" y="104" font-size="7.3" text-anchor="middle" fill="${DANGER}">no item-level view</text>`;
  s += line(178, 60, 210, 60, { arrow: true, stroke: SAGE });
  // AFTER chain
  s += `<text x="400" y="12" font-size="8.5" font-weight="700" text-anchor="middle" fill="${SAGE}">PROPOSED</text>`;
  const chain = [['Channel COGS', 214], ['Split by sales units', 330], ['SKU-level COGS', 446]];
  chain.forEach(([t, x], i) => { s += box(x, 32, 110, 26, t, { stroke: SAGE, tc: NAVY, fs: 7.8, fill: '#f0f9f5' }); if (i < 2) s += line(x + 110, 45, x + 116, 45, { arrow: true, stroke: SAGE }); });
  s += line(501, 58, 501, 76, { arrow: true, stroke: SAGE });
  s += box(360, 76, 164, 24, 'Rolls up &#8594; Platform P&amp;L', { fill: NAVY, tc: '#fff', stroke: NAVY, fs: 8 });
  return svg(560, 108, s);
}

// Hours bar chart
function hoursChart() {
  const w = 540, h = 120, pad = 34;
  const max = Math.max(...SCOPE.map(i => i.hours));
  const gap = (w - pad * 2) / SCOPE.length, bw = gap * 0.52;
  let s = '';
  SCOPE.forEach((it, i) => {
    const bh = (it.hours / max) * (h - pad - 14);
    const x = pad + i * gap + (gap - bw) / 2, y = h - pad - bh;
    const col = it.phase === 'P2' ? DANGER : SAGE;
    s += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="2" fill="${col}"/>`;
    s += `<text x="${(x + bw / 2).toFixed(1)}" y="${(y - 3).toFixed(1)}" font-size="8.5" text-anchor="middle" fill="${INK}" font-weight="700">${it.hours}h</text>`;
    s += `<text x="${(x + bw / 2).toFixed(1)}" y="${h - pad + 12}" font-size="7.6" text-anchor="middle" fill="${SUB}">${it.id} · ${it.phase}</text>`;
  });
  return svg(w, h, s);
}

const cxBadge = c => { const bg = c.startsWith('High') ? DANGER : /Medium.High|Medium/.test(c) ? ORANGE : SAGE; return `<span style="background:${bg};color:#fff;font-size:7.5px;font-weight:600;padding:1px 7px;border-radius:9px;text-transform:uppercase;letter-spacing:.03em">${c}</span>`; };

const phaseTag = p => `<span class="phase-tag ${p === 'P2' ? 'p2' : ''}">Phase ${p === 'P2' ? '2' : '1'}</span>`;

function scopeCard(it) {
  return `<div class="scope-card">
    <div class="scope-head">
      <span class="scope-title">${phaseTag(it.phase)} ${it.id}. ${it.title}</span>
      <span class="scope-hrs">${it.hours} hrs ${cxBadge(it.cx)}${it.auto ? '<span class="auto-tag">automatic</span>' : ''}</span>
    </div>
    <div class="scope-body">
      <p class="scope-desc">${it.body}</p>
      <p class="scope-forms"><span class="ftag">NSPB artifacts</span> ${it.forms}</p>
    </div>
  </div>`;
}

const statCard = (num, lab) => `<div class="kstat"><div class="kn">${num}</div><div class="kl">${lab}</div></div>`;

// ── HTML ─────────────────────────────────────────────────────────────
const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700&display=swap" rel="stylesheet"/>
<style>
  @page { size: letter portrait; margin: 14mm 14mm 14mm 14mm; }
  * { box-sizing: border-box; }
  body { font-family:'Sarabun',sans-serif; font-size:10px; color:#111; margin:0; }
  p { margin:0 0 7px; }
  b { color:${NAVY}; font-weight:600; }
  /* cover — identical shell to report-to-pdf.js */
  .cover { position:relative; width:100vw; height:255mm; background:${NAVY}; color:#fff; overflow:hidden; page-break-after:always; margin:-14mm -14mm 0; padding:0; }
  .cover-photo { position:absolute; inset:0 0 0 50%; }
  .cover-photo img { width:100%; height:100%; object-fit:cover; filter:saturate(.65) contrast(1.05); }
  .cover-grad { position:absolute; inset:0; background:linear-gradient(90deg, ${NAVY} 0%, rgba(31,60,81,.55) 42%, rgba(31,60,81,.18) 100%); }
  .cover-circles { position:absolute; inset:0; background-position:center right; background-size:cover; background-repeat:no-repeat; mix-blend-mode:screen; opacity:.42; }
  .cover-top { position:absolute; top:20mm; left:18mm; font-size:12px; font-weight:500; display:flex; align-items:center; gap:8px; z-index:3; }
  .cover-top .dot { width:9px; height:9px; border-radius:50%; background:${GOLD}; }
  .cover-body { position:absolute; left:18mm; right:50%; top:70mm; z-index:3; }
  .cover-eyebrow { font-size:11px; font-weight:600; letter-spacing:.14em; text-transform:uppercase; color:${GOLD}; margin-bottom:14px; }
  .cover-title { font-family:'Sarabun'; font-weight:300; font-size:40px; line-height:1.08; letter-spacing:-.02em; color:#fff; margin:0; }
  .cover-rule { width:54px; height:3px; background:${GOLD}; margin:18px 0; }
  .cover-sub { font-size:12.5px; line-height:1.6; color:rgba(255,255,255,.8); max-width:330px; font-weight:300; margin:0 0 30px; }
  .cover-stats { display:flex; flex-wrap:wrap; gap:10px 26px; }
  .cstat { min-width:118px; }
  .cstat .cnum { font-family:'Sarabun'; font-weight:500; font-size:25px; color:${GOLD}; line-height:1; }
  .cstat .clab { font-size:9.5px; color:rgba(255,255,255,.72); margin-top:4px; }
  .cover-foot { position:absolute; bottom:18mm; left:18mm; right:18mm; display:flex; justify-content:space-between; font-size:9.5px; color:rgba(255,255,255,.6); z-index:3; }
  /* body */
  .brand { display:flex; align-items:center; gap:10px; margin-bottom:14px; }
  .brand img { height:26px; }
  .brand .eyebrow { font-size:9px; color:${SUB}; letter-spacing:.06em; text-transform:uppercase; }
  h1 { font-family:'Sarabun'; font-weight:600; font-size:17px; color:${NAVY}; margin:0 0 10px; border-bottom:2px solid ${SAGE}; padding-bottom:5px; }
  h2 { font-family:'Sarabun'; font-weight:600; font-size:12.5px; color:${NAVY}; margin:14px 0 7px; display:flex; align-items:center; gap:7px; }
  h2 .nm { background:${NAVY}; color:#fff; font-size:9px; width:17px; height:17px; border-radius:50%; display:inline-flex; align-items:center; justify-content:center; }
  h3 { font-size:10px; color:${NAVY}; margin:8px 0 4px; font-weight:600; }
  .lead { font-size:9.7px; line-height:1.6; color:${INK}; }
  .meta-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; margin:0 0 12px; }
  .meta-card { background:#f9fafb; border:1px solid ${GRAY}; border-radius:5px; padding:7px 10px; }
  .meta-card .label { font-size:8px; color:${SUB}; text-transform:uppercase; letter-spacing:.05em; }
  .meta-card .value { font-size:10.5px; font-weight:600; color:${NAVY}; margin-top:2px; }
  .rec-box { border:1px solid ${GOLD}; border-radius:5px; padding:8px 12px; margin:0 0 12px; font-size:9.3px; line-height:1.5; }
  .rec-box a { color:${SAGE}; word-break:break-all; }
  .kgrid { display:grid; grid-template-columns:repeat(6,1fr); gap:7px; margin:8px 0 4px; }
  .kstat { background:${NAVY}; border-radius:5px; padding:8px 4px; text-align:center; }
  .kstat .kn { font-family:'Sarabun'; font-weight:600; font-size:16px; color:${GOLD}; line-height:1; }
  .kstat .kl { font-size:7px; color:rgba(255,255,255,.75); margin-top:3px; letter-spacing:.02em; }
  .note { background:#f0f9f5; border-left:3px solid ${SAGE}; padding:8px 12px; margin:8px 0; font-size:9.3px; line-height:1.55; }
  .note.amber { background:#fdf6e8; border-left-color:${ORANGE}; }
  .fig { border:1px solid ${GRAY}; border-radius:6px; padding:10px 10px 6px; margin:8px 0; page-break-inside:avoid; }
  .fig-cap { font-size:8.3px; color:${SUB}; text-align:center; margin-top:5px; }
  .fig-title { font-size:9px; font-weight:600; color:${NAVY}; text-transform:uppercase; letter-spacing:.05em; margin-bottom:6px; }
  .two { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
  .hours-total { background:${NAVY}; color:#fff; border-radius:6px; padding:12px 16px; display:flex; justify-content:space-between; align-items:center; margin:6px 0 10px; }
  .hours-total .big { font-family:'Sarabun'; font-size:34px; font-weight:600; color:${GOLD}; line-height:1; }
  .hours-total .desc { font-size:9px; color:rgba(255,255,255,.75); max-width:340px; line-height:1.5; }
  .scope-card { border:1px solid ${GRAY}; border-radius:5px; overflow:hidden; margin-bottom:9px; page-break-inside:avoid; }
  .scope-head { background:${NAVY}; padding:7px 12px; display:flex; justify-content:space-between; align-items:center; }
  .scope-title { color:#fff; font-size:10px; font-weight:600; }
  .scope-hrs { color:${GOLD}; font-size:11px; font-weight:700; display:flex; align-items:center; gap:6px; }
  .auto-tag { background:${SAGE}; color:#fff; font-size:7px; font-weight:600; padding:1px 6px; border-radius:9px; text-transform:uppercase; }
  .phase-tag { background:rgba(255,255,255,.18); color:#fff; font-size:7px; font-weight:700; padding:1px 6px; border-radius:3px; letter-spacing:.03em; margin-right:5px; }
  .phase-tag.p2 { background:${DANGER}; }
  .scope-body { padding:8px 12px; }
  .scope-desc { font-size:9.2px; line-height:1.55; color:${INK}; margin:0 0 5px; }
  .scope-forms { font-size:8.2px; color:${SUB}; margin:0; }
  .ftag { background:#eef2f4; color:${NAVY}; font-size:7px; font-weight:600; padding:1px 6px; border-radius:3px; text-transform:uppercase; letter-spacing:.03em; }
  .timeline { display:flex; margin:6px 0; }
  .tl { flex:1; text-align:center; padding:7px 3px; border-top:3px solid ${SAGE}; }
  .tl .tll { font-size:8.3px; font-weight:600; color:${NAVY}; }
  .tl .tls { font-size:7.3px; color:${SUB}; margin-top:2px; }
  .footer { margin-top:14px; padding-top:7px; border-top:1px solid ${GRAY}; display:flex; justify-content:space-between; font-size:7.5px; color:#9ca3af; }
  .newpage { page-break-before:always; }
</style></head><body>

<section class="cover">
  <div class="cover-photo">${HERO_B64 ? `<img src="data:image/png;base64,${HERO_B64}"/>` : ''}<div class="cover-grad"></div>${CIRCLES_B64 ? `<div class="cover-circles" style="background-image:url('data:image/png;base64,${CIRCLES_B64}')"></div>` : ''}</div>
  <div class="cover-top"><span class="dot"></span>Bryant Park Consulting</div>
  <div class="cover-body">
    <div class="cover-eyebrow">Confidential · ${DATE_STR}</div>
    <h1 class="cover-title">NSPB Platform-Planning<br/>Enhancement</h1>
    <div class="cover-rule"></div>
    <p class="cover-sub">Spindrift Beverage Co. · Scope definition and estimated effort for planning the business by product platform — Sparkling Water, Tea &amp; Soda — inside the existing NSPB environment.</p>
    <div class="cover-stats">
      <div class="cstat"><div class="cnum">${TOTAL} hrs</div><div class="clab">total · ${P1}h Phase 1 + ${P2}h Phase 2</div></div>
      <div class="cstat"><div class="cnum">${SCOPE.length}</div><div class="clab">work items</div></div>
      <div class="cstat"><div class="cnum">0</div><div class="clab">new dimensions</div></div>
    </div>
  </div>
  <div class="cover-foot"><span>bryantparkconsulting.com</span><span>NetSuite Planning &amp; Budgeting</span></div>
</section>

<div class="brand">${LOGO_B64 ? `<img src="data:image/png;base64,${LOGO_B64}"/>` : `<b style="font-size:13px">Bryant Park Consulting</b>`}<span class="eyebrow">NSPB Enhancement · Spindrift Beverage Co. · Confidential</span></div>

<h1>Scope Definition — Platform Planning Enhancement</h1>

<div class="meta-grid">
  <div class="meta-card"><div class="label">Client</div><div class="value">Spindrift Beverage Co.</div></div>
  <div class="meta-card"><div class="label">Working Session</div><div class="value">June 18, 2026</div></div>
  <div class="meta-card"><div class="label">Prepared</div><div class="value">${DATE_STR}</div></div>
</div>

<div class="rec-box">&#127909; <b>Working-session recording (Jun 18):</b> <a href="${REC_URL}">${REC_URL}</a></div>

<p class="lead">Spindrift wants to plan and analyze the business by <b>product platform</b> — Sparkling Water, Tea, and Soda — rather than as one blended pool. As Tea grows faster than the other lines, a single set of trade-spend and indirect-COGS assumptions can no longer model segment profitability accurately. This document defines exactly what changes inside NSPB, backed by an analysis of Spindrift's live environment, and estimates the effort.</p>

<h2><span class="nm">A</span>How we analyzed the environment</h2>
<p class="lead">We parsed Spindrift's full NSPB application (LCM metadata export) offline — every form, rule, dimension and integration — and the real Item dimension, to scope this against the actual cube rather than assumptions:</p>
<div class="kgrid">
  ${statCard(STAT.forms, 'forms')}
  ${statCard(STAT.rules, 'calc rules')}
  ${statCard(STAT.dims, 'dimensions')}
  ${statCard(STAT.items.toLocaleString(), 'Item members')}
  ${statCard(STAT.integrations, 'FDMEE integrations')}
  ${statCard(STAT.finReports, 'reports')}
</div>

<h2><span class="nm">B</span>The requirement, against the real cube</h2>
<p class="lead">Today the Item dimension is organized by NetSuite <b>item type and pack type</b> (Inventory Item, Assembly, then pack configurations). The product platform a SKU belongs to is <b>not</b> a level you can roll up to — it only exists inside the SKU code and alias. So you can report a P&amp;L by pack type, but not cleanly by Sparkling Water vs Tea vs Soda.</p>

<div class="fig">
  <div class="fig-title">Figure 1 — Current Item hierarchy (as built)</div>
  ${svgCurrentTree()}
  <div class="fig-cap">Parsed from the live Item dimension: ${STAT.items.toLocaleString()} members under TI, grouped by item / pack type.</div>
</div>

<p class="lead">The platform <i>is</i> deterministically encoded — the SKU code prefix identifies it. Parsing all ${ITEMS.leaves.toLocaleString()} leaf SKUs gives the real split below, which is also what makes the grouping safe to automate:</p>
<div class="fig">
  <div class="fig-title">Figure 2 — Leaf SKUs by product platform (derived from SKU codes)</div>
  ${svgPlatformBars()}
  <div class="fig-cap">Sparkling Water is the dominant catalog; Tea &amp; Soda are smaller but growing — exactly why blended assumptions distort the picture.</div>
</div>

<h2 class="newpage"><span class="nm">C</span>Proposed solution</h2>
<p class="lead">Add the platform as an <b>alternate hierarchy</b> over the existing Item dimension — four aggregator parents that roll the <i>same</i> leaf SKUs up by platform. We <b>reuse the Item dimension</b> rather than build a new one (the costly path that would require reworking the integration, forms and calcs); nothing is duplicated, and leaf SKUs keep loading from NetSuite exactly as today.</p>

<div class="note amber">
  <b>What Spindrift asked for, in their words.</b> New SKUs should classify themselves — <i>"I don't want to manually add … every time we come up with a SKU … leverage what's coming out of NetSuite, like pack type."</i> Assumptions are entered <b>at the platform level</b> and pushed down — <i>"the Costco discount is 2% → push that to every single SKU."</i> The design below delivers both, automatically, without a new dimension.
</div>

<div class="note amber">
  <b>Key design point — two member types are required.</b> In Essbase/NSPB an <b>aggregator (parent) member cannot take direct input</b>: consolidation recomputes it from its children and overwrites anything typed in. So to let the team enter a <b>platform-level %</b>, each platform also needs a dedicated <b>level-0 input member</b> (flagged non-aggregating, "~") that holds the typed value. A push-down rule then writes that value into the SKUs, which roll back up through the aggregator. The aggregators are for <i>reporting</i>; the level-0 members are for <i>input</i>.
</div>

<div class="fig">
  <div class="fig-title">Figure 3 — Proposed model: input members, push-down, and rollup</div>
  ${svgProposedTree()}
  <div class="fig-cap">You type into the level-0 assumption members (left); a rule pushes the values into the shared SKUs (centre); the aggregators (right) sum the SKUs for the P&amp;L. Platform assignment is auto-derived from each SKU's code on every metadata sync (work item 2) — no manual step.</div>
</div>

<h3>Trade spend, driven by platform</h3>
<p class="lead">Trade assumptions move from one blended rate to a rate <b>per platform</b>, which a push-down rule spreads automatically to every SKU underneath — so Tea can carry a different trade % than Water without SKU-by-SKU entry.</p>
<div class="fig">
  <div class="fig-title">Figure 4 — Trade spend: blended today vs. platform-driven</div>
  ${svgTrade()}
  <div class="fig-cap">The platform % is typed into the level-0 input member (not the aggregator); the push-down rule applies it to every SKU. Rates shown are illustrative.</div>
</div>

<h3>Indirect COGS down to the SKU</h3>
<p class="lead">Indirect COGS is tracked only at the customer/channel level today (${CHANNELS.length} channels), so it can't appear in an item- or platform-level P&amp;L. New allocation logic spreads it to the SKU by sales-unit weight, then rolls it back up by platform.</p>
<div class="fig">
  <div class="fig-title">Figure 5 — Indirect COGS push-down to SKU &amp; platform</div>
  ${svgCogs()}
  <div class="fig-cap">Completes a full gross-margin P&amp;L by platform in Smart View — the end goal stated in the session.</div>
</div>

<div class="note">
  <b>What we touch — and what we don't.</b> We <b>reuse the Item dimension</b> (no new dimension) and <b>extend the existing item feed</b> rather than stand up a new integration. The LCM shows Item is loaded by the <b>Item_NetSuite&nbsp;-&nbsp;Custom</b> integration (Data Management) from the NetSuite saved search <b>customsearch_nspb_sync_item_pf</b>, via rules MD_Item / MD_ItemPackType. Platform is added to that <i>same</i> saved search and loaded through that <i>same</i> integration — exactly the pattern that already brings in pack type — so there is no second integration to maintain and none of the calc/forms rework a new dimension would force. <span style="color:${SUB}">(The saved-search change is small; BPC supplies the logic, applied in Spindrift's NetSuite.)</span>
</div>

<div class="note">
  <b>Where do new products go, and does it survive the loads? Both handled.</b> New SKUs <b>classify themselves automatically</b>: the platform grouping rides along on <b>customsearch_nspb_sync_item_pf</b> — the same saved search that already feeds the Item dimension — so every metadata sync places a new SKU under its platform with nothing added by hand. The load runs in <b>merge</b> mode (per-member operation blank/update across all ${STAT.items.toLocaleString()} members), so it adds/updates but <b>never deletes</b> the platform aggregators or level-0 input members. And because platform is an <b>alternate (shared-member) rollup</b>, each SKU's primary pack-type parent is left untouched — the existing load and the new platform rollup never collide.
</div>

<h2 class="newpage"><span class="nm">D</span>Scope &amp; estimated effort</h2>
<div class="hours-total">
  <div><div class="big">${TOTAL} hrs</div><div style="font-size:9px;color:rgba(255,255,255,.6);margin-top:3px">total estimated effort</div></div>
  <div class="desc"><b style="color:#fff">Phase 1 — ${P1} hrs:</b> platform members, automatic classification, trade spend, OpEx, docs &amp; promotion. <b style="color:#fff">Phase 2 — ${P2} hrs:</b> indirect-COGS push-down (Spindrift's priority 2). Net-new build in DEV, promoted to PROD — outside the MS retainer, covered by a separate project SOW.</div>
</div>
<div class="fig" style="padding-bottom:10px"><div class="fig-title">Effort by work item</div>${hoursChart()}</div>

${SCOPE.map(scopeCard).join('')}

<h2><span class="nm">E</span>Recommended sequence</h2>
<div class="timeline">
  <div class="tl"><div class="tll">Scope sign-off</div><div class="tls">SOW + Q8 answers</div></div>
  <div class="tl"><div class="tll">Phase 1 build</div><div class="tls">platform, auto-classify, trade</div></div>
  <div class="tl"><div class="tll">Client review</div><div class="tls">test in DEV</div></div>
  <div class="tl"><div class="tll">Phase 2 build</div><div class="tls">indirect COGS</div></div>
  <div class="tl"><div class="tll">PROD promotion</div><div class="tls">before FY27</div></div>
</div>
<p class="lead" style="font-size:9px;color:${SUB}">Production stays stable until the FY27 planning cycle is ready to adopt the new structure, per Spindrift's preference in the Jun 18 session.</p>

<div class="footer"><span>Bryant Park Consulting · Confidential — for Spindrift internal use only</span><span>Prepared ${DATE_STR}</span></div>

</body></html>`;

const htmlFile = path.join(dir, 'scope-definition.html');
fs.writeFileSync(htmlFile, html, 'utf8');
console.log('Wrote', htmlFile);

const pdfFile = path.join(dir, 'scope-definition.pdf');
const fileUrl = 'file:///' + htmlFile.replace(/\\/g, '/');
async function httpJson(p) { return (await fetch(`http://127.0.0.1:${PORT}${p}`)).json(); }
function wsCall(wsUrl, fn) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl); let id = 0; const pend = new Map(); const evs = [];
    const send = (m, p2) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p2 || {} })); });
    ws.onmessage = e => { const d = JSON.parse(e.data); if (d.id && pend.has(d.id)) { const q = pend.get(d.id); pend.delete(d.id); d.error ? q.rej(new Error(d.error.message)) : q.res(d.result); } else if (d.method) evs.push(d); };
    ws.onopen = async () => { try { resolve(await fn(send, evs)); } catch (e) { reject(e); } finally { ws.close(); } };
    ws.onerror = () => reject(new Error('CDP not reachable on :' + PORT + ' — launch Chrome with --remote-debugging-port=9222'));
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
      for (let k = 0; k < 40; k++) { await new Promise(r => setTimeout(r, 200)); if (evs.some(e => e.method === 'Page.loadEventFired')) break; }
      await new Promise(r => setTimeout(r, 600));
      const { data } = await s2('Page.printToPDF', { printBackground: true, preferCSSPageSize: true });
      fs.writeFileSync(pdfFile, Buffer.from(data, 'base64'));
    });
    await send('Target.closeTarget', { targetId });
  });
  console.log('PDF:', pdfFile, `(${(fs.statSync(pdfFile).size / 1024).toFixed(0)} KB)`);
})().catch(e => { console.error('PDF generation failed:', e.message); console.log('HTML ready at', htmlFile); process.exit(1); });
