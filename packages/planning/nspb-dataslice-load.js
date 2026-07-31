#!/usr/bin/env node
'use strict';
/**
 * nspb-dataslice-load.js — write cell data into a Planning cube over REST,
 * without needing an "Import Data" job defined in the application.
 *
 *   node tools/nspb-dataslice-load.js <client> <grid.xlsx> [--cube Workforc] [--test] [--yes]
 *
 * Why this exists: epmautomate's `importdata` requires a job definition, and job
 * definitions can only be created in the Planning UI. The REST endpoint
 * `.../plantypes/{cube}/importdataslice` has no such requirement.
 *
 * THE PASSWORD IS NEVER STORED AND NEVER PASSED AS AN ARGUMENT.
 * It is read from the EPM_PASS environment variable if set, otherwise typed at a
 * prompt with echo off. It lives in memory for the duration of the run only.
 * (EPM Automate's .epw cannot be used here — only epmautomate can decrypt it.)
 *
 * --test sends the first two rows only. Always do that before the full load:
 * it proves the payload shape against the real app for the price of two cells.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');

let openpyxl;
try { openpyxl = require('exceljs'); } catch { /* optional; xlsx read is done via a CSV fallback */ }

const CONFIG = path.join(process.env.EPM_HOME || path.join(os.homedir(), '.epm'), 'clients.json');

function die(m) { console.error('\nERROR: ' + m + '\n'); process.exit(1); }

// ---------------------------------------------------------------- password
function askPassword(prompt) {
  if (process.env.EPM_PASS) return Promise.resolve(process.env.EPM_PASS);
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) {
      return reject(new Error(
        'no terminal to prompt on. Run this yourself in a terminal, or set EPM_PASS\n' +
        '  in your own shell first:   $env:EPM_PASS = Read-Host -AsSecureString ... \n' +
        '  (the password is deliberately not accepted as a command-line argument)'));
    }
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    process.stdout.write(prompt);
    rl.stdoutMuted = true;
    rl._writeToOutput = function (s) { if (!rl.stdoutMuted) rl.output.write(s); };
    rl.question('', a => { rl.close(); process.stdout.write('\n'); resolve(a); });
  });
}

// ---------------------------------------------------------------- grid input
// Reads the "Roster Load" sheet produced by build-workforce-load.py:
//   row 1 = POV, row 2 = headers (Employee, Department, Class, then accounts), row 3+ = data
async function readGrid(file) {
  const ExcelJS = require('exceljs');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.getWorksheet('Roster Load') || wb.worksheets[0];
  const headers = [];
  ws.getRow(2).eachCell({ includeEmpty: false }, (c, i) => { headers[i - 1] = String(c.value || '').trim(); });
  const accounts = headers.slice(3).filter(Boolean);
  const rows = [];
  for (let r = 3; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const emp = row.getCell(1).value;
    if (!emp) continue;
    const data = accounts.map((_, i) => {
      const v = row.getCell(4 + i).value;
      return v === null || v === undefined || v === '' ? null : v;
    });
    rows.push({
      headers: [String(emp), String(row.getCell(2).value), String(row.getCell(3).value)],
      data,
    });
  }
  return { accounts, rows };
}

// ---------------------------------------------------------------- main
(async () => {
  const [, , client, gridFile, ...rest] = process.argv;
  if (!client || !gridFile) {
    console.log('usage: node tools/nspb-dataslice-load.js <client> <grid.xlsx> [--cube Workforc] [--test] [--yes]');
    process.exit(0);
  }
  const flag = (n, d) => { const i = rest.indexOf('--' + n); return i >= 0 ? rest[i + 1] : d; };
  const cube = flag('cube', 'Workforc');
  const isTest = rest.includes('--test');
  const yes = rest.includes('--yes');

  if (!fs.existsSync(CONFIG)) die('no config at ' + CONFIG);
  const c = JSON.parse(fs.readFileSync(CONFIG, 'utf8'))[client];
  if (!c) die(`client "${client}" not in ${CONFIG}`);
  const host = String(c.url).replace(/\/+$/, '');
  const app = c.app || 'NetSuite';

  const { accounts, rows } = await readGrid(gridFile);
  const send = isTest ? rows.slice(0, 2) : rows;
  const cells = send.reduce((n, r) => n + r.data.filter(v => v !== null).length, 0);

  console.log(`\n[${client}] ${host}`);
  console.log(`  app ${app} / cube ${cube}`);
  console.log(`  ${send.length} employees, ${accounts.length} properties, ${cells} cells` +
              (isTest ? '   *** TEST: first 2 rows only ***' : ''));

  if (!isTest && !yes) {
    die(`this writes ${cells} cells into ${client}'s live cube.\n` +
        `Do a --test run first, then re-run with --yes.`);
  }

  const pass = await askPassword(`  password for ${c.user}: `);
  const auth = 'Basic ' + Buffer.from(`${c.user}:${pass}`).toString('base64');

  const body = {
    aggregateEssbaseData: false,
    cellNotesOption: 'Overwrite',
    dateFormat: 'MM-DD-YYYY',
    customParams: null,
    slices: [{
      // POV order mirrors the Employee Roster form: Version, Scenario, Subsidiary,
      // Currency, Years, Period, Location. Employee/Department/Class ride on the rows.
      pov: ['Base', 'Forecast', 'SUB_4', 'USD', 'No Year', 'BegBalance', 'No Location'],
      columns: [accounts],
      rows: send,
    }],
  };

  const url = `${host}/HyperionPlanning/rest/v3/applications/${encodeURIComponent(app)}` +
              `/plantypes/${encodeURIComponent(cube)}/importdataslice`;
  console.log(`  POST ${url.replace(host, '')}`);

  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: auth, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  console.log(`\n  HTTP ${r.status} ${r.statusText}`);
  let j; try { j = JSON.parse(text); } catch { /* not json */ }
  console.log(j ? JSON.stringify(j, null, 2).slice(0, 3000) : text.slice(0, 2000));

  if (r.ok && j && j.numAcceptedCells !== undefined) {
    console.log(`\n  accepted ${j.numAcceptedCells} / rejected ${j.numRejectedCells ?? 0}`);
    if (j.rejectedCells) console.log('  rejected sample:', JSON.stringify(j.rejectedCells).slice(0, 800));
  }
  process.exit(r.ok ? 0 : 1);
})().catch(e => die(e.message));
