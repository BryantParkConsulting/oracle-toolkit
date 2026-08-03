# NSPB Assistant — Excel add-in for Oracle NSPB

Office.js add-in + Cloudflare Worker que permite a usuarios de finanzas y controlling consultar Oracle NetSuite Planning & Budgeting (NSPB / Hyperion Planning / Essbase) en lenguaje natural, directamente desde Excel. Routea las queries a Gemini Flash (o Claude) con tool-use, ejecuta contra la NSPB REST API + SmartView XML, y escribe los resultados como grillas formateadas en la hoja activa.

**Live worker:** https://gentle-moon-046f.nspbassistant.workers.dev
**Docs site:** https://nspbmcp.web.app
**Cliente actual:** Squarespace (Rajiv)

---

## 📚 Documentation map

Empezá por la doc que matchea tu rol:

| Soy… | Leer primero |
|---|---|
| 🤖 AI agent / IDE asistido (Antigravity, Cursor, Claude Code) | [`CLAUDE.md`](CLAUDE.md) (invariantes) → [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) (cómo encastra todo) |
| 👤 Dev nuevo o yo en 3 meses | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) (handoff completo) → [`CLAUDE.md`](CLAUDE.md) (gotchas) |
| 👤 Cliente / usuario final | [`add-in/help/USAGE_GUIDE.md`](add-in/help/USAGE_GUIDE.md) y [`QUICKSTART_USER.md`](add-in/help/QUICKSTART_USER.md) |
| 👤 PM / sponsor del proyecto | [`docs/ROADMAP.md`](docs/ROADMAP.md) (status vs Squarespace demo) |
| 🏛️ Legal | [`docs/LEGAL_BRIEF_FOR_LAWYER.md`](docs/LEGAL_BRIEF_FOR_LAWYER.md) |

**TL;DR para todos**: el `worker/` es el backend stateless en Cloudflare; el `add-in/` es la UI en Office.js; el `tools/parse-lcm.js` parsea LCM de un cliente nuevo y genera `clients/<name>/tenant-kb.json` que el worker embebe en el bundle.

---

## Repository layout

```
nspb-migrate-fresh/
├── CLAUDE.md                  ← invariantes técnicas (auto-loaded por Claude Code)
├── README.md                  ← este archivo
├── .gitignore                 ← bloquea secrets, KBs de clientes, build outputs
│
├── add-in/                    Excel add-in (Office.js task pane)
│   ├── manifest.xml           sideloaded into Excel
│   ├── package.json
│   ├── src/
│   │   ├── taskpane.html      UI shell (Chat / Status / Help / Report a bug tabs)
│   │   ├── taskpane.css       chat bubble + palette + status styles
│   │   └── taskpane.js        ~11K LoC — todo el cliente (intent palette, render, fetch, etc.)
│   ├── help/                  user-facing markdown (INSTALL_AND_USER_GUIDE, USAGE_CHEATSHEET, etc.)
│   └── installer-scripts/     .bat files clients run to register the add-in
│
├── worker/                    Cloudflare Worker (stateless backend)
│   ├── worker.js              ~11K LoC — main handler, system prompt, tools, dispatch
│   ├── build.js               concat + base64 + KB embed + taskpane inline → bundle.js
│   ├── bundle.js              built artifact (gitignored)
│   ├── .version               build counter (gitignored)
│   ├── kb.md                  ~170KB NSPB knowledge base (embedded in system prompt)
│   ├── clientNetsuite.js      legacy Pharmalogic-tenant config (fallback)
│   ├── inline-templates.js    inlines templates/master.html report design
│   ├── templates/master.html  HTML report design system (Sarabun, navy/green/gold)
│   ├── wrangler.toml          Cloudflare deploy config
│   ├── package.json           npm scripts: deploy, dev, tail
│   └── (dev utilities)        clean-kb*.js, decode-template.js, sniff-*.ps1, etc.
│
├── tools/                     Per-tenant pipeline
│   ├── parse-lcm.js           Oracle LCM export → tenant-kb.json (forms/rules/dims/vars)
│   ├── enrich-kb.js           AI summaries per rule/form/variable (one-time, ~3 min)
│   ├── estimate-tokens.js     Gemini KB sizing helper
│   └── test-vars.js           Smoke test
│
├── clients/                   Per-tenant KBs (committed only for demo)
│   └── demo/tenant-kb.json    Parsed + AI-enriched, embedded in bundle.js
│
├── Customer_Installer/        ZIP this and send to clients
│   ├── manifest.xml           Points to live worker
│   ├── Install NSPB.bat
│   ├── Uninstall NSPB.bat
│   ├── Start NSPB.bat
│   ├── HELP_LOCATION.md       Pointer to add-in/help/
│   ├── presentation/          Sales deck
│   └── README.md
│
├── docs/                      Project documentation
│   ├── ARCHITECTURE.md        ⭐ Handoff doc — tool catalog, endpoint catalog, gotchas
│   ├── ROADMAP.md             ⭐ Source of truth — Squarespace demo recap + status
│   ├── CLOUDFLARE_MIGRATION.md
│   ├── FIREBASE_MIGRATION.md
│   ├── API_AUDIT.md
│   ├── NSPB_Training_FAQ_Manual.md
│   ├── PRODUCT_DECK_CONTENT.md
│   └── LEGAL_BRIEF_FOR_LAWYER.md
│
├── docs-site/                 Firebase Hosting docs site (React + Vite)
├── tests/                     UAT harness + sample artifacts
│   └── samples/               Sample workbooks for manual repro (gitignored content)
├── lcm-export/                Raw Oracle LCM dumps (gitignored — customer data)
├── claude-memory/             Internal notes for Claude Code sessions
├── claude-plan/               In-flight implementation plans
└── archive/                   Superseded files (gitignored)
```

---

## Quick start — making changes

### Edit the Excel add-in UI
```bash
# Edit add-in/src/taskpane.{html,css,js}
cd worker
npm run deploy        # rebuild bundle + push to Cloudflare
```

The deployed worker serves the taskpane HTML/CSS/JS embedded inside `bundle.js`. Close + reopen the task pane in Excel (Insert → My Add-ins → NSPB MCP) to pick up changes. The version number at the top of the task pane (e.g. `v0.230`) confirms the refresh.

### Edit the worker backend
```bash
# Edit worker/worker.js
cd worker
node build.js          # concat + inline → bundle.js
npx wrangler deploy    # upload
```

### Edit the HTML report design
```bash
# Edit worker/templates/master.html
cd worker
npm run deploy        # inline-templates.js re-injects master.html, then deploys
```

### Add a new client (parse + enrich their LCM)
```bash
# 1. Drop the Oracle LCM export into lcm-export/  (zip is fine, parser handles it)
# 2. Parse + AI-enrich into clients/<name>/tenant-kb.json:
CLIENT=squarespace GEMINI_API_KEY=AIza... node tools/parse-lcm.js
# 3. Build a per-client bundle:
CLIENT=squarespace npm --prefix worker run deploy
```

### Edit the docs site
```bash
cd docs-site
npm run dev                            # local preview at localhost:5173
npm run build && firebase deploy       # publish to nspbmcp.web.app
```

### Tail live worker logs
```bash
cd worker
npx wrangler tail
# Operate in Excel — see every request, debug log mirror, error
```

---

## What this product does (feature summary)

For finance users in Excel:

- **Build queries in natural language**: "revenue by month FY24 actual" → SmartView ad-hoc grid in the active sheet
- **Compare scenarios**: "actual vs budget revenue this year" → side-by-side grid with variance
- **Open NSPB forms**: `open form Income Statement.` → form rendered as a grid
- **Run business rules**: `run rule NFS_AGG - IncStmt - Forecast` → submits via REST, status visible in Status tab
- **Update substitution variables**: `set variable NSP_PER_FcstCurrMo = TP10`
- **Create LCM snapshots**: `create snapshot pre-rollout-2026-05-21` → triggers Oracle Migration export
- **AI-tutor on the tenant** (Squarespace recap #8): `explain rule X` / `explain form X` / `explain variable X` / `explain account X` — each backed by pre-computed AI summaries cached in `tenant-kb.json` (zero runtime Gemini cost)
- **In-place variance analysis**: `analyze this` → adds Δ$/Δ% columns to the right of the user's grid, leaves a blank col so SmartView Refresh stays safe, narrative in chat
- **Controller-grade analysis templates**: 7 built-in prompts (P&L review, Revenue analysis, OpEx review, Margin analysis, Cash flow review, Balance Sheet review, Executive 1-pager) accessible via the `analyze` palette
- **Status panel**: Variables / Jobs / DM / Night runs / Snapshots sub-tabs, each with its own refresh
- **Language toggle**: English / Español affects AI-generated narrative; structural labels stay English

For developers / admins:

- **Per-tenant KB pipeline**: parse-lcm.js + enrich-kb.js in one command. Outputs structured JSON with everything (forms / rules / dims / vars / dashboards / FRs / FDMEE / navigation / AI summaries)
- **Stateless worker**: client ships all context per turn → no server-side cache drift, trivial to scale on Cloudflare
- **Tool-use anti-hallucination**: server-side intercept for `explain X` bypasses Gemini entirely; uses cached aiSummary directly
- **Verb convention**: `show` enumerates, `open` renders one, `explain` analyzes one, `run` executes, `create/delete/restore` mutate, `analyze/format/clean` work on the active sheet

For a full state and what's pending → [`docs/ROADMAP.md`](docs/ROADMAP.md).

---

## Deployment targets

| Component | Where it runs | Account |
|---|---|---|
| Worker | Cloudflare Workers | `gallobruno@gmail.com` |
| Docs site | Firebase Hosting | project `nspbmcp` → `nspbmcp.web.app` |
| Add-in client side | User's Excel (Windows + Mac) | sideloaded via `Customer_Installer/manifest.xml` |

See [`docs/CLOUDFLARE_MIGRATION.md`](docs/CLOUDFLARE_MIGRATION.md) for the worker migration history.

---

## Secrets & confidentiality

The `.gitignore` blocks:
- `claude-auth/` — Claude OAuth tokens
- `*.nspb-client.json` — client exports contain Essbase passwords
- `clients/*/tenant-kb.json` except `demo/` — customer-confidential KBs
- `lcm-export/` — raw Oracle dumps (customer data)
- `worker/bundle.js`, `worker/.version`, `.wrangler/`, `node_modules/`, `archive/`
- `*.xlsx`, `export_*.zip` — test artifacts

**Real customer KBs must never be pushed to a public git host.**

---

## Workflow

```bash
git status
git add <specific files>     # avoid `git add -A` because of .xlsx / .zip filters
git commit -m "what changed"
# git push origin master    # private repo only
```

Local commits are signed `Bruno Gallo <gallobruno@gmail.com>`. Verify with:
```bash
git log --format="%h %an <%ae> %s"
```

---

## Status (last updated 2026-05-21)

- **Worker version**: v0.230 (live at `gentle-moon-046f.nspbassistant.workers.dev`)
- **Squarespace demo commitments**: 4 ✅ done + 1 partial + 5 ⏳ structural pending (Claude API key, compare+audit, forecast versions, optimization analysis, DuckDB pipeline, question-driven UI)
- **Tenant data parsed**: `clients/demo/` has 46 rules / 81 forms / 37 variables, all AI-enriched
- **Known issues**: snapshot size shows `—` (diagnostic in chat reply pending real-tenant test); some job discovery returns empty on real tenants

Full breakdown → [`docs/ROADMAP.md`](docs/ROADMAP.md).
