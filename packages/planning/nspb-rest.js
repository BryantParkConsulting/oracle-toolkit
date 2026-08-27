#!/usr/bin/env node
'use strict';
/**
 * nspb-rest.js — one read-only door to a Planning tenant's REST API.
 *
 *   node packages/planning/nspb-rest.js <client> <path> [--post <json-file>] [--raw]
 *
 *   node packages/planning/nspb-rest.js pra applications/NetSuite/jobs?limit=25
 *   node packages/planning/nspb-rest.js pra applications/NetSuite/plantypes
 *
 * <path> is appended to /HyperionPlanning/rest/v3/. Password from ~/.epm/<client>.pass or
 * EPM_PASS — never an argument, never printed.
 *
 * This exists because ad-hoc `node -e` one-liners kept getting mangled by the shell (a `$`
 * inside a regex is enough) and the resulting "Method Not Allowed" looks like an API problem
 * rather than a quoting problem.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const die = (m) => { console.error('ERROR: ' + m); process.exit(1); };
const argv = process.argv.slice(2);
const client = argv[0];
const rel = argv[1];
if (!client || !rel) die('usage: nspb-rest.js <client> <path> [--post <json-file>] [--raw]');

const EPM_HOME = process.env.EPM_HOME || path.join(os.homedir(), '.epm');
const cfg = JSON.parse(fs.readFileSync(path.join(EPM_HOME, 'clients.json'), 'utf8'))[client];
if (!cfg) die(`no "${client}" in clients.json`);

let pass = process.env.EPM_PASS;
if (!pass) {
  const pf = path.join(EPM_HOME, `${client}.pass`);
  if (!fs.existsSync(pf)) die(`no password: set EPM_PASS or create ${pf}`);
  pass = fs.readFileSync(pf, 'utf8').replace(/^﻿/, '').trim();
}

const base = String(cfg.url).replace(/\/+$/, '') + '/HyperionPlanning/rest/v3/';
const url = base + rel.replace(/^\/+/, '');
const auth = 'Basic ' + Buffer.from(cfg.user + ':' + pass).toString('base64');

const postIdx = argv.indexOf('--post');
const opts = { headers: { Authorization: auth, Accept: 'application/json' } };
if (postIdx >= 0) {
  const f = argv[postIdx + 1];
  if (!f || !fs.existsSync(f)) die('--post needs a readable json file');
  opts.method = 'POST';
  opts.headers['Content-Type'] = 'application/json';
  opts.body = fs.readFileSync(f, 'utf8');
}

fetch(url, opts).then(async (r) => {
  const txt = await r.text();
  if (argv.includes('--raw') || !r.ok) {
    console.error(`HTTP ${r.status}`);
    console.log(txt);
    process.exit(r.ok ? 0 : 1);
  }
  try { console.log(JSON.stringify(JSON.parse(txt), null, 2)); }
  catch { console.log(txt); }
}).catch((e) => die(e.message));
