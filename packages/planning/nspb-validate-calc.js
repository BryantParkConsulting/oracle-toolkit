#!/usr/bin/env node
'use strict';
/**
 * nspb-validate-calc.js — read one Workforce cell back, and run a business rule.
 *   EPM_PASS=<pwd> node tools/nspb-validate-calc.js <client> [--rule CalcComp]
 *
 * Read-back uses exportdataslice, which on this pod ONLY tolerates a SINGLE member
 * per axis (multi-member columns/rows → 400 cardinality error), so we read cell by cell.
 * Rules run via the REST Jobs API (POST /jobs {jobType:"Rules", jobName}).
 */
const os = require('os'), path = require('path'), fs = require('fs');
const CONFIG = path.join(process.env.EPM_HOME || path.join(os.homedir(), '.epm'), 'clients.json');
const die = m => { console.error('ERROR: ' + m); process.exit(1); };

const POV = dept => ['BegBalance','No Year','NSP_Budget','NSP_Base','USD','No Entity','NSP_Undefined_Class','NSP_Undefined_Location',dept];
const POVDIMS = ['Period','Years','Scenario','Version','Currency','Subsidiary','Class','Location','Department'];

async function main() {
  const [, , client, ...rest] = process.argv;
  const ruleIdx = rest.indexOf('--rule');
  const rule = ruleIdx >= 0 ? rest[ruleIdx + 1] : null;
  if (!process.env.EPM_PASS) die('set EPM_PASS');
  const c = JSON.parse(fs.readFileSync(CONFIG, 'utf8'))[client];
  const host = String(c.url).replace(/\/+$/, ''), app = c.app || 'NetSuite';
  const auth = 'Basic ' + Buffer.from(`${c.user}:${process.env.EPM_PASS}`).toString('base64');
  const base = `${host}/HyperionPlanning/rest/v3/applications/${encodeURIComponent(app)}`;

  const readCell = async (cube, dept, emp, acct) => {
    const body = { exportPlanningData: true, gridDefinition: { suppressMissingBlocks: false,
      pov: { dimensions: POVDIMS, members: POV(dept).map(m => [m]) },
      columns: [{ dimensions: ['Account'], members: [[acct]] }],
      rows: [{ dimensions: ['Employee'], members: [[emp]] }] } };
    const r = await fetch(`${base}/plantypes/${cube}/exportdataslice`,
      { method: 'POST', headers: { Authorization: auth, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => null);
    return r.ok ? (j?.rows?.[0]?.data?.[0]) : `ERR ${r.status}`;
  };

  console.log('\nRead-back (Workforc, WB_H_MD_INV @ WB_925):');
  for (const a of ['SalRate', 'Bonus%', 'FTE', 'SalBasis', 'JobTitle', 'StartDate', 'WorkInLocation'])
    console.log(`  ${a.padEnd(16)} ${await readCell('Workforc', 'WB_925', 'WB_H_MD_INV', a)}`);

  if (rule) {
    console.log(`\nRunning rule "${rule}" via Jobs API …`);
    const r = await fetch(`${base}/jobs`, { method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobType: 'Rules', jobName: rule }) });
    const j = await r.json().catch(() => null);
    console.log(`  HTTP ${r.status}`, j ? JSON.stringify(j).slice(0, 500) : '');
  }
}
main().catch(e => die(e.message));
