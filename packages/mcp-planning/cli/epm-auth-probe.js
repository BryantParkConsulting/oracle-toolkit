#!/usr/bin/env node
'use strict';
/**
 * nspb-auth-probe.js — figure out WHICH Basic-Auth username the pod accepts.
 * READ-ONLY: it only does GET /applications (lists apps). Writes nothing.
 *
 *   node tools/nspb-auth-probe.js <client>
 *
 * Password comes from ~/.epm/<client>.pass (or EPM_PASS). Symetri's pod returned an
 * nginx-style HTML 401 on plain email Basic Auth — that is an EDGE rejection, usually
 * a username-FORMAT issue, not "REST is closed". This tries the common OCI variants
 * and tells you which returns 200 so we can point the loader at it.
 */
const os = require('os'), path = require('path'), fs = require('fs');
const CONFIG = path.join(process.env.EPM_HOME || path.join(os.homedir(), '.epm'), 'clients.json');
const die = m => { console.error('ERROR: ' + m); process.exit(1); };

(async () => {
  const client = process.argv[2];
  if (!client) die('usage: node tools/nspb-auth-probe.js <client>');
  const c = JSON.parse(fs.readFileSync(CONFIG, 'utf8'))[client];
  if (!c) die(`no "${client}" in ${CONFIG}`);
  const host = String(c.url).replace(/\/+$/, '');
  const passfile = path.join(path.dirname(CONFIG), `${client}.pass`);
  let pass = process.env.EPM_PASS;
  if (!pass && fs.existsSync(passfile)) pass = fs.readFileSync(passfile, 'utf8').replace(/^﻿/, '').trim();
  if (!pass) die('no password: put it in ' + passfile + ' or set EPM_PASS');

  const email = c.user;                       // bruno.gallo@bryantparkconsulting.com
  const local = email.split('@')[0];          // bruno.gallo
  // OCI identity-domain guesses drawn from the pod host, e.g. "nspb-symetri"
  const podName = host.replace(/^https?:\/\//, '').split('.')[0];
  const domainGuess = (podName.split('-')[0] || '').toUpperCase();   // e.g. NSPB

  const users = [
    ['email', email],
    ['local-part', local],
    ['identitydomain.email', `${domainGuess}.${email}`],
    ['identitydomain.local', `${domainGuess}.${local}`],
    ['idcs.email', `idcs.${email}`],
    ['Default.email', `Default.${email}`],
  ];

  const url = `${host}/HyperionPlanning/rest/v3/applications`;
  console.log(`\nGET ${url}\n`);
  for (const [label, u] of users) {
    const auth = 'Basic ' + Buffer.from(`${u}:${pass}`).toString('base64');
    try {
      const r = await fetch(url, { headers: { Authorization: auth, Accept: 'application/json' } });
      const body = await r.text();
      const isHtml = /<html/i.test(body);
      const tag = r.status === 200 ? '  <<< THIS ONE WORKS' : (isHtml ? ' (edge/nginx reject)' : ' (Planning reject)');
      console.log(`  ${String(r.status).padEnd(4)} ${label.padEnd(22)} ${u}${tag}`);
      if (r.status === 200) {
        console.log('\n  -> use this username. Tell me the label and I point the loader at it.');
        break;
      }
    } catch (e) {
      console.log(`  ERR  ${label.padEnd(22)} ${e.message}`);
    }
  }
  console.log('\n  If every line is 401 nginx: the pod blocks Basic Auth at the edge (OAuth only).');
})().catch(e => die(e.message));
