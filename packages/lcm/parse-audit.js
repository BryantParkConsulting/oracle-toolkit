'use strict';
// Stream-parse an NSPB Audit export (AuditRecords .xlsx, inline strings) into
// clients/<c>/audit-summary.json — the usage-telemetry backbone of the
// Current State Assessment.
//   node tools/parse-audit.js <CLIENT> <path-to-xlsx-sheet1-xml-on-stdin>
// Usage: unzip -p "clients/talogy/AuditRecords (1).xlsx" xl/worksheets/sheet1.xml | node tools/parse-audit.js talogy
const fs = require('fs');
const path = require('path');
const CLIENT = process.argv[2] || 'talogy';
const OUT = path.join(__dirname, '..', '..', 'clients', CLIENT, 'audit-summary.json');

let buf = '';
const dec = s => s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#xa;/g, '\n').replace(/&amp;/g, '&');

// aggregations
const byType = {};                 // audit type -> count
const byUser = {};                 // user -> {count, first, last}
const ruleRuns = {};               // rule -> {count, last, users:Set, cube}
const dataChanges = {};            // user -> count (Audit type "Data")
const byTypeAction = {};           // "type|action" -> count
const artifactTouch = {};          // "type|name" -> {count, last, users:Set}
let total = 0, minDate = null, maxDate = null;

function parseDate(s) {            // "6/12/26 12:32:32 PM"
  const m = s.match(/(\d+)\/(\d+)\/(\d+) (\d+):(\d+):(\d+) (AM|PM)/);
  if (!m) return null;
  let [, mo, d, y, h, mi, se, ap] = m;
  h = +h % 12 + (ap === 'PM' ? 12 : 0);
  return new Date(2000 + +y, mo - 1, +d, h, +mi, +se);
}

function onRow(cells) {
  const [date, type, source, action, user, , details] = cells;
  if (date === 'Date') return;     // header
  total++;
  const dt = parseDate(date || '');
  if (dt) { if (!minDate || dt < minDate) minDate = dt; if (!maxDate || dt > maxDate) maxDate = dt; }
  byType[type] = (byType[type] || 0) + 1;
  byTypeAction[`${type}|${action}`] = (byTypeAction[`${type}|${action}`] || 0) + 1;
  if (user) {
    const u = byUser[user] || (byUser[user] = { count: 0, first: null, last: null });
    u.count++;
    if (dt) { if (!u.first || dt < new Date(u.first)) u.first = dt.toISOString(); if (!u.last || dt > new Date(u.last)) u.last = dt.toISOString(); }
  }
  if ((type === 'Business Rule' || type === 'Calc Script' || type === 'Rule') && action === 'Execute' && source) {
    const r = ruleRuns[source] || (ruleRuns[source] = { count: 0, last: null, users: new Set(), cube: details || '' });
    r.count++; r.users.add(user);
    if (dt && (!r.last || dt > new Date(r.last))) r.last = dt.toISOString();
    if (details && !r.cube) r.cube = details;
  }
  if (type === 'Data' && user) dataChanges[user] = (dataChanges[user] || 0) + 1;
  if (source) {
    const k = `${type}|${source}`;
    const a = artifactTouch[k] || (artifactTouch[k] = { count: 0, last: null, users: new Set() });
    a.count++; a.users.add(user);
    if (dt && (!a.last || dt > new Date(a.last))) a.last = dt.toISOString();
  }
}

process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  buf += chunk;
  let i;
  while ((i = buf.indexOf('</row>')) !== -1) {
    const row = buf.slice(0, i);
    buf = buf.slice(i + 6);
    // cells in order; missing cells are rare in this export (all inline)
    const cells = [];
    const re = /<c r="([A-J])\d+"[^>]*>(?:<is><t[^>]*>([\s\S]*?)<\/t><\/is>)?<\/c>/g;
    let m;
    while ((m = re.exec(row)) !== null) cells[m[1].charCodeAt(0) - 65] = dec(m[2] || '');
    if (cells.length) onRow(cells);
  }
});
process.stdin.on('end', () => {
  const setLen = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { ...v, users: [...v.users].filter(Boolean) }]));
  const summary = {
    client: CLIENT, totalRecords: total,
    windowStart: minDate && minDate.toISOString(), windowEnd: maxDate && maxDate.toISOString(),
    windowDays: minDate && maxDate ? Math.round((maxDate - minDate) / 86400000) : null,
    byType, byTypeAction, byUser, dataChangesByUser: dataChanges,
    ruleRuns: setLen(ruleRuns),
    artifactTouch: setLen(artifactTouch),
  };
  fs.writeFileSync(OUT, JSON.stringify(summary, null, 1));
  const n = x => x.toLocaleString('en-US');
  console.log(`═══ Audit summary — ${CLIENT} ═══`);
  console.log(`${n(total)} records · ${summary.windowDays} days (${(summary.windowStart || '').slice(0, 10)} → ${(summary.windowEnd || '').slice(0, 10)})`);
  console.log(`\nBy audit type:`); Object.entries(byType).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${k.padEnd(28)} ${n(v)}`));
  console.log(`\nUsers (${Object.keys(byUser).length}):`); Object.entries(byUser).sort((a, b) => b[1].count - a[1].count).slice(0, 12).forEach(([k, v]) => console.log(`  ${k.padEnd(44)} ${n(v.count)}  last ${String(v.last).slice(0, 10)}`));
  console.log(`\nRules executed (${Object.keys(ruleRuns).length} distinct):`);
  Object.entries(ruleRuns).sort((a, b) => b[1].count - a[1].count).slice(0, 15).forEach(([k, v]) => console.log(`  ${k.padEnd(44)} ${n(v.count)}×  last ${String(v.last).slice(0, 10)}`));
  console.log(`\n✓ wrote ${path.relative(process.cwd(), OUT)}`);
});
