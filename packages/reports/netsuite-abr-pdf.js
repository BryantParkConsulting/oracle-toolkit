#!/usr/bin/env node
'use strict';
/**
 * netsuite-abr-pdf.js — Account Business Review de una cuenta NetSuite, en PDF
 * con la marca BPC. USO INTERNO (GSA), no entregable de cliente.
 *
 * Lee todo lo que produjo el pipeline y no consulta NetSuite:
 *   netsuite/{probe,fields,pnl}.json  ·  erp/{modules,connectors,vertical}.json
 *
 * Requiere Chrome/Edge con --remote-debugging-port=9222 (igual que el resto de
 * los generadores del toolkit).
 *
 *   CLIENT=pra node packages/reports/netsuite-abr-pdf.js
 */
const fs = require('fs');
const path = require('path');

const PORT = process.env.CDP_PORT || 9222;
const CLIENT = process.env.CLIENT || 'pra';
const ROOT = path.join(__dirname, '..', '..');
const DIR = path.join(ROOT, 'clients', CLIENT);
const NAME = (process.env.CLIENT_NAME || CLIENT).toUpperCase();

const rd = p => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };
const b64 = f => { try { return fs.readFileSync(path.join(ROOT, 'assets', f), 'utf8').trim(); } catch { return ''; } };

const probe = rd(path.join(DIR, 'netsuite', 'probe.json'));
const fields = rd(path.join(DIR, 'netsuite', 'fields.json'));
const pnl = rd(path.join(DIR, 'netsuite', 'pnl.json')) || [];
const mods = rd(path.join(DIR, 'erp', 'modules.json'));
const conn = rd(path.join(DIR, 'erp', 'connectors.json'));
const vert = rd(path.join(DIR, 'erp', 'vertical.json'));
if (!probe || !mods) { console.error(`Faltan datos en ${DIR}. Corré el pipeline primero.`); process.exit(1); }

// ── tokens BPC ───────────────────────────────────────────────────────────────
const NAVY = '#1F3C51', SAGE = '#619C8A', GOLD = '#F2CC5F', ORANGE = '#EC8842', DANGER = '#C9512E', GRAY = '#D9D9D9';
const STATE_COLOR = { active: SAGE, partial: GOLD, dormant: ORANGE, absent: '#9aa3ab', unknown: '#c3cad1' };
const STATE_ES = { active: 'In use', partial: 'Partial use', dormant: 'Not used', absent: 'Not enabled', unknown: 'Not visible' };

const T = {}; for (const t of Object.values(probe.modules)) Object.assign(T, t);
const n = k => (T[k]?.exists ? Number(T[k].rows ?? 0) : 0);
const fmt = x => Number(x || 0).toLocaleString('en-US');
const money = x => '$' + (Math.abs(Number(x)) / 1e6).toFixed(1) + 'M';
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ── P&L por año ──────────────────────────────────────────────────────────────
const years = {};
for (const r of pnl) {
  const y = r.anio; if (!y) continue;
  years[y] ||= { rev: 0, cogs: 0, opex: 0 };
  const m = Number(r.monto || 0);
  if (r.tipo === 'Income' || r.tipo === 'OthIncome') years[y].rev += -m;
  else if (r.tipo === 'COGS') years[y].cogs += m;
  else years[y].opex += m;
}
const yr = Object.keys(years).sort();
const maxRev = Math.max(...yr.map(y => years[y].rev), 1);

// ── gráfico de barras del P&L ────────────────────────────────────────────────
function pnlChart() {
  const W = 700, H = 200, pad = 28, bw = (W - pad * 2) / yr.length;
  let s = `<svg viewBox="0 0 ${W} ${H}" width="100%">`;
  yr.forEach((y, i) => {
    const x = pad + i * bw, d = years[y];
    const h = v => Math.max(1, (v / maxRev) * (H - 60));
    const w = bw * 0.22;
    const base = H - 26;
    s += `<rect x="${x + bw * 0.10}" y="${base - h(d.rev)}" width="${w}" height="${h(d.rev)}" fill="${NAVY}" rx="2"/>`;
    s += `<rect x="${x + bw * 0.36}" y="${base - h(d.cogs)}" width="${w}" height="${h(d.cogs)}" fill="${SAGE}" rx="2"/>`;
    s += `<rect x="${x + bw * 0.62}" y="${base - h(d.opex)}" width="${w}" height="${h(d.opex)}" fill="${GOLD}" rx="2"/>`;
    s += `<text x="${x + bw / 2}" y="${base + 13}" font-size="9" text-anchor="middle" fill="#6b7280">${y}${y === '2026' ? ' *' : ''}</text>`;
    s += `<text x="${x + bw * 0.10 + w / 2}" y="${base - h(d.rev) - 4}" font-size="8" text-anchor="middle" fill="${NAVY}" font-weight="600">${money(d.rev)}</text>`;
  });
  const lg = [['Revenue', NAVY], ['COGS', SAGE], ['Opex', GOLD]];
  let lx = pad;
  s += lg.map(([t, c]) => { const g = `<rect x="${lx}" y="4" width="9" height="9" rx="2" fill="${c}"/><text x="${lx + 13}" y="12" font-size="8.5" fill="#434343">${t}</text>`; lx += 26 + t.length * 5.6; return g; }).join('');
  return s + '</svg>';
}

// ── barras de estado de módulos ──────────────────────────────────────────────
function stateBar() {
  const c = mods.stateCounts, total = mods.modules.length;
  const order = ['active', 'partial', 'dormant', 'absent', 'unknown'];
  let x = 0, s = `<svg viewBox="0 0 700 34" width="100%">`;
  for (const k of order) {
    const v = c[k] || 0; if (!v) continue;
    const w = (v / total) * 700;
    s += `<rect x="${x}" y="0" width="${w - 1.5}" height="16" fill="${STATE_COLOR[k]}" rx="2"/>`;
    if (w > 46) s += `<text x="${x + w / 2}" y="30" font-size="8.5" text-anchor="middle" fill="#434343">${STATE_ES[k]} ${v}</text>`;
    x += w;
  }
  return s + '</svg>';
}

const V = vert?.vertical, B = vert?.benchmark;
const competing = (conn?.competingTooling || []);
const deadFields = fields ? (() => {
  const across = {}; for (const d of Object.values(fields)) for (const [f, v] of Object.entries(d.fields || {})) { if (v.error) continue; (across[f] ||= 0); across[f] += Number(v.filled || 0); }
  const all = Object.keys(across); return { dead: all.filter(f => !across[f]).length, total: all.length };
})() : null;

const byId = Object.fromEntries(mods.modules.map(m => [m.id, m]));
const sorted = [...mods.modules].sort((a, b) => ['active', 'partial', 'dormant', 'absent', 'unknown'].indexOf(a.state) - ['active', 'partial', 'dormant', 'absent', 'unknown'].indexOf(b.state));

// ── HTML ─────────────────────────────────────────────────────────────────────
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<style>
@page { size: A4; margin: 14mm 13mm; }
* { box-sizing: border-box; }
body { font-family: Sarabun, "Segoe UI", system-ui, sans-serif; color:#333; font-size:9.6pt; line-height:1.5; margin:0; }
h1,h2,h3 { color:${NAVY}; margin:0 0 6px; }
h2 { font-size:14pt; border-bottom:2px solid ${SAGE}; padding-bottom:4px; margin-top:20px; }
h3 { font-size:11pt; margin-top:14px; }
.page-break { page-break-before: always; }
.cover { height:262mm; display:flex; flex-direction:column; justify-content:space-between;
         background:linear-gradient(150deg, ${NAVY} 0%, #16303f 100%); color:#fff; margin:-14mm -13mm; padding:22mm 18mm; }
.cover h1 { color:#fff; font-size:30pt; line-height:1.15; margin:0 0 10px; }
.cover .sub { color:${GOLD}; font-size:13pt; font-weight:600; }
.badge { display:inline-block; background:${SAGE}; color:#fff; font-size:8.5pt; font-weight:700;
         padding:3px 10px; border-radius:3px; letter-spacing:.06em; }
/* El logo de BPC es navy: sobre la portada navy desaparece. Se invierte a blanco. */
.logo { height:34px; filter: brightness(0) invert(1); }
table { width:100%; border-collapse:collapse; font-size:8.8pt; margin:8px 0; }
th { background:${NAVY}; color:#fff; text-align:left; padding:5px 7px; font-weight:600; }
td { padding:4px 7px; border-bottom:1px solid #eceff1; vertical-align:top; }
tr:nth-child(even) td { background:#fafbfc; }
.num { text-align:right; font-variant-numeric:tabular-nums; }
.pill { display:inline-block; padding:1px 7px; border-radius:9px; font-size:7.8pt; color:#fff; font-weight:600; }
.kpi { display:flex; gap:9px; margin:10px 0; }
.kpi div { flex:1; background:#f6f8f9; border-left:3px solid ${SAGE}; padding:8px 10px; }
.kpi .v { font-size:16pt; font-weight:700; color:${NAVY}; line-height:1.1; }
.kpi .l { font-size:7.8pt; color:#6b7280; }
.flag { background:#fdf3ee; border-left:3px solid ${ORANGE}; padding:8px 11px; margin:7px 0; font-size:9pt; }
.note { background:#f4f7f6; border-left:3px solid ${SAGE}; padding:8px 11px; margin:7px 0; font-size:8.7pt; }
.warn { background:#fbeeea; border-left:3px solid ${DANGER}; padding:8px 11px; margin:7px 0; font-size:8.7pt; }
.small { font-size:8pt; color:#6b7280; }
ul { margin:5px 0 5px 16px; padding:0; } li { margin:3px 0; }
</style></head><body>

<div class="cover">
  <div>${b64('bpc-logo.b64') ? `<img class="logo" src="data:image/png;base64,${b64('bpc-logo.b64')}">` : `<div style="font-size:15pt;font-weight:700;color:#fff">BPC</div>`}</div>
  <div>
    <div class="badge">PREPARED BY BPC</div>
    <h1 style="margin-top:16px">${esc(NAME)}</h1>
    <div class="sub">NetSuite Account Business Review</div>
    <div style="margin-top:22px;font-size:10pt;opacity:.85;max-width:120mm">
      ${V ? esc(V.name) : 'Micro-vertical not determined'} · cuenta <b>${esc(probe.account)}</b><br>
      ${fmt(n('transaction'))} transactions · ${fmt(n('transactionline'))} lines · ${fmt(n('account'))} accounts
    </div>
  </div>
  <div style="font-size:8.5pt;opacity:.7">
    Generated ${new Date().toISOString().slice(0, 10)} · automated analysis over SuiteQL / REST<br>
    Everything prescriptive here is a <b>suggested change to validate together</b>, not a closed diagnosis.
  </div>
</div>

<div class="page-break"></div>
<h2>1. Summary</h2>

<div class="kpi">
  <div><div class="v">${yr.length ? money(years[yr[yr.length - 2]]?.rev || 0) : '—'}</div><div class="l">Revenue ${yr[yr.length - 2] || ''}</div></div>
  <div><div class="v">${fmt(n('job'))}</div><div class="l">Projects / events</div></div>
  <div><div class="v">${mods.stateCounts.active || 0}/${mods.modules.length}</div><div class="l">Modules in use</div></div>
  <div><div class="v">${conn?.integrations?.length || 0}</div><div class="l">Connected applications</div></div>
</div>

${V ? `<div class="note"><b>Micro-vertical: ${esc(V.name)}</b> (confidence: ${esc(V.confidence)}).<br>
${esc(V.note)}<br><span class="small">Derived from the vocabulary in your own account: ${V.evidence.slice(0, 6).map(e => esc(e.replace(/`/g, ''))).join(' · ')}. <b>Worth confirming.</b></span></div>` : ''}

<h3>Key observations</h3>
${(B?.redFlags || []).map(f => `<div class="flag">${esc(f)}</div>`).join('')}
${byId['nspb-connector']?.state === 'active' && byId['native-budgets']?.state === 'active'
    ? `<div class="warn"><b>Two parallel sources of truth for the budget.</b> The NSPB connector bundle is installed, and at the same time budgets continue to be loaded natively into NetSuite (${esc(byId['native-budgets'].evidence)}). Worth agreeing which one is intended to be authoritative — running both tends to cost reconciliation effort every cycle.</div>` : ''}

<h2>2. Scale and results</h2>
${pnlChart()}
<table><tr><th>Year</th><th class="num">Revenue</th><th class="num">COGS</th><th class="num">Opex</th><th class="num">Gross margin</th><th class="num">Result</th></tr>
${yr.map(y => { const d = years[y]; const gm = d.rev ? (100 * (d.rev - d.cogs) / d.rev) : 0; const res = d.rev - d.cogs - d.opex;
  return `<tr><td>${y}${y === '2026' ? ' *' : ''}</td><td class="num">${money(d.rev)}</td><td class="num">${money(d.cogs)}</td><td class="num">${money(d.opex)}</td><td class="num">${gm.toFixed(0)}%</td><td class="num" style="color:${res < 0 ? DANGER : '#333'}">${money(res)}</td></tr>`; }).join('')}
</table>
<p class="small">* ${yr[yr.length - 1]} is a partial year. Figures come from the GL with <code>posting='T'</code>; these are not audited financial statements.</p>
${B?.keyMetric ? `<div class="note"><b>The metric that matters most in this niche:</b> ${esc(B.keyMetric)}</div>` : ''}

<div class="page-break"></div>
<h2>3. What is enabled and what is actually used</h2>
${stateBar()}
<table><tr><th>Module</th><th>Status</th><th>Evidence</th></tr>
${sorted.map(m => `<tr><td>${esc(m.name)}</td><td><span class="pill" style="background:${STATE_COLOR[m.state]}">${STATE_ES[m.state]}</span></td><td>${esc(String(m.evidence).slice(0, 95))}</td></tr>`).join('')}
</table>
<p class="small"><b>"Not visible" does not mean "not there".</b> SuiteQL only exposes a record type when the feature is enabled <i>and</i> the integration role can see it. Those ${mods.stateCounts.unknown || 0} modules need an SDF export or the Enable Features screen to be resolved either way — we have deliberately not guessed.</p>

<h2>4. Connected ecosystem</h2>
<table><tr><th>Application</th><th class="num">Tokens</th><th class="num">Active</th><th>Since</th></tr>
${(conn?.integrations || []).slice(0, 12).map(i => `<tr><td>${esc(i.app)}</td><td class="num">${i.tokens}</td><td class="num">${i.activos}</td><td>${esc(i.desde)}</td></tr>`).join('')}
</table>
${competing.length ? `<div class="note"><b>Systems that already cover adjacent ground.</b> These are worth mapping before any new scope is considered, so that nothing is duplicated. Note that an active token tells us a connection exists — not how heavily it is used.
<ul>${competing.map(c => `<li><b>${esc(c.app)}</b> (${esc(c.competing.area)}, since ${esc(c.desde)}) — ${esc(c.competing.impacto)}</li>`).join('')}</ul></div>` : ''}
${(B?.missingSuiteApps || []).length ? `<h3>Industry SuiteApps not currently installed</h3><ul>${B.missingSuiteApps.map(a => `<li><b>${esc(a.name)}</b> — ${esc(a.what)}</li>`).join('')}</ul>` : ''}

<div class="page-break"></div>
<h2>5. Configuration debt</h2>
<table>
<tr><th>Finding</th><th class="num">Figure</th><th>What it means</th></tr>
<tr><td>Custom fields with no value ever populated</td><td class="num">${deadFields ? `${deadFields.dead} / ${deadFields.total}` : '—'}</td><td>Candidates to retire. Before removing any, worth confirming none is written by a script or a low-frequency integration.</td></tr>
<tr><td>Accounts with no journal activity</td><td class="num">${fmt((rd(path.join(DIR, 'netsuite', 'shape.json'))?.accounts_unused || []).length)} / ${fmt(n('account'))}</td><td>These inflate the Account dimension if carried into a planning model.</td></tr>
<tr><td>Custom records / lists</td><td class="num">${fmt(n('customrecordtype'))} / ${fmt(n('customlist'))}</td><td>Ongoing maintenance surface.</td></tr>
<tr><td>Scripts / deployments</td><td class="num">${fmt(n('script'))} / ${fmt(n('scriptdeployment'))}</td><td>Live customization to account for in any upgrade.</td></tr>
</table>

<h2>6. Suggested next steps</h2>
${gaps().map((g, i) => `<div class="flag"><b>${i + 1}. ${esc(g.t)}</b><br>${esc(g.d)}</div>`).join('')}

<h2>7. What this analysis could not see</h2>
<ul>
<li><b>${mods.stateCounts.unknown || 0} modules we could not determine</b> — resolvable with <code>suitecloud object:import</code> or the Enable Features screen.</li>
<li><b>Close effort</b> — SuiteQL cannot tell us how long the close takes or how many reconciliations live in spreadsheets. That has to be discussed.</li>
<li><b>The Planning side</b> — without an NSPB LCM export we cannot assess the state of the Planning implementation already in place.</li>
<li><b>Integrations not using TBA</b> — OAuth 2.0, SOAP with user credentials and SuiteAnalytics Connect do not appear in the token inventory, so the ecosystem may be broader than shown.</li>
</ul>

<div class="note" style="margin-top:16px"><b>About this document.</b> Generated automatically from your NetSuite account over SuiteQL / REST. Every figure comes from a query — none is estimated. The industry benchmark draws on public sources (SuiteSuccess and Oracle's module catalog) rather than a proprietary base of comparable accounts, so it is meant to frame the discussion rather than settle it.</div>

</body></html>`;

// Recomendaciones derivadas de lo medido, no de un template fijo.
function gaps() {
  const g = [];
  if (byId['projects']?.state === 'partial' && n('projecttask') === 0)
    g.push({ t: 'Enable PSA on the existing projects', d: `There are ${fmt(n('job'))} projects but project tasks and time-to-charge are at zero. Without them there is no per-project margin — and in a pass-through model that is the metric that matters most. This is the highest-return change we see in the analysis.` });
  if (byId['nspb-connector']?.state === 'active' && byId['native-budgets']?.state === 'active')
    g.push({ t: 'Revisit the Planning (NSPB) rollout', d: 'The connector is installed while budgets are still loaded natively. Before considering any new scope, it is worth understanding what stalled adoption — in our experience that is usually model sizing or ownership rather than the product itself.' });
  for (const x of (vert?.gapsForVertical || []))
    if (x.id !== 'projects') g.push({ t: `Review ${x.name}`, d: `Current status: ${STATE_ES[x.state] || x.state}. ${x.evidence}. This is typically running at mature organizations in this niche.` });
  if (competing.length)
    g.push({ t: 'Map the overlap with the existing stack', d: `${competing.map(c => c.app).join(', ')} cover adjacent ground. Confirming what each one actually handles today will avoid duplicated capability in anything that follows.` });
  return g;
}

// ── render vía CDP ───────────────────────────────────────────────────────────
const htmlFile = path.join(DIR, `${CLIENT}-netsuite-abr.html`);
const pdfFile = path.join(DIR, `${CLIENT}-netsuite-abr.pdf`);
fs.writeFileSync(htmlFile, html);

const httpJson = async p => (await fetch(`http://127.0.0.1:${PORT}${p}`)).json();
function wsCall(wsUrl, fn) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl); let id = 0; const pend = new Map(); const evs = [];
    const send = (m, p) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p || {} })); });
    ws.onmessage = e => { const d = JSON.parse(e.data); if (d.id && pend.has(d.id)) { const q = pend.get(d.id); pend.delete(d.id); d.error ? q.rej(new Error(d.error.message)) : q.res(d.result); } else if (d.method) evs.push(d); };
    ws.onopen = async () => { try { resolve(await fn(send, evs)); } catch (e) { reject(e); } finally { ws.close(); } };
    ws.onerror = () => reject(new Error(`CDP no responde en :${PORT} — levantá el Chrome con --remote-debugging-port=${PORT}`));
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
      await new Promise(r => setTimeout(r, 500));
      const { data } = await s2('Page.printToPDF', { printBackground: true, preferCSSPageSize: true });
      fs.writeFileSync(pdfFile, Buffer.from(data, 'base64'));
    });
    await send('Target.closeTarget', { targetId });
  });
  console.log(`✓ ${pdfFile} (${(fs.statSync(pdfFile).size / 1024).toFixed(0)} KB)`);
})().catch(e => { console.error('PDF ERROR:', e.message); console.error(`   HTML igual quedó en ${htmlFile}`); process.exit(1); });
