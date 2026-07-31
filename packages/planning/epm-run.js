#!/usr/bin/env node
'use strict';
/**
 * epm-run.js — thin wrapper over Oracle EPM Automate for BPC client work.
 *
 *   node tools/epm-run.js <client> <command> [args...]
 *
 * Credentials never live in this repo. They are read from a config file outside
 * the working tree (default C:\Users\<you>\.epm\clients.json), and the password
 * itself is an EPM Automate .epw file — created once, by you:
 *
 *   epmautomate encrypt <password> <encryption-key> C:\Users\<you>\.epm\symetri.epw
 *
 * clients.json holds NO secrets, only where to point:
 *
 *   {
 *     "symetri": {
 *       "url":      "https://nspb-symetri.epm.ca-montreal-1.ocs.oraclecloud.com/",
 *       "user":     "bruno.gallo@bryantparkconsulting.com",
 *       "passfile": "symetri.epw",
 *       "app":      "NetSuite"
 *     }
 *   }
 *
 * Commands that only read are run on request. Commands that CHANGE the client's
 * environment (import*, runrule, runfeed) refuse to run unless you pass --yes,
 * because these are production EPM pods.
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const EPM = process.env.EPM_AUTOMATE ||
  'C:\\Program Files\\Oracle\\EPM Automate\\bin\\epmautomate.bat';
const HOME = process.env.EPM_HOME || path.join(os.homedir(), '.epm');
const CONFIG = path.join(HOME, 'clients.json');

// Symetri's Workforce rules, in the order the runbook requires.
const RULE_CHAINS = {
  symetri: {
    // The documented NSPB Workforce sequence is ActiveStatus -> CopyToPlan -> CalcComp,
    // then Agg_Select on Plan (KB: "Workforce Calculating data"). ActiveStatus is a Groovy
    // grid rule and cannot run headless, so it is NOT in this chain — someone has to open
    // the Employee Roster form and run it once first, or nothing calculates.
    //
    // This chain previously ran Update Workforce -> CalcComp -> AggAll ->
    // ADMIN - Aggregate WF Expenses. Do not go back to that. AggAll aggregates
    // Employee/Department/Subsidiary inside Workforc and ADMIN - Aggregate WF Expenses does
    // AGG("Department","Class") inside Plan; NEITHER moves data between cubes. CopyToPlan is
    // the push, and skipping it leaves the P&L empty with no error to tell you so — verified
    // at Symetri on 2026-07-29, where compensation calculated fine in Workforc while every
    // leaf department in Plan stayed empty.
    // CopyToPlan is DELIBERATELY NOT HERE. It is the push into the Plan cube, and
    // Symetri has not decided that Workforce owns compensation in the financials.
    // Their FY26 OpEx budget already carries salary / payroll tax / 401k at
    // Undefined_Department, so pushing on top double-counts — it read $24.4M of
    // phantom cost on 2026-07-29 before being cleared. Do not re-add it until the
    // client answers which source owns those accounts, and run
    // "ADMIN - Clear WF Push to Plan" first when they do: a second push ADDS to the
    // first rather than replacing it.
    workforce: [
      { cube: 'Workforc', rule: 'CalcComp' },
    ],
    opex: [
      { cube: 'Plan', rule: 'AGG - Select',
        prompts: ['Select Year=FY26', 'Select Scenario=Forecast', 'Select Version=Base'] },
    ],
  },
};

const MUTATING = new Set(['importmetadata', 'importdata', 'runrule', 'runfeed', 'runchain']);

function die(msg) { console.error('\nERROR: ' + msg + '\n'); process.exit(1); }

function loadClient(name) {
  if (!fs.existsSync(CONFIG)) {
    die(`no config at ${CONFIG}\n\n` +
        `Create it (no passwords in it), then make the .epw:\n` +
        `  epmautomate encrypt <password> <key> ${path.join(HOME, name + '.epw')}`);
  }
  const all = JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
  const c = all[name];
  if (!c) die(`client ${name!==undefined?`"${name}"`:''} not in ${CONFIG}. Have: ${Object.keys(all).join(', ')}`);
  for (const k of ['url', 'user', 'passfile']) if (!c[k]) die(`client "${name}" is missing "${k}"`);
  c.passfile = path.isAbsolute(c.passfile) ? c.passfile : path.join(HOME, c.passfile);
  if (!fs.existsSync(c.passfile)) die(`password file not found: ${c.passfile}`);
  return c;
}

// Never echoes the password file contents; epmautomate reads it itself.
// epmautomate is a .bat, and Node >=20 refuses to spawn .bat/.cmd directly
// (CVE-2024-27980), so it goes through cmd.exe with everything quoted.
const q = a => (/[\s&|<>^"]/.test(String(a)) ? `"${String(a).replace(/"/g, '""')}"` : String(a));

function epm(args, { quiet = false } = {}) {
  if (!quiet) console.log('  > epmautomate ' + args.map(q).join(' '));
  // cmd /c strips the outer quotes when the line starts with one, so the whole
  // command line gets wrapped in an extra pair.
  const line = '"' + [q(EPM), ...args.map(q)].join(' ') + '"';
  try {
    return execFileSync(process.env.COMSPEC || 'cmd.exe', ['/d', '/s', '/c', line],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, windowsVerbatimArguments: true });
  } catch (e) {
    const out = (e.stdout || '') + (e.stderr || '');
    throw new Error(out.trim() || e.message);
  }
}

function main() {
  const [, , client, cmd, ...rest] = process.argv;
  const yes = rest.includes('--yes');
  const args = rest.filter(a => a !== '--yes');

  if (!client || !cmd) {
    console.log(`usage: node tools/epm-run.js <client> <command> [args] [--yes]

read-only
  status                       who am I, which app
  exportmetadata [file.zip]    current dimensions — the source of truth, not a stale LCM
  exportdata <job> [file.zip]  run an export Data Management job
  listsnapshots                snapshots in the pod + how to make an artifacts-only one
  exportsnapshot "<name>"      export + download an LCM snapshot (feeds parse-lcm.js)
  listfiles                    what is in the pod's inbox/outbox
  download <remote> [local]    pull a file out of the pod

changes the client's environment (needs --yes)
  importmetadata <job> <file.zip>
  importdata <job> <file>
  runrule <cube> <rule> [prompt=value ...]
  runfeed <integration>        re-run a Data Management data rule
  runchain <name>              a named rule sequence (${Object.keys(RULE_CHAINS.symetri || {}).join(', ')})`);
    process.exit(0);
  }

  const c = loadClient(client);
  if (MUTATING.has(cmd) && !yes) {
    die(`"${cmd}" changes ${client}'s environment (${c.url}).\n` +
        `Re-run with --yes once you are sure.`);
  }

  console.log(`\n[${client}] ${c.url}  (app: ${c.app || 'n/a'})`);
  epm(['login', c.user, c.passfile, c.url], { quiet: true });
  console.log('  logged in');

  try {
    switch (cmd) {
      case 'status':
        // there is no "whoami"; a successful login plus a listing is the check
        console.log(epm(['listfiles']));
        break;
      case 'exportmetadata': {
        // EPM Automate's exportmetadata takes the name of an "Export Metadata" JOB
        // defined inside the application — NOT the application name. They only
        // coincide when someone named the job after the app (Symetri's case).
        const job = args[0] || c.metadata_job || c.app;
        if (!job) die('exportmetadata <jobName> [file.zip]   — set "metadata_job" in clients.json to skip this');
        const out = args[1] || `${client}-metadata-${new Date().toISOString().slice(0, 10)}.zip`;
        try {
          console.log(epm(['exportmetadata', job, out]));
        } catch (e) {
          if (/EPMAT-1|Unable to find a job/i.test(e.message)) {
            die(
              `No Export Metadata job named "${job}" in ${client}'s app.\n` +
              `  exportmetadata runs a job that has to exist in the pod first.\n` +
              `  In the pod: Application > Overview > Actions > Export Metadata, save it with a name,\n` +
              `  then either pass it here or add "metadata_job": "<name>" to clients.json.`
            );
          }
          throw e;
        }
        console.log(`  now: node tools/epm-run.js ${client} download ${out}`);
        break;
      }
      case 'exportdata':   console.log(epm(['exportdata', ...args])); break;
      case 'listfiles':    console.log(epm(['listfiles'])); break;
      case 'download':     console.log(epm(['downloadfile', ...args])); break;
      case 'listsnapshots':
        // Snapshot definitions live in the pod and come out in the file listing.
        // NOTE: Oracle's nightly "Artifact Snapshot" DOES include Essbase data.
        // For artifacts only, the definition has to be built once in the pod UI.
        console.log(epm(['listfiles']));
        console.log(
          `\n  Snapshots are the .zip entries above.\n` +
          `  For artifacts WITHOUT Essbase data: in the pod, Tools > Migration, untick\n` +
          `  Essbase Data, save the definition under a name, then run:\n` +
          `    node tools/epm-run.js ${client} exportsnapshot "<name>"`
        );
        break;
      case 'exportsnapshot': {
        const [snapshot] = args;
        if (!snapshot) die('exportsnapshot "<snapshot name>"   (list them with: listsnapshots)');
        console.log(epm(['exportsnapshot', snapshot]));
        console.log(epm(['downloadfile', `${snapshot}.zip`]));
        console.log(
          `  downloaded ${snapshot}.zip\n` +
          `  now: unzip it, then  LCM_ROOT=<dir> CLIENT=${client} node tools/parse-lcm.js`
        );
        break;
      }
      case 'importmetadata': {
        const [job, file] = args;
        if (!job || !file) die('importmetadata <job> <file.zip>');
        console.log(epm(['uploadfile', file]));
        console.log(epm(['importmetadata', job, path.basename(file)]));
        break;
      }
      case 'importdata': {
        const [job, file] = args;
        if (!job || !file) die('importdata <job> <file>');
        console.log(epm(['uploadfile', file]));
        console.log(epm(['importdata', job, path.basename(file)]));
        break;
      }
      case 'runrule': {
        const [cube, rule, ...prompts] = args;
        if (!cube || !rule) die('runrule <cube> <rule> [prompt=value ...]');
        console.log(epm(['runbusinessrule', rule, ...prompts]));
        break;
      }
      case 'runfeed': {
        const [integration] = args;
        if (!integration) die('runfeed <integration>');
        console.log(epm(['rundatarule', integration, ...args.slice(1)]));
        break;
      }
      case 'runchain': {
        const chain = (RULE_CHAINS[client] || {})[args[0]];
        if (!chain) die(`no chain "${args[0]}" for ${client}`);
        for (const step of chain) {
          console.log(`\n  -- ${step.cube}: ${step.rule}`);
          console.log(epm(['runbusinessrule', step.rule, ...(step.prompts || [])]));
        }
        break;
      }
      default:
        die(`unknown command "${cmd}"`);
    }
  } finally {
    try { epm(['logout'], { quiet: true }); console.log('  logged out'); } catch { /* best effort */ }
  }
}

main();
