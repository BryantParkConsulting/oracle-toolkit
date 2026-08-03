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

### Querying Planning live from Claude

`packages/mcp-planning/` is an MCP server that exposes an NSPB environment to Claude — it can
read an LCM snapshot and query or load data over REST. Register it once:

```bash
claude mcp add epm-planning -- node /absolute/path/to/oracle-toolkit/packages/mcp-planning/src/index.js
```

Then ask Claude things like *"list the business rules in the Plan cube"* or *"what's the FY26
budget for account 5000"* and it answers from the live environment.

---

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
| `reports/netsuite-abr-full.js` | ⭐ **the main deliverable**: ABR + BPC recommendations |
| `reports/netsuite-abr-pdf.js` | short ABR, business only |
| `reports/nspb-integration-pdf.js` | technical discovery for the Planning team |

---

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
