---
description: Recent time entries for a NetSuite job — date, consultant, hours, task
argument-hint: <job name or id> [days]
---

Show recent time entries for the NetSuite job in **$ARGUMENTS** (optionally
followed by a number of days — default 30), using the connected NetSuite
SuiteQL tool.

1. Resolve the job id (a number is the id; otherwise
   `SELECT id, companyname FROM job WHERE LOWER(companyname) LIKE '%<text>%'`).

2. Pull the time log:
   ```sql
   SELECT t.trandate, e.entityid AS who, t.hours, t.memo
   FROM timebill t
   LEFT JOIN employee e ON e.id = t.employee
   WHERE t.customer = <jobId>
     AND t.memo IS NOT NULL
     AND t.trandate >= (SYSDATE - <days>)
   ORDER BY t.trandate
   ```
   (`timebill.customer` is the job — jobs are sub-customers; there is no
   `project` column on timebill.)

Present a table: date · consultant · hours · task. Clean the memos for reading —
drop leading `Offline |` / `Internal |` / `<Client> | <SOW> |` prefixes and raw
commit hashes, collapse newlines. Total the hours at the bottom.
