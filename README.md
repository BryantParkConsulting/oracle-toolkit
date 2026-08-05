# oracle-toolkit

BPC's toolkit for Oracle EPM engagements: **NSPB / Oracle Planning** and **NetSuite ERP** —
from raw extraction to a branded PDF deliverable.

Point it at a client's NetSuite account and it tells you which modules they actually use,
what's connected, what their chart of accounts looks like, and what we should recommend.
Point it at an NSPB LCM export and it tells you how their Planning environment is built.

> ### 👉 First time here? Read [**docs/GETTING-STARTED.md**](docs/GETTING-STARTED.md)
> How to ask the client for the LCM export, how the NetSuite token is created step by step,
> what to run and in what order. It assumes no prior context.

---

## Install

```bash
git clone https://github.com/brunohernangallo/oracle-toolkit.git
```

```bash
cd oracle-toolkit && npm install
```

```bash
node scripts/check-all.js
```

Requires Node 20+. PDF generation additionally needs Chrome or Edge; the NSPB route needs a
Gemini API key.

## Independent workflows

These are separate tools for different uses. Installing the Excel add-in does not configure
either MCP server, and connecting Claude does not install anything in Excel. Use only the
workflow required for the task.

| Goal | Start here |
| --- | --- |
| Connect Claude to NetSuite (read-only SuiteQL) | [`packages/mcp-netsuite/README.md`](packages/mcp-netsuite/README.md) |
| Connect Claude to NSPB / Planning | [`packages/mcp-planning/README.md`](packages/mcp-planning/README.md) |
| Parse an NSPB LCM into `tenant-kb.json` | [`docs/GETTING-STARTED.md`](docs/GETTING-STARTED.md#route-a--nspb--planning) |
| Install the NSPB AI Assistant in Excel | [`apps/nspb-excel-addin/Customer_Installer/README.md`](apps/nspb-excel-addin/Customer_Installer/README.md) |
| Generate NetSuite or NSPB analysis PDFs | [System analysis PDF tools](#system-analysis-pdf-tools) |

The three workflows are independent. The MCP servers run locally through Claude. The Excel
add-in is installed from the included Office manifest and loads its UI from the hosted Worker.
Client LCM files, generated `tenant-kb.json` files, profiles, passwords and API keys must stay
local and outside Git.

### Using it from Claude Code

The toolkit ships a skill that walks you through an assessment end to end. Open Claude Code
in the repo folder:

```bash
cd oracle-toolkit && claude
```

Claude reads `CLAUDE.md` on start, so it already knows the layout and the rules. Then just
say what you want:

> *"Run a NetSuite assessment for client Acme"*

The **`epm-assessment`** skill takes over: it asks whether you're doing NSPB, NetSuite or
both, requests only what it needs for the next step (the token, the LCM export), runs each
phase, shows you the output, and then asks for the next input. The client folder is the
state — you can stop and resume at any point.

To make the skill available in every project, not just this one:

```bash
cp -r skills/epm-assessment ~/.claude/skills/
```

### Querying NetSuite live from Claude

`packages/mcp-netsuite/` is an MCP server that exposes the connected NetSuite account. Register it:

```bash
claude mcp add netsuite -- node /absolute/path/to/oracle-toolkit/packages/mcp-netsuite/src/index.js
```

Before starting Claude, provide `NS_ACCOUNT`, `NS_CONSUMER_KEY`, `NS_CONSUMER_SECRET`,
`NS_TOKEN_ID` and `NS_TOKEN_SECRET` in the process environment. See the
[`mcp-netsuite` setup guide](packages/mcp-netsuite/README.md) for Windows and macOS/Linux
examples and a connection test.

### What you can ask it

*Which modules do they have enabled but not use? · What did they bill in 2025, and what was the gross margin? · Who are the top 20 customers, and how concentrated is the revenue? · Can they report by department? · How many accounts have no activity at all? · How many script deployments never run?*

Six tools: ad-hoc SuiteQL, record-type probing, P&L by year, revenue by customer, chart of accounts, and dimension tagging coverage.

Six tools: ad-hoc SuiteQL, record-type probing, P&L by year, revenue by customer, chart of accounts, and dimension tagging coverage. Read-only: anything that is not a SELECT is rejected.

The traps are built into the tools rather than left to the prompt — GL signs are corrected, invoice amounts read from the main line, and customer revenue comes from the billing layer because the ledger carries no entity on revenue.

### Querying Planning live from Claude

`packages/mcp-planning/` is an MCP server that exposes an NSPB environment to Claude — it can
read an LCM snapshot and query or load data over REST. Register it once:

```bash
claude mcp add epm-planning -- node /absolute/path/to/oracle-toolkit/packages/mcp-planning/src/index.js
```

### What you can ask it

From an LCM snapshot, no credentials needed: *What dimensions does this application have? · Which business rules exist in the Plan cube? · Explain what rule CF_CashRollForward does.*

Against a live environment: *What is the FY26 budget for account 5000? · List the jobs that ran today.*

---

### Writing into a spreadsheet the user already has open

No add-in, no export, no file hand-off: attach to the **running** Excel instance through COM,
create or reuse a tab, and write the data in while the user watches. Windows only, and Excel
must already be open (verified against Excel 16.0).

```powershell
# 1. pull what you want as a CSV
node packages/planning/nspb-is-to-csv.js pra --year FY26 --through TP7 --out is.csv
node packages/planning/nspb-subvars.js   pra --csv subvars.csv

# 2. drop it into the open workbook, one tab per statement
powershell -File packages/planning/write-to-open-excel.ps1 `
  -Csv is.csv -Workbook "pra demo" -Sheet "Income Statement" -Clear `
  -Title "PRA Events, Inc. - Income Statement FY26" `
  -Subtitle "Actual - USD - consolidated (TS)"
```

| flag | meaning |
| --- | --- |
| `-Workbook` | substring match against the open workbooks — `"pra demo"` finds `pra demo.xlsx` |
| `-Sheet` | tab name; created at the end of the book if it does not exist, reused if it does |
| `-Clear` | wipe the tab before writing (omit to overlay) |
| `-Anchor` | top-left cell, default `A1` |
| `-Title` / `-Subtitle` | merged heading rows above the table |
| `-BoldLines` | comma-separated row labels to emphasise; pass `""` for none |

It **never saves.** The workbook is left dirty on purpose so the user decides whether to keep
the result. A tab lands in about 1.5 seconds, nearly all of which is the source round trip
rather than Excel.

Reading goes the same way round: a client sends a workbook, we read it directly and turn it
into an NSPB dimension import. Nothing in this flow asks the user to export anything by hand.

**If you extend this script, keep these four things.** Each one was a real bug with a
misleading error message:

- Write the block as **one 2-D array assignment**. A separate COM call per cell is a
  cross-process round trip each — a 12x9 table becomes 108 of them and visibly crawls.
- Suspend `ScreenUpdating` and set calculation to manual for the duration of the write.
- `$grid[$r + 1, $c]` binds the **comma before the `+`**, so PowerShell evaluates
  `$r + (1, $c)` and throws *"[System.Object[]] does not contain a method named op_Addition"*.
  Write `$grid[($r + 1), $c]`.
- Address ranges as **strings** (`"A3:I13"`). `Range($cell1, $cell2)` is ambiguous through the
  PowerShell COM binder and throws *"Unable to cast object of type 'System.Double' to type
  'System.String'"*. Related: `[char] + [string]` has no `op_Addition` — cast to `[string]`.

Full workflow, including the NetSuite reconciliation it feeds:
[`docs/NSPB-NETSUITE-RECONCILIATION.md`](docs/NSPB-NETSUITE-RECONCILIATION.md).

### Reconciling NetSuite against NSPB

```bash
node packages/recon/recon-income-statement.js pra --year FY26 --through TP7
```

Compares a Planning income statement to the NetSuite general ledger account by account and
period by period, writes `clients/<client>/recon-income-statement-<year>.csv`, and prints the
totals, the break count and the worst offenders. Proven at **0.00 difference** across 198 leaf
accounts and 825 account/period combinations.

Three conventions decide whether the output is real, and each produced plausible-but-wrong
numbers first: the sign flips on **income accounts only**, SuiteQL returns period start dates
as `M/D/YYYY` **strings** that must not be sorted as text, and `Sales Rep` / `Item SubType` are
**attribute** dimensions that must stay out of the export POV.

### Auditing substitution variables

```bash
node packages/planning/nspb-subvars.js pra
```

Reads them live, diffs against the LCM snapshot, and flags the reporting POV drifting behind
the close, template slots left on `"No Account"`, and drift since the export. Worth running on
any tenant before trusting a report — a stale `&RptYr` renders without error and an old number
reads as current.

### Installing the NSPB AI Assistant in Excel

Windows users can install the included Office add-in without running a local Node server:

1. Open [`apps/nspb-excel-addin/Customer_Installer`](apps/nspb-excel-addin/Customer_Installer).
2. Run `Install NSPB.bat`.
3. Close every Excel window and reopen Excel.
4. Go to **Insert > My Add-ins > Developer Add-ins** (or **Shared Folder**) and select
   **NSPB MCP Assistant**.
5. In the task pane, open **Settings**, configure the tenant credentials and AI key, and import
   the local `tenant-kb.json` when one is available.

The installer, troubleshooting steps, tenant onboarding flow and uninstall procedure are in the
[`Excel add-in installation guide`](apps/nspb-excel-addin/Customer_Installer/README.md).

### System analysis PDF tools

PDF generation is another independent workflow. It reads analysis files under the local,
gitignored `clients/<client>/` directory and writes the resulting HTML and PDF files back there.
It does not install or configure the MCP servers or Excel add-in.

Start Chrome or Edge with the Chrome DevTools Protocol enabled on port `9222` before rendering:

```powershell
chrome.exe --headless=new --remote-debugging-port=9222 --user-data-dir=$env:TEMP\oracle-toolkit-cdp about:blank
```

NetSuite reports use the outputs generated by the NetSuite extraction and assessment pipeline:

```powershell
$env:CLIENT = "example"
$env:CLIENT_NAME = "Example Company"
node packages\reports\netsuite-abr-full.js
node packages\reports\netsuite-optimization-pdf.js
node packages\reports\nspb-integration-pdf.js
node packages\reports\netsuite-full-pack.js
```

These commands can produce a full NetSuite account analysis, a configuration optimization
review, a Planning integration discovery, and a combined PDF pack. Missing inputs are not
invented; generate the relevant extraction phases first.

NSPB reports use the parsed LCM plus the additional audit, Activity Report and level-0 inputs
required by each report:

```powershell
node packages\analysis\architecture-report.js example
node packages\reports\state-report-pdf.js example
node packages\analysis\cube-optimize.js example
node packages\reports\report-to-pdf.js example
```

The first pair creates the current-state assessment. The second pair creates the cube
optimization analysis. See [`docs/CUBE-OPTIMIZATION-README.md`](docs/CUBE-OPTIMIZATION-README.md)
and [`docs/DELIVERABLES.md`](docs/DELIVERABLES.md) for required inputs and report scope.

## Layout

```
oracle-toolkit/
├── packages/
│   ├── netsuite/       SuiteQL extraction, module assessment, connectors, vertical, COA/IS/BS
│   ├── lcm/            NSPB LCM export → tenant-kb.json
│   ├── planning/       live operations against NSPB: auth, data load, validation
│   ├── analysis/       cube optimization, level-0, IPM, current-state reports
│   ├── reports/        md/JSON → BPC-branded PDF (Chrome CDP :9222)
│   ├── mcp-planning/   MCP server for Planning (ESM)
│   ├── mcp-netsuite/   MCP server for NetSuite over SuiteQL
│   ├── forge/          generates dimensions and forms (ESM)
│   ├── engagement/     engagement hours reporting
│   └── recon/          NetSuite ↔ NSPB (seed; comparator not written yet)
├── apps/nspb-excel-addin/   the Excel add-in + Cloudflare Worker product
├── skills/             the guided assessment skill
├── docs/               playbooks and the field-learnings log
├── assets/             BPC design shell (logo, hero, base64)
└── clients/            client data — GITIGNORED WHOLESALE, never leaves your disk
```

---

## The NetSuite route

You need a TBA token from the client's account — the full recipe is in
[`docs/GETTING-STARTED.md`](docs/GETTING-STARTED.md).

```bash
CLIENT=<c> node packages/netsuite/netsuite-export.js
```

```bash
CLIENT=<c> node packages/netsuite/ns-erp-assess.js
```

```bash
CLIENT=<c> node packages/netsuite/ns-connector-map.js
```

```bash
CLIENT=<c> node packages/netsuite/ns-vertical.js
```

```bash
CLIENT=<c> node packages/netsuite/ns-financials.js
```

```bash
CLIENT=<c> CLIENT_NAME=<Name> node packages/reports/netsuite-abr-full.js
```

Ad-hoc queries and table probing: `packages/netsuite/ns-sql.js`.

> **Run `ns-connector-map.js` early.** It's what stops you proposing something the client
> already bought: if FloQast or BlackLine shows up, the reconciliation case changes; if the
> `NSPBCS_` bundle shows up, Planning isn't an upsell — it's an adoption problem.

## The NSPB route

```bash
CLIENT=<c> GEMINI_API_KEY=... node packages/lcm/parse-lcm.js
```

```bash
CLIENT=<c> node packages/analysis/architecture-report.js
```

The Optimization Review additionally needs a level-0 export per cube and the Activity Report;
then `packages/analysis/cube-optimize.js`.

## What each script produces

| script | output |
| --- | --- |
| `netsuite/netsuite-export.js` | `netsuite/*.json` — 5 extraction phases |
| `netsuite/ns-erp-assess.js` | `erp/modules.json` — 37 modules across 5 states |
| `netsuite/ns-connector-map.js` | `erp/CONNECTORS.md` — bundles, integrations, prefixes |
| `netsuite/ns-vertical.js` | `erp/vertical.json` — micro-vertical + industry benchmark |
| `netsuite/ns-financials.js` | `erp/FINANCIALS.md` — COA, P&L and balance sheet |
| `reports/netsuite-exec-brief.js` | 2-page brief for the CFO |
| `reports/netsuite-abr-full.js` | ⭐ full account analysis + recommendations |
| `reports/nspb-integration-pdf.js` | Planning implementation discovery |
| `reports/netsuite-optimization-pdf.js` | configuration optimization review |
| `reports/netsuite-full-pack.js` | all four bound into one PDF with dividers |

---

## The four deliverables

One extraction, four documents for four different readers — see
[`docs/DELIVERABLES.md`](docs/DELIVERABLES.md).

## Before you touch the NetSuite pipeline

Read [`docs/NETSUITE-DISCOVERY-LEARNINGS.md`](docs/NETSUITE-DISCOVERY-LEARNINGS.md): which
tables exist and which don't, the data traps, and four things we assumed were true and
weren't.

## Rules

1. **Client data never leaves `clients/`**, ignored wholesale by a negative rule. These are
   complete exports of real financial systems.
2. **Credentials live in `.env`**, pasted by the user, rotated when the assessment ends.
3. **An absence is not an absence.** SuiteQL only exposes a record type when the feature is
   enabled *and* the role can see it. Report `unknown`, never `absent`.
4. **Every deliverable is written in English**, with `en-US` number formatting.
5. **Everything prescriptive is a suggested change** to validate with the client.
6. **No invented numbers.** If it wasn't extracted, say "not extracted".

## Conventions

CJS and ESM coexist **per package**: `mcp-planning` and `forge` are ESM, the rest is CJS.
`check-all.js` validates each file with the right parser — don't force them together.
