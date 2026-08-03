"use strict";

// ── Open the side panel when the toolbar icon is clicked ──────────────
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});

// ── Trusted-click navigation engine ──────────────────────────────────
// Oracle JET only navigates on TRUSTED input (synthetic JS clicks are
// ignored). The only way for an extension to send trusted clicks is the
// chrome.debugger protocol (Input.dispatchMouseEvent). This module attaches
// the debugger to the Planning tab and clicks a sequence of nav targets,
// each located by label via Runtime.evaluate.

// JS (string) that, given a target descriptor, returns the click coordinates
// of the matching element (CSS px, viewport-relative) or null.
function finderExpr(target) {
  const t = JSON.stringify(target);
  return `(${(function(target){
    function vis(el){ const r=el.getBoundingClientRect(); return r.width>4 && r.height>4 && r.bottom>0 && r.right>0; }
    function center(el){ const r=el.getBoundingClientRect(); return {x:Math.round(r.left+r.width/2), y:Math.round(r.top+r.height/2)}; }
    if (target.kind === 'navigator') {
      let el = document.querySelector('[aria-label="Navigator"], a[title="Navigator"]')
        || [...document.querySelectorAll('a,button,[role="button"]')]
             .find(e => ((e.getAttribute('aria-label')||e.title||'').trim() === 'Navigator'));
      return el && vis(el) ? center(el) : null;
    }
    if (target.kind === 'home') {
      let el = document.querySelector('[aria-label="Home"], a[title="Home"]')
        || [...document.querySelectorAll('a,[role="link"],[role="button"],button')]
             .find(e => ((e.getAttribute('aria-label')||e.title||'').trim() === 'Home'));
      return el && vis(el) ? center(el) : null;
    }
    const want = (target.text||'').trim().toLowerCase();
    // TIERED matching — real navigation widgets first, generic anchors LAST.
    // Why: a Documents folder named "Workforce" is a plain <a href> and must
    // never beat the "Workforce" home card / nav tab (live bug we hit).
    //   tier 1: home tiles (.app-nav-label) + JET tabs (oj-tabbar / role=tab)
    //   tier 2: generic links, buttons, menu items ("Actions", "Save", …)
    const TIERS = [
      '.app-nav-label,.app-nav-item a,a[role="tab"],[role="tab"],li[id] a,' +
        '.oj-tabbar-item-element a,.oj-tabbar-item-element,[class*="navCard"]',
      'a[href],button,[role="button"],[role="menuitem"],[role="option"]',
    ];
    const label = e => ((e.textContent||'').trim() || e.getAttribute('title') || e.getAttribute('aria-label') || '').trim().toLowerCase();
    // System panels (Variables, Audit, Jobs…) render inside same-origin ADF
    // IFRAMES — search every accessible frame recursively, offsetting the
    // returned coordinates by each iframe's position so the final point is
    // in TOP-viewport CSS px (what Input.dispatchMouseEvent expects).
    function searchDoc(doc, offX, offY, sel) {
      let els;
      try { els = [...doc.querySelectorAll(sel)].filter(vis); } catch (e) { return null; }
      // Ranked candidates: exact label, then prefix, then substring.
      let ranked = [].concat(
        els.filter(e => label(e) === want),
        els.filter(e => label(e) !== want && label(e).startsWith(want)),
        els.filter(e => label(e) !== want && !label(e).startsWith(want) && label(e).includes(want))
      );
      // Disambiguate same-text links by COLUMN: e.g. the Navigator has "Rules"
      // under both Tools (execute) and Create and Manage (editor). target.near
      // ("Tools") prefers the candidate sitting just below that column header.
      if (target.near && ranked.length > 1) {
        const nearWant = String(target.near).toLowerCase();
        let headers = [];
        try {
          headers = [...doc.querySelectorAll('a,span,div,h1,h2,h3,li,strong')]
            .filter(el => vis(el) && label(el) === nearWant)
            .map(el => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top }; });
        } catch (e) {}
        if (headers.length) {
          const score = (e) => {
            const r = e.getBoundingClientRect();
            let best = Infinity;
            for (const h of headers) {
              if (h.y <= r.top && Math.abs(h.x - r.left) < 160) best = Math.min(best, r.top - h.y);
            }
            return best;
          };
          ranked = ranked.slice().sort((a, b) => score(a) - score(b));
        }
      }
      for (const e of ranked) {
        const r = e.getBoundingClientRect();
        const lx = r.left + r.width / 2, ly = r.top + r.height / 2;
        // Only accept if the element is actually the TOP-most at that point —
        // never click an element hidden behind an overlay (e.g. the open
        // Navigator menu sitting over a panel). Caught live via CDP.
        let top = null;
        try { top = doc.elementFromPoint(lx, ly); } catch (_) {}
        if (top && (top === e || e.contains(top) || top.contains(e))) {
          return { x: Math.round(lx) + offX, y: Math.round(ly) + offY };
        }
      }
      let frames;
      try { frames = doc.querySelectorAll('iframe'); } catch (e) { return null; }
      for (const f of frames) {
        try {
          const d = f.contentDocument;
          if (!d || !vis(f)) continue;
          const fr = f.getBoundingClientRect();
          const hit = searchDoc(d, offX + fr.left, offY + fr.top, sel);
          if (hit) return hit;
        } catch (e) { /* cross-origin frame — skip */ }
      }
      return null;
    }
    for (const sel of TIERS) {
      const hit = searchDoc(document, 0, 0, sel);
      if (hit) return hit;
    }
    return null;
  }).toString()})(${t})`;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function dbg(tabId, method, params) {
  return chrome.debugger.sendCommand({ tabId }, method, params || {});
}

async function findCoords(tabId, target, tries = 18) {
  for (let i = 0; i < tries; i++) {
    const res = await dbg(tabId, "Runtime.evaluate", {
      expression: finderExpr(target), returnByValue: true,
    });
    const v = res && res.result && res.result.value;
    if (v && typeof v.x === "number") return v;
    await sleep(700); // element not ready yet — page still rendering
  }
  return null;
}

async function trustedClick(tabId, x, y) {
  await dbg(tabId, "Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "none" });
  await dbg(tabId, "Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1 });
  await dbg(tabId, "Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", buttons: 1, clickCount: 1 });
}

// Trusted RIGHT-click — opens the grid/form context menu (the only way to reach
// "Change History" on a cell). JET/SlickGrid listen for the contextmenu event.
async function trustedRightClick(tabId, x, y) {
  await dbg(tabId, "Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "none" });
  await dbg(tabId, "Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "right", buttons: 2, clickCount: 1 });
  await dbg(tabId, "Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "right", buttons: 2, clickCount: 1 });
}

// Locate the currently SELECTED/active grid cell (recursing into ADF iframes).
function activeCellExpr() {
  return `(${(function () {
    function vis(el) { const r = el.getBoundingClientRect(); return r.width > 4 && r.height > 4; }
    const SEL = [".slick-cell.active", ".slick-cell.selected", "td.active", ".af_table_data-cell.p_AFSelected", "[aria-selected='true'].slick-cell"];
    function search(doc, ox, oy) {
      for (const s of SEL) {
        let els;
        try { els = [...doc.querySelectorAll(s)].filter(vis); } catch (e) { continue; }
        if (els.length) { const r = els[0].getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2 + ox), y: Math.round(r.top + r.height / 2 + oy) }; }
      }
      let frames;
      try { frames = doc.querySelectorAll("iframe"); } catch (e) { return null; }
      for (const f of frames) {
        try { const d = f.contentDocument; if (!d || !vis(f)) continue; const b = f.getBoundingClientRect(); const h = search(d, ox + b.left, oy + b.top); if (h) return h; } catch (e) {}
      }
      return null;
    }
    return search(document, 0, 0);
  }).toString()})()`;
}

// v2 Change History: right-click the selected cell → click "Change History" →
// read the resulting panel text. Returns { ok, text } for the client to summarize.
async function runCellHistory(tabId) {
  let attached = false;
  try {
    await chrome.debugger.attach({ tabId }, "1.3");
    attached = true;
    await dbg(tabId, "Runtime.enable");
    // 1. find the selected cell
    let cell = null;
    for (let i = 0; i < 6 && !cell; i++) {
      const r = await dbg(tabId, "Runtime.evaluate", { expression: activeCellExpr(), returnByValue: true });
      cell = r && r.result && r.result.value;
      if (!cell) await sleep(500);
    }
    if (!cell) return { ok: false, error: "No selected cell — click a data cell in the form/grid first, then try again." };
    // 2. right-click it → context menu
    await trustedRightClick(tabId, cell.x, cell.y);
    await sleep(1600);
    // 3. find + click "Change History" (a context-menu item)
    const mi = await findCoords(tabId, { kind: "text", text: "Change History" }, 8);
    if (!mi) {
      await dbg(tabId, "Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
      await dbg(tabId, "Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
      return { ok: false, error: "“Change History” didn’t appear in the cell menu — pick a base (input) data cell, not a calculated/parent cell." };
    }
    await trustedClick(tabId, mi.x, mi.y);
    await sleep(2600); // history dialog loads
    // 4. read the dialog text, then close it
    const text = await readScreenText(tabId);
    await dbg(tabId, "Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await dbg(tabId, "Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    return { ok: true, text };
  } catch (e) {
    let msg = String(e && e.message || e);
    if (/already attached|another debugger/i.test(msg)) msg = "Another debugger is attached to the Planning tab (DevTools or an automation). Close it and retry.";
    return { ok: false, error: msg };
  } finally {
    if (attached) { try { await chrome.debugger.detach({ tabId }); } catch (_) {} }
  }
}

// path = ordered array of targets:
//   {kind:'navigator'} | {kind:'home', optional:true} | {kind:'text', text:'…'}
// optional targets are skipped (not fatal) when they can't be found.
async function runNavPath(tabId, path) {
  let attached = false;
  try {
    await chrome.debugger.attach({ tabId }, "1.3");
    attached = true;
    await dbg(tabId, "Runtime.enable");
    for (const target of path) {
      // Verified live: heavy cards AND system panels (Variables/Audit/… render
      // in nested iframes) can take 30-45s cold. Required targets retry up to
      // ~45s (64 × 700ms); optional ones (home) stay quick.
      const c = await findCoords(tabId, target, target.optional ? 4 : 64);
      console.log("[nav] target", JSON.stringify(target), "→", c ? `(${c.x},${c.y})` : "NOT FOUND");
      if (!c) {
        if (target.optional) { console.log("[nav] optional, skipping"); continue; }
        return { ok: false, error: `Couldn't find "${target.text || target.kind}" on screen` };
      }
      await trustedClick(tabId, c.x, c.y);
      if (target.kind === "home") {
        // Wait until the home card tiles actually render before searching the
        // next target — otherwise the previous page (e.g. Documents, which can
        // contain a folder named like a card) is still on screen and wins.
        // Cold home can take 60s+ (measured live) — be patient here, the
        // next target's own retry window only starts once tiles render.
        for (let i = 0; i < 75; i++) {
          const r = await dbg(tabId, "Runtime.evaluate", {
            expression: "!!document.querySelector('.app-nav-label')", returnByValue: true,
          });
          if (r && r.result && r.result.value) break;
          await sleep(800);
        }
        await sleep(800);
        continue;
      }
      const settle = target.kind === "navigator" ? 900 : 2200;
      await sleep(settle); // let the view render
    }
    return { ok: true };
  } catch (e) {
    let msg = String(e && e.message || e);
    if (/already attached|another debugger/i.test(msg)) {
      msg = "Another debugger is attached to the Planning tab (DevTools or an automation). Close it and retry.";
    }
    return { ok: false, error: msg };
  } finally {
    if (attached) { try { await chrome.debugger.detach({ tabId }); } catch (_) {} }
  }
}

// ── Change a POV member on the open form ─────────────────────────────
// Verified live: clicking the POV value (e.g. Subsidiary "Spaceship L P")
// opens a JET combobox dropdown listing recent members + "Member Selector…",
// and leaves the value text selected (typing replaces it). Strategy:
//   1. click the value element right under the dim label → dropdown opens
//   2. if the wanted member is in the dropdown list → trusted-click it
//   3. else type the member name (replaces the selected text) + Enter
function povValueFinderExpr(dim) {
  const d = JSON.stringify(dim);
  return `(${(function (dim) {
    function vis(el) { const r = el.getBoundingClientRect(); return r.width > 4 && r.height > 4 && r.bottom > 0 && r.right > 0; }
    const want = dim.trim().toLowerCase();
    function search(doc, ox, oy) {
      let labels;
      try {
        labels = [...doc.querySelectorAll('span,div,label,td')].filter(e =>
          e.children.length === 0 && vis(e) &&
          (e.textContent || '').trim().toLowerCase() === want);
      } catch (e) { return null; }
      for (const lab of labels) {
        const lr = lab.getBoundingClientRect();
        // the editable POV value sits just BELOW its dim label
        let cands;
        try { cands = [...doc.querySelectorAll('a,span,input,[role="combobox"]')].filter(vis); } catch (e) { continue; }
        for (const c of cands) {
          const cr = c.getBoundingClientRect();
          const t = (c.textContent || c.value || '').trim();
          if (cr.top > lr.bottom - 2 && cr.top < lr.bottom + 30 &&
              Math.abs(cr.left - lr.left) < 120 && t && t.toLowerCase() !== want) {
            return { x: Math.round(cr.left + cr.width / 2) + ox, y: Math.round(cr.top + cr.height / 2) + oy, current: t.slice(0, 60) };
          }
        }
      }
      let frames;
      try { frames = doc.querySelectorAll('iframe'); } catch (e) { return null; }
      for (const f of frames) {
        try {
          const fd = f.contentDocument;
          if (!fd || !vis(f)) continue;
          const fr = f.getBoundingClientRect();
          const hit = search(fd, ox + fr.left, oy + fr.top);
          if (hit) return hit;
        } catch (e) { /* cross-origin */ }
      }
      return null;
    }
    return search(document, 0, 0);
  }).toString()})(${d})`;
}

function povItemFinderExpr(member) {
  const m = JSON.stringify(member);
  return `(${(function (member) {
    function vis(el) { const r = el.getBoundingClientRect(); return r.width > 4 && r.height > 4 && r.bottom > 0 && r.right > 0; }
    // collapse whitespace BOTH sides — Oracle member labels can carry double
    // spaces ("Squarespace  Inc"), which breaks naive includes() matching
    const clean = s => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
    const want = clean(member);
    function search(doc, ox, oy) {
      let items;
      // POV dropdown rows are DIV.oj-flex-item.overflow-ellipsis (NOT li/option)
      try { items = [...doc.querySelectorAll('li,[role="option"],[role="listitem"],.oj-listbox-result,div.oj-flex-item.overflow-ellipsis')].filter(vis); } catch (e) { return null; }
      const label = e => clean(e.textContent);
      const ranked = [].concat(
        items.filter(e => label(e) === want),
        items.filter(e => label(e) !== want && label(e).includes(want)));
      for (const e of ranked) {
        const r = e.getBoundingClientRect();
        return { x: Math.round(r.left + r.width / 2) + ox, y: Math.round(r.top + r.height / 2) + oy, picked: (e.textContent || '').trim().slice(0, 60) };
      }
      let frames;
      try { frames = doc.querySelectorAll('iframe'); } catch (e) { return null; }
      for (const f of frames) {
        try {
          const fd = f.contentDocument;
          if (!fd || !vis(f)) continue;
          const fr = f.getBoundingClientRect();
          const hit = search(fd, ox + fr.left, oy + fr.top);
          if (hit) return hit;
        } catch (e) { }
      }
      return null;
    }
    return search(document, 0, 0);
  }).toString()})(${m})`;
}

// JS that finds the POV's oj-searchselect INPUT for a dim (recursing into the
// form iframes), optionally focuses + selects its text, and reports its value.
function povInputExpr(dim, doFocus) {
  const d = JSON.stringify(dim);
  return `(${(function (dim, doFocus) {
    function vis(el) { const r = el.getBoundingClientRect(); return r.width > 4 && r.height > 4; }
    function walk(doc) {
      let ins;
      try { ins = [...doc.querySelectorAll("input.oj-searchselect-input")].filter(vis); } catch (e) { ins = []; }
      for (const inp of ins) {
        const cell = inp.closest(".pbcs-pov-item");
        const lab = cell ? (cell.textContent || "").trim() : "";
        if (lab.toLowerCase().indexOf(dim.toLowerCase()) === 0) {
          if (doFocus) { inp.focus(); inp.select(); }
          const r = inp.getBoundingClientRect();
          // climb the frame chain to report TOP-viewport coords for clicking
          let x = r.left + r.width / 2, y = r.top + r.height / 2, w = doc.defaultView;
          while (w && w !== w.parent) {
            const fe = w.frameElement;
            if (!fe) break;
            const fr = fe.getBoundingClientRect();
            x += fr.left; y += fr.top; w = w.parent;
          }
          return { val: inp.value, x: Math.round(x), y: Math.round(y) };
        }
      }
      let frames;
      try { frames = doc.querySelectorAll("iframe"); } catch (e) { return null; }
      for (const f of frames) {
        try {
          const fd = f.contentDocument;
          if (!fd) continue;
          const r = walk(fd);
          if (r) return r;
        } catch (e) { }
      }
      return null;
    }
    return walk(document);
  }).toString()})(${d}, ${doFocus ? "true" : "false"})`;
}

async function typeChars(tabId, text) {
  for (const ch of text) {
    // keyDown WITH text inserts the char (verified live: adding a separate
    // 'char' event doubles every character — "SSqquuaarree").
    await dbg(tabId, "Input.dispatchKeyEvent", { type: "keyDown", text: ch, key: ch });
    await dbg(tabId, "Input.dispatchKeyEvent", { type: "keyUp", key: ch });
    await sleep(50);
  }
}

async function pressKey(tabId, key, vk) {
  for (const type of ["keyDown", "keyUp"])
    await dbg(tabId, "Input.dispatchKeyEvent", {
      type, key, code: key, windowsVirtualKeyCode: vk,
      ...(key === "Enter" ? { text: "\r" } : {}),
    });
}

// JS that lists the member labels currently shown in the open POV dropdown
// (skips the "Member Selector …" action row). Used to suggest valid picks.
function povRecentsExpr() {
  return `(${(function () {
    function vis(el) { const r = el.getBoundingClientRect(); return r.width > 4 && r.height > 4; }
    const clean = s => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
    const out = [];
    function scan(doc) {
      let rows;
      try { rows = [...doc.querySelectorAll("div.oj-flex-item.overflow-ellipsis")].filter(vis); } catch (e) { return; }
      for (const r of rows) {
        const t = (r.textContent || "").replace(/\s+/g, " ").trim();
        if (t && !/^member selector/i.test(t) && !out.some(x => clean(x) === clean(t))) out.push(t);
      }
      let frames;
      try { frames = doc.querySelectorAll("iframe"); } catch (e) { return; }
      for (const f of frames) { try { if (f.contentDocument) scan(f.contentDocument); } catch (e) { } }
    }
    scan(document);
    return out.slice(0, 12);
  }).toString()})()`;
}

async function runChangePov(tabId, dim, member) {
  let attached = false;
  try {
    await chrome.debugger.attach({ tabId }, "1.3");
    attached = true;
    await dbg(tabId, "Runtime.enable");
    // 1. find the POV's searchselect input, focus it, select existing text
    let val = null;
    for (let i = 0; i < 10 && !val; i++) {
      const r = await dbg(tabId, "Runtime.evaluate", { expression: povInputExpr(dim, true), returnByValue: true });
      val = r && r.result && r.result.value;
      if (!val) await sleep(700);
    }
    if (!val) return { ok: false, error: `Couldn't find a "${dim}" POV on the open form` };
    // 2. TRUSTED click on the input — opens the "recent members" dropdown.
    //    DO NOT TYPE: typing fires a server search that never populates and
    //    blanks the list (verified live). The recents list is already there.
    await trustedClick(tabId, val.x, val.y);
    // 3. poll for the wanted member in the dropdown, then CLICK it
    let item = null;
    for (let i = 0; i < 12 && !item; i++) {
      await sleep(900);
      const ri = await dbg(tabId, "Runtime.evaluate", { expression: povItemFinderExpr(member), returnByValue: true });
      item = ri && ri.result && ri.result.value;
    }
    if (!item) {
      // not among recents — list what IS available so the user can pick one,
      // then close cleanly. (Driving the full Member Selector dialog isn't
      // worth the fragility; the recents list covers the common cases.)
      const rl = await dbg(tabId, "Runtime.evaluate", { expression: povRecentsExpr(), returnByValue: true });
      const recents = (rl && rl.result && rl.result.value) || [];
      await pressKey(tabId, "Escape", 27);
      return {
        ok: false, notInRecents: true, recents,
        error: `"${member}" isn't in the ${dim} quick-pick list.`,
      };
    }
    await trustedClick(tabId, item.x, item.y);
    await sleep(4000); // grid refresh
    // 4. VERIFY — only report success if the input now shows the new member.
    const rv = await dbg(tabId, "Runtime.evaluate", { expression: povInputExpr(dim, false), returnByValue: true });
    const now = rv && rv.result && rv.result.value;
    const norm = s => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (now && norm(now.val) && norm(now.val) !== norm(val.val) &&
        (norm(now.val).includes(norm(member).slice(0, 14)) || norm(member).includes(norm(now.val)))) {
      return { ok: true, from: val.val, to: now.val, how: "recents" };
    }
    // didn't stick — Escape restores the original value, report honestly
    await pressKey(tabId, "Escape", 27);
    return { ok: false, error: `The POV still shows "${(now && now.val) || val.val}" — clicked "${item.picked}" but the change didn't take effect` };
  } catch (e) {
    let msg = String(e && e.message || e);
    if (/already attached|another debugger/i.test(msg)) {
      msg = "Another debugger is attached to the Planning tab (DevTools or an automation). Close it and retry.";
    }
    return { ok: false, error: msg };
  } finally {
    if (attached) { try { await chrome.debugger.detach({ tabId }); } catch (_) {} }
  }
}

// Find (or create) the Planning tab for an origin.
async function ensurePlanningTab(origin) {
  const all = await chrome.tabs.query({});
  let tab = origin ? all.find(t => t.url && t.url.startsWith(origin)) : null;
  if (tab) { await chrome.tabs.update(tab.id, { active: true }); return tab.id; }
  if (origin) {
    const created = await chrome.tabs.create({ url: origin + "/HyperionPlanning/", active: true });
    // give it time to boot before we drive it
    await sleep(9000);
    return created.id;
  }
  return null;
}

// ── Read the on-screen TEXT (cheap "select all", no DOM tree, no image) ──
// Grabs document.body.innerText from every frame of the Planning tab. This is
// what a user would get from Ctrl+A → copy: just the rendered text (POV,
// values, "no valid rows", tab names…), tiny in tokens vs a screenshot/DOM.
async function readScreenText(tabId) {
  const results = await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    func: () => {
      // Real "select all" of the rendered body → VISIBLE text only. This
      // (unlike innerText) excludes <script>/<noscript>/hidden nodes, so it
      // stays clean and never leaks CSRF tokens or config blobs. allFrames
      // runs this in every (nested) frame; we aggregate below.
      try {
        const sel = document.getSelection();
        sel.removeAllRanges();
        const r = document.createRange();
        r.selectNodeContents(document.body);
        sel.addRange(r);
        const t = sel.toString();
        sel.removeAllRanges();
        return (t || "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
      } catch (e) { return ""; }
    },
  });
  const parts = results.map(r => r && r.result).filter(t => t && t.length > 1);
  // longest frame first (the form is usually the biggest), cap total.
  parts.sort((a, b) => b.length - a.length);
  let joined = parts.join("\n\n— — —\n\n");
  if (joined.length > 14000) joined = joined.slice(0, 14000) + "\n…(truncated)";
  return joined;
}

async function findPlanningTabId(origin) {
  const all = await chrome.tabs.query({});
  const tab = origin ? all.find(t => t.url && t.url.startsWith(origin)) : null;
  return tab ? tab.id : null;
}

// ── Message handler from the side panel ──────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === "navConsole") {
    (async () => {
      const tabId = await ensurePlanningTab(msg.origin);
      if (!tabId) { sendResponse({ ok: false, error: "No Planning tab/origin" }); return; }
      const out = await runNavPath(tabId, msg.path);
      sendResponse(out);
    })();
    return true; // async
  }
  if (msg && msg.type === "changePov") {
    (async () => {
      const tabId = await findPlanningTabId(msg.origin);
      if (!tabId) { sendResponse({ ok: false, error: "No open Planning tab — open a form first." }); return; }
      // keyboard input only reaches a FOCUSED tab — bring Planning forward
      await chrome.tabs.update(tabId, { active: true });
      await sleep(600);
      sendResponse(await runChangePov(tabId, msg.dim, msg.member));
    })();
    return true; // async
  }
  if (msg && msg.type === "cellHistory") {
    (async () => {
      const tabId = await findPlanningTabId(msg.origin);
      if (!tabId) { sendResponse({ ok: false, error: "No open Planning tab — open a form first." }); return; }
      await chrome.tabs.update(tabId, { active: true });
      await sleep(400);
      sendResponse(await runCellHistory(tabId));
    })();
    return true; // async
  }
  if (msg && msg.type === "readScreen") {
    (async () => {
      const tabId = await findPlanningTabId(msg.origin);
      if (!tabId) { sendResponse({ ok: false, error: "No open Planning tab — open the console first." }); return; }
      try { sendResponse({ ok: true, text: await readScreenText(tabId) }); }
      catch (e) { sendResponse({ ok: false, error: String(e && e.message || e) }); }
    })();
    return true; // async
  }
});
