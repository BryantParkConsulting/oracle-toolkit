#!/usr/bin/env node
'use strict';
/**
 * workforce-security-pdf.js — client-facing explanation of the Workforce data
 * lockdown: what was asked, how Planning security actually works, what the
 * imported rule does, and — just as important — what it does not do.
 *
 *   node packages/reports/workforce-security-pdf.js <client> [--owner <email>]
 *
 * Reads the generated LCM package spec at clients/<client>/security/workforce-lockdown.json
 * so the document can never drift from what was actually imported. Renders through
 * the shared BPC shell (CDP on :9222).
 */
const fs = require('fs');
const path = require('path');
const { ROOT, NAVY, SAGE, GOLD, ORANGE, DANGER, esc, cover, page, renderPdf } = require('./_shell');

const CLIENT = process.argv[2] || 'symetri';
const argOwner = (() => { const i = process.argv.indexOf('--owner'); return i > 0 ? process.argv[i + 1] : null; })();
const DIR = path.join(ROOT, 'clients', CLIENT);
const CAP = CLIENT[0].toUpperCase() + CLIENT.slice(1);
const TODAY = new Date().toISOString().slice(0, 10);

const spec = JSON.parse(fs.readFileSync(path.join(DIR, 'security', 'workforce-lockdown.json'), 'utf8'));
const rule = spec.rules.find(r => !r.xml);
if (!rule) throw new Error('no generated rule in the spec — nothing to describe');

const CUBE = (rule.cubes || [])[0];
const GROUP = [...new Set(rule.subRules.flatMap(s => s.groups || []))];
const RESTRICTIONS = [...new Set(rule.subRules.map(s => s.restriction))];
// The anchor parent is what the rule actually selects — read it, never retype it.
const ANCHOR = rule.subRules[0].members.find(m => typeof m === 'object')?.member
  ?? rule.subRules[0].members[0];
const OWNER = argOwner || 'the Workforce owner';

// ── the four service roles ───────────────────────────────────────────────────
// "Affected" is the column that matters: a Service Administrator is not.
const ROLES = [
  ['Service Administrator',
   'Full control of the service: users and role assignment, application configuration, backups and restores, metadata and data import/export, and every feature and every number in the environment.',
   'No — bypasses this rule', DANGER],
  ['Power User',
   'Designs and maintains application artifacts — forms, reports, business rules, dimensions. Enters data, runs calculations, manages processes. Does not administer the service or global security.',
   'Yes', SAGE],
  ['User',
   'Enters and edits plan data on the forms assigned to them, and runs the rules attached to those forms.',
   'Yes', SAGE],
  ['Viewer',
   'Read-only. Opens forms and reports, cannot input data, run calculations or change anything.',
   'Yes', SAGE],
];

// ── the three layers Planning secures with ───────────────────────────────────
const LAYERS = [
  ['1 · Service role',
   'Service-wide',
   'Decides what a person can do at all: administer, design, enter, or only read.',
   'Unchanged. No role assignment is modified by this import.'],
  ['2 · Dimension (member) security',
   'The whole application',
   'Grants read or write on individual members. It is not cube-aware: a permission on an account applies everywhere that account is valid, and it only starts working once <em>Apply Security</em> is switched on for the dimension.',
   `Deliberately not used. Turning it on for Account would put all ${CAP} accounts under permissions that do not exist today, locking far more than Workforce.`],
  ['3 · Cell-level security',
   'One cube at a time',
   'An exception layer on top of the other two. It denies read or write on a cell combination, and it can be scoped to a single cube.',
   'This is what was implemented.'],
];

const LIMITS = [
  ['Service Administrators still see everything',
   'Oracle exempts that role from cell-level security by design. There is no setting that changes it. The only control is how many people hold the role — restricting an administrator means moving them to Power User.'],
  [`Figures pushed out of ${CUBE}`,
   `The rule is scoped to the ${CUBE} cube. Compensation totals copied into the Plan cube by the Workforce push are ordinary planning data there and stay readable, at account and department level rather than per employee.`],
  ['Administrative exports',
   'A data export or snapshot run by a Service Administrator is unaffected, for the same reason as above.'],
  ['Group membership is not part of the import',
   `The rule names the group. Who belongs to it is maintained in Access Control, and it is the one part of this design that drifts: a new joiner who is not added to ${GROUP.join(', ')} can read Workforce.`],
];

const CHECKS = [
  ['Rule is live', 'Application → Overview → Actions → Cell-Level Security. Both rules are listed and enabled.'],
  ['A restricted user is blocked', `Sign in as a member of ${GROUP.join(', ')}, open a Workforce form: every cell reads <code>#noaccess</code> and refuses input. Same in Smart View.`],
  ['The owner is not blocked', `Sign in as ${esc(OWNER)}: the same form opens with values and accepts input. If it does not, that account is inside the restricted group and must be taken out.`],
  ['Nothing else moved', 'Open a Plan, Rpt and Details form as a restricted user — unchanged.'],
];

const th = (...cols) => `<tr>${cols.map(c => `<th>${c}</th>`).join('')}</tr>`;
const pill = (text, color) => `<span class="pill" style="background:${color}">${esc(text)}</span>`;

// group × cube grid. Rows are people, columns are the four cubes.
function matrix() {
  const cubes = ['Workforc', 'Plan', 'Rpt', 'Details'];
  const rows = [
    [`Workforce owner<div class="small">${esc(OWNER)}</div>`, ['rw', 'rw', 'rw', 'rw']],
    [`Restricted group<div class="small">${esc(GROUP.join(', '))}</div>`, ['no', 'rw', 'rw', 'rw']],
    ['Service Administrator<div class="small">unaffected by design</div>', ['rw', 'rw', 'rw', 'rw']],
  ];
  const cell = v => v === 'rw'
    ? `<td class="mx" style="background:${SAGE};color:#fff">Read / Write</td>`
    : `<td class="mx" style="background:#fbeeea;color:${DANGER};font-weight:700">No access</td>`;
  return `<table class="grid">
    <thead>${th('Who', ...cubes)}</thead>
    <tbody>${rows.map(([who, vs]) => `<tr><td>${who}</td>${vs.map(cell).join('')}</tr>`).join('')}</tbody>
  </table>
  <div class="small">Read / Write in the four cubes reflects each person's existing role and form assignments; the only change this document describes is the <strong>${CUBE}</strong> column.</div>`;
}

const body = `
${cover({
  name: 'Workforce Data Access',
  // cover() escapes `sub` itself — pass the raw ampersand.
  sub: `${CAP} · NetSuite Planning & Budgeting`,
  meta: `How Workforce data is restricted to a single owner, what the change covers, and what it deliberately does not.`,
  footer: `Prepared ${TODAY} · Bryant Park Consulting · Suggested configuration, to be confirmed with ${CAP} before it is applied.`,
})}

<h2>What was asked</h2>
<p>One person — ${esc(OWNER)} — reads and writes Workforce data. Nobody else in the application
reads it or writes it.</p>
<p>This is achievable for every ordinary user of the application. It is not achievable against a
Service Administrator, and that constraint drives the rest of this document.</p>

<h2>How Planning secures data</h2>
<p>Planning has three independent layers. Choosing the wrong one is how a narrow request turns into
an application-wide outage, so the reasoning is set out here.</p>
<table>
  <thead>${th('Layer', 'Scope', 'What it does', 'Used here')}</thead>
  <tbody>${LAYERS.map(([n, s, w, u]) =>
    `<tr><td><strong>${n}</strong></td><td>${s}</td><td>${w}</td><td>${u}</td></tr>`).join('')}</tbody>
</table>

<div class="note"><strong>Why not "account-level security".</strong> Member permissions travel with
the account, not with the cube. Restricting the compensation accounts that way would also restrict
them in the financial cubes, and switching <em>Apply Security</em> on for the Account dimension
would place all ${CAP} accounts under permissions that have never been defined. Cell-level security
reaches exactly one cube and leaves everything else untouched.</div>

<h2>The service roles</h2>
<table>
  <thead>${th('Role', 'What it can do', 'Restricted by this rule')}</thead>
  <tbody>${ROLES.map(([n, d, a, c]) =>
    `<tr><td><strong>${n}</strong></td><td>${d}</td><td>${pill(a, c)}</td></tr>`).join('')}</tbody>
</table>
<div class="warn"><strong>The one decision this rests on.</strong> Anyone holding Service
Administrator reads and writes Workforce regardless of what is imported. Keeping the data closed
means keeping that role to the minimum the service actually needs — every other administrator moves
to Power User, which this rule does restrict.</div>

<h2 class="page-break">What was configured</h2>
<table>
  <tbody>
    <tr><td style="width:38%"><strong>Rule</strong></td><td>${esc(rule.name)}</td></tr>
    <tr><td><strong>Cube</strong></td><td>${esc(CUBE)} only — the other three cubes are not touched</td></tr>
    <tr><td><strong>Accounts</strong></td><td><code>${esc(ANCHOR)}</code> and everything beneath it:
      job codes, workforce rates, employee properties, total compensation and headcount</td></tr>
    <tr><td><strong>Restriction</strong></td><td>${RESTRICTIONS.map(r => esc(r)).join(' and ')}</td></tr>
    <tr><td><strong>Applies to</strong></td><td>${esc(GROUP.join(', '))} — everyone except the Workforce owner</td></tr>
    <tr><td><strong>Delivered as</strong></td><td>A Migration snapshot, imported through Tools → Migration.
      It carries the existing compensation rule through unchanged alongside the new one.</td></tr>
  </tbody>
</table>
<p>Cell-level security only ever <strong>denies</strong>; it never grants. The owner keeps access by
not being in the restricted group — nothing is granted to them, so nothing has to be maintained on
their side.</p>

<h3>Who ends up seeing what</h3>
${matrix()}

<h2>What this does not cover</h2>
<table>
  <thead>${th('Limit', 'Detail')}</thead>
  <tbody>${LIMITS.map(([l, d]) => `<tr><td style="width:32%"><strong>${l}</strong></td><td>${d}</td></tr>`).join('')}</tbody>
</table>

<h2>What ${CAP} owns after this</h2>
<ol>
  <li><strong>Group membership.</strong> Every user except ${esc(OWNER)} belongs to
    ${esc(GROUP.join(', '))}. Add new joiners to it as part of onboarding.</li>
  <li><strong>The administrator list.</strong> Review who holds Service Administrator and move
    everyone who does not need it to Power User. Each new administrator is a new person who can
    read Workforce.</li>
  <li><strong>Leavers.</strong> Removing a person's access to the service is what removes their
    access to Workforce; the rule plays no part in it.</li>
</ol>

<h2>How to confirm it works</h2>
<table>
  <thead>${th('Check', 'How')}</thead>
  <tbody>${CHECKS.map(([c, h]) => `<tr><td style="width:28%"><strong>${c}</strong></td><td>${h}</td></tr>`).join('')}</tbody>
</table>
<div class="note"><strong>Rollback.</strong> A snapshot of the application is exported before the
import; that snapshot is the way back. The rules themselves can also be disabled in place, which
restores the previous behaviour immediately without a restore.</div>

<p class="small">Everything above is a suggested configuration, to be confirmed by ${CAP} before it
is applied to the production environment.</p>
`;

const CSS_EXTRA = `
.grid{width:100%;border-collapse:separate;border-spacing:3px;table-layout:fixed;margin:8px 0}
.grid th{border-radius:3px;text-align:center;font-size:8.2pt}
.grid th:first-child{text-align:left}
.grid td{background:#f6f8f9;border:0;border-radius:3px;font-size:8.4pt}
.grid td.mx{text-align:center;font-size:8.2pt;font-weight:600}
.pill{white-space:nowrap}
h2.page-break{margin-top:0}
`;

const html = page(`${CAP} — Workforce Data Access`, body).replace('</style>', CSS_EXTRA + '</style>');
const outDir = path.join(DIR, 'security');
renderPdf(html, path.join(outDir, 'workforce-security.html'),
  path.join(outDir, `workforce-security-${CLIENT}-${TODAY}.pdf`))
  .catch(e => { console.error('ERROR: ' + e.message); process.exit(1); });
