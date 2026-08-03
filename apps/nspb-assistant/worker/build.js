/**
 * build.js — inline everything into a single bundle.js.
 *
 * Run `node build.js` and paste the generated `bundle.js` into the Cloudflare
 * dashboard → Workers & Pages → Create → Edit code. No wrangler, no npm,
 * no tooling required on the deploy side.
 *
 * The bundle inlines:
 *   - src/taskpane.html  as /taskpane.html
 *   - src/taskpane.css   as /taskpane.css
 *   - src/taskpane.js    as /taskpane.js
 *   - src/assets/*.png   as /assets/<name>
 * Keeps all the API logic from worker.js.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const HERE = __dirname;
// Monorepo layout — worker/ is top-level, add-in/src/ is its sibling.
const SRC = path.join(HERE, "..", "add-in", "src");

// ── PRE-BUILD SYNTAX CHECK ───────────────────────────────────────────
// Catch JS parse errors BEFORE we bundle and ship to Cloudflare. A
// syntax error in taskpane.js or worker.js previously deployed silently
// (the bundle was valid JS, but inside it Office.js / V8 failed to
// parse and the taskpane went blank). `node --check` parses without
// executing — fastest possible failure for these mistakes.
const SYNTAX_TARGETS = [
  path.join(HERE, "worker.js"),
  path.join(SRC, "taskpane.js"),
];
for (const f of SYNTAX_TARGETS) {
  if (!fs.existsSync(f)) continue;
  try {
    execSync(`node --check "${f}"`, { stdio: "pipe" });
  } catch (e) {
    console.error("\n❌ SYNTAX ERROR in", path.relative(HERE, f));
    console.error("─".repeat(60));
    process.stderr.write(e.stderr || e.stdout || String(e));
    console.error("─".repeat(60));
    console.error("Aborting build. Fix the syntax error and re-run.");
    process.exit(1);
  }
}
console.log("syntax check: OK");

// Cumulative version counter — bumps the MINOR by 1 on each successful build.
// MAJOR is pinned at 1 (client-facing "v1.x"). Stored in worker/.version
// (gitignored). The client sees the number change in the task-pane header
// after a deploy, so they know they picked up a fresh build at a glance.
const VERSION = (() => {
  const fs = require("fs");
  const path = require("path");
  const file = path.join(HERE, ".version");
  let n = 0;
  try { n = parseInt(fs.readFileSync(file, "utf8").trim(), 10) || 0; } catch (_) {}
  const v = `v1.${n}`;                                       // current counter (0 → v1.0)
  try { fs.writeFileSync(file, String(n + 1), "utf8"); } catch (_) {}  // bump for next build
  return v;
})();
console.log("version:", VERSION);

let html = fs.readFileSync(path.join(SRC, "taskpane.html"), "utf8");
// Overwrite the static version badge baked into the header with the live build
// counter. Targets the .app-version span (not the brand text) so renaming the
// product doesn't silently break injection again, and the static "v1.0" in the
// HTML stays as a sane fallback if this ever fails to match.
html = html.replace(
  /<span class="app-version">[^<]*<\/span>/,
  `<span class="app-version">${VERSION}</span>`
);
const css  = fs.readFileSync(path.join(SRC, "taskpane.css"),  "utf8");
const js   = fs.readFileSync(path.join(SRC, "taskpane.js"),   "utf8");

const iconDir = path.join(SRC, "assets");
const icons = {};
for (const name of fs.readdirSync(iconDir)) {
  if (/\.(png|jpe?g|svg|gif|webp)$/i.test(name)) {
    icons[name] = fs.readFileSync(path.join(iconDir, name)).toString("base64");
  }
}

const clientSource = fs.readFileSync(path.join(HERE, "clientNetsuite.js"), "utf8");
const workerSource = fs.readFileSync(path.join(HERE, "worker.js"), "utf8");
// Bundle the NSPB knowledge base (markdown).
let kbRaw = "";
try {
  kbRaw = fs.readFileSync(path.join(HERE, "kb.md"), "utf8");
} catch (e) { /* optional */ }
const kb = kbRaw.replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\n{3,}/g, "\n\n");

// Bundle the tenant knowledge base (LCM-parsed JSON).
// We embed only forms + rules + fdmee + substitutionVariables — skip raw
// dimension members (already available via the catalog in appConfig).
let tenantKb = null;
{
  // ── New folder structure (C:\NSPB_MCP\clients\<name>\tenant-kb.json) ──
  // Pick which client KB to embed via the CLIENT env var:
  //   CLIENT=demo  node build.js   → embeds clients\demo\tenant-kb.json
  //   CLIENT=acme  node build.js   → embeds clients\acme\tenant-kb.json
  // Default is "demo" — the bundle always ships with a working sample so
  // the plugin runs out of the box. Real clients will import their own
  // tenant-kb.json via Settings (delivered to them by email).
  const clientName = (process.env.CLIENT || "demo").trim();
  // Monorepo: project root is one level up from worker/. clients/ live there.
  const projectRoot = path.join(HERE, "..");
  const candidates = [
    // Preferred: monorepo — <root>/clients/<name>/tenant-kb.json
    path.join(projectRoot, "clients", clientName, "tenant-kb.json"),
    // Legacy fallbacks (pre-monorepo, in case CI/other box still has them)
    path.join("C:", "NSPB_MCP", "clients", clientName, "tenant-kb.json"),
    path.join(projectRoot, "tenant-kb.json"),
    path.join(projectRoot, "archive", "demo_tenant-kb.json"),
  ];
  let loaded = null, loadedFrom = null;
  for (const p of candidates) {
    try {
      const raw = JSON.parse(fs.readFileSync(p, "utf8"));
      loaded = raw; loadedFrom = p;
      break;
    } catch (_) {}
  }
  if (loaded) {
    tenantKb = {
      generatedAt: loaded.generatedAt,
      appName: loaded.appName || null,
      client: loaded.client || null,
      forms: loaded.forms,
      rules: loaded.rules,
      rulesets: loaded.rulesets || [],
      substitutionVariables: loaded.substitutionVariables,
      fdmee: loaded.fdmee,
      navigationFlows: loaded.navigationFlows || []
    };
    const sz = Math.round(JSON.stringify(tenantKb).length / 1024);
    console.log(`tenant KB embedded from ${loadedFrom} (${sz} KB — dims omitted)`);
  } else {
    console.warn(`tenant KB not found — tried:\n  ${candidates.join("\n  ")}\nTenant-specific knowledge disabled.`);
  }
}
// Strip the existing `export default { ... }` block at the end — we replace
// the fetch handler with one that serves embedded assets instead of env.ASSETS.
const beforeExport = workerSource.split(/\bexport\s+default\b/)[0].trimEnd();

const bundle = `// ── clientNetsuite.js (concatenated by build.js) ────────────────────────────
${clientSource.trimEnd()}

${beforeExport}

// ── Inlined static assets (generated by build.js — do not hand-edit) ─────────
const EMBED_HTML = ${JSON.stringify(html)};
const EMBED_CSS  = ${JSON.stringify(css)};
const EMBED_JS   = ${JSON.stringify(js)};
const EMBED_ICONS = ${JSON.stringify(icons)};
const EMBED_KB    = ${JSON.stringify(kb)};
const EMBED_TENANT_KB = ${JSON.stringify(tenantKb)};

function b64ToBytes(b64) {
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function serveEmbed(pathname) {
  if (pathname === "/" || pathname === "/taskpane.html") {
    return new Response(EMBED_HTML, {
      headers: { "Content-Type": "text/html; charset=utf-8", ...CORS_HEADERS }
    });
  }
  if (pathname === "/taskpane.css") {
    return new Response(EMBED_CSS, {
      headers: { "Content-Type": "text/css; charset=utf-8", ...CORS_HEADERS }
    });
  }
  if (pathname === "/taskpane.js") {
    return new Response(EMBED_JS, {
      headers: { "Content-Type": "application/javascript; charset=utf-8", ...CORS_HEADERS }
    });
  }
  const iconMatch = pathname.match(/^\\/assets\\/([A-Za-z0-9._-]+\\.(?:png|jpe?g|svg|gif|webp))$/i);
  if (iconMatch && EMBED_ICONS[iconMatch[1]]) {
    const ext = iconMatch[1].split(".").pop().toLowerCase();
    const mime = { png:"image/png", jpg:"image/jpeg", jpeg:"image/jpeg", svg:"image/svg+xml", gif:"image/gif", webp:"image/webp" }[ext] || "application/octet-stream";
    return new Response(b64ToBytes(EMBED_ICONS[iconMatch[1]]), { headers: { "Content-Type": mime } });
  }
  return new Response("Not found", { status: 404 });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) return handleApi(request, env, ctx);
    return serveEmbed(url.pathname);
  }
};
`;

const outPath = path.join(HERE, "bundle.js");
fs.writeFileSync(outPath, bundle, "utf8");
console.log("wrote " + outPath + " (" + Math.round(bundle.length / 1024) + " KB)");
