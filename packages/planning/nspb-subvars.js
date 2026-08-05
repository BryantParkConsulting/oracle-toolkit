#!/usr/bin/env node
'use strict';
/**
 * nspb-subvars.js — read a tenant's substitution variables LIVE, diff them against the LCM
 * snapshot, and flag the ones that have drifted out of step with the close.
 *
 *   node packages/planning/nspb-subvars.js <client> [--csv out.csv] [--quiet]
 *
 * WHY THIS IS NOT JUST A LISTING
 * Substitution variables are the POV every form and financial report opens on. When they fall
 * behind the close nothing errors — the reports simply render an old period, and whoever opens
 * them reads a stale number as current. On PRA the close was FY26/TP7 while every &Rpt*
 * variable still pointed at FY24/TP11: two years behind, silently.
 *
 * So this compares three things:
 *   1. live vs the LCM snapshot  -> what changed since the export
 *   2. &Rpt* vs &LastClosed*     -> reporting POV drifting behind the close
 *   3. anything set to "No Account" / "No Entity" -> template slots never wired up, which
 *      matters because rules referencing them are silent no-ops
 *
 * Read-only. Password from ~/.epm/<client>.pass or EPM_PASS, never an argument.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const die = (m) => { console.error('ERROR: ' + m); process.exit(1); };
const argv = process.argv.slice(2);
const client = argv[0];
if (!client || client.startsWith('--')) die('usage: nspb-subvars.js <client> [--csv out.csv]');
const flag = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const CSV = flag('csv', null);
const QUIET = argv.includes('--quiet');

const EPM_HOME = process.env.EPM_HOME || path.join(os.homedir(), '.epm');
const cfg = JSON.parse(fs.readFileSync(path.join(EPM_HOME, 'clients.json'), 'utf8'))[client];
if (!cfg) die(`no "${client}" in clients.json`);
let pass = process.env.EPM_PASS;
if (!pass) {
  const pf = path.join(EPM_HOME, `${client}.pass`);
  if (!fs.existsSync(pf)) die(`no password: set EPM_PASS or create ${pf}`);
  pass = fs.readFileSync(pf, 'utf8').replace(/^﻿/, '').trim();
}
const base = String(cfg.url).replace(/\/+$/, '') + '/HyperionPlanning/rest/v3';
const auth = 'Basic ' + Buffer.from(cfg.user + ':' + pass).toString('base64');

const clean = (v) => String(v == null ? '' : v).replace(/^"|"$/g, '').trim();
const periodNum = (v) => { const m = /^TP(\d{1,2})$/.exec(clean(v)); return m ? Number(m[1]) : null; };
const yearNum = (v) => { const m = /^FY(\d{2,4})$/.exec(clean(v)); return m ? Number(m[1]) : null; };

function lcmSnapshot() {
  const p = path.join(ROOT, 'clients', client, 'lcm', 'tenant-kb.json');
  if (!fs.existsSync(p)) return null;
  const kb = JSON.parse(fs.readFileSync(p, 'utf8'));
  const m = new Map();
  for (const v of kb.substitutionVariables || []) m.set(v.name, clean(v.value));
  return m;
}

(async () => {
  const r = await fetch(`${base}/applications/${cfg.app || 'NetSuite'}/substitutionvariables`,
    { headers: { Authorization: auth, Accept: 'application/json' } });
  const txt = await r.text();
  if (!r.ok) die(`Planning ${r.status}: ${txt.slice(0, 300)}`);
  const live = (JSON.parse(txt).items || [])
    .map((x) => ({ name: x.name, value: clean(x.value), planType: x.planType || 'All' }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const snap = lcmSnapshot();
  const get = (n) => (live.find((x) => x.name === n) || {}).value;

  // --- drift of the reporting POV behind the close
  const closedYr = yearNum(get('LastClosedYr'));
  const closedMth = periodNum(get('LastClosedMonth'));
  const rptYr = yearNum(get('RptYr'));
  const rptMth = periodNum(get('RptMth'));
  const yearsBehind = (closedYr != null && rptYr != null) ? closedYr - rptYr : null;

  const rows = live.map((v) => {
    const was = snap ? snap.get(v.name) : undefined;
    const notes = [];
    if (snap && was === undefined) notes.push('new since LCM');
    else if (snap && was !== v.value) notes.push(`changed since LCM (was ${was})`);
    if (/^(No Account|No Entity|No Currency)$/i.test(v.value)) notes.push('unmapped template slot');
    if (/^Rpt/.test(v.name) && yearsBehind) notes.push(`reporting POV ${yearsBehind}y behind the close`);
    return { ...v, lcm: was === undefined ? '' : was, notes: notes.join('; ') };
  });

  if (CSV) {
    const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
    fs.mkdirSync(path.dirname(path.resolve(CSV)), { recursive: true });
    fs.writeFileSync(path.resolve(CSV),
      ['variable,value,cube,in LCM,note']
        .concat(rows.map((v) => [q(v.name), q(v.value), q(v.planType), q(v.lcm), q(v.notes)].join(',')))
        .join('\n') + '\n', 'utf8');
    console.log(`wrote ${path.resolve(CSV)} (${rows.length} variables)`);
  }

  if (QUIET) return;

  console.log(`\n${rows.length} substitution variables — ${cfg.url}\n`);
  for (const v of rows) {
    console.log(`  ${v.name.padEnd(22)} ${v.value.padEnd(34)} ${v.planType.padEnd(9)} ${v.notes}`);
  }

  console.log('\n--- checks ---');
  console.log(`close        : ${get('LastClosedYr')} / ${get('LastClosedMonth')}`);
  console.log(`reporting POV: ${get('RptYr')} / ${get('RptMth')}`);
  if (yearsBehind) {
    console.log(`\n  ⚠ the reporting POV is ${yearsBehind} year(s) behind the close.`);
    console.log('    Forms and reports driven by &RptYr / &RptMth open on an old period and');
    console.log('    render without error — a stale number reads as current.');
  } else if (closedMth != null && rptMth != null && rptMth !== closedMth) {
    console.log(`\n  ⚠ &RptMth (${get('RptMth')}) does not match &LastClosedMonth (${get('LastClosedMonth')}).`);
  } else {
    console.log('  reporting POV is in step with the close.');
  }

  const unmapped = rows.filter((v) => /unmapped/.test(v.notes));
  if (unmapped.length) {
    console.log(`\n  ${unmapped.length} unmapped template slots: ${unmapped.map((v) => v.name).join(', ')}`);
    console.log('    Rules that reference these are silent no-ops.');
  }

  const drifted = rows.filter((v) => /changed since LCM|new since LCM/.test(v.notes));
  console.log(`\n  ${drifted.length} changed since the LCM export${drifted.length ? ': ' + drifted.map((v) => v.name).join(', ') : ''}`);
})();
