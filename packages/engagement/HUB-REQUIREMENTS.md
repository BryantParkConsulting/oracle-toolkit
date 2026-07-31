# Requirements — MS Engagement Hours in the Customer Hub

Feature request for **nspbhub** (`C:\apps\nspbhub`): a live **Managed Services hours report**
per client, with a **"Refresh from NetSuite"** button and a **Print → PDF** view. This replaces
running the local CLI kit (`C:\apps\engagement-report-kit`) by hand, so any BPC teammate can
produce the report without Claude Code, tokens, or NetSuite know-how.

**Reference implementation (working today):** `C:\apps\engagement-report-kit\` —
`lib/template.js` is the exact report layout (cover/overview/invoice/time-log/overage callout),
`queries.sql` is the exact NetSuite data pull, `clients/overture/config.js` is a real filled
example. Port, don't reinvent. Reference PDF: `clients/overture/engagement-report.pdf`.

---

## 1. What the user sees

### A. New page/section: "Engagement Hours" (per client)
Extend `ManagedServicesView.tsx`'s existing **"Your hours"** anchor (`#ms-hours`) or add a
sibling view. Content = the report the kit already renders, as React:

1. **Header stats** — hours contracted / hours consumed / service period / retainer value.
2. **Block table** — per month: contracted vs consumed, Δ, horizontal bar (over = orange
   `#EC8842`, under = sage `#619C8A`). Utilization donut (>100% orange).
3. **Invoice detail** — retainer invoice(s): number, date, status badge (PAID/OPEN), $;
   prepaid-block table (month / contracted / consumed / billed).
4. **Time log** — grouped by month: date / consultant / hrs / activity (cleaned memos).
5. **Overage callout** (only if billable overage > 0) — hrs over block × overage rate, and
   whether it's been invoiced (`1000MS-O` present) or is **pending billing**.

Design system: the hub's existing tokens (navy `#1F3C51`, sage, gold, orange, Sarabun) —
same palette the kit template uses, so the port is 1:1.

### B. "Refresh from NetSuite" button
- Calls the backend (below), which re-queries NetSuite live and persists the result.
- Shows `last refreshed <timestamp>` + who ran it. Data loads from the persisted snapshot on
  page open (NO NetSuite call on every render).
- On failure: keep last snapshot, show a visible "refresh failed" state — never silently blank.

### C. Print → PDF
- A "Print report" button → print-friendly route/view of the same data (cover page + report
  body), `@media print` CSS: hide nav/buttons, `page-break-inside: avoid` on invoice blocks
  (invoices flow together — never one-per-page), A4, background graphics.
- `window.print()` is enough. **No headless Chrome / server-side PDF needed.**
- Cover layout & styles: copy from `lib/template.js` (`.cover*` classes).

### D. Audience gating (IMPORTANT)
The hub has client users. Two render modes:
- **BPC staff:** everything, including the "not yet invoiced / pending Finance" overage flag.
- **Client user:** hours + invoices only; the uninvoiced-overage internal status is hidden
  (show at most "overage to be billed separately"). Internal $ leakage here is a real incident
  risk — gate by role, not by CSS.

---

## 2. Backend — "Refresh" endpoint

Follow the existing pattern: `nspb-migrate-fresh/service/server.js` (Express, :8787, consumed
via `VITE_NSPB_GEN_URL`). Add:

```
POST /api/ms-hours/:client/refresh   → queries NetSuite, cleans, persists, returns snapshot
GET  /api/ms-hours/:client           → last persisted snapshot
```

### NetSuite access (the one real prerequisite)
- SuiteQL over REST: `POST https://7282750.suitetalk.api.netsuite.com/services/rest/query/v1/suiteql`
  with **Token-Based Auth (TBA)** — an Integration Record + access token a NetSuite admin
  creates once (read-only role is enough; needs SuiteAnalytics/SuiteQL permission).
- Credentials live **server-side only** (env/secret). Never in the browser bundle.
- **Status: NOT yet provisioned.** Until the TBA token exists, ship with a fallback:
  `PUT /api/ms-hours/:client` accepting the snapshot JSON (produced by Bruno's local kit /
  Claude Code session) so the hub feature works end-to-end from day 1.

### The queries (verbatim from `queries.sql` in the kit)
1. Customer id by name → 2. MS job (`job` where companyname like `%Managed Services%`) →
3. **months**: `projecttask` where `custevent_bpc_prepaid_hours IS NOT NULL` →
   contracted (`custevent_bpc_prepaid_hours`) vs consumed (`actualwork`), rate
   (`custevent_bpc_blended_rate`) → 4. **invoices**: `transaction`+`transactionline`,
   `type='CustInvc'`, `itemid LIKE '1000MS%'` → 5. **timebill** by `customer = {job_id}`
   (job = sub-customer; there is NO `project` field on timebill).

### Non-negotiable data rules (from `C:\apps\GSAAssistant\docs\NETSUITE.md`)
- Hours ALWAYS from `projecttask.actualwork` (live). Never `$ ÷ rate`, never RTM `_stored` fields.
- **MS only**: items `1000MS-03` + `1000MS-O`. Exclude `1000.0X`/`1000PS` (separate PS/T&M work).
- Overage invoices dated just outside the SOW window belong to the **prior** period — exclude.
- **billingMode** per client: `monthly` (overage = Σ months over block; unused hrs expire)
  vs `quarterly-pooled` (overage = net). Stored as client config — it changes the billable number.
- Overage rate: blended ×1.10 when overage >25% of block. Recalculate, never copy.
- **Reconcile before persisting**: Σ timebill (billable, memo-bearing) ≈ Σ actualwork; flag any
  consumed−contracted gap not covered by a `1000MS-O` invoice as `uninvoicedOverage` (staff-only).

### Memo cleaning (deterministic — no LLM, no tokens)
- Drop rows with `memo IS NULL` (allocations) and non-billable rows.
- Strip `Offline | <client> | <sow> | <date> - ` prefixes; strip raw commit hashes
  (`[0-9a-f]{7,40}`); keep issue refs (`#N`); collapse whitespace/newlines.
- PM rows (billingclass `1.07`) shorten to "Time entry and billing review" / "Budget EAC review".

---

## 3. Data contract (snapshot JSON)

Mirror of the kit's `clients/_TEMPLATE/config.js` (documented field-by-field there):

```jsonc
{
  "client": "overture", "clientFull": "Overture Promotions", "sow": "SOW3",
  "servicePeriod": "April – June 2026", "billingMode": "monthly",
  "rate": 230, "overageRate": 253,
  "retainer": { "invoice": "INV19226", "amount": 10350.00, "status": "PAID",
                "nsLink": "https://7282750.app.netsuite.com/app/accounting/transactions/custinvc.nl?id=1223260" },
  "months": [ { "label": "April 2026", "contracted": 15, "used": 48.0 }, ... ],
  "team": [ { "name": "Romina Jalon", "role": "Senior Consultant" }, ... ],
  "timebill": [ { "d": "Apr 13", "who": "Romina Jalon", "h": 5.5, "note": "CUSTOMER_MASTER PK (#2): ..." }, ... ],
  "overage": { "billableHrs": 33, "amount": 8349.00, "invoiced": false,
               "internalStatus": "pending Jeff / Finance" },   // internalStatus = staff-only
  "refreshedAt": "2026-07-06T13:33:00Z", "refreshedBy": "bruno@..."
}
```

Persist wherever the hub already keeps per-client data (its Firebase), keyed by client + period.

## 4. Acceptance checklist
- [ ] Overture renders identical numbers to `clients/overture/engagement-report.pdf` (live: 45
      contracted, 70.25 consumed, Apr +33 over, $8,349 uninvoiced, utilization 156%).
- [ ] Print output: cover + report, no UI chrome, invoices not split across pages.
- [ ] Client-role user cannot see `internalStatus` / uninvoiced flag (verify in the payload the
      browser receives, not just the UI).
- [ ] Refresh failure leaves last snapshot + visible error.
- [ ] Manual snapshot upload path works (pre-TBA fallback).
- [ ] No NetSuite credentials reach the client bundle.
```
