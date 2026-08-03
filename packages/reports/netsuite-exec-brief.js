#!/usr/bin/env node
'use strict';
/**
 * netsuite-exec-brief.js — dos páginas para el sponsor financiero del cliente.
 *
 * Nadie de finanzas lee quince páginas. Este documento contesta tres cosas: cómo
 * viene el negocio según el sistema, qué encontramos, y qué haríamos primero.
 * Sin inventario de módulos, sin tablas de configuración, sin jerga.
 *
 *   CLIENT=pra CLIENT_NAME=PRA node packages/reports/netsuite-exec-brief.js
 */
const path = require('path');
const S = require('./_shell');

const CLIENT = process.env.CLIENT || 'pra';
const NAME = process.env.CLIENT_NAME || CLIENT.toUpperCase();
const C = S.loadClient(CLIENT);
const { fmt, money, esc } = S;

const D = C.years[C.lastFull] || { rev: 0, cogs: 0, opex: 0 };
const net = D.rev - D.cogs - D.opex;
const gm = D.rev ? (100 * (D.rev - D.cogs) / D.rev) : 0;

const costRows = C.opexDetail.filter(r => r.y === C.lastFull && Number(r.amt) > 0).sort((a, b) => b.amt - a.amt);
const hit = re => costRows.filter(r => new RegExp(re, 'i').test(String(r.name || ''))).reduce((s, r) => s + Number(r.amt || 0), 0);
const belowLine = hit('goodwill|amortization of') + hit('interest expense');

const custTotal = C.customers.reduce((s, c) => s + Number(c.facturado), 0);
const top10 = custTotal ? 100 * C.customers.slice(0, 10).reduce((s, c) => s + Number(c.facturado), 0) / custTotal : 0;

const s12 = C.season.slice(-13, -1).map(r => Number(r.revenue) || 0);
const swing = s12.length >= 12 ? Math.max(...s12) / Math.min(...s12.filter(v => v > 0)) : 0;

const cov = C.coverage;
const covPct = k => (cov && cov.total_lines ? 100 * Number(cov[k] || 0) / Number(cov.total_lines) : null);
const V = C.vert?.vertical;
const byId = Object.fromEntries((C.mods?.modules || []).map(m => [m.id, m]));

/** Los hallazgos, en el orden en que le importan a un CFO. Solo si hay evidencia. */
const findings = [];
if (C.n('job') > 500 && C.n('projecttask') === 0)
  findings.push({ t: 'You cannot currently see the profit on an individual event',
    d: `${fmt(C.n('job'))} events carry revenue, but no cost is attributed to them. In a model where you buy from many suppliers and bill the client once, event-level margin is the number that tells you whether the business is being run well — and today it isn't measurable from the system.` });
if (belowLine > 0)
  findings.push({ t: 'Your reported result understates how the operation is performing',
    d: `The ${C.lastFull} result of ${money(net)} absorbs ${money(belowLine)} of goodwill amortization and interest. Those are financing and acquisition effects, not operations. Excluding them, operating performance is closer to ${money(net + belowLine)}.` });
if (top10 > 25)
  findings.push({ t: `${top10.toFixed(0)}% of billings sit with ten customers`,
    d: `Across ${fmt(C.customers.length)} billed customers, the top ten account for ${top10.toFixed(0)}%. Several of the largest are themselves event agencies rather than end clients, which means a meaningful share of the work arrives through a channel — a different relationship, and a different risk.` });
if (swing > 2.5)
  findings.push({ t: `Revenue swings ${swing.toFixed(1)}x between your strongest and weakest month`,
    d: `That is normal for this business, but it means an annual budget spread evenly across twelve months is wrong in every one of them — and it makes monthly variance reporting hard to act on. Cash requirements follow the same curve.` });
if (covPct('department') !== null && covPct('department') < 30)
  findings.push({ t: 'Departmental reporting is not currently possible from the data',
    d: `Only ${covPct('department').toFixed(0)}% of transaction lines carry a department, and ${covPct('class').toFixed(0)}% carry a class. Any report or plan built at that level would leave most of the actual spend unattributed.` });
if (byId['nspb-connector']?.state === 'active' && byId['native-budgets']?.state === 'active')
  findings.push({ t: 'Planning and NetSuite are both handling budget data',
    d: `Oracle Planning is implemented and connected, and NetSuite also continues to receive budget loads directly. That is a normal state after a Planning rollout, but it is worth confirming which one is meant to be the reference going forward.` });

const priorities = [
  { t: 'Make event profitability measurable', d: 'Attribute cost to the event that incurred it. Your cost accounts are already split by service line, so this is a configuration and process change rather than a redesign.' },
  { t: 'Confirm how Planning and NetSuite budgeting fit together', d: 'Confirm which system is intended to own the budget going forward, and whether the native loads are deliberate or a remnant of the previous process.' },
  { t: 'Fix what the plan will inherit', d: 'Departmental tagging and unused accounts both limit how granular any future reporting can be. Cheaper to address before a model is built on top of them.' },
];

const html = S.page(`${NAME} — Executive Brief`, `
${S.cover({
  name: NAME, sub: 'NetSuite — Executive Brief',
  meta: `${V ? esc(V.name) + ' · ' : ''}account <b>${esc(C.probe.account)}</b><br>${money(D.rev)} revenue in ${C.lastFull} · ${fmt(C.customers.length)} billed customers · ${fmt(C.n('job'))} events`,
  footer: `Generated ${new Date().toISOString().slice(0, 10)} from your NetSuite account.<br>Every figure comes from a query against the system — none is estimated.`,
})}

<div class="page-break"></div>
<h2>Where the business stands</h2>
<div class="kpi">
  <div><div class="v">${money(D.rev)}</div><div class="l">Revenue ${C.lastFull}</div></div>
  <div><div class="v">${gm.toFixed(0)}%</div><div class="l">Gross margin</div></div>
  <div><div class="v">${money(net + belowLine)}</div><div class="l">Operating result</div></div>
  <div><div class="v">${top10.toFixed(0)}%</div><div class="l">Top-10 concentration</div></div>
  ${swing ? `<div><div class="v">${swing.toFixed(1)}x</div><div class="l">Seasonal swing</div></div>` : ''}
</div>

<table><tr><th>Year</th><th class="num">Revenue</th><th class="num">Gross margin</th><th class="num">Result</th></tr>
${C.yr.slice(-4).map(y => { const d = C.years[y], m = d.rev ? 100 * (d.rev - d.cogs) / d.rev : 0, r = d.rev - d.cogs - d.opex;
  return `<tr><td>${y}${y === C.yr[C.yr.length - 1] ? ' (partial)' : ''}</td><td class="num">${money(d.rev)}</td><td class="num">${m.toFixed(0)}%</td><td class="num" style="color:${r < 0 ? S.DANGER : '#333'}">${money(r)}</td></tr>`; }).join('')}
</table>
<p class="small">General ledger figures, posted entries only. Not audited financial statements.</p>

<h2>What we found</h2>
${findings.map((f, i) => `<div class="flag"><b>${i + 1}. ${esc(f.t)}</b><br>${esc(f.d)}</div>`).join('')}

<h2>Where we would start</h2>
${priorities.map((p, i) => `<p><b>${i + 1}. ${esc(p.t)}.</b> ${esc(p.d)}</p>`).join('')}

<div class="note"><b>How this was produced.</b> Read directly from your NetSuite account using a read-only integration. Every number here traces back to a query — nothing is benchmarked or assumed. The detail sits in the full account analysis; this brief is the short version of it.<br><br>
Everything above is a <b>suggestion to discuss</b>, not a conclusion. The data shows what is happening; it cannot show why, and the why usually changes what is worth doing.</div>
`);

const htmlFile = path.join(C.DIR, `${CLIENT}-executive-brief.html`);
const pdfFile = path.join(C.DIR, `${CLIENT}-executive-brief.pdf`);
S.renderPdf(html, htmlFile, pdfFile).catch(e => { console.error('PDF ERROR:', e.message); process.exit(1); });
