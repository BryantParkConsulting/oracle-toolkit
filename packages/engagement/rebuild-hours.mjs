// Rebuild every client snapshot, INCREMENTALLY:
//  (1) MERGE per-SOW invoices by invoice # (add new, refresh status/amount of
//      existing) — so a weekly run only needs the RECENT invoice window from
//      NetSuite; the snapshot accumulates history, we never re-download it all.
//  (2) trim each SOW's time log to the most recent month (last 2 if thin).
// Caller republishes afterwards. `clients/invoices-raw.json` may hold the full
// history (first build) or just the recent window (weekly) — either works.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const ST = { B: 'Paid', A: 'Open', D: 'Deposit' };
const MO = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const moIdx = (d) => MO.indexOf(String(d).slice(0, 3));
// "Mon DD, YYYY" → sortable YYYYMMDD number (for ordering merged invoices).
const dateKey = (d) => {
  const m = /([A-Za-z]{3}) (\d{1,2}), (\d{4})/.exec(String(d));
  return m ? +`${m[3]}${String(moIdx(m[1]) + 1).padStart(2, '0')}${m[2].padStart(2, '0')}` : 0;
};

// NetSuite internal transaction ids for the invoice deep-links (tranid → id).
const TXN = existsSync('clients/invoice-txnids.json') ? JSON.parse(readFileSync('clients/invoice-txnids.json', 'utf8')) : {};
// RTM record + Opportunity ids per job, for the BPC-only NetSuite links.
const RTMOPP = existsSync('clients/rtm-opp.json') ? JSON.parse(readFileSync('clients/rtm-opp.json', 'utf8')) : {};

// Recent invoices grouped by job id (skip $0 and placeholder rows).
const raw = JSON.parse(readFileSync('clients/invoices-raw.json', 'utf8'));
const byJob = {};
for (const r of raw) {
  if (!r.amt || r.tranid === '—') continue;
  (byJob[r.job] ||= []).push({ tranid: r.tranid, date: r.d, hours: r.qty ?? undefined, amount: r.amt, status: ST[r.status] || 'Open', txnId: TXN[r.tranid] });
}

// Upsert `incoming` into `existing` by tranid (incoming wins → status/amount
// refresh), then sort by date. Keeps historical invoices already in the snapshot.
function mergeInvoices(existing = [], incoming = []) {
  const by = new Map();
  for (const inv of existing) by.set(inv.tranid, inv);
  for (const inv of incoming) by.set(inv.tranid, inv);
  return [...by.values()].sort((a, b) => dateKey(a.date) - dateKey(b.date));
}

// Trim a timebill array to the most recent month; if that month has <3 rows,
// keep the two most recent months.
function trimLog(rows) {
  if (!Array.isArray(rows) || rows.length <= 3) return rows || [];
  const months = [...new Set(rows.map(t => moIdx(t.d)))].sort((a, b) => b - a);
  const latest = months[0];
  const inLatest = rows.filter(t => moIdx(t.d) === latest);
  if (inLatest.length >= 3 || months.length < 2) return inLatest;
  const two = months.slice(0, 2);
  return rows.filter(t => two.includes(moIdx(t.d)));
}

const clients = ['chime','coursera','enfinity','overture','pharmalogic','squarespace','swoop','symetri'];
for (const c of clients) {
  const path = `clients/${c}/snapshot.json`;
  if (!existsSync(path)) { console.log(`${c}: no snapshot, skip`); continue; }
  const j = JSON.parse(readFileSync(path, 'utf8'));
  const sows = Array.isArray(j.sows) ? j.sows : [j];
  for (const s of sows) {
    const jobId = s.ns?.jobId;
    // Merge (accumulate) rather than replace — weekly runs carry only recent rows.
    s.invoices = mergeInvoices(s.invoices, jobId ? byJob[jobId] : []);
    s.timebill = trimLog(s.timebill);
    // BPC-only NetSuite deep-links: RTM record + Opportunity.
    if (jobId && RTMOPP[jobId]) s.ns = { ...s.ns, ...RTMOPP[jobId] };
  }
  writeFileSync(path, JSON.stringify(Array.isArray(j.sows) ? { sows } : sows[0], null, 2));
  const invTot = sows.reduce((a, s) => a + (s.invoices?.length || 0), 0);
  console.log(`${c}: ${sows.length} SOW(s) · ${invTot} invoices attached · logs trimmed`);
}
