#!/usr/bin/env node
/**
 * netsuite-export.js — snapshot estructural + de uso de una cuenta NetSuite.
 *
 * Es el canal "REST" del assessment: complementa al SuiteCloud CLI (SDF), que da
 * la estructura, con lo que SDF no puede dar — cuánto se usa cada cosa.
 * Alimenta los dos entregables: Current State Assessment y Optimization Review.
 *
 * Env (repo-root .env o exportadas):
 *   NS_ACCOUNT (ej. 7282750 o 7282750_SB1), NS_CONSUMER_KEY, NS_CONSUMER_SECRET,
 *   NS_TOKEN_ID, NS_TOKEN_SECRET
 *
 * Uso:
 *   CLIENT=bpc node tools/netsuite-export.js                  # todas las fases
 *   CLIENT=bpc node tools/netsuite-export.js --phase=probe    # solo el mapa de módulos
 *   CLIENT=bpc node tools/netsuite-export.js --phase=fields   # solo fill-rate (lento)
 *
 * Salida: clients/<CLIENT>/netsuite/{probe,shape,metadata,fields}.json
 */

const fs = require("fs");
const path = require("path");

const CLIENT = process.env.CLIENT || "bpc";
const PHASE = (process.argv.find(a => a.startsWith("--phase=")) || "--phase=all").split("=")[1];
const OUT = path.join(__dirname, "..", "clients", CLIENT, "netsuite");

// ── env ───────────────────────────────────────────────────────────────────────
(function loadDotEnv() {
  const p = path.join(__dirname, "..", ".env");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
})();

const ENV = ["NS_ACCOUNT", "NS_CONSUMER_KEY", "NS_CONSUMER_SECRET", "NS_TOKEN_ID", "NS_TOKEN_SECRET"];
const missing = ENV.filter(k => !process.env[k]);
if (missing.length) {
  console.error(`Faltan credenciales TBA: ${missing.join(", ")}`);
  console.error(`Ponelas en ${path.join(__dirname, "..", ".env")} (gitignored).`);
  process.exit(1);
}

const ACCT = String(process.env.NS_ACCOUNT).toLowerCase().replace(/_/g, "-");
const HOST = `https://${ACCT}.suitetalk.api.netsuite.com`;

// ── OAuth 1.0a TBA (port de worker.js:12045) ─────────────────────────────────
const enc = s => encodeURIComponent(s).replace(/[!*'()]/g, c => "%" + c.charCodeAt(0).toString(16).toUpperCase());

async function oauthHeader(method, url) {
  const nonce = crypto.randomUUID().replace(/-/g, "");
  const ts = String(Math.floor(Date.now() / 1000));
  const p = {
    oauth_consumer_key: process.env.NS_CONSUMER_KEY, oauth_token: process.env.NS_TOKEN_ID,
    oauth_signature_method: "HMAC-SHA256", oauth_timestamp: ts, oauth_nonce: nonce, oauth_version: "1.0",
  };
  const u = new URL(url);
  const all = [...Object.entries(p), ...u.searchParams.entries()]
    .map(([k, v]) => [enc(k), enc(v)])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : 1));
  const base = [method.toUpperCase(), enc(u.origin + u.pathname), enc(all.map(([k, v]) => `${k}=${v}`).join("&"))].join("&");
  const key = new TextEncoder().encode(`${enc(process.env.NS_CONSUMER_SECRET)}&${enc(process.env.NS_TOKEN_SECRET)}`);
  const ck = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", ck, new TextEncoder().encode(base));
  const b64 = Buffer.from(new Uint8Array(sig)).toString("base64");
  const realm = String(process.env.NS_ACCOUNT).toUpperCase().replace(/-/g, "_");
  return `OAuth realm="${realm}", oauth_consumer_key="${enc(p.oauth_consumer_key)}", oauth_token="${enc(p.oauth_token)}", ` +
    `oauth_signature_method="HMAC-SHA256", oauth_timestamp="${ts}", oauth_nonce="${nonce}", oauth_version="1.0", oauth_signature="${enc(b64)}"`;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

/** Una página de SuiteQL. Devuelve {items, hasMore, totalResults} o lanza. */
async function suiteqlPage(sql, limit = 1000, offset = 0) {
  const url = `${HOST}/services/rest/query/v1/suiteql?limit=${limit}&offset=${offset}`;
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Prefer: "transient", Authorization: await oauthHeader("POST", url) },
      body: JSON.stringify({ q: sql }),
    });
    const j = await r.json().catch(() => ({}));
    if (r.status === 429 || r.status === 503) { await sleep(1500 * (attempt + 1)); continue; }
    if (!r.ok) {
      const detail = j["o:errorDetails"]?.[0]?.detail || j.title || JSON.stringify(j).slice(0, 200);
      const err = new Error(detail);
      err.status = r.status;
      throw err;
    }
    return { items: j.items || [], hasMore: !!j.hasMore, totalResults: j.totalResults };
  }
  throw new Error("SuiteQL: rate-limited tras 4 intentos");
}

/** SuiteQL con paginación completa. */
async function suiteql(sql, cap = 100000) {
  const out = [];
  for (let offset = 0; offset < cap; offset += 1000) {
    const { items, hasMore } = await suiteqlPage(sql, 1000, offset);
    out.push(...items);
    if (!hasMore || items.length === 0) break;
  }
  return out;
}

async function restGet(pathname) {
  const url = `${HOST}${pathname}`;
  const r = await fetch(url, {
    headers: { Accept: "application/schema+json", Authorization: await oauthHeader("GET", url) },
  });
  if (!r.ok) throw new Error(`REST ${r.status} ${pathname}`);
  return r.json();
}

// ── catálogo de candidatas, por módulo ───────────────────────────────────────
// Una tabla que responde ⇒ la feature está habilitada Y el rol la ve.
// Una que da "Record 'x' was not found" ⇒ feature apagada O sin permiso: ambiguo,
// se desambigua contra el export de SDF.
const CANDIDATES = {
  "Core / GL": ["account", "accountingperiod", "accountingbook", "currency", "currencyrate", "consolidatedexchangerate", "budget", "budgetimport"],
  "Segmentación": ["subsidiary", "department", "classification", "location", "customsegment"],
  "Entidades": ["entity", "customer", "vendor", "employee", "contact", "partner", "entitygroup"],
  "Ítems / Inventario": ["item", "inventoryitem", "inventorynumber", "inventorybalance", "itemlocationconfiguration", "bin", "unitstype", "pricelevel", "itemvendor"],
  "Transacciones": ["transaction", "transactionline", "transactionaccountingline", "transactionhistory"],
  "Proyectos / PSA": ["job", "jobtype", "jobstatus", "projecttask", "timebill", "timeentry", "timesheet", "charge", "projectexpensetype", "resourceallocation"],
  "Revenue (ARM)": ["revenuearrangement", "revenueelement", "revenueplan", "revrecschedule", "billingaccount", "billingschedule", "billingrevenueevent"],
  "SuiteBilling": ["subscription", "subscriptionline", "subscriptionplan", "usage"],
  "Manufactura": ["bom", "bomrevision", "manufacturingrouting", "manufacturingoperationtask", "manufacturingcosttemplate"],
  "Impuestos": ["taxtype", "taxitem", "salestaxitem", "nexus", "taxgroup", "subsidiarytaxregstatus"],
  "CRM": ["campaign", "supportcase", "issue", "solution", "task", "phonecall", "calendarevent", "note", "promotioncode"],
  "Nómina / RRHH": ["payrollitem", "employeestatus", "employeetype", "hcmjob", "jobrequisition"],
  "Customización": ["customrecordtype", "customlist", "customfield", "script", "scriptdeployment", "scheduledscriptinstance", "customersubsidiaryrelationship"],
  "Seguridad / Auditoría": ["role", "loginaudit", "systemnote", "systemnote2", "deletedrecord"],
  "Fixed Assets (FAM)": ["customrecord_ncfar_asset", "customrecord_ncfar_assettype", "customrecord_ncfar_depreciationhistory"],
};

// Columna de fecha por tabla, para medir "última actividad".
const DATE_COL = {
  transaction: "trandate", timebill: "trandate", timeentry: "trandate", timesheet: "trandate",
  systemnote: "date", systemnote2: "date", loginaudit: "date", deletedrecord: "deleteddate",
  job: "startdate", supportcase: "createddate", task: "createddate", calendarevent: "startdate",
  subscription: "startdate", revenuearrangement: "trandate", currencyrate: "effectivedate",
};

const write = (name, data) => {
  fs.mkdirSync(OUT, { recursive: true });
  const p = path.join(OUT, `${name}.json`);
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
  console.log(`  → ${p}`);
};

// ── fase 1: probe (mapa de módulos) ──────────────────────────────────────────
async function phaseProbe() {
  console.log("\n[1/4] Probe de record types (existe? cuántas filas? última actividad?)");
  const result = {};
  for (const [module, tables] of Object.entries(CANDIDATES)) {
    result[module] = {};
    for (const t of tables) {
      const dc = DATE_COL[t];
      const sql = dc
        ? `SELECT COUNT(*) AS n, MAX(${dc}) AS last_activity FROM ${t}`
        : `SELECT COUNT(*) AS n FROM ${t}`;
      try {
        const [row] = (await suiteqlPage(sql)).items;
        result[module][t] = { exists: true, rows: Number(row?.n ?? 0), lastActivity: row?.last_activity ?? null };
        process.stdout.write(`  ✓ ${t} (${row?.n ?? 0})\n`);
      } catch (e) {
        const notFound = /was not found|Unknown identifier|Invalid search type/i.test(e.message);
        result[module][t] = { exists: false, reason: notFound ? "absent-or-no-permission" : e.message.slice(0, 160) };
        process.stdout.write(`  · ${t} — ${notFound ? "no visible" : e.message.slice(0, 60)}\n`);
      }
      await sleep(120);
    }
  }
  write("probe", { account: ACCT, generatedAt: new Date().toISOString(), modules: result });
  return result;
}

// ── fase 2: shape (volumetría real, sin dumpear nada) ────────────────────────
// Las breakdowns valen más que las tablas: los "módulos" transaccionales de
// NetSuite no son tablas, son valores de transaction.type.
const BREAKDOWNS = [
  ["txn_by_type_year", `SELECT BUILTIN.DF(t.type) AS tipo, TO_CHAR(t.trandate,'YYYY') AS anio, COUNT(*) AS n
                        FROM transaction t GROUP BY BUILTIN.DF(t.type), TO_CHAR(t.trandate,'YYYY') ORDER BY 1, 2`],
  ["accounts_by_type", `SELECT accttype AS tipo, COUNT(*) AS n FROM account GROUP BY accttype ORDER BY 2 DESC`],
  ["accounts_unused", `SELECT a.id, a.acctnumber, a.acctname, a.accttype
                       FROM account a WHERE NOT EXISTS
                       (SELECT 1 FROM transactionaccountingline tal WHERE tal.account = a.id) ORDER BY a.acctnumber`],
  ["customers_by_status", `SELECT BUILTIN.DF(c.entitystatus) AS estado, COUNT(*) AS n FROM customer c GROUP BY BUILTIN.DF(c.entitystatus) ORDER BY 2 DESC`],
  ["items_by_type", `SELECT itemtype AS tipo, COUNT(*) AS n FROM item GROUP BY itemtype ORDER BY 2 DESC`],
  ["classes", `SELECT id, name, isinactive FROM classification ORDER BY name`],
  ["periods", `SELECT id, periodname, startdate, enddate, closed, isyear, isquarter FROM accountingperiod ORDER BY startdate`],
  ["scripts_deployed", `SELECT s.id, s.name, s.scripttype, s.scriptid, sd.status, sd.isdeployed
                        FROM script s LEFT JOIN scriptdeployment sd ON sd.script = s.id ORDER BY s.scripttype, s.name`],
  ["custom_record_types", `SELECT id, internalid, scriptid, name, isinactive FROM customrecordtype ORDER BY name`],
  ["subsidiaries", `SELECT id, name, country, currency FROM subsidiary ORDER BY name`],
  ["departments", `SELECT id, name, isinactive FROM department ORDER BY name`],
  ["locations", `SELECT id, name, isinactive FROM location ORDER BY name`],
  ["custom_segments", `SELECT * FROM customsegment`],
  ["items", `SELECT id, itemid, itemtype, isinactive FROM item ORDER BY itemtype, itemid`],
  ["custom_fields", `SELECT * FROM customfield`],
  ["scripts_by_type", `SELECT scripttype, COUNT(*) AS n FROM script GROUP BY scripttype ORDER BY 2 DESC`],
  ["revenue_by_year", `SELECT TO_CHAR(trandate,'YYYY') AS anio, COUNT(*) AS n FROM revenuearrangement GROUP BY TO_CHAR(trandate,'YYYY') ORDER BY 1`],
  ["custom_record_usage", `SELECT c.name, c.scriptid, c.isinactive FROM customrecordtype c ORDER BY c.name`],
  ["login_activity", `SELECT TO_CHAR(date,'YYYY-MM') AS mes, COUNT(*) AS n, COUNT(DISTINCT emailaddress) AS usuarios
                      FROM loginaudit GROUP BY TO_CHAR(date,'YYYY-MM') ORDER BY 1`],
];

async function phaseShape(probe) {
  console.log("\n[2/4] Volumetría y breakdowns");
  const visible = new Set(Object.values(probe || {}).flatMap(m => Object.entries(m).filter(([, v]) => v.exists).map(([k]) => k)));
  const out = {};
  for (const [name, sql] of BREAKDOWNS) {
    const table = /FROM\s+(\w+)/i.exec(sql)?.[1];
    if (probe && table && !visible.has(table)) { console.log(`  · ${name} — omitido (${table} no visible)`); continue; }
    try {
      out[name] = await suiteql(sql, 20000);
      console.log(`  ✓ ${name} (${out[name].length} filas)`);
    } catch (e) {
      out[name] = { error: e.message.slice(0, 200) };
      console.log(`  ✗ ${name} — ${e.message.slice(0, 80)}`);
    }
    await sleep(200);
  }
  write("shape", out);
  return out;
}

// ── fase 3: diccionario de campos (REST metadata-catalog) ────────────────────
async function phaseMetadata() {
  console.log("\n[3/4] Diccionario de campos (metadata-catalog)");
  let types = [];
  try {
    const cat = await restGet("/services/rest/record/v1/metadata-catalog");
    types = (cat.items || []).map(i => i.name).filter(Boolean);
    console.log(`  ✓ ${types.length} record types expuestos a REST`);
  } catch (e) {
    console.log(`  ✗ catálogo no disponible: ${e.message}`);
    return {};
  }
  const schemas = {};
  for (const t of types) {
    try {
      const s = await restGet(`/services/rest/record/v1/metadata-catalog/${t}`);
      const props = s.properties || {};
      schemas[t] = {
        fields: Object.keys(props).length,
        custom: Object.keys(props).filter(f => /^cust(entity|body|col|item|event|record|page)_/i.test(f)),
        columns: Object.fromEntries(Object.entries(props).map(([k, v]) => [k, v.type || (v.$ref ? "ref" : "?")])),
      };
    } catch (e) {
      schemas[t] = { error: e.message.slice(0, 120) };
    }
    await sleep(80);
  }
  const totalCustom = Object.values(schemas).reduce((a, s) => a + (s.custom?.length || 0), 0);
  console.log(`  ✓ ${totalCustom} custom fields en total`);
  write("metadata", { recordTypes: types.length, customFieldCount: totalCustom, schemas });
  return schemas;
}

// ── fase 4: fill-rate de custom fields (el hallazgo de optimización) ─────────
// "Tienen N custom fields; M nunca se poblaron." Se mide contra las tablas
// SuiteQL grandes, en lotes de COUNT() por campo.
const FILL_TARGETS = [
  ["transaction", "custbody_"], ["transactionline", "custcol_"],
  ["customer", "custentity_"], ["vendor", "custentity_"], ["employee", "custentity_"],
  ["item", "custitem_"], ["job", "custentity_"],
];

/**
 * Lista de campos por tabla. La tabla `customfield` de SuiteQL es mejor fuente que
 * metadata-catalog: trae los 3 mil y pico de una, con su `fieldtype` — que además
 * separa los parámetros de script (fieldtype SCRIPT), que NO son campos de datos y
 * no deben contarse como deuda de customización.
 */
function fieldsFromShape(table, prefix) {
  const p = path.join(OUT, "shape.json");
  if (!fs.existsSync(p)) return null;
  let cf;
  try { cf = JSON.parse(fs.readFileSync(p, "utf8")).custom_fields; } catch { return null; }
  if (!Array.isArray(cf)) return null;
  // isstored='F' ⇒ campo calculado por fórmula: no existe como columna SuiteQL.
  // Sin este filtro, cada uno rebota a consulta individual y ensucia la cobertura.
  return [...new Set(cf
    .filter(r => String(r.fieldtype || "").toUpperCase() !== "SCRIPT" && r.isstored === "T")
    .map(r => String(r.scriptid || "").toLowerCase())
    .filter(f => f.startsWith(prefix)))];
}

async function phaseFields(metadata) {
  console.log("\n[4/4] Fill-rate de custom fields");
  const out = {};
  for (const [table, prefix] of FILL_TARGETS) {
    const schema = metadata?.[table];
    const fields = fieldsFromShape(table, prefix)
      || (schema?.custom || []).map(f => f.toLowerCase()).filter(f => f.startsWith(prefix));
    if (!fields.length) { console.log(`  · ${table} — sin campos ${prefix}* en el catálogo`); continue; }
    let total = 0;
    try { total = Number((await suiteqlPage(`SELECT COUNT(*) AS n FROM ${table}`)).items[0]?.n || 0); }
    catch { console.log(`  ✗ ${table} no consultable`); continue; }

    out[table] = { totalRows: total, fields: {} };
    for (let i = 0; i < fields.length; i += 20) {
      const batch = fields.slice(i, i + 20);
      const sel = batch.map(f => `COUNT(${f}) AS ${f}`).join(", ");
      try {
        const [row] = (await suiteqlPage(`SELECT ${sel} FROM ${table}`)).items;
        for (const f of batch) {
          const filled = Number(row?.[f.toLowerCase()] ?? row?.[f] ?? 0);
          out[table].fields[f] = { filled, pct: total ? +(100 * filled / total).toFixed(2) : 0 };
        }
      } catch (e) {
        // un campo inválido tumba el lote: caer a uno por uno
        for (const f of batch) {
          try {
            const [row] = (await suiteqlPage(`SELECT COUNT(${f}) AS c FROM ${table}`)).items;
            const filled = Number(row?.c || 0);
            out[table].fields[f] = { filled, pct: total ? +(100 * filled / total).toFixed(2) : 0 };
          } catch { out[table].fields[f] = { error: "no consultable" }; }
          await sleep(80);
        }
      }
      await sleep(150);
    }
    const dead = Object.entries(out[table].fields).filter(([, v]) => v.filled === 0).length;
    console.log(`  ✓ ${table}: ${fields.length} custom fields, ${dead} con 0 uso (de ${total} filas)`);
  }
  write("fields", out);
  return out;
}

// ── main ─────────────────────────────────────────────────────────────────────
(async () => {
  console.log(`NetSuite export — cuenta ${ACCT} → clients/${CLIENT}/netsuite/`);
  const read = n => { try { return JSON.parse(fs.readFileSync(path.join(OUT, `${n}.json`), "utf8")); } catch { return null; } };

  // Preflight: sin esto, unas credenciales malas se manifiestan como 90 tablas
  // "inexistentes" y el reporte queda lleno de falsos negativos.
  try {
    const [row] = (await suiteqlPage("SELECT COUNT(*) AS n FROM account")).items;
    console.log(`Auth OK — ${row?.n ?? "?"} cuentas en el COA\n`);
  } catch (e) {
    console.error(`\nPreflight FALLÓ (${e.status || "?"}): ${e.message}`);
    if (e.status === 401) console.error("401 = firma/credenciales. ¿Se resetearon las consumer credentials después de copiarlas?");
    if (e.status === 403) console.error("403 = el rol no tiene 'REST Web Services' o 'Log in using Access Tokens'.");
    process.exit(1);
  }

  let probe = null, metadata = null;
  if (PHASE === "all" || PHASE === "probe") probe = await phaseProbe();
  if (PHASE === "all" || PHASE === "shape") await phaseShape(probe || read("probe")?.modules);
  if (PHASE === "all" || PHASE === "meta") metadata = await phaseMetadata();
  if (PHASE === "all" || PHASE === "fields") await phaseFields(metadata || read("metadata")?.schemas);

  console.log("\nListo.");
})().catch(e => { console.error("\nFALLÓ:", e.message); process.exit(1); });
