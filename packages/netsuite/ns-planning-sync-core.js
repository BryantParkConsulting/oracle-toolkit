'use strict';

const fs = require('fs');
const path = require('path');

const CORE_DIMENSIONS = [
  { key: 'account', table: 'account', id: 'id', name: 'accountsearchdisplayname', alias: 'acctnumber', parent: 'parent', inactive: 'isinactive' },
  { key: 'subsidiary', table: 'subsidiary', id: 'id', name: 'name', parent: 'parent', inactive: 'isinactive' },
  { key: 'department', table: 'department', id: 'id', name: 'name', parent: 'parent', inactive: 'isinactive' },
  { key: 'class', table: 'classification', id: 'id', name: 'name', parent: 'parent', inactive: 'isinactive' },
  { key: 'location', table: 'location', id: 'id', name: 'name', parent: 'parent', inactive: 'isinactive' },
  { key: 'item', table: 'item', id: 'id', name: 'itemid', inactive: 'isinactive' },
  { key: 'relationship', table: 'entity', id: 'id', name: 'entityid', alias: 'altname', inactive: 'isinactive', type: 'type' },
];

function safeClient(value) {
  if (!/^[a-zA-Z0-9_-]+$/.test(String(value || ''))) throw new Error('Client must contain only letters, numbers, hyphens or underscores.');
  return String(value);
}

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function isoDate(value) {
  const text = String(value || '').trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const us = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (us) return `${us[3]}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}`;
  throw new Error(`Invalid SuiteQL date: ${value}`);
}

function number(value) {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) throw new Error(`Expected a numeric value, received: ${value}`);
  return parsed;
}

function normalizePeriod(row) {
  return {
    id: String(row.id),
    name: String(row.periodname || row.name || row.id),
    startDate: isoDate(row.startdate),
    endDate: isoDate(row.enddate),
    closed: String(row.closed || 'F').toUpperCase() === 'T',
    adjustment: String(row.isadjust || 'F').toUpperCase() === 'T',
    quarter: String(row.isquarter || 'F').toUpperCase() === 'T',
    year: String(row.isyear || 'F').toUpperCase() === 'T',
  };
}

function basePeriods(rows) {
  return rows.map(normalizePeriod).filter(period => !period.quarter && !period.year).sort((a, b) => a.startDate.localeCompare(b.startDate));
}

function findPeriod(periods, value) {
  const needle = String(value || '').trim().toLowerCase();
  return periods.find(period => period.id.toLowerCase() === needle || period.name.toLowerCase() === needle);
}

function resolveScope(periods, options = {}, affectedIds = []) {
  if (!periods.length) throw new Error('NetSuite returned no base accounting periods.');
  const mode = options.scope || (options.period ? 'period' : options.from || options.to ? 'range' : 'affected');
  if (mode === 'all') return periods;
  if (mode === 'period') {
    const selected = findPeriod(periods, options.period);
    if (!selected) throw new Error(`Accounting period not found: ${options.period}`);
    return [selected];
  }
  if (mode === 'range') {
    const from = findPeriod(periods, options.from);
    const to = findPeriod(periods, options.to);
    if (!from || !to) throw new Error(`Accounting period range not found: ${options.from || '?'} to ${options.to || '?'}`);
    if (from.startDate > to.startDate) throw new Error('The first accounting period must not be after the last period.');
    return periods.filter(period => period.startDate >= from.startDate && period.startDate <= to.startDate);
  }
  if (mode !== 'affected') throw new Error(`Unknown period scope: ${mode}`);
  const affected = new Set(affectedIds.map(String));
  if (affected.size) return periods.filter(period => affected.has(period.id));
  const lookback = Math.max(1, Math.min(24, Number(options.lookback || 2)));
  const today = isoDate(options.now || new Date().toISOString());
  let anchor = periods.findIndex(period => period.startDate <= today && period.endDate >= today);
  if (anchor < 0) {
    anchor = periods.reduce((selected, period, index) => period.startDate <= today ? index : selected, -1);
  }
  if (anchor < 0) anchor = 0;
  return periods.slice(Math.max(0, anchor - lookback + 1), anchor + 1);
}

function dimensionSql(definition) {
  const columns = [
    `${definition.id} AS source_id`,
    `${definition.name} AS source_name`,
    definition.alias ? `${definition.alias} AS source_alias` : 'NULL AS source_alias',
    definition.parent ? `${definition.parent} AS parent_source_id` : 'NULL AS parent_source_id',
    definition.inactive ? `${definition.inactive} AS inactive` : "'F' AS inactive",
    definition.type ? `${definition.type} AS source_type` : 'NULL AS source_type',
  ];
  return `SELECT ${columns.join(', ')} FROM ${definition.table} ORDER BY ${definition.id}`;
}

function normalizeMembers(dimension, rows) {
  return rows.map(row => ({
    dimension,
    sourceSystem: 'netsuite',
    sourceId: String(row.source_id),
    name: String(row.source_name || row.source_id),
    alias: row.source_alias == null ? null : String(row.source_alias),
    parentSourceId: row.parent_source_id == null ? null : String(row.parent_source_id),
    active: String(row.inactive || 'F').toUpperCase() !== 'T',
    sourceType: row.source_type == null ? null : String(row.source_type),
  }));
}

function mappingSeed(members, existing = [], usedKeys = null) {
  const prior = new Map(existing.map(row => [`${row.dimension}:${row.sourceId}`, row]));
  const now = new Date().toISOString();
  const currentKeys = new Set(members.map(member => `${member.dimension}:${member.sourceId}`));
  const current = members.map(member => {
    const previous = prior.get(`${member.dimension}:${member.sourceId}`);
    const key = `${member.dimension}:${member.sourceId}`;
    const usedInSelectedPeriods = usedKeys ? usedKeys.has(key) : null;
    let status = previous?.targetMember ? 'mapped' : 'unmapped';
    if (!member.active && !previous?.targetMember) status = 'inactive';
    else if (usedKeys && !usedInSelectedPeriods && !previous?.targetMember) status = 'available';
    return {
      dimension: member.dimension,
      sourceSystem: 'netsuite',
      sourceId: member.sourceId,
      sourceName: member.name,
      sourceAlias: member.alias,
      sourceType: member.sourceType || null,
      targetMember: previous?.targetMember || null,
      status,
      usedInSelectedPeriods,
      firstSeenAt: previous?.firstSeenAt || previous?.lastSeenAt || now,
      lastSeenAt: now,
    };
  });
  const retired = existing.filter(row => !currentKeys.has(`${row.dimension}:${row.sourceId}`)).map(row => ({
    ...row,
    status: 'retired',
    retiredAt: row.retiredAt || now,
  }));
  return [...current, ...retired].sort((a, b) => `${a.dimension}:${a.sourceId}`.localeCompare(`${b.dimension}:${b.sourceId}`));
}

function factSql(period) {
  return `SELECT tal.account AS account_id,
    tl.subsidiary AS subsidiary_id, tl.department AS department_id,
    tl.class AS class_id, tl.location AS location_id, tl.item AS item_id, tl.entity AS relationship_id,
    ROUND(SUM(tal.amount), 8) AS amount, COUNT(*) AS source_lines
  FROM transactionaccountingline tal
  JOIN transaction t ON t.id = tal.transaction
  LEFT JOIN transactionline tl ON tl.transaction = tal.transaction AND tl.id = tal.transactionline
  WHERE tal.posting = 'T' AND t.postingperiod = ${Number(period.id)}
  GROUP BY tal.account, tl.subsidiary, tl.department, tl.class, tl.location, tl.item, tl.entity`;
}

function controlSql(period) {
  return `SELECT tal.account AS account_id, ROUND(SUM(tal.amount), 8) AS amount, COUNT(*) AS source_lines
  FROM transactionaccountingline tal
  JOIN transaction t ON t.id = tal.transaction
  WHERE tal.posting = 'T' AND t.postingperiod = ${Number(period.id)}
  GROUP BY tal.account`;
}

function normalizeFacts(period, rows) {
  return rows.map(row => ({
    periodId: period.id,
    period: period.name,
    accountId: row.account_id == null ? null : String(row.account_id),
    subsidiaryId: row.subsidiary_id == null ? null : String(row.subsidiary_id),
    departmentId: row.department_id == null ? null : String(row.department_id),
    classId: row.class_id == null ? null : String(row.class_id),
    locationId: row.location_id == null ? null : String(row.location_id),
    itemId: row.item_id == null ? null : String(row.item_id),
    relationshipId: row.relationship_id == null ? null : String(row.relationship_id),
    amount: number(row.amount),
    sourceLines: number(row.source_lines),
  }));
}

function reconcile(period, facts, controls, tolerance = 0.005) {
  const controlRows = Array.isArray(controls) ? controls : [controls || {}];
  const extractedAmount = facts.reduce((sum, row) => sum + row.amount, 0);
  const extractedLines = facts.reduce((sum, row) => sum + row.sourceLines, 0);
  const sourceAmount = controlRows.reduce((sum, row) => sum + number(row.amount), 0);
  const sourceLines = controlRows.reduce((sum, row) => sum + number(row.source_lines), 0);
  const difference = extractedAmount - sourceAmount;
  const factsByAccount = new Map();
  for (const row of facts) {
    const current = factsByAccount.get(row.accountId) || { amount: 0, lines: 0 };
    current.amount += row.amount;
    current.lines += row.sourceLines;
    factsByAccount.set(row.accountId, current);
  }
  const accountDifferences = controlRows.map(row => {
    const accountId = row.account_id == null ? null : String(row.account_id);
    const extracted = factsByAccount.get(accountId) || { amount: 0, lines: 0 };
    return {
      accountId,
      amountDifference: extracted.amount - number(row.amount),
      lineDifference: extracted.lines - number(row.source_lines),
    };
  }).filter(row => Math.abs(row.amountDifference) > tolerance || row.lineDifference !== 0);
  return {
    periodId: period.id,
    period: period.name,
    sourceAmount,
    extractedAmount,
    difference,
    sourceLines,
    extractedLines,
    accountsChecked: controlRows.length,
    accountMismatches: accountDifferences.length,
    mismatchSample: accountDifferences.slice(0, 10),
    passed: Math.abs(difference) <= tolerance && extractedLines === sourceLines && accountDifferences.length === 0,
  };
}

function normalizedAccountControls(controls) {
  return (Array.isArray(controls) ? controls : []).map(row => ({
    accountId: row.account_id == null ? null : String(row.account_id),
    amount: number(row.amount),
    sourceLines: number(row.source_lines),
  })).sort((a, b) => String(a.accountId).localeCompare(String(b.accountId)));
}

function atomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporary, file);
}

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

async function detectAffectedPeriods(suiteql, checkpoint) {
  if (!checkpoint?.completedAt) return { ids: [], method: 'open-period-fallback' };
  const since = String(checkpoint.completedAt).replace('T', ' ').replace(/\.\d{3}Z$/, '');
  const sql = `SELECT DISTINCT t.postingperiod AS period_id FROM transaction t
    WHERE t.lastmodifieddate >= TO_TIMESTAMP(${sqlString(since)}, 'YYYY-MM-DD HH24:MI:SS')`;
  try {
    const rows = await suiteql(sql, 5000);
    return { ids: rows.map(row => String(row.period_id)).filter(Boolean), method: 'transaction-lastmodifieddate' };
  } catch (error) {
    return { ids: [], method: 'open-period-fallback', warning: `Affected-period detection unavailable: ${error.message}` };
  }
}

async function runPlanningSync(options) {
  const client = safeClient(options.client);
  const root = options.root || path.resolve(__dirname, '..', '..');
  const suiteql = options.suiteql;
  if (typeof suiteql !== 'function') throw new Error('A SuiteQL client is required.');
  const base = path.join(root, 'clients', client, 'integration', 'netsuite');
  const stateFile = path.join(base, 'state.json');
  const state = readJson(stateFile, { version: 1, client, source: 'netsuite', periods: {} });
  const startedAt = new Date().toISOString();
  const runId = startedAt.replace(/[-:.TZ]/g, '').slice(0, 14);
  const staging = path.join(base, 'runs', `${runId}-staging`);
  const published = path.join(base, 'runs', runId);
  fs.mkdirSync(staging, { recursive: true });

  const manifest = { version: 1, runId, client, source: 'netsuite', status: 'running', startedAt, scope: options.scope || 'affected', warnings: [], periods: [], dimensions: {} };
  atomicJson(path.join(staging, 'manifest.json'), manifest);
  try {
    const periodRows = await suiteql(`SELECT id, periodname, startdate, enddate, closed, isadjust, isquarter, isyear
      FROM accountingperiod ORDER BY startdate`, 5000);
    const periods = basePeriods(periodRows);
    const affected = await detectAffectedPeriods(suiteql, state.lastSuccessfulRun);
    if (affected.warning) manifest.warnings.push(affected.warning);
    const selected = resolveScope(periods, options, affected.ids);
    manifest.periodSelection = { method: options.scope === 'affected' || !options.scope ? affected.method : 'explicit', selected: selected.map(period => ({ id: period.id, name: period.name })) };
    if (!selected.length) throw new Error('The selected scope contains no accounting periods.');

    const custom = Array.isArray(options.customDimensions) ? options.customDimensions : [];
    const definitions = [...CORE_DIMENSIONS, ...custom];
    const allMembers = [];
    for (const definition of definitions) {
      try {
        const members = normalizeMembers(definition.key, await suiteql(dimensionSql(definition), 100000));
        allMembers.push(...members);
        manifest.dimensions[definition.key] = { status: 'ok', members: members.length };
        atomicJson(path.join(staging, 'dimensions', `${definition.key}.json`), members);
      } catch (error) {
        manifest.dimensions[definition.key] = { status: 'unknown', error: error.message };
        manifest.warnings.push(`${definition.key}: not visible or not permitted (${error.message})`);
      }
    }
    const allFacts = [];
    for (const period of selected) {
      const facts = normalizeFacts(period, await suiteql(factSql(period), Number(options.cap || 500000)));
      allFacts.push(...facts);
      const controls = await suiteql(controlSql(period), 100000);
      const reconciliation = reconcile(period, facts, controls, Number(options.tolerance ?? 0.005));
      atomicJson(path.join(staging, 'facts', `${period.id}.json`), facts);
      atomicJson(path.join(staging, 'controls', `${period.id}.json`), {
        summary: reconciliation,
        accounts: normalizedAccountControls(controls),
      });
      manifest.periods.push({ id: period.id, name: period.name, rows: facts.length, ...reconciliation });
      if (!reconciliation.passed) throw new Error(`Reconciliation failed for ${period.name}: difference ${reconciliation.difference}, lines ${reconciliation.extractedLines}/${reconciliation.sourceLines}`);
    }

    const usedKeys = new Set();
    const factDimensions = {
      account: 'accountId', subsidiary: 'subsidiaryId', department: 'departmentId', class: 'classId',
      location: 'locationId', item: 'itemId', relationship: 'relationshipId',
    };
    for (const fact of allFacts) {
      for (const [dimension, field] of Object.entries(factDimensions)) {
        if (fact[field] != null) usedKeys.add(`${dimension}:${fact[field]}`);
      }
    }
    const previousMappings = readJson(path.join(base, 'source-member-mappings.json'), []);
    const mappings = mappingSeed(allMembers, previousMappings, usedKeys);
    atomicJson(path.join(staging, 'source-member-mappings.json'), mappings);
    manifest.mappingSummary = mappings.reduce((summary, row) => {
      summary[row.status] = (summary[row.status] || 0) + 1;
      return summary;
    }, {});

    manifest.status = 'published';
    manifest.completedAt = new Date().toISOString();
    atomicJson(path.join(staging, 'manifest.json'), manifest);
    fs.renameSync(staging, published);
    atomicJson(path.join(base, 'source-member-mappings.json'), mappings);
    const nextState = {
      ...state,
      lastSuccessfulRun: { runId, completedAt: manifest.completedAt, periods: manifest.periodSelection.selected },
      periods: { ...state.periods, ...Object.fromEntries(manifest.periods.map(period => [period.id, { name: period.name, completedAt: manifest.completedAt, sourceAmount: period.sourceAmount, sourceLines: period.sourceLines }])) },
    };
    atomicJson(stateFile, nextState);
    return { manifest, directory: published };
  } catch (error) {
    manifest.status = 'failed';
    manifest.completedAt = new Date().toISOString();
    manifest.error = error.message;
    atomicJson(path.join(staging, 'manifest.json'), manifest);
    throw error;
  }
}

module.exports = {
  CORE_DIMENSIONS,
  atomicJson,
  basePeriods,
  controlSql,
  detectAffectedPeriods,
  dimensionSql,
  factSql,
  mappingSeed,
  normalizedAccountControls,
  normalizeFacts,
  normalizeMembers,
  reconcile,
  resolveScope,
  runPlanningSync,
  safeClient,
};
