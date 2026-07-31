---
description: Engagement-hours reports for every Customer Hub client — fleet summary from NetSuite, then full BPC-styled reports on demand
argument-hint: [client name — omit for the whole book]
---

Engagement hours for **$ARGUMENTS** (or, with no argument, for **every client in
the Customer Hub book**), straight from NetSuite. Follow the playbook at
`${CLAUDE_PLUGIN_ROOT}/docs/hours-invoice-playbook.md` — read it BEFORE querying.

## 0 · The client list

- If `C:\apps\engagement-report-kit\clients\hub-clients.json` exists, that IS the
  book: use its `clients` array (name, nsName search hint, and any cached
  `nsCustomerId`/`jobs`). After resolving a client's ids for the first time,
  UPDATE the file so the next run skips the lookup.
- If the file doesn't exist (another consultant's machine), discover the book in
  NetSuite instead: active jobs = `SELECT id, companyname, customer FROM job WHERE
  enddate IS NULL ORDER BY companyname`, or ask which clients to include.

## 1 · Fleet summary (Phase 1 only — always start here)

Batch it (~3-4 queries total, NOT per client):
1. Resolve any missing customer ids (`customer.companyname LIKE`), then all jobs
   for all customers in ONE query (`WHERE customer IN (...)`).
2. ONE `projecttask` query with every job id (playbook query 3).
3. Classify each job (retainer vs T&M per the playbook) and compute
   contracted/budgeted · used · remaining · utilization %.

Show ONE table for the whole book: Client | SOW | Type | Contracted/Budgeted |
Used | Remaining | Util % — flag in **orange** anything over budget or over the
retainer block, and note clients with no open SOW. End with
`as of <today's date>`.

Then, if the Customer Hub repo is available locally, ALSO publish the table to
the console's Hours dashboard: write the rows as
`{ "rows": [{ "client", "domain", "sow", "type": "retainer"|"project", "contracted", "used", "note"? }] }`
(one row per SOW, a client's SOWs consecutive; include `domain` so the dashboard
can open each client's full report) and run
`node <nspbhub>/scripts/publish-fleet-hours.mjs <file> --by "Claude · NetSuite MCP"`.

**Stop here and ask which clients get the full report.**

## 2 · Full report per client (on demand)

For each confirmed client, follow the playbook Phase 2 (invoices with direct
`tl.entity` attribution + reconciliation sanity check + cleaned work log) and
render the report:

- Full version: fill `${CLAUDE_PLUGIN_ROOT}/templates/hours-report.html` (every
  `{{PLACEHOLDER}}` — bars, donut, invoice detail, monthly time log).
- Minimal version (fast): the playbook's low-token variant, then headless-Chrome
  print-to-PDF.
- Footer ALWAYS: `Source: NetSuite project tracking · Bryant Park Consulting ·
  as of <date>`.
- Save as `<client>-hours-<YYYY-MM-DD>.html` + `.pdf` in the working folder and
  list the file paths at the end.

## Per-client snapshot shape (for the Customer Hub "Your hours" report)

Each client's `snapshot.json` is `{ sows: [current, ...closed] }`. Per SOW keep it
concise so refreshes stay cheap and readable:
- **Time log**: only the **most recent month** (last 2 if the latest is thin) —
  no months of task detail. Curate memos (drop daily standups / PM-admin).
- **Invoices** (BPC-only, per SOW via `tl.entity` = job id): all paid + open,
  `{ tranid, date, hours, amount, status }`. The report renders a reconciliation
  (billed $ paid/open · billed hrs vs delivered hrs) — Σ billed hrs should ≈
  `actualwork` (small +diff = current unbilled cycle). Skip $0 prepaid-draw lines.
- Publish with `node <nspbhub>/scripts/publish-engagement.mjs <domain> <snapshot.json>`.

Note: displaying/refreshing the report costs **zero AI tokens** (pure Firestore
data → React). The client's AI chat is grounded in the tenant-kb, NOT the hours
snapshot — hours live as a separate structured report, so refreshing hours never
re-feeds the chat or burns tokens.

## Rules

- Hours ALWAYS from `projecttask.actualwork` — never RTM header fields.
- `memo IS NOT NULL` on every timebill query (rows without memo are planned
  allocations and inflate the numbers).
- Invoice totals must reconcile with actualwork before rendering (playbook
  sanity check); flag unbilled MS overage (`1000MS-O`) to the account owner.
- Client-facing English; no rates/costs/cashflow language.
