---
description: Hours summary from NetSuite as paste-ready markdown for a Customer Hub note
argument-hint: <client or job> [days]
---

Build a client-facing hours summary for **$ARGUMENTS** and output it as ONE
markdown block, ready to paste into a shared note in the BPC Customer Hub
(bpccustomerhub.web.app → the client → Notes). The hub's note editor renders
pasted markdown as rich content — headings, bold, and real tables.

## 1 · Data (connected NetSuite SuiteQL tool — same logic as /ns-hours)

- Resolve the job (number = id; else `SELECT id, companyname FROM job WHERE LOWER(companyname) LIKE '%<text>%'`; if several match, ask).
- Retainer blocks: `SELECT pt.title, pt.custevent_bpc_prepaid_hours AS contracted, pt.actualwork AS used FROM projecttask pt WHERE pt.project = <jobId> AND pt.custevent_bpc_prepaid_hours IS NOT NULL AND pt.custevent_bpc_prepaid_hours > 0 ORDER BY pt.title`
- If empty (implementation project): `SELECT pt.title, pt.estimatedwork AS budgeted, pt.actualwork AS used FROM projecttask pt WHERE pt.project = <jobId> ORDER BY pt.id`
- Optional recent-activity log (only if the user asked for it or gave a day count): the `/ns-timelog` query.

## 2 · Output — exactly this shape, in one copyable block

```markdown
## <Client> — <SOW> hours (<period>)

**Contracted <C>** · **Used <U>** · Utilization **<pct>%**

| Month | Contracted | Used | Available |
| --- | ---: | ---: | ---: |
| <line> | <c> | <u> | <avail or "-N (over)"> |
| **Total** | **<C>** | **<U>** | **<A>** |

- <one line: within block ✅ / overage of N hrs ≈ $X billed separately>
- Unused hours don't roll over   ← only for monthly retainers
```

(For an implementation project use headers Workstream / Budgeted / Used / Remaining.)

**Client-facing**: clean task text, no internal notes (nothing like "pending
Finance", "non-billable per Finance", "covering X"), no NetSuite links or ids.

## 3 · Tell the user what to do with it

"Copy the block above → Customer Hub → <client> → Notes → paste into a page
(e.g. a 'Hours <period>' note). It renders as a formatted table the client can
see."
