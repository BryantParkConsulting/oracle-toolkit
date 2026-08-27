# Getting started — from zero to a deliverable

For someone who just cloned the repo and has never run this. Assumes no prior context.

There are **two independent routes**. Run either, or both:

| route | what to ask the client for | what it produces |
| --- | --- | --- |
| **A. NSPB / Planning** | an LCM export (a zip) | environment KB, current state, optimization review |
| **B. NetSuite ERP** | an integration token | module inventory, connector map, ABR with recommendations |

---

## 0. Requirements

```bash
node --version    # 20 or newer
```

```bash
npm install
```

```bash
node scripts/check-all.js
```

PDF generation also needs **Chrome or Edge**. Route A needs a **Gemini API key** — the parser
uses it to summarize rules and forms.

---

# Route A — NSPB / Planning

## A1. Getting the LCM export

For the structural assessment, request an artifact-only export:

> In NSPB, go to **Tools → Migration**. Create or open an export definition, select the
> Planning artifacts needed for the assessment, and **untick Essbase Data**. Save the
> definition, run the export, and download the resulting `.zip`.

Do not assume the nightly `Artifact Snapshot` is metadata-only. Its contents depend on the
saved snapshot definition and it may include Essbase data. If using it, inspect the selection
first and confirm that **Essbase Data is not selected**.

**What's in it:** the complete application definition — dimensions, forms, business rules,
substitution variables, dashboards, financial reports, FDMEE configuration and navigation.
The requested export is metadata-only: it must not include financial Essbase data. LCM metadata
can still contain usernames, security assignments and other confidential configuration, so keep
the ZIP and generated JSON local and outside Git.

> If the client asks why a screenshot won't do: the snapshot is what lets us analyze the whole
> environment consistently and reproducibly, instead of reviewing it screen by screen.

## A2. Unzip and parse

Unzip into `lcm-export/` (or anywhere, passing `LCM_ROOT`).

```bash
CLIENT=<client> GEMINI_API_KEY=<your-key> node packages/lcm/parse-lcm.js
```

Produces `clients/<client>/tenant-kb.json`: forms, rules, variables, dimensions, dashboards,
FRs, FDMEE and navigation, with an AI-generated summary per object.

## A3. The reports

```bash
CLIENT=<client> node packages/analysis/architecture-report.js
```

The **Optimization Review** needs two more inputs, which the client also pulls:

- **Level-0 export per cube** — Application → Overview → Actions → *Export Data*, choosing
  Level 0. One zip per cube.
- **Activity Report** — Application → Jobs → *Daily Maintenance*, or from Access Control →
  Activity Report. This is what tells you what's genuinely used.

```bash
CLIENT=<client> node packages/analysis/parse-level0.js
```

```bash
CLIENT=<client> node packages/analysis/cube-optimize.js
```

> Read `docs/CUBE-OPTIMIZATION-README.md` before writing the report — it has the Essbase
> interpretation rules and the pre-delivery QA checklist.

---

# Route B — NetSuite ERP

## B1. Getting the token

**You can't do this yourself**: it has to be created by someone with an Administrator role in
the client's account. Send them these four steps verbatim.

### Step 1 — Enable the features

**Setup → Company → Enable Features → SuiteCloud**. These must be ticked:

- `REST WEB SERVICES`
- `TOKEN-BASED AUTHENTICATION`

### Step 2 — Create the integration

**Setup → Integration → Manage Integrations → New**

| field | value |
| --- | --- |
| Name | `BPC Discovery — read-only export` |
| State | Enabled |
| **Token-Based Authentication** | ✅ **tick this** |
| TBA: issuetoken Endpoint | leave unticked |
| TBA: Authorization Flow | leave unticked |
| The whole OAuth 2.0 block | leave unticked |
| User Credentials | leave unticked |

On save, NetSuite shows the **Consumer Key** and **Consumer Secret**. ⚠️ **They're shown only
once.** If the screen is closed without copying them, the credentials have to be reset.

### Step 3 — Create a read-only role

This is the step that most affects the result. **A narrow role produces false "the client
doesn't have that module"**, because SuiteQL cannot distinguish a disabled feature from one
the role can't see.

**Setup → Users/Roles → Manage Roles → New**, named `BPC Discovery (Read Only)`:

- Setup → **REST Web Services** — Full
- Setup → **Log in using Access Tokens** — Full
- Setup → **SuiteAnalytics Workbook** — Edit
- Everything else at **View**, as broad as possible: Transactions, Lists, Reports, Setup
- **No restriction by subsidiary, department or class**

### Step 4 — Issue the token

**Setup → Users/Roles → Access Tokens → New**: pick the integration from step 2, a user, and
the role from step 3. On save you get the **Token ID** and **Token Secret** — also shown only
once.

### Step 5 — Store them

Create a `.env` file at the repo root (gitignored, never pushed):

```
NS_ACCOUNT=1234567
NS_CONSUMER_KEY=...
NS_CONSUMER_SECRET=...
NS_TOKEN_ID=...
NS_TOKEN_SECRET=...
GEMINI_API_KEY=...
```

`NS_ACCOUNT` is the number in the client's NetSuite URL
(`https://1234567.app.netsuite.com`). A sandbox carries a suffix: `1234567_SB1`.

> **Have them paste the values into the file themselves.** Not over chat, email or Slack —
> those get logged. And **rotate the credentials when the assessment ends**: they belong to
> the client's production account.

Check it works:

```bash
node packages/netsuite/ns-sql.js "SELECT COUNT(*) AS n FROM account"
```

## B2. Extract

```bash
CLIENT=<client> node packages/netsuite/netsuite-export.js
```

Five phases, roughly 10–15 minutes on a large account. Everything is aggregated server-side:
**no detail rows are ever downloaded**.

| phase | what it does |
| --- | --- |
| `probe` | tests ~95 tables: does it respond? how many rows? last activity? |
| `shape` | volumetrics and breakdowns by transaction type, account, item |
| `metadata` | field dictionary via the REST metadata-catalog |
| `fields` | fill-rate per custom field — which ones were never populated |
| `financials` | COA, balances, P&L, seasonality, cost detail and customers |

You can run just one: `--phase=probe`.

## B3. Analyze

```bash
CLIENT=<client> node packages/netsuite/ns-erp-assess.js
```

```bash
CLIENT=<client> node packages/netsuite/ns-connector-map.js
```

```bash
CLIENT=<client> node packages/netsuite/ns-vertical.js
```

```bash
CLIENT=<client> node packages/netsuite/ns-financials.js
```

> **Look at the connector map before anything else.** It's what stops you proposing something
> the client already bought: if FloQast or BlackLine appears the reconciliation case changes
> entirely, and if the `NSPBCS_` bundle appears they already have Planning — the work is
> adoption, not a sale.

## B4. The deliverable

Start Chrome with the debug port open (PDFs render through it):

```bash
chrome.exe --headless=new --remote-debugging-port=9222 --user-data-dir=%TEMP%\cdp about:blank
```

```bash
CLIENT=<client> CLIENT_NAME=<Name> node packages/reports/netsuite-abr-full.js
```

Lands in `clients/<client>/<client>-netsuite-abr-full.pdf`: the full BPC-branded ABR, with
evidence-backed recommendations and a section on what we couldn't see.

Two shorter variants exist if you need them separately: `netsuite-abr-pdf.js` (business only)
and `nspb-integration-pdf.js` (technical, for the Planning team).

---

## Before you deliver

- [ ] No module marked `absent` without evidence — an absence in SuiteQL is ambiguous and
      goes out as `unknown`.
- [ ] Everything prescriptive worded as a suggestion to validate, never as certainty.
- [ ] The PDF **in English**, numbers in `en-US` format.
- [ ] No internal commercial language in the client document.
- [ ] Telemetry window stated on the cover.
- [ ] Credentials rotated.

## If something fails

| symptom | usual cause |
| --- | --- |
| `401` on every query | credentials mistyped, or reset after the token was issued |
| `403` | the role is missing `REST Web Services` or `Log in using Access Tokens` |
| many modules come back `unknown` | the role is too narrow — go back to step 3 |
| `CDP not reachable on :9222` | Chrome isn't running with the debug port |
| the PDF has empty sections | a phase hasn't run; sections are conditional by design |

The data traps (GL signs, formula fields, which tables exist and which don't) are in
[`NETSUITE-DISCOVERY-LEARNINGS.md`](NETSUITE-DISCOVERY-LEARNINGS.md). Read it before
interpreting any number.
