'use strict';
// REVENUE ↔ FINANCIALS reconciliation lineage — "why Total Revenue ≠ Income".
// Recomputes, from the LCM export (clients/<CLIENT>/):
//   • the NetSuite saved searches behind each FDMEE data source, split income/revenue/metadata
//   • the RevPlan→OEP_FS push mapping (@XWRITE: REV category → GL account)
//   • the Account-dimension grain gap (REV_Revenue Accounts leaves vs INCOME leaves)
//   • how Total Revenue is composed (dynamic-calc aggregation tree)
// Output: clients/<CLIENT>/revenue-recon.json  (consumed by architecture-report.js §1.7 / §3.4)
//   node tools/parse-revenue-recon.js [CLIENT]
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const CLIENT = process.argv[2] || 'talogy';
const dir = path.join(ROOT, 'clients', CLIENT);
const dec = s => decodeURIComponent(String(s).replace(/%(?![0-9A-F]{2})/gi, '%25'));

// ── quote-aware CSV parser (handles multi-line formula fields) ───────────
function parseCsv(text) {
  const R = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); cur = ''; R.push(row); row = []; }
    else cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); R.push(row); }
  return R;
}

// ── locate LCM folders ───────────────────────────────────────────────────
const hpDir = fs.readdirSync(dir).map(f => path.join(dir, f)).find(f => /HP-/.test(f) && fs.statSync(f).isDirectory());
const calcDir = fs.readdirSync(dir).map(f => path.join(dir, f)).find(f => /CALC-/.test(f) && fs.statSync(f).isDirectory());
const fdmDir = fs.readdirSync(dir).map(f => path.join(dir, f)).find(f => /FDMEE/.test(f) && fs.statSync(f).isDirectory());

// ════════ 1. Account dimension — grain gap + Total Revenue composition ════════
function loadAccount() {
  const p = hpDir && path.join(hpDir, 'resource', 'Global Artifacts', 'Common Dimensions', 'Standard Dimensions', 'Account.csv');
  if (!p || !fs.existsSync(p)) return null;
  let raw = fs.readFileSync(p, 'utf8').replace(/^﻿/, '');
  const h = raw.match(/^Account,\s*Parent,.*$/m);            // header may sit below an XML block
  if (!h) return null;
  const recs = parseCsv(raw.slice(h.index));
  const H = recs[0].map(s => s.trim());
  const iDS = H.indexOf('Data Storage'), iAl = H.indexOf('Alias: Default'), iAT = H.indexOf('Account Type');
  const rows = [];
  for (let i = 1; i < recs.length; i++) {
    const f = recs[i], m = (f[0] || '').trim();
    if (!m || m.startsWith('#')) continue;
    rows.push({ m, p: (f[1] || '').trim(), ds: (f[iDS] || '').trim(), al: (f[iAl] || '').trim(), at: (f[iAT] || '').trim() });
  }
  const children = new Map(), byM = new Map();
  for (const r of rows) { (children.get(r.p) || children.set(r.p, []).get(r.p)).push(r); if (!byM.has(r.m)) byM.set(r.m, r); }
  const leaves = root => {
    const out = [], st = [root], seen = new Set();
    while (st.length) { const x = st.pop(); if (seen.has(x)) continue; seen.add(x); const k = children.get(x) || []; if (!k.length) out.push(x); else k.forEach(z => st.push(z.m)); }
    return [...new Set(out)];
  };
  const tree = (root, depth, seen, acc) => {
    const r = byM.get(root); if (!r) return;
    acc.push({ member: root, ds: r.ds, at: r.at, depth });
    if (seen.has(root)) return; seen.add(root);
    for (const c of (children.get(root) || [])) tree(c.m, depth + 1, seen, acc);
  };
  const revLeaves = byM.has('REV_Revenue Accounts') ? leaves('REV_Revenue Accounts') : [];
  const incLeaves = byM.has('INCOME') ? leaves('INCOME') : [];
  const rSet = new Set(revLeaves), iSet = new Set(incLeaves);
  const totRevTree = []; if (byM.has('Total Revenue')) tree('Total Revenue', 0, new Set(), totRevTree);
  const meta = m => { const r = byM.get(m) || {}; return { member: m, ds: r.ds || '', alias: r.al || '' }; };
  return {
    revLeaves: revLeaves.sort().map(meta),
    incomeLeaves: incLeaves.sort().map(meta),
    common: [...rSet].filter(x => iSet.has(x)).sort(),
    totalRevenueTree: totRevTree,
  };
}

// ════════ 2. RevPlan → OEP_FS push mapping (@XWRITE) ════════
function loadPushMap() {
  if (!calcDir) return null;
  const ruleDirs = [];
  const planRoot = path.join(calcDir, 'resource', 'Planning');
  if (fs.existsSync(planRoot)) for (const app of fs.readdirSync(planRoot)) {
    for (const cube of ['RevPlan', 'OEP_FS']) { const d = path.join(planRoot, app, cube, 'Rules'); if (fs.existsSync(d)) ruleDirs.push(d); }
  }
  const pairs = [];
  for (const d of ruleDirs) for (const fn of fs.readdirSync(d)) {
    const full = path.join(d, fn); if (!fs.statSync(full).isFile()) continue;
    const txt = fs.readFileSync(full, 'utf8').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&').replace(/&quot;/g, '"');
    const re = /@XWRITE\s*\(([^;]*?)\)/gms; let m;
    while ((m = re.exec(txt))) {
      const toks = [...m[1].matchAll(/"([^"]+)"/g)].map(x => x[1]);
      if (toks.length >= 2) pairs.push({ src: toks[0], tgt: toks[toks.length - 1], file: dec(fn) });
    }
  }
  // collapse src -> set(tgt); keep only revenue-account targets (Axxxx / COGS), drop cross-dim writes
  const map = new Map();
  for (const p of pairs) { if (!/^(A\d|COGS)/.test(p.tgt)) continue; (map.get(p.src) || map.set(p.src, new Set()).get(p.src)).add(p.tgt); }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([src, tg]) => ({ src, targets: [...tg].sort() }));
}

// ════════ 3. FDMEE saved searches per data source, classified ════════
function loadSavedSearches() {
  if (!fdmDir) return null;
  const dsDir = path.join(fdmDir, 'resource', 'Application Data', 'Datasource Applications');
  if (!fs.existsSync(dsDir)) return null;
  const income = [], revenue = [], metadata = [];
  const dimOf = s => /acct|account/i.test(s) ? 'Account' : /dept|department/i.test(s) ? 'Department'
    : /segment|mktsgmt|market/i.test(s) ? 'Market Segment' : /site/i.test(s) ? 'Site'
    : /entity|subsidiar/i.test(s) ? 'Entity / Subsidiary' : 'Other';
  for (const name of fs.readdirSync(dsDir)) {
    const def = path.join(dsDir, name, 'Application Definition.xml');
    if (!fs.existsSync(def)) continue;
    const x = fs.readFileSync(def, 'utf8');
    const ss = [...new Set((x.match(/customsearch[a-z0-9_]+/gi) || []).map(s => s.toLowerCase()))];
    if (!ss.length) continue;
    const search = ss.join(', ');
    const isMeta = /metadata|newaccts|newdepts|newsites|newentity|newmktsgmt|sync.*acct|update metadata|site metadata/i.test(name)
      || (/account|dept|site|subsidiar|segment|entity/i.test(name) && !/actuals|revenue|expense|balance|volume|rates|transaction|consulting/i.test(name));
    if (isMeta) metadata.push({ dimension: dimOf(name), dataSource: name, search });
    else if (/revenue|revplan|consulting|volume|\brp$/i.test(name)) revenue.push({ dataSource: name, search });   // "…RP" suffix = RevPlan side
    else if (/financial actuals|oep_fs|trial balance|total expense\b|transaction summary/i.test(name)) income.push({ dataSource: name, search });
    // (FX rates / generic metadata pools are intentionally not bucketed into income/revenue)
  }
  const ord = (a, b) => a.dataSource.localeCompare(b.dataSource);
  return { income: income.sort(ord), revenue: revenue.sort(ord), metadata: metadata.sort((a, b) => a.dimension.localeCompare(b.dimension) || ord(a, b)) };
}

// ════════ 4. FDMEE load structure — saved search → cube → area (authoritative) ════════
// Joins Import Format (Impgroupkey → datasource) with Data Load Rule (Impgroupkey, Catname,
// PlanType) so each wired NetSuite saved search maps to its real target cube + category.
function loadStructure() {
  if (!fdmDir) return null;
  const PA = path.join(fdmDir, 'resource', 'Application Data', 'Planning Applications');
  const DS = path.join(fdmDir, 'resource', 'Application Data', 'Datasource Applications');
  if (!fs.existsSync(PA)) return null;
  const rd = f => fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '';
  const g = (s, t) => (s.match(new RegExp('<' + t + '>([^<]*)<')) || [])[1] || '';
  // every datasource app → its NetSuite saved search
  const ssOf = {};
  if (fs.existsSync(DS)) for (const name of fs.readdirSync(DS)) {
    const ss = [...new Set((rd(path.join(DS, name, 'Application Definition.xml')).match(/customsearch[a-z0-9_]+/gi) || []).map(s => s.toLowerCase()))];
    if (ss.length) ssOf[name] = ss.join(', ');
  }
  // plan-type code → cube name (from the main data app)
  const appx = rd(path.join(PA, 'PAI_PLN', 'Application Definition.xml'));
  const cubeOf = { PLAN1: g(appx, 'Plan1Name'), PLAN2: g(appx, 'Plan2Name'), PLAN3: g(appx, 'Plan3Name') };
  // import format Impgroupkey → datasource app
  const fmtToDs = {};
  for (const row of rd(path.join(PA, 'PAI_PLN', 'Import Format.xml')).split('<ImportGroupsFileLcmVORow>').slice(1)) {
    const k = g(row, 'Impgroupkey'), ds = g(row, 'EpmSourceSystemName').trim();
    if (k && ds && ds !== 'File') fmtToDs[k] = ds;
  }
  // data rules → join to datasource + cube
  const byDs = {};
  for (const row of rd(path.join(PA, 'PAI_PLN', 'Data Load Rule.xml')).split('<DataRuleForLcmVORow>').slice(1)) {
    const rule = g(row, 'RuleName'), cat = g(row, 'Catname'), cube = cubeOf[g(row, 'PlanType')] || g(row, 'PlanType');
    let fmt = g(row, 'Impgroupkey'); if (!fmt) fmt = rule.replace(/_OEP_?FS$/i, '');   // _OEPFS rules reuse base format
    const ds = fmtToDs[fmt]; if (!ds) continue;
    const e = byDs[ds] || (byDs[ds] = { cubes: new Set(), cats: new Set(), rules: [] });
    if (cube) e.cubes.add(cube); if (cat) e.cats.add(cat); e.rules.push(rule);
  }
  const AREA = {
    'PBCS - Financial Actuals': 'Income Statement GL accounts (INCOME, COGS, expense)',
    'PBCS - RevPlan Actuals': 'REV_Revenue Accounts (Total Revenue categories)',
    'PBCS - Volume RevPlan': 'Volume / statistical accounts',
    'PBCS - Total Expense RP': 'Site expense / Total Expense',
    'PBCS - FX Rates': 'Exchange Rates (FX Rates - Average / Ending)',
  };
  const dataLoads = Object.entries(byDs).map(([ds, v]) => ({
    dataSource: ds, search: ssOf[ds] || '', targetCubes: [...v.cubes], categories: [...v.cats], ruleCount: v.rules.length, area: AREA[ds] || '',
  })).sort((a, b) => a.dataSource.localeCompare(b.dataSource));
  // data saved searches defined but NOT wired into any import format (legacy / unused)
  const wired = new Set(Object.keys(byDs));
  const dataDs = [...(savedSearches ? savedSearches.income : []), ...(savedSearches ? savedSearches.revenue : [])];
  const unwired = dataDs.filter(r => !wired.has(r.dataSource));
  return {
    dataLoads, unwired,
    incomeSearch: ssOf['PBCS - Financial Actuals'] || '',
    revenueSearch: ssOf['PBCS - RevPlan Actuals'] || '',
  };
}

// ── assemble & derive gaps ───────────────────────────────────────────────
const hierarchy = loadAccount();
const pushMap = loadPushMap();
const savedSearches = loadSavedSearches();
const loadStruct = loadStructure();

let gaps = null;
if (hierarchy && pushMap) {
  const targets = new Set(pushMap.flatMap(p => p.targets));
  const sources = new Set(pushMap.map(p => p.src));
  const incomeNoPush = hierarchy.incomeLeaves.map(x => x.member).filter(a => !targets.has(a));
  const revNoPush = hierarchy.revLeaves.map(x => x.member).filter(s => !sources.has(s));
  gaps = {
    incomeLeaves: hierarchy.incomeLeaves.length,
    incomePushTargets: hierarchy.incomeLeaves.filter(x => targets.has(x.member)).length,
    incomeNoPush,
    revLeaves: hierarchy.revLeaves.length,
    revNoPush,
  };
}

const outFile = path.join(dir, 'revenue-recon.json');
fs.writeFileSync(outFile, JSON.stringify({ savedSearches, loadStructure: loadStruct, pushMap, hierarchy, gaps }, null, 1));
console.log('✓ wrote', path.relative(ROOT, outFile));
if (savedSearches) console.log(`  saved searches: ${savedSearches.income.length} income · ${savedSearches.revenue.length} revenue · ${savedSearches.metadata.length} metadata`);
if (loadStruct) console.log(`  load structure: ${loadStruct.dataLoads.length} wired data loads · ${loadStruct.unwired.length} defined-but-unwired · income←${loadStruct.incomeSearch} · revenue←${loadStruct.revenueSearch}`);
if (pushMap) console.log(`  push map: ${pushMap.length} REV categories → GL accounts`);
if (hierarchy) console.log(`  grain: REV ${hierarchy.revLeaves.length} leaves vs INCOME ${hierarchy.incomeLeaves.length} leaves · ${hierarchy.common.length} shared`);
if (gaps) console.log(`  gaps: ${gaps.incomeNoPush.length} income accts never a push target · ${gaps.revNoPush.length} REV categories not pushed`);
