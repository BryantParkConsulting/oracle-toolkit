#!/usr/bin/env node
/**
 * probe-cell-history.js — Descubre el op XML de "Cell History" del provider SmartView.
 *
 *  ⚠️ SOLO LECTURA. Este script NO escribe, NO muta, NO corre reglas, NO crea/borra
 *     nada. Únicamente abre la app (req_OpenApplication) y postea operaciones de
 *     LECTURA candidatas para ver cuál devuelve los registros de auditoría de la celda
 *     (quién / cuándo / old→new). Si una operación no existe, el provider responde
 *     <res_Exception ...> y seguimos con la siguiente.
 *
 *  Por qué hace falta: Oracle no documenta el nombre del op de cell history en el
 *  provider XML; SmartView lo genera internamente. Lo descubrimos probando.
 *
 *  Uso (todo por env, nunca hardcodear credenciales):
 *    NSPB_HOST=https://<pod>.pbcs.<dc>.oraclecloud.com \
 *    NSPB_USER=<usuario_readonly> NSPB_PASS=<pass> \
 *    NSPB_APP=NetSuite NSPB_CUBE=Plan \
 *    NSPB_CELL='Account=P_400000,Period=Jan,Years=FY26,Scenario=Actual,Version=Working,Entity=Total Entity' \
 *    node tools/probe-cell-history.js
 *
 *  Modo replay (si capturaste el XML real de un request de Change History,
 *  p.ej. desde DevTools Network del ad-hoc web o Fiddler en SmartView):
 *    NSPB_HOST=... NSPB_USER=... NSPB_PASS=... node tools/probe-cell-history.js --replay ./captura.xml
 *  (el script inyecta el <sID> vivo si el XML trae un placeholder <sID></sID>)
 *
 *  La celda (NSPB_CELL) debe ser una celda de DATA BASE que SEPAMOS que fue editada,
 *  con Data Audit habilitado en el tenant — si no, no hay historia que devolver.
 */

const fs = require("fs");

const HOST = (process.env.NSPB_HOST || "").replace(/\/+$/, "");
const USER = process.env.NSPB_USER || "";
const PASS = process.env.NSPB_PASS || "";
const APP  = process.env.NSPB_APP  || "NetSuite";
const CUBE = process.env.NSPB_CUBE || "Plan";
const CELL = process.env.NSPB_CELL || "";

const SV_ENDPOINT = "/interop/rest/smartview/HyperionPlanning/SmartView";

if (!HOST || !USER || !PASS) {
  console.error("Faltan credenciales. Seteá NSPB_HOST / NSPB_USER / NSPB_PASS (read-only).");
  process.exit(1);
}

const basicAuth = "Basic " + Buffer.from(`${USER}:${PASS}`).toString("base64");
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Parsea NSPB_CELL='Dim=Member,Dim=Member,...' → [{dim, member}]
function parseCell(s) {
  return s.split(",").map(p => p.trim()).filter(Boolean).map(p => {
    const i = p.indexOf("=");
    return { dim: p.slice(0, i).trim(), member: p.slice(i + 1).trim() };
  });
}

async function svPost(body) {
  const resp = await fetch(HOST + SV_ENDPOINT, {
    method: "POST",
    redirect: "manual",
    headers: {
      "Authorization": basicAuth,
      "Content-Type": "application/xml",
      "Accept": "application/xml",
    },
    body,
  });
  if (resp.status >= 300 && resp.status < 400) {
    throw new Error("Redirect — credenciales o host incorrectos (cookie auth no soportada).");
  }
  const text = await resp.text();
  return { status: resp.status, text };
}

// Construye el bloque de dimensiones de la celda en varias formas, porque no
// sabemos el shape exacto que espera el op. Probamos las variantes más comunes.
function dimBlockA(cell) {
  // <dimensions><dim name="Account">P_400000</dim>...</dimensions>
  return "<dimensions>" +
    cell.map(c => `<dim name="${esc(c.dim)}">${esc(c.member)}</dim>`).join("") +
    "</dimensions>";
}
function dimBlockB(cell) {
  // <pov><member dimension="Account" name="P_400000"/>...</pov>
  return "<pov>" +
    cell.map(c => `<member dimension="${esc(c.dim)}" name="${esc(c.member)}"/>`).join("") +
    "</pov>";
}

function candidates(sID, cube, cell) {
  const dA = dimBlockA(cell), dB = dimBlockB(cell);
  const head = (op, inner) => `<${op}><sID>${esc(sID)}</sID><cube>${esc(cube)}</cube>${inner}</${op}>`;
  const list = [];
  // Nombres candidatos siguiendo la convención req_* del provider.
  const ops = [
    "req_GetCellHistory", "req_CellHistory", "req_GetCellChangeHistory",
    "req_GetDataCellHistory", "req_EnumCellHistory", "req_GetCellInfo",
    "req_GetCellAudit", "req_GetCellDetails", "req_GetHistory", "req_ChangeHistory",
  ];
  for (const op of ops) {
    list.push({ label: `${op} (dimensions)`, xml: head(op, dA) });
    list.push({ label: `${op} (pov)`,         xml: head(op, dB) });
  }
  return list;
}

function looksLikeException(xml) {
  return /<res_Exception\b/i.test(xml);
}
function looksPromising(xml) {
  // Señales de que devolvió historia real de auditoría.
  return /(history|audit|oldValue|newValue|changedBy|modified|userName)/i.test(xml)
    && !looksLikeException(xml);
}

(async () => {
  console.log(`Host:  ${HOST}\nApp:   ${APP}\nCube:  ${CUBE}\nUser:  ${USER}\n`);

  // 1) Abrir app → sID  (lectura: solo establece sesión)
  console.log("→ req_OpenApplication …");
  const open = await svPost(`<req_OpenApplication><app>${esc(APP)}</app></req_OpenApplication>`);
  const m = open.text.match(/<sID>([\s\S]*?)<\/sID>/);
  if (!m) {
    console.error("✗ No vino <sID>. Respuesta cruda:\n" + open.text.slice(0, 800));
    process.exit(1);
  }
  const sID = m[1];
  console.log("✓ sID obtenido.\n");

  // Modo replay: postear un XML capturado tal cual (inyectando sID vivo)
  const ri = process.argv.indexOf("--replay");
  if (ri !== -1 && process.argv[ri + 1]) {
    let xml = fs.readFileSync(process.argv[ri + 1], "utf8");
    xml = xml.replace(/<sID>[\s\S]*?<\/sID>/, `<sID>${esc(sID)}</sID>`);
    console.log("→ REPLAY del XML capturado:\n" + xml.slice(0, 600) + "\n");
    const r = await svPost(xml);
    console.log(`status ${r.status}\n` + r.text.slice(0, 4000));
    return;
  }

  if (!CELL) {
    console.error("Faltó NSPB_CELL (la intersección de una celda editada). No puedo probar los ops.");
    process.exit(1);
  }
  const cell = parseCell(CELL);
  console.log("Celda a investigar: " + cell.map(c => `${c.dim}=${c.member}`).join(", ") + "\n");

  // 2) Probar cada op candidato (todas operaciones de lectura)
  const hits = [];
  for (const c of candidates(sID, CUBE, cell)) {
    let r;
    try { r = await svPost(c.xml); }
    catch (e) { console.log(`  ✗ ${c.label} — ${e.message}`); continue; }
    const status = looksPromising(r.text) ? "★ PROMISING"
      : looksLikeException(r.text) ? "exception" : "ok-but-empty?";
    // Mostrar SIEMPRE un snippet: el texto de la excepción nos dice si el op
    // "no existe / unknown command" (descartar) vs "existe pero parámetros
    // inválidos" (¡el op es bueno, solo hay que afinar el envelope!).
    const snip = r.text.replace(/\s+/g, " ").trim().slice(0, 220);
    console.log(`  [${status}] ${c.label}  (HTTP ${r.status})`);
    console.log(`      ↳ ${snip}`);
    if (status === "★ PROMISING") {
      hits.push(c.label);
      console.log("    ┌─ respuesta ─────────────────────────────");
      console.log("    " + r.text.slice(0, 1500).replace(/\n/g, "\n    "));
      console.log("    └─────────────────────────────────────────");
    }
  }

  console.log("\n" + (hits.length
    ? "✓ Candidatos prometedores: " + hits.join(", ")
    : "Ninguna variante devolvió historia. Próximo paso: capturar el request real " +
      "(DevTools Network del Change History en el ad-hoc web, o Fiddler en SmartView) " +
      "y correr con --replay."));
})().catch(e => { console.error("ERROR:", e.message); process.exit(1); });
