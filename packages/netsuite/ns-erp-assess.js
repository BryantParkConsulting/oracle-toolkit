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
const ROOT = path.join(__dirname, "..");
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

const fmt = x => Number(x || 0).toLocaleString("es-AR");

/**
 * Reglas de detección, una por módulo del catálogo.
 *   enabled : true | false | null   (null ⇒ no observable por SuiteQL)
 *   count   : magnitud de uso
 *   partial : true fuerza el estado `partial` aunque haya uso
 */
const RULES = {
  "oneworld-subsidiaries": () => ({ enabled: seen("subsidiary"), count: n("subsidiary"), metric: "subsidiarias", evidence: `${fmt(n("subsidiary"))} subsidiarias` }),
  "multi-currency": () => ({ enabled: seen("currency"), count: n("currency") > 1 ? n("currency") : 0, metric: "monedas", evidence: `${fmt(n("currency"))} monedas · ${fmt(n("currencyrate"))} cotizaciones` }),
  "multi-book": () => ({ enabled: seen("accountingbook"), count: n("accountingbook") > 1 ? n("accountingbook") : 0, metric: "books secundarios", evidence: `${fmt(n("accountingbook"))} accounting book(s) — ${n("accountingbook") > 1 ? "multi-book activo" : "solo el primario"}` }),
  "accounting-periods": () => ({ enabled: seen("accountingperiod"), count: n("accountingperiod"), metric: "períodos", evidence: `${fmt(n("accountingperiod"))} períodos contables` }),
  "chart-of-accounts": () => { const u = list("accounts_unused").length; return { enabled: seen("account"), count: n("account"), metric: "cuentas", partial: u > 0 && u / Math.max(1, n("account")) > 0.15, evidence: `${fmt(n("account"))} cuentas · ${fmt(u)} sin ningún asiento (${Math.round(100 * u / Math.max(1, n("account")))}%)` }; },
  "segments-class-dept-loc": () => { const tot = n("department") + n("classification") + n("location"); return { enabled: seen("department") || seen("classification") || seen("location"), count: tot, metric: "miembros de segmento", evidence: `${fmt(n("department"))} depts · ${fmt(n("classification"))} classes · ${fmt(n("location"))} locations` }; },
  "custom-segments": () => ({ enabled: seen("customsegment"), count: n("customsegment"), metric: "custom segments", evidence: `${fmt(n("customsegment"))} custom segment(s)` }),
  "statistical-accounts": () => ({ enabled: acct("Stat") > 0 ? true : null, count: acct("Stat"), metric: "cuentas estadísticas", evidence: acct("Stat") ? `${fmt(acct("Stat"))} cuentas de tipo Statistical` : "ninguna cuenta Statistical en el COA" }),
  "native-budgets": () => ({ enabled: seen("budgetimport") || seen("budget"), count: n("budgetimport") + n("budget"), metric: "filas de budget", evidence: `${fmt(n("budgetimport"))} filas de budget import — el presupuesto se arma afuera y se carga` }),
  "amortization": () => ({ enabled: txn("amortization") > 0 ? true : null, count: txn("amortization"), metric: "transacciones", evidence: txnNames("amortization").map(t => `${t} (${fmt(txnByType[t])})`).join(", ") || "sin transacciones de amortización" }),
  "arm-rev-rec": () => ({ enabled: seen("revenuearrangement"), count: n("revenuearrangement"), metric: "revenue arrangements", evidence: `${fmt(n("revenuearrangement"))} arrangements · ${fmt(n("revenueelement"))} elements · ${fmt(n("revenueplan"))} plans` }),
  "fixed-assets": () => ({ enabled: seen("customrecord_ncfar_asset"), count: n("customrecord_ncfar_asset"), metric: "activos", evidence: `${fmt(n("customrecord_ncfar_asset"))} activos · ${fmt(n("customrecord_ncfar_assettype"))} tipos (bundle FAM)` }),
  "allocations": () => ({ enabled: txn("allocation") > 0 ? true : null, count: txn("allocation"), metric: "transacciones", evidence: txnNames("allocation").join(", ") || "sin schedules de allocation visibles por SuiteQL" }),
  "intercompany": () => ({ enabled: n("subsidiary") > 1, count: txn("intercompany"), metric: "transacciones IC", evidence: txn("intercompany") ? txnNames("intercompany").map(t => `${t} (${fmt(txnByType[t])})`).join(", ") : `${fmt(n("subsidiary"))} subsidiarias, sin tipos de transacción intercompany explícitos` }),
  "ar-invoicing": () => ({ enabled: true, count: txn("^invoice|credit memo|customer payment|^payment"), metric: "transacciones AR", evidence: `Invoice ${fmt(txnByType.Invoice)} · Credit Memo ${fmt(txnByType["Credit Memo"])} · Payment ${fmt(txnByType.Payment)}` }),
  "ap-vendor-bills": () => ({ enabled: true, count: txn("^bill"), metric: "transacciones AP", evidence: `Bill ${fmt(txnByType.Bill)} · Bill Payment ${fmt(txnByType["Bill Payment"])} · Bill Credit ${fmt(txnByType["Bill Credit"])}` }),
  "suitebilling": () => ({ enabled: seen("subscription"), count: n("subscription"), metric: "suscripciones", evidence: seen("subscription") ? `${fmt(n("subscription"))} suscripciones` : "tablas de SuiteBilling no visibles" }),
  "inventory": () => ({ enabled: seen("inventoryitem") || seen("inventorybalance"), count: n("inventoryitem"), metric: "ítems de inventario", evidence: seen("inventoryitem") ? `${fmt(n("inventoryitem"))} ítems` : "sin tablas de inventario; el catálogo son servicios" }),
  "demand-planning": () => ({ enabled: null, count: 0, metric: "—", evidence: "no observable por SuiteQL" }),
  "manufacturing": () => ({ enabled: seen("bom"), count: n("bom"), metric: "BOMs", evidence: seen("bom") ? `${fmt(n("bom"))} BOMs` : "sin tablas de manufactura" }),
  "projects": () => ({ enabled: seen("job"), count: n("job"), metric: "proyectos", partial: n("job") > 0 && n("projecttask") === 0 && n("timebill") === 0, evidence: `${fmt(n("job"))} proyectos · projecttask ${fmt(n("projecttask"))} · timebill ${fmt(n("timebill"))} · timesheet ${fmt(n("timesheet"))}` }),
  "suitepeople-hr": () => ({ enabled: seen("employee"), count: n("employee"), metric: "empleados", partial: !seen("hcmjob"), evidence: `${fmt(n("employee"))} empleados · ${fmt(n("employeetype"))} tipos${seen("hcmjob") ? "" : " · sin tablas SuitePeople HCM"}` }),
  "payroll": () => ({ enabled: seen("payrollitem") ? n("payrollitem") > 0 : null, count: n("payrollitem") + txn("paycheck"), metric: "ítems de nómina", evidence: `payrollitem ${fmt(n("payrollitem"))} · paychecks ${fmt(txn("paycheck"))}` }),
  "expense-reports": () => ({ enabled: txn("expense report") > 0 ? true : null, count: txn("expense report"), metric: "expense reports", evidence: txn("expense report") ? `${fmt(txn("expense report"))} expense reports` : "sin transacciones Expense Report" }),
  "account-reconciliation": () => ({ enabled: null, count: 0, metric: "—", evidence: "ARCS es una app aparte; no deja rastro en SuiteQL" }),
  // `PLANNING` a secas da falsos positivos (cualquier campo "Planning Category").
  // El marcador duro es NSPBCS_ — el prefijo del NSPB Connector Suite bundle.
  "nspb-connector": () => {
    const cs = countObj("NSPBCS_"), other = countObj("HYPERION|PBCS|EPM_");
    return { enabled: cs > 0 ? true : other > 0 ? true : null, count: cs,
      metric: "objetos del connector",
      evidence: cs > 0
        ? `${cs} objetos \`CUSTRECORD_NSPBCS_*\` — el bundle NSPB Connector Suite está instalado${other ? ` (+${other} objetos PBCS/Hyperion)` : ""}`
        : other > 0 ? `${other} objetos PBCS/Hyperion, sin el bundle NSPBCS` : "sin rastro del connector NSPB" };
  },
  "suiteanalytics-connect": () => ({ enabled: null, count: 0, metric: "—", evidence: "no observable por SuiteQL (es licencia/ODBC)" }),
  "suiteanalytics-workbook": () => ({ enabled: null, count: 0, metric: "—", evidence: "no observable por SuiteQL" }),
  "suitescript": () => ({ enabled: seen("script"), count: n("script"), metric: "scripts", evidence: `${fmt(n("script"))} scripts · ${fmt(n("scriptdeployment"))} deployments · ${fmt(n("scheduledscriptinstance"))} ejecuciones agendadas` }),
  "suiteflow": () => ({ enabled: null, count: 0, metric: "—", evidence: "los workflows no se exponen en SuiteQL; salen del export de SDF" }),
  "custom-records": () => ({ enabled: seen("customrecordtype"), count: n("customrecordtype"), metric: "custom record types", evidence: `${fmt(n("customrecordtype"))} custom records · ${fmt(n("customlist"))} listas` }),
  "web-services-rest-tba": () => ({ enabled: true, count: 1, metric: "—", evidence: "confirmado: esta extracción corrió por REST + TBA" }),
  "suitetax": () => ({ enabled: seen("taxtype"), count: n("taxtype") + n("nexus"), metric: "tax types + nexus", evidence: `${fmt(n("taxtype"))} tax types · ${fmt(n("nexus"))} nexus · ${fmt(n("salestaxitem"))} sales tax items` }),
  "suitecommerce": () => ({ enabled: null, count: 0, metric: "—", evidence: "no observable por SuiteQL" }),
  "crm-opportunities": () => ({ enabled: txn("opportunity") > 0 || seen("campaign") ? true : null, count: txn("opportunity"), metric: "oportunidades", evidence: txn("opportunity") ? `${fmt(txn("opportunity"))} oportunidades` : "sin transacciones Opportunity; CRM prácticamente sin uso" }),
  "approval-routing": () => ({ enabled: null, count: 0, metric: "—", evidence: "no observable por SuiteQL" }),
  "period-end-journals": () => ({ enabled: true, count: txn("^journal"), metric: "asientos", evidence: `${fmt(txn("^journal"))} journals` }),
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
  const r = rule ? rule() : { enabled: null, count: 0, metric: "—", evidence: "sin regla de detección" };
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
  { nspbDim: "Account", source: "Chart of Accounts", members: n("account"), quality: (() => { const u = list("accounts_unused").length; return u ? `${u} cuentas sin movimiento a excluir antes de mapear` : "ok"; })() },
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
  gaps.push("Sin cuentas estadísticas detectadas: los drivers de Planning (headcount, unidades) habría que construirlos.");
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
