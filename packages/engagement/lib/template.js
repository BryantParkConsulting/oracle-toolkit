'use strict';
// Generic engagement-hours report template. Every client-specific value comes from `cfg`
// (see clients/_TEMPLATE/config.js). Produces the full HTML string. MS-retainer reports only.
const fs = require('fs');
const path = require('path');

const NAVY = '#1F3C51', SAGE = '#619C8A', GOLD = '#F2CC5F', ORANGE = '#EC8842', GRAY = '#D9D9D9';
const ROOT = path.join(__dirname, '..');

const fmt$ = n => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtH = n => (n % 1 === 0 ? n : n.toFixed(2)) + ' hrs';
const readB64 = p => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '');

// Resolve a visual asset: prefer the client folder, fall back to the shared /assets default.
function asset(clientDir, clientFile, defaultFile) {
  const c = path.join(clientDir, clientFile);
  if (fs.existsSync(c)) return readB64(c);
  return readB64(path.join(ROOT, 'assets', defaultFile));
}

function hbar(used, contracted, maxVal, color) {
  const W = 120, H = 10, cW = (contracted / maxVal) * W, uW = Math.min((used / maxVal) * W, W);
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><rect width="${W}" height="${H}" rx="3" fill="#EEF2F5"/><rect width="${cW.toFixed(1)}" height="${H}" rx="3" fill="${GRAY}" opacity=".6"/><rect width="${uW.toFixed(1)}" height="${H}" rx="3" fill="${color}"/></svg>`;
}
function donut(pct, label, color) {
  const r = 42, c = 2 * Math.PI * r, on = c * Math.min(pct, 100) / 100;
  return `<svg viewBox="0 0 120 120" width="110" height="110"><circle cx="60" cy="60" r="${r}" fill="none" stroke="#EEF2F5" stroke-width="14"/><circle cx="60" cy="60" r="${r}" fill="none" stroke="${color}" stroke-width="14" stroke-dasharray="${on.toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 60 60)" stroke-linecap="round"/><text x="60" y="56" font-size="18" font-weight="600" text-anchor="middle" fill="${NAVY}" font-family="Sarabun">${Math.round(pct)}%</text><text x="60" y="70" font-size="8" text-anchor="middle" fill="#767676" font-family="Sarabun">${label}</text></svg>`;
}

function buildHtml(cfg, clientDir) {
  // ── derived totals ──
  const CONTRACTED = cfg.months.reduce((s, m) => s + m.contracted, 0);
  const CONSUMED = +cfg.months.reduce((s, m) => s + m.used, 0).toFixed(2);
  const NET_OVERAGE = +(CONSUMED - CONTRACTED).toFixed(2);
  // Billable overage: monthly billing sums only months that ran over; pooled uses the net.
  const monthly = (cfg.billingMode || 'monthly') === 'monthly';
  const BILLABLE_OVERAGE = cfg.billableOverage != null ? cfg.billableOverage
    : monthly ? +cfg.months.reduce((s, m) => s + Math.max(0, m.used - m.contracted), 0).toFixed(2)
      : Math.max(0, NET_OVERAGE);
  const RATE = cfg.rate, RETAINER = cfg.retainerPaid;
  const usePct = Math.round((CONSUMED / CONTRACTED) * 100);

  const LOGO = asset(clientDir, '.logo.b64', 'bpc-logo.b64');
  const HERO = asset(clientDir, '.hero.b64', 'hero-default.b64');
  const CIRCLES = asset(clientDir, '.circles.b64', 'circles-default.b64');

  // ── cover ──
  const cstat = (n, l) => `<div class="cstat"><div class="cnum">${n}</div><div class="clab">${l}</div></div>`;
  const cover = `<section class="cover">
    <div class="cover-photo">${HERO ? `<img src="data:image/png;base64,${HERO}"/>` : `<div style="width:100%;height:100%;background:linear-gradient(135deg,#2a4a60,#3d6670)"></div>`}
      <div class="cover-grad"></div>${CIRCLES ? `<div class="cover-circles" style="background-image:url('data:image/png;base64,${CIRCLES}')"></div>` : ''}</div>
    <div class="cover-top"><span class="dot"></span>Bryant Park Consulting</div>
    <div class="cover-body">
      <div class="cover-eyebrow">Confidential &middot; ${cfg.reportMonth}</div>
      <h1 class="cover-title">${cfg.coverTitle}</h1>
      <div class="cover-rule"></div>
      <p class="cover-sub">${cfg.clientFull} &middot; ${cfg.sow} hours summary — contracted vs. consumed, ${cfg.servicePeriod}.</p>
      <div class="cover-stats">${[cstat(fmtH(CONTRACTED), 'hours contracted'), cstat(fmtH(CONSUMED), 'hours consumed'), cstat(cfg.periodShort, 'service period'), cstat(fmt$(RETAINER), 'retainer value')].join('')}</div>
    </div>
    <div class="cover-foot"><span>bryantparkconsulting.com</span><span>${cfg.clientFull} &middot; ${cfg.sow}</span></div>
  </section>`;

  // ── overview ──
  const maxVal = Math.max(...cfg.months.map(m => m.used)) * 1.1;
  const monthRows = cfg.months.map(m => {
    const over = m.used > m.contracted, color = over ? ORANGE : SAGE;
    return `<tr><td style="width:70px">${m.label.replace(/ \d{4}$/, '')}</td><td style="width:32px;text-align:right;color:#767676">${m.contracted} hrs</td><td style="padding:3px 8px">${hbar(m.used, m.contracted, maxVal, color)}</td><td style="width:60px;text-align:right;font-weight:600;color:${color}">${fmtH(m.used)}</td><td style="width:50px;text-align:right;font-size:9px;color:${over ? ORANGE : '#767676'}">${over ? '+' + fmtH(m.used - m.contracted) : '-' + fmtH(m.contracted - m.used)}</td></tr>`;
  }).join('');
  const teamRows = cfg.team.map(t => `<tr><td>${t.name}</td><td>${t.role}</td></tr>`).join('');
  const overview = `
  <h2 style="margin-top:0">Engagement Overview</h2>
  <p>${cfg.overview}</p>
  <div class="row" style="margin:12px 0 0;gap:12px;align-items:flex-start">
    <div class="card" style="flex:2">
      <div class="ct">${cfg.sowShort || cfg.sow} block — contracted vs. hours consumed (source: NetSuite)</div>
      <table style="margin:8px 0 4px;font-size:9.5px"><thead><tr>
        <th style="background:none;color:#767676;font-weight:600;font-size:8px">Month</th>
        <th style="background:none;color:#767676;font-weight:600;font-size:8px;text-align:right">Contracted</th>
        <th style="background:none;color:#767676;font-weight:600;font-size:8px"></th>
        <th style="background:none;color:#767676;font-weight:600;font-size:8px;text-align:right">Used</th>
        <th style="background:none;color:#767676;font-weight:600;font-size:8px;text-align:right">&Delta;</th>
      </tr></thead><tbody>${monthRows}</tbody></table>
      <div style="display:flex;justify-content:space-between;padding-top:6px;border-top:1px solid #EEF2F5;margin-top:4px">
        <span style="font-size:9px">Total contracted: <strong>${fmtH(CONTRACTED)}</strong> &nbsp;·&nbsp; Rate: <strong>$${RATE}/hr</strong> &nbsp;·&nbsp; Retainer value: <strong>${fmt$(RETAINER)}</strong></span>
        <span style="font-size:9px;font-weight:600;color:${NET_OVERAGE > 0 ? ORANGE : SAGE}">Total consumed: ${fmtH(CONSUMED)}</span>
      </div>
      <div class="cap" style="margin-top:4px">Gray bar = contracted hours. Colored bar = actual hours consumed.</div>
    </div>
    <div class="card" style="flex:1;text-align:center">
      <div class="ct" style="margin-bottom:6px">Block utilization</div>
      ${donut(usePct, 'of block used', usePct > 100 ? ORANGE : SAGE)}
      <div style="margin-top:4px;font-size:9px;color:#767676">${fmtH(CONSUMED)} of ${fmtH(CONTRACTED)} contracted</div>
      ${NET_OVERAGE > 0 ? `<div style="font-size:9px;font-weight:600;color:${ORANGE};margin-top:2px">+${fmtH(NET_OVERAGE)} over block</div>` : ''}
    </div>
    <div class="card" style="flex:1"><div class="ct">Team</div>
      <table style="margin:4px 0;font-size:9px"><thead><tr><th>Name</th><th>Role</th></tr></thead><tbody>${teamRows}</tbody></table>
    </div>
  </div>`;

  // ── time log (grouped by the month key derived from each entry's date prefix) ──
  const monthKeys = cfg.months.map(m => ({ key: m.label.slice(0, 3), label: m.label }));
  const timelog = monthKeys.map(({ key, label }) => {
    const rows = cfg.timebill.filter(t => t.d.startsWith(key));
    if (!rows.length) return '';
    const total = rows.reduce((s, t) => s + t.h, 0);
    const trs = rows.map(t => `<tr><td style="width:38px;white-space:nowrap">${t.d}</td><td style="width:90px">${cfg.employees[t.emp] || t.emp}</td><td class="num" style="width:28px">${t.h % 1 === 0 ? t.h.toFixed(0) : t.h.toFixed(2)}</td><td>${t.note}</td></tr>`).join('');
    return `<div style="margin-bottom:8px"><div style="font-size:8px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${NAVY};margin-bottom:3px;padding:2px 0;border-bottom:1px solid ${GRAY}">${label} — ${fmtH(total)}</div><table class="billing" style="font-size:9px"><thead><tr><th style="width:38px">Date</th><th style="width:90px">Consultant</th><th class="num" style="width:28px">Hrs</th><th>Activity</th></tr></thead><tbody>${trs}</tbody></table></div>`;
  }).join('');

  // ── invoice detail ──
  const invMonthRows = cfg.months.map(m => {
    const over = m.used > m.contracted;
    return `<tr><td>${m.label}</td><td class="num">${m.contracted}</td><td class="num" style="${over ? `color:${ORANGE};font-weight:600` : ''}">${m.used}</td><td class="num">${fmt$(m.contracted * RATE)}</td></tr>`;
  }).join('');
  const invoice = `
  <div class="inv-block">
    <div class="inv-hdr"><div class="inv-hdr-left">
      <div style="display:flex;align-items:center;gap:8px">
        <a href="${cfg.retainerLink}" style="font-size:13px;font-weight:600">${cfg.retainerInvoice}</a>
        <span class="hrs-tag">${fmtH(CONTRACTED)} contracted</span>
        <span class="badge" style="background:${cfg.retainerPaidStatus === 'PAID' ? SAGE : ORANGE}">${cfg.retainerPaidStatus || 'PAID'}</span>
      </div>
      <span class="inv-period">${cfg.retainerDesc}</span>
    </div><div class="inv-total">${fmt$(RETAINER)}</div></div>
    <div class="sect-label" style="margin-bottom:4px">Prepaid block — contracted vs. consumed per month</div>
    <table class="billing" style="max-width:420px;margin-bottom:10px"><thead><tr><th>Month</th><th class="num">Contracted hrs</th><th class="num">Consumed hrs</th><th class="num">Billed</th></tr></thead><tbody>${invMonthRows}
      <tr class="total-row"><td>Total</td><td class="num">${CONTRACTED} hrs</td><td class="num" style="color:${NET_OVERAGE > 0 ? ORANGE : NAVY};font-weight:700">${fmtH(CONSUMED)}</td><td class="num">${fmt$(RETAINER)}</td></tr>
    </tbody></table>
    <div class="cap" style="margin-bottom:12px">Billed as a flat retainer. Consumed hours (${fmtH(CONSUMED)}) vs. contracted block (${fmtH(CONTRACTED)}). Source: NetSuite project tracking.</div>
    <div class="sect-label" style="margin-bottom:5px">Time log — ${cfg.servicePeriod} (source: NetSuite timesheet)</div>
    ${timelog}
  </div>`;

  // ── overage callout (only if there is billable overage) ──
  const overage = BILLABLE_OVERAGE > 0 ? `
  <div style="margin-top:14px;border:1.5px solid ${ORANGE};border-radius:8px;padding:12px 16px;background:#FFF8F4">
    <div style="display:flex;align-items:flex-start;gap:14px"><div style="flex:1">
      <div style="font-size:10px;font-weight:700;color:${ORANGE};letter-spacing:.08em;text-transform:uppercase;margin-bottom:4px">Hours overage — above contracted block${cfg.overageStatus ? ` · ${cfg.overageStatus}` : ''}</div>
      <p style="margin:0 0 5px;font-size:9.5px">Contracted block: <strong>${fmtH(CONTRACTED)}</strong> &nbsp;·&nbsp; Total consumed: <strong>${fmtH(CONSUMED)}</strong> &nbsp;·&nbsp; Billable overage: <strong style="color:${ORANGE}">${fmtH(BILLABLE_OVERAGE)}</strong></p>
      <p style="margin:0;font-size:9.5px;color:#555">${cfg.overageNote || ''}</p>
    </div>
    <div style="text-align:center;min-width:90px;padding:8px 12px;background:white;border-radius:6px;border:1px solid #F5D5C0">
      <div style="font-size:19px;font-weight:700;color:${ORANGE}">${fmtH(BILLABLE_OVERAGE)}</div>
      <div style="font-size:8px;color:#767676;margin-top:2px">above block</div>
      <div style="font-size:10px;font-weight:600;color:${NAVY};margin-top:5px">${fmt$(+(BILLABLE_OVERAGE * (cfg.overageRate || RATE)).toFixed(2))}</div>
      <div style="font-size:8px;color:#767676">at $${cfg.overageRate || RATE}/hr</div>
    </div></div>
  </div>` : '';

  return `<!doctype html><html><head><meta charset="utf-8"><style>
  @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700&display=swap');
  @page { margin: 15mm 11mm 13mm; }
  * { box-sizing: border-box; }
  body { font-family:'Sarabun',Arial,sans-serif; font-weight:300; color:${NAVY}; font-size:11px; line-height:1.55; -webkit-font-smoothing:antialiased; }
  .brand { display:flex; align-items:flex-end; justify-content:space-between; border-bottom:2px solid ${NAVY}; padding-bottom:9px; margin-bottom:16px; }
  .brand img { height:24px; } .brand .eyebrow { font-size:8.5px; font-weight:600; letter-spacing:.14em; text-transform:uppercase; color:${SAGE}; }
  h2 { font-family:'Sarabun'; font-weight:600; font-size:13px; color:${NAVY}; margin:16px 0 6px; padding-bottom:4px; border-bottom:1px solid ${GRAY}; page-break-after:avoid; }
  p { margin:5px 0; } a { color:${NAVY}; text-decoration:none; }
  table { border-collapse:collapse; width:100%; margin:5px 0; font-size:9.5px; }
  th { background:${NAVY}; color:#fff; font-weight:500; text-align:left; padding:4px 7px; font-size:9px; }
  td { padding:3px 7px; border-bottom:1px solid #EEEEEE; } tr:nth-child(even) td { background:#FAFAFA; }
  tr.total-row td { background:#F3F6F9; font-weight:600; color:${NAVY}; border-top:1px solid #CDD8E0; }
  td.num, th.num { text-align:right; font-variant-numeric:tabular-nums; }
  .card { border:1px solid #EEEEEE; border-radius:8px; padding:10px 13px; margin:7px 0; background:#fff; page-break-inside:avoid; box-shadow:0 1px 2px rgba(31,60,81,.06); }
  .card .ct { font-size:9.5px; font-weight:600; color:${NAVY}; margin-bottom:5px; } .cap { font-size:9px; color:#767676; }
  .row { display:flex; gap:9px; }
  .inv-block { border:1px solid #DDE6EE; border-radius:7px; padding:12px 14px; margin:8px 0; background:#fff; page-break-inside:avoid; box-shadow:0 1px 3px rgba(31,60,81,.06); }
  .inv-hdr { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:9px; padding-bottom:8px; border-bottom:1px solid #EEF2F5; }
  .inv-hdr-left { display:flex; flex-direction:column; gap:3px; } .inv-period { font-size:9px; color:#767676; }
  .inv-total { font-size:18px; font-weight:600; color:${NAVY}; font-variant-numeric:tabular-nums; align-self:center; }
  .badge { color:#fff; padding:2px 8px; border-radius:10px; font-size:8px; font-weight:600; }
  .hrs-tag { background:${NAVY}; color:#fff; padding:2px 9px; border-radius:10px; font-size:8px; font-weight:600; }
  .sect-label { font-size:8px; font-weight:600; letter-spacing:.1em; text-transform:uppercase; color:${SAGE}; margin-bottom:4px; }
  table.billing th { font-size:8.5px; padding:3px 6px; } table.billing td { font-size:9px; padding:2px 6px; }
  .cover { position:relative; width:100vw; height:255mm; background:${NAVY}; color:#fff; overflow:hidden; page-break-after:always; margin:-15mm -11mm 0; padding:0; }
  .cover-photo { position:absolute; inset:0 0 0 50%; } .cover-photo img { width:100%; height:100%; object-fit:cover; filter:saturate(.65) contrast(1.05); }
  .cover-grad { position:absolute; inset:0; background:linear-gradient(90deg,${NAVY} 0%,rgba(31,60,81,.55) 42%,rgba(31,60,81,.18) 100%); }
  .cover-circles { position:absolute; inset:0; background-position:center right; background-size:cover; mix-blend-mode:screen; opacity:.42; }
  .cover-top { position:absolute; top:20mm; left:18mm; font-size:12px; font-weight:500; display:flex; align-items:center; gap:8px; z-index:3; }
  .cover-top .dot { width:9px; height:9px; border-radius:50%; background:${GOLD}; }
  .cover-body { position:absolute; left:18mm; right:52%; top:78mm; z-index:3; }
  .cover-eyebrow { font-size:11px; font-weight:600; letter-spacing:.14em; text-transform:uppercase; color:${GOLD}; margin-bottom:14px; }
  .cover-title { font-family:'Sarabun'; font-weight:300; font-size:40px; line-height:1.08; letter-spacing:-.02em; color:#fff; margin:0; }
  .cover-rule { width:54px; height:3px; background:${GOLD}; margin:18px 0; }
  .cover-sub { font-size:12px; line-height:1.6; color:rgba(255,255,255,.82); max-width:330px; font-weight:300; }
  .cover-stats { display:flex; flex-wrap:wrap; gap:10px 26px; margin-top:30px; }
  .cstat .cnum { font-family:'Sarabun'; font-weight:500; font-size:24px; color:${GOLD}; line-height:1; }
  .cstat .clab { font-size:9px; color:rgba(255,255,255,.72); margin-top:4px; }
  .cover-foot { position:absolute; bottom:18mm; left:18mm; right:18mm; display:flex; justify-content:space-between; font-size:9.5px; color:rgba(255,255,255,.55); z-index:3; }
</style></head><body>
  ${cover}
  <div class="brand"><img src="data:image/png;base64,${LOGO}" alt="Bryant Park Consulting"/><span class="eyebrow">${cfg.clientFull} &nbsp;&middot;&nbsp; ${cfg.sow} &nbsp;&middot;&nbsp; ${cfg.reportMonth} &nbsp;&middot;&nbsp; Confidential</span></div>
  ${overview}
  <h2 style="margin-top:14px">Invoice Detail</h2>
  ${invoice}
  ${overage}
</body></html>`;
}

module.exports = { buildHtml };
