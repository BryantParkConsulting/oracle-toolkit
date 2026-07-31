# Customer Hub — Hours & Invoices pipeline (RUNBOOK)

How the engagement-hours reports and the console hours dashboard get built and
published to the Customer Hub. Written 2026-07-08. Everything here runs from
**your PC** (NetSuite MCP is session-bound to Bruno until the TBA token exists).

**Golden rule on tokens:** displaying/refreshing a report in the hub costs **zero
AI tokens** — it's Firestore JSON → React. Tokens are only spent (a) once/week when
Claude pulls from NetSuite + curates, and (b) when someone asks the AI chat. The
AI chat is grounded in the tenant-kb, NOT the hours snapshot — refreshing hours
never re-feeds the chat.

---

## What shows where (in the hub)

- **Console → Client access → "All clients" landing**: the whole-book **fleet
  dashboard** — every client & SOW, contracted vs used, green/amber/red. Source:
  Firestore `client_engagement/FLEET_HOURS_KEY`.
- **Console → Client access → <client> → Hours tab**: that client's full report
  (multi-SOW, PDF look) + **Publish to client** toggle + BPC-only invoice detail
  & reconciliation. Source: `client_engagement/{envKey}`.
- **Client's own hub → "Your hours"**: the same report, minus internal bits,
  visible only when Published. Invoices/overage-status never shown to the client.

---

## The roster (who + NetSuite ids)

`clients/hub-clients.json` — the 8 active hub clients mapped to NetSuite
customer/job ids (resolved 2026-07-08). Talogy has no NS PS customer (pre-sales).
Update this file when ids change or a client is added.

---

## Weekly refresh — step by step

Run in Claude (with NetSuite MCP), from `C:\apps\engagement-report-kit`.

### 1. Pull the numbers from NetSuite (SuiteQL)

```sql
-- a. resolve customers (once; cache ids in hub-clients.json)
SELECT id, companyname FROM customer WHERE LOWER(companyname) LIKE '%<name>%';

-- b. jobs = SOWs for all customers, one query
SELECT id, companyname, customer, startdate, enddate FROM job WHERE customer IN (<custIds>) ORDER BY customer, startdate;

-- c. hours per SOW (roots for project kind; prepaid blocks for retainer)
SELECT project, title, custevent_bpc_prepaid_hours AS prepaid, plannedwork, actualwork, parent, issummarytask
FROM projecttask WHERE project IN (<jobIds>) ORDER BY project, id;

-- d. workstream leaves (project SOWs) — the report's breakdown rows
SELECT project, title, plannedwork, actualwork FROM projecttask
WHERE project IN (<projectJobIds>) AND issummarytask='F' AND actualwork>0 ORDER BY project, id;

-- e. time log — recent, billable, memo NOT NULL (drop planned allocations)
SELECT t.customer AS job, TO_CHAR(t.trandate,'Mon DD') AS d, e.entityid AS who, t.hours AS h, t.memo
FROM timebill t LEFT JOIN employee e ON e.id=t.employee
WHERE t.customer IN (<jobIds>) AND t.memo IS NOT NULL AND t.isbillable='T' AND t.trandate >= TO_DATE('<recent>','YYYY-MM-DD')
ORDER BY t.customer, t.trandate;

-- f. invoices attributed to each SOW (tl.entity on the LINE = job id).
--    INCREMENTAL: only the RECENT window — historical paid invoices don't
--    change, and rebuild-hours.mjs MERGES by invoice # into the stored snapshot
--    (adds new, refreshes Open→Paid). The date bound is what makes the weekly
--    refresh cheap. First build ONLY: drop the trandate filter to backfill all.
SELECT tl.entity AS job, t.tranid, TO_CHAR(t.trandate,'Mon DD, YYYY') AS d, t.status,
       SUM(-tl.quantity) AS qty, SUM(-tl.netamount) AS amt
FROM transaction t JOIN transactionline tl ON tl.transaction=t.id
WHERE t.type='CustInvc' AND tl.mainline='F' AND tl.taxline='F' AND tl.entity IN (<jobIds>)
  AND t.trandate >= (SYSDATE - 100)   -- weekly: recent only; omit for first backfill
GROUP BY tl.entity, t.tranid, t.trandate, t.status ORDER BY tl.entity, t.trandate;
```

**Incremental refresh (weekly):** don't re-download history. Re-pull only
(c) current `actualwork` (a running total — always changes, one cheap query),
(e) the last month's time log, and (f) the recent invoice window. `rebuild-hours.mjs`
merges the recent invoices into each snapshot by invoice # (`mergeInvoices`), so
older paid invoices stay and Open→Paid flips are picked up. Full history is only
pulled on the **first build** (omit the `trandate` bound in query-f).

Status codes: **B = Paid · A = Open · D = Deposit**. Quantities/amounts come back
negative → flip sign (the query already does with `-`).

### 2. Write the data files

- `clients/<name>/snapshot.json` — per client, `{ sows: [current, ...closed] }`.
  Each SOW: `clientFull, sow, servicePeriod, kind ('retainer'|'project'),
  breakdownLabel, overview, months[{label,contracted,used}], timebill[{d,who,h,note}],
  ns:{jobId}`. **Curate memos** (drop daily standups / PM-admin). **Time log =
  last month only** (last 2 if thin).
- `clients/invoices-raw.json` — paste the query-f result array verbatim
  (`[{job,tranid,d,status,qty,amt}, ...]`).
- `clients/fleet-hours.json` — `{ rows:[{client,domain,sow,type,contracted,used,note?}] }`,
  one row per SOW, a client's SOWs consecutive.

### 3. Attach invoices + trim logs

```bash
node rebuild-hours.mjs      # per SOW: attach invoices by jobId, trim timebill to last month
```

### 4. Publish to the hub (Firestore)

```bash
# per-client reports (repeat per client)
node ../nspbhub/scripts/publish-engagement.mjs <domain> clients/<name>/snapshot.json
# the fleet dashboard (whole book)
node ../nspbhub/scripts/publish-fleet-hours.mjs clients/fleet-hours.json --by "Claude · NetSuite MCP"
```

Publishing does NOT flip client visibility. To show a client their report:
Console → Client access → <client> → Hours → **Publish to client**.

---

## Rules that keep it correct

- Hours ALWAYS from `projecttask.actualwork` — never RTM header stored fields.
- `memo IS NOT NULL` on every timebill query — rows without memo are planned
  (future) allocations and massively inflate totals.
- **Reconciliation** (project/T&M SOWs): Σ billed invoice hours ≈ `actualwork`;
  a small positive diff = the current unbilled cycle. Validated Enfinity SOW1:
  518.25 billed vs 517.25 delivered ✓. Retainers bill by block, so the report
  shows only $ paid/open for them (overage handled by the banner).
- Client-facing English; invoices, overage status, consultant cost — BPC-only
  (`eng-internal`, hidden from the client and from the printed PDF).

---

## Files

| File | Purpose |
|---|---|
| `clients/hub-clients.json` | roster ↔ NetSuite id map |
| `clients/invoices-raw.json` | raw invoice lines from query-f |
| `clients/fleet-hours.json` | fleet dashboard rows |
| `clients/<name>/snapshot.json` | per-client multi-SOW report |
| `rebuild-hours.mjs` | attach per-SOW invoices + trim logs |
| `../nspbhub/scripts/publish-engagement.mjs` | publish one client's report |
| `../nspbhub/scripts/publish-fleet-hours.mjs` | publish the fleet dashboard |

Plugin equivalents (any consultant, once TBA/token exists or via their own MCP):
`bpc-netsuite` → `/ns-hub-hours` + `docs/hours-invoice-playbook.md`.
