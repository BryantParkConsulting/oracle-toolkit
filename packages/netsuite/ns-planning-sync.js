#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { runPlanningSync } = require('./ns-planning-sync-core');

function option(args, name) {
  const inline = args.find(arg => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function loadConfig(file) {
  if (!file) return {};
  return JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
}

async function main(args = process.argv.slice(2)) {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`Read-only NetSuite to planning staging sync

Usage:
  CLIENT=pra node packages/netsuite/ns-planning-sync.js --scope=affected
  CLIENT=pra node packages/netsuite/ns-planning-sync.js --scope=period --period="Jul 2026"
  CLIENT=pra node packages/netsuite/ns-planning-sync.js --scope=range --from="Jan 2026" --to="Jul 2026"
  CLIENT=pra node packages/netsuite/ns-planning-sync.js --scope=all

Options:
  --lookback=N       fallback number of open/latest periods (default 2, max 24)
  --config=FILE      optional JSON with customDimensions definitions
  --cap=N            maximum aggregated fact rows per period (default 500000)
  --tolerance=N      reconciliation tolerance (default 0.005)

State advances only after every selected period reconciles. Failed runs remain in a
*-staging directory with their manifest and do not replace the last successful run.`);
    return;
  }
  const client = option(args, '--client') || process.env.CLIENT;
  if (!client) throw new Error('Provide CLIENT or --client.');
  const config = loadConfig(option(args, '--config'));
  const { suiteql } = require('./ns-sql');
  const result = await runPlanningSync({
    ...config,
    client,
    suiteql,
    scope: option(args, '--scope') || 'affected',
    period: option(args, '--period'),
    from: option(args, '--from'),
    to: option(args, '--to'),
    lookback: option(args, '--lookback'),
    cap: option(args, '--cap'),
    tolerance: option(args, '--tolerance'),
  });
  console.log(`Published ${result.manifest.periods.length} period(s) to ${result.directory}`);
  for (const period of result.manifest.periods) console.log(`  ${period.name}: ${period.rows} intersections, ${period.sourceLines} source lines, difference ${period.difference}`);
}

main().catch(error => {
  console.error(`Planning sync failed: ${error.message}`);
  process.exitCode = 1;
});
