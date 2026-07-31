#!/usr/bin/env node
// import.mjs — upload a generated artifact and import it, via EPM Automate.
//
//   node bin/import.mjs <client> <file> --dimension <Dim> --job <ImportMetadataJob> [--yes]
//
// This is the ONLY step that touches the live pod, and it is deliberately manual:
// you review the generated CSV/XML first, then run this. Reads the pod + .epw from
// ~/.epm/clients.json (same profile the epm-planning-mcp wizard writes).
//
// Metadata import in Planning runs through an "Import Metadata" job — create one once
// in the pod UI (Application > Overview > Jobs) mapped to your dimension, then pass
// its name with --job.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const CONFIG = path.join(process.env.EPM_HOME || path.join(os.homedir(), ".epm"), "clients.json");
const EPM = process.env.EPM_AUTOMATE || "C:\\Program Files\\Oracle\\EPM Automate\\bin\\epmautomate.bat";
const die = (m) => { console.error("ERROR: " + m); process.exit(1); };

const [, , client, file, ...rest] = process.argv;
if (!client || !file) die("usage: node bin/import.mjs <client> <file> --job <ImportMetadataJob> [--yes]");
const flag = (n) => { const i = rest.indexOf("--" + n); return i >= 0 ? rest[i + 1] : undefined; };
const job = flag("job");
const yes = rest.includes("--yes");
if (!fs.existsSync(EPM)) die("EPM Automate not found at " + EPM + " (set EPM_AUTOMATE). This tool needs it.");
if (!fs.existsSync(CONFIG)) die("no " + CONFIG + " — run the epm-planning-mcp setup wizard first.");
if (!fs.existsSync(file)) die("file not found: " + file);
const c = JSON.parse(fs.readFileSync(CONFIG, "utf8"))[client];
if (!c) die(`client "${client}" not in ${CONFIG}`);
if (!job) die("--job <ImportMetadataJob> is required (create it once in the pod UI, mapped to your dimension).");

if (!yes) {
  console.log(`This will UPLOAD ${path.basename(file)} and run import job "${job}" on ${c.url}.`);
  console.log("Review the file first. Re-run with --yes to proceed.");
  process.exit(0);
}

function epm(args) {
  const line = '"' + [EPM, ...args].map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(" ") + '"';
  const r = spawnSync(process.env.COMSPEC || "cmd.exe", ["/d", "/s", "/c", line], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const out = (r.stdout || "") + (r.stderr || "");
  if (r.status !== 0) throw new Error(out.trim());
  return out;
}

const passfile = path.isAbsolute(c.passfile) ? c.passfile : path.join(path.dirname(CONFIG), c.passfile);
try {
  console.log("  login…"); epm(["login", c.user, passfile, c.url]);
  console.log("  deletefile (ignore if absent)…"); try { epm(["deletefile", path.basename(file)]); } catch {}
  console.log("  uploadfile…"); epm(["uploadfile", path.resolve(file)]);
  console.log("  importmetadata…"); console.log(epm(["importmetadata", job, path.basename(file)]));
  console.log("  refreshcube…"); console.log(epm(["refreshcube"]));
  console.log("✓ imported. Verify in the app, then run any dependent calc.");
} finally {
  try { epm(["logout"]); } catch {}
}
