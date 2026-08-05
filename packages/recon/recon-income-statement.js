#!/usr/bin/env node
'use strict';
/**
 * recon-income-statement.js — reconcile a Planning (NSPB) income statement against the
 * NetSuite general ledger, account by account and period by period.
 *
 *   node packages/recon/recon-income-statement.js <client> --year FY26 [--through TP7]
 *                                                 [--scenario Actual] [--out <file.csv>]
 *
 * WHY BOTH SIDES NEED A TRANSLATION
 *   - NetSuite stores income as a credit, so revenue arrives negative. Planning stores the
 *     statement the way a human reads it. Every comparison flips the NetSuite sign; a "delta"
 *     here is a real difference, never a convention.
 *   - Planning periods are TP1..TP12. They map to the NetSuite accounting periods ordered by
 *     start date within the fiscal year, so TP6 is the sixth open period, not "June" by name.
 *
 * WHAT IT READS
 *   - Planning: POST /HyperionPlanning/rest/v3/applications/<app>/plantypes/<cube>/exportdataslice
 *     Basic Auth, password from ~/.epm/<client>.pass or EPM_PASS. Never an argument.
 *   - NetSuite: SuiteQL through packages/netsuite/ns-sql.js, aggregated server-side. It never
 *     pulls transaction detail — transactionline is millions of rows on a real tenant.
 *   - The account hierarchy comes from the parsed LCM export
 *     (clients/<client>/lcm/extracted/.../Account.csv), which is the only place the Planning
 *     roll-up is written down. Without it there is no way to know which leaf accounts belong
 *     under Net Income.
 *
 * READ-ONLY on both systems.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const EPM_HOME = process.env.EPM_HOME || path.join(os.homedir(), '.epm');
const die = (m) => { console.error('ERROR: ' + m); process.exit(1); };

// ---------------------------------------------------------------- args
const argv = process.argv.slice(2);
const client = argv[0];
if (!client || client.startsWith('--')) die('usage: recon-income-statement.js <client> --year FY26 [--through TP7]');
const flag = (name, dflt) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};
const YEAR = flag('year', 'FY26');
const THROUGH = flag('through', 'TP12');
const SCENARIO = flag('scenario', 'Actual');
const OUT = flag('out', path.join(ROOT, 'clients', client, `recon-income-statement-${YEAR}.csv`));
const nPeriods = Number(String(THROUGH).replace(/\D/g, '')) || 12;
const PERIODS = Array.from({ length: nPeriods }, (_, i) => 'TP' + (i + 1));

// ---------------------------------------------------------------- planning auth
const cfg = JSON.parse(fs.readFileSync(path.join(EPM_HOME, 'clients.json'), 'utf8'))[client];
if (!cfg) die(`no "${client}" in ${path.join(EPM_HOME, 'clients.json')}`);
let PASS = process.env.EPM_PASS;
if (!PASS) {
  const pf = path.join(EPM_HOME, `${client}.pass`);
  if (!fs.existsSync(pf)) die(`no password: set EPM_PASS or create ${pf}`);
  PASS = fs.readFileSync(pf, 'utf8').replace(/^﻿/, '').trim();
}
const BASE = String(cfg.url).replace(/\/+$/, '') + '/HyperionPlanning/rest/v3';
const APP = cfg.app || 'NetSuite';
const AUTH = 'Basic ' + Buffer.from(cfg.user + ':' + PASS).toString('base64');

// ---------------------------------------------------------------- account hierarchy (LCM)
function loadAccounts() {
  const dir = path.join(ROOT, 'clients', client, 'lcm', 'extracted');
  if (!fs.existsSync(dir)) die(`no parsed LCM at ${dir} — unzip the export there first`);
  const hits = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name === 'Account.csv') hits.push(p);
    }
  })(dir);
  if (!hits.length) die('Account.csv not found inside the LCM export');

  // The file starts with an XML header block; the real CSV header is the line beginning
  // "Account, Parent," further down. Splitting on it is what makes this parseable at all.
  const lines = fs.readFileSync(hits[0], 'utf8').replace(/^﻿/, '').split(/\r?\n/);
  const h = lines.findIndex((l) => /^Account,\s*Parent,/.test(l));
  if (h < 0) die('could not find the CSV header inside Account.csv');

  const parent = new Map();      // child -> parent
  const children = new Map();    // parent -> [children]
  const alias = new Map();
  for (const line of lines.slice(h + 1)) {
    if (!line.trim()) continue;
    const c = splitCsv(line);
    const [name, par, ali] = [c[0], c[1], c[2]];
    if (!name) continue;
    parent.set(name, par);
    alias.set(name, ali || '');
    if (!children.has(par)) children.set(par, []);
    children.get(par).push(name);
  }
  return { parent, children, alias };
}

function splitCsv(line) {
  const out = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
    else if (ch === ',' && !q) { out.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

/** Leaf accounts under `root` whose name is a bare GL account number. */
function leavesUnder(tree, root) {
  const seen = new Set(), out = [];
  (function walk(n) {
    if (seen.has(n)) return;
    seen.add(n);
    const kids = tree.children.get(n);
    if (!kids || !kids.length) { if (/^\d{3,8}$/.test(n)) out.push(n); return; }
    kids.forEach(walk);
  })(root);
  return out;
}

// ---------------------------------------------------------------- planning slice
async function planningSlice(accounts) {
  const values = new Map();   // account -> [p1..pn]
  const CHUNK = 120;          // the grid payload gets unwieldy past this
  for (let i = 0; i < accounts.length; i += CHUNK) {
    const batch = accounts.slice(i, i + CHUNK);
    const body = {
      gridDefinition: {
        suppressMissingBlocks: true,
        pov: {
          dimensions: ['Scenario', 'Years', 'Version', 'Currency', 'Subsidiary',
            'Department', 'Class', 'Location', 'Relationship', 'Item', 'Tracker'],
          members: [[SCENARIO], [YEAR], ['Base'], ['USD'], ['TS'],
            ['TD'], ['TC'], ['TL'], ['TR'], ['TI'], ['Amount']],
        },
        columns: [{ dimensions: ['Period'], members: [PERIODS] }],
        rows: [{ dimensions: ['Account'], members: [batch] }],
      },
    };
    const r = await fetch(`${BASE}/applications/${APP}/plantypes/Plan/exportdataslice`, {
      method: 'POST',
      headers: { Authorization: AUTH, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });
    const txt = await r.text();
    if (!r.ok) die(`Planning ${r.status}: ${txt.slice(0, 300)}`);
    const j = JSON.parse(txt);
    for (const row of j.rows || []) {
      const acct = (row.headers || [])[0];
      values.set(acct, (row.data || []).map((v) => (v === '' || v == null ? 0 : Number(v))));
    }
    process.stderr.write(`  planning ${Math.min(i + CHUNK, accounts.length)}/${accounts.length}\r`);
  }
  process.stderr.write('\n');
  return values;
}

// ---------------------------------------------------------------- netsuite side
function netsuite() {
  const sql = `
    SELECT a.acctnumber AS acct, a.accttype AS atype, ap.periodname AS per, ap.startdate AS sd,
           SUM(tal.amount) AS amt
      FROM transactionaccountingline tal
      JOIN transaction t ON t.id = tal.transaction
      JOIN accountingperiod ap ON ap.id = t.postingperiod
      JOIN account a ON a.id = tal.account
     WHERE tal.posting = 'T'
       AND ap.isquarter = 'F' AND ap.isyear = 'F'
       AND ap.startdate >= TO_DATE('${Number(YEAR.replace(/\D/g, '')) + 2000}-01-01','YYYY-MM-DD')
       AND ap.startdate <  TO_DATE('${Number(YEAR.replace(/\D/g, '')) + 2001}-01-01','YYYY-MM-DD')
       AND a.accttype IN ('Income','COGS','Expense','OthIncome','OthExpense')
     GROUP BY a.acctnumber, a.accttype, ap.periodname, ap.startdate
     ORDER BY ap.startdate, a.acctnumber`;
  const raw = execFileSync(process.execPath,
    [path.join(ROOT, 'packages', 'netsuite', 'ns-sql.js'), sql, '--json'],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  let rows;
  try { rows = JSON.parse(raw); } catch { die('ns-sql.js did not return JSON — run it with --json manually to see why'); }
  rows = rows.items || rows;

  // SuiteQL hands back start dates as "M/D/YYYY" strings. Sorting those as text puts
  // October and November ahead of February, which silently shifts every account into the
  // wrong period — the numbers still look plausible, which is what makes it dangerous.
  const toTime = (s) => {
    const [m, d, y] = String(s).split('/').map(Number);
    return new Date(y, m - 1, d).getTime();
  };
  const order = [...new Set(rows.map((r) => r.SD || r.sd))].sort((a, b) => toTime(a) - toTime(b));
  const idx = new Map(order.map((d, i) => [d, i]));      // start date -> TP index
  const out = new Map();
  const types = new Map();
  for (const r of rows) {
    const acct = String(r.ACCT ?? r.acct ?? '').trim();
    types.set(acct, String(r.ATYPE ?? r.atype ?? ''));
    const i = idx.get(r.SD ?? r.sd);
    if (!acct || i == null || i >= nPeriods) continue;
    if (!out.has(acct)) out.set(acct, new Array(nPeriods).fill(0));
    out.get(acct)[i] += Number(r.AMT ?? r.amt ?? 0);
  }
  return { byAccount: out, types, periodNames: order.slice(0, nPeriods) };
}

// ---------------------------------------------------------------- main
(async () => {
  const tree = loadAccounts();
  const accounts = leavesUnder(tree, 'Net Income');
  if (!accounts.length) die('no numeric leaf accounts under "Net Income" in the LCM hierarchy');
  console.log(`${accounts.length} P&L leaf accounts under Net Income`);

  const [pln, ns] = [await planningSlice(accounts), netsuite()];

  const all = [...new Set([...accounts, ...ns.byAccount.keys()])].sort();
  const rows = [];
  let worst = 0, breaks = 0;
  for (const acct of all) {
    const p = pln.get(acct) || new Array(nPeriods).fill(0);
    // Sign convention, established empirically against FY26 and true per account TYPE:
    // expense/COGS accounts carry the same sign in both systems, but the GL holds revenue as
    // a credit (negative) while Planning stores it the way the statement reads (positive).
    // So the flip applies to income accounts ONLY. Flipping everything, or flipping nothing,
    // both produce a break on every row — which is exactly how this was found.
    const isIncome = /^(Income|OthIncome)$/i.test(ns.types.get(acct) || '');
    const raw = ns.byAccount.get(acct) || new Array(nPeriods).fill(0);
    const n = isIncome ? raw.map((v) => -v) : raw;
    for (let i = 0; i < nPeriods; i++) {
      const d = round2(p[i] - n[i]);
      if (p[i] === 0 && n[i] === 0) continue;
      if (Math.abs(d) >= 0.01) { breaks++; worst = Math.max(worst, Math.abs(d)); }
      rows.push({ account: acct, alias: tree.alias.get(acct) || '', period: ns.periodNames[i] || PERIODS[i],
        planning: round2(p[i]), netsuite: round2(n[i]), delta: d });
    }
  }

  const csv = ['account,alias,period,planning,netsuite,delta']
    .concat(rows.map((r) => [r.account, `"${String(r.alias).replace(/"/g, '""')}"`,
      r.period, r.planning, r.netsuite, r.delta].join(',')));
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, csv.join('\n') + '\n', 'utf8');

  const tp = sumBy(rows, 'planning'), tn = sumBy(rows, 'netsuite');
  console.log(`\nrows compared : ${rows.length}`);
  console.log(`planning total: ${fmt(tp)}`);
  console.log(`netsuite total: ${fmt(tn)}`);
  console.log(`difference    : ${fmt(round2(tp - tn))}`);
  console.log(`account/period breaks (>= $0.01): ${breaks}${breaks ? `  worst ${fmt(worst)}` : ''}`);
  console.log(`\nwrote ${OUT}`);

  if (breaks) {
    console.log('\ntop 15 breaks:');
    rows.filter((r) => Math.abs(r.delta) >= 0.01)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 15)
      .forEach((r) => console.log(`  ${r.account.padEnd(8)} ${String(r.period).padEnd(9)} ` +
        `pln ${fmt(r.planning).padStart(15)}  ns ${fmt(r.netsuite).padStart(15)}  Δ ${fmt(r.delta)}   ${r.alias}`));
  }
})();

function round2(v) { return Math.round((Number(v) + Number.EPSILON) * 100) / 100; }
function sumBy(rows, k) { return round2(rows.reduce((a, r) => a + r[k], 0)); }
function fmt(v) { return Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
