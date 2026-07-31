#!/usr/bin/env node
/**
 * ns-connector-map.js — mapa completo de qué hay instalado y conectado.
 *
 * Tres fuentes independientes que se corroboran entre sí:
 *   1. `bundleinstallationscript` → nombre REAL de cada bundle/SuiteApp instalada.
 *   2. `oauthtoken`               → qué sistemas externos se autentican (y desde cuándo).
 *   3. histograma de prefijos     → el peso de cada SuiteApp en objetos custom.
 *
 * La 1 le pone nombre autoritativo a la 3 (sin ella, `laa` es un prefijo opaco;
 * con ella es NetLease). La 2 aporta lo que ninguna de las otras ve: integraciones
 * que no instalan bundle — FloQast, Ramp, Concur — que suelen ser justamente el
 * software que compite con lo que uno viene a proponer.
 *
 * Uso: CLIENT=<cliente> node tools/ns-connector-map.js
 * Sale: clients/<cliente>/erp/connectors.json + CONNECTORS.md
 */
const fs = require("fs");
const path = require("path");
const { suiteql } = require("./ns-sql");

const CLIENT = process.env.CLIENT || "bpc";
const ROOT = path.join(__dirname, "..");
const OUT_DIR = path.join(ROOT, "clients", CLIENT, "erp");
const SHAPE = path.join(ROOT, "clients", CLIENT, "netsuite", "shape.json");

const fmt = x => Number(x || 0).toLocaleString("es-AR");

// Software que compite con — o cubre ya — lo que BPC suele proponer. Detectarlo
// tarde es la diferencia entre una propuesta informada y un papelón.
const COMPETING = {
  floqast: { area: "Cierre / conciliación de cuentas", impacto: "Cubre buena parte del caso de NSAR. Verificar alcance antes de posicionar Account Reconciliation." },
  blackline: { area: "Cierre / conciliación", impacto: "Compite directo con NSAR." },
  adaptive: { area: "Planeación (Workday Adaptive)", impacto: "Compite directo con NSPB." },
  anaplan: { area: "Planeación", impacto: "Compite directo con NSPB." },
  vena: { area: "Planeación", impacto: "Compite directo con NSPB." },
  pigment: { area: "Planeación", impacto: "Compite directo con NSPB." },
  ramp: { area: "Gastos / tarjetas corporativas", impacto: "Fuente de gasto fuera del GL: afecta el detalle disponible para planear." },
  concur: { area: "Gastos y viajes", impacto: "Ídem: los expense reports pueden no vivir en NetSuite." },
  expensify: { area: "Gastos", impacto: "Ídem." },
  coupa: { area: "Procurement", impacto: "El compromiso de gasto vive afuera." },
  tipalti: { area: "AP automation", impacto: "AP parcialmente fuera de NetSuite." },
  avalara: { area: "Impuestos", impacto: "Cálculo de impuestos externo." },
  salesforce: { area: "CRM", impacto: "El pipeline vive afuera: relevante para planeación de ingresos." },
};

const norm = s => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const competingFor = name => {
  const k = norm(name);
  for (const [key, v] of Object.entries(COMPETING)) if (k.includes(key)) return { key, ...v };
  return null;
};

(async () => {
  // ── 1. bundles instalados ─────────────────────────────────────────────────
  let bundles = [];
  try {
    bundles = await suiteql("SELECT name, scriptid FROM bundleinstallationscript ORDER BY name");
  } catch (e) { console.error(`  · bundleinstallationscript no accesible: ${e.message.slice(0, 80)}`); }

  // El scriptid del install script lleva el prefijo del bundle: es el puente
  // entre el nombre legible y los miles de objetos custom que dejó instalados.
  const bundlePrefix = b => {
    const m = /^custom(?:script|deploy)_(?:\d+_)?([a-z0-9]+)_/i.exec(String(b.scriptid || ""));
    return m ? m[1].toLowerCase() : null;
  };

  // ── 2. tokens de integración ──────────────────────────────────────────────
  let tokens = [];
  try {
    tokens = await suiteql("SELECT tba_token_name, dcreated, binactive, brevoked FROM oauthtoken ORDER BY dcreated");
  } catch (e) { console.error(`  · oauthtoken no accesible: ${e.message.slice(0, 80)}`); }

  const apps = {};
  for (const t of tokens) {
    // "AppLink - Dan Ambrose, Administrator" → la app es lo previo al guion.
    // Se agrega por app a propósito: los nombres de persona no van al entregable.
    const app = String(t.tba_token_name || "?").split(" - ")[0].trim();
    const a = (apps[app] ||= { app, tokens: 0, activos: 0, revocados: 0, desde: t.dcreated, hasta: t.dcreated });
    a.tokens++;
    if (t.brevoked === "T") a.revocados++; else if (t.binactive !== "T") a.activos++;
    a.hasta = t.dcreated;
  }
  const integrations = Object.values(apps).sort((x, y) => y.tokens - x.tokens)
    .map(a => ({ ...a, competing: competingFor(a.app) }));

  // ── 3. histograma de prefijos ─────────────────────────────────────────────
  let prefixes = [];
  if (fs.existsSync(SHAPE)) {
    const s = JSON.parse(fs.readFileSync(SHAPE, "utf8"));
    const ids = []
      .concat((s.custom_fields || []).map(r => r.scriptid))
      .concat((s.custom_record_usage || []).map(r => r.scriptid))
      .concat((s.scripts_deployed || []).map(r => r.scriptid))
      .filter(Boolean);
    const H = {};
    for (const id of ids) {
      const m = /^(?:cust(?:record|body|entity|col|item|event|page)?_|customscript_|customdeploy_)(?:\d+_)?([a-z0-9]+)_/i.exec(String(id));
      if (!m) continue;
      const p = m[1].toLowerCase();
      if (/^\d+$/.test(p)) continue;
      (H[p] ||= { prefix: p, objects: 0, sample: id }).objects++;
    }
    // Los que quedan sin namespace de vendor son desarrollo del cliente, no SuiteApp.
    const NATIVE = new Set(["custrecord", "customrecord", "custscript", "customscript", "custentity", "custbody", "custcol", "custitem", "custevent", "customdeploy", "ns"]);
    prefixes = Object.values(H).filter(x => x.objects >= 3 && !NATIVE.has(x.prefix)).sort((a, b) => b.objects - a.objects);
  }

  // ── cruce: nombre de bundle ← prefijo ─────────────────────────────────────
  const nameByPrefix = {};
  for (const b of bundles) { const p = bundlePrefix(b); if (p) nameByPrefix[p] = b.name; }
  // Familias conocidas cuyos objetos usan prefijos distintos al del installer.
  const FAMILY = { fam: "FAM", ncfar: "FAM", altdepr: "FAM", altdeprdef: "FAM", propaltdepr: "FAM", assetregister: "FAM", assetsummary: "FAM", assetregisterrep: "FAM", assetsummaryrep: "FAM", deprhistory: "FAM", far: "FAM", tpafm: "FAM", asset: "FAM", summary: "FAM", ofd: "FAM", nsapm: "APM", subnav: "Subsidiary Navigator", snav: "Subsidiary Navigator", atlas: "PBCS / Planning" };

  const mapped = prefixes.map(p => ({
    ...p,
    bundle: nameByPrefix[p.prefix] || (FAMILY[p.prefix] ? `${FAMILY[p.prefix]} (familia)` : null),
  }));
  const unidentified = mapped.filter(p => !p.bundle);

  const result = {
    client: CLIENT, generatedAt: new Date().toISOString().slice(0, 10),
    bundles: bundles.map(b => ({ name: b.name, scriptid: b.scriptid, prefix: bundlePrefix(b) })),
    integrations, prefixes: mapped,
    competingTooling: integrations.filter(i => i.competing),
    caveats: [
      "`bundleinstallationscript` solo lista bundles que traen script de instalación: un bundle sin installer no aparece. Contrastar con Customization → SuiteBundler.",
      "`oauthtoken` cubre integraciones por TBA. Las que usan OAuth 2.0, SOAP con credenciales de usuario, o SuiteAnalytics Connect NO aparecen acá.",
      "Los prefijos sin nombre de bundle no son necesariamente SuiteApps: pueden ser desarrollo a medida con convención de namespace.",
    ],
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, "connectors.json"), JSON.stringify(result, null, 2));

  // ── markdown ──────────────────────────────────────────────────────────────
  const L = [];
  L.push(`# Mapa de conectores e integraciones — ${CLIENT}`, "");
  L.push(`Snapshot ${result.generatedAt}. Tres fuentes independientes: bundles instalados, tokens de integración activos y huella de objetos custom.`, "");

  if (result.competingTooling.length) {
    L.push(`## ⚠ Software que ya cubre lo que podríamos proponer`, "");
    L.push(`| Sistema | Área | Desde | Implicancia |`, `| --- | --- | --- | --- |`);
    for (const i of result.competingTooling)
      L.push(`| **${i.app}** | ${i.competing.area} | ${i.desde} | ${i.competing.impacto} |`);
    L.push("", `Verificar el alcance real de cada uno con el cliente antes de posicionar nada: que exista el token no dice cuánto lo usan.`, "");
  }

  L.push(`## Integraciones autenticadas (${integrations.length} aplicaciones · ${tokens.length} tokens)`, "");
  L.push(`| Aplicación | Tokens | Activos | Revocados | Desde |`, `| --- | ---: | ---: | ---: | --- |`);
  for (const i of integrations) L.push(`| ${i.app} | ${i.tokens} | ${i.activos} | ${i.revocados} | ${i.desde} |`);
  L.push("", `> Agregado por aplicación a propósito: los tokens llevan nombre de persona y no corresponde exponerlos en un entregable.`, "");

  L.push(`## SuiteApps / bundles instalados (${bundles.length})`, "");
  L.push(`| Bundle | Prefijo | Objetos custom |`, `| --- | --- | ---: |`);
  for (const b of result.bundles) {
    const objs = mapped.filter(p => p.bundle === b.name).reduce((a, p) => a + p.objects, 0);
    L.push(`| ${b.name} | \`${b.prefix || "—"}\` | ${objs ? fmt(objs) : "—"} |`);
  }
  L.push("");

  L.push(`## Huella en objetos custom`, "");
  L.push(`| Prefijo | Objetos | Bundle |`, `| --- | ---: | --- |`);
  for (const p of mapped.slice(0, 30)) L.push(`| \`${p.prefix}\` | ${fmt(p.objects)} | ${p.bundle || "**sin identificar**"} |`);
  L.push("");
  if (unidentified.length) {
    L.push(`**${unidentified.length} prefijos sin bundle asociado** — desarrollo a medida, o SuiteApps cuyo installer no quedó registrado: ${unidentified.slice(0, 12).map(p => `\`${p.prefix}\` (${p.objects})`).join(", ")}.`, "");
  }

  L.push(`## Salvedades`, "");
  result.caveats.forEach(c => L.push(`- ${c}`));
  L.push("");

  fs.writeFileSync(path.join(OUT_DIR, "CONNECTORS.md"), L.join("\n"));
  console.log(`→ ${path.join(OUT_DIR, "connectors.json")}`);
  console.log(`→ ${path.join(OUT_DIR, "CONNECTORS.md")}`);
  console.log(`   ${bundles.length} bundles · ${integrations.length} aplicaciones (${tokens.length} tokens) · ${mapped.length} prefijos · ${result.competingTooling.length} sistemas que compiten`);
})().catch(e => { console.error("FALLÓ:", e.message); process.exit(1); });
