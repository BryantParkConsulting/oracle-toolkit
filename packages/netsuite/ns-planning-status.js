#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { safeClient } = require('./ns-planning-sync-core');

function option(args, name) {
  const inline = args.find(arg => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

function buildStatus(root, client) {
  const base = path.join(root, 'clients', safeClient(client), 'integration', 'netsuite');
  const state = readJson(path.join(base, 'state.json'), null);
  const mappings = readJson(path.join(base, 'source-member-mappings.json'), []);
  const runsDirectory = path.join(base, 'runs');
  const runs = fs.existsSync(runsDirectory)
    ? fs.readdirSync(runsDirectory, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => {
      const manifest = readJson(path.join(runsDirectory, entry.name, 'manifest.json'), {});
      return { directory: entry.name, ...manifest };
    }).sort((a, b) => String(b.startedAt || b.directory).localeCompare(String(a.startedAt || a.directory)))
    : [];
  const mappingStatus = mappings.reduce((result, row) => {
    result[row.status || 'unknown'] = (result[row.status || 'unknown'] || 0) + 1;
    return result;
  }, {});
  return {
    client,
    configured: !!state,
    lastSuccessfulRun: state?.lastSuccessfulRun || null,
    processedPeriods: Object.values(state?.periods || {}).sort((a, b) => String(a.completedAt).localeCompare(String(b.completedAt))),
    mappingStatus,
    recentRuns: runs.slice(0, 10).map(run => ({ runId: run.runId || run.directory, status: run.status || 'unknown', startedAt: run.startedAt || null, completedAt: run.completedAt || null, scope: run.scope || null, periods: run.periodSelection?.selected || [], error: run.error || null })),
  };
}

function printStatus(status) {
  console.log(`NetSuite planning sync status — ${status.client}`);
  if (!status.configured && !status.recentRuns.length) {
    console.log('No recurring sync has been published yet. Existing assessment snapshots are separate.');
    return;
  }
  const last = status.lastSuccessfulRun;
  console.log(`Last successful run: ${last ? `${last.runId} at ${last.completedAt}` : 'none'}`);
  console.log(`Processed periods: ${status.processedPeriods.length}`);
  for (const period of status.processedPeriods) console.log(`  ${period.name}: ${period.completedAt} | amount ${period.sourceAmount} | lines ${period.sourceLines}`);
  console.log(`Source member mappings: ${Object.entries(status.mappingStatus).map(([key, count]) => `${key} ${count}`).join(', ') || 'none'}`);
  console.log('Recent runs:');
  for (const run of status.recentRuns) console.log(`  ${run.runId}: ${run.status} | ${run.periods.map(period => period.name).join(', ') || 'no periods'}${run.error ? ` | ${run.error}` : ''}`);
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const client = option(args, '--client') || process.env.CLIENT;
  if (!client) { console.error('Provide CLIENT or --client.'); process.exit(1); }
  const status = buildStatus(path.resolve(__dirname, '..', '..'), client);
  if (args.includes('--json')) console.log(JSON.stringify(status, null, 2));
  else printStatus(status);
}

module.exports = { buildStatus, printStatus };
