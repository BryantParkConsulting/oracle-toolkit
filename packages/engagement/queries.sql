-- ─────────────────────────────────────────────────────────────────────────────
-- Engagement-hours report — the 5 SuiteQL queries that fill a client config.
-- Account 7282750. Run via the ns_runCustomSuiteQL MCP connector (read-only role is fine).
-- Golden rules: hours ALWAYS come from projecttask.actualwork (LIVE); NEVER $ ÷ rate;
-- MS retainer ONLY (items 1000MS-03 block + 1000MS-O overage) — exclude 1000.0X PS/T&M.
-- Full field map + the 4 hours cases: C:\apps\GSAAssistant\docs\NETSUITE.md.
-- Replace {CUSTOMER} / {CUSTOMER_ID} / {JOB_ID} as you go.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Customer id
SELECT id, companyname FROM customer WHERE LOWER(companyname) LIKE '%{CUSTOMER}%';

-- 2) The MS job (each SOW = one job/sub-customer). Pick the "| Managed Services" one.
SELECT id, companyname, customer, custentity_bpc_rtmproject, startdate, enddate
FROM job WHERE customer = {CUSTOMER_ID} ORDER BY startdate DESC;

-- 3) config.months — contracted (block) vs consumed (LIVE), per month  [Case A]
--    prepaid = custevent_bpc_prepaid_hours (block/mo); actualwork = consumed.
--    Skip the aggregate/baseline rows (prepaid IS NULL); keep the real month tasks.
SELECT title,
       custevent_bpc_prepaid_hours AS contracted,
       actualwork                  AS used,
       custevent_bpc_blended_rate  AS rate,
       enddate
FROM projecttask
WHERE project = {JOB_ID} AND custevent_bpc_prepaid_hours IS NOT NULL
ORDER BY enddate;

-- 4) config.retainer* + overage — the MS invoices (block + overage), mapped to SOW months.
--    Watch stray invoices just outside the window (e.g. a 1000MS-O dated the day before the
--    SOW start belongs to the PRIOR period — do NOT count it in this report).
SELECT t.tranid, t.trandate, BUILTIN.DF(t.status) AS status,
       i.itemid, tl.memo, tl.quantity AS hrs, tl.rate, tl.netamount
FROM transaction t
JOIN transactionline tl ON tl.transaction = t.id
LEFT JOIN item i ON i.id = tl.item
WHERE t.entity = {CUSTOMER_ID} AND t.type = 'CustInvc'
  AND tl.mainline = 'F' AND tl.taxline = 'F'
  AND i.itemid LIKE '1000MS%'
ORDER BY t.trandate;
-- Reconcile: Σ(billed MS hours) should tie to Σ actualwork from query 3. If not, you pulled a
-- non-MS line or missed one — fix before rendering. Overage = consumed − block; flag any overage
-- NOT covered by a 1000MS-O invoice (that's revenue on the table — tell Bruno before sending).

-- 5) config.timebill — the per-entry work log for the "Time log" section  [Case D]
--    timebill has NO project field — filter by customer = {JOB_ID} (the job IS the sub-customer).
--    Rows with memo IS NULL are allocations -> skip. Clean the memos for client eyes: strip the
--    "Offline | Client | SOW | Date -" prefix and raw commit hashes; keep issue numbers (#N).
SELECT trandate,
       BUILTIN.DF(employee)     AS employee,
       hours,
       memo,
       isbillable,
       BUILTIN.DF(billingclass) AS billingclass
FROM timebill
WHERE customer = {JOB_ID}
  AND trandate >= TO_DATE('2026-04-01','YYYY-MM-DD')
  AND trandate <= TO_DATE('2026-06-30','YYYY-MM-DD')
ORDER BY trandate;
