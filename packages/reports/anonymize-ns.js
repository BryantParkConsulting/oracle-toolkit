'use strict';
// Demo / anonymization layer for the NetSuite deliverables.
//
// The NSPB reports have anonymize.js, which aliases audited users. NetSuite carries a
// different kind of identifying data: the client's own legal entities, and the names of
// the third parties it bills. CLIENT_NAME alone only retitles the report — the body
// still names the subsidiaries. This aliases the data itself.
//
//   DEMO_NAME=ACME CLIENT=pra CLIENT_NAME=ACME node packages/reports/netsuite-abr-full.js
//
// EVERY number is preserved untouched: billings, counts, percentages, dates. Only the
// proper nouns change, so the analysis still reads as a real engagement.
// Returns null when DEMO_NAME is not set (normal client run).
// realClientCap is the REAL client token to scrub (e.g. "PRA"), never the demo name —
// pass CLIENT, because CLIENT_NAME is already the alias when running in demo mode.
module.exports = function makeNsAnon(realClientCap) {
  const DEMO = process.env.DEMO_NAME;
  if (!DEMO) return null;

  const seen = new Map();          // real name -> alias, stable within one run
  const counters = {};
  const alias = (kind, real, fmt) => {
    const key = kind + ' ' + String(real);
    if (!seen.has(key)) {
      counters[kind] = (counters[kind] || 0) + 1;
      seen.set(key, fmt(counters[kind]));
    }
    return seen.get(key);
  };

  // The client's own name wherever it is embedded — "PRA Events Inc.", "Bank of America PRA".
  const clientRe = realClientCap
    ? new RegExp(String(realClientCap).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
    : null;
  const scrub = (s) => (clientRe ? String(s).replace(clientRe, DEMO) : String(s));

  return {
    DEMO,
    scrub,
    // Legal entities keep their elimination flag — it drives the consolidation analysis.
    subsidiary: (name) => {
      const s = scrub(name);
      if (/elimination/i.test(s)) return DEMO + ' Elimination Co.';
      if (s.includes(DEMO)) return s;
      return alias('sub', name, (i) => DEMO + ' Subsidiary ' + i);
    },
    // Billed third parties: real companies that are not the client. Always aliased.
    customer: (name) => alias('cust', String(name).split(' - ')[0], (i) => 'Customer ' + i),
    // Bank and GL account names can embed the client and its holdings.
    account: (name) => scrub(name),
  };
};
