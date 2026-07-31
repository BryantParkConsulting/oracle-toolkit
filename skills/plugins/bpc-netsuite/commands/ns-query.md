---
description: Run a read-only SuiteQL query in NetSuite and show the result as a table
argument-hint: <SuiteQL SELECT query>
---

Run this SuiteQL query against NetSuite using the connected NetSuite MCP tool
(the "run SuiteQL" / `runCustomSuiteQL` tool), then present the rows as a clean
markdown table and summarize what they show in one line.

**Read-only only.** If the query is anything other than a `SELECT`, refuse and
explain that this command is for viewing data.

SuiteQL to run:

```
$ARGUMENTS
```

SuiteQL gotchas (it is NOT standard SQL):
- String concat is `||`, not `+` / `CONCAT`.
- No CTEs / `WITH` — use inline subqueries.
- Dates: `TO_DATE('01/06/2026','DD/MM/YYYY')`; relative dates: `SYSDATE - 30`.
- High-volume record types (customer, transaction, item, employee) can be
  large — add a sensible `WHERE` / limit if the query is broad.
