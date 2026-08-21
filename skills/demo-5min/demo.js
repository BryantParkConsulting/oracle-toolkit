#!/usr/bin/env node
'use strict';
/**
 * demo.js — the five-minute Oracle Toolkit walkthrough, driven from a snapshot.
 *
 *   node skills/demo-5min/demo.js 1     NetSuite: connect, chart of accounts, custom fields
 *   node skills/demo-5min/demo.js 2     NSPB: build the Account dimension, package for LCM
 *   node skills/demo-5min/demo.js 3     the saved search definition
 *   node skills/demo-5min/demo.js all   the three back to back
 *
 * WHY IT READS A SNAPSHOT AND NOT THE LIVE ACCOUNT
 *   Five minutes in front of an audience is not the place to discover that a token expired
 *   or that SuiteQL is throttling. Every figure below is real — extracted from the PRA
 *   account by the normal pipeline — but it is read from clients/pra/ rather than fetched
 *   now, so the run takes the same time every time and cannot fail. The banner says so;
 *   do not present it as a live connection.
 *
 * Pacing is deliberate: PACE=fast for a rehearsal, PACE=slow if the room is asking
 * questions. Nothing here writes to NetSuite or to Planning.
 */
const fs = require('fs');
const path = require('path');

// The skill is also installed under ~/.claude/skills/, where __dirname no longer sits
// inside the repo. TOOLKIT_ROOT overrides; otherwise walk up looking for clients/.
const findRoot = () => {
  if (process.env.TOOLKIT_ROOT) return process.env.TOOLKIT_ROOT;
  let d = __dirname;
  for (let i = 0; i < 5; i++) {
    if (fs.existsSync(path.join(d, 'clients')) && fs.existsSync(path.join(d, 'packages'))) return d;
    d = path.join(d, '..');
  }
  return 'C:/apps/oracle-toolkit';
};
const ROOT = findRoot();
const CLIENT = process.env.DEMO_CLIENT || 'pra';
const DIR = path.join(ROOT, 'clients', CLIENT);
const OUT = path.join(ROOT, 'output', 'demo');

// Tempo of the fake progress. The numbers are already computed; this only controls how
// fast they appear, so the story lands instead of flashing past.
const PACE = { fast: 0.35, normal: 1, slow: 1.8 }[process.env.PACE || 'normal'] || 1;
const sleep = (ms) => new Promise((r) => setTimeout(r, Math.round(ms * PACE)));

const C = {
  navy: '\x1b[38;5;24m', gold: '\x1b[38;5;178m', sage: '\x1b[38;5;72m',
  dim: '\x1b[2m', bold: '\x1b[1m', off: '\x1b[0m', red: '\x1b[38;5;167m',
};
const say = (s = '') => console.log(s);
const rd = (p) => { try { return JSON.parse(fs.readFileSync(path.join(DIR, p), 'utf8')); } catch { return null; } };

function rule(label) {
  say('');
  say(`${C.navy}${'─'.repeat(74)}${C.off}`);
  if (label) say(`${C.bold}${label}${C.off}`);
  say('');
}

/** A progress line that overwrites itself, so the terminal stays clean. */
async function step(label, ms = 900, detail = '') {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  const started = Date.now();
  let i = 0;
  const timer = setInterval(() => {
    process.stdout.write(`\r  ${C.gold}${frames[i++ % frames.length]}${C.off} ${label}   `);
  }, 80);
  await sleep(ms);
  clearInterval(timer);
  const took = ((Date.now() - started) / 1000).toFixed(1);
  process.stdout.write(`\r  ${C.sage}✓${C.off} ${label}${detail ? `  ${C.dim}${detail}${C.off}` : ''}  ${C.dim}${took}s${C.off}\n`);
}

const fmt = (n) => Number(n || 0).toLocaleString('en-US');

/** Fixed-width table. Truncates rather than wrapping — a wrapped row ruins the read. */
function table(headers, rows, widths) {
  const line = (cells, pad = ' ') => '  ' + cells.map((c, i) => {
    const w = widths[i];
    const s = String(c ?? '');
    return (s.length > w ? s.slice(0, w - 1) + '…' : s).padEnd(w, pad);
  }).join('  ');
  say(`${C.navy}${C.bold}${line(headers)}${C.off}`);
  say(`${C.dim}${line(widths.map(() => ''), '─')}${C.off}`);
  for (const r of rows) say(line(r));
}

function banner() {
  say('');
  say(`${C.navy}${C.bold}  ORACLE TOOLKIT${C.off}  ${C.dim}· Bryant Park Consulting${C.off}`);
  say(`${C.dim}  Snapshot of the ${CLIENT.toUpperCase()} account — real extracted data, replayed offline.${C.off}`);
}

// ─────────────────────────────────────────────────────────── act 1: NetSuite
async function act1() {
  banner();
  rule('Connect to the customer account');

  const probe = rd('netsuite/probe.json') || {};
  await step('Authenticating over token-based access', 700, `account ${probe.account || '—'}`);
  await step('Negotiating SuiteQL endpoint', 500, 'REST · read-only');

  const T = {};
  for (const t of Object.values(probe.modules || {})) Object.assign(T, t);
  const n = (k) => (T[k]?.exists ? Number(T[k].rows ?? 0) : 0);

  await step('Probing record types', 1100, `${Object.keys(T).length} tables visible to this role`);
  say('');
  // transactionline is not in the probe on every role, so only mention what was measured.
  const facts = [
    [n('transaction'), 'transactions'], [n('transactionline'), 'lines'],
    [n('account'), 'GL accounts'], [n('customer'), 'customers'], [n('item'), 'items'],
  ].filter(([v]) => v > 0).map(([v, l]) => `${fmt(v)} ${l}`);
  say('  ' + facts.join(' · '));

  rule('Pull the chart of accounts');
  const coa = rd('netsuite/coa.json') || [];
  await step('SELECT id, acctnumber, accttype, name FROM account', 1200, `${fmt(coa.length)} rows`);

  const byType = {};
  for (const a of coa) byType[a.accttype] = (byType[a.accttype] || 0) + 1;
  const top = Object.entries(byType).sort((a, b) => b[1] - a[1]).slice(0, 6);

  say('');
  table(['Account type', 'Accounts'], top.map(([t, c]) => [t, fmt(c)]), [28, 10]);
  say('');
  say(`  ${C.dim}Sample:${C.off}`);
  table(['Number', 'Type', 'Name'],
    coa.filter((a) => a.isinactive === 'F').slice(0, 6).map((a) => [a.acctnumber, a.accttype, a.name]),
    [10, 14, 42]);

  rule('Find the pricing and inventory custom fields');
  const shape = rd('netsuite/shape.json') || {};
  const cf = shape.custom_fields || [];
  await step('Scanning custom field definitions', 1400, `${fmt(cf.length)} defined`);

  // This is an events agency: the unit of business is the program, not the GL account.
  // Only CUSTCOL (line) and CUSTBODY (header) fields can carry it — a CUSTRECORD lives on
  // a custom record and never appears on a transaction, so matching on name alone returns
  // leasing and fixed-asset fields that read plausibly and are useless here.
  const want = /program|event|margin|markup|budget/i;
  const hits = cf.filter((f) => /^(CUSTCOL|CUSTBODY)/i.test(f.scriptid || '') && want.test(f.name || ''));
  await step('Matching against the reporting requirement', 800, `${hits.length} on transactions`);

  say('');
  table(['Field', 'Type', 'scriptid', 'Stored'],
    hits.slice(0, 8).map((f) => [f.name, f.fieldvaluetype || f.fieldtype, f.scriptid,
      f.isstored === 'T' ? 'yes' : 'no']),
    [26, 12, 34, 6]);
  say('');
  // isstored='F' is the trap that costs an afternoon: the field shows in the UI, and
  // SuiteQL returns nothing for it. It is computed at render time, not persisted.
  const stored = hits.filter((f) => f.isstored === 'T');
  say(`  ${C.dim}Only the stored ones can be queried — an unstored field is computed at`);
  say(`  render time and comes back empty over SuiteQL. That leaves ${stored.length}.${C.off}`);
  say('');
  // Three separate Program fields is not tidy data — it is implementation archaeology,
  // and it only shows up when you read the metadata rather than the UI.
  const prog = hits.filter((f) => /program/i.test(f.name || ''));
  if (prog.length > 1) {
    say(`  ${C.gold}${prog.length} different Program fields${C.off} — successive implementations, each`);
    say(`  ${C.dim}leaving its own. One of them is scripted CUSTBODYCUSTBODY_, which is a typo`);
    say(`  that shipped. Deciding which one is authoritative is the first hour of work.${C.off}`);
  }

  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'coa.json'), JSON.stringify(coa, null, 2));
  fs.writeFileSync(path.join(OUT, 'custom-fields.json'), JSON.stringify(hits, null, 2));
  say('');
  say(`  ${C.sage}→${C.off} output/demo/coa.json · output/demo/custom-fields.json`);
}

// ──────────────────────────────────────────── act 1.5: the technical footprint
/**
 * For the ERP side of the room. The business half of the demo says what the numbers mean;
 * this says what the account is made of — who owns which objects, what is deployed and
 * dead, and which integrations still hold live tokens. All of it is read from metadata
 * that nobody opens by hand.
 */
async function actTech() {
  rule('What the account is actually made of');

  const shape = rd('netsuite/shape.json') || {};
  const conn = rd('erp/connectors.json') || {};
  const cf = shape.custom_fields || [];
  const prefixes = conn.prefixes || [];

  await step('Attributing custom objects to their bundle', 1200, `${fmt(cf.length)} fields`);

  // A prefixed object belongs to the SuiteApp that created it and gets overwritten on the
  // next bundle update. Editing one is the classic way to lose a day's work silently.
  const owned = prefixes.reduce((a, p) => a + Number(p.objects || 0), 0);
  say('');
  table(['Prefix', 'Objects', 'Owner'],
    prefixes.slice(0, 6).map((p) => [p.prefix, fmt(p.objects),
      (p.bundle || '—').replace(/\s*[-—]?\s*(Bundle Installation|SuiteApp Install)\s*$/i, '').trim()]),
    [10, 9, 40]);
  say('');
  say(`  ${C.dim}Prefixed objects belong to their SuiteApp and are replaced on the next`);
  say(`  bundle update. Touch one and the change disappears without a warning.${C.off}`);

  rule('Deployed and dead');
  const dep = shape.deployments_by_type || [];
  const byStatus = {};
  for (const d of dep) byStatus[d.status] = (byStatus[d.status] || 0) + Number(d.n || 0);
  const totalDep = Object.values(byStatus).reduce((a, b) => a + b, 0);
  const idle = byStatus.NOTSCHEDULED || 0;

  await step('Reading script deployments', 1000, `${fmt(totalDep)} deployments`);
  say('');
  table(['Status', 'Deployments', 'Share'],
    Object.entries(byStatus).sort((a, b) => b[1] - a[1])
      .map(([s, n]) => [s, fmt(n), `${(100 * n / totalDep).toFixed(0)}%`]),
    [16, 13, 8]);
  say('');
  say(`  ${C.gold}${(100 * idle / totalDep).toFixed(0)}% of deployments never run.${C.off} ` +
      `${C.dim}Scheduled and MapReduce scripts that exist,`);
  say(`  are deployed, and are set to NOTSCHEDULED. Either they are leftovers from`);
  say(`  implementations that ended, or something that should be running is not.${C.off}`);

  rule('Integrations holding live tokens');
  const ints = (conn.integrations || []).filter((i) => Number(i.activos) > 0);
  await step('Enumerating integration records', 900, `${ints.length} with active tokens`);
  say('');
  table(['Application', 'Active', 'Revoked', 'First seen'],
    ints.slice(0, 6).map((i) => [i.app, i.activos, i.revocados, i.desde]),
    [30, 8, 9, 12]);

  // The NSPB bundle being present changes the commercial conversation entirely.
  const nspb = prefixes.find((p) => p.prefix === 'nspbcs');
  if (nspb) {
    say('');
    say(`  ${C.sage}The NSPB bundle is installed${C.off} — ${fmt(nspb.objects)} objects. Planning is not`);
    say(`  ${C.dim}something to sell them. It is something they already own and are not using.${C.off}`);
  }
}

// ────────────────────────────────────────────────────────────── act 2: NSPB
async function act2() {
  rule('Connect to Planning and build the Account dimension');

  await step('Authenticating against the Planning pod', 800, 'REST v3');
  await step('Reading the target application', 600, 'cube: Plan1');

  const coa = rd('netsuite/coa.json') || [];
  const active = coa.filter((a) => a.isinactive === 'F' && a.issummary === 'F');
  await step('Mapping NetSuite account types to Planning members', 1300, `${fmt(active.length)} level-0 members`);

  // NetSuite account type decides the member's account type and its consolidation sign.
  // Getting this wrong is the classic reason a Planning P&L never ties to the GL.
  const TYPE = {
    Income: ['Revenue', '+'], OthIncome: ['Revenue', '+'],
    COGS: ['Expense', '-'], Expense: ['Expense', '-'], OthExpense: ['Expense', '-'],
    Bank: ['Asset', '+'], AcctRec: ['Asset', '+'], OthCurrAsset: ['Asset', '+'],
    FixedAsset: ['Asset', '+'], OthAsset: ['Asset', '+'],
    AcctPay: ['Liability', '-'], OthCurrLiab: ['Liability', '-'], LongTermLiab: ['Liability', '-'],
    Equity: ['Equity', '-'],
  };
  const rows = active.map((a) => {
    const [type, sign] = TYPE[a.accttype] || ['Saved Assumption', '+'];
    return { member: a.acctnumber, alias: String(a.name).replace(/^\d+\s+/, ''), type, sign, source: a.accttype };
  });

  const counts = {};
  for (const r of rows) counts[r.type] = (counts[r.type] || 0) + 1;
  say('');
  table(['Planning account type', 'Members', 'From NetSuite'],
    Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([t, c]) => [
      t, fmt(c), Object.entries(TYPE).filter(([, v]) => v[0] === t).map(([k]) => k).slice(0, 3).join(', '),
    ]), [22, 9, 34]);

  await step('Generating the dimension file', 900, 'Account.csv');
  await step('Packaging for Lifecycle Management', 1100, 'zip with metadata descriptor');

  fs.mkdirSync(OUT, { recursive: true });
  const csv = ['Account,Parent,Alias: Default,Account Type,Time Balance,Data Storage']
    .concat(rows.slice(0, 400).map((r) =>
      `${r.member},"${r.type}","${r.alias.replace(/"/g, '""')}",${r.type},Flow,Store`));
  fs.writeFileSync(path.join(OUT, 'Account.csv'), csv.join('\n') + '\n', 'utf8');

  say('');
  say(`  ${C.sage}→${C.off} output/demo/Account.csv  ${C.dim}(${fmt(rows.length)} members)${C.off}`);
  say('');
  say(`  ${C.bold}To import:${C.off}`);
  say(`  ${C.dim}1.${C.off} Application → Overview → Dimensions → Import`);
  say(`  ${C.dim}2.${C.off} Load type "Replace", target dimension Account`);
  say(`  ${C.dim}3.${C.off} Refresh the database before entering data`);
  say('');
  say(`  ${C.dim}Nothing was written to the tenant — this is the artifact, ready to import.${C.off}`);
}

// ──────────────────────────────────────────────────── act 3: the saved search
async function act3() {
  rule('The saved search behind the custom field');

  // Same filter as act 1, and stored-only: the query below has to be runnable. A
  // custrecord_ column does not exist on transactionline, so picking one would produce a
  // statement that reads fine and errors the moment anyone tries it.
  const shape = rd('netsuite/shape.json') || {};
  const cf = (shape.custom_fields || []).filter((f) =>
    /^CUSTCOL/i.test(f.scriptid || '') && /pric|rate|margin|markup|discount/i.test(f.name || ''));
  const field = cf.find((f) => f.isstored === 'T') || cf[0];

  await step('Resolving field ownership and record type', 700, field ? field.scriptid : '—');
  await step('Composing the search definition', 900, 'transaction · summary');

  say('');
  say(`  ${C.bold}Saved Search — Pricing by item and period${C.off}`);
  say('');
  const def = [
    ['Search Type', 'Transaction'],
    ['Criteria', 'Main Line = false · Posting = true · Account Type = Income'],
    ['', 'Date within = Last Fiscal Year'],
    ['Summary', 'Group: Item · Group: Period · Sum: Amount · Avg: Rate'],
    ['Custom field', field ? `${field.name} (${field.scriptid})` : '—'],
    ['Results', 'Item · Period · Quantity · Rate · Amount · the custom field'],
    ['Available filters', 'Subsidiary · Class · Department'],
  ];
  table(['', ''], def, [18, 54]);

  say('');
  say(`  ${C.bold}Equivalent SuiteQL${C.off} ${C.dim}— what the toolkit runs directly${C.off}`);
  say('');
  const sql = [
    'SELECT  tl.item, ap.periodname,',
    '        SUM(tl.quantity)      AS qty,',
    '        SUM(tl.netamount)     AS amount,',
    `        MAX(tl.${field ? String(field.scriptid).toLowerCase() : 'custcol_rate'}) AS custom_value`,
    'FROM    transactionline tl',
    'JOIN    transaction t        ON t.id = tl.transaction',
    'JOIN    accountingperiod ap  ON ap.id = t.postingperiod',
    "WHERE   tl.mainline = 'F' AND t.posting = 'T'",
    'GROUP BY tl.item, ap.periodname',
    'ORDER BY amount DESC',
  ];
  for (const l of sql) say(`  ${C.dim}│${C.off} ${l}`);

  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'saved-search.sql'), sql.join('\n') + '\n', 'utf8');
  say('');
  say(`  ${C.sage}→${C.off} output/demo/saved-search.sql`);
  say('');
  say(`  ${C.dim}Run it for real:${C.off} node packages/netsuite/ns-sql.js "$(cat output/demo/saved-search.sql)"`);
  say('');
}

(async () => {
  const which = (process.argv[2] || 'all').toLowerCase();
  try {
    if (!fs.existsSync(DIR)) {
      say(`${C.red}No snapshot at ${DIR}${C.off} — set DEMO_CLIENT to a client that has one.`);
      process.exit(1);
    }
    // Between acts the demo waits for a keypress rather than rolling on. The talking is
    // what fills five minutes — the computation is seconds — so the operator decides when
    // the next act starts. HANDS_FREE=1 runs it straight through for a rehearsal.
    const pause = async (next) => {
      if (which !== 'all' || process.env.HANDS_FREE) return;
      say('');
      say(`  ${C.dim}— press enter for ${next} —${C.off}`);
      await new Promise((r) => process.stdin.once('data', r));
    };

    if (which === '1' || which === 'all') await act1();
    if (which === 'all') await pause('the technical footprint');
    if (which === 'tech' || which === '1.5' || which === 'all') await actTech();
    if (which === 'all') await pause('Planning');
    if (which === '2' || which === 'all') await act2();
    if (which === 'all') await pause('the saved search');
    if (which === '3' || which === 'all') await act3();
    if (which === 'all' && !process.env.HANDS_FREE) process.stdin.pause();
    say('');
  } catch (e) {
    say(`${C.red}${e.message}${C.off}`);
    process.exit(1);
  }
})();
