'use strict';
// Demo / anonymization layer for client deliverables.
// Set DEMO_NAME to produce a neutral, sellable version of any report: the real
// client name is replaced, user emails are aliased, and service URLs / identity
// domains are scrubbed — while EVERY analysis number is preserved untouched.
//   DEMO_NAME="Northwind" node tools/state-report-pdf.js talogy
// Returns null when DEMO_NAME is not set (normal client run).
module.exports = function makeAnon(realClientCap, AU) {
  const DEMO = process.env.DEMO_NAME;
  if (!DEMO) return null;
  const domain = DEMO.toLowerCase().replace(/[^a-z0-9]/g, '') + '.com';

  // alias every audited user: client users → user{n}@<demo>.com, consultants →
  // advisor{n}@partner.com, system → System. Ordered by activity (stable).
  const userMap = {};
  if (AU && AU.byUser) {
    const isInt = u => /bryantparkconsulting|@oracle\.com|consult|partner/i.test(u);
    let ci = 0, ki = 0;
    for (const [u] of Object.entries(AU.byUser).sort((a, b) => b[1].count - a[1].count)) {
      if (/^SYSTEM$/i.test(u)) userMap[u] = 'System';
      else if (isInt(u)) userMap[u] = `advisor${++ci}@partner.com`;
      else userMap[u] = `user${++ki}@${domain}`;
    }
  }

  // longest keys first so substrings (e.g. "david.evans" inside the email) don't
  // get partially replaced before the full token.
  const userKeys = Object.keys(userMap).sort((a, b) => b.length - a.length);

  const scrubText = (s) => {
    let t = String(s);
    for (const real of userKeys) t = t.split(real).join(userMap[real]);
    t = t.replace(new RegExp(realClientCap, 'gi'), DEMO);                       // name + member substrings (TotalTalogyGov→TotalNorthwindGov)
    t = t.replace(/[a-z0-9._%+-]+@bryantparkconsulting\.com/gi, 'advisor@partner.com');
    t = t.replace(/[a-z0-9._%+-]+@oracle\.com/gi, 'oracle-support@partner.com');
    t = t.replace(/planning-[a-z0-9]+\.pbcs\.[a-z0-9.]+oraclecloud\.com/gi, 'planning-demo.oraclecloud.com');
    t = t.replace(/\ba\d{6}\b/g, 'demo-domain');                                 // Oracle identity domain like a576491
    return t;
  };

  // aliased deep copy of the audit object for charts that read it directly
  const aliasAU = (au) => {
    if (!au) return au;
    const c = JSON.parse(JSON.stringify(au));
    const remap = o => { if (!o) return o; const r = {}; for (const [k, v] of Object.entries(o)) r[userMap[k] || k] = v; return r; };
    c.byUser = remap(c.byUser);
    c.dataChangesByUser = remap(c.dataChangesByUser);
    if (c.ruleRuns) for (const r of Object.values(c.ruleRuns)) if (r.users) r.users = r.users.map(u => userMap[u] || u);
    return c;
  };

  return { DEMO, domain, userMap, scrubText, aliasAU,
    isInternalAlias: a => /partner\.com|^System$/i.test(a) };
};
