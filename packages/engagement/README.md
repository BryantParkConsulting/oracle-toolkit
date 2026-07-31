# Engagement-Hours Report Kit

Everything needed to produce a **client-facing Managed Services hours report** (contracted vs.
consumed, invoice detail, cleaned time log, overage callout) as a branded PDF — **for any
customer**. This is the reusable, self-contained version of the one-off Overture script.

The report answers, for one MS SOW: *what did the client buy, what got used, what was invoiced,
what's still to bill, and what work was done* — the same PDF you already have for Overture.

```
engagement-report-kit/
├── generate-report.js        # CLI:  node generate-report.js <client>
├── queries.sql               # the 5 SuiteQL queries that fill a config
├── lib/
│   ├── template.js           # the HTML/CSS report template (generic, cfg-driven)
│   └── render.js             # HTML → PDF via headless Chrome (CDP)
├── assets/                   # shared brand assets (self-contained; no external deps)
│   ├── bpc-logo.b64  hero-default.b64  circles-default.b64
└── clients/
    ├── _TEMPLATE/config.js   # documented template — copy this per client
    └── overture/config.js    # ← worked example (live Apr–Jun 2026 data)
```

## How it works

One **generic engine** (`lib/`) + one **`config.js` per client**. The engine never changes;
each client is just data. `generate-report.js overture` reads `clients/overture/config.js`,
writes `engagement-report.html`, then prints `engagement-report.pdf` next to it.

## Make a report for a new customer

1. **Copy the template:** `clients/_TEMPLATE/config.js` → `clients/<client>/config.js`.
2. **Pull the data** with `queries.sql` (via the `ns_runCustomSuiteQL` MCP connector), in order:
   customer id → MS job id → month block (q3) → MS invoices (q4) → time log (q5).
   - **MS retainer only.** Items `1000MS-03` (block) + `1000MS-O` (overage). Exclude every
     `1000.0X` / `1000PS` T&M line — that's separate Professional Services.
   - **Hours = `projecttask.actualwork`** (LIVE). Never `$ ÷ rate`, never the RTM `_stored`
     fields (they're stale). Full playbook: `C:\apps\GSAAssistant\docs\NETSUITE.md` §1–§4.
3. **Fill the config** — every field is documented in `_TEMPLATE/config.js`. Clean the timebill
   memos (strip `Offline | … -` prefixes and commit hashes, keep `#N`); skip null-memo rows.
4. **Pick the billing model** (`billingMode`): `monthly` (unused hours expire; overage = Σ months
   over block) or `quarterly-pooled` (block pools; overage = net over the quarter). Get this right
   — it changes the billable-overage number. (Overture is `monthly`.)
5. **Reconcile** — Σ time-log hours ≈ Σ `actualwork`; billable overage matches an invoice or is
   flagged as not-yet-billed. Run the MS invoice audit (NETSUITE.md §2) before sending.
6. **Generate** (see Run) → hand Bruno the PDF.

## Run

Needs Node (built-in `fetch`/`WebSocket`, Node 20+) and a headless Chrome on port 9222:

```powershell
Start-Process "C:\Program Files\Google\Chrome\Application\chrome.exe" `
  -ArgumentList "--remote-debugging-port=9222","--headless=new","--user-data-dir=$env:TEMP\chrome-debug-profile","about:blank"

node generate-report.js overture      # -> clients/overture/engagement-report.{html,pdf}
```

No Chrome on 9222? The **HTML still gets written** — open it in any browser and Print → Save as
PDF (A4, background graphics on). Override the port with `CDP_PORT=9333 node generate-report.js …`.

## Reconcile against the CHARGE report (Finance's source of truth)

Finance/PMs audit hours with the **charge report** (`[BPC] Project Charges for Resource
Planning`, saved search 75273) — not `timebill`. SuiteQL: `SELECT ... FROM charge WHERE
billto = <job_id> AND use = 'Actual'` (`quantity` = hrs, `chargedate`, `stage`,
`chargeemployee`, `memo`). Build the month table and the work log from charges, or the report
won't match Finance. Two gotchas (real case: Brady Jul 2026, flagged by Melissa):
- **Pending-approval time has no charge yet** → it's in `timebill` but missing from charges;
  don't count it as consumed until approved.
- **Misassigned entries** show up under the job — scan memos for other clients' names and
  exclude + flag them to the PM.
- **Quarter-start system lines**: 1h charges with no employee, no memo, no timerecord, dated
  the 1st of each retainer quarter (01/01, 04/01, 07/01…) are billing artifacts, not work —
  exclude them (`chargeemployee IS NOT NULL OR timerecord IS NOT NULL`).

When a PM/Finance number still differs after these exclusions, run the reconciliation
protocol in the Drive RUNBOOK-v4 ("Engagement Hours Reports — Runbook" folder): row-level
same-day compare → time entries without a charge → charges billed to the parent customer →
if NS closes complete, the delta is in their spreadsheet (ask for the specific row).

## Internal-review variant (NS links) vs client-facing

`retainerDesc` and `overageNote` accept inline HTML — embed `<a href>` NetSuite links there
(retainer + overage invoices, RTM record, MS job) to produce an **internal review PDF** Bruno can
click through (worked example: `clients/brady/config.js`, Jul 2026). Multiple quarterly retainers:
sum them into `retainerPaid` and list each invoice link in `retainerDesc`. **Strip all NS links
before sending the PDF to the client** — regenerate with a clean config.

## Per-client visual assets (optional)

Drop `.hero.b64` and `.circles.b64` (base64 of a PNG) into `clients/<client>/` for a custom cover
photo; otherwise the shared `assets/*-default.b64` are used. `.logo.b64` falls back to the BPC logo.

## Related

- **Data & rules:** `C:\apps\GSAAssistant\docs\NETSUITE.md` (field map, hours cases, invoice audit).
- **Slack version** of the same numbers (per-channel digest, no PDF): `docs/MS-HOURS-DIGEST.md`.
- Origin script (single-client, now superseded): `C:\apps\nspb-migrate-fresh\tools\engagement-hours-report.js`.
