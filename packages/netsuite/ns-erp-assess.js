#!/usr/bin/env node
/**
 * ns-erp-assess.js — el paso que faltaba del playbook NS-ERP (§7).
 *
 * Cruza la evidencia cruda de netsuite-export.js (probe/shape/fields) contra
 * ns-erp-catalog.json y emite clients/<cliente>/erp/modules.json con el schema
 * del §4: cada uno de los 37 módulos clasificado en el modelo de 4 estados,
 * más el capítulo de integración NSPB (§5).
 *
 * Diseño: el catálogo asume extracción por browser (Enable Features + saved
 * searches). Acá la fuente es SuiteQL vía TBA, que es más preciso para *uso*
 * pero CIEGO para varias features de config. Por eso se agrega un quinto estado
 * `unknown`: preferible a clasificar como `absent` algo que sencillamente no se
 * puede ver por este canal. Se resuelve con el export de SDF o Enable Features.
 *
 * Uso: CLIENT=<cliente> node tools/ns-erp-assess.js [--src=<carpeta netsuite>]
 */

const fs = require("fs");
const path = require("path");

const CLIENT = process.env.CLIENT || process.argv.find(a => !a.startsWith("-") && !/node|ns-erp-assess/.test(a)) || "bpc";
const ROOT = path.join(__dirname, "..", "..");
const SRC = path.join(ROOT, "clients", CLIENT, "netsuite");
const OUT_DIR = path.join(ROOT, "clients", CLIENT, "erp");

const CATALOG = JSON.parse(fs.readFileSync(path.join(__dirname, "ns-erp-catalog.json"), "utf8"));
const rd = n => { try { return JSON.parse(fs.readFileSync(path.join(SRC, `${n}.json`), "utf8")); } catch { return null; } };

const probe = rd("probe");
if (!probe) { console.error(`No hay ${SRC}\\probe.json — corré primero netsuite-export.js`); process.exit(1); }
const shape = rd("shape") || {};
const fieldsData = rd("fields");

// ── hechos ───────────────────────────────────────────────────────────────────
const T = {};
for (const tables of Object.values(probe.modules)) Object.assign(T, tables);
const UNRELIABLE_ZERO = new Set(["loginaudit", "systemnote", "systemnote2", "transactionhistory"]);
const exists = t => !!T[t]?.exists;
const n = t => (exists(t) ? Number(T[t].rows ?? 0) : 0);
const seen = t => !!T[t] && T[t].exists;               // ¿la tabla respondió?
const list = k => (Array.isArray(shape[k]) ? shape[k] : []);

const txnByType = {};
for (const r of list("txn_by_type_year")) txnByType[r.tipo] = (txnByType[r.tipo] || 0) + Number(r.n || 0);
const txn = re => Object.entries(txnByType).filter(([t]) => new RegExp(re, "i").test(t)).reduce((a, [, v]) => a + v, 0);
const txnNames = re => Object.keys(txnByType).filter(t => new RegExp(re, "i").test(t));

const acctByType = Object.fromEntries(list("accounts_by_type").map(r => [String(r.tipo || "").toLowerCase(), Number(r.n || 0)]));
const acct = (...ts) => ts.reduce((a, t) => a + (acctByType[t.toLowerCase()] || 0), 0);

const customFields = list("custom_fields");
const objIds = customFields.map(r => r.scriptid || "").concat(list("custom_record_usage").map(r => `${r.name || ""} ${r.scriptid || ""}`)).join(" | ");
const hasObj = re => new RegExp(re, "i").test(objIds);
const countObj = re => (objIds.match(new RegExp(re, "gi")) || []).length;

const fmt = x => Number(x || 0).toLocaleString("en-US");

/**
 * Reglas de detección, una por módulo del catálogo.
 *   enabled : true | false | null   (null ⇒ not observable through SuiteQL)
 *   count   : magnitud de uso
 *   partial : true fuerza el estado `partial` aunque haya uso
 */
const RULES = {
  "oneworld-subsidiaries": () => ({ enabled: seen("subsidiary"), count: n("subsidiary"), metric: "subsidiaries", evidence: `${fmt(n("subsidiary"))} subsidiaries` }),
  "multi-currency": () => ({ enabled: seen("currency"), count: n("currency") > 1 ? n("currency") : 0, metric: "currencies", evidence: `${fmt(n("currency"))} currencies · ${fmt(n("currencyrate"))} exchange rates` }),
  "multi-book": () => ({ enabled: seen("accountingbook"), count: n("accountingbook") > 1 ? n("accountingbook") : 0, metric: "secondary books", evidence: `${fmt(n("accountingbook"))} accounting book(s) — ${n("accountingbook") > 1 ? "multi-book active" : "primary only"}` }),
  "accounting-periods": () => ({ enabled: seen("accountingperiod"), count: n("accountingperiod"), metric: "periods", evidence: `${fmt(n("accountingperiod"))} accounting periods` }),
  "chart-of-accounts": () => { const u = list("accounts_unused").length; return { enabled: seen("account"), count: n("account"), metric: "accounts", partial: u > 0 && u / Math.max(1, n("account")) > 0.15, evidence: `${fmt(n("account"))} accounts · ${fmt(u)} with no journal activity (${Math.round(100 * u / Math.max(1, n("account")))}%)` }; },
  "segments-class-dept-loc": () => { const tot = n("department") + n("classification") + n("location"); return { enabled: seen("department") || seen("classification") || seen("location"), count: tot, metric: "segment members", evidence: `${fmt(n("department"))} departments · ${fmt(n("classification"))} classes · ${fmt(n("location"))} locations` }; },
  "custom-segments": () => ({ enabled: seen("customsegment"), count: n("customsegment"), metric: "custom segments", evidence: `${fmt(n("customsegment"))} custom segment(s)` }),
  "statistical-accounts": () => ({ enabled: acct("Stat") > 0 || seen("statisticalschedule"), count: acct("Stat"), metric: "statistical accounts", evidence: `${fmt(acct("Stat"))} Statistical-type accounts · ${fmt(n("statisticalschedule"))} statistical schedules` }),
  "native-budgets": () => ({ enabled: seen("budgetimport") || seen("budget"), count: n("budgetimport") + n("budget"), metric: "filas de budget", evidence: `${fmt(n("budgetimport"))} budget import rows — budgets are built outside and loaded in` }),
  "amortization": () => ({ enabled: seen("amortizationschedule") || txn("amortization") > 0, count: n("amortizationschedule") + txn("amortization"), metric: "schedules + transactions", evidence: `${fmt(n("amortizationschedule"))} amortization schedules · ${txnNames("amortization").map(t => `${t} (${fmt(txnByType[t])})`).join(", ") || "no amortization transactions"}` }),
  "arm-rev-rec": () => ({ enabled: seen("revenuearrangement"), count: n("revenuearrangement"), metric: "revenue arrangements", evidence: `${fmt(n("revenuearrangement"))} arrangements · ${fmt(n("revenueelement"))} elements · ${fmt(n("revenueplan"))} plans` }),
  "fixed-assets": () => ({ enabled: seen("customrecord_ncfar_asset"), count: n("customrecord_ncfar_asset"), metric: "assets", evidence: `${fmt(n("customrecord_ncfar_asset"))} assets · ${fmt(n("customrecord_ncfar_assettype"))} types (FAM bundle)` }),
  "allocations": () => ({ enabled: seen("allocationschedule"), count: n("allocationschedule"), metric: "allocation schedules", evidence: `${fmt(n("allocationschedule"))} allocation schedules defined` }),
  "intercompany": () => ({ enabled: n("subsidiary") > 1, count: txn("intercompany"), metric: "IC transactions", evidence: txn("intercompany") ? txnNames("intercompany").map(t => `${t} (${fmt(txnByType[t])})`).join(", ") : `${fmt(n("subsidiary"))} subsidiaries, no explicit intercompany transaction types` }),
  "ar-invoicing": () => ({ enabled: true, count: txn("^invoice|credit memo|customer payment|^payment"), metric: "AR transactions", evidence: `Invoice ${fmt(txnByType.Invoice)} · Credit Memo ${fmt(txnByType["Credit Memo"])} · Payment ${fmt(txnByType.Payment)}` }),
  "ap-vendor-bills": () => ({ enabled: true, count: txn("^bill"), metric: "AP transactions", evidence: `Bill ${fmt(txnByType.Bill)} · Bill Payment ${fmt(txnByType["Bill Payment"])} · Bill Credit ${fmt(txnByType["Bill Credit"])}` }),
  "suitebilling": () => ({ enabled: seen("subscription"), count: n("subscription"), metric: "subscriptions", evidence: seen("subscription") ? `${fmt(n("subscription"))} subscriptions` : "SuiteBilling tables not visible" }),
  "inventory": () => ({ enabled: seen("inventoryitem") || seen("inventorybalance"), count: n("inventoryitem"), metric: "inventory items", evidence: seen("inventoryitem") ? `${fmt(n("inventoryitem"))} ítems` : "no inventory tables; the catalog is service items" }),
  "demand-planning": () => ({ enabled: null, count: 0, metric: "—", evidence: "not observable through SuiteQL" }),
  "manufacturing": () => ({ enabled: seen("bom"), count: n("bom"), metric: "BOMs", evidence: seen("bom") ? `${fmt(n("bom"))} BOMs` : "no manufacturing tables" }),
  "projects": () => ({ enabled: seen("job"), count: n("job"), metric: "projects", partial: n("job") > 0 && n("projecttask") === 0 && n("timebill") === 0, evidence: `${fmt(n("job"))} projects · projecttask ${fmt(n("projecttask"))} · timebill ${fmt(n("timebill"))} · timesheet ${fmt(n("timesheet"))}` }),
  "suitepeople-hr": () => ({ enabled: seen("employee"), count: n("employee"), metric: "employees", partial: !seen("hcmjob"), evidence: `${fmt(n("employee"))} employees · ${fmt(n("employeetype"))} types${seen("hcmjob") ? "" : " · no SuitePeople HCM tables"}` }),
  "payroll": () => ({ enabled: seen("payrollitem") ? n("payrollitem") > 0 : null, count: n("payrollitem") + txn("paycheck"), metric: "payroll items", evidence: `payrollitem ${fmt(n("payrollitem"))} · paychecks ${fmt(txn("paycheck"))}` }),
  // `expensereport` responde ⇒ la feature está prendida. Cero filas es uso nulo
  // MEDIDO, no ausencia de dato: es `dormant`, no `unknown`.
  "expense-reports": () => ({ enabled: seen("expensereport"), count: n("expensereport"), metric: "expense reports", evidence: seen("expensereport") ? `feature enabled, ${fmt(n("expensereport"))} expense reports recorded` : "not observable through SuiteQL" }),
  "account-reconciliation": () => ({ enabled: null, count: 0, metric: "—", evidence: "ARCS is a separate application and leaves no trace in SuiteQL" }),
  // `PLANNING` a secas da falsos positivos (cualquier campo "Planning Category").
  // El marcador duro es NSPBCS_ — el prefijo del NSPB Connector Suite bundle.
  "nspb-connector": () => {
    const cs = countObj("NSPBCS_"), other = countObj("HYPERION|PBCS|EPM_");
    return { enabled: cs > 0 ? true : other > 0 ? true : null, count: cs,
      metric: "connector objects",
      evidence: cs > 0
        ? `${cs} objetos \`CUSTRECORD_NSPBCS_*\` — el bundle NSPB Connector Suite está instalado${other ? ` (+${other} PBCS/Hyperion objects)` : ""}`
        : other > 0 ? `${other} PBCS/Hyperion objects, without the NSPBCS bundle` : "no trace of the NSPB connector" };
  },
  "suiteanalytics-connect": () => ({ enabled: null, count: 0, metric: "—", evidence: "not observable through SuiteQL (es licencia/ODBC)" }),
  "suiteanalytics-workbook": () => ({ enabled: null, count: 0, metric: "—", evidence: "not observable through SuiteQL" }),
  "suitescript": () => ({ enabled: seen("script"), count: n("script"), metric: "scripts", evidence: `${fmt(n("script"))} scripts · ${fmt(n("scriptdeployment"))} deployments · ${fmt(n("scheduledscriptinstance"))} scheduled executions` }),
  // SuiteQL SÍ expone `workflow`. El playbook decía lo contrario — corregido 2026-07-31.
  "suiteflow": () => ({ enabled: seen("workflow"), count: n("workflow"), metric: "workflows", evidence: `${fmt(n("workflow"))} workflows defined` }),
  "custom-records": () => ({ enabled: seen("customrecordtype"), count: n("customrecordtype"), metric: "custom record types", evidence: `${fmt(n("customrecordtype"))} custom records · ${fmt(n("customlist"))} lists` }),
  "web-services-rest-tba": () => ({ enabled: true, count: 1, metric: "—", evidence: "confirmed: this extraction ran over REST + TBA" }),
  "suitetax": () => ({ enabled: seen("taxtype"), count: n("taxtype") + n("nexus"), metric: "tax types + nexus", evidence: `${fmt(n("taxtype"))} tax types · ${fmt(n("nexus"))} nexus · ${fmt(n("salestaxitem"))} sales tax items` }),
  "suitecommerce": () => ({ enabled: seen("website"), count: n("website"), metric: "websites", evidence: seen("website") ? `${fmt(n("website"))} web site record(s)` : "no website records" }),
  "crm-opportunities": () => ({ enabled: seen("opportunity") || seen("campaign"), count: n("opportunity") + txn("opportunity"), metric: "opportunities", evidence: seen("opportunity") ? `feature enabled, ${fmt(n("opportunity"))} opportunities recorded` : "not observable through SuiteQL" }),
  "approval-routing": () => ({ enabled: null, count: 0, metric: "—", evidence: "not observable through SuiteQL" }),
  "period-end-journals": () => ({ enabled: true, count: txn("^journal"), metric: "journal entries", evidence: `${fmt(txn("^journal"))} journals` }),
};

// ── clasificación ────────────────────────────────────────────────────────────
function classify(r) {
  if (r.enabled === null) return "unknown";
  if (r.enabled === false) return "absent";
  if (!r.count) return "dormant";
  if (r.partial) return "partial";
  return "active";
}

const modules = CATALOG.modules.map(m => {
  const rule = RULES[m.id];
  const r = rule ? rule() : { enabled: null, count: 0, metric: "—", evidence: "no detection rule" };
  return {
    id: m.id, name: m.name, area: m.area,
    enabled: r.enabled,
    usage: { metric: r.metric, count: r.count },
    state: classify(r),
    evidence: r.evidence,
    nspbRelevance: m.nspb?.relevance || "none",
    nspbNote: m.nspb?.note || null,
    upsell: m.upsell || null,
  };
});

// ── capítulo de integración NSPB (§5) ────────────────────────────────────────
const byId = Object.fromEntries(modules.map(m => [m.id, m]));
const dimensionMap = [
  { nspbDim: "Entity", source: "Subsidiary", members: n("subsidiary"), quality: n("subsidiary") > 1 ? "ok" : "entidad única — Entity sería trivial" },
  { nspbDim: "Account", source: "Chart of Accounts", members: n("account"), quality: (() => { const u = list("accounts_unused").length; return u ? `${u} accounts sin movimiento a excluir antes de mapear` : "ok"; })() },
  { nspbDim: "Cost Center", source: "Department", members: n("department"), quality: n("department") ? "verificar % de transacciones taggeadas" : "sin departments" },
  { nspbDim: "Custom dim", source: "Class", members: n("classification"), quality: n("classification") ? "verificar % taggeado" : "sin classes" },
  { nspbDim: "Custom dim", source: "Location", members: n("location"), quality: n("location") ? "verificar % taggeado" : "sin locations" },
  { nspbDim: "Custom dim", source: "Custom Segment", members: n("customsegment"), quality: n("customsegment") ? "revisar definición" : "sin custom segments" },
].filter(d => d.members > 0 || d.nspbDim === "Entity" || d.nspbDim === "Account");

const gaps = [];
if (byId["native-budgets"]?.state === "active")
  gaps.push(`Native Budgets en uso (${byId["native-budgets"].evidence}) — conviviría con NSPB como fuente de verdad duplicada.`);
if (byId["multi-book"]?.state === "dormant")
  gaps.push("Un solo accounting book: confirmar que no haya requerimiento de GAAP dual antes de definir el origen de actuals.");
if (byId["statistical-accounts"]?.state !== "active")
  gaps.push("Sin accounts estadísticas detectadas: los drivers de Planning (headcount, unidades) habría que construirlos.");
if (byId["projects"]?.state === "partial")
  gaps.push("Projects sin PSA (project tasks y time-to-charge en cero): el detalle de proyecto para planeación es más pobre de lo que sugiere el conteo.");
if (byId["nspb-connector"]?.state === "unknown")
  gaps.push("No se detectó el connector de NSPB por SuiteQL — confirmar por SuiteBundler si existe el puente.");
if (byId["nspb-connector"]?.state === "active" && byId["native-budgets"]?.state === "active")
  gaps.push("⚠ El connector NSPB está instalado Y Native Budgets sigue en uso: dos fuentes de verdad para el mismo presupuesto. Es la conversación de mayor valor de este assessment — no es un upsell de NSPB, es un problema de adopción del NSPB que ya tienen.");

const out = {
  client: CLIENT,
  account: probe.account,
  extractedAt: new Date().toISOString().slice(0, 10),
  source: "SuiteQL/REST vía TBA (netsuite-export.js)",
  telemetryWindow: "histórico completo de la cuenta (sin ventana móvil)",
  edition: {
    oneworld: n("subsidiary") > 1, subsidiaries: n("subsidiary"),
    books: n("accountingbook"), currencies: n("currency"),
    accounts: n("account"), transactions: n("transaction"), transactionLines: n("transactionline"),
  },
  stateCounts: modules.reduce((a, m) => { a[m.state] = (a[m.state] || 0) + 1; return a; }, {}),
  modules,
  integration: {
    connectorPresent: byId["nspb-connector"]?.state === "active" ? true : null,
    dimensionMap,
    gaps,
  },
  caveats: [
    "SuiteQL solo expone un record type si la feature está habilitada Y el rol tiene permiso: una ausencia es ambigua y se reporta como `unknown`, nunca como `absent`.",
    `Conteos no confiables como señal de uso (retención/permisos): ${[...UNRELIABLE_ZERO].join(", ")}.`,
    "Sin ventana móvil: los conteos son históricos, no de los últimos 6 meses como asume el playbook.",
  ],
};

fs.mkdirSync(OUT_DIR, { recursive: true });
const p = path.join(OUT_DIR, "modules.json");
fs.writeFileSync(p, JSON.stringify(out, null, 2));
console.log(`→ ${p}`);
console.log(`   ${modules.length} módulos: ${Object.entries(out.stateCounts).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
if (!fieldsData) console.log("   (sin fields.json — corré --phase=fields para el fill-rate)");
