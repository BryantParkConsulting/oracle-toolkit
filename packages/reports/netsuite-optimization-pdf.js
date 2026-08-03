#!/usr/bin/env node
'use strict';
/**
 * netsuite-optimization-pdf.js — Optimization Review de una cuenta NetSuite.
 *
 * Para el equipo técnico o de administración del cliente: qué está configurado y
 * no se usa. Es lo contrario del ABR — no habla de negocio, habla de superficie
 * de mantenimiento.
 *
 * Cada hallazgo lleva su evidencia y, cuando corresponde, la salvedad de por qué
 * podría ser un falso positivo. Recomendar borrar algo que un script escribe una
 * vez al año es peor que no recomendar nada.
 *
 *   CLIENT=pra CLIENT_NAME=PRA node packages/reports/netsuite-optimization-pdf.js
 */
const path = require('path');
const S = require('./_shell');

const CLIENT = process.env.CLIENT || 'pra';
const NAME = process.env.CLIENT_NAME || CLIENT.toUpperCase();
const C = S.loadClient(CLIENT);
const { fmt, esc, pct } = S;

// ── campos muertos: vacíos en TODAS las tablas donde se midieron ─────────────
const deadFields = (() => {
  if (!C.fields) return null;
  const across = {};
  for (const d of Object.values(C.fields))
    for (const [f, v] of Object.entries(d.fields || {})) { if (v.error) continue; across[f] = (across[f] || 0) + Number(v.filled || 0); }
  const all = Object.keys(across);
  const dead = all.filter(f => !across[f]);
  return { dead, total: all.length, byTable: C.fields };
})();

const unusedAccounts = (C.shape.accounts_unused || []);
const dep = C.shape.deployments_by_type || [];
const depTotal = dep.reduce((s, r) => s + Number(r.n || 0), 0);
const depIdle = dep.filter(r => /NOTSCHEDULED/i.test(String(r.status))).reduce((s, r) => s + Number(r.n || 0), 0);
const workflows = C.rd('netsuite/workflows.json') || [];
const wfInactive = workflows.filter(w => w.isinactive === 'T').length;
const scriptParams = (C.shape.custom_fields || []).filter(r => String(r.fieldtype || '').toUpperCase() === 'SCRIPT').length;

const items = [];
if (deadFields?.dead.length)
  items.push({ sev: 'High', t: 'Custom fields that have never held a value',
    fig: `${fmt(deadFields.dead.length)} of ${fmt(deadFields.total)}`,
    d: `Measured across every table each field applies to — a field is only counted here if it is empty everywhere, not just on one record type.`,
    care: `Before removing any of them, confirm none is written by a script or by a low-frequency integration. A field populated once a year by a year-end process looks identical to a dead one over a twelve-month window.`,
    sample: deadFields.dead.slice(0, 14) });
if (unusedAccounts.length)
  items.push({ sev: 'High', t: 'Accounts with no journal activity',
    fig: `${fmt(unusedAccounts.length)} of ${fmt(C.n('account'))} (${pct(unusedAccounts.length, C.n('account')).toFixed(0)}%)`,
    d: `These accounts exist in the chart of accounts but carry no accounting lines at all in the period analysed.`,
    care: `Inactivating rather than deleting keeps history intact. Worth reviewing with finance — some may be newly opened, or reserved for a process that has not run yet.`,
    sample: unusedAccounts.slice(0, 12).map(a => `${a.acctnumber || ''} ${a.acctname || ''}`.trim()) });
if (depIdle)
  items.push({ sev: 'Medium', t: 'Script deployments that never run',
    fig: `${fmt(depIdle)} of ${fmt(depTotal)}`,
    d: `Deployments sitting at NOTSCHEDULED — installed but not scheduled. Only ${fmt(depTotal - depIdle)} deployments are actually active, which also means the SuiteCloud Processor is far less loaded than the script count suggests.`,
    care: `Some are deliberately dormant: bundle-supplied scripts, or ones triggered manually. The list is a starting point for review, not a delete list.` });
if (wfInactive)
  items.push({ sev: 'Low', t: 'Inactive workflows still defined',
    fig: `${fmt(wfInactive)} of ${fmt(workflows.length)}`,
    d: `Workflows marked inactive remain in the account and still appear in every customization review and upgrade regression.`,
    care: `Low risk to remove, but confirm none is seasonal.` });
if (C.n('customrecordtype') > 50)
  items.push({ sev: 'Low', t: 'Custom record types and lists',
    fig: `${fmt(C.n('customrecordtype'))} records · ${fmt(C.n('customlist'))} lists`,
    d: `Each one is a surface that has to be maintained, secured and regression-tested. Many come from installed SuiteApps rather than from your own development.`,
    care: `Bundle-owned records should not be touched directly — they are managed by their SuiteApp.` });

const SEV = { High: S.DANGER, Medium: S.ORANGE, Low: S.SAGE };

const html = S.page(`${NAME} — Optimization Review`, `
${S.cover({
  name: NAME, sub: 'NetSuite — Configuration Optimization Review',
  meta: `Account <b>${esc(C.probe.account)}</b><br>What is configured in the system and no longer earning its keep.`,
  footer: `Generated ${new Date().toISOString().slice(0, 10)} from the live account over SuiteQL / REST.<br>Every figure is measured. Each finding carries the caveat that would make it a false positive.`,
})}

<div class="page-break"></div>
<h2>Summary</h2>
<div class="kpi">
  <div><div class="v">${deadFields ? fmt(deadFields.dead.length) : '—'}</div><div class="l">Never-populated fields</div></div>
  <div><div class="v">${fmt(unusedAccounts.length)}</div><div class="l">Accounts without activity</div></div>
  <div><div class="v">${fmt(depIdle)}</div><div class="l">Dormant deployments</div></div>
  <div><div class="v">${fmt(C.n('customrecordtype'))}</div><div class="l">Custom record types</div></div>
</div>
<p>This review looks only at configuration that appears unused. It does not assess whether the system is set up correctly, nor whether performance is acceptable — those are different questions with different evidence.</p>
${scriptParams ? `<div class="note"><b>A note on how custom fields were counted.</b> The account holds ${fmt((C.shape.custom_fields || []).length)} custom field definitions, but ${fmt(scriptParams)} of those are script parameters rather than data fields. Counting them together overstates the customization footprint by roughly ${pct(scriptParams, (C.shape.custom_fields || []).length).toFixed(0)}%, so they are excluded throughout.</div>` : ''}

<h2>Findings</h2>
${items.map((it, i) => `<div class="rec">
<h3><span class="pill" style="background:${SEV[it.sev]}">${it.sev}</span> &nbsp;${i + 1}. ${esc(it.t)} — ${esc(it.fig)}</h3>
<div class="lbl">What we measured</div><p>${esc(it.d)}</p>
<div class="lbl">Before acting on it</div><p>${esc(it.care)}</p>
${it.sample?.length ? `<div class="lbl">Sample</div><p class="small">${it.sample.map(x => `<code>${esc(x)}</code>`).join(' · ')}${it.sample.length < (it.t.includes('field') ? deadFields.dead.length : unusedAccounts.length) ? ' …' : ''}</p>` : ''}
</div>`).join('')}

<h2>How to work through this</h2>
<ol>
<li><b>Start with the accounts.</b> They are the easiest to validate with finance and the most valuable to clean, because every unused account carried into a planning or reporting model becomes a member that has to be maintained forever.</li>
<li><b>Then the fields.</b> Check each candidate against scripts and integrations first. Removing a field that something writes to breaks silently.</li>
<li><b>Deployments last.</b> Dormant is not the same as unwanted — confirm the intent behind each before disabling anything.</li>
</ol>

<div class="note"><b>Scope and limits.</b> Read from the account over SuiteQL with a read-only role. Field usage is measured over the tables each field applies to; account activity over the period held in the ledger. Anything that could not be measured is left out rather than estimated — in particular, saved-search and report definitions are not exposed to this method, so unused reports are not covered here.</div>
`);

const htmlFile = path.join(C.DIR, `${CLIENT}-optimization-review.html`);
const pdfFile = path.join(C.DIR, `${CLIENT}-optimization-review.pdf`);
S.renderPdf(html, htmlFile, pdfFile).catch(e => { console.error('PDF ERROR:', e.message); process.exit(1); });
