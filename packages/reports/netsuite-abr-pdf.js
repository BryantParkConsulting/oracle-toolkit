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
const STATE_ES = { active: 'En uso', partial: 'Uso parcial', dormant: 'Sin uso', absent: 'No habilitado', unknown: 'No visible' };

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
const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
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
.badge { display:inline-block; background:${DANGER}; color:#fff; font-size:8.5pt; font-weight:700;
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
    <div class="badge">INTERNO · BETA — NO ENVIAR AL CLIENTE</div>
    <h1 style="margin-top:16px">${esc(NAME)}</h1>
    <div class="sub">NetSuite Account Business Review</div>
    <div style="margin-top:22px;font-size:10pt;opacity:.85;max-width:120mm">
      ${V ? esc(V.name) : 'Micro-vertical no determinado'} · cuenta <b>${esc(probe.account)}</b><br>
      ${fmt(n('transaction'))} transacciones · ${fmt(n('transactionline'))} líneas · ${fmt(n('account'))} cuentas
    </div>
  </div>
  <div style="font-size:8.5pt;opacity:.7">
    Generado ${new Date().toISOString().slice(0, 10)} · análisis automático sobre SuiteQL/REST<br>
    Todo lo prescriptivo es <b>sugerencia a validar con el cliente</b>, no diagnóstico cerrado.
  </div>
</div>

<div class="page-break"></div>
<h2>1. Resumen</h2>

<div class="kpi">
  <div><div class="v">${yr.length ? money(years[yr[yr.length - 2]]?.rev || 0) : '—'}</div><div class="l">Revenue ${yr[yr.length - 2] || ''}</div></div>
  <div><div class="v">${fmt(n('job'))}</div><div class="l">Proyectos / eventos</div></div>
  <div><div class="v">${mods.stateCounts.active || 0}/${mods.modules.length}</div><div class="l">Módulos en uso</div></div>
  <div><div class="v">${conn?.integrations?.length || 0}</div><div class="l">Integraciones activas</div></div>
</div>

${V ? `<div class="note"><b>Micro-vertical: ${esc(V.name)}</b> (confianza ${esc(V.confidence)}).<br>
${esc(V.note)}<br><span class="small">Detectado del vocabulario propio de la cuenta: ${V.evidence.slice(0, 6).map(e => esc(e.replace(/`/g, ''))).join(' · ')}. <b>Confirmar con el cliente.</b></span></div>` : ''}

<h3>Hallazgos que sostienen la conversación</h3>
${(B?.redFlags || []).map(f => `<div class="flag">${esc(f)}</div>`).join('')}
${byId['nspb-connector']?.state === 'active' && byId['native-budgets']?.state === 'active'
    ? `<div class="warn"><b>Compraron NSPB y no lo adoptaron.</b> El bundle del connector está instalado y aun así el presupuesto sigue entrando por carga nativa (${esc(byId['native-budgets'].evidence)}). No es una venta nueva: es un rescate de algo que ya pagan.</div>` : ''}

<h2>2. Escala y resultado</h2>
${pnlChart()}
<table><tr><th>Año</th><th class="num">Revenue</th><th class="num">COGS</th><th class="num">Opex</th><th class="num">Margen bruto</th><th class="num">Resultado</th></tr>
${yr.map(y => { const d = years[y]; const gm = d.rev ? (100 * (d.rev - d.cogs) / d.rev) : 0; const res = d.rev - d.cogs - d.opex;
  return `<tr><td>${y}${y === '2026' ? ' *' : ''}</td><td class="num">${money(d.rev)}</td><td class="num">${money(d.cogs)}</td><td class="num">${money(d.opex)}</td><td class="num">${gm.toFixed(0)}%</td><td class="num" style="color:${res < 0 ? DANGER : '#333'}">${money(res)}</td></tr>`; }).join('')}
</table>
<p class="small">* ${yr[yr.length - 1]} es año parcial. Cifras del GL con <code>posting='T'</code>; no son estados financieros auditados.</p>
${B?.keyMetric ? `<div class="note"><b>La métrica que manda en este nicho:</b> ${esc(B.keyMetric)}</div>` : ''}

<div class="page-break"></div>
<h2>3. Qué tienen habilitado y qué usan</h2>
${stateBar()}
<table><tr><th>Módulo</th><th>Estado</th><th>Evidencia</th></tr>
${sorted.map(m => `<tr><td>${esc(m.name)}</td><td><span class="pill" style="background:${STATE_COLOR[m.state]}">${STATE_ES[m.state]}</span></td><td>${esc(String(m.evidence).slice(0, 95))}</td></tr>`).join('')}
</table>
<p class="small"><b>"No visible" no es "no lo tienen".</b> SuiteQL solo expone un record type si la feature está habilitada <i>y</i> el rol de la integración la ve. Esos ${mods.stateCounts.unknown || 0} módulos requieren el export de SDF o la pantalla de Enable Features para cerrarse.</p>

<h2>4. Ecosistema conectado</h2>
<table><tr><th>Aplicación</th><th class="num">Tokens</th><th class="num">Activos</th><th>Desde</th></tr>
${(conn?.integrations || []).slice(0, 12).map(i => `<tr><td>${esc(i.app)}</td><td class="num">${i.tokens}</td><td class="num">${i.activos}</td><td>${esc(i.desde)}</td></tr>`).join('')}
</table>
${competing.length ? `<div class="warn"><b>Ya tienen software que cubre lo que podríamos proponer.</b> Verificar alcance real antes de posicionar nada — que exista el token no dice cuánto lo usan.
<ul>${competing.map(c => `<li><b>${esc(c.app)}</b> (${esc(c.competing.area)}, desde ${esc(c.desde)}) — ${esc(c.competing.impacto)}</li>`).join('')}</ul></div>` : ''}
${(B?.missingSuiteApps || []).length ? `<h3>SuiteApps del nicho que no tienen</h3><ul>${B.missingSuiteApps.map(a => `<li><b>${esc(a.name)}</b> — ${esc(a.what)}</li>`).join('')}</ul>` : ''}

<div class="page-break"></div>
<h2>5. Deuda de configuración</h2>
<table>
<tr><th>Hallazgo</th><th class="num">Cifra</th><th>Lectura</th></tr>
<tr><td>Custom fields sin un solo valor</td><td class="num">${deadFields ? `${deadFields.dead} / ${deadFields.total}` : '—'}</td><td>Candidatos a deprecar. Confirmar antes que no los escriba un script o una integración de baja frecuencia.</td></tr>
<tr><td>Cuentas sin ningún asiento</td><td class="num">${fmt((rd(path.join(DIR, 'netsuite', 'shape.json'))?.accounts_unused || []).length)} / ${fmt(n('account'))}</td><td>Inflan la dimensión Account si se arrastran a un modelo de planeación.</td></tr>
<tr><td>Custom records / listas</td><td class="num">${fmt(n('customrecordtype'))} / ${fmt(n('customlist'))}</td><td>Superficie de mantenimiento.</td></tr>
<tr><td>Scripts / deployments</td><td class="num">${fmt(n('script'))} / ${fmt(n('scriptdeployment'))}</td><td>Customización viva a considerar en cualquier upgrade.</td></tr>
</table>

<h2>6. Qué recomendamos</h2>
${gaps().map((g, i) => `<div class="flag"><b>${i + 1}. ${esc(g.t)}</b><br>${esc(g.d)}</div>`).join('')}

<h2>7. Qué no pudimos ver</h2>
<ul>
<li><b>${mods.stateCounts.unknown || 0} módulos sin determinar</b> — se resuelven con <code>suitecloud object:import</code> o la pantalla de Enable Features.</li>
<li><b>El dolor de cierre</b> — SuiteQL no dice cuánto tarda el cierre ni cuántas conciliaciones viven en Excel. Hay que preguntarlo.</li>
<li><b>El lado NSPB</b> — sin el LCM de Planning no se puede cuantificar el estado de la implementación que ya tienen.</li>
<li><b>Integraciones que no usan TBA</b> — OAuth 2.0, SOAP con credenciales de usuario y SuiteAnalytics Connect no aparecen en el inventario de tokens.</li>
</ul>

<div class="note" style="margin-top:16px"><b>Sobre este documento.</b> Generado automáticamente desde la cuenta NetSuite del cliente vía SuiteQL/REST. Cada cifra sale de una consulta, ninguna está estimada. El benchmark del nicho proviene de fuentes públicas (SuiteSuccess y el catálogo de Oracle), no de una base propia de cuentas comparables — orienta la conversación, no la cierra.</div>

</body></html>`;

// Recomendaciones derivadas de lo medido, no de un template fijo.
function gaps() {
  const g = [];
  if (byId['projects']?.state === 'partial' && n('projecttask') === 0)
    g.push({ t: 'Activar PSA sobre los proyectos existentes', d: `Hay ${fmt(n('job'))} proyectos pero project tasks y time-to-charge en cero. Sin eso no hay margen por proyecto — y en un modelo pass-through esa es la única métrica que importa. Es el mayor retorno técnico del análisis.` });
  if (byId['nspb-connector']?.state === 'active' && byId['native-budgets']?.state === 'active')
    g.push({ t: 'Rescatar la adopción de NSPB', d: 'El connector está instalado y el presupuesto sigue cargándose de forma nativa. Antes de proponer alcance nuevo hay que entender por qué no se adoptó: suele ser modelo mal dimensionado o falta de ownership, no producto.' });
  for (const x of (vert?.gapsForVertical || []))
    if (x.id !== 'projects') g.push({ t: `Revisar ${x.name}`, d: `Estado actual: ${STATE_ES[x.state] || x.state}. ${x.evidence}. Es de lo que un jugador maduro de este nicho suele tener andando.` });
  if (competing.length)
    g.push({ t: 'Mapear el solapamiento con el stack existente', d: `${competing.map(c => c.app).join(', ')} cubren áreas donde BPC podría proponer. Entender el alcance real de cada uno antes de armar cualquier propuesta.` });
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
