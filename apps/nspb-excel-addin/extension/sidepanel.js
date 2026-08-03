"use strict";

// ── Fixed, shared config (never shown to the client) ──────────────
const DEFAULT_API = "https://gentle-moon-046f.nspbassistant.workers.dev";
// Shared Gemini key (baked in, hidden from the user — like the Worker URL).
// The Worker reads the AI key from settings.geminiKey, so the chat works out
// of the box without a key field. This is the same working key used for the
// LCM enrichment pass (repo .env). NOTE: for client delivery we should move
// this to a Cloudflare Worker secret so it isn't shipped in the extension.
// Shared AI key is NOT committed — it lives in extension/config.local.js
// (gitignored; see config.local.example.js). Without it, users must enter
// their own key in ⚙ Settings.
const DEFAULT_GEMINI_KEY = (typeof window !== "undefined" && window.NSPB_SHARED_GEMINI_KEY) || "";

const els = {};
let CFG = { api: DEFAULT_API, planning: "", user: "", pass: "", aiKey: "" };
let KB = null;            // imported tenant-kb.json (parsed)
let history = [];         // [{role, content}] chat history sent as `messages`
let DEBUG = false;        // toggle with the `debug` command
let lastExchange = null;  // { request, response } for `debug last`

// ── Boot ──────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  for (const id of ["menu-close-bottom","settings-toggle","settings","cfg-planning","cfg-user",
                    "cfg-pass","cfg-aikey","cfg-kb-file","kb-status","cfg-save","log","composer",
                    "input","send","menu","menu-filter","menu-body","quickbar","tip"]) {
    els[id] = document.getElementById(id);
  }

  const saved = await chrome.storage.local.get(["cfg", "kb"]);
  if (saved.cfg) CFG = { ...CFG, ...saved.cfg };
  if (saved.kb) KB = saved.kb;
  CFG.api = DEFAULT_API; // fixed, shared — not user-editable
  els["cfg-planning"].value = CFG.planning || "";
  els["cfg-user"].value = CFG.user || "";
  els["cfg-pass"].value = CFG.pass || "";
  els["cfg-aikey"].value = CFG.aiKey || "";
  refreshKbStatus();

  els["settings-toggle"].addEventListener("click", () => els["settings"].classList.toggle("hidden"));
  els["menu-close-bottom"].addEventListener("click", closeMenu);
  els["cfg-save"].addEventListener("click", saveCfg);
  els["cfg-kb-file"].addEventListener("change", onImportKb);
  els["composer"].addEventListener("submit", onSend);
  els["menu-filter"].addEventListener("input", renderMenu);
  els["menu"].querySelectorAll(".menu-tab").forEach(b =>
    b.addEventListener("click", () => setMenuTab(b.dataset.tab)));

  buildQuickbar();
  startTips();
  sys("Ready. Set your Planning URL + import your tenant-kb.json in ⚙. Tap ☰ Menu to browse actions, forms, rules and variables.");
});

// ── Rotating tips (inspire what to ask) — web-console specific ────
const TIPS = [
  { t: "💡 Try: open variables — then ask which ones look stale", cmd: "open variables" },
  { t: "⚡ Open a form, then type analyze this to learn why it shows no data", fill: "analyze this" },
  { t: "▶️ open form income statement adjustments — I'll drive the real console", cmd: "open form income statement adjustments" },
  { t: "🔍 open audit to trace who changed a number", cmd: "open audit" },
  { t: "🧮 Ask: which rule calculates the forecast?", fill: "which rule calculates the forecast?" },
  { t: "🗂️ open jobs to see what ran — and what failed", cmd: "open jobs" },
  { t: "🔎 Open a form, then adhoc to explore it ad-hoc", fill: "adhoc" },
  { t: "📐 open dimensions to find a member fast", cmd: "open dimensions" },
  { t: "💬 Type a question naturally — \"show me the forecast variables\" works too", fill: "" },
  { t: "👁️ read shows the on-screen text (POV, values) — cheap, no screenshot", cmd: "read" },
  { t: "❓ On any page, type explain this page — I'll tell you what it's for", cmd: "explain this page" },
];
let tipIdx = 0;
function showTip() {
  const tip = TIPS[tipIdx % TIPS.length];
  const el = els["tip"];
  el.style.opacity = "0";
  setTimeout(() => {
    el.textContent = tip.t;
    el.onclick = () => { if (tip.cmd) runCommand(tip.cmd); else if (tip.fill !== undefined) { els["input"].value = tip.fill; els["input"].focus(); } };
    el.style.opacity = "1";
  }, 200);
  tipIdx++;
}
function startTips() { showTip(); setInterval(showTip, 8000); }

// ── Settings ──────────────────────────────────────────────────────
function saveCfg() {
  CFG = {
    api: DEFAULT_API,
    planning: (els["cfg-planning"].value || "").trim().replace(/\/$/, ""),
    user: els["cfg-user"].value.trim(),
    pass: els["cfg-pass"].value,
    aiKey: els["cfg-aikey"].value.trim(),
  };
  chrome.storage.local.set({ cfg: CFG });
  els["settings"].classList.add("hidden");
  sys("Settings saved.");
}

function refreshKbStatus() {
  els["kb-status"].textContent = (KB && KB.forms)
    ? `✓ KB: ${(KB.forms||[]).length} forms · ${(KB.rules||[]).length} rules · ${(KB.navigationFlows||[]).length} nav flows`
    : "No KB imported.";
}

async function onImportKb(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  try {
    const json = JSON.parse(await file.text());
    if (!json.forms && !json.rules) throw new Error("Doesn't look like a tenant-kb.json");
    KB = json;
    await chrome.storage.local.set({ kb: json });
    refreshKbStatus();
    sys(`KB imported: ${(json.forms||[]).length} forms, ${(json.rules||[]).length} rules.`);
  } catch (err) {
    sys("✗ Couldn't import KB: " + (err.message || err));
  }
}

// ── Help panel (?) ────────────────────────────────────────────────
// Capability menu as clickable chips. CHIP = runs; FILL = prefills the input.
function showHelp() {
  const msg =
    "**What I can do** — tap a chip, or just type.\n\n" +
    "**Open & explain parts of the console**\n" +
    "CHIP: 📂 Variables → open variables\n" +
    "CHIP: ⚙️ Rules → open rules\n" +
    "CHIP: 🗂️ Jobs → open jobs\n" +
    "CHIP: 📐 Dimensions → open dimensions\n" +
    "CHIP: 🔍 Audit → open audit\n" +
    "CHIP: 🔁 Data Exchange → open data exchange\n" +
    "FILL: 📄 Open a form… → open form \n" +
    "FILL: 🧭 Open any area… → open \n\n" +
    "**Read & analyze the screen** (cheap — text only, no screenshot)\n" +
    "CHIP: 👁️ Read screen → read\n" +
    "CHIP: 🧠 Analyze screen → analyze this\n" +
    "CHIP: ❓ Explain this page → explain this page\n\n" +
    "**Explain & ask the AI** (KB-backed — knows your forms, rules, variables)\n" +
    "FILL: 💬 Explain a rule/form/var… → explain \n" +
    "FILL: ❓ Which rule calculates…? → which rule calculates \n" +
    "FILL: 📋 What rules does a form have… → what rules are attached to the form \n\n" +
    "More areas: open + valid intersections · smart lists · currency · forms · " +
    "settings · approvals · migration · access control · … (type `open <area>`).\n\n" +
    `**Status** — Planning: ${CFG.planning ? "✓ set" : "✗ set in ⚙"} · ` +
    `KB: ${KB && KB.forms ? KB.forms.length + " forms" : "not imported"} · ` +
    `AI key: ${CFG.aiKey ? "yours" : "shared"} · Debug: ${DEBUG ? "ON" : "off"}`;
  renderAiReply(addMsg("ai", ""), msg);
}

// ── Menu panel (Commands / Forms / Rules / Variables / Status) ────
let menuTab = "commands";
function toggleMenu() {
  els["menu"].classList.toggle("hidden");
  if (!els["menu"].classList.contains("hidden")) { setMenuTab(menuTab); }
}
function closeMenu() { els["menu"].classList.add("hidden"); }
function setMenuTab(t) {
  menuTab = t;
  els["menu"].querySelectorAll(".menu-tab").forEach(b => b.classList.toggle("active", b.dataset.tab === t));
  els["menu-filter"].value = "";
  els["menu-filter"].placeholder = "Filter " + (t === "commands" ? "actions" : t) + "…";
  renderMenu();
}
function renderMenu() {
  const f = (els["menu-filter"].value || "").toLowerCase().trim();
  const body = els["menu-body"]; body.innerHTML = "";
  // each item: icon + bold label + plain-language description of what it does
  const add = (ico, label, desc, onClick) => {
    const d = document.createElement("div");
    d.className = "menu-item";
    d.innerHTML =
      `<span class="mi-ico">${ico}</span>` +
      `<span class="mi-text"><span class="mi-label">${escapeHtml(label)}</span>` +
      (desc ? `<span class="mi-desc">${escapeHtml(desc)}</span>` : "") + `</span>`;
    d.addEventListener("click", onClick);
    body.appendChild(d);
  };
  const section = (t) => { const d = document.createElement("div"); d.className = "menu-section"; d.textContent = t; body.appendChild(d); };
  const empty = (m) => { const d = document.createElement("div"); d.className = "menu-empty"; d.textContent = m; body.appendChild(d); };
  // Compact table-like row: name (+ optional sub line) on the left, meta/flag on the right.
  const row = (name, sub, meta, flag, onClick) => {
    const d = document.createElement("div");
    d.className = "menu-row";
    d.innerHTML =
      `<span class="r-main"><span class="r-name">${escapeHtml(name)}</span>` +
      (sub ? `<span class="r-sub">${escapeHtml(sub)}</span>` : "") + `</span>` +
      (flag ? `<span class="r-flag">${flag}</span>` : "") +
      (meta ? `<span class="r-meta">${escapeHtml(meta)}</span>` : "");
    d.addEventListener("click", onClick);
    body.appendChild(d);
  };
  const actBtn = (label, onClick) => {
    const b = document.createElement("button");
    b.className = "menu-act"; b.textContent = label;
    b.addEventListener("click", onClick); body.appendChild(b);
  };

  if (menuTab === "commands") {
    // [icon, label, command, description, section]
    const cmds = [
      ["🔍", "Explain this screen", "explain this", "What it is, what it's for, and the data on it", "On the open screen"],
      ["🔎", "Ad-hoc explore", "adhoc", "Suggests ways to drill into the open form", "On the open screen"],
      ["👁️", "Read raw text", "read", "Dumps the on-screen text (no analysis)", "On the open screen"],
      ["📅", "Month-end close steps", "month-end close", "The close playbook: roll variables, copy forecast, save version", "Workflows"],
      ["🕵️", "Who changed a cell?", "cell history", "Cell Change History + the Audit trail (who modified a number)", "Workflows"],
      ["🔬", "Check variables", "check variables", "Flags substitution variables that look stale", "Analyze the model"],
      ["📊", "Cube optimization analysis (BPC)", "performance", "What the BPC service covers + the 3 files we need", "Analyze the model"],
      ["📂", "Variables", "open variables", "Opens Substitution Variables in the console", "Open in the console"],
      ["⚙️", "Business Rules", "open rules", "Opens the Rules area in the console", "Open in the console"],
      ["🗂️", "Jobs", "open jobs", "Opens the Jobs console to check runs", "Open in the console"],
      ["📐", "Dimensions", "open dimensions", "Opens the dimension editor", "Open in the console"],
      ["🔍", "Audit", "open audit", "Opens the Audit trail", "Open in the console"],
      ["🔁", "Data Exchange", "open data exchange", "Opens Data Exchange / integrations", "Open in the console"],
      ["🔗", "Valid Intersections", "open valid intersections", "Opens the Valid Intersections rules", "Open in the console"],
      ["📋", "Smart Lists", "open smart lists", "Opens the Smart Lists editor", "Open in the console"],
      ["💱", "Currency", "open currency", "Opens the Currency setup", "Open in the console"],
      ["📝", "Forms (manage)", "open forms", "Opens the Forms admin area", "Open in the console"],
      ["✅", "Approvals", "open approvals", "Opens the Approvals area", "Open in the console"],
      ["📦", "Migration", "open migration", "Opens the Migration / snapshots area", "Open in the console"],
      ["🖥️", "Open Console", "open console", "Brings the Planning console tab forward", "Open in the console"],
      ["♻️", "Reset chat", "reset", "Clears this conversation", "Utilities"],
      ["🐞", "Toggle debug", "debug", "Shows/hides raw request debug info", "Utilities"],
    ];
    const matched = cmds.filter(c => !f || c[1].toLowerCase().includes(f) || c[2].includes(f) || c[3].toLowerCase().includes(f));
    if (!matched.length) return empty("No matching action.");
    let lastSec = null;
    for (const [ico, label, cmd, desc, sec] of matched) {
      if (sec !== lastSec) { section(sec); lastSec = sec; }
      add(ico, label, desc, () => { closeMenu(); runCommand(cmd); });
    }
  } else if (menuTab === "forms") {
    const list = (KB && KB.forms || []).filter(x => !f || (x.name || "").toLowerCase().includes(f));
    if (!list.length) return empty(KB ? "No matching forms." : "Import a tenant-kb.json in ⚙ first.");
    // Group by module (like the Excel chat). Each row: name + short purpose,
    // a ⚙ flag if it has attached rules, and the cube on the right.
    const groups = {};
    for (const x of list.slice(0, 400)) {
      const g = x.module || x.path || "Other";
      (groups[g] = groups[g] || []).push(x);
    }
    for (const g of Object.keys(groups).sort()) {
      section(`${g}  (${groups[g].length})`);
      for (const x of groups[g]) {
        const purpose = (x.aiSummary && x.aiSummary.purpose) || x.description || "";
        const hasRules = (x.attachedRules || []).length || x.hasOnSaveRules;
        row(x.name, purpose ? purpose.slice(0, 70) : "", x.cube ? `cube ${x.cube}` : "",
          hasRules ? "⚙" : "", () => { closeMenu(); runCommand("open form " + x.name); });
      }
    }
  } else if (menuTab === "rules") {
    const list = (KB && KB.rules || []).filter(x => !f || (x.name || "").toLowerCase().includes(f));
    if (!list.length) return empty(KB ? "No matching rules." : "Import a tenant-kb.json in ⚙ first.");
    list.slice(0, 400).forEach(x => {
      const what = (x.aiSummary && x.aiSummary.whatItDoes) || x.description || "";
      row(x.name, what ? what.slice(0, 70) : "", x.cube ? x.cube : "", "",
        () => { closeMenu(); runCommand("explain rule " + x.name); });
    });
  } else if (menuTab === "variables") {
    const list = (KB && KB.substitutionVariables || []).filter(x => !f || (x.name || "").toLowerCase().includes(f));
    if (!list.length) return empty(KB ? "No matching variables." : "Import a tenant-kb.json in ⚙ first.");
    // One-click: ask the assistant whether the point-in-time vars look current.
    if (!f) {
      actBtn("📅 What do I do for month-end close?", () => { closeMenu(); runCommand("month-end close"); });
      actBtn("🔍 Check if these variables look up to date", () => { closeMenu(); runCommand("check substitution variables"); });
    }
    // Compact table: name on the left, current value + scope on the right.
    list.slice(0, 400).forEach(x => {
      const val = x.value != null ? String(x.value).replace(/^"|"$/g, "") : "?";
      row(x.name, "", val + (x.planType ? `  ·  ${x.planType}` : ""), "",
        () => { closeMenu(); runCommand("explain variable " + x.name); });
    });
  } else if (menuTab === "status") {
    body.innerHTML = `<div style="font-size:12px;line-height:1.8;padding:6px;color:#374151;">
      <b>Web Console Copilot</b> — opens & drives the real Planning console.
      <span style="color:#9ca3af;">(Distinct from the Excel add-in, which writes grids into sheets.)</span><br><br>
      Planning URL: ${CFG.planning ? "✓ set" : "✗ not set (⚙)"}<br>
      Credentials: ${CFG.user ? "set" : "none (KB questions still work)"}<br>
      AI key: ${CFG.aiKey ? "yours" : "shared default"}<br>
      KB: ${KB && KB.forms ? `${KB.forms.length} forms · ${(KB.rules || []).length} rules · ${(KB.substitutionVariables || []).length} variables · ${KB.navIndex ? Object.keys(KB.navIndex).length : 0} nav targets` : "not imported"}<br>
      Debug: ${DEBUG ? "ON" : "off"}
    </div>`;
  }
}

// ── Persistent quick-action chip bar (always visible) ─────────────
function buildQuickbar() {
  // The bottom bar holds ONLY the fast "act on what's on screen" actions.
  // Everything else (open areas, browse forms/rules/variables, status) lives
  // behind the single ☰ Menu button — no duplication between the two.
  const items = [
    ["☰ Menu", "__menu__"],
    ["🔍 Explain this screen", "explain this"],
    ["🔎 Ad-hoc", "adhoc"],
  ];
  els["quickbar"].innerHTML = "";
  for (const [label, cmd] of items) {
    const b = document.createElement("button");
    b.className = "qchip" + (cmd === "__menu__" ? " qchip-menu" : "");
    b.textContent = label;
    b.addEventListener("click", () => {
      if (cmd === "__menu__") return toggleMenu();
      runCommand(cmd);
    });
    els["quickbar"].appendChild(b);
  }
}

// ── Ad-hoc: turn the open form INTO an ad-hoc grid, then explore ──
// `adhoc` must actually drive Actions → New Ad hoc Grid in the console (not
// just describe the form). After the grid opens, suggest explorations.
async function openAsAdhoc() {
  if (!CFG.planning) { sys("Set the Planning URL in ⚙ first."); return; }
  sys("Converting this form to an ad-hoc grid (Actions → New Ad hoc Grid)…");
  try {
    // The form toolbar's "Actions" menu → "New Ad hoc Grid" (a JET menu item).
    const path = [
      { kind: "text", text: "Actions" },
      { kind: "text", text: "New Ad hoc Grid" },
    ];
    const res = await chrome.runtime.sendMessage({ type: "navConsole", origin: planningOrigin(), path });
    if (res && res.ok) {
      sys("✓ Ad-hoc grid opened. Now you can zoom in/out, pivot, keep/remove members…");
      await adhocExplore();
    } else {
      // Fall back to "Analyze" (some versions label it that), else explain only.
      const r2 = await chrome.runtime.sendMessage({ type: "navConsole", origin: planningOrigin(),
        path: [{ kind: "text", text: "Actions" }, { kind: "text", text: "Analyze" }] });
      if (r2 && r2.ok) { sys("✓ Opened in Analyze (ad-hoc)."); await adhocExplore(); }
      else sys(`✗ ${(res && res.error) || "couldn't open the Actions menu"} — open a form first, then try again. (I look for Actions → New Ad hoc Grid.)`);
    }
  } catch (e) { sys("✗ " + (e.message || e)); }
}

// Read the current (ad-hoc or form) screen and suggest concrete explorations.
async function adhocExplore() {
  const res = await readScreen();
  if (!res || !res.ok) { sys("✗ open a form first, then 'adhoc'. " + ((res && res.error) || "")); return; }
  if (!res.text) { sys("No form on screen — open a form first."); return; }
  const prompt =
    "The user wants to explore this open NSPB form ad-hoc. On-screen text " +
    "(select-all, layout flattened):\n\n" + res.text.slice(0, 9000) +
    "\n\nIdentify the form, its dimensions/POV and what's drillable. Then offer 3–5 " +
    "concrete next ad-hoc explorations as CHIP lines the user can click, e.g.:\n" +
    "CHIP: Drill into Revenue → drill into Revenue\n" +
    "CHIP: Show only Q1 → show only Q1\n" +
    "Always also include this exact line: CHIP: 🕵️ Who changed a cell? → cell history\n" +
    "Keep it concise.";
  await askWorker(prompt, "[explored the open form ad-hoc]", { forceExplain: true });
}

// ── Chat ──────────────────────────────────────────────────────────
async function onSend(e) {
  e.preventDefault();
  const text = els["input"].value.trim();
  if (!text) return;
  els["input"].value = "";
  addMsg("user", text);

  // 1) Explicit commands & exact keywords — instant, no AI.
  if (await handleLocalCommand(text)) return;

  // 2) Natural-language intent (open / analyze) understood by the AI router.
  if (await trySmartIntent(text)) return;

  // 3) Otherwise → the full Worker brain (kb.md + tenant KB + tools).
  //    Append smart follow-up chips so every answer has sensible next steps.
  await askWorker(text, null, { followups: text });
}

// Slim the tenant KB for the wire: dimensions (≈1.1MB) dominate the payload
// but the Worker only reads dimensions.Account (explain-account intercept),
// and financialReports are barely used. Cuts ~2.1MB → ~1.4MB per message.
function slimTenantKb(kb) {
  if (!kb) return null;
  const slim = { ...kb };
  delete slim.financialReports;
  if (slim.dimensions && slim.dimensions.Account) slim.dimensions = { Account: slim.dimensions.Account };
  else delete slim.dimensions;
  return slim;
}

// Send a message to the Worker AI.
// `sendText` is what the model sees as the latest user turn. `record` (optional)
// is the SHORT version stored in chat history — so giant screen-capture prompts
// aren't re-sent on every later turn. History is capped to the last 16 entries.
async function askWorker(sendText, record, opts) {
  opts = opts || {};
  const thinking = addMsg("ai", "…");
  // Explain mode = KB-backed answer, no live NSPB tools. Forced when the user
  // has no credentials (tools mode would 400 with "NSPB settings required"),
  // or when the caller asks (analysis/teaching prompts must NOT trigger the
  // Excel grid-writing tools — those belong to the add-in, not this console).
  const hasCreds = !!(CFG.user && CFG.pass && CFG.planning);
  const isExplain = opts.forceExplain || !hasCreds ||
    /^(how\s+(do|to|can|should)|what\s+is|why\s+(is|does|do)|when\s+should|where\s+(is|do)|show\s+me\s+how|tell\s+me\s+about|explain)\b/i.test(sendText);
  // Send the same rich KB context the Excel add-in sends, derived from the
  // imported tenant KB, so the AI's responses teach (list a form's attached
  // rules, etc.). Trimmed (no rule bodies / aiSummary) to stay token-light;
  // the deep explain intercept still uses tenantKb server-side.
  const kbForms = (KB && Array.isArray(KB.forms))
    ? KB.forms.map(f => ({ name: f.name, cube: f.cube, kind: f.kind, isInput: f.isInput, description: f.description || "" }))
    : null;
  const kbRules = (KB && Array.isArray(KB.rules))
    ? KB.rules.map(r => ({ name: r.name, description: r.description || "" }))
    : null;
  const kbVars = (KB && Array.isArray(KB.substitutionVariables))
    ? KB.substitutionVariables.map(v => ({ name: v.name, value: v.value, planType: v.planType }))
    : null;
  const messages = [...history.slice(-16), { role: "user", content: sendText }];
  history.push({ role: "user", content: String(record || sendText).slice(0, 2000) });
  const reqBody = {
    messages,
    language: "en",
    tenantKb: slimTenantKb(KB),
    forms: kbForms,
    businessRules: kbRules,
    variables: kbVars,
    activeSheet: null,
    forceExplain: isExplain,
    debug: DEBUG,
    settings: {
      host: CFG.planning || null,
      username: CFG.user || null,
      password: CFG.pass || null,
      appName: "NetSuite",
      geminiKey: CFG.aiKey || DEFAULT_GEMINI_KEY,
    },
  };
  try {
    const r = await fetch(CFG.api + "/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(reqBody),
    });
    const raw = await r.text();
    let d = {};
    try { d = JSON.parse(raw); } catch (_) { d = { ok: false, error: "non-JSON: " + raw.slice(0, 300) }; }
    // Slim debug record — do NOT keep the multi-MB KB payload in memory/chat.
    lastExchange = {
      status: r.status,
      request: {
        lastMessage: sendText.slice(0, 600),
        historyLen: messages.length,
        kbSent: KB ? "slim tenantKb" : "none",
        forms: kbForms ? kbForms.length : 0,
        rules: kbRules ? kbRules.length : 0,
        variables: kbVars ? kbVars.length : 0,
        forceExplain: isExplain,
      },
      response: d,
    };
    if (!r.ok || d.ok === false) {
      thinking.textContent = `✗ ${r.status}: ${d.error || "request failed"}`;
      sys("Tip: type `debug last` to see the raw request/response.");
      return;
    }
    const reply = d.reply || d.message || "(no reply)";
    renderAiReply(thinking, reply);
    history.push({ role: "assistant", content: reply.slice(0, 4000) });
    // Smart follow-up chips (≤5) after a free-form answer, so there's always a
    // sensible next step. Suppressed for the analysis prompts (they bring their
    // own chips) and when the reply already ends in chips.
    if (opts.followups) {
      const chips = followupChipsFor(opts.followups, reply);
      if (chips) renderAiReply(addMsg("ai", ""), chips);
    }
    if (DEBUG && Array.isArray(d.trace) && d.trace.length) {
      sys("TRACE:\n" + d.trace.map(t => `• ${t.tool || t.name || "?"}${t.ms != null ? " ("+t.ms+"ms)" : ""}`).join("\n"));
    }
    const act = d.action || (d.actions && d.actions[0]);
    if (act && /open[_-]?form/i.test(act.type || "") && (act.target || act.name)) {
      await openFormInConsole(act.target || act.name);
    }
  } catch (err) {
    thinking.textContent = "✗ Network: " + (err.message || err);
    sys("Tip: type `debug last` to inspect the request.");
  }
}

// Build up to 5 smart follow-up chips for a free-form answer, keyed off what
// the user asked (and, secondarily, what the reply mentions). Always returns a
// "Common next steps:" block or null.
function followupChipsFor(question, reply) {
  const q = (question + " " + (reply || "")).toLowerCase();
  const chips = [];
  const add = (label, cmd) => { if (chips.length < 5 && !chips.some(c => c.cmd === cmd)) chips.push({ label, cmd }); };

  if (/\bmonth[- ]?end|close|rollover|roll forward|new month|cierre\b/.test(q)) add("📅 Month-end close steps", "month-end close");
  if (/\bvariable|subvar|substitution|current\s?month|forecast year|scenario|version\b/.test(q)) {
    add("🔍 Are all variables up to date?", "check variables");
    add("📂 Open Variables", "open variables");
  }
  if (/\brule|calc|aggregat|business rule|on save\b/.test(q)) add("⚙️ Open Business Rules", "open rules");
  if (/\bjob|run|fail|overnight|load\b/.test(q)) add("🗂️ Open Jobs", "open jobs");
  if (/\bintegration|actuals|netsuite|data exchange|data load|fdmee\b/.test(q)) add("🔁 Open Data Exchange", "open data exchange");
  if (/\baudit|who changed|history|changed|modific|cell\b/.test(q)) { add("🕵️ Who changed a cell?", "cell history"); add("🔍 Open Audit", "open audit"); }
  if (/\bmember|dimension|hierarchy|alias\b/.test(q)) add("📐 Open Dimensions", "open dimensions");
  if (/\bperformance|optimi[sz]|slow|dense|sparse|block size|aggregat|cube (size|health)\b/.test(q)) add("📊 Cube optimization analysis (BPC)", "performance");
  if (/\bform|grid|input|no data|empty|pov|intersection\b/.test(q)) add("🔍 Explain this screen", "explain this");
  // Always offer a couple of generic, always-useful steps last.
  add("🔍 Explain what's on screen", "explain this");
  add("☰ Browse the menu", "menu");

  if (!chips.length) return null;
  return "**Next:**\n" + chips.slice(0, 5).map(c => `CHIP: ${c.label} → ${c.cmd}`).join("\n");
}

// Read the on-screen text from the live Planning tab (cheap, no DOM tree/image).
async function readScreen() {
  return chrome.runtime.sendMessage({ type: "readScreen", origin: planningOrigin() });
}

// POV is ADVISORY: the chat explains HOW to change a dimension member, it does
// NOT drive the console (the user keeps control of what data they pull).
function povHowTo(dim, member) {
  const D = dim.charAt(0).toUpperCase() + dim.slice(1);
  renderAiReply(addMsg("ai", ""),
    `To set **${D}** to **${member}** on the open form:\n\n` +
    `1. At the top of the form, click the **${D}** box (the current member, e.g. the dropdown next to its label).\n` +
    `2. If **${member}** is in the quick list, click it. Otherwise click **Member Selector…**.\n` +
    `3. In **Select Members**, type **${member}** in the search box, tick it, then click **OK**.\n` +
    `4. The grid refreshes for the new ${D}.\n\n` +
    `💡 No data after switching? You may be on a leaf member — try a parent/total (e.g. **Total ${D}** or **Company (Consolidated)**).\n\n` +
    "CHIP: 🧠 Analyze the data once you've switched → analyze this");
}

// ONE unified "help me understand what I'm seeing" — reads the screen and
// returns a complete picture: what it is, what it's for, the data, and (if
// empty) how the USER can fix the POV. Replaces separate read+analyze+explain.
async function understandScreen() {
  const res = await readScreen();
  if (!res || !res.ok) { sys("✗ " + ((res && res.error) || "couldn't read screen") + " — open the console/form first."); return; }
  if (!res.text) { sys("Nothing readable on screen yet — open a form or panel first."); return; }
  const prompt =
    "The user is looking at a page in the NSPB Planning console and wants to FULLY " +
    "understand what they're seeing. On-screen text (select-all capture, layout flattened):\n\n" +
    res.text.slice(0, 9000) +
    "\n\nGive ONE complete answer with short labelled sections:\n" +
    "**What this is** — name the form/panel/area (use the KB).\n" +
    "**What it's for** — why it exists in the FP&A process.\n" +
    "**The data** — current POV (Subsidiary, Currency, Scenario, Year…), which rows/columns have " +
    "values vs are empty, anything notable (spikes, negatives, all-empty).\n" +
    "**If empty** — the likely cause (POV at a leaf member, wrong scenario/version/currency, actuals " +
    "not loaded) and HOW THE USER can fix it themselves (e.g. click the Subsidiary box at the top and " +
    "pick a parent like Total Subsidiary). Do NOT offer to change it for them.\n" +
    "Be concise and concrete. If it's a list (forms, variables, rules), summarize what's there + a recommendation.";
  await askWorker(prompt, "[explained the current screen]", { forceExplain: true });
}

// Cube Performance & Optimization Analysis — a BPC-DELIVERED SERVICE.
// The chat does not run the analysis; it explains what BPC delivers, the
// 3 files we need from the client and how to get each, and who to contact.
function performanceReferral() {
  renderAiReply(addMsg("ai", ""),
    "📊 **Cube Performance & Optimization Analysis** — a BPC-delivered service\n\n" +
    "BPC analyzes your NSPB application end-to-end and delivers a branded PDF report with charts:\n" +
    "• **How big the cube really is** (blocks, page file, density) and **where the data lives** (by year and scenario)\n" +
    "• **What can be safely cleared or archived** — stale scenarios, old years, empty blocks — with the estimated space impact\n" +
    "• **Which calculations run slowest and why**, reviewed against Oracle EPM Cloud best practices, with script-level findings\n" +
    "• A **prioritized list of suggested changes** to validate together in a test environment\n\n" +
    "**To run it we need 3 files from your team:**\n" +
    "1. **LCM export** — Navigator → **Migration**: export the Planning artifacts (forms, rules, dimensions) and download the snapshot zip.\n" +
    "2. **Level-0 data export** — an Essbase **level-0 export of the Plan cube** (column format; a zip containing data1.txt). Your admin can generate it with an export job or a DATAEXPORT calc.\n" +
    "3. **Activity Report** — **Application → Activity Reports**: open the latest report, select all, and save the page/text.\n\n" +
    "Send the three files to your **BPC contact** and we'll schedule the analysis — typical turnaround is a few days.\n\n" +
    "🗺️ **Also available — NSPB Current State Assessment:** a full inventory of what you have implemented vs. what is actually used — cubes and modules, forms in use vs. stale or broken, rules that never run, out-of-date substitution variables, dashboards pointing at dead members — with suggested simplifications. Needs the same LCM export plus the **application Audit export** (Application → Audit; or EPM Automate `exportAppAudit`).\n\n" +
    "CHIP: 📦 Open Migration (for the LCM export) → open migration\n" +
    "FILL: ✉️ Draft a note to BPC requesting it… → I'd like to request the BPC cube optimization analysis. ");
}

// "Who changed this cell" — the advisory card (explains + offers the live read).
function cellHistory() {
  renderAiReply(addMsg("ai", ""),
    "🕵️ **Who changed a cell** — NSPB records every data change: the user, the old→new value and the timestamp.\n\n" +
    "Select a data cell in the open form/grid, then let me read its history — or do it by hand via right-click → **Change History**.\n\n" +
    "CHIP: 🕵️ Read the selected cell's history → read cell history\n" +
    "CHIP: 🔍 Open Audit (full change trail) → open audit");
}

// v2 — actually DRIVE it: right-click the selected cell → Change History →
// read the panel → summarize who changed it (the Squarespace deliverable).
async function readCellHistory() {
  if (!CFG.planning) { sys("Set the Planning URL in ⚙ first."); return; }
  sys("Reading the selected cell's Change History (right-click → Change History)…");
  try {
    const res = await chrome.runtime.sendMessage({ type: "cellHistory", origin: planningOrigin() });
    if (!res || !res.ok) { sys("✗ " + ((res && res.error) || "couldn't read change history") + " — select a data cell first."); return; }
    if (!res.text) { sys("The Change History panel was empty — this cell hasn't been edited."); return; }
    const prompt =
      "The user opened the NSPB cell Change History panel. Here is its visible text (select-all capture):\n\n" +
      res.text.slice(0, 6000) +
      "\n\nSummarize, as a short clear list: WHO changed this cell, the value history (old → new), and WHEN. " +
      "If the panel shows no history / is empty, say the cell hasn't been edited. " +
      "If the cell's POV/account is visible, name it. Do not invent values not in the text.";
    await askWorker(prompt, "[read the cell change history]", { forceExplain: true });
  } catch (e) { sys("✗ " + (e.message || e)); }
}

// Month-end close playbook — the typical FP&A steps (roll variables, load
// actuals, copy/seed forecast, run aggregations, save/archive version),
// GROUNDED in this tenant's actual variables/forms/rules.
async function monthEndClose() {
  if (!KB) { sys("Import the tenant-kb.json in ⚙ first."); return; }
  const sv = KB.substitutionVariables || [];
  const pit = sv.filter(v => /month|year|period|scenario|version|closed|start|qtr|fcst|curr/i.test(v.name))
    .map(v => `${v.name} = ${String(v.value).replace(/^"|"$/g, "")}`);
  const forms = (KB.forms || []).filter(f => /copy|seed|forecast|version|archive|rollover/i.test(f.name)).map(f => f.name).slice(0, 10);
  const rules = (KB.rules || []).filter(r => /copy|seed|agg|aggregate|forecast|roll|datacopy/i.test(r.name)).map(r => r.name).slice(0, 12);
  const prompt =
    "The user is an FP&A analyst doing the MONTH-END CLOSE / ROLLOVER in this NSPB tenant. " +
    "Produce a concise, ORDERED checklist of what to do and WHERE (which form / rule / area). " +
    "Cover: (1) roll the point-in-time substitution variables to the new month, (2) load the month's " +
    "actuals (Data Exchange), (3) copy/seed the forecast for the new period, (4) run the aggregation rules, " +
    "(5) save/archive the prior version (snapshot). Use the tenant's ACTUAL artifacts below — name them.\n\n" +
    "Point-in-time variables (current values):\n" + (pit.join("\n") || "(none found)") +
    "\n\nRelevant forms: " + (forms.join(", ") || "(none)") +
    "\nRelevant rules: " + (rules.join(", ") || "(none)") +
    "\n\nEnd with up to 4 CHIP lines for the first concrete actions, e.g.:\n" +
    "CHIP: 📂 Open Variables to roll them → open variables\n" +
    "CHIP: 🔁 Open Data Exchange (load actuals) → open data exchange";
  await askWorker(prompt, "[month-end close checklist]", { forceExplain: true });
}

// Check the tenant's substitution variables — flag stale point-in-time ones.
async function checkVariables() {
  if (!KB || !(KB.substitutionVariables || []).length) { sys("Import the tenant-kb.json in ⚙ first."); return; }
  const list = KB.substitutionVariables
    .map(v => `${v.name} = ${String(v.value).replace(/^"|"$/g, "")}${v.planType ? " [" + v.planType + "]" : ""}`)
    .join("\n");
  const prompt =
    "Here are the tenant's NSPB substitution variables and their CURRENT values:\n\n" + list +
    "\n\nReview them like an FP&A admin doing a month-end check. Focus on POINT-IN-TIME variables " +
    "(current month/period, forecast year & start, last closed month, current scenario/version). " +
    "Flag any that look STALE or inconsistent with each other and say which should roll forward and to what. " +
    "Ignore account/placeholder variables unless clearly wrong. Be concise: a short '✓ looks fine' note " +
    "plus a '⚠ check these' list with the reason for each.";
  await askWorker(prompt, "[checked substitution variables]", { forceExplain: true });
}

// Read the screen + send it to the AI for analysis.
async function analyzeScreen() {
  const res = await readScreen();
  if (!res || !res.ok) { sys("✗ " + ((res && res.error) || "couldn't read screen") + " — open the console/form first."); return; }
  if (!res.text) { sys("Nothing readable on screen yet — open a form or panel first."); return; }
  const prompt =
    "The user is looking at the NSPB Planning console. Here is the on-screen text " +
    "(captured like a select-all, so layout is flattened):\n\n" +
    res.text.slice(0, 9000) +
    "\n\nAnalyze the DATA, not the form's purpose — do NOT re-describe what this " +
    "form is for or how to use it (assume the user knows; if you already explained " +
    "this page in the conversation, do not repeat any of it). Report concisely: " +
    "1) the current POV (Subsidiary, Currency, Scenario…), 2) which rows/columns " +
    "actually HAVE values vs are empty/zero, 3) anything notable (spikes, negatives, " +
    "all-empty). If everything is empty / 'no valid rows', say so plainly and give " +
    "the likely cause (POV at a level without data such as a leaf subsidiary vs " +
    "Company Consolidated, wrong scenario/version/currency, actuals not loaded). " +
    "When the cause is likely the POV intersection, TELL THE USER HOW TO FIX IT " +
    "THEMSELVES — do not offer to change it for them. Give concrete manual steps, e.g. " +
    "'Click the Subsidiary box at the top of the form and pick a parent like Total " +
    "Subsidiary or Company (Consolidated)'. Use the REAL dimension names seen in the text. " +
    "If it's a list (forms, variables, rules), summarize what's there + any recommendation.";
  await askWorker(prompt, "[analyzed the on-screen content]", { forceExplain: true });
}

// Explain the page the user is looking at — capture (select-all) → AI →
// teaching answer. All behind the scenes; the user just types one command.
async function explainPage() {
  const res = await readScreen();
  if (!res || !res.ok) { sys("✗ " + ((res && res.error) || "couldn't read screen") + " — open the console first."); return; }
  if (!res.text) { sys("Nothing readable on screen yet — open a page in the console first."); return; }
  const prompt =
    "The user is looking at a page in the NSPB Planning web console and wants to " +
    "understand it. Here is the page's visible text (select-all capture, layout flattened):\n\n" +
    res.text.slice(0, 9000) +
    "\n\nTeach the user about this page, concisely:\n" +
    "1. WHAT this is — which NSPB area or which of the tenant's forms/dashboards (use the KB).\n" +
    "2. WHAT IT'S FOR in the FP&A process (why it exists, when you'd come here).\n" +
    "3. HOW it's typically used — key actions, things to watch (POV, save behavior, attached rules from the KB if it's a form).\n" +
    "End with 2-4 CHIP lines for sensible next steps, e.g.:\n" +
    "CHIP: Analyze this screen → analyze this\n" +
    "CHIP: Explore ad-hoc → adhoc";
  await askWorker(prompt, "[explained the current page]", { forceExplain: true });
}

// ── AI intent layer (max-intelligence understanding) ─────────────────
// For natural-language requests that the fast keyword router didn't catch,
// ask the model to classify the intent into a structured action, using the
// console areas + the form list as the option set. One cheap call.
const ACTIONISH = /\b(open|show|go ?to|take me|launch|abr[ií]?|abrir|abrime|mostr|muestrame|ver|llevame|ir a|quiero|necesito|need|want|analiz|analy[sz]e|why\s+no|por qu[eé])\b/i;
async function aiResolveIntent(text) {
  const areas = (window.NAV_MAP || []).map(d => d.label);
  const instruction =
    "You are the INTENT ROUTER for the NSPB Planning browser extension. " +
    "Read the user's request and reply with ONLY one line of minified JSON, no prose, no code fence:\n" +
    '{"action":"openNav"|"openForm"|"analyze"|"answer","target":"…"}\n' +
    "openNav = open a console area; target MUST be exactly one of: " + areas.join(" | ") + ".\n" +
    "openForm = open a specific data form; target = the form name the user means.\n" +
    "analyze = the user is asking about what's currently on their screen.\n" +
    "answer = a general/knowledge question to answer normally; target empty.\n" +
    'User request: "' + text + '"';
  try {
    const r = await fetch(CFG.api + "/api/chat", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: instruction }],
        language: "en", tenantKb: null, forceExplain: true,
        settings: { geminiKey: CFG.aiKey || DEFAULT_GEMINI_KEY, appName: "NetSuite" },
      }),
    });
    const d = await r.json().catch(() => ({}));
    const reply = (d && (d.reply || d.message)) || "";
    const mm = reply.match(/\{[\s\S]*?\}/);
    return mm ? JSON.parse(mm[0]) : null;
  } catch (_) { return null; }
}

// Try to satisfy a natural-language request as an ACTION (open/analyze).
// Returns true if handled. Only invoked for action-ish phrasing.
async function trySmartIntent(text) {
  if (!ACTIONISH.test(text)) return false;
  // Pure questions ("how do I…", "what is…", "which rule…") go straight to
  // the full Worker brain — skip the intent round-trip (latency + tokens).
  if (/^(what|why|how|which|when|who|where|explain|is|are|does|do|can|should|list|tell)\b/i.test(text)) return false;
  const intent = await aiResolveIntent(text);
  if (!intent || !intent.action || intent.action === "answer") return false;
  if (intent.action === "analyze") { await analyzeScreen(); return true; }
  if (intent.action === "openNav" && intent.target) {
    const dest = (window.NAV_MAP || []).find(d => d.label.toLowerCase() === String(intent.target).toLowerCase())
              || matchNavDest("open " + intent.target);
    if (dest) { await openNavDest(dest); return true; }
  }
  if (intent.action === "openForm" && intent.target) {
    await openFormInConsole(String(intent.target)); return true;
  }
  return false;
}

// ── Local command router ──────────────────────────────────────────
async function handleLocalCommand(text) {
  if (/^reset$/i.test(text)) { history = []; sys("Chat history cleared."); return true; }
  if (/^debug$/i.test(text)) { DEBUG = !DEBUG; sys("Debug mode " + (DEBUG ? "ON" : "off") + "."); return true; }
  if (/^debug\s+last$/i.test(text)) {
    sys(lastExchange ? JSON.stringify(lastExchange, null, 2) : "No request made yet.");
    return true;
  }
  if (/^(help|\?)$/i.test(text)) { showHelp(); return true; }
  if (/^menu$/i.test(text)) { toggleMenu(); return true; }

  // Ad-hoc: convert the open form to an ad-hoc grid (Actions → New Ad hoc Grid)
  // and then suggest explorations. `adhoc explore` / `suggest` = describe only.
  if (/^(adhoc|ad-?hoc|open as ad-?hoc|analyze form)$/i.test(text)) {
    await openAsAdhoc(); return true;
  }
  if (/^(adhoc explore|suggest|explore( this| form)?|explorar?( este)?( form| formulario)?)$/i.test(text)) {
    await adhocExplore(); return true;
  }

  // Unified "understand this screen" — what it is + what it's for + the data.
  if (/^(explain (this|this page|this screen)|understand( this)?|what (is this|am i looking at|am i seeing)\??|qu[eé] es (esta|la) (p[aá]gina|pantalla)\??|entender( esto| pantalla)?|explicar? (esta )?p[aá]gina)$/i.test(text)) {
    await understandScreen(); return true;
  }

  // Check substitution variables (month-end staleness review).
  if (/^(check (substitution )?variables|are the (substitution )?variables (up to date|current|ok)|revisar?( las)? variables)\??$/i.test(text)) {
    await checkVariables(); return true;
  }

  // Performance / optimization — BPC-delivered service: the chat explains
  // what it covers, the 3 files needed, and to contact BPC (referral only).
  if (/^(performance|perf|performance analysis|optimi[sz]e( ai)?|optimization|analyze (performance|optimization|the cube)|cube (health|stats)|where('s| is)? (the )?data|data distribution|what (to|should i) delete|cleanup|clean ?up|d[oó]nde est[aá]n? los datos|qu[eé] borr[ao]|current state( assessment| analysis)?|usage analysis|what('s| is) (used|unused)|unused (forms|rules|artifacts)|architecture (review|analysis|assessment))\??$/i.test(text)) {
    performanceReferral(); return true;
  }

  // Month-end close playbook.
  if (/^(month[- ]?end( close| steps)?|close steps|cierre( de)? mes|pasos? (de|del|para)( el)? cierre|rollover|roll forward)\??$/i.test(text)) {
    await monthEndClose(); return true;
  }

  // Cell change history — DRIVE it (right-click → Change History → read panel).
  if (/^(read cell history|read change history|read the cell('s)? history|history of (this|the) cell|leer (el )?historial( de la celda)?)\??$/i.test(text)) {
    await readCellHistory(); return true;
  }
  // Cell change history — advisory card (explains + offers the live read).
  if (/^(cell history|change history|who changed( this| the cell| this cell)?|qui[eé]n (modific[oó]|cambi[oó])( la celda| esta celda)?)\??$/i.test(text)) {
    cellHistory(); return true;
  }

  // Read the on-screen text (cheap select-all) — show it raw.
  if (/^(read|read screen|screen|ver pantalla|qu[eé] ves|qu[eé] hay en pantalla)$/i.test(text)) {
    const res = await readScreen();
    if (res && res.ok) addMsg("ai", res.text ? "On screen:\n\n" + res.text.slice(0, 4000) : "(no readable text — open a form/panel first)");
    else sys("✗ " + ((res && res.error) || "couldn't read screen"));
    return true;
  }

  // Analyze what's on screen — read the text, send to the AI for analysis.
  // Also catches "why is this form empty / blank / showing no data".
  if (/^(analy[sz]e( this| screen)?|analiz[aá]r?( esto| la pantalla)?|por qu[eé] no hay (datos|filas)|why (no|is there no) (data|rows))$/i.test(text) ||
      /why\s+.*\b(no\s+data|empty|blank|no\s+rows)\b/i.test(text)) {
    await analyzeScreen();
    return true;
  }

  // Explain a substitution variable from the KB (deterministic card + chips).
  let vm = text.match(/^explain\s+(?:the\s+)?variable\s+(.+)$/i);
  if (vm && KB) {
    const v = findVariable(KB, vm[1].trim());
    if (v) { renderAiReply(addMsg("ai", ""), describeVariableFromKb(v)); return true; }
    // no match → fall through to the Worker
  }

  // Explain a specific rule or form from the KB (deterministic card, no AI).
  let em = text.match(/^explain\s+(?:the\s+)?(rule|form)?\s*(.+)$/i);
  if (em && !/^variable\b/i.test(em[2]) && KB) {
    const kind = (em[1] || "").toLowerCase();   // "form", "rule", or "" (either)
    const q = em[2].trim();
    const rules = findRules(KB, q), forms = findForms(KB, q);
    const ruleHit = rules.length === 1 || (rules.length && rules.exact);
    const formHit = forms.length === 1 || (forms.length && forms.exact);
    // Respect an explicit "form"/"rule" keyword; otherwise prefer the exact one.
    const pick = (which) => which === "rule"
      ? renderAiReply(addMsg("ai", ""), describeRuleFromKb(rules[0]))
      : renderAiReply(addMsg("ai", ""), describeFormFromKb(forms[0]));
    if (kind === "form" && formHit) { pick("form"); return true; }
    if (kind === "rule" && ruleHit) { pick("rule"); return true; }
    if (!kind && ruleHit && !formHit) { pick("rule"); return true; }
    if (!kind && formHit && !ruleHit) { pick("form"); return true; }
    if (!kind && ruleHit && formHit) {
      // name matches both a rule and a form — show both, let context decide.
      renderAiReply(addMsg("ai", ""), describeFormFromKb(forms[0]));
      renderAiReply(addMsg("ai", ""), describeRuleFromKb(rules[0]));
      return true;
    }
    // Ambiguous (multiple) → let the user pick instead of guessing.
    const cand = (kind === "form" ? forms : kind === "rule" ? rules : rules.concat(forms)).slice(0, 8);
    if (cand.length > 1) {
      sys(`Several matches for "${q}":\n` + cand.map((c, i) => `${i + 1}. ${c.name}`).join("\n") +
          `\n\nType: explain <exact name>`);
      return true;
    }
    // No KB match → fall through to the Worker (kb.md general NSPB knowledge).
  }

  // POV change is ADVISORY — the chat explains HOW, it does not drive it.
  // "change subsidiary to Squarespace Inc", "set currency to USD".
  let m = text.match(/^(?:change|set|switch)\s+(?:the\s+)?([a-z][\w /&-]*?)\s+(?:pov\s+)?to\s+(.+)$/i);
  if (m && !/^variable\b/i.test(m[1])) {
    povHowTo(m[1].trim(), m[2].trim());
    return true;
  }

  m = text.match(/^open\s+(https?:\/\/\S+)$/i);
  if (m) { await navigateActiveTab(m[1]); sys("Navigating…"); return true; }

  if (/^open\s+(console|planning)$/i.test(text)) {
    if (!CFG.planning) { sys("Set the Planning URL in ⚙ first."); return true; }
    await ensurePlanningTab(CFG.planning + "/HyperionPlanning/");
    sys("Opening the Planning console…");
    return true;
  }

  // Navigator destinations: variables, rules, audit, jobs, dimensions, …
  const dest = matchNavDest(text);
  if (dest) { await openNavDest(dest); return true; }

  // "open form <name> adhoc" → open it, then explore ad-hoc.
  m = text.match(/^open\s+(?:form\s+)?(.+?)\s+(?:as\s+|in\s+|en\s+)?ad-?hoc$/i);
  if (m) { await openFormInConsole(m[1].trim(), { adhoc: true }); return true; }

  // Explicit "open form <name>" → always handled here (report no-match).
  m = text.match(/^open\s+form\s+(.+)$/i);
  if (m) { await openFormInConsole(m[1].trim()); return true; }

  // Generic "open <x>": only handle if it actually matches a KB form.
  // Otherwise fall through to the AI intent layer / Worker, so phrases like
  // "open the door to my forecast" don't dead-end with "No form matched".
  m = text.match(/^open\s+(.+)$/i);
  if (m && KB && findForms(KB, m[1].trim()).length) {
    await openFormInConsole(m[1].trim());
    return true;
  }

  return false;
}

// ── Navigator destinations (Variables, Rules, Audit, Jobs, …) ─────
const NAV_VERBS = /^(open|show|go ?to|view|analy[sz]e|analiz\w*|abrir?|abr[ií]|mostrar?|mostr[áa]|ver|llevame a|ir a)\s+/i;
function matchNavDest(text) {
  const hasVerb = NAV_VERBS.test(text);
  const q = text.replace(NAV_VERBS, "").trim().toLowerCase();
  if (!q) return null;
  const map = window.NAV_MAP || [];
  for (const d of map) if (d.keys.some(k => k === q)) return d;
  if (hasVerb) {
    for (const d of map) if (d.keys.some(k => k.length > 3 && (q.includes(k) || k.includes(q)))) return d;
  }
  return null;
}

async function openNavDest(dest) {
  renderAiReply(addMsg("ai", ""), `**${dest.label}**${dest.group ? "  ·  " + dest.group : ""}\n${dest.desc}\n\n💡 ${dest.recs}`);
  // Show the typical-questions chips IMMEDIATELY — they're answered from the KB,
  // so don't make the user wait for the (slow) console navigation to finish.
  offerFaqs(dest);
  if (!CFG.planning) { sys("Set the Planning URL in ⚙ to open it in the console."); return; }
  sys(`Opening “${dest.label}” in the console…`);
  try {
    // `near` disambiguates same-text Navigator links by column (e.g. Rules
    // under Tools = execute, vs under Create and Manage = editor).
    const path = [{ kind: "navigator" }, { kind: "text", text: dest.label, near: dest.near }];
    // Some panels open on the wrong sub-tab (e.g. Variables → "User Variables");
    // navmap entries can declare the sub-tab to auto-select after landing.
    if (dest.subTab) path.push({ kind: "text", text: dest.subTab });
    const res = await chrome.runtime.sendMessage({ type: "navConsole", origin: planningOrigin(), path });
    if (res && res.ok) sys(`✓ Opened ${dest.label}.`);
    else sys(`✗ ${(res && res.error) || "navigation failed"} — open a Planning tab & stay logged in. (A “debugging” banner appears — that's the extension driving the console.)`);
  } catch (e) { sys("✗ " + (e.message || e)); }
}

// Render a destination's typical questions as clickable CHIP lines that ask the
// assistant when clicked. Generic fallbacks when the entry has no curated faqs.
function offerFaqs(dest) {
  const faqs = (dest.faqs && dest.faqs.length) ? dest.faqs : [
    `What can I do in ${dest.label}?`,
    `How do I use ${dest.label}?`,
  ];
  const chips = faqs.slice(0, 5).map(q => `CHIP: ${q} → ${q}`).join("\n");
  renderAiReply(addMsg("ai", ""), `**Common questions about ${dest.label}:**\n${chips}`);
}

function planningOrigin() {
  try { return new URL(CFG.planning).origin; } catch (_) { return null; }
}

// ── Open a form in the REAL Planning console ──────────────────────
// Resolve the form from the KB, build the deep-link from kb.navIndex
// (cluster~card), and drive the Planning tab to that card. Selecting the
// exact sub-tab inside the card is a later (DOM-click) step.
async function openFormInConsole(name, opts) {
  opts = opts || {};
  if (!KB) { sys("Import the tenant-kb.json in ⚙ to resolve forms."); return; }
  const matches = findForms(KB, name);
  if (!matches.length) { sys(`No form matched "${name}".`); return; }

  // Multiple partial matches → ask which one.
  if (matches.length > 1 && !matches.exact) {
    sys(`Found ${matches.length} forms matching "${name}". Which one?\n` +
        matches.slice(0, 10).map((f, i) =>
          `${i + 1}. ${f.name}${f.cube ? "  [" + f.cube + "]" : ""}`).join("\n") +
        (matches.length > 10 ? `\n…(+${matches.length - 10} more)` : "") +
        `\n\nType: open form <exact name>`);
    return;
  }

  const form = matches[0];
  let landing = resolveLanding(KB, form.name);
  // ~40% of forms aren't directly nav-placed (embedded in composite forms or
  // tab-less). Don't dead-end: open the closest CARD by token overlap and tell
  // the user where to look (live UAT: "OpEx by Department" → OpEx card).
  let approx = false;
  if (!landing) { landing = nearestLanding(KB, form.name); approx = !!landing; }
  const crumb = landing
    ? [landing.clusterLabel, landing.cardLabel, landing.groupLabel, landing.tabLabel].filter(Boolean).join(" › ")
    : "(no nav path in KB)";
  // Teaching card built straight from the tenant KB (no AI → no hallucination):
  // purpose, who uses it, attached rules (+ run-on-save), and the substitution
  // variables the form actually references. This is the "explain on open".
  renderAiReply(addMsg("ai", ""),
    describeFormFromKb(form) +
    `\n📍 **Path:** ${approx ? "≈ " : ""}${crumb}` +
    (approx ? `\n⚠ "${form.name}" has no tab of its own — opening the closest area; look for it in that card's tabs (it may be embedded in a composite form).` : ""));

  if (!CFG.planning) { sys("Set the Planning URL in ⚙ to navigate."); return; }
  if (!landing) {
    sys(`No nav path for "${form.name}". Re-import the latest tenant-kb.json (with navIndex) in ⚙.`);
    return;
  }
  // Drive the console via trusted clicks: home → cluster → card → group → tab.
  // Cluster cards only exist on the HOME page, so go home first (best-effort —
  // if the ⌂ icon isn't found we're probably already there).
  const path = [{ kind: "home", optional: true }];
  if (landing.clusterLabel) path.push({ kind: "text", text: landing.clusterLabel });
  path.push({ kind: "text", text: landing.cardLabel });
  if (landing.groupLabel) path.push({ kind: "text", text: landing.groupLabel });
  if (landing.tabLabel && landing.tabLabel !== landing.cardLabel) path.push({ kind: "text", text: landing.tabLabel });
  sys(`Opening “${form.name}” in the console…`);
  try {
    const res = await chrome.runtime.sendMessage({ type: "navConsole", origin: planningOrigin(), path });
    if (res && res.ok) {
      sys(`✓ Opened ${form.name}.`);
      if (opts.adhoc) { await openAsAdhoc(); }
    } else {
      sys(`✗ ${(res && res.error) || "navigation failed"} — open a Planning tab & stay logged in.`);
    }
  } catch (e) { sys("✗ " + (e.message || e)); }
}

// Build a teaching card for a form ENTIRELY from the tenant KB. Deterministic
// (no AI), so it never invents rules/variables that aren't really there.
//   · purpose / who uses it      (aiSummary or description)
//   · attached rules + run-on-save
//   · substitution variables the form references (&VARS in its members)
//   · how it's laid out (row/col/POV dims)
function describeFormFromKb(form) {
  const sum = form.aiSummary || {};
  const lines = [`📄 **${form.name}**  ·  cube ${form.cube || "?"}` +
    (form.isInput ? "  ·  input form" : form.isReadOnly ? "  ·  read-only" : "")];

  const purpose = sum.purpose || form.description;
  if (purpose) lines.push(`\n**What it's for:** ${purpose}`);
  if (sum.whoUses) lines.push(`**Who uses it:** ${sum.whoUses}`);

  // Attached business rules (mark the ones that fire on Save).
  const rules = form.attachedRules || [];
  if (rules.length) {
    lines.push("\n**Calculations / rules attached:**");
    rules.forEach(r => lines.push(
      `• ${r.name}${r.runOnSave ? "  ⚡ runs on Save" : ""}`));
  } else if (form.hasOnSaveRules) {
    lines.push("\n**Calculations:** has on-save rules (not detailed in KB).");
  }

  // Substitution variables referenced anywhere in the form's member lists.
  const members = [].concat(
    form.columnMembers || [], form.rowMembers || [],
    form.povMembers || [], form.pageMembers || []);
  const vars = [...new Set(members.filter(m => typeof m === "string" && m.includes("&"))
    .map(m => m.trim()))];
  if (vars.length) {
    // Resolve each &VAR to its current value from the KB so the user sees the
    // actual content (e.g. &FcstYr1 = FY26), not just the variable name.
    const sv = (KB && KB.substitutionVariables) || [];
    const valueOf = (ref) => {
      const nm = ref.replace(/^&/, "").toLowerCase();
      const hit = sv.find(v => (v.name || "").toLowerCase() === nm);
      return hit ? String(hit.value).replace(/^"|"$/g, "") : null;
    };
    lines.push("\n**Substitution variables it uses:**");
    vars.forEach(v => { const val = valueOf(v); lines.push(`• ${v}${val ? ` = **${val}**` : ""}`); });
  }

  // Layout — quick orientation of the grid.
  const dimLine = [];
  if ((form.rowDims || []).length) dimLine.push(`rows = ${form.rowDims.join(", ")}`);
  if ((form.columnDims || []).length) dimLine.push(`cols = ${form.columnDims.join(", ")}`);
  if ((form.povDims || []).length) dimLine.push(`POV = ${form.povDims.join(", ")}`);
  if (dimLine.length) lines.push(`\n**Layout:** ${dimLine.join("  ·  ")}`);

  // Offer the deeper, live AI explanation (reads the actual on-screen state).
  lines.push("\nCHIP: 🔬 Explain the live page in depth → explain this page");
  lines.push("CHIP: 📊 Open as ad-hoc grid → adhoc");
  lines.push("CHIP: 🕵️ Who changed a cell? → cell history");
  if (rules.length) lines.push("CHIP: ⚙️ Explain its main rule → explain " + rules[0].name);
  return lines.join("\n");
}

// Find a substitution variable by name (tolerates a leading &).
function findVariable(kb, name) {
  const vars = kb.substitutionVariables || [];
  const n = name.toLowerCase().replace(/^&/, "").trim();
  return vars.find(v => (v.name || "").toLowerCase() === n)
    || vars.find(v => (v.name || "").toLowerCase().includes(n));
}

// Teaching card for a substitution variable — from the KB, with follow-ups.
function describeVariableFromKb(v) {
  const sum = v.aiSummary || {};
  const val = String(v.value).replace(/^"|"$/g, "");
  const lines = [`📂 **${v.name}** = **${val}**` +
    (v.planType ? `  ·  ${v.planType}` : "") + (sum.category ? `  ·  ${sum.category}` : "")];
  if (sum.whatItControls) lines.push(`\n**What it controls:** ${sum.whatItControls}`);
  if (sum.whenToUpdate) lines.push(`**When to update:** ${sum.whenToUpdate}`);
  if ((sum.impact || []).length) lines.push(`\n**If it's wrong:**\n` + sum.impact.slice(0, 4).map(i => `• ${i}`).join("\n"));
  lines.push("\nCHIP: 🔍 Are all variables up to date? → check variables");
  lines.push("CHIP: 📂 Open Variables in the console → open variables");
  return lines.join("\n");
}

// Find rules in the KB by name (exact wins; else substring; else token match).
function findRules(kb, name) {
  const rules = kb.rules || [];
  const n = name.toLowerCase().trim();
  const exact = rules.find(r => (r.name || "").toLowerCase() === n);
  if (exact) { const a = [exact]; a.exact = true; return a; }
  const sub = rules.filter(r => (r.name || "").toLowerCase().includes(n));
  if (sub.length) return sub;
  const qTok = n.split(/[^a-z0-9]+/).filter(Boolean);
  if (!qTok.length) return [];
  return rules.filter(r => {
    const t = (r.name || "").toLowerCase();
    return qTok.every(q => t.includes(q));
  });
}

// Teaching card for a calc rule — ENTIRELY from the tenant KB (no AI):
//   · what it does / what it calculates   (aiSummary.whatItDoes || description)
//   · inputs it reads → outputs it writes (aiSummary)
//   · substitution variables it references (&VARS in the calc body)
//   · which forms run it, and how to run it
function describeRuleFromKb(rule) {
  const sum = rule.aiSummary || {};
  const lines = [`⚙️ **${rule.name}**  ·  cube ${rule.cube || "?"}` +
    (rule.scriptType ? `  ·  ${rule.scriptType}` : "")];

  const what = sum.whatItDoes || rule.description;
  if (what) lines.push(`\n**What it calculates:** ${what}`);

  if ((sum.inputs || []).length) lines.push(`\n**Reads (inputs):**\n` + sum.inputs.map(i => `• ${i}`).join("\n"));
  if ((sum.outputs || []).length) lines.push(`\n**Writes (outputs):**\n` + sum.outputs.map(o => `• ${o}`).join("\n"));

  // Substitution variables referenced in the actual calc script body.
  const vars = [...new Set((String(rule.body || "").match(/&\w+/g) || []).map(v => v.trim()))];
  if (vars.length) lines.push(`\n**Substitution variables it uses:** ${vars.join(", ")}`);

  // Where it runs from + how to launch it.
  const forms = rule.attachedToForms || [];
  if (forms.length) {
    const shown = forms.slice(0, 6);
    lines.push(`\n**Runs from these forms:** ${shown.join(", ")}` +
      (forms.length > shown.length ? `  (+${forms.length - shown.length} more)` : ""));
  }
  lines.push("\n**How to run it:** open a form it's attached to and **Save** (if it's set to run on save), " +
    "or run it manually via **Actions → Business Rules** in the form, or from the **Rules** area.");

  lines.push("\nCHIP: 🗂️ Check recent runs (Jobs) → open jobs");
  return lines.join("\n");
}

// Best-effort landing for a form with NO direct nav entry: pick the navIndex
// entry with the highest word overlap (e.g. "OpEx by Department" → the "OpEx"
// card). Returns null when nothing shares at least one meaningful token.
function nearestLanding(kb, name) {
  const idx = kb.navIndex || {};
  const STOP = new Set(["by", "the", "a", "an", "of", "to", "and", "all", "form", "report"]);
  const toks = s => s.toLowerCase().split(/[^a-z0-9]+/).filter(t => t && !STOP.has(t)).map(t => t.replace(/s$/, ""));
  const want = toks(name);
  if (!want.length) return null;
  let best = null, bestScore = 0;
  for (const k of Object.keys(idx)) {
    const have = new Set(toks(k));
    let score = want.filter(t => have.has(t)).length;
    if (!score) continue;
    score += 1 / (1 + Math.abs(have.size - want.length)); // prefer tighter labels
    if (score > bestScore) { bestScore = score; best = idx[k]; }
  }
  return best;
}

// Look up a form/dashboard name in kb.navIndex → its landing target.
function resolveLanding(kb, name) {
  const idx = kb.navIndex || {};
  const n = (name || "").toLowerCase().replace(/\.$/, "").replace(/\s+/g, " ").trim();
  if (idx[n]) return idx[n];
  for (const k of Object.keys(idx)) {
    if (k.length > 4 && (k.includes(n) || n.includes(k))) return idx[k];
  }
  return null;
}

// Build the Planning console deep-link to a cluster~card landing target.
function buildLandingUrl(landing) {
  const enc = String(landing).replace(/~/g, "%7E");
  return CFG.planning +
    "/HyperionPlanning/vb/index.html?page=ecvbs-v2&ecvbs-v2=efs&efs=efs-start&efs-start=blank" +
    "&efsLandingPage=" + enc + "&isHomePage=false";
}

// Returns matching forms. If an EXACT name match exists, returns just that
// (with .exact = true). Otherwise returns all partial (substring) matches.
function findForms(kb, name) {
  const forms = kb.forms || [];
  const n = name.toLowerCase().trim();
  const exact = forms.find(f => (f.name || "").toLowerCase() === n);
  if (exact) { const arr = [exact]; arr.exact = true; return arr; }
  const sub = forms.filter(f => (f.name || "").toLowerCase().includes(n));
  if (sub.length) return sub;
  // Token fallback — tolerate plural/singular and minor word slips, so
  // "Income Statement Adjustments" still finds "…Adjustment" (live UAT bug).
  const sing = t => t.replace(/s$/, "");
  const qTok = n.split(/[^a-z0-9]+/).filter(Boolean).map(sing);
  if (!qTok.length) return [];
  const hits = forms.filter(f => {
    const fTok = (f.name || "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).map(sing);
    return qTok.every(q => fTok.some(t => t === q || t.startsWith(q)));
  });
  if (hits.length === 1) hits.exact = true; // unambiguous → open directly
  return hits;
}
function findNavForForm(kb, formName) {
  const fn = formName.toLowerCase();
  for (const flow of (kb.navigationFlows || [])) {
    for (const mod of (flow.modules || [])) {
      const tab = (mod.tabsDetail || []).find(t => (t.artifactName || "").toLowerCase() === fn);
      if (tab) return { module: mod.module, tab: tab.label };
      if ((mod.artifacts || []).some(a => a.toLowerCase() === fn)) return { module: mod.module, tab: null };
    }
  }
  return null;
}

// ── Tab navigation ────────────────────────────────────────────────
async function navigateActiveTab(url) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) { sys("No active tab."); return; }
  await chrome.tabs.update(tab.id, { url });
}
async function ensurePlanningTab(url) {
  let origin = null;
  try { origin = new URL(CFG.planning).origin; } catch (_) {}
  const all = await chrome.tabs.query({});
  const existing = origin ? all.find(t => t.url && t.url.startsWith(origin)) : null;
  if (existing) {
    await chrome.tabs.update(existing.id, { url, active: true });
    if (existing.windowId != null) { try { await chrome.windows.update(existing.windowId, { focused: true }); } catch (_) {} }
  } else {
    await chrome.tabs.create({ url, active: true });
  }
}

// ── Rendering ─────────────────────────────────────────────────────
function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
// Minimal inline markdown: **bold**, `code`, newlines.
function mdInline(s) {
  return escapeHtml(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\n/g, "<br>");
}
// Render an AI reply: turn "CHIP: label → command" lines into clickable
// chips; everything else gets light markdown.
function renderAiReply(el, text) {
  el.innerHTML = "";
  const lines = String(text).split("\n");
  let buf = [];
  const flush = () => {
    if (!buf.join("").trim()) { buf = []; return; }
    const p = document.createElement("div");
    p.innerHTML = mdInline(buf.join("\n"));
    el.appendChild(p);
    buf = [];
  };
  for (const line of lines) {
    // CHIP: label → command   (runs it)   |   FILL: label → text   (prefills input)
    const m = line.match(/^\s*(CHIP|FILL):\s*(.+?)\s*(?:→|->)\s*(.+?)\s*$/);
    if (m) {
      flush();
      const btn = document.createElement("button");
      btn.className = "chip" + (m[1] === "FILL" ? " chip-fill" : "");
      btn.textContent = m[2];
      const arg = m[3];
      if (m[1] === "FILL") {
        btn.addEventListener("click", () => { els["input"].value = arg; els["input"].focus(); });
      } else {
        btn.addEventListener("click", () => runCommand(arg));
      }
      el.appendChild(btn);
    } else {
      buf.push(line);
    }
  }
  flush();
  els["log"].scrollTop = els["log"].scrollHeight;
}
// Run a command as if the user typed it.
function runCommand(cmd) {
  els["input"].value = cmd;
  if (els["composer"].requestSubmit) els["composer"].requestSubmit();
  else onSend(new Event("submit"));
}

function addMsg(role, text) {
  const el = document.createElement("div");
  el.className = "msg " + (role === "user" ? "user" : "ai");
  el.textContent = text;
  els["log"].appendChild(el);
  els["log"].scrollTop = els["log"].scrollHeight;
  return el;
}
function sys(text) {
  const el = document.createElement("div");
  el.className = "msg sys";
  el.textContent = text;
  els["log"].appendChild(el);
  els["log"].scrollTop = els["log"].scrollHeight;
  return el;
}
