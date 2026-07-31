#!/usr/bin/env node
'use strict';
/** Full Wedbush demo validation: read back every employee's key inputs AND the
 *  CalcComp output (TotalComp) per year. EPM_PASS=<pwd> node tools/nspb-validate-full.js demo */
const os = require('os'), path = require('path'), fs = require('fs');
const CONFIG = path.join(process.env.EPM_HOME || path.join(os.homedir(), '.epm'), 'clients.json');
const die = m => { console.error('ERROR: ' + m); process.exit(1); };

const EMP = [ // member, dept, expectedBase
  ['WB_E_ADV2SR','WB_110',120000],['WB_E_JSMITH','WB_363',240000],
  ['WB_E_RESIGN','WB_130',130000],['WB_H_MD_INV','WB_925',100000],
  ['WB_H_JR_ADV','WB_595',50000],['WB_H_SVP_ACAPS','WB_330',150000],
  ['WB_H_SVP_NATSALES','WB_595',175000],['WB_H_BACKFILL','WB_130',130000],
];

async function main() {
  const c = JSON.parse(fs.readFileSync(CONFIG, 'utf8')).demo;
  const host = String(c.url).replace(/\/+$/, ''), app = c.app || 'NetSuite';
  const auth = 'Basic ' + Buffer.from(`${c.user}:${process.env.EPM_PASS}`).toString('base64');
  const base = `${host}/HyperionPlanning/rest/v3/applications/${encodeURIComponent(app)}/plantypes/Workforc`;

  // read one cell: pov members must be given per dimension list
  const read = async (dims, members, acct, emp) => {
    const body = { exportPlanningData: true, gridDefinition: { suppressMissingBlocks: false,
      pov: { dimensions: dims, members: members.map(m => [m]) },
      columns: [{ dimensions: ['Account'], members: [[acct]] }],
      rows: [{ dimensions: ['Employee'], members: [[emp]] }] } };
    const r = await fetch(`${base}/exportdataslice`, { method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => null);
    return r.ok ? (j?.rows?.[0]?.data?.[0] ?? '·') : `E${r.status}`;
  };

  const inpDims = ['Period','Years','Scenario','Version','Currency','Subsidiary','Class','Location','Department'];
  const inpPov = d => ['BegBalance','No Year','NSP_Forecast','NSP_Base','USD','SUB_2','NSP_Undefined_Class','NSP_Undefined_Location',d];
  const outPov = (d, yr, per) => ['NSP_Forecast','NSP_Base','USD','SUB_2','NSP_Undefined_Class','NSP_Undefined_Location',d,yr,per];
  const outDims = ['Scenario','Version','Currency','Subsidiary','Class','Location','Department','Years','Period'];

  console.log('\n== ROSTER INPUTS ==');
  console.log('  employee            SalRate   Bonus%  SalBasis   JobTitle                StartDate');
  for (const [emp, dept] of EMP) {
    const [sr, bp, sb, jt, sd] = await Promise.all(
      ['SalRate','Bonus%','SalBasis','JobTitle','StartDate'].map(a => read(inpDims, inpPov(dept), a, emp)));
    console.log(`  ${emp.padEnd(20)}${String(sr).padEnd(10)}${String(bp).padEnd(8)}${String(sb).padEnd(11)}${String(jt).padEnd(24)}${sd}`);
  }

  console.log('\n== CalcComp OUTPUT (TotalComp, YearTotal) ==');
  for (const [emp, dept] of EMP) {
    const [fy24, fy25] = await Promise.all([
      read(outDims, outPov(dept, 'FY24', 'YearTotal'), 'TotalComp', emp),
      read(outDims, outPov(dept, 'FY25', 'YearTotal'), 'TotalComp', emp)]);
    console.log(`  ${emp.padEnd(20)} FY24=${String(fy24).padEnd(12)} FY25=${fy25}`);
  }
}
main().catch(e => die(e.message));
