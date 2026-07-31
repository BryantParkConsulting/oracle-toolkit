#!/usr/bin/env node
// EPM Planning MCP — interactive onboarding wizard.
//   npm run setup
//
// Walks a first-time user through everything, asking one thing at a time:
//   1. pod URL, application, username
//   2. a local password file (masked prompt) — never a chat, never an argument
//   3. (optional) download the ARTIFACT-ONLY snapshot via EPM Automate and parse it
//      into a compact tenant-kb.json — this is what lets Claude understand the whole
//      environment cheaply (metadata only, no Essbase data, token-efficient)
//   4. prints the exact `claude mcp add` command to register the server
//
// Nothing here is destructive. Secrets go to files under a home directory that the
// wizard prints, never into the repo.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { spawnSync } from "node:child_process";

const HOME = process.env.EPM_HOME || path.join(os.homedir(), ".epm");
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, "$1"), "..");
const C = { reset: "\x1b[0m", b: "\x1b[1m", cyan: "\x1b[36m", green: "\x1b[32m", yellow: "\x1b[33m", dim: "\x1b[2m" };
const say = (s = "") => console.log(s);
const head = (s) => say(`\n${C.b}${C.cyan}${s}${C.reset}`);

function rl() { return readline.createInterface({ input: process.stdin, output: process.stdout }); }
function ask(q, dflt) {
  const r = rl();
  return new Promise((res) => r.question(`${q}${dflt ? ` ${C.dim}[${dflt}]${C.reset}` : ""}: `, (a) => { r.close(); res((a || dflt || "").trim()); }));
}
function askSecret(q) {
  return new Promise((res) => {
    const r = rl();
    process.stdout.write(`${q}: `);
    r.stdoutMuted = true;
    r._writeToOutput = () => {};
    r.question("", (a) => { r.close(); process.stdout.write("\n"); res(a); });
  });
}
function yes(q, dflt = "y") { return ask(`${q} (y/n)`, dflt).then((a) => /^y/i.test(a)); }

function epmAutomate() {
  const p = process.env.EPM_AUTOMATE || "C:\\Program Files\\Oracle\\EPM Automate\\bin\\epmautomate.bat";
  return fs.existsSync(p) ? p : null;
}
function runEpm(bat, args) {
  // .bat via cmd.exe (Node refuses to spawn .bat directly)
  const line = '"' + [bat, ...args].map((a) => (/[\s]/.test(a) ? `"${a}"` : a)).join(" ") + '"';
  const r = spawnSync(process.env.COMSPEC || "cmd.exe", ["/d", "/s", "/c", line], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return { ok: r.status === 0, out: (r.stdout || "") + (r.stderr || "") };
}

async function main() {
  head("EPM Planning MCP — setup");
  say("This asks a few questions and sets everything up. Nothing is sent anywhere but your own Oracle pod.");
  fs.mkdirSync(HOME, { recursive: true });

  // ---- 1. connection ----
  head("1) Your Oracle Planning pod");
  const client = (await ask("A short name for this client/env", "myclient")).replace(/\s+/g, "").toLowerCase();
  let url = await ask("Pod URL (the part up to .oraclecloud.com)", "https://<pod>.epm.<dc>.ocs.oraclecloud.com");
  url = url.replace(/\/+$/, "");
  const app = await ask("Application name", "NetSuite");
  const user = await ask("Username (the email you log in with)");

  const cfgPath = path.join(HOME, "clients.json");
  const cfg = fs.existsSync(cfgPath) ? JSON.parse(fs.readFileSync(cfgPath, "utf8")) : {};
  cfg[client] = { url, user, passfile: `${client}.epw`, app };
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
  say(`${C.green}✓${C.reset} wrote ${cfgPath} (no password in it)`);

  // ---- 2. password ----
  head("2) Password (stored locally, never in the repo or the chat)");
  const bat = epmAutomate();
  if (bat && (await yes("EPM Automate is installed — encrypt the password into a .epw now?"))) {
    const pw = await askSecret("Password");
    const key = (await ask("Any encryption key (remember it if you re-encrypt later)", "epmkey")) || "epmkey";
    const epw = path.join(HOME, `${client}.epw`);
    const r = runEpm(bat, ["encrypt", pw, key, epw]);
    say(r.ok ? `${C.green}✓${C.reset} ${epw}` : `${C.yellow}!${C.reset} encrypt failed:\n${r.out.slice(0, 300)}`);
  } else {
    const pw = await askSecret("Password (kept in a plain, git-ignored file)");
    const pf = path.join(HOME, `${client}.pass`);
    fs.writeFileSync(pf, pw);
    cfg[client].passfile = `${client}.pass`;
    fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
    say(`${C.green}✓${C.reset} ${pf}`);
  }

  // ---- 3. environment snapshot (metadata only) ----
  head("3) Understand the environment — download an ARTIFACT-ONLY snapshot");
  say("Claude reads a compact tenant-kb.json (forms, rules, dimensions) instead of querying");
  say("everything live — that is far cheaper on tokens. We want metadata only, NOT Essbase data.");
  let kbPath = "";
  if (!bat) {
    say(`${C.yellow}!${C.reset} EPM Automate not found. Two options:`);
    say("   • Install it from your pod's Downloads page, then re-run this wizard, OR");
    say("   • In the pod UI: Tools → Migration, untick 'Essbase Data', export, download the ZIP, extract it.");
    const dir = await ask("If you already extracted a snapshot, its folder (blank to skip)");
    if (dir) kbPath = await parseKb(dir, client);
  } else if (await yes("Download and parse the artifact-only snapshot now?")) {
    say("   In the pod once: Tools → Migration → untick 'Essbase Data' → Save the definition under a name.");
    const snap = await ask("The saved snapshot definition name", "Artifact Snapshot");
    say(`${C.dim}   logging in…${C.reset}`);
    runEpm(bat, ["login", user, path.join(HOME, cfg[client].passfile), url]);
    const ex = runEpm(bat, ["exportsnapshot", snap]);
    say(ex.ok ? `${C.green}✓${C.reset} exported` : `${C.yellow}!${C.reset} ${ex.out.slice(0, 200)}`);
    runEpm(bat, ["downloadfile", `${snap}.zip`]);
    runEpm(bat, ["logout"]);
    say(`   downloaded to C:\\ProgramData\\Oracle\\EPM Automate\\${snap}.zip — extract it, then:`);
    const dir = await ask("Extracted folder (blank to do later)");
    if (dir) kbPath = await parseKb(dir, client);
  }

  // ---- 4. register in Claude Code ----
  head("4) Register the MCP in Claude Code");
  const kbArg = kbPath ? ` --env ORACLE_EPM_KB_PATH=${kbPath}` : "";
  const idx = path.join(REPO, "src", "index.js").replace(/\\/g, "/");
  say("Run this (KB-only, no live credentials needed to explore the environment):\n");
  say(`${C.b}claude mcp add --scope user epm-planning${kbArg} -- node ${idx}${C.reset}`);
  say("\nTo also allow live data reads, add your pod env when you register, e.g.:");
  say(`${C.dim}  --env ORACLE_EPM_BASE_URL=${url} --env ORACLE_EPM_USERNAME=${user} --env ORACLE_EPM_APPLICATION=${app}${C.reset}`);
  say(`${C.dim}  (inject ORACLE_EPM_PASSWORD from your OS credential store, not here)${C.reset}`);

  head("You're set. This MCP lets you:");
  say(`   ${C.green}•${C.reset} Understand the environment — forms, rules, dimensions, variables`);
  say(`   ${C.green}•${C.reset} Query live data — any account, period, scenario, department`);
  say(`   ${C.green}•${C.reset} Upload data into a cube`);
  say(`   ${C.green}•${C.reset} Run existing business rules (calculations, aggregations)`);
  say(`   ${C.dim}Creating new objects (forms, rules) is out of scope for this server.${C.reset}`);

  head("Try it in Claude");
  say("   • \"What forms and business rules does this application have?\"");
  say("   • \"Show me the FY25 income statement — Income, Gross Profit, Net Income.\"");
  say("   • \"Load this salary spreadsheet into the Workforce cube.\"");
  say("   • \"Run the aggregation rule and show me the new totals.\"");
  say(`\n${C.green}Done.${C.reset}\n`);
}

async function parseKb(dir, client) {
  const out = path.join(HOME, `${client}-tenant-kb.json`);
  say(`${C.dim}   parsing LCM → ${out}${C.reset}`);
  const r = spawnSync(process.execPath, [path.join(REPO, "src", "lcm-cli.js"), dir, out], { encoding: "utf8" });
  if (r.status === 0) { say(`${C.green}✓${C.reset} ${out}`); return out; }
  say(`${C.yellow}!${C.reset} parse failed: ${(r.stderr || r.stdout || "").slice(0, 200)}`);
  return "";
}

main().catch((e) => { console.error("\nsetup error:", e.message); process.exit(1); });
