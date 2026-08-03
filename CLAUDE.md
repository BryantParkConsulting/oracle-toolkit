# oracle-toolkit — orientation

BPC's toolkit for Oracle EPM engagements: **NSPB / Planning** and **NetSuite ERP**, from raw
extraction to a branded PDF. Consolidated 2026-07-31 from five scattered folders.

Read this before touching anything. Five minutes, and it saves you repeating mistakes we
already made.

> New to this? Start with [`docs/GETTING-STARTED.md`](docs/GETTING-STARTED.md): how to ask
> for the LCM export, how the NetSuite token is created, and what to run in what order.

---

## The mental model

Everything revolves around **one folder per client** in `clients/<client>/`. That folder **is
the state** — there's no database and no progress log, you just look at which files exist.

```
clients/<client>/
├── netsuite/     raw extraction: probe, shape, fields, coa, balances, pnl…
├── erp/          derived: modules.json, connectors.json, vertical.json, financials.json
├── env-docs/     NSPB environment documentation (fixed 01→04 format)
├── tenant-kb.json  Planning tenant KB
└── *.pdf         deliverables
```

Each script reads what the previous one produced and doesn't re-query the system unless it
has to. You can stop and resume at any phase.

---

## The two routes

### NetSuite — starts with a TBA token from the client

```bash
CLIENT=<c> node packages/netsuite/netsuite-export.js        # 5 phases
CLIENT=<c> node packages/netsuite/ns-erp-assess.js          # → erp/modules.json (37 modules, 5 states)
CLIENT=<c> node packages/netsuite/ns-connector-map.js       # → erp/CONNECTORS.md
CLIENT=<c> node packages/netsuite/ns-vertical.js            # → erp/vertical.json
CLIENT=<c> node packages/netsuite/ns-financials.js          # → erp/FINANCIALS.md
CLIENT=<c> CLIENT_NAME=<Name> node packages/reports/netsuite-abr-full.js
```

The `financials` phase leaves COA, balances, P&L, seasonality, cost detail and customers.
No manual steps.

**Run `ns-connector-map.js` early.** It's what stops you proposing something the client
already bought: if FloQast or BlackLine appears the reconciliation case changes; if the
`NSPBCS_` bundle appears, Planning isn't an upsell but an adoption problem.

### NSPB / Planning — starts with the LCM export

```bash
CLIENT=<c> GEMINI_API_KEY=... node packages/lcm/parse-lcm.js
CLIENT=<c> node packages/analysis/architecture-report.js
CLIENT=<c> node packages/analysis/cube-optimize.js          # needs level-0 + activity report
```

---

## Ad-hoc queries

```bash
node packages/netsuite/ns-sql.js "SELECT ..."
node packages/netsuite/ns-sql.js "SELECT ..." --out=file.json
node packages/netsuite/ns-sql.js --probe=table1,table2      # does it exist? how many rows?
```

Also a reusable client: `require('./ns-sql')` exports `suiteql(sql)` with pagination handled.

---

## Credentials

`.env` at the root (gitignored):

```
NS_ACCOUNT=<id>   NS_CONSUMER_KEY=...   NS_CONSUMER_SECRET=...
NS_TOKEN_ID=...   NS_TOKEN_SECRET=...   GEMINI_API_KEY=...
```

Full recipe for the client to create the integration and token:
[`docs/GETTING-STARTED.md`](docs/GETTING-STARTED.md) §B1. **The role matters more than the
credentials** — a narrow one produces false "module absent".

PDFs render through Chrome DevTools Protocol:

```bash
chrome.exe --headless=new --remote-debugging-port=9222 --user-data-dir=<temp> about:blank
```

---

## Non-negotiable rules

1. **Client data never leaves `clients/`**, ignored wholesale by a negative rule
   (`clients/**`). These are complete exports of real financial systems.
2. **An absence is not an absence.** SuiteQL only exposes a record type when the feature is
   enabled **and** the role can see it. Report `unknown`, never `absent`.
3. **Everything in this repo is written in English** — code, comments, docs and deliverables.
   Careful: a PDF's text is assembled from several files, so translating the generator isn't
   enough. Numbers in `en-US` format.
4. **Everything prescriptive is a "suggested change"** to validate with the client.
5. **No invented numbers.** If it wasn't extracted, say "not extracted". Never estimate.
6. **No internal commercial language in a client document.**
7. **Rotate credentials** when the assessment ends.

---

## Before touching the NetSuite pipeline

Read **[`docs/NETSUITE-DISCOVERY-LEARNINGS.md`](docs/NETSUITE-DISCOVERY-LEARNINGS.md)**. It
holds the traps that already cost us time: which tables exist, `isstored='F'`, `custentity_`
fields shared across entities, GL signs, schedules projecting to 2035, and four things we
assumed were true and weren't.

**It is a living log.** Every time something new is learned about how NetSuite or NSPB
actually behave, it goes there — that's what stops the next person rediscovering it.

---

## Package map

| package | what it does |
| --- | --- |
| `netsuite/` | SuiteQL extraction, module assessment, connectors, vertical, COA/IS/BS |
| `lcm/` | LCM export → tenant-kb.json, enrichment, sanitization |
| `planning/` | live operations against NSPB: auth, load, validation |
| `analysis/` | cube-optimize, level-0, IPM, architecture/optimization reports |
| `reports/` | md/JSON → PDF with the BPC shell (CDP `:9222`) |
| `mcp-planning/` | the Planning MCP server (ESM) — LCM + REST from Claude |
| `forge/` | generates dimensions and forms (ESM) |
| `engagement/` | engagement hours reporting |
| `recon/` | NetSuite ↔ NSPB — seed only, **comparator not written** |

`apps/nspb-excel-addin/` is the shipped product: Excel add-in (Office.js) + Cloudflare
Worker, its Firebase docs-site and the Chrome extension. Deploy:

```bash
cd apps/nspb-excel-addin/worker && npm run deploy
```

**Careful:** its build embeds `clients/<name>/tenant-kb.json` resolving paths relative to
*its own* folder, not the toolkit root.

**CJS and ESM coexist per package on purpose.** `mcp-planning` and `forge` are ESM, the rest
is CJS. `npm run check` validates each file with the right parser — don't force them together.

---

## Docs

| file | when to read it |
| --- | --- |
| [`docs/GETTING-STARTED.md`](docs/GETTING-STARTED.md) | first time — end-to-end walkthrough |
| [`docs/NETSUITE-DISCOVERY-LEARNINGS.md`](docs/NETSUITE-DISCOVERY-LEARNINGS.md) | ⭐ before touching the NetSuite pipeline |
| [`docs/NS-ERP-README.md`](docs/NS-ERP-README.md) | NetSuite assessment playbook and QA |
| [`docs/CUBE-OPTIMIZATION-README.md`](docs/CUBE-OPTIMIZATION-README.md) | before a cube optimization analysis |
| [`docs/NSPB-LCM-AND-DATA-RUNBOOK.md`](docs/NSPB-LCM-AND-DATA-RUNBOOK.md) | Planning data operations |
| [`skills/epm-assessment/SKILL.md`](skills/epm-assessment/SKILL.md) | the guided flow |

---

## Status and open items

- `packages/recon/` holds the Talogy seed but **the NetSuite ↔ NSPB comparator is not
  written**. Next block.
- The micro-vertical benchmark (`ns-benchmarks.json`) covers 12 verticals unevenly:
  `events-dmc` is developed, others have two lines.
- Integration **concurrency limits** are not exposed in `integrationapp` — UI or SDF only.
- First client run end to end: **PRA** (`clients/pra/`), events/DMC agency. We don't have
  their Planning LCM, so that side is unassessed.
