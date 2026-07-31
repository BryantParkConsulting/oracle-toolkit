'use strict';
// NetSuite ERP data extractor — pulls the "level-0 equivalent" telemetry for the
// Current State Assessment via SuiteQL over REST (TBA / OAuth 1.0a, HMAC-SHA256).
// No browser, no DOM scraping. Aggregated queries → small/fast result sets.
//
//   node tools/ns-erp-extract.js [client]      (default client: enfinity)
//
// Reads creds from repo-root .env (gitignored), same pattern as GEMINI_API_KEY:
//   NS_ACCOUNT=4766983_SB3
//   NS_CONSUMER_KEY=...
//   NS_CONSUMER_SECRET=...
//   NS_TOKEN_ID=...
//   NS_TOKEN_SECRET=...
//
// Output: clients/<client>/erp/raw/<query>.json  (one file per query) + _meta.json
// Each query is independent and wrapped in try/catch — a bad table name logs an
// error and skips, it never kills the run. Extend QUERIES freely.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..', '..');
const CLIENT = process.argv[2] || 'enfinity';
const OUT = path.join(ROOT, 'clients', CLIENT, 'erp', 'raw');
fs.mkdirSync(OUT, { recursive: true });

// ── .env loader (no dep) ─────────────────────────────────────────────
function loadEnv() {
  const p = path.join(ROOT, '.env');
  const env = { ...process.env };
  if (fs.existsSync(p)) {
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  return env;
}
const ENV = loadEnv();
const ACCOUNT = ENV.NS_ACCOUNT;                       // realm, e.g. 4766983_SB3
const CK = ENV.NS_CONSUMER_KEY, CS = ENV.NS_CONSUMER_SECRET;
const TK = ENV.NS_TOKEN_ID, TS = ENV.NS_TOKEN_SECRET;
if (!ACCOUNT || !CK || !CS || !TK || !TS) {
  console.error('Missing NS_* creds in .env (NS_ACCOUNT, NS_CONSUMER_KEY, NS_CONSUMER_SECRET, NS_TOKEN_ID, NS_TOKEN_SECRET).');
  process.exit(1);
}
const HOST = ACCOUNT.toLowerCase().replace(/_/g, '-') + '.suitetalk.api.netsuite.com';
const BASE = `https://${HOST}/services/rest/query/v1/suiteql`;

// ── OAuth 1.0a (HMAC-SHA256) ─────────────────────────────────────────
const enc = s => encodeURIComponent(s).replace(/[!*'()]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
function authHeader(method, url, extraParams) {
  const oauth = {
    oauth_consumer_key: CK,
    oauth_token: TK,
    oauth_signature_method: 'HMAC-SHA256',
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_version: '1.0',
  };
  const all = { ...oauth, ...extraParams };
  const paramStr = Object.keys(all).sort().map(k => `${enc(k)}=${enc(all[k])}`).join('&');
  const baseStr = [method.toUpperCase(), enc(url), enc(paramStr)].join('&');
  const key = `${enc(CS)}&${enc(TS)}`;
  oauth.oauth_signature = crypto.createHmac('sha256', key).update(baseStr).digest('base64');
  const header = 'OAuth realm="' + ACCOUNT + '",' +
    Object.keys(oauth).sort().map(k => `${enc(k)}="${enc(oauth[k])}"`).join(',');
  return header;
}

// ── SuiteQL runner with pagination ───────────────────────────────────
async function suiteql(q, { limit = 1000 } = {}) {
  let offset = 0, items = [], more = true, guard = 0;
  while (more && guard++ < 200) {
    const url = `${BASE}?limit=${limit}&offset=${offset}`;
    const header = authHeader('POST', BASE, { limit: String(limit), offset: String(offset) });
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: header, 'Content-Type': 'application/json', Prefer: 'transient' },
      body: JSON.stringify({ q }),
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`HTTP ${res.status}: ${txt.slice(0, 400)}`);
    }
    const json = await res.json();
    items = items.concat(json.items || []);
    more = json.hasMore;
    offset += limit;
  }
  return items;
}

// ── the assessment query battery (aggregated → small) ────────────────
// Note: column/table names follow SuiteQL Analytics record catalog. If one fails
// for this account's config, it logs and skips — adjust and re-run.
const SINCE = "TO_DATE('2025-12-01','YYYY-MM-DD')"; // ~6m window; tune as needed
const QUERIES = [
  ['subsidiaries', `SELECT id, name, country, iselimination, parent FROM subsidiary ORDER BY id`],
  ['accountingbooks', `SELECT id, name, isprimary FROM accountingbook ORDER BY id`],
  ['periods_recent', `SELECT id, periodname, startdate, enddate, closed, isadjust, isquarter, isyear FROM accountingperiod WHERE startdate >= ${SINCE} ORDER BY startdate`],
  ['coa_by_type', `SELECT accttype, COUNT(*) AS cnt FROM account GROUP BY accttype ORDER BY cnt DESC`],
  ['coa_total', `SELECT COUNT(*) AS total, SUM(CASE WHEN isinactive='F' THEN 1 ELSE 0 END) AS active FROM account`],
  ['classifications', `SELECT 'class' AS kind, COUNT(*) AS cnt FROM classification UNION ALL SELECT 'department', COUNT(*) FROM department UNION ALL SELECT 'location', COUNT(*) FROM location`],
  ['txn_by_type_6m', `SELECT type, COUNT(*) AS cnt, MAX(trandate) AS last FROM transaction WHERE trandate >= ${SINCE} GROUP BY type ORDER BY cnt DESC`],
  ['txn_by_type_all', `SELECT type, COUNT(*) AS cnt, MIN(trandate) AS first, MAX(trandate) AS last FROM transaction GROUP BY type ORDER BY cnt DESC`],
  ['scripts', `SELECT scripttype, COUNT(*) AS cnt FROM script GROUP BY scripttype ORDER BY cnt DESC`],
  ['scriptdeployments', `SELECT status, COUNT(*) AS cnt FROM scriptdeployment GROUP BY status`],
  ['employees_headcount', `SELECT COUNT(*) AS total, SUM(CASE WHEN isinactive='F' THEN 1 ELSE 0 END) AS active FROM employee`],
  ['items_by_type', `SELECT itemtype, COUNT(*) AS cnt FROM item GROUP BY itemtype ORDER BY cnt DESC`],
  ['customers_count', `SELECT COUNT(*) AS total, SUM(CASE WHEN isinactive='F' THEN 1 ELSE 0 END) AS active FROM customer`],
  ['vendors_count', `SELECT COUNT(*) AS total, SUM(CASE WHEN isinactive='F' THEN 1 ELSE 0 END) AS active FROM vendor`],
  ['currencies', `SELECT id, name, symbol, isbasecurrency FROM currency ORDER BY id`],
  ['customrecordtypes', `SELECT internalid, name, scriptid FROM customrecordtype ORDER BY name`],
];

(async () => {
  const meta = { client: CLIENT, account: ACCOUNT, host: HOST, extractedAt: new Date().toISOString().slice(0, 10), results: {} };
  for (const [name, q] of QUERIES) {
    try {
      process.stdout.write(`→ ${name} ... `);
      const rows = await suiteql(q);
      fs.writeFileSync(path.join(OUT, `${name}.json`), JSON.stringify(rows, null, 2));
      meta.results[name] = { ok: true, rows: rows.length };
      console.log(`${rows.length} rows`);
    } catch (e) {
      meta.results[name] = { ok: false, error: e.message };
      console.log(`SKIP (${e.message.slice(0, 80)})`);
    }
  }
  fs.writeFileSync(path.join(OUT, '_meta.json'), JSON.stringify(meta, null, 2));
  console.log(`\nDone → ${path.relative(ROOT, OUT)}  (${Object.values(meta.results).filter(r => r.ok).length}/${QUERIES.length} ok)`);
})();
