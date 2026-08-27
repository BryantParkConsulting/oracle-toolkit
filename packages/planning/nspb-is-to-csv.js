#!/usr/bin/env node
'use strict';
/**
 * nspb-is-to-csv.js — pull an income statement roll-up from Planning into a flat CSV.
 *
 *   node packages/planning/nspb-is-to-csv.js <client> --year FY26 --through TP7 --out <file.csv>
 *
 * Emits: account,alias,TP1..TPn,YTD — one row per roll-up line, in statement order.
 * Read-only. Password from ~/.epm/<client>.pass or EPM_PASS, never an argument.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const die = (m) => { console.error('ERROR: ' + m); process.exit(1); };
const argv = process.argv.slice(2);
const client = argv[0];
if (!client || client.startsWith('--')) die('usage: nspb-is-to-csv.js <client> --year FY26 --through TP7 --out f.csv');
const flag = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };

const YEAR = flag('year', 'FY26');
const SCENARIO = flag('scenario', 'Actual');
const nPeriods = Number(String(flag('through', 'TP12')).replace(/\D/g, '')) || 12;
const PER = Array.from({ length: nPeriods }, (_, i) => 'TP' + (i + 1));
const OUT = flag('out', path.resolve(`income-statement-${YEAR}.csv`));

// Statement order. These are the Planning roll-up members, not GL accounts — the labels are
// what a reader expects to see, the members are what the cube actually holds.
const LINES = [
  ['Income', 'Revenue'],
  ['Cost of Sales', 'Cost of Sales'],
  ['Gross Profit', 'Gross Profit'],
  ['P_63000', 'Payroll & Benefits'],
  ['P_64000', 'IT & Communications'],
  ['P_70000', 'Depreciation & Amortization'],
  ['P_81000', 'Tax Provision'],
  ['Expense', 'Total Operating Expenses'],
  ['Ordinary Income/Expense', 'Operating Income'],
  ['Net Other Income', 'Other Income (Expense)'],
  ['Net Income', 'Net Income'],
];

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

const body = {
  gridDefinition: {
    suppressMissingBlocks: false,
    pov: {
      dimensions: ['Scenario', 'Years', 'Version', 'Currency', 'Subsidiary',
        'Department', 'Class', 'Location', 'Relationship', 'Item', 'Tracker'],
      members: [[SCENARIO], [YEAR], ['Base'], ['USD'], ['TS'],
        ['TD'], ['TC'], ['TL'], ['TR'], ['TI'], ['Amount']],
    },
    columns: [{ dimensions: ['Period'], members: [PER] }],
    rows: [{ dimensions: ['Account'], members: [LINES.map((l) => l[0])] }],
  },
};

fetch(`${base}/applications/${cfg.app || 'NetSuite'}/plantypes/Plan/exportdataslice`, {
  method: 'POST',
  headers: { Authorization: auth, 'Content-Type': 'application/json', Accept: 'application/json' },
  body: JSON.stringify(body),
}).then(async (r) => {
  const txt = await r.text();
  if (!r.ok) die(`Planning ${r.status}: ${txt.slice(0, 300)}`);
  const j = JSON.parse(txt);
  const got = new Map();
  for (const row of j.rows || []) {
    got.set((row.headers || [])[0], (row.data || []).map((v) => (v === '' || v == null ? 0 : Number(v))));
  }
  const out = [['line', ...PER, 'YTD'].join(',')];
  for (const [member, label] of LINES) {
    const d = got.get(member) || new Array(nPeriods).fill(0);
    const ytd = d.reduce((a, b) => a + b, 0);
    out.push([`"${label}"`, ...d.map((v) => v.toFixed(2)), ytd.toFixed(2)].join(','));
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, out.join('\n') + '\n', 'utf8');
  console.log(`wrote ${OUT} (${LINES.length} lines, ${nPeriods} periods)`);
});
