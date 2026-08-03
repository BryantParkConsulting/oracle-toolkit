---
name: NSPB Excel add-in project overview
description: What the essbase MPC4 Excel project is, its main components, and how changes are deployed
type: project
originSessionId: 2a2af90e-6b37-4520-b32d-7272f7c10c02
---
Project is an Excel task-pane add-in (Office.js) backed by a Cloudflare Worker that talks to Oracle NSPB (NetSuite Planning & Budgeting / Hyperion Planning). Users type natural-language queries in the task pane and get back ad-hoc grids, form renders, comparisons, and finance commentary.

## Key files

- `worker/worker.js` (~5200 LoC) — backend. Tool schemas, system prompt builder, dispatch, all data tools (build_adhoc / compare_grid / top_drivers / modify_grid / find_member / open_form / show_inventory / show_dm_details / show_integration_detail / show_mapping / show_pipeline / show_filebrowser / format_active_sheet / clean_active_sheet / show_help / **analyze_active_sheet**), discovery functions (catalog/rules/forms/vars/jobs/integrations/applications/savedqueries/**app-config**), Gemini flash→pro fallback.
- `worker/clientNetsuite.js` — Pharmalogic-tenant fallback config (cubes / dims / cubeDimDefaults / presets / memberHints / glossary). Used when `appConfig` isn't shipped from the client. New tenants ignore this and use auto-detected appConfig instead.
- `worker/build.js` — concatenates clientNetsuite.js + worker.js + inlines `kb.md` (170KB NSPB knowledge base) + inlines task-pane HTML/CSS/JS into `bundle.js` for `wrangler deploy`.
- `worker/kb.md` — bundled NSPB / Hyperion how-to docs from MCP3 (`nspb_documentation_full.md`, image refs stripped). Gemini answers `how do I X` questions from this directly — no web KB redirect.
- `src/taskpane.html` + `taskpane.css` + `taskpane.js` — Office.js task pane UI. Settings (⚙), chat composer, sheet writer (`writeGridToSheet` with `format:"help"` styling). Client-side actions: `formatActiveSheetAsReport`, `cleanActiveSheetZeros`, `readActiveSheetForAnalysis`.
- `manifest.xml`, `Install/Start/Uninstall NSPB.bat` — sideload scaffolding.

## Deploy flow

```
cd worker
node build.js          # regenerates bundle.js (concatenates everything)
npx wrangler deploy    # uploads to gentle-moon-046f.nspbassistant.workers.dev
```

User then hard-refreshes the task pane (close + reopen) to pick up new client-side code.

## Architecture invariants (don't break)

- **Worker is stateless.** Each chat call ships catalog/businessRules/forms/variables/jobs/lastGrid/appConfig/glossary/activeSheet from the client → no server-side cache to drift. Only exception: `svSessionCache` for SmartView sIDs (TTL ~10 min).
- **Basic Auth only.** All NSPB calls use HTTP Basic Auth from the worker. Endpoints under `/aif/ui/model/*`, `/interop/*`, `/efsvbuirest/.../flows/*` reject Basic Auth (401) — they require NSPB UI session cookies. Functions that depend on those endpoints are stubbed with explanatory sheets, NOT crashed.
- **Gemini flash → pro fallback.** Flash uses `toolMode=AUTO` for speed. Pro uses `toolMode=ANY` for guaranteed tool calls. Auto-escalate to pro on `MALFORMED_FUNCTION_CALL` or empty-tool-calls flash response.
- **`runOpenForm` slice failure decoupled from rules.** If `req_GetFormSlice` throws (errcode 60000 = missing dim access), still render instructions + attached rules with a stub grid + ⚠ banner. Don't `throw` and lose the rules.
- **SmartView XML for forms.** `req_GetFormSlice` with FULL `<preferences>` block (matches real Smart View Excel add-in capture). `<navigate withData="1"/>` is critical — without it cells come back empty.
- **Tool dispatch ALWAYS adds Gemini types as flat strings.** `type: ["integer","string"]` (array union) breaks Gemini schema validation. Use `type: "string"` and coerce server-side.

## Why this matters (recurring tasks)

When the user asks for a fix or new tool:
- Check if it needs Basic Auth (works) or session auth (stub gracefully).
- Check if it needs to be portable (use `effectiveCubeDefaults(settings, cube)` / `effectiveCubeDims(settings, cube)`, NOT `CLIENT_CONFIG.cubeDimDefaults` directly).
- For new tools: register the tool descriptor + add to `TOOLS` array + add dispatch in `runChatTurn` + add system-prompt routing/example.
