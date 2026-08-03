# NSPB Assistant — Architecture & Developer Handoff

Lectura obligatoria si sos:
- 🤖 una AI continuando este proyecto (Antigravity / Gemini / Claude / otro)
- 👤 un dev nuevo
- 👤 vos mismo en 3 meses

**Lee esto primero, después `CLAUDE.md` para invariantes y `docs/ROADMAP.md` para qué está hecho vs pendiente.**

---

## 1. El proyecto en una frase

Excel add-in (Office.js) + Cloudflare Worker que permite consultar Oracle NetSuite Planning & Budgeting (NSPB / Hyperion Planning) en lenguaje natural desde Excel, usando Gemini (o Claude) con tool-use.

## 2. Diagrama de flujo (request → response)

```
┌─────────────────────────────────────────────────────────────────────────┐
│ EXCEL TASK PANE (add-in/src/taskpane.js)                                │
│                                                                          │
│  User types: "compare actual vs forecast"                                │
│        │                                                                 │
│        ├─→ onSend() builds POST body:                                    │
│        │   { messages, settings, catalog, lastGrid, businessRules,       │
│        │     forms, variables, jobs, appConfig, glossary, activeSheet,   │
│        │     tenantKb, debug, forceExplain, adaptMode, language }        │
│        │   (worker is STATELESS — client sends everything every turn)   │
│        ▼                                                                 │
└────────┼─────────────────────────────────────────────────────────────────┘
         │ POST /api/chat
         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ CLOUDFLARE WORKER (worker/worker.js)                                     │
│                                                                          │
│  fetch handler routes /api/chat → runChatTurn()                          │
│        │                                                                 │
│        ├─→ EXPLAIN INTERCEPT: regex /^explain (rule|form|...) <name>/   │
│        │   matches → runExplain() bypasses Gemini, returns cached       │
│        │   aiSummary from tenantKb. (Anti-hallucination pattern.)        │
│        │                                                                 │
│        ├─→ buildSystemPrompt(): packs catalog + appConfig + KB +        │
│        │   glossary + lastGrid into a system prompt (~50KB)              │
│        │                                                                 │
│        ├─→ callGemini() or callClaude() with TOOLS array                 │
│        │   Flash first (toolMode=AUTO), retry on Pro if                  │
│        │   MALFORMED_FUNCTION_CALL or empty round                        │
│        │                                                                 │
│        ├─→ Model returns functionCall → dispatch in 8500-8600           │
│        │   switch (name) {                                               │
│        │     "build_adhoc" → runBuildAdhoc()                            │
│        │     "explain" → runExplain()                                    │
│        │     "create_snapshot" → runCreateSnapshot()                     │
│        │     ... etc                                                     │
│        │   }                                                             │
│        │                                                                 │
│        ├─→ Tool handler hits NSPB REST (Basic Auth) or                  │
│        │   SmartView XML (interop) and builds out.grid / out.action      │
│        │                                                                 │
│        └─→ Response: { ok, reply, grids[], actions[], model, debug }    │
└────────┼─────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ EXCEL TASK PANE (continued)                                              │
│                                                                          │
│  - reply text → addMsg("assistant", reply) → renders bubble              │
│  - grids[] → writeGridToSheet() with Office.js                           │
│  - actions[] → runClientAction() dispatch:                               │
│      "format_active_sheet" / "clean_active_sheet" /                      │
│      "edit_sheet" / "transform_to_smartview" /                           │
│      "write_inplace_columns" / "poll_job"                                │
└─────────────────────────────────────────────────────────────────────────┘
```

## 3. Repo structure

```
nspb-migrate-fresh/
├── CLAUDE.md                 ← arquitectura concisa + invariantes (auto-loaded)
├── README.md                 ← user-facing intro
├── add-in/                   ← Excel task pane (Office.js)
│   └── src/
│       ├── taskpane.html     ← UI shell + Settings modal + tabs
│       ├── taskpane.css      ← bubble / palette / status styles
│       └── taskpane.js       ← ~11K LoC, the entire client
├── worker/
│   ├── worker.js             ← ~11K LoC, the entire backend
│   ├── clientNetsuite.js     ← legacy Pharmalogic fallback config
│   ├── build.js              ← concat → bundle.js for wrangler deploy
│   ├── bundle.js             ← gitignored / built artifact
│   ├── kb.md                 ← 170KB NSPB knowledge base (embedded)
│   └── .version              ← bumped on every build
├── clients/
│   └── <name>/
│       └── tenant-kb.json    ← parsed LCM + AI enrichment per cliente
├── tools/
│   ├── parse-lcm.js          ← parse LCM export → tenant-kb.json
│   └── enrich-kb.js          ← AI summaries per rule/form/variable
├── lcm-export/               ← gitignored, raw Oracle LCM dump (input to parser)
├── docs/
│   ├── ROADMAP.md            ← source of truth (Squarespace recap + status)
│   ├── ARCHITECTURE.md       ← this file
│   └── ... migration / legal / training docs
├── claude-memory/            ← project notes for Claude Code sessions
├── claude-plan/              ← in-flight implementation plans
└── tests/                    ← (minimal) tests
```

## 4. Deploy / dev quickstart

### Production deploy
```bash
cd worker
node build.js              # concat clientNetsuite.js + worker.js + inline kb.md + add-in HTML/CSS/JS → bundle.js
npx wrangler deploy        # uploads to https://gentle-moon-046f.nspbassistant.workers.dev
```
After deploy: close + reopen the task pane in Excel to refresh the cached client JS.

### Local dev (worker)
```bash
cd worker
node build.js
npx wrangler dev           # local at http://localhost:8787
# Then point add-in/manifest.xml at localhost OR add a settings override
```

### Local dev (just the parser / enricher)
```bash
GEMINI_API_KEY=AIza... node tools/parse-lcm.js     # parses lcm-export/ → clients/demo/tenant-kb.json + AI enrichment
CLIENT=acme LCM_ROOT=/path/to/dump node tools/parse-lcm.js
```

### Iterate fast
- Don't restart Excel for every JS change. Right-click the task pane → Reload.
- For worker-side changes you need `node build.js && npx wrangler deploy` (~10s total).
- The `.version` file gets auto-bumped — visible in the task pane header to confirm fresh deploy.

## 5. Tool catalog (Gemini function tools)

Every entry: tool name · input args · handler function · approx line in `worker.js` · NSPB endpoint hit.

| Tool name | Args | Handler | Line | NSPB endpoint |
|---|---|---|---|---|
| `build_adhoc` | `{rows, columns?, pov?, accounts?, scenarios?, periods?, years?}` | `runBuildAdhoc` | 7173 | SmartView `req_GetAdHocSlice` |
| `run_preset` | `{preset_name}` | `runPreset` | 7293 | wraps `runBuildAdhoc` with `clientNetsuite.js` presets |
| `find_member` | `{query, dim?}` | `findMember` | (catalog lookup, no NSPB call) | — |
| `modify_grid` | `{operation, …}` | `runModifyGrid` | 7356 | re-issues SV with modified slice |
| `compare_grid` | `{scenarios: [a,b], …}` | `runCompareGrid` | 7436 | two SV slices + merge |
| `top_drivers` | `{accounts?, scenarios?, n}` | `runTopDrivers` | 7606 | SV slice + sort |
| `open_form` | `{form_name}` | `runOpenForm` | 3373 | SV `req_OpenApplication` + `req_GetFormSlice` + Planning REST `/forms/{id}/properties` |
| `show_inventory` | `{kind}` | `runShowInventory` | 9286 | reads from ctx (no NSPB call); kinds: variables, rules, forms, jobs, dmjobs, alljobs, integrations, pipelines, navigation, periodmappings, applications, savedqueries, locations, jobtypes |
| `show_dm_details` | `{job_id?, process_id?}` | `runShowDmDetails` | 10075 | DM `/aif/ui/model/job/process/{id}` |
| `show_integration_detail` | `{name}` | `runShowIntegrationDetail` | — | DM integration details |
| `show_mapping` | `{name, dim?}` | `runShowMapping` | — | DM mappings |
| `show_pipeline` | `{name}` | `runShowPipeline` | — | DM pipelines (⚠ WIP, often empty) |
| `show_filebrowser` | `{path?}` | `runShowFilebrowser` | — | `/aif/ui/model/filebrowser/folders` (⚠ needs session auth, stubbed) |
| `show_dimension` | `{dim, cube?}` | `runShowDimension` | 8898 | Planning REST `/dimensions/{dim}/members` |
| `update_dimension` | `{dim, cube?, dryRun?}` | `runUpdateDimension` | 8922 | Planning REST PUT (writes from active sheet) |
| `rename_member_alias` | `{cube, dim, member, alias, aliasTable}` | `runRenameMemberAlias` | 9002 | Planning REST member update |
| `analyze_active_sheet` | `{audience?, focus?}` | `runAnalyzeSheet` | 2881 | reads activeSheet, writes narrative (no NSPB) |
| `analyze_inplace` | `{scenarioA?, scenarioB?}` | `runAnalyzeInplace` | 5083 | reads activeSheet, returns `write_inplace_columns` action |
| `edit_active_sheet` | `{operations: [{row, col, value, …}]}` | `runEditSheet` | 2840 | returns `edit_sheet` action |
| `generate_close_report` | `{title, sections, …}` | `runCloseReport` | 2534 | reads activeSheet, builds HTML report |
| `navigate_grid` | `{action, dim?, member?, …}` | `runNavigateGrid` | 2388 | SV ad-hoc nav (zoom/pivot/keep) |
| `explain` | `{target, name, includeBody?}` | `runExplain` | 1655 | reads tenantKb (no NSPB); target: rule/form/variable/account/data_flow/concept |
| `map_sheet_to_adhoc` | `{form_name}` | `runMapSheetToAdhoc` | 1155 | maps active sheet columns to a tenant form |
| `format_active_sheet` | `{style?}` | `runFormatSheet` | 8748 | returns `format_active_sheet` action |
| `clean_active_sheet` | `{}` | `runCleanSheet` | 8765 | returns `clean_active_sheet` action |
| `transform_to_smartview` | `{}` | `runTransformToSmartview` | 8780 | returns `transform_to_smartview` action |
| `show_help` | `{}` | `runShowHelp` | — | builds NSPB_Help sheet |
| `create_snapshot` | `{snapshot_name}` | `runCreateSnapshot` | 5252 | Migration `POST /interop/rest/v1/applicationsnapshots/{name}/migration?type=export` |
| `list_snapshots` | `{}` | `runListSnapshots` | 4947 | `GET /interop/rest/v1/applicationsnapshots` filtered to LCM .zip |
| `show_files` | `{}` | `runListInteropFiles` | 5000 | `GET /interop/rest/v1/applicationsnapshots` (all files) |

**Patterns to know**:
- Tool handler returns `{ ok, sheetName?, grid?, action?, reply?, error? }`
- `grid` → client writes to Excel via `writeGridToSheet()`
- `action` → client runs via `runClientAction()` (write_inplace_columns, format_active_sheet, etc)
- `reply` → text appended to chat
- Tool dispatch: line 8500-8600 in `worker.js`
- All tools registered in `TOOLS` array (line ~8050)

## 6. Endpoint catalog (`/api/*` on the worker)

Most are POST with `{ host, username, password, appName }` in body unless noted.

### Health & meta
- `GET /api/health` — worker liveness
- `GET /api/tenant-kb-embedded` — returns the bundled tenant KB
- `GET /api/subreq-limit` — Cloudflare subrequest counter
- `GET /api/discover-dims` — static dim list (legacy)
- `GET /api/nspb-help` — help docs as JSON

### Auth / probes
- `POST /api/test-connection` — verifies NSPB + Gemini both reachable
- `POST /api/probe-oauth` — IDCS OAuth probe (rarely used)
- `POST /api/diag` — runs a multi-endpoint health diagnostic
- `POST /api/probe` — generic endpoint prober
- `POST /api/probe-metadata` — wide-scan for metadata endpoints
- `POST /api/probe-schedules` — investigate scheduled-jobs endpoints (pending)

### Discovery (each populates a `localStorage` cache on the client)
- `POST /api/discover` — dim members for given dims
- `POST /api/discover-app-config` — cubes / dims / defaults / scenarios / periods / years (the `appConfig` blob)
- `POST /api/discover-rules` — business rules
- `POST /api/discover-rules-raw` — raw API response (debug)
- `POST /api/discover-forms` — forms via objectsApi → fallback to SV walk → REST
- `POST /api/discover-variables` — substitution variables
- `POST /api/discover-jobs` — recent jobs (SmartView req_EnumJobs + Planning REST + DM)
- `POST /api/discover-running-jobs` — jobs currently in flight
- `POST /api/discover-integrations` — DM integrations + pipelines
- `POST /api/discover-applications` — DM-registered apps + source systems
- `POST /api/discover-navigation` — old nav flow endpoint
- `POST /api/discover-navflows` — current nav flow + module structure
- `POST /api/discover-period-mappings` / `-v1` — DM period bridge
- `POST /api/discover-currencies` — currency dim members
- `POST /api/discover-versions` — Version dim members
- `POST /api/discover-dm-categories` — DM categories
- `POST /api/discover-locations-v1` — DM location folders

### Actions (mutate the tenant)
- `POST /api/set-subst-var` — `PUT /substitutionvariables/{name}` (update variable)
- `POST /api/run-rule` — submits a Planning rule with RTPs
- `POST /api/run-job` — generic job submit
- `POST /api/run-dm-job` — DM integration submit
- `POST /api/job-status` — poll status for any jobId (tries Planning/Interop/DM in order)

### Files / snapshots
- `POST /api/list-snapshots` — LCM zips only (filtered)
- `POST /api/list-files` — generic file listing
- `POST /api/delete-file` — delete from inbox/outbox

### Smart View raw
- `POST /api/sv-xml` — generic SV passthrough (debug)
- `POST /api/maintenance-window` — get maintenance window times

### Form / rule helpers
- `POST /api/rule-info` — single rule metadata
- `POST /api/open-form` — full form open without going through Gemini (client direct-route)

### Chat & dev
- `POST /api/chat` — **the main endpoint** (runs `runChatTurn`)
- `POST /api/feedback` — bug report ingestion
- `POST /api/narrate` — single-shot Gemini call (legacy)
- `POST /api/sql-query` — DuckDB SQL (when DuckDB-WASM is loaded client-side)
- `POST /api/render-pdf` — PDF generation (Cloudflare Browser Rendering)
- `POST /api/debug-log` — mirror of client debug log

## 7. Client (taskpane.js) — module map

Approximate line ranges. The file is one big script — use Ctrl+F.

| Range | What |
|---|---|
| 1-100 | Storage keys, debug log wrapper, fetch interceptor |
| 100-500 | Init, settings load, watchdog interval |
| 500-700 | Load everything / Discover all flow |
| 700-900 | Settings save handlers |
| 1000-2000 | Slash palette: SLASH_ITEMS array (rich palette of commands) |
| 2000-2700 | INTENT_TREE (show / explain / analyze / run / etc) + showIntentVerb + NL_INTENT regex |
| 2800-3000 | Settings form read/write |
| 3000-3700 | Tab switching, status tab refresh handlers |
| 3700-4400 | Detect everything / discovery probes |
| 4400-4700 | renderBubble + addMsg + mdToHtml (markdown renderer with code block support) |
| 4900-5400 | renderStatusTab (sub-tabs + per-section refresh) |
| 5400-6100 | onSend (chat dispatch) — first 600 lines are local intercepts (`show cubes`, `set variable`, `<topic> ?`, etc) |
| 6300-7000 | More onSend intercepts (debug commands, NL→SQL, etc) |
| 7000-9500 | Main /api/chat flow, then client actions dispatcher, edit_sheet preview UI |
| 9500-10500 | Excel sheet IO (writeGridToSheet, readActiveSheetForAnalysis, formatActiveSheetAsReport) |
| 10500-11623 | Office.js helpers, retry logic, image paste support |

## 8. Critical invariants (don't break these)

1. **Worker is stateless** — client sends ALL context on every chat turn. Only exception: `svSessionCache` (SmartView session IDs, ~10 min TTL).
2. **Basic Auth only** — endpoints under `/aif/ui/model/*`, `/interop/*` (non-snapshot), `/efsvbuirest/.../flows/*` need session cookies and are out of scope. Stub gracefully, don't throw.
3. **Gemini type schema** — always flat strings (`"string"`), never union arrays (`["integer","string"]`). Gemini rejects unions.
4. **`runOpenForm` is resilient** — errcode 60000 → swallow silently, still render rules + stub grid + ⚠ banner. Don't throw.
5. **SmartView XML for forms** — `req_GetFormSlice` requires the full `<preferences>` block. `<navigate withData="1"/>` is critical or values come back empty.
6. **Portable cube config** — use `effectiveCubeDefaults(settings, cube)` / `effectiveCubeDims(settings, cube)`, never `CLIENT_CONFIG.cubeDimDefaults` directly.
7. **Tool result shape** — `{ ok, sheetName?, grid?, action?, reply?, error? }`. The dispatcher at line 8650-8700 picks fields based on shape.
8. **CHIPs in replies** — line format `CHIP: <label> → <prompt>`. Client extracts via regex and renders as clickable buttons.
9. **Verb convention** — `show` enumerates, `open` renders one, `explain` analyzes one, `run` executes, `create/delete/restore` mutate, `analyze/format/clean` operate on active sheet. See ROADMAP.md "Convención de verbos".
10. **No FRs in user-facing output** — `kb.financialReports` is parsed but never surfaced. Forms picker filters them out.

## 9. Common gotchas (things that broke before)

| Gotcha | Where | Fix |
|---|---|---|
| `&amp;` in form names rendered literally | dimensions / form-name CSV bleed | `decodeXmlEntities()` in parse-lcm.js + `svUnescape()` in worker.js for display |
| Multi-line formula truncated in CSV | dimension parser | `splitCsvRows()` respects quoted newlines |
| `<none>` literal as formula text | dimension parser | filter in parse-lcm.js + worker fallback |
| Form lookup wrong dashboard | name collision (form vs dashboard same normalized name) | form lookup wins over dashboard if both match |
| 'Income Statement' (no period) doesn't match 'Income Statement.' | runOpenForm + showForms | `normFormName()` strips NFS_ prefix + trailing dots |
| Form picker bloated with 182 items | livediscovery returning dashboards as forms | trust kb.forms exclusively when populated; fallback heuristic block-by-name for live |
| Snapshot size showing `—` | Oracle uses inconsistent field names | `_humanSize()` probes `size/fileSize/byteSize/bytes/length/contentLength` + fallback scan for any `*size*` field > 1000 |
| Jobs returning empty | SV req_EnumJobs auth or parsing | tries SV → Planning REST → DM, surfaces errors in Status panel |
| `show pipelines` / `show integrations` empty | discovery endpoints partial on real tenants | marked WIP in palette, P5b in roadmap |
| Chat history wiped on reopen | startup was doing `localStorage.removeItem(CHAT_HIST_KEY)` | replaced with `loadPersistedChat()` (1-day retention) |
| `Reading the sheet…` hanging on inventory commands | activeSheet read on every chat | `SHEET_FREE_RE` skips read for show/list/explain/run/set/create snapshot |
| Explain intercept stripping legit code blocks | regex `\n+\`\`\`.*?\`\`\`/g` ate dynamic-calc formulas | use splitMatch on `---` to isolate hidden context; no blanket strip |
| forceExplain blocking the explain intercept | client set `forceExplain=true` for any "explain" msg | intercept now fires regardless of `forceExplain` |
| Picker showing FR with "Income Statement" | KB lookup matched FR | check kb.financialReports first, route to dedicated FR error message |
| Pipelines wedged "Reading the sheet…" | every chat read sheet | SHEET_FREE_RE (see above) |
| Live polling for rules unreliable | Oracle job-status endpoint timing | replaced with "Go to Jobs" chip + auto-refresh of Status tab |

## 10. AI enrichment pipeline (offline)

The `tenant-kb.json` per client contains pre-computed AI summaries that the worker reads at runtime (no Gemini call per chat). Run once after every LCM re-parse:

```bash
GEMINI_API_KEY=AIza... node tools/parse-lcm.js
# This now wraps:
#   1. Parse lcm-export/ → tenant-kb.json (structural data)
#   2. AI enrichment pass → adds aiSummary per rule/form/variable
#   3. Re-writes tenant-kb.json with enrichment
```

Shape of `aiSummary` per entity:

- **Rules**: `{ whatItDoes, inputs[], outputs[], calculations[], whenItRuns, scope }`
- **Forms**: `{ purpose, whoUses, behaviorOnSave[], levers[], dependencies[] }`
- **Variables**: `{ whatItControls, whenToUpdate, impact[], category }`

The worker's `runExplain` reads these directly. Falls back to runtime Gemini synthesis only if `aiSummary` is missing.

## 11. Squarespace tenant (Rajiv) — context

The client is **Rajiv at Squarespace**. The official demo recap is in `ROADMAP.md` as the "SOURCE OF TRUTH" section. The 10 commitments + current status are tracked there.

Current score: **4 ✅ done** (LCM connect, update vars + status indicators, explain family, snapshots partial), **5 ⏳ pending** (versions, compare+audit, Claude key, optimization, DuckDB, question-driven UI).

## 12. Building a new tool — checklist

1. Define tool schema in `worker.js`:
   ```js
   const MY_TOOL = {
     name: "my_tool",
     description: "Use when the user says X / Y / Z. Mentions every phrasing variant.",
     input_schema: {
       type: "object",
       properties: { arg1: { type: "string", description: "…" } },
       required: ["arg1"]
     }
   };
   ```
2. Write handler `async function runMyTool(settings, args, opts) { return { ok, grid? / action? / reply? } }`
3. Add to `TOOLS` array (~line 8050)
4. Add dispatch case `else if (name === "my_tool") out = await runMyTool(nspbSettings, args, opts)` (~line 8590)
5. Add to system prompt routing (search for "## show_inventory" pattern, ~line 700)
6. Add to slash palette `INTENT_TREE` if appropriate (in `taskpane.js` ~line 2000)
7. `cd worker && node build.js && npx wrangler deploy`
8. Test in Excel: close + reopen task pane to refresh client cache

## 13. Building a new client-side action (no Excel write needed)

1. Tool handler returns `{ ok, action: { type: "my_action", ...data }, reply: "…" }`
2. Add a branch in `runClientAction()` in `taskpane.js` (~line 9700):
   ```js
   if (action.type === "my_action") {
     await Excel.run(async (ctx) => { /* … */ });
     return;
   }
   ```
3. Build + deploy. No worker rebuild needed if you only added to client.

## 14. Debugging

### Client debug log (built-in)
- Every `/api/*` call is auto-logged with redacted request body, response, duration, error.
- Type `debug last` in chat to see the most recent entry.
- Type `debug all` to see all 20.
- Type `debug clear` to reset.

### Worker tail (live logs)
```bash
cd worker
npx wrangler tail
# Then operate in Excel — see every console.log + every /api/debug-log mirror
```

### Common things to check
- **Wrong reply**: `debug last` → look at the `request` body. Did the client send the right context?
- **Tool not called**: log the system prompt. Is the routing phrase clear? Is `toolMode=ANY` set on first turn?
- **NSPB error**: error.message has the raw response. Look up the endpoint in section 6 to know which API.
- **Stale display**: probably caching. Close + reopen task pane in Excel.

### Useful commands to know
- `debug last` / `debug all` / `debug clear`
- `show snapshots` / `show files` / `show jobs` / `show all jobs` / `show dm jobs`
- `<topic> ?` for contextual help (form, rule, variable, account, dimension, snapshot, etc)
- `explain rule X` / `explain form X` / `explain variable X` / `explain account X`
- Verb convention: section 8 of this doc.

## 15. Open questions / things to investigate

1. **Snapshot size field** — Oracle returns `—` for size; need to identify the actual field name on Rajiv's tenant. There's a diagnostic line in `show snapshots` reply that lists raw keys.
2. **Jobs discovery returning empty** on real tenants — need to capture the SmartView `req_EnumJobs` response on a tenant where it works vs where it doesn't.
3. **Scheduled jobs** — no live retrieve endpoint identified. Need to find Oracle's Job Scheduler API endpoint.
4. **DM pipelines / integrations** — discovery returns sparse data on real tenants. Marked WIP.

---

**End of architecture doc.** For status of what's done vs pending → `docs/ROADMAP.md`. For invariants and how-to-add-a-tool → `CLAUDE.md`. For inline patterns → comments in `worker.js` and `taskpane.js`.
