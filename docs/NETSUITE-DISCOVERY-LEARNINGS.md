# NetSuite discovery — field learnings

Working log of what we found building the discovery pipeline against a real production
account (~345K transactions, 1.95M lines, OneWorld, 2018→today).

Everything here is **verified against a live account**, not inferred from documentation.
Where we believed something and it turned out false, it stays recorded as a correction:
repeating the mistake costs more than reading it.

> Complements `NS-ERP-README.md` (the playbook: what to ask for, how to run it, pre-delivery
> QA). This is the *why* and the traps.

**Keep it current.** Every time something new is learned about how NetSuite actually behaves,
it goes here. That is what stops the next person rediscovering it.

---

## 1. The rule that governs everything: an absence is ambiguous

SuiteQL only exposes a record type when **the feature is enabled AND the role has
permission**. `Record 'x' was not found` does not distinguish the two.

That is why the pipeline uses a **fifth state, `unknown`**, alongside the catalogue's four
(`active/partial/dormant/absent`). Reporting `absent` for something you simply cannot see is
the fastest way to have your findings dismantled in the meeting.

**The role matters more than the credentials.** The BPC NetSuite MCP runs under a restricted
role: against its own account it could not see `subsidiary`, `department`, `location`,
`accountingbook` or `role`. With a broad-role token, all of them respond. A narrow role
reports modules as absent that actually exist.

---

## 2. Corrections — things we believed that were false

### ❌ "Workflows are not exposed in SuiteQL"
**False.** The `workflow` table exists and responds (26 in the test account). This was wrong
in the playbook and classified SuiteFlow as `unknown` for no reason.

### ❌ "No Expense Report transactions means we cannot know"
**False, and the distinction is worth a lot.** The `expensereport` table exists: if it
responds, the feature is on. Zero rows is **measured non-use** (`dormant`), not absence of
data (`unknown`). Same with `opportunity`. Telling "they have it switched on and don't use
it" apart from "we don't know" is the difference between a finding and a hole.

### ❌ "FAM = Fixed Assets"
**Depends on the industry.** In events and travel, *FAM* means **familiarization trip**. The
account analysed had `FAM & Passthrough` items with nothing to do with fixed assets. Same
problem with "Program": software in one niche, an event in another.

### ❌ "The client bills ~$200M and operates at break-even"
**Imprecise.** That came from looking at a single year. With the full annual P&L the result
**swings hard**: −$17.8M (2021), +$3.6M, −$9.2M, −$6.5M, +$0.7M (2025). Never conclude a
trend from one slice.

### ❌ "The connector is installed and budgets still load natively, so adoption stalled"
**An over-read.** Both facts are true; the conclusion is not supported by them. Native loads
can be legacy, or deliberate for something Planning was never meant to cover. Report the
observation and ask which path is intended to be authoritative — do not diagnose why.

**How to reduce `unknown`:** the first sweep left 10; probing candidate tables (`workflow`,
`expensereport`, `opportunity`, `allocationschedule`, `website`, `amortizationschedule`,
`statisticalschedule`) brought it to **5**. Probing is cheap — iterate before giving up and
sending it to SDF.

---

## 3. Data traps

### Transactional modules are not tables
AR, AP, journals and opportunities are values of `transaction.type`. Real usage comes from
`GROUP BY BUILTIN.DF(t.type), year`, not from probing tables.

### Zeros that do not mean "unused"
`loginaudit`, `systemnote`, `deletedrecord` and `transactionhistory` depend on retention and
permissions. Oddity worth knowing: `COUNT(*) FROM loginaudit` returned 0 while the same data
aggregated by month returned 98 rows. Exclude them from usage calculations.

### `customfield` mixes two things
`fieldtype = 'SCRIPT'` entries are **script parameters**, not data fields. In the test account
that was 349 of 3,187 — counting them inflates the customization footprint by ~12%.

### `isstored = 'F'` is not a column
Formula fields cannot be queried. Without filtering them, **284 of 445** fill-rate
measurements fall back to individual queries — slow, and with misleading coverage.

### A `custentity_` field lives in four tables at once
It exists on `customer`, `vendor`, `employee` and `job` simultaneously. Empty on one **does
not make it dead** — it may not apply there. The only defensible number is a field empty
across **every** table where it was measured.

### Schedules project into the future
Revenue and amortization generate future-dated entries — the account analysed reached **2035**.
Filter years with no real movement or the P&L comes out with empty columns.

### GL signs
NetSuite stores income and liabilities as **credits (negative)**. Presenting a P&L requires
flipping them. This is the most common error when rebuilding statements from the ledger.

### Invoice amounts live on the main line
`transactionline.netamount` is populated on `mainline = 'T'`. Summing every line returns zero.

### Revenue carries no customer at GL level
In the account analysed, revenue is recognized through journal entries — 9,109 in 2025, none
with an entity. **Customer-level revenue has to be read from the billing layer** (invoices,
revenue arrangements), never from `transactionaccountingline`. Any model assuming otherwise
silently returns nothing.

### `subsidiary` needs `iselimination` selected explicitly
It is not part of a `SELECT id, name, country, currency`. Without it the analysis reports "no
elimination entity" when one exists.

### `workflow` uses `internalid`, not `id`
A `SELECT id ... FROM workflow` fails outright.

---

## 4. Identifying what is in no list

### SuiteApps: by prefix, with an authoritative name
Every SuiteApp namespaces its objects. A prefix histogram over custom fields + custom records
+ scripts gives the footprint; **`bundleinstallationscript` supplies the real name**.

Without that table, `laa` is an opaque prefix with 1,217 objects. With it, it is **NetLease**
— and turns out to be the heaviest SuiteApp in the account.

Prefixes seen: `NSPBCS_` (NSPB connector), `ncfar_`/`fam_`/`altdepr_` (FAM), `CELIGO_`,
`APM_`/`NSAPM_`, `EP_` (Electronic Payments), `SFDC_`, `LAA_` (NetLease).

### Integrations: two tables, and they disagree
- **`oauthtoken`** — applications authenticating over TBA, with creation dates. Reveals what
  installs no bundle and is often the commercially relevant part: **FloQast** (close and
  reconciliation), **Ramp**, **Concur**, **Celigo Salesforce**. Proposing account
  reconciliation without knowing FloQast has been connected since 2021 is an avoidable
  embarrassment.
- **`integrationapp`** — **all** registered integrations, including those not using TBA. In
  the test account: 20 against 14 seen through tokens. The difference is user-credential and
  tokenless integrations.

It also shows the **timeline**: `PBCS Token` (2019) → `PBCS Integration` (2021) → `NSPB
Integration` (2023), older ones revoked. The migration history reads straight off it.

⚠ The **concurrency limit** per integration is visible on the Integration record in the UI but
**is not exposed in `integrationapp`**. UI or SDF only.

⚠ Tokens carry **people's names** (`"AppLink - Dan Ambrose, Administrator"`). Aggregate by
application before anything reaches a deliverable.

### Deployed is not the same as running
`scriptdeployment` joined to `script` separates what is installed from what executes, and the
gap is usually large. Of 1,430 deployments in the test account: 365 SCHEDULED and 286
MAPREDUCE sat at **NOTSCHEDULED**. **651 never run**; only 33 actually consume SuiteCloud
Processor capacity. That is both a configuration-debt finding and the answer to "how much
processing queue do they really use".

### Micro-vertical: by vocabulary
"Professional services" is useless for recommending anything — an events agency and a
software consultancy both land there and need opposite things.

The strongest signal is **item names**: literally what the company bills for. In the account
analysed: *Audio Visual, Décor/Scenic, Set/Strike, Dine Around, Gratuities, Production
Support* → events agency / DMC, unambiguously. Transaction types, own custom records and
account names follow.

A second signal worth checking: the **bills-to-invoices ratio**. Nine vendor bills per
customer invoice is the signature of a pass-through operation.

---

## 5. Dimension tagging coverage — the number that decides granularity

Member counts say what exists. **Coverage says what a plan can support.** Measure it before
anyone designs a model:

```sql
SELECT COUNT(*) AS total_lines,
       COUNT(tl.subsidiary) AS subsidiary, COUNT(tl.department) AS department,
       COUNT(tl.class) AS class, COUNT(tl.location) AS location
FROM transactionline tl JOIN transaction t ON t.id = tl.transaction
WHERE t.trandate >= ADD_MONTHS(SYSDATE, -12)
```

In the test account: Subsidiary 100%, Location 82%, Class 27%, **Department 8%**. Eighteen
departments exist and almost nobody fills them in. Planning by cost centre there would produce
a model that cannot be reconciled to the GL, because most actuals have nowhere to land.

Related: **functional currency is not transactional FX**. Three subsidiaries all in USD means
no translation between entities — but 8,770 exchange rates say transactions still happen in
several currencies. Simple consolidation, real transactional FX: two different model
decisions, and "multi-currency: yes/no" answers neither.

---

## 6. What SuiteQL cannot see

Declared in every deliverable, never estimated:

- **Full Enable Features** → SDF or the screen
- **Saved search and Report Builder definitions**
- **ARCS** (Account Reconciliation): separate application, no trace
- **SuiteAnalytics Connect / Workbook**: licensing and ODBC
- **Approval routing**, **demand planning** without inventory
- **Workflow states and actions** (`workflowstate`, `workflowaction` do not exist) — the
  inventory is available, the definition is not
- **Integration concurrency limits**
- **Close effort**: how long it takes, how many reconciliations live in spreadsheets
- **The Planning side**: without an NSPB LCM export the existing implementation cannot be
  assessed

### APM in particular
The Application Performance Management SuiteApp leaves only **setup** records
(`customrecord_apm_*`, `customrecord_nsapm_*` — DB setup, roles access, setup summary). The
actual metrics are not in them.

Verified: **APM ships no RESTlets**, so a TBA token cannot reach it either. Per Oracle's
documentation, APM exports **CSV only, from the UI**. Someone logged in has to download it —
and APM retains roughly **30 days**, so whatever is not pulled is lost.

---

## 7. Queries that pay off

```sql
-- Real transactional modules, by year
SELECT BUILTIN.DF(t.type) AS type, TO_CHAR(t.trandate,'YYYY') AS yr, COUNT(*) AS n
FROM transaction t GROUP BY BUILTIN.DF(t.type), TO_CHAR(t.trandate,'YYYY')

-- P&L from the GL (mind the sign on income)
SELECT TO_CHAR(t.trandate,'YYYY') AS yr, a.accttype, ROUND(SUM(tal.amount)) AS amount
FROM transactionaccountingline tal
JOIN transaction t ON t.id = tal.transaction
JOIN account a ON a.id = tal.account
WHERE tal.posting = 'T' GROUP BY TO_CHAR(t.trandate,'YYYY'), a.accttype

-- Accounts with no journal activity (candidates to exclude from a Planning mapping)
SELECT a.id, a.acctnumber, a.acctname FROM account a
WHERE NOT EXISTS (SELECT 1 FROM transactionaccountingline tal WHERE tal.account = a.id)

-- Customer revenue — from the billing layer, because the GL has no entity
SELECT e.altname, ROUND(SUM(tl.netamount)) AS billed
FROM transactionline tl JOIN transaction t ON t.id = tl.transaction JOIN entity e ON e.id = t.entity
WHERE t.type = 'CustInvc' AND tl.mainline = 'T' GROUP BY e.altname ORDER BY 2 DESC

-- What actually runs vs what is merely deployed
SELECT s.scripttype, sd.status, COUNT(*) AS n
FROM scriptdeployment sd JOIN script s ON s.id = sd.script
GROUP BY s.scripttype, sd.status ORDER BY 3 DESC

-- The real name of every installed bundle
SELECT name, scriptid FROM bundleinstallationscript ORDER BY name

-- Connected ecosystem (aggregate by application before publishing)
SELECT tba_token_name, dcreated, binactive, brevoked FROM oauthtoken ORDER BY dcreated
SELECT id, name, state, createddate FROM integrationapp ORDER BY createddate
```

**Confirmed to respond**, and not obvious: `bundleinstallationscript`, `oauthtoken`,
`integrationapp`, `workflow`, `allocationschedule`, `amortizationschedule`,
`statisticalschedule`, `expensereport`, `opportunity`, `website`, `customfield`,
`customrecordtype`, `customlist`, `subsidiarysettings`, `billingschedule`,
`scheduledscriptinstance`, `deletedrecord`, `currency`, `consolidatedexchangerate`.

**Confirmed NOT to exist:** `installedbundle`, `bundle`, `integration`, `dataset`, `workbook`,
`approvalrule`, `revrecschedule`, `tokenauthentication`, `suiteapp`, `mapreducescriptinstance`,
`workflowstate`, `workflowaction`, `scriptexecutionlog`, `concurrencylimit`.

---

## 8. For the Planning integration

The chart-of-accounts structure drives the Account dimension decisions:

- You map the **leaves**, not the total. In the account analysed: 410 leaves of 445 accounts.
  The 35 rollups are rebuilt by the Planning hierarchy — carrying them across double-counts.
- **Leaves with no movement** (127 of 410) are candidates to exclude: they inflate the
  dimension without contributing data.
- **Tree depth** (3 levels there) is the minimum Planning needs to reproduce the native rollup.
- **Statistical accounts** map into Account but carry no currency — agree the treatment first.

And one business signal worth more than any of the technical ones: if the `NSPBCS_` bundle
appears **together with** native budget loading, two paths are holding the same budget. Do not
read that as failure — ask which is intended to be authoritative.

---

## 9. Operating notes

- **Serialize.** SuiteQL REST caps concurrency per integration; the pipeline runs sequentially
  with short pauses on purpose.
- **Never dump detail.** Everything aggregated server-side. `transactionline` has 1.95M rows.
- **PII stays out.** Customers, employees and contacts never go into a KB or a deliverable —
  count and aggregate, never copy.
- **Rotate credentials** when the assessment ends. They belong to the client's production.
