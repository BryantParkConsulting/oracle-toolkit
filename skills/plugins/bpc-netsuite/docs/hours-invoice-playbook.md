# SOW Hours & Invoice Report — generation recipe

Self-contained playbook to generate a client-facing engagement report (hours + invoices +
work log) for any BPC client, using only the NetSuite SuiteQL connector.
Output = an HTML file styled with the BPC palette, printed to PDF (A4).

## Phase 1 — the numbers (cheap, always run first)

Stop after this phase and show the summary. Only continue to Phase 2 if the full
report/PDF is confirmed (Phase 2 pulls the large time-entry log).

```sql
-- 1. customer id
SELECT id, companyname FROM customer WHERE LOWER(companyname) LIKE '%<name>%';

-- 2. jobs = SOWs (each SOW is its own job / sub-customer)
SELECT id, companyname, startdate, enddate FROM job WHERE customer = <CUST> ORDER BY startdate;

-- 3. hours per workstream, per job (LIVE numbers — never use RTM header stored fields)
SELECT project, title, custevent_bpc_prepaid_hours AS prepaid,
       plannedwork, actualwork, parent, issummarytask
FROM projecttask WHERE project IN (<JOB1>, <JOB2>, ...) ORDER BY project, id;
```

Interpretation:
- `prepaid IS NOT NULL` → **Managed Services retainer** (Case A): contracted = Σ prepaid,
  labels = *Contracted / Available*, overage above the block is billable (item `1000MS-O`).
- No prepaid → **T&M project** (Case B): budget = `plannedwork` of the root row
  (`parent IS NULL AND title = 'Project Overview'`), labels = *Budgeted / Remaining*.
  Remaining = plannedwork − actualwork (can go negative = budget exhausted; T&M keeps billing).
- The `Non-Billable` root (parent IS NULL) is internal work at no charge — exclude from the
  budget table, mention it once as a footnote ("N hrs of non-billable work at no charge").
- Leaf rows (`issummarytask='F'`) under Project Baseline / Change Orders = the workstream
  table rows (budget / used / remaining each).

## Phase 2 — invoices + work log (only when the report is confirmed)

```sql
-- 4. invoices with DIRECT SOW attribution: tl.entity on each line = the JOB id.
--    Deposits show as item 'Customer Deposit'.
SELECT t.tranid, t.trandate, tl.entity AS job_id, i.itemid,
       tl.quantity, tl.rate, tl.netamount, tl.memo
FROM transaction t
JOIN transactionline tl ON tl.transaction = t.id
LEFT JOIN item i ON i.id = tl.item
WHERE t.entity IN (<CUST>, <JOB1>, <JOB2>) AND t.type = 'CustInvc'
  AND tl.mainline = 'F' AND tl.taxline = 'F'
ORDER BY t.trandate;

-- 5. time entries per job (the work log). WARNING: can be huge (100k+ chars) —
--    date-bound it or process it in a subagent, and select only these columns.
SELECT t.customer, t.trandate, e.entityid AS who, t.hours, t.memo, t.isbillable
FROM timebill t LEFT JOIN employee e ON e.id = t.employee
WHERE t.customer IN (<JOB1>, <JOB2>) AND t.memo IS NOT NULL
ORDER BY t.customer, t.trandate;
```

```sql
-- 5b. WHO delivered each invoice: billable hours by consultant per half-month
--     (invoice dated the 15th = first half; end-of-month = second half).
--     ⚠️ memo IS NOT NULL is MANDATORY: rows without memo are planned allocations
--     (incl. future-dated) and inflate the numbers massively.
SELECT t.customer, TO_CHAR(t.trandate,'YYYY-MM') AS mo,
       CASE WHEN TO_NUMBER(TO_CHAR(t.trandate,'DD')) <= 15 THEN 1 ELSE 2 END AS half,
       e.entityid AS who, SUM(t.hours) AS hrs
FROM timebill t LEFT JOIN employee e ON e.id = t.employee
WHERE t.customer IN (<JOB1>, <JOB2>) AND t.isbillable = 'T' AND t.memo IS NOT NULL
GROUP BY t.customer, TO_CHAR(t.trandate,'YYYY-MM'),
         CASE WHEN TO_NUMBER(TO_CHAR(t.trandate,'DD')) <= 15 THEN 1 ELSE 2 END, e.entityid
ORDER BY t.customer, mo, half;
```
This feeds a "Delivered by (hrs)" column per invoice. Per-person splits can shift ±1-2 hrs
around billing cutoffs — footnote it; per-SOW totals must still reconcile exactly.

Notes: quantities/netamounts on invoice lines come back **negative** — flip the sign.
`timebill` has no `project` field: filter by `customer = <job id>` (the job IS the sub-customer).

### Invoice → SOW attribution (direct)

`tl.entity` on every invoice line **is the job id** — attribution is a GROUP BY, no
guessing. BPC bills semi-monthly, typically one invoice per SOW per cycle.
**Sanity check (always):** Σ(billed hours per job) must equal that job's
`projecttask.actualwork`, minus at most the current unbilled cycle. If it doesn't
reconcile, an invoice is missing or a non-PS line slipped in — fix before rendering.
- `Customer Deposit` lines are refundable deposits applied to invoices — list them separately,
  never as hours.
- If the client has an MS retainer, ALSO run the MS invoice audit: gap = consumed − contracted
  must be covered by `1000MS-O` invoices; flag any unbilled overage to the account owner
  BEFORE sending.

### Work log cleaning (client-facing)

Group `timebill` rows by job → month. Per month: total billable hrs (isbillable='T') and a
merged bullet list of memos. Strip `Offline |` / `Internal |` / `<Client> | <SOW> |` prefixes
and commit hashes; collapse newlines; merge near-duplicates; keep issue numbers (`#N`).
Drop internal-only notes (non-billable-per-finance, coverage notes, invoice status).

## Report structure (one HTML, both/all SOWs)

1. **Cover** (navy, gold stats — hours first, money smaller): client, "Engagement hours
   summary", period, tiles: Budgeted/Contracted · Consumed · Utilization % · Remaining.
2. **Per SOW — hours summary**: 4 tiles + workstream table (Budgeted | Used | Remaining,
   totals row; over-budget cells in orange). Non-billable footnote.
3. **Orange banner** only if: MS overage exists (hrs × rate, billed separately) or a T&M
   budget is exhausted. Delete otherwise.
4. **Per SOW — invoice table**: Invoice # | Date | Billing period | Hours | Amount | Work
   covered (one short phrase referencing the time log). Totals row with the reconciliation
   note ("= hours consumed ✔" / "N hrs pending current cycle"). Deposits noted above the table.
5. **Per SOW — monthly time log**: `.month-block` per month ("Month YYYY — N hrs" label +
   cleaned bullets).
6. Footer: "Source: NetSuite project tracking · Bryant Park Consulting · as of <date>".

**Language: English** (client-facing). No internal terms: no "collected", no cashflow,
no finance routing, no consultant cost rates.

## Format spec (enough to reproduce anywhere — no template needed)

- Palette: NAVY `#1F3C51` (headers, cover bg) · SAGE `#619C8A` (accents) · GOLD `#F2CC5F`
  (cover stats/rule) · ORANGE `#EC8842` (overage/warnings) · GREEN `#047050` (ok) ·
  GRAY `#767676` (footnotes) · line `#E6ECF0`.
- Font `Sarabun` (fallback Segoe UI/Arial), body 12px, `@page A4, margin 14mm 12mm`.
- Tables: navy header row white text; zebra `#FAFBFC`; totals row bold on `#F3F6F9`;
  numeric cells right-aligned `tabular-nums`.
- Brand mark: **BryantPark** + small letter-spaced "CONSULTING"; cover = navy page with
  gold eyebrow "CONFIDENTIAL · ENGAGEMENT HOURS", 40px light title, 54×3px gold rule.
- `page-break-inside: avoid` on month blocks; never one page per invoice.
- Full reference template: `${CLAUDE_PLUGIN_ROOT}/templates/hours-report.html`.

## Minimal variant (low-token, auto-PDF)

When speed/tokens matter, skip the cover and monthly time log: one page with title +
gold rule, the per-SOW workstream tables, the invoice tables, and the deposits note —
~15 lines of CSS using only the palette above. Then render the PDF directly (no manual
Ctrl+P):

```powershell
& "C:\Program Files\Google\Chrome\Application\chrome.exe" --headless --disable-gpu `
  --print-to-pdf="<out>.pdf" "file:///<path>/<report>.html"
```

## Fleet mode (all clients with open SOWs)

Phase-1 only, batched: pull all active jobs (`enddate IS NULL` or recent actualwork,
or the RTM list `customrecord_bpc_rtm_project`), then ONE `projecttask` query with all job
ids → budget/used/remaining table for the whole book (~3-4 queries total). Generate the
full per-client report on demand only.
