/* NSPB Excel task pane — chat UI + Excel grid writer.
 *
 * Talks to its own origin (the Cloudflare Worker that serves this page)
 * at /api/health, /api/test-connection, /api/chat. All keys — Gemini +
 * NSPB — live in OfficeRuntime.storage on the client side and travel
 * with each request. Worker is stateless.
 */
"use strict";

const API = "";  // same origin — the Worker serves both the HTML and /api/*.

// Prefilled with the Oracle EPM demo pod (MCP2 README) + the shared free-tier
// Gemini API key from MCP3/google_sheets_addon/Code.gs:41. Users can overwrite
// both from the Settings modal.
const DEMO_SETTINGS = {
  host: "https://nspb-amedel012015.epm.ca-montreal-1.ocs.oraclecloud.com",
  username: "",
  password: "",
  appName: "NetSuite",
  geminiKey: "AIzaSyDkHHXV7L_Y-elF0aG-VX0wI475yASh3zE"
};

// Detect AI provider from a stored API key.
// Gemini keys start with "AIza" (~39 chars). Claude keys start with "sk-ant-" (~108 chars).
function detectAiProvider(key) {
  const k = String(key || "").trim();
  if (!k) return "none";
  if (/^AIza[A-Za-z0-9_-]{20,}$/.test(k)) return "gemini";
  if (/^sk-ant-/.test(k)) return "claude";
  return "unknown";
}

const STORAGE_KEY    = "nspb-addin.settings.v3";
const CHAT_HIST_KEY  = "nspb-addin.chatHistory.v1";   // persisted chat (last 1 day)
const CHAT_HIST_DAYS = 1;                              // bumped down from 5 → users wanted short retention
const CHAT_HIST_MAX  = 200;                            // hard cap on entries
const CATALOG_KEY    = "nspb-addin.catalog.v1";
const GRID_KEY       = "nspb-addin.lastGrid.v1";
const GRID_REG_KEY   = "nspb-addin.gridRegistry.v1";   // sheetName → descriptor (per-sheet grid memory)
const RULES_KEY      = "nspb-addin.rules.v1";
const FORMS_KEY      = "nspb-addin.forms.v1";
const VARS_KEY       = "nspb-addin.vars.v1";
const JOBS_KEY       = "nspb-addin.jobs.v1";
const INTEG_KEY      = "nspb-addin.integ.v1";
const APPS_KEY       = "nspb-addin.apps.v1";
const APP_CONFIG_KEY      = "nspb-addin.appConfig.v1";
const TENANT_KB_KEY       = "nspb-addin.tenantKb.v1";
const CURRENCIES_KEY      = "nspb-addin.currencies.v1";
const VERSIONS_KEY        = "nspb-addin.versions.v1";
const DM_CATEGORIES_KEY   = "nspb-addin.dmcategories.v1";
const LOCATIONS_KEY       = "nspb-addin.locations.v1";
const PERIOD_MAP_V1_KEY   = "nspb-addin.periodmapsv1.v1";
// NAV_KEY + PERIOD_MAP_KEY were removed — those endpoints (/flows/2/nodes,
// /periodmapping/global) require NSPB UI session auth (Basic Auth gives 401)
// so the buttons were hidden. The chat command "show navigation" / "show
// period mappings" still works and renders an explainer sheet.
const history = [];
const els = {};

// ───────────── Debug log buffer ─────────────
// Captures the last N command exchanges (cmd, request, SQL, response, error)
// so the user can run `debug last` or `debug all` and paste a clean trace
// back to support without manual copy/paste of error text.
const DEBUG_LOG_MAX = 20;
window.__nspbDebugLog = [];
function logDebug(entry) {
  const e = { ts: new Date().toISOString(), ...entry };
  window.__nspbDebugLog.push(e);
  if (window.__nspbDebugLog.length > DEBUG_LOG_MAX) window.__nspbDebugLog.shift();
  try { console.log("[NSPB_DEBUG]", e); } catch (_) {}
  // Fire-and-forget mirror to worker so logs show up in `wrangler tail`
  // (lets support watch live during long ops). Use the unwrapped fetch to avoid
  // recursion through the fetch wrapper that itself logs.
  try {
    const origFetch = (window.__origFetchUnwrapped || window.fetch).bind(window);
    origFetch(API + "/api/debug-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: "taskpane", entry: e })
    }).catch(() => {});
  } catch (_) {}
}
// Wrap window.fetch so every /api/* call is automatically logged with
// {endpoint, method, body summary, status, response summary, duration, error}.
// Bodies are truncated to keep entries small. Runs once on load.
(function installFetchLogger() {
  if (window.__nspbFetchWrapped) return;
  window.__nspbFetchWrapped = true;
  const origFetch = window.fetch.bind(window);
  window.__origFetchUnwrapped = origFetch;   // logDebug uses this to avoid recursion
  const trunc = (s, n = 800) => {
    if (s == null) return s;
    const str = typeof s === "string" ? s : (() => { try { return JSON.stringify(s); } catch (_) { return String(s); } })();
    return str.length > n ? str.slice(0, n) + `…[+${str.length - n} chars]` : str;
  };
  const redact = (body) => {
    try {
      const o = typeof body === "string" ? JSON.parse(body) : body;
      if (o && typeof o === "object") {
        const c = { ...o };
        ["password", "geminiKey", "apiKey", "key"].forEach(k => { if (k in c) c[k] = "***"; });
        return c;
      }
    } catch (_) {}
    return body;
  };
  window.fetch = async function(input, init) {
    const url = typeof input === "string" ? input : (input && input.url) || "";
    const isApi = /\/api\//.test(url);
    // Skip our own debug-log endpoint to avoid recursion (logDebug → fetch wrapper → logDebug)
    if (!isApi || /\/api\/debug-log\b/.test(url)) return origFetch(input, init);
    const t0 = Date.now();
    const method = (init && init.method) || "GET";
    const reqBody = init && init.body ? trunc(redact(init.body)) : null;
    try {
      const resp = await origFetch(input, init);
      const cloned = resp.clone();
      let respBody = null;
      try { respBody = trunc(await cloned.text(), 1500); } catch (_) {}
      logDebug({
        cmd: "fetch",
        endpoint: url.replace(/^https?:\/\/[^/]+/, ""),
        method,
        status: resp.status,
        durationMs: Date.now() - t0,
        request: reqBody,
        response: respBody
      });
      return resp;
    } catch (e) {
      logDebug({
        cmd: "fetch",
        endpoint: url.replace(/^https?:\/\/[^/]+/, ""),
        method,
        durationMs: Date.now() - t0,
        request: reqBody,
        error: e.message || String(e)
      });
      throw e;
    }
  };
})();

function formatDebugEntry(e) {
  const safe = (v) => {
    if (typeof v === "bigint") return Number(v);
    if (Array.isArray(v)) return v.map(safe);
    if (v && typeof v === "object") {
      const o = {}; for (const k in v) o[k] = safe(v[k]); return o;
    }
    return v;
  };
  return JSON.stringify(safe(e), null, 2);
}

// ───────────── NSPB_DB: in-browser DuckDB-WASM helper ─────────────
// Goal: load active-sheet data into a local OLAP DB so we can run SQL
// against 140k-row exports without ever shipping the rows to Gemini.
// Gemini only sees a schema summary + the user's question, returns SQL,
// the browser executes it locally. Keeps token cost flat (~500-1000/q).
//
// Roadmap (anotado):
//  1) (current) Load active sheet → table. Pure SQL playground.
//  2) (next)    Client gives us THEIR raw planilla (no NSPB format, no
//               real member names). DuckDB + LLM map their columns to
//               real NSPB dimension members → emit NSPB-shaped output.
const NSPB_DB = (() => {
  let connPromise = null;
  async function conn() {
    if (connPromise) return connPromise;
    connPromise = (async () => {
      if (!window.__duckdb_ready) throw new Error("DuckDB CDN script not loaded");
      const db = await window.__duckdb_ready;
      return await db.connect();
    })();
    return connPromise;
  }
  function sanitizeIdent(s) {
    return String(s || "").trim().replace(/[^A-Za-z0-9_]/g, "_").replace(/^(\d)/, "_$1") || "col";
  }
  async function load(name, rows) {
    if (!Array.isArray(rows) || rows.length === 0) throw new Error("rows is empty");
    const c = await conn();
    const table = sanitizeIdent(name);
    const headers = Object.keys(rows[0]).map(sanitizeIdent);
    await c.query(`DROP TABLE IF EXISTS "${table}"`);
    // Let DuckDB infer types via a JSON staging.
    const json = JSON.stringify(rows.map(r => {
      const o = {};
      Object.keys(r).forEach((k, i) => { o[headers[i]] = r[k]; });
      return o;
    }));
    const db = await window.__duckdb_ready;
    await db.registerFileText(`${table}.json`, json);
    await c.query(`CREATE TABLE "${table}" AS SELECT * FROM read_json_auto('${table}.json')`);
    const cnt = await query(`SELECT COUNT(*) AS n FROM "${table}"`);
    return { table, rows: cnt[0]?.n ?? rows.length, columns: headers };
  }
  async function query(sql) {
    const c = await conn();
    const r = await c.query(sql);
    return r.toArray().map(row => row.toJSON());
  }
  async function listTables() {
    return await query("SELECT table_name FROM information_schema.tables WHERE table_schema='main'");
  }
  async function dropTable(name) {
    const c = await conn();
    await c.query(`DROP TABLE IF EXISTS "${sanitizeIdent(name)}"`);
  }
  async function schemaSummary() {
    const cols = await query(
      "SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema='main' ORDER BY table_name, ordinal_position"
    );
    const counts = await query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='main'"
    );
    const out = [];
    for (const t of counts) {
      const tcols = cols.filter(c => c.table_name === t.table_name);
      const tcolsStr = tcols.map(c => `${c.column_name} ${c.data_type}`).join(", ");
      const n = await query(`SELECT COUNT(*) AS n FROM "${t.table_name}"`);
      out.push(`${t.table_name}(${tcolsStr}) — ${n[0].n} rows`);
      // For low-cardinality VARCHAR columns, include distinct value samples
      // so Gemini knows what filters to use (Tracker='Load', Scenario='Actual', etc.)
      for (const c of tcols) {
        if (!/VARCHAR/i.test(c.data_type)) continue;
        try {
          const distinct = await query(
            `SELECT DISTINCT "${c.column_name}" AS v FROM "${t.table_name}" WHERE "${c.column_name}" IS NOT NULL AND "${c.column_name}" != '' LIMIT 25`
          );
          if (distinct.length > 0 && distinct.length <= 20) {
            const vals = distinct.map(d => `'${String(d.v).replace(/'/g, "''")}'`).join(", ");
            out.push(`  ${c.column_name} values: [${vals}]`);
          }
        } catch (_) {}
      }
    }
    return out.join("\n");
  }
  return { load, query, listTables, dropTable, schemaSummary };
})();
window.NSPB_DB = NSPB_DB;

document.addEventListener("DOMContentLoaded", init);

async function init() {
  cacheElements();
  bindEvents();

  // ── CRITICAL: render welcome + tip BEFORE any async work ──────────────
  // The user sees a blank chat if init() throws or hangs on a network call
  // (refreshHealth, KB fetch, etc) BEFORE we hit the welcome-message line.
  // Render the basics IMMEDIATELY so the panel is never empty even if
  // downstream init steps fail. Also restore the persisted chat from
  // localStorage (last CHAT_HIST_DAYS days) so the user sees previous
  // turns when they reopen Excel or refresh the task pane.
  try {
    if (els.messages && els.messages.children.length === 0) {
      const persisted = loadPersistedChat();
      if (persisted.length) {
        for (const m of persisted) addMsg(m.role, m.text, { skipPersist: true });
      } else {
        addMsg("assistant", "How can I help?");
      }
    }
    try { sessionStorage.removeItem("nspb-tips-dismissed"); } catch (_) {}
    _tipDismissed = false;
    const tipRoot = document.getElementById("tip-rotator");
    if (tipRoot) tipRoot.classList.remove("hidden");
    try { startTipRotator(); } catch (_) {}
  } catch (e) { console.error("[NSPB] early welcome/tip failed:", e); }

  // Always-on watchdog — re-asserts welcome+tip every 2s so even if the
  // Office iframe reuses across sessions, the panel re-paints itself.
  // Started up FRONT so it's not gated on async init completion.
  try {
    setInterval(() => {
      try {
        const msgs = document.getElementById("messages");
        const tipRoot = document.getElementById("tip-rotator");
        if (!msgs) return;
        els.messages = msgs;
        const dismissedNow = sessionStorage.getItem("nspb-tips-dismissed") === "1";
        if (msgs.children.length === 0) {
          const persisted = loadPersistedChat();
          if (persisted.length) {
            for (const m of persisted) addMsg(m.role, m.text, { skipPersist: true });
          } else {
            addMsg("assistant", "How can I help?");
          }
        }
        if (tipRoot && tipRoot.classList.contains("hidden") && !dismissedNow) {
          _tipDismissed = false;
          try { startTipRotator(); } catch (_) {}
        }
      } catch (_) {}
    }, 2000);
  } catch (_) {}

  // Enable Send early too — same reasoning, don't gate on the network.
  if (els.send) els.send.disabled = false;

  // CRITICAL: await Office.onReady BEFORE loadSettings(). The hidden-sheet
  // 4th-tier storage uses Excel.run which only works after Office is ready.
  // Without this await, _sheetReadAll silently returns {} and the user sees
  // empty settings every time the iframe is recreated (e.g. after closing
  // and re-opening the taskpane within the same Excel session).
  try { await Office.onReady(); } catch (_) {}
  // Now safe to widen the pane and load settings (hidden sheet is reachable).
  try {
    if (Office.context && typeof Office.context.requestWindowSize === "function") {
      Office.context.requestWindowSize(384, 0);
    } else if (typeof Office.addin !== "undefined" && Office.addin.requestWindowSize) {
      Office.addin.requestWindowSize(384, 0);
    }
  } catch (_) {}

  const saved = await loadSettings();
  // FIRST-RUN: if nothing is saved, leave settings EMPTY (not DEMO). Showing
  // demo values pre-populated in the form fooled users into thinking they
  // already had real settings, then on reload password (always empty in
  // DEMO) appeared "wiped". Demo is now a click-to-fill helper, never auto.
  window.NSPB_SETTINGS = saved || {};

  // Recovery watchdog: every 4s, if settings look empty BUT the hidden
  // sheet has data, recover from the sheet. Catches the iframe-reuse case
  // where Office tore down + recreated the iframe without firing init's
  // Excel.run readiness, leaving us empty even though sheet has the data.
  setInterval(async () => {
    try {
      const cur = window.NSPB_SETTINGS || {};
      if (cur.host && cur.geminiKey) return;   // we already have settings
      const all = await _sheetReadAll();
      const sheetSettings = all && all[STORAGE_KEY];
      if (sheetSettings && sheetSettings.host && sheetSettings.geminiKey) {
        window.NSPB_SETTINGS = sheetSettings;
        // Re-hydrate the lower tiers so subsequent reads are fast.
        try { await saveJson(STORAGE_KEY, sheetSettings); } catch (_) {}
        const tk = all[TENANT_KB_KEY];
        if (tk && Array.isArray(tk.forms)) {
          window.NSPB_TENANT_KB = tk;
          try { await saveJson(TENANT_KB_KEY, tk); } catch (_) {}
        }
        const ac = all[APP_CONFIG_KEY];
        if (ac) {
          window.NSPB_APPCONFIG = ac;
          try { await saveJson(APP_CONFIG_KEY, ac); } catch (_) {}
        }
        console.info("[NSPB] Settings recovered from hidden sheet.");
      }
    } catch (_) {}
  }, 4000);
  // Pre-load tenant KB into window so the slash-command palette can use it
  // immediately (no async hit on first "/" keystroke).
  loadJson(TENANT_KB_KEY).then(async kb => {
    // Treat empty objects as missing — `{}` is the failure mode where storage
    // got corrupted but isn't null. Forces the worker fallback below.
    const looksValid = kb && typeof kb === "object" && (Array.isArray(kb.forms) && kb.forms.length > 0);
    if (looksValid) {
      window.NSPB_TENANT_KB = kb;
      return;
    }
    // ── Fallback: pull the bundle-embedded tenant KB from the worker ─────
    // This guarantees the plugin always has a working forms list, even if
    // localStorage was wiped (Office Wef cache reset, accidental Clear-all,
    // failed import). The user can override with their own via Settings →
    // Import; this is just the fallback so they're never stuck with 0 forms.
    try {
      const r = await fetch(API + "/api/tenant-kb-embedded");
      const d = await r.json();
      if (d && d.ok && d.kb && Array.isArray(d.kb.forms)) {
        window.NSPB_TENANT_KB = d.kb;
        // Persist locally so subsequent boots don't refetch.
        try { await saveJson(TENANT_KB_KEY, d.kb); } catch (_) {}
        console.info(`[NSPB] Tenant KB loaded from worker fallback (${d.kb.forms.length} forms)`);
      } else {
        window.NSPB_TENANT_KB = null;
      }
    } catch (e) {
      console.warn("[NSPB] Tenant KB worker fallback failed:", e.message || e);
      window.NSPB_TENANT_KB = null;
    }
  });
  // Cache live-discovered forms (from Settings → Discover) so the slash
  // palette can list them even when the tenant KB hasn't been imported.
  loadJson(FORMS_KEY).then(fw => {
    window.NSPB_LIVE_FORMS_CACHE = (fw && Array.isArray(fw.forms)) ? fw.forms : [];
  });
  // Auto-download generic NSPB help on first run (or if stale > 24h).
  // Non-blocking; runs in background. Used to inject expert NSPB knowledge
  // into AI prompts so answers feel like talking to an NSPB consultant.
  autoFetchHelpIfStale();
  loadJson("nspb-addin.appConfig.v1").then(cfg => { window.NSPB_APPCONFIG = cfg || null; });

  await refreshHealth();

  // ── Ribbon-button entry routing ────────────────────────────────────
  // The manifest's NSPB MCP ribbon tab has buttons that all open
  // taskpane.html but with different ?action= / ?tab= query params.
  // Read them once at boot and navigate accordingly. Each handler is
  // best-effort — if a button doesn't exist (e.g. Settings dialog
  // isn't open yet), we degrade gracefully.
  try {
    const qp = new URLSearchParams(window.location.search || "");
    const tabParam = (qp.get("tab") || "").toLowerCase();
    const action = (qp.get("action") || "").toLowerCase();
    // Switch to a specific top-level tab (Chat / Status / Environment / Help / Report)
    if (tabParam) {
      const target = document.querySelector(`.tab[data-tab="${tabParam}"]`);
      if (target) setTimeout(() => target.click(), 50);
    }
    if (action) {
      // Defer slightly so the DOM + Office is fully ready.
      setTimeout(() => {
        if (action === "settings" || action === "apikey") {
          // Open the Settings dialog (top-right button) and optionally
          // scroll to the API-key field.
          const settingsBtn = document.getElementById("settings-btn");
          if (settingsBtn) settingsBtn.click();
          if (action === "apikey") {
            setTimeout(() => {
              const keyField = document.getElementById("s-gemini-key");
              if (keyField) {
                keyField.focus();
                keyField.scrollIntoView({ behavior: "smooth", block: "center" });
              }
            }, 300);
          }
        } else if (action === "forms") {
          // Make sure chat tab is active, then type "show forms" in the input
          const chatBtn = document.querySelector('.tab[data-tab="chat"]');
          if (chatBtn) chatBtn.click();
          if (els.input) { els.input.value = "show forms"; els.input.dispatchEvent(new Event("input")); els.input.focus(); }
        } else if (action === "rules") {
          const chatBtn = document.querySelector('.tab[data-tab="chat"]');
          if (chatBtn) chatBtn.click();
          if (els.input) { els.input.value = "show rules"; els.input.dispatchEvent(new Event("input")); els.input.focus(); }
        } else if (action === "loadkb") {
          // Open Settings + click "Load everything" if present
          const settingsBtn = document.getElementById("settings-btn");
          if (settingsBtn) settingsBtn.click();
          setTimeout(() => {
            const loadBtn = document.getElementById("s-load-everything") || document.getElementById("s-load-all");
            if (loadBtn) loadBtn.click();
          }, 400);
        } else if (action === "chat") {
          const chatBtn = document.querySelector('.tab[data-tab="chat"]');
          if (chatBtn) chatBtn.click();
          if (els.input) els.input.focus();
        }
      }, 100);
    }
  } catch (e) {
    console.warn("[NSPB] ribbon entry routing failed:", e.message || e);
  }

  // Chat history is now PERSISTED for CHAT_HIST_DAYS days (loaded at the
  // top of this function via loadPersistedChat). Do NOT wipe it here —
  // users want to see previous turns on reopen.
  // Defensive: re-cache DOM in case Office re-mounted nodes between runs.
  try { cacheElements(); } catch (_) {}
  // Helper to ensure the welcome message + tip rotator always show up,
  // even when Office re-opens the panel without a full script reload.
  const ensureWelcomeAndTip = () => {
    try {
      // Force the welcome message + tip rotator on every panel load. Office
      // sometimes reuses the iframe across taskpane open/close cycles, which
      // would otherwise leave stale DOM (no welcome, tip already dismissed).
      if (els.messages && els.messages.children.length === 0) {
        // Try to restore persisted chat before falling back to the welcome.
        const persisted = loadPersistedChat();
        if (persisted.length) {
          for (const m of persisted) addMsg(m.role, m.text, { skipPersist: true });
        } else {
          addMsg("assistant", "How can I help?");
        }
      }
      // Tip rotator disabled (2026-07-03) — do NOT unhide it here; the
      // dormant startTipRotator() below re-hides it anyway and the
      // remove/add pair caused a visible flicker on panel wake.
    } catch (e) { console.error("welcome msg failed:", e); }
    try { startTipRotator(); } catch (e) { console.error("tip rotator failed:", e); }
  };
  ensureWelcomeAndTip();
  els.send.disabled = false;
  try { els.input.focus(); } catch (_) {}
  // Wire image paste support (multimodal NSPB questions).
  try { setupImagePaste(); } catch (e) { console.error("image paste failed:", e); }
  // Re-fire the welcome+tip whenever the panel becomes visible again.
  // Office reuses the iframe on plugin reload — visibilitychange may NOT fire,
  // so we listen on multiple lifecycle events + a short polling heartbeat
  // for the first 5 seconds after each "wake".
  const wake = () => { try { ensureWelcomeAndTip(); } catch (_) {} };
  document.addEventListener("visibilitychange", () => { if (!document.hidden) wake(); });
  window.addEventListener("pageshow", wake);          // fires on bfcache restore
  window.addEventListener("focus", wake);             // fires when panel regains focus
  // ALWAYS-ON heartbeat: Office add-ins reuse the iframe across taskpane
  // close/open cycles, and DOMContentLoaded only fires ONCE per iframe
  // lifetime. Visibility/focus events are unreliable in Office. So instead
  // we run a cheap permanent watchdog (every 2s) that re-asserts:
  //   1) The DOM element refs are fresh (Office may rebuild parts of DOM)
  //   2) The welcome message is present
  //   3) The tip rotator is visible (unless explicitly dismissed THIS load)
  setInterval(() => {
    try {
      // Re-cache in case Office rebuilt nodes
      const msgs = document.getElementById("messages");
      const tipRoot = document.getElementById("tip-rotator");
      if (!msgs) return;
      els.messages = msgs;  // refresh ref
      const dismissedNow = sessionStorage.getItem("nspb-tips-dismissed") === "1";
      const needsWelcome = msgs.children.length === 0;
      const needsTip = tipRoot && tipRoot.classList.contains("hidden") && !dismissedNow;
      if (needsWelcome) {
        try { addMsg("assistant", "How can I help?"); } catch (_) {}
      }
      if (needsTip) {
        _tipDismissed = false;
        try { startTipRotator(); } catch (_) {}
      }
    } catch (_) {}
  }, 2000);

  // Wire Clear chat button — two-click confirmation. First click changes the
  // button label + arms a 5-second timer. Second click within that window
  // wipes the chat. Timer expiry reverts the label.
  const clearBtn = document.getElementById("clear-chat-btn");
  if (clearBtn) {
    let armed = false, armTimer = null;
    const reset = () => {
      armed = false;
      clearBtn.textContent = "🗑️ Clear chat";
      clearBtn.style.background = "";
      clearBtn.style.color = "";
      clearBtn.style.borderColor = "";
      if (armTimer) { clearTimeout(armTimer); armTimer = null; }
    };
    clearBtn.addEventListener("click", () => {
      if (armed) {
        reset();
        clearChatHistory();
        return;
      }
      armed = true;
      clearBtn.textContent = "⚠ Click again to confirm";
      clearBtn.style.background = "#fee2e2";
      clearBtn.style.color = "#991b1b";
      clearBtn.style.borderColor = "#dc2626";
      armTimer = setTimeout(reset, 5000);
    });
  }

  // Tab-bar clear icon (🗑 next to Feedback) — same two-click confirm as the
  // overflow-menu button, icon-sized.
  const tabClear = document.getElementById("tab-clear-chat");
  if (tabClear) {
    let tcArmed = false, tcTimer = null;
    const tcReset = () => {
      tcArmed = false;
      tabClear.textContent = "🗑";
      tabClear.title = "Clear chat";
      tabClear.classList.remove("armed");
      if (tcTimer) { clearTimeout(tcTimer); tcTimer = null; }
    };
    tabClear.addEventListener("click", () => {
      if (tcArmed) { tcReset(); clearChatHistory(); return; }
      tcArmed = true;
      tabClear.textContent = "⚠";
      tabClear.title = "Click again to clear the chat";
      tabClear.classList.add("armed");
      tcTimer = setTimeout(tcReset, 5000);
    });
  }

  // Cancel button — closes any open RTP form / progress bubble. Visible only
  // when there's something cancellable on screen.
  const cancelBtn = document.getElementById("cancel-btn");
  if (cancelBtn) {
    window.NSPB_setCancelable = (active) => {
      if (active) cancelBtn.classList.remove("hidden");
      else cancelBtn.classList.add("hidden");
    };
    cancelBtn.addEventListener("click", () => {
      // Close any open RTP form
      document.querySelectorAll('[id^="rtp-form-"]').forEach(el => {
        const bubble = el.closest(".bubble");
        if (bubble) bubble.innerHTML = "<em style='color:#9ca3af;font-size:11px;'>Cancelled.</em>";
      });
      // Hide self
      cancelBtn.classList.add("hidden");
      // Re-enable send if it was disabled
      if (els.send) els.send.disabled = false;
    });
  }

  // Overflow (⋯) menu — secondary utilities (Clear chat). "Report a bug" is
  // now a top-level tab next to Help (easier to find), so it's no longer here.
  // Every COMMAND is still reachable by typing "?" in the chat (full intent tree).
  const overflowBtn = document.getElementById("overflow-btn");
  const overflowMenu = document.getElementById("overflow-menu");
  if (overflowBtn && overflowMenu) {
    overflowBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = overflowMenu.classList.toggle("hidden");
      overflowBtn.setAttribute("aria-expanded", String(!open));
    });
    // Clicks inside the menu must not bubble to the document closer below — that
    // would hide the menu mid-way through Clear-chat's two-click confirm.
    overflowMenu.addEventListener("click", (e) => e.stopPropagation());
    document.addEventListener("click", () => {
      overflowMenu.classList.add("hidden");
      overflowBtn.setAttribute("aria-expanded", "false");
    });
  }
}

function cacheElements() {
  els.messages = document.getElementById("messages");
  els.input = document.getElementById("input");
  els.send = document.getElementById("send-btn");
  els.status = document.getElementById("status-bar");
  els.settingsBtn = document.getElementById("settings-btn");
  els.overlay = document.getElementById("settings-overlay");
  els.closeBtn = document.getElementById("settings-close");
  els.sHost = document.getElementById("s-host");
  els.sUser = document.getElementById("s-user");
  els.sPass = document.getElementById("s-pass");
  els.sApp = document.getElementById("s-app");
  els.sGemini = document.getElementById("s-gemini");
  els.sAiProviderBadge = document.getElementById("s-ai-provider-badge");
  // Live-update the provider badge as user types
  if (els.sGemini && els.sAiProviderBadge) {
    const refresh = () => {
      const p = detectAiProvider(els.sGemini.value.trim());
      if (p === "gemini")      els.sAiProviderBadge.innerHTML = "🟢 Detected: <strong>Gemini</strong>";
      else if (p === "claude") els.sAiProviderBadge.innerHTML = "🟣 Detected: <strong>Claude</strong>";
      else if (!els.sGemini.value.trim()) els.sAiProviderBadge.textContent = "";
      else els.sAiProviderBadge.innerHTML = "⚠ Unknown key format — must start with <code>AIza</code> or <code>sk-ant-</code>";
    };
    els.sGemini.addEventListener("input", refresh);
    els.sGemini.addEventListener("blur", refresh);
  }
  els.sEpmPath = document.getElementById("s-epm-path");
  els.sEpmTest = document.getElementById("s-epm-test");
  els.sEpmTestStatus = document.getElementById("s-epm-test-status");
  els.sDebug = document.getElementById("s-debug");
  els.sHideZeros = document.getElementById("s-hide-zeros");
  els.sHelpUrl = document.getElementById("s-help-url");
  els.sGlossary = document.getElementById("s-glossary");
  els.sTest = document.getElementById("s-test");
  els.sDiscover = document.getElementById("s-discover");
  els.sDiscoverRules = document.getElementById("s-discover-rules");
  els.sDiscoverForms = document.getElementById("s-discover-forms");
  els.sDiscoverVars = document.getElementById("s-discover-vars");
  els.sDiscoverJobs = document.getElementById("s-discover-jobs");
  els.sDiscoverInteg = document.getElementById("s-discover-integ");
  els.sDiscoverApps = document.getElementById("s-discover-apps");
  els.sDetectAll = document.getElementById("s-detect-all");
  els.sSave = document.getElementById("s-save");
  els.sFeedback = document.getElementById("s-feedback");
  els.sImportKb = document.getElementById("s-import-kb");
  els.sClearKb = document.getElementById("s-clear-kb");
  els.sKbFile = document.getElementById("s-kb-file");
  els.sExportClient = document.getElementById("s-export-client");
  els.sImportClient = document.getElementById("s-import-client");
  els.sClientFile = document.getElementById("s-client-file");
  els.sClientStatus = document.getElementById("s-client-status");
  els.sClearAll = document.getElementById("s-clear-all");
  els.sPrecacheForms = document.getElementById("s-precache-forms");
  els.sClearFormCache = document.getElementById("s-clear-form-cache");
  els.sFormCacheStatus = document.getElementById("s-form-cache-status");
  els.sDownloadHelp = document.getElementById("s-download-help");
  els.sClearHelp = document.getElementById("s-clear-help");
  els.sHelpStatus = document.getElementById("s-help-status");
  els.sKbStatus = document.getElementById("s-kb-status");
  els.sIdcsUrl = document.getElementById("s-idcs-url");
  els.sOauthClientId = document.getElementById("s-oauth-client-id");
  els.sOauthClientSecret = document.getElementById("s-oauth-client-secret");
  els.sProbeOauth = document.getElementById("s-probe-oauth");
  els.sEpmPath = document.getElementById("s-epm-path");
  els.sEpmBridge = document.getElementById("s-epm-bridge");
  els.helpBtn = document.getElementById("help-btn");
  els.helpOverlay = document.getElementById("help-overlay");
  els.helpClose = document.getElementById("help-close");
}

function bindEvents() {
  els.send.addEventListener("click", onSend);
  els.input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend(); }
  });
  // Enter must ALWAYS behave like the Send button (Shift+Enter = newline).
  // Delegated at document level so it survives Office rebuilding the
  // textarea node — the direct listener above dies with the old node, which
  // left Enter silently doing nothing while the Send button kept working.
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || e.shiftKey) return;
    const t = e.target;
    if (!t || t.id !== "input") return;
    // Already handled (direct listener above, or the slash palette selecting
    // an item) — don't double-send.
    if (e.defaultPrevented) return;
    // Mirror the Send button's disabled state (mid-turn sends).
    const sendBtn = document.getElementById("send-btn");
    if (sendBtn && sendBtn.disabled) { e.preventDefault(); return; }
    e.preventDefault();
    onSend();
  });
  els.settingsBtn.addEventListener("click", openSettings);
  els.closeBtn.addEventListener("click", () => els.overlay.classList.add("hidden"));
  els.sTest.addEventListener("click", onTest);
  els.sDiscover.addEventListener("click", onDiscover);
  els.sDiscoverRules.addEventListener("click", onDiscoverRules);
  els.sDiscoverForms.addEventListener("click", onDiscoverForms);
  els.sDiscoverVars.addEventListener("click", onDiscoverVariables);
  els.sDiscoverJobs.addEventListener("click", onDiscoverJobs);
  els.sDiscoverInteg.addEventListener("click", onDiscoverIntegrations);
  els.sDiscoverApps.addEventListener("click", onDiscoverApplications);
  els.sDetectAll.addEventListener("click", onDetectAll);
  // ── Unified "Load everything" button ────────────────────────────────
  // Reads the optional s-load-file (tenant-kb.json) → imports it →
  // runs Detect everything → done. Single click for clients.
  const loadBtn = document.getElementById("s-load-everything");
  const loadFile = document.getElementById("s-load-file");
  const loadStatus = document.getElementById("s-load-status");
  if (loadBtn) {
    loadBtn.addEventListener("click", async () => {
      loadBtn.disabled = true;
      const setLoadStatus = (msg, color) => {
        if (!loadStatus) return;
        loadStatus.textContent = msg;
        loadStatus.style.color = color || "#555";
      };
      try {
        // 0. ALWAYS persist the form's typed settings FIRST, so the rest of
        //    the flow (and Send button after closing Settings) sees them.
        //    Otherwise the user could fill host/user/pwd/AIkey, click Load,
        //    and never save — settings would be lost when Settings closes.
        try {
          const formSettings = readSettingsForm();
          if (formSettings && formSettings.host && formSettings.username) {
            window.NSPB_SETTINGS = formSettings;
            await saveSettings(formSettings);
          }
        } catch (_) {}
        // 1. If a JSON file was picked, import it FIRST so the precache
        //    later uses the freshly imported KB.
        if (loadFile && loadFile.files && loadFile.files[0]) {
          setLoadStatus("Importing tenant-kb.json…");
          const file = loadFile.files[0];
          const text = await file.text();
          const snapshot = JSON.parse(text);
          const isFullSnapshot = snapshot && snapshot._format === "nspb-client-snapshot/v1";
          const isKbOnly = !isFullSnapshot && snapshot && (snapshot.forms || snapshot.dashboards || snapshot.navigationFlows);
          if (isKbOnly) {
            await saveJson(TENANT_KB_KEY, snapshot);
            window.NSPB_TENANT_KB = snapshot;
            const nForms = (snapshot.forms||[]).length;
            setLoadStatus(`✓ Imported ${nForms} forms — running discovery…`, "#166534");
          } else if (isFullSnapshot) {
            // Full snapshot — restore everything via existing handler.
            for (const k of Object.keys(snapshot.data || {})) {
              await saveJson(k, snapshot.data[k]);
            }
            setLoadStatus("✓ Imported full snapshot — running discovery…", "#166534");
          } else {
            setLoadStatus("⚠ File doesn't look like a tenant-kb.json or snapshot — proceeding with discovery anyway.", "#92400e");
          }
        } else {
          setLoadStatus("No JSON picked — running live discovery only…");
        }
        // 2. Detect everything (probes + auto-precache). chatOnly=true so
        // we don't clutter the workbook with 12+ NSPB_* inventory tabs;
        // the user gets a single summary message in chat instead.
        await onDetectAll({ chatOnly: true });
        setLoadStatus("✓ Done. Summary posted in chat.", "#166534");
      } catch (e) {
        setLoadStatus("✗ " + (e.message || e), "#dc2626");
      } finally {
        loadBtn.disabled = false;
      }
    });
  }
  // Wire the duplicated advanced buttons to the same handlers as the hidden
  // originals, so existing logic isn't rewritten.
  const refreshCacheBtn = document.getElementById("s-refresh-cache-adv");
  if (refreshCacheBtn) refreshCacheBtn.addEventListener("click", () => {
    const orig = document.getElementById("s-clear-form-cache");
    if (orig) orig.click();
  });
  const exportAdvBtn = document.getElementById("s-export-client-adv");
  if (exportAdvBtn) exportAdvBtn.addEventListener("click", () => {
    const orig = document.getElementById("s-export-client");
    if (orig) orig.click();
  });
  const clearAllAdvBtn = document.getElementById("s-clear-all-adv");
  if (clearAllAdvBtn) clearAllAdvBtn.addEventListener("click", () => {
    const orig = document.getElementById("s-clear-all");
    if (orig) orig.click();
  });
  els.sSave.addEventListener("click", onSaveSettings);
  els.sImportKb.addEventListener("click", () => els.sKbFile.click());
  els.sKbFile.addEventListener("change", onImportKb);
  els.sClearKb.addEventListener("click", onClearKb);
  if (els.sExportClient) els.sExportClient.addEventListener("click", onExportClient);
  if (els.sImportClient) els.sImportClient.addEventListener("click", () => els.sClientFile.click());
  if (els.sClientFile) els.sClientFile.addEventListener("change", onImportClient);
  if (els.sClearAll) els.sClearAll.addEventListener("click", onClearAll);
  if (els.sPrecacheForms) els.sPrecacheForms.addEventListener("click", onPrecacheForms);
  if (els.sClearFormCache) els.sClearFormCache.addEventListener("click", onClearFormCache);
  if (els.sDownloadHelp) els.sDownloadHelp.addEventListener("click", onDownloadHelp);
  if (els.sClearHelp) els.sClearHelp.addEventListener("click", onClearHelp);
  // Auto-update status on Settings open
  refreshHelpStatus();
  // EPM Automate test — generates a "epmautomate help" command for the user
  // to paste into PowerShell. Verifies the binary is reachable.
  if (els.sEpmTest) els.sEpmTest.addEventListener("click", () => {
    const path = (els.sEpmPath && els.sEpmPath.value.trim()) || "epmautomate";
    const isFullPath = path.includes("\\") || path.includes("/");
    const cmd = isFullPath ? `& "${path}" help` : `${path} help`;
    if (els.sEpmTestStatus) {
      els.sEpmTestStatus.innerHTML = `Paste in PowerShell: <code style="background:#f3f4f6;padding:2px 6px;border-radius:3px;font-family:monospace;font-size:11px;">${cmd}</code>`;
    }
  });
  els.sProbeOauth.addEventListener("click", onProbeOauth);
  // Top-level tab switcher: Chat / Environment / Help / Advanced / Report.
  document.querySelectorAll(".tab").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
      btn.classList.add("active");
      const tab = btn.dataset.tab;
      document.getElementById("tab-chat").classList.toggle("hidden", tab !== "chat");
      document.getElementById("tab-env").classList.toggle("hidden", tab !== "env");
      const stat = document.getElementById("tab-status");
      if (stat) stat.classList.toggle("hidden", tab !== "status");
      const help = document.getElementById("tab-help");
      if (help) help.classList.toggle("hidden", tab !== "help");
      const adv = document.getElementById("tab-advanced");
      if (adv) adv.classList.toggle("hidden", tab !== "advanced");
      const rep = document.getElementById("tab-report");
      if (rep) rep.classList.toggle("hidden", tab !== "report");
      if (tab === "env") renderEnvironmentTab();
      if (tab === "status") renderStatusTab();
      if (tab === "report") loadFixedBugs();
    });
  });

  // "Recently fixed" list in the Report tab — reads solved reports from the
  // worker (/api/fixed-bugs, backed by the Notion Bug Reports DB). Fetched
  // once per pane session, on first visit to the tab.
  let fixedBugsLoaded = false;
  async function loadFixedBugs() {
    const list = document.getElementById("r-fixed-list");
    if (!list || fixedBugsLoaded) return;
    fixedBugsLoaded = true;
    try {
      const res = await fetch(API + "/api/fixed-bugs");
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || res.status);
      const TYPE_EMOJI = { bug: "🐛", ux: "🎨", feature: "💡", performance: "⚡", confusing: "❓", other: "💬" };
      const cutoff = Date.now() - 30 * 24 * 3600 * 1000;
      // Only Excel add-in fixes here — Customer Hub fixes show in the hub.
      const fixes = (data.fixes || []).filter(f =>
        f.product === "chat" && new Date(f.fixedAt || f.reported).getTime() >= cutoff);
      if (!fixes.length) {
        list.textContent = "Nothing marked as fixed in the last 30 days.";
        return;
      }
      list.innerHTML = fixes.map(f => {
        const d = new Date(f.fixedAt || f.reported);
        const when = isNaN(d) ? "" : d.toISOString().slice(0, 10);
        const emoji = TYPE_EMOJI[f.type] || "💬";
        const t = String(f.title).replace(/&/g, "&amp;").replace(/</g, "&lt;");
        return `<div style="padding:5px 0;border-bottom:1px solid #f3f4f6;display:flex;gap:8px;">` +
               `<span>${emoji}</span><span style="flex:1;">${t}</span>` +
               `<span style="color:#9ca3af;white-space:nowrap;">✓ ${when}</span></div>`;
      }).join("");
    } catch (e) {
      fixedBugsLoaded = false;  // allow retry on next tab visit
      list.textContent = "Couldn't load the fixed list (" + (e.message || e) + ").";
    }
  }

  // Report tab — POSTs the report to /api/feedback which the worker
  // forwards to a Slack channel via incoming webhook. No mail client needed.
  const buildReportPayload = (forceAttach) => {
    const type   = document.getElementById("r-type").value;
    const title  = document.getElementById("r-title").value.trim();
    const desc   = document.getElementById("r-body").value.trim();
    const email  = document.getElementById("r-email").value.trim();
    const attach = forceAttach || document.getElementById("r-attach-log").checked;
    const payload = { type, title, description: desc, email,
      client: (window.NSPB_SETTINGS && (window.NSPB_SETTINGS.appName || window.NSPB_SETTINGS.host)) || "" };
    if (attach) {
      try {
        payload.env = {
          ts: new Date().toISOString(),
          ua: navigator.userAgent,
          excel: (typeof Office !== "undefined" && Office.context) ? `${Office.context.host}/${Office.context.platform}` : "—",
          tenantApp: window.NSPB_SETTINGS && window.NSPB_SETTINGS.appName,
          tenantHost: window.NSPB_SETTINGS && window.NSPB_SETTINGS.host,
        };
        payload.debugLog = (window.NSPB_DEBUG_LOG || []).slice(-15);
        // Recent chat transcript — gives the triager the conversation that led
        // to the bug. Last ~20 turns, each message capped, total capped, so the
        // payload stays small enough for the Slack/Notion sinks.
        payload.chatTranscript = (history || [])
          .slice(-20)
          .map(m => {
            const who = m.role === "user" ? "🧑 User" : "🤖 Assistant";
            const txt = String(m.content == null ? "" : m.content).replace(/\s+$/, "").slice(0, 800);
            return `${who}: ${txt}`;
          })
          .join("\n\n")
          .slice(-6000);
      } catch (_) {}
    }
    return payload;
  };
  // Exposed for the auto bug-report offer in the chat (maybeOfferAutoBugReport)
  // — same rich payload as the Feedback tab, forced attachments.
  window.NSPB_buildReportPayload = buildReportPayload;
  const rSend = document.getElementById("r-send-btn");
  if (rSend) rSend.addEventListener("click", async () => {
    const payload = buildReportPayload();
    const status = document.getElementById("r-status");
    if (!payload.title && !payload.description) {
      if (status) { status.textContent = "✗ Please fill in at least a title or description."; status.className = "error"; }
      return;
    }
    rSend.disabled = true;
    if (status) { status.textContent = "Sending…"; status.className = ""; }
    try {
      const res = await fetch(API + "/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        if (status) { status.textContent = "✓ Sent — thanks for the report!"; status.className = ""; }
        // Clear the form so the user knows it sent
        document.getElementById("r-title").value = "";
        document.getElementById("r-body").value = "";
      } else {
        if (status) { status.textContent = `✗ Couldn't send: ${data.error || res.status}`; status.className = "error"; }
      }
    } catch (e) {
      if (status) { status.textContent = `✗ Network error: ${e.message || e}`; status.className = "error"; }
    } finally {
      rSend.disabled = false;
    }
  });
  const rCopy = document.getElementById("r-copy-btn");
  if (rCopy) rCopy.addEventListener("click", async () => {
    const payload = buildReportPayload();
    const text = JSON.stringify(payload, null, 2);
    const status = document.getElementById("r-status");
    try {
      await navigator.clipboard.writeText(text);
      if (status) { status.textContent = "✓ Copied to clipboard."; status.className = ""; }
    } catch (e) {
      if (status) { status.textContent = "✗ Couldn't copy. Select the text and copy manually."; status.className = "error"; }
    }
  });

  // Help/Advanced: every <code> example is clickable — click pastes into chat
  // input, switches to the Chat tab, and focuses so the user can review/Send.
  ["tab-help", "tab-advanced"].forEach((tabId) => {
    const helpTab = document.getElementById(tabId);
    if (!helpTab) return;
    helpTab.addEventListener("click", (e) => {
      const c = e.target.closest("code");
      if (!c || !helpTab.contains(c)) return;
      // Skip code blocks inside .help-list-text (those are descriptive code spans,
      // not commands — e.g. "https://xxx.epm.oraclecloud.com").
      if (c.closest(".help-list-text")) return;
      const cmd = (c.textContent || "").trim();
      if (!cmd) return;
      const chatBtn = document.querySelector('.tab[data-tab="chat"]');
      if (chatBtn) chatBtn.click();
      // Paste + auto-send for speed
      if (els.input) {
        els.input.value = cmd;
        els.input.focus();
        if (typeof onSend === "function") onSend();
      }
    });

  });

  // Wrap each <p.help-section-label> + its following siblings (until the next
  // section-label) into a <section class="help-module">. This gives sections
  // the same "card with black header" look as the Environment tab — without
  // needing an HTML refactor.
  wrapHelpSections();

  // Slash-command palette: typing "/" at the start of the chat input opens
  // a dropdown of commands; continued typing filters; sub-commands (e.g.
  // /form, /rule) expand to live KB items so the user never has to remember
  // exact names.
  initSlashPalette();
}

// ── Slash-command palette ────────────────────────────────────────────────────
const SLASH_CATEGORIES = [
  // ── Most common (top of menu) ───────────────────────────────
  { cmd: "/show",     icon: "🔎", desc: "Query: list / find / count / cross-reference NSPB metadata (any user)", expand: "show" },
  { cmd: "/openform", icon: "📋", desc: "Open a Planning form (metadata + grid + attached rules)", expand: "forms" },
  { cmd: "/runrule",  icon: "▶️", desc: "Run a business rule — live picker, executes via NSPB REST + RTP form",  expand: "rules" },
  { cmd: "/analyze",  icon: "🧠", desc: "Ask Gemini — pre-built queries or your own (NL → SQL on DuckDB)",       expand: "analyze" },
  { cmd: "/adhoc",    icon: "📊", desc: "Build / zoom / pivot / filter SmartView ad-hoc grids",  expand: "adhoc" },
  { cmd: "/format",   icon: "🧹", desc: "Format / polish / clean the active sheet",                expand: "format" },
  // ── Admin ───────────────────────────────────────────────────
  { cmd: "/admin",   icon: "⚙️", desc: "ADMIN ACTIONS: run jobs/rules, vars, dim import/export, file ops", expand: "admin" },
  { cmd: "/set",     icon: "🧮", desc: "Set ONE substitution variable (live REST)",                              fill: "set variable " },
  { cmd: "/update",  icon: "🧮", desc: "Open the substitution variables editor — pick from a live list and edit any of them", fill: "update variables" },
  { cmd: "/help",    icon: "❓", desc: "Q&A — how NSPB works, concepts, troubleshooting",                        expand: "help" },
  { cmd: "/submit",  icon: "💾", desc: "Submit edited yellow cells back to NSPB (input forms)",                fill: "submit data from this sheet", wip: true },
  // ── Generative (UNDER DEVELOPMENT) ──────────────────────────
  { cmd: "/build",   icon: "🏗️", desc: "Build NSPB artifacts from a sheet (smartview, dim import, form, rule)", expand: "build", wip: true },
  { cmd: "/mockup",  icon: "🎨", desc: "AI-generate values: forecast, budget, fill missing, mock data", expand: "mockup", wip: true },
  // ── Power-user (least used, at the end) ─────────────────────
  { cmd: "/transform", icon: "🦆", desc: "Power user: load active sheet into DuckDB + run SQL checks (no AI)",  expand: "transform" },
];

// /build — turn an active sheet (or pasted text) into NSPB-shaped artifacts.
// All AI-generative — produce files / mappings / definitions, never act on
// the live tenant directly. To execute on the tenant after building, use
// the matching /admin command (e.g. submit dimension import to NSPB).
const BUILD_TEMPLATES = [
  // ── SmartView mapping ───────────────────────────────────────
  { cmd: "create smartview adhoc from this sheet",
    desc: "🚧 Build a SmartView ad-hoc grid from active sheet shape" },
  { cmd: "create SmartView template from this",
    desc: "🚧 Build a SmartView template aligned to NSPB" },
  { cmd: "transform this to smartview",
    desc: "🚧 Convert active sheet to SmartView codes" },
  { cmd: "map this sheet to NSPB",
    desc: "🚧 Map active sheet columns to NSPB codes → SV_… sheet" },
  { cmd: "this is budget data from the client",
    desc: "🚧 Hint to AI for client-format mapping" },
  // ── Dimensions ──────────────────────────────────────────────
  { cmd: "create dimensions import file from this sheet",
    desc: "🚧 Convert active sheet to dim import format" },
  { cmd: "create dimension import file from text",
    desc: "🚧 AI: paste an indented tree / list — get a Planning-compatible import ZIP" },
  { cmd: "create <Dim> from this sheet",
    desc: "🚧 AI: build a brand-new dimension's import file using KB defaults + the sheet" },
  { cmd: "validate dimension import file",
    desc: "🚧 Pre-check a dimension import (orphans, dup parents, invalid types)" },
  // ── Forms / rules ───────────────────────────────────────────
  { cmd: "create form definition from this sheet",
    desc: "🚧 Build form definition aligned to active sheet" },
  { cmd: "create rule from this sheet",
    desc: "🚧 Synthesize a calc rule based on active sheet logic" },
  // ── Misc ────────────────────────────────────────────────────
  { cmd: "prepare for nspb",
    desc: "🚧 Pre-process active sheet for NSPB ingest" },
  { cmd: "validate this sheet against nspb",
    desc: "🚧 Validate active sheet vs NSPB metadata (codes, dims, structure)" },
];

// /mockup — AI-generative (UNDER DEVELOPMENT). Three sub-themes via emoji
// prefix in desc: 📈 forecast · 💰 budget · 🎨 mockup/fill.
const MOCKUP_TEMPLATES = [
  // ── 📈 Forecast generation ──────────────────────────────────
  { cmd: "create forecast based on actual history tp1-tp9",
    desc: "📈 Forecast — pattern-match Actuals TP1-TP9, fill TP10-TP12" },
  { cmd: "create forecast for fy26 based on actual fy25 history",
    desc: "📈 Forecast — full year FY26 from FY25 pattern" },
  { cmd: "create forecast based on actual history with seasonality",
    desc: "📈 Forecast — factor monthly seasonality" },
  { cmd: "create forecast based on actual fy24 plus 10 percent growth",
    desc: "📈 Forecast — flat YoY growth assumption" },
  { cmd: "forecast next 3 months based on trend",
    desc: "📈 Forecast — short-horizon trend projection" },
  { cmd: "forecast remaining periods of fy25 based on yoy growth",
    desc: "📈 Forecast — fill TPx→TP12 using FY24 × growth" },
  { cmd: "forecast based on linear regression of last 12 months",
    desc: "📈 Forecast — linear model on rolling 12 actuals" },
  { cmd: "create forecast for items with actual but no forecast",
    desc: "📈 Forecast — fill gaps detected by 'check missing forecast'" },
  { cmd: "forecast by item based on similar items pattern",
    desc: "📈 Forecast — clustering-based fill for new items" },
  // ── 💰 Budget generation ───────────────────────────────────
  { cmd: "create budget based on actual history",
    desc: "💰 Budget — copy actuals as next-year budget" },
  { cmd: "create budget based on actual fy24 plus 5 percent",
    desc: "💰 Budget — flat % uplift over prior actuals" },
  { cmd: "create budget for fy26 based on fy25 forecast",
    desc: "💰 Budget — roll forecast into next year's budget" },
  { cmd: "create budget by item based on average of last 3 years",
    desc: "💰 Budget — 3-year rolling average" },
  { cmd: "generate zero based budget from actual fy25",
    desc: "💰 Budget — start from zero, build up by line item" },
  { cmd: "create budget for missing items based on similar items",
    desc: "💰 Budget — clustering + apply group average" },
  { cmd: "create budget at 0 for lost customers",
    desc: "💰 Budget — paired with 'check lost customers'" },
  // ── 🎨 Mockup / fill missing ──────────────────────────────
  { cmd: "fill missing values in this sheet",
    desc: "🎨 Fill — auto-impute blanks using context" },
  { cmd: "complete this sheet based on patterns",
    desc: "🎨 Fill — pattern-match across similar rows" },
  { cmd: "impute missing values using linear interpolation",
    desc: "🎨 Fill — math-based fill for monthly gaps" },
  { cmd: "generate mock data for 100 new items in this format",
    desc: "🎨 Mockup — produce sample data matching the sheet shape" },
  { cmd: "mock client planilla with 100 rows similar to this",
    desc: "🎨 Mockup — synthesize a client-like pivot for testing" },
  { cmd: "fill blank rows with prior-period values",
    desc: "🎨 Fill — carry-forward fill" },
  { cmd: "complete the smartview pivot for missing combos",
    desc: "🎨 Fill — find sparse cells and propose values" },
];

const FORMAT_TEMPLATES = [
  { cmd: "format this sheet as an executive report", desc: "✨ Apply exec-style formatting (bold totals, slate headers, light borders)" },
  { cmd: "format this sheet as a financial report",  desc: "✨ Apply finance-style formatting (currency cols, indent levels)" },
  { cmd: "clean zero rows from this sheet",          desc: "🧹 Hide rows where all numeric cells are 0" },
  { cmd: "remove zero rows",                         desc: "🧹 Same — alt phrasing" },
  { cmd: "highlight negative values in red",         desc: "🎨 Conditional format — paint negatives" },
  { cmd: "highlight totals row in bold",             desc: "🎨 Make the totals row bolder" },
  { cmd: "apply currency format to numeric columns", desc: "💰 USD format with 0 decimals" },
  { cmd: "apply percent format to variance columns", desc: "% Apply % format" },
  { cmd: "freeze top 4 rows",                        desc: "🧊 Freeze pane (POV + headers visible while scrolling)" },
  { cmd: "auto-fit column widths",                   desc: "📐 Resize cols to fit content" },
];

const ADHOC_TEMPLATES = [
  // ── Open a form as a SmartView pivot (raw SmartView format) ─
  { cmd: "adhoc2 Income Statement",                desc: "📐 Open form as raw SmartView pivot — connect SmartView and Refresh" },
  { cmd: "adhoc2 OpEx by Dept.",                   desc: "📐 Same — example with another form" },
  { cmd: "adhoc2 Manage Employees",                desc: "📐 Same — workforce form" },
  // ── Build a new grid (NL question) ──────────────────────────
  { cmd: "revenue by month FY25 forecast",            desc: "📊 Build — revenue trend across the year, Forecast scenario" },
  { cmd: "opex by department Q1 actual",              desc: "📊 Build — operating expenses by Dept, Q1 actuals" },
  { cmd: "headcount by subsidiary FY25 budget",       desc: "📊 Build — headcount per sub, Budget" },
  { cmd: "P&L summary YearTotal actual vs budget",    desc: "📊 Build — P&L compare YearTotal Actual vs Budget" },
  { cmd: "gross margin by class FY25",                desc: "📊 Build — margin per product class FY25" },
  { cmd: "revenue by item Q3 actual",                 desc: "📊 Build — Q3 revenue by item" },
  { cmd: "opex YearTotal forecast vs budget",         desc: "📊 Build — opex variance Forecast vs Budget" },
  // ── Zoom / drill / pivot (operate on the active grid) ────────
  { cmd: "zoom in on revenue",                        desc: "🔬 Zoom — drill into Revenue branch" },
  { cmd: "zoom in on Marketing",                      desc: "🔬 Zoom — drill into Marketing department" },
  { cmd: "drill to leaf level",                       desc: "🔬 Drill — expand all the way to leaf members" },
  { cmd: "expand all children",                       desc: "🔬 Drill — one level down for all parents" },
  { cmd: "back",                                      desc: "↩️ Zoom out — undo the last drill" },
  { cmd: "zoom out",                                  desc: "↩️ Zoom out — go up one level" },
  { cmd: "collapse to YearTotal",                     desc: "↩️ Zoom out — back to YearTotal aggregate" },
  { cmd: "pivot to Subsidiary",                       desc: "🔄 Pivot — move Subsidiary to rows, replace existing" },
  { cmd: "add Department to rows",                    desc: "🔄 Pivot — add a dim to rows" },
  { cmd: "move Period to columns",                    desc: "🔄 Pivot — move a dim to columns" },
  // ── Filter / swap POV ────────────────────────────────────────
  { cmd: "keep only Marketing",                       desc: "🎯 Filter — keep one member, drop the rest" },
  { cmd: "filter by Subsidiary=SUB_2",                desc: "🎯 Filter — exact match on a dim" },
  { cmd: "exclude zero rows",                         desc: "🎯 Filter — drop empty rows" },
  { cmd: "same but FY24",                             desc: "🔁 Swap POV — change Year" },
  { cmd: "same but Budget",                           desc: "🔁 Swap POV — change Scenario" },
  { cmd: "change scenario to Forecast",               desc: "🔁 Swap POV — Scenario explicit" },
];

// FAQ — top NSPB questions with pre-written answers (cached, zero tokens).
// When the user picks one of these, we intercept BEFORE Gemini and show
// the static answer immediately. Saves ~$0.001 per click + much faster.
// Feel free to expand based on real client questions.
const FAQ_ANSWERS = {
  "what is a business rule": `**Business rules** are calc scripts that NSPB runs on demand or on form save. Three execution modes:

* **On Demand** — user clicks "Run" or executes via SmartView/REST API
* **On Save** — runs automatically when the user saves a form (recalculates dependent cells)
* **On Load** — runs when the form is opened (rare, used for setup)

Rules are written in **Calc Manager** using Essbase Calc Script syntax. They can:
* Aggregate data (e.g. roll up monthly to year)
* Allocate amounts (push corporate cost down to departments)
* Copy data between scenarios (Actual → Forecast)
* Apply business logic (FX conversion, headcount-driven expense calc)

Use \`/show me the rules\` to list yours, or \`run rule <name>\` to execute one.`,

  "what is a substitution variable": `**Substitution variables** are placeholder values that change centrally without editing every form/rule. Common examples:

* \`&CurrentMonth\` — the active planning period (e.g. "Apr")
* \`&CurrentYear\` — current fiscal year ("FY26")
* \`&OpenYear\` — first year still open for input
* \`&PriorYear\` — typically &CurrentYear minus 1

Update them when:
* 🗓️ **Monthly** at month-end close (CurrentMonth, OpenPeriod)
* 📅 **Annually** at year-end (CurrentYear, OpenYear, PriorYear)
* 🔁 **Per planning cycle** (StartPlan, EndPlan)
* 🔒 **Static** — utility tuples that should never change

Use \`/show me the variables\` for the list with current values + suggested updates.`,

  "what is a smart push": `**Smart Push** copies data between **cubes** (e.g. from a workforce planning cube to the financial reporting cube) automatically when a user saves a form.

Configured at the **form level** (Form Designer → Smart Push tab). Useful for:
* Pushing detailed employee compensation → HR-summary cube
* Pushing item-level revenue → consolidated P&L cube
* Keeping reporting cubes in sync without running rules manually

Smart Pushes use **mapping rules** to translate dim members between source and target cubes. They run instantly on save and don't require a separate job.`,

  "what is the difference between input and review forms": `* **Input forms** — for **data entry**. Cells at level-0 (leaf members) are editable. Users type values and save → SmartView/REST writes back to NSPB.
* **Review forms** — for **read-only consolidated views**. Cells at parent-level show aggregated data. No edits allowed.

In SmartView the visual cue is the cell color (yellow = input). In our add-in:
* \`/show all forms\` shows category badges (🟢 INPUT / 🟣 REVIEW / 🔵 DASH)
* When you \`adhoc2\` an input form, editable cells are highlighted yellow

Forms can also be **type 8** (dashboard — read-only composite of multiple grids).`,

  "how do navigation flows work in nspb": `**Navigation Flows** define the menu structure users see in the NSPB web UI — modules, cards, tabs.

Hierarchy:
* **Flow** (top-level, e.g. "Finance User") — assigned to user roles
* **Module** (sidebar item, e.g. "Models", "Versions")
* **Card** (right-side panel option)
* **Tab** (sub-page within a card, contains a form/dashboard)

In LCM, flows export as JSON with all the wiring. Use \`/show navigation flow\` to see your tenant's tree (NSPB_Navigation sheet).

Flows are **per-role**: Admin sees more cards than a Reviewer. Cloning a flow + tweaking cards is the standard customization path.`,

  "how does data management work": `**Data Management** (DM, formerly FDMEE) is the integration layer that loads data INTO NSPB from external sources (NetSuite, files, other cubes).

Key concepts:
* **Integration** — a single load definition (source → target cube). Has source filters, target dim mappings, period mappings.
* **Pipeline** — orchestrates N integrations in sequence (e.g. nightly load: GL → Workforce → SmartPush → Calc).
* **Mapping** — translates source codes to NSPB members (e.g. NetSuite GL "4000" → NSPB Account "P_400000_Revenue").
* **Period mapping** — maps source period (calendar months) to NSPB Period dim (TP1..TP12).

Use \`/show DM integrations\` to list yours. \`show mapping for <integration>\` to see the dim translation rules.`,

  "what is a valid intersection": `**Valid intersections** restrict which **cross-dim combos** are valid for input or aggregation. Used to:
* Hide non-meaningful intersections (e.g. "Workforce expense" + "Subsidiary=corporate-only")
* Speed up sparse cubes (NSPB doesn't allocate space for invalid combos)
* Improve UX (forms only show relevant cells)

Defined in Application Settings → Valid Intersections. They use a "rule expression" like \`Subsidiary IN [SUB_USA, SUB_CAN] AND Account IN [Workforce.*]\` to define what's allowed.

Wrong valid-intersection setup is the #1 cause of "data not appearing" or "form refuses to load". If you see weird behavior, check valid intersections first.`,

  "how do business rules execute": `When you click **Run** on a rule (or it triggers on save):

1. **Submit job** — POST to \`/HyperionPlanning/rest/v3/applications/{app}/jobs\` with \`jobType: "RULES"\`, \`jobName: "<rule>"\`. Returns a \`jobId\`.
2. **RTPs** (Runtime Prompts) — if the rule has variables, NSPB asks you to fill them (POV selection, year, scenario). Pass via \`parameters: {Year: "FY26", Scenario: "Forecast"}\`.
3. **Execute** — Essbase calc engine runs the script. Time depends on complexity (~seconds to minutes).
4. **Status** — poll \`GET /jobs/{jobId}\` until \`status\` becomes \`COMPLETED\`, \`COMPLETED_WITH_ERRORS\`, or \`ERROR\`.
5. **Logs** — accessible via \`show job status <id>\` in the add-in.

Security: rules run as the user who triggered them (their NSPB role/permissions apply).`,

  "how do i run a business rule in nspb": `Three ways:

1. **From the NSPB web UI**: Home → Rules card → find the rule → Click "Launch". Fill RTPs if any.
2. **From a form**: forms can have rules attached as buttons (Run on Save or manual click).
3. **From this add-in**: type \`run rule <name>\` or use \`/rule\` for the live picker. The add-in submits the job via Planning REST and shows you the job ID + status.

To see what rules exist: \`/show me the rules\`. To see which rules are attached to a specific form: \`rules of <form name>\`.`,

  "how do i schedule a data management job": `Schedule a DM integration to run automatically:

1. **NSPB UI** → Application → Jobs → Schedule Jobs
2. Click **+ New Schedule**
3. **Job Type**: "Data Management Rule" (for an integration) or "Pipeline" (for a sequence)
4. **Job Name**: pick from the list
5. **Schedule**: cron-style (e.g. daily 2 AM) or after another job
6. **Notification**: email on success / failure

Alternative: trigger via REST API at \`POST /aif/rest/V1/jobs\` with the schedule payload (good for external orchestration like Airflow).

Use \`/show recent jobs\` in the add-in to see the last N runs of every job.`,

  "how do i do month-end close in nspb": `Standard NSPB month-end checklist:

1. **Lock prior period**: Application Settings → Cube Maintenance → mark prior month read-only
2. **Run the GL load**: trigger the DM integration that pulls Actual data from NetSuite (or your source ERP)
3. **Run aggregation rules**: \`NFS_AGG IncStmt - Actuals\` and similar for each cube
4. **Validate balances**: open the Income Statement form → compare YTD vs source ERP. Variance > $0 → investigate
5. **Update substitution variables**: increment \`&CurrentMonth\`, \`&OpenPeriod\`
6. **Notify reviewers**: email/Slack with the new month available
7. **Open new period**: clear forecast for the new current month so users can re-plan

Use \`/show recent jobs\` to confirm all aggregations completed without errors.`,

  "how do i add new users and assign roles": `1. **Identity Cloud** (IDCS or OCI Identity Domain) → Users → Create new
2. Assign **NSPB roles** at the IDCS level:
   * \`Service Administrator\` — full power
   * \`Power User\` — can edit forms, run rules, no admin
   * \`User\` — can submit data on assigned forms
   * \`Viewer\` — read-only
3. In NSPB → Application → Access Control → assign **dimension/cell permissions** (e.g. user only sees their subsidiary)
4. **Navigation Flow** assignment: edit the flow → Permissions → add the user/group

For bulk: use the \`User Management\` REST endpoint or upload a CSV via Migration.`,

  "how do i import data from netsuite into nspb": `NetSuite → NSPB integration is **pre-built** in NSPB (NSPB ships with a NetSuite source connector):

1. **Set up connection**: Application → Connections → Add NetSuite → enter NS account ID, role, token
2. **Configure dim mappings**: NS Subsidiary → NSPB Subsidiary, NS GL Account → NSPB Account, etc.
3. **Run integration**: DM → Workbench → select the NS integration → Execute
4. **Schedule for nightly**: see "How do I schedule a Data Management job"

Common pitfalls:
* **Period mapping** — NS calendar months → NSPB TP1-TP12 must be exact
* **Currency** — NS reporting currency vs NSPB Currency dim must match
* **Subsidiary hierarchy** — NS sub IDs vs NSPB Entity dim members

Use \`show DM integrations\` to see your active loads.`,

  "what is a cube and how do i see its dimensions": `A **cube** is a multidim data store in NSPB (also called "Plan Type" in older Hyperion language).

Each cube has its own:
* **Dimensions** (e.g. Account, Period, Years, Scenario, Entity, Custom1-3)
* **Members** within each dim
* **Data** at the intersection of all dims

Typical NSPB tenant has 3-5 cubes:
* **NSP_NFS** — main financial planning (Income Statement, Balance Sheet)
* **Workforc** — workforce/headcount detail
* **Plan** — scenario rollups
* **Rpt** — reporting cube (usually denormalized for speed)
* **Details** — granular operational planning

Use \`/show cubes\` to list yours, or \`dimensions of NSP_NFS\` to see one cube's dim list.`,

  "what is the difference between pbcs and nspb": `**PBCS** (Planning and Budgeting Cloud Service) and **NSPB** (NetSuite Planning and Budgeting) are the **same product**, different names/packaging:

* **PBCS** — Oracle's standalone EPM Planning Cloud (pre-2020). General market, sold separately.
* **NSPB** — same engine, **bundled with NetSuite ERP** as a tightly integrated planning module. Pre-built NetSuite connector, periods aligned with NS subsidiaries, automatic data sync.

**Functionally identical**: same Calc Manager, same forms, same Data Management, same SmartView, same REST APIs. If you know PBCS, you know NSPB.

**Differences in practice**:
* NSPB has the **NetSuite source connector pre-configured** (PBCS requires manual setup)
* NSPB ships with **pre-built financial planning templates** aligned to NetSuite charts of accounts
* NSPB billing rolls into your NetSuite license; PBCS is a separate Oracle subscription
* NSPB tenant URLs typically end in \`.epm.us-phoenix-1.ocs.oraclecloud.com\`

If you find old PBCS documentation, it 99% applies to NSPB.`,

  "how do i set up periods or period mappings": `**Periods** are members of the **Period dimension** (typically TP1..TP12 for monthly). Setup at 3 levels:

**1. Application Period dim** (one-time, at app creation):
* Application → Dimensions → Period → member structure (12 months, quarters, year-total)
* Period names: \`TP1\` (January), \`TP2\` (February), …, \`TP12\` (December)
* Aliases for display: \`Jan\`, \`Feb\`, …
* Aggregation: TP1+TP2+TP3 = Q1, Q1+Q2+Q3+Q4 = YearTotal

**2. Substitution Variables** (updated monthly/annually):
* \`&CurrentMonth\` — points at active period (forms/rules use it to default the open cell)
* \`&PriorMonth\`, \`&NextMonth\` — relative pointers
* Updated at month-end close

**3. Data Management Period Mapping** (when loading from NetSuite/source):
* DM → Setup → Period Mapping → Global / Application / Source
* Maps source calendar period (\`2026-04-30\`, \`Apr-26\`) → NSPB Period dim member (\`TP4\`)
* **Critical**: must match exact format the source emits, or the load fails silently

Common pitfall: NS uses fiscal-year periods that don't align with NSPB's TP1..TP12 directly. Set the offset in DM Period Mapping (e.g. NS Period 1 = NSPB TP4 if FY starts April).`,

  "how do i copy data between scenarios": `Three ways to copy data (e.g. Actual → Forecast at quarter-end):

1. **Smart Copy** (form-level): right-click a cell range → "Copy" → change POV (e.g. Scenario from Actual to Forecast) → "Paste Special". Manual but flexible.

2. **Business Rule**: a calc script with \`DATACOPY\` Essbase function:
   \`DATACOPY "Actual"->"Working" TO "Forecast"->"Working";\`
   Wrap with FIX() for specific years/periods. Runs in seconds for big slices.

3. **Data Management**: source = NSPB cube with Scenario=Actual, target = same cube with Scenario=Forecast, with period mapping (e.g. only TP1-9). Best for scheduled cycle copies.

Common use case: at end-of-Q3, copy Q1-Q3 Actuals into the Forecast scenario as the "anchor" for the rest of the year.`,
};

// /help — pure NSPB conceptual questions. No add-in internals (DuckDB, AI,
// SQL), no generic troubleshooting (auth/excel errors), no add-in plumbing.
// Just NSPB knowledge: forms, rules, dims, vars, jobs, integrations, workflows.
const HELP_TEMPLATES = [
  // ── 🔥 Top NSPB concepts ──────────────────────────────────────
  { cmd: "what is a business rule",                desc: "🔥 NSPB — calc scripts, On Demand / On Save / On Load triggers" },
  { cmd: "how do I run a business rule in NSPB",   desc: "🔥 NSPB — 3 ways: NSPB Web UI, attached to a form, or `/runrule` here" },
  { cmd: "how do business rules execute",          desc: "📘 NSPB — execution model, RTPs, security context" },
  { cmd: "what is a substitution variable",        desc: "🔥 NSPB — vars, scope (app vs cube), when to update" },
  { cmd: "how do I update a substitution variable", desc: "🔥 NSPB — `update variables` picker or `set variable X = Y` REST" },
  { cmd: "when should I update CurrentMonth",       desc: "📘 NSPB — only AFTER the period is closed in NetSuite" },
  { cmd: "what is a smart push",                   desc: "🔥 NSPB — pushing data between cubes on save" },
  { cmd: "what is a cube and how do I see its dimensions", desc: "🔥 NSPB — multidim store, typical NSPB cubes (NSP_NFS, Plan, Workforc)" },
  { cmd: "what is a valid intersection",           desc: "📘 NSPB — controlling valid cross-dim member combos" },
  // ── Forms / dashboards / nav ──────────────────────────────────
  { cmd: "what is the difference between input and review forms", desc: "📋 Forms — input (data entry) vs review (read-only)" },
  { cmd: "how do navigation flows work in NSPB",   desc: "🗺️ Nav — modules → cards → tabs hierarchy" },
  // ── Hierarchies / metadata ────────────────────────────────────
  { cmd: "what is an alternate hierarchy",         desc: "🌳 NSPB — secondary rollup using shared members for state-specific reporting" },
  { cmd: "what is a shared member",                desc: "🌳 NSPB — same data referenced from multiple hierarchies, no duplication" },
  { cmd: "what is the difference between stored and dynamic calc", desc: "🌳 NSPB — stored data vs runtime calculation" },
  { cmd: "how do I add a new GL account",          desc: "🛠️ NSPB — NetSuite first, then sync to NSPB, then add to alternate hierarchies" },
  // ── Data integration ──────────────────────────────────────────
  { cmd: "how does data management work",          desc: "🔁 DM — pipelines, integrations, mappings" },
  { cmd: "how do I schedule a Data Management job", desc: "🔁 DM — Tools → Schedule Jobs flow" },
  { cmd: "how do I import data from NetSuite into NSPB", desc: "🔁 DM — pre-built NetSuite connector + saved searches" },
  { cmd: "how do I reconcile NetSuite vs NSPB",    desc: "✅ Reconciliation — drill from total → leaf level to find variances" },
  // ── Workflows ─────────────────────────────────────────────────
  { cmd: "how do I do month-end close in NSPB",    desc: "📅 Workflow — close steps: lock, load actuals, aggregate, validate" },
  { cmd: "how do I copy data between scenarios",   desc: "📅 Workflow — Smart Copy, DATACOPY rule, or DM scheduled copy" },
  { cmd: "how do I set up periods or period mappings",   desc: "📅 Period — Period dim, substitution vars, DM mapping" },
  // ── Workforce ─────────────────────────────────────────────────
  { cmd: "how does the workforce module work",     desc: "👥 Workforce — Employee Roster + Department roster + Status form" },
  { cmd: "what is the workforce push",             desc: "👥 Workforce — aggregates roster details into the GL accounts of the planning cube" },
  // ── Users / security ──────────────────────────────────────────
  { cmd: "how do I add new users and assign roles", desc: "🔐 Users — OCI Identity Domain + NSPB role (Admin / Power User / User)" },
  // ── Differences ───────────────────────────────────────────────
  { cmd: "what is the difference between PBCS and NSPB", desc: "📘 Same product, different packaging" },
  { cmd: "how does NSPB differ from on-prem Hyperion Planning", desc: "📘 Cloud delivery, REST APIs, integrated Data Management" },
  // ── Files / snapshots ─────────────────────────────────────────
  { cmd: "what is the role of EPM Automate",       desc: "🛠️ EPM Automate — CLI for backup, snapshot, restore (most ops also via REST)" },
  { cmd: "how do I list files in NSPB inbox",      desc: "📁 `list files` shows snapshots/exports. `delete file <name>` removes one" },
];
// /show — READ-ONLY queries that EXECUTE (list / find / count / cross-ref).
// Any user can run these. No mutations.
const SHOW_ITEMS = [
  // ── App-level inventory ─────────────────────────────────────
  { cmd: "show environment",      icon: "🌍", desc: "Tenant health dashboard",                                fill: "show environment" },
  { cmd: "show navigation flow",  icon: "🗺️", desc: "NSPB menu tree",                                         fill: "show navigation flow" },
  { cmd: "cubes",                 icon: "🧊", desc: "List cubes with their dimensions",                       fill: "cubes" },
  // ── Forms ────────────────────────────────────────────────────
  { cmd: "show all forms",        icon: "📂", desc: "Form inventory (~188 forms)",                            fill: "show all forms" },
  { cmd: "show review forms",     icon: "📂", desc: "Forms tagged as review (read-only)",                     fill: "show review forms" },
  { cmd: "show forms by cube NSP_NFS", icon: "📂", desc: "Forms grouped by cube",                             fill: "show forms by cube " },
  { cmd: "which forms for workforce", icon: "📂", desc: "Forms in a module (e.g. workforce)",                 fill: "which forms for " },
  { cmd: "list review forms for balance sheet", icon: "📂", desc: "Review forms in a specific area",          fill: "list review forms for " },
  // ── Rules ────────────────────────────────────────────────────
  { cmd: "show me the rules",     icon: "🧮", desc: "List business rules with descriptions",                  fill: "show me the rules" },
  { cmd: "which rules run on save", icon: "🧮", desc: "onSave rules across all forms",                        fill: "which rules run on save" },
  { cmd: "which rules run on load", icon: "🧮", desc: "onLoad rules across all forms",                        fill: "which rules run on load" },
  { cmd: "rules of <form>",       icon: "🔗", desc: "Which rules are attached to a specific form",            fill: "rules of " },
  { cmd: "which forms use rule <name>", icon: "🔗", desc: "Which forms reference a specific rule",            fill: "which forms use rule " },
  // ── Variables ────────────────────────────────────────────────
  { cmd: "show me the variables", icon: "🔧", desc: "Substitution variables (CurrentMonth, OpenYear, etc.)",  fill: "show me the variables" },
  // ── Dimensions / metadata ────────────────────────────────────
  { cmd: "show dimension",        icon: "📚", desc: "Live dim picker → writes DIM_X sheet",                   expand: "dims" },
  { cmd: "find member <id>",      icon: "🔎", desc: "Locate a member across all dims",                        fill: "find member " },
  { cmd: "does member <id> exist", icon: "🔎", desc: "Yes/no existence check",                                fill: "does member " },
  { cmd: "which dim contains <id>", icon: "🔎", desc: "Which dimension a code lives in",                      fill: "which dim contains " },
  { cmd: "dimensions of <Cube>",  icon: "📚", desc: "List dimensions of a specific cube",                     fill: "dimensions of " },
  { cmd: "list <Dim> members",    icon: "📚", desc: "Flat member list for a dimension",                       fill: "list " },
  { cmd: "show me the Scenario hierarchy", icon: "🌳", desc: "Display Scenario tree inline",                  fill: "show me the Scenario hierarchy" },
  // ── Tenant counts (Q&A style — answered from cached KB) ─────
  { cmd: "how many forms in this tenant",   icon: "🏢", desc: "Counts forms by category",                     fill: "how many forms in this tenant" },
  { cmd: "how many rules in this tenant",   icon: "🏢", desc: "Counts rules and their attachments",           fill: "how many rules in this tenant" },
  { cmd: "how many dimensions in NSP_NFS",  icon: "🏢", desc: "Count dims of the main cube",                  fill: "how many dimensions in NSP_NFS" },
  { cmd: "how many substitution variables", icon: "🏢", desc: "Count vars",                                   fill: "how many substitution variables" },
  { cmd: "how many DM integrations",        icon: "🏢", desc: "Count DM pipelines",                           fill: "how many DM integrations" },
  { cmd: "how many cubes",                  icon: "🏢", desc: "Count cubes",                                  fill: "how many cubes" },
  // ── Jobs (read-only) ─────────────────────────────────────────
  { cmd: "show recent jobs",      icon: "⏱️", desc: "Recently executed jobs (status + duration)",              fill: "show recent jobs" },
  { cmd: "show job status <id>",  icon: "🔎", desc: "Detail status of a specific job ID",                     fill: "show job status " },
  // ── Data Management (read-only) ──────────────────────────────
  { cmd: "show DM integrations",                       icon: "📦", desc: "List Data Management integrations",  fill: "show DM integrations" },
  { cmd: "show details of integration <name>",         icon: "📦", desc: "Drill into a specific integration",  fill: "show details of integration " },
  { cmd: "show mapping for <integration>",             icon: "🔁", desc: "All dim mappings for an integration", fill: "show mapping for " },
  { cmd: "show pipeline <name>",                       icon: "🛠️", desc: "Detail a DM pipeline (steps + schedule)", fill: "show pipeline " },
];

// /admin — ADMIN ACTIONS that MODIFY state. Require admin role. Confirmation
// recommended.
const ADMIN_ITEMS = [
  // ── Run jobs / rules / pipelines ────────────────────────────
  { cmd: "run job <name>",           icon: "▶️", desc: "Execute a scheduled NSPB job by name",                fill: "run job " },
  // ── Substitution variables (live REST, no EPM Automate) ─────
  { cmd: "update variables",                          icon: "🧮", desc: "Open the substitution-variable editor — pick from a live list and edit any of them inline", fill: "update variables" },
  { cmd: "set variable <name> = <value>",             icon: "🧮", desc: "Update ONE app-level substitution variable via REST (instant, no EPM Automate)", fill: "set variable " },
  { cmd: "set variable <name> = <value> in <Cube>",   icon: "🧮", desc: "Update ONE cube-scoped substitution variable",  fill: "set variable " },
  // ── File ops on NSPB inbox/outbox (Interop REST, no EPM Automate) ─
  { cmd: "list files",                                icon: "📁", desc: "Show all files in NSPB inbox/outbox (snapshots, exports, imports)", fill: "list files" },
  { cmd: "import <name>",                             icon: "📊", desc: "Download a level-0 DATAEXPORT (or any CSV) from the NSPB outbox and render it into a new sheet", fill: "import " },
  { cmd: "delete file <name>",                        icon: "🗑️", desc: "Remove a file from inbox/outbox by exact name", fill: "delete file " },
  { cmd: "download file <name>",                      icon: "📥", desc: "Download a file from inbox/outbox to your machine", fill: "download file ", wip: true },
  { cmd: "upload file from this sheet",               icon: "📤", desc: "Save the active sheet as a CSV/ZIP and upload it to NSPB inbox", fill: "upload file from this sheet", wip: true },
  // ── Run DM integrations / pipelines ─────────────────────────
  { cmd: "run integration <name>",                     icon: "▶️", desc: "Execute a single DM integration by name (AIF REST)",      fill: "run integration ", wip: true },
  { cmd: "run data rule <name> <start> <end>",         icon: "▶️", desc: "Execute a DM data rule with period range (REPLACE / STORE_DATA defaults)", fill: "run data rule ", wip: true },
  { cmd: "run pipeline <name>",                        icon: "▶️", desc: "Execute a DM pipeline (multi-step orchestration)", fill: "run pipeline ", wip: true },
  { cmd: "run main pipeline",                          icon: "▶️", desc: "Auto-detect and run the tenant's main pipeline (largest / most-recent run)", fill: "run main pipeline", wip: true },
  { cmd: "show last pipeline run",                     icon: "🔎", desc: "Status + duration of the last pipeline execution", fill: "show last pipeline run", wip: true },
  // ── DESTRUCTIVE admin actions — require admin role + confirm ─
  { cmd: "kill all running jobs",                      icon: "🛑", desc: "⚠ Cancel every job in PROCESSING/RUNNING state (Planning + DM)",  fill: "kill all running jobs", wip: true },
  { cmd: "cancel job <id>",                            icon: "🛑", desc: "Cancel a single running job by ID",                                fill: "cancel job ", wip: true },
  { cmd: "logout all sessions",                        icon: "👋", desc: "⚠ Force-logout every active NSPB user session",                    fill: "logout all sessions", wip: true },
  { cmd: "enter maintenance mode",                     icon: "🔧", desc: "⚠ Put the app in admin-only mode (kicks active users)",            fill: "enter maintenance mode", wip: true },
  { cmd: "exit maintenance mode",                      icon: "🔧", desc: "Re-open the app to all users",                                     fill: "exit maintenance mode", wip: true },
  // ── Dimension export (REST GET — no Job Definition needed) ──
  { cmd: "export Account dimension",                   icon: "📤", desc: "Export Account dim → DIM_Account sheet (live REST, no Job Definition needed)",   fill: "export Account dimension" },
  { cmd: "export <Dim> dimension",                     icon: "📤", desc: "Export any dim → DIM_<Dim> sheet",         fill: "export " },
  { cmd: "export <Dim> dimension from <Cube>",         icon: "📤", desc: "Export from a specific cube (e.g. Rpt)",    fill: "export " },
  { cmd: "show me the Scenario hierarchy",             icon: "🌳", desc: "Display Scenario tree inline",              fill: "show me the Scenario hierarchy" },
  // ── Dimension import (PATCH live REST) — for AI-generated files use /build ─
  { cmd: "import dimension from this sheet",           icon: "📥", desc: "PATCH dim members from active sheet (dry-run first). For AI-generated import files, see /build", fill: "import dimension from this sheet" },
  { cmd: "submit dimension import to NSPB",            icon: "🚀", desc: "End-to-end: build (AI) → upload → run IMPORT_METADATA job → poll status", fill: "submit dimension import to NSPB", wip: true },
  // ── Metadata / Data export-import via Planning Job Definitions ─
  { cmd: "run job <name>",                             icon: "▶️", desc: "Submit any pre-defined Planning job by name (covers exportMetadata, importMetadata, exportData, importData, planTypeMap)", fill: "run job " },
  { cmd: "export data via job <name>",                 icon: "📤", desc: "Run a pre-defined EXPORT_DATA job (output ZIP appears in inbox)", fill: "run job ", wip: true },
  { cmd: "import data via job <name>",                 icon: "📥", desc: "Run a pre-defined IMPORT_DATA job (file must already be in inbox)", fill: "run job ", wip: true },
  // ── Alias rename ────────────────────────────────────────────
  { cmd: "rename alias of <Member> to <NewAlias>",     icon: "✏️", desc: "Rename alias for one member",               fill: "rename alias of " },
  { cmd: "change alias of <Member> to <Alias> in <Dim>", icon: "✏️", desc: "Rename alias scoped to one dim",          fill: "change alias of " },
  // SmartView mapping moved to /build (AI-generative, not a tenant action).
  // ── Failures / errors monitoring ────────────────────────────
  { cmd: "show failed jobs",                           icon: "❌", desc: "List jobs that failed (last 24h / 7d / 30d)",  fill: "show failed jobs", wip: true },
  { cmd: "show failed jobs last 24h",                  icon: "❌", desc: "Failed jobs in the last 24 hours",             fill: "show failed jobs last 24h", wip: true },
  { cmd: "show failed jobs last 7 days",               icon: "❌", desc: "Failed jobs in the last 7 days",               fill: "show failed jobs last 7 days", wip: true },
  { cmd: "show errors of job <id>",                    icon: "❌", desc: "Detail error logs for a specific failed job",  fill: "show errors of job ", wip: true },
  { cmd: "retry failed job <id>",                      icon: "🔁", desc: "Re-run a previously failed job",                fill: "retry failed job ", wip: true },
  { cmd: "show failed DM integrations",                icon: "❌", desc: "Data Management runs that errored out",         fill: "show failed DM integrations", wip: true },
  { cmd: "show errors of DM integration <name>",       icon: "❌", desc: "Detail error logs for a specific DM run",        fill: "show errors of DM integration ", wip: true },
  { cmd: "retry failed DM integration <name>",         icon: "🔁", desc: "Re-trigger a previously failed DM run",         fill: "retry failed DM integration ", wip: true },
  { cmd: "show errors in last 24h",                    icon: "🚨", desc: "Combined: jobs + DM + import errors, last 24h",  fill: "show errors in last 24h", wip: true },
];
// Each check uses a DIFFERENT color so multiple passes are distinguishable.
// Color is picked automatically from (target × tracker) combo.
const CHECK_COLORS = {
  "Forecast|Load": "#fca5a5",  // red
  "Forecast|Unit": "#fdba74",  // orange
  "Budget|Load":   "#fef08a",  // yellow
  "Budget|Unit":   "#bef264",  // lime
};
// Each check shows the LITERAL command as title so the user learns the syntax.
// Description explains what it does in plain English. Color is auto-picked
// from (target × tracker) so multiple passes paint distinguishable colors.
const CHECK_TEMPLATES = [
  // ── Missing Forecast ─────────────────────────────────────────
  { cmd: "check fy25 actuals without forecast tp1-tp9",
    desc: "🔴 Items with Actual $ but no Forecast — FY25 Jan-Sep" },
  { cmd: "check fy25 actuals without forecast tp1-tp12",
    desc: "🔴 Items with Actual $ but no Forecast — FY25 full year" },
  { cmd: "check fy25 actuals without forecast tracker=Unit tp1-tp9",
    desc: "🟠 Items with Actual units but no Forecast — FY25 Jan-Sep" },
  { cmd: "check fy24 actuals without forecast tp10-tp12",
    desc: "🔴 Missing Forecast — FY24 Q4 only (closing year)" },
  // ── Missing Budget ───────────────────────────────────────────
  { cmd: "check fy25 actuals without budget tp1-tp12",
    desc: "🟡 Items with Actual $ but no Budget — FY25 full year" },
  { cmd: "check fy25 actuals without budget tracker=Unit tp1-tp12",
    desc: "🟢 Items with Actual units but no Budget — FY25 full year" },
  { cmd: "check fy26 actuals without budget tp1-tp12",
    desc: "🟡 Missing Budget for the upcoming plan year (FY26)" },
  // ── Lost customers (auto-detects current period, silent window = last N) ──
  { cmd: "check fy25 lost customers",
    desc: "🔵 Customers silent last 3 months — money still loaded as Forecast/Budget" },
  { cmd: "check fy25 lost customers last=2",
    desc: "🔵 Same but silent window = last 2 months only" },
  { cmd: "check fy25 lost customers tracker=Unit",
    desc: "🔵 Lost customers by units (qty) instead of dollars" },
  { cmd: "check fy25 lost customers only=forecast",
    desc: "🔵 Only flag customers with leftover Forecast (ignore Budget)" },
  { cmd: "check fy25 lost customers only=budget",
    desc: "🔵 Only flag customers with leftover Budget (ignore Forecast)" },
  // ── Combined multi-pass workflow ─────────────────────────────
  { cmd: "check fy25 actuals without forecast tp1-tp9",
    desc: "1️⃣ Workflow — pass 1: missing Forecast (🔴)" },
  { cmd: "check fy25 actuals without forecast tracker=Unit tp1-tp9",
    desc: "2️⃣ Workflow — pass 2: missing Unit Forecast (🟠)" },
  { cmd: "check fy25 actuals without budget tp1-tp12",
    desc: "3️⃣ Workflow — pass 3: missing Budget (🟡)" },
];

// /analyze covers TWO classes of analysis:
//   A. Operations on the ACTIVE GRID (no ask: prefix) — Top-N, compare,
//      variance drivers, trends, outliers, sheet narrative
//   B. Free-form ask: queries → Gemini writes SQL → runs on DuckDB
const ANALYZE_TEMPLATES = [
  // ── Active-grid: Top-N / Bottom-N ────────────────────────────
  { cmd: "top 10 accounts by revenue Q1 actual",       desc: "📈 Active grid — Top-N rank by metric" },
  { cmd: "top 5 subsidiaries by opex FY25",            desc: "📈 Active grid — Top 5 spenders" },
  { cmd: "bottom 10 items by margin",                  desc: "📉 Active grid — Bottom-N worst performers" },
  // ── Active-grid: Compare scenarios ──────────────────────────
  { cmd: "actual vs budget revenue by month FY25",     desc: "🆚 Active grid — A vs B with Δ and %Δ per period" },
  { cmd: "FY25 vs FY24 revenue by month",              desc: "🆚 Active grid — Year-over-year compare" },
  { cmd: "actual vs budget vs forecast revenue",       desc: "🆚 Active grid — 3-way compare" },
  // ── Active-grid: Variance drivers ───────────────────────────
  { cmd: "biggest variance drivers actual vs budget FY25", desc: "🔬 Active grid — who caused the gap (after Compare)" },
  { cmd: "which subsidiaries explain the gap",         desc: "🔬 Active grid — variance drivers by subsidiary" },
  { cmd: "top items driving Q1 over-spend",            desc: "🔬 Active grid — variance drivers by item" },
  // ── Active-grid: % of total / Pareto ────────────────────────
  { cmd: "revenue as % of total by subsidiary",        desc: "📊 Active grid — share of total per member" },
  { cmd: "each department's share of opex",            desc: "📊 Active grid — concentration" },
  { cmd: "which item is 80% of revenue",               desc: "📊 Active grid — 80/20 Pareto" },
  // ── Active-grid: Trends / outliers ──────────────────────────
  { cmd: "revenue MoM growth FY25",                    desc: "📈 Active grid — month-over-month growth" },
  { cmd: "YoY trend by subsidiary",                    desc: "📈 Active grid — year-over-year trend" },
  { cmd: "3-month moving average of revenue",          desc: "📈 Active grid — moving average" },
  { cmd: "what are the main anomalies here",           desc: "⚠️ Active grid — flag unusual rows/months" },
  { cmd: "find outliers in this sheet",                desc: "⚠️ Active grid — outliers, alt phrasing" },
  // ── Active-grid: Insights / narrative ───────────────────────
  { cmd: "analyze this sheet",                         desc: "🧠 Insights — Gemini narrative on the active grid" },
  { cmd: "analyze and focus on variances",             desc: "🧠 Insights — narrative focused on variances" },
  { cmd: "what are the key insights from this sheet",  desc: "🧠 Insights — top findings + suggested follow-ups" },
  { cmd: "summarize this sheet for an executive",      desc: "🧠 Insights — exec summary of the active grid" },
  // ── Active-grid: Data quality ───────────────────────────────
  { cmd: "data quality of this sheet",                 desc: "🧹 Quality — find blanks, dupes, suspicious zeros" },
  { cmd: "check for missing values in this sheet",     desc: "🧹 Quality — list rows with gaps" },
  { cmd: "check for negative or zero values that should not be zero", desc: "🧹 Quality — suspicious zeros / negatives" },
  // ── DuckDB free-form (ask:) — SQL via Gemini on loaded table ─
  { cmd: "ask: top 10 items by revenue load fy25 actual",                        desc: "🦆 DuckDB ask — top items by $ FY25" },
  { cmd: "ask: variance actual vs forecast load fy25 by subsidiary",             desc: "🦆 DuckDB ask — variance % per sub" },
  { cmd: "ask: variance actual vs budget load fy25 by item top 20",              desc: "🦆 DuckDB ask — biggest A-vs-B item gaps" },
  { cmd: "ask: which items have revenue load fy25 dropping 3 months in a row",   desc: "🦆 DuckDB ask — declining items" },
  { cmd: "ask: items with biggest month-over-month revenue drop fy25",           desc: "🦆 DuckDB ask — biggest MoM drops" },
  { cmd: "ask: year-over-year revenue growth fy25 vs fy24 by subsidiary",        desc: "🦆 DuckDB ask — YoY by sub" },
  { cmd: "ask: average selling price by item fy25 monthly",                      desc: "🦆 DuckDB ask — ASP trend" },
  { cmd: "ask: items with price drift greater than 20 percent month over month fy25", desc: "🦆 DuckDB ask — pricing anomalies" },
  { cmd: "ask: gross margin by class fy25",                                      desc: "🦆 DuckDB ask — margin per class" },
  { cmd: "ask: items with actual revenue but zero budget fy25",                  desc: "🦆 DuckDB ask — coverage gaps" },
  { cmd: "ask: total revenue and units by tracker scenario years",               desc: "🦆 DuckDB ask — big picture summary" },
];
function initSlashPalette() {
  const palette = document.getElementById("slash-palette");
  const list    = document.getElementById("slash-palette-list");
  const header  = document.getElementById("slash-palette-header");
  const input   = document.getElementById("input");
  if (!palette || !input) return;
  let mode = "categories";   // "categories" | "forms" | "rules" | "dims" | "checks"
  let items = [];            // current items shown
  let selectedIdx = 0;
  const close = () => { palette.classList.add("hidden"); mode = "categories"; };
  const fillAndClose = (text, autoSend) => {
    input.value = text;
    close();
    input.focus();
    // Move caret to end
    setTimeout(() => { input.setSelectionRange(text.length, text.length); }, 0);
    if (autoSend && typeof onSend === "function") onSend();
  };
  const render = (title, rows) => {
    header.textContent = title;
    list.innerHTML = "";
    // Filter out divider rows from `items` (used for keyboard navigation) so
    // up/down keys skip headers but the visual list still shows them.
    items = rows.filter(r => !r.divider);
    let itemIdx = 0;
    rows.forEach((r) => {
      // Section divider — non-interactive header row used to group forms
      // by module / "in navigation" vs "other".
      if (r.divider) {
        const hdr = document.createElement("div");
        hdr.className = "slash-section-header";
        hdr.style.cssText = "padding:6px 12px 3px 12px;font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;border-top:1px solid #e5e7eb;background:#fafafa;";
        if (rows.indexOf(r) === 0) hdr.style.borderTop = "0";
        hdr.textContent = r.label || "";
        list.appendChild(hdr);
        return;
      }
      const i = itemIdx++;
      const div = document.createElement("div");
      div.className = "slash-item"
        + (i === selectedIdx ? " selected" : "")
        + (r.wip ? " slash-item-wip" : "");
      const wipBadge = r.wip ? `<span class="slash-item-wip-badge">dev pending</span>` : "";
      const colorBadge = r.badge
        ? `<span class="slash-item-cat-badge" style="background:${r.badge.bg};color:${r.badge.fg};">${escapeHtml(r.badge.text)}</span>`
        : "";
      div.innerHTML = `
        <span class="slash-item-icon">${r.icon || "▸"}</span>
        <span class="slash-item-cmd">${escapeHtml(r.cmd || r.label || "")}</span>
        ${colorBadge}
        <span class="slash-item-desc">${escapeHtml(r.desc || "")}</span>
        ${wipBadge}
        ${r.meta ? `<span class="slash-item-meta">${escapeHtml(r.meta)}</span>` : ""}
      `;
      // stopPropagation: render() rebuilds .slash-item nodes on selection,
      // which detaches e.target before document.click runs — that close()
      // fired prematurely. Stopping the bubble keeps the new sub-list visible.
      div.addEventListener("click", (e) => {
        e.stopPropagation();
        selectItem(r);
      });
      list.appendChild(div);
    });
    palette.classList.remove("hidden");
  };
  const escapeHtml = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  // Live KB lookups — reads window.NSPB_TENANT_KB cached from /api/tenant-kb
  const getKb = () => (window.NSPB_TENANT_KB || {});
  const showCategories = (filter) => {
    const q = (filter || "").toLowerCase();
    const matched = SLASH_CATEGORIES.filter(c =>
      !q || c.cmd.toLowerCase().includes(q) || c.desc.toLowerCase().includes(q)
    );
    selectedIdx = 0;
    render("Commands — type to filter", matched);
  };
  const showForms = (filter, opts) => {
    const o = opts || {};
    // fillVerb='openform' (default) for open, 'explain form' for explain.
    // The title prefix mirrors the verb so the picker header reads correctly.
    const fillVerb = o.fillVerb || "openform";
    const titleVerb = o.titleVerb || "Open form";
    const q = (filter || "").toLowerCase();
    const kb = getKb();
    // Merge tenant KB forms + live-discovered forms cached in FORMS_KEY by
    // the Discover button. Either source alone might be empty depending on
    // which path the user has run. Dedupe by lowercased name.
    let liveForms = [];
    try {
      const fw = window.NSPB_LIVE_FORMS_CACHE;
      if (fw && Array.isArray(fw)) liveForms = fw;
    } catch (_) {}
    // The LCM parser is the authoritative source for "what's a real data
    // form". When kb.forms has data (>= 5 items), we trust it completely
    // and ignore the live SmartView discovery — that discovery walks
    // req_ListDocuments which returns dashboards, composites, FR-like
    // artifacts mixed in with real forms, and there's no reliable type
    // field to tell them apart. Names like "NFS_Balance Sheet Dashboard"
    // or "Balance Sheet Report - Group Consolidated" were leaking through.
    //
    // If the KB is genuinely empty (no LCM uploaded yet), we fall back
    // to live discovery so the user still sees something — but with a
    // heuristic blocklist that strips obvious dashboard/report names.
    const kbForms = (kb.forms || []);
    const useLive = kbForms.length < 5;
    const seenLower = new Set();
    const merged = [];
    const pushUnique = (f) => {
      if (!f || !f.name) return;
      const k = f.name.toLowerCase().trim();
      if (seenLower.has(k)) return;
      seenLower.add(k);
      merged.push(f);
    };
    for (const f of kbForms) pushUnique(f);
    if (useLive) {
      // Fallback: heuristic blocklist on the live list — drop names that
      // smell like dashboards / FRs based on common suffixes / words.
      const looksLikeNonForm = (name) => /\b(dashboard|report|kpi|book)\b/i.test(name || "");
      for (const f of liveForms) {
        if (!looksLikeNonForm(f.name)) pushUnique(f);
      }
    }
    const allForms = merged.filter(f => !q || f.name.toLowerCase().includes(q));
    allForms.sort((a, b) => a.name.localeCompare(b.name));
    selectedIdx = 0;

    // Build a "form name → module label" map from the navigation flow.
    // Forms not in any module go to a separate "Other" section at the
    // bottom. The result: the user sees the 10-20 forms users actually
    // touch on top, organized by module, with the long tail below.
    const mainFlow = (kb.navigationFlows || []).find(f => f.modules && f.modules.length);
    const formToModule = new Map();   // lowercased form name → module label
    if (mainFlow) {
      const norm = s => (s||"").toLowerCase().replace(/^nfs_/, "").replace(/\.+$/, "").trim();
      for (const mod of (mainFlow.modules || [])) {
        const label = mod.module || mod.label || mod.name || "Module";
        // tabsDetail v4 has structured items; tabs[] is just labels
        const names = [];
        if (Array.isArray(mod.tabsDetail)) {
          for (const t of mod.tabsDetail) {
            if (t.type === "form" || !t.type) {
              names.push(t.artifactName || t.label || "");
            }
          }
        }
        if (Array.isArray(mod.tabs)) names.push(...mod.tabs);
        for (const n of names.filter(Boolean)) {
          // Match by both exact and normalized name (NSPB has NFS_ prefixes
          // and trailing dots that vary between LCM and runtime).
          formToModule.set((n||"").toLowerCase(), label);
          formToModule.set(norm(n), label);
        }
      }
    }

    // Bucket the forms: by module if found, else "Other".
    const buckets = new Map();   // module label → forms[]
    const other = [];
    for (const f of allForms) {
      const fn = (f.name||"").toLowerCase();
      const fnNorm = fn.replace(/^nfs_/, "").replace(/\.+$/, "").trim();
      const mod = formToModule.get(fn) || formToModule.get(fnNorm);
      if (mod) {
        if (!buckets.has(mod)) buckets.set(mod, []);
        buckets.get(mod).push(f);
      } else {
        other.push(f);
      }
    }

    // Build an item for each form (badge + fill + attached-rules summary).
    const toItem = (f) => {
      let badge = null;
      const cat = (f.category || "").toLowerCase();
      const isInput = f.isInput === true || cat === "input";
      const isReview = f.isInput === false || cat === "review";
      const isDash = f.type === 8 || cat === "dashboard";
      if (isDash)        badge = { text: "DASH",   bg: "#dbeafe", fg: "#1e3a8a" };
      else if (isInput)  badge = { text: "INPUT",  bg: "#dcfce7", fg: "#166534" };
      else if (isReview) badge = { text: "REVIEW", bg: "#f3e8ff", fg: "#581c87" };
      // Compose desc: cube + rules summary. Show first 2 rule names; if more,
      // suffix with "+ N more". Rules with runOnSave get a ⚡ marker.
      const cubeStr = f.cube ? `cube ${f.cube}` : "";
      const rules = Array.isArray(f.attachedRules) ? f.attachedRules : [];
      let rulesStr = "";
      if (rules.length) {
        const visible = rules.slice(0, 2).map(r => {
          const nm = r.name || r;
          const onSave = r.runOnSave ? "⚡" : "";
          return `${onSave}${nm}`;
        }).join(", ");
        const more = rules.length > 2 ? ` +${rules.length - 2}` : "";
        rulesStr = `🧮 ${visible}${more}`;
      }
      const desc = [cubeStr, rulesStr].filter(Boolean).join(" · ");
      // Use form description (from LCM) as meta if present, else path.
      const formDesc = (f.description || "").replace(/\s+/g, " ").trim().slice(0, 80);
      const meta = formDesc || f.path || "";
      return {
        // Show the FULL command in the cmd column so the user sees what
        // will be sent on Enter ("explain form Income Statement.").
        // Without the verb prefix the picker just showed the form name
        // and it wasn't obvious that selecting it would explain vs open.
        cmd: `${fillVerb} ${f.name}`,
        icon: f.type === 8 ? "📊" : "📋",
        badge,
        desc,
        meta,
        // fillVerb chooses between "openform <name>" (default) and
        // "explain form <name>" (when invoked from the explain palette).
        fill: `${fillVerb} ${f.name}`
      };
    };

    const rows = [];
    const inNavCount = [...buckets.values()].reduce((sum, arr) => sum + arr.length, 0);

    if (inNavCount > 0) {
      // Sort modules alphabetically; forms inside each module already sorted.
      const sortedModules = [...buckets.keys()].sort();
      for (const modLabel of sortedModules) {
        const formsInMod = buckets.get(modLabel);
        rows.push({ divider: true, label: `📁 ${modLabel} (${formsInMod.length})` });
        for (const f of formsInMod) rows.push(toItem(f));
      }
    }

    if (other.length) {
      rows.push({ divider: true, label: `📦 Other forms — not in navigation (${other.length})` });
      // Cap "other" at 50 so the menu doesn't get unwieldy on tenants with 200+ forms.
      for (const f of other.slice(0, 50)) rows.push(toItem(f));
      if (other.length > 50) {
        rows.push({ divider: true, label: `… and ${other.length - 50} more — type to filter` });
      }
    }

    const title = mainFlow
      ? `${titleVerb} — ${inNavCount} in navigation · ${other.length} other`
      : `${titleVerb} — ${allForms.length} match${allForms.length === 1 ? "" : "es"}`;
    render(title, rows);

    if (!allForms.length) {
      // Diagnostic: show exactly what sources were checked + their sizes,
      // so when the picker comes up empty we can figure out which storage
      // is broken (tenant KB vs live discovery vs both).
      const kbCount = (kb && Array.isArray(kb.forms)) ? kb.forms.length : 0;
      const liveCount = liveForms.length;
      const kbType = kb ? typeof kb : "null";
      const kbKeys = (kb && typeof kb === "object") ? Object.keys(kb).slice(0, 10).join(", ") : "—";
      list.innerHTML = `<div class="slash-item"><span class="slash-item-desc">
        <strong>0 forms found.</strong><br>
        <code>tenantKb.forms</code>: ${kbCount} · <code>liveForms</code>: ${liveCount}<br>
        <code>tenantKb</code> shape: ${kbType} · keys: ${kbKeys}<br>
        Try: <code>show all forms</code>, then re-open this picker.
      </span></div>`;
    }
  };
  const showRules = (filter, opts) => {
    const o = opts || {};
    const fillVerb = o.fillVerb || "run rule";
    const titleVerb = o.titleVerb || "Run rule";
    const subtitle = o.subtitle || "(executes via NSPB API)";
    // brOnly = true → keep only callable Business Rules. Drops auto-fire
    // calc scripts (CURRENCY, DEFAULT, member formulas) that the user
    // can't invoke. A rule is considered BR if EITHER:
    //   • scriptType === 'groovy'                (modern Calc Manager BR)
    //   • attachedToForms.length > 0             (used by a form — callable)
    //   • kind === 'runnable'                    (parser-tagged)
    // For "Run rule" we keep this filter on by default since you can't
    // run a calc-script anyway. For "Explain rule" we also keep BR-only
    // because the explain palette is for "rules the user works with".
    const brOnly = o.brOnly !== false; // default true
    const q = (filter || "").toLowerCase();
    let rules = (getKb().rules || []).filter(r => r.name && (!q || r.name.toLowerCase().includes(q)));
    if (brOnly) {
      // CURRENCY and DEFAULT are NSPB reserved names — they're auto-fire
      // calc scripts that Smart View runs on its own. They appear attached
      // to dozens of forms because every form has them, but they're not
      // user-callable Business Rules.
      const RESERVED = new Set(["CURRENCY", "DEFAULT", "AGGREGATION", "CONSOLIDATION"]);
      rules = rules.filter(r => {
        if (!r.name) return false;
        if (RESERVED.has(r.name.toUpperCase())) return false;
        return r.kind === "runnable"
            || r.scriptType === "groovy"
            || (Array.isArray(r.attachedToForms) && r.attachedToForms.length > 0);
      });
    }
    rules.sort((a, b) => a.name.localeCompare(b.name));
    selectedIdx = 0;
    const brHint = brOnly ? " · Business Rules only (calc scripts filtered out)" : "";
    render(`${titleVerb} — ${rules.length} match${rules.length === 1 ? "" : "es"} ${subtitle}${brHint}`,
      rules.slice(0, 50).map(r => ({
        cmd: `${fillVerb} ${r.name}`,
        icon: "▶️",
        desc: (r.description || "").slice(0, 60) + ((r.description || "").length > 60 ? "…" : ""),
        fill: `${fillVerb} ${r.name}`
      }))
    );
    if (!rules.length) {
      list.innerHTML = `<div class="slash-item"><span class="slash-item-desc">No rules in KB. Run <code>show me the rules</code> first.</span></div>`;
    }
  };
  // Live picker for substitution variables, used by "explain variable X".
  // Reads tenantKb.substitutionVariables and lists each with its current
  // value, plus a fill command that fires the explain tool.
  const showVarsForExplain = (filter) => {
    const q = (filter || "").toLowerCase();
    const tkb = getKb() || {};
    const vars = (tkb.substitutionVariables || tkb.variables || [])
      .filter(v => v && v.name && (!q || v.name.toLowerCase().includes(q) || (v.value || "").toString().toLowerCase().includes(q)));
    vars.sort((a, b) => a.name.localeCompare(b.name));
    selectedIdx = 0;
    render(`Explain variable — ${vars.length} match${vars.length === 1 ? "" : "es"} (opens the AI tutor on the selected variable)`,
      vars.slice(0, 80).map(v => ({
        cmd: `explain variable ${v.name}`,
        icon: "🔧",
        desc: (v.value !== undefined && v.value !== null) ? `= ${String(v.value).slice(0, 50)}` : "",
        meta: v.cube || v.plantype || "",
        fill: `explain variable ${v.name}`
      }))
    );
    if (!vars.length) {
      list.innerHTML = `<div class="slash-item"><span class="slash-item-desc">No substitution variables in KB. Run <code>show me the variables</code> first.</span></div>`;
    }
  };

  // Live picker for account-dimension members, used by "explain account X".
  // Filters required: the parsed Account dim has ~876 entries but many are
  // formula text (CSV column-split bleed) rather than real names. We reject
  // anything that contains '->' or '@' or starts with '(' or ends with ';'.
  // Picker also requires a non-empty filter — empty input shows a hint
  // instead of dumping the whole dimension (was overwhelming).
  const showAccounts = (filter) => {
    const q = (filter || "").trim().toLowerCase();
    const kb = getKb() || {};
    const dims = kb.dimensions || {};
    const accountDim = dims.Account || dims.account || [];
    if (!Array.isArray(accountDim) || !accountDim.length) {
      render("Explain account",
        [{ icon: "💡", cmd: "explain account ", desc: "No Account dimension in KB. Type the account name after `explain account` and send.", fill: "explain account " }]
      );
      return;
    }
    // Discard pseudo-members whose 'name' is really a formula fragment.
    const isRealName = (n) => n && !/[\->@(;]/.test(n) && n.length < 80;
    const all = accountDim.filter(m => m && isRealName(m.name));
    if (!q) {
      // No filter yet — show a hint card + a few example top-level accounts.
      const samples = all.filter(m => !m.parent).slice(0, 8);
      render(`Explain account — type to filter ${all.length} accounts`,
        [{ icon: "💡", cmd: "explain account <name>", desc: "Start typing the account name to filter. Top-level accounts shown below as examples.", fill: "explain account " }]
          .concat(samples.map(m => ({
            cmd: `explain account ${m.name}`,
            icon: "💰",
            desc: m.alias && m.alias !== m.name ? m.alias.slice(0, 50) : "",
            meta: "(top-level)",
            fill: `explain account ${m.name}`
          })))
      );
      return;
    }
    let members = all.filter(m =>
      m.name.toLowerCase().includes(q) || (m.alias || "").toLowerCase().includes(q)
    );
    members.sort((a, b) => {
      const aTop = a.parent ? 1 : 0;
      const bTop = b.parent ? 1 : 0;
      if (aTop !== bTop) return aTop - bTop;
      return a.name.localeCompare(b.name);
    });
    selectedIdx = 0;
    render(`Explain account — ${members.length} match${members.length === 1 ? "" : "es"} for "${q}"`,
      members.slice(0, 50).map(m => ({
        cmd: `explain account ${m.name}`,
        icon: "💰",
        desc: m.alias && m.alias !== m.name ? m.alias.slice(0, 50) : "",
        meta: m.parent || "(top-level)",
        fill: `explain account ${m.name}`
      }))
    );
    if (!members.length) {
      list.innerHTML = `<div class="slash-item"><span class="slash-item-desc">No accounts match "${q}". Try a shorter prefix.</span></div>`;
    }
  };

  const showDims = (filter) => {
    const q = (filter || "").toLowerCase();
    // Pull dim names from EVERY available source so the picker is rich:
    //   1) appConfig.cubeDims (per-cube dim arrays)
    //   2) appConfig.catalog (legacy shape: cube → {dimensions: []})
    //   3) tenant KB nav-flow / form metadata that mentions dim names
    // Dedup by lowercased name. Each entry carries the cubes it belongs to
    // so the user can pick "Account in Plan" vs "Account in Workforc" if
    // dim names overlap (common — Account exists in 3 cubes).
    const ac = window.NSPB_APPCONFIG || {};
    const allDims = new Map();   // lowercaseName → { name, cubes[] }
    const addDim = (name, cube) => {
      if (!name) return;
      const k = name.toLowerCase();
      if (!allDims.has(k)) allDims.set(k, { name, cubes: [] });
      const entry = allDims.get(k);
      if (cube && !entry.cubes.includes(cube)) entry.cubes.push(cube);
    };
    if (ac.cubeDims && typeof ac.cubeDims === "object") {
      for (const cube of Object.keys(ac.cubeDims)) {
        for (const d of ac.cubeDims[cube] || []) addDim(d, cube);
      }
    }
    if (ac.catalog && typeof ac.catalog === "object") {
      for (const cube of Object.keys(ac.catalog)) {
        const dims = (ac.catalog[cube] && ac.catalog[cube].dimensions) || [];
        for (const d of dims) addDim(d, cube);
      }
    }
    const list2 = [...allDims.values()].filter(d => !q || d.name.toLowerCase().includes(q));
    list2.sort((a, b) => a.name.localeCompare(b.name));
    selectedIdx = 0;
    render(`Show dimension — ${list2.length} match${list2.length === 1 ? "" : "es"}`,
      list2.map(d => ({
        cmd: `show me the ${d.name} dimension`,
        icon: "📚",
        desc: d.cubes.length ? `cubes: ${d.cubes.join(", ")} · writes DIM_${d.name}` : `writes DIM_${d.name} sheet`,
        fill: `show me the ${d.name} dimension`
      }))
    );
    if (!list2.length) {
      list.innerHTML = `<div class="slash-item"><span class="slash-item-desc">No dimensions cached. Run <code>show me the cubes</code> or Settings → <strong>Load everything</strong>.</span></div>`;
    }
  };
  const showChecks = (filter) => {
    const q = (filter || "").toLowerCase();
    const tpls = CHECK_TEMPLATES.filter(c => !q || c.cmd.toLowerCase().includes(q) || c.desc.toLowerCase().includes(q));
    selectedIdx = 0;
    render(`Pre-built deterministic checks (each color = different check)`,
      tpls.map(t => ({ cmd: t.cmd, icon: "🔍", desc: t.desc, fill: t.cmd, wip: t.wip || /🚧/.test(t.desc) })));
  };
  const showAdmin = (filter) => {
    const q = (filter || "").toLowerCase();
    const items = ADMIN_ITEMS
      .filter(c => !q || c.cmd.toLowerCase().includes(q) || c.desc.toLowerCase().includes(q))
      .map(c => ({ ...c, wip: c.wip }));
    selectedIdx = 0;
    render(`Admin actions — modify state (require admin role)`, items);
  };
  const showShow = (filter) => {
    const q = (filter || "").toLowerCase();
    const items = SHOW_ITEMS
      .filter(c => !q || c.cmd.toLowerCase().includes(q) || c.desc.toLowerCase().includes(q))
      .map(c => ({ ...c, wip: c.wip }));
    selectedIdx = 0;
    render(`Browse — read-only NSPB metadata (any user)`, items);
  };
  const showEpm = (filter) => {
    const q = (filter || "").toLowerCase();
    const items = [
      { cmd: "epm test",                      icon: "🖥️", desc: "Verify EPM Automate is installed and reachable",   fill: "epm test" },
      { cmd: "epm login",                     icon: "🔐", desc: "Generate the login command (PowerShell)",           fill: "epm login" },
      { cmd: "epm set var <name>=<value>",    icon: "🔧", desc: "Update a substitution variable",                    fill: "epm set var " },
      { cmd: "epm run rule <name>",           icon: "▶️", desc: "Generate runBusinessRule command",                  fill: "epm run rule " },
      { cmd: "epm export security",           icon: "🔒", desc: "Export user/group access to Security.csv",          fill: "epm export security" },
      { cmd: "epm audit log 30",              icon: "📋", desc: "Download audit log (last 30 days)",                 fill: "epm audit log 30" },
      { cmd: "epm export data",               icon: "📤", desc: "Export cube data to CSV (Data.zip)",                fill: "epm export data" },
      { cmd: "epm logout",                    icon: "👋", desc: "Logout from EPM Automate session",                  fill: "epm logout" },
    ].filter(c => !q || c.cmd.toLowerCase().includes(q) || c.desc.toLowerCase().includes(q));
    selectedIdx = 0;
    render(`EPM Automate — generates PowerShell scripts to run locally`, items);
  };
  const showTransform = (filter) => {
    const q = (filter || "").toLowerCase();
    const items = [
      { cmd: "load smartview as today",  icon: "📥", desc: "Load the active SmartView pivot into DuckDB (long format)", fill: "load smartview as today" },
      { cmd: "load smartview as <name>", icon: "📥", desc: "Same but with a custom table name",                          fill: "load smartview as " },
      { cmd: "tables",                   icon: "📑", desc: "List loaded DuckDB tables",                                  fill: "tables" },
      { cmd: "drop table <name>",        icon: "🗑️", desc: "Remove a table from DuckDB",                                fill: "drop table " },
      ...CHECK_TEMPLATES.map(t => ({ cmd: t.cmd, icon: "🔍", desc: t.desc, fill: t.cmd, wip: t.wip || /🚧/.test(t.desc) })),
    ].filter(c => !q || c.cmd.toLowerCase().includes(q) || c.desc.toLowerCase().includes(q));
    selectedIdx = 0;
    render(`Data ops — DuckDB load + deterministic checks (no AI, free)`, items);
  };
  const showAnalyze = (filter) => {
    const q = (filter || "").toLowerCase();
    const items = [
      { cmd: "ask: <free text>", icon: "✏️", desc: "Type your own question — Gemini writes the SQL", fill: "ask: " },
      ...ANALYZE_TEMPLATES.map(t => ({ cmd: t.cmd, icon: "🧠", desc: t.desc, fill: t.cmd, wip: t.wip || /🚧/.test(t.desc) })),
    ].filter(c => !q || c.cmd.toLowerCase().includes(q) || c.desc.toLowerCase().includes(q));
    selectedIdx = 0;
    render(`AI analysis — pre-built or your own (Gemini · ~$0.0002 per query)`, items);
  };
  const showHelp = (filter) => {
    const q = (filter || "").toLowerCase();
    const items = HELP_TEMPLATES
      .filter(c => !q || c.cmd.toLowerCase().includes(q) || c.desc.toLowerCase().includes(q))
      .map(t => ({ cmd: t.cmd, icon: "❓", desc: t.desc, fill: t.cmd, wip: t.wip || /🚧/.test(t.desc) }));
    selectedIdx = 0;
    render(`Q&A — how NSPB works, model concepts, this tenant's metadata`, items);
  };
  const showAdhoc = (filter) => {
    const q = (filter || "").toLowerCase();
    const items = ADHOC_TEMPLATES
      .filter(c => !q || c.cmd.toLowerCase().includes(q) || c.desc.toLowerCase().includes(q))
      .map(t => ({ cmd: t.cmd, icon: "📊", desc: t.desc, fill: t.cmd, wip: t.wip || /🚧/.test(t.desc) }));
    selectedIdx = 0;
    render(`Ad-hoc grids — build / zoom / pivot / filter / analyze`, items);
  };
  const showFormat = (filter) => {
    const q = (filter || "").toLowerCase();
    const items = FORMAT_TEMPLATES
      .filter(c => !q || c.cmd.toLowerCase().includes(q) || c.desc.toLowerCase().includes(q))
      .map(t => ({ cmd: t.cmd, icon: "🧹", desc: t.desc, fill: t.cmd, wip: t.wip || /🚧/.test(t.desc) }));
    selectedIdx = 0;
    render(`Format / polish / clean the active sheet`, items);
  };
  const showBuild = (filter) => {
    const q = (filter || "").toLowerCase();
    const items = BUILD_TEMPLATES
      .filter(c => !q || c.cmd.toLowerCase().includes(q) || c.desc.toLowerCase().includes(q))
      .map(t => ({ cmd: t.cmd, icon: "🏗️", desc: t.desc, fill: t.cmd, wip: t.wip || /🚧/.test(t.desc) }));
    selectedIdx = 0;
    render(`Build NSPB artifacts from a sheet (UNDER DEVELOPMENT)`, items);
  };
  const showMockup = (filter) => {
    const q = (filter || "").toLowerCase();
    const items = MOCKUP_TEMPLATES
      .filter(c => !q || c.cmd.toLowerCase().includes(q) || c.desc.toLowerCase().includes(q))
      .map(t => ({ cmd: t.cmd, icon: "🎨", desc: t.desc, fill: t.cmd, wip: true /* all mockup items are AI-generative, dev pending */ }));
    selectedIdx = 0;
    render(`AI-generate values: 📈 Forecast · 💰 Budget · 🎨 Fill / Mockup (UNDER DEVELOPMENT)`, items);
  };

  // ── Intent tree ────────────────────────────────────────────────────────
  // A second menu, organized by VERB (what the user is trying to do) instead
  // of by slash category. Triggered three ways:
  //   1. Type the verb directly (no `/`, no `?`) — handled via NL_INTENT
  //   2. Type `?` alone — shows the whole tree as a flat list
  //   3. Type `?<verb>` — drills into that verb (e.g. `?show`, `?run`)
  // Each leaf either has a `fill:` (sends a command), an `expand:` to an
  // existing live sub-list (forms / rules / dims), or a `wip: true` flag.
  const INTENT_TREE = {
    set: {
      icon: "🧮", label: "set — change one value",
      items: [
        { cmd: "set variable", desc: "Set ONE substitution variable (live REST)", fill: "set variable " },
        { cmd: "update variables", desc: "Open the variables editor — pick from a live list", fill: "update variables" },
        { cmd: "change alias", desc: "Rename a member alias", fill: "change alias ", wip: true },
      ],
    },
    show: {
      icon: "🔎", label: "show — list / browse metadata",
      items: [
        { cmd: "show cubes", desc: "List plan types & dimensions", fill: "show me the cubes" },
        { cmd: "show dimensions", desc: "Pick a dimension to dump", expand: "dims" },
        { cmd: "show forms", desc: "Open form picker (by module)", expand: "forms" },
        { cmd: "show rules", desc: "List business rules", fill: "show me the rules" },
        { cmd: "show variables", desc: "List substitution variables", fill: "show me the variables" },
        { cmd: "show jobs", desc: "Planning rule runs only", fill: "show jobs" },
        { cmd: "show dm jobs", desc: "Data Management runs only", fill: "show dm jobs" },
        { cmd: "show all jobs", desc: "Planning + DM combined", fill: "show all jobs" },
        { cmd: "show integrations", desc: "List Data Management integrations", fill: "show integrations", wip: true },
        { cmd: "show pipelines", desc: "List pipelines", fill: "show pipelines", wip: true },
        { cmd: "show navigation flow", desc: "Show the active navigation flow", fill: "show navigation flow" },
        { cmd: "show snapshots", desc: "LCM application backups in the outbox", fill: "show snapshots" },
        { cmd: "show files", desc: "All files in the interop outbox", fill: "show files" },
      ],
    },
    run: {
      icon: "▶️", label: "run — execute on the tenant",
      items: [
        { cmd: "run rule", desc: "Pick a business rule and run it", expand: "rules" },
        { cmd: "run job", desc: "Run a job by name", fill: "run job ", wip: true },
        { cmd: "run integration", desc: "Run a DM integration", fill: "run integration ", wip: true },
        { cmd: "run pipeline", desc: "Run a pipeline", fill: "run pipeline ", wip: true },
        { cmd: "run data rule", desc: "Run a DM data rule", fill: "run data rule ", wip: true },
      ],
    },
    open: {
      icon: "📋", label: "open — load form / dashboard",
      items: [
        { cmd: "open form", desc: "Pick a form to open (with data + rules)", expand: "forms" },
        { cmd: "open dashboard", desc: "Pick a dashboard", expand: "forms" },
      ],
    },
    close: {
      icon: "📋", label: "close — REPORT generator: month-end close pack (HTML + PDF)",
      items: [
        // ── RECIPES (most users start here) ───────────────────────────────
        // Each recipe expands to a section list on the server. User can
        // override with explicit `sections=[...]` for full control.
        { cmd: "Close quick (3 sections, ~10s)",          desc: "📋 Cover + Exec summary + P&L. The fastest version.",         fill: "generate close report quick recipe from this sheet" },
        { cmd: "Close standard (6 sections, ~25s)",       desc: "📋 + Balance sheet + variance commentary. The monthly default.", fill: "generate close report standard recipe from this sheet" },
        { cmd: "Close full (11 sections, ~50s)",          desc: "📋 + Cash flow + KPI dashboard + operating metrics + appendix.", fill: "generate close report full recipe from this sheet" },
        { cmd: "Close board pack (executive style)",      desc: "📊 Big numbers, less detail, board-friendly visuals.",        fill: "generate close report board recipe from this sheet" },
        { cmd: "Close audit pack (detail + recons)",      desc: "🔍 Full + reconciliations + JE log + FX (when available).",   fill: "generate close report audit recipe from this sheet" },
        // ── CUSTOM SECTION LIST ──────────────────────────────────────────
        { cmd: "Close custom — pick the sections",        desc: "🎛 Free-form: list which sections you want",                  fill: "generate close report with sections: cover, executive_summary, pnl_statement, balance_sheet" },
        // ── ENTITY / PERIOD MODIFIERS ────────────────────────────────────
        { cmd: "Close for specific entity + period",      desc: "🏢 Specify entity and period explicitly",                    fill: "generate close report for entity " },
        { cmd: "Close for Q1",                            desc: "📅 Quarter-end view",                                        fill: "generate close report for Q1 standard recipe" },
        { cmd: "Close for YTD",                           desc: "📅 Year-to-date pack",                                       fill: "generate close report YTD standard recipe" },
        // ── FOCUSED SINGLE-TOPIC VARIANTS ─────────────────────────────────
        { cmd: "Close P&L only (just income statement)",  desc: "📊 Sections = cover + exec + headline_kpis + pnl_statement", fill: "generate close report with sections: cover, executive_summary, headline_kpis, pnl_statement" },
        { cmd: "Close variance-focused",                  desc: "📊 P&L + heavy variance commentary",                          fill: "generate close report with sections: cover, executive_summary, headline_kpis, pnl_statement, variance_commentary" },
        { cmd: "Close KPI-only (dashboard view)",         desc: "📈 Skip the statements, just KPIs + metrics",                fill: "generate close report with sections: cover, headline_kpis, kpi_dashboard, operating_metrics" },
      ],
    },
    explain: {
      icon: "🧠", label: "explain — AI tutor grounded in the LCM-parsed tenant KB",
      items: [
        // ── EXPLAIN A RULE — the killer anti-churn feature ────────────────
        // Rule bodies (Groovy / CalcScript) are in tenant-kb.json so the AI
        // can reference them directly; user gets a real explanation, not
        // generic Hyperion fluff.
        { cmd: "Explain rule",                               desc: "📐 Browse every rule in your tenant",                              expand: "rules-explain" },
        { cmd: "Explain rule — walk through the script",     desc: "📜 Show the actual Groovy / CalcScript source + AI summary",      fill: "explain rule [NAME] — walk me through the script body" },
        { cmd: "Explain which rules reference an account",   desc: "🔗 Find every rule that mentions an account",                     expand: "accounts-explain" },
        // ── EXPLAIN A FORM ────────────────────────────────────────────────
        { cmd: "Explain form",                               desc: "📋 Browse every form in your tenant",                              expand: "forms-explain" },
        { cmd: "Explain which forms input an account",       desc: "✏️ Where can users key data for this account?",                  expand: "accounts-explain" },
        // ── EXPLAIN AN ACCOUNT ────────────────────────────────────────────
        { cmd: "Explain account",                            desc: "💰 Where editable, what calculates it, parent / level",         expand: "accounts-explain" },
        // ── EXPLAIN A SUBSTITUTION VARIABLE ───────────────────────────────
        { cmd: "Explain variable",                           desc: "🔧 What's the current value, which rules / forms use it",         expand: "vars-explain" },
        // ── EXPLAIN A CONCEPT (cell, multidimensionality, etc.) ───────────
        // Routes to the AI tutor with target='concept' — educational answer
        // grounded in the embedded NSPB KB (not the structural "what's in THIS
        // cell" — that's `navigate: explain this cell` under the navigate verb).
        { cmd: "Explain cell",                               desc: "🧩 What a cell is in NSPB — multidimensional intersection, input vs calc, precision", fill: "explain cell" },
        // ── DATA FLOW — backend stubs only (on roadmap) ───────────────────
        { cmd: "Explain data flow (on roadmap)",             desc: "🔀 How does data move from form A through rules to form B — coming soon",  fill: "explain data flow " },
        { cmd: "Explain what feeds an account (on roadmap)", desc: "⬅️ Trace upstream sources — coming soon",                         fill: "explain data flow into " },
        { cmd: "Explain what depends on an account (on roadmap)", desc: "➡️ Trace downstream consumers — coming soon",                fill: "explain data flow from " },
      ],
    },
    navigate: {
      icon: "🧭", label: "navigate — drive a Smart View ad-hoc grid (cube-aware ops)",
      items: [
        // ── EXPLAIN / INSPECT — the killer features ───────────────────────
        // Every cmd starts with "Navigate" so the user sees the verb-noun
        // pattern in the palette and knows what they're invoking, exactly
        // like the `analyze` family does.
        { cmd: "Navigate explain this cell",                       desc: "🔍 What dims are here, what POV, what level. Stand on a cell first.",   fill: "navigate: explain this cell" },
        { cmd: "Navigate show bottom level of all dims",           desc: "🪜 Leaf members for every dim involved in the active grid",             fill: "navigate: show the bottom-level members of every dim involved here" },
        { cmd: "Navigate show POV of this grid",                   desc: "📌 Which dims are pinned (not on rows/cols)",                          fill: "navigate: show me the POV of this grid" },
        // ── ZOOM (drill rows / cols) ──────────────────────────────────────
        { cmd: "Navigate zoom in (drill one level)",               desc: "📐 Expand the row member by one level (children)",                     fill: "navigate: zoom in on " },
        { cmd: "Navigate zoom to bottom (drill to leaves)",        desc: "📐 Expand all the way to level-0 (data-storage members)",              fill: "navigate: zoom to bottom of " },
        { cmd: "Navigate zoom out (collapse one level)",           desc: "📐 Roll up to the parent level",                                       fill: "navigate: zoom out" },
        // ── PIVOT (move a dim row ↔ col ↔ POV) ────────────────────────────
        { cmd: "Navigate pivot — open a new dim on rows",          desc: "🔄 Add a dimension to rows (keeping current rows expanded)",           fill: "navigate: pivot to open " },
        { cmd: "Navigate pivot — open a new dim on columns",       desc: "🔄 Add a dimension to columns",                                        fill: "navigate: pivot to columns " },
        { cmd: "Navigate pivot — move dim to POV",                 desc: "🔄 Pin a dim (remove from rows/cols, add to POV)",                     fill: "navigate: pivot to POV " },
        // ── ADD (columns / rows / years / scenarios) ──────────────────────
        { cmd: "Navigate add a year column (e.g. FY26)",           desc: "📅 Add a Year member as a column",                                    fill: "navigate: add column FY26 actuals" },
        { cmd: "Navigate add a scenario column",                   desc: "🎭 Actual / Budget / Forecast as columns",                            fill: "navigate: add column Scenario " },
        { cmd: "Navigate add monthly columns Jan–Dec",             desc: "📆 Spread out by month",                                              fill: "navigate: add columns Jan through Dec" },
        { cmd: "Navigate add an account row",                      desc: "📊 Add a specific Account on rows",                                   fill: "navigate: add row " },
        // ── REMOVE / KEEP-ONLY (filter) ───────────────────────────────────
        { cmd: "Navigate keep only one member",                    desc: "🎯 Filter to a single member of a dim",                                fill: "navigate: keep only " },
        { cmd: "Navigate remove a member",                         desc: "🚫 Drop a row/column/POV",                                            fill: "navigate: remove " },
        { cmd: "Navigate remove rows with zero values",            desc: "🧹 Clean up empty rows",                                              fill: "navigate: remove rows with all zeros" },
      ],
    },
    analyze: {
      icon: "🧠", label: "analyze — insights + variance columns on the active sheet",
      items: [
        // ── Default — basic in-place variance ────────────────────────────
        { cmd: "Analyze this sheet",                  desc: "🧠 Auto-detect 2 scenarios → add Δ$/Δ% columns + top movers in chat",  fill: "analyze this sheet" },
        // ── 🎯 Templates by data type (controller-grade prompts) ──────────
        { cmd: "📊 P&L review (controller)",          desc: "Variance + margins + watch items",  fill:
          "You are a senior controller reviewing this P&L. " +
          "First call analyze_inplace to add Δ$ and Δ% columns to the right of the data. " +
          "Then write a tight variance commentary in chat structured as: " +
          "**Headline** (1 sentence on the bottom line), " +
          "**Revenue drivers** (top 3 lines with $ impact + brief why), " +
          "**Expense drivers** (top 3 cost lines with $ impact), " +
          "**Margin movement** (Gross / Operating / Net margin in bps if computable), " +
          "**Risk flags** (lines >20% off, unusual sign, or 0), " +
          "**Watch items for next month** (2-3 things to monitor). " +
          "Use K/M for $ amounts. No fluff."
        },
        { cmd: "💰 Revenue analysis",                 desc: "Concentration + mix shift + top contributors",  fill:
          "You are a revenue analyst reviewing this sheet. " +
          "Call analyze_inplace to add Δ$ + Δ% columns. " +
          "Then in chat compute: " +
          "**Total revenue movement** ($ and %), " +
          "**Top 5 contributors** (name + $ + % of total), " +
          "**Concentration risk** (top-5 share, comment if >50%), " +
          "**Notable mix shifts** (any line where % of total changed >5 percentage points), " +
          "**Question for follow-up** (1 thing worth asking the business)."
        },
        { cmd: "🧾 OpEx review",                       desc: "Categories above plan + run-rate + flex",  fill:
          "You are a controller reviewing OpEx. " +
          "Call analyze_inplace to add Δ$ + Δ% columns. " +
          "Then write in chat: " +
          "**Total OpEx variance** ($ and % vs comparison column), " +
          "**Categories above plan** (name + $ over + % over), " +
          "**Categories under plan** (same but under), " +
          "**Run-rate check** (trailing-3-month avg vs forecast — flag if drift > 5%), " +
          "**Personnel vs non-personnel** split if visible, " +
          "**Discretionary vs committed** — comment on flex if guessable from line names."
        },
        { cmd: "📈 Margin analysis",                   desc: "Gross / Operating / Net margin % movement in bps",  fill:
          "You are a CFO reviewing margins. " +
          "Identify Revenue, COGS, Operating expenses, Net Income lines in the sheet. " +
          "Compute: Gross Margin % (Revenue − COGS) / Revenue, Operating Margin % (Op Income / Revenue), Net Margin % (Net Income / Revenue), " +
          "per column / period. " +
          "Call analyze_inplace for the per-row variance columns. " +
          "Then in chat write a margin commentary: each margin's % change in **basis points** vs the comparison column, " +
          "flag any compression > 100 bps, and identify what's driving it (volume, mix, pricing, cost). " +
          "Keep it executive-tight."
        },
        { cmd: "💵 Cash flow review",                  desc: "Operating / Investing / Financing breakdown",  fill:
          "You are a treasurer reviewing the cash flow. " +
          "Identify the Operating, Investing, and Financing sections in the sheet (by row label / parent member). " +
          "Sum each section per column. " +
          "Call analyze_inplace for Δ$ + Δ% per row. " +
          "Then in chat: " +
          "**Net cash change** ($), " +
          "**Operating CF** ($ + % of net change), " +
          "**Investing CF** ($ + % of net change), " +
          "**Financing CF** ($ + % of net change), " +
          "**Cash conversion** (Operating CF / Net Income) if Net Income visible. " +
          "Comment on the quality / sustainability of the cash flow."
        },
        { cmd: "🏦 Balance Sheet review",              desc: "Working capital + leverage + liquidity",  fill:
          "You are a finance director reviewing the Balance Sheet. " +
          "Call analyze_inplace for Δ$ + Δ% columns. " +
          "Identify Current Assets, Current Liabilities, Total Debt, Equity, Cash, AR, AP, Inventory if visible. " +
          "Compute in chat: " +
          "**Working capital** (CA − CL) and Δ vs prior, " +
          "**Current ratio** (CA / CL), " +
          "**Quick ratio** ((CA − Inventory) / CL) if Inventory visible, " +
          "**Debt / Equity**, " +
          "**DSO** if Revenue + AR present, **DPO** if COGS + AP, **DIO** if COGS + Inventory, " +
          "**Cash conversion cycle** = DSO + DIO − DPO. " +
          "Flag any deterioration > 10%."
        },
        { cmd: "📊 Executive 1-pager",                 desc: "Board-ready TL;DR: 3 headlines + 1 chart-of-the-month",  fill:
          "You are preparing a 1-paragraph TL;DR for the board on this sheet. " +
          "Call analyze_inplace for Δ$ + Δ% cols. " +
          "Then in chat write: " +
          "**The number** (the one headline metric + its movement), " +
          "**Why** (1 sentence on the driver), " +
          "**So what** (1 sentence on the implication), " +
          "**Watch** (1 risk or opportunity to flag for next period). " +
          "Total max 4 sentences. No bullets, just prose."
        },
        // ── Free-form / unstructured analysis ────────────────────────────
        { cmd: "Analyze what stands out",            desc: "🧠 Spot-the-anomaly read",                                       fill: "analyze what stands out in this sheet" },
        { cmd: "Analyze top variance drivers",        desc: "📊 Top 5-10 biggest movers",                                     fill: "analyze top 10 variance drivers in this sheet" },
        { cmd: "Analyze concentration / Pareto mix",  desc: "🥧 Which entries drive the total",                               fill: "analyze concentration mix in this sheet using pareto" },
        { cmd: "Analyze outliers and anomalies",      desc: "⚠ Rows that look unusual",                                       fill: "analyze outliers and anomalies in this sheet" },
        { cmd: "Analyze why X is high / low",         desc: "🔎 Free-form why question — replace X",                          fill: "analyze why " },
        { cmd: "Analyze and recommend next actions",  desc: "✅ What should I do based on this data?",                         fill: "analyze this sheet and recommend next actions" },
        { cmd: "Analyze data quality",                desc: "🧹 Blanks, dupes, suspicious zeros",                              fill: "analyze data quality of this sheet" },
      ],
    },
    adapt: {
      icon: "🪄", label: "adapt — map a client sheet to NSPB",
      items: [
        // ── PATH A: ADAPT TO EXISTING FORM ────────────────────────────────
        { cmd: "Adapt to existing form (auto-pick)", desc: "🪄 AI picks the closest form from your tenant + proposes mapping", fill: "adapt this sheet to a form" },
        { cmd: "Adapt to roster (Manage Employees)", desc: "👥 Payroll / roster → Workforce employee form",                    fill: "adapt this sheet to roster" },
        { cmd: "Adapt to compensation plan",         desc: "💵 Salary + benefit data → comp-plan input form",                   fill: "adapt this sheet to compensation plan" },
        { cmd: "Adapt to OpEx forecast input",       desc: "📊 OpEx-by-department → forecast input form",                       fill: "adapt this sheet to OpEx forecast" },
        { cmd: "Adapt to revenue forecast input",    desc: "💰 Revenue worksheet → revenue input form",                          fill: "adapt this sheet to revenue forecast" },
        { cmd: "Adapt to specific form by name",     desc: "✏️ Free text — name any form from your tenant",                     fill: "adapt this sheet to " },
        // ── PATH B: ADAPT TO AD-HOC INPUT (no specific form needed) ───────
        { cmd: "Adapt to ad-hoc input (level-0)",    desc: "🦆 Build a SmartView ad-hoc pivot at leaf level — no specific form", fill: "adapt this sheet to adhoc input" },
        { cmd: "Map columns to NSPB codes only",     desc: "🔤 Just resolve client labels → NSPB codes, don't write a sheet",   fill: "map this sheet to NSPB codes only" },
        // ── HELP ──────────────────────────────────────────────────────────
        { cmd: "Validate before adapting",           desc: "🔎 Pre-check structure (cols, members, dups) before mapping",       fill: "validate this sheet against NSPB" },
        { cmd: "How does adapt work?",                desc: "📖 Explanation of the conversational adapt workflow + examples",   fill: "How does adapt mode work in NSPB MCP?" },
      ],
    },
    format: {
      icon: "🧹", label: "format — polish active sheet",
      items: [
        { cmd: "format executive", desc: "Executive style (bold totals, slate headers)", fill: "format this sheet as an executive report" },
        { cmd: "format financial", desc: "Financial style (currency cols, indents)", fill: "format this sheet as a financial report" },
        { cmd: "format clean", desc: "Hide rows where all values are zero", fill: "clean zero rows from this sheet" },
        { cmd: "format highlight", desc: "Color negative values in red", fill: "highlight negative values in red" },
      ],
    },
    create: {
      icon: "🏗️", label: "create — generate artifact",
      items: [
        { cmd: "create smartview", desc: "Build SmartView pivot from active sheet", fill: "create smartview adhoc from this sheet", wip: true },
        { cmd: "create dim import", desc: "Build dim import file from sheet", fill: "create dimensions import file from this sheet", wip: true },
        { cmd: "create form", desc: "Build form definition", fill: "create form definition from this sheet", wip: true },
        { cmd: "create rule", desc: "Synthesize a calc rule", fill: "create rule from this sheet", wip: true },
        { cmd: "create forecast", desc: "AI forecast from history", fill: "create forecast based on actual history", wip: true },
        { cmd: "create budget", desc: "AI budget from prior actuals", fill: "create budget based on actual history", wip: true },
      ],
    },
    transform: {
      icon: "🦆", label: "transform — convert sheet",
      items: [
        { cmd: "transform to smartview", desc: "Convert active sheet to SmartView codes", fill: "transform this to smartview" },
        { cmd: "transform to nspb", desc: "Map sheet columns to NSPB codes", fill: "map this sheet to NSPB" },
        { cmd: "load smartview", desc: "Load active grid into DuckDB (long format)", fill: "load smartview as today" },
      ],
    },
    list: {
      icon: "📑", label: "list — files / jobs / metadata",
      items: [
        { cmd: "list files", desc: "List inbox / outbox files (via interop)", fill: "list files" },
        { cmd: "list jobs", desc: "Recent job runs", fill: "show recent jobs" },
        { cmd: "list rules", desc: "Business rules", fill: "show me the rules" },
        { cmd: "list forms", desc: "All forms (by module)", expand: "forms" },
      ],
    },
    update: {
      icon: "🔄", label: "update — refresh values",
      items: [
        { cmd: "update variables", desc: "Open the variables editor", fill: "update variables" },
        { cmd: "update dimension", desc: "Submit a dimension import", fill: "import dimension ", wip: true },
      ],
    },
    change: {
      icon: "✏️", label: "change — edit one thing",
      items: [
        { cmd: "change variable", desc: "Set a substitution variable", fill: "set variable " },
        { cmd: "change alias", desc: "Rename a member alias", fill: "change alias ", wip: true },
      ],
    },
    delete: {
      icon: "🗑️", label: "delete — remove from tenant",
      items: [
        { cmd: "delete file", desc: "Remove a file from inbox / outbox", fill: "delete file " },
      ],
    },
    import: {
      icon: "📥", label: "import — push to tenant",
      items: [
        { cmd: "import dimension", desc: "Submit a dim import zip", fill: "import dimension ", wip: true },
        { cmd: "import data", desc: "Submit a data import file", fill: "import data ", wip: true },
      ],
    },
    export: {
      icon: "📤", label: "export — pull from tenant",
      items: [
        { cmd: "export dimension", desc: "Export a dimension to CSV", fill: "export dimension ", wip: true },
        { cmd: "export data", desc: "Export cube data (Data.zip)", fill: "export data ", wip: true },
        { cmd: "export security", desc: "Export user / group access", fill: "export security", wip: true },
        { cmd: "export audit", desc: "Download the audit log", fill: "export audit log", wip: true },
      ],
    },
    help: {
      icon: "❓", label: "help — Q&A on NSPB",
      items: [
        { cmd: "help concepts", desc: "Browse NSPB concept Q&A", expand: "help" },
      ],
    },
  };

  // Roots in display order — sorted by typical USE FREQUENCY (most-used
  // first). The ordering reflects what a Controller / FP&A Analyst does
  // in a normal day:
  //   Tier 1 — DAILY, many times: open form / show / analyze / navigate / run
  //   Tier 2 — DAILY, once or twice: explain / close
  //   Tier 3 — WEEKLY: format / set (vars)
  //   Tier 4 — MONTHLY / occasional: adapt / transform / update / change / create
  //   Tier 5 — RARE / admin: list / import / export / delete
  //   Tier 6 — help / docs (always last)
  //
  // ⚠️ INVARIANT: every key in INTENT_TREE must appear in this list, or
  // it won't be discoverable from the master `?` tree. The startup
  // assertion below catches drift if you forget to update this when
  // adding a new palette. WIP items (wip:true) are pushed to the bottom
  // of each section by showIntentRoot, with their "dev pending" badge.
  const INTENT_ROOTS_ORDERED = [
    // Tier 1 — daily, multiple times
    "open", "show", "analyze", "navigate", "run",
    // Tier 2 — daily, once or twice
    "explain", "close",
    // Tier 3 — weekly
    "format", "set",
    // Tier 4 — monthly / occasional
    "adapt", "transform", "update", "change", "create",
    // Tier 5 — rare admin
    "list", "import", "export", "delete",
    // Tier 6 — last
    "help",
  ];
  // Build the actual roots array: start from the ordered list, then append
  // any INTENT_TREE keys that weren't included (in case someone adds a new
  // palette and forgets to update INTENT_ROOTS_ORDERED). This way new
  // features ALWAYS show up in `?`, even if the dev forgot to position them.
  const INTENT_ROOTS = INTENT_ROOTS_ORDERED.filter(v => INTENT_TREE[v])
    .concat(Object.keys(INTENT_TREE).filter(k => !INTENT_ROOTS_ORDERED.includes(k)));
  // Developer-time warning when the ordered list is out of sync — caught in
  // the browser console during local dev so we don't ship features that
  // are hidden in the master tree.
  const missing = Object.keys(INTENT_TREE).filter(k => !INTENT_ROOTS_ORDERED.includes(k));
  if (missing.length) {
    console.warn(`[INTENT_TREE] palette(s) missing from INTENT_ROOTS_ORDERED — auto-appended at end: ${missing.join(", ")}. Add them to the ordered list to control position.`);
  }

  // Show the full tree as a flat list, with one section per verb.
  // Within each section, WIP (dev-pending) items are pushed to the bottom
  // so the user reads "what works today" first and "what's coming" last.
  const showIntentRoot = (filter) => {
    const q = (filter || "").toLowerCase();
    const rows = [];
    for (const verb of INTENT_ROOTS) {
      const node = INTENT_TREE[verb];
      if (!node) continue;
      const matched = node.items.filter(it =>
        !q || it.cmd.toLowerCase().includes(q) || (it.desc || "").toLowerCase().includes(q) || verb.toLowerCase().includes(q)
      );
      if (!matched.length) continue;
      // Stable sort: working items first, WIP at the bottom of the section.
      const sorted = matched.slice().sort((a, b) => (a.wip ? 1 : 0) - (b.wip ? 1 : 0));
      rows.push({ divider: true, label: `${node.icon} ${node.label}` });
      for (const it of sorted) {
        rows.push({ cmd: it.cmd, icon: node.icon, desc: it.desc, fill: it.fill, expand: it.expand, wip: it.wip });
      }
    }
    selectedIdx = 0;
    render(`Intent tree — type ? + verb (e.g. ?show) or just the verb itself`, rows);
  };

  // Drill into one verb's sub-list. WIP items always render at the bottom
  // so the working features dominate the top of the list.
  const showIntentVerb = (verb, filter) => {
    const node = INTENT_TREE[verb];
    if (!node) { showIntentRoot(filter); return; }
    const q = (filter || "").toLowerCase();
    const items = node.items
      .filter(it => !q || it.cmd.toLowerCase().includes(q) || (it.desc || "").toLowerCase().includes(q))
      .slice()
      .sort((a, b) => (a.wip ? 1 : 0) - (b.wip ? 1 : 0))
      .map(it => ({ cmd: it.cmd, icon: node.icon, desc: it.desc, fill: it.fill, expand: it.expand, wip: it.wip }));
    selectedIdx = 0;
    render(`${node.icon} ${node.label}`, items);
  };

  const selectItem = (r) => {
    if (r.expand) {
      // Drill into a sub-list (e.g. /form → live form list)
      mode = r.expand;
      input.value = r.cmd + " ";
      // Intent-tree expand: "intent:<verb>" drills into one verb of the tree
      if (typeof r.expand === "string" && r.expand.indexOf("intent:") === 0) {
        showIntentVerb(r.expand.slice(7), "");
        return;
      }
      switch (r.expand) {
        case "forms":   showForms("");   break;
        case "rules":   showRules("");   break;
        case "dims":    showDims("");    break;
        // Variants that fill with `explain form X` / `explain rule X`
        // so the user gets the tutor, not the open/run.
        case "forms-explain":    showForms("", { fillVerb: "explain form",  titleVerb: "Explain form"  }); break;
        case "rules-explain":    showRules("", { fillVerb: "explain rule",  titleVerb: "Explain rule",  subtitle: "(opens the AI tutor on the selected rule)" }); break;
        case "accounts-explain": showAccounts(""); break;
        case "vars-explain":  showVarsForExplain(""); break;
        case "checks":  showChecks("");  break;
        case "admin":   showAdmin("");   break;
        case "show":  showShow("");  break;
        case "transform":    showTransform("");    break;
        case "epm":          showEpm("");          break;
        case "analyze": showAnalyze(""); break;
        case "help":    showHelp("");    break;
        case "adhoc":   showAdhoc("");   break;
        case "format":  showFormat("");  break;
        case "build":   showBuild("");   break;
        case "mockup":  showMockup("");  break;
      }
    } else if (r.fill !== undefined) {
      // Prefix with the current slash category so the chat history shows
      // which menu it came from (e.g. "/help show recent jobs"). The
      // category prefix is stripped automatically in onSend before routing.
      // /form and /rule already produce full natural commands and don't
      // need the prefix.
      const NO_PREFIX = new Set([
        "categories", "forms", "rules", "dims", "checks",
        // explain-drill modes — fill is already a complete NL command
        // ("explain rule X" / "explain form Y" / "explain variable Z"),
        // no need to slash-prefix.
        "rules-explain", "forms-explain", "vars-explain", "accounts-explain",
      ]);
      const fillStr = String(r.fill || "");
      // Avoid duplication: if the fill already starts with a `/` (slash item
      // like "/openform ...") OR with the same mode word ("show me the rules"
      // when mode === "show"), don't prepend the prefix again.
      const startsWithSlash = fillStr.startsWith("/");
      const startsWithModeWord = mode && fillStr.toLowerCase().startsWith(mode.toLowerCase() + " ");
      // Intent-tree modes (intent:show, intent:open, etc.) are NL navigation
      // helpers — their items are already real natural-language commands.
      // Prefixing with "/intent:show ..." is meaningless and breaks the
      // client-side intercepts (which expect plain NL like "show me the cubes").
      const isIntentMode = typeof mode === "string" && mode.indexOf("intent") === 0;
      const skipPrefix = NO_PREFIX.has(mode) || startsWithSlash || startsWithModeWord || isIntentMode;
      const prefix = skipPrefix ? "" : `/${mode} `;
      fillAndClose(prefix + fillStr);
    }
  };
  // Input handler — extracted so we can call from both `input` and `keyup`
  // events (some hosts don't reliably fire `input` for every keystroke).
  // Natural-language → palette mapping. As the user types verbs like "open",
  // "show", "run", "set", "create", "delete", "list", "update", we open the
  // matching slash sub-list automatically. Lets the user type without
  // memorizing the / prefix.
  // Intent regexes — accept the verb alone (`(\s|$)`) so the palette opens
  // as soon as the user types "open" without needing a trailing space.
  // Order matters: more-specific multi-word patterns FIRST so "open form"
  // auto-drills to the forms list instead of stopping at the verb tree.
  // `filterFrom` = number of words to skip before forming the filter string
  // (the verb words themselves). E.g. "open form Income" → filterFrom=2 →
  // filter="Income".
  const NL_INTENT = [
    // ── Multi-word deep-drill patterns (must come before the single-verb fallbacks) ──
    // Loose word-fragments (`form\w*`, `dim\w*`, `rule\w*`) so the palette
    // drills as soon as the user has typed enough characters to disambiguate
    // the noun — e.g. "show dim" / "show dimens" / "open for" all auto-drill
    // without waiting for the user to finish typing the full word.
    // Match SHORT prefixes too — drill as soon as user types the first
    // disambiguating letter. "show d" / "show di" / "show dim" → all dims.
    // "show f" / "show fo" / "show form" → all forms. The intent of the
    // first letter is unambiguous within the "show/open/list/run" context.
    { match: /^open\s+f\w*(\s|$)/i,                    expand: "forms",  filterFrom: 2 },
    { match: /^open\s+d\w*(\s|$)/i,                    expand: "forms",  filterFrom: 2 },
    { match: /^show\s+f\w*(\s|$)/i,                    expand: "forms",  filterFrom: 2 },
    { match: /^show\s+r\w*(\s|$)/i,                    expand: "rules",  filterFrom: 2 },
    { match: /^show\s+(d\w*|h\w*)(\s|$)/i,             expand: "dims",   filterFrom: 2 },
    { match: /^run\s+r\w*(\s|$)/i,                     expand: "rules",  filterFrom: 2 },
    { match: /^list\s+f\w*(\s|$)/i,                    expand: "forms",  filterFrom: 2 },
    { match: /^list\s+r\w*(\s|$)/i,                    expand: "rules",  filterFrom: 2 },
    { match: /^list\s+(d\w*|h\w*)(\s|$)/i,             expand: "dims",   filterFrom: 2 },
    // ── Admin verb phrases ───────────────────────────────────────
    { match: /^(set\s+variable|update\s+variables?|change\s+variable|change\s+alias|rename\s+alias|delete\s+file|list\s+files|export\s+\w+\s+dimension|import\s+dimension|run\s+job|run\s+integration|run\s+pipeline)/i, expand: "admin", filterFrom: 0 },
    // ── Single-verb fallbacks (open the intent tree at the verb root) ──
    { match: /^(open|abrir|abrí)(\s|$)/i,                            expand: "intent:open",      filterFrom: 1 },
    { match: /^(show|mostrame|mostrar|mostra)(\s|$)/i,               expand: "intent:show",      filterFrom: 1 },
    { match: /^(list|listar)(\s|$)/i,                                expand: "intent:list",      filterFrom: 1 },
    { match: /^(run|ejecutar|correr)(\s|$)/i,                        expand: "intent:run",       filterFrom: 1 },
    { match: /^(set)(\s|$)/i,                                        expand: "intent:set",       filterFrom: 1 },
    { match: /^(update)(\s|$)/i,                                     expand: "intent:update",    filterFrom: 1 },
    { match: /^(change)(\s|$)/i,                                     expand: "intent:change",    filterFrom: 1 },
    { match: /^(delete)(\s|$)/i,                                     expand: "intent:delete",    filterFrom: 1 },
    { match: /^(import)(\s|$)/i,                                     expand: "intent:import",    filterFrom: 1 },
    { match: /^(export)(\s|$)/i,                                     expand: "intent:export",    filterFrom: 1 },
    { match: /^(adhoc2?|ad-?hoc)(\s|$)/i,                            expand: "adhoc",            filterFrom: 1 },
    { match: /^(format|formatear|estilo)(\s|$)/i,                    expand: "format",           filterFrom: 1 },
    { match: /^(create|crear|build|generar)(\s|$)/i,                 expand: "create",           filterFrom: 1 },
    { match: /^(transform|transformar|convert|convertir)(\s|$)/i,    expand: "transform",        filterFrom: 1 },
    // Catches every common spelling/typo for the verb: analyze, analyse,
    // analize, analise, analiza, analizar. Also matches partial typing
    // ("anali", "analy", "analyz") so the palette opens as soon as the
    // user has typed enough to disambiguate.
    { match: /^(anal[yi][zs]?e?r?|anali?z?a?r?)(\s|$)/i,              expand: "intent:analyze",   filterFrom: 1 },
    // EXPLAIN drill-down patterns — match BEFORE the catch-all single-verb
    // regex below, so "explain form X" pops the live forms list filtered
    // by X (instead of the static palette). Same for rule.
    //   `explain f<...>` / `explain form` / `explain forms`     → forms picker (fills 'explain form <name>')
    //   `explain r<...>` / `explain rule` / `explain rules`     → rules picker (fills 'explain rule <name>')
    //   `explain business rule`                                 → rules picker
    //   `explain b<...>` (ambiguous start — also goes to rules) → rules picker
    // Allow optional articles ("a" / "an" / "the") between the verb and noun
    // so the user can type "explain a rule" / "explain the form X" / "explain
    // an account Y" naturally. The article doesn't count toward the filter.
    { match: /^explain\s+bus\w*\s+r\w*(\s|$)/i,                                                                   expand: "rules-explain", filterFrom: 3 },
    { match: /^explain\s+(?:a\s+|an\s+|the\s+)?(business\s+rule|rule|rules|r\w*)(\s|$)/i,                         expand: "rules-explain", filterFrom: 2 },
    { match: /^explain\s+(?:a\s+|an\s+|the\s+)?(form|forms|f\w*)(\s|$)/i,                                         expand: "forms-explain", filterFrom: 2 },
    { match: /^explain\s+(?:a\s+|an\s+|the\s+)?(account|accounts|acct|cuenta|a\w*)(\s|$)/i,                       expand: "accounts-explain", filterFrom: 2 },
    // Variables — accept 'variable', 'var', 'sub var', 'substitution variable', or just 'v...'
    { match: /^explain\s+(?:a\s+|an\s+|the\s+)?(sub\s+)?(?:variable|variables|var|vars|v\w*)(\s|$)/i,             expand: "vars-explain",  filterFrom: 2 },
    // EXPLAIN — AI tutor grounded in the tenant KB (rules + forms + accounts).
    // Anti-churn feature: NSPB customers leave when they don't understand
    // the platform. Explain reads the LCM-parsed KB and translates to
    // plain English with rule scripts, form layouts, account dependencies.
    { match: /^(explain|expli\w*|explain\s+account|explain\s+data|why\s+is|por\s*qu[eé]|cómo\s+funciona|para\s+qué\s+sirve|qué\s+es|qu[eé]\s+hace)(\s|$)/i, expand: "intent:explain", filterFrom: 1 },
    // NAVIGATE — Smart View ad-hoc operations (zoom / pivot / add / remove /
    // explain / keep-only). All cube-aware via Gemini + tenant KB. This
    // replaces the old `edit` keyword: pure-Excel ops are better handled
    // by Excel Copilot; we focus on cube-driven navigation that Copilot
    // cannot do because it doesn't know NSPB.
    { match: /^(navigate|naveg\w*|nav)(\s|$)/i,                                                expand: "intent:navigate", filterFrom: 1 },
    // Natural-language synonyms route to the same navigate palette so the
    // user doesn't need to remember the verb.
    { match: /^(zoom|pivot|pivota?r?|keep\s+only|drill|drill\s+down|drill\s+to|explain\s+this\s+cell|explain\s+cell|show\s+pov|show\s+bottom|bottom\s+level)(\s|$)/i, expand: "intent:navigate", filterFrom: 0 },
    // CLOSE — month-end close pack (P&L / BS / CF formal report)
    { match: /^(close|cierre|cierra?r?|monthly\s+close|close\s+pack|close\s+report)(\s|$)/i, expand: "intent:close", filterFrom: 1 },
    // "adapt this sheet to <form>" — magic mapping. Catches "adapt" /
    // "adaptar" / "adapta" + typos so the palette opens fast.
    { match: /^(adapt\w*|adapta?r?)(\s|$)/i,                         expand: "intent:adapt",     filterFrom: 1 },
    // Also catches "map this sheet" → palette opens to adapt category
    // (since map_sheet_to_adhoc is conceptually part of adapt's family).
    { match: /^(map)(\s|$)/i,                                        expand: "intent:adapt",     filterFrom: 1 },
    // ONLY 'help' / 'ayuda' open the help palette. Question words like
    // 'how', 'what', 'why' are FREEFORM questions for the AI — never trap
    // them in palette navigation, the user must be able to just hit Send.
    { match: /^(help|ayuda)(\s|$)/i,                                  expand: "help",             filterFrom: 1 },
  ];

  const detectNlIntent = (v) => {
    for (const intent of NL_INTENT) {
      const m = v.match(intent.match);
      if (m) {
        // Build a "filter" string from the words AFTER the matched verb so
        // the sub-list filters as the user types more.
        // filterFrom = number of verb words to skip. E.g. "open form opex"
        // with filterFrom=2 → words=["open","form","opex"] → slice(2)=["opex"]
        // → filter="opex".
        const words = v.trim().split(/\s+/);
        let filter = words.slice(intent.filterFrom).join(" ");
        // Strip leading articles (a / an / the) and possessives ("my", "this")
        // so phrases like "explain a rule X" produce filter="X" instead of "rule X".
        filter = filter.replace(/^\s*(?:a|an|the|my|this|that|el|la|los|las|un|una)\s+/i, "");
        // Also strip a leading noun ("rule"/"form"/"account") if the user
        // typed e.g. "explain a rule NFS_AGG" — the noun is implicit in the
        // expand target, so the actual filter should be just "NFS_AGG".
        filter = filter.replace(/^\s*(?:rule|rules|form|forms|account|accounts|dim|dimension)\s+/i, "");
        return { expand: intent.expand, filter };
      }
    }
    return null;
  };

  const handleInputChange = () => {
    const v = input.value;
    // Reset to category mode if user cleared the input
    if (!v) {
      if (!palette.classList.contains("hidden")) close();
      return;
    }
    // `?` trigger — alternative explicit way to see the intent tree.
    //   "?"          → full tree, all verbs as sections
    //   "?show"      → drills into the "show" verb
    //   "?show var"  → drills into "show" filtered by "var"
    if (v.startsWith("?")) {
      const rest = v.slice(1).trim();
      if (!rest) {
        mode = "intent-root";
        showIntentRoot("");
        return;
      }
      const m = rest.match(/^(\w+)\s*(.*)$/);
      const verb = (m && m[1] || "").toLowerCase();
      const filter = m && m[2] || "";
      if (INTENT_TREE[verb]) {
        mode = "intent:" + verb;
        showIntentVerb(verb, filter);
      } else {
        mode = "intent-root";
        showIntentRoot(rest);
      }
      return;
    }
    // Natural-language intent detection — opens the sub-list automatically.
    if (!v.startsWith("/")) {
      const intent = detectNlIntent(v);
      if (intent) {
        mode = intent.expand;
        // Intent-tree drill: "intent:<verb>" routes to the new tree.
        if (typeof intent.expand === "string" && intent.expand.indexOf("intent:") === 0) {
          showIntentVerb(intent.expand.slice(7), intent.filter);
          return;
        }
        switch (intent.expand) {
          case "forms":      showForms(intent.filter);      break;
          case "rules":      showRules(intent.filter);      break;
          case "dims":       showDims(intent.filter);       break;
          case "forms-explain":    showForms(intent.filter, { fillVerb: "explain form", titleVerb: "Explain form" }); break;
          case "rules-explain":    showRules(intent.filter, { fillVerb: "explain rule", titleVerb: "Explain rule", subtitle: "(opens the AI tutor on the selected rule)" }); break;
          case "accounts-explain": showAccounts(intent.filter); break;
          case "vars-explain":  showVarsForExplain(intent.filter); break;
          case "show":       showShow(intent.filter);       break;
          case "admin":      showAdmin(intent.filter);      break;
          case "adhoc":      showAdhoc(intent.filter);      break;
          case "format":     showFormat(intent.filter);     break;
          case "build":      showBuild(intent.filter);      break;
          case "create":     showBuild(intent.filter);      break;
          case "transform":  showTransform(intent.filter);  break;
          case "analyze":    showAnalyze(intent.filter);    break;
          case "help":       showHelp(intent.filter);       break;
        }
        return;
      }
      // Not a slash command and not a recognized intent → close palette
      if (!palette.classList.contains("hidden")) close();
      return;
    }
    if (v === "/" || (v.startsWith("/") && mode === "categories")) {
      // Top-level filter
      const q = v.slice(1).split(/\s/)[0];
      // Drill as soon as user has typed a full category name (no trailing
      // space required). E.g. typing "/data" auto-expands to its sub-list.
      const cat = SLASH_CATEGORIES.find(c => c.cmd === "/" + q && v.length >= c.cmd.length);
      if (cat && cat.expand) {
        mode = cat.expand;
        const rest = v.slice(cat.cmd.length).trim();
        switch (cat.expand) {
          case "forms":   showForms(rest);   break;
          case "rules":   showRules(rest);   break;
          case "dims":    showDims(rest);    break;
          case "checks":  showChecks(rest);  break;
          case "admin":   showAdmin(rest);   break;
          case "show":  showShow(rest);  break;
          case "transform":    showTransform(rest);    break;
          case "epm":          showEpm(rest);          break;
          case "analyze": showAnalyze(rest); break;
          case "help":    showHelp(rest);    break;
          case "adhoc":   showAdhoc(rest);   break;
          case "format":  showFormat(rest);  break;
          case "build":   showBuild(rest);   break;
          case "mockup":  showMockup(rest);  break;
        }
        return;
      }
      mode = "categories";
      showCategories(q);
      return;
    }
    if (mode !== "categories" && v.startsWith("/")) {
      // If the user typed a DIFFERENT category name (e.g. switched from
      // "/data" to "/admin"), recognize that and switch sub-lists.
      const firstWord = v.slice(1).split(/\s/)[0];
      const newCat = SLASH_CATEGORIES.find(c => c.cmd === "/" + firstWord);
      if (newCat && newCat.expand && newCat.expand !== mode) {
        mode = newCat.expand;
        const rest2 = v.slice(newCat.cmd.length).trim();
        switch (newCat.expand) {
          case "forms":   showForms(rest2);   break;
          case "rules":   showRules(rest2);   break;
          case "dims":    showDims(rest2);    break;
          case "checks":  showChecks(rest2);  break;
          case "admin":   showAdmin(rest2);   break;
          case "show":  showShow(rest2);  break;
          case "transform":    showTransform(rest2);    break;
          case "epm":          showEpm(rest2);          break;
          case "analyze": showAnalyze(rest2); break;
          case "help":    showHelp(rest2);    break;
          case "adhoc":   showAdhoc(rest2);   break;
          case "format":  showFormat(rest2);  break;
          case "build":   showBuild(rest2);   break;
          case "mockup":  showMockup(rest2);  break;
        }
        return;
      }
      // Filter within current sub-list
      const m = v.match(/^\/(\w+)\s*(.*)$/);
      const rest = m ? m[2] : "";
      switch (mode) {
        case "forms":   showForms(rest);   break;
        case "rules":   showRules(rest);   break;
        case "dims":    showDims(rest);    break;
        case "checks":  showChecks(rest);  break;
        case "admin":   showAdmin(rest);   break;
        case "transform":    showTransform(rest);    break;
        case "analyze": showAnalyze(rest); break;
        case "help":    showHelp(rest);    break;
      }
      return;
    }
    // Not a slash command — close palette
    if (!palette.classList.contains("hidden")) close();
  };
  // Some textarea hosts (Office) sometimes miss `input` events. Listen to
  // both `input` and `keyup` so the palette is robust.
  input.addEventListener("input", handleInputChange);
  input.addEventListener("keyup", handleInputChange);
  // Keyboard nav
  input.addEventListener("keydown", (e) => {
    if (palette.classList.contains("hidden")) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      selectedIdx = Math.min(selectedIdx + 1, items.length - 1);
      updateSelection();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      selectedIdx = Math.max(selectedIdx - 1, 0);
      updateSelection();
    } else if (e.key === "Enter" && !e.shiftKey) {
      const sel = items[selectedIdx];
      if (sel) {
        e.preventDefault();
        e.stopPropagation();
        selectItem(sel);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  }, true);  // capture so we beat the existing Enter→onSend handler
  const updateSelection = () => {
    list.querySelectorAll(".slash-item").forEach((el, i) => {
      el.classList.toggle("selected", i === selectedIdx);
      if (i === selectedIdx) el.scrollIntoView({ block: "nearest" });
    });
  };
  // Click outside closes
  document.addEventListener("click", (e) => {
    if (!palette.contains(e.target) && e.target !== input) close();
  });
}

function wrapHelpSections() {
  document.querySelectorAll(".help-body").forEach((body) => {
    const labels = Array.from(body.querySelectorAll(":scope > .help-section-label"));
    labels.forEach((label) => {
      const section = document.createElement("section");
      section.className = "help-module";
      label.parentNode.insertBefore(section, label);
      // Move the label and every following sibling until the next section-label
      // (or end of parent) into the new section.
      let n = label;
      while (n && !(n !== label && n.classList && n.classList.contains("help-section-label"))) {
        const next = n.nextSibling;
        section.appendChild(n);
        n = next;
      }
    });
  });
}

// ── Settings persistence ─────────────────────────────────────────────────────
// THREE-tier storage so settings survive Office Wef cache resets, WebView2
// quirks, and anything else weird Office does:
//   1) OfficeRuntime.storage — official API but flaky in sideloaded Excel
//   2) localStorage          — fast and same-origin, but Wef cache wipes can affect it
//   3) IndexedDB             — most robust in WebView2, survives almost everything
// Reads check all three (most-recent-write wins by ts). Writes fan out to all.
const _settingsDbPromise = (function openSettingsDb() {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open("nspb-settings", 1);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch (_) { resolve(null); }
  });
})();

async function _idbGet(key) {
  const db = await _settingsDbPromise;
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction("kv", "readonly");
      const req = tx.objectStore("kv").get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    } catch (_) { resolve(null); }
  });
}
async function _idbSet(key, value) {
  const db = await _settingsDbPromise;
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction("kv", "readwrite");
      tx.objectStore("kv").put({ value, ts: Date.now() }, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch (_) { resolve(); }
  });
}
async function _idbDelete(key) {
  const db = await _settingsDbPromise;
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction("kv", "readwrite");
      tx.objectStore("kv").delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch (_) { resolve(); }
  });
}

// ── 4th-tier durable storage: a hidden Excel sheet ────────────────────
// All 3 in-WebView storages (OfficeRuntime, localStorage, IndexedDB) live
// inside the Office Wef cache directory and can be wiped together when
// Office invalidates the cache. The Excel WORKBOOK itself is the user's
// file and survives those wipes — so we mirror critical state into a
// hidden sheet `_NSPB_Storage` (cell A1 holds {key: value} JSON).
const HIDDEN_SHEET = "_NSPB_Storage";
async function _sheetReadAll() {
  try {
    return await Excel.run(async (ctx) => {
      const sh = ctx.workbook.worksheets.getItemOrNullObject(HIDDEN_SHEET);
      sh.load("isNullObject");
      await ctx.sync();
      if (sh.isNullObject) return {};
      const cell = sh.getRange("A1");
      cell.load("values");
      await ctx.sync();
      try {
        const raw = (cell.values && cell.values[0] && cell.values[0][0]) || "";
        return raw ? JSON.parse(raw) : {};
      } catch (_) { return {}; }
    });
  } catch (_) { return {}; }
}
async function _sheetWriteAll(obj) {
  try {
    return await Excel.run(async (ctx) => {
      let sh = ctx.workbook.worksheets.getItemOrNullObject(HIDDEN_SHEET);
      sh.load("isNullObject");
      await ctx.sync();
      if (sh.isNullObject) {
        sh = ctx.workbook.worksheets.add(HIDDEN_SHEET);
        sh.visibility = Excel.SheetVisibility.veryHidden;
      }
      sh.getRange("A1").values = [[JSON.stringify(obj)]];
      await ctx.sync();
    });
  } catch (_) {}
}

async function loadJson(key) {
  // Try all four sources, prefer the one with the freshest write.
  // Many users see OfficeRuntime/localStorage wiped on reload; IndexedDB
  // tends to survive. Hidden Excel sheet survives EVERY Office wipe
  // because it lives in the .xlsx workbook itself.
  const candidates = [];
  try {
    const raw = await OfficeRuntime.storage.getItem(key);
    if (raw) candidates.push({ source: "office", value: JSON.parse(raw), ts: 0 });
  } catch (_) {}
  try {
    const raw = localStorage.getItem(key);
    if (raw) candidates.push({ source: "local", value: JSON.parse(raw), ts: 0 });
  } catch (_) {}
  try {
    const idb = await _idbGet(key);
    if (idb && idb.value !== undefined) candidates.push({ source: "idb", value: idb.value, ts: idb.ts || 1 });
  } catch (_) {}
  // 4th tier: hidden Excel sheet — most durable, survives Wef wipes.
  try {
    const sheetData = await _sheetReadAll();
    if (sheetData && sheetData[key] !== undefined) {
      candidates.push({ source: "sheet", value: sheetData[key], ts: 2 });
    }
  } catch (_) {}
  if (!candidates.length) return null;
  // Preference: sheet (most durable) > IDB > local > office.
  const pref = candidates.find(c => c.source === "sheet")
            || candidates.find(c => c.source === "idb")
            || candidates.find(c => c.source === "local")
            || candidates[0];
  // Self-heal: if a more-fragile tier is empty but a durable one has data,
  // copy DOWN so future reads hit any tier and find the same value.
  try {
    if (!candidates.find(c => c.source === "idb")) await _idbSet(key, pref.value);
    if (!candidates.find(c => c.source === "local")) localStorage.setItem(key, JSON.stringify(pref.value));
  } catch (_) {}
  return pref.value;
}
async function saveJson(key, val) {
  const serialised = JSON.stringify(val);
  // Fan-out to all four tiers. Any one surviving = data is recoverable.
  try { await OfficeRuntime.storage.setItem(key, serialised); } catch (_) {}
  try { localStorage.setItem(key, serialised); } catch (_) {}
  try { await _idbSet(key, val); } catch (_) {}
  // Sheet write is async + can be slow if Excel is busy; only mirror the
  // CRITICAL keys (settings + tenant KB) to keep this fast. Other keys
  // (cache, navigation discovery sheets) live only in WebView storage.
  const SHEET_MIRRORED_KEYS = new Set([
    STORAGE_KEY, TENANT_KB_KEY, APP_CONFIG_KEY,
    CATALOG_KEY, FORMS_KEY, RULES_KEY, VARS_KEY
  ]);
  if (SHEET_MIRRORED_KEYS.has(key)) {
    try {
      const all = await _sheetReadAll();
      all[key] = val;
      await _sheetWriteAll(all);
    } catch (_) {}
  }
}
// Persist the post-write variable list that /api/set-subst-var reads back.
// Every chat turn ships this cache to the worker and `show me the variables`
// renders it, so a write that doesn't refresh it stays invisible until the
// next full Discover — which reads as "the chat didn't update anything".
async function refreshVarsCache(resp) {
  if (!resp || !Array.isArray(resp.variables) || !resp.variables.length) return false;
  try {
    await saveJson(VARS_KEY, {
      loadedAt: resp.variablesLoadedAt || Date.now(),
      variables: resp.variables
    });
    return true;
  } catch (_) { return false; }
}

async function clearKey(key) {
  try { await OfficeRuntime.storage.removeItem(key); } catch (_) {}
  try { localStorage.removeItem(key); } catch (_) {}
  try { await _idbDelete(key); } catch (_) {}
  try {
    const all = await _sheetReadAll();
    if (key in all) { delete all[key]; await _sheetWriteAll(all); }
  } catch (_) {}
}

// ── Form slice cache (IndexedDB) ──────────────────────────────────────
// localStorage caps at ~5MB which can't hold ~150 form slices (avg 100KB
// each = 15MB). IndexedDB allows ~50% of disk → plenty of room.
// Cache key:  `${host}|${app}|${formNameLower}`
// Value:      { ts, response }  — full /api/open-form response
// TTL:        24h (auto-invalidate). Manual invalidation via "Clear form
//             cache" button or re-running "Pre-cache all forms".
// Bump this string whenever the openform response shape changes (e.g. new
// fields added, kind classification updated, chip format changed). All
// existing cache entries get invalidated automatically — users don't need
// to click "Clear form cache" every time we ship a fix.
const FORM_CACHE_SCHEMA = "v9-2026-07-06";   // ← bumped: skeleton rows for suppressed forms — invalidates dataless cached opens
const FORM_CACHE_DB    = "nspb-addin-formcache";
const FORM_CACHE_STORE = "slices";
// Cache is PERSISTENT — never auto-expires. The user invalidates manually
// via Settings → "Refresh cache" (calls formCacheClear). This used to be 24h
// but bumping schemas + TTL combined to wipe caches accidentally on every
// deploy. Persistent + explicit refresh is what the user wants.
const FORM_CACHE_TTL_MS = Number.MAX_SAFE_INTEGER;

function _formCacheOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(FORM_CACHE_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(FORM_CACHE_STORE)) {
        db.createObjectStore(FORM_CACHE_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function _formCacheKey(formName) {
  const s = window.NSPB_SETTINGS || {};
  const host = String(s.host || "").replace(/\/+$/, "").toLowerCase();
  const app = String(s.appName || "NetSuite").toLowerCase();
  // Schema version is part of the key — when we bump it, all old entries
  // become invisible (they remain on disk but never match a lookup, then
  // get evicted lazily as IDB needs space).
  return FORM_CACHE_SCHEMA + "|" + host + "|" + app + "|" + String(formName || "").toLowerCase();
}

async function formCacheGet(formName) {
  try {
    const db = await _formCacheOpen();
    return await new Promise((resolve) => {
      const tx = db.transaction(FORM_CACHE_STORE, "readonly");
      const req = tx.objectStore(FORM_CACHE_STORE).get(_formCacheKey(formName));
      req.onsuccess = () => {
        const entry = req.result;
        if (!entry) { resolve(null); return; }
        // No TTL check — cache is persistent. User refreshes via the button.
        // Schema check kept ONLY for shape changes (when worker response shape
        // changes, that requires a refetch — but I commit to NOT bumping
        // schema for cosmetic / chip changes anymore).
        if (entry.schema && entry.schema !== FORM_CACHE_SCHEMA) { resolve(null); return; }
        resolve(entry.response);
      };
      req.onerror = () => resolve(null);
    });
  } catch (_) { return null; }
}

async function formCacheSet(formName, response) {
  try {
    const db = await _formCacheOpen();
    await new Promise((resolve) => {
      const tx = db.transaction(FORM_CACHE_STORE, "readwrite");
      tx.objectStore(FORM_CACHE_STORE).put({ ts: Date.now(), schema: FORM_CACHE_SCHEMA, response }, _formCacheKey(formName));
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch (_) {}
}

async function formCacheClear() {
  try {
    const db = await _formCacheOpen();
    await new Promise((resolve) => {
      const tx = db.transaction(FORM_CACHE_STORE, "readwrite");
      tx.objectStore(FORM_CACHE_STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch (_) {}
}

async function formCacheStats() {
  try {
    const db = await _formCacheOpen();
    return await new Promise((resolve) => {
      const tx = db.transaction(FORM_CACHE_STORE, "readonly");
      const req = tx.objectStore(FORM_CACHE_STORE).count();
      req.onsuccess = () => resolve({ count: req.result || 0 });
      req.onerror = () => resolve({ count: 0 });
    });
  } catch (_) { return { count: 0 }; }
}
async function loadSettings() { return loadJson(STORAGE_KEY); }
async function saveSettings(s) { return saveJson(STORAGE_KEY, s); }

function openSettings() {
  // Use ONLY what's been explicitly saved by the user. DEMO_SETTINGS is no
  // longer auto-loaded because it contains real-looking placeholder values
  // (a real Oracle URL + email) that fooled users into thinking they were
  // already configured.
  const s = window.NSPB_SETTINGS || {};
  els.sHost.value = s.host || "";
  els.sUser.value = s.username || "";
  els.sPass.value = s.password || "";
  els.sApp.value = s.appName || "NetSuite";
  els.sGemini.value = s.geminiKey || "";
  els.sDebug.checked = !!s.debug;
  els.sHideZeros.checked = !!s.hideZeros;
  els.sHelpUrl.value = s.helpUrl || "";
  els.sGlossary.value = s.glossary || "";
  const langEl = document.getElementById("s-language");
  if (langEl) langEl.value = s.language || "en";
  els.sIdcsUrl.value = s.idcsUrl || "";
  els.sOauthClientId.value = s.oauthClientId || "";
  els.sOauthClientSecret.value = s.oauthClientSecret || "";
  if (els.sEpmPath) els.sEpmPath.value = s.epmPath || "";
  if (els.sEpmBridge) els.sEpmBridge.value = s.epmBridge || "";
  els.sFeedback.className = "";
  els.sFeedback.textContent = "";
  // Show KB status (async — don't block modal open)
  loadJson(TENANT_KB_KEY).then(kb => {
    if (!els.sKbStatus) return;
    if (kb) {
      const date = kb.generatedAt ? new Date(kb.generatedAt).toLocaleDateString() : "unknown date";
      const client = kb.client ? ` · ${kb.client}` : "";
      els.sKbStatus.textContent = `✓ ${(kb.forms||[]).length} forms · ${(kb.rules||[]).length} rules · ${date}${client}`;
      els.sKbStatus.style.color = "#166534";
    } else {
      els.sKbStatus.textContent = "Not loaded";
      els.sKbStatus.style.color = "#999";
    }
  });
  els.overlay.classList.remove("hidden");
}

function readSettingsForm() {
  // Language: read the dropdown if it's in the DOM (added 2026-05-18).
  // Defaults to 'en' for backward-compat with older saved settings dumps.
  const langEl = document.getElementById("s-language");
  const language = langEl ? (langEl.value || "en") : "en";
  return {
    host: els.sHost.value.trim(),
    username: els.sUser.value.trim(),
    password: els.sPass.value,
    appName: els.sApp.value.trim() || "NetSuite",
    geminiKey: els.sGemini.value.trim(),
    debug: !!els.sDebug.checked,
    hideZeros: !!els.sHideZeros.checked,
    helpUrl: els.sHelpUrl.value.trim() || "",
    glossary: els.sGlossary.value.trim() || "",
    language,
    idcsUrl: els.sIdcsUrl.value.trim() || "",
    oauthClientId: els.sOauthClientId.value.trim() || "",
    oauthClientSecret: els.sOauthClientSecret.value.trim() || "",
    epmPath: els.sEpmPath ? els.sEpmPath.value.trim() : "",
    epmBridge: els.sEpmBridge ? els.sEpmBridge.value.trim() : ""
  };
}

async function onTest() {
  const s = readSettingsForm();
  const aiProvider = detectAiProvider(s.geminiKey || "");
  setSFeedback("testing NSPB + " + (aiProvider === "claude" ? "Claude" : "Gemini") + "…");
  let nspbOk = false, nspbMsg = "";
  let aiOk = false, aiMsg = "";

  // 1. NSPB connection
  try {
    const resp = await fetch(API + "/api/test-connection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(s)
    });
    const data = await resp.json();
    if (!data.ok) throw new Error(data.error || "Connection failed");
    nspbOk = true;
    nspbMsg = "app: " + (data.application || s.appName);
  } catch (e) {
    nspbMsg = e.message || String(e);
  }

  // 2. AI API key — auto-detect provider from key prefix
  const _aiProvider = detectAiProvider(s.geminiKey || "");
  const _aiLabel = _aiProvider === "claude" ? "Claude" : "Gemini";
  if (!s.geminiKey) {
    aiMsg = "no key";
  } else {
    try {
      const r = await fetch(API + "/api/narrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "ping (1 word reply)", geminiKey: s.geminiKey })
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || _aiLabel + " check failed");
      aiOk = true;
      aiMsg = _aiLabel + " key valid";
    } catch (e) {
      aiMsg = e.message || String(e);
    }
  }

  const nspbLine = `${nspbOk ? "✓" : "✗"} NSPB: ${nspbMsg}`;
  const aiLine = `${aiOk ? "✓" : "✗"} AI: ${aiMsg}`;
  setSFeedback(`${nspbLine}  |  ${aiLine}`, (nspbOk && aiOk) ? "ok" : "error");
}

async function onProbeOauth() {
  const s = readSettingsForm();
  if (!s.host || !s.username || !s.password) {
    setSFeedback("Fill in Host, Username and Password first.", "error"); return;
  }
  els.sProbeOauth.disabled = true;
  setSFeedback("Probing OAuth endpoints… (may take 15–30 s)");
  try {
    const resp = await fetch(API + "/api/probe-oauth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(s)
    });
    const data = await resp.json();
    if (!data.ok) throw new Error(data.error || "Probe failed");

    // Write results to a sheet
    await Excel.run(async ctx => {
      const wb = ctx.workbook;
      const sheetName = "NSPB_OAuthProbe";
      let sheet;
      try { sheet = wb.sheets.getItem(sheetName); sheet.load("name"); await ctx.sync(); sheet.getUsedRange().clear(); }
      catch { sheet = wb.sheets.add(sheetName); }

      const grid = [
        [`OAuth Probe Results — ${new Date().toISOString().slice(0,19).replace("T"," ")} UTC`, "", "", ""],
        [`Winners (HTTP 200): ${data.winners.length ? data.winners.join(", ") : "none"}`, "", "", ""],
        ["", "", "", ""],
        ["Endpoint", "Token Type", "Status", "Response snippet"]
      ];
      for (const r of (data.results || [])) {
        grid.push([r.endpoint, r.tokenType, r.status, r.snippet || ""]);
      }

      const range = sheet.getRangeByIndexes(0, 0, grid.length, 4);
      range.values = grid;
      // Header row bold
      sheet.getRangeByIndexes(3, 0, 1, 4).format.font.bold = true;
      // Color winners green, 401/403 red
      for (let i = 4; i < grid.length; i++) {
        const status = grid[i][2];
        const cell = sheet.getRangeByIndexes(i, 2, 1, 1);
        if (status === 200) cell.format.fill.color = "#c6efce";
        else if (status === 401 || status === 403) cell.format.fill.color = "#ffc7ce";
      }
      sheet.getUsedRange().format.autofitColumns();
      sheet.activate();
      await ctx.sync();
    });

    const msg = data.winners.length
      ? `✓ ${data.winners.length} endpoint(s) returned 200 — see NSPB_OAuthProbe sheet`
      : "⚠ No 200s yet — see NSPB_OAuthProbe for details";
    setSFeedback(msg, data.winners.length ? "ok" : "");
  } catch (e) {
    setSFeedback("✗ " + (e.message || e), "error");
  } finally {
    els.sProbeOauth.disabled = false;
  }
}

async function onDiscover() {
  const s = readSettingsForm();
  if (!s.host || !s.username || !s.password) {
    setSFeedback("host, username and password required", "error");
    return;
  }
  els.sDiscover.disabled = true;
  try {
    // One HTTP call per dim — Cloudflare Workers limits subrequests per
    // invocation (50 free, 1000 paid), and a single big dim like Account
    // would blow the budget if we bundled all dims together.
    setSFeedback("fetching dim list…");
    const dimsResp = await fetch(API + "/api/discover-dims");
    const dimsData = await dimsResp.json();
    if (!dimsData.ok) throw new Error(dimsData.error || "failed to get dim list");
    const dims = dimsData.dims || [];
    if (!dims.length) throw new Error("no discovery dims configured");

    const catalog = {};
    const errors = {};
    for (let i = 0; i < dims.length; i++) {
      const d = dims[i];
      setSFeedback(`discovering ${i + 1}/${dims.length}: ${d}…`);
      try {
        const resp = await fetch(API + "/api/discover", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...s, dims: [d] })
        });
        const data = await resp.json();
        if (!data.ok) { errors[d] = data.error || "discover failed"; continue; }
        if (data.catalog && data.catalog[d]) catalog[d] = data.catalog[d];
        if (data.errors && data.errors[d]) errors[d] = data.errors[d];
      } catch (e) {
        errors[d] = String(e.message || e);
      }
    }

    await saveJson(CATALOG_KEY, { loadedAt: Date.now(), catalog });
    const summary = Object.keys(catalog)
      .map(d => `${d}=${catalog[d].length}`).join(", ");
    const errDims = Object.keys(errors);
    const firstErr = errDims.length ? errors[errDims[0]] : "";
    const errTxt = errDims.length
      ? ` · errors (${errDims.length}): ${firstErr}`
      : "";
    setSFeedback("✓ catalog: " + summary + errTxt, errDims.length ? "error" : "ok");

    const dimRows = Object.keys(catalog).map(d => {
      const members = catalog[d] || [];
      return [
        d,
        members.length,
        memberLabel(members[0]),
        memberLabel(members[members.length - 1]),
        errors[d] || ""
      ];
    });
    for (const d of Object.keys(errors)) {
      if (!catalog[d]) dimRows.push([d, 0, "(error)", "", errors[d]]);
    }
    await writeInventorySheet(
      "NSPB_Dimensions",
      ["Dimension", "Members", "First Member", "Last Member", "Error"],
      dimRows
    );
  } catch (e) {
    setSFeedback("✗ " + (e.message || e), "error");
  } finally {
    els.sDiscover.disabled = false;
  }
}

// Mirror of onDiscover but for business rules. POSTs once to /api/discover-rules
// (no per-dim loop — rules are listed in a single REST call) and stashes the
// result in localStorage. Sent on every /api/chat so Gemini's prompt can list
// the rules by name without inventing.
async function onDiscoverRules() {
  const s = readSettingsForm();
  if (!s.host || !s.username || !s.password) {
    setSFeedback("host, username and password required", "error");
    return;
  }
  els.sDiscoverRules.disabled = true;
  try {
    setSFeedback("discovering business rules…");
    const resp = await fetch(API + "/api/discover-rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(s)
    });
    const data = await resp.json();
    if (!data.ok) throw new Error(data.error || "discover-rules failed");
    const rules = data.rules || [];
    await saveJson(RULES_KEY, { loadedAt: Date.now(), rules });
    if (data.error) {
      setSFeedback(`✓ saved ${rules.length} rules (with warning: ${data.error})`, "ok");
    } else {
      setSFeedback(`✓ found ${rules.length} business rules`, "ok");
    }

    await writeInventorySheet(
      "NSPB_Rules",
      ["Name", "Cube", "Type", "Description"],
      rules.map(r => [r.name || "", r.cube || r.planType || "", r.jobType || "RULES", r.description || ""])
    );
  } catch (e) {
    setSFeedback("✗ " + (e.message || e), "error");
  } finally {
    els.sDiscoverRules.disabled = false;
  }
}

async function onDiscoverForms() {
  const s = readSettingsForm();
  if (!s.host || !s.username || !s.password) {
    setSFeedback("host, username and password required", "error");
    return;
  }
  els.sDiscoverForms.disabled = true;
  try {
    setSFeedback("discovering forms…");
    const resp = await fetch(API + "/api/discover-forms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(s)
    });
    const data = await resp.json();
    if (!data.ok) throw new Error(data.error || "discover-forms failed");
    const forms = data.forms || [];
    await saveJson(FORMS_KEY, { loadedAt: Date.now(), forms });
    if (data.error) {
      setSFeedback(`✓ saved ${forms.length} forms (with warning: ${data.error})`, "ok");
    } else {
      setSFeedback(`✓ found ${forms.length} forms`, "ok");
    }

    await writeInventorySheet(
      "NSPB_Forms",
      ["Name", "Path", "Category", "Cube", "Description"],
      forms.map(f => [f.name || "", f.path || "", f.category || "", f.cube || "", f.description || ""])
    );
  } catch (e) {
    setSFeedback("✗ " + (e.message || e), "error");
  } finally {
    els.sDiscoverForms.disabled = false;
  }
}

async function onDiscoverVariables() {
  const s = readSettingsForm();
  if (!s.host || !s.username || !s.password) {
    setSFeedback("host, username and password required", "error");
    return;
  }
  els.sDiscoverVars.disabled = true;
  try {
    setSFeedback("discovering substitution variables…");
    const resp = await fetch(API + "/api/discover-variables", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(s)
    });
    const data = await resp.json();
    if (!data.ok) throw new Error(data.error || "discover-variables failed");
    const variables = data.variables || [];
    await saveJson(VARS_KEY, { loadedAt: Date.now(), variables });
    if (data.error) {
      setSFeedback(`✓ saved ${variables.length} vars (warning: ${data.error})`, "ok");
    } else {
      setSFeedback(`✓ found ${variables.length} substitution variables`, "ok");
    }

    // Quick-glance Vars sheet — for the colored/sorted/sugerencia version,
    // the user types "show me variables" in chat (server-side renderer).
    await writeInventorySheet(
      "NSPB_Variables",
      ["Name", "Value", "Scope"],
      variables.map(v => [v.name || "", v.value || "", v.scope || ""])
    );
  } catch (e) {
    setSFeedback("✗ " + (e.message || e), "error");
  } finally {
    els.sDiscoverVars.disabled = false;
  }
}

// Discover recent jobs from BOTH the Planning REST `/jobs` endpoint and the
// FDMEE/Data-Management `/aif/rest/V1/jobs` endpoint. Sorted newest-first by
// startTime; capped server-side at 80 to keep the chat body small.
async function onDiscoverJobs() {
  const s = readSettingsForm();
  if (!s.host || !s.username || !s.password) {
    setSFeedback("host, username and password required", "error");
    return;
  }
  els.sDiscoverJobs.disabled = true;
  try {
    setSFeedback("fetching recent jobs (Planning + DM)…");
    const resp = await fetch(API + "/api/discover-jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(s)
    });
    const data = await resp.json();
    if (!data.ok) throw new Error(data.error || "discover-jobs failed");
    const jobs = data.jobs || [];
    await saveJson(JOBS_KEY, { loadedAt: Date.now(), jobs });
    const planning = jobs.filter(j => j.source === "planning").length;
    const dm = jobs.filter(j => j.source === "dm").length;
    if (data.error) {
      setSFeedback(`✓ saved ${jobs.length} jobs (warning: ${data.error})`, "ok");
    } else {
      setSFeedback(`✓ found ${jobs.length} jobs (planning=${planning}, dm=${dm})`, "ok");
    }

    await writeInventorySheet(
      "NSPB_Jobs",
      ["Source", "Name", "Type", "Status", "Started", "Ended", "Duration"],
      jobs.map(j => [
        j.source || "",
        j.name || j.jobName || j.processName || "",
        j.type || j.jobType || "",
        j.status || "",
        j.startTime || j.startedAt || j.started || "",
        j.endTime   || j.endedAt   || j.ended   || "",
        j.duration  || j.elapsed   || ""
      ])
    );
  } catch (e) {
    setSFeedback("✗ " + (e.message || e), "error");
  } finally {
    els.sDiscoverJobs.disabled = false;
  }
}

// ── Auto-write inventory sheets after Discover ─────────────────────────────
// Each Discover button writes its result into a dedicated NSPB_<Foo> sheet so
// the user gets visual confirmation without typing "show me <foo>" in chat.
// Default ad-hoc styling (bold header + bold first col + autofit). Uses
// inPlace:true so re-clicking Discover refreshes the same sheet instead of
// stacking copies.
async function writeInventorySheet(sheetName, header, rows) {
  // chat-only mode (set by Load everything) — skip every NSPB_<Foo>
  // sheet write so the user's workbook stays clean.
  if (window.NSPB_DETECT_CHAT_ONLY) return;
  const safeRows = (Array.isArray(rows) && rows.length) ? rows : [["(none)"]];
  const grid = [header.slice(), ...safeRows.map(r => r.slice())];
  // Pad every row to header width so writeGridToSheet doesn't see jagged shape.
  const w = header.length;
  for (const r of grid) while (r.length < w) r.push("");
  try {
    await writeGridToSheet(sheetName, grid, null, { inPlace: true });
  } catch (e) {
    if (isLostFocusError(e)) {
      addRetryBanner(
        "Inventory sheet \"" + sheetName + "\" couldn't be written.",
        () => writeGridToSheet(sheetName, grid, null, { inPlace: true })
      );
    } else {
      // Don't disrupt the Discover feedback — log and move on.
      console.warn("writeInventorySheet failed:", sheetName, e.message || e);
    }
  }
}

const memberLabel = (m) => {
  if (m == null) return "";
  if (typeof m === "string") return m;
  return m.name || m.member || m.label || m.id || "";
};

async function onDiscoverIntegrations() {
  const s = readSettingsForm();
  if (!s.host || !s.username || !s.password) {
    setSFeedback("host, username and password required", "error");
    return;
  }
  els.sDiscoverInteg.disabled = true;
  try {
    setSFeedback("discovering integrations + pipelines…");
    const resp = await fetch(API + "/api/discover-integrations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(s)
    });
    const data = await resp.json();
    if (!data.ok) throw new Error(data.error || "discover-integrations failed");
    const integrations = data.integrations || [];
    const pipelines    = data.pipelines    || [];
    await saveJson(INTEG_KEY, { loadedAt: Date.now(), integrations, pipelines });
    setSFeedback(`✓ ${integrations.length} integrations · ${pipelines.length} pipelines`, "ok");

    await writeInventorySheet(
      "NSPB_Integrations",
      ["Name", "Source App", "Target App", "Category", "Status", "Description"],
      integrations.map(i => [i.name, i.sourceApp, i.targetApp, i.category, i.status, i.description])
    );
    await writeInventorySheet(
      "NSPB_Pipelines",
      ["Name", "Stages", "Last Run", "Status", "Description"],
      pipelines.map(p => [p.name, p.stageCount, p.lastRun, p.status, p.description])
    );
  } catch (e) {
    setSFeedback("✗ " + (e.message || e), "error");
  } finally {
    els.sDiscoverInteg.disabled = false;
  }
}

async function onDiscoverApplications() {
  const s = readSettingsForm();
  if (!s.host || !s.username || !s.password) {
    setSFeedback("host, username and password required", "error");
    return;
  }
  els.sDiscoverApps.disabled = true;
  try {
    setSFeedback("discovering DM applications…");
    const resp = await fetch(API + "/api/discover-applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(s)
    });
    const data = await resp.json();
    if (!data.ok) throw new Error(data.error || "discover-applications failed");
    const applications  = data.applications  || [];
    const sourceSystems = data.sourceSystems || [];
    await saveJson(APPS_KEY, { loadedAt: Date.now(), applications, sourceSystems });
    setSFeedback(`✓ ${applications.length} DM applications`, "ok");

    // Source systems endpoint requires NSPB session auth (Basic Auth gives 401)
    // — skip the empty NSPB_SourceSystems write so the user isn't confused by
    // a "(none)" sheet. Only NSPB_Applications gets created (the data we have).
    await writeInventorySheet(
      "NSPB_Applications",
      ["Name", "Type", "Category", "Target Class", "Description"],
      applications.map(a => [a.name, a.type, a.category, a.targetClass, a.description])
    );
  } catch (e) {
    setSFeedback("✗ " + (e.message || e), "error");
  } finally {
    els.sDiscoverApps.disabled = false;
  }
}

// ── Detect Everything — one-click workflow ────────────────────────────────
// Runs every discovery in sequence (parallel where independent), captures
// status per probe, writes NSPB_Discovery sheet with the result table so the
// user knows what worked / what didn't, and ends with a "ready to work"
// message. Each probe also auto-writes its own NSPB_<Foo> sheet on success
// (same handlers the granular buttons use).
async function onDetectAll(opts) {
  // chatOnly = true → skip every Excel sheet write (NSPB_* + NSPB_Discovery)
  // and post the summary in the chat only. Used by "Load everything" so the
  // workbook isn't polluted with 12+ inventory tabs the user didn't ask for.
  const chatOnly = !!(opts && opts.chatOnly);
  window.NSPB_DETECT_CHAT_ONLY = chatOnly;
  const s = readSettingsForm();
  if (!s.host || !s.username || !s.password) {
    setSFeedback("host, username and password required", "error");
    return;
  }
  // Persist the typed form values BEFORE discovery so the user doesn't have
  // to click Save separately. Most users hit Detect + close without saving,
  // which used to leave settings unpersisted and break the next chat send.
  try {
    window.NSPB_SETTINGS = s;
    await saveSettings(s);
  } catch (_) {}
  els.sDetectAll.disabled = true;
  const t0 = Date.now();
  const results = [];

  // Delete sheets that were once written by older versions of Detect but are
  // no longer refreshed (e.g. NSPB_Navigator, removed in v2).
  const STALE_SHEETS = ["NSPB_Navigator"];
  try {
    await Excel.run(async ctx => {
      for (const name of STALE_SHEETS) {
        const sh = ctx.workbook.worksheets.getItemOrNullObject(name);
        sh.load("isNullObject");
        await ctx.sync();
        if (!sh.isNullObject) { sh.delete(); await ctx.sync(); }
      }
    });
  } catch (_) { /* ignore — deleting stale sheets is best-effort */ }
  const probe = async (label, run) => {
    const ts = Date.now();
    try {
      const detail = await run();
      results.push({ label, ok: true, ms: Date.now() - ts, detail: detail || "" });
    } catch (e) {
      results.push({ label, ok: false, ms: Date.now() - ts, detail: String(e.message || e).slice(0, 200) });
    }
  };
  const callJson = async (path, body, timeoutMs = 60000) => {
    const ctrl = new AbortController();
    const tm = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const r = await fetch(API + path, {
        method: body ? "POST" : "GET",
        headers: body ? { "Content-Type": "application/json" } : {},
        body: body ? JSON.stringify(body) : undefined,
        signal: ctrl.signal
      });
      const data = await r.json();
      if (!data.ok) throw new Error(data.error || "request failed");
      return data;
    } finally { clearTimeout(tm); }
  };

  try {
    setSFeedback("step 1/9 — testing connection…");
    await probe("Connection", async () => {
      const d = await callJson("/api/test-connection", s, 30000);
      return `app=${d.application}`;
    });

    setSFeedback("step 2/9 — detecting cubes / dims / period / years…");
    await probe("App config (cubes/dims)", async () => {
      const d = await callJson("/api/discover-app-config", s, 60000);
      await saveJson(APP_CONFIG_KEY, d);
      const cubeNames = (d.cubes||[]).join(", ") || "?";
      // Write NSPB_Cubes sheet
      const cubeRows = (d.cubes||[]).map(c => {
        const dims = (d.cubeDims && d.cubeDims[c]) || [];
        const defaults = (d.cubeDimDefaults && d.cubeDimDefaults[c]) || {};
        return [c, dims.length, dims.join(", "), c === d.mainCube ? "✓" : ""];
      });
      await writeInventorySheet("NSPB_Cubes",
        ["Cube", "Dimensions", "Dim List", "Main"],
        cubeRows);
      return `${(d.cubes||[]).length} cubes (${cubeNames}) · period=${(d.monthMembers||[]).length>0 ? (d.monthMembers||[]).length+" months" : "?"} · ${(d.years||[]).length} years · ${(d.scenarios||[]).length} scenarios`;
    });

    setSFeedback("step 3/9 — discovering dimension members (slow, ~30s)…");
    await probe("Dimensions (catalog)", async () => {
      // Prefer the live appConfig dim list (portable across tenants). Fall
      // back to /api/discover-dims (CLIENT_CONFIG.discoveryDims) only if the
      // app-config probe failed or returned nothing usable. Skip Period —
      // it's column-only and its catalog is too big to be useful here.
      const cfg = await loadJson(APP_CONFIG_KEY);
      let dims;
      if (cfg && cfg.cubes && cfg.cubeDims && cfg.mainCube && cfg.cubeDims[cfg.mainCube]) {
        dims = (cfg.cubeDims[cfg.mainCube] || []).filter(d => d !== "Period");
      } else {
        const dimsResp = await fetch(API + "/api/discover-dims");
        const dimsData = await dimsResp.json();
        if (!dimsData.ok) throw new Error("dim list failed");
        dims = dimsData.dims || [];
      }
      const catalog = {};
      const errs = [];
      for (let i = 0; i < dims.length; i++) {
        const d = dims[i];
        setSFeedback(`step 3/9 — dims (${i + 1}/${dims.length}: ${d})…`);
        try {
          const r = await callJson("/api/discover", { ...s, dims: [d], mainCube: cfg && cfg.mainCube || null }, 60000);
          if (r.catalog && r.catalog[d]) catalog[d] = r.catalog[d];
          if (r.errors && r.errors[d]) errs.push(`${d}: ${r.errors[d]}`);
        } catch (e) { errs.push(`${d}: ${e.message || e}`); }
      }
      await saveJson(CATALOG_KEY, { loadedAt: Date.now(), catalog });
      const total = Object.values(catalog).reduce((a, b) => a + b.length, 0);
      const dimRows = Object.keys(catalog).map(d => {
        const m = catalog[d] || [];
        return [d, m.length, memberLabel(m[0]), memberLabel(m[m.length - 1]), errs.find(e => e.startsWith(d + ":")) || ""];
      });
      await writeInventorySheet("NSPB_Dimensions",
        ["Dimension", "Members", "First Member", "Last Member", "Error"], dimRows);
      return `${Object.keys(catalog).length}/${dims.length} dims · ${total} members${errs.length ? " · " + errs.length + " errors" : ""}`;
    });

    setSFeedback("step 4/9 — business rules…");
    await probe("Business rules", async () => {
      const d = await callJson("/api/discover-rules", s);
      const rules = d.rules || [];
      await saveJson(RULES_KEY, { loadedAt: Date.now(), rules });
      await writeInventorySheet("NSPB_Rules",
        ["Name", "Cube", "Type", "Description"],
        rules.map(r => [r.name || "", r.cube || r.planType || "", r.jobType || "RULES", r.description || ""]));
      return `${rules.length} rules`;
    });

    setSFeedback("step 5/9 — forms…");
    await probe("Forms", async () => {
      const d = await callJson("/api/discover-forms", s, 60000);
      const forms = d.forms || [];
      await saveJson(FORMS_KEY, { loadedAt: Date.now(), forms });
      const cats = forms.reduce((a, f) => { a[f.category||"unknown"]=(a[f.category||"unknown"]||0)+1; return a; }, {});
      await writeInventorySheet("NSPB_Forms",
        ["Name", "Path", "Category", "Cube", "Type", "Description"],
        forms.map(f => [f.name || "", f.path || "", f.category || "", f.cube || "", f.type || f.subType || "", f.description || ""]));
      return `${forms.length} forms (${Object.entries(cats).map(([k,v])=>`${k}=${v}`).join(", ")})`;
    });

    setSFeedback("step 6/9 — substitution variables…");
    await probe("Substitution variables", async () => {
      const d = await callJson("/api/discover-variables", s);
      const vars_ = d.variables || [];
      await saveJson(VARS_KEY, { loadedAt: Date.now(), variables: vars_ });
      await writeInventorySheet("NSPB_Variables",
        ["Name", "Value", "Scope"],
        vars_.map(v => [v.name || "", v.value || "", v.scope || ""]));
      return `${vars_.length} vars`;
    });

    setSFeedback("step 7/9 — recent jobs (Planning + DM)…");
    await probe("Jobs", async () => {
      const d = await callJson("/api/discover-jobs", s, 60000);
      const jobs = d.jobs || [];
      await saveJson(JOBS_KEY, { loadedAt: Date.now(), jobs });
      const planning = jobs.filter(j => j.source === "planning").length;
      const dm = jobs.filter(j => j.source === "dm").length;
      await writeInventorySheet("NSPB_Jobs",
        ["Source", "Name", "Type", "Status", "Started", "Ended", "Duration"],
        jobs.map(j => [j.source||"", j.name||j.jobName||j.processName||"", j.type||j.jobType||"", j.status||"", j.startTime||"", j.endTime||"", j.duration||""]));
      return `${jobs.length} jobs (planning=${planning}, dm=${dm})`;
    });

    setSFeedback("step 8/9 — DM integrations + pipelines + applications…");
    await probe("Integrations + pipelines", async () => {
      const d = await callJson("/api/discover-integrations", s, 60000);
      const integrations = d.integrations || [];
      const pipelines = d.pipelines || [];
      await saveJson(INTEG_KEY, { loadedAt: Date.now(), integrations, pipelines });
      await writeInventorySheet("NSPB_Integrations",
        ["Name", "Source App", "Target App", "Last Run", "Status", "Note"],
        integrations.map(i => [i.name, i.sourceApp||"", i.targetApp||"", i.lastRun||"", i.status||"", "Data Rule — run history only (full config requires NSPB UI)"]));
      await writeInventorySheet("NSPB_Pipelines",
        ["Name", "Stages", "Last Run", "Status", "Description"],
        pipelines.map(p => [p.name, p.stageCount, p.lastRun, p.status, p.description]));
      return `${integrations.length} integrations · ${pipelines.length} pipelines`;
    });

    await probe("DM applications", async () => {
      const d = await callJson("/api/discover-applications", s, 60000);
      const applications = d.applications || [];
      await saveJson(APPS_KEY, { loadedAt: Date.now(), applications, sourceSystems: d.sourceSystems || [] });
      const appRole = t => {
        if (!t) return "";
        t = String(t).toUpperCase();
        if (t === "DATASOURCE") return "Saved Search / Query";
        if (t === "PLANNING")   return "Planning (target app)";
        if (t === "NETSUITE")   return "NetSuite (source)";
        if (t === "FILE")       return "File / Flat File";
        if (t === "EPBCS")      return "EPBCS (target)";
        return t;
      };
      await writeInventorySheet("NSPB_Applications",
        ["Name", "Role", "Type", "Category", "Target Class"],
        applications
          .sort((a, b) => (a.type||"").localeCompare(b.type||""))
          .map(a => [a.name, appRole(a.type), a.type, a.category, a.targetClass]));
      return `${applications.length} apps`;
    });

    setSFeedback("step 9/9 — currencies, versions, running jobs…");
    await probe("Currencies", async () => {
      const d = await callJson("/api/discover-currencies", s);
      const currencies = d.currencies || [];
      await saveJson(CURRENCIES_KEY, { loadedAt: Date.now(), currencies });
      await writeInventorySheet("NSPB_Currencies",
        ["Code", "Name", "Symbol", "Scale", "Reporting"],
        currencies.length ? currencies.map(c => [c.code, c.name, c.symbol, c.scale, c.reporting ? "Yes" : ""])
                          : [["(none found — endpoint not available on this tenant)", "", "", "", ""]]);
      return `${currencies.length} currencies${d.error ? " ⚠ "+d.error : ""}`;
    });

    await probe("Versions", async () => {
      // Version members live in the Version dimension of the main cube — use
      // the same loadDimMembers path that works for all other dims.
      const cfg = await loadJson(APP_CONFIG_KEY);
      const cube = (cfg && cfg.mainCube) || null;
      const d = await callJson("/api/discover", { ...s, dims: ["Version"], mainCube: cube }, 60000);
      const members = (d.catalog && d.catalog["Version"]) || [];
      const versions = members.map(m => ({ name: memberLabel(m), type: "", description: m.alias || "", enabled: true }));
      await saveJson(VERSIONS_KEY, { loadedAt: Date.now(), versions });
      await writeInventorySheet("NSPB_Versions",
        ["Name", "Alias", "Parent", "Level"],
        members.length ? members.map(m => [memberLabel(m), m.alias || "", m.parent || "", m.level != null ? m.level : ""])
                       : [["(none found)", "", "", ""]]);
      return `${members.length} version members${d.errors && d.errors["Version"] ? " ⚠ "+d.errors["Version"] : ""}`;
    });

    await probe("Running jobs", async () => {
      const d = await callJson("/api/discover-running-jobs", s);
      const jobs = d.runningJobs || [];
      await writeInventorySheet("NSPB_RunningJobs",
        ["ID", "Name", "Type", "Status", "Started", "User", "Cube"],
        jobs.length ? jobs.map(j => [j.id, j.name, j.type, j.status, j.startTime, j.user, j.cube])
                    : [["(none running)", "", "", "", "", "", ""]]);
      return jobs.length ? `${jobs.length} running` : "none running";
    });

    setSFeedback("building status report…");
    // Build NSPB_Discovery status sheet
    const okCount = results.filter(r => r.ok).length;
    const failCount = results.length - okCount;
    const totalMs = Date.now() - t0;
    const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
    const grid = [
      ["NSPB Discovery — connection probe results", "", "", ""],
      ["", "", "", ""],
      [`Last refreshed: ${stamp} UTC  ·  ${results.length} probes  ·  ${okCount} OK · ${failCount} failed  ·  ${(totalMs/1000).toFixed(1)}s total`, "", "", ""],
      ["", "", "", ""],
      ["Capability", "Status", "Time", "Detail"]
    ];
    for (const r of results) grid.push([r.label, r.ok ? "✓" : "✗", `${r.ms}ms`, r.detail]);
    grid.push(["", "", "", ""]);
    grid.push([
      failCount === 0
        ? "✓ Ready to work — all probes passed. Sheets written: NSPB_Cubes, NSPB_Dimensions, NSPB_Rules, NSPB_Forms, NSPB_Variables, NSPB_Jobs, NSPB_Integrations, NSPB_Pipelines, NSPB_Applications, NSPB_Currencies, NSPB_Versions, NSPB_RunningJobs. Type 'help' in chat for command examples."
        : `⚠ ${failCount} probe(s) failed — see Detail column above. The add-in still works for the capabilities that succeeded.`,
      "", "", ""
    ]);
    if (!chatOnly) {
      try {
        await writeGridToSheet("NSPB_Discovery", grid, null, { inPlace: true });
      } catch (e) {
        console.warn("NSPB_Discovery write failed:", e.message || e);
      }
    }

    if (failCount === 0) {
      setSFeedback(`✓ Ready — ${okCount}/${results.length} probes OK · ${(totalMs/1000).toFixed(1)}s. Pre-caching forms…`, "ok");
    } else {
      setSFeedback(`⚠ ${okCount}/${results.length} OK, ${failCount} failed — see NSPB_Discovery sheet`, "error");
    }

    // ── Pre-cache all discovered forms automatically ─────────────────
    // The user wants ONE button that does everything. After the probes
    // succeed, immediately pre-cache form slices so the first open of any
    // form is instant.
    let precacheLine = "";
    if (failCount === 0) {
      try {
        await onPrecacheForms();
        precacheLine = "Forms pre-cached.";
      } catch (e) {
        precacheLine = "Pre-cache step skipped: " + (e.message || e);
      }
    }

    // ── Summary in chat — single place, no Excel sheet swap needed ───
    try {
      const lines = [];
      lines.push(`**Detect everything** — ${okCount}/${results.length} probes OK in ${(totalMs/1000).toFixed(1)}s`);
      if (precacheLine) lines.push(precacheLine);
      lines.push("");
      for (const r of results) {
        lines.push(`* ${r.ok ? "✓" : "✗"} **${r.label}** — ${r.detail || ""}${r.detail ? " · " : ""}${r.ms}ms`);
      }
      lines.push("");
      if (chatOnly) {
        lines.push("Inventory cached in the add-in (no sheets written). Forms cache lives until you click **Refresh cache** in Settings.");
      } else {
        lines.push("Full report on sheet `NSPB_Discovery`. Forms cache lives until you click **Refresh cache** in Settings.");
      }
      addMsg("assistant", lines.join("\n"));
    } catch (e) {
      console.warn("post-detect chat summary failed:", e);
    }
  } catch (e) {
    setSFeedback("✗ " + (e.message || e), "error");
  } finally {
    els.sDetectAll.disabled = false;
  }
}

// All storage keys that make up a "client snapshot" — connection settings,
// LCM-derived knowledge base, plus everything Discovery populates. Anything
// added in the future should be added here too so client switches stay clean.
const CLIENT_SNAPSHOT_KEYS = [
  STORAGE_KEY, CATALOG_KEY, RULES_KEY, FORMS_KEY, VARS_KEY, JOBS_KEY,
  INTEG_KEY, APPS_KEY, APP_CONFIG_KEY, TENANT_KB_KEY, CURRENCIES_KEY,
  VERSIONS_KEY, DM_CATEGORIES_KEY, LOCATIONS_KEY, PERIOD_MAP_V1_KEY
];

async function onExportClient() {
  try {
    // window.prompt is not supported in Office.js — read from inline input field instead.
    const nameInput = document.getElementById("s-client-name");
    const name = ((nameInput && nameInput.value) || "").trim();
    if (!name) {
      setSFeedback("Type a name in the 'Name for export' field above the buttons, then click Export.", "error");
      if (nameInput) nameInput.focus();
      return;
    }

    const snapshot = {
      _format: "nspb-client-snapshot/v1",
      _name: name,
      _exportedAt: new Date().toISOString(),
      _addinVersion: "current",
      data: {}
    };
    for (const k of CLIENT_SNAPSHOT_KEYS) {
      const v = await loadJson(k);
      if (v != null) snapshot.data[k] = v;
    }
    // FALLBACK: if the user typed host/user/app in Settings but never clicked
    // Save before clicking Export, STORAGE_KEY won't be populated yet — but
    // window.NSPB_SETTINGS holds the in-memory values. Use those.
    if (!snapshot.data[STORAGE_KEY] && window.NSPB_SETTINGS) {
      snapshot.data[STORAGE_KEY] = { ...window.NSPB_SETTINGS };
    }
    // Also pull any UNSAVED edits straight from the form fields if the
    // panel is open — guarantees URL/user/app are always captured.
    try {
      const liveSettings = readSettingsForm ? readSettingsForm() : null;
      if (liveSettings && liveSettings.host) {
        const merged = { ...(snapshot.data[STORAGE_KEY] || {}), ...liveSettings };
        snapshot.data[STORAGE_KEY] = merged;
      }
    } catch (_) {}

    // Trigger download as JSON file
    const safeFn = name.replace(/[^A-Za-z0-9_\-]/g, "_") + "_" +
                   new Date().toISOString().slice(0, 10) + ".nspb-client.json";
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = safeFn;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);

    const count = Object.keys(snapshot.data).length;
    if (els.sClientStatus) {
      els.sClientStatus.textContent = `✓ Exported ${count} keys → ${safeFn}`;
      els.sClientStatus.style.color = "#166534";
    }
    setSFeedback(`Exported ${count} sections as ${safeFn}`);
    logDebug({ cmd: "export_client", name, file: safeFn, keyCount: count });
  } catch (e) {
    setSFeedback("Export failed: " + (e.message || e), "error");
  }
}

async function onImportClient(e) {
  const file = e.target.files && e.target.files[0];
  e.target.value = "";
  if (!file) return;
  try {
    const text = await file.text();
    const snapshot = JSON.parse(text);
    // Detect file type:
    //  - Full client snapshot (_format = nspb-client-snapshot/v1) → restore everything
    //  - tenant-kb.json (has forms/dashboards/navigationFlows) → just import as KB
    const isFullSnapshot = snapshot && snapshot._format === "nspb-client-snapshot/v1";
    const isKbOnly = !isFullSnapshot && snapshot && (snapshot.forms || snapshot.dashboards || snapshot.navigationFlows);

    if (isKbOnly) {
      // 1) Save as tenant KB
      await saveJson(TENANT_KB_KEY, snapshot);
      window.NSPB_TENANT_KB = snapshot;
      const summary = `${(snapshot.forms||[]).length} forms · ${(snapshot.dashboards||[]).length} dashboards · ${(snapshot.rules||[]).length} rules · schema v${snapshot.schemaVersion || "?"}`;
      if (els.sClientStatus) {
        els.sClientStatus.textContent = `✓ Imported tenant-kb.json (${summary}). Pre-caching forms…`;
        els.sClientStatus.style.color = "#166534";
      }
      setSFeedback(`Imported tenant KB: ${summary}. Pre-caching forms in background…`);
      logDebug({ cmd: "import_kb_via_client_btn", summary });
      // 2) Auto pre-cache all forms in background — only if NSPB credentials
      //    are set, otherwise the open-form REST calls would 401. The user
      //    can run it later via the same button, but most of the value of
      //    importing a KB is having forms instant-open, so we trigger it now.
      if (window.NSPB_SETTINGS && window.NSPB_SETTINGS.host && window.NSPB_SETTINGS.password) {
        try {
          await onPrecacheForms();
        } catch (e) {
          console.warn("auto-precache after import failed:", e.message || e);
        }
      } else {
        if (els.sClientStatus) {
          els.sClientStatus.textContent += " (set host+password to pre-cache)";
        }
      }
      return;
    }

    if (!isFullSnapshot) {
      throw new Error("Not a valid client snapshot or tenant-kb.json file.");
    }
    const data = snapshot.data || {};
    const incoming = Object.keys(data).length;
    const name = snapshot._name || "(unnamed)";
    const date = snapshot._exportedAt ? new Date(snapshot._exportedAt).toLocaleString() : "?";

    // Office.js doesn't support window.confirm — show inline status banner with
    // a 2-step gate via the input field name. User must type "yes" to proceed.
    const nameInput = document.getElementById("s-client-name");
    const guard = ((nameInput && nameInput.value) || "").trim().toLowerCase();
    if (guard !== "yes") {
      setSFeedback(
        `Type "yes" in the name field above and click Import again to confirm replacing your current client with "${name}" (exported ${date}, ${incoming} sections).`,
        "error"
      );
      return;
    }

    // Wipe current snapshot keys, then restore.
    for (const k of CLIENT_SNAPSHOT_KEYS) await clearKey(k);
    for (const k of Object.keys(data)) await saveJson(k, data[k]);

    // Refresh in-memory settings + form fields so the import takes effect
    // immediately, no reload required.
    const restoredSettings = data[STORAGE_KEY];
    if (restoredSettings) {
      window.NSPB_SETTINGS = restoredSettings;
      if (els.sHost) els.sHost.value = restoredSettings.host || "";
      if (els.sUser) els.sUser.value = restoredSettings.username || "";
      if (els.sPass) els.sPass.value = restoredSettings.password || "";
      if (els.sApp) els.sApp.value = restoredSettings.appName || "NetSuite";
      if (els.sGemini) els.sGemini.value = restoredSettings.geminiKey || "";
      if (els.sDebug) els.sDebug.checked = !!restoredSettings.debug;
      if (els.sHideZeros) els.sHideZeros.checked = !!restoredSettings.hideZeros;
      if (els.sGlossary) els.sGlossary.value = restoredSettings.glossary || "";
    }
    // Reset name field since "yes" was the confirmation token
    const nameInput2 = document.getElementById("s-client-name");
    if (nameInput2) nameInput2.value = "";

    // Build a detailed import report
    const kbInfo = data[TENANT_KB_KEY];
    const importReport = [
      `✓ Imported "${name}" (exported ${date})`,
      `• ${incoming} storage sections restored`,
      restoredSettings ? `• Connection: ${restoredSettings.host || "?"} / ${restoredSettings.username || "?"} ${restoredSettings.password ? "[password ✓]" : "[no password]"}` : "• No connection settings in this snapshot",
      kbInfo ? `• KB: ${(kbInfo.forms||[]).length} forms · ${(kbInfo.dashboards||[]).length} dashboards · ${(kbInfo.rules||[]).length} rules · schema v${kbInfo.schemaVersion || "?"}` : "• No KB in this snapshot",
      `• Form fields refreshed — press Save to confirm.`
    ].join("\n");

    if (els.sClientStatus) {
      els.sClientStatus.textContent = `✓ Imported "${name}" (${incoming} sections) — fields refreshed.`;
      els.sClientStatus.style.color = "#166534";
    }
    setSFeedback(importReport, "ok");
    logDebug({ cmd: "import_client", name, exportedAt: snapshot._exportedAt, keyCount: incoming, restoredHost: restoredSettings && restoredSettings.host });
  } catch (err) {
    setSFeedback("Import failed: " + (err.message || err), "error");
  }
}

// 🗑️ Clear ALL: wipes settings, KB, discovery, chat, and DuckDB tables.
// Two-step gate: user types "yes" in the name field, then clicks the button.
// Useful for testing fresh imports or fully resetting before switching clients.
// Pre-cache all form slices in IndexedDB. Iterates the loaded forms list
// (live FORMS_KEY → KB fallback) with concurrency=5 so ~150 forms finish
// in ~1 minute without overwhelming NSPB.
async function onPrecacheForms() {
  if (!els.sFormCacheStatus) return;
  const setStatus = (msg, color) => {
    els.sFormCacheStatus.textContent = msg;
    els.sFormCacheStatus.style.color = color || "#555";
  };
  try {
    if (!window.NSPB_SETTINGS || !window.NSPB_SETTINGS.host) {
      setStatus("⚠ Set host/username/password first.", "#dc2626"); return;
    }
    const fw = await loadJson(FORMS_KEY);
    const tkb = await loadJson(TENANT_KB_KEY);
    const formsList = (fw && fw.forms) ? fw.forms : [];
    const kbForms = (tkb && Array.isArray(tkb.forms)) ? tkb.forms : [];
    const seen = new Set();
    const allForms = [];
    for (const f of formsList) { const k = (f.name||"").toLowerCase(); if (k && !seen.has(k)) { seen.add(k); allForms.push(f); } }
    for (const f of kbForms)   { const k = (f.name||"").toLowerCase(); if (k && !seen.has(k)) { seen.add(k); allForms.push(f); } }
    if (!allForms.length) {
      setStatus("⚠ No forms loaded. Click 'Detect everything' first.", "#dc2626"); return;
    }
    const total = allForms.length;
    const t0 = Date.now();
    let done = 0, ok = 0, failed = 0;
    setStatus("Pre-caching " + total + " forms…");
    els.sPrecacheForms.disabled = true;
    const appCfg = await loadJson(APP_CONFIG_KEY);

    // Concurrency-limited loop: 5 in parallel.
    const CONCURRENCY = 5;
    const queue = allForms.slice();
    const worker = async () => {
      while (queue.length) {
        const f = queue.shift();
        if (!f) break;
        try {
          // Skip if already cached & not stale.
          const existing = await formCacheGet(f.name);
          if (existing) { ok++; }
          else {
            const r = await fetch(API + "/api/open-form", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                settings: window.NSPB_SETTINGS,
                form_name: f.name,
                forms: formsList,
                tenantKb: tkb || null,
                appConfig: (appCfg && appCfg.cubes) ? appCfg : null
              })
            });
            const d = await r.json();
            if (d.ok && d.grids && d.grids.length) {
              await formCacheSet(f.name, d);
              ok++;
            } else {
              // Form has no slice (dashboard/no-access) — don't fail the run
              ok++;
            }
          }
        } catch (e) {
          failed++;
          console.log("[PRECACHE_FAIL]", f.name, e.message);
        }
        done++;
        setStatus(`Pre-caching… ${done}/${total} (${ok} ok, ${failed} failed)`);
      }
    };
    const workers = [];
    for (let i = 0; i < CONCURRENCY; i++) workers.push(worker());
    await Promise.all(workers);

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    setStatus(`✓ Pre-cached ${ok}/${total} forms in ${elapsed}s${failed ? ` (${failed} failed)` : ""}`, "#15803d");
  } catch (e) {
    setStatus("✗ " + (e.message || e), "#dc2626");
  } finally {
    if (els.sPrecacheForms) els.sPrecacheForms.disabled = false;
  }
}

// ── NSPB Help (generic knowledge) — download from cloud, store in localStorage,
// inject into AI prompts so Gemini answers like an NSPB expert.
const NSPB_HELP_KEY = "nspb-addin.helpMd.v1";
const NSPB_HELP_TTL_MS = 24 * 60 * 60 * 1000;   // 24h auto-refresh

async function onDownloadHelp() {
  if (!els.sHelpStatus) return;
  els.sHelpStatus.textContent = "Downloading…";
  els.sHelpStatus.style.color = "#555";
  els.sDownloadHelp.disabled = true;
  try {
    const r = await fetch(API + "/api/nspb-help", { method: "GET" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const text = await r.text();
    const version = r.headers.get("X-NSPB-KB-Version") || "?";
    await saveJson(NSPB_HELP_KEY, {
      ts: Date.now(),
      version,
      length: text.length,
      content: text
    });
    const kb = (text.length / 1024).toFixed(1);
    els.sHelpStatus.textContent = `✓ Downloaded ${kb} KB · version ${version}`;
    els.sHelpStatus.style.color = "#15803d";
  } catch (e) {
    els.sHelpStatus.textContent = "✗ " + (e.message || e);
    els.sHelpStatus.style.color = "#dc2626";
  } finally {
    els.sDownloadHelp.disabled = false;
  }
}

async function onClearHelp() {
  await clearKey(NSPB_HELP_KEY);
  if (els.sHelpStatus) {
    els.sHelpStatus.textContent = "✓ Help cleared. AI now answers without the knowledge base.";
    els.sHelpStatus.style.color = "#15803d";
  }
}

async function refreshHelpStatus() {
  if (!els.sHelpStatus) return;
  const help = await loadJson(NSPB_HELP_KEY);
  if (!help || !help.content) {
    els.sHelpStatus.textContent = "Not downloaded yet. Click 📚 Download to enable expert AI answers.";
    els.sHelpStatus.style.color = "#9ca3af";
    return;
  }
  const ageMs = Date.now() - (help.ts || 0);
  const ageHrs = Math.round(ageMs / 3600000);
  const stale = ageMs > NSPB_HELP_TTL_MS;
  const kb = (help.content.length / 1024).toFixed(1);
  els.sHelpStatus.textContent = `${stale ? "⚠ STALE — " : "✓ "}${kb} KB · v${help.version || "?"} · ${ageHrs}h ago${stale ? " (re-download recommended)" : ""}`;
  els.sHelpStatus.style.color = stale ? "#b45309" : "#15803d";
}

// Auto-fetch help on first run if missing — silent, non-blocking.
async function autoFetchHelpIfStale() {
  try {
    const help = await loadJson(NSPB_HELP_KEY);
    if (help && help.content && (Date.now() - help.ts) < NSPB_HELP_TTL_MS) return;
    const r = await fetch(API + "/api/nspb-help");
    if (!r.ok) return;
    const text = await r.text();
    const version = r.headers.get("X-NSPB-KB-Version") || "?";
    await saveJson(NSPB_HELP_KEY, { ts: Date.now(), version, length: text.length, content: text });
  } catch (_) { /* silent — offline = fall back to no help */ }
}

async function onClearFormCache() {
  if (!els.sFormCacheStatus) return;
  els.sFormCacheStatus.textContent = "Clearing…";
  await formCacheClear();
  const stats = await formCacheStats();
  els.sFormCacheStatus.textContent = "✓ Cache cleared (" + stats.count + " entries left).";
  els.sFormCacheStatus.style.color = "#15803d";
}

async function onClearAll() {
  try {
    const nameInput = document.getElementById("s-client-name");
    const guard = ((nameInput && nameInput.value) || "").trim().toLowerCase();
    if (guard !== "yes") {
      setSFeedback("⚠ Type 'yes' in the name field above and click 🗑️ Clear all again to confirm wipe of ALL settings, KB, discovery, chat, and in-browser DB.", "error");
      if (nameInput) nameInput.focus();
      return;
    }
    setSFeedback("Wiping…");
    let wiped = 0;

    // 1) Storage keys (OfficeRuntime + localStorage)
    for (const k of CLIENT_SNAPSHOT_KEYS) {
      try { await clearKey(k); wiped++; } catch (_) {}
    }
    // 2) Sweep any straggling nspb-addin.* keys in localStorage
    try {
      for (const k of Object.keys(localStorage)) {
        if (k.startsWith("nspb-addin")) { localStorage.removeItem(k); wiped++; }
      }
    } catch (_) {}

    // 3) Chat history + UI
    try {
      history.length = 0;
      if (els.messages) els.messages.innerHTML = "";
      addMsg("assistant", "How can I help?");
    } catch (_) {}

    // 4) Drop ALL DuckDB tables
    try {
      const tables = await NSPB_DB.listTables();
      for (const t of tables) await NSPB_DB.dropTable(t.table_name);
    } catch (_) {}

    // 5) Reset in-memory settings
    window.NSPB_SETTINGS = { ...DEMO_SETTINGS };
    if (els.sHost) els.sHost.value = "";
    if (els.sUser) els.sUser.value = "";
    if (els.sPass) els.sPass.value = "";
    if (els.sApp) els.sApp.value = "";
    if (els.sGemini) els.sGemini.value = "";
    if (nameInput) nameInput.value = "";

    if (els.sClientStatus) {
      els.sClientStatus.textContent = `✓ Cleared ${wiped} keys + chat + DuckDB tables. Reload task pane to fully reset.`;
      els.sClientStatus.style.color = "#16a34a";
    }
    setSFeedback(`✓ Wiped ${wiped} storage keys + chat + DuckDB. Close and reopen the task pane for a fully clean state.`);
    logDebug({ cmd: "clear_all", keysWiped: wiped });
  } catch (e) {
    setSFeedback("Clear failed: " + (e.message || e), "error");
  }
}

async function onImportKb(e) {
  const file = e.target.files && e.target.files[0];
  e.target.value = "";
  if (!file) return;
  try {
    const text = await file.text();
    const kb = JSON.parse(text);
    if (!kb || typeof kb !== "object") throw new Error("Invalid JSON — expected an object.");
    await saveJson(TENANT_KB_KEY, kb);
    const date = kb.generatedAt ? new Date(kb.generatedAt).toLocaleDateString() : "unknown date";
    const client = kb.client ? ` · ${kb.client}` : "";
    const summary = `✓ ${(kb.forms||[]).length} forms · ${(kb.rules||[]).length} rules · ${date}${client}`;
    if (els.sKbStatus) { els.sKbStatus.textContent = summary; els.sKbStatus.style.color = "#166534"; }
    setSFeedback(`Knowledge base imported: ${summary}`);
  } catch (err) {
    setSFeedback("Import failed: " + (err.message || err), "error");
  }
}

async function onClearKb() {
  await clearKey(TENANT_KB_KEY);
  if (els.sKbStatus) { els.sKbStatus.textContent = "Not loaded"; els.sKbStatus.style.color = "#999"; }
  setSFeedback("Knowledge base cleared.");
}

async function onSaveSettings() {
  const s = readSettingsForm();
  if (!s.host || !s.username || !s.password) {
    setSFeedback("host, username and password are all required", "error");
    return;
  }
  if (s.geminiKey) {
    const provider = detectAiProvider(s.geminiKey);
    if (provider === "unknown") {
      setSFeedback("AI key not recognized — Gemini starts with AIza…, Claude with sk-ant-…", "error");
      return;
    }
  }
  // If host or app changed, the old catalog is useless — drop it so the user
  // reopens Settings and clicks Discover. Same for lastGrid (points at a
  // grid from a different environment).
  const prev = window.NSPB_SETTINGS || {};
  if (prev.host !== s.host || prev.appName !== s.appName) {
    await clearKey(CATALOG_KEY);
    await clearKey(GRID_KEY);
    await clearKey(RULES_KEY);
    await clearKey(FORMS_KEY);
    await clearKey(VARS_KEY);
    await clearKey(JOBS_KEY);
    await clearKey(INTEG_KEY);
    await clearKey(APPS_KEY);
    await clearKey(APP_CONFIG_KEY);
  }
  window.NSPB_SETTINGS = s;
  await saveSettings(s);
  setSFeedback("✓ saved", "ok");
  setTimeout(() => els.overlay.classList.add("hidden"), 500);
  await refreshHealth();
}

function setSFeedback(text, cls) {
  els.sFeedback.textContent = text;
  els.sFeedback.className = cls || "";
  // Preserve newlines in multi-line feedback (import report, etc.)
  els.sFeedback.style.whiteSpace = "pre-line";
}

// ── Health ───────────────────────────────────────────────────────────────────
async function refreshHealth() {
  try {
    const r = await fetch(API + "/api/health");
    const data = await r.json();
    if (!window.NSPB_SETTINGS.geminiKey) {
      setStatus("No AI key — click ⚙ to paste a Gemini or Claude key.", "error");
    } else {
      const label = (data.models && data.models.fast) || "gemini";
      setStatus("", "");
    }
  } catch (_) {
    setStatus("Worker not reachable — check your deployment.", "error");
  }
}
function setStatus(text, cls) {
  els.status.textContent = text;
  els.status.className = (cls || "") + (text ? "" : " hidden");
}

// ── Debug trace rendering ────────────────────────────────────────────────────
function formatTraceEntry(entry) {
  const nCalls = entry.toolCalls ? entry.toolCalls.length : 0;
  const header = "🧠 " + (entry.model || "?") +
                 (entry.retried ? " (retried after MALFORMED)" : "") +
                 " · toolMode=" + (entry.toolMode || "AUTO") +
                 " · " + nCalls + " tool calls" +
                 " · finish=" + (entry.finishReason || "?") +
                 (entry.hideZeros ? " · hideZeros=ON" : "") +
                 " · " + (entry.roundMs != null ? entry.roundMs + " ms" : "?");
  const out = [header];
  if (entry.prose) out.push("  💬 " + truncateStr(entry.prose, 240));
  if (!nCalls) {
    out.push("  ⚠ no tool invoked" + (entry.prose ? "" : " — model returned empty content"));
    return out.join("\n");
  }
  for (const tc of entry.toolCalls) {
    const argsStr = truncateStr(typeof tc.args === "string" ? tc.args : JSON.stringify(tc.args || {}), 160);
    let tail;
    if (tc.ok) {
      tail = "ok";
      if (tc.sheet) tail += " · sheet=" + tc.sheet;
      if (tc.hits != null) tail += " · hits=" + tc.hits;
    } else {
      tail = "error: " + truncateStr(String(tc.error || "unknown"), 120);
    }
    out.push("  🔧 " + tc.name + "(" + argsStr + ") → " + tail +
             " · " + (tc.ms != null ? tc.ms + " ms" : "?"));
  }
  return out.join("\n");
}
function truncateStr(s, max) {
  s = String(s || "");
  return s.length > max ? s.slice(0, max) + "…" : s;
}

// ── Chat ─────────────────────────────────────────────────────────────────────
function mdToHtml(text) {
  // Minimal markdown: bold, bullets, line breaks. No XSS risk — no user HTML.
  const esc = s => s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  const inlineFormat = s =>
    esc(s)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      // Bold __text__ (markdown alt syntax)
      .replace(/__(.+?)__/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      // Italic _text_ — only when surrounded by word boundaries so we
      // don't mangle identifiers like NSP_PER_ActCurrMo. Matches when
      // the underscore is preceded/followed by space, punctuation, or
      // start/end of string.
      .replace(/(^|[\s(\[\{>])_([^_\n]+?)_(?=[\s.,;:!?)\]\}<]|$)/g, "$1<em>$2</em>")
      .replace(/`([^`]+)`/g, "<code>$1</code>");

  const lines = text.split("\n");
  let html = "";
  let inList = false;
  let inCode = false;
  let codeBuf = [];
  for (const raw of lines) {
    const line = raw.trimEnd();
    // Triple-backtick fence: toggle code-block mode. The fence line is
    // never rendered; content between fences is HTML-escaped and wrapped
    // in <pre><code>. Used for dynamic-calc formulas and script bodies.
    if (/^```/.test(line)) {
      if (!inCode) {
        if (inList) { html += "</ul>"; inList = false; }
        inCode = true;
        codeBuf = [];
      } else {
        const escBody = esc(codeBuf.join("\n"));
        html += `<pre class="md-code"><code>${escBody}</code></pre>`;
        inCode = false;
        codeBuf = [];
      }
      continue;
    }
    if (inCode) { codeBuf.push(raw); continue; }
    const bullet = line.match(/^[\*\-]\s+(.*)$/);
    if (bullet) {
      if (!inList) { html += "<ul>"; inList = true; }
      html += `<li>${inlineFormat(bullet[1])}</li>`;
    } else {
      if (inList) { html += "</ul>"; inList = false; }
      if (line === "") { html += "<br>"; }
      else { html += `<p>${inlineFormat(line)}</p>`; }
    }
  }
  if (inList) html += "</ul>";
  // Unterminated code block — flush whatever's in the buffer so it
  // doesn't silently disappear.
  if (inCode && codeBuf.length) {
    html += `<pre class="md-code"><code>${esc(codeBuf.join("\n"))}</code></pre>`;
  }
  return html;
}

// Comprehensive help reference shown in chat. Each example is a CHIP_PASTE chip:
// click → fills the input so the user can review/edit before sending.
function buildHelpReply() {
  const sections = [
    ["📊 Build a query (ad-hoc)", [
      "revenue by month FY24 actual",
      "opex by department Q1 budget",
      "revenue by month and scenario FY25",
      "subsidiary detail for revenue this year",
      "headcount by department FY25 plan",
      "run RevenueCrosstabFY24",
    ]],
    ["🔄 Modify the current grid (in-place)", [
      "zoom in on revenue",
      "expand to leaves",
      "back",
      "pivot to department",
      "keep only Marketing",
      "same but for FY25",
      "remove zeros",
      "as % of total",
    ]],
    ["⚖️ Compare scenarios", [
      "actual vs budget revenue this year",
      "fy25 vs fy24 revenue by month",
      "actual vs budget vs forecast revenue FY24",
      "plan vs actual opex by department Q1",
    ]],
    ["📈 Top drivers / variance", [
      "top 10 accounts by revenue Q1",
      "biggest variance drivers actual vs budget",
      "top 5 departments by opex FY25",
    ]],
    ["📝 Forms (open / inspect / filter)", [
      "show me the forms",
      "which forms for opex",
      "show me opex forecast input forms",
      "qué forms de workforce",
      "show me revenue input forms",
      "list review forms for balance sheet",
      "open OpEx by Dept.",
      "open Income Statement",
      "open form Manage Employees",
    ]],
    ["🌐 Environment dashboard", [
      "show environment",
      "show me the environment",
      "tenant health",
      "qué hay en el ambiente",
    ]],
    ["🔁 SmartView transform", [
      "transform this to smartview",
      "convert active sheet to SmartView codes",
      "map this sheet to ad-hoc",
    ]],
    ["📚 Inventory — what exists in this tenant", [
      "show me the variables",
      "show me the rules",
      "show navigation flow",
      "show me recent jobs",
      "show me integrations",
      "show me pipelines",
      "show period mappings",
      "show DM applications",
      "show saved queries",
      "show DM locations",
      "show schedulable job types",
    ]],
    ["🔍 Data Management — deep inspect", [
      "show DM details for job 9601",
      "show details of integration BalSht_Trans",
      "show mapping for BalSht_Trans",
      "show mapping for BalSht_Trans ACCOUNT",
      "show pipeline NigthProcess",
      "show me the DM files",
    ]],
    ["🎨 Format & clean active sheet", [
      "format this as a report",
      "remove zeros",
      "clean blank rows",
    ]],
    ["🧠 Analyze the active sheet", [
      "analyze this",
      "what stands out?",
      "qué tendencias ves?",
      "find anomalies",
    ]],
    ["📐 Dimension export / import", [
      "export Account dimension",
      "export Department dimension from Plan",
      "import this dimension (after editing)",
    ]],
    ["💡 How-to (answered from KB)", [
      "how do I change a substitution variable?",
      "how do I import data into NSPB?",
      "what is Smart View?",
      "qué es un cube?",
      "cómo se configura un workflow?",
    ]],
    ["🗄️ Admin & backups", [
      "show snapshots",
      "show files",
      "create snapshot pre-rajiv-demo-2026-05-18",
      "create snapshot backup-before-version-cleanup",
    ]],
    ["🧠 Explain — AI tutor on your tenant", [
      "explain rule",
      "explain rule NFS_AGG - IncStmt - Forecast",
      "explain rule CalcComp — walk me through the script",
      "explain form Income Statement.",
      "explain form NFS_OpEx Detail",
      "explain variable",
      "explain variable NSP_PER_FcstCurrMo",
      "explain account SalesPrice",
      "explain account PostTariff",
    ]],
  ];

  let out = "**NSPB MCP Assistant — quick reference**\n\n";
  out += "Click any chip to paste the example into the chat box, then press Send (or edit it first).\n";
  for (const [title, examples] of sections) {
    out += `\n**${title}**\n`;
    for (const ex of examples) out += `CHIP_PASTE: ${ex}\n`;
  }
  out += "\n---\n";
  out += "**Tips**\n";
  out += "- Period always goes in columns; everything else can be a row dim.\n";
  out += "- Detect everything in Settings ⚙ before first use (~30–60s).\n";
  out += "- Form chips that appear after opening a form let you run any attached business rule with one click.\n";
  out += "- After `show navigation flow`, every form found in the menu becomes a clickable Open chip.\n";
  return out;
}

// Generic job-status poller. Wraps a chat bubble in a 'running' state,
// polls /api/job-status every `intervalMs` for up to `timeoutMs`, and
// rewrites the bubble each tick with elapsed time + current status.
// On COMPLETE / FAILED the .running class is dropped and a final
// message is rendered. Used by rule submit AND snapshot create —
// anything that returns a jobId.
//
// opts = { bubble, jobId, label, intervalMs?, timeoutMs?, onDone? }
async function pollJobStatus(opts) {
  const bubble = opts.bubble;
  const jobId  = opts.jobId;
  const label  = opts.label || "Job";
  const interval = opts.intervalMs || 5000;
  const timeout  = opts.timeoutMs || 30 * 60 * 1000;
  const t0 = Date.now();
  bubble.classList.add("running");
  const settings = window.NSPB_SETTINGS || {};
  const renderProgress = (statusText, pct) => {
    const elapsed = Math.round((Date.now() - t0) / 1000);
    const min = Math.floor(elapsed / 60), sec = elapsed % 60;
    const elapsedStr = min ? `${min}m ${sec}s` : `${sec}s`;
    const pctStr = pct != null ? ` · ${pct}%` : "";
    bubble.innerHTML = "";
    renderBubble(bubble,
      `⏳ **${label}** — running ${elapsedStr}${pctStr}\n\n_Job \`${jobId}\` is in flight. Polling every ${interval / 1000}s._\n\n${statusText || ""}`
    );
    bubble.classList.add("running");
  };
  renderProgress("Status: PENDING", null);
  while (Date.now() - t0 < timeout) {
    await new Promise(r => setTimeout(r, interval));
    let resp;
    try {
      resp = await fetch(API + "/api/job-status", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          host: settings.host, username: settings.username, password: settings.password,
          appName: settings.appName, jobId
        })
      }).then(r => r.json());
    } catch (e) {
      renderProgress("⚠ Poll error: " + (e.message || e), null);
      continue;
    }
    if (!resp.ok) {
      // 404 = job not found yet (Oracle sometimes lags ~10s). Keep polling.
      renderProgress(`Status: not yet visible to the API (${resp.error || "404"})`, null);
      continue;
    }
    const status = String(resp.status || "").toUpperCase();
    const pct = resp.percentComplete;
    if (/COMPLETE|SUCCESS|SUCCEEDED|FINISH/.test(status) && !/FAIL/.test(status)) {
      bubble.classList.remove("running");
      bubble.innerHTML = "";
      const elapsed = Math.round((Date.now() - t0) / 1000);
      renderBubble(bubble,
        `✅ **${label}** completed in ${Math.floor(elapsed/60)}m ${elapsed%60}s · job \`${jobId}\`\n\nFinal status: \`${status}\``
      );
      if (opts.onDone) opts.onDone({ ok: true, status, jobId, elapsed });
      return { ok: true, status, jobId };
    }
    if (/ERROR|FAIL|ABORT/.test(status)) {
      bubble.classList.remove("running");
      bubble.innerHTML = "";
      renderBubble(bubble,
        `❌ **${label}** failed · job \`${jobId}\`\n\nStatus: \`${status}\`${resp.errorMessage ? `\n\n${resp.errorMessage}` : ""}`
      );
      if (opts.onDone) opts.onDone({ ok: false, status, jobId, error: resp.errorMessage });
      return { ok: false, status, jobId };
    }
    renderProgress(`Status: \`${status || "?"}\``, pct);
  }
  bubble.classList.remove("running");
  renderBubble(bubble,
    `⏱️ **${label}** — polling timed out after ${Math.round(timeout/60000)} min. Job \`${jobId}\` may still be running; check Status tab → ↻ Refresh.`
  );
  return { ok: false, status: "TIMEOUT", jobId };
}

function renderBubble(bubble, text) {
  // Fallback: convert any <chip>label → command</chip> or <chip>command</chip>
  // tags emitted by the AI into the canonical "CHIP: ..." line format BEFORE
  // line-by-line parsing. Keeps explain-mode replies rendering correctly even
  // if the model regresses to HTML-tag syntax.
  let normalized = String(text).replace(/<chip>\s*([\s\S]*?)\s*<\/chip>/gi, (_, inner) => {
    const cleaned = inner.replace(/\s+/g, " ").trim();
    return "\nCHIP: " + cleaned;
  });
  const lines = normalized.split("\n");
  const chipLines = [];
  const textLines = [];
  for (const line of lines) {
    // CHIP_PASTE: same syntax as CHIP, but click only fills the input (no auto-send).
    // Used for example/help chips so users can review or edit before running.
    const mp = line.match(/^\s*(?:[\*\-]\s+)?CHIP_PASTE:\s*(.+?)(?:\s*→\s*(.+))?$/i);
    if (mp) { chipLines.push({ label: mp[1].trim(), cmd: (mp[2] || mp[1]).trim(), paste: true }); continue; }
    const m = line.match(/^\s*(?:[\*\-]\s+)?CHIP:\s*(.+?)(?:\s*→\s*(.+))?$/i);
    if (m) chipLines.push({ label: m[1].trim(), cmd: (m[2] || m[1]).trim(), paste: false });
    else textLines.push(line);
  }
  bubble.innerHTML = mdToHtml(textLines.join("\n").trim());
  if (chipLines.length) {
    const chipRow = document.createElement("div");
    chipRow.className = "chip-row";
    for (const { label, cmd, paste } of chipLines) {
      const btn = document.createElement("button");
      btn.className = "chip-btn" + (paste ? " chip-paste" : "");
      btn.textContent = label;
      // Both CHIP and CHIP_PASTE now auto-send (paste + Enter) for speed.
      // The user can still cancel by clicking elsewhere before the request fires.
      btn.title = "Click to paste & send";
      btn.addEventListener("click", () => {
        // Special-case sentinels that perform a UI action instead of
        // sending a chat command. Lets the AI emit chips that switch
        // tabs / open sub-tabs without going through onSend().
        if (cmd === "__open_status_jobs__" || cmd === "__open_status_snapshots__") {
          const targetSub = cmd === "__open_status_snapshots__" ? "snapshots" : "jobs";
          const statusTabBtn = document.querySelector('.tab[data-tab="status"]');
          if (statusTabBtn) statusTabBtn.click();
          window.NSPB_STATUS_SUBTAB = targetSub;
          // Wait a tick so the tab renders, then trigger a refresh of
          // the targeted section so it shows the freshest data.
          setTimeout(() => {
            const refreshBtn = document.querySelector(`.status-section-refresh[data-source="${targetSub === "snapshots" ? "snapshots" : "jobs"}"]`);
            if (refreshBtn) refreshBtn.click();
          }, 250);
          return;
        }
        els.input.value = cmd; onSend();
      });
      chipRow.appendChild(btn);
    }
    bubble.appendChild(chipRow);
  }
}

// Persist chat messages (last CHAT_HIST_DAYS days, max CHAT_HIST_MAX entries).
// Skipped for "typing"/"system" transient bubbles. Stored in localStorage so
// it survives Excel close/reopen.
function persistChatMessage(role, text) {
  if (role === "system") return;  // don't persist transient banners (focus retry, etc)
  if (text === "…") return;       // don't persist empty typing-state placeholders
  try {
    const cutoff = Date.now() - CHAT_HIST_DAYS * 24 * 60 * 60 * 1000;
    let log = [];
    try { log = JSON.parse(localStorage.getItem(CHAT_HIST_KEY) || "[]"); } catch (_) {}
    log = log.filter(e => (e.ts || 0) >= cutoff);
    log.push({ role, text, ts: Date.now() });
    if (log.length > CHAT_HIST_MAX) log = log.slice(-CHAT_HIST_MAX);
    localStorage.setItem(CHAT_HIST_KEY, JSON.stringify(log));
  } catch (_) {}
}

// ── Image paste support — multimodal NSPB questions ──────────────────
// Pasting a screenshot (Ctrl+V) into the chat input attaches it to the
// next message. Gemini and Claude both support multimodal input.
const _pendingImages = [];   // [{ mimeType, base64, dataUrl }]

function setupImagePaste() {
  const inp = els.input;
  const tray = document.getElementById("pending-images");
  if (!inp || !tray) return;

  const renderTray = () => {
    tray.innerHTML = "";
    if (!_pendingImages.length) { tray.classList.add("hidden"); return; }
    tray.classList.remove("hidden");
    _pendingImages.forEach((img, idx) => {
      const chip = document.createElement("div");
      chip.className = "img-chip";
      chip.innerHTML = `
        <img src="${img.dataUrl}" alt="Pasted image ${idx + 1}" />
        <button class="img-remove" type="button" title="Remove">×</button>
      `;
      chip.querySelector(".img-remove").addEventListener("click", () => {
        _pendingImages.splice(idx, 1);
        renderTray();
      });
      tray.appendChild(chip);
    });
  };

  inp.addEventListener("paste", (e) => {
    const items = (e.clipboardData || window.clipboardData)?.items;
    if (!items) return;
    let attached = 0;
    for (const item of items) {
      if (item.kind !== "file") continue;
      const blob = item.getAsFile();
      if (!blob || !blob.type.startsWith("image/")) continue;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = String(ev.target.result || "");
        const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (!m) return;
        _pendingImages.push({ mimeType: m[1], base64: m[2], dataUrl });
        renderTray();
      };
      reader.readAsDataURL(blob);
      attached++;
    }
    if (attached > 0) e.preventDefault();   // don't paste raw image data into the textarea
  });
}

function consumePendingImages() {
  const out = _pendingImages.slice();
  _pendingImages.length = 0;
  const tray = document.getElementById("pending-images");
  if (tray) { tray.innerHTML = ""; tray.classList.add("hidden"); }
  return out;
}

// ── Rotating "Did you know?" tip carousel (Copilot-style) ─────────────
// Shows a short NSPB tip above the chat input. Rotates every ~10 seconds.
// Click "Try it →" fills the input; click "✕" hides for the session.
// Mix of: (a) Top 15 most frequent NSPB questions real users ask,
// (b) add-in pro tips / shortcuts, (c) NSPB facts. Click "Try it →"
// sends the cmd to the chat. Each tip has its own emoji + prefix so the
// rotation feels varied (not "Did you know?" repeated forever).
const NSPB_TIPS = [
  // ── (a) Top 15 NSPB FAQ ─────────────────────────────────────────────
  { prefix: "📅 FAQ:",         text: "When should I update CurrentMonth?",                               cmd: "When should I update CurrentMonth?" },
  { prefix: "🔄 FAQ:",         text: "How do I copy data between scenarios?",                            cmd: "How do I copy data between scenarios in NSPB?" },
  { prefix: "▶️ FAQ:",          text: "How do I run a business rule in NSPB?",                            cmd: "How do I run a business rule in NSPB?" },
  { prefix: "📋 FAQ:",         text: "What's the difference between input and review forms?",            cmd: "What is the difference between input and review forms?" },
  { prefix: "📅 FAQ:",         text: "How do I do month-end close in NSPB?",                              cmd: "How do I do month-end close in NSPB?" },
  { prefix: "🆕 FAQ:",          text: "How do I add a new GL account to NSPB?",                          cmd: "How do I add a new GL account to NSPB?" },
  { prefix: "🛠️ FAQ:",          text: "How do I diagnose a failed nightly integration?",                  cmd: "How do I diagnose a failed nightly integration?" },
  { prefix: "🌳 FAQ:",          text: "What is an alternate hierarchy and when do I use one?",            cmd: "What is an alternate hierarchy in NSPB?" },
  { prefix: "🧮 FAQ:",          text: "What is a substitution variable?",                                 cmd: "What is a substitution variable in NSPB?" },
  { prefix: "👥 FAQ:",          text: "How does the Workforce Push rule work?",                            cmd: "How does the workforce push work in NSPB?" },
  { prefix: "🔐 FAQ:",          text: "How do I add new users and assign roles?",                          cmd: "How do I add new users and assign roles in NSPB?" },
  { prefix: "🚀 FAQ:",          text: "What is a Smart Push?",                                             cmd: "What is a smart push in NSPB?" },
  { prefix: "📥 FAQ:",          text: "How do I import data from NetSuite into NSPB?",                    cmd: "How do I import data from NetSuite into NSPB?" },
  { prefix: "🚦 FAQ:",          text: "What is a valid intersection and how do I configure it?",          cmd: "What is a valid intersection in NSPB?" },
  // ── (b) Add-in pro tips & shortcuts ─────────────────────────────────
  // CMDs are question-form on purpose — Try it triggers EXPLAIN MODE (no
  // tool calls, just prose + example chips). Imperative cmds like "update
  // variables" or "/openform" would hit client-side intercepts and EXECUTE,
  // bypassing forceExplain. The user wants tips to TEACH, never act.
  { prefix: "🪄 Try this:",     text: "update all stale substitution variables from a live picker.",                cmd: "How do I update substitution variables and what is the syntax?" },
  { prefix: "⚡ Quick win:",    text: "open a form and write its data slice to Excel in one shot.",                   cmd: "How do I open a form in this add-in and what does the chat do with it?" },
  { prefix: "▶️ Pro tip:",       text: "run a business rule directly from chat — RTPs auto-prompted.",                cmd: "How do I run a business rule from chat and how are RTPs handled?" },
  { prefix: "🧮 Quick win:",    text: "set a substitution variable in 1 second — no EPM Automate.",                   cmd: "How do I set a substitution variable from this chat? Show examples." },
  { prefix: "📁 Try this:",     text: "list files in the NSPB inbox/outbox without leaving Excel.",                   cmd: "How do I list files in the NSPB inbox/outbox from this add-in?" },
  { prefix: "⌨️ Shortcut:",      text: "type / to open the slash menu — every command at your fingertips.",          cmd: "What does the slash menu do in this add-in and what categories exist?" },
  { prefix: "📋 Heads up:",     text: "forms in your nav flow appear grouped by module in /openform.",                cmd: "How does this add-in group forms by module when I pick one to open?" },
  { prefix: "📊 Heads up:",     text: "the Status tab shows your last 10 Planning + DM jobs at a glance." },
  // ── (c) NSPB facts (no command, just info) ──────────────────────────
  { prefix: "⚙️ NSPB fact:",    text: "Stored vs Dynamic Calc has real performance impact on big cubes." },
  { prefix: "🌳 NSPB fact:",    text: "A member can be shared in multiple hierarchies, but only one stores data." },
  { prefix: "📅 NSPB fact:",    text: "Mid-January, &CurrentMonth should still be FY25 TP12 if Jan isn't closed yet." },
];

let _tipRotatorInterval = null;
let _tipDismissed = false;
let _tipIdx = -1;

function startTipRotator() {
  const root = document.getElementById("tip-rotator");
  if (!root) return;
  // DISABLED 2026-07-03 — user feedback: the rotating tips don't help and
  // add noise above the input. Rotator code kept dormant; delete this block
  // to re-enable.
  root.classList.add("hidden");
  if (_tipRotatorInterval) clearInterval(_tipRotatorInterval);
  return;
  if (sessionStorage.getItem("nspb-tips-dismissed") === "1") return;
  const txtEl = root.querySelector(".tip-text");
  const tryBtn = root.querySelector(".tip-try");
  const dismissBtn = root.querySelector(".tip-dismiss");
  const prevBtn = root.querySelector(".tip-prev");
  const nextBtn = root.querySelector(".tip-next");
  if (!txtEl || !tryBtn || !dismissBtn) return;
  // CRITICAL: this function gets called by the watchdog every 2s. We MUST
  // attach click handlers only ONCE per DOM element — otherwise one click
  // on "Try it" fires N sends. But we still need to RE-RENDER the tip
  // every call (in case the DOM was reset). So:
  //   - Listener attachment is guarded by `dataset.bound`
  //   - Tip rendering + interval setup runs every call (idempotent)
  const alreadyBound = root.dataset.bound === "1";

  const iconEl = root.querySelector(".tip-icon");
  // Pick a random tip avoiding the immediately-previous one so the user
  // doesn't see the same tip twice in a row.
  const pickRandomIdx = () => {
    if (NSPB_TIPS.length <= 1) return 0;
    let next;
    do { next = Math.floor(Math.random() * NSPB_TIPS.length); }
    while (next === _tipIdx);
    return next;
  };
  const renderTip = (idx) => {
    if (_tipDismissed) return;
    _tipIdx = idx;
    const tip = NSPB_TIPS[_tipIdx];
    if (iconEl) iconEl.textContent = "";
    txtEl.innerHTML = `<strong>${escapeHtmlSimple(tip.prefix || "")}</strong> ${escapeHtmlSimple(tip.text)}`;
    tryBtn.style.display = tip.cmd ? "inline-block" : "none";
    tryBtn.dataset.cmd = tip.cmd || "";
    root.classList.remove("hidden");
  };
  const renderNext = () => renderTip(pickRandomIdx());
  function escapeHtmlSimple(s) {
    return String(s||"").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  }

  // Manual navigation — clicking arrows resets the rotation timer so the
  // user has time to read after pressing prev/next.
  const restartTimer = () => {
    if (_tipRotatorInterval) clearInterval(_tipRotatorInterval);
    _tipRotatorInterval = setInterval(renderNext, 10000);
  };

  // Attach all event listeners ONLY ONCE per DOM element. The watchdog calls
  // startTipRotator every 2s; without this guard, every click would multiply.
  if (!alreadyBound) {
    root.dataset.bound = "1";
    tryBtn.addEventListener("click", () => {
      const cmd = tryBtn.dataset.cmd || "";
      if (!cmd) return;
      if (els.input) {
        els.input.value = cmd;
        els.input.focus();
        // EXPLAIN MODE — flag set BEFORE auto-send so onSend's /api/chat
        // fetch includes forceExplain=true. Worker disables tools and
        // returns a teaching answer + action chips, never an execution.
        window._nspbForceExplain = true;
        try { onSend(); } catch (e) { console.error("try-it auto-send failed:", e); }
      }
    });

    dismissBtn.addEventListener("click", () => {
      _tipDismissed = true;
      sessionStorage.setItem("nspb-tips-dismissed", "1");
      root.classList.add("hidden");
      if (_tipRotatorInterval) clearInterval(_tipRotatorInterval);
    });

    // Both arrows pick a RANDOM tip (not the same one twice in a row).
    if (prevBtn) prevBtn.addEventListener("click", () => { renderTip(pickRandomIdx()); restartTimer(); });
    if (nextBtn) nextBtn.addEventListener("click", () => { renderTip(pickRandomIdx()); restartTimer(); });

    // Pause rotation while the user is typing in the input.
    let typingTimer = null;
    const onType = () => {
      if (_tipRotatorInterval) clearInterval(_tipRotatorInterval);
      if (typingTimer) clearTimeout(typingTimer);
      typingTimer = setTimeout(() => {
        if (!_tipDismissed) _tipRotatorInterval = setInterval(renderNext, 10000);
      }, 3000);
    };
    if (els.input) els.input.addEventListener("input", onType);
  }

  // Initial tip + start rotation. Clear any prior interval so subsequent
  // calls (from the watchdog) don't stack multiple rotation timers.
  if (_tipRotatorInterval) clearInterval(_tipRotatorInterval);
  renderNext();
  _tipRotatorInterval = setInterval(renderNext, 10000);
}

// User-defined analyze template helpers removed 2026-05-21 — the Save /
// Manage UI was removed; only the built-in controller templates ship.
// If you want to re-add the feature, restore from commit 7b3aa25 which
// has the full CRUD + palette injection + import/export pattern.

function loadPersistedChat() {
  try {
    const cutoff = Date.now() - CHAT_HIST_DAYS * 24 * 60 * 60 * 1000;
    const log = JSON.parse(localStorage.getItem(CHAT_HIST_KEY) || "[]");
    return log.filter(e => (e.ts || 0) >= cutoff);
  } catch (_) {
    return [];
  }
}

function clearChatHistory() {
  try { localStorage.removeItem(CHAT_HIST_KEY); } catch (_) {}
  try {
    history.length = 0;
    if (els.messages) els.messages.innerHTML = "";
    // skipPersist — otherwise this confirmation becomes the only entry in
    // the persisted log and every pane reopen restores "Chat cleared…",
    // which reads as if the add-in wiped the chat on open.
    addMsg("assistant", "Chat cleared. How can I help?", { skipPersist: true });
  } catch (_) {}
}

function addMsg(role, text, opts) {
  const skipPersist = opts && opts.skipPersist;
  const wrap = document.createElement("div");
  wrap.className = "msg " + role;
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  if (role === "assistant" || role === "system") {
    renderBubble(bubble, text);
  } else {
    bubble.textContent = text;
  }
  wrap.appendChild(bubble);
  els.messages.appendChild(wrap);
  els.messages.scrollTop = els.messages.scrollHeight;
  if (!skipPersist) persistChatMessage(role, text);
  return bubble;
}

// Office.js fails the request when the task pane's host workbook is open but
// not the active window (user has another workbook in front). Detect by code
// or message — both shapes show up depending on the API surface that errored.
// Retry an Excel-writing function up to `tries` times if it hits a
// lost-focus error (which happens when the user clicks another window
// mid-write). Brief delay between retries lets Office.js re-acquire focus.
async function withFocusRetry(fn, label, tries = 6) {
  // Wait pattern: 500ms, 1s, 2s, 3s, 5s, 8s — total ~20s. Gives the user time
  // to click back to the workbook with the NSPB pane after wandering off.
  const delays = [500, 1000, 2000, 3000, 5000, 8000];
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (!isLostFocusError(e)) throw e;
      logDebug({ cmd: "lost_focus_retry", label, attempt: i + 1, error: e.message || String(e) });
      // Surface a banner in the chat telling the user what to do.
      try {
        const m = (e.message || "").toLowerCase();
        let banner;
        if (m.includes("cell-editing") || m.includes("exit the edit mode")) {
          banner = `⚠ Excel is in **cell-editing mode**. Press **Enter** or **Escape** in Excel to exit the edit mode. Retrying in ${(delays[i]/1000).toFixed(1)}s…`;
        } else {
          banner = `⚠ Lost focus on the workbook (you may have switched to another Excel window). **Click back on the Excel window that has this task pane.** Retrying in ${(delays[i]/1000).toFixed(1)}s…`;
        }
        addMsg("system", banner);
      } catch (_) {}
      await new Promise(r => setTimeout(r, delays[i] || 1000));
    }
  }
  throw lastErr;
}

function isLostFocusError(e) {
  if (!e) return false;
  const code = (e.code || "").toString();
  const msg = (e.message || String(e) || "").toLowerCase();
  if (code === "InvalidRequestContext") return true;
  return msg.includes("multiple workbooks")
      || msg.includes("lost focus")
      || msg.includes("cell-editing mode")
      || msg.includes("cell editing mode")
      || msg.includes("exit the edit mode");
}

// Renders a chat row with a retry button. `label` describes the pending action,
// `retryFn` re-runs it. On success the row is removed; on another focus error
// the row stays so the user can retry again.
function addRetryBanner(label, retryFn) {
  const wrap = document.createElement("div");
  wrap.className = "msg system";
  const bubble = document.createElement("div");
  bubble.className = "bubble retry-banner";

  const text = document.createElement("div");
  text.textContent = "Activate this workbook in Excel, then click Retry. " + label;
  bubble.appendChild(text);

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "retry-btn";
  btn.textContent = "Retry";
  btn.onclick = async () => {
    btn.disabled = true;
    btn.textContent = "Retrying…";
    try {
      await retryFn();
      wrap.remove();
    } catch (e) {
      if (isLostFocusError(e)) {
        btn.disabled = false;
        btn.textContent = "Retry";
      } else {
        wrap.remove();
        addMsg("error", "Retry failed: " + (e.message || e));
      }
    }
  };
  bubble.appendChild(btn);

  wrap.appendChild(bubble);
  els.messages.appendChild(wrap);
  els.messages.scrollTop = els.messages.scrollHeight;
  return wrap;
}

// ── Environment tab ──────────────────────────────────────────────────────────
function sendFromEnv(text) {
  // Switch to chat tab first, then send
  document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
  document.querySelector(".tab[data-tab='chat']").classList.add("active");
  document.getElementById("tab-env").classList.add("hidden");
  document.getElementById("tab-chat").classList.remove("hidden");
  const th = document.getElementById("tab-help"); if (th) th.classList.add("hidden");
  const tav = document.getElementById("tab-advanced"); if (tav) tav.classList.add("hidden");
  const trep = document.getElementById("tab-report"); if (trep) trep.classList.add("hidden");
  els.input.value = text;
  onSend();
}
// ── Status tab — minimal operations dashboard ─────────────────────────
// Shows ONLY: substitution variables (with stale flags), last 10 Planning
// jobs, last 10 Data Management jobs. Nothing else — for users who want a
// glance at what's going on in the tenant without clicking through forms.
async function renderStatusTab() {
  const body = document.getElementById("status-body");
  if (!body) return;
  const esc = s => String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  body.innerHTML = `<p style="color:#777;font-size:12px;">Loading…</p>`;

  const [varsWrap, jobsWrap, schedWrap, snapsWrap, runWrap] = await Promise.all([
    loadJson(VARS_KEY),
    loadJson(JOBS_KEY),
    loadJson("nspb-addin.schedules.v1"),
    loadJson("nspb-addin.snapshots.v1"),
    loadJson("nspb-addin.runningJobs.v1")
  ]);
  const variables = (varsWrap && varsWrap.variables) || [];
  const allJobs   = (jobsWrap && jobsWrap.jobs)      || [];
  const planJobs  = allJobs.filter(j => j.source === "planning").slice(0, 10);
  const dmJobs    = allJobs.filter(j => j.source === "dm").slice(0, 10);
  const schedules = (schedWrap && schedWrap.schedules) || [];
  const snapshots = (snapsWrap && snapsWrap.snapshots) || [];
  const runningJobs = (runWrap && runWrap.jobs) || [];
  // If discovery returned empty AND surfaced an error, capture it so the
  // empty-state can explain WHY instead of just 'No Planning jobs found'.
  const jobsErr = jobsWrap && jobsWrap.error;
  const jobsPartialErrs = jobsWrap && jobsWrap.partialErrors;

  // Compute "last refreshed" — show oldest of the two so the user knows
  // the freshness of the most-stale piece.
  const lastVarsLoad = (varsWrap && varsWrap.loadedAt) || 0;
  const lastJobsLoad = (jobsWrap && jobsWrap.loadedAt) || 0;
  const oldest = (lastVarsLoad && lastJobsLoad)
    ? Math.min(lastVarsLoad, lastJobsLoad)
    : (lastVarsLoad || lastJobsLoad || 0);
  const ageStr = oldest ? (() => {
    const mins = Math.round((Date.now() - oldest) / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return mins + " min ago";
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return hrs + " hr ago";
    return Math.round(hrs / 24) + " days ago";
  })() : "never";

  let html = "";

  // ── Sub-tab navigation (real tabs, side-by-side, matches main tab bar) ──
  // One section visible at a time. Default = 'jobs' (most-asked-for view).
  const activeSub = window.NSPB_STATUS_SUBTAB || "jobs";
  const pills = [
    { id: "variables", label: `Variables (${variables.length})` },
    { id: "jobs", label: `Jobs (${planJobs.length})` },
    { id: "dm", label: `DM (${dmJobs.length})` },
    { id: "scheduled", label: `Night runs (${schedules.length})` },
    { id: "snapshots", label: `Snapshots (${snapshots.length})` },
  ];
  html += `<div class="status-subtab-bar">`;
  for (const p of pills) {
    const cls = "status-subtab" + (p.id === activeSub ? " active" : "");
    html += `<button class="${cls}" data-sub="${p.id}">${esc(p.label)}</button>`;
  }
  html += `</div>`;
  html += `<div style="font-size:11px;color:#6b7280;margin:8px 0;">Last refreshed: <strong style="color:#374151;">${esc(ageStr)}</strong></div>`;

  // ── Variables block ──
  html += `<div class="status-section" data-section="variables" style="margin-bottom:14px;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
      <h4 style="margin:0;font-size:13px;">⚡ Substitution Variables (${variables.length})</h4>
      <div style="display:flex;gap:4px;">
        <button class="status-section-refresh" data-source="variables" style="font-size:10px;padding:3px 8px;border:1px solid #d4d4d4;border-radius:3px;background:#fff;cursor:pointer;">↻</button>
        <button class="env-form-btn" style="font-size:10px;" onclick="window.NSPB_runChat && window.NSPB_runChat('show me the variables')">Analyze →</button>
      </div>
    </div>`;
  if (!variables.length) {
    html += `<p style="color:#999;font-size:11px;margin:0;">No variables loaded yet. Open Settings → click "Detect everything" first.</p>`;
  } else {
    // Show only the rolling ones (PER/YR/SCEN/CURR/FCST/PRIOR/ACT) — those
    // are the ones consultants actually update at month/year-end. Others
    // (account-code mappings, structural) clutter the view.
    const isRolling = v => /PER|YR|YEAR|CURR|FCST|PRIOR|ACT|SCEN/i.test(v.name);
    const display = variables.filter(isRolling).slice(0, 30);
    html += `<div style="background:#fafafa;border:1px solid #e5e7eb;border-radius:4px;padding:6px 8px;font-size:11px;max-height:240px;overflow-y:auto;">`;
    for (const v of display) {
      html += `<div style="display:grid;grid-template-columns:1fr auto;gap:8px;padding:2px 0;border-bottom:1px solid #f3f4f6;">
        <code style="color:#374151;">${esc(v.name)}</code>
        <strong style="color:#111;">${esc(v.value)}</strong>
      </div>`;
    }
    if (variables.length > display.length) {
      html += `<div style="color:#9ca3af;font-size:10px;padding-top:4px;">+ ${variables.length - display.length} other variables (account codes, structural — hidden)</div>`;
    }
    html += `</div>`;
  }
  html += `</div>`;

  // Helper: render a job row with a status pill, the job name (with type
  // badge if present), and a humanized timestamp (e.g. "2h ago").
  const STATUS_STYLES = {
    success: { bg: "#dcfce7", fg: "#15803d", border: "#86efac" },
    error:   { bg: "#fee2e2", fg: "#b91c1c", border: "#fca5a5" },
    running: { bg: "#fef3c7", fg: "#b45309", border: "#fcd34d" },
    other:   { bg: "#f3f4f6", fg: "#374151", border: "#d1d5db" }
  };
  const styleForStatus = (status) => {
    const s = String(status || "").toUpperCase();
    if (/ERROR|FAIL/.test(s)) return STATUS_STYLES.error;
    if (/PROCESS|PENDING|RUNNING/.test(s)) return STATUS_STYLES.running;
    if (/COMPLETE|SUCCESS|OK|FINISH/.test(s)) return STATUS_STYLES.success;
    return STATUS_STYLES.other;
  };
  const humanizeTime = (iso) => {
    if (!iso) return "—";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso).slice(0, 16);
    const diffMs = Date.now() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "just now";
    if (diffMin < 60) return diffMin + "m ago";
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return diffHr + "h ago";
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay < 30) return diffDay + "d ago";
    return d.toISOString().slice(0, 10);
  };
  const renderJobRow = (j) => {
    const status = String(j.status || "").toUpperCase();
    const sty = styleForStatus(status);
    const when = humanizeTime(j.startTime);
    const fullDate = j.startTime ? esc(j.startTime.replace("T", " ").slice(0, 16)) : "";
    const name = esc(j.name || j.jobName || j.processId || "—");
    const jobType = j.jobTypeLabel || j.jobType || j.processType || "";
    // Compact single-line table row: status | name | type | time
    return `<div style="display:grid;grid-template-columns:78px 1fr 90px 60px;gap:6px;padding:3px 0;border-bottom:1px solid #f3f4f6;align-items:center;line-height:1.3;">
      <span style="background:${sty.bg};color:${sty.fg};border:1px solid ${sty.border};border-radius:8px;padding:0 6px;font-size:9px;font-weight:700;letter-spacing:0.02em;white-space:nowrap;text-align:center;">${esc(status || "?")}</span>
      <span title="${esc(name)}" style="color:#111;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${name}</span>
      <span title="${esc(jobType)}" style="color:#6b7280;font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(jobType)}</span>
      <span title="${fullDate}" style="color:#6b7280;font-size:10px;white-space:nowrap;text-align:right;">${esc(when)}</span>
    </div>`;
  };

  // ── Last 10 Planning jobs ──
  html += `<div class="status-section" data-section="jobs" style="margin-bottom:14px;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
      <h4 style="margin:0;font-size:13px;">📋 Last ${planJobs.length} Jobs</h4>
      <div style="display:flex;gap:4px;">
        <button class="status-section-refresh" data-source="jobs" style="font-size:10px;padding:3px 8px;border:1px solid #d4d4d4;border-radius:3px;background:#fff;cursor:pointer;">↻</button>
        <button class="env-form-btn" style="font-size:10px;" onclick="window.NSPB_runChat && window.NSPB_runChat('show jobs')">All →</button>
      </div>
    </div>`;
  if (!planJobs.length) {
    if (jobsErr) {
      html += `<div style="font-size:10.5px;color:#6b7280;background:#fef3c7;border:1px solid #fbbf24;border-radius:4px;padding:6px 8px;">
        <strong>⚠ Discovery returned no jobs.</strong> Error: <code>${esc(String(jobsErr).slice(0, 200))}</code><br>
        Click ↻ to retry. If it keeps failing, mandame el error.
      </div>`;
    } else if (!jobsWrap) {
      html += `<p style="color:#999;font-size:11px;margin:0;">No jobs cached yet. Click ↻ to fetch from NSPB.</p>`;
    } else {
      html += `<p style="color:#999;font-size:11px;margin:0;">No Planning jobs found in the last ${allJobs.length ? `${allJobs.length} returned` : "discovery run"}.</p>`;
    }
  } else {
    html += `<div style="background:#fff;border:1px solid #e5e7eb;border-radius:6px;padding:4px 10px;font-size:11px;">`;
    for (const j of planJobs) html += renderJobRow(j);
    html += `</div>`;
  }
  html += `</div>`;

  // ── Last 10 DM jobs ──
  html += `<div class="status-section" data-section="dm" style="margin-bottom:14px;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
      <h4 style="margin:0;font-size:13px;">🔁 Last ${dmJobs.length} Data Management Jobs</h4>
      <div style="display:flex;gap:4px;">
        <button class="status-section-refresh" data-source="jobs" style="font-size:10px;padding:3px 8px;border:1px solid #d4d4d4;border-radius:3px;background:#fff;cursor:pointer;">↻</button>
        <button class="env-form-btn" style="font-size:10px;" onclick="window.NSPB_runChat && window.NSPB_runChat('show dm jobs')">All →</button>
      </div>
    </div>`;
  if (!dmJobs.length) {
    if (jobsErr || (jobsPartialErrs && jobsPartialErrs.dm)) {
      const dmErr = (jobsPartialErrs && jobsPartialErrs.dm) || jobsErr;
      html += `<div style="font-size:10.5px;color:#6b7280;background:#fef3c7;border:1px solid #fbbf24;border-radius:4px;padding:6px 8px;">
        <strong>⚠ DM jobs not retrieved.</strong> Error: <code>${esc(String(dmErr).slice(0, 200))}</code>
      </div>`;
    } else if (!jobsWrap) {
      html += `<p style="color:#999;font-size:11px;margin:0;">No jobs cached yet. Click ↻ to fetch.</p>`;
    } else {
      html += `<p style="color:#999;font-size:11px;margin:0;">No Data Management jobs found.</p>`;
    }
  } else {
    html += `<div style="background:#fff;border:1px solid #e5e7eb;border-radius:6px;padding:4px 10px;font-size:11px;">`;
    for (const j of dmJobs) html += renderJobRow(j);
    html += `</div>`;
  }
  html += `</div>`;

  // ── Scheduled jobs section (with run-now buttons) ──
  //    User-facing label = 'Night runs' (most NSPB schedules are nightly).
  // When real data is missing we show 3 example rows tagged DEMO so the
  // user can preview what it will look like once schedules are detected.
  // Each row has a ▶ Run-now button that submits the underlying job.
  const demoSchedules = [
    { name: "NetSuite_to_NSPB_Daily_Load",  jobType: "DM",       cronExpression: "0 0 2 * * ?",   nextFireTime: "06:00 AM daily",        status: "ACTIVE",  demo: true },
    { name: "Cube_Refresh_NetSuite",         jobType: "Planning", cronExpression: "0 30 2 * * ?",  nextFireTime: "06:30 AM daily",        status: "ACTIVE",  demo: true },
    { name: "FX_Rates_Translation_Monthly", jobType: "Planning", cronExpression: "0 0 4 1 * ?",   nextFireTime: "1st of month, 04:00",   status: "PAUSED",  demo: true },
  ];
  const displaySchedules = schedules.length ? schedules : demoSchedules;

  html += `<div class="status-section" data-section="scheduled" style="margin-bottom:14px;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
      <h4 style="margin:0;font-size:13px;">⏰ Night Runs (${schedules.length}${schedules.length ? "" : " — showing examples"})</h4>
    </div>`;
  if (!schedules.length) {
    html += `<div style="font-size:10.5px;color:#6b7280;background:#fef3c7;border:1px solid #fbbf24;border-radius:4px;padding:6px 8px;margin-bottom:6px;">
      <strong>⚠ Demo data — live retrieve not yet implemented.</strong> The Status tab will fetch the tenant's real scheduled jobs once the <code>/api/discover-schedules</code> endpoint is built. Until then, this section shows three example rows so you can see the layout. The ▶ Run button on demo rows is a no-op.
    </div>`;
  }
  html += `<div style="background:#fafafa;border:1px solid #e5e7eb;border-radius:4px;padding:6px 8px;font-size:11px;">`;
  for (const s of displaySchedules) {
    const next = s.nextFireTime || s.nextRun || s.nextScheduledTime || "";
    const cron = s.cronExpression || s.schedule || "";
    const status = String(s.status || "").toUpperCase();
    const isPaused = /PAUSED|DISABLED/i.test(status);
    const statusColor = isPaused ? "#9ca3af" : "#15803d";
    const jobName = s.name || s.jobName || "—";
    const jobType = s.jobType || "Planning";
    const safeName = jobName.replace(/[^A-Za-z0-9_]/g, "_");
    html += `<div style="display:grid;grid-template-columns:7ch 1fr 16ch auto;gap:6px;padding:4px 0;border-bottom:1px solid #f3f4f6;align-items:center;">
      <span style="color:${statusColor};font-weight:700;font-size:10px;">${esc(status || "ACTIVE")}</span>
      <div>
        <div style="color:#111;">${esc(jobName)}${s.demo ? ` <span style="color:#9ca3af;font-size:9px;font-weight:700;background:#fef3c7;padding:1px 4px;border-radius:2px;margin-left:4px;">DEMO</span>` : ""}</div>
        ${cron ? `<div style="color:#6b7280;font-size:10px;font-family:monospace;">${esc(cron)} · ${esc(jobType)}</div>` : `<div style="color:#6b7280;font-size:10px;">${esc(jobType)}</div>`}
      </div>
      <span style="color:#374151;font-size:10px;text-align:right;">${esc((next || "").slice(0, 24).replace("T", " "))}</span>
      <button class="status-run-btn" data-job-name="${esc(jobName)}" data-job-type="${esc(jobType)}" data-demo="${s.demo ? "1" : ""}"
        style="background:#0a0a0a;color:#fff;border:0;border-radius:3px;padding:3px 8px;font-size:10px;font-weight:600;cursor:pointer;white-space:nowrap;"
        title="Run this job now (without waiting for the schedule)">▶ Run</button>
    </div>`;
  }
  html += `</div></div>`;

  // ── Snapshots block — LCM application backups in the outbox ──
  html += `<div class="status-section" data-section="snapshots" style="margin-bottom:14px;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
      <h4 style="margin:0;font-size:13px;">📦 Application Snapshots (${snapshots.length})</h4>
      <div style="display:flex;gap:4px;">
        <button class="status-section-refresh" data-source="snapshots" style="font-size:10px;padding:3px 8px;border:1px solid #d4d4d4;border-radius:3px;background:#fff;cursor:pointer;">↻</button>
        <button id="status-new-snapshot-btn" class="env-form-btn" style="font-size:10px;background:#0a0a0a;color:#fff;border:0;padding:3px 8px;border-radius:3px;cursor:pointer;">+ Create new</button>
        <button id="status-show-snapshots-btn" class="env-form-btn" style="font-size:10px;">Show all →</button>
      </div>
    </div>`;
  if (!snapshots.length) {
    html += `<p style="color:#999;font-size:11px;margin:0;">No snapshots cached yet. Click <strong>↻ Refresh</strong> to fetch the list, or <strong>+ Create new</strong> to make your first backup.</p>`;
  } else {
    html += `<div style="background:#fafafa;border:1px solid #e5e7eb;border-radius:4px;padding:6px 8px;font-size:11px;">`;
    // Show the 5 most recent. Snapshots are pre-sorted by lastModified desc.
    for (const s of snapshots.slice(0, 5)) {
      const when = humanizeTime(s.lastModifiedTime || s.lastModified);
      // Oracle returns the snapshot size under varying field names per
      // tenant/version, and uses -1 when size hasn't been computed yet.
      // Probe every reasonable name and skip non-positive values.
      const size = (() => {
        for (const v of [s.size, s.fileSize, s.byteSize, s.bytes, s.length, s.contentLength]) {
          const n = Number(v);
          if (!isNaN(n) && n > 0) {
            const mb = n / (1024 * 1024);
            if (mb >= 1024) return (mb / 1024).toFixed(1) + " GB";
            if (mb >= 1)    return mb.toFixed(1) + " MB";
            return (n / 1024).toFixed(0) + " KB";
          }
        }
        return "—";
      })();
      html += `<div style="display:grid;grid-template-columns:1fr 70px 60px;gap:6px;padding:3px 0;border-bottom:1px solid #f3f4f6;align-items:center;">
        <span title="${esc(s.name)}" style="color:#111;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:ui-monospace,Consolas,monospace;font-size:10.5px;">${esc(s.name)}</span>
        <span style="color:#6b7280;font-size:10px;text-align:right;">${esc(size)}</span>
        <span style="color:#6b7280;font-size:10px;text-align:right;">${esc(when)}</span>
      </div>`;
    }
    if (snapshots.length > 5) {
      html += `<div style="color:#9ca3af;font-size:10px;padding-top:4px;text-align:center;">+ ${snapshots.length - 5} older snapshots — click <strong>Show all →</strong> to see the full list</div>`;
    }
    html += `</div>`;
  }
  html += `</div>`;

  html += `<p style="color:#9ca3af;font-size:10.5px;margin:0;">↻ Click the Refresh button above to re-fetch live data from NSPB.</p>`;
  body.innerHTML = html;

  // Wire the Snapshots buttons.
  const newSnapBtn = document.getElementById("status-new-snapshot-btn");
  if (newSnapBtn) {
    newSnapBtn.addEventListener("click", () => {
      // Switch to Chat tab + pre-fill the create command without sending,
      // so the user types the snapshot name and presses Enter.
      const chatTabBtn = document.querySelector('.tab[data-tab="chat"]');
      if (chatTabBtn) chatTabBtn.click();
      if (els.input) {
        const stamp = new Date().toISOString().slice(0, 10);
        els.input.value = `create snapshot backup-${stamp}-`;
        els.input.focus();
        // Position cursor at the end so the user can type the suffix.
        els.input.setSelectionRange(els.input.value.length, els.input.value.length);
      }
    });
  }
  const showSnapBtn = document.getElementById("status-show-snapshots-btn");
  if (showSnapBtn) {
    showSnapBtn.addEventListener("click", () => {
      if (window.NSPB_runChat) window.NSPB_runChat("show snapshots");
    });
  }

  // ── Apply sub-tab visibility ──
  // Each pill flips which .status-section is visible. One section at a
  // time — there's no 'show everything' option since the pills cover
  // every section.
  const validIds = new Set(pills.map(p => p.id));
  const applySubtab = (id) => {
    if (!validIds.has(id)) id = "jobs";
    window.NSPB_STATUS_SUBTAB = id;
    for (const sec of body.querySelectorAll(".status-section")) {
      sec.style.display = sec.getAttribute("data-section") === id ? "" : "none";
    }
    // Update tab active state
    for (const t of body.querySelectorAll(".status-subtab")) {
      const isActive = t.getAttribute("data-sub") === id;
      t.classList.toggle("active", isActive);
    }
  };
  applySubtab(activeSub);
  for (const tab of body.querySelectorAll(".status-subtab")) {
    tab.addEventListener("click", () => applySubtab(tab.getAttribute("data-sub")));
  }

  // ── Per-section refresh buttons ──
  // Each ↻ button re-fetches just its own data source and re-renders.
  for (const btn of body.querySelectorAll(".status-section-refresh")) {
    btn.addEventListener("click", async () => {
      const source = btn.getAttribute("data-source");
      const s = window.NSPB_SETTINGS || {};
      if (!s.host || !s.username || !s.password) {
        btn.textContent = "✗";
        setTimeout(() => { btn.textContent = "↻"; }, 1500);
        return;
      }
      btn.disabled = true;
      btn.textContent = "…";
      const endpoints = {
        variables: { url: "/api/discover-variables", key: VARS_KEY, prop: "variables" },
        jobs:      { url: "/api/discover-jobs",      key: JOBS_KEY, prop: "jobs" },
        snapshots: { url: "/api/list-snapshots",     key: "nspb-addin.snapshots.v1", prop: "snapshots" },
      };
      const cfg = endpoints[source];
      if (!cfg) { btn.disabled = false; btn.textContent = "↻"; return; }
      try {
        const r = await fetch(API + cfg.url, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(s)
        }).then(r => r.json());
        const data = r && (Array.isArray(r[cfg.prop]) ? r[cfg.prop]
                         : Array.isArray(r[cfg.srcField]) ? r[cfg.srcField] : null);
        if (Array.isArray(data)) {
          const payload = source === "snapshots"
            ? { loadedAt: Date.now(), snapshots: data.sort((a, b) =>
                (Date.parse(b.lastModifiedTime || b.lastModified || 0) || 0) -
                (Date.parse(a.lastModifiedTime || a.lastModified || 0) || 0)) }
            : source === "running"
              ? { loadedAt: Date.now(), jobs: data }
              : { loadedAt: Date.now(), [cfg.prop]: data };
          await saveJson(cfg.key, payload);
        }
        await renderStatusTab();
      } catch (e) {
        btn.disabled = false;
        btn.textContent = "✗";
        btn.title = e.message || String(e);
        setTimeout(() => { btn.textContent = "↻"; }, 2000);
      }
    });
  }

  // Wire the per-row Run buttons in the Scheduled Jobs section.
  for (const btn of body.querySelectorAll(".status-run-btn")) {
    btn.addEventListener("click", async () => {
      const jobName = btn.getAttribute("data-job-name");
      const jobType = btn.getAttribute("data-job-type");
      const isDemo  = btn.getAttribute("data-demo") === "1";
      if (isDemo) {
        btn.textContent = "Demo — no-op";
        btn.style.background = "#9ca3af";
        setTimeout(() => { btn.textContent = "▶ Run"; btn.style.background = "#0a0a0a"; }, 1800);
        return;
      }
      btn.disabled = true;
      btn.textContent = "Submitting…";
      try {
        const isDM = /DM|integration|datarule/i.test(jobType);
        const url = isDM ? "/api/run-dm-job" : "/api/run-job";
        const payload = isDM
          ? { settings: window.NSPB_SETTINGS, payload: { jobName, jobType: "INTEGRATION_EPMAUTO", parameters: {} } }
          : { settings: window.NSPB_SETTINGS, jobName, jobType: jobType || "RULES", parameters: {} };
        const r = await fetch(API + url, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const d = await r.json();
        if (d.ok) {
          btn.textContent = "✓ Submitted";
          btn.style.background = "#15803d";
        } else {
          btn.textContent = "✗ Failed";
          btn.style.background = "#991b1b";
          btn.title = d.error || "unknown";
        }
      } catch (e) {
        btn.textContent = "✗ Error";
        btn.style.background = "#991b1b";
        btn.title = String(e.message || e);
      }
      setTimeout(() => {
        btn.disabled = false;
        btn.textContent = "▶ Run";
        btn.style.background = "#0a0a0a";
      }, 3000);
    });
  }

  // Wire the refresh button — re-fetch both jobs + vars in parallel, then
  // re-render the tab. Disabled while in flight.
  const refreshBtn = document.getElementById("status-refresh-btn");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", async () => {
      refreshBtn.disabled = true;
      refreshBtn.textContent = "Refreshing…";
      try {
        const s = window.NSPB_SETTINGS || {};
        if (!s.host || !s.username || !s.password) {
          refreshBtn.textContent = "✗ Set credentials";
          refreshBtn.style.background = "#991b1b";
          setTimeout(() => {
            refreshBtn.disabled = false;
            refreshBtn.textContent = "↻ Refresh";
            refreshBtn.style.background = "#0a0a0a";
          }, 2500);
          return;
        }
        // Fetch vars + jobs + snapshots in parallel — each writes to its
        // own localStorage key so subsequent renderStatusTab() picks them up.
        const [varsResp, jobsResp, snapsResp] = await Promise.all([
          fetch(API + "/api/discover-variables", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify(s)
          }).then(r => r.json()).catch(e => ({ error: e.message })),
          fetch(API + "/api/discover-jobs", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify(s)
          }).then(r => r.json()).catch(e => ({ error: e.message })),
          fetch(API + "/api/list-snapshots", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify(s)
          }).then(r => r.json()).catch(e => ({ error: e.message }))
        ]);
        if (varsResp && Array.isArray(varsResp.variables)) {
          await saveJson(VARS_KEY, { loadedAt: Date.now(), variables: varsResp.variables });
        }
        if (jobsResp && Array.isArray(jobsResp.jobs)) {
          await saveJson(JOBS_KEY, { loadedAt: Date.now(), jobs: jobsResp.jobs });
        }
        if (snapsResp && Array.isArray(snapsResp.snapshots)) {
          // Pre-sort by lastModified desc so the panel can just .slice(0, 5).
          const sorted = snapsResp.snapshots.slice().sort((a, b) => {
            const ta = Date.parse(a.lastModifiedTime || a.lastModified || 0) || 0;
            const tb = Date.parse(b.lastModifiedTime || b.lastModified || 0) || 0;
            return tb - ta;
          });
          await saveJson("nspb-addin.snapshots.v1", { loadedAt: Date.now(), snapshots: sorted });
          // Diagnostic: log the raw keys so we can see what Oracle calls
          // the size field. Will appear in browser DevTools console.
          if (snapsResp._sampleKeys && snapsResp._sample) {
            console.log("[NSPB] snapshot raw fields:", snapsResp._sampleKeys);
            console.log("[NSPB] snapshot sample:", snapsResp._sample);
          }
        }
        await renderStatusTab();
      } catch (e) {
        refreshBtn.textContent = "✗ " + (e.message || e).slice(0, 30);
        refreshBtn.style.background = "#991b1b";
        setTimeout(() => {
          refreshBtn.disabled = false;
          refreshBtn.textContent = "↻ Refresh";
          refreshBtn.style.background = "#0a0a0a";
        }, 3000);
      }
    });
  }
}

// Helper used by Status tab buttons — programmatically run a chat command.
window.NSPB_runChat = (cmd) => {
  const input = document.getElementById("input");
  if (!input) return;
  // Switch to chat tab + paste command + send
  const chatTab = document.querySelector('.tab[data-tab="chat"]');
  if (chatTab) chatTab.click();
  input.value = cmd;
  // Trigger send (button click)
  const sendBtn = document.getElementById("send");
  if (sendBtn) sendBtn.click();
};

async function renderEnvironmentTab() {
  const body = document.getElementById("env-body");
  if (!body) return;
  const kb = await loadJson(TENANT_KB_KEY);
  // Cache on window so the slash-command palette (and other UI) can read it
  // without async storage hits on every keystroke.
  window.NSPB_TENANT_KB = kb || null;
  if (!kb) {
    body.innerHTML = '<p class="env-empty">Import a Knowledge Base (Settings → Import KB) to see your environment here.</p>';
    return;
  }

  const esc = s => String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");

  // Build form + dashboard + rule lookups. Dashboards from the schema-v2
  // parser live in kb.dashboards (separated from forms by dashboard="true"
  // attribute in LCM XML). Older KBs without dashboards still work — dashMap
  // stays empty.
  const formMap = {};
  for (const f of (kb.forms||[])) formMap[(f.name||"").toLowerCase()] = f;
  const dashMap = {};
  for (const d of (kb.dashboards||[])) dashMap[(d.name||"").toLowerCase()] = d;
  const reportMap = {};
  for (const r of (kb.financialReports||[])) reportMap[(r.name||"").toLowerCase()] = r;
  const ruleDescByName = new Map();
  for (const r of (kb.rules||[])) {
    if (r.name) ruleDescByName.set(r.name.toLowerCase(), r.description || "");
  }

  // Use first nav flow (NSPB Finance User) as the primary module structure
  const mainFlow = (kb.navigationFlows||[]).find(f => f.modules && f.modules.length) || null;
  const modules = mainFlow ? mainFlow.modules : [];

  // Read user toggle: hide Oracle stock instructions from form cards.
  // These are templates Oracle ships with the NSPB module — not authored by
  // NSPB MCP nor specific to this tenant. Off by default = hidden.
  const showStock = localStorage.getItem("nspb-addin.showStockInstr") === "true";

  let html = `<div class="env-header">
    <h3>${esc(kb.appName || "NSPB")} — ${esc(mainFlow ? mainFlow.name : "Environment")}</h3>
    <p>${(kb.forms||[]).length} forms · ${(kb.rules||[]).length} rules · ${(kb.navigationFlows||[]).length} nav flows · imported ${kb.generatedAt ? new Date(kb.generatedAt).toLocaleDateString() : "—"}</p>
    <label style="font-size:11px;color:#555;display:flex;align-items:center;gap:6px;margin-top:4px;">
      <input type="checkbox" id="env-show-stock" ${showStock ? "checked" : ""} onchange="localStorage.setItem('nspb-addin.showStockInstr', this.checked); document.querySelector('.tab[data-tab=env]').click();" />
      Show Oracle stock instructions (verbose, generic templates)
    </label>
  </div>`;

  // Modules section
  const GENERIC_DESCS = [
    "this form is used to create and manage forecast versions",
    "epm sc team:"
  ];
  function isGenericDesc(d) {
    const dl = (d||"").toLowerCase();
    return GENERIC_DESCS.some(g => dl.startsWith(g));
  }

  // Strip markdown autolinks like [version.In](http://version.In) which are
  // false positives created when LCM source text contains "version. In the…".
  // Also collapse multiple spaces.
  function cleanText(t) {
    if (!t) return "";
    let s = String(t);
    // LCM source can have nested markdown autolinks like [[X](url)](url) when
    // the original text contained multiple "Word.Verb" patterns. Loop until
    // stable so all levels get stripped, not just the outermost.
    let prev;
    do {
      prev = s;
      s = s.replace(/\[([^\[\]]+)\]\(https?:\/\/[^)]+\)/g, "$1");
    } while (s !== prev && s.length < prev.length + 10000);
    return s.replace(/\s+/g, " ").trim();
  }

  // Detect cookie-cutter instructions that LCM copy-pasted across many forms.
  // If the same instructions text shows up in 3+ forms, we treat it as generic
  // and don't display it — better to show "Form without description" than
  // fabricated boilerplate that doesn't apply to the form.
  const instrCounts = new Map();
  const descCounts = new Map();
  for (const f of (kb.forms||[])) {
    const i = cleanText(f.instructions);
    const d = cleanText(f.description);
    if (i) instrCounts.set(i, (instrCounts.get(i) || 0) + 1);
    if (d) descCounts.set(d, (descCounts.get(d) || 0) + 1);
  }
  const isCookieCutter = (text, counts) => {
    if (!text) return false;
    return (counts.get(text) || 0) >= 3;
  };

  // Tolerant lookup: handles NFS_ prefix, trailing dot, leading/trailing
  // whitespace differences between LCM tab/artifact names and form/dashboard names.
  const variantsOf = (name) => {
    const k = String(name || "").trim().toLowerCase();
    if (!k) return [];
    const stripReport = k.replace(/\s+report(s)?\s*$/, "");      // "Balance Sheet Report" → "Balance Sheet"
    const stripDash = k.replace(/\s+dashboard\s*$/, "");          // "Balance Sheet Dashboard" → "Balance Sheet"
    const out = new Set();
    for (const base of [k, stripReport, stripDash]) {
      out.add(base);
      out.add(base.replace(/^nfs_/, ""));
      out.add(base.replace(/\.$/, ""));
      out.add(base.replace(/^nfs_/, "").replace(/\.$/, ""));
      out.add("nfs_" + base);
      out.add("nfs_" + base + ".");
      out.add(base + ".");
    }
    return [...out];
  };
  const lookupFormFuzzy = (name) => {
    for (const v of variantsOf(name)) if (formMap[v]) return formMap[v];
    return null;
  };
  const lookupDashFuzzy = (name) => {
    for (const v of variantsOf(name)) if (dashMap[v]) return dashMap[v];
    return null;
  };
  const lookupReportFuzzy = (name) => {
    for (const v of variantsOf(name)) if (reportMap[v]) return reportMap[v];
    return null;
  };

  // Collect dashboards by module too, so we can render them in a separate
  // section per module. Use tabsDetail (schema v4+) as source of truth for
  // type classification — it has explicit refObjectDefId from the LCM nav
  // flow XML. Fall back to fuzzy matching for older KBs.
  const dashboardsByModule = new Map();

  for (const mod of modules) {
    const seen = new Set();
    const seenDash = new Set();
    const seenReport = new Set();
    let modForms = [];
    const modDashboards = [];
    const modReports = [];

    // Schema v4+: tabsDetail has {label, artifactName, type} per tab.
    if (Array.isArray(mod.tabsDetail) && mod.tabsDetail.length) {
      for (const t of mod.tabsDetail) {
        const aname = (t.artifactName || t.label || "").trim();
        if (!aname) continue;
        if (t.type === "form") {
          const real = lookupFormFuzzy(aname) || lookupFormFuzzy(t.label);
          if (real && !seen.has(real.name)) { seen.add(real.name); modForms.push(real); }
          else if (!seen.has(aname)) {
            // Form referenced by nav but not in LCM (Oracle OOTB content).
            seen.add(aname);
            modForms.push({
              name: aname, displayName: t.label, kind: "input",
              cube: "(OOTB)", isInput: true, attachedRules: [],
              description: "", instructions: "", _ootb: true
            });
          }
        } else if (t.type === "dashboard") {
          const real = lookupDashFuzzy(aname) || lookupDashFuzzy(t.label);
          if (real && !seenDash.has(real.name)) { seenDash.add(real.name); modDashboards.push(real); }
          else if (!seenDash.has(aname)) {
            seenDash.add(aname);
            modDashboards.push({ name: aname, displayName: t.label, _ootb: true });
          }
        } else if (t.type === "report") {
          const real = lookupReportFuzzy(aname);
          const key = real ? real.name : aname;
          if (!seenReport.has(key)) { seenReport.add(key); modReports.push(real || { name: aname }); }
        }
      }
    } else {
      // Legacy KB (schema v3 or earlier) — fall back to fuzzy on tabs+artifacts.
      modForms = (kb.forms||[]).filter(f => f.module === mod.module);
      for (const f of modForms) seen.add(f.name);
      for (const candidate of [...(mod.tabs||[]), ...(mod.artifacts||[])]) {
        const f = lookupFormFuzzy(candidate);
        if (f && !seen.has(f.name)) { seen.add(f.name); modForms.push(f); continue; }
        const d = lookupDashFuzzy(candidate);
        if (d && !seenDash.has(d.name)) { seenDash.add(d.name); modDashboards.push(d); continue; }
        const rep = lookupReportFuzzy(candidate);
        if (rep && !seenReport.has(rep.name)) { seenReport.add(rep.name); modReports.push({ name: candidate, ...rep }); }
      }
    }

    if (modDashboards.length) dashboardsByModule.set(mod.module, modDashboards);

    const formCount = modForms.length;
    const dashCount = modDashboards.length;
    const tabStr = (mod.tabs||[]).slice(0,4).join(" · ") + (mod.tabs.length > 4 ? "…" : "");
    const countLabel = [
      formCount ? `${formCount} form${formCount!==1?"s":""}` : null,
      dashCount ? `${dashCount} dashboard${dashCount!==1?"s":""}` : null
    ].filter(Boolean).join(" + ") || "empty";

    html += `<div class="env-module">
      <div class="env-module-header">
        <strong>${esc(mod.module)}</strong>
        <span>${countLabel} · ${tabStr}</span>
      </div>`;

    for (const f of modForms.slice(0, 8)) {
      const badge = f.isInput
        ? `<span class="env-badge input">input</span>`
        : `<span class="env-badge review">review</span>`;
      // Rules with inline descriptions: each rule appears as "name — description"
      // so the user understands what it does without leaving the env tab.
      const rulesHtml = (f.attachedRules||[]).map(r => {
        const rn = (r.name||"").replace(/&/g,"&amp;");
        const onSave = r.runOnSave ? " ⚡" : "";
        const rdesc = ruleDescByName.get((r.name||"").toLowerCase()) || r.description || "";
        return rdesc
          ? `<div class="env-rule"><code>${rn}</code>${onSave} <span class="env-rule-desc">— ${esc(rdesc.slice(0,140))}${rdesc.length>140?"…":""}</span></div>`
          : `<div class="env-rule"><code>${rn}</code>${onSave}</div>`;
      }).join("");
      const cleanDesc = cleanText(f.description);
      const cleanInstr = cleanText(f.instructions);
      const showDesc = cleanDesc && !isGenericDesc(cleanDesc) && !isCookieCutter(cleanDesc, descCounts);
      const showInstr = showStock && cleanInstr && !isGenericDesc(cleanInstr) && !isCookieCutter(cleanInstr, instrCounts);
      const desc = showDesc ? `<div class="env-form-desc">${esc(cleanDesc)}</div>` : "";
      const instr = showInstr ? `<div class="env-form-instr">📋 ${esc(cleanInstr)}</div>` : "";
      const ootbBadge = f._ootb ? `<span class="env-badge dashboard">OOTB</span>` : "";
      const displayName = f.displayName && f.displayName !== f.name ? `${esc(f.displayName)}` : esc(f.name);
      const aliasLine = f.displayName && f.displayName !== f.name
        ? `<div class="env-form-noinfo">artifact: <code>${esc(f.name)}</code></div>` : "";
      const noInfo = (!showDesc && !showInstr && !rulesHtml && !f._ootb)
        ? `<div class="env-form-noinfo">Form without description</div>` : "";
      const ootbNote = f._ootb
        ? `<div class="env-form-noinfo" style="color:#0891b2">Out-of-the-box NSPB form (definition not in LCM, lives in live app).</div>` : "";
      html += `<div class="env-form">
        <div class="env-form-name">${displayName} ${badge} ${ootbBadge}</div>
        ${aliasLine}
        ${desc}
        ${instr}
        ${rulesHtml ? `<div class="env-form-rules"><div class="env-rules-label">Business rules attached:</div>${rulesHtml}</div>` : ""}
        ${ootbNote}
        ${noInfo}
        <button class="env-form-btn" onclick="sendFromEnv('open ${(f.displayName || f.name).replace(/'/g,"\\'")}')">Open form ↗</button>
      </div>`;
    }
    // Render the per-module dashboards inline (right after the forms) — they're
    // distinguished visually with a "📊 dashboard" badge, no Open chip (since
    // they can't be launched via Smart View). Helps consultant see "this module
    // has X forms + Y dashboards" without leaving the env tab.
    for (const d of modDashboards.slice(0, 6)) {
      const cleanedDesc = cleanText(d.description || d.title || "");
      const refs = (d.referencedForms || []).slice(0, 4).map(r => r.name).join(", ");
      html += `<div class="env-form env-form-dash">
        <div class="env-form-name">${esc(d.name)} <span class="env-badge dashboard">📊 dashboard</span></div>
        ${cleanedDesc ? `<div class="env-form-desc">${esc(cleanedDesc.slice(0, 200))}${cleanedDesc.length > 200 ? "…" : ""}</div>` : ""}
        ${refs ? `<div class="env-form-rules"><div class="env-rules-label">References forms:</div><div style="font-size:10.5px;color:#666">${esc(refs)}</div></div>` : ""}
        <div class="env-form-noinfo">Read-only dashboard — view in NSPB web UI (cannot open via Smart View).</div>
      </div>`;
    }

    // Financial Reports (FR) are intentionally NOT rendered — they're read-only
    // Hyperion reports that can't be opened via Smart View, so listing them
    // creates noise. Data stays in kb.financialReports for future use.
    const hiddenFr = modReports.length;

    if (!modForms.length && !modDashboards.length) {
      const hiddenNote = hiddenFr ? ` (${hiddenFr} FR report${hiddenFr!==1?"s":""} hidden — view in NSPB web UI)` : "";
      html += `<div class="env-form"><span style="color:#bbb;font-size:11px;">No Planning forms or dashboards in this module${hiddenNote}.</span></div>`;
    } else if (hiddenFr) {
      html += `<div class="env-form"><span style="color:#bbb;font-size:11px;font-style:italic;">+ ${hiddenFr} FR report${hiddenFr!==1?"s":""} hidden — view in NSPB web UI.</span></div>`;
    }
    html += `</div>`;
  }

  // Variables + Operations sections moved to the dedicated **Status** tab —
  // see renderStatusTab(). Environment now focuses on the navigation flow:
  // modules → forms → dashboards → attached rules. Use Status for vars/jobs.
  body.innerHTML = html;

  // Inline AI analyzer for substitution variables — runs Gemini on the
  // visible variables, returns JSON {var, current, recommended, reason},
  // and paints each recommendation next to its variable row.

  // Rules block — filter input
  const rulesFilter = document.getElementById("env-rules-search");
  if (rulesFilter) {
    rulesFilter.addEventListener("input", () => {
      const q = rulesFilter.value.trim().toLowerCase();
      document.querySelectorAll(".env-rule-row").forEach(row => {
        const text = row.dataset.search || "";
        row.style.display = (!q || text.includes(q)) ? "" : "none";
      });
    });
  }

  // Live search: hides modules whose name + form names + rule names don't match.
  const search = document.getElementById("env-search");
  if (search) {
    const filter = () => {
      const q = search.value.trim().toLowerCase();
      body.querySelectorAll(".env-module").forEach((modEl) => {
        const text = modEl.textContent.toLowerCase();
        if (!q || text.includes(q)) {
          modEl.style.display = "";
          // Within visible module, hide individual forms that don't match.
          modEl.querySelectorAll(".env-form").forEach((fEl) => {
            const ft = fEl.textContent.toLowerCase();
            fEl.style.display = (!q || ft.includes(q)) ? "" : "none";
          });
        } else {
          modEl.style.display = "none";
        }
      });
    };
    search.addEventListener("input", filter);
    search.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { search.value = ""; filter(); }
    });
  }
}

// ── Auto bug-report offer — the feedback loop that lets the chat "learn" ──
// When the user replies with a correction/frustration phrase ("no, eso está
// mal", "that didn't work", "try again"…), offer a one-click bug report to
// BPC. Accepting posts the SAME rich payload as the Feedback tab (env +
// debug log + recent chat transcript with the failed results) to
// /api/feedback → the Notion Bug Reports DB, title-tagged [auto], so BPC
// triages it daily. Consent required: nothing is sent without the click.
const FRUSTRATION_RE = new RegExp([
  "\\b(no+,?\\s+)?(that'?s|this\\s+is|eso|esto)\\s+(est[aá]\\s+mal|is\\s+wrong|wrong|incorrecto?)\\b",
  "(didn'?t|doesn'?t|does\\s+not|did\\s+not)\\s+work",
  "not\\s+work(s|ing)?\\b",
  "\\bno\\s+(funciona|funcion[oó]|anda|anduvo|sirve|sali[oó]\\s+bien)\\b",
  "\\b(try|do\\s+it)\\s+again\\b",
  "\\b(hacelo|hazlo|intent[aá](?:lo)?|proba(?:lo)?|pru[eé]ba(?:lo)?)\\s+(de\\s+nuevo|otra\\s+vez)\\b",
  "\\bsigue\\s+(mal|roto|igual)\\b",
  "\\b(wrong|bad|incorrect)\\s+(result|answer|data|numbers?|grid)\\b",
  "\\bresultado\\s+(incorrecto|err[oó]neo)\\b",
  "\\best[aá]\\s+(mal|roto)\\b"
].join("|"), "i");
const AUTO_BUG_COOLDOWN_KEY = "nspb-addin.autoBugOffer.ts";

function maybeOfferAutoBugReport(userText) {
  try {
    if (!FRUSTRATION_RE.test(userText)) return;
    // 10-min cooldown so retries of the same problem don't nag every turn.
    const last = parseInt(localStorage.getItem(AUTO_BUG_COOLDOWN_KEY) || "0", 10);
    if (Date.now() - last < 10 * 60 * 1000) return;
    localStorage.setItem(AUTO_BUG_COOLDOWN_KEY, String(Date.now()));
    // Let the normal reply render first, then append the offer bubble.
    setTimeout(() => {
      const bubble = addMsg("assistant", "", { skipPersist: true });
      if (!bubble) return;
      bubble.innerHTML =
        `<div style="font-size:12px;">😕 Looks like something didn't work as expected. ` +
        `Want to report it to <b>BPC</b>? The context (recent chat + technical log) is attached automatically — these get fixed fast.</div>` +
        `<div style="margin-top:6px;display:flex;gap:6px;">` +
        `<button class="auto-bug-send" style="background:#0a0a0a;color:#fff;border:0;border-radius:4px;padding:4px 12px;font-size:11px;font-weight:600;cursor:pointer;">🐛 Report to BPC</button>` +
        `<button class="auto-bug-dismiss" style="background:#fff;color:#374151;border:1px solid #d4d4d4;border-radius:4px;padding:4px 12px;font-size:11px;cursor:pointer;">No thanks</button>` +
        `</div>`;
      bubble.querySelector(".auto-bug-dismiss").addEventListener("click", () => bubble.remove());
      bubble.querySelector(".auto-bug-send").addEventListener("click", async () => {
        const btn = bubble.querySelector(".auto-bug-send");
        btn.disabled = true; btn.textContent = "Sending…";
        try {
          const build = window.NSPB_buildReportPayload;
          const payload = build ? build(true) : { client: (window.NSPB_SETTINGS && window.NSPB_SETTINGS.appName) || "" };
          payload.type = "bug";
          payload.title = `[auto] chat correction: "${userText.slice(0, 80)}"`;
          payload.description = `Auto-offered report — user typed a correction in chat: "${userText.slice(0, 500)}". Recent transcript + debug log attached.`;
          if (payload.env) payload.env.auto = true;
          const res = await fetch(API + "/api/feedback", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });
          const d = await res.json().catch(() => ({}));
          bubble.innerHTML = (res.ok && d.ok)
            ? `<div style="font-size:12px;">✓ Reported to BPC — thanks! Track it under <b>Feedback → Recently fixed</b> once it ships.</div>`
            : `<div style="font-size:12px;">✗ Couldn't send (${(d && d.error) || res.status}). You can report manually from the <b>Feedback</b> tab.</div>`;
        } catch (e) {
          bubble.innerHTML = `<div style="font-size:12px;">✗ Couldn't send (${e.message || e}). You can report manually from the <b>Feedback</b> tab.</div>`;
        }
      });
    }, 1600);
  } catch (_) {}
}

async function onSend() {
  const rawText = els.input.value.trim();
  if (!rawText) return;
  // Strip leading "/<category> " prefix produced by the slash palette so the
  // existing command parsers don't have to know about /admin /data /help etc.
  // The full "/<category> command" is still echoed to the chat history so
  // users see the menu context they came from; routing uses the bare command.
  // NOTE: `openform` is intentionally NOT in this list — its dedicated
  // handler below needs the literal word `openform` (or `open`) to remain
  // in `text` to match. Stripping `/openform ` would drop "openform" and
  // route the request to Gemini, which is slower and less reliable.
  const SLASH_PREFIXES = /^\/(admin|show|transform|data|analyze|adhoc|format|build|mockup|help|form|runrule|run|rule|epm|set|list|delete|update)\s+/i;
  const text = SLASH_PREFIXES.test(rawText) ? rawText.replace(SLASH_PREFIXES, "") : rawText;
  // Use rawText as the displayed user message so the slash prefix is visible.
  // Internal `text` (without prefix) drives all command parsers below.
  // Log every chat input — pairs with the auto-logged /api/* fetches that follow.
  logDebug({ cmd: "input", text: rawText });
  // Correction/frustration detector → one-click bug report offer (async,
  // renders after the normal reply; never blocks the message flow).
  maybeOfferAutoBugReport(rawText);

  // ── Show dimensions / cubes — instant, no AI call ────────────────
  // The AI was hallucinating + slow on these because it tried to call a tool
  // that doesn't exist instead of reading the catalog. We have the answer
  // already in window.NSPB_APPCONFIG (loaded at boot from /api/discover-app-config).
  // This intercept renders directly from cache → 0 latency, 0 hallucination,
  // 0 cost.
  try {
    // Match "show/list cubes" + "what cubes are here / are there" → render
    // cube list directly (no AI). The AI was calling show_inventory with
    // wrong kinds (kind='applications' instead of cubes — which doesn't exist
    // as a kind, so result was wrong). Faster + correct to handle locally.
    const cubesRe = /^(?:show\s+(?:me\s+)?(?:the\s+)?cubes?|list\s+cubes?|what\s+cubes\s+(?:are\s+(?:here|there|available)|exist|do\s+i\s+have)|can\s+you\s+(?:display|show|list)\s+(?:the\s+)?cubes?(?:\s+names?)?|cubes?\s+(?:names?|in\s+(?:this\s+)?(?:tenant|app|application)))\s*\??\s*$/i;
    if (cubesRe.test(text)) {
      const cfg = window.NSPB_APPCONFIG || {};
      const cubes = Array.isArray(cfg.cubes) ? cfg.cubes : [];
      const cubeDims = cfg.cubeDims || {};
      addMsg("user", rawText);
      els.input.value = "";
      if (!cubes.length) {
        addMsg("assistant", "No cubes cached yet. Open Settings → click **Detect everything** (or **Load everything**), then ask again.");
        return;
      }
      const md = `**${cubes.length} cubes** in this tenant:\n\n` +
        cubes.map(c => {
          const dims = cubeDims[c] || [];
          return `* **${c}** — ${dims.length} dims: ${dims.map(d => `\`${d}\``).join(", ")}`;
        }).join("\n") +
        `\n\nMain cube: **${cfg.mainCube || cubes[0]}**.\n\n` +
        `CHIP: Show ${cubes[0]} dimensions → show dimensions for ${cubes[0]}\n` +
        `CHIP: Show all dimensions → show me the dimensions\n` +
        `CHIP: What is a cube → What is a cube in NSPB`;
      addMsg("assistant", md);
      return;
    }
    // ── '<topic> ?' contextual help — single word + question mark renders
    //    the relevant section of the help reference as chips. Faster than
    //    typing `/help` and scrolling. Examples:
    //       form ?       → forms-related commands
    //       snapshot ?   → admin/backup commands
    //       rule ?       → rule commands (run + explain)
    //    Stops at common verbs (show, run, open, explain) so they keep
    //    routing to their dedicated handlers below.
    const topicHelpM = text.match(/^\s*(form|forms|rule|rules|variable|variables|var|vars|account|accounts|dimension|dimensions|dim|dims|snapshot|backup|explain|analyze|compare|job|jobs|integration|integrations|pipeline|pipelines|navigation|menu|cube|cubes)\s*\?\s*$/i);
    if (topicHelpM) {
      addMsg("user", rawText);
      els.input.value = "";
      const topic = topicHelpM[1].toLowerCase();
      const sections = {
        form:        ["📝 Forms — open / inspect / explain", [
          "show me the forms", "which forms for opex", "open OpEx by Dept.",
          "open Income Statement", "explain form Income Statement.",
          "list review forms for balance sheet"]],
        rule:        ["⚙️ Rules — run / explain / inspect", [
          "show me the rules", "run rule NFS_AGG - IncStmt - Forecast",
          "explain rule CalcComp", "explain rule NFS_AGG - IncStmt - Forecast — walk me through the script"]],
        variable:    ["🔧 Substitution variables", [
          "show me the variables", "explain variable NSP_PER_FcstCurrMo",
          "set variable NSP_PER_FcstCurrMo = TP10"]],
        account:     ["💰 Accounts — explore", [
          "explain account Revenue", "explain account SalesPrice",
          "explain account PostTariff (dynamic calc)"]],
        dimension:   ["📐 Dimensions — list + members", [
          "show me the dimensions", "show dimensions for NSP_NFS",
          "export Account dimension", "import this dimension"]],
        snapshot:    ["🗄️ Snapshot / backup", [
          "show snapshots",
          "show files",
          "create snapshot pre-rajiv-demo-2026-05-18",
          "create snapshot backup-before-version-cleanup"]],
        backup:      ["🗄️ Snapshot / backup", [
          "show snapshots",
          "create snapshot pre-rajiv-demo-2026-05-18"]],
        explain:     ["🧠 Explain — AI tutor on your tenant", [
          "explain rule", "explain form", "explain variable", "explain account Revenue"]],
        analyze:     ["🧠 Analyze the active sheet", [
          "analyze this", "what stands out?", "find anomalies"]],
        compare:     ["⚖️ Compare scenarios", [
          "actual vs budget revenue this year",
          "fy25 vs fy24 revenue by month"]],
        job:         ["⏱️ Jobs — recent runs", [
          "show jobs",
          "show dm jobs",
          "show all jobs",
          "show DM details for job <id>"]],
        integration: ["🔗 Integrations / DM", [
          "show me integrations", "show details of integration <name>",
          "show mapping for <name>"]],
        pipeline:    ["🔁 Pipelines / DM", [
          "show me pipelines", "show pipeline <name>"]],
        navigation:  ["🧭 Navigation flow", ["show navigation flow"]],
        cube:        ["📦 Cubes", ["show me the cubes", "show dimensions for NSP_NFS"]],
      };
      const alias = { forms: "form", rules: "rule", variables: "variable", vars: "variable",
                      var: "variable", accounts: "account", dimensions: "dimension",
                      dims: "dimension", dim: "dimension", jobs: "job",
                      integrations: "integration", pipelines: "pipeline", menu: "navigation",
                      cubes: "cube" };
      const key = alias[topic] || topic;
      const sec = sections[key];
      if (sec) {
        const [title, examples] = sec;
        let md = `**${title}**\n\nClick to paste, edit if needed, then send.\n\n`;
        for (const ex of examples) md += `CHIP_PASTE: ${ex}\n`;
        addMsg("assistant", md);
        return;
      }
    }

    const dimsRe = /^(?:show\s+(?:me\s+)?(?:the\s+)?(?:dimensions?|dims)|list\s+(?:dimensions?|dims)|what\s+dimensions(?:\s+does)?(?:\s+the)?(?:\s+(\w+))?(?:\s+cube)?(?:\s+have)?|dimensions?\s+for\s+(?:all\s+cubes?|cube\s+(\w+))|cubes?\s+and\s+(?:their\s+)?dimensions?)\s*\??\s*$/i;
    const dimsM = text.match(dimsRe);
    // Also catch "show dimensions for <cube>" / "show dims of <cube>"
    const dimsCubeM = text.match(/^(?:show|list)\s+(?:me\s+)?(?:the\s+)?(?:dimensions?|dims)\s+(?:for|of|in)\s+(\w+)\s*\??\s*$/i);
    if (dimsM || dimsCubeM) {
      const cfg = window.NSPB_APPCONFIG || {};
      const cubes = Array.isArray(cfg.cubes) ? cfg.cubes : [];
      const cubeDims = cfg.cubeDims || {};
      if (!cubes.length) {
        addMsg("user", rawText);
        els.input.value = "";
        addMsg("assistant", "No cubes cached yet. Open Settings → click **Detect everything**, then ask again.");
        return;
      }
      addMsg("user", rawText);
      els.input.value = "";
      const wantedCube = (dimsCubeM && dimsCubeM[1]) || (dimsM && (dimsM[1] || dimsM[2])) || null;
      let md;
      if (wantedCube) {
        // Match cube case-insensitively
        const cube = cubes.find(c => c.toLowerCase() === wantedCube.toLowerCase());
        if (!cube) {
          md = `Cube **${wantedCube}** not found. Available cubes: ${cubes.map(c => `\`${c}\``).join(", ")}.`;
        } else {
          const dims = cubeDims[cube] || [];
          md = `**${cube}** has **${dims.length}** dimensions:\n\n` +
               dims.map(d => `* \`${d}\``).join("\n") +
               `\n\nCHIP: Show ${dims[0]} hierarchy → show me the ${dims[0]} dimension\n` +
               (dims[1] ? `CHIP: Show ${dims[1]} hierarchy → show me the ${dims[1]} dimension\n` : "") +
               `CHIP: Show all cubes → show me the cubes`;
        }
      } else {
        // All cubes
        md = `**${cubes.length} cubes** in this tenant:\n\n` +
             cubes.map(c => {
               const dims = cubeDims[c] || [];
               return `* **${c}** — ${dims.length} dims: ${dims.map(d => `\`${d}\``).join(", ")}`;
             }).join("\n") +
             `\n\nCHIP: Show ${cubes[0]} dimensions → show dimensions for ${cubes[0]}\n` +
             `CHIP: Show Account hierarchy → show me the Account dimension`;
      }
      const bubble = addMsg("assistant", md);
      return;
    }
  } catch (e) {
    console.warn("dims intercept failed:", e);
  }

  // ── Generic Planning job runner (live REST) ─────────────────
  // Match: "run job <name>" — calls /api/run-job. jobType inferred from KB
  // (the tenant KB jobs[] has a `jobType` field per definition).
  try {
    const jobM = text.match(/^run\s+job\s+(.+?)\s*$/i);
    if (jobM) {
      const jobName = jobM[1].trim();
      const tkb = window.NSPB_TENANT_KB || {};
      const jobs = Array.isArray(tkb.jobs) ? tkb.jobs : [];
      const found = jobs.find(j => (j.name || "").toLowerCase() === jobName.toLowerCase());
      if (!found) {
        addMsg("user", rawText);
        els.input.value = "";
        addMsg("assistant", `✗ Job \`${jobName}\` not found in KB. Try \`/show jobs\` to list available jobs.`);
        return;
      }
      addMsg("user", rawText);
      els.input.value = "";
      const bubble = addMsg("assistant", `Submitting job **${found.name}** (${found.jobType || "?"})…`);
      try {
        const r = await fetch(API + "/api/run-job", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            settings: window.NSPB_SETTINGS,
            jobName: found.name,
            jobType: found.jobType,
            parameters: found.parameters || {}
          })
        });
        const d = await r.json();
        if (d.ok) {
          renderBubble(bubble,
            `✓ Job **${found.name}** submitted (\`${found.jobType}\`)\n\nJob ID: \`${d.jobId || "—"}\` · Status: \`${d.descriptiveStatus || d.status || "submitted"}\``);
        } else {
          renderBubble(bubble, `✗ Failed: \`${d.error || "unknown"}\``);
        }
      } catch (e) {
        renderBubble(bubble, `✗ Network error: ${e.message || e}`);
      }
      return;
    }
  } catch (_) { /* fallthrough */ }

  // ── List files (Interop) ────────────────────────────────────
  try {
    if (/^list\s+files\s*$/i.test(text)) {
      addMsg("user", rawText);
      els.input.value = "";
      const bubble = addMsg("assistant", "Loading files from NSPB inbox/outbox…");
      try {
        const r = await fetch(API + "/api/list-files", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ settings: window.NSPB_SETTINGS })
        });
        const d = await r.json();
        if (d.ok) {
          const files = Array.isArray(d.files) ? d.files : [];
          if (files.length === 0) {
            renderBubble(bubble, "No files found in inbox/outbox.");
          } else {
            const lines = files.slice(0, 50).map(f =>
              `- \`${f.name || f}\`  ${f.size ? `(${Math.round(f.size/1024)} KB)` : ""}  ${f.modifiedTime || f.lastModified || ""}`).join("\n");
            renderBubble(bubble, `**Files in inbox/outbox** (${files.length} total)\n\n${lines}`);
          }
        } else {
          renderBubble(bubble, `✗ ${d.error || "unknown"}`);
        }
      } catch (e) {
        renderBubble(bubble, `✗ Network error: ${e.message || e}`);
      }
      return;
    }
  } catch (_) { /* fallthrough */ }

  // ── Delete file (Interop) ───────────────────────────────────
  try {
    const delM = text.match(/^delete\s+file\s+(.+?)\s*$/i);
    if (delM) {
      const fileName = delM[1].trim();
      addMsg("user", rawText);
      els.input.value = "";
      const bubble = addMsg("assistant", `Deleting \`${fileName}\`…`);
      try {
        const r = await fetch(API + "/api/delete-file", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ settings: window.NSPB_SETTINGS, fileName })
        });
        const d = await r.json();
        if (d.ok) renderBubble(bubble, `✓ Deleted \`${fileName}\``);
        else      renderBubble(bubble, `✗ ${d.error || "unknown"}`);
      } catch (e) {
        renderBubble(bubble, `✗ Network error: ${e.message || e}`);
      }
      return;
    }
  } catch (_) { /* fallthrough */ }

  // ── Import file (Interop download → Excel) ──────────────────
  // Downloads a file the user produced in the NSPB console (e.g. a level-0
  // DATAEXPORT sitting in the interop outbox) and renders it into a sheet.
  // Match: "import <name>" or "import file <name>".
  try {
    const impM = text.match(/^import\s+(?:file\s+)?(.+?)\s*$/i);
    if (impM) {
      const fileName = impM[1].trim();
      addMsg("user", rawText);
      els.input.value = "";
      const bubble = addMsg("assistant", `Downloading \`${fileName}\` from NSPB outbox…`);
      try {
        const r = await fetch(API + "/api/download-file", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ settings: window.NSPB_SETTINGS, fileName })
        });
        const d = await r.json();
        if (!d.ok) {
          renderBubble(bubble, `✗ ${d.error || "unknown"}`);
          return;
        }
        const grid = parseDelimited(d.content || "");
        if (!grid.length) {
          renderBubble(bubble, `Downloaded \`${fileName}\` but it was empty.`);
          return;
        }
        const baseName = fileName.replace(/\.[^.]+$/, "").slice(0, 28) || "Import";
        await writeGridToSheet(baseName, grid, fileName, {});
        renderBubble(bubble, `✓ Imported \`${fileName}\` — ${grid.length} rows × ${grid[0].length} cols written to a new sheet.`);
      } catch (e) {
        renderBubble(bubble, `✗ Network error: ${e.message || e}`);
      }
      return;
    }
  } catch (_) { /* fallthrough */ }

  // ── probe schedules — debug discovery for scheduled jobs ────
  // One-off command to find which NSPB REST endpoint exposes the scheduler.
  // Tries ~13 known candidates, reports status + sample body for each.
  // Use to identify the right endpoint, then we wire `show schedules` etc.
  try {
    if (/^probe\s+schedules?\s*$/i.test(text)) {
      addMsg("user", rawText);
      els.input.value = "";
      const bubble = addMsg("assistant", "Probing 13 candidate scheduler endpoints… ~5s");
      try {
        const r = await fetch(API + "/api/probe-schedules", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ settings: window.NSPB_SETTINGS })
        });
        const d = await r.json();
        if (!d.ok) {
          renderBubble(bubble, "✗ " + (d.error || "unknown"));
          return;
        }
        const results = d.results || [];
        const ok = results.filter(x => x.ok);
        const _esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
        let html = `<strong>Probed ${results.length} endpoints — ${ok.length} returned 2xx</strong><div style="margin-top:8px;font-family:monospace;font-size:11px;">`;
        for (const r of results) {
          const color = r.ok ? "#15803d" : (r.status >= 400 && r.status < 500 ? "#9ca3af" : "#dc2626");
          html += `<div style="margin-bottom:6px;padding:4px 6px;border-left:3px solid ${color};background:#fafafa;">`;
          html += `<span style="color:${color};font-weight:700;">${r.status || "ERR"}</span> `;
          html += `<span>${_esc(r.url)}</span>`;
          if (r.items != null) html += ` <span style="color:#6b7280;">(${r.items} items)</span>`;
          if (r.bytes && !r.ok) html += ` <span style="color:#9ca3af;">${r.bytes}B</span>`;
          if (r.sample && r.ok) {
            const trimmed = r.sample.slice(0, 250);
            html += `<div style="margin-top:3px;color:#374151;font-size:10px;background:#fff;padding:4px;border:1px solid #e5e7eb;border-radius:3px;white-space:pre-wrap;">${_esc(trimmed)}${r.sample.length > 250 ? "…" : ""}</div>`;
          }
          html += `</div>`;
        }
        html += "</div>";
        bubble.innerHTML = html;
      } catch (e) {
        renderBubble(bubble, `✗ ${e.message || e}`);
      }
      return;
    }
  } catch (_) { /* fallthrough */ }

  // ── update variable — interactive picker ────────────────────
  // Match: "update variable" (no value) → open picker with all vars
  //        "update variables" → same
  try {
    if (/^update\s+variables?\s*$/i.test(text)) {
      addMsg("user", rawText);
      els.input.value = "";
      const bubble = addMsg("assistant", "Loading substitution variables…");
      try {
        const r = await fetch(API + "/api/discover-variables", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(window.NSPB_SETTINGS)
        });
        const d = await r.json();
        const vars = (d && Array.isArray(d.variables)) ? d.variables : [];
        if (vars.length === 0) {
          renderBubble(bubble, "No substitution variables found.");
          return;
        }
        const _esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
        const formId = `var-form-${Date.now()}`;
        // Group by scope (Global / cube)
        const grouped = {};
        for (const v of vars) {
          const s = v.scope || "Global";
          (grouped[s] = grouped[s] || []).push(v);
        }
        const scopes = Object.keys(grouped).sort((a,b) => a === "Global" ? -1 : b === "Global" ? 1 : a.localeCompare(b));
        const sections = scopes.map(scope => {
          const rows = grouped[scope].map(v => `
            <div data-var-row="${_esc(v.name)}" data-scope="${_esc(scope)}" style="display:grid;grid-template-columns:1fr 1fr auto;gap:6px;align-items:center;margin-bottom:4px;">
              <code style="font-size:11px;color:#374151;background:#f3f4f6;padding:2px 6px;border-radius:3px;">&amp;${_esc(v.name)}</code>
              <input type="text" data-var-input="${_esc(v.name)}" value="${_esc(v.value)}"
                style="font:inherit;font-size:12px;padding:4px 6px;border:1px solid #d4d4d4;border-radius:3px;outline:none;" />
              <button data-var-save="${_esc(v.name)}" type="button"
                style="background:#0a0a0a;color:#fff;border:0;border-radius:3px;padding:4px 10px;font-size:11px;font-weight:600;cursor:pointer;">Save</button>
            </div>`).join("");
          return `<div style="margin-bottom:10px;">
            <div style="font-size:11px;font-weight:700;color:#6b7280;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.04em;">${_esc(scope)}</div>
            ${rows}
          </div>`;
        }).join("");
        bubble.innerHTML = `
          <div><strong>Substitution variables</strong> <span style="color:#9ca3af;font-size:11px;">(${vars.length} total — edit and click Save)</span></div>
          <div id="${formId}" style="margin-top:8px;background:#fff;padding:10px;border:1px solid #e8e8e8;border-radius:6px;max-height:400px;overflow-y:auto;">
            ${sections}
          </div>`;
        // Wire each Save button
        const formEl = document.getElementById(formId);
        for (const btn of formEl.querySelectorAll("[data-var-save]")) {
          btn.addEventListener("click", async () => {
            const name = btn.getAttribute("data-var-save");
            const row = formEl.querySelector(`[data-var-row="${CSS.escape(name)}"]`);
            const scope = row.getAttribute("data-scope");
            const input = row.querySelector("input[data-var-input]");
            const newValue = input.value;
            const cube = (scope && scope !== "Global") ? scope : null;
            btn.disabled = true; btn.textContent = "…";
            try {
              const rr = await fetch(API + "/api/set-subst-var", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ settings: window.NSPB_SETTINGS, name, value: newValue, cube })
              });
              const dd = await rr.json();
              await refreshVarsCache(dd);
              if (dd.ok) {
                btn.textContent = dd.verified === true ? "✓ Saved" : "⚠ Unconfirmed";
                btn.style.background = dd.verified === true ? "#15803d" : "#b45309";
                if (dd.verified !== true) btn.title = "Written, but the read-back could not confirm it.";
                setTimeout(() => {
                  btn.disabled = false; btn.textContent = "Save"; btn.style.background = "#0a0a0a";
                }, 1500);
              } else {
                btn.textContent = "✗ Err";
                btn.style.background = "#991b1b";
                btn.title = dd.error || "unknown";
                setTimeout(() => {
                  btn.disabled = false; btn.textContent = "Save"; btn.style.background = "#0a0a0a";
                }, 2500);
              }
            } catch (e) {
              btn.textContent = "✗"; btn.title = String(e.message || e);
              btn.disabled = false; btn.style.background = "#991b1b";
            }
          });
        }
      } catch (e) {
        renderBubble(bubble, `✗ ${e.message || e}`);
      }
      return;
    }
  } catch (_) { /* fallthrough */ }

  // ── set substitution variable (live REST) ───────────────────
  // Match: "set variable <name> = <value>" or "set var <name> = <value>"
  //        with optional " in <cube>" suffix for cube-scoped vars.
  // This DOES NOT need EPM Automate — calls /api/set-subst-var which hits
  // PUT /HyperionPlanning/rest/v3/applications/{app}/substitutionvariables/<name>
  // directly with Basic Auth.
  try {
    const setM = text.match(/^set\s+(?:variable|var)\s+&?([\w]+)\s*=\s*(.+?)(?:\s+in\s+([\w]+))?\s*$/i);
    if (setM) {
      const varName = setM[1].trim();
      // Keep the value EXACTLY as typed — including any leading/trailing
      // double-quotes. NSPB stores some sub vars with literal quotes (e.g.
      // `"TP4"`) and removing them would break MDX expressions that depend
      // on the quoting. Tab-style quotes are the user's choice to preserve.
      const value = setM[2].trim();
      const cube = (setM[3] || "").trim() || null;

      addMsg("user", rawText);
      els.input.value = "";
      const bubble = addMsg("assistant", "Setting variable…");

      try {
        const r = await fetch(API + "/api/set-subst-var", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            settings: window.NSPB_SETTINGS,
            name: varName,
            value: value,
            cube: cube
          })
        });
        const d = await r.json();
        // Keep the cached inventory in step with NSPB. `show me the
        // variables` renders this cache, so skipping the refresh made a
        // successful write look like it did nothing.
        await refreshVarsCache(d);
        if (d.ok) {
          const scopeLabel = (d.scope === "cube" || cube) ? `cube \`${d.via || cube}\`` : "application";
          const confirmed = d.verified === true
            ? "✓ Variable updated"
            : "⚠ Variable written but NOT confirmed (couldn't re-read it)";
          renderBubble(bubble,
            `${confirmed} (${scopeLabel}):\n\n\`&${d.name} = ${d.actualValue != null ? d.actualValue : d.value}\``);
        } else {
          renderBubble(bubble,
            `✗ Failed to set \`&${varName}\`:\n\n\`\`\`\n${d.error || "unknown error"}\n\`\`\``);
        }
      } catch (e) {
        renderBubble(bubble, `✗ Network error: ${e.message || e}`);
      }
      return;
    }
  } catch (_) { /* fallthrough */ }

  // ── EPM Automate command generator ──────────────────────────
  // The add-in CAN'T execute local CLI directly (Office sandbox). So we
  // GENERATE the PowerShell script and show it in chat with a Copy button.
  // User pastes in their terminal, runs it, and (optionally) drops the
  // result file back into the add-in.
  try {
    const epmM = text.match(/^epm\s+(test|login|logout|set\s+var|set\s+variable|export\s+security|audit\s+log|run\s+rule|export\s+data|help)(?:\s+(.+))?$/i);
    if (epmM) {
      const action = epmM[1].toLowerCase().replace(/\s+/g, " ").trim();
      const arg = (epmM[2] || "").trim();
      const s = window.NSPB_SETTINGS || {};
      const path = (s.epmPath && s.epmPath.trim()) || "epmautomate";
      const isFull = path.includes("\\") || path.includes("/");
      const exe = isFull ? `& "${path}"` : path;
      const url = s.host || "https://YOUR_TENANT.epm.oraclecloud.com";
      const user = s.username || "YOUR_USER";
      const pwd = s.password || "YOUR_PASSWORD";
      const app = s.appName || "NetSuite";

      let ps = "";
      let title = "";
      let notes = "";
      if (action === "test" || action === "help") {
        title = "Test EPM Automate";
        ps = `${exe} help`;
        notes = "Should print version + supported commands. If you get 'epmautomate is not recognized', check the path in Settings.";
      } else if (action === "login") {
        title = "Login to EPM Automate";
        ps = `${exe} login "${user}" "${pwd}" "${url}"`;
        notes = "Once logged in, the session lasts ~30 min. Rerun any time you get auth errors.";
      } else if (action === "logout") {
        title = "Logout from EPM Automate";
        ps = `${exe} logout`;
        notes = "Always logout when done — frees the session slot for other users.";
      } else if (action === "set var" || action === "set variable") {
        const m = arg.match(/^([\w&]+)\s*=\s*(.+)$/);
        const varName = m ? m[1].replace(/^&/, "") : "VARNAME";
        const value = m ? m[2] : "VALUE";
        title = `Update substitution variable: ${varName}`;
        ps = [
          `${exe} login "${user}" "${pwd}" "${url}"`,
          `${exe} setSubstVars ${app} "${varName}=${value}"`,
          `${exe} logout`,
        ].join("\n");
        notes = `Sets the application-level sub var \`&${varName}\` to \`${value}\`. To set a cube-scoped var: replace \`${app}\` with \`${app}.<CubeName>\`.`;
      } else if (action === "export security") {
        title = "Export security to CSV";
        ps = [
          `${exe} login "${user}" "${pwd}" "${url}"`,
          `${exe} exportSecurity Security.csv`,
          `${exe} downloadFile Security.csv`,
          `${exe} logout`,
        ].join("\n");
        notes = "Generates `Security.csv` in the EPM Automate folder. Includes user/group access to forms, cubes, and dimensions.";
      } else if (action === "audit log") {
        const days = arg && /^\d+$/.test(arg) ? parseInt(arg, 10) : 30;
        title = `Download audit log (last ${days} days)`;
        ps = [
          `${exe} login "${user}" "${pwd}" "${url}"`,
          `${exe} downloadAuditLog ${days}`,
          `${exe} logout`,
        ].join("\n");
        notes = `Generates an audit log ZIP in the EPM Automate folder for the last ${days} days.`;
      } else if (action === "run rule") {
        const ruleName = arg || "RULE_NAME";
        title = `Run business rule: ${ruleName}`;
        ps = [
          `${exe} login "${user}" "${pwd}" "${url}"`,
          `${exe} runBusinessRule "${ruleName}"`,
          `${exe} logout`,
        ].join("\n");
        notes = "If the rule has runtime prompts (RTPs), append them as `name=value` pairs after the rule name.";
      } else if (action === "export data") {
        title = "Export application data to CSV";
        ps = [
          `${exe} login "${user}" "${pwd}" "${url}"`,
          `${exe} exportData "Plan" Data.zip`,
          `${exe} downloadFile Data.zip`,
          `${exe} logout`,
        ].join("\n");
        notes = "Replace `Plan` with your cube name. The ZIP contains a CSV with all data points.";
      }

      typingBubble.classList.remove("typing");
      typingBubble.remove();
      addMsg("user", rawText);
      const reply =
        `**${title}**\n\n` +
        "Paste this in PowerShell (the EPM Automate folder is the recommended working dir):\n\n" +
        "```\n" + ps + "\n```\n\n" +
        notes +
        "\n\n_The CLI runs locally — credentials never leave your machine via this path._";
      renderBubble(addMsg("assistant", ""), reply);
      history.push({ role: "user", content: text });
      history.push({ role: "assistant", content: reply });
      els.send.disabled = false;
      return;
    }
  } catch (_) { /* fall through */ }

  // FAQ intercept — if the user typed (or picked from /help) a question that
  // we have a pre-written answer for, show it instantly without calling
  // Gemini. Saves tokens and is much faster. Match is normalized
  // (lowercase + trim + collapse spaces) so the user can rephrase slightly.
  try {
    const normalize = s => (s || "").toLowerCase().replace(/[?!.,]+$/, "").replace(/\s+/g, " ").trim();
    const targetKey = normalize(text);
    if (typeof FAQ_ANSWERS === "object" && FAQ_ANSWERS[targetKey]) {
      els.input.value = "";
      els.send.disabled = true;
      addMsg("user", rawText);
      typingBubble.classList.remove("typing");
      typingBubble.remove();
      renderBubble(addMsg("assistant", ""), FAQ_ANSWERS[targetKey]);
      history.push({ role: "user", content: text });
      history.push({ role: "assistant", content: FAQ_ANSWERS[targetKey] });
      els.send.disabled = false;
      return;
    }
  } catch (_) { /* fall through */ }

  // /clear — clear chat history locally (slash-command equivalent of the
  // ghost button at the top of the chat tab).
  if (text === "/clear") {
    els.input.value = "";
    if (typeof clearChatHistory === "function") clearChatHistory();
    return;
  }

  // Bare slash category submitted (e.g. just "/adhoc" with no item) — guide
  // the user back to the palette instead of sending an unknown command.
  const BARE_CATEGORY = /^\/(admin|data|analyze|adhoc|format|build|mockup|help|form|rule)$/i;
  if (BARE_CATEGORY.test(rawText)) {
    els.input.value = rawText + " ";   // re-open the palette by re-triggering
    addMsg("user", rawText);
    addMsg("assistant", `Type \`${rawText}\` again followed by a space to see the sub-options, or just keep typing to filter (e.g. \`${rawText} forecast\`).`);
    els.send.disabled = false;
    return;
  }

  // Debug slash-commands — handled locally, never sent to Gemini
  if (text === "/debug-rules") {
    els.input.value = "";
    addMsg("user", text);
    addMsg("assistant", "Calling /api/discover-rules-raw…");
    try {
      const s = window.NSPB_SETTINGS;
      const r = await fetch(API + "/api/discover-rules-raw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(s)
      });
      const d = await r.json();
      addMsg("debug", JSON.stringify(d, null, 2));
    } catch (e) {
      addMsg("error", "debug-rules failed: " + (e.message || e));
    }
    return;
  }

  if (!window.NSPB_SETTINGS.geminiKey) {
    addMsg("error", "Gemini API key missing. Click ⚙ to add it.");
    return;
  }
  els.input.value = "";
  els.send.disabled = true;

  // Show the original /<category> command in the chat bubble so the user
  // remembers where it came from, but keep `text` (stripped) for routing.
  addMsg("user", rawText);
  history.push({ role: "user", content: text });

  const typingBubble = addMsg("assistant", "…");
  typingBubble.innerHTML = '<span class="typing-dots"><span></span><span></span><span></span></span><span class="typing-label">Thinking…</span>';
  typingBubble.classList.add("typing");

  // ── Progress text rotator ─────────────────────────────────────────
  // Long requests (analyze with Pro = 12-30s) feel frozen with a static
  // "Thinking…" label. Rotate through more informative messages so the
  // user knows it's still working. Auto-stops when typing class removed.
  const _progressMessages = [
    { at: 0,    msg: "Thinking…" },
    { at: 4,    msg: "Fetching from NSPB…" },
    { at: 8,    msg: "Analyzing the data…" },
    { at: 14,   msg: "Generating the report — Pro is composing…" },
    { at: 22,   msg: "Almost there — formatting the output…" },
    { at: 32,   msg: "Still working… Pro is detail-heavy on big sheets." },
    { at: 50,   msg: "Taking unusually long. Network may be slow." }
  ];
  const _progressStart = Date.now();
  const _progressTimer = setInterval(() => {
    if (!typingBubble.classList.contains("typing")) {
      clearInterval(_progressTimer);
      return;
    }
    // Intercepts that know what they're doing set a STATIC label ("Opening
    // form X…") — don't overwrite it with generic guesses like "Analyzing
    // the data…" that read as lies.
    if (typingBubble.dataset.staticLabel === "1") return;
    const elapsed = Math.floor((Date.now() - _progressStart) / 1000);
    let chosen = _progressMessages[0];
    for (const p of _progressMessages) { if (elapsed >= p.at) chosen = p; }
    const lbl = typingBubble.querySelector(".typing-label");
    if (lbl && lbl.textContent !== chosen.msg) lbl.textContent = chosen.msg;
  }, 1000);

  // Help intercept: comprehensive command reference with example chips.
  // Click any CHIP_PASTE chip → fills the input so the user can edit and send.
  if (/^(help|ayuda|\?|docs|show docs|what can i do|qué puedo hacer|que comandos|qué comandos hay|cheat ?sheet)\s*\??$/i.test(text.trim())) {
    typingBubble.classList.remove("typing");
    renderBubble(typingBubble, buildHelpReply());
    history.push({ role: "assistant", content: "[help reference shown]" });
    els.send.disabled = false;
    return;
  }

  // ───── Metadata REPL (local only — searches cached KB / catalog / forms / rules / vars) ─────
  // Fast, zero-token, replies inline in chat. Requires Detect Everything + Import KB to be done.
  try {
    const tFindMem  = text.match(/^(?:find\s+member|does\s+member|where\s+is\s+member|which\s+dim\s+contains)\s+(.+?)\??\s*$/i);
    const tCubes    = /^(?:how\s+many\s+cubes|list\s+cubes|show\s+cubes|cubes)\s*\??$/i.test(text);
    const tDims     = text.match(/^(?:dimensions?|dims)\s+of\s+(?:cube\s+)?(.+?)\s*$/i);
    const tRulesOf  = text.match(/^(?:rules|calcs|what\s+(?:rules|calcs))\s+(?:of|for|in|has|does)\s+(?:form\s+)?(.+?)\??\s*$/i);
    const tFormsRule = text.match(/^(?:which|what)\s+forms\s+use\s+(?:rule\s+)?(.+?)\??\s*$/i);
    const tCount    = text.match(/^(?:count|how\s+many)\s+(forms|rules|variables|vars|cubes|jobs|integrations)\s*\??$/i);
    const tRunOnSave = /^(?:which|what)\s+rules\s+run\s+on\s+save\s*\??$/i.test(text);
    // Member counts per dim + show dim contents to Excel
    const tDimMemberCount = text.match(/^(?:how\s+many\s+members?|count\s+members?)\s+(?:in|of|are\s+in)\s+(?:the\s+)?(.+?)\s*(?:dimension)?\??\s*$/i);
    const tShowDim = text.match(/^(?:show\s+(?:me\s+)?(?:the\s+)?|list\s+(?:all\s+)?|export\s+)(?:dimension\s+)?(.+?)\s+(?:dimension|members?|to\s+excel)\s*\??$/i);

    const renderInline = (md) => {
      typingBubble.classList.remove("typing");
      renderBubble(typingBubble, md);
      els.send.disabled = false;
    };

    if (tFindMem || tCubes || tDims || tRulesOf || tFormsRule || tCount || tRunOnSave || tDimMemberCount || tShowDim) {
      const [tkb, catWrap, formsWrap, rulesWrap, varsWrap, appCfgWrap] = await Promise.all([
        loadJson(TENANT_KB_KEY), loadJson(CATALOG_KEY), loadJson(FORMS_KEY),
        loadJson(RULES_KEY), loadJson(VARS_KEY), loadJson(APP_CONFIG_KEY)
      ]);
      const cat = (catWrap && catWrap.catalog) || {};
      const liveForms = (formsWrap && formsWrap.forms) || [];
      const liveRules = (rulesWrap && rulesWrap.rules) || [];
      const liveVars = (varsWrap && varsWrap.variables) || [];
      const kbForms = (tkb && tkb.forms) || [];
      const kbRules = (tkb && tkb.rules) || [];
      const kbVars  = (tkb && tkb.substitutionVariables) || [];
      // KB dimensions are a {dimName: [members]} object (LCM-derived).
      const kbDimsObj = (tkb && tkb.dimensions) || {};
      const kbDimNames = Object.keys(kbDimsObj);
      // Cubes from appConfig (Detect everything) — falls back to catalog
      const cubeList = (appCfgWrap && appCfgWrap.cubes) || cat.cubes || [];
      const cubeDimsMap = (appCfgWrap && appCfgWrap.cubeDims) || {};

      // --- find member / does member exist / which dim contains ---
      // Searches the LCM tenant-kb.json only — fast, deterministic.
      if (tFindMem) {
        const needle = tFindMem[1].trim().toLowerCase();
        if (!kbDimNames.length) {
          return renderInline(`No dimensions in the loaded KB. Import \`tenant-kb.json\` in Settings first.`);
        }
        const exactHits = [];
        const partialHits = [];
        for (const dimName of kbDimNames) {
          const members = kbDimsObj[dimName] || [];
          for (const m of members) {
            const name = (m.name || "").toLowerCase();
            const alias = (m.alias || "").toLowerCase();
            if (name === needle || alias === needle) {
              exactHits.push({ dim: dimName, name: m.name, alias: m.alias });
            } else if (name.includes(needle) && exactHits.length < 50) {
              partialHits.push({ dim: dimName, name: m.name });
            }
          }
        }
        if (exactHits.length === 0 && partialHits.length === 0) {
          return renderInline(`❌ Member \`${tFindMem[1]}\` not found in any of ${kbDimNames.length} LCM dimensions.`);
        }
        let md = "";
        if (exactHits.length) {
          md += `✓ Found **${exactHits.length}** exact match${exactHits.length === 1 ? "" : "es"} for \`${tFindMem[1]}\`:\n\n`;
          md += exactHits.slice(0, 10).map(h => `* \`${h.name}\` → dimension **${h.dim}**${h.alias ? ` (alias: ${h.alias})` : ""}`).join("\n");
        }
        if (partialHits.length) {
          if (exactHits.length) md += `\n\n`;
          md += `**${partialHits.length} partial match${partialHits.length === 1 ? "" : "es"}:**\n`;
          md += partialHits.slice(0, 10).map(h => `* \`${h.name}\` in **${h.dim}**`).join("\n");
        }
        return renderInline(md);
      }

      // Flexible dim-name resolver: tolerates lowercase, trailing 's' (plural),
      // "the X", "all X", and Levenshtein typos. Returns null if no match.
      const resolveDim = (query) => {
        const norm = s => (s || "").toLowerCase()
          .replace(/^(?:the|all|every)\s+/, "")
          .replace(/\s+(?:dimension|dim|hierarchy)$/, "")
          .replace(/s$/, "")  // strip plural
          .trim();
        const target = norm(query);
        // 1. Exact (after normalize)
        const exact = kbDimNames.find(d => norm(d) === target);
        if (exact) return exact;
        // 2. Substring contains
        const partial = kbDimNames.find(d => norm(d).includes(target) || target.includes(norm(d)));
        if (partial) return partial;
        // 3. Levenshtein fallback (typos)
        const lev = (a, b) => {
          if (a === b) return 0; if (!a) return b.length; if (!b) return a.length;
          const m = a.length, n = b.length;
          let prev = new Array(n + 1), curr = new Array(n + 1);
          for (let j = 0; j <= n; j++) prev[j] = j;
          for (let i = 1; i <= m; i++) {
            curr[0] = i;
            const ai = a.charCodeAt(i - 1);
            for (let j = 1; j <= n; j++) {
              const cost = ai === b.charCodeAt(j - 1) ? 0 : 1;
              curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
            }
            [prev, curr] = [curr, prev];
          }
          return prev[n];
        };
        const scored = kbDimNames
          .map(d => ({ d, dist: lev(target, norm(d)) }))
          .filter(x => x.dist <= Math.min(3, Math.ceil(target.length * 0.4)))
          .sort((a, b) => a.dist - b.dist);
        return scored.length ? scored[0].d : null;
      };

      // --- count members of <dim> ---
      if (tDimMemberCount) {
        const dimQuery = tDimMemberCount[1].trim();
        const dimName = resolveDim(dimQuery);
        if (!dimName) {
          return renderInline(`Dimension \`${dimQuery}\` not found. Available: ${kbDimNames.join(", ")}`);
        }
        const n = (kbDimsObj[dimName] || []).length;
        return renderInline(`Dimension **${dimName}** has **${n.toLocaleString()}** members in LCM.`);
      }

      // --- show <dim> dimension (writes to Excel sheet) ---
      if (tShowDim) {
        const dimQuery = tShowDim[1].trim();
        const dimName = resolveDim(dimQuery);
        if (!dimName) {
          return renderInline(`Dimension \`${dimQuery}\` not found. Available: ${kbDimNames.join(", ")}`);
        }
        const members = kbDimsObj[dimName] || [];
        if (!members.length) {
          return renderInline(`Dimension **${dimName}** has no cached members.`);
        }
        const sheetName = `DIM_${dimName}`.slice(0, 31);
        try {
          await withFocusRetry(() => Excel.run(async (ctx) => {
            const wb = ctx.workbook;
            const sheets = wb.worksheets;
            sheets.load("items/name");
            await ctx.sync();
            const existing = sheets.items.find(s => s.name === sheetName);
            if (existing) existing.delete();
            const sh = sheets.add(sheetName);
            sh.activate();
            // Title — text in A1 only, no merge. Plain text (no icon).
            const titleCell = sh.getRangeByIndexes(0, 0, 1, 1);
            titleCell.values = [[`${dimName} dimension`]];
            titleCell.format.font.bold = true;
            titleCell.format.font.size = 22;
            titleCell.format.font.color = "#0a0a0a";
            titleCell.format.font.name = "Calibri Light";
            try {
              const bottom = sh.getRangeByIndexes(0, 0, 1, 4)
                .format.borders.getItem("EdgeBottom");
              bottom.style = "Continuous"; bottom.color = "#1e3a8a"; bottom.weight = "Thick";
            } catch (_) {}
            // Subtitle in A2 only.
            const subtitleCell = sh.getRangeByIndexes(1, 0, 1, 1);
            subtitleCell.values = [[`${members.length.toLocaleString()} members  ·  ${new Date().toLocaleString()}`]];
            subtitleCell.format.font.size = 10;
            subtitleCell.format.font.italic = true;
            subtitleCell.format.font.color = "#9ca3af";
            subtitleCell.format.font.name = "Calibri Light";
            // Header — slate
            const hdr = sh.getRangeByIndexes(3, 0, 1, 4);
            hdr.values = [["Name", "Alias", "Level", "Storage"]];
            hdr.format.font.bold = true;
            hdr.format.fill.color = "#0f172a";
            hdr.format.font.color = "#ffffff";
            hdr.format.font.size = 11;
            hdr.format.rowHeight = 26;
            hdr.format.font.name = "Calibri";
            // Body with zebra
            const rows = members.map(m => [m.name || "", m.alias || "", m.level != null ? m.level : "", m.storage || ""]);
            const body = sh.getRangeByIndexes(4, 0, rows.length, 4);
            body.values = rows;
            body.format.font.name = "Calibri Light";
            // Zebra rows
            for (let i = 0; i < rows.length; i++) {
              if (i % 2 === 1) {
                sh.getRangeByIndexes(4 + i, 0, 1, 4).format.fill.color = "#fafafa";
              }
            }
            // Bold first col (member name)
            sh.getRangeByIndexes(4, 0, rows.length, 1).format.font.bold = true;
            // Explicit column widths — NO autofit (autofit on A would scale to
            // longest member name and blow up to >800 px). Cap each column.
            sh.getRangeByIndexes(0, 0, 1, 1).format.columnWidth = 200;  // Name
            sh.getRangeByIndexes(0, 1, 1, 1).format.columnWidth = 200;  // Alias
            sh.getRangeByIndexes(0, 2, 1, 1).format.columnWidth = 60;   // Level
            sh.getRangeByIndexes(0, 3, 1, 1).format.columnWidth = 90;   // Storage
            // No wrap anywhere
            sh.getRangeByIndexes(0, 0, rows.length + 4, 4).format.wrapText = false;
            await ctx.sync();
          }), "show dim");
        } catch (e) {
          return renderInline(`Failed to write sheet: ${e.message || e}`);
        }
        return renderInline(`✓ Wrote sheet \`${sheetName}\` with **${members.length.toLocaleString()}** members of dimension **${dimName}**.`);
      }

      // --- cubes / list cubes / how many cubes ---
      if (tCubes) {
        if (!cubeList.length) {
          return renderInline("No cubes cached. Run **Detect everything** in Settings first to discover cubes via API.");
        }
        const md = `**${cubeList.length} cube${cubeList.length === 1 ? "" : "s"}** in this application:\n\n` +
          cubeList.map(c => {
            const cn = c.name || c;
            const dimCount = (cubeDimsMap[cn] || []).length;
            return `* **${cn}**${c.type ? ` (${c.type})` : ""}${dimCount ? ` — ${dimCount} dims` : ""}`;
          }).join("\n") +
          `\n\n_Tip: \`dimensions of <cube>\` for details._`;
        return renderInline(md);
      }

      // --- dimensions of <cube> ---
      if (tDims) {
        const cubeName = tDims[1].trim();
        const cube = cubeList.find(c => (c.name || c).toLowerCase() === cubeName.toLowerCase());
        if (!cube) {
          const available = cubeList.map(c => c.name || c).join(", ") || "none cached";
          return renderInline(`Cube \`${cubeName}\` not found. Available: ${available}\n\n_Run \`cubes\` to list, or \`Detect everything\` if empty._`);
        }
        const dimNames = cubeDimsMap[cube.name || cube] || [];
        if (!dimNames.length) {
          return renderInline(`No dim list cached for cube \`${cube.name || cube}\`. Re-run **Detect everything**.`);
        }
        const md = `**${dimNames.length} dimensions** in cube \`${cube.name || cube}\`:\n\n` +
          dimNames.map(dn => {
            const memberCount = (kbDimsObj[dn] || []).length;
            return `* **${dn}**${memberCount ? ` (${memberCount} members in LCM)` : ""}`;
          }).join("\n");
        return renderInline(md);
      }

      // --- rules / calcs of <form> ---
      if (tRulesOf) {
        const fname = tRulesOf[1].trim().toLowerCase();
        // Fuzzy match (NFS_ prefix, trailing dot, case)
        const allForms = [...kbForms, ...liveForms];
        const variants = [fname, "nfs_" + fname, fname + ".", "nfs_" + fname + ".", fname.replace(/^nfs_/, "")];
        let form = null;
        for (const v of variants) {
          form = allForms.find(f => (f.name || "").toLowerCase() === v);
          if (form) break;
        }
        if (!form) {
          // Substring match as last resort
          form = allForms.find(f => (f.name || "").toLowerCase().includes(fname));
        }
        if (!form) return renderInline(`Form \`${tRulesOf[1]}\` not found in cached metadata. Try \`open ${tRulesOf[1]}\` to see if it exists in the live app.`);
        const rules = form.attachedRules || form.businessRules || [];
        if (!rules.length) return renderInline(`Form **${form.name}** has no attached business rules in LCM.`);
        const md = `**${rules.length} rule${rules.length === 1 ? "" : "s"}** attached to form **${form.name}**:\n\n` +
          rules.map(r => `* \`${r.name || r}\`${r.runOnSave ? " ⚡ (onSave)" : ""}${r.description ? ` — ${r.description}` : ""}`).join("\n");
        return renderInline(md);
      }

      // --- which forms use rule <name> ---
      if (tFormsRule) {
        const ruleName = tFormsRule[1].trim().toLowerCase();
        const allForms = [...kbForms, ...liveForms];
        const matches = allForms.filter(f => {
          const rules = f.attachedRules || f.businessRules || [];
          return rules.some(r => (r.name || r || "").toLowerCase() === ruleName);
        });
        if (!matches.length) return renderInline(`No forms found using rule \`${tFormsRule[1]}\`.`);
        const md = `**${matches.length} form${matches.length === 1 ? "" : "s"}** use rule \`${tFormsRule[1]}\`:\n\n` +
          matches.slice(0, 30).map(f => `* **${f.name}** ${f.cube ? `(${f.cube})` : ""}`).join("\n");
        return renderInline(md);
      }

      // --- which rules run on save ---
      if (tRunOnSave) {
        const all = [...kbRules, ...liveRules];
        const onSave = all.filter(r => r.runOnSave || /onSave/i.test(r.runOnEvent || ""));
        if (!onSave.length) return renderInline("No rules with onSave behavior found.");
        const md = `**${onSave.length} rule${onSave.length === 1 ? "" : "s"}** run on form save:\n\n` +
          onSave.slice(0, 30).map(r => `* \`${r.name}\`${r.description ? ` — ${r.description}` : ""}`).join("\n");
        return renderInline(md);
      }

      // --- count <thing> ---
      if (tCount) {
        const what = tCount[1].toLowerCase();
        let n = 0, label = "";
        if (/forms?/.test(what))         { n = (kbForms.length || liveForms.length); label = "forms"; }
        else if (/rules?/.test(what))    { n = (kbRules.length || liveRules.length); label = "business rules"; }
        else if (/var/.test(what))       { n = (kbVars.length || liveVars.length);   label = "substitution variables"; }
        else if (/cubes?/.test(what))    { n = cubeList.length; label = "cubes"; }
        else if (/dim/.test(what))       { n = kbDimNames.length;  label = "dimensions"; }
        return renderInline(`**${n}** ${label} cached.`);
      }
    }
  } catch (e) {
    logDebug({ cmd: "metadata_repl_error", error: e.message || String(e) });
    typingBubble.classList.remove("typing");
    renderBubble(typingBubble, "Metadata search failed: " + (e.message || e));
    els.send.disabled = false;
    return;
  }

  // ───── Debug log dump ─────
  if (/^debug\s+(last|all|clear)\s*$/i.test(text)) {
    typingBubble.classList.remove("typing");
    const mode = text.trim().split(/\s+/)[1].toLowerCase();
    if (mode === "clear") {
      window.__nspbDebugLog = [];
      renderBubble(typingBubble, "Debug log cleared.");
    } else {
      const entries = mode === "last"
        ? window.__nspbDebugLog.slice(-1)
        : window.__nspbDebugLog;
      if (!entries.length) {
        renderBubble(typingBubble, "No debug entries yet. Run a command first.");
      } else {
        const dump = entries.map(formatDebugEntry).join("\n\n");
        renderBubble(typingBubble,
          `**Debug log (${entries.length} ${entries.length === 1 ? "entry" : "entries"})** — copy below and paste to support:\n\n` +
          "```json\n" + dump + "\n```"
        );
      }
    }
    els.send.disabled = false;
    return;
  }

  // ───── Pre-built check: actuals without budget per period ─────
  // Deterministic SQL on the loaded smartview-shaped table (long format).
  // Finds Item × Subsidiary × Period combos where there's an Actual value
  // (in Load $ or Unit qty) but no Budget loaded for the same combo.
  // Highlights the missing Budget cells in NSPB_SmartView.
  //
  // Syntax:
  //   check actuals without budget                                  (defaults: Load, all 12 months)
  //   check actuals without budget tracker=Load                     (specific tracker)
  //   check actuals without budget tp1-tp6                          (period range)
  //   check actuals without budget tracker=Unit tp1-tp6
  //   check actuals without forecast                                (use Forecast scenario instead of Budget)
  // Accepts (in any order, all optional except "actuals without budget|forecast"):
  //   fy24 / fy25 / years=FY25         → year filter
  //   tracker=Load / tracker=Unit       → tracker
  //   tp1-tp9 / tp1-12                  → period range
  // Examples:
  //   check actuals without budget
  //   check fy25 actuals without forecast tp1-tp9
  //   check actuals without budget tracker=Unit fy24 tp1-6
  // ── check fy25 lost customers [last=N] [tracker=Load|Unit] [only=forecast|budget] ─
  //
  // Two-step question:
  //   Step 1: Who stopped buying? Customers that had Actual > 0 in earlier
  //           periods of the year, then ZERO in the last N periods (silent).
  //   Step 2: Of those, who still has Forecast or Budget loaded — i.e. money
  //           we'd want to clean up because they're not coming back.
  //
  // Defaults:
  //   - silent = last 3 periods (auto-detected as the 3 periods up to and
  //     including the latest period that has Actual data in the year)
  //   - tracker = Load ($)
  //   - report both Forecast AND Budget leftover unless "only=" specified
  //
  // Examples:
  //   check fy25 lost customers
  //   check fy25 lost customers last=2
  //   check fy25 lost customers tracker=Unit
  //   check fy25 lost customers last=3 only=forecast
  const tLostCust = text.match(
    /^check\s+(fy\d+)\s+lost\s+customers?((?:\s+(?:last\s*=\s*\d+|tracker\s*=\s*\w+|only\s*=\s*(?:forecast|budget)))*)\s*$/i
  );
  if (tLostCust) {
    const yr      = tLostCust[1].toUpperCase();
    const opts    = tLostCust[2] || "";
    const lastN   = parseInt((opts.match(/last\s*=\s*(\d+)/i) || [])[1] || "3", 10);
    const tracker = (opts.match(/tracker\s*=\s*(\w+)/i) || [])[1] || "Load";
    const onlyM   = (opts.match(/only\s*=\s*(forecast|budget)/i) || [])[1];
    const onlyTargets = onlyM ? [onlyM[0].toUpperCase() + onlyM.slice(1).toLowerCase()] : ["Forecast", "Budget"];
    typingBubble.classList.remove("typing");
    typingBubble.remove();
    const progressBubble = addMsg("assistant",
      `🔵 Running **lost-customer** check: ${tracker} ${yr} · silent window = last ${lastN} period${lastN===1?"":"s"}…`
    );
    try {
      const tables = await NSPB_DB.listTables();
      const names = tables.map(t => t.table_name);
      if (!names.length) {
        addMsg("error", "No tables loaded. Run `load smartview as today` first.");
        els.send.disabled = false;
        return;
      }
      const tname = ["today", "smartview"].find(n => names.includes(n)) || names[names.length - 1];
      const colsRaw = await NSPB_DB.query(`PRAGMA table_info("${tname}")`);
      const NON_DIM = new Set(["Tracker", "Scenario", "Years", "Period", "value"]);
      const dimCols = colsRaw.map(c => c.name).filter(n => !NON_DIM.has(n));
      const groupCols = dimCols.map(c => `"${c}"`).join(", ");

      // Step 0: detect "current period" = max TPn that has any Actual > 0 in
      // the year. Without this, we can't define the silent window.
      const curRow = await NSPB_DB.query(
        `SELECT MAX(CAST(REPLACE(Period, 'TP', '') AS INTEGER)) AS curN
         FROM "${tname}"
         WHERE Scenario='Actual' AND Tracker='${tracker}' AND Years='${yr}' AND value > 0`
      );
      const curN = Number(curRow[0]?.curN || 0);
      if (!curN) {
        addMsg("error", `No Actual ${tracker} data found in ${yr}. Cannot determine silent window.`);
        els.send.disabled = false;
        return;
      }
      const silentFrom = Math.max(1, curN - lastN + 1);
      const silentTo   = curN;
      const activeFrom = 1;
      const activeTo   = silentFrom - 1;
      const periodList = (from, to) => {
        const out = []; for (let i = from; i <= to; i++) out.push(`'TP${i}'`); return out.join(", ");
      };

      if (activeTo < activeFrom) {
        addMsg("error", `Silent window (TP${silentFrom}-TP${silentTo}) covers the whole year so far — no "active" period to compare against. Use a smaller \`last=\` value.`);
        els.send.disabled = false;
        return;
      }

      // Step 1+2 in a single SQL: find Items/Subs/...etc that
      //   active_total > 0  AND  silent_total = 0  AND  has any leftover
      //   Forecast/Budget loaded for ANY future period (current+1 .. TP12)
      const futureFrom = curN + 1;
      const futurePeriods = futureFrom <= 12 ? periodList(futureFrom, 12) : "''";  // empty list if current is TP12

      const targetClause = onlyTargets.map(t => `'${t}'`).join(", ");
      const sql = `
        WITH active AS (
          SELECT ${groupCols}, SUM(value) AS active_total
          FROM "${tname}"
          WHERE Scenario='Actual' AND Tracker='${tracker}' AND Years='${yr}'
            AND Period IN (${periodList(activeFrom, activeTo)})
          GROUP BY ${groupCols}
          HAVING SUM(value) > 0
        ),
        silent_check AS (
          SELECT ${groupCols}, COALESCE(SUM(value),0) AS silent_total
          FROM "${tname}"
          WHERE Scenario='Actual' AND Tracker='${tracker}' AND Years='${yr}'
            AND Period IN (${periodList(silentFrom, silentTo)})
          GROUP BY ${groupCols}
        ),
        leftover AS (
          SELECT ${groupCols}, Scenario, SUM(value) AS leftover_total
          FROM "${tname}"
          WHERE Scenario IN (${targetClause}) AND Tracker='${tracker}' AND Years='${yr}'
            AND Period IN (${futurePeriods})
            AND value > 0
          GROUP BY ${groupCols}, Scenario
        )
        SELECT a.${dimCols.join(", a.")},
               a.active_total,
               COALESCE(s.silent_total, 0) AS silent_total,
               COALESCE(SUM(CASE WHEN l.Scenario='Forecast' THEN l.leftover_total END), 0) AS leftover_forecast,
               COALESCE(SUM(CASE WHEN l.Scenario='Budget'   THEN l.leftover_total END), 0) AS leftover_budget
        FROM active a
        LEFT JOIN silent_check s USING (${groupCols})
        LEFT JOIN leftover     l USING (${groupCols})
        WHERE COALESCE(s.silent_total, 0) = 0
        GROUP BY ${dimCols.map(c => `a."${c}"`).join(", ")}, a.active_total, s.silent_total
        HAVING (leftover_forecast + leftover_budget) > 0
        ORDER BY (leftover_forecast + leftover_budget) DESC
      `;
      logDebug({ cmd: "lost_customers_sql", sql, curN, silentWindow: `TP${silentFrom}-TP${silentTo}`, futureWindow: `TP${futureFrom}-TP12` });
      const rows = await NSPB_DB.query(sql);
      logDebug({ cmd: "lost_customers_done", flagged: rows.length });
      progressBubble.innerHTML = "";
      if (!rows.length) {
        addMsg("assistant",
          `✓ **No lost customers** for ${tracker} ${yr}.\n\n` +
          `Detected current period: **TP${curN}**. Silent window = TP${silentFrom}-TP${silentTo}.\n` +
          `Every customer that went silent in those last ${lastN} months has $0 leftover Forecast/Budget for TP${futureFrom}-TP12. Good hygiene.`
        );
        els.send.disabled = false;
        return;
      }
      const totalForecast = rows.reduce((s, r) => s + Number(r.leftover_forecast || 0), 0);
      const totalBudget   = rows.reduce((s, r) => s + Number(r.leftover_budget   || 0), 0);
      const fmt$ = (n) => Number(n).toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
      const u = tracker === "Unit" ? " units" : "";
      // Write summary sheet NSPB_LostCustomers
      const summaryGrid = [];
      summaryGrid.push([`Lost customers — ${tracker} ${yr}`, "", "", "", "", "", ""]);
      summaryGrid.push([`Current period: TP${curN}  ·  Silent window: TP${silentFrom}-TP${silentTo}  ·  Leftover window: TP${futureFrom}-TP12`, "", "", "", "", "", ""]);
      summaryGrid.push(["", "", "", "", "", "", ""]);
      summaryGrid.push([`${rows.length} customers flagged · Leftover Forecast: ${fmt$(totalForecast)}${u} · Leftover Budget: ${fmt$(totalBudget)}${u}`, "", "", "", "", "", ""]);
      summaryGrid.push(["", "", "", "", "", "", ""]);
      summaryGrid.push([...dimCols, "Active total", "Leftover Forecast", "Leftover Budget"]);
      for (const r of rows.slice(0, 500)) {
        const dimVals = dimCols.map(d => r[d] || "");
        summaryGrid.push([...dimVals,
          Number(r.active_total || 0),
          Number(r.leftover_forecast || 0),
          Number(r.leftover_budget   || 0)
        ]);
      }
      try {
        await withFocusRetry(() => writeSmartViewGrid("NSPB_LostCustomers", summaryGrid), "writeLostCustomers");
      } catch (we) { logDebug({ cmd: "lost_customers_write_err", error: we.message || String(we) }); }
      addMsg("assistant",
        `👋 **${rows.length} lost customers** detected for ${tracker} ${yr}.\n\n` +
        `Auto-detected current period: **TP${curN}** · silent window: **TP${silentFrom}-TP${silentTo}** · leftover window: **TP${futureFrom}-TP12**.\n\n` +
        `**Money to clean up** for these customers (we still have it loaded but they're not coming back):\n` +
        `* Forecast: **${fmt$(totalForecast)}${u}**\n` +
        `* Budget: **${fmt$(totalBudget)}${u}**\n\n` +
        `Full list written to sheet \`NSPB_LostCustomers\` (sorted by total leftover, top 500 rows).`
      );
    } catch (e) {
      addMsg("error", `Lost-customer check failed: ${e.message || e}`);
    }
    els.send.disabled = false;
    return;
  }

  const tCheckMissBud = text.match(
    /^check\s+(?:(fy\d+)\s+)?actuals?\s+without\s+(budget|forecast)((?:\s+(?:tracker\s*=\s*\w+|years?\s*=\s*fy\d+|fy\d+|tp\d+\s*[-–]\s*(?:tp)?\d+))*)\s*$/i
  );
  if (tCheckMissBud) {
    const target = tCheckMissBud[2].toLowerCase() === "forecast" ? "Forecast" : "Budget";
    const opts = tCheckMissBud[3] || "";
    let tracker = "Load";
    let years = tCheckMissBud[1] ? tCheckMissBud[1].toUpperCase() : null;
    let fromN = 1, toN = 12;
    const trMatch = opts.match(/tracker\s*=\s*(\w+)/i);
    if (trMatch) tracker = trMatch[1];
    const yrMatch = opts.match(/(?:years?\s*=\s*)?(fy\d+)/i);
    if (yrMatch && !years) years = yrMatch[1].toUpperCase();
    const tpMatch = opts.match(/tp(\d+)\s*[-–]\s*(?:tp)?(\d+)/i);
    if (tpMatch) { fromN = parseInt(tpMatch[1], 10); toN = parseInt(tpMatch[2], 10); }
    const periods = [];
    for (let i = fromN; i <= toN; i++) periods.push(`TP${i}`);
    const periodList = periods.map(p => `'${p}'`).join(", ");

    typingBubble.classList.remove("typing");
    typingBubble.remove();
    // Color is hash-derived from the FULL command (target × tracker × year ×
    // periods) so different period ranges or different years paint different
    // colors. Re-running the exact same command paints the exact same color
    // (idempotent overlay). Palette of 12 distinct hues.
    const CHECK_PALETTE = [
      { hex: "#fca5a5", name: "🔴 red" },
      { hex: "#fdba74", name: "🟠 orange" },
      { hex: "#fef08a", name: "🟡 yellow" },
      { hex: "#bef264", name: "🟢 lime" },
      { hex: "#86efac", name: "🟢 green" },
      { hex: "#5eead4", name: "🔷 teal" },
      { hex: "#7dd3fc", name: "🔵 sky" },
      { hex: "#a5b4fc", name: "🟣 indigo" },
      { hex: "#c4b5fd", name: "🟣 violet" },
      { hex: "#f0abfc", name: "🟪 fuchsia" },
      { hex: "#f9a8d4", name: "💗 pink" },
      { hex: "#fda4af", name: "🌹 rose" },
    ];
    const hashStr = `${target}|${tracker}|${years || "ANY"}|TP${fromN}-TP${toN}`;
    let h = 0;
    for (let i = 0; i < hashStr.length; i++) h = ((h << 5) - h + hashStr.charCodeAt(i)) | 0;
    const paintColor = CHECK_PALETTE[Math.abs(h) % CHECK_PALETTE.length].hex;
    const colorLabel = CHECK_PALETTE[Math.abs(h) % CHECK_PALETTE.length].name;
    logDebug({ cmd: "check_color_picked", hashStr, paintColor, colorLabel });
    const yearLabel = years ? ` · Year ${years}` : "";
    const progressBubble = addMsg("assistant",
      `🔍 Running check: **Items with Actual (${tracker}) but no ${target}** in TP${fromN}–TP${toN}${yearLabel} — paints ${colorLabel}…`
    );
    // Detailed timeline log — shows up in `debug last` so we can see exactly
    // where each phase spent time. Entry per phase with elapsed ms from start.
    const t0 = Date.now();
    const phases = [];
    const phase = (label, extra) => {
      const ms = Date.now() - t0;
      phases.push({ phase: label, elapsedMs: ms, ...(extra || {}) });
      logDebug({ cmd: "check_phase", label, elapsedMs: ms, ...(extra || {}) });
    };
    const setProgress = (msg) => {
      try {
        progressBubble.innerHTML = '<span class="typing-dots"><span></span><span></span><span></span></span><span class="typing-label">' + msg + '</span>';
        if (els.messages) els.messages.scrollTop = els.messages.scrollHeight;
      } catch (_) {}
    };
    phase("start");
    setProgress("Querying DuckDB…");

    try {
      // Resolve table name: prefer one named "smartview" / "today", else most recent
      let tname = "smartview";
      try {
        const tables = await NSPB_DB.listTables();
        const names = tables.map(t => t.table_name);
        if (names.length === 0) {
          addMsg("error", "No tables loaded. Run `load smartview as today` first (while standing on NSPB_SmartView).");
          els.send.disabled = false;
          return;
        }
        const preferred = ["today", "smartview", "ventas", "revenue"].find(n => names.includes(n));
        tname = preferred || names[names.length - 1];
      } catch (_) {}

      // (SQL is built later, after pre-check determines validYears) — see below.
      // Pre-check: verify the target scenario has ANY data for this Tracker × (each Year).
      // If a (Tracker, Years) combo has zero Forecast/Budget rows in the table,
      // it means Forecast/Budget was never loaded for that combo by design
      // (e.g. Unit Forecast FY24 doesn't exist — you don't forecast past units).
      // Skip those combos from the "missing" check to avoid false positives.
      const yearsToCheck = years
        ? [years]
        : (await NSPB_DB.query(`SELECT DISTINCT Years FROM "${tname}" WHERE Years IS NOT NULL AND Years != ''`)).map(r => r.Years);
      const skippedCombos = [];
      const validYears = [];
      for (const yr of yearsToCheck) {
        const r = await NSPB_DB.query(
          `SELECT COUNT(*) AS n FROM "${tname}" WHERE Scenario='${target}' AND Tracker='${tracker}' AND Years='${yr}' AND value > 0 LIMIT 1`
        );
        const n = Number(r[0]?.n || 0);
        if (n === 0) skippedCombos.push(`${tracker} ${target} ${yr}`);
        else validYears.push(yr);
      }
      phase("precheck_done", { yearsRequested: yearsToCheck, validYears, skipped: skippedCombos });
      if (validYears.length === 0) {
        addMsg("error",
          `⚠ No ${target} data exists in this table for Tracker=${tracker} for any year (${yearsToCheck.join(", ")}). ` +
          `Nothing to check — either the data hasn't been loaded for that combo by design (e.g. you don't forecast past Units), or the table is missing those rows.`
        );
        els.send.disabled = false;
        return;
      }
      // Discover ALL row-dimension columns dynamically. Without this, the SQL
      // groups only by (Item, Subsidiary, Account) and misses Class/Department/
      // Location/etc. — which causes the SmartView paint loop to flag every
      // row that shares Item+Account+Period (massive over-paint, ~80x bloat).
      const colsRaw = await NSPB_DB.query(`PRAGMA table_info("${tname}")`);
      const NON_DIM = new Set(["Tracker", "Scenario", "Years", "Period", "value"]);
      const dimCols = colsRaw.map(c => c.name).filter(n => !NON_DIM.has(n));
      phase("dim_cols_discovered", { dimCols });
      const selectCols = dimCols.map(c => `"${c}"`).join(", ");
      const groupCols = selectCols;
      const joinClause = dimCols.map(c => `b."${c}"=a."${c}"`).join(" AND ") +
                         ` AND b.Years=a.Years AND b.Period=a.Period`;
      // Build final SQL using only validYears (combos confirmed to have target data).
      const yearsClause = ` AND a.Years IN (${validYears.map(y => `'${y}'`).join(", ")})`;
      const sqlFinal = `
        SELECT ${selectCols}, Years, Period, SUM(value) AS act_value
        FROM "${tname}" a
        WHERE Scenario='Actual' AND Tracker='${tracker}'
          AND Period IN (${periodList})
          AND value > 0
          ${yearsClause}
          AND NOT EXISTS (
            SELECT 1 FROM "${tname}" b
            WHERE b.Scenario='${target}' AND b.Tracker='${tracker}'
              AND ${joinClause}
              AND b.value > 0
          )
        GROUP BY ${groupCols}, Years, Period
        ORDER BY Years, Period
      `;
      logDebug({ cmd: "check_actuals_sql", sql: sqlFinal });
      phase("sql_start", { tracker, target, fromN, toN, validYears, skippedCombos, table: tname });
      const rows = await NSPB_DB.query(sqlFinal);
      phase("sql_done", { rows: rows.length });
      setProgress(`SQL done (${rows.length.toLocaleString()} missing cells). Aggregating…`);

      if (rows.length === 0) {
        addMsg("assistant",
          `✓ **No missing ${target} cells** in TP${fromN}–TP${toN} for ${tracker}.\n\n` +
          `Every Item × Subsidiary that has Actual ${tracker} also has ${target} loaded for those periods.`
        );
        els.send.disabled = false;
        return;
      }

      // ── Aggregations for holistic understanding ──
      // 1. By Item × Subsidiary (per-item detail)
      const grouped = new Map();
      // 2. By Account (which accounts need most budget loaded)
      const byAccount = new Map();
      // 3. By Subsidiary (which subsidiaries are most affected)
      const bySub = new Map();
      // 4. By Period (which months need attention first)
      const byPeriod = new Map();
      // 5. Grand total
      let grandTotal = 0;
      const accumulate = (m, key, val, period) => {
        if (!m.has(key)) m.set(key, { key, total: 0, count: 0, periods: new Set() });
        const e = m.get(key);
        e.total += val;
        e.count += 1;
        if (period) e.periods.add(period);
      };
      for (const r of rows) {
        const v = Number(r.act_value || 0);
        const itemKey = `${r.Item}|${r.Subsidiary || ""}`;
        if (!grouped.has(itemKey)) grouped.set(itemKey, { Item: r.Item, Subsidiary: r.Subsidiary, Account: r.Account, periods: [], totalActual: 0 });
        const g = grouped.get(itemKey);
        g.periods.push(r.Period);
        g.totalActual += v;
        accumulate(byAccount, r.Account || "(no account)", v, r.Period);
        accumulate(bySub, r.Subsidiary || "(no sub)", v, r.Period);
        accumulate(byPeriod, r.Period, v, null);
        grandTotal += v;
      }
      const groupedRows = [...grouped.values()].sort((a, b) => b.totalActual - a.totalActual);
      const sortByTotal = (m) => [...m.values()].sort((a, b) => b.total - a.total);
      const topAccounts = sortByTotal(byAccount).slice(0, 10);
      const topSubs = sortByTotal(bySub).slice(0, 5);
      const periodBreakdown = [...byPeriod.values()].sort((a, b) => {
        const na = parseInt(a.key.replace(/^TP/i, ""), 10) || 0;
        const nb = parseInt(b.key.replace(/^TP/i, ""), 10) || 0;
        return na - nb;
      });
      const fmt$ = (n) => Number(n).toLocaleString(undefined, { style: "currency", currency: "USD" });

      phase("aggregation_done", { combos: grouped.size, grandTotal });
      setProgress(`Reading NSPB_SmartView headers + dim region…`);
      let painted = 0;
      try {
        await withFocusRetry(() => Excel.run(async (ctx) => {
          phase("excel_run_start");
          const wb = ctx.workbook;
          const sheets = wb.worksheets;
          sheets.load("items/name");
          await ctx.sync();
          // Use the sheet that was loaded by `load smartview as ...` if known.
          // Fall back to active sheet, then to literal "NSPB_SmartView".
          let sv;
          const rememberedName = window.NSPB_LAST_SMARTVIEW_SHEET;
          if (rememberedName) {
            sv = sheets.items.find(s => s.name === rememberedName);
          }
          if (!sv) {
            sv = wb.worksheets.getActiveWorksheet();
            sv.load("name");
            await ctx.sync();
          }
          phase("paint_target_sheet", { name: sv.name, remembered: rememberedName || null });
          if (!sv) return;
          // Find row-dim header row
          const head = sv.getRangeByIndexes(0, 0, 30, 12);
          head.load("values");
          await ctx.sync();
          const headVals = head.values;
          // Find header row + index every dim col found in the row-header band.
          // dimCols (from DuckDB) is the source of truth for what to match on.
          const dimColLower = new Map(); // lowername → dimCol original-cased
          for (const d of dimCols) dimColLower.set(d.toLowerCase(), d);
          let headerRow = -1;
          const dimColIdx = {}; // original-cased name → col index in SmartView
          for (let r = 0; r < headVals.length; r++) {
            const found = {};
            for (let c = 0; c < headVals[r].length; c++) {
              const cell = String(headVals[r][c] || "").trim().toLowerCase();
              if (dimColLower.has(cell)) found[dimColLower.get(cell)] = c;
            }
            // pick the row that matches the most dim cols
            if (Object.keys(found).length > Object.keys(dimColIdx).length) {
              Object.assign(dimColIdx, found);
              headerRow = r;
            }
          }
          if (headerRow < 0 || !dimColIdx.Item) {
            phase("headers_not_found", { headerRow, dimColIdx });
            return;
          }
          // Row dims actually present in the SmartView pivot (Subsidiary may be
          // in POV → not a row column; we handle that below with empty-string).
          const presentDims = Object.keys(dimColIdx);
          const itemCol = dimColIdx.Item;
          phase("headers_found", { headerRow, presentDims, dimColIdx });
          const usedRange = sv.getUsedRange();
          usedRange.load(["rowCount", "columnCount"]);
          await ctx.sync();
          phase("usedrange_loaded", { totalRows: usedRange.rowCount, totalCols: usedRange.columnCount });
          const totalRows = usedRange.rowCount;
          const totalCols = usedRange.columnCount;
          const dimColCount = Math.max(...Object.values(dimColIdx)) + 1;
          // Read row dim region
          const dimRange = sv.getRangeByIndexes(headerRow + 1, 0, totalRows - headerRow - 1, dimColCount);
          dimRange.load("values");
          // Read col header region (4 rows: Tracker, Scenario, Years, Period)
          const colHeadRange = sv.getRangeByIndexes(headerRow - 4, dimColCount, 4, totalCols - dimColCount);
          colHeadRange.load("values");
          await ctx.sync();
          const dimVals = dimRange.values;
          const ch = colHeadRange.values;
          // Find columns matching (Tracker × Scenario=target × [Years filter] × Period IN range)
          const targetCols = [];
          for (let cRel = 0; cRel < (totalCols - dimColCount); cRel++) {
            const t = String(ch[0][cRel] || "").trim();
            const s = String(ch[1][cRel] || "").trim();
            const y = String(ch[2][cRel] || "").trim();
            const p = String(ch[3][cRel] || "").trim();
            if (t === tracker && s === target && periods.includes(p) && (!years || y === years)) {
              targetCols.push({ absCol: dimColCount + cRel, period: p, year: y });
            }
          }
          // Build flag set keyed by ALL row-dim cols + Period. For dims that are
          // in POV (not present as a SmartView row column), we use "" — and
          // emit BOTH variants (with the SQL value AND with "") so we match
          // either case.
          const flagSet = new Set();
          const buildKey = (rec, periodVal, dimsOverride) => {
            const parts = (dimsOverride || dimCols).map(d => String(rec[d] ?? "")).join("|");
            return parts + "||" + periodVal;
          };
          for (const r of rows) {
            // Variant 1: full key with all dim values
            flagSet.add(buildKey(r, r.Period));
            // Variant 2: dims that are NOT present as SmartView row cols
            // become "" — so SmartView row scanning (which only reads
            // presentDims) can match.
            const masked = { ...r };
            for (const d of dimCols) if (!presentDims.includes(d)) masked[d] = "";
            flagSet.add(buildKey(masked, r.Period));
          }
          phase("highlight_check_before_loop", { targetCols: targetCols.length, flagSetSize: flagSet.size, rowsScanned: dimVals.length, presentDims });
          setProgress(`Identifying cells to paint…`);
          // Phase 1: build per-target-col lists of row indices that need painting.
          // Pre-index missing cells by Item so the inner loop short-circuits
          // for rows that have no findings at all.
          const itemHasFindings = new Set();
          for (const r of rows) itemHasFindings.add(r.Item);
          const cellsByCol = new Map();   // absCol → array of absolute row indices
          for (let r = 0; r < dimVals.length; r++) {
            const item = String(dimVals[r][itemCol] || "").trim();
            if (!item || !itemHasFindings.has(item)) continue;   // fast path
            // Read the value of every present dim col into a record-like obj
            // and build the key the same way as the flagSet (using dimCols
            // order, with "" for dims not present in SmartView rows).
            const rec = {};
            for (const d of dimCols) {
              if (dimColIdx[d] !== undefined) {
                rec[d] = String(dimVals[r][dimColIdx[d]] || "").trim();
              } else {
                rec[d] = "";
              }
            }
            for (const tc of targetCols) {
              const key = buildKey(rec, tc.period);
              if (flagSet.has(key)) {
                if (!cellsByCol.has(tc.absCol)) cellsByCol.set(tc.absCol, []);
                cellsByCol.get(tc.absCol).push(headerRow + 1 + r);
                painted++;
              }
            }
          }
          phase("paint_indexing_done", { painted, colsToTouch: cellsByCol.size });
          // Phase 2: for each col, group contiguous row indices into ranges
          // and queue ONE paint op per group instead of one per cell.
          // Worst case still 1 op/cell, best case ~10x reduction.
          let rangeOps = 0;
          setProgress(`Grouping ${painted.toLocaleString()} cells into ranges…`);
          for (const [absCol, rowList] of cellsByCol) {
            rowList.sort((a, b) => a - b);
            let groupStart = rowList[0];
            let groupEnd = groupStart;
            for (let i = 1; i <= rowList.length; i++) {
              if (i < rowList.length && rowList[i] === groupEnd + 1) {
                groupEnd = rowList[i];
              } else {
                // flush the current group as a single range fill
                const groupSize = groupEnd - groupStart + 1;
                sv.getRangeByIndexes(groupStart, absCol, groupSize, 1).format.fill.color = paintColor;
                rangeOps++;
                if (i < rowList.length) {
                  groupStart = rowList[i];
                  groupEnd = groupStart;
                }
              }
            }
          }
          phase("paint_loop_done", { painted, rangeOps, reduction: painted > 0 ? Math.round((1 - rangeOps/painted) * 100) + "%" : "0%" });
          setProgress(`Flushing ${rangeOps.toLocaleString()} range ops (covering ${painted.toLocaleString()} cells)…`);
          await ctx.sync();
          phase("paint_flush_done", { painted, rangeOps });
        }), "highlight missing budget");
      } catch (hlErr) {
        logDebug({ cmd: "check_actuals_no_budget_hl_error", error: hlErr.message || String(hlErr) });
      }

      phase("highlight_done");
      // (Summary sheet creation removed — paint + chat-only output per user request.)
      if (false) {
      try {
        await withFocusRetry(() => Excel.run(async (ctx) => {
          phase("summary_excel_run_start");
          const wb = ctx.workbook;
          const sheets = wb.worksheets;
          sheets.load("items/name");
          await ctx.sync();
          const existing = sheets.items.find(s => s.name === "NSPB_MissingBudget");
          if (existing) existing.delete();
          const sh = sheets.add("NSPB_MissingBudget");
          await ctx.sync();
          let r = 0;
          // Title
          const title = sh.getRangeByIndexes(r, 0, 1, 5);
          title.values = [[`Missing ${target} (${tracker}) — TP${fromN} to TP${toN}`, "", "", "", ""]];
          title.format.font.bold = true;
          title.format.font.size = 22;
          title.format.font.color = "#0a0a0a";
          title.format.font.name = "Calibri Light";
          // (no-merge) title.merge(true);
          try {
            const bb = title.format.borders.getItem("EdgeBottom");
            bb.style = "Continuous"; bb.color = "#dc2626"; bb.weight = "Thick";
          } catch (_) {}
          r++;
          // Subtitle
          const subtitle = sh.getRangeByIndexes(r, 0, 1, 5);
          subtitle.values = [[`${grouped.size} Item × Subsidiary combos · ${rows.length} missing cells · ${new Date().toLocaleString()}`, "", "", "", ""]];
          subtitle.format.font.size = 10;
          subtitle.format.font.italic = true;
          subtitle.format.font.color = "#9ca3af";
          subtitle.format.font.name = "Calibri Light";
          // (no-merge) subtitle.merge();
          r += 2;

          // ── BIG TOTAL banner ──
          const totalBanner = sh.getRangeByIndexes(r, 0, 1, 5);
          totalBanner.values = [[`💰 Total ${tracker} Actual without ${target}: ${fmt$(grandTotal)}`, "", "", "", ""]];
          totalBanner.format.font.bold = true;
          totalBanner.format.font.size = 16;
          totalBanner.format.font.color = "#7f1d1d";
          totalBanner.format.fill.color = "#fee2e2";
          totalBanner.format.font.name = "Calibri";
          // (no-merge) totalBanner.merge();
          r += 2;

          const writeSection = (label, rows5col) => {
            const lbl = sh.getRangeByIndexes(r, 0, 1, 5);
            lbl.values = [[label, "", "", "", ""]];
            lbl.format.font.bold = true;
            lbl.format.font.size = 13;
            lbl.format.font.color = "#0a0a0a";
            lbl.format.fill.color = "#f3f4f6";
            lbl.format.font.name = "Calibri Light";
            // (no-merge) lbl.merge();
            try {
              const top = lbl.format.borders.getItem("EdgeTop");
              top.style = "Continuous"; top.color = "#0a0a0a"; top.weight = "Thin";
            } catch (_) {}
            r++;
            const hdr = sh.getRangeByIndexes(r, 0, 1, rows5col[0].length);
            hdr.values = [rows5col[0]];
            hdr.format.font.bold = true;
            hdr.format.fill.color = "#0f172a";
            hdr.format.font.color = "#ffffff";
            hdr.format.font.size = 11;
            hdr.format.font.name = "Calibri";
            hdr.format.rowHeight = 24;
            r++;
            const body = rows5col.slice(1);
            if (body.length) {
              const bRange = sh.getRangeByIndexes(r, 0, body.length, body[0].length);
              bRange.values = body;
              bRange.format.font.name = "Calibri Light";
              for (let i = 0; i < body.length; i++) {
                if (i % 2 === 1) {
                  sh.getRangeByIndexes(r + i, 0, 1, body[i].length).format.fill.color = "#fafafa";
                }
              }
              sh.getRangeByIndexes(r, 0, body.length, 1).format.font.bold = true;
              r += body.length;
            }
            r++;
          };

          // ── Section 1: TOP ACCOUNTS ──
          const acctTable = [
            ["Account", "Total Actual ($/units)", "Cells missing", "Months affected", ""],
            ...topAccounts.map(a => [
              a.key,
              a.total,
              a.count,
              [...a.periods].sort((x, y) => parseInt(x.replace(/^TP/i, ""), 10) - parseInt(y.replace(/^TP/i, ""), 10)).join(", "),
              ""
            ])
          ];
          writeSection("📊 TOP ACCOUNTS NEEDING BUDGET — start here", acctTable);
          // Currency format on col 1 of accounts
          const acctStartRow = r - topAccounts.length - 1;
          if (topAccounts.length) sh.getRangeByIndexes(acctStartRow, 1, topAccounts.length, 1).numberFormat = [[tracker === "Unit" ? "#,##0" : "$#,##0.00"]];

          // ── Section 2: TOP SUBSIDIARIES ──
          const subTable = [
            ["Subsidiary", "Total Actual", "Cells missing", "Months affected", ""],
            ...topSubs.map(s => [
              s.key,
              s.total,
              s.count,
              [...s.periods].sort().join(", "),
              ""
            ])
          ];
          writeSection("🏢 TOP SUBSIDIARIES AFFECTED", subTable);
          const subStartRow = r - topSubs.length - 1;
          if (topSubs.length) sh.getRangeByIndexes(subStartRow, 1, topSubs.length, 1).numberFormat = [[tracker === "Unit" ? "#,##0" : "$#,##0.00"]];

          // ── Section 3: PERIOD BREAKDOWN ──
          const perTable = [
            ["Period", "Total Actual missing budget", "# missing cells", "", ""],
            ...periodBreakdown.map(p => [p.key, p.total, p.count, "", ""])
          ];
          writeSection("📅 PERIOD BREAKDOWN — which months have most pending", perTable);
          const perStartRow = r - periodBreakdown.length - 1;
          if (periodBreakdown.length) sh.getRangeByIndexes(perStartRow, 1, periodBreakdown.length, 1).numberFormat = [[tracker === "Unit" ? "#,##0" : "$#,##0.00"]];

          // ── Section 4: TOP ITEMS DETAIL (full list, capped 500) ──
          const itemHdr = sh.getRangeByIndexes(r, 0, 1, 5);
          itemHdr.values = [["📋 ITEM × SUBSIDIARY DETAIL — full list", "", "", "", ""]];
          itemHdr.format.font.bold = true;
          itemHdr.format.font.size = 13;
          itemHdr.format.fill.color = "#f3f4f6";
          itemHdr.format.font.name = "Calibri Light";
          // (no-merge) itemHdr.merge();
          try {
            const top = itemHdr.format.borders.getItem("EdgeTop");
            top.style = "Continuous"; top.color = "#0a0a0a"; top.weight = "Thin";
          } catch (_) {}
          r++;
          const dHdr = sh.getRangeByIndexes(r, 0, 1, 5);
          dHdr.values = [["Subsidiary", "Item", "Account", "Total Actual", "Missing periods"]];
          dHdr.format.font.bold = true;
          dHdr.format.fill.color = "#0f172a";
          dHdr.format.font.color = "#ffffff";
          dHdr.format.font.size = 11;
          dHdr.format.rowHeight = 24;
          dHdr.format.font.name = "Calibri";
          r++;
          const detailBody = groupedRows.slice(0, 500).map(g => [
            g.Subsidiary || "",
            g.Item,
            g.Account || "",
            g.totalActual,
            g.periods.join(", ")
          ]);
          if (detailBody.length) {
            const bRange = sh.getRangeByIndexes(r, 0, detailBody.length, 5);
            bRange.values = detailBody;
            bRange.format.font.name = "Calibri Light";
            sh.getRangeByIndexes(r, 3, detailBody.length, 1).numberFormat = [[tracker === "Unit" ? "#,##0" : "$#,##0.00"]];
            for (let i = 0; i < detailBody.length; i++) {
              if (i % 2 === 1) sh.getRangeByIndexes(r + i, 0, 1, 5).format.fill.color = "#fafafa";
            }
            sh.getRangeByIndexes(r, 1, detailBody.length, 1).format.font.bold = true;
          }

          sh.getRange("A:E").format.autofitColumns();
          sh.activate();
          await ctx.sync();
          phase("summary_sheet_done");
        }), "write missing budget sheet");
      } catch (wErr) {
        logDebug({ cmd: "check_actuals_no_budget_write_error", error: wErr.message || String(wErr) });
      }
      } // end if(false) — sheet creation disabled
      phase("all_done", { painted, combos: grouped.size, grandTotal });

      // Compact, holistic chat summary
      const fmtNum = (n) => tracker === "Unit"
        ? Math.round(n).toLocaleString()
        : Number(n).toLocaleString(undefined, { style: "currency", currency: "USD" });
      let chatMsg = `**Missing ${target} (${tracker})** in TP${fromN}–TP${toN}`;
      if (validYears.length === 1) chatMsg += ` · ${validYears[0]}`;
      else if (validYears.length > 1) chatMsg += ` · ${validYears.join(" + ")}`;
      chatMsg += `\n\n`;
      if (skippedCombos.length) {
        chatMsg += `_Skipped (no ${target} data in this table by design): ${skippedCombos.join(", ")}_\n\n`;
      }
      chatMsg += `💰 **Total Actual without ${target}: ${fmtNum(grandTotal)}** across ${grouped.size} Item×Subsidiary combos · ${rows.length} cells\n\n`;
      chatMsg += `🎨 Painted ${painted} cells on the active SmartView pivot.\n\n`;
      if (topAccounts.length) {
        chatMsg += `📊 **Where to start — top accounts needing budget:**\n`;
        chatMsg += topAccounts.slice(0, 5).map((a, i) =>
          `${i+1}. \`${a.key}\` — ${fmtNum(a.total)} (${a.count} cells across ${[...a.periods].length} months)`
        ).join("\n") + "\n\n";
      }
      if (topSubs.length > 1) {
        chatMsg += `🏢 **By subsidiary:** `;
        chatMsg += topSubs.slice(0, 3).map(s => `${s.key} (${fmtNum(s.total)})`).join(" · ") + "\n\n";
      }
      if (periodBreakdown.length) {
        chatMsg += `📅 **By month:** `;
        chatMsg += periodBreakdown.map(p => `${p.key}: ${fmtNum(p.total)}`).join(" · ");
      }
      addMsg("assistant", chatMsg);
    } catch (e) {
      logDebug({ cmd: "check_actuals_no_budget_error", error: e.message || String(e) });
      addMsg("error", `Check failed: ${e.message || e}\n\n_Run \`debug last\` for the full trace._`);
    }
    els.send.disabled = false;
    return;
  }

  // ───── Load the ACTIVE SmartView sheet into DuckDB ─────
  // Parses POV + col headers + row dims + data of an NSPB_SmartView-shaped
  // sheet, flattens to long format (one record per cell), and loads as a
  // DuckDB table. After this, `ask:` and `sql:` work on the pivot data —
  // user can re-open Excel another day and re-load the saved pivot.
  const tLoadSv = text.match(/^load\s+(?:active\s+)?smartview(?:\s+as\s+(\w+))?\s*$/i);
  if (tLoadSv) {
    const tname = (tLoadSv[1] || "smartview").trim();
    typingBubble.classList.remove("typing");
    typingBubble.remove();
    const updateMsg = (m) => addMsg("assistant", m);
    updateMsg(`▶ Loading active sheet as DuckDB table \`${tname}\` (long format)…`);
    try {
      let loadedSheetName = null;
      const long = await Excel.run(async (ctx) => {
        const sh = ctx.workbook.worksheets.getActiveWorksheet();
        sh.load("name");
        const used = sh.getUsedRange();
        used.load(["values", "rowCount", "columnCount"]);
        await ctx.sync();
        loadedSheetName = sh.name;
        const v = used.values;
        if (!v || v.length < 6) throw new Error("Active sheet doesn't look like a SmartView pivot (too few rows).");
        // Locate row-dim header row: first row that has BOTH "Item" and at least one of (Location, Subsidiary, Account)
        let headerRow = -1;
        for (let r = 0; r < Math.min(20, v.length); r++) {
          const cells = v[r].map(c => String(c || "").trim().toLowerCase());
          const hasItem = cells.includes("item");
          const hasLoc  = cells.some(c => /^(location|subsidiary|account|department|relationship|reportingsegment|repseg)$/i.test(c));
          if (hasItem && hasLoc) { headerRow = r; break; }
        }
        if (headerRow < 0) throw new Error("Couldn't find SmartView row-dim header (looking for 'Item' + 'Location'/'Subsidiary'/etc).");
        // Row dim cols are 0..N-1 where row[headerRow] has names; trailing blanks = data area starts
        const rowDimNames = [];
        let dimColCount = 0;
        for (let c = 0; c < v[headerRow].length; c++) {
          const cell = String(v[headerRow][c] || "").trim();
          if (cell) { rowDimNames.push(cell); dimColCount = c + 1; }
          else if (rowDimNames.length) break;   // blank after dims = end
        }
        const totalCols = v[0].length;
        const dataColCount = totalCols - dimColCount;
        if (dataColCount <= 0) throw new Error("No data columns detected (row-dim header took the whole row).");
        // Col headers: 4 rows above the row-dim header (Tracker, Scenario, Years, Period)
        const colHeaderRows = 4;
        const colHeaderStart = headerRow - colHeaderRows;
        if (colHeaderStart < 0) throw new Error("Not enough header rows above the row-dim header for Tracker/Scenario/Years/Period.");
        const colMeta = [];
        for (let cRel = 0; cRel < dataColCount; cRel++) {
          const t = String(v[colHeaderStart][dimColCount + cRel] || "").trim();
          const s = String(v[colHeaderStart + 1][dimColCount + cRel] || "").trim();
          const y = String(v[colHeaderStart + 2][dimColCount + cRel] || "").trim();
          const p = String(v[colHeaderStart + 3][dimColCount + cRel] || "").trim();
          if (!t && !s && !y && !p) { colMeta.push(null); continue; } // separator
          colMeta.push({ Tracker: t, Scenario: s, Years: y, Period: p, absCol: dimColCount + cRel });
        }
        // POV rows above col headers: each row has one member in cell[dimColCount]
        const pov = {};
        for (let r = 0; r < colHeaderStart; r++) {
          const member = String(v[r][dimColCount] || "").trim();
          if (!member) continue;
          // Try to infer dim by member (POV_DIMS order in pivotToSmartView: Class, Subsidiary, Version, Currency)
          // Heuristic: position-based since the writer puts them in this order
          const POV_DIM_ORDER = ["Class", "Subsidiary", "Version", "Currency"];
          const idx = Object.keys(pov).length;
          if (idx < POV_DIM_ORDER.length) pov[POV_DIM_ORDER[idx]] = member;
        }
        // Now scan data rows: from headerRow+1 to end
        const long = [];
        for (let r = headerRow + 1; r < v.length; r++) {
          // Row dim values
          const rowDimValues = {};
          for (let c = 0; c < dimColCount; c++) {
            rowDimValues[rowDimNames[c]] = String(v[r][c] || "").trim();
          }
          if (!rowDimValues.Item && !rowDimValues.Location) continue;
          // Each data cell becomes a record
          for (const cm of colMeta) {
            if (!cm) continue;
            const raw = v[r][cm.absCol];
            if (raw == null || raw === "") continue;
            const num = typeof raw === "number" ? raw : Number(String(raw).replace(/,/g, ""));
            if (!Number.isFinite(num) || num === 0) continue;
            long.push({
              ...pov,
              ...rowDimValues,
              Tracker: cm.Tracker,
              Scenario: cm.Scenario,
              Years: cm.Years,
              Period: cm.Period,
              value: num
            });
          }
        }
        return long;
      });
      if (!long.length) throw new Error("Parsed 0 records — make sure you're on an NSPB_SmartView sheet with non-zero data.");
      const info = await NSPB_DB.load(tname, long);
      // Remember which sheet was loaded so check-commands can paint back to it.
      window.NSPB_LAST_SMARTVIEW_SHEET = loadedSheetName;
      logDebug({ cmd: "load_smartview", table: tname, records: info.rows, columns: info.columns, sheet: loadedSheetName });
      updateMsg(
        `✓ Loaded **${info.rows.toLocaleString()}** records into table \`${info.table}\`.\n\n` +
        `Columns: ${info.columns.map(c => `\`${c}\``).join(", ")}\n\n` +
        `Now you can ask:\n` +
        `* CHIP_PASTE: actuals without forecast → ask: which items have actuals through TP6 but no forecast in TP7-TP12\n` +
        `* CHIP_PASTE: top items by revenue → ask: top 10 items by total revenue actual\n` +
        `* CHIP_PASTE: missing budget → ask: items with actual revenue but zero budget\n` +
        `* CHIP_PASTE: count records → sql: SELECT COUNT(*) FROM ${tname}`
      );
    } catch (e) {
      logDebug({ cmd: "load_smartview_error", error: e.message || String(e) });
      addMsg("error", `Load SmartView failed: ${e.message || e}\n\n_Make sure you're standing on a sheet with a SmartView pivot (POV + Tracker/Scenario/Years/Period headers + row dims like Item/Location)._`);
    }
    els.send.disabled = false;
    return;
  }

  // ───── Combo command: load + pivot + reconcile in one shot ─────
  // Syntax:
  //   load and pivot sheet as <name>                       → load + pivot whole table
  //   load and pivot sheet as <name> where <SQL filter>    → load + pivot filtered slice
  // Useful for big exports — saves 3 steps.
  const tCombo = text.match(/^load\s+and\s+pivot\s+sheet\s+as\s+(\w+)(?:\s+where\s+([\s\S]+))?$/i);
  if (tCombo) {
    const tname = tCombo[1].trim();
    const whereClause = tCombo[2] ? tCombo[2].trim() : "";
    const sqlForPivot = whereClause
      ? `SELECT * FROM "${tname}" WHERE ${whereClause}`
      : `SELECT * FROM "${tname}"`;
    typingBubble.classList.remove("typing");
    typingBubble.remove();

    // Heads-up banner with patience note
    addMsg("assistant",
      `🚀 **Starting full pipeline** — please be patient.\n\n` +
      `**Estimated time:**\n` +
      `* Step 1 (load 147k rows into DuckDB): ~30 seconds\n` +
      `* Step 2 (pivot ${whereClause ? "filtered slice" : "**ALL accounts × ALL dims**"} → SmartView + Reconcile): ` +
      `${whereClause ? "~5–15 seconds" : "~1–3 minutes (~18k row keys × ~96 col combos = ~1.7M cells to write)"}\n\n` +
      `⏳ **Waiting for response… do not close the task pane or switch sheets while it runs.**\n\n` +
      `_Tip: keep an eye on Excel — if it shows "Working…" in the title bar, it's busy writing the pivot._`
    );

    // Step 1: load
    const t0 = Date.now();
    addMsg("assistant", `▶ **Step 1/2** — loading active sheet as \`${tname}\` … _(this may take ~30s for large exports — please wait)_`);
    els.input.value = `load sheet as ${tname}`;
    await onSend();
    addMsg("assistant", `✓ Step 1 done in ${Math.round((Date.now() - t0) / 1000)}s.`);

    // Step 2: smartview pivot (with reconcile auto-written)
    const t1 = Date.now();
    addMsg("assistant",
      `▶ **Step 2/2** — pivoting ${whereClause ? `filtered slice (\`${whereClause}\`)` : `**whole table** (all accounts, all dims)`} → SmartView + Reconcile sheets … ` +
      `_(this is the slow step — please wait, do not interrupt)_`
    );
    els.input.value = `smartview: ${sqlForPivot}`;
    await onSend();
    addMsg("assistant", `✓ **Step 2 done in ${Math.round((Date.now() - t1) / 1000)}s. Total pipeline: ${Math.round((Date.now() - t0) / 1000)}s.** Open \`NSPB_SmartView\` and \`NSPB_Reconcile\` to inspect.`);
    return;
  }

  // ───── DuckDB commands (local, never call Gemini) ─────
  // `load sheet as <name>`  → loads active Excel sheet as a table
  // `tables`                → lists loaded tables
  // `drop table <name>`     → drops a table
  // `sql: <query>`          → runs raw SQL, shows top 50 rows
  try {
    const tLoad = text.match(/^load\s+(?:active\s+)?sheet\s+as\s+(.+)$/i);
    const tList = /^tables\s*$/i.test(text);
    const tDrop = text.match(/^drop\s+table\s+(.+)$/i);
    const tSql  = text.match(/^sql\s*:\s*([\s\S]+)$/i);

    if (tLoad) {
      const tname = tLoad[1].trim();
      const { rows, headerInfo } = await Excel.run(async (ctx) => {
        const sh = ctx.workbook.worksheets.getActiveWorksheet();
        const range = sh.getUsedRange();
        range.load(["values", "rowCount", "columnCount"]);
        await ctx.sync();
        const v = range.values;
        if (!v || v.length < 2) throw new Error("Active sheet needs a header row + at least one data row");

        // Detect 2-row header: row 1 has at least one blank that row 2 fills.
        const r1 = v[0].map(x => String(x ?? "").trim());
        const r2 = (v[1] || []).map(x => String(x ?? "").trim());
        const twoRowHeader = r1.some((h, i) => !h && r2[i]) && r2.length > 0;

        // Combine row1+row2 ONLY when row 1 is blank OR is a continuation
        // (same value as previous column → multi-column dimension like Period
        // spanning 12 month columns). Otherwise row 2 is just a position label
        // (TP1, TP2…) and should be ignored.
        // Build headers from row1 + row2.
        //   Rule: a column "starts a multi-column dim" when its row 1 is set
        //   AND the next column's row 1 is blank. In that case, combine
        //   row1+row2. Continuation columns (row 1 blank) inherit lastNamed
        //   and append their row 2 sub-label. Single-col dims use row 1 only.
        const headers = [];
        let lastNamed = "";
        for (let c = 0; c < r1.length; c++) {
          const h1 = r1[c];
          const next = c + 1 < r1.length ? r1[c + 1] : "";
          const h2 = twoRowHeader ? (r2[c] || "") : "";
          const startsMultiCol = h1 && !next;

          if (h1 && !startsMultiCol) {
            lastNamed = h1;
            headers.push(h1);
          } else if (h1 && startsMultiCol) {
            lastNamed = h1;
            headers.push(h2 ? `${h1}_${h2}` : h1);
          } else if (lastNamed && twoRowHeader) {
            headers.push(h2 ? `${lastNamed}_${h2}` : `${lastNamed}_${c}`);
          } else {
            headers.push(h2 || `col${c}`);
          }
        }

        const dataStart = twoRowHeader ? 2 : 1;
        const out = [];
        for (let i = dataStart; i < v.length; i++) {
          const r = {};
          for (let c = 0; c < headers.length; c++) r[headers[c]] = v[i][c];
          out.push(r);
        }

        // Auto-cast numeric: for each column where ≥80% of non-empty values
        // parse as numbers, convert all values (empty → null, non-numeric → null).
        for (const h of headers) {
          let nFilled = 0, nNumeric = 0;
          for (const r of out) {
            const v = r[h];
            if (v === "" || v == null) continue;
            nFilled++;
            const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, ""));
            if (Number.isFinite(n)) nNumeric++;
          }
          if (nFilled > 0 && nNumeric / nFilled >= 0.8) {
            for (const r of out) {
              const v = r[h];
              if (v === "" || v == null) { r[h] = null; continue; }
              const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, ""));
              r[h] = Number.isFinite(n) ? n : null;
            }
          }
        }

        return { rows: out, headerInfo: { twoRowHeader, headers } };
      });
      const info = await NSPB_DB.load(tname, rows);
      info.twoRowHeader = headerInfo.twoRowHeader;
      logDebug({ cmd: "load", table: tname, rows: info.rows, columns: info.columns, twoRowHeader: info.twoRowHeader });
      typingBubble.classList.remove("typing");
      renderBubble(typingBubble,
        `Loaded **${info.rows}** rows into table \`${info.table}\`` +
        (info.twoRowHeader ? " (detected 2-row header — months merged as `Period_TPn`)" : "") + `.\n\n` +
        `Columns: ${info.columns.map(c => `\`${c}\``).join(", ")}\n\n` +
        `Try:\n` +
        `* CHIP_PASTE: tables → tables\n` +
        `* CHIP_PASTE: sample → sql: SELECT * FROM ${info.table} LIMIT 5\n` +
        `* CHIP_PASTE: by subsidiary → sql: SELECT Subsidiary, COUNT(*) AS rows FROM ${info.table} GROUP BY Subsidiary ORDER BY rows DESC\n` +
        `* CHIP_PASTE: total Jan → sql: SELECT Subsidiary, SUM(Period_TP1) AS jan FROM ${info.table} GROUP BY Subsidiary\n` +
        `* CHIP_PASTE: yearly total → sql: SELECT Subsidiary, SUM(Period_TP1+Period_TP2+Period_TP3+Period_TP4+Period_TP5+Period_TP6+Period_TP7+Period_TP8+Period_TP9+Period_TP10+Period_TP11+Period_TP12) AS year FROM ${info.table} GROUP BY Subsidiary`
      );
      history.push({ role: "assistant", content: `[loaded ${info.rows} rows into ${info.table}]` });
      els.send.disabled = false;
      return;
    }

    if (tList) {
      const summary = await NSPB_DB.schemaSummary();
      typingBubble.classList.remove("typing");
      renderBubble(typingBubble, summary
        ? "**Tables loaded:**\n```\n" + summary + "\n```"
        : "No tables loaded yet. Try `load sheet as <name>`.");
      els.send.disabled = false;
      return;
    }

    if (tDrop) {
      await NSPB_DB.dropTable(tDrop[1].trim());
      typingBubble.classList.remove("typing");
      renderBubble(typingBubble, `Dropped table \`${tDrop[1].trim()}\`.`);
      els.send.disabled = false;
      return;
    }

    // Audit: run a battery of canned SQL checks against a loaded table,
    // write a colored NSPB_Audit sheet, optionally narrate via Gemini (1 call).
    const tAudit = text.match(/^audit\s+(.+?)(?:\s+(no-?ai|sin-?ai))?$/i);
    if (tAudit) {
      // "audit revenue" / "audit ventas" / "audit <table>" — all map to the
      // same flow. Try the literal table name first; if not loaded, fall back
      // to the most recently loaded DuckDB table.
      let tname = tAudit[1].trim();
      const skipAi = !!tAudit[2];
      // Resolve table: if user typed "revenue" but only "ventas" is loaded
      // (or vice-versa), fall back to the most recently loaded table. If
      // NO tables are loaded, abort with a clear message.
      try {
        const tablesList = await NSPB_DB.listTables();
        const tableNames = tablesList.map(t => t.table_name);
        if (tableNames.length === 0) {
          typingBubble.classList.remove("typing");
          renderBubble(typingBubble,
            `⚠ No tables loaded in DuckDB. Run \`load and pivot sheet as ventas\` first ` +
            `(or \`load sheet as ventas\` if the data is already in SmartView shape).\n\n` +
            `_Note: DuckDB lives in browser memory — closing/reloading the task pane wipes it._`
          );
          els.send.disabled = false;
          return;
        }
        if (!tableNames.includes(tname)) {
          const fallback = tableNames[tableNames.length - 1];
          logDebug({ cmd: "audit_table_resolve", typed: tname, resolved: fallback, available: tableNames });
          tname = fallback;
        }
      } catch (e) {
        logDebug({ cmd: "audit_listtables_error", error: e.message || String(e) });
      }
      const checks = [
        {
          id: "lost_customer_with_budget",
          title: "👋 Lost customer with Budget",
          desc: "Item × Subsidiary with Actuals in earlier months, ZERO in last 3 months, but Budget loaded next period — 'doesn\'t make sense to budget a lost customer'.",
          severity: "high",
          sql: `
WITH a AS (
  SELECT Item, Subsidiary,
    SUM(COALESCE(Period_TP1,0)+COALESCE(Period_TP2,0)+COALESCE(Period_TP3,0)+COALESCE(Period_TP4,0)
       +COALESCE(Period_TP5,0)+COALESCE(Period_TP6,0)+COALESCE(Period_TP7,0)+COALESCE(Period_TP8,0)+COALESCE(Period_TP9,0)) AS h1_q3,
    SUM(COALESCE(Period_TP10,0)+COALESCE(Period_TP11,0)+COALESCE(Period_TP12,0)) AS last3
  FROM "${tname}" WHERE Scenario='Actual' AND Tracker='Load' GROUP BY Item, Subsidiary
),
b AS (
  SELECT Item, Subsidiary,
    SUM(COALESCE(Period_TP1,0)+COALESCE(Period_TP2,0)+COALESCE(Period_TP3,0)+COALESCE(Period_TP4,0)
       +COALESCE(Period_TP5,0)+COALESCE(Period_TP6,0)+COALESCE(Period_TP7,0)+COALESCE(Period_TP8,0)
       +COALESCE(Period_TP9,0)+COALESCE(Period_TP10,0)+COALESCE(Period_TP11,0)+COALESCE(Period_TP12,0)) AS budget_yr
  FROM "${tname}" WHERE Scenario='Budget' AND Tracker='Load' GROUP BY Item, Subsidiary
)
SELECT a.Subsidiary, a.Item,
       a.h1_q3 AS actual_jan_to_sep,
       a.last3 AS actual_oct_to_dec,
       COALESCE(b.budget_yr,0) AS budget_next_period
FROM a INNER JOIN b ON a.Item=b.Item AND a.Subsidiary=b.Subsidiary
WHERE a.h1_q3 > 1000      -- had real activity earlier
  AND a.last3 = 0          -- went silent last 3 months
  AND b.budget_yr > 0      -- but still has budget loaded
ORDER BY b.budget_yr DESC LIMIT 200`
        },
        {
          id: "budget_missing",
          title: "🚫 Budget missing",
          desc: "Items with Actual revenue but no Budget loaded — likely missed in planning cycle.",
          severity: "high",
          sql: `
WITH a AS (
  SELECT Item, Subsidiary,
    SUM(COALESCE(Period_TP1,0)+COALESCE(Period_TP2,0)+COALESCE(Period_TP3,0)+COALESCE(Period_TP4,0)
       +COALESCE(Period_TP5,0)+COALESCE(Period_TP6,0)+COALESCE(Period_TP7,0)+COALESCE(Period_TP8,0)
       +COALESCE(Period_TP9,0)+COALESCE(Period_TP10,0)+COALESCE(Period_TP11,0)+COALESCE(Period_TP12,0)) AS yr
  FROM "${tname}"
  WHERE Scenario='Actual' AND Tracker='Load'
  GROUP BY Item, Subsidiary
),
b AS (
  SELECT Item, Subsidiary,
    SUM(COALESCE(Period_TP1,0)+COALESCE(Period_TP2,0)+COALESCE(Period_TP3,0)+COALESCE(Period_TP4,0)
       +COALESCE(Period_TP5,0)+COALESCE(Period_TP6,0)+COALESCE(Period_TP7,0)+COALESCE(Period_TP8,0)
       +COALESCE(Period_TP9,0)+COALESCE(Period_TP10,0)+COALESCE(Period_TP11,0)+COALESCE(Period_TP12,0)) AS yr
  FROM "${tname}"
  WHERE Scenario='Budget' AND Tracker='Load'
  GROUP BY Item, Subsidiary
)
SELECT a.Subsidiary, a.Item, a.yr AS actual_year, COALESCE(b.yr,0) AS budget_year
FROM a LEFT JOIN b ON a.Item=b.Item AND a.Subsidiary=b.Subsidiary
WHERE a.yr > 0 AND COALESCE(b.yr,0) = 0
ORDER BY a.yr DESC LIMIT 200`
        },
        {
          id: "budget_gap",
          title: "📉 Budget vs Actual gap > 50%",
          desc: "Items where Budget deviates from Actual by more than 50% — review accuracy.",
          severity: "medium",
          sql: `
WITH a AS (
  SELECT Item, Subsidiary,
    SUM(COALESCE(Period_TP1,0)+COALESCE(Period_TP2,0)+COALESCE(Period_TP3,0)+COALESCE(Period_TP4,0)
       +COALESCE(Period_TP5,0)+COALESCE(Period_TP6,0)+COALESCE(Period_TP7,0)+COALESCE(Period_TP8,0)
       +COALESCE(Period_TP9,0)+COALESCE(Period_TP10,0)+COALESCE(Period_TP11,0)+COALESCE(Period_TP12,0)) AS yr
  FROM "${tname}" WHERE Scenario='Actual' AND Tracker='Load' GROUP BY Item, Subsidiary
),
b AS (
  SELECT Item, Subsidiary,
    SUM(COALESCE(Period_TP1,0)+COALESCE(Period_TP2,0)+COALESCE(Period_TP3,0)+COALESCE(Period_TP4,0)
       +COALESCE(Period_TP5,0)+COALESCE(Period_TP6,0)+COALESCE(Period_TP7,0)+COALESCE(Period_TP8,0)
       +COALESCE(Period_TP9,0)+COALESCE(Period_TP10,0)+COALESCE(Period_TP11,0)+COALESCE(Period_TP12,0)) AS yr
  FROM "${tname}" WHERE Scenario='Budget' AND Tracker='Load' GROUP BY Item, Subsidiary
)
SELECT a.Subsidiary, a.Item, a.yr AS actual_year, b.yr AS budget_year,
  (b.yr - a.yr) AS variance,
  CASE WHEN a.yr=0 THEN NULL ELSE (b.yr - a.yr) / a.yr END AS variance_pct
FROM a INNER JOIN b ON a.Item=b.Item AND a.Subsidiary=b.Subsidiary
WHERE a.yr > 1000 AND ABS(b.yr - a.yr) / NULLIF(a.yr,0) > 0.5
ORDER BY ABS(b.yr - a.yr) DESC LIMIT 200`
        },
        {
          id: "volume_anomaly",
          title: "📦 Unit volume anomaly > 30%",
          desc: "Items where Budget units differ from Actual units by more than 30%.",
          severity: "medium",
          sql: `
WITH a AS (
  SELECT Item, Subsidiary,
    SUM(COALESCE(Period_TP1,0)+COALESCE(Period_TP2,0)+COALESCE(Period_TP3,0)+COALESCE(Period_TP4,0)
       +COALESCE(Period_TP5,0)+COALESCE(Period_TP6,0)+COALESCE(Period_TP7,0)+COALESCE(Period_TP8,0)
       +COALESCE(Period_TP9,0)+COALESCE(Period_TP10,0)+COALESCE(Period_TP11,0)+COALESCE(Period_TP12,0)) AS units
  FROM "${tname}" WHERE Scenario='Actual' AND Tracker='Unit' GROUP BY Item, Subsidiary
),
b AS (
  SELECT Item, Subsidiary,
    SUM(COALESCE(Period_TP1,0)+COALESCE(Period_TP2,0)+COALESCE(Period_TP3,0)+COALESCE(Period_TP4,0)
       +COALESCE(Period_TP5,0)+COALESCE(Period_TP6,0)+COALESCE(Period_TP7,0)+COALESCE(Period_TP8,0)
       +COALESCE(Period_TP9,0)+COALESCE(Period_TP10,0)+COALESCE(Period_TP11,0)+COALESCE(Period_TP12,0)) AS units
  FROM "${tname}" WHERE Scenario='Budget' AND Tracker='Unit' GROUP BY Item, Subsidiary
)
SELECT a.Subsidiary, a.Item, a.units AS actual_units, b.units AS budget_units,
  (b.units - a.units) AS unit_gap,
  CASE WHEN a.units=0 THEN NULL ELSE (b.units - a.units) / a.units END AS gap_pct
FROM a INNER JOIN b ON a.Item=b.Item AND a.Subsidiary=b.Subsidiary
WHERE a.units > 10 AND ABS(b.units - a.units) / NULLIF(a.units,0) > 0.3
ORDER BY ABS(b.units - a.units) DESC LIMIT 200`
        },
        {
          id: "stalled_items",
          title: "⏱️ Stalled items (no recent months)",
          desc: "Items with Actuals in earlier months but zero in TP10–TP12 — possible missed load or discontinued.",
          severity: "medium",
          sql: `
SELECT Subsidiary, Item, Account,
  COALESCE(Period_TP1,0)+COALESCE(Period_TP2,0)+COALESCE(Period_TP3,0)+COALESCE(Period_TP4,0)
 +COALESCE(Period_TP5,0)+COALESCE(Period_TP6,0) AS h1_total,
  COALESCE(Period_TP7,0)+COALESCE(Period_TP8,0)+COALESCE(Period_TP9,0) AS q3_total,
  COALESCE(Period_TP10,0)+COALESCE(Period_TP11,0)+COALESCE(Period_TP12,0) AS q4_total
FROM "${tname}"
WHERE Scenario='Actual' AND Tracker='Load'
  AND (COALESCE(Period_TP1,0)+COALESCE(Period_TP2,0)+COALESCE(Period_TP3,0)+COALESCE(Period_TP4,0)
      +COALESCE(Period_TP5,0)+COALESCE(Period_TP6,0)) > 0
  AND COALESCE(Period_TP10,0)=0 AND COALESCE(Period_TP11,0)=0 AND COALESCE(Period_TP12,0)=0
ORDER BY h1_total DESC LIMIT 200`
        },
        {
          id: "price_drift",
          title: "💰 Price drift month-over-month > 20%",
          desc: "Items where $/unit (Load/Unit ratio) changes by more than 20% between consecutive months.",
          severity: "low",
          sql: `
WITH joined AS (
  SELECT l.Item, l.Subsidiary,
    l.Period_TP1 AS l1, u.Period_TP1 AS u1, l.Period_TP6 AS l6, u.Period_TP6 AS u6,
    l.Period_TP12 AS l12, u.Period_TP12 AS u12
  FROM (SELECT * FROM "${tname}" WHERE Scenario='Actual' AND Tracker='Load') l
  INNER JOIN (SELECT * FROM "${tname}" WHERE Scenario='Actual' AND Tracker='Unit') u
    ON l.Item=u.Item AND l.Subsidiary=u.Subsidiary AND l.Account=u.Account
)
SELECT Subsidiary, Item,
  CASE WHEN u1>0 THEN l1/u1 END AS price_jan,
  CASE WHEN u6>0 THEN l6/u6 END AS price_jun,
  CASE WHEN u12>0 THEN l12/u12 END AS price_dec
FROM joined
WHERE u1>0 AND u12>0
  AND ABS(l12/u12 - l1/u1) / NULLIF(l1/u1,0) > 0.2
ORDER BY ABS(l12/u12 - l1/u1) / NULLIF(l1/u1,0) DESC LIMIT 200`
        }
      ];

      // Run all checks with progress feedback
      const auditT0 = Date.now();
      const updateBubble = (msg) => {
        try {
          typingBubble.innerHTML = '<span class="typing-dots"><span></span><span></span><span></span></span><span class="typing-label">' + msg + '</span>';
        } catch (_) {}
      };
      updateBubble(`Running ${checks.length} checks…`);
      const findings = [];
      for (let i = 0; i < checks.length; i++) {
        const c = checks[i];
        updateBubble(`Check ${i+1}/${checks.length}: ${c.title}…`);
        try {
          const rows = await NSPB_DB.query(c.sql);
          findings.push({ ...c, rows, error: null });
        } catch (e) {
          findings.push({ ...c, rows: [], error: e.message || String(e) });
        }
      }
      updateBubble(`Writing audit sheet…`);
      logDebug({
        cmd: "audit",
        table: tname,
        skipAi,
        checkSummary: findings.map(f => ({ id: f.id, count: f.rows.length, error: f.error }))
      });

      // Write NSPB_Audit sheet
      await Excel.run(async (ctx) => {
        const wb = ctx.workbook;
        const sheets = wb.worksheets;
        sheets.load("items/name");
        await ctx.sync();
        const existing = sheets.items.find(s => s.name === "NSPB_Audit");
        if (existing) existing.delete();
        const sh = sheets.add("NSPB_Audit");
        sh.activate();

        let row = 0;
        // Title — modern: large, no fill, accent line below
        const title = sh.getRangeByIndexes(row, 0, 1, 6);
        title.values = [[`💰  Revenue Audit`, "", "", "", "", ""]];
        title.format.font.bold = true;
        title.format.font.size = 22;
        title.format.font.color = "#0a0a0a";
        title.format.font.name = "Calibri Light";
        // (no-merge) title.merge();
        try {
          const bottom = title.format.borders.getItem("EdgeBottom");
          bottom.style = "Continuous"; bottom.color = "#1e3a8a"; bottom.weight = "Thick";
        } catch (_) {}
        row += 1;
        // Subtitle (date + table) in light gray italic
        const subtitle = sh.getRangeByIndexes(row, 0, 1, 6);
        subtitle.values = [[`${new Date().toLocaleString()}  ·  table "${tname}"`, "", "", "", "", ""]];
        subtitle.format.font.size = 10;
        subtitle.format.font.italic = true;
        subtitle.format.font.color = "#9ca3af";
        subtitle.format.font.name = "Calibri Light";
        // (no-merge) subtitle.merge();
        row += 2;

        // Summary line
        const sumRange = sh.getRangeByIndexes(row, 0, 1, 6);
        const totalIssues = findings.reduce((s, f) => s + f.rows.length, 0);
        sumRange.values = [[`${findings.length} checks run · ${totalIssues} total findings · scope: per-Item × Subsidiary`, "", "", "", "", ""]];
        sumRange.format.font.italic = true;
        sumRange.format.font.color = "#666666";
        // (no-merge) sumRange.merge();
        row += 2;

        const sevColor = { high: "#fca5a5", medium: "#fcd34d", low: "#bfdbfe" };
        const sevText = { high: "HIGH", medium: "MED", low: "LOW" };

        for (const f of findings) {
          // Section header — clean, with severity pill on right
          const hdr = sh.getRangeByIndexes(row, 0, 1, 6);
          hdr.values = [[f.title, "", "", "", "", `${f.rows.length} findings`]];
          hdr.format.font.bold = true;
          hdr.format.font.size = 14;
          hdr.format.font.color = "#0a0a0a";
          hdr.format.font.name = "Calibri Light";
          hdr.format.fill.color = "#f3f4f6"; // gray-100, neutral
          try {
            const top = hdr.format.borders.getItem("EdgeTop");
            top.style = "Continuous"; top.color = "#0a0a0a"; top.weight = "Thin";
          } catch (_) {}
          // Severity pill on the rightmost cell
          const sevCell = sh.getRangeByIndexes(row, 5, 1, 1);
          sevCell.format.fill.color = sevColor[f.severity] || "#e5e7eb";
          sevCell.format.font.bold = true;
          sevCell.format.font.size = 10;
          row++;
          // Description — italic gray
          const desc = sh.getRangeByIndexes(row, 0, 1, 6);
          desc.values = [[f.desc, "", "", "", "", ""]];
          desc.format.font.italic = true;
          desc.format.font.color = "#6b7280";
          desc.format.font.size = 10.5;
          desc.format.font.name = "Calibri Light";
          // (no-merge) desc.merge();
          row++;
          if (f.error) {
            const err = sh.getRangeByIndexes(row, 0, 1, 6);
            err.values = [[`⚠ check failed: ${f.error}`, "", "", "", "", ""]];
            err.format.font.color = "#dc2626";
            // (no-merge) err.merge();
            row += 2;
            continue;
          }
          if (f.rows.length === 0) {
            const ok = sh.getRangeByIndexes(row, 0, 1, 6);
            ok.values = [["✓ No issues found.", "", "", "", "", ""]];
            ok.format.font.color = "#16a34a";
            // (no-merge) ok.merge();
            row += 2;
            continue;
          }
          // Table headers + data
          const cols = Object.keys(f.rows[0]);
          const colHdr = sh.getRangeByIndexes(row, 0, 1, cols.length);
          colHdr.values = [cols];
          colHdr.format.font.bold = true;
          colHdr.format.fill.color = "#f3f4f6";
          colHdr.format.borders.getItem("EdgeBottom").style = "Continuous";
          row++;
          const data = f.rows.map(r => cols.map(c => {
            const v = r[c];
            if (v == null) return "";
            return typeof v === "number" ? v : String(v);
          }));
          const dataRange = sh.getRangeByIndexes(row, 0, data.length, cols.length);
          dataRange.values = data;
          // Number format for $ columns
          cols.forEach((c, i) => {
            if (/year|actual|budget|variance|price/i.test(c) && !/pct/i.test(c)) {
              const col = sh.getRangeByIndexes(row, i, data.length, 1);
              col.numberFormat = [["$#,##0.00"]];
            } else if (/units|gap/i.test(c) && !/pct/i.test(c)) {
              const col = sh.getRangeByIndexes(row, i, data.length, 1);
              col.numberFormat = [["#,##0"]];
            } else if (/pct/i.test(c)) {
              const col = sh.getRangeByIndexes(row, i, data.length, 1);
              col.numberFormat = [["0.0%"]];
            }
          });
          row += data.length + 2;
        }

        sh.getRange("A:F").format.autofitColumns();
        await ctx.sync();
      });

      // Optional: 1 Gemini call to narrate top findings
      let aiSummary = "";
      if (!skipAi && window.NSPB_SETTINGS.geminiKey) {
        try {
          // Convert BigInt → Number so JSON.stringify works (DuckDB COUNT returns BigInt).
          const safe = (v) => {
            if (typeof v === "bigint") return Number(v);
            if (Array.isArray(v)) return v.map(safe);
            if (v && typeof v === "object") {
              const o = {}; for (const k in v) o[k] = safe(v[k]); return o;
            }
            return v;
          };
          const compact = findings.map(f => ({
            check: f.title,
            severity: f.severity,
            count: f.rows.length,
            top5: safe(f.rows.slice(0, 5))
          }));
          const r = await fetch(API + "/api/narrate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prompt: `You are a senior NSPB financial analyst. Write a concise executive summary of these audit findings in English, 5-7 bullets, prioritized by severity and count. Mention the specific Items / Subsidiaries that are most critical and the dollar amounts. No greetings, no signoff — just the bullets. Data:\n${JSON.stringify(compact, null, 2)}`,
              geminiKey: window.NSPB_SETTINGS.geminiKey
            })
          });
          const j = await r.json();
          aiSummary = j.ok ? j.text : `(AI summary skipped: ${j.error})`;
        } catch (e) {
          aiSummary = `(AI summary failed: ${e.message})`;
        }
      }

      // Write the executive summary INTO the NSPB_Audit sheet (top section).
      if (aiSummary) {
        await Excel.run(async (ctx) => {
          const sh = ctx.workbook.worksheets.getItem("NSPB_Audit");
          // Insert 3 + lines rows after the title (row 1) so summary lands above checks.
          const lines = aiSummary.split(/\r?\n/);
          const blockHeight = lines.length + 3;
          // Insert blank rows below the title (row 2).
          const insertRange = sh.getRangeByIndexes(2, 0, blockHeight, 1);
          insertRange.getEntireRow().insert("Down");
          // Header
          const hdr = sh.getRangeByIndexes(2, 0, 1, 6);
          hdr.values = [["📋 Executive Summary (AI-generated)", "", "", "", "", ""]];
          hdr.format.font.bold = true;
          hdr.format.font.size = 12;
          hdr.format.fill.color = "#1e3a8a";
          hdr.format.font.color = "#ffffff";
          // (no-merge) hdr.merge();
          // Body
          for (let i = 0; i < lines.length; i++) {
            const r = sh.getRangeByIndexes(3 + i, 0, 1, 6);
            r.values = [[lines[i], "", "", "", "", ""]];
            r.format.font.color = "#0a0a0a";
            r.format.fill.color = "#eff6ff";
            // (no-merge) r.merge();
          }
          // Trailing blank
          const blank = sh.getRangeByIndexes(3 + lines.length, 0, 1, 6);
          blank.format.fill.color = "#ffffff";
          await ctx.sync();
        });
      }

      updateBubble(`Highlighting SmartView…`);

      // ── Highlight problem cells in NSPB_SmartView ──
      // Each check gets a DISTINCT color so the consultant can read the
      // SmartView at a glance and know exactly which check flagged each row.
      // If a row matches multiple checks, the first-listed (highest priority
      // in the checks array order = most actionable) wins; the chat message
      // tells the user the row matched N checks.
      let highlightSummary = "";
      try {
        // Two-tone palette per check: light tint for the row dim region
        // (filter-by-color UX), darker saturated tint for the SPECIFIC data
        // cells where the problem lives — so they really pop within the row.
        const checkColors = {
          lost_customer_with_budget: { fill: "#fed7aa", cellFill: "#fb923c", font: "#7c2d12", emoji: "👋" }, // orange 200/400
          budget_missing:            { fill: "#fecaca", cellFill: "#f87171", font: "#7f1d1d", emoji: "🚫" }, // red 200/400
          budget_gap:                { fill: "#fde68a", cellFill: "#fbbf24", font: "#78350f", emoji: "📉" }, // amber 200/400
          volume_anomaly:            { fill: "#e9d5ff", cellFill: "#c084fc", font: "#581c87", emoji: "📦" }, // purple 200/400
          stalled_items:             { fill: "#a5f3fc", cellFill: "#22d3ee", font: "#155e75", emoji: "⏱️" }, // cyan 200/400
          price_drift:               { fill: "#bfdbfe", cellFill: "#60a5fa", font: "#1e3a8a", emoji: "💰" }, // blue 200/400
        };
        // Build TWO maps so highlight matches whether Subsidiary is in
        // row-dims OR in POV (when constant across the slice):
        //   flagMapByItemSub: "Item|Subsidiary" → flags
        //   flagMapByItem:    "Item"            → flags
        const flagMapByItemSub = new Map();
        const flagMapByItem = new Map();
        for (const f of findings) {
          for (const row of f.rows.slice(0, 200)) {
            if (!row.Item) continue;
            const item = String(row.Item).trim();
            const sub = String(row.Subsidiary || "").trim();
            const flag = { check: f.id, severity: f.severity, title: f.title };
            const k1 = item + "|" + sub;
            if (!flagMapByItemSub.has(k1)) flagMapByItemSub.set(k1, []);
            flagMapByItemSub.get(k1).push(flag);
            if (!flagMapByItem.has(item)) flagMapByItem.set(item, []);
            flagMapByItem.get(item).push(flag);
          }
        }
        const flagMap = flagMapByItemSub; // legacy alias
        if (flagMap.size > 0) {
          let painted = 0;
          await withFocusRetry(() => Excel.run(async (ctx) => {
            const wb = ctx.workbook;
            const sheets = wb.worksheets;
            sheets.load("items/name");
            await ctx.sync();
            const sv = sheets.items.find(s => s.name === "NSPB_SmartView");
            if (!sv) return;
            // Find the row-dim header row by looking for the row whose first cells
            // include "Subsidiary" or "Item". Read first 30 rows × first ~10 cols.
            const head = sv.getRangeByIndexes(0, 0, 30, 10);
            head.load("values");
            await ctx.sync();
            const headVals = head.values;
            let headerRow = -1, itemCol = -1, subCol = -1;
            for (let r = 0; r < headVals.length; r++) {
              for (let c = 0; c < headVals[r].length; c++) {
                const cell = String(headVals[r][c] || "").trim().toLowerCase();
                if (cell === "item") { headerRow = r; itemCol = c; }
                if (cell === "subsidiary") { subCol = c; }
              }
              if (headerRow >= 0 && itemCol >= 0) break;
            }
            if (headerRow < 0 || itemCol < 0) return;
            // Read full size + the row-dim region + the col-header rows (4 rows above headerRow:
            // Tracker, Scenario, Years, Period — written by pivotToSmartView).
            const usedRange = sv.getUsedRange();
            usedRange.load(["rowCount", "columnCount"]);
            await ctx.sync();
            const totalRows = usedRange.rowCount;
            const totalCols = usedRange.columnCount;
            const dimColCount = Math.max(itemCol, subCol) + 1;
            // ROW dim values
            const dimRange = sv.getRangeByIndexes(headerRow + 1, 0, totalRows - headerRow - 1, dimColCount);
            dimRange.load("values");
            // COL header values (4 rows × data cols)
            const dataColStart = dimColCount;
            const dataColCount = Math.max(0, totalCols - dataColStart);
            let colHeaderVals = [];
            if (dataColCount > 0 && headerRow >= 4) {
              const colHeadRange = sv.getRangeByIndexes(headerRow - 4, dataColStart, 4, dataColCount);
              colHeadRange.load("values");
              await ctx.sync();
              colHeaderVals = colHeadRange.values; // 4 rows × dataColCount
            } else {
              await ctx.sync();
            }
            const dimVals = dimRange.values;
            // Build per-col metadata: {tracker, scenario, years, period, absCol}
            const colMeta = [];
            for (let cRel = 0; cRel < dataColCount; cRel++) {
              const t = colHeaderVals[0] ? String(colHeaderVals[0][cRel] || "").trim() : "";
              const s = colHeaderVals[1] ? String(colHeaderVals[1][cRel] || "").trim() : "";
              const y = colHeaderVals[2] ? String(colHeaderVals[2][cRel] || "").trim() : "";
              const p = colHeaderVals[3] ? String(colHeaderVals[3][cRel] || "").trim() : "";
              if (!t && !s && !y && !p) { colMeta.push(null); continue; }
              colMeta.push({ tracker: t, scenario: s, years: y, period: p, absCol: dataColStart + cRel });
            }
            // For each data row, check if Item|Sub matches a flagged key.
            // Paint TWO things:
            //   1) Row-dim cells (cols 0..dimColCount-1) — for filtering by color
            //   2) Specific data cells per check rule (the cells where the
            //      problem actually lives — Budget cells, Unit cells, etc.)
            const cellRules = {
              lost_customer_with_budget: (cm) => cm.scenario === "Budget",
              budget_missing:            (cm) => cm.scenario === "Budget",
              budget_gap:                (cm) => cm.scenario === "Budget",
              volume_anomaly:            (cm) => cm.tracker === "Unit",
              stalled_items:             (cm) => /^TP(10|11|12)$/i.test(cm.period),
              price_drift:               (cm) => cm.tracker === "Load",
            };
            const paintedByCheck = new Map();
            for (let r = 0; r < dimVals.length; r++) {
              const item = String(dimVals[r][itemCol] || "").trim();
              const sub  = subCol >= 0 ? String(dimVals[r][subCol] || "").trim() : "";
              if (!item) continue;
              const flags = (sub && flagMapByItemSub.get(item + "|" + sub))
                         || flagMapByItem.get(item);
              if (!flags || !flags.length) continue;
              const primary = flags[0];
              const colorDef = checkColors[primary.check] || { fill: "#fee2e2", font: "#000" };
              const targetRow = headerRow + 1 + r;
              // 1) Row-dim region tint (for filter-by-color UX)
              const dimTgt = sv.getRangeByIndexes(targetRow, 0, 1, dimColCount);
              dimTgt.format.fill.color = colorDef.fill;
              dimTgt.format.font.color = colorDef.font;
              dimTgt.format.font.bold = true;
              // 2) Specific data cells per check rule — darker saturated fill
              //    so the actual problem cells stand out inside the row.
              const rule = cellRules[primary.check];
              if (rule && colMeta.length) {
                for (const cm of colMeta) {
                  if (!cm) continue;
                  if (!rule(cm)) continue;
                  const cell = sv.getRangeByIndexes(targetRow, cm.absCol, 1, 1);
                  cell.format.fill.color = colorDef.cellFill || colorDef.fill;
                  cell.format.font.bold = true;
                }
              }
              painted++;
              paintedByCheck.set(primary.check, (paintedByCheck.get(primary.check) || 0) + 1);
            }
            await ctx.sync();
            // Build summary line per check for the chat
            const breakdown = [...paintedByCheck.entries()]
              .map(([id, count]) => `${(checkColors[id]||{}).emoji||""} ${id} — ${count}`)
              .join(" · ");
            highlightSummary = `\n\n🎨 Highlighted **${painted} rows** in \`NSPB_SmartView\`:\n${breakdown}`;
          }), "highlight smartview");
        }
      } catch (hlErr) {
        logDebug({ cmd: "audit_highlight_error", error: hlErr.message || String(hlErr) });
        highlightSummary = `\n\n_(SmartView highlight skipped: ${hlErr.message || hlErr})_`;
      }

      typingBubble.classList.remove("typing");
      const totalIssues = findings.reduce((s, f) => s + f.rows.length, 0);
      const breakdown = findings.map(f => `* **${f.title}** — ${f.rows.length} ${f.severity === "high" ? "🔴" : f.severity === "medium" ? "🟡" : "🔵"}`).join("\n");
      renderBubble(typingBubble,
        `**Revenue Audit complete** — ${totalIssues} findings across ${findings.length} checks. Sheet \`NSPB_Audit\` written.\n\n` +
        breakdown +
        highlightSummary +
        (aiSummary ? `\n\n**Executive summary:**\n${aiSummary}` : "")
      );
      history.push({ role: "assistant", content: `[audit ${tname}: ${totalIssues} findings]` });
      els.send.disabled = false;
      return;
    }

    // Natural language → SQL. Browser sends only the schema (~few hundred tokens),
    // never the rows. Gemini returns SQL + format hint, DuckDB executes locally.
    const tAsk = text.match(/^ask\s*:\s*([\s\S]+)$/i);
    if (tAsk) {
      const question = tAsk[1].trim();
      const schema = await NSPB_DB.schemaSummary();
      if (!schema) {
        typingBubble.classList.remove("typing");
        renderBubble(typingBubble, "No tables loaded. First run `load sheet as <name>`.");
        els.send.disabled = false;
        return;
      }
      const r = await fetch(API + "/api/sql-query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, schema, geminiKey: window.NSPB_SETTINGS.geminiKey })
      });
      const j = await r.json();
      if (!j.ok) {
        logDebug({ cmd: "ask", question, schema: schema.slice(0, 500), apiError: j.error });
        typingBubble.classList.remove("typing");
        renderBubble(typingBubble, "NL→SQL failed: " + j.error + "\n\n_(Run `debug last` to copy full trace.)_");
        els.send.disabled = false;
        return;
      }
      let result;
      try {
        result = await NSPB_DB.query(j.sql);
        logDebug({ cmd: "ask", question, sql: j.sql, format: j.format, explanation: j.explanation, rowCount: result.length, sample: result.slice(0, 3) });
      } catch (sqlErr) {
        logDebug({ cmd: "ask", question, sql: j.sql, sqlError: sqlErr.message || String(sqlErr) });
        throw sqlErr;
      }
      typingBubble.classList.remove("typing");
      const fmt = (v) => {
        if (v == null || v === "") return "";
        if (typeof v !== "number") return String(v);
        if (j.format === "currency") return "$" + v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        if (j.format === "units")    return Math.round(v).toLocaleString();
        if (j.format === "percent")  return (v * 100).toFixed(2) + "%";
        return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
      };
      let body = `${j.explanation}\n\n` +
                 `<details><summary>SQL</summary>\n\n\`\`\`sql\n${j.sql}\n\`\`\`\n\n</details>\n\n`;
      if (result.length === 0) {
        body += "_No rows._";
      } else {
        const cols = Object.keys(result[0]);
        const rows = result.slice(0, 50);
        body += "| " + cols.join(" | ") + " |\n"
              + "| " + cols.map(() => "---").join(" | ") + " |\n"
              + rows.map(r => "| " + cols.map(c => fmt(r[c])).join(" | ") + " |").join("\n");
        if (result.length > 50) body += `\n\n_showing 50 of ${result.length} rows_`;
      }
      renderBubble(typingBubble, body);
      history.push({ role: "assistant", content: `[ask: ${question}]` });
      els.send.disabled = false;
      return;
    }

    // Shortcut: `smartview <table>` or `print as smartview <table>` →
    // pivots whole table to SmartView (no SQL).
    const tSvShort = text.match(/^(?:print\s+as\s+)?smartview\s+([A-Za-z_][\w]*)\s*$/i);
    if (tSvShort) {
      const tname = tSvShort[1].trim();
      els.input.value = `smartview: SELECT * FROM "${tname}"`;
      // Re-trigger onSend with the rewritten query.
      typingBubble.classList.remove("typing");
      typingBubble.remove();
      els.send.disabled = false;
      onSend();
      return;
    }

    const tSv = text.match(/^smartview\s*:\s*([\s\S]+)$/i);
    if (tSv) {
      const sql = tSv[1].trim();
      const updateSvBubble = (msg) => {
        try {
          typingBubble.innerHTML = '<span class="typing-dots"><span></span><span></span><span></span></span><span class="typing-label">' + msg + '</span>';
        } catch (_) {}
      };
      updateSvBubble("Running SQL on DuckDB…");
      const result = await NSPB_DB.query(sql);
      if (result.length === 0) {
        typingBubble.classList.remove("typing");
        renderBubble(typingBubble, "Query returned 0 rows — nothing to pivot.");
        els.send.disabled = false;
        return;
      }
      updateSvBubble(`Unpivoting ${result.length.toLocaleString()} rows × 12 months…`);

      // Unpivot Period_TP* columns into long format: one record per (row × month).
      const cols = Object.keys(result[0]);
      const periodCols = cols.filter(c => /^Period_TP\d+$/i.test(c));
      if (periodCols.length === 0) {
        typingBubble.classList.remove("typing");
        renderBubble(typingBubble, "SmartView pivot needs `Period_TP*` columns in the SELECT (the 12 months). Add them to your query.");
        els.send.disabled = false;
        return;
      }
      // Skip aggregate/total columns so they don't bloat the pivot or confuse
      // the dim space. These are derived values, not dimensions.
      const isAggregateCol = (c) => /^(FYTotal|YearTotal|Total|GrandTotal|Annual)$/i.test(c);
      const dimCols = cols.filter(c => !periodCols.includes(c) && !isAggregateCol(c));
      const skippedCols = cols.filter(isAggregateCol);
      if (skippedCols.length) {
        logDebug({ cmd: "smartview_skipped_aggregates", skipped: skippedCols });
      }
      const long = [];
      for (const r of result) {
        for (const pc of periodCols) {
          const v = r[pc];
          if (v == null || v === "") continue;
          const rec = {};
          for (const d of dimCols) rec[d] = r[d];
          rec.Period = pc.replace(/^Period_/i, "");   // → TP1..TP12
          rec.value = typeof v === "number" ? v : Number(v) || 0;
          long.push(rec);
        }
      }

      // Build shape.dimIdx so pivotToSmartView can find dims case-insensitively.
      const allDims = new Set(dimCols);
      allDims.add("Period");
      const dimIdx = {};
      [...allDims].forEach((d, i) => { dimIdx[d.toLowerCase()] = i; });

      const grid = pivotToSmartView(long, { dimIdx });
      await withFocusRetry(() => writeSmartViewGrid("NSPB_SmartView", grid), "writeSmartViewGrid");

      // ── Reconciliation sheet: side-by-side source vs pivoted, printable.
      // Helps consultant prove to client that nothing was lost in the pivot.
      const sourceRowKeys = new Set();
      const rowDimNames = ["Location", "Relationship", "Account", "Department", "ReportingSegment", "Item"]
        .filter(d => dimCols.includes(d));
      for (const r of result) sourceRowKeys.add(rowDimNames.map(d => String(r[d] ?? "")).join("\x1f"));
      const pivotRowKeys = new Set();
      for (const r of long) pivotRowKeys.add(rowDimNames.map(d => String(r[d] ?? "")).join("\x1f"));
      const lost = [...sourceRowKeys].filter(k => !pivotRowKeys.has(k));

      // Compute reconcile data outside Excel.run so we can sync incrementally.
      const sourceCells = result.reduce((s, r) => {
        let n = 0;
        for (const pc of periodCols) if (r[pc] != null && r[pc] !== "") n++;
        return s + n;
      }, 0);
      const colComboCount = new Set(long.map(r => `${r.Tracker}|${r.Scenario}|${r.Years}|${r.Period}`)).size;
      const ok = "OK", bad = "FAIL";
      const reconcileRows = [
        ["Total source rows (raw)", String(result.length), "n/a", ok],
        ["Unique row keys", String(sourceRowKeys.size), String(pivotRowKeys.size),
          sourceRowKeys.size === pivotRowKeys.size ? ok : bad],
        ["Lost row keys (source minus pivot)", "—", String(lost.length), lost.length === 0 ? ok : bad],
        ["Non-null monthly cells", String(sourceCells), String(long.length),
          sourceCells === long.length ? ok : bad],
        ["Col combos (Tracker × Scenario × Years × Period)", "—", String(colComboCount), ok]
      ];

      try { await withFocusRetry(() => Excel.run(async (ctx) => {
        const wb = ctx.workbook;
        const sheets = wb.worksheets;
        sheets.load("items/name");
        await ctx.sync();
        const existing = sheets.items.find(s => s.name === "NSPB_Reconcile");
        if (existing) existing.delete();
        const sh = sheets.add("NSPB_Reconcile");
        await ctx.sync();

        // Title row 1 — modern: large, no fill, accent line
        const title = sh.getRangeByIndexes(0, 0, 1, 4);
        title.values = [["📋  Pivot Reconciliation", "", "", ""]];
        title.format.font.bold = true;
        title.format.font.size = 22;
        title.format.font.color = "#0a0a0a";
        title.format.font.name = "Calibri Light";
        // (no-merge) title.merge(true);
        try {
          const bottom = title.format.borders.getItem("EdgeBottom");
          bottom.style = "Continuous"; bottom.color = "#1e3a8a"; bottom.weight = "Thick";
        } catch (_) {}
        await ctx.sync();

        // Subtitle (timestamp) row 2
        const subtitle = sh.getRangeByIndexes(1, 0, 1, 4);
        subtitle.values = [[new Date().toLocaleString(), "", "", ""]];
        subtitle.format.font.size = 10;
        subtitle.format.font.italic = true;
        subtitle.format.font.color = "#9ca3af";
        subtitle.format.font.name = "Calibri Light";
        // (no-merge) subtitle.merge();
        await ctx.sync();

        // Query row 3 — italic gray, smaller
        const sqlRange = sh.getRangeByIndexes(2, 0, 1, 4);
        sqlRange.values = [["Query:", sql, "", ""]];
        sqlRange.format.font.italic = true;
        sqlRange.format.font.size = 10;
        sqlRange.format.font.color = "#6b7280";
        sqlRange.format.font.name = "Calibri Light";
        await ctx.sync();

        // Headers row 5 — slate-900 with white
        const hRange = sh.getRangeByIndexes(4, 0, 1, 4);
        hRange.values = [["Metric", "Source", "SmartView", "Match"]];
        hRange.format.font.bold = true;
        hRange.format.fill.color = "#0f172a";
        hRange.format.font.color = "#ffffff";
        hRange.format.font.size = 11;
        hRange.format.rowHeight = 26;
        hRange.format.font.name = "Calibri";
        await ctx.sync();

        // Data rows 6+
        const dRange = sh.getRangeByIndexes(5, 0, reconcileRows.length, 4);
        dRange.values = reconcileRows;
        await ctx.sync();

        // Color match column
        for (let i = 0; i < reconcileRows.length; i++) {
          const cell = sh.getRangeByIndexes(5 + i, 3, 1, 1);
          cell.format.fill.color = reconcileRows[i][3] === ok ? "#dcfce7" : "#fee2e2";
          cell.format.font.bold = true;
        }
        await ctx.sync();

        const summaryRow = 5 + reconcileRows.length + 1;
        if (lost.length > 0) {
          const note = sh.getRangeByIndexes(summaryRow, 0, 1, 4);
          note.values = [[`${lost.length} row keys missing from pivot — listed below:`, "", "", ""]];
          note.format.font.bold = true;
          note.format.font.color = "#dc2626";
          await ctx.sync();

          const lostHdr = sh.getRangeByIndexes(summaryRow + 1, 0, 1, rowDimNames.length);
          lostHdr.values = [rowDimNames];
          lostHdr.format.font.bold = true;
          lostHdr.format.fill.color = "#fee2e2";
          const lostData = lost.slice(0, 500).map(k => k.split("\x1f"));
          if (lostData.length > 0) {
            const lRange = sh.getRangeByIndexes(summaryRow + 2, 0, lostData.length, rowDimNames.length);
            lRange.values = lostData;
          }
        } else {
          const okMsg = sh.getRangeByIndexes(summaryRow, 0, 1, 4);
          okMsg.values = [["Perfect reconciliation — all source row keys made it to the SmartView pivot.", "", "", ""]];
          okMsg.format.font.bold = true;
          okMsg.format.font.color = "#16a34a";
        }

        // ─── Final BIG result banner (always at the bottom) ───
        const bannerRow = summaryRow + (lost.length > 0 ? Math.min(lost.length, 500) + 3 : 2);
        const bigStatus = sh.getRangeByIndexes(bannerRow, 0, 1, 4);
        bigStatus.values = [["FINAL RESULT", "", "", ""]];
        bigStatus.format.font.bold = true;
        bigStatus.format.font.size = 14;
        bigStatus.format.fill.color = "#0a0a0a";
        bigStatus.format.font.color = "#ffffff";

        const lineSrc = sh.getRangeByIndexes(bannerRow + 1, 0, 1, 4);
        lineSrc.values = [[`Source sheet rows`, String(result.length), "rows", ""]];
        lineSrc.format.font.size = 12;

        const lineSv = sh.getRangeByIndexes(bannerRow + 2, 0, 1, 4);
        lineSv.values = [[`SmartView pivoted row keys`, String(pivotRowKeys.size), "rows", ""]];
        lineSv.format.font.size = 12;

        const lineSt = sh.getRangeByIndexes(bannerRow + 3, 0, 1, 4);
        const allOk = sourceRowKeys.size === pivotRowKeys.size && lost.length === 0 && sourceCells === long.length;
        lineSt.values = [["Status", allOk ? "✓ Successfully created — full data preserved" : "⚠ See diff above", "", ""]];
        lineSt.format.font.bold = true;
        lineSt.format.font.size = 13;
        lineSt.format.fill.color = allOk ? "#dcfce7" : "#fef3c7";
        lineSt.format.font.color = allOk ? "#16a34a" : "#b45309";

        await ctx.sync();
      })); } catch (reconcileErr) {
        logDebug({ cmd: "smartview_reconcile_error", error: reconcileErr.message || String(reconcileErr), stack: (reconcileErr.stack || "").split("\n").slice(0, 5).join("\n") });
      }

      typingBubble.classList.remove("typing");
      // Count actual unique row keys + col combos in the long-format records
      // so the message is clear about what was pivoted (not just unpivot count).
      const rowDimsForCount = dimCols.filter(d => /^(Location|Relationship|Account|Department|ReportingSegment|Item)$/i.test(d));
      const colDimsForCount = dimCols.filter(d => /^(Tracker|Scenario|Years)$/i.test(d)).concat(["Period"]);
      const rowKeySet = new Set();
      const colKeySet = new Set();
      for (const r of long) {
        rowKeySet.add(rowDimsForCount.map(d => String(r[d] ?? "")).join("\x1f"));
        colKeySet.add(colDimsForCount.map(d => String(r[d] ?? "")).join("\x1f"));
      }
      logDebug({
        cmd: "smartview",
        sourceRows: result.length,
        unpivotedRecords: long.length,
        uniqueRowKeys: rowKeySet.size,
        uniqueColCombos: colKeySet.size,
        nonNullCells: long.length
      });
      renderBubble(typingBubble,
        `Pivoted ${result.length} source rows → **${rowKeySet.size} row keys** × **${colKeySet.size} col combos** → SmartView sheet \`NSPB_SmartView\`.\n\n` +
        `_Non-null cells: ${long.length}. (Cells with null/empty months are suppressed, like native SmartView.)_`
      );
      history.push({ role: "assistant", content: `[smartview pivot: ${result.length} rows]` });
      els.send.disabled = false;
      return;
    }

    if (tSql) {
      const sql = tSql[1].trim();
      let result;
      try {
        result = await NSPB_DB.query(sql);
        logDebug({ cmd: "sql", sql, rowCount: result.length, sample: result.slice(0, 3) });
      } catch (sqlErr) {
        logDebug({ cmd: "sql", sql, error: sqlErr.message || String(sqlErr) });
        throw sqlErr;
      }
      typingBubble.classList.remove("typing");
      if (result.length === 0) {
        renderBubble(typingBubble, "Query ran. No rows returned.");
      } else {
        const cols = Object.keys(result[0]);
        const rows = result.slice(0, 50);
        const md = "| " + cols.join(" | ") + " |\n"
                 + "| " + cols.map(() => "---").join(" | ") + " |\n"
                 + rows.map(r => "| " + cols.map(c => String(r[c] ?? "")).join(" | ") + " |").join("\n");
        const more = result.length > 50 ? `\n\n_showing 50 of ${result.length} rows_` : "";
        renderBubble(typingBubble, md + more);
      }
      els.send.disabled = false;
      return;
    }
  } catch (e) {
    logDebug({ cmd: "db_error", input: text, error: e.message || String(e), stack: (e.stack || "").split("\n").slice(0, 5).join("\n") });
    typingBubble.classList.remove("typing");
    renderBubble(typingBubble, "DB error: " + (e.message || e) + "\n\n_(Run `debug last` to copy full trace.)_");
    els.send.disabled = false;
    return;
  }

  // Environment dashboard intercept: routes through show_inventory({kind:'environment'})
  // via the standard chat endpoint, but we hint Gemini explicitly. (We let Gemini handle
  // it because we need fan-out fetches that the worker already does in the show_inventory branch.)
  // NOTE: no client-side bypass needed — the worker pre-fetches jobs/integrations.

  // ── run rule <name> — fuzzy match against KB rules; if no exact match,
  // suggest the closest by Levenshtein distance (typo-tolerant). Intercepts
  // BEFORE Gemini so we don't spend tokens on a rule the user mistyped.
  try {
    const rrM = text.match(/^run\s+rule\s+(.+?)\s*$/i);
    if (rrM) {
      const wanted = rrM[1].trim();
      const tkb = await loadJson(TENANT_KB_KEY);
      const rules = (tkb && Array.isArray(tkb.rules)) ? tkb.rules.filter(r => r.name) : [];
      if (!rules.length) {
        // No KB cached — let Gemini handle it (existing flow)
      } else {
        const lc = wanted.toLowerCase();
        const exact = rules.find(r => r.name.toLowerCase() === lc);
        if (!exact) {
          // (a) substring matches, (b) Levenshtein
          const partial = rules.filter(r => r.name.toLowerCase().includes(lc));
          let candidates = partial.slice();
          if (candidates.length < 5) {
            const lev = (a, b) => {
              if (a === b) return 0;
              if (!a) return b.length;
              if (!b) return a.length;
              const m = a.length, n = b.length;
              let prev = new Array(n + 1), curr = new Array(n + 1);
              for (let j = 0; j <= n; j++) prev[j] = j;
              for (let i = 1; i <= m; i++) {
                curr[0] = i;
                const ai = a.charCodeAt(i - 1);
                for (let j = 1; j <= n; j++) {
                  const cost = ai === b.charCodeAt(j - 1) ? 0 : 1;
                  curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
                }
                [prev, curr] = [curr, prev];
              }
              return prev[n];
            };
            const target = lc;
            const scored = rules
              .filter(r => !partial.includes(r))
              .map(r => ({ r, d: lev(target, r.name.toLowerCase()) }))
              .filter(x => x.d <= Math.min(6, Math.ceil(Math.max(target.length, x.r.name.length) * 0.35)))
              .sort((a, b) => a.d - b.d);
            for (const s of scored) {
              if (candidates.length >= 6) break;
              candidates.push(s.r);
            }
          }
          typingBubble.classList.remove("typing");
          typingBubble.remove();
          addMsg("user", rawText);
          if (!candidates.length) {
            addMsg("assistant", `Rule **${wanted}** not found. Run \`/help show me the rules\` to see the inventory, or try \`/rule\` for the live picker.`);
            els.send.disabled = false;
            return;
          }
          let reply = `No exact rule named **${wanted}**. Did you mean:\n\n`;
          for (const r of candidates.slice(0, 6)) {
            const desc = r.description ? ` — _${String(r.description).slice(0, 80)}${r.description.length > 80 ? "…" : ""}_` : "";
            reply += `CHIP: Run ${r.name} → run rule ${r.name}\n${desc}\n`;
          }
          renderBubble(addMsg("assistant", ""), reply);
          history.push({ role: "user", content: text });
          els.send.disabled = false;
          return;
        }
        // Exact match — submit-then-discover-RTPs strategy. NSPB Planning
        // REST doesn't expose RTPs as metadata; the only way to learn them
        // is by submitting and parsing the error. We accumulate RTPs across
        // retries: each "Value missing for runtime prompt: X" adds a field.
        typingBubble.classList.remove("typing");
        typingBubble.remove();
        addMsg("user", rawText);
        const progress = addMsg("assistant", `▶️ Submitting rule **${exact.name}**…`);
        const _esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
        const knownRtps = {};   // accumulates name → last-entered value across retries
        const formBubble = progress;   // reuse the same bubble for the form
        // Look up a dim's members from the cached KB. Returns array of strings
        // (member names). Returns null if the RTP name doesn't match a dim.
        const getDimMembers = (rtpName) => {
          const tkbObj = (window.NSPB_TENANT_KB && window.NSPB_TENANT_KB.dimensions) || {};
          const lc = rtpName.toLowerCase();
          const dimKey = Object.keys(tkbObj).find(k => k.toLowerCase() === lc);
          if (!dimKey) return null;
          const raw = tkbObj[dimKey] || [];
          const seen = new Set();
          const out = [];
          for (const m of raw) {
            const name = typeof m === "string" ? m : (m.name || m.member || "");
            if (!name || seen.has(name)) continue;
            seen.add(name);
            out.push(name);
          }
          return out;
        };
        const renderForm = (missingName, lastError) => {
          if (!knownRtps.hasOwnProperty(missingName)) knownRtps[missingName] = "";
          const formId = `rtp-form-${Date.now()}`;
          const inputs = Object.keys(knownRtps).map(name => {
            const dimMembers = getDimMembers(name);
            const hasAuto = !!(dimMembers && dimMembers.length);
            const memberCount = hasAuto ? dimMembers.length : 0;
            const placeholder = hasAuto
              ? `Type to search ${memberCount} ${name} members…`
              : "member name or value";
            return `<div data-rtp-row="${_esc(name)}" style="display:flex;flex-direction:column;gap:2px;margin-bottom:8px;position:relative;">
              <label style="font-size:11px;font-weight:600;color:#374151;">${_esc(name)} ${hasAuto ? `<span style="color:#9ca3af;font-weight:400;font-size:10px;">(${memberCount} members in KB)</span>` : ""}</label>
              <input type="text" data-rtp="${_esc(name)}" value="${_esc(knownRtps[name])}"
                placeholder="${_esc(placeholder)}" autocomplete="off"
                style="font:inherit;font-size:12px;padding:5px 7px;border:1px solid #d4d4d4;border-radius:4px;outline:none;" />
              ${hasAuto ? `<div data-rtp-suggestions style="display:none;position:absolute;top:100%;left:0;right:0;background:#fff;border:1px solid #d4d4d4;border-top:0;border-radius:0 0 4px 4px;max-height:160px;overflow-y:auto;z-index:10;box-shadow:0 4px 12px rgba(0,0,0,0.08);"></div>` : ""}
            </div>`;
          }).join("");
          formBubble.innerHTML =
            `<strong>Rule "${_esc(exact.name)}" needs runtime prompt${Object.keys(knownRtps).length===1?"":"s"}:</strong>` +
            (lastError ? `<div style="font-size:11px;color:#991b1b;margin-top:6px;background:#fee2e2;padding:6px 8px;border-radius:4px;">${_esc(lastError)}</div>` : "") +
            `<div id="${formId}" style="margin-top:8px;background:#fff;padding:10px;border:1px solid #e8e8e8;border-radius:6px;">` +
              inputs +
              `<button class="rtp-submit" style="background:#0a0a0a;color:#fff;border:0;border-radius:4px;padding:5px 12px;font-weight:600;font-size:12px;cursor:pointer;margin-top:4px;">▶️ Run</button>` +
            `</div>`;
          const formEl = document.getElementById(formId);
          // Wire autocomplete on each input that has a matching dim
          for (const row of formEl.querySelectorAll("[data-rtp-row]")) {
            const rtpName = row.getAttribute("data-rtp-row");
            const members = getDimMembers(rtpName);
            if (!members) continue;
            const input = row.querySelector("input[data-rtp]");
            const sugBox = row.querySelector("[data-rtp-suggestions]");
            const hideSug = () => { sugBox.style.display = "none"; };
            const showSug = () => { sugBox.style.display = "block"; };
            const renderSuggestions = (q) => {
              const ql = q.toLowerCase();
              const matches = members
                .filter(m => !ql || m.toLowerCase().includes(ql))
                .slice(0, 50);
              if (!matches.length) { hideSug(); return; }
              sugBox.innerHTML = matches.map(m =>
                `<div class="rtp-sug" data-val="${_esc(m)}" style="padding:5px 8px;font-size:12px;cursor:pointer;border-bottom:1px solid #f5f5f5;">${_esc(m)}</div>`
              ).join("");
              showSug();
              for (const item of sugBox.querySelectorAll(".rtp-sug")) {
                item.addEventListener("mouseenter", () => { item.style.background = "#f3f4f6"; });
                item.addEventListener("mouseleave", () => { item.style.background = ""; });
                item.addEventListener("mousedown", (e) => {
                  e.preventDefault();
                  input.value = item.getAttribute("data-val");
                  hideSug();
                  input.focus();
                });
              }
            };
            input.addEventListener("focus", () => renderSuggestions(input.value));
            input.addEventListener("input", () => renderSuggestions(input.value));
            input.addEventListener("blur", () => { setTimeout(hideSug, 150); });
            input.addEventListener("keydown", (e) => {
              if (e.key === "Escape") { hideSug(); }
              if (e.key === "Enter") { hideSug(); e.preventDefault(); }
            });
          }
          formEl.querySelector(".rtp-submit").addEventListener("click", async () => {
            const params = {};
            for (const inp of formEl.querySelectorAll("input[data-rtp]")) {
              const n = inp.getAttribute("data-rtp");
              const v = inp.value.trim();
              knownRtps[n] = v;
              if (v) params[n] = v;
            }
            formEl.querySelector(".rtp-submit").disabled = true;
            formEl.querySelector(".rtp-submit").textContent = "Submitting…";
            await submit(params);
          });
          // Show Cancel button while form is open
          if (window.NSPB_setCancelable) window.NSPB_setCancelable(true);
        };
        const submit = async (parameters) => {
          try {
            // Show a running spinner in the chat — replaces the RTP form so
            // the user has immediate feedback that the rule is in-flight.
            // Animated dots come from CSS .typing-dots (same as the chat
            // typing bubble); we reuse the class to keep styling consistent.
            const paramSummary = parameters && Object.keys(parameters).length
              ? Object.entries(parameters).map(([k, v]) => `${k}=${v}`).join(", ")
              : "";
            formBubble.innerHTML = "";
            renderBubble(formBubble,
              `⏳ Running rule **${exact.name}**${paramSummary ? ` (${paramSummary})` : ""}…\n\n_The job is submitted to NSPB — this can take from a few seconds to several minutes for big calcs. Don't close Excel._`
            );
            formBubble.classList.add("running");
            const res = await fetch(API + "/api/run-rule", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                settings: window.NSPB_SETTINGS,
                rule_name: exact.name,
                parameters: parameters || null,
                tenantKb: tkb || null
              })
            });
            const d = await res.json();
            formBubble.classList.remove("running");
            if (d.ok) {
              if (window.NSPB_setCancelable) window.NSPB_setCancelable(false);
              // Show a clean submit confirmation + a 'Go to Jobs' chip
              // that switches to Status → Jobs and refreshes. No live
              // polling — was unreliable + visually noisy. The Jobs panel
              // is the right place to track running rules.
              formBubble.innerHTML = "";
              renderBubble(formBubble,
                `✓ Rule **${exact.name}** launched${d.jobId ? ` (job \`${d.jobId}\`)` : ""}.\n\nMonitor it in **Status → Jobs**.\n\nCHIP: 📋 Go to Jobs → __open_status_jobs__`
              );
              return;
            }
            // Parse the NSPB error
            const errStr = String(d.error || "");
            const rtpMatch = errStr.match(/Value is missing for the runtime prompt:\s*([^"\\.,}]+)/i);
            const memberMatch = errStr.match(/The member ([^\s]+) does not exist|does not exist for the specified cube/i);
            if (rtpMatch) {
              const rtpName = rtpMatch[1].trim();
              renderForm(rtpName, null);
              return;
            }
            if (memberMatch) {
              // Member not found — keep the form open with the same RTPs but show error
              const lastRtp = Object.keys(knownRtps).pop();
              renderForm(lastRtp || "value", `Member not found. Check the spelling or try a different one.`);
              return;
            }
            // Auth/credential errors — Oracle Cloud expires passwords every
            // ~120 days; the raw 401 body ("user expired" etc.) tells the
            // user nothing actionable, so give them the recovery steps.
            const isAuthErr = d.status === 401 || d.status === 403 ||
              /expired|locked|unauthorized|invalid credentials|authentication failed/i.test(errStr);
            if (isAuthErr) {
              formBubble.innerHTML = "";
              renderBubble(formBubble,
                `✗ NSPB rejected the request for **${exact.name}** — it looks like a **login/password problem** (Oracle Cloud passwords expire every ~120 days):\n\n` +
                `\`\`\`\n${errStr.slice(0, 200)}\n\`\`\`\n\n` +
                `**How to fix:**\n` +
                `1. Open your NSPB URL in a browser and sign in — if Oracle prompts you to change an expired password, set a new one.\n` +
                `2. Come back here: **Settings → Connection** and update the password to the new one.\n` +
                `3. Run the rule again.\n\n` +
                `_If your account itself is deactivated/expired, ask your NSPB administrator to re-enable it in **Tools → Access Control**._`
              );
              if (window.NSPB_setCancelable) window.NSPB_setCancelable(false);
              return;
            }
            // Other error (rule not found, no permissions, etc.)
            const cleaned = errStr.length > 300 ? errStr.slice(0, 300) + "…" : errStr;
            formBubble.innerHTML = "";
            renderBubble(formBubble,
              `✗ Run failed for **${exact.name}**:\n\n\`\`\`\n${cleaned}\n\`\`\`\n\n` +
              `_Common causes: rule not registered as Job Definition, missing permissions, or invalid parameters._`
            );
            if (window.NSPB_setCancelable) window.NSPB_setCancelable(false);
          } catch (e) {
            formBubble.innerHTML = "";
            renderBubble(formBubble, `✗ Network error: ${e.message || e}`);
            if (window.NSPB_setCancelable) window.NSPB_setCancelable(false);
          }
        };
        // Kick off — submit with no params; NSPB will tell us the first RTP.
        await submit(null);
        history.push({ role: "user", content: text });
        els.send.disabled = false;
        return;
      }
    }
  } catch (_) { /* fall through to default flow */ }

  // ── open <form> — typo fallback. Existing exact-match path is in the
  // worker, but if neither exact nor partial matches there, the worker
  // throws an error WITH chips. We let that flow through; the chips
  // already use the levenshtein fallback added in runOpenForm.

  // ── FAST GRID NAVIGATION — canonical commands skip Gemini entirely ────────
  // "add year FY26" / "remove GBP" / "keep only USD" / "pivot Years to POV" /
  // "swap rows and columns" / "zoom in on X" / "retrieve" → parse locally,
  // resolve the member's dimension against the KB (local, instant), call
  // /api/modify-grid directly. Total ~1-3s (one NSPB fetch) instead of the
  // 8-20s Gemini round-trip. Anything that doesn't parse cleanly falls
  // through to the normal chat path.
  try {
    const fastDesc = await resolveGridState(await loadJson(GRID_KEY));
    if (fastDesc && fastDesc.cube) {
      const t = text.trim();
      let nav = null;
      let m;
      const gridDims = (fastDesc.rowAxis || []).map(r => r.dimension)
        .concat((fastDesc.colAxis || []).map(c => c.dimension))
        .concat(Object.keys(fastDesc.pov || {}));
      const findDimByName = (s) => gridDims.find(d => d.toLowerCase() === String(s || "").trim().toLowerCase()) || null;
      // Local member→dim resolver: exact name/alias match in tenant KB dims
      // (+ discovered catalog). Ambiguous or unknown → null → Gemini path.
      const resolveMemberDim = async (memberRaw) => {
        const needle = String(memberRaw || "").trim().toLowerCase();
        if (!needle) return null;
        const tkb = await loadJson(TENANT_KB_KEY);
        const catWrap = await loadJson(CATALOG_KEY);
        const sources = [];
        if (tkb && tkb.dimensions) for (const d of Object.keys(tkb.dimensions)) sources.push([d, tkb.dimensions[d]]);
        if (catWrap && catWrap.catalog) for (const d of Object.keys(catWrap.catalog)) sources.push([d, catWrap.catalog[d]]);
        const hits = new Map();   // dim → exact member name
        for (const [d, list] of sources) {
          if (!Array.isArray(list)) continue;
          for (const mm of list) {
            const nm = String((mm && mm.name) || "").toLowerCase();
            const al = String((mm && mm.alias) || "").toLowerCase();
            if (nm === needle || al === needle) { if (!hits.has(d)) hits.set(d, mm.name); break; }
          }
        }
        if (hits.size === 1) { const [d, name] = [...hits.entries()][0]; return { dim: d, member: name }; }
        // Prefer a dim that's already on this grid when several match.
        for (const [d, name] of hits.entries()) if (gridDims.includes(d)) return { dim: d, member: name };
        return null;
      };

      if ((m = t.match(/^(?:retrieve|refresh(?:\s+this)?(?:\s+grid|\s+sheet)?|refrescar|actualizar?)\s*$/i))) {
        nav = { action: "refresh", target: { dim: "x" } };
      } else if ((m = t.match(/^(?:swap|transpose|flip)(?:\s+(?:rows?\s*(?:and|\/|y)\s*columns?|the\s+grid|filas?\s*(?:y|\/)\s*columnas?))?\s*$/i)) ||
                 /^da(?:le)?\s+vuelta/i.test(t)) {
        nav = { action: "swap_axes", target: { dim: "x" } };
      } else if ((m = t.match(/^(?:add|agrega(?:r)?|suma(?:r)?)\s+(?:year|año|scenario|escenario|period|member|)\s*(.+?)(?:\s+to\s+(?:this\s+)?(?:grid|the\s+grid|columns?|rows?)|\s+a\s+la\s+grilla)?\s*$/i))) {
        const r = await resolveMemberDim(m[1]);
        if (r) nav = { action: "add_member", target: { dim: r.dim, member: r.member } };
      } else if ((m = t.match(/^(?:remove|quita(?:r)?|saca(?:r)?|elimina(?:r)?)\s+(.+?)\s*$/i))) {
        const r = await resolveMemberDim(m[1]);
        if (r) nav = { action: "remove_member", target: { dim: r.dim, member: r.member } };
      } else if ((m = t.match(/^keep\s+only\s+(.+?)\s*$/i))) {
        const r = await resolveMemberDim(m[1]);
        if (r) nav = { action: "keep_only", target: { dim: r.dim, member: r.member } };
      } else if ((m = t.match(/^(?:pivot|move|mov[eé]|pon[eé])\s+(.+?)\s+(?:to|a)\s+(rows?|columns?|pov|filas?|columnas?)\s*$/i))) {
        const dim = findDimByName(m[1]);
        const toRaw = m[2].toLowerCase();
        const to = /^(pov)$/.test(toRaw) ? "pov" : (/^(col|column|columns|columna|columnas)/.test(toRaw) ? "columns" : "rows");
        if (dim) nav = { action: "pivot", target: { dim }, to };
      } else if ((m = t.match(/^zoom\s+(?:in\s+)?(?:on\s+)?(.+?)\s*$/i)) && !/^out/i.test(m[1])) {
        const bottom = /bottom|leaves|leaf|all\s+the\s+way/i.test(m[1]);
        const memberTxt = m[1].replace(/^(?:to\s+)?(?:the\s+)?bottom\s+(?:of\s+)?/i, "").trim();
        const r = await resolveMemberDim(memberTxt);
        if (r) nav = { action: bottom ? "zoom_bottom" : "zoom_in", target: { dim: r.dim, member: r.member } };
      } else if (/^zoom\s+out\s*$/i.test(t)) {
        const d0 = (fastDesc.rowAxis || [])[0];
        if (d0) nav = { action: "zoom_out", target: { dim: d0.dimension } };
      } else if ((m = t.match(/^change\s+pov\s+(.+?)\s+to\s+(.+?)\s*$/i))) {
        const dim = findDimByName(m[1]);
        if (dim) nav = { action: "change_pov", target: { dim, member: m[2].trim() } };
      }

      if (nav) {
        els.input.value = "";
        addMsg("user", rawText);
        typingBubble.innerHTML = '<span class="typing-dots"><span></span><span></span><span></span></span><span class="typing-label">Updating the grid…</span>';
        typingBubble.dataset.staticLabel = "1";
        typingBubble.classList.add("typing");
        try {
          const appCfg = await loadJson(APP_CONFIG_KEY);
          const catWrap = await loadJson(CATALOG_KEY);
          const r = await fetch(API + "/api/modify-grid", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              settings: window.NSPB_SETTINGS,
              descriptor: fastDesc,
              action: nav.action, target: nav.target, to: nav.to || null,
              catalog: (catWrap && catWrap.catalog) || null,
              appConfig: (appCfg && appCfg.cubes) ? appCfg : null
            })
          });
          const d = await r.json();
          typingBubble.classList.remove("typing");
          if (!d.ok) throw new Error(d.error || "modify failed");
          const wn = await writeGridToSheet(d.sheetName, d.grid, null, {
            inPlace: !!d.inPlace, format: d.format || null,
            // adhoc raw layout: 1 horizontal POV row + one header row per col dim
            axisPaint: d.gridDescriptor ? {
              pov: 1,
              header: (d.gridDescriptor.colAxis || []).length,
              label: (d.gridDescriptor.rowAxis || []).length
            } : null
          });
          if (d.gridDescriptor) {
            if (wn) d.gridDescriptor.sheetName = wn;
            await saveGridDescriptor(d.gridDescriptor);
          }
          const emptyNote = (d.dataCellCount === 0)
            ? `\n\n⚠ The grid came back with **no data** at this intersection — check the POV row on top, or ask me to change a POV dim to its total.`
            : "";
          const legend = d.gridDescriptor
            ? `\n\n🟦 Rows: ${(d.gridDescriptor.rowAxis || []).map(r => r.dimension).join(" × ")}` +
              `\n🟩 Columns: ${(d.gridDescriptor.colAxis || []).map(c => c.dimension).join(" × ")}` +
              `\n🟨 POV: ${Object.entries(d.gridDescriptor.pov || {}).slice(0, 5).map(([k, v]) => `${k}=${v}`).join(" · ")}`
            : "";
          renderBubble(typingBubble, `✓ ${nav.action.replace(/_/g, " ")} — sheet \`${wn || d.sheetName}\` updated. _(fast path — no AI round-trip)_${legend}${emptyNote}`);
          history.push({ role: "user", content: text });
          history.push({ role: "assistant", content: `fast-nav ${nav.action} ok` });
          els.send.disabled = false;
          return;
        } catch (e) {
          // Fast path failed — let the user retry via the smart path rather
          // than dead-ending: report and stop (Gemini would repeat the call).
          typingBubble.classList.remove("typing");
          renderBubble(typingBubble, "✗ " + (e.message || e));
          history.push({ role: "assistant", content: "fast-nav failed: " + (e.message || e) });
          els.send.disabled = false;
          return;
        }
      }
    }
  } catch (_) { /* fall through to the normal chat path */ }

  // ── submit data — write edited cells back to the cube ─────────────────────
  // Any phrasing that reads as "save/enter these numbers": 'submit data',
  // 'enter the data in the cube', 'guardar los datos', 'save this to nspb'…
  // Uses the ACTIVE SHEET's grid descriptor (per-sheet registry) + Planning
  // REST importdataslice. NSPB security decides cell-by-cell what's writable.
  try {
    const SUBMIT_RE = /^\s*\/?\s*(?:submit|save|write|push|enter|send|guard[aá]r?|sub[ií]|carg[aá]r?)\b[\s\S]{0,50}?\b(?:data|datos|values|numbers|n[uú]meros|cube|cubo|nspb|sheet|hoja|grid)\b/i;
    // Negative guard: questions/analysis phrasings that merely mention data
    // ("write a report about the data") must NOT trigger a cube write.
    const SUBMIT_NOT_RE = /\b(report|about|how|why|what|explain|analy|resumen|c[oó]mo|por\s*qu[eé])\b/i;
    if (SUBMIT_RE.test(text) && !SUBMIT_NOT_RE.test(text) && text.length < 90) {
      els.input.value = "";
      addMsg("user", rawText);
      typingBubble.innerHTML = '<span class="typing-dots"><span></span><span></span><span></span></span><span class="typing-label">Submitting data to NSPB…</span>';
      typingBubble.dataset.staticLabel = "1";
      typingBubble.classList.add("typing");
      try {
        const sheetData = await readActiveSheetForAnalysis();
        if (!sheetData || !sheetData.values || !sheetData.values.length) {
          throw new Error("Couldn't read the active sheet.");
        }
        const reg = await loadJson(GRID_REG_KEY);
        const desc = (reg && reg[sheetData.sheetName]) || (await loadJson(GRID_KEY));
        if (!desc) {
          throw new Error("I don't have a grid descriptor for this sheet — open a form or build a grid first, then edit and submit. (SmartView ribbon → Save also works on this sheet.)");
        }
        const appCfg = await loadJson(APP_CONFIG_KEY);
        const r = await fetch(API + "/api/submit-grid", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            settings: window.NSPB_SETTINGS,
            descriptor: desc,
            activeSheet: sheetData,
            appConfig: (appCfg && appCfg.cubes) ? appCfg : null
          })
        });
        const d = await r.json();
        typingBubble.classList.remove("typing");
        if (!d.ok) throw new Error(d.error || "submit failed");
        renderBubble(typingBubble,
          `✓ **Data submitted to ${d.cube}** — ${d.accepted} cell(s) accepted${d.rejected ? `, ${d.rejected} rejected` : ""}.` +
          (d.rejected ? `\n\n_Rejected cells usually mean read-only intersections or missing write access._` : "") +
          `\n\nSay \`retrieve\` (or SmartView → Refresh) to see calculated results.`);
        history.push({ role: "user", content: text });
        history.push({ role: "assistant", content: `submitted: ${d.accepted} accepted, ${d.rejected || 0} rejected to ${d.cube}` });
      } catch (e) {
        typingBubble.classList.remove("typing");
        renderBubble(typingBubble, "✗ Submit failed: " + (e.message || e));
        history.push({ role: "assistant", content: "submit failed: " + (e.message || e) });
      }
      els.send.disabled = false;
      return;
    }
  } catch (_) { /* fall through */ }

  // ── adhoc2 <form name> — opens a form in raw SmartView pivot format so the
  // user can connect SmartView and refresh/drill from the same sheet. Reuses
  // the existing /api/open-form (which already returns a SmartView slice grid)
  // but writes it to the sheet WITHOUT any title/subtitle decoration that
  // would break SmartView's pivot detection. New command, totally separate
  // from the regular `open <form>` flow so it can't break that path.
  try {
    const ah2 = text.match(/^adhoc2\s+(.+?)\s*$/i);
    if (ah2) {
      const formNameWanted = ah2[1].trim();
      const fw = await loadJson(FORMS_KEY);
      const tkb = await loadJson(TENANT_KB_KEY);
      const formsList = (fw && fw.forms) ? fw.forms : [];
      const kbForms = (tkb && Array.isArray(tkb.forms)) ? tkb.forms : [];
      const hit = formsList.find(f => (f.name || "").trim().toLowerCase() === formNameWanted.toLowerCase())
              || kbForms.find(f => (f.name || "").trim().toLowerCase() === formNameWanted.toLowerCase());
      if (!hit) {
        // No exact match → fuzzy with Levenshtein, suggest chips with the
        // corrected `adhoc2 X` command.
        const allForms = [...formsList];
        const seen = new Set(allForms.map(f => (f.name || "").toLowerCase()));
        for (const f of kbForms) {
          const k = (f.name || "").toLowerCase();
          if (k && !seen.has(k)) { allForms.push(f); seen.add(k); }
        }
        const lev = (a, b) => {
          if (a === b) return 0;
          if (!a) return b.length;
          if (!b) return a.length;
          const m = a.length, n = b.length;
          let prev = new Array(n + 1), curr = new Array(n + 1);
          for (let j = 0; j <= n; j++) prev[j] = j;
          for (let i = 1; i <= m; i++) {
            curr[0] = i;
            const ai = a.charCodeAt(i - 1);
            for (let j = 1; j <= n; j++) {
              const cost = ai === b.charCodeAt(j - 1) ? 0 : 1;
              curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
            }
            [prev, curr] = [curr, prev];
          }
          return prev[n];
        };
        const norm = s => (s || "").toLowerCase().replace(/^nfs[_\s]*/i, "").replace(/[\.\s]+$/, "").trim();
        const target = norm(formNameWanted);
        const partial = allForms.filter(f => (f.name || "").toLowerCase().includes(formNameWanted.toLowerCase()));
        let candidates = partial.slice();
        if (candidates.length < 5) {
          const scored = allForms
            .filter(f => !partial.includes(f))
            .map(f => ({ f, d: lev(target, norm(f.name)) }))
            .filter(x => x.d <= Math.min(6, Math.ceil(Math.max(target.length, x.f.name.length) * 0.35)))
            .sort((a, b) => a.d - b.d);
          for (const s of scored) {
            if (candidates.length >= 8) break;
            candidates.push(s.f);
          }
        }
        candidates.sort((a, b) => (a.path || "").length - (b.path || "").length);
        typingBubble.classList.remove("typing");
        typingBubble.remove();
        addMsg("user", rawText);
        if (!candidates.length) {
          addMsg("assistant", `Form **${formNameWanted}** not found. Run \`show all forms\` to see available names.`);
          els.send.disabled = false;
          return;
        }
        let reply = `No exact match for **${formNameWanted}**. Did you mean:\n\n`;
        for (const f of candidates.slice(0, 8)) {
          reply += `CHIP: ${f.name} → adhoc2 ${f.name}\n`;
        }
        renderBubble(addMsg("assistant", ""), reply);
        history.push({ role: "user", content: text });
        els.send.disabled = false;
        return;
      }
      typingBubble.innerHTML = '<span class="typing-dots"><span></span><span></span><span></span></span><span class="typing-label">Fetching SmartView slice for ' + hit.name + '…</span>';
      typingBubble.dataset.staticLabel = "1";   // keep the generic rotator's hands off
      typingBubble.classList.add("typing");
      try {
        const appCfg = await loadJson(APP_CONFIG_KEY);
        const r = await fetch(API + "/api/open-form", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            settings: window.NSPB_SETTINGS,
            form_name: hit.name,
            forms: formsList,
            tenantKb: tkb || null,
            appConfig: (appCfg && appCfg.cubes) ? appCfg : null
          })
        });
        const d = await r.json();
        if (!d.ok) throw new Error(d.error || "open-form failed");
        typingBubble.classList.remove("typing");
        const slice = (d.grids && d.grids[0] && d.grids[0].grid) ? d.grids[0].grid : null;
        const types = (d.grids && d.grids[0] && d.grids[0].types) ? d.grids[0].types : null;
        const statuses = (d.grids && d.grids[0] && d.grids[0].statuses) ? d.grids[0].statuses : null;
        const pov = (d.grids && d.grids[0] && Array.isArray(d.grids[0].pov))
                    ? d.grids[0].pov : (Array.isArray(d.pov) ? d.pov : []);
        const formCategory = d.formCategory || null;
        logDebug({ cmd: "adhoc2_response", povLen: pov.length, povSample: pov.slice(0, 3), formCategory, sliceRows: slice ? slice.length : 0 });
        if (!slice || !slice.length) {
          renderBubble(typingBubble, `⚠ SmartView slice came back empty for **${hit.name}**. The form may be a dashboard, or your user lacks access to a required dimension.`);
          history.push({ role: "assistant", content: "Slice empty for " + hit.name });
          els.send.disabled = false;
          return;
        }
        // Write the raw slice to a sheet named after the form. NO title,
        // NO subtitle, NO formatting — just the SmartView pivot. SmartView
        // recognizes this layout natively when the user connects + Refresh.
        // PREPEND the POV rows above the slice — one row per fixed dim with
        // "DimName: Member" so SmartView can pick them up too.
        const sheetName = hit.name.replace(/[\\\/\?\*\[\]:]/g, "_").slice(0, 31);
        await withFocusRetry(() => Excel.run(async (ctx) => {
          const sheets = ctx.workbook.worksheets;
          sheets.load("items/name");
          await ctx.sync();
          const existing = sheets.items.find(s => s.name === sheetName);
          if (existing) existing.delete();
          const sh = sheets.add(sheetName);
          sh.activate();
          // POV rows: ONE member per row in column A, no labels (SmartView
          // ad-hoc convention — dim is identified by position/order in the
          // form metadata when SmartView refreshes).
          const sliceColCount = Math.max(...slice.map(r => r.length));
          const povPadded = (pov || []).map(p => {
            const member = p.alias && p.alias !== p.member
              ? p.member  // keep just the member code (no alias) for SV refresh
              : p.member;
            const row = new Array(sliceColCount).fill("");
            row[0] = member;
            return row;
          });
          // No separator row — POV directly above the slice. The slice's
          // first row is already the col-header band so it's visually clear.
          // Also drop empty rows FROM the slice itself (SmartView puts a blank
          // spacer between col headers and data rows).
          const sliceTrimmed = [];
          for (const r of slice) {
            const out = r.slice();
            while (out.length < sliceColCount) out.push("");
            for (let i = 0; i < out.length; i++) if (out[i] == null) out[i] = "";
            // Skip rows that are completely empty (SmartView spacers)
            if (out.every(c => c === "" || c == null)) continue;
            sliceTrimmed.push(out);
          }
          const sliceStart = povPadded.length;
          const fullGrid = [...povPadded, ...sliceTrimmed];
          const rowCount = fullGrid.length;
          const colCount = sliceColCount;
          sh.getRangeByIndexes(0, 0, rowCount, colCount).values = fullGrid;
          // Format POV rows: italic, lighter color, no border
          if (povPadded.length) {
            const povRange = sh.getRangeByIndexes(0, 0, povPadded.length, 1);
            povRange.format.font.italic = true;
            povRange.format.font.size = 10;
            povRange.format.font.color = "#6b7280";
          }
          // No wrap, sane column widths so the grid is readable but SmartView
          // can re-style it on Refresh.
          const range = sh.getRangeByIndexes(0, 0, rowCount, colCount);
          range.format.wrapText = false;
          range.format.font.name = "Calibri";
          range.format.font.size = 10;
          // Row dim columns (typically 1-3 leftmost) wider than data columns.
          for (let c = 0; c < colCount; c++) {
            const w = c < 2 ? 130 : 90;
            sh.getRangeByIndexes(0, c, 1, 1).format.columnWidth = w;
          }
          // Bold the row-dim header column for the slice body only (skip POV rows)
          if (sliceStart < rowCount) {
            sh.getRangeByIndexes(sliceStart, 0, rowCount - sliceStart, Math.min(2, colCount)).format.font.bold = true;
          }
          // ── INPUT cells in YELLOW for input forms ──
          // SmartView cell type "0" = label/text, "7" = empty, others = data.
          // For input forms (data-entry), data cells are editable — paint
          // them yellow so users see where they can type values.
          // statuses[] (when present) is the per-cell access bitmask from the
          // SmartView response: bit 0x2 = read-only/blocked. Without it we'd
          // paint every data cell — including blocked ones — yellow.
          if (formCategory === "input" && types && types.length) {
            // Map original slice rows → final grid rows (we trimmed empty
            // spacer rows). Re-walk the slice with the trimmed offset.
            // Simpler: paint by looking at the FULL grid we wrote and check
            // each cell's type. The trimmed rows skipped slice rows that
            // were all-empty in values; their types[r] entries also are
            // empty so we can match by skipping the same way.
            const trimmedTypes = [];
            const trimmedStatuses = [];
            const trimmedVals = [];
            for (let i = 0; i < slice.length; i++) {
              const valRow = slice[i];
              if (valRow.every(c => c === "" || c == null)) continue;
              trimmedTypes.push(types[i] || []);
              trimmedStatuses.push((statuses && statuses[i]) || []);
              trimmedVals.push(valRow);
            }
            // Group contiguous yellow cells per column for fewer range ops.
            for (let c = 0; c < colCount; c++) {
              let groupStart = -1;
              for (let r = 0; r <= trimmedTypes.length; r++) {
                const t = (r < trimmedTypes.length) ? trimmedTypes[r][c] : null;
                const s = (r < trimmedTypes.length) ? trimmedStatuses[r][c] : "";
                const v = (r < trimmedTypes.length) ? (trimmedVals[r] || [])[c] : null;
                // Editable: not "0" (label), not "7" (empty), not read-only
                // per status bitmask, and not a "#No Access" cell.
                const editable = t && t !== "0" && t !== "7"
                  && !isCellBlocked(s) && v !== "#No Access";
                if (editable && groupStart < 0) groupStart = r;
                if ((!editable || r === trimmedTypes.length) && groupStart >= 0) {
                  const groupEnd = r - 1;
                  const absRow = sliceStart + groupStart;
                  const groupSize = groupEnd - groupStart + 1;
                  sh.getRangeByIndexes(absRow, c, groupSize, 1).format.fill.color = "#fef9c3";  // yellow-100
                  groupStart = -1;
                }
              }
            }
          }
          await ctx.sync();
        }), "adhoc2 form write");
        // Grid state for the next chat turn. The descriptor's sheetName MUST
        // be the sheet adhoc2 ACTUALLY wrote (its own naming, not the
        // worker's "Form_*") or modify_grid rewrites the wrong sheet. When
        // synthesis failed (no descriptor), CLEAR the stale one — otherwise
        // "add FY26" while looking at this form would silently rebuild the
        // previous ad-hoc sheet in place.
        try {
          if (d.gridDescriptor) {
            d.gridDescriptor.sheetName = sheetName;
            await saveGridDescriptor(d.gridDescriptor);
          } else {
            await clearKey(GRID_KEY);
          }
        } catch (_) {}
        const povSummary = pov && pov.length
          ? `\n\nPOV (${pov.length} dims): ${pov.map(p => `**${p.dim}**=${p.member}`).join(" · ")}`
          : "\n\n_(no POV detected — form uses only row/col dims)_";
        const inputHint = formCategory === "input"
          ? `\n\n🟡 **Yellow cells = editable inputs** (this is a data-entry form). Type values, then run \`submit data\` (coming soon) or save via SmartView.`
          : (formCategory === "review" ? `\n\n🔒 **Read-only** (review form — aggregated data, not editable).` : "");
        renderBubble(typingBubble,
          `✓ Wrote SmartView pivot to sheet \`${sheetName}\` (${slice.length} rows × ${slice[0].length} cols).` +
          povSummary +
          inputHint +
          `\n\n**Connect SmartView → Refresh** on this sheet to load live data and continue navigating (zoom, pivot, change POV).`
        );
        history.push({ role: "assistant", content: `adhoc2: wrote ${sheetName}` });
      } catch (e) {
        typingBubble.classList.remove("typing");
        renderBubble(typingBubble, `Error: ${e.message || e}`);
      }
      els.send.disabled = false;
      return;
    }
  } catch (_) { /* fall through */ }

  // (open→adhoc2 reroute moved above, before the adhoc2 handler.)

  // Direct open_form route: matches `open <name>` OR `openform <name>` (no space).
  // Bypasses Gemini for exact KB matches. Returns metadata + grid + chips
  // (instructions, attached business rules, follow-up suggestions).
  try {
    // Accept all of: "open Foo", "openform Foo", "/openform Foo", "/open Foo".
    // The leading slash variant comes from the slash palette (we don't strip
    // /openform in SLASH_PREFIXES — see comment up there).
    const m = text.match(/^\/?(?:open|openform)\s+(.+?)(?:\s+form)?\s*$/i);
    if (m) {
      const wanted = m[1].trim().toLowerCase();
      const fw = await loadJson(FORMS_KEY);
      const tkb = await loadJson(TENANT_KB_KEY);
      const formsList = (fw && fw.forms) ? fw.forms : [];
      const kbForms = (tkb && Array.isArray(tkb.forms)) ? tkb.forms : [];
      // Normalize: strip NFS_ prefix + trailing dots so "income statement"
      // matches "Income Statement." and "NFS_Income Statement" directly.
      const normFn = s => (s || "").trim().toLowerCase().replace(/^nfs[_\s]*/i, "").replace(/[\.\s]+$/, "").trim();
      const wantedNorm = normFn(wanted);
      const hit = formsList.find(f => (f.name || "").trim().toLowerCase() === wanted)
              || kbForms.find(f => (f.name || "").trim().toLowerCase() === wanted)
              || formsList.find(f => normFn(f.name) === wantedNorm)
              || kbForms.find(f => normFn(f.name) === wantedNorm);
      if (hit) {
        // Honest progress label — this is a form open, not sheet analysis.
        try {
          const lbl0 = typingBubble.querySelector(".typing-label");
          if (lbl0) lbl0.textContent = "Opening form " + hit.name + "…";
          typingBubble.dataset.staticLabel = "1";
        } catch (_) {}
        // 1. Check IndexedDB cache first — instant if cached & not stale.
        const cached = await formCacheGet(hit.name);
        if (cached) {
          typingBubble.classList.remove("typing");
          const cacheNote = "\n\n_⚡ Loaded from cache (offline-instant). Use **Clear form cache** in Settings to refresh._";
          renderBubble(typingBubble, (cached.reply || "Done.") + cacheNote);
          history.push({ role: "assistant", content: cached.reply || "Done." });
          let cachedSheetWritten = null;
          for (const g of (cached.grids || [])) {
            const gd = g.gridDescriptor || cached.gridDescriptor || null;
            const opts = {
              inPlace: !!g.inPlace, format: g.format || null,
              sectionRows: g.sectionRows || null, rowFills: g.rowFills || null,
              rowFillSpans: g.rowFillSpans || null,
              // Pass types[] + formCategory + povRowCount so writeGridToSheet
              // can paint editable cells yellow on input forms.
              types: g.types || null,
              statuses: g.statuses || null,
              formCategory: cached.formCategory || null,
              povRowCount: Array.isArray(g.pov) ? g.pov.length : 0,
              axisPaint: gd ? {
                pov: Array.isArray(g.pov) ? g.pov.length : 0,
                header: (gd.colAxis || []).length,
                label: (gd.rowAxis || []).length
              } : null
            };
            try {
              const wn = await writeGridToSheet(g.sheetName, g.grid, g.gridDescriptor || null, opts);
              if (cachedSheetWritten === null && wn) cachedSheetWritten = wn;
            }
            catch (e) {
              if (isLostFocusError(e)) {
                addRetryBanner("Grid for \"" + g.sheetName + "\" is ready but couldn't be written.",
                  () => writeGridToSheet(g.sheetName, g.grid, g.gridDescriptor || null, opts));
              } else { addMsg("error", "Grid write failed (" + g.sheetName + "): " + (e.message || e)); }
            }
          }
          // Grid state for the next turn (see fresh-path comment): sync the
          // descriptor to the sheet actually written, or clear stale state.
          try {
            if (cached.gridDescriptor) {
              if (cachedSheetWritten) cached.gridDescriptor.sheetName = cachedSheetWritten;
              await saveGridDescriptor(cached.gridDescriptor);
            } else if (cached.grids && cached.grids.length) {
              await clearKey(GRID_KEY);
            }
          } catch (_) {}
          if (cachedSheetWritten) {
            try {
              await Excel.run(async (ctx) => {
                ctx.workbook.worksheets.getItem(cachedSheetWritten).activate();
                await ctx.sync();
              });
            } catch (_) {}
          }
          els.send.disabled = false;
          return;
        }

        // 2. Cache miss → fetch from server, then store for next time.
        const appCfg = await loadJson(APP_CONFIG_KEY);
        const r = await fetch(API + "/api/open-form", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            settings: window.NSPB_SETTINGS,
            form_name: hit.name,
            forms: formsList,
            tenantKb: tkb || null,
            appConfig: (appCfg && appCfg.cubes) ? appCfg : null
          })
        });
        const d = await r.json();
        if (!d.ok) throw new Error(d.error || "open-form failed");
        // Cache for re-opens (only if grid was actually rendered).
        if (d.grids && d.grids.length) formCacheSet(hit.name, d).catch(() => {});
        typingBubble.classList.remove("typing");
        renderBubble(typingBubble, d.reply || "Done.");
        history.push({ role: "assistant", content: d.reply || "Done." });
        let formSheetWritten = null;
        for (const g of (d.grids || [])) {
          const gd = g.gridDescriptor || d.gridDescriptor || null;
          const opts = {
            inPlace: !!g.inPlace, format: g.format || null,
            sectionRows: g.sectionRows || null, rowFills: g.rowFills || null,
            rowFillSpans: g.rowFillSpans || null,
            types: g.types || null,
            statuses: g.statuses || null,
            formCategory: d.formCategory || null,
            povRowCount: Array.isArray(g.pov) ? g.pov.length : 0,
            // Axis tinting mirrors the chat legend (🟦 rows/🟩 cols/🟨 POV)
            axisPaint: gd ? {
              pov: Array.isArray(g.pov) ? g.pov.length : 0,
              header: (gd.colAxis || []).length,
              label: (gd.rowAxis || []).length
            } : null
          };
          try {
            const wn = await writeGridToSheet(g.sheetName, g.grid, g.gridDescriptor || null, opts);
            if (formSheetWritten === null && wn) formSheetWritten = wn;
          }
          catch (e) {
            if (isLostFocusError(e)) {
              addRetryBanner("Grid for \"" + g.sheetName + "\" is ready but couldn't be written.",
                () => writeGridToSheet(g.sheetName, g.grid, g.gridDescriptor || null, opts));
            } else { addMsg("error", "Grid write failed (" + g.sheetName + "): " + (e.message || e)); }
          }
        }
        // Grid state for the next turn — descriptor synced to the sheet name
        // ACTUALLY written (uniquified "Form_X (2)" etc.), or cleared when
        // this form produced no descriptor so a stale one can't hijack the
        // next modify_grid onto the wrong sheet.
        try {
          if (d.gridDescriptor) {
            if (formSheetWritten) d.gridDescriptor.sheetName = formSheetWritten;
            await saveGridDescriptor(d.gridDescriptor);
          } else if (d.grids && d.grids.length) {
            await clearKey(GRID_KEY);
          }
        } catch (_) {}
        // Jump Excel to the freshly written form tab — belt-and-suspenders:
        // the in-write activate() sometimes loses to focus churn in Office.
        if (formSheetWritten) {
          try {
            await Excel.run(async (ctx) => {
              ctx.workbook.worksheets.getItem(formSheetWritten).activate();
              await ctx.sync();
            });
          } catch (_) {}
        }
        els.send.disabled = false;
        return;
      }
    }
  } catch (e) {
    typingBubble.classList.remove("typing");
    addMsg("error", "open-form direct failed: " + (e.message || e));
    els.send.disabled = false;
    return;
  }

  try {
    // Ship catalog + lastGrid + discovered inventory with every turn so the
    // Worker stays stateless. Each is null until its respective Discover button
    // has been clicked in Settings.
    const [catalogWrap, lastGrid, rulesWrap, formsWrap, varsWrap, jobsWrap, appConfigWrap, tenantKb] = await Promise.all([
      loadJson(CATALOG_KEY),
      loadJson(GRID_KEY),
      loadJson(RULES_KEY),
      loadJson(FORMS_KEY),
      loadJson(VARS_KEY),
      loadJson(JOBS_KEY),
      loadJson(APP_CONFIG_KEY),
      loadJson(TENANT_KB_KEY)
    ]);

    // Active-sheet read is now an ALLOWLIST (was a blocklist): reading the
    // used range + shipping it costs seconds on EVERY message and uploads
    // whatever workbook the user happens to have open (privacy!). Read it
    // ONLY when the message plausibly operates on the sheet:
    //  - explicit sheet references / sheet operations (analyze, format,
    //    clean, map, submit, retrieve, transform, close report, adapt…)
    //  - grid-navigation verbs (add/remove/pivot/zoom…) WITHOUT a current
    //    grid descriptor — the worker's fallback rebuilds from the visible
    //    sheet in that case, so it needs the data.
    const SHEET_NEEDED_RE = new RegExp([
      "(this|active|current)\\s+sheet", "esta\\s+hoja", "la\\s+hoja", "mi\\s+hoja",
      "planilla", "spreadsheet", "\\bsheet\\b", "\\bworkbook\\b",
      "analy[sz]e", "analiz", "\\bformat", "formatea", "\\bclean\\b", "limpia",
      "\\bmap\\b", "mapea", "\\bsubmit\\b", "\\bretrieve\\b", "\\brefresh\\b",
      "close\\s+report", "\\badapt\\b", "transform", "smart\\s?view",
      "import\\s+this", "use\\s+this", "load\\s+this", "estos\\s+(datos|n[uú]meros)", "these\\s+numbers"
    ].join("|"), "i");
    const NAV_VERB_RE = /^\s*(add|remove|keep\s+only|pivot|swap|zoom|drill|quita|sac[aá]|agrega|sum[aá]|mov[eé])\b/i;
    // Per-sheet grid memory: the grid the user means is the one on the sheet
    // they're LOOKING AT. Resolve the active sheet's descriptor (name-only
    // lookup — instant) and fall back to the global last grid.
    const lastGridEff = await resolveGridState(lastGrid);
    let activeSheet = null;
    const needSheet = SHEET_NEEDED_RE.test(text) || (NAV_VERB_RE.test(text) && !lastGridEff);
    if (needSheet) {
      try {
        const candidate = await readActiveSheetForAnalysis();
        if (candidate && candidate.sheetName && !candidate.sheetName.startsWith("NSPB_")) {
          activeSheet = candidate;
        }
      } catch (e) { console.warn("readActiveSheet failed:", e.message || e); }
    }
    const catalog = catalogWrap && catalogWrap.catalog ? catalogWrap.catalog : null;
    const businessRules = rulesWrap && rulesWrap.rules ? rulesWrap.rules : null;
    const forms = formsWrap && formsWrap.forms ? formsWrap.forms : null;
    const variables = varsWrap && varsWrap.variables ? varsWrap.variables : null;
    // When this cache was actually filled. The variables sheet used to stamp
    // itself with today's date regardless, which hid how old the values were.
    const variablesLoadedAt = (varsWrap && varsWrap.loadedAt) || null;
    const jobs = jobsWrap && jobsWrap.jobs ? jobsWrap.jobs : null;
    // appConfig comes back from /api/discover-app-config wrapped or bare.
    // Either way send the fields the worker uses.
    const appConfig = appConfigWrap && appConfigWrap.cubes ? appConfigWrap : null;

    const resp = await fetch(API + "/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: history.map(m => ({ role: m.role, content: m.content })),
        settings: window.NSPB_SETTINGS,
        businessRules,
        forms,
        variables,
        variablesLoadedAt,
        jobs,
        catalog,
        lastGrid: lastGridEff,
        appConfig,
        glossary: (window.NSPB_SETTINGS && window.NSPB_SETTINGS.glossary) || null,
        language: (window.NSPB_SETTINGS && window.NSPB_SETTINGS.language) || "en",
        activeSheet,
        tenantKb: tenantKb || null,
        debug: !!window.NSPB_SETTINGS.debug,
        // Auto-trigger EXPLAIN MODE for any teaching question. Keeps Try-it
        // chips fast AND gives the same fast/short experience to ANY user
        // who types "How do I…" / "What is…" / etc.
        forceExplain: !!window._nspbForceExplain || /^(how\s+(do|to|can|should)|what\s+is|why\s+(is|does|do)|when\s+should|where\s+(is|do)|show\s+me\s+how|tell\s+me\s+about|explain)\b/i.test(text),
        // Adapt mode — when user types "adapt this sheet" / "map this sheet"
        // the worker swaps in a specialized prompt that asks the AI to
        // propose a column-by-column mapping from the active sheet to a
        // tenant form. v1 = preview only (user reviews + applies via chip).
        adaptMode: /^(adapt\w*|adaptar?|map\s+this\s+sheet)\b/i.test(text)
      })
    });
    // Consume the flag — only ONE explain-mode turn per Try-it click.
    window._nspbForceExplain = false;
    const data = await resp.json();
    if (!data.ok) throw new Error(data.error || "chat failed");

    typingBubble.classList.remove("typing");
    renderBubble(typingBubble, data.reply || "Done.");
    history.push({ role: "assistant", content: data.reply || "Done." });

    // Debug trace — one bubble per Gemini round, listing tool calls + timings.
    if (window.NSPB_SETTINGS.debug && Array.isArray(data.trace)) {
      for (const entry of data.trace) addMsg("debug", formatTraceEntry(entry));
    }

    // Persist the evolved grid descriptor so the next turn can reference
    // "zoom in", "same but X", etc. No descriptor means no grid this turn —
    // keep whatever was already stored.
    if (data.gridDescriptor) await saveGridDescriptor(data.gridDescriptor);

    // Collect any HTML reports the worker produced so we can surface a
    // single "Open as HTML report" link bubble after writing the sheets.
    const htmlReports = [];

    for (const g of (data.grids || [])) {
      const opts = {
        inPlace: !!g.inPlace,
        format: g.format || null,
        sectionRows: g.sectionRows || null,
        sectionColors: g.sectionColors || null,
        bulletRows: g.bulletRows || null,
        kpiRows: g.kpiRows || null,
        tableHeaderRows: g.tableHeaderRows || null,
        tableDataRows: g.tableDataRows || null,
        rowFills: g.rowFills || null,
        rowFillSpans: g.rowFillSpans || null
      };
      try {
        await writeGridToSheet(g.sheetName, g.grid, g.gridDescriptor || null, opts);
      } catch (e) {
        if (isLostFocusError(e)) {
          addRetryBanner(
            "Grid for \"" + g.sheetName + "\" is ready but couldn't be written.",
            () => writeGridToSheet(g.sheetName, g.grid, g.gridDescriptor || null, opts)
          );
        } else {
          addMsg("error", "Grid write failed (" + g.sheetName + "): " + (e.message || e));
        }
      }
      if (g.htmlReport) htmlReports.push({ name: g.sheetName, html: g.htmlReport });
    }

    // ── HTML report — small download chip ─────────────────────────────
    // Office WebView2 blocks `blob:` and `data:` URLs from opening in a new
    // tab (the "Get an app to open this link" error). Best portable option:
    // trigger a download using <a download> — user gets the .html file,
    // double-click opens in their default browser.
    for (const r of htmlReports) {
      try {
        const blob = new Blob([r.html], { type: "text/html" });
        const url = URL.createObjectURL(blob);
        const baseName = (r.name || "Analysis").replace(/[\\/:*?"<>|]/g, "_");
        const fileName = baseName + ".html";
        const linkBubble = addMsg("assistant", "📄 Web report");
        linkBubble.innerHTML = `
          <div class="chip-row" data-report-chips style="margin-top:0;align-items:center;flex-wrap:wrap;gap:5px;">
            <a href="${url}" download="${fileName}" class="chip-btn chip-download" title="Download the .html report — double-click to open in your browser">
              📄 HTML
            </a>
            <button class="chip-btn chip-download" data-pdf-action="download" data-pdf-name="${baseName}" title="Generate a native PDF (server-side, exact same design)">
              🖨 PDF
            </button>
            <button class="chip-btn chip-download" data-preview-action="open" title="Show the report inline (iframe-sandboxed, no CSS conflicts)">
              👁 Preview
            </button>
            <span class="chip-pdf-status" style="font-size:10px;color:#9ca3af;line-height:1.3;"></span>
          </div>
          <div data-report-preview style="display:none;"></div>`;
        // ── 👁 Preview button — show report inline via iframe srcdoc ──
        // iframe gives us a sandboxed render: the report's CSS doesn't leak
        // into the taskpane, fonts load normally, scroll bars are local to
        // the report. Tradeoff: chat panel is narrow so the report still
        // shows horizontal scroll for the 1180px max-width design — that's
        // intentional, the alternative (scaled-down) is unreadable.
        const previewBtn = linkBubble.querySelector('[data-preview-action="open"]');
        const previewSlot = linkBubble.querySelector('[data-report-preview]');
        const reportHtml = r.html;
        if (previewBtn && previewSlot) {
          previewBtn.addEventListener("click", () => {
            const isOpen = previewSlot.dataset.open === "1";
            if (isOpen) {
              previewSlot.style.display = "none";
              previewSlot.innerHTML = "";
              previewSlot.dataset.open = "";
              previewBtn.textContent = "👁 Preview";
              return;
            }
            // Build the iframe via property assignment (safer than escaping
            // 50KB of HTML into an attribute). srcdoc keeps it sandboxed.
            const iframe = document.createElement("iframe");
            iframe.style.cssText = "width:100%;height:600px;border:1px solid #e5e7eb;border-radius:6px;background:#fff;margin-top:6px;display:block;";
            iframe.title = "Report preview";
            iframe.setAttribute("sandbox", "allow-same-origin allow-popups allow-popups-to-escape-sandbox");
            previewSlot.appendChild(iframe);
            // Use srcdoc property (works in modern Chromium / Office WebView2)
            try { iframe.srcdoc = reportHtml; }
            catch (_) {
              // Fallback: data URL (rare path)
              iframe.src = "data:text/html;charset=utf-8," + encodeURIComponent(reportHtml);
            }
            previewSlot.style.display = "block";
            previewSlot.dataset.open = "1";
            previewBtn.textContent = "✕ Close preview";
          });
        }
        // Wire up the PDF button — POSTs the HTML to /api/render-pdf, gets back
        // a real PDF blob, triggers a download. Falls back gracefully if the
        // server says the Browser binding isn't enabled yet.
        // (reportHtml was declared above in the preview block — reuse it.)
        const pdfBtn = linkBubble.querySelector('[data-pdf-action="download"]');
        const pdfStatus = linkBubble.querySelector(".chip-pdf-status");
        pdfBtn.addEventListener("click", async () => {
          if (pdfBtn.disabled) return;
          pdfBtn.disabled = true;
          const originalText = pdfBtn.textContent;
          pdfBtn.textContent = "⏳ Rendering…";
          pdfStatus.textContent = "this can take 5-15s the first time";
          pdfStatus.style.color = "#9ca3af";
          try {
            const resp = await fetch(API + "/api/render-pdf", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ html: reportHtml, filename: baseName }),
            });
            if (!resp.ok) {
              const err = await resp.json().catch(() => ({}));
              throw new Error(err.error || "HTTP " + resp.status);
            }
            const pdfBlob = await resp.blob();
            const pdfUrl = URL.createObjectURL(pdfBlob);
            // Trigger download via a hidden anchor
            const a = document.createElement("a");
            a.href = pdfUrl;
            a.download = baseName + ".pdf";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(pdfUrl), 30000);
            pdfBtn.textContent = "✓ PDF downloaded";
            pdfStatus.textContent = "";
            setTimeout(() => { pdfBtn.textContent = originalText; pdfBtn.disabled = false; }, 3500);
          } catch (e) {
            console.warn("PDF render failed:", e);
            pdfBtn.textContent = originalText;
            pdfBtn.disabled = false;
            pdfStatus.textContent = "PDF unavailable — use the HTML download and Print → Save as PDF instead";
            pdfStatus.style.color = "#b45309";
          }
        });
      } catch (e) {
        console.warn("HTML report blob failed:", e);
      }
    }

    // Client-side actions (format_active_sheet, …). Descriptor falls back
    // to the persisted lastGrid if the worker didn't include one.
    for (const action of (data.actions || [])) {
      try {
        await runClientAction(action, data.gridDescriptor);
      } catch (e) {
        if (isLostFocusError(e)) {
          addRetryBanner(
            "Action \"" + (action && action.type) + "\" is pending.",
            () => runClientAction(action, data.gridDescriptor)
          );
        } else {
          addMsg("error", "Action failed (" + (action && action.type) + "): " + (e.message || e));
        }
      }
    }
  } catch (e) {
    typingBubble.classList.remove("typing");
    typingBubble.remove();
    addMsg("error", e.message || String(e));
  } finally {
    els.send.disabled = false;
    els.input.focus();
  }
}

// ── Client-side action dispatcher ──────────────────────────────────────────
// Worker returns an `actions` array for things it can't execute itself
// (anything that needs Office.js). Each action is `{ type, ... }`. Right
// now only `format_active_sheet` is supported.
async function runClientAction(action, fallbackDescriptor) {
  if (!action || !action.type) return;
  if (action.type === "format_active_sheet") {
    // Descriptor precedence: worker-attached → fresh in-turn descriptor →
    // persisted lastGrid. Any of the three lets us render a POV-aware title.
    let d = action.descriptor || fallbackDescriptor || null;
    if (!d) d = await loadJson(GRID_KEY);
    await formatActiveSheetAsReport(d);
    return;
  }
  if (action.type === "clean_active_sheet") {
    await cleanActiveSheetZeros();
    return;
  }
  if (action.type === "transform_to_smartview") {
    await transformActiveSheetToSmartView();
    return;
  }
  if (action.type === "edit_sheet") {
    await applyEditSheetActionWithPreview(action);
    return;
  }
  if (action.type === "write_inplace_columns") {
    // Write Δ$ / Δ% columns to the right of an existing form / ad-hoc.
    // Skip-1 gap between data and analysis cols → SmartView Refresh
    // leaves the analysis alone. Headers go on the same row the user's
    // data uses, values written per dataRow.rowIndex.
    try {
      const sheetName = action.sheetName;
      const startCol = action.startCol | 0;
      const headers = action.headers && action.headers[0] || [];
      const headerRowIndex = action.headerRowIndex | 0;
      const dataRows = Array.isArray(action.rows) ? action.rows : [];
      await Excel.run(async (ctx) => {
        const sheet = sheetName
          ? ctx.workbook.worksheets.getItem(sheetName)
          : ctx.workbook.worksheets.getActiveWorksheet();
        // Header
        if (headers.length) {
          const hdrRange = sheet.getRangeByIndexes(headerRowIndex, startCol, 1, headers.length);
          hdrRange.values = [headers];
          hdrRange.format.font.bold = true;
        }
        // Build the data 2D array indexed by absolute rowIndex so
        // gaps (separator rows) stay blank.
        if (dataRows.length) {
          const maxRow = Math.max(...dataRows.map(r => r.rowIndex));
          const minRow = Math.min(...dataRows.map(r => r.rowIndex));
          const width = headers.length || 2;
          const block = [];
          for (let r = minRow; r <= maxRow; r++) block.push(new Array(width).fill(""));
          for (const r of dataRows) {
            block[r.rowIndex - minRow] = r.values.map(v => (v === "" || v == null) ? "" : v);
          }
          const valRange = sheet.getRangeByIndexes(minRow, startCol, block.length, width);
          valRange.values = block;
          // Format the Δ% column (second one) as percentage.
          if (width >= 2) {
            const pctRange = sheet.getRangeByIndexes(minRow, startCol + 1, block.length, 1);
            pctRange.numberFormat = [["0.0%"]];
          }
          // Format Δ$ column as accounting / thousands separator.
          const moneyRange = sheet.getRangeByIndexes(minRow, startCol, block.length, 1);
          moneyRange.numberFormat = [["#,##0;(#,##0)"]];
        }
      });
    } catch (e) {
      console.warn("write_inplace_columns failed:", e);
      addMsg("error", "Couldn't write the variance columns: " + (e.message || e));
    }
    return;
  }
  if (action.type === "navigate_form") {
    await runNavigateFormAction(action);
    return;
  }
  if (action.type === "poll_job") {
    // Long-running NSPB job (rule submit, snapshot export, etc).
    // Append a new bubble that will be rewritten on each tick with
    // live status + elapsed time. No await — let it run async so the
    // chat input stays responsive while the job runs.
    const liveBubble = addMsg("assistant", "⏳ Starting…", { skipPersist: true });
    if (liveBubble) {
      pollJobStatus({
        bubble: liveBubble,
        jobId: action.jobId,
        label: action.label || "Job",
        intervalMs: action.intervalMs || 5000,
        timeoutMs: action.timeoutMs || 30 * 60 * 1000,
        onDone: () => {
          // After the job finishes, auto-refresh the Status tab so the
          // user sees the new snapshot / job in the lists.
          try { renderStatusTab && renderStatusTab(); } catch (_) {}
        }
      });
    }
    return;
  }
  console.warn("Unknown client action:", action.type);
}

// ── edit_active_sheet — preview UI + Excel.run executor ───────────────
// Show a preview chip ("Apply N changes") + plain-English summary.
// User clicks "Apply" → we run the operations via Excel.run; "Cancel" → no-op.
async function applyEditSheetActionWithPreview(action) {
  const ops = Array.isArray(action.operations) ? action.operations : [];
  if (!ops.length) return;
  const summary = action.summary || `${ops.length} change${ops.length === 1 ? "" : "s"}`;
  const opLines = ops.map((op, i) => `<li><b>${i + 1}.</b> ${describeEditOp(op)}</li>`).join("");
  const bubble = addMsg("assistant", "✏️ Edit preview");
  bubble.innerHTML = `
    <div style="font-size:12.5px; line-height:1.5; max-width:100%;">
      <div style="margin-bottom:8px;"><b>${escapeHtml(summary)}</b></div>
      <ol style="margin:0 0 10px 18px; padding:0; color:#374151; font-size:11.5px;">${opLines}</ol>
      <div class="chip-row" style="margin-top:6px;align-items:center;flex-wrap:wrap;gap:5px;">
        <button class="chip-btn chip-download" data-edit-action="apply">✓ Apply</button>
        <button class="chip-btn" data-edit-action="cancel">✕ Cancel</button>
        <span class="chip-edit-status" style="font-size:10.5px;color:#9ca3af;line-height:1.3;"></span>
      </div>
    </div>`;
  const applyBtn  = bubble.querySelector('[data-edit-action="apply"]');
  const cancelBtn = bubble.querySelector('[data-edit-action="cancel"]');
  const statusEl  = bubble.querySelector(".chip-edit-status");
  cancelBtn.addEventListener("click", () => {
    applyBtn.disabled = true; cancelBtn.disabled = true;
    statusEl.textContent = "cancelled";
    statusEl.style.color = "#9ca3af";
  });
  applyBtn.addEventListener("click", async () => {
    if (applyBtn.disabled) return;
    applyBtn.disabled = true; cancelBtn.disabled = true;
    statusEl.textContent = "applying…";
    statusEl.style.color = "#9ca3af";
    try {
      const result = await runEditSheetOps(action.sheetName, ops);
      statusEl.textContent = `✓ applied (${result.applied}/${ops.length})`;
      statusEl.style.color = "#047050";
    } catch (e) {
      console.warn("edit_sheet apply failed:", e);
      applyBtn.disabled = false; cancelBtn.disabled = false;
      statusEl.textContent = "error: " + (e.message || String(e));
      statusEl.style.color = "#b45309";
    }
  });
}

function describeEditOp(op) {
  const esc = (s) => escapeHtml(String(s == null ? "" : s));
  switch (op.op) {
    case "add_column":
      if (op.formula)  return `Add column <b>${esc(op.header)}</b> with formula <code>${esc(op.formula)}</code>${op.numberFormat ? ` (format: <code>${esc(op.numberFormat)}</code>)` : ""}`;
      if (op.value !== undefined) return `Add column <b>${esc(op.header)}</b> filled with <code>${esc(op.value)}</code>`;
      return `Add empty column <b>${esc(op.header)}</b>`;
    case "fill":
      return `Fill ${op.range ? `range <code>${esc(op.range)}</code>` : `column <b>${esc(op.column)}</b>`}${op.fillBlanksOnly ? " (blanks only)" : ""} with <code>${esc(op.value)}</code>`;
    case "sort":
      return `Sort by <b>${esc(op.column)}</b> ${op.direction === "asc" ? "ascending" : "descending"}`;
    case "highlight": {
      const cond = op.condition || "match";
      const detail = cond === "between" ? `${op.thresholdLow}..${op.thresholdHigh}`
                   : cond === "top_n" || cond === "bottom_n" ? `n=${op.n}`
                   : op.threshold !== undefined ? String(op.threshold) : "";
      return `Highlight ${op.range ? `range <code>${esc(op.range)}</code>` : `column <b>${esc(op.column)}</b>`} where <b>${esc(cond)}</b>${detail ? " " + esc(detail) : ""} → <span style="display:inline-block;width:10px;height:10px;background:${editColorHex(op.color)};border-radius:2px;vertical-align:middle;"></span> <b>${esc(op.color || "yellow")}</b>`;
    }
    case "format_number":
      return `Apply format <code>${esc(op.numberFormat)}</code> to ${op.range ? `range <code>${esc(op.range)}</code>` : `column <b>${esc(op.column)}</b>`}`;
    case "delete_column":
      return `Delete column <b>${esc(op.column)}</b>`;
    case "rename_header":
      return `Rename column <b>${esc(op.column)}</b> → <b>${esc(op.header)}</b>`;
    default:
      return `<i>unknown op: ${esc(op.op)}</i>`;
  }
}

function editColorHex(name) {
  const m = {
    red: "#fca5a5", green: "#86efac", yellow: "#fde68a",
    orange: "#fdba74", blue: "#93c5fd", gray: "#d1d5db"
  };
  return m[name] || m.yellow;
}

function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// Map an A1-letter or HEADER name to a 0-based column index given the
// header row read from the active sheet. Falls through to letter parse.
function resolveColumnIndex(ref, headers) {
  if (ref == null) return -1;
  const s = String(ref).trim();
  if (!s) return -1;
  // Header match (case-insensitive)
  const h = headers.findIndex(x => String(x || "").trim().toLowerCase() === s.toLowerCase());
  if (h >= 0) return h;
  // Letter match (A, B, ..., AA)
  const m = s.match(/^[A-Za-z]+$/);
  if (m) {
    const letters = s.toUpperCase();
    let idx = 0;
    for (let i = 0; i < letters.length; i++) idx = idx * 26 + (letters.charCodeAt(i) - 64);
    return idx - 1;
  }
  return -1;
}

function colIdxToLetter(idx) {
  let s = "", n = idx + 1;
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

// Execute edit operations against the active sheet. Returns { applied: N }.
// Each op is best-effort: we log warnings but keep going so a partial
// success is better than rolling everything back.
async function runEditSheetOps(targetSheetName, ops) {
  let applied = 0;
  await Excel.run(async (ctx) => {
    const sheet = targetSheetName
      ? ctx.workbook.worksheets.getItem(targetSheetName)
      : ctx.workbook.worksheets.getActiveWorksheet();
    const used = sheet.getUsedRange();
    used.load(["address", "rowCount", "columnCount", "values"]);
    await ctx.sync();
    let rowCount = used.rowCount || 1;
    let colCount = used.columnCount || 1;
    let headers = (used.values && used.values[0]) ? used.values[0].slice() : [];
    const PASTEL = {
      red: "#FECACA", green: "#BBF7D0", yellow: "#FEF3C7",
      orange: "#FED7AA", blue: "#BFDBFE", gray: "#E5E7EB"
    };
    for (const op of ops) {
      try {
        switch (op.op) {
          case "add_column": {
            // Insert position: append by default
            let insertIdx = colCount; // 0-based index of the new column
            if (op.at && op.at !== "after_last") {
              const m = op.at.match(/^(before|at):(.+)$/i);
              if (m) {
                const ref = m[2].trim();
                const idx = resolveColumnIndex(ref, headers);
                if (idx >= 0) insertIdx = idx;
              }
            }
            const newLetter = colIdxToLetter(insertIdx);
            // If inserting at a position that already has data, shift right
            if (insertIdx < colCount) {
              const insertRange = sheet.getRangeByIndexes(0, insertIdx, rowCount, 1);
              insertRange.insert("Right");
            }
            // Header
            sheet.getRange(`${newLetter}1`).values = [[op.header || ""]];
            // Body — formula or value
            if (rowCount > 1) {
              if (op.formula) {
                const arr = [];
                for (let r = 2; r <= rowCount; r++) {
                  arr.push([op.formula.replace(/\{row\}/g, String(r))]);
                }
                sheet.getRange(`${newLetter}2:${newLetter}${rowCount}`).formulas = arr;
              } else if (op.value !== undefined) {
                const arr = Array(rowCount - 1).fill([op.value]);
                sheet.getRange(`${newLetter}2:${newLetter}${rowCount}`).values = arr;
              }
              if (op.numberFormat) {
                sheet.getRange(`${newLetter}2:${newLetter}${rowCount}`).numberFormat = [[op.numberFormat]];
              }
            }
            // Update local state
            headers.splice(insertIdx, 0, op.header || "");
            colCount = Math.max(colCount + 1, insertIdx + 1);
            applied++;
            break;
          }
          case "fill": {
            let range;
            if (op.range) range = sheet.getRange(op.range);
            else if (op.column) {
              const idx = resolveColumnIndex(op.column, headers);
              if (idx < 0) throw new Error("column not found: " + op.column);
              range = sheet.getRangeByIndexes(1, idx, Math.max(rowCount - 1, 1), 1);
            } else throw new Error("fill needs range or column");
            range.load(["rowCount", "columnCount", "values"]);
            await ctx.sync();
            const rc = range.rowCount, cc = range.columnCount;
            const newVals = [];
            for (let r = 0; r < rc; r++) {
              const row = [];
              for (let c = 0; c < cc; c++) {
                const cur = range.values[r][c];
                if (op.fillBlanksOnly && cur !== null && cur !== "" && cur !== undefined) {
                  row.push(cur);
                } else {
                  row.push(op.value);
                }
              }
              newVals.push(row);
            }
            range.values = newVals;
            applied++;
            break;
          }
          case "sort": {
            const idx = resolveColumnIndex(op.column, headers);
            if (idx < 0) throw new Error("column not found: " + op.column);
            const dataRange = sheet.getRangeByIndexes(1, 0, Math.max(rowCount - 1, 1), colCount);
            dataRange.sort.apply(
              [{ key: idx, ascending: op.direction !== "desc" }],
              false, true, "Normal"
            );
            applied++;
            break;
          }
          case "highlight": {
            let range;
            if (op.range) range = sheet.getRange(op.range);
            else if (op.column) {
              const idx = resolveColumnIndex(op.column, headers);
              if (idx < 0) throw new Error("column not found: " + op.column);
              range = sheet.getRangeByIndexes(1, idx, Math.max(rowCount - 1, 1), 1);
            } else throw new Error("highlight needs range or column");
            range.load(["rowCount", "columnCount", "values"]);
            await ctx.sync();
            const fillColor = PASTEL[op.color] || PASTEL.yellow;
            const rc = range.rowCount, cc = range.columnCount;
            for (let r = 0; r < rc; r++) {
              for (let c = 0; c < cc; c++) {
                const v = range.values[r][c];
                let hit = false;
                switch (op.condition) {
                  case "greater_than": hit = Number(v) > Number(op.threshold); break;
                  case "less_than":    hit = Number(v) < Number(op.threshold); break;
                  case "equals":       hit = String(v) === String(op.threshold); break;
                  case "between":      hit = Number(v) >= Number(op.thresholdLow) && Number(v) <= Number(op.thresholdHigh); break;
                  case "negative":     hit = Number(v) < 0; break;
                  case "positive":     hit = Number(v) > 0; break;
                  case "blank":        hit = v === null || v === "" || v === undefined; break;
                  case "not_blank":    hit = v !== null && v !== "" && v !== undefined; break;
                  case "contains":     hit = String(v).toLowerCase().includes(String(op.threshold).toLowerCase()); break;
                }
                if (hit) {
                  range.getCell(r, c).format.fill.color = fillColor;
                }
              }
            }
            applied++;
            break;
          }
          case "format_number": {
            let range;
            if (op.range) range = sheet.getRange(op.range);
            else if (op.column) {
              const idx = resolveColumnIndex(op.column, headers);
              if (idx < 0) throw new Error("column not found: " + op.column);
              range = sheet.getRangeByIndexes(1, idx, Math.max(rowCount - 1, 1), 1);
            } else throw new Error("format_number needs range or column");
            range.load(["rowCount", "columnCount"]);
            await ctx.sync();
            const fmt = Array(range.rowCount).fill(Array(range.columnCount).fill(op.numberFormat));
            range.numberFormat = fmt;
            applied++;
            break;
          }
          case "delete_column": {
            const idx = resolveColumnIndex(op.column, headers);
            if (idx < 0) throw new Error("column not found: " + op.column);
            const colRange = sheet.getRangeByIndexes(0, idx, rowCount, 1);
            colRange.delete("Left");
            headers.splice(idx, 1);
            colCount = Math.max(colCount - 1, 0);
            applied++;
            break;
          }
          case "rename_header": {
            const idx = resolveColumnIndex(op.column, headers);
            if (idx < 0) throw new Error("column not found: " + op.column);
            sheet.getRangeByIndexes(0, idx, 1, 1).values = [[op.header || ""]];
            headers[idx] = op.header || "";
            applied++;
            break;
          }
        }
        await ctx.sync();
      } catch (e) {
        console.warn(`edit op '${op.op}' failed:`, e);
      }
    }
  });
  return { applied };
}

// Read the currently-active sheet's values + name for analysis prompts.
// Capped at 200 rows × 30 cols so we don't blow the chat body / Gemini context
// on accidental selection of a huge sheet. Returns null when Office.js can't
// see an active workbook (lost focus, etc.) — caller treats that as "no
// analysis context available".
async function readActiveSheetForAnalysis() {
  return await Excel.run(async (ctx) => {
    const sheet = ctx.workbook.worksheets.getActiveWorksheet();
    sheet.load("name");
    const used = sheet.getUsedRange(true);
    used.load(["values", "rowCount", "columnCount"]);
    // Read the user's current selection too — needed for navigate's
    // `explain_cell` action ("which dims are at the cursor?").
    const sel = ctx.workbook.getSelectedRange();
    sel.load(["address", "rowIndex", "columnIndex", "rowCount", "columnCount"]);
    await ctx.sync();
    if (!used.rowCount || !used.columnCount) return null;
    const maxR = Math.min(used.rowCount, 200);
    const maxC = Math.min(used.columnCount, 30);
    const values = [];
    for (let r = 0; r < maxR; r++) {
      const row = used.values[r] || [];
      values.push(row.slice(0, maxC));
    }
    // Selection in row/col coordinates RELATIVE TO the sheet (0-based).
    // `address` is the absolute Excel ref like 'Sheet1!B7'. We keep both
    // so the worker can do quick lookups against `values` without
    // re-parsing A1 notation.
    const selection = sel ? {
      address: sel.address || null,
      rowIndex: typeof sel.rowIndex === "number" ? sel.rowIndex : null,
      columnIndex: typeof sel.columnIndex === "number" ? sel.columnIndex : null,
      rowCount: sel.rowCount || 1,
      columnCount: sel.columnCount || 1,
    } : null;
    return {
      sheetName: sheet.name,
      rowCount: used.rowCount,
      columnCount: used.columnCount,
      values,
      truncated: used.rowCount > maxR || used.columnCount > maxC,
      selection,
    };
  });
}

// ── Excel grid write-back — minimal raw grid ───────────────────────────────
// Ad-hoc queries land as a plain grid with only the first row + first column
// bolded. Keeps copy/paste easy and the turn-around fast. If the user wants
// a styled report, they explicitly ask ("format this as a report") and
// Gemini invokes the `format_active_sheet` tool, which runs
// `formatActiveSheetAsReport` against whatever sheet is currently active.
// Parse a delimited text dump (DATAEXPORT / CSV / TSV) into a 2D array.
// Auto-detects the delimiter from the first non-empty line (comma, tab, or
// semicolon), honors double-quoted fields with embedded delimiters/quotes,
// and coerces bare numeric cells to numbers so Excel treats them as values.
function parseDelimited(text) {
  const raw = String(text || "").replace(/\r\n?/g, "\n").replace(/\n+$/, "");
  if (!raw) return [];
  const lines = raw.split("\n");
  const firstData = lines.find(l => l.trim().length) || "";
  let delim = ",";
  const tabs = (firstData.match(/\t/g) || []).length;
  const semis = (firstData.match(/;/g) || []).length;
  const commas = (firstData.match(/,/g) || []).length;
  if (tabs >= commas && tabs >= semis && tabs > 0) delim = "\t";
  else if (semis > commas && semis > 0) delim = ";";

  const parseLine = (line) => {
    const out = [];
    let cur = "", inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQ) {
        if (ch === '"') {
          if (line[i + 1] === '"') { cur += '"'; i++; }
          else inQ = false;
        } else cur += ch;
      } else if (ch === '"') {
        inQ = true;
      } else if (ch === delim) {
        out.push(cur); cur = "";
      } else cur += ch;
    }
    out.push(cur);
    return out.map(c => {
      const t = c.trim();
      if (t !== "" && /^-?\d+(\.\d+)?$/.test(t)) return Number(t);
      return c;
    });
  };

  return lines.filter(l => l.length).map(parseLine);
}

// ── Per-sheet grid memory ────────────────────────────────────────────────────
// Every grid we write remembers its descriptor UNDER ITS SHEET NAME, so
// "add FY26" / "quita GBP" / "submit data" operate on the grid the user is
// LOOKING AT — not just the last one created. Resolving which grid is
// active only reads the sheet NAME (instant), never the cell values.
async function saveGridDescriptor(desc) {
  if (!desc || !desc.sheetName) return;
  try { await saveJson(GRID_KEY, desc); } catch (_) {}
  try {
    const reg = (await loadJson(GRID_REG_KEY)) || {};
    reg[desc.sheetName] = desc;
    const names = Object.keys(reg);
    if (names.length > 20) {   // LRU cap — oldest asOf out first
      names.sort((a, b) => (((reg[a] && reg[a].asOf) || 0) - (((reg[b] && reg[b].asOf) || 0))));
      for (const n of names.slice(0, names.length - 20)) delete reg[n];
    }
    await saveJson(GRID_REG_KEY, reg);
  } catch (_) {}
}

async function activeSheetNameFast() {
  try {
    let name = null;
    await Excel.run(async (ctx) => {
      const s = ctx.workbook.worksheets.getActiveWorksheet();
      s.load("name");
      await ctx.sync();
      name = s.name;
    });
    return name;
  } catch (_) { return null; }
}

async function descriptorForActiveSheet(fallback) {
  const name = await activeSheetNameFast();
  if (name) {
    try {
      const reg = await loadJson(GRID_REG_KEY);
      if (reg && reg[name]) return reg[name];
    } catch (_) {}
  }
  return fallback || null;
}

// Self-healing for ORPHAN form sheets: a "Form_X" tab opened days ago (or
// with an older build) has no registry entry, so "collapse department" on it
// dead-ends with "no active grid" while the user is STARING at a form.
// Re-derive the form from the sheet name, fetch a fresh descriptor via
// /api/open-form (cache makes it fast), register it, and carry on.
async function regenerateFormDescriptor(sheetName) {
  try {
    if (!sheetName || !/^Form_/i.test(sheetName)) return null;
    const base = sheetName.replace(/^Form_/i, "").replace(/\s*\(\d+\)\s*$/, "");
    const [tkb, fw, appCfg] = await Promise.all([
      loadJson(TENANT_KB_KEY), loadJson(FORMS_KEY), loadJson(APP_CONFIG_KEY)
    ]);
    const all = (((fw && fw.forms) || [])).concat((tkb && tkb.forms) || []);
    // Sheet names are sanitized + truncated to 25 chars — prefix-match.
    const norm = s => String(s || "").replace(/[:\\/\?\*\[\]]/g, "-").toLowerCase().trim();
    const nb = norm(base);
    const hit = all.find(f => {
      const nf = norm(f.name);
      return nf === nb || nf.startsWith(nb) || nb.startsWith(nf.slice(0, 20));
    });
    if (!hit) return null;
    const r = await fetch(API + "/api/open-form", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        settings: window.NSPB_SETTINGS,
        form_name: hit.name,
        forms: (fw && fw.forms) || [],
        tenantKb: tkb || null,
        appConfig: (appCfg && appCfg.cubes) ? appCfg : null
      })
    });
    const d = await r.json();
    if (d && d.ok && d.gridDescriptor) {
      d.gridDescriptor.sheetName = sheetName;   // bind to THIS tab, not a new one
      await saveGridDescriptor(d.gridDescriptor);
      return d.gridDescriptor;
    }
  } catch (_) {}
  return null;
}

// Grid state resolution, in trust order: (1) this sheet's registry entry,
// (2) regenerated descriptor for an orphan Form_* sheet, (3) the global
// last grid — last because it may point at a DIFFERENT sheet.
async function resolveGridState(globalLastGrid) {
  const name = await activeSheetNameFast();
  if (name) {
    try {
      const reg = await loadJson(GRID_REG_KEY);
      if (reg && reg[name]) return reg[name];
    } catch (_) {}
    if (/^Form_/i.test(name)) {
      const regen = await regenerateFormDescriptor(name);
      if (regen) return regen;
    }
  }
  return globalLastGrid || null;
}

// SmartView per-cell status bitmask (parallel to types[]): bit 0x2 marks a
// read-only/blocked form cell. Empty/missing status = assume writable (older
// worker builds don't send statuses — behavior falls back to types-only).
function isCellBlocked(status) {
  if (status === null || status === undefined || status === "") return false;
  const n = parseInt(status, 10);
  if (isNaN(n)) return false;
  return (n & 2) !== 0;
}

async function writeGridToSheet(baseName, grid, descriptor, opts) {
  // Backwards compat: callers used to pass `inPlace` as a 4th positional arg.
  const o = (opts && typeof opts === "object" && !Array.isArray(opts))
    ? opts
    : { inPlace: !!opts };
  const inPlace = !!o.inPlace;
  const format = o.format || null;
  const sectionRows = Array.isArray(o.sectionRows) ? o.sectionRows : [];
  const sectionColors = (o.sectionColors && typeof o.sectionColors === "object") ? o.sectionColors : {};
  const bulletRows = (o.bulletRows && typeof o.bulletRows === "object") ? o.bulletRows : {};
  const kpiRows = Array.isArray(o.kpiRows) ? o.kpiRows : [];
  const tableHeaderRows = (o.tableHeaderRows && typeof o.tableHeaderRows === "object") ? o.tableHeaderRows : {};
  const tableDataRows = (o.tableDataRows && typeof o.tableDataRows === "object") ? o.tableDataRows : {};
  const rowFills = (o.rowFills && typeof o.rowFills === "object") ? o.rowFills : {};
  const rowFillSpans = (o.rowFillSpans && typeof o.rowFillSpans === "object") ? o.rowFillSpans : {};

  if (!grid || !grid.length) return null;
  const rowCount = grid.length;
  const colCount = Math.max.apply(null, grid.map(r => r.length));
  if (!colCount) return null;

  const padded = grid.map(r => {
    const out = r.slice();
    while (out.length < colCount) out.push(null);
    return out;
  });

  // Final sheet name actually written — may differ from baseName when the
  // non-inPlace path uniquifies ("Form_X" → "Form_X (2)"). Callers that
  // persist grid descriptors MUST sync descriptor.sheetName to this, or the
  // next modify_grid rewrites the wrong sheet.
  let _finalName = sanitizeSheetName(baseName || "Ad-hoc");

  await Excel.run(async (ctx) => {
    let sheet;
    const desired = sanitizeSheetName(baseName || "Ad-hoc");
    if (inPlace) {
      // modify_grid: keep working in the same sheet. Look up by name; if it
      // was deleted/renamed by the user, fall back to creating a fresh one.
      const existing = ctx.workbook.worksheets.getItemOrNullObject(desired);
      existing.load("name");
      await ctx.sync();
      if (!existing.isNullObject) {
        sheet = existing;
        // Wipe previous contents so a smaller new grid doesn't leave stale
        // rows/cols behind. clear() drops values + formats in one shot.
        const used = sheet.getUsedRange();
        used.clear();
      } else {
        sheet = ctx.workbook.worksheets.add(desired);
      }
    } else {
      const sheetName = await uniqueSheetName(ctx, desired);
      sheet = ctx.workbook.worksheets.add(sheetName);
      _finalName = sheetName;
    }

    sheet.getRangeByIndexes(0, 0, rowCount, colCount).values = padded;

    if (format === "analysis") {
      // ── Rich, presentation-grade styling for analysis sheets ────────
      // Layout:
      //   Row 0 — Title bar: dark slate fill, large white text, full width
      //   Row 1 — Subtitle: gray italic small
      //   Row 2 — spacer
      //   Section blocks: colored band with bold heading + colored left
      //                    accent strip on bullet rows + soft tinted fill
      //
      // Color presets per section type (semantic):
      //   good    = green   (recommendations, actions)
      //   bad     = red     (anomalies, issues, questions)
      //   warn    = amber   (variance, gaps, drivers)
      //   info    = blue    (trends, growth, patterns)
      //   purple  = purple  (concentration, mix, pareto)
      //   neutral = slate   (summary, exec, data quality)
      //   slate   = darker  (kpis, metrics)
      const PALETTE = {
        good:    { band: "#065f46", bandText: "#ffffff", soft: "#ecfdf5", accent: "#10b981" },
        bad:     { band: "#991b1b", bandText: "#ffffff", soft: "#fef2f2", accent: "#ef4444" },
        warn:    { band: "#b45309", bandText: "#ffffff", soft: "#fffbeb", accent: "#f59e0b" },
        info:    { band: "#1e40af", bandText: "#ffffff", soft: "#eff6ff", accent: "#3b82f6" },
        purple:  { band: "#6b21a8", bandText: "#ffffff", soft: "#faf5ff", accent: "#a855f7" },
        neutral: { band: "#0f172a", bandText: "#ffffff", soft: "#f8fafc", accent: "#475569" },
        slate:   { band: "#1f2937", bandText: "#ffffff", soft: "#f1f5f9", accent: "#64748b" },
      };

      // Title row — large text on dark fill, white
      try {
        const titleRow = sheet.getRangeByIndexes(0, 0, 1, colCount);
        titleRow.format.fill.color = "#0f172a";
        titleRow.format.font.color = "#ffffff";
        titleRow.format.font.bold = true;
        titleRow.format.font.size = 18;
        titleRow.format.font.name = "Calibri Light";
        titleRow.format.rowHeight = 38;
        try { titleRow.format.verticalAlignment = "Center"; } catch (_) {}
      } catch (_) {}

      // Subtitle row 1 — small italic gray
      try {
        const sub = sheet.getRangeByIndexes(1, 0, 1, colCount);
        sub.format.font.color = "#6b7280";
        sub.format.font.italic = true;
        sub.format.font.size = 10;
        sub.format.font.name = "Calibri Light";
        sub.format.rowHeight = 18;
      } catch (_) {}

      // Section bands — denser, smaller
      for (const r of sectionRows) {
        if (r >= rowCount) continue;
        const preset = PALETTE[sectionColors[r]] || PALETTE.neutral;
        try {
          const band = sheet.getRangeByIndexes(r, 0, 1, colCount);
          band.format.fill.color = preset.band;
          band.format.font.color = preset.bandText;
          band.format.font.bold = true;
          band.format.font.size = 12;
          band.format.font.name = "Calibri Light";
          band.format.rowHeight = 26;
          try { band.format.verticalAlignment = "Center"; } catch (_) {}
          try { band.format.indentLevel = 1; } catch (_) {}
        } catch (_) {}
      }

      // ── KPI band — labels (small) + values (medium-large) ──
      for (const k of kpiRows) {
        if (!k || k.labelRow == null) continue;
        try {
          const lblRange = sheet.getRangeByIndexes(k.labelRow, 0, 1, k.slots);
          lblRange.format.font.size = 9;
          lblRange.format.font.bold = true;
          lblRange.format.font.color = "#6b7280";
          lblRange.format.font.name = "Calibri";
          lblRange.format.rowHeight = 16;
          try { lblRange.format.horizontalAlignment = "Center"; } catch (_) {}

          for (let i = 0; i < k.slots; i++) {
            const tone = k.tones[i] || "neutral";
            const preset = PALETTE[tone] || PALETTE.neutral;
            try {
              const cell = sheet.getRangeByIndexes(k.valueRow, i, 1, 1);
              cell.format.fill.color = preset.soft;
              cell.format.font.color = preset.band;
              cell.format.font.bold = true;
              cell.format.font.size = 18;
              cell.format.font.name = "Calibri Light";
              cell.format.horizontalAlignment = "Center";
              try { cell.format.verticalAlignment = "Center"; } catch (_) {}
              const top = cell.format.borders.getItem("EdgeTop");
              top.style = "Continuous"; top.color = preset.accent; top.weight = "Thick";
            } catch (_) {}
          }
          try {
            const valueRange = sheet.getRangeByIndexes(k.valueRow, 0, 1, k.slots);
            valueRange.format.rowHeight = 40;
          } catch (_) {}
        } catch (_) {}
      }

      // ── Table HEADER rows — dark band, white bold text ──────
      for (const r in tableHeaderRows) {
        const rr = parseInt(r, 10);
        if (isNaN(rr) || rr >= rowCount) continue;
        const tone = tableHeaderRows[r];
        const preset = PALETTE[tone] || PALETTE.neutral;
        try {
          const head = sheet.getRangeByIndexes(rr, 0, 1, colCount);
          head.format.fill.color = preset.band;
          head.format.font.color = "#ffffff";
          head.format.font.bold = true;
          head.format.font.size = 10;
          head.format.font.name = "Calibri";
          head.format.rowHeight = 22;
          try { head.format.verticalAlignment = "Center"; } catch (_) {}
          try {
            sheet.getRangeByIndexes(rr, 0, 1, 1).format.horizontalAlignment = "Left";
            if (colCount > 1) sheet.getRangeByIndexes(rr, 1, 1, colCount - 1).format.horizontalAlignment = "Right";
          } catch (_) {}
        } catch (_) {}
      }

      // ── Table DATA rows — alternating zebra + tone-tinted rows ──
      // Smaller font, autofit row heights at the bottom in one batch.
      const TABLE_ZEBRA = ["#ffffff", "#fafafa"];
      let zebraIdx = 0;
      for (const r in tableDataRows) {
        const rr = parseInt(r, 10);
        if (isNaN(rr) || rr >= rowCount) continue;
        const tone = tableDataRows[r];
        const preset = PALETTE[tone] || null;
        try {
          const row = sheet.getRangeByIndexes(rr, 0, 1, colCount);
          row.format.fill.color = preset ? preset.soft : TABLE_ZEBRA[zebraIdx % 2];
          zebraIdx++;
          row.format.font.size = 10;
          row.format.font.color = "#111827";
          row.format.font.name = "Calibri";
          try { row.format.verticalAlignment = "Center"; } catch (_) {}
          try {
            sheet.getRangeByIndexes(rr, 0, 1, 1).format.horizontalAlignment = "Left";
            if (colCount > 1) sheet.getRangeByIndexes(rr, 1, 1, colCount - 1).format.horizontalAlignment = "Right";
          } catch (_) {}
          try {
            const bot = row.format.borders.getItem("EdgeBottom");
            bot.style = "Continuous"; bot.color = "#e5e7eb"; bot.weight = "Thin";
          } catch (_) {}
          if (preset) {
            try {
              const lead = sheet.getRangeByIndexes(rr, 0, 1, 1);
              const left = lead.format.borders.getItem("EdgeLeft");
              left.style = "Continuous"; left.color = preset.accent; left.weight = "Thick";
            } catch (_) {}
          }
        } catch (_) {}
      }

      // Bullet rows — soft tinted fill + colored left accent. Smaller font.
      // Auto-fit row height so wrapped bullets show all their text without
      // truncation OR excessive whitespace.
      const bulletRowIdxs = [];
      for (const r in bulletRows) {
        const rr = parseInt(r, 10);
        if (isNaN(rr) || rr >= rowCount) continue;
        bulletRowIdxs.push(rr);
        const preset = PALETTE[bulletRows[r]] || PALETTE.neutral;
        try {
          const row = sheet.getRangeByIndexes(rr, 0, 1, colCount);
          row.format.fill.color = preset.soft;
          row.format.font.size = 10;
          row.format.font.color = "#1f2937";
          row.format.font.name = "Calibri";
          try { row.format.verticalAlignment = "Top"; } catch (_) {}

          try {
            const colA = sheet.getRangeByIndexes(rr, 0, 1, 1);
            colA.values = [["●"]];
            colA.format.font.color = preset.accent;
            colA.format.font.size = 11;
            colA.format.font.bold = true;
            colA.format.horizontalAlignment = "Center";
          } catch (_) {}

          try {
            const colB = sheet.getRangeByIndexes(rr, 1, 1, colCount - 1);
            colB.format.font.size = 10;
            try { colB.format.wrapText = true; } catch (_) {}
          } catch (_) {}

          try {
            const accentRange = sheet.getRangeByIndexes(rr, 0, 1, 1);
            const left = accentRange.format.borders.getItem("EdgeLeft");
            left.style = "Continuous";
            left.color = preset.accent;
            left.weight = "Thick";
          } catch (_) {}
        } catch (_) {}
      }

      // Column widths — A narrow (bullet/account), B wide (text/account names),
      // C-F narrower numeric columns. With smaller fonts, more compact widths.
      try {
        sheet.getRangeByIndexes(0, 0, 1, 1).format.columnWidth = 26;
        sheet.getRangeByIndexes(0, 1, 1, 1).format.columnWidth = 320;
        if (colCount > 2) sheet.getRangeByIndexes(0, 2, 1, 1).format.columnWidth = 110;
        if (colCount > 3) sheet.getRangeByIndexes(0, 3, 1, 1).format.columnWidth = 110;
        if (colCount > 4) sheet.getRangeByIndexes(0, 4, 1, 1).format.columnWidth = 110;
        if (colCount > 5) sheet.getRangeByIndexes(0, 5, 1, 1).format.columnWidth = 90;
      } catch (_) {}

      // Auto-fit ALL data + bullet rows in one batch (much faster than
      // per-row autofit). This sets each row to exactly the height needed
      // for its wrapped content — no truncation, no padding waste.
      const allAutofitRows = new Set([...bulletRowIdxs, ...Object.keys(tableDataRows).map(Number)]);
      try {
        for (const rr of allAutofitRows) {
          if (rr >= rowCount) continue;
          try { sheet.getRangeByIndexes(rr, 0, 1, colCount).format.autofitRows(); } catch (_) {}
        }
      } catch (_) {}

      // Hide gridlines — cleaner presentation
      try { sheet.gridlines = false; } catch (_) {}

      // ── Insert chart for the FIRST table that has at least 3 numeric data
      //    rows and a likely "variance" or "value" column. We pick the LAST
      //    column by default (typically Var $ or Var %). The chart is a
      //    horizontal bar chart (best for ranking many accounts) placed to
      //    the right of the table.
      try {
        const tableHeaderRowIdxs = Object.keys(tableHeaderRows).map(Number).sort((a,b)=>a-b);
        for (const headerIdx of tableHeaderRowIdxs) {
          // Find consecutive data rows below the header
          let firstData = -1, lastData = -1;
          for (const r in tableDataRows) {
            const rr = parseInt(r, 10);
            if (isNaN(rr)) continue;
            if (rr > headerIdx && (firstData < 0 || rr === lastData + 1 || firstData < 0)) {
              if (firstData < 0) firstData = rr;
              lastData = rr;
            }
          }
          if (firstData < 0 || lastData - firstData + 1 < 3) continue;
          // Pick the value column — last column with numeric-looking header
          let valueCol = -1;
          const headerVals = padded[headerIdx];
          for (let c = colCount - 1; c >= 1; c--) {
            const h = String(headerVals[c] || "").toLowerCase();
            if (/var|variance|amount|value|delta|change|\$|%/.test(h)) { valueCol = c; break; }
          }
          if (valueCol < 0) continue;
          // Build category + value ranges
          try {
            const catRange = sheet.getRangeByIndexes(firstData, 0, lastData - firstData + 1, 1);
            const valRange = sheet.getRangeByIndexes(firstData, valueCol, lastData - firstData + 1, 1);
            const chart = sheet.charts.add(Excel.ChartType.barClustered, valRange, "auto");
            chart.title.text = String(headerVals[valueCol] || "Variance");
            chart.title.format.font.size = 12;
            chart.title.format.font.bold = true;
            try { chart.legend.visible = false; } catch (_) {}
            try { chart.dataLabels.showValue = true; chart.dataLabels.format.font.size = 9; } catch (_) {}
            try {
              chart.series.getItemAt(0).setXAxisValues(catRange);
            } catch (_) {}
            // Position chart to the right of the table
            try {
              chart.left = (colCount + 1) * 90;       // ~6 cols × 90pt offset
              chart.top  = headerIdx * 18 + 60;
              chart.width = 360;
              chart.height = Math.max(180, (lastData - firstData + 1) * 22);
            } catch (_) {}
          } catch (_) {}
          break;   // only chart the first table with numeric data
        }
      } catch (_) {}

      await ctx.sync();
      return;
    }

    if (format === "help") {
      // ── Modern, clean styling for inventory / report sheets ──
      // Design principles:
      //   1. Title HUGE (size 22) with subtle accent bar underneath, NO black fill
      //   2. Subtitle / refresh line in light gray italic — secondary info
      //   3. Status pills in TARGETED CELLS, not whole rows, so the data
      //      reads cleanly without screaming pink stripes
      //   4. Headers: dark slate with white text, slightly more padding
      //   5. Body: subtle zebra (white / gray-50), no full-row status fills
      //   6. Tight column widths but row heights generous (28px)
      //   7. Last column ("What X is for") set to softer color + italic when
      //      it's a description column

      // Title row 0 — text in cell A1 only, NO MERGE. Excel lets it overflow
      // visually into empty neighbouring cells, which gives the same effect
      // without the headaches of merged ranges (broken col widths, broken
      // copy/paste, etc.).
      const titleCell = sheet.getRangeByIndexes(0, 0, 1, 1);
      titleCell.format.font.bold = true;
      titleCell.format.font.size = 22;
      titleCell.format.font.color = "#0a0a0a";
      titleCell.format.font.name = "Calibri Light";
      // Accent strip below title (the entire row 0, not the merged range)
      try {
        const titleRow = sheet.getRangeByIndexes(0, 0, 1, colCount);
        const titleBottom = titleRow.format.borders.getItem("EdgeBottom");
        titleBottom.style = "Continuous";
        titleBottom.color = "#1e3a8a";
        titleBottom.weight = "Thick";
      } catch (_) {}

      // Find the column-header row
      let headerRow = -1;
      for (let r = 1; r < rowCount; r++) {
        if (sectionRows.includes(r)) continue;
        const cell = String(padded[r][0] || "").trim();
        if (cell === "" || cell.startsWith("Status legend") || cell.startsWith("Last refreshed") || cell.startsWith("⚠")) continue;
        const restNonEmpty = padded[r].slice(1).some(v => String(v || "").trim() !== "");
        if (restNonEmpty && cell.length < 30) { headerRow = r; break; }
      }

      // Subtitle / metadata rows (Last refreshed / Status legend / ⚠ stats)
      // No merge — just style the whole row, text in col A overflows visually.
      for (let r = 1; r < rowCount && r < (headerRow > 0 ? headerRow : 7); r++) {
        const cell = String(padded[r][0] || "");
        if (!cell.trim()) continue;
        const range = sheet.getRangeByIndexes(r, 0, 1, colCount);
        range.format.font.name = "Calibri Light";
        if (cell.startsWith("⚠")) {
          range.format.font.bold = true;
          range.format.font.size = 11;
          range.format.font.color = "#b45309";  // amber-700, signals "attention"
          range.format.fill.color = "#fffbeb";  // amber-50, very subtle
        } else if (cell.startsWith("Status legend")) {
          range.format.font.size = 10;
          range.format.font.italic = true;
          range.format.font.color = "#9ca3af";  // gray-400
        } else if (cell.startsWith("Last refreshed")) {
          range.format.font.size = 10;
          range.format.font.italic = true;
          range.format.font.color = "#9ca3af";
        } else {
          range.format.font.size = 11;
          range.format.font.color = "#4b5563";  // gray-600
          range.format.font.italic = true;
        }
      }

      // Section divider rows: clean text on light bg. No merge — text overflows.
      for (const r of sectionRows) {
        if (r >= rowCount) continue;
        const range = sheet.getRangeByIndexes(r, 0, 1, colCount);
        range.format.font.bold = true;
        range.format.font.size = 13;
        range.format.font.color = "#0a0a0a";
        range.format.font.name = "Calibri Light";
        range.format.fill.color = "#f3f4f6";   // gray-100, neutral
        try {
          const top = range.format.borders.getItem("EdgeTop");
          top.style = "Continuous"; top.color = "#0a0a0a"; top.weight = "Thin";
        } catch (_) {}
      }

      // Column header row: dark slate with white text — modern & clear
      if (headerRow >= 0) {
        const head = sheet.getRangeByIndexes(headerRow, 0, 1, colCount);
        head.format.fill.color = "#0f172a";    // slate-900 — sleeker than blue-900
        head.format.font.color = "#ffffff";
        head.format.font.bold = true;
        head.format.font.size = 11;
        head.format.font.name = "Calibri";
        head.format.rowHeight = 26;
      }

      // Body rows: subtle zebra ONLY — no full-row status fills (pills go in
      // a single cell instead, see below). Comfortable row height.
      const bodyStart = headerRow >= 0 ? headerRow + 1 : 1;
      for (let r = bodyStart; r < rowCount; r++) {
        if (sectionRows.includes(r)) continue;
        // Status-pill mode: ignore rowFills here. Instead, paint just the
        // status column (col 3 by convention for inventory sheets) below.
        if ((r - bodyStart) % 2 === 1) {
          sheet.getRangeByIndexes(r, 0, 1, colCount).format.fill.color = "#fafafa";
        }
      }

      // ── Status pill: instead of painting the whole row, color JUST the
      // "Status" column when rowFills marks this row. Identify the status
      // column by header text "Status" / "Match" / "Type".
      let statusCol = -1;
      if (headerRow >= 0) {
        for (let c = 0; c < colCount; c++) {
          const h = String(padded[headerRow][c] || "").trim().toLowerCase();
          if (/^(status|match|type|severity)$/i.test(h)) { statusCol = c; break; }
        }
      }
      if (statusCol >= 0) {
        for (let r = bodyStart; r < rowCount; r++) {
          if (sectionRows.includes(r)) continue;
          if (!rowFills[r]) continue;
          const cell = sheet.getRangeByIndexes(r, statusCol, 1, 1);
          cell.format.fill.color = rowFills[r];
          cell.format.font.bold = true;
          cell.format.font.size = 10;
        }
      } else {
        // Fallback: keep legacy row-fill behavior so non-inventory sheets
        // still get their colors.
        for (let r = bodyStart; r < rowCount; r++) {
          if (sectionRows.includes(r)) continue;
          if (rowFills[r]) {
            const span = rowFillSpans[r] && rowFillSpans[r] > 0
              ? Math.min(rowFillSpans[r], colCount)
              : colCount;
            sheet.getRangeByIndexes(r, 0, 1, span).format.fill.color = rowFills[r];
          }
        }
      }

      // Bold the first column for body rows — name reads strong
      if (rowCount > bodyStart) {
        const firstCol = sheet.getRangeByIndexes(bodyStart, 0, rowCount - bodyStart, 1);
        firstCol.format.font.bold = true;
        firstCol.format.font.size = 11;
      }

      // Last column = "What it's for" / description — softer color + italic
      if (rowCount > bodyStart && colCount >= 5) {
        // Heuristic: if header text contains "for" / "description" / "what" / "notes" → italic gray
        const lastHdr = String(padded[headerRow]?.[colCount - 1] || "").toLowerCase();
        if (/for|description|what|notes|reason|why/i.test(lastHdr)) {
          const lastCol = sheet.getRangeByIndexes(bodyStart, colCount - 1, rowCount - bodyStart, 1);
          lastCol.format.font.italic = true;
          lastCol.format.font.color = "#6b7280";  // gray-500
          lastCol.format.font.size = 10.5;
        }
      }

      // ── Cell-level color coding (navigation flow sheets) ──
      //   col 0..3 → row's type color (green/blue/purple/gray)
      //   col 5    → form description (cream/amber soft)
      //   col 6    → attached rules (indigo soft, distinct from form colors)
      // This way a single row visually distinguishes what's a form vs a rule
      // vs a description at a glance.
      if (colCount >= 4) {
        const typeColors = [
          { kw: /^form \(input\)/i,  fill: "#dcfce7", font: "#14532d" },   // green-100
          { kw: /^form \(review\)/i, fill: "#dbeafe", font: "#1e3a8a" },   // blue-100
          { kw: /dashboard/i,        fill: "#f3e8ff", font: "#581c87" },   // purple-100
          { kw: /navigation card/i,  fill: "#f3f4f6", font: "#374151" },   // gray-100
        ];
        const DESC_FILL = "#fefce8";  // yellow-50 (description)
        const RULE_FILL = "#eef2ff";  // indigo-50 (rules / calcs)
        const RULE_FONT = "#3730a3";  // indigo-800
        for (let r = bodyStart; r < rowCount; r++) {
          if (sectionRows.includes(r)) continue;
          if (rowFills[r]) continue;
          const typeCell = String(padded[r][3] || "").trim();
          const hit = typeColors.find(tc => tc.kw.test(typeCell));
          if (hit) {
            const tintSpan = Math.min(4, colCount);
            const range = sheet.getRangeByIndexes(r, 0, 1, tintSpan);
            range.format.fill.color = hit.fill;
            range.format.font.color = hit.font;
          }
          // Form Description column (5) — soft amber fill, no italic
          if (colCount > 5 && String(padded[r][5] || "").trim()) {
            const dRange = sheet.getRangeByIndexes(r, 5, 1, 1);
            dRange.format.fill.color = DESC_FILL;
          }
          // Attached Rules column (6) — indigo, no bold
          if (colCount > 6 && String(padded[r][6] || "").trim()) {
            const rRange = sheet.getRangeByIndexes(r, 6, 1, 1);
            rRange.format.fill.color = RULE_FILL;
            rRange.format.font.color = RULE_FONT;
          }
          // Rule Descriptions column (7) — same indigo, no italic
          if (colCount > 7 && String(padded[r][7] || "").trim()) {
            const rdRange = sheet.getRangeByIndexes(r, 7, 1, 1);
            rdRange.format.fill.color = RULE_FILL;
            rdRange.format.font.color = RULE_FONT;
          }
        }
      }

      // Column widths sized for typical content. 6 cols (Variables) wider on
      // description; 4 cols (Help, Rules, Forms) wider on the middle two.
      const lcName = (desired || "").toLowerCase();
      const isVariables = lcName.includes("variable");
      const isForms = lcName.includes("form");
      const isRules = lcName.includes("rule");
      const isNavigation = lcName.includes("navigation") || lcName.includes("nav");
      const isInventoryNoWrap = isVariables || isForms || isRules;
      // Navigation sheet has 9 cols: Flow | Module | Form/Tab | Type | Cube | FormDesc | RuleNames | RuleDescs | FormID
      const widths = isNavigation
        ? [110, 130, 200, 95, 75, 260, 160, 280, 70]
        : colCount === 6
        ? [110, 95, 70, 100, 320, 220]
        : colCount === 5
        ? (isVariables ? [140, 110, 70, 110, 480] : [110, 220, 100, 280, 220])
        : [120, 280, 320, 320];   // 4-col default
      // Apply explicit widths where defined; for any column without an explicit
      // width, use a sensible MIN_WIDTH so columns don't get squished if Excel
      // auto-fits them too narrow.
      const MIN_WIDTH = 90;
      for (let c = 0; c < colCount; c++) {
        const w = (c < widths.length && widths[c]) ? widths[c] : MIN_WIDTH;
        sheet.getRangeByIndexes(0, c, 1, 1).format.columnWidth = Math.max(w, MIN_WIDTH);
      }
      // Wrap text: NEVER wrap. Long descriptions just clip; user can widen
      // the column or hover to see the full content.
      sheet.getRangeByIndexes(0, 0, rowCount, colCount).format.wrapText = false;

      // Vertical alignment top so wrapped lines don't push tall rows weirdly.
      sheet.getRangeByIndexes(0, 0, rowCount, colCount).format.verticalAlignment = "Top";

      // Modern font across the whole sheet (Calibri Light is universally available
      // on Excel installs and looks cleaner than Arial / default Calibri).
      const all = sheet.getRangeByIndexes(0, 0, rowCount, colCount);
      all.format.font.name = "Calibri Light";

      // Soft borders below header row + between body rows so it reads like a
      // proper table without being heavy. Skip on navigation sheets where the
      // type-color tinting is the primary visual separator.
      if (headerRow >= 0 && !isNavigation) {
        const bottom = sheet.getRangeByIndexes(headerRow, 0, 1, colCount)
          .format.borders.getItem("EdgeBottom");
        bottom.style = "Continuous";
        bottom.color = "#cbd5e1";  // slate-300
      }

      // (Freeze pane intentionally NOT applied — user prefers full free scrolling.)

      // Auto-fit row heights only. Column widths are explicitly set above
      // (with MIN_WIDTH=90 floor); autofit on columns blows them out when
      // a long title or description sits in col A.
      sheet.getUsedRange().format.autofitRows();

      sheet.activate();
    } else if (format === "raw") {
      // Open Form / SmartView output — apply NO grid styling so SmartView's
      // Refresh can re-read it without confusion. EXCEPT: for INPUT forms
      // we paint editable cells yellow (#fef9c3) so users see where they
      // can type values. SmartView ignores fill color on Refresh — this is
      // a UX hint that doesn't break the protocol.
      // Axis-region tinting — mirrors the chat legend so the user SEES which
      // area is rows (blue), column headers (green) and POV (amber). Soft
      // 50-shades; SmartView ignores fills on Refresh (same precedent as the
      // yellow input cells).
      const ap = (o.axisPaint && typeof o.axisPaint === "object") ? o.axisPaint : null;
      if (ap) {
        try {
          const povN = Math.max(0, ap.pov | 0);
          const hdrN = Math.max(0, ap.header | 0);
          const lblN = Math.max(0, ap.label | 0);
          if (povN > 0 && povN <= rowCount) {
            sheet.getRangeByIndexes(0, 0, Math.min(povN, rowCount), colCount).format.fill.color = "#fffbeb";
          }
          if (hdrN > 0 && povN + hdrN <= rowCount) {
            sheet.getRangeByIndexes(povN, 0, hdrN, colCount).format.fill.color = "#f0fdf4";
          }
          const dataTop = povN + hdrN;
          if (lblN > 0 && dataTop < rowCount) {
            sheet.getRangeByIndexes(dataTop, 0, rowCount - dataTop, Math.min(lblN, colCount)).format.fill.color = "#eff6ff";
          }
        } catch (_) {}
      }
      const types = Array.isArray(o.types) ? o.types : null;
      const statuses = Array.isArray(o.statuses) ? o.statuses : null;
      const isInput = o.formCategory === "input";
      const povRowCount = o.povRowCount || 0;
      if (isInput && types && types.length) {
        // types[] is parallel to the original form slice (BEFORE we
        // prepended the POV rows). The output grid has POV rows on top,
        // then the slice with empty rows stripped. We need to walk types[]
        // alongside the slice, skipping empty-rows the same way out[] did,
        // and offsetting by povRowCount when locating cells in Excel.
        // Reconstruct: walk through padded[] starting at povRowCount,
        // mapping each non-empty out-row back to the corresponding
        // type row.
        let typeIdx = 0;
        for (let outRow = povRowCount; outRow < rowCount; outRow++) {
          // Find next non-empty types[] row matching this out-row content.
          // Since the worker stripped empty-rows from the slice and types[]
          // mirrors slice order, the types row index equals (outRow-povRow)
          // adjusted for skipped empty-rows. Conservative approach: try to
          // match by index assuming no skip.
          while (typeIdx < types.length) {
            const tRow = types[typeIdx] || [];
            const sRow = (statuses && statuses[typeIdx]) || [];
            // If this typeRow is all-empty/null, skip (mirrors empty-row strip)
            const allEmpty = tRow.every(t => !t || t === "");
            typeIdx++;
            if (allEmpty) continue;
            // Paint editable cells yellow in this Excel row — skipping
            // read-only/blocked cells per the status bitmask.
            for (let c = 0; c < tRow.length && c < colCount; c++) {
              const t = tRow[c];
              const editable = t && t !== "0" && t !== "7" && !isCellBlocked(sRow[c]);
              if (editable) {
                try {
                  sheet.getRangeByIndexes(outRow, c, 1, 1).format.fill.color = "#fef9c3";
                } catch (_) {}
              }
            }
            break;
          }
          if (typeIdx >= types.length) break;
        }
      }
      sheet.getUsedRange().format.autofitColumns();
      sheet.activate();
    } else {
      // ── Default ad-hoc styling — modernized to match the help-format look ──
      // Slate header (#0f172a + white text), bold first col, zebra body,
      // Calibri Light global, subtle bottom border under header.
      const all = sheet.getRangeByIndexes(0, 0, rowCount, colCount);
      all.format.font.name = "Calibri Light";

      // Header row 0 — slate with white
      const head = sheet.getRangeByIndexes(0, 0, 1, colCount);
      head.format.font.bold = true;
      head.format.fill.color = "#0f172a";
      head.format.font.color = "#ffffff";
      head.format.font.size = 11;
      head.format.rowHeight = 26;
      try {
        const bottom = head.format.borders.getItem("EdgeBottom");
        bottom.style = "Continuous"; bottom.color = "#1e3a8a"; bottom.weight = "Thick";
      } catch (_) {}

      // Body — bold first col + zebra (white / #fafafa)
      if (rowCount > 1) {
        sheet.getRangeByIndexes(1, 0, rowCount - 1, 1).format.font.bold = true;
        for (let r = 1; r < rowCount; r++) {
          if ((r - 1) % 2 === 1) {
            sheet.getRangeByIndexes(r, 0, 1, colCount).format.fill.color = "#fafafa";
          }
        }
      }
      sheet.getUsedRange().format.autofitColumns();
      sheet.activate();
    }
    await ctx.sync();
  });
  return _finalName;
}

// ── Format the active sheet as an executive report ─────────────────────────
// Triggered when Gemini invokes `format_active_sheet` (e.g. user says
// "format this as a report" / "make it look nice"). Reads whatever grid is
// already on the active sheet, inserts a 4-row title block on top, styles
// the header + totals, and applies finance number formats.
//
// Descriptor (POV, compare kind, etc.) is optional — if the caller doesn't
// have one we fall back to lastGrid from storage, then to the sheet name.
async function formatActiveSheetAsReport(descriptor) {
  await Excel.run(async (ctx) => {
    const sheet = ctx.workbook.worksheets.getActiveWorksheet();
    const used = sheet.getUsedRange(true);
    used.load(["values", "rowCount", "columnCount", "rowIndex", "columnIndex"]);
    sheet.load("name");
    await ctx.sync();

    if (!used.rowCount || !used.columnCount) {
      throw new Error("Active sheet is empty — run a query first, then ask me to format it.");
    }

    // Detect whether this sheet was already formatted (has our title block).
    // If so, bail with a clear message instead of stacking title blocks.
    const firstCellVal = used.values && used.values[0] && used.values[0][0];
    if (typeof firstCellVal === "string" &&
        /^(REVENUE|OPEX|TOP |AD-HOC|.*·.*VS)/i.test(firstCellVal.trim())) {
      // Heuristic: our titles are UPPERCASE and contain "·" or "VS" separators.
      // Not perfect, but prevents accidental double-formatting. Users can
      // always delete and re-run.
      if (/[·]|\bVS\b/.test(firstCellVal)) {
        throw new Error("This sheet already looks formatted. Delete it and re-run the query if you want to reformat.");
      }
    }

    const rowCount = used.rowCount;
    const colCount = used.columnCount;
    const padded = used.values.map(r => {
      const out = r.slice();
      while (out.length < colCount) out.push(null);
      return out;
    });

    const headerRowCount = detectHeaderRowCount(padded);
    const dataRowCount = rowCount - headerRowCount;
    const TITLE_ROWS = 4;                                  // 3 title lines + 1 spacer

    // Insert 4 rows at the top so the existing grid slides down to row 4.
    sheet.getRangeByIndexes(0, 0, TITLE_ROWS, 1).getEntireRow().insert("Down");

    // The grid now starts at row TITLE_ROWS. Compute derived indices.
    const dataStartRow = TITLE_ROWS + headerRowCount;

    // 1. Title block.
    const t = buildTitle(descriptor, sheet.name);
    writeTitleBlock(sheet, t, colCount);

    // 2. Header row(s) — dark fill, white bold, centered.
    const hdr = sheet.getRangeByIndexes(TITLE_ROWS, 0, headerRowCount, colCount);
    hdr.format.fill.color = "#0F172A";
    hdr.format.font.color = "#FFFFFF";
    hdr.format.font.bold = true;
    hdr.format.horizontalAlignment = "Center";

    // 3. Row-labels column — bold with soft gray fill (data rows only).
    if (dataRowCount > 0) {
      const labels = sheet.getRangeByIndexes(dataStartRow, 0, dataRowCount, 1);
      labels.format.font.bold = true;
      labels.format.fill.color = "#F3F4F6";
    }

    // 4. Number format on data cells — pct for %Δ columns, money otherwise.
    const lastHeaderRow = padded[headerRowCount - 1] || [];
    const pctCols = detectPctColumns(lastHeaderRow);
    if (dataRowCount > 0 && colCount > 1) {
      const dataCells = sheet.getRangeByIndexes(dataStartRow, 1, dataRowCount, colCount - 1);
      dataCells.numberFormat = buildNumberFormatGrid(dataRowCount, colCount - 1, pctCols);
    }

    // 5. Total rows — bold + light gray fill + top border.
    for (const ri of detectTotalRows(padded, headerRowCount)) {
      const r = sheet.getRangeByIndexes(TITLE_ROWS + ri, 0, 1, colCount);
      r.format.font.bold = true;
      r.format.fill.color = "#E5E7EB";
      r.format.borders.getItem("EdgeTop").style = "Continuous";
    }

    // 6. Total columns — subtle fill on data cells.
    if (dataRowCount > 0) {
      for (const ci of detectTotalColumns(lastHeaderRow)) {
        const r = sheet.getRangeByIndexes(dataStartRow, ci, dataRowCount, 1);
        r.format.fill.color = "#F9FAFB";
        r.format.font.bold = true;
      }
    }

    // 7. Freeze header + first column.
    try {
      sheet.freezePanes.freezeAt(sheet.getRangeByIndexes(dataStartRow, 1, 1, 1));
    } catch (_) { /* freezePanes unsupported on some hosts — non-fatal */ }

    // 8. Autofit.
    sheet.getUsedRange().format.autofitColumns();
    await ctx.sync();
  });
}

// ── Clean active sheet — drop zero rows ────────────────────────────────────
// ── navigate_form client action ───────────────────────────────────────────────
// Filters columns or rows of an open Hyperion Planning form sheet.
// Equivalent to SmartView's "Keep Only" / "Remove Only" — operates purely on
// the rendered Excel range, no NSPB call needed.
//
// navAction: keep_only_cols | keep_only_rows | delete_col_members | delete_row_members
// members:   string[] — case-insensitive substring match against header cells
// matchMode: "all" (default) | "any"
async function runNavigateFormAction(action) {
  const { navAction, members, matchMode, sheetName } = action;
  const wanted = (members || []).map(m => String(m).toLowerCase().trim());
  if (!wanted.length) return;
  const useAll = matchMode !== "any"; // default: ALL members must appear

  await Excel.run(async (ctx) => {
    const sheet = sheetName
      ? ctx.workbook.worksheets.getItem(sheetName)
      : ctx.workbook.worksheets.getActiveWorksheet();
    const used = sheet.getUsedRange();
    used.load("values,columnCount,rowCount,columnIndex,rowIndex");
    await ctx.sync();

    const vals = used.values;
    const rowCount = used.rowCount;
    const colCount = used.columnCount;
    const baseRow = used.rowIndex;
    const baseCol = used.columnIndex;

    // Max rows to scan for column headers / row labels.
    // Forms have POV headers in the top ~20 rows.
    const HEADER_SCAN = Math.min(20, rowCount);

    // colMatchesWanted: returns true if the column's header area contains
    // the required members (all or any, per matchMode).
    function colHeaderTexts(c) {
      const out = [];
      for (let r = 0; r < HEADER_SCAN; r++) {
        const v = String(vals[r][c] || "").trim();
        if (v) out.push(v.toLowerCase());
      }
      return out;
    }
    function colIsLabelCol(c) {
      // Label columns (row dimensions, e.g. Account / SKU) have empty or
      // suppression-marker headers (">---<"). Never delete them.
      const texts = colHeaderTexts(c);
      return texts.length === 0 || texts.every(t => t.startsWith(">"));
    }
    function colMatchesWanted(c) {
      const texts = colHeaderTexts(c);
      if (useAll) {
        return wanted.every(m => texts.some(t => t.includes(m) || m.includes(t)));
      } else {
        return wanted.some(m => texts.some(t => t.includes(m) || m.includes(t)));
      }
    }

    // rowMatchesWanted: check row label cells (first ~5 cols) for member match.
    function rowLabelTexts(r) {
      const out = [];
      const labelCols = Math.min(5, colCount);
      for (let c = 0; c < labelCols; c++) {
        const v = String(vals[r][c] || "").trim();
        if (v) out.push(v.toLowerCase());
      }
      return out;
    }
    function rowMatchesWanted(r) {
      const texts = rowLabelTexts(r);
      if (useAll) {
        return wanted.every(m => texts.some(t => t.includes(m) || m.includes(t)));
      } else {
        return wanted.some(m => texts.some(t => t.includes(m) || m.includes(t)));
      }
    }

    if (navAction === "keep_only_cols" || navAction === "delete_col_members") {
      const toDelete = [];
      for (let c = 0; c < colCount; c++) {
        if (colIsLabelCol(c)) continue; // always keep row-label columns
        const matches = colMatchesWanted(c);
        const shouldDelete = (navAction === "keep_only_cols") ? !matches : matches;
        if (shouldDelete) toDelete.push(baseCol + c);
      }
      // Delete right-to-left so indices don't shift.
      toDelete.sort((a, b) => b - a);
      for (const ci of toDelete) {
        sheet.getRangeByIndexes(0, ci, baseRow + rowCount, 1)
             .delete(window.Excel.DeleteShiftDirection ? window.Excel.DeleteShiftDirection.left : "Left");
      }

    } else if (navAction === "keep_only_rows" || navAction === "delete_row_members") {
      // Detect where data rows start (after the header area).
      // Heuristic: first row where col 0 has a non-empty value that looks like
      // an account name / SKU (not a pure number, not ">---<").
      let dataStart = HEADER_SCAN;
      for (let r = 0; r < rowCount; r++) {
        const v = String(vals[r][0] || "").trim();
        if (v && !v.startsWith(">") && !/^[\d\s\.,\-\+\(\)%]+$/.test(v)) {
          dataStart = r;
          break;
        }
      }
      const toDelete = [];
      for (let r = dataStart; r < rowCount; r++) {
        const matches = rowMatchesWanted(r);
        const shouldDelete = (navAction === "keep_only_rows") ? !matches : matches;
        if (shouldDelete) toDelete.push(baseRow + r);
      }
      // Delete bottom-to-top.
      toDelete.sort((a, b) => b - a);
      for (const ri of toDelete) {
        sheet.getRangeByIndexes(ri, 0, 1, baseCol + colCount)
             .delete(window.Excel.DeleteShiftDirection ? window.Excel.DeleteShiftDirection.up : "Up");
      }
    }

    await ctx.sync();
  });
}

// Triggered by the `clean_active_sheet` client action (user said "remove
// zeros" / "hide zeros" without a new query). Walks the used range, deletes
// rows where every non-label cell is 0 or blank. Header row + detected
// total rows (YearTotal, Subtotal, Others (N)) are always kept.
//
// We delete from the bottom up so later indices don't shift while we iterate.
async function cleanActiveSheetZeros() {
  await Excel.run(async (ctx) => {
    const sheet = ctx.workbook.worksheets.getActiveWorksheet();
    const used = sheet.getUsedRange(true);
    used.load(["values", "rowCount", "columnCount", "rowIndex"]);
    await ctx.sync();

    if (!used.rowCount || !used.columnCount) {
      throw new Error("Active sheet is empty.");
    }
    if (used.columnCount < 2) return;     // label-only sheet, nothing to filter

    const values = used.values;
    const headerRowCount = detectHeaderRowCount(values);
    const totalRowIdxs = new Set(detectTotalRows(values, headerRowCount));
    const baseRow = used.rowIndex;         // absolute sheet-row index of used[0]

    // Collect the zero rows (absolute sheet indices), bottom-up for safe delete.
    const toDelete = [];
    for (let i = values.length - 1; i >= headerRowCount; i--) {
      if (totalRowIdxs.has(i)) continue;
      const row = values[i];
      const allZero = row.slice(1).every(v => {
        if (v == null || v === "") return true;
        if (typeof v === "number") return v === 0;
        const n = Number(v);
        return !isNaN(n) && n === 0;
      });
      if (allZero) toDelete.push(baseRow + i);
    }

    if (!toDelete.length) {
      await ctx.sync();
      return;
    }
    for (const absRow of toDelete) {
      sheet.getRangeByIndexes(absRow, 0, 1, used.columnCount)
           .getEntireRow().delete("Up");
    }
    await ctx.sync();
  });
}

// ── Report formatting helpers ──────────────────────────────────────────────
function buildTitle(d, fallback) {
  if (!d) {
    return { title: String(fallback || "Ad-hoc").toUpperCase(), sub: "", stamp: stamp() };
  }
  const povPairs = Object.entries(d.pov || {}).map(([k, v]) => k + "=" + v);
  const sub = [d.cube ? d.cube + " cube" : null].concat(povPairs).filter(Boolean).join(" · ");
  let title;
  if (d.kind === "compare" && d.compare) {
    title = labelFromRows(d.rowAxis) + " · " + (d.compare.a || "") + " VS " + (d.compare.b || "");
  } else if (d.kind === "top_drivers") {
    title = "TOP " + (d.topN || "N") + " " + (d.rankDim || "") +
            " BY " + (d.measure || "YEARTOTAL");
  } else {
    const suffix = [(d.pov || {}).Scenario, (d.pov || {}).Years].filter(Boolean).join(" ");
    title = labelFromRows(d.rowAxis) + (suffix ? " · " + suffix : "");
  }
  return { title: title.trim().toUpperCase(), sub, stamp: stamp() };
}

function labelFromRows(rowAxis) {
  if (!Array.isArray(rowAxis) || !rowAxis.length) return "AD-HOC";
  return rowAxis.map(r => r.member || r.dimension || "").filter(Boolean).join(" × ") || "AD-HOC";
}

function stamp() {
  return "Generated " + new Date().toISOString().slice(0, 16).replace("T", " ");
}

function writeTitleBlock(sheet, t, colCount) {
  // Title in cell A1 only — no merge. Excel lets text overflow into empty
  // neighbouring cells which gives the same "wide title" effect without the
  // headaches of merged ranges (broken col widths, copy/paste issues, etc.).
  // We still apply background + border across the whole row for the visual.
  const rowOf = (v) => { const a = new Array(colCount).fill(null); a[0] = v; return [a]; };

  const r0Full = sheet.getRangeByIndexes(0, 0, 1, colCount);
  r0Full.values = rowOf(t.title);
  r0Full.format.fill.color = "#0F172A";
  r0Full.format.verticalAlignment = "Center";
  r0Full.format.wrapText = false;
  const r0Cell = sheet.getRangeByIndexes(0, 0, 1, 1);
  r0Cell.format.font.bold = true;
  r0Cell.format.font.size = 18;
  r0Cell.format.font.color = "#FFFFFF";

  const r1Full = sheet.getRangeByIndexes(1, 0, 1, colCount);
  r1Full.values = rowOf(t.sub);
  r1Full.format.wrapText = false;
  const r1Cell = sheet.getRangeByIndexes(1, 0, 1, 1);
  r1Cell.format.font.size = 10;
  r1Cell.format.font.color = "#374151";

  const r2Full = sheet.getRangeByIndexes(2, 0, 1, colCount);
  r2Full.values = rowOf(t.stamp);
  r2Full.format.wrapText = false;
  const r2Cell = sheet.getRangeByIndexes(2, 0, 1, 1);
  r2Cell.format.font.italic = true;
  r2Cell.format.font.size = 9;
  r2Cell.format.font.color = "#9CA3AF";
}

// Compare grids produce TWO header rows (scenario label above period). Detect
// by scanning: first row whose col-1+ contains a number IS data; previous
// rows are headers. Minimum 1, maximum 2.
function detectHeaderRowCount(padded) {
  const limit = Math.min(3, padded.length);
  for (let i = 0; i < limit; i++) {
    const row = padded[i];
    const hasNum = row.slice(1).some(v =>
      typeof v === "number" ||
      (typeof v === "string" && /^-?\d/.test(v.trim()))
    );
    if (hasNum) return Math.max(1, i);
  }
  return 1;
}

function detectTotalRows(padded, headerRowCount) {
  const re = /^\s*(year\s*total|total|subtotal|grand\s*total|others\s*\(\d+\))\s*$/i;
  const out = [];
  for (let i = headerRowCount; i < padded.length; i++) {
    if (re.test(String(padded[i][0] || ""))) out.push(i);
  }
  return out;
}

function detectTotalColumns(headerLabels) {
  const re = /year\s*total|subtotal|^\s*total\s*$|Δ|%Δ/i;
  const out = [];
  for (let i = 1; i < headerLabels.length; i++) {
    if (re.test(String(headerLabels[i] || ""))) out.push(i);
  }
  return out;
}

function detectPctColumns(headerLabels) {
  const out = new Set();
  for (let i = 1; i < headerLabels.length; i++) {
    const h = String(headerLabels[i] || "");
    if (/%Δ|%\s*(delta|var)|percent/i.test(h)) out.add(i);
  }
  return out;
}

function buildNumberFormatGrid(rows, cols, pctCols) {
  const money = "#,##0_);[Red](#,##0);-";
  const pct = "0.0%;[Red](0.0%);-";
  const out = new Array(rows);
  for (let r = 0; r < rows; r++) {
    const row = new Array(cols);
    for (let c = 0; c < cols; c++) {
      row[c] = pctCols.has(c + 1) ? pct : money;
    }
    out[r] = row;
  }
  return out;
}

function sanitizeSheetName(name) {
  return String(name).replace(/[:\\/\?\*\[\]]/g, "-").slice(0, 31) || "Ad-hoc";
}

async function uniqueSheetName(ctx, desired) {
  const sheets = ctx.workbook.worksheets;
  sheets.load("items/name");
  await ctx.sync();
  const taken = new Set(sheets.items.map(s => s.name.toLowerCase()));
  if (!taken.has(desired.toLowerCase())) return desired;
  for (let i = 2; i < 100; i++) {
    const candidate = (desired.slice(0, 27) + " (" + i + ")").slice(0, 31);
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return desired + "-" + Date.now();
}

// ── transform_to_smartview ────────────────────────────────────────────────
// Reshape a Business Rule data export (wide format) into a SmartView-style
// ad-hoc grid:
//
//   INPUT (active sheet):
//     row 1: dim names (Class, Subsidiary, Location, ..., Account, Period, ...)
//     row 2: TP1..TP12 (sometimes a second TP1..TP12 block — ignored)
//     row 3+: data rows (one per dim combination, 12 numeric values per row)
//
//   OUTPUT (NSPB_SmartView sheet):
//     col headers nested: Tracker / Scenario / Years / Period (4 rows)
//     row headers:  Location | Relationship | Account | Department | ReportingSegment | Item
//     Item is preserved (passthrough fidelity — no aggregation).
//     POV in row 1: Class | Subsidiary | Version | Currency
//
// Pure JS — no DuckDB, no server. Handles ~150k input rows in a few seconds.
async function transformActiveSheetToSmartView() {
  // 1. Read the entire active sheet via Office.js.
  const raw = await readActiveSheetForTransform();
  if (!raw || !raw.values || raw.values.length < 3) {
    addMsg("error", "Couldn't read enough data to transform. Active sheet must have headers + data rows.");
    return;
  }

  // 2. Parse headers and detect TP1..TP12 column block.
  const parsed = parseExportShape(raw.values);
  if (!parsed.ok) { addMsg("error", "Transform failed: " + parsed.error); return; }

  // 3. Unpivot wide → long. Each data row × 12 periods → 12 long records.
  const long = unpivotExport(raw.values, parsed);
  if (!long.length) { addMsg("error", "No data rows found to transform."); return; }

  // 4. Pivot to SmartView shape: row keys × col keys.
  const grid = pivotToSmartView(long, parsed);

  // 5. Write to NSPB_SmartView sheet.
  await writeSmartViewGrid("NSPB_SmartView", grid);
  addMsg("info", `Transformed ${long.length.toLocaleString()} long records into SmartView format.`);
}

// Read the active sheet WITHOUT the 200×30 cap that readActiveSheetForAnalysis
// uses — we need the full grid for the transform.
async function readActiveSheetForTransform() {
  return await Excel.run(async (ctx) => {
    const sheet = ctx.workbook.worksheets.getActiveWorksheet();
    sheet.load("name");
    const used = sheet.getUsedRange(true);
    used.load(["values", "rowCount", "columnCount"]);
    await ctx.sync();
    if (!used.rowCount || !used.columnCount) return null;
    return { sheetName: sheet.name, values: used.values };
  });
}

// Detect the export shape:
//   - dimColCount: how many leftmost columns are dimensions (everything before TP1 in row 2)
//   - tpStartCol:  index of TP1 in row 2
//   - dimNames:    header row 1 sliced to dim cols
function parseExportShape(values) {
  const r0 = values[0] || [];   // dim header row (Class, ..., Account, Period)
  const r1 = values[1] || [];   // TP1..TP12 row (sometimes with a phantom TP block to the left)

  // Strategy: anchor TP1 by the "Period" header in row 0. Some BR exports have
  // a phantom TP1..TP12 block at the LEFT of row 2 — ignore it. The TP block
  // that aligns with data starts at the column where row 0 says "Period" (or
  // the column right after the last non-empty dim name).
  let periodHeaderCol = -1;
  for (let c = 0; c < r0.length; c++) {
    if (String(r0[c] || "").trim().toLowerCase() === "period") { periodHeaderCol = c; break; }
  }
  let tpStartCol = -1;
  if (periodHeaderCol >= 0) {
    // The TP1 cell must be at periodHeaderCol (sometimes the BR puts "Period"
    // as the label for the first TP1 column). Search a small window around it.
    for (let off = 0; off <= 2; off++) {
      const c = periodHeaderCol + off;
      if (String(r1[c] || "").trim().toUpperCase() === "TP1") { tpStartCol = c; break; }
    }
  }
  // Fallback: take the LAST occurrence of TP1 in row 2 (some exports repeat
  // the TP1..TP12 block twice; the second one is the real data block).
  if (tpStartCol < 0) {
    for (let c = r1.length - 1; c >= 0; c--) {
      if (String(r1[c] || "").trim().toUpperCase() === "TP1") { tpStartCol = c; break; }
    }
  }
  if (tpStartCol < 0) return { ok: false, error: "Couldn't find TP1 column in row 2." };

  // Verify TP1..TP12 contiguously from tpStartCol.
  for (let i = 0; i < 12; i++) {
    const want = "TP" + (i + 1);
    const got = String(r1[tpStartCol + i] || "").trim().toUpperCase();
    if (got !== want) return { ok: false, error: `Expected ${want} at col ${tpStartCol + i}, got "${got}".` };
  }

  // Dim names = row 0 from col 0 to the column BEFORE tpStartCol, but skipping
  // the "Period" label (if present right at tpStartCol-1 or earlier) since
  // it's not a real dim column.
  const dimNames = [];
  for (let c = 0; c < tpStartCol; c++) {
    const name = String(r0[c] || "").trim();
    if (!name) continue;
    if (name.toLowerCase() === "period") continue;   // skip the Period label
    dimNames.push({ name, col: c });
  }
  // Build dim name → col index lookup (case-insensitive). dimIdx maps the
  // header name to the actual sheet column (since some leading cells may be
  // blank or filtered out).
  const dimIdx = {};
  dimNames.forEach(d => { dimIdx[d.name.toLowerCase()] = d.col; });

  return {
    ok: true,
    tpStartCol,
    dimNames: dimNames.map(d => d.name),
    dimCols:  dimNames.map(d => d.col),
    dimIdx
  };
}

// Wide → long. 12 numeric cols collapse into 12 rows × { ...dims, Period, value }.
// Empty / non-numeric cells → skipped (so blanks don't become zeros).
function unpivotExport(values, shape) {
  const out = [];
  const tp = shape.tpStartCol;
  const dimNames = shape.dimNames;
  const dimCols = shape.dimCols;
  for (let r = 2; r < values.length; r++) {
    const row = values[r];
    if (!row || !row.length) continue;
    // Skip totally blank rows: at least one dim cell must have content.
    let anyDim = false;
    for (let i = 0; i < dimCols.length; i++) {
      const v = row[dimCols[i]];
      if (v != null && String(v).trim() !== "") { anyDim = true; break; }
    }
    if (!anyDim) continue;
    for (let i = 0; i < 12; i++) {
      const v = row[tp + i];
      if (v == null || v === "") continue;
      const num = typeof v === "number" ? v : parseFloat(String(v).replace(/,/g, ""));
      if (!isFinite(num)) continue;
      // Build a record: copy dim values from their actual columns, add Period + value.
      const rec = {};
      for (let j = 0; j < dimNames.length; j++) {
        rec[dimNames[j]] = row[dimCols[j]];
      }
      rec.Period = "TP" + (i + 1);
      rec.value = num;
      out.push(rec);
    }
  }
  return out;
}

// Pivot long records into SmartView shape.
//   Row keys: Location | Relationship | Account | Department | ReportingSegment | Item
//   Col keys: Tracker / Scenario / Years / Period (nested, 4 levels)
//   POV: Class | Subsidiary | Version | Currency (single values; if mixed, "(Multiple)")
//
// Returns { headerRows, povRow, rowKeys, dataRows, colKeys, colCount }.
function pivotToSmartView(records, shape) {
  const ROW_DIMS = ["Location", "Relationship", "Account", "Department", "ReportingSegment", "Item"];
  const COL_DIMS = ["Tracker", "Scenario", "Years", "Period"];
  const POV_DIMS = ["Class", "Subsidiary", "Version", "Currency"];

  // Verify required dims are present in shape (case-insensitive lookup).
  const has = (name) => shape.dimIdx[name.toLowerCase()] != null;
  for (const d of ROW_DIMS) {
    if (!has(d)) {
      // Soft-fail: if Item missing, drop it from row keys (some exports omit it).
      if (d === "Item") { ROW_DIMS.pop(); continue; }
      throw new Error(`Missing required dimension column: ${d}`);
    }
  }

  // Collect POV values (assume each is constant across the export; if mixed,
  // mark "(Multiple)" so user sees they need to filter).
  const povValues = {};
  for (const p of POV_DIMS) {
    if (!has(p)) { povValues[p] = ""; continue; }
    const seen = new Set();
    for (const r of records) {
      const v = r[p];
      if (v != null && v !== "") seen.add(String(v));
      if (seen.size > 1) break;
    }
    povValues[p] = seen.size === 1 ? [...seen][0] : (seen.size === 0 ? "" : "(Multiple)");
  }

  // Build maps: rowKey -> {colKey -> sum}, and collect distinct col keys.
  const rowMap = new Map();      // rowKey -> Map<colKey, value>
  const colKeySet = new Set();
  const colKeyMeta = new Map();  // colKey -> [Tracker, Scenario, Years, Period]

  for (const rec of records) {
    const rkParts = ROW_DIMS.map(d => String(rec[d] != null ? rec[d] : ""));
    const rk = rkParts.join("\x1f");
    const ckParts = COL_DIMS.map(d => String(rec[d] != null ? rec[d] : ""));
    const ck = ckParts.join("\x1f");
    if (!colKeySet.has(ck)) { colKeySet.add(ck); colKeyMeta.set(ck, ckParts); }
    let row = rowMap.get(rk);
    if (!row) { row = { parts: rkParts, cells: new Map() }; rowMap.set(rk, row); }
    // Passthrough = no aggregation (one record per cell expected). If duplicate
    // (same row × col), sum — defensive only, shouldn't happen for fresh exports.
    const prev = row.cells.get(ck);
    row.cells.set(ck, (prev || 0) + rec.value);
  }

  // Sort col keys: Tracker (Load before Unit), Scenario (Actual before Forecast),
  // Years (alpha — FY24 < FY25), Period (TP1..TP12 numeric).
  const trackerOrder = { "Load": 0, "Unit": 1 };
  const scenarioOrder = { "Actual": 0, "Forecast": 1, "Budget": 2 };
  const colKeys = [...colKeySet].sort((a, b) => {
    const A = colKeyMeta.get(a), B = colKeyMeta.get(b);
    const tA = trackerOrder[A[0]] != null ? trackerOrder[A[0]] : 99;
    const tB = trackerOrder[B[0]] != null ? trackerOrder[B[0]] : 99;
    if (tA !== tB) return tA - tB;
    const sA = scenarioOrder[A[1]] != null ? scenarioOrder[A[1]] : 99;
    const sB = scenarioOrder[B[1]] != null ? scenarioOrder[B[1]] : 99;
    if (sA !== sB) return sA - sB;
    if (A[2] !== B[2]) return A[2].localeCompare(B[2]);
    const pA = parseInt(String(A[3]).replace(/^TP/i, ""), 10) || 0;
    const pB = parseInt(String(B[3]).replace(/^TP/i, ""), 10) || 0;
    return pA - pB;
  });

  // Insert a blank-column separator between Tracker groups (Load | <blank> | Unit).
  const colKeysWithSep = [];
  let lastTracker = null;
  for (const ck of colKeys) {
    const tracker = colKeyMeta.get(ck)[0];
    if (lastTracker != null && tracker !== lastTracker) colKeysWithSep.push(null);   // separator
    colKeysWithSep.push(ck);
    lastTracker = tracker;
  }

  // Sort row keys: alpha by each level.
  const rowKeys = [...rowMap.keys()].sort((a, b) => {
    const A = rowMap.get(a).parts, B = rowMap.get(b).parts;
    for (let i = 0; i < A.length; i++) {
      const c = String(A[i]).localeCompare(String(B[i]));
      if (c !== 0) return c;
    }
    return 0;
  });

  // Build the grid as rows of arrays (to be written via writeGridToSheet-style).
  const totalCols = ROW_DIMS.length + colKeysWithSep.length;
  const grid = [];

  // Rows 1..N: one POV member per row, in the first DATA column (right after
  // the row-dim block) — matches native SmartView ad-hoc layout. Skip dims
  // that don't have a value in this slice.
  const povMembers = POV_DIMS.map(p => povValues[p]).filter(v => v && String(v).trim() !== "");
  for (const m of povMembers) {
    const r = new Array(totalCols).fill("");
    r[ROW_DIMS.length] = m;
    grid.push(r);
  }
  const povRowCount = povMembers.length;

  // Rows 2-5: nested column headers (Tracker / Scenario / Years / Period).
  for (let h = 0; h < COL_DIMS.length; h++) {
    const r = new Array(totalCols).fill("");
    colKeysWithSep.forEach((ck, idx) => {
      const colIdx = ROW_DIMS.length + idx;
      if (ck == null) return;   // separator column stays blank
      r[colIdx] = colKeyMeta.get(ck)[h] || "";
    });
    grid.push(r);
  }

  // Row 6: row-dim header labels (Location, Relationship, ...).
  const rowDimHeader = new Array(totalCols).fill("");
  ROW_DIMS.forEach((d, i) => { rowDimHeader[i] = d; });
  grid.push(rowDimHeader);

  // Row 7+: data rows.
  for (const rk of rowKeys) {
    const rowObj = rowMap.get(rk);
    const r = new Array(totalCols).fill("");
    rowObj.parts.forEach((p, i) => { r[i] = p; });
    colKeysWithSep.forEach((ck, idx) => {
      const colIdx = ROW_DIMS.length + idx;
      if (ck == null) { r[colIdx] = ""; return; }
      const v = rowObj.cells.get(ck);
      r[colIdx] = (v == null) ? "" : v;
    });
    grid.push(r);
  }

  // headerRowCount = INDEX of the row-dim label row (= POV rows + col-dim
  // header rows). Data area starts at headerRowCount + 1.
  return { grid, headerRowCount: povRowCount + COL_DIMS.length, rowDimCount: ROW_DIMS.length, povRowCount };
}

// Write a SmartView-shaped grid to a sheet with light styling: bold headers,
// thousands-separator number format, top-left POV row in subtle gray.
async function writeSmartViewGrid(baseName, packed) {
  const { grid, headerRowCount, rowDimCount, povRowCount = 1 } = packed;
  const rowCount = grid.length;
  const colCount = Math.max.apply(null, grid.map(r => r.length));

  await Excel.run(async (ctx) => {
    const desired = sanitizeSheetName(baseName);
    // Always delete and recreate — clear() doesn't reset rowHidden/columnHidden
    // state, and we don't want to inherit any weirdness from previous runs.
    const existing = ctx.workbook.worksheets.getItemOrNullObject(desired);
    existing.load("name");
    await ctx.sync();
    if (!existing.isNullObject) {
      existing.delete();
      await ctx.sync();
    }
    const sheet = ctx.workbook.worksheets.add(desired);

    sheet.getRangeByIndexes(0, 0, rowCount, colCount).values = grid;

    // Modern global font
    sheet.getRangeByIndexes(0, 0, rowCount, colCount).format.font.name = "Calibri Light";

    // POV rows: italic, slate-500
    if (povRowCount > 0) {
      const pov = sheet.getRangeByIndexes(0, 0, povRowCount, colCount);
      pov.format.font.italic = true;
      pov.format.font.color = "#9ca3af";
      pov.format.font.size = 10;
    }

    // Column header rows: bold, centered, slate-900 on innermost (Period row),
    // gray-100 on parent rows (Tracker / Scenario / Years).
    for (let r = povRowCount; r <= headerRowCount; r++) {
      const range = sheet.getRangeByIndexes(r, rowDimCount, 1, colCount - rowDimCount);
      range.format.font.bold = true;
      range.format.horizontalAlignment = "Center";
      range.format.font.size = 10;
      if (r === headerRowCount) {
        range.format.fill.color = "#0f172a";   // slate-900
        range.format.font.color = "#ffffff";
        range.format.rowHeight = 22;
      } else if (r === headerRowCount - 1) {
        range.format.fill.color = "#e2e8f0";   // slate-200, subtler than blue
        range.format.font.color = "#334155";
      } else {
        range.format.font.color = "#475569";   // slate-600 for outer levels
      }
    }

    // Row dim header — slate-900 + white
    const rowDimHead = sheet.getRangeByIndexes(headerRowCount, 0, 1, rowDimCount);
    rowDimHead.format.font.bold = true;
    rowDimHead.format.fill.color = "#0f172a";
    rowDimHead.format.font.color = "#ffffff";
    rowDimHead.format.font.size = 11;

    // Row dim cells (left side): bold.
    if (rowCount > headerRowCount + 1) {
      const rowDims = sheet.getRangeByIndexes(headerRowCount + 1, 0, rowCount - headerRowCount - 1, rowDimCount);
      rowDims.format.font.bold = true;
    }

    // Number format for data area: thousands sep, blank for zero.
    if (rowCount > headerRowCount + 1 && colCount > rowDimCount) {
      const dataRange = sheet.getRangeByIndexes(
        headerRowCount + 1, rowDimCount,
        rowCount - headerRowCount - 1, colCount - rowDimCount
      );
      dataRange.numberFormat = [["#,##0;(#,##0);"]];
    }

    // Column widths: row dims narrow, data cols compact.
    for (let c = 0; c < rowDimCount; c++) sheet.getRangeByIndexes(0, c, 1, 1).format.columnWidth = 90;
    for (let c = rowDimCount; c < colCount; c++) sheet.getRangeByIndexes(0, c, 1, 1).format.columnWidth = 65;

    // Force unhide on full rows/cols (rowHidden/columnHidden only work on
    // entire-row/entire-column ranges). Cover everything we wrote plus a buffer.
    sheet.getRangeByIndexes(0, 0, rowCount, 1).getEntireRow().rowHidden = false;
    sheet.getRangeByIndexes(0, 0, 1, colCount).getEntireColumn().columnHidden = false;

    sheet.activate();
    await ctx.sync();
  });
}

