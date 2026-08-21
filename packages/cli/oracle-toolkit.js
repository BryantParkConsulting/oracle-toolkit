#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const readline = require('readline/promises');

const ROOT = path.resolve(__dirname, '..', '..');
const NETSUITE = path.join(ROOT, 'packages', 'netsuite');
const REQUIRED_ENV = ['NS_ACCOUNT', 'NS_CONSUMER_KEY', 'NS_CONSUMER_SECRET', 'NS_TOKEN_ID', 'NS_TOKEN_SECRET'];

function loadEnv() {
  const values = { ...process.env };
  const envFile = path.join(ROOT, '.env');
  if (!fs.existsSync(envFile)) return values;
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (match && !values[match[1]]) values[match[1]] = match[2].replace(/^["']|["']$/g, '').trim();
  }
  return values;
}

function option(args, name) {
  const exact = args.indexOf(name);
  if (exact >= 0) return args[exact + 1];
  const inline = args.find(arg => arg.startsWith(`${name}=`));
  return inline ? inline.slice(name.length + 1) : undefined;
}

function run(script, args, extraEnv = {}) {
  const result = spawnSync(process.execPath, [path.join(NETSUITE, script), ...args], {
    cwd: ROOT,
    env: { ...loadEnv(), ...extraEnv },
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}

function help() {
  console.log(`oracle-toolkit NetSuite CLI (read-only)

Usage:
  oracle-toolkit netsuite doctor
  oracle-toolkit netsuite connect test
  oracle-toolkit netsuite query "SELECT ..." [--json] [--out file.json]
  oracle-toolkit netsuite probe account,subsidiary,department
  oracle-toolkit netsuite export snapshot --client CLIENT [--phase PHASE]
  oracle-toolkit netsuite export erp --client CLIENT
  oracle-toolkit netsuite sync planning --client CLIENT [--scope affected|period|range|all]
  oracle-toolkit netsuite sync status --client CLIENT [--json]

Snapshot phases: all, probe, shape, meta, fields, financials

Credentials are read from the process environment or the gitignored .env file:
  NS_ACCOUNT, NS_CONSUMER_KEY, NS_CONSUMER_SECRET, NS_TOKEN_ID, NS_TOKEN_SECRET

The CLI never prints credential values. SuiteQL commands are restricted to SELECT/WITH.`);
}

async function kickoff() {
  const choices = [
    'Complete assessment (NetSuite, NSPB/Planning, or both)',
    'Focused discovery of one area, module, object, or financial question',
    'Ad-hoc read-only SuiteQL query',
    'NetSuite extraction or reusable snapshot',
    'NetSuite to NSPB reconciliation',
    'Environment documentation or another task',
  ];
  console.log('\nI can help with:\n');
  choices.forEach((choice, index) => console.log(`  ${index + 1}. ${choice}`));
  console.log('\nNothing will run until you choose the scope.');
  if (!process.stdin.isTTY) return;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question('\nWhat do you want to do? [1-6]: ')).trim();
  rl.close();
  const selected = Number(answer);
  if (!Number.isInteger(selected) || selected < 1 || selected > choices.length) {
    console.log('No option selected. Run the command again when ready.');
    return;
  }
  console.log(`\nSelected: ${choices[selected - 1]}`);
  if (selected === 1) console.log('Next: provide the client name and choose NetSuite, NSPB/Planning, or both.');
  if (selected === 2) console.log('Next: describe the exact area or question. A full assessment is not required.');
  if (selected === 3) console.log('Next: run `oracle-toolkit netsuite query "SELECT ..." --json`.');
  if (selected === 4) console.log('Next: run `oracle-toolkit netsuite export snapshot --client CLIENT` or choose one --phase.');
  if (selected === 5) console.log('Next: identify the client, fiscal period range, and both control sources.');
  if (selected === 6) console.log('Next: describe the output and source material already available.');
}

function doctor(env = loadEnv()) {
  const missing = REQUIRED_ENV.filter(key => !env[key]);
  console.log(`Node ${process.version} (${Number(process.versions.node.split('.')[0]) >= 20 ? 'OK' : 'requires 20+'})`);
  console.log(`Repository ${ROOT}`);
  for (const key of REQUIRED_ENV) console.log(`${key}: ${env[key] ? 'configured' : 'missing'}`);
  if (missing.length) {
    console.error(`Missing ${missing.length} required credential value(s).`);
    process.exitCode = 1;
  } else {
    console.log('Local configuration OK. Run `oracle-toolkit netsuite connect test` to verify NetSuite.');
  }
}

function assertReadOnly(sql) {
  const normalized = String(sql || '').trim().replace(/^\/\*[\s\S]*?\*\//, '').trim();
  if (!/^(SELECT|WITH)\b/i.test(normalized) || /;\s*\S/.test(normalized)) {
    throw new Error('Only one read-only SELECT or WITH SuiteQL statement is allowed.');
  }
}

async function main(args = process.argv.slice(2)) {
  if (args[0] === '--self-test') {
    assertReadOnly('SELECT 1 FROM account');
    assertReadOnly('WITH a AS (SELECT id FROM account) SELECT * FROM a');
    try { assertReadOnly('DELETE FROM account'); throw new Error('read-only guard failed'); } catch (error) {
      if (error.message === 'read-only guard failed') throw error;
    }
    console.log('CLI self-test OK');
    return;
  }
  if (!args.length) return kickoff();
  if (['-h', '--help', 'help'].includes(args[0])) return help();
  if (args.shift() !== 'netsuite') throw new Error('Unknown product. Use `oracle-toolkit netsuite --help`.');
  if (!args.length) return kickoff();
  if (['-h', '--help', 'help'].includes(args[0])) return help();

  const command = args.shift();
  if (command === 'doctor') return doctor();
  if (command === 'connect' && args.shift() === 'test') {
    return run('ns-sql.js', ['SELECT COUNT(*) AS account_count FROM account', '--json']);
  }
  if (command === 'query') {
    const sql = args.find(arg => !arg.startsWith('--'));
    assertReadOnly(sql);
    const childArgs = [sql];
    if (args.includes('--json')) childArgs.push('--json');
    const out = option(args, '--out');
    if (out) childArgs.push(`--out=${path.resolve(out)}`);
    return run('ns-sql.js', childArgs);
  }
  if (command === 'probe') {
    const tables = args.find(arg => !arg.startsWith('--'));
    if (!tables) throw new Error('Provide a comma-separated table list.');
    return run('ns-sql.js', [`--probe=${tables}`]);
  }
  if (command === 'export') {
    const kind = args.shift();
    const client = option(args, '--client');
    if (!client || !/^[a-zA-Z0-9_-]+$/.test(client)) throw new Error('Provide --client with letters, numbers, hyphens or underscores.');
    if (kind === 'snapshot') {
      const phase = option(args, '--phase') || 'all';
      if (!['all', 'probe', 'shape', 'meta', 'fields', 'financials'].includes(phase)) throw new Error(`Unknown snapshot phase: ${phase}`);
      return run('netsuite-export.js', [`--phase=${phase}`], { CLIENT: client });
    }
    if (kind === 'erp') return run('ns-erp-extract.js', [client], { CLIENT: client });
  }
  if (command === 'sync') {
    const kind = args.shift();
    const client = option(args, '--client');
    if (!client || !/^[a-zA-Z0-9_-]+$/.test(client)) throw new Error('Provide --client with letters, numbers, hyphens or underscores.');
    if (kind === 'planning') {
      const childArgs = [`--client=${client}`];
      for (const name of ['--scope', '--period', '--from', '--to', '--lookback', '--config', '--cap', '--tolerance']) {
        const value = option(args, name);
        if (value !== undefined) childArgs.push(`${name}=${value}`);
      }
      return run('ns-planning-sync.js', childArgs, { CLIENT: client });
    }
    if (kind === 'status') return run('ns-planning-status.js', [`--client=${client}`, ...(args.includes('--json') ? ['--json'] : [])]);
    throw new Error('Unknown sync command. Use `planning` or `status`.');
  }
  throw new Error('Unknown command. Use `oracle-toolkit netsuite --help`.');
}

main().catch(error => {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
});
