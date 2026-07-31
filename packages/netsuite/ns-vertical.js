#!/usr/bin/env node
/**
 * ns-vertical.js — detecta el MICRO-vertical de una cuenta NetSuite y dice qué
 * debería estar usando alguien de ese nicho.
 *
 * Por qué importa: "servicios profesionales" no sirve para recomendar nada. Una
 * agencia de eventos y una consultora de software caen las dos ahí y necesitan
 * cosas opuestas. El micro-vertical es lo que convierte un inventario de módulos
 * en una recomendación.
 *
 * De dónde sale: del vocabulario real de la cuenta — los nombres de los ítems son
 * la señal más fuerte (es a lo que le facturan), después las cuentas del COA, los
 * custom records propios y los tipos de transacción. Nada de esto se le pregunta
 * al cliente: ya está en la base.
 *
 * ⚠ Los términos son ambiguos entre industrias. "FAM" es Fixed Assets en general
 * pero *familiarization trip* en eventos y turismo; "Program" es software en un
 * lado y evento en el otro. Por eso se puntúa por acumulación de señales y se
 * devuelve SIEMPRE la evidencia, nunca un veredicto pelado.
 *
 * Uso:  CLIENT=<cliente> node packages/netsuite/ns-vertical.js
 */
const fs = require("fs");
const path = require("path");

const CLIENT = process.env.CLIENT || "pra";
const ROOT = path.join(__dirname, "..", "..");
const DIR = path.join(ROOT, "clients", CLIENT);
const rd = p => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

const shape = rd(path.join(DIR, "netsuite", "shape.json")) || {};
const probe = rd(path.join(DIR, "netsuite", "probe.json"));
const modulesFile = rd(path.join(DIR, "erp", "modules.json"));

const T = {};
if (probe) for (const tables of Object.values(probe.modules)) Object.assign(T, tables);
const n = t => (T[t]?.exists ? Number(T[t].rows ?? 0) : 0);
const list = k => (Array.isArray(shape[k]) ? shape[k] : []);

/**
 * Catálogo de micro-verticales. `terms` se busca en el vocabulario de la cuenta;
 * `structure` son señales estructurales (no de texto); `expect` es lo que un
 * jugador maduro de ese nicho suele tener andando — la base de la recomendación.
 */
const VERTICALS = [
  { id: "events-dmc", name: "Corporate events / DMC / experiential",
    terms: ["audio visual", "decor", "scenic", "set/strike", "entertainment", "catering", "dine around", "gifting", "amenities", "gratuit", "venue", "production support", "team building", "program manag", "attendee", "registration", "destination", "onsite", "off-site", "banquet", "av "],
    structure: f => f.projects > 500 && f.apRatio > 2 && !f.inventory,
    expect: ["projects", "ar-invoicing", "ap-vendor-bills", "expense-reports", "arm-rev-rec", "approval-routing"],
    note: "Pass-through model: the client is billed and dozens of vendors are paid per event. Margin lives in the management fee, so profitability PER EVENT is the metric that matters." },
  { id: "saas", name: "SaaS / subscription software",
    terms: ["subscription", "license", "seat", "arr", "mrr", "saas", "renewal", "usage tier", "platform fee", "onboarding fee", "implementation fee"],
    structure: f => f.subscriptions > 0 || (f.arm > 1000 && f.items < 100 && !f.inventory),
    expect: ["suitebilling", "arm-rev-rec", "ar-invoicing", "crm-opportunities"],
    note: "Revenue recognition and renewal mechanics are central. Without SuiteBilling, subscriptions are handled manually." },
  { id: "prof-services", name: "Professional services / consulting",
    terms: ["consulting", "billable", "timesheet", "utilization", "retainer", "milestone", "statement of work", "resource", "engagement"],
    structure: f => f.projects > 100 && f.timesheets > 0,
    expect: ["projects", "expense-reports", "ar-invoicing", "arm-rev-rec"],
    note: "Utilization and rate realization are the KPIs. Without PSA (project tasks + time-to-charge) there is no per-project margin." },
  { id: "agency", name: "Marketing / advertising agency",
    terms: ["media buy", "campaign", "creative", "retainer", "billable hours", "pass-through", "markup", "client billing"],
    structure: f => f.projects > 100 && f.apRatio > 1.5,
    expect: ["projects", "ap-vendor-bills", "ar-invoicing", "expense-reports"],
    note: "Media pass-through: gross revenue is misleading; net revenue is what matters." },
  { id: "wholesale", name: "Wholesale distribution",
    terms: ["sku", "pallet", "case pack", "landed cost", "freight", "warehouse", "backorder", "dropship"],
    structure: f => f.inventory,
    expect: ["inventory", "demand-planning", "ar-invoicing", "ap-vendor-bills"],
    note: "Inventory turnover and fill rate. Demand planning is the natural upgrade." },
  { id: "manufacturing", name: "Manufacturing",
    terms: ["bom", "work order", "assembly", "routing", "scrap", "wip", "yield", "shop floor"],
    structure: f => f.manufacturing,
    expect: ["manufacturing", "inventory", "demand-planning"],
    note: "Standard vs actual costing and production variances." },
  { id: "construction", name: "Construction / contracting",
    terms: ["job cost", "change order", "retainage", "subcontractor", "progress billing", "punch list", "wip schedule", "bond"],
    structure: f => f.projects > 100,
    expect: ["projects", "ap-vendor-bills", "ar-invoicing", "approval-routing"],
    note: "Percentage-of-completion and retainage. The WIP schedule is the key financial deliverable." },
  { id: "nonprofit", name: "Nonprofit",
    terms: ["grant", "donor", "pledge", "restricted", "fund", "program service", "contribution", "endowment"],
    structure: () => false,
    expect: ["segments-class-dept-loc", "ar-invoicing"],
    note: "Restricted vs unrestricted funds: segmentation is mandatory, not optional." },
  { id: "healthcare", name: "Healthcare services",
    terms: ["patient", "claim", "payer", "encounter", "clinic", "provider", "reimbursement", "cpt"],
    structure: () => false, expect: ["ar-invoicing", "segments-class-dept-loc"],
    note: "Contractual allowances and payer mix." },
  { id: "media", name: "Media / publishing",
    terms: ["advertis", "circulation", "subscri", "royalt", "content licen", "impression", "airtime"],
    structure: () => false, expect: ["arm-rev-rec", "ar-invoicing"], note: "Deferred subscription revenue and royalties." },
  { id: "realestate", name: "Real estate / property management",
    terms: ["tenant", "lease", "rent roll", "cam ", "occupancy", "property", "escrow"],
    structure: f => f.leases > 0,
    expect: ["fixed-assets", "ar-invoicing", "segments-class-dept-loc"], note: "ASC 842 and CAM reconciliation." },
  { id: "logistics", name: "Logistics / transportation",
    terms: ["freight", "carrier", "shipment", "lane", "tender", "bill of lading", "linehaul", "fuel surcharge"],
    structure: () => false, expect: ["ap-vendor-bills", "ar-invoicing"], note: "Cost per shipment and accessorials." },
];

// ── vocabulario de la cuenta ─────────────────────────────────────────────────
const items = list("items").map(r => String(r.itemid || ""));
const accounts = list("accounts_unused").map(r => String(r.acctname || ""));
const records = list("custom_record_usage").map(r => String(r.name || ""));
const txnTypes = [...new Set(list("txn_by_type_year").map(r => String(r.tipo || "")))];

// Los ítems pesan más: son literalmente a qué le factura la empresa.
// Las etiquetas van en inglés: se renderizan como evidencia en el entregable.
const CORPUS = [
  { src: "item names", weight: 3, text: items.join(" | ").toLowerCase() },
  { src: "transaction types", weight: 2, text: txnTypes.join(" | ").toLowerCase() },
  { src: "custom records", weight: 1, text: records.join(" | ").toLowerCase() },
  { src: "account names", weight: 1, text: accounts.join(" | ").toLowerCase() },
];

const facts = {
  projects: n("job"), timesheets: n("timesheet"), subscriptions: n("subscription"),
  arm: n("revenuearrangement"), items: n("item"),
  inventory: !!(T["inventoryitem"]?.exists || T["inventorybalance"]?.exists),
  manufacturing: !!T["bom"]?.exists,
  leases: txnTypes.filter(t => /lease/i.test(t)).length,
  apRatio: (() => { const ap = list("txn_by_type_year").filter(r => /^bill/i.test(r.tipo)).reduce((a, r) => a + Number(r.n || 0), 0);
                    const ar = list("txn_by_type_year").filter(r => /invoice/i.test(r.tipo)).reduce((a, r) => a + Number(r.n || 0), 0);
                    return ar ? ap / ar : 0; })(),
};

// ── scoring ──────────────────────────────────────────────────────────────────
const scored = VERTICALS.map(v => {
  const hits = [];
  let score = 0;
  for (const term of v.terms) {
    for (const c of CORPUS) {
      if (c.text.includes(term)) { score += c.weight; hits.push(`\`${term}\` in ${c.src}`); break; }
    }
  }
  let structural = false;
  try { structural = !!v.structure(facts); } catch {}
  if (structural) score += 6;
  return { ...v, score, hits, structural };
}).filter(v => v.score > 0).sort((a, b) => b.score - a.score);

const top = scored[0];
const confidence = !top ? "none" : top.score >= 18 ? "high" : top.score >= 9 ? "medium" : "low";

// ── benchmark externo ────────────────────────────────────────────────────────
// BPC no tiene base propia de cuentas NetSuite para comparar, así que la
// referencia sale de fuentes públicas (SuiteSuccess y el catálogo de Oracle).
const BENCH = rd(path.join(__dirname, "ns-benchmarks.json")) || { verticals: {} };
const bench = top ? BENCH.verticals[top.id] : null;

// ── qué le falta para su nicho ───────────────────────────────────────────────
let gaps = [], missingSuiteApps = [], flags = [];
if (top && modulesFile) {
  const byId = Object.fromEntries(modulesFile.modules.map(m => [m.id, m]));
  const expected = bench?.expectedModules || top.expect;
  gaps = expected.map(id => ({ id, mod: byId[id] }))
    .filter(x => x.mod && x.mod.state !== "active")
    .map(x => ({ id: x.id, name: x.mod.name, state: x.mod.state, evidence: x.mod.evidence }));

  // SuiteApps del nicho que no aparecen entre los bundles instalados
  const installed = (rd(path.join(DIR, "erp", "connectors.json"))?.bundles || []).map(b => String(b.name || "").toLowerCase());
  missingSuiteApps = (bench?.industrySuiteApps || [])
    .filter(a => !installed.some(b => b.includes(String(a.name).toLowerCase().split(" ")[0])));

  // red flags declaradas en el benchmark, evaluadas contra los hechos medidos
  for (const rf of bench?.redFlags || []) {
    const t = rf.test;
    let hit = false;
    if (/projects > 500 && projecttask == 0/.test(t)) hit = n("job") > 500 && n("projecttask") === 0;
    else if (/expense-reports not active/.test(t)) hit = byId["expense-reports"]?.state !== "active";
    else if (/arm active && suitebilling absent/.test(t)) hit = byId["arm-rev-rec"]?.state === "active" && byId["suitebilling"]?.state === "absent";
    else if (/projects > 100 && timebill == 0/.test(t)) hit = n("job") > 100 && n("timebill") === 0;
    if (hit) flags.push(rf.say);
  }
}

// ── salida ───────────────────────────────────────────────────────────────────
const out = {
  client: CLIENT, generatedAt: new Date().toISOString().slice(0, 10),
  vertical: top ? { id: top.id, name: top.name, score: top.score, confidence, note: top.note, evidence: top.hits.slice(0, 14), structural: top.structural } : null,
  alternatives: scored.slice(1, 4).map(v => ({ id: v.id, name: v.name, score: v.score })),
  facts,
  gapsForVertical: gaps,
  benchmark: bench ? {
    suiteSuccessEdition: bench.suiteSuccessEdition,
    keyMetric: bench.keyMetric,
    missingSuiteApps,
    redFlags: flags,
    sources: BENCH.sources,
    caveat: BENCH.caveat,
  } : null,
  caveat: "Industry terms are ambiguous — `FAM` means Fixed Assets in general but *familiarization trip* in events and travel; `Program` means software in one niche and an event in another. Scoring therefore accumulates signals and always returns the evidence. Confirm the niche with the client before using it in any recommendation.",
};

fs.mkdirSync(path.join(DIR, "erp"), { recursive: true });
fs.writeFileSync(path.join(DIR, "erp", "vertical.json"), JSON.stringify(out, null, 2));

console.log(`\nMicro-vertical: ${top ? top.name : "no determinado"}  (score ${top?.score ?? 0}, confianza ${confidence})`);
if (top) {
  console.log(`  ${top.note}`);
  console.log(`\n  Evidencia:`);
  top.hits.slice(0, 10).forEach(h => console.log(`    · ${h}`));
  if (top.structural) console.log(`    · señal estructural del nicho`);
  if (scored.length > 1) console.log(`\n  Alternativas: ${scored.slice(1, 4).map(v => `${v.name} (${v.score})`).join(" · ")}`);
  if (gaps.length) {
    console.log(`\n  Lo que su nicho suele tener andando y acá no está activo:`);
    gaps.forEach(g => console.log(`    · ${g.name} — ${g.state}: ${String(g.evidence).slice(0, 70)}`));
  } else if (modulesFile) console.log(`\n  Tiene activo todo lo esperable para su nicho.`);

  if (bench) {
    console.log(`\n  Benchmark del nicho`);
    console.log(`    Edición SuiteSuccess: ${bench.suiteSuccessEdition}`);
    console.log(`    Métrica que manda:    ${bench.keyMetric}`);
    if (missingSuiteApps.length) {
      console.log(`    SuiteApps del nicho que NO tiene instaladas:`);
      missingSuiteApps.forEach(a => console.log(`      · ${a.name} — ${a.what}`));
    }
    if (flags.length) { console.log(`    ⚠ Red flags:`); flags.forEach(f => console.log(`      · ${f}`)); }
  }
}
console.log(`\n→ ${path.join(DIR, "erp", "vertical.json")}`);
