# NSPB Training FAQ Manual

*Generated on 5/5/2026*

---

## 1. Why were inactive locations and subsidiaries appearing in the system initially, and how was this issue resolved?

The presence of inactive members in the application was identified as a missing filter logic within the NetSuite saved searches that feed data into the NSPB (NetSuite Planning and Budgeting) environment. Specifically, the queries used for the metadata synchronization did not explicitly exclude records marked as 'inactive.' To resolve this, the administrative team modified the underlying saved searches to include a filter where 'Inactive is False.' Following this logic change, the system data was reloaded, effectively resetting the structure and removing all inactive records from the location and subsidiary dimensions. This ensures that only relevant, active operational entities are visible for budgeting and forecasting, preventing data clutter and user confusion.

---

## 2. What led to the decision to 'take apart and reassemble' the balance sheet architecture?

The original configuration of the balance sheet was found to be highly inefficient and non-compliant with industry best practices. It relied on excessive segmentation and structural choices that made reconciliation difficult and hampered reporting accuracy. The project team undertook a comprehensive reconstruction to clean up these segments and reassemble the balance sheet using a streamlined, best-practice approach. This process involved validating the data against NetSuite actuals and scheduling automated daily loads to ensure the balance sheet remains synchronized with the latest financial data. This structural overhaul is critical for providing a stable foundation for Phase 1 forecasting.

---

## 3. What is an 'Alternate Hierarchy' in NSPB, and how does it support state-specific reporting like Louisiana’s fund balance changes?

An alternate hierarchy is a secondary rollup structure within a dimension (typically the Account dimension) that allows the same data to be viewed in multiple ways without duplicating the underlying data values. For Louisiana, this is used to replicate the 'Change in Fund Balances' view. By utilizing 'Shared Members,' the system points to the original NetSuite GL accounts but groups them under differently named subtotals and categories. This allows the Louisiana team to interact with data in their familiar format while the system simultaneously maintains the standard NetSuite reporting structure. As additional states like Florida or the Carolinas are onboarded, they can each have their own specific alternate hierarchies to meet their unique statutory or operational reporting needs.

---

## 4. How are security and visibility managed across different state-specific hierarchies?

Security in NSPB is granular and can be applied at the member or hierarchy level. For example, users associated with the Louisiana subsidiary are granted access to the Louisiana alternate hierarchy (e.g., 'Change in Fund Balances'), while Florida users are restricted to their specific state rollups. This ensures that when a Florida user logs in, they only see the account groupings and context codes relevant to their region. Administrators control this visibility through security rules and group permissions, ensuring that sensitive data is protected and that the user interface remains uncluttered by irrelevant regional structures.

---

## 5. What is the process for maintaining hierarchies when new GL accounts are added in NetSuite?

NSPB nightly integrations automatically pull new GL accounts into the standard NetSuite hierarchy. However, those new accounts do not automatically populate alternate hierarchies because the system does not know which state-specific subtotal they belong to. An administrator must manually go into the Dimension Manager, locate the new account, and add it as a 'Shared Member' under the appropriate parent in the alternate hierarchy. This manual step is required to ensure data integrity, as a single account might be categorized differently in Louisiana than it is in North Carolina. Failure to perform this maintenance can lead to reconciliation errors where the standard hierarchy totals do not match the alternate hierarchy totals.

---

## 6. Can NSPB provide automated email alerts when new accounts are created in NetSuite?

NSPB does not have a native, out-of-the-box alerting system for metadata changes occurring in NetSuite. While it is possible to build a custom solution using scripts to flag changes, it is considered a best practice to manage these notifications on the NetSuite side. Since NetSuite is the 'Source of Truth' where the account is first created, an alert triggered by a NetSuite workflow or saved search email notification is more immediate and effective. This ensures that the finance team is notified the moment an account is created, prompting them to perform the necessary mapping and hierarchy updates in NSPB.

---

## 7. How do 'Member Set Functions' improve the efficiency of pre-built forms and reports?

Member set functions, such as 'Descendants' or 'Descendants Inclusive,' are dynamic rules used in form and report design. Instead of hard-coding a specific list of accounts into a report, a member set function tells the system to 'pull every child currently existing under this parent.' This is vital for maintenance; when a new account is added to a parent member in the hierarchy, the pre-built reports and forms automatically update to include that account upon the next refresh. This fluidity eliminates the need for administrators to update every individual report when the chart of accounts changes.

---

## 8. Why is the reporting process different in Smart View compared to pre-built NSPB web forms?

Smart View operates as a grid-based UI within Excel, which physically selects and places specific members on the spreadsheet. Unlike web forms, it does not always default to dynamic member set functions. To ensure a Smart View ad-hoc report captures new accounts, a user must perform a 'Zoom In' operation. Specifically, they must select a top parent member, use 'Keep Only,' and then 'Zoom In' to all levels. Because this can be cumbersome, the technical team recommends using 'Pre-built Forms' as the data source within Smart View. These forms carry the dynamic member set functions from the web, allowing the Excel grid to refresh and capture hierarchy changes automatically.

---

## 9. What solution was proposed to automate the maintenance of alternate hierarchies and reduce administrative overhead?

To eliminate the daily manual task of adding shared members to state-specific hierarchies, the team proposed adding 'Custom Fields' to the Account record in NetSuite. These fields would be mandatory and would require the user to select the appropriate 'NSPB Parent' for each alternate hierarchy at the moment of account creation. NSPB would then use a modified saved search to ingest these associations, automatically creating the parent-child relationships in the alternate hierarchies. This shifts the 'onus' to the accounting team in NetSuite but ensures that the reporting structures in NSPB are always 100% synchronized without manual intervention from the NSPB admin.

---

## 10. How do User Preferences impact date formatting within NSPB schedules?

NSPB stores dates as numeric values to allow for calculations, but the display format is controlled by individual user preferences. If a user is unable to input a four-digit year (e.g., 2026 vs. 26), they must navigate to the 'User Preferences' menu from the home screen, select the 'Display' tab, and adjust the 'Date Format' dropdown to 'MM/DD/YYYY.' It is important to note that these settings are specific to the individual user profile; changing it for one user does not change it for the entire organization. Users are also cautioned against having multiple browser tabs open with different settings, as this can cause 'cookie' conflicts and input errors.

---

## 11. What is the procedure for adjusting decimal precision on data entry forms?

Decimal precision is managed at the form level by an administrator. To change the number of decimal places visible (e.g., from whole numbers to two decimals for currency), an admin must open the form in 'Edit' mode, navigate to 'Other Options,' and set the 'Minimum' and 'Maximum' decimal values. For currency, a maximum of 2 is standard for exact tie-outs. This setting can be customized per form, meaning a high-level summary report might be set to 0 decimals for readability, while a detailed debt schedule form is set to 2 for precision.

---

## 12. Why are individual dates not aggregated at the 'Total Location' or 'Total Subsidiary' levels?

Logistically and mathematically, dates cannot be aggregated through summation. In a multi-dimensional system like NSPB, an aggregation rule for a numeric field (like revenue) adds the values of all children together. For a date field, summing January 1st and January 2nd would result in a nonsensical numeric value. Therefore, date columns are configured to show data only at the 'Level 0' (bottom level) members. At the total level, these fields will typically appear blank or zero to prevent the display of misleading aggregated numeric strings.

---

## 13. How should 'Stale Data' or duplication issues in the budget be addressed?

Duplicate entries (such as food service expenses appearing in both General and Special Revenue funds) often stem from 'Fully Qualified Member' errors in the upload file—where a string like 'Fund: Food Service' is misread as two different entities. The standard remediation process is for the administrator to 'Clear' the specific budget scenario and reload a corrected file with clean naming conventions. This ensures that any data points left over from previous incorrect iterations are purged, providing a clean tie-out between the NSPB system and the offline Excel models.

---

## 14. What was the significance of the sign reversal for 'Proceeds' in the budget review forms?

In financial reporting, 'Proceeds' are considered other sources of income. If they are loaded as negative values in the budget file, but the system's aggregation rule is set to subtract them from excess revenue, it results in a 'double negative' that incorrectly increases the bottom line. To fix this, the admin must either reverse the sign in the source data or adjust the member's 'Aggregation Property' within the dimension (e.g., changing from + to -) so that the mathematical impact on the Net Income calculation aligns with standard accounting principles.

---

## 15. What is the definition of 'Phase 1 Go Live' for the Louisiana team?

Phase 1 Go Live (targeted for April 8th) focuses on the core functionality of NSPB as a primary forecasting tool. This includes the activation of the Revenue, OPEX, and Workforce modules. At this stage, the team should be able to generate basic Income Statement and Balance Sheet reports based on actuals and loaded budget data. It is essentially the 'foundation' phase that enables the FP&A team to move away from manual Excel modeling and begin utilizing the automated system for their monthly forecasting cycles.

---

## 16. What are the common causes of 'Wage Calculation' gaps in the Workforce module?

When wages appear for some employees but not others (e.g., only regular program employees), the issue is usually related to the 'Fund and Grant GL' assignment in the roster. NSPB workforce rules are often scripted to only calculate wages if a valid Fund and Grant are selected, as these are required segments for the data push to the General Ledger. If these fields are left as 'Undefined,' the calculation logic may skip those rows. To resolve this, users must ensure that every employee in the roster has a complete set of dimensional assignments (Salary GL, Fund GL, Grant GL) before running the workforce calculation rules.

---

## 17. How does the 'Workforce Push' rule differ from a standard data save?

Clicking 'Save' on a workforce form might calculate the local values for that specific form, but it does not automatically move those numbers into the Income Statement. The 'Workforce Push' is a specific administrative business rule that aggregates the detailed roster data (by employee) and pushes the summarized totals to the planning cube's GL accounts. This separation allows users to 'play' with different staffing scenarios in the workforce module without impacting the official forecast until the data is finalized and 'pushed' by an authorized user.

---

## 18. What is the purpose of the 'Actuals Staging' table in NSPB?

The Actuals Staging table serves as an intermediate repository for data pulled from NetSuite before it is formally 'seeded' into the forecast scenarios. It allows administrators to validate that the integration ran correctly and that all account/location segments are properly mapped. If a user sees that their forecast is missing actuals for a closed month (e.g., February), an admin must 're-seed' the data from the staging table to the forecast scenario to ensure the 'blended' view (actuals for past months + forecast for future months) is accurate.

---

## 19. Why is it important to define a 'Source Year' and 'Target Year' when copying scenarios?

NSPB allows for multi-year planning. When an analyst wants to build a budget for FY27 based on their FY26 forecast, the 'Copy Scenario' rule requires clear definitions to prevent overwriting existing data. The 'Source' is the existing data set (FY26 Forecast), and the 'Target' is where the data is going (FY27 Budget). This rule typically copies data at the 'Total Subsidiary' level to ensure consistency, but it must be run with precision to avoid 'Stale Data' being carried forward into the wrong fiscal period.

---

## 20. How can users verify if a specific GL account was excluded from the workforce push?

Users can cross-reference the 'Staffing Summary' form against the 'OPEX Trending' form. If an account like 'Wages - PTO Accrual' appears in OPEX but shows zero FTE/Headcount in the Staffing Summary, it indicates that the account is being planned as a general expense rather than a roster-driven employee cost. This is often intentional for accruals or contract labor that doesn't follow standard FTE logic. If an account *should* be roster-driven but isn't, the admin must update the 'Data Push Mapping' to include that specific GL account.

---

## 21. What are the limitations of the 'Scenario Analysis' form regarding data density?

The Scenario Analysis form is designed to show multiple versions of data (Actual, Budget, Forecast) side-by-side for comparison. Because this involves pulling data from multiple 'slices' of the database simultaneously, the form can be slow to load—often taking 15 to 20 seconds. To improve performance, users are encouraged to use the 'Point of View' (POV) filters to limit the data to a single subsidiary or location, rather than attempting to view the entire organization at once.

---

## 22. How are 'Substitution Variables' used to manage time-based reporting?

Substitution variables are global placeholders (e.g., &CurrentMonth or &ForecastYear1) that act as 'switches' for the entire system. Instead of updating 50 different reports when a month closes, the admin updates the variable '&CurrentMonth' from 'Jan' to 'Feb.' Every form, report, and business rule that references that variable automatically shifts its focus to the new month. This ensures organizational alignment—all users are looking at the same 'Current Month' and 'Forecast Start' periods simultaneously.

---

## 23. What is the difference between 'Stored' data and 'Dynamic Calc' in the metadata settings?

Members tagged as 'Stored' physically hold data values in the database (e.g., a specific GL account where $100 is loaded). 'Dynamic Calc' members do not store data; instead, they calculate their value on-the-fly whenever a report is opened (e.g., 'Total Expenses' which sums all expense accounts). While Dynamic Calc saves storage space and ensures totals are always up-to-date, having too many complex dynamic calculations can slow down report performance.

---

## 24. How are 'Alias Tables' utilized for multi-state reporting in a single NSPB environment?

Alias tables allow the system to display different names for the same member. The system can have a 'Default' alias table (standard GL names) and a 'Louisiana' alias table (context codes). When the Louisiana team views an Income Statement, the system is set to display the Louisiana Alias Table, showing their specific object codes. When a corporate user views the same data, they can switch to the Default table to see the standard NetSuite account names. This allows for localized reporting without altering the core chart of accounts.

---

## 25. What is the role of 'EPM Automate' in system backup and recovery?

EPM Automate is a command-line utility used to automate administrative tasks, including the daily 'Artifact Snapshot.' This snapshot is a full backup of the system's metadata and data. The system typically retains these backups for 30 to 60 days. In the event of a catastrophic error (e.g., a hierarchy being deleted), an admin can use EPM Automate to 'Restore' the system to a previous day's state. This provides a critical safety net for the organization's financial data.

---

## 26. How can an administrator diagnose a failed nightly integration?

The primary tool for diagnosis is the 'Jobs' console. A red flag indicates a failure. Clicking on the failed job allows the admin to view the 'Process Details' and the 'Log File.' Common errors include 'Invalid Login Attempt' (expired tokens) or 'Member Not Found' (a new location was added in NetSuite but not yet synced to NSPB). The admin should first try to run the integration manually to rule out temporary cloud connection issues before diving into script remediation.

---

## 27. Why should users avoid 'Informal' data entry during the UAT (User Acceptance Testing) phase?

During UAT, users often 'play' with the system to test logic, which creates 'erroneous' data points across various scenarios. Before the official Go-Live, it is a best practice for administrators to 'Wipe' or 'Clear' the forecast scenarios (except for the validated FY26 Budget) to provide a clean slate. This prevents 'stale' test data from being accidentally included in official board presentations or management reports.

---

## 28. What is the 'Two-Stage' process for adding new users to the NSPB environment?

Adding a user requires actions in the OCI (Oracle Cloud Infrastructure) and the NSPB application. First, the user is created in the Identity Domain, and an email invitation is sent for them to set a password. Second, after the user has logged in at least once, the administrator must assign them specific 'Roles' (e.g., Service Administrator, Power User, or User) within the NSPB application settings. Access to data is then further refined through security groups within the planning dimensions.

---

## 29. How does 'Signage' logic differ between NetSuite and NSPB reporting?

NetSuite often stores expense and revenue values with standard debit/credit signs (e.g., expenses as positive, revenues as negative in some tables). For presentation in NSPB reports, 'Sign Flip' rules are applied to the parent members in the hierarchy. This allows the system to display expenses as positive numbers in an expense report for readability, while still maintaining the correct mathematical integrity (subtracting them from revenue) in the 'Net Income' calculation.

---

## 30. What should be done if a specific account (e.g., '710 Land Lease CAPEX') is missing from a report?

A missing account is usually a 'Sync' or 'Mapping' issue. First, verify if the account exists in NetSuite 2.0 and if it was created *after* the last nightly sync. If it is a new account, manually run the 'Metadata Integration' to bring it into NSPB. Second, check the 'Alternate Hierarchy' to ensure the account has been added as a shared member. If the account is in the hierarchy but still missing from the report, ensure that data has actually been posted to that account in NetSuite for the period being viewed; NSPB reports often suppress 'Zero' or 'Missing' rows by default.

---

