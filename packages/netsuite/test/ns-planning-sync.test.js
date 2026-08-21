'use strict';

const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const {
  basePeriods,
  mappingSeed,
  normalizedAccountControls,
  reconcile,
  resolveScope,
  runPlanningSync,
} = require('../ns-planning-sync-core');

const PERIOD_ROWS = [
  { id: '1', periodname: 'Jan 2026', startdate: '1/1/2026', enddate: '1/31/2026', closed: 'T', isadjust: 'F', isquarter: 'F', isyear: 'F' },
  { id: '2', periodname: 'Feb 2026', startdate: '2/1/2026', enddate: '2/28/2026', closed: 'F', isadjust: 'F', isquarter: 'F', isyear: 'F' },
  { id: '3', periodname: 'Q1 2026', startdate: '2026-01-01', enddate: '2026-03-31', closed: 'F', isadjust: 'F', isquarter: 'T', isyear: 'F' },
  { id: '4', periodname: 'Jan 2034', startdate: '1/1/2034', enddate: '1/31/2034', closed: 'F', isadjust: 'F', isquarter: 'F', isyear: 'F' },
];

test('period scopes exclude summary periods and support exact ranges', () => {
  const periods = basePeriods(PERIOD_ROWS);
  assert.deepEqual(periods.map(period => period.name), ['Jan 2026', 'Feb 2026', 'Jan 2034']);
  assert.deepEqual(resolveScope(periods, { scope: 'period', period: '2' }).map(period => period.name), ['Feb 2026']);
  assert.deepEqual(resolveScope(periods, { scope: 'range', from: 'Jan 2026', to: 'Feb 2026' }).map(period => period.id), ['1', '2']);
  assert.deepEqual(resolveScope(periods, { scope: 'affected', lookback: 2, now: '2026-02-10' }).map(period => period.id), ['1', '2']);
});

test('member mappings preserve approved targets by stable source id', () => {
  const members = [{ dimension: 'account', sourceId: '10', name: 'Revenue', alias: '4000' }];
  const seeded = mappingSeed(members, [
    { dimension: 'account', sourceId: '10', targetMember: 'Revenue' },
    { dimension: 'account', sourceId: '99', targetMember: null, lastSeenAt: '2026-01-01T00:00:00.000Z' },
  ]);
  assert.equal(seeded.find(row => row.sourceId === '10').targetMember, 'Revenue');
  assert.equal(seeded.find(row => row.sourceId === '10').status, 'mapped');
  assert.equal(seeded.find(row => row.sourceId === '99').status, 'retired');
  const classified = mappingSeed([
    { dimension: 'account', sourceId: '10', name: 'Revenue', active: true },
    { dimension: 'account', sourceId: '20', name: 'Unused', active: true },
    { dimension: 'account', sourceId: '30', name: 'Inactive', active: false },
  ], [], new Set(['account:10']));
  assert.equal(classified.find(row => row.sourceId === '10').status, 'unmapped');
  assert.equal(classified.find(row => row.sourceId === '20').status, 'available');
  assert.equal(classified.find(row => row.sourceId === '30').status, 'inactive');
});

test('reconciliation validates both amount and source-line coverage', () => {
  const period = { id: '1', name: 'Jan 2026' };
  assert.equal(reconcile(period, [{ accountId: '10', amount: 5, sourceLines: 2 }], [{ account_id: '10', amount: '5', source_lines: '2' }]).passed, true);
  assert.equal(reconcile(period, [{ accountId: '10', amount: 5, sourceLines: 1 }], [{ account_id: '10', amount: '5', source_lines: '2' }]).passed, false);
  assert.equal(reconcile(period, [
    { accountId: '10', amount: 4, sourceLines: 1 },
    { accountId: '20', amount: -4, sourceLines: 1 },
  ], [
    { account_id: '10', amount: '5', source_lines: '1' },
    { account_id: '20', amount: '-5', source_lines: '1' },
  ]).passed, false, 'a zero-sum GL must still reconcile by account');
});

test('account controls are persisted in a stable normalized order', () => {
  assert.deepEqual(normalizedAccountControls([
    { account_id: '20', amount: '-5', source_lines: '2' },
    { account_id: '10', amount: '5', source_lines: '1' },
  ]), [
    { accountId: '10', amount: 5, sourceLines: 1 },
    { accountId: '20', amount: -5, sourceLines: 2 },
  ]);
});

function fakeSuiteql({ failControl = false } = {}) {
  return async sql => {
    if (/FROM accountingperiod/.test(sql)) return PERIOD_ROWS;
    if (/lastmodifieddate/.test(sql)) return [{ period_id: '2' }];
    if (/FROM account ORDER BY/.test(sql)) return [{ source_id: '10', source_name: 'Revenue', source_alias: '4000', parent_source_id: null, inactive: 'F' }];
    if (/FROM (subsidiary|department|classification|location|item|entity) ORDER BY/.test(sql)) return [];
    if (/SELECT tal\.account AS account_id, ROUND\(SUM\(tal\.amount\)/.test(sql)) return [{ account_id: '10', amount: failControl ? '9' : '12.5', source_lines: '3' }];
    if (/GROUP BY tal\.account/.test(sql)) return [{ account_id: '10', subsidiary_id: '1', amount: '12.5', source_lines: '3' }];
    throw new Error(`Unexpected SQL in test: ${sql}`);
  };
}

test('successful sync publishes an audited run and advances checkpoint', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ns-sync-'));
  const result = await runPlanningSync({ root, client: 'pra', suiteql: fakeSuiteql(), scope: 'period', period: 'Feb 2026' });
  assert.equal(result.manifest.status, 'published');
  assert.equal(result.manifest.periods[0].difference, 0);
  const state = JSON.parse(fs.readFileSync(path.join(root, 'clients', 'pra', 'integration', 'netsuite', 'state.json')));
  assert.equal(state.lastSuccessfulRun.runId, result.manifest.runId);
  assert.ok(fs.existsSync(path.join(result.directory, 'facts', '2.json')));
});

test('failed reconciliation leaves evidence but never advances checkpoint', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ns-sync-fail-'));
  await assert.rejects(runPlanningSync({ root, client: 'pra', suiteql: fakeSuiteql({ failControl: true }), scope: 'period', period: 'Feb 2026' }), /Reconciliation failed/);
  assert.equal(fs.existsSync(path.join(root, 'clients', 'pra', 'integration', 'netsuite', 'state.json')), false);
  const runs = fs.readdirSync(path.join(root, 'clients', 'pra', 'integration', 'netsuite', 'runs'));
  assert.match(runs[0], /-staging$/);
});
