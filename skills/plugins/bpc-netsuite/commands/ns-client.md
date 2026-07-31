---
description: Look up a NetSuite customer by name — id, jobs/SOWs and contacts
argument-hint: <customer name>
---

Find the NetSuite customer matching **$ARGUMENTS** and show a quick profile,
using the connected NetSuite SuiteQL tool. Run these in order:

1. Match the customer:
   ```sql
   SELECT id, entityid, companyname, email
   FROM customer
   WHERE LOWER(companyname) LIKE '%<name>%' OR LOWER(entityid) LIKE '%<name>%'
   ```
   (lowercase the search text). If several match, list them and ask which.

2. For the matched customer `<id>`, list its jobs / SOWs:
   ```sql
   SELECT id, entityid, companyname FROM job WHERE customer = <id> OR parent = <id>
   ```

3. List contacts:
   ```sql
   SELECT entityid, email FROM contact WHERE company = <id>
   ```

Present three short tables: the customer (id + name + email), the jobs/SOWs
(id + title — these are the `<jobId>` values `/ns-hours` and `/ns-timelog` take),
and the contacts (name + email).
