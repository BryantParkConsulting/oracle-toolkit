#!/usr/bin/env node
/**
 * netsuite-assessment-report.js — convierte el snapshot crudo de netsuite-export.js
 * en el entregable: inventario de módulos + encaje de producto (NSPB / NSAR / NSAW).
 *
 * Toda afirmación del informe sale de un número medido en la cuenta. El motor de
 * recomendación es determinístico y muestra su propia evidencia, para que el
 * consultor pueda discutir cada señal con el cliente en vez de defender un veredicto.
 *
 * Uso:  CLIENT=<cliente> node tools/netsuite-assessment-report.js
 * Sale: clients/<CLIENT>/netsuite/ASSESSMENT.md
 */

const fs = require("fs");
const path = require("path");

const CLIENT = process.env.CLIENT || "bpc";
const DIR = path.join(__dirname, "..", "clients", CLIENT, "netsuite");
const readJSON = n => { try { return JSON.parse(fs.readFileSync(path.join(DIR, `${n}.json`), "utf8")); } catch { return null; } };

const probe = readJSON("probe");
if (!probe) { console.error(`No hay probe.json en ${DIR}. Corré primero netsuite-export.js --phase=probe`); process.exit(1); }
const shape = readJSON("shape") || {};
const fieldsData = readJSON("fields");
const metaData = readJSON("metadata");

// ── hechos ───────────────────────────────────────────────────────────────────
const T = {};
for (const tables of Object.values(probe.modules)) Object.assign(T, tables);

// Tablas cuyo 0 no significa "sin uso": retención corta o permiso, no ausencia
// de actividad. Confundirlas es el error clásico de estos informes.
const UNRELIABLE_ZERO = new Set(["loginaudit", "systemnote", "systemnote2", "transactionhistory"]);

const exists = t => !!T[t]?.exists;
const rows = t => (exists(t) ? Number(T[t].rows ?? 0) : null);
const n = t => rows(t) ?? 0;
const list = k => (Array.isArray(shape[k]) ? shape[k] : []);
const num = v => Number(v ?? 0);

const acctByType = Object.fromEntries(list("accounts_by_type").map(r => [String(r.tipo || "").toLowerCase(), num(r.n)]));
const acct = (...types) => types.reduce((a, t) => a + (acctByType[t.toLowerCase()] || 0), 0);

const txnTypes = [...new Set(list("txn_by_type_year").map(r => r.tipo).filter(Boolean))];
const txnByType = {};
for (const r of list("txn_by_type_year")) txnByType[r.tipo] = (txnByType[r.tipo] || 0) + num(r.n);
const years = [...new Set(list("txn_by_type_year").map(r => r.anio).filter(Boolean))].sort();

// `customfield` mezcla campos de datos con parámetros de script (fieldtype SCRIPT).
// Contarlos juntos infla la deuda de customización y desvirtúa la señal de NSAW.
const customFields = list("custom_fields");
const cfByType = {};
for (const r of customFields) { const t = String(r.fieldtype || "?").toUpperCase(); cfByType[t] = (cfByType[t] || 0) + 1; }
const scriptParams = cfByType.SCRIPT || 0;
const dataFields = customFields.length - scriptParams;

// Las SuiteApps de terceros dejan su prefijo de vendor en scriptid.
const crNames = list("custom_record_usage").map(r => `${r.name || ""} ${r.scriptid || ""}`).join(" | ");
const cfIds = customFields.map(r => r.scriptid || "").join(" | ");
const vendorHits = re => (cfIds.match(new RegExp(re, "gi")) || []).length + (crNames.match(new RegExp(re, "gi")) || []).length;

const fmt = x => (x === null || x === undefined ? "—" : Number(x).toLocaleString("es-AR"));

// ── inventario de módulos ────────────────────────────────────────────────────
const inventory = Object.entries(probe.modules).map(([module, tables]) => {
  const entries = Object.entries(tables);
  const present = entries.filter(([, v]) => v.exists);
  const reliable = present.filter(([k]) => !UNRELIABLE_ZERO.has(k));
  const used = reliable.filter(([, v]) => Number(v.rows) > 0);

  let status, note;
  if (!present.length) {
    status = "No habilitado";
    note = "Ninguna tabla del módulo responde. Puede ser feature apagada **o** el rol sin permiso — se desambigua contra el export de SDF.";
  } else if (!reliable.length) {
    status = "No medible";
    note = "Las tablas responden pero su conteo no es indicador de uso (retención / permisos).";
  } else if (!used.length) {
    status = "Habilitado sin uso";
    note = `${present.length} tabla(s) expuesta(s), todas en cero. Candidato a revisar: se paga/mantiene y no se usa.`;
  } else if (used.length < reliable.length) {
    status = "Uso parcial";
    note = `Con datos: ${used.map(([k]) => k).join(", ")}. En cero: ${reliable.filter(([, v]) => !Number(v.rows)).map(([k]) => k).join(", ")}.`;
  } else {
    status = "En uso";
    note = "Todas las tablas visibles del módulo tienen datos.";
  }
  const volume = present.reduce((a, [k, v]) => a + (UNRELIABLE_ZERO.has(k) ? 0 : Number(v.rows) || 0), 0);
  return { module, status, note, volume, present: present.length, total: entries.length };
});

// ── vertical (hipótesis, no dato) ────────────────────────────────────────────
function inferVertical() {
  const hasInventory = exists("inventoryitem") || exists("inventorybalance") || exists("bin");
  const hasMfg = exists("bom") || exists("manufacturingrouting");
  const arm = n("revenuearrangement") + n("revenueplan");
  const projects = n("job");
  const subs = n("subscription");

  if (hasMfg) return { label: "Manufactura", why: "hay BOM / routings de manufactura activos" };
  if (hasInventory) return { label: "Distribución / Retail", why: "hay tablas de inventario y ubicaciones de stock" };
  if (subs > 0) return { label: "SaaS / Suscripción", why: "SuiteBilling con suscripciones vivas" };
  if (arm > 1000 && projects > 1000)
    return { label: "Servicios profesionales / Software con reconocimiento diferido", why: `ARM intensivo (${fmt(arm)} arrangements+plans) y ${fmt(projects)} proyectos, sin inventario ni manufactura` };
  if (arm > 1000) return { label: "Servicios / Software con revenue diferido", why: `ARM intensivo (${fmt(arm)}) sin inventario` };
  return { label: "Indeterminada", why: "las señales no alcanzan; confirmar con el cliente" };
}
const vertical = inferVertical();

// ── SuiteApps instaladas (se delatan por tipos de transacción y prefijos) ────
const SUITEAPPS = [
  { name: "NetLease — lease accounting (ASC 842 / IFRS 16)", hit: () => txnTypes.some(t => /netlease/i.test(t)),
    ev: () => txnTypes.filter(t => /netlease/i.test(t)).map(t => `${t} (${fmt(txnByType[t])})`).join(", ") },
  { name: "Fixed Assets Management (FAM)", hit: () => exists("customrecord_ncfar_asset"),
    ev: () => `${fmt(n("customrecord_ncfar_asset"))} activos · ${fmt(n("customrecord_ncfar_assettype"))} tipos` },
  { name: "Advanced Revenue Management (ARM)", hit: () => n("revenuearrangement") > 0,
    ev: () => `${fmt(n("revenuearrangement"))} arrangements · ${fmt(n("revenueplan"))} plans` },
  { name: "SuiteProjects / PSA", hit: () => n("projecttask") > 0 || n("timebill") > 0,
    ev: () => `projecttask ${fmt(n("projecttask"))} · timebill ${fmt(n("timebill"))}` },
  { name: "SuiteBilling (suscripciones)", hit: () => n("subscription") > 0,
    ev: () => `${fmt(n("subscription"))} suscripciones` },
  ...[
    ["Celigo integrator.io (iPaaS)", "CELIGO"],
    ["Avalara AvaTax", "AVATAX|AVALARA"],
    ["Vertex (impuestos)", "VERTEX"],
    ["Tipalti / Bill.com (AP automation)", "TIPALTI|BILLCOM"],
    ["Coupa", "COUPA"],
    ["Concur / Expensify (gastos)", "CONCUR|EXPENSIFY"],
    ["Salesforce (integración CRM)", "SFDC|SALESFORCE"],
    ["Boomi / Workato (iPaaS)", "BOOMI|WORKATO"],
  ].map(([name, re]) => ({ name, hit: () => vendorHits(re) > 0, ev: () => `${vendorHits(re)} objetos con prefijo \`${re.split("|")[0]}\`` })),
].map(a => { let hit = false, ev = "—"; try { hit = !!a.hit(); ev = a.ev(); } catch {} return { ...a, hit, evidence: ev }; })
  .filter(a => a.hit || !/Celigo|Avalara|Vertex|Tipalti|Coupa|Concur|Salesforce|Boomi/.test(a.name));

// ── motor de encaje de producto ──────────────────────────────────────────────
// Señales GRADUADAS, no binarias: con umbrales de sí/no cualquier cuenta grande
// satura los tres productos en 100% y el informe deja de priorizar nada.
// Cada señal se puntúa por tramos, así el score separa de verdad.
const tier = (v, [t1, t2, t3]) => (v >= t3 ? 1 : v >= t2 ? 0.67 : v >= t1 ? 0.34 : 0);
const bar = g => (g >= 1 ? "●●●" : g >= 0.67 ? "●●○" : g >= 0.34 ? "●○○" : "○○○");

const dims = () => n("subsidiary") + n("department") + n("location") + n("classification") + n("customsegment");
const riskAccts = () => acct("OthCurrAsset", "OthCurrLiab", "DeferRevenue", "DeferExpense", "OthAsset", "OthLiab");

const SIGNALS = {
  NSPB: [
    { w: 25, label: "Presupuestan hoy dentro de NetSuite", grade: () => tier(n("budgetimport") + n("budget"), [1, 1000, 10000]),
      ev: () => `${fmt(n("budgetimport"))} filas de budget import` },
    { w: 20, label: "Dimensionalidad suficiente para un modelo de planeación", grade: () => tier(dims(), [8, 25, 60]),
      ev: () => `${fmt(n("subsidiary"))} subsidiarias · ${fmt(n("department"))} depts · ${fmt(n("location"))} locations · ${fmt(n("classification"))} classes · ${fmt(n("customsegment"))} custom segments` },
    { w: 15, label: "Volumen de GL que hace inviable planear en Excel", grade: () => tier(n("transactionline"), [100000, 500000, 2000000]),
      ev: () => `${fmt(n("transactionline"))} líneas de transacción` },
    { w: 15, label: "Planeación por proyecto / portfolio", grade: () => tier(n("job"), [100, 1000, 10000]),
      ev: () => `${fmt(n("job"))} proyectos` },
    { w: 10, label: "Workforce planning con masa crítica", grade: () => tier(n("employee"), [25, 100, 500]),
      ev: () => `${fmt(n("employee"))} empleados` },
    { w: 10, label: "Multi-moneda / multi-entidad (consolidación y FX)", grade: () => tier((n("currency") > 1 ? 1 : 0) + (n("subsidiary") > 1 ? 1 : 0), [1, 2, 2]),
      ev: () => `${fmt(n("currency"))} monedas · ${fmt(n("subsidiary"))} subsidiarias` },
    { w: 5, label: "Revenue complejo que hoy se forecastea fuera del sistema", grade: () => tier(n("revenueplan"), [500, 5000, 50000]),
      ev: () => `${fmt(n("revenueplan"))} revenue plans` },
  ],
  NSAR: [
    { w: 25, label: "Masa de cuentas a conciliar", grade: () => tier(n("account"), [100, 300, 800]),
      ev: () => `${fmt(n("account"))} cuentas en el COA` },
    { w: 20, label: "Cuentas de banco / tarjeta (el caso núcleo de conciliación)", grade: () => tier(acct("Bank", "CredCard"), [2, 8, 25]),
      ev: () => `${fmt(acct("Bank"))} bancos · ${fmt(acct("CredCard"))} tarjetas` },
    { w: 20, label: "Cierre multi-entidad con intercompany", grade: () => tier(n("subsidiary"), [2, 4, 10]),
      ev: () => `${fmt(n("subsidiary"))} subsidiarias` },
    { w: 15, label: "Volumen transaccional que hace manual el matching", grade: () => tier(n("transaction"), [50000, 200000, 1000000]),
      ev: () => `${fmt(n("transaction"))} transacciones` },
    { w: 10, label: "Historia de cierres larga (rastro de auditoría a formalizar)", grade: () => tier(n("accountingperiod"), [48, 120, 300]),
      ev: () => `${fmt(n("accountingperiod"))} períodos contables` },
    { w: 10, label: "Cuentas de balance de alto riesgo (prepagos, devengos, suspenso)", grade: () => tier(riskAccts(), [10, 40, 120]),
      ev: () => `${fmt(riskAccts())} cuentas de activo/pasivo corriente, otros y diferidos` },
  ],
  NSAW: [
    { w: 25, label: "Volumen que excede el reporting nativo (saved searches)", grade: () => tier(n("transactionline"), [200000, 1000000, 5000000]),
      ev: () => `${fmt(n("transactionline"))} líneas · ${fmt(n("transactionaccountingline"))} líneas contables` },
    { w: 20, label: "Datos dispersos en objetos custom", grade: () => tier(n("customrecordtype"), [25, 100, 300]),
      ev: () => `${fmt(n("customrecordtype"))} custom record types · ${fmt(n("customlist"))} listas` },
    { w: 20, label: "Complejidad de campos que rompe el reporte plano", grade: () => tier(n("customfield"), [200, 1000, 3000]),
      ev: () => `${fmt(n("customfield"))} custom fields` },
    { w: 15, label: "Analítica consolidada multi-entidad / multi-moneda", grade: () => tier((n("subsidiary") > 1 ? 1 : 0) + (n("currency") > 1 ? 1 : 0), [1, 2, 2]),
      ev: () => `${fmt(n("subsidiary"))} subsidiarias · ${fmt(n("currency"))} monedas` },
    { w: 10, label: "Customización pesada (indicio de workarounds de reporting)", grade: () => tier(n("script"), [100, 400, 1200]),
      ev: () => `${fmt(n("script"))} scripts · ${fmt(n("scriptdeployment"))} deployments` },
    { w: 10, label: "Historia multi-año para análisis de tendencia", grade: () => tier(years.length, [3, 6, 10]),
      ev: () => (years.length ? `${years.length} años con transacciones (${years[0]}–${years[years.length - 1]})` : "sin datos de años") },
  ],
};

const PRODUCT_NAME = {
  NSPB: "NSPB — NetSuite Planning & Budgeting",
  NSAR: "NSAR — NetSuite Account Reconciliation",
  NSAW: "NSAW — NetSuite Analytics Warehouse",
};

function score(product) {
  const sig = SIGNALS[product].map(s => {
    let g = 0, ev = "—";
    try { g = Math.max(0, Math.min(1, s.grade())); ev = s.ev(); } catch { /* dato faltante ⇒ señal en cero */ }
    return { ...s, grade: g, evidence: ev };
  });
  const got = sig.reduce((a, s) => a + s.w * s.grade, 0);
  const max = sig.reduce((a, s) => a + s.w, 0);
  const pct = Math.round((100 * got) / max);
  const band = pct >= 70 ? "Encaje alto" : pct >= 45 ? "Encaje medio" : "Encaje bajo";
  return { product, sig, pct, band };
}
const scores = ["NSPB", "NSAR", "NSAW"].map(score).sort((a, b) => b.pct - a.pct);

// ── markdown ─────────────────────────────────────────────────────────────────
const L = [];
const p = s => L.push(s);

p(`# NetSuite — Current State & Product Fit`);
p(``);
p(`**Cuenta:** \`${probe.account}\`  ·  **Cliente:** ${CLIENT}  ·  **Snapshot:** ${new Date(probe.generatedAt).toISOString().slice(0, 10)}`);
p(``);
p(`> Este informe se construye **solo** con lo que la cuenta devolvió por SuiteQL/REST. Todo lo que sigue son **hallazgos y sugerencias a validar con el cliente**, no conclusiones cerradas: un módulo puede aparecer como ausente porque la feature está apagada *o* porque el rol de la integración no lo ve, y esa diferencia solo la resuelve el export de SDF.`);
p(``);

p(`## 1. Resumen ejecutivo`);
p(``);
p(`- **Vertical (hipótesis):** ${vertical.label} — ${vertical.why}. *A confirmar.*`);
p(`- **Escala:** ${fmt(n("transaction"))} transacciones y ${fmt(n("transactionline"))} líneas sobre ${fmt(n("account"))} cuentas.`);
p(`- **Estructura:** ${fmt(n("subsidiary"))} subsidiarias, ${fmt(n("department"))} departamentos, ${fmt(n("location"))} ubicaciones, ${fmt(n("classification"))} clases, ${fmt(n("customsegment"))} custom segment(s), ${fmt(n("accountingbook"))} accounting book(s).`);
p(`- **Customización:** ${fmt(n("customfield"))} custom fields, ${fmt(n("customrecordtype"))} custom records, ${fmt(n("script"))} scripts.`);
const topFit = scores[0];
p(`- **Mejor encaje aparente:** ${PRODUCT_NAME[topFit.product]} (${topFit.pct}% de señales, ${topFit.band}).`);
p(``);

p(`## 2. Inventario de módulos`);
p(``);
p(`| Módulo | Estado | Tablas visibles | Volumen | Lectura |`);
p(`| --- | --- | ---: | ---: | --- |`);
for (const r of inventory.sort((a, b) => b.volume - a.volume)) {
  p(`| ${r.module} | ${r.status} | ${r.present}/${r.total} | ${fmt(r.volume)} | ${r.note} |`);
}
p(``);
const unused = inventory.filter(r => r.status === "Habilitado sin uso");
if (unused.length) {
  p(`**Habilitado y sin uso** (revisar costo/mantenimiento): ${unused.map(r => `**${r.module}**`).join(", ")}.`);
  p(``);
}

if (txnTypes.length) {
  p(`### 2.1 Módulos transaccionales por tipo de documento`);
  p(``);
  p(`En NetSuite los módulos transaccionales no son tablas sino valores de \`transaction.type\`, así que el uso real se lee acá:`);
  p(``);
  p(`| Tipo de transacción | Volumen |`);
  p(`| --- | ---: |`);
  for (const [t, v] of Object.entries(txnByType).sort((a, b) => b[1] - a[1]).slice(0, 25)) p(`| ${t} | ${fmt(v)} |`);
  p(``);
  if (years.length) p(`Rango con actividad: **${years[0]}–${years[years.length - 1]}** (${years.length} años).`);
  p(``);
}

p(`### 2.2 SuiteApps detectadas`);
p(``);
p(`No aparecen en el listado de features: se delatan por sus tipos de transacción y sus custom records.`);
p(``);
p(`| | SuiteApp | Evidencia |`);
p(`| :-: | --- | --- |`);
for (const a of SUITEAPPS) p(`| ${a.hit ? "✅" : "—"} | ${a.name} | ${a.hit ? a.evidence : "sin rastro"} |`);
p(``);

p(`## 3. Deuda de customización`);
p(``);
p(`| Objeto | Cantidad |`);
p(`| --- | ---: |`);
p(`| Custom fields — **de datos** | ${fmt(dataFields || n("customfield"))} |`);
if (scriptParams) p(`| Custom fields — parámetros de script (no son deuda de datos) | ${fmt(scriptParams)} |`);
p(`| Custom record types | ${fmt(n("customrecordtype"))} |`);
p(`| Custom lists | ${fmt(n("customlist"))} |`);
p(`| Scripts | ${fmt(n("script"))} |`);
p(`| Script deployments | ${fmt(n("scriptdeployment"))} |`);
p(``);
if (fieldsData) {
  const dead = [];
  for (const [table, d] of Object.entries(fieldsData)) {
    const zero = Object.entries(d.fields || {}).filter(([, v]) => v.filled === 0);
    if (zero.length) dead.push({ table, zero: zero.length, total: Object.keys(d.fields).length, rows: d.totalRows });
  }
  if (dead.length) {
    p(`### 3.1 Custom fields sin un solo valor cargado`);
    p(``);
    p(`| Tabla | Custom fields | Nunca poblados | Filas evaluadas |`);
    p(`| --- | ---: | ---: | ---: |`);
    for (const d of dead) p(`| ${d.table} | ${fmt(d.total)} | **${fmt(d.zero)}** | ${fmt(d.rows)} |`);
    p(``);

    // Un campo `custentity_` existe en customer, vendor, employee y job a la vez.
    // Que esté vacío en vendor no lo hace muerto: puede simplemente no aplicar ahí.
    // El único número defendible es el campo vacío en TODAS las tablas donde se midió.
    const across = {};
    for (const [table, d] of Object.entries(fieldsData)) {
      for (const [f, v] of Object.entries(d.fields || {})) {
        if (v.error) continue;
        (across[f] ||= { tables: [], filled: 0 }).tables.push(table);
        across[f].filled += Number(v.filled || 0);
      }
    }
    const allFields = Object.entries(across);
    const globallyDead = allFields.filter(([, v]) => v.filled === 0);
    const multiTable = globallyDead.filter(([, v]) => v.tables.length > 1);

    // Cobertura: un campo `custentity_` está declarado para todas las entidades pero
    // solo es columna real donde se aplicó. Sin declarar esto, el porcentaje de abajo
    // se leería como si cubriera el universo entero de campos.
    const measured = new Set(allFields.map(([f]) => f));
    const unmeasured = new Set();
    for (const d of Object.values(fieldsData))
      for (const [f, v] of Object.entries(d.fields || {})) if (v.error && !measured.has(f)) unmeasured.add(f);
    if (unmeasured.size) {
      p(`> **Cobertura.** ${fmt(unmeasured.size)} campo(s) no se pudieron medir en ninguna tabla — típicamente campos de fórmula (\`isstored='F'\`) o aplicados a un record type fuera de este barrido. Quedan fuera del cálculo: los porcentajes de abajo son sobre los ${fmt(measured.size)} efectivamente medidos, no sobre el universo completo.`);
      p(``);
    }

    p(`**El número defendible.** Un campo \`custentity_\` existe simultáneamente en \`customer\`, \`vendor\`, \`employee\` y \`job\`: que esté vacío en uno no significa que esté muerto, puede no aplicar ahí. Sumando cada campo across todas las tablas donde se midió:`);
    p(``);
    p(`- **${fmt(globallyDead.length)}** de ${fmt(allFields.length)} campos distintos (${Math.round(100 * globallyDead.length / Math.max(1, allFields.length))}%) no tienen **ni un solo valor en ninguna tabla**.`);
    if (multiTable.length) p(`- De esos, ${fmt(multiTable.length)} se evaluaron contra más de una tabla, así que el cero es más sólido.`);
    p(``);
    p(`Sugerencia a validar antes de deprecar cualquiera: confirmar que no lo escriba un script, una integración de baja frecuencia (acá hay Celigo con ${fmt(vendorHits("CELIGO"))} objetos) o un proceso anual que todavía no corrió en el período medido.`);
    p(``);
    const sample = globallyDead.slice(0, 20).map(([f]) => `\`${f}\``);
    if (sample.length) { p(`Muestra: ${sample.join(", ")}${globallyDead.length > sample.length ? ` … (+${fmt(globallyDead.length - sample.length)})` : ""}`); p(``); }
  }
} else {
  p(`> Falta la fase \`--phase=fields\` (fill-rate por campo). Es la que permite decir cuántos de esos ${fmt(n("customfield"))} campos nunca se usaron.`);
  p(``);
}
const unusedAccounts = list("accounts_unused");
if (unusedAccounts.length) {
  p(`### 3.2 Cuentas sin un solo asiento`);
  p(``);
  p(`**${fmt(unusedAccounts.length)}** de ${fmt(n("account"))} cuentas (${Math.round(100 * unusedAccounts.length / Math.max(1, n("account")))}%) no tienen ninguna línea contable asociada. Sugerencia a validar: son candidatas a inactivar antes de mapear el COA a un modelo de planeación — arrastrarlas multiplica la dimensión Account sin aportar dato.`);
  p(``);
}

p(`## 4. Encaje de producto`);
p(``);
p(`Cada señal es una condición medible sobre la cuenta. El porcentaje es la suma de pesos alcanzados; **no es una probabilidad de venta ni un veredicto técnico**, es un orden de prioridad para la conversación con el cliente.`);
p(``);
p(`| Producto | Señales alcanzadas | Lectura |`);
p(`| --- | ---: | --- |`);
for (const s of scores) p(`| ${PRODUCT_NAME[s.product]} | ${s.pct}% | ${s.band} |`);
p(``);
for (const s of scores) {
  p(`### ${PRODUCT_NAME[s.product]} — ${s.band} (${s.pct}%)`);
  p(``);
  p(`| Fuerza | Señal | Evidencia medida |`);
  p(`| :-: | --- | --- |`);
  for (const g of s.sig) p(`| ${bar(g.grade)} | ${g.label} | ${g.evidence} |`);
  p(``);
}

p(`### Secuencia sugerida`);
p(``);
p(`Los tres productos pueden encajar a la vez en una cuenta de este tamaño; la pregunta útil no es *cuál* sino *en qué orden*. Propuesta a discutir:`);
p(``);
const seq = [];
if (n("budgetimport") > 0)
  seq.push(`**1º NSPB.** Es el único de los tres que ataca un proceso que hoy ya existe y duele: hay ${fmt(n("budgetimport"))} filas de budget import, o sea que el presupuesto se arma afuera y se carga. Es el ciclo con fecha fija del año y el de retorno más visible.`);
else
  seq.push(`**1º NSPB.** No se detectó carga de budget, así que antes de nada hay que entender dónde vive hoy el proceso de planeación — si está enteramente en Excel el caso es más fuerte, no más débil.`);
if (unusedAccounts.length)
  seq.push(`**Prerequisito del anterior:** limpiar el COA. ${fmt(unusedAccounts.length)} cuentas sin un solo asiento arrastradas a un modelo de planeación inflan la dimensión Account sin aportar dato.`);
seq.push(`**2º NSAW.** Después de NSPB, porque recién ahí el warehouse tiene plan *y* actual para cruzar. Antes, solo replica el reporting que ya se hace. ${fmt(n("customfield"))} custom fields y ${fmt(n("customrecordtype"))} custom records dicen que el dato relevante ya no entra en un saved search.`);
seq.push(`**3º NSAR.** Depende del dolor de cierre, que este snapshot **no mide**: SuiteQL no dice cuánto tarda el cierre ni cuántas conciliaciones se llevan en Excel. Hay que preguntarlo antes de posicionarlo.`);
seq.forEach(s2 => { p(`- ${s2}`); p(``); });

p(`## 5. Qué validar con el cliente`);
p(``);
const asks = [
  `Confirmar la vertical y el modelo de negocio (hipótesis actual: **${vertical.label}**).`,
  `Confirmar si los módulos marcados como "No habilitado" están efectivamente apagados o solo fuera del alcance del rol de la integración.`,
  `¿Dónde se arma hoy el presupuesto y el forecast? ${n("budgetimport") > 0 ? `Hay ${fmt(n("budgetimport"))} filas de budget import, lo que sugiere un proceso que hoy entra por carga.` : "No se detectó carga de budget."}`,
  `¿Cómo se concilian hoy las cuentas de balance, y con qué herramienta se documenta el cierre?`,
  `¿Qué reportes se arman fuera de NetSuite (Excel, BI) y con qué frecuencia?`,
];
if (n("job") > 500 && n("projecttask") === 0 && n("timebill") === 0)
  asks.push(`Hay ${fmt(n("job"))} proyectos pero \`projecttask\` y \`timebill\` en cero: los proyectos parecen usarse como contenedor de facturación y no como PSA. Confirmar si es deliberado.`);
if (n("accountingbook") === 1 && n("subsidiary") > 1)
  asks.push(`${fmt(n("subsidiary"))} subsidiarias con un solo accounting book: confirmar que no haya requerimiento de GAAP dual o reporting estatutario separado.`);
asks.forEach(a => p(`- ${a}`));
p(``);

p(`## Anexo — cómo se midió`);
p(``);
p(`- **Existencia de módulo:** SuiteQL solo expone un record type si la feature está habilitada *y* el rol tiene permiso. Un \`Record 'x' was not found\` es por lo tanto **ambiguo** y se reporta como tal.`);
p(`- **Uso:** \`COUNT(*)\` y \`MAX(<fecha>)\` por tabla; nunca se descargan filas de detalle.`);
p(`- **Ceros no confiables:** ${[...UNRELIABLE_ZERO].map(t => `\`${t}\``).join(", ")} — retención o permisos, se excluyen del cálculo de uso.`);
p(`- **Fuente:** \`clients/${CLIENT}/netsuite/{probe,shape,metadata,fields}.json\`, generados por \`tools/netsuite-export.js\`.`);
p(``);

const out = path.join(DIR, "ASSESSMENT.md");
fs.writeFileSync(out, L.join("\n"));
console.log(`→ ${out}`);
console.log(`   Vertical: ${vertical.label}`);
console.log(`   ${scores.map(s => `${s.product} ${s.pct}%`).join("  ·  ")}`);
