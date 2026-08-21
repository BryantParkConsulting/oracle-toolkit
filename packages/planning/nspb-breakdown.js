#!/usr/bin/env node
'use strict';
/**
 * nspb-breakdown.js — break one account roll-up down by any dimension, to CSV.
 *
 *   node packages/planning/nspb-breakdown.js <client> --by Department --account Expense \
 *        --year FY26 --through TP7 --tracker Load --out opex-by-dept.csv
 *
 *   --by        dimension to put on the rows (Department, Class, Location, Item, ...)
 *   --account   the roll-up to break down (Expense, Income, Cost of Sales, ...)
 *   --tracker   Amount | Load       (see the warning below — this is not cosmetic)
 *   --members   comma-separated row members; default = children of the dimension top
 *   --alias     resolve row codes to their aliases from the parsed LCM (default on)
 *
 * ⚠ THE TRACKER AND THE INTERSECTIONS ARE PER-STATEMENT, NOT PER-TENANT.
 * On the same application PRA's income statement reads Tracker "Amount" at the TD/TC/TL
 * dimension tops, its OpEx forms read Tracker "Load", and its balance sheet lives at the
 * "No Department"/"No Class" intersections. Ask at the wrong one and Planning answers 200 with
 * empty cells — no error, no warning, and it reads as "there is no data" when there is plenty.
 * Before guessing, read the POV of the tenant's own form out of the parsed LCM:
 *
 *   clients/<client>/tenant-kb.json -> forms[].columnDims / columnMembers / povDims
 *
 * Totals are worth checking against the statement: an OpEx breakdown by Department that lands
 * short of "Total Operating Expenses" is not a bug here, it is spend the tenant never tagged.
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
if (!client || client.startsWith('--')) {
  die('usage: nspb-breakdown.js <client> --by Department --account Expense [--year FY26] [--through TP7] [--tracker Load] [--out f.csv]');
}
const flag = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };

const BY = flag('by', 'Department');
const ACCOUNT = flag('account', 'Expense');
const YEAR = flag('year', 'FY26');
const SCENARIO = flag('scenario', 'Actual');
const TRACKER = flag('tracker', 'Amount');
const nPeriods = Number(String(flag('through', 'TP12')).replace(/\D/g, '')) || 12;
const PER = Array.from({ length: nPeriods }, (_, i) => 'TP' + (i + 1));
const OUT = flag('out', path.join(ROOT, 'clients', client,
  `${ACCOUNT}-by-${BY}-${YEAR}`.replace(/[^\w.-]+/g, '-').toLowerCase() + '.csv'));

// Dimension tops, and the default row members for each. "T<x>" is the aggregated top the
// income statement reads; the members underneath it are what a breakdown wants.
const TOP = { Department: 'TD', Class: 'TC', Location: 'TL', Relationship: 'TR', Item: 'TI',
  Subsidiary: 'TS', Account: 'Net Income' };

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

/** Children of a dimension top, plus their aliases, straight out of the parsed LCM. */
function fromLcm(dimension) {
  const dir = path.join(ROOT, 'clients', client, 'lcm', 'extracted');
  if (!fs.existsSync(dir)) return { members: null, alias: {} };
  let file = null;
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.toLowerCase() === dimension.toLowerCase() + '.csv') file = file || p;
    }
  })(dir);
  if (!file) return { members: null, alias: {} };

  const lines = fs.readFileSync(file, 'utf8').replace(/^﻿/, '').split(/\r?\n/);
  const h = lines.findIndex((l) => new RegExp('^' + dimension + ',\\s*Parent,', 'i').test(l));
  if (h < 0) return { members: null, alias: {} };
  const cols = lines[h].split(',').map((c) => c.trim());
  const ai = cols.indexOf('Alias: Default');

  const kids = new Map(); const alias = {};
  for (const line of lines.slice(h + 1)) {
    if (!line.trim()) continue;
    const c = splitCsv(line);
    if (!c[0]) continue;
    alias[c[0]] = ai >= 0 && c[ai] ? c[ai] : '';
    if (!kids.has(c[1])) kids.set(c[1], []);
    kids.get(c[1]).push(c[0]);
  }
  const top = TOP[dimension] || dimension;
  const members = (kids.get(top) || []).filter((m) => !/^Undefined_|^No /i.test(m));
  return { members: members.length ? members : null, alias };
}

function splitCsv(line) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
    else if (ch === ',' && !q) { out.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

(async () => {
  const lcm = fromLcm(BY);
  const explicit = flag('members', null);
  const rowMembers = explicit ? explicit.split(',').map((s) => s.trim()) : lcm.members;
  if (!rowMembers || !rowMembers.length) {
    die(`no members for ${BY} — pass --members a,b,c or unzip the LCM to clients/${client}/lcm/extracted`);
  }
  const useAlias = flag('alias', 'on') !== 'off';

  const ALL = ['Scenario', 'Years', 'Version', 'Currency', 'Subsidiary', 'Department', 'Class',
    'Location', 'Relationship', 'Item', 'Tracker', 'Account'];
  const POV = { Scenario: SCENARIO, Years: YEAR, Version: 'Base', Currency: 'USD',
    Subsidiary: 'TS', Department: 'TD', Class: 'TC', Location: 'TL', Relationship: 'TR',
    Item: 'TI', Tracker: TRACKER, Account: ACCOUNT };
  const povDims = ALL.filter((d) => d !== BY);

  const body = { gridDefinition: { suppressMissingBlocks: true,
    pov: { dimensions: povDims, members: povDims.map((d) => [POV[d]]) },
    columns: [{ dimensions: ['Period'], members: [PER] }],
    rows: [{ dimensions: [BY], members: [rowMembers] }] } };

  const r = await fetch(`${base}/applications/${cfg.app || 'NetSuite'}/plantypes/Plan/exportdataslice`, {
    method: 'POST',
    headers: { Authorization: auth, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  const txt = await r.text();
  if (!r.ok) die(`Planning ${r.status}: ${txt.slice(0, 300)}`);
  const j = JSON.parse(txt);

  const num = (v) => (v === '' || v == null ? 0 : Number(v));
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const lines = [['line', ...PER, 'YTD'].join(',')];
  const grand = new Array(nPeriods).fill(0);
  let kept = 0;

  for (const row of j.rows || []) {
    const key = row.headers[0];
    const d = (row.data || []).map(num);
    if (d.every((v) => v === 0)) continue;             // members with no activity are noise
    d.forEach((v, i) => { grand[i] += v; });
    kept++;
    const label = useAlias && lcm.alias[key] ? lcm.alias[key] : key;
    lines.push([q(label), ...d.map((v) => v.toFixed(2)), d.reduce((a, b) => a + b, 0).toFixed(2)].join(','));
  }
  lines.push([q('TOTAL'), ...grand.map((v) => v.toFixed(2)), grand.reduce((a, b) => a + b, 0).toFixed(2)].join(','));

  fs.mkdirSync(path.dirname(path.resolve(OUT)), { recursive: true });
  fs.writeFileSync(path.resolve(OUT), lines.join('\n') + '\n', 'utf8');

  const total = grand.reduce((a, b) => a + b, 0);
  console.log(`${ACCOUNT} by ${BY}, ${SCENARIO} ${YEAR} ${PER[0]}-${PER[nPeriods - 1]}, Tracker=${TRACKER}`);
  console.log(`  ${kept} of ${rowMembers.length} members carry activity`);
  console.log(`  YTD ${total.toLocaleString('en-US', { maximumFractionDigits: 0 })}`);
  console.log(`  wrote ${path.resolve(OUT)}`);
  if (kept < rowMembers.length) {
    console.log(`\n  ${rowMembers.length - kept} members are empty. If the total falls short of the`);
    console.log('  statement line, the gap is untagged activity, not a query problem.');
  }
})();
