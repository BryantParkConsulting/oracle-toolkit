'use strict';
/**
 * _shell.js — base compartida de los entregables PDF.
 *
 * Carga los datos del cliente una sola vez, expone los tokens de marca BPC y los
 * helpers de formato, y resuelve el render por Chrome DevTools Protocol. Los
 * generadores quedan siendo solo contenido.
 *
 * Todo texto que salga por acá va en inglés: son documentos de cliente.
 */
const fs = require('fs');
const path = require('path');

const PORT = process.env.CDP_PORT || 9222;
const ROOT = path.join(__dirname, '..', '..');

// ── tokens de marca ──────────────────────────────────────────────────────────
const NAVY = '#1F3C51', SAGE = '#619C8A', GOLD = '#F2CC5F', ORANGE = '#EC8842', DANGER = '#C9512E';
const STATE_COLOR = { active: SAGE, partial: GOLD, dormant: ORANGE, absent: '#9aa3ab', unknown: '#c3cad1' };
const STATE_LABEL = { active: 'In use', partial: 'Partial use', dormant: 'Not used', absent: 'Not enabled', unknown: 'Not visible' };

// ── formato ──────────────────────────────────────────────────────────────────
const fmt = x => Number(x || 0).toLocaleString('en-US');
// El signo se conserva: una pérdida mostrada como "$17.8M" engaña, y el color
// solo no alcanza porque el PDF se imprime en blanco y negro.
const money = x => { const v = Number(x) || 0; return (v < 0 ? '-$' : '$') + (Math.abs(v) / 1e6).toFixed(1) + 'M'; };
const dollars = x => { const v = Number(x) || 0; return (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: 0 }); };
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const pct = (a, b) => (b ? (100 * a / b) : 0);

/** Carga todo lo que produjo el pipeline para un cliente. Lo faltante queda null. */
function loadClient(client) {
  const DIR = path.join(ROOT, 'clients', client);
  const rd = p => { try { return JSON.parse(fs.readFileSync(path.join(DIR, p), 'utf8')); } catch { return null; } };
  const probe = rd('netsuite/probe.json');
  if (!probe) throw new Error(`No hay datos en ${DIR} — corré netsuite-export.js primero.`);

  const T = {};
  for (const t of Object.values(probe.modules)) Object.assign(T, t);

  const shape = rd('netsuite/shape.json') || {};
  const pnl = rd('netsuite/pnl.json') || [];
  const years = {};
  for (const r of pnl) {
    const y = r.anio; if (!y) continue;
    years[y] ||= { rev: 0, cogs: 0, opex: 0 };
    const m = Number(r.monto || 0);
    if (r.tipo === 'Income' || r.tipo === 'OthIncome') years[y].rev += -m;
    else if (r.tipo === 'COGS') years[y].cogs += m; else years[y].opex += m;
  }
  const yr = Object.keys(years).filter(y => years[y].rev || years[y].cogs).sort();

  return {
    DIR, rd, probe, shape, years, yr,
    // Último año COMPLETO: el corriente siempre está parcial y compararlo engaña.
    lastFull: yr[yr.length - 2] || yr[yr.length - 1],
    mods: rd('erp/modules.json'), conn: rd('erp/connectors.json'),
    vert: rd('erp/vertical.json'), fin: rd('erp/financials.json'),
    fields: rd('netsuite/fields.json'),
    opexDetail: rd('netsuite/opex-detail.json') || [],
    season: rd('netsuite/seasonality.json') || [],
    customers: (rd('netsuite/top-customers.json') || []).filter(c => Number(c.facturado) > 0),
    coverage: (rd('netsuite/dimension_coverage.json') || [])[0] || null,
    n: k => (T[k]?.exists ? Number(T[k].rows ?? 0) : 0),
    has: k => !!T[k]?.exists,
  };
}

const logo = () => { try { return fs.readFileSync(path.join(ROOT, 'assets', 'bpc-logo.b64'), 'utf8').trim(); } catch { return ''; } };

/** CSS común. Un solo lugar donde vive el look de los entregables. */
const CSS = `
@page { size:A4; margin:14mm 13mm; }
*{box-sizing:border-box}
body{font-family:Sarabun,"Segoe UI",system-ui,sans-serif;color:#333;font-size:9.5pt;line-height:1.5;margin:0}
h1,h2,h3{color:${NAVY};margin:0 0 6px}
h2{font-size:14pt;border-bottom:2px solid ${SAGE};padding-bottom:4px;margin-top:20px}
h3{font-size:10.5pt;margin-top:14px}
.page-break{page-break-before:always}
.cover{height:262mm;display:flex;flex-direction:column;justify-content:space-between;background:linear-gradient(150deg,${NAVY} 0%,#16303f 100%);color:#fff;margin:-14mm -13mm;padding:22mm 18mm}
.cover h1{color:#fff;font-size:30pt;line-height:1.12;margin:0 0 10px}
.cover .sub{color:${GOLD};font-size:13pt;font-weight:600}
.badge{display:inline-block;background:${SAGE};color:#fff;font-size:8.4pt;font-weight:700;padding:3px 10px;border-radius:3px;letter-spacing:.06em}
.logo{height:33px;filter:brightness(0) invert(1)}
table{width:100%;border-collapse:collapse;font-size:8.7pt;margin:8px 0}
th{background:${NAVY};color:#fff;text-align:left;padding:5px 7px;font-weight:600}
td{padding:4px 7px;border-bottom:1px solid #eceff1;vertical-align:top}
tr:nth-child(even) td{background:#fafbfc}
.num{text-align:right;font-variant-numeric:tabular-nums}
.pill{display:inline-block;padding:1px 7px;border-radius:9px;font-size:7.6pt;color:#fff;font-weight:600}
.kpi{display:flex;gap:8px;margin:10px 0}
.kpi div{flex:1;background:#f6f8f9;border-left:3px solid ${SAGE};padding:8px 10px}
.kpi .v{font-size:15pt;font-weight:700;color:${NAVY};line-height:1.1}
.kpi .l{font-size:7.5pt;color:#6b7280}
.note{background:#f4f7f6;border-left:3px solid ${SAGE};padding:8px 11px;margin:7px 0;font-size:8.7pt}
.flag{background:#fdf3ee;border-left:3px solid ${ORANGE};padding:8px 11px;margin:7px 0;font-size:8.9pt}
.warn{background:#fbeeea;border-left:3px solid ${DANGER};padding:8px 11px;margin:7px 0;font-size:8.7pt}
.rec{border:1px solid #e3e8ea;border-radius:4px;padding:11px 13px;margin:11px 0;page-break-inside:avoid}
.rec h3{margin:0 0 6px;font-size:11pt}
.rec .lbl{font-size:7.6pt;font-weight:700;letter-spacing:.05em;color:${SAGE};text-transform:uppercase;margin-top:7px}
.rec p{margin:2px 0 0}
.small{font-size:7.9pt;color:#6b7280}
ul{margin:5px 0 5px 16px;padding:0} li{margin:3px 0}
code{background:#f1f3f4;padding:1px 3px;border-radius:2px;font-size:8.1pt}
`;

/** Portada estándar. `sub` es lo que distingue un entregable de otro. */
function cover({ name, sub, meta, footer }) {
  const l = logo();
  return `<div class="cover">
  <div>${l ? `<img class="logo" src="data:image/png;base64,${l}">` : '<div style="font-size:15pt;font-weight:700">BPC</div>'}</div>
  <div>
    <div class="badge">PREPARED BY BPC</div>
    <h1 style="margin-top:16px">${esc(name)}</h1>
    <div class="sub">${esc(sub)}</div>
    ${meta ? `<div style="margin-top:20px;font-size:10pt;opacity:.85;max-width:122mm">${meta}</div>` : ''}
  </div>
  <div style="font-size:8.3pt;opacity:.7">${footer || `Generated ${new Date().toISOString().slice(0, 10)} from the live account over SuiteQL / REST.<br>Every figure is measured, none estimated.`}</div>
</div>`;
}

// `extraCss` lets a generator append rules the shell does not carry — the photographic
// cover, for one — without either copying the whole stylesheet or growing this one.
const page = (title, body, extraCss = '') => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>${esc(title)}</title><style>${CSS}${extraCss}</style></head><body>${body}</body></html>`;

// ── render por CDP ───────────────────────────────────────────────────────────
const httpJson = async p => (await fetch(`http://127.0.0.1:${PORT}${p}`)).json();
function wsCall(wsUrl, fn) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl); let id = 0; const pend = new Map(); const evs = [];
    const send = (m, p) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p || {} })); });
    ws.onmessage = e => { const d = JSON.parse(e.data); if (d.id && pend.has(d.id)) { const q = pend.get(d.id); pend.delete(d.id); d.error ? q.rej(new Error(d.error.message)) : q.res(d.result); } else if (d.method) evs.push(d); };
    ws.onopen = async () => { try { resolve(await fn(send, evs)); } catch (e) { reject(e); } finally { ws.close(); } };
    ws.onerror = () => reject(new Error(`CDP not reachable on :${PORT} — start Chrome with --remote-debugging-port=${PORT}`));
  });
}

async function renderPdf(html, htmlFile, pdfFile) {
  fs.writeFileSync(htmlFile, html);
  const ver = await httpJson('/json/version');
  await wsCall(ver.webSocketDebuggerUrl, async (send) => {
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const t = (await httpJson('/json/list')).find(x => x.id === targetId);
    await wsCall(t.webSocketDebuggerUrl, async (s2, evs) => {
      await s2('Page.enable');
      await s2('Page.navigate', { url: 'file:///' + htmlFile.replace(/\\/g, '/') });
      for (let k = 0; k < 40; k++) { await new Promise(r => setTimeout(r, 200)); if (evs.some(e => e.method === 'Page.loadEventFired')) break; }
      await new Promise(r => setTimeout(r, 450));
      const { data } = await s2('Page.printToPDF', { printBackground: true, preferCSSPageSize: true });
      fs.writeFileSync(pdfFile, Buffer.from(data, 'base64'));
    });
    await send('Target.closeTarget', { targetId });
  });
  console.log(`✓ ${pdfFile} (${(fs.statSync(pdfFile).size / 1024).toFixed(0)} KB)`);
}

module.exports = {
  ROOT, NAVY, SAGE, GOLD, ORANGE, DANGER, STATE_COLOR, STATE_LABEL,
  fmt, money, dollars, esc, pct, loadClient, cover, page, renderPdf, CSS,
};
