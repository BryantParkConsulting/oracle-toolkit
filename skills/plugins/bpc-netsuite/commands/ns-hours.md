---
description: Contracted/budgeted vs used vs remaining hours for a NetSuite job (SOW)
argument-hint: <job name or id>
---

Show the hours position for the NetSuite job matching **$ARGUMENTS**, using the
connected NetSuite SuiteQL tool.

**Rule:** hours ALWAYS come from `projecttask.actualwork` (live). Never derive
them from `$ ÷ rate` and never use `_stored` fields.

1. Resolve the job. If **$ARGUMENTS** is a number, use it as the job id.
   Otherwise look it up:
   ```sql
   SELECT id, companyname FROM job WHERE LOWER(companyname) LIKE '%<text>%'
   ```

2. First try it as a **retainer / Managed Services** job — monthly prepaid blocks:
   ```sql
   SELECT pt.title,
          pt.custevent_bpc_prepaid_hours AS contracted,
          pt.actualwork               AS used
   FROM projecttask pt
   WHERE pt.project = <jobId>
     AND pt.custevent_bpc_prepaid_hours IS NOT NULL
     AND pt.custevent_bpc_prepaid_hours > 0
   ORDER BY pt.title
   ```

3. If that returns nothing, it's an **implementation / project** job — budget by
   workstream:
   ```sql
   SELECT pt.title,
          pt.estimatedwork AS budgeted,
          pt.actualwork    AS used
   FROM projecttask pt
   WHERE pt.project = <jobId>
   ORDER BY pt.id
   ```

Present one table — line · contracted (or budgeted) · used · remaining — with a
totals row, overall utilization %, and any over-block line flagged. For a
retainer, the billable overage is the sum of each month's `used − contracted`
where positive (unused hours don't roll over).
