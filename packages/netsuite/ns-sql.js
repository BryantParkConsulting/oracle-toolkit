#!/usr/bin/env node
/**
 * ns-sql.js — corre una consulta SuiteQL ad-hoc contra la cuenta configurada.
 * Reusa el firmante TBA de netsuite-export.js. Read-only por naturaleza (SuiteQL
 * no muta), pensado para exploración y para alimentar los pipelines de KB.
 *
 *   node tools/ns-sql.js "SELECT ..."            → tabla en consola
 *   node tools/ns-sql.js "SELECT ..." --json     → JSON crudo
 *   node tools/ns-sql.js --probe t1,t2,t3        → ¿existe cada tabla? ¿cuántas filas?
 *   node tools/ns-sql.js "SELECT ..." --out=x.json
 */
const fs = require("fs");
const path = require("path");

(function loadDotEnv() {
  const p = path.join(__dirname, "..", "..", ".env");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
})();

const need = ["NS_ACCOUNT", "NS_CONSUMER_KEY", "NS_CONSUMER_SECRET", "NS_TOKEN_ID", "NS_TOKEN_SECRET"].filter(k => !process.env[k]);
if (need.length) { console.error(`Faltan credenciales: ${need.join(", ")}`); process.exit(1); }

const ACCT = String(process.env.NS_ACCOUNT).toLowerCase().replace(/_/g, "-");
const HOST = `https://${ACCT}.suitetalk.api.netsuite.com`;
const enc = s => encodeURIComponent(s).replace(/[!*'()]/g, c => "%" + c.charCodeAt(0).toString(16).toUpperCase());

async function oauthHeader(method, url) {
  const nonce = crypto.randomUUID().replace(/-/g, "");
  const ts = String(Math.floor(Date.now() / 1000));
  const p = { oauth_consumer_key: process.env.NS_CONSUMER_KEY, oauth_token: process.env.NS_TOKEN_ID,
    oauth_signature_method: "HMAC-SHA256", oauth_timestamp: ts, oauth_nonce: nonce, oauth_version: "1.0" };
  const u = new URL(url);
  const all = [...Object.entries(p), ...u.searchParams.entries()].map(([k, v]) => [enc(k), enc(v)])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : 1));
  const base = [method.toUpperCase(), enc(u.origin + u.pathname), enc(all.map(([k, v]) => `${k}=${v}`).join("&"))].join("&");
  const key = new TextEncoder().encode(`${enc(process.env.NS_CONSUMER_SECRET)}&${enc(process.env.NS_TOKEN_SECRET)}`);
  const ck = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", ck, new TextEncoder().encode(base));
  const realm = String(process.env.NS_ACCOUNT).toUpperCase().replace(/-/g, "_");
  return `OAuth realm="${realm}", oauth_consumer_key="${enc(p.oauth_consumer_key)}", oauth_token="${enc(p.oauth_token)}", ` +
    `oauth_signature_method="HMAC-SHA256", oauth_timestamp="${ts}", oauth_nonce="${nonce}", oauth_version="1.0", ` +
    `oauth_signature="${enc(Buffer.from(new Uint8Array(sig)).toString("base64"))}"`;
}

async function page(sql, limit = 1000, offset = 0) {
  const url = `${HOST}/services/rest/query/v1/suiteql?limit=${limit}&offset=${offset}`;
  const r = await fetch(url, { method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "transient", Authorization: await oauthHeader("POST", url) },
    body: JSON.stringify({ q: sql }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(j["o:errorDetails"]?.[0]?.detail || j.title || JSON.stringify(j).slice(0, 200)); e.status = r.status; throw e; }
  return j;
}

async function all(sql, cap = 50000) {
  const out = [];
  for (let off = 0; off < cap; off += 1000) {
    const j = await page(sql, 1000, off);
    out.push(...(j.items || []));
    if (!j.hasMore || !(j.items || []).length) break;
  }
  return out;
}

module.exports = { suiteql: all, suiteqlPage: page };

if (require.main === module) (async () => {
  const args = process.argv.slice(2);
  const probe = args.find(a => a.startsWith("--probe"));
  const outFile = (args.find(a => a.startsWith("--out=")) || "").slice(6);

  if (probe) {
    const tables = (probe.includes("=") ? probe.split("=")[1] : args[args.indexOf(probe) + 1] || "").split(",").map(s => s.trim()).filter(Boolean);
    for (const t of tables) {
      try { const j = await page(`SELECT COUNT(*) AS n FROM ${t}`); console.log(`  ✓ ${t.padEnd(32)} ${j.items[0]?.n}`); }
      catch (e) { console.log(`  · ${t.padEnd(32)} ${String(e.message).slice(0, 70)}`); }
    }
    return;
  }

  const sql = args.find(a => !a.startsWith("--"));
  if (!sql) { console.error("Falta la consulta. Ver el encabezado del archivo."); process.exit(1); }
  const rows = await all(sql);
  if (outFile) { fs.writeFileSync(outFile, JSON.stringify(rows, null, 2)); console.log(`→ ${outFile} (${rows.length} filas)`); return; }
  if (args.includes("--json")) { console.log(JSON.stringify(rows, null, 2)); return; }
  if (!rows.length) { console.log("(sin filas)"); return; }
  const cols = Object.keys(rows[0]).filter(c => c !== "links");
  const w = Object.fromEntries(cols.map(c => [c, Math.min(42, Math.max(c.length, ...rows.slice(0, 200).map(r => String(r[c] ?? "").length)))]));
  console.log(cols.map(c => c.toUpperCase().padEnd(w[c])).join("  "));
  for (const r of rows.slice(0, 300)) console.log(cols.map(c => String(r[c] ?? "").slice(0, w[c]).padEnd(w[c])).join("  "));
  if (rows.length > 300) console.log(`… (${rows.length} filas en total)`);
})().catch(e => { console.error("FALLÓ:", e.message); process.exit(1); });
