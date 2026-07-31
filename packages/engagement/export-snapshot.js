'use strict';
// Export a client's config.js as the snapshot JSON the Customer Hub consumes
// (Client access → <client> → Hours → "Load snapshot JSON").
//
//   node export-snapshot.js <client>      → clients/<client>/snapshot.json
//
// The hub contract mirrors the config 1:1, except timebill entries carry the
// resolved consultant name (`who`) instead of the employee id (`emp`).
const fs = require('fs');
const path = require('path');

const client = process.argv[2];
if (!client) { console.error('Usage: node export-snapshot.js <client>'); process.exit(1); }

const dir = path.join(__dirname, 'clients', client);
const cfgPath = path.join(dir, 'config.js');
if (!fs.existsSync(cfgPath)) { console.error(`No config at ${cfgPath}`); process.exit(1); }

const cfg = require(cfgPath);
const employees = cfg.employees || {};

const snapshot = {
  clientFull: cfg.clientFull, sow: cfg.sow, sowShort: cfg.sowShort, coverTitle: cfg.coverTitle,
  reportMonth: cfg.reportMonth, servicePeriod: cfg.servicePeriod, periodShort: cfg.periodShort,
  overview: cfg.overview,
  rate: cfg.rate, overageRate: cfg.overageRate,
  retainerPaid: cfg.retainerPaid, retainerInvoice: cfg.retainerInvoice, retainerLink: cfg.retainerLink,
  retainerDesc: cfg.retainerDesc, retainerPaidStatus: cfg.retainerPaidStatus,
  billingMode: cfg.billingMode, billableOverage: cfg.billableOverage,
  overageStatus: cfg.overageStatus, overageNote: cfg.overageNote,
  months: cfg.months,
  team: cfg.team,
  timebill: (cfg.timebill || []).map(t => ({ d: t.d, who: t.who || employees[t.emp] || String(t.emp || ''), h: t.h, note: t.note })),
};
// Drop undefined keys so the JSON stays clean.
const clean = JSON.parse(JSON.stringify(snapshot));

const out = path.join(dir, 'snapshot.json');
fs.writeFileSync(out, JSON.stringify(clean, null, 2));
const months = clean.months.map(m => `${m.label}: ${m.used}/${m.contracted}`).join(' · ');
console.log(`✓ ${out}\n  ${clean.clientFull} · ${clean.sow} · ${clean.servicePeriod}\n  ${months}\n  ${clean.timebill.length} time entries`);
