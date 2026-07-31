# Current NSPB State / Architecture Report — SPEC (next session)

Second client deliverable, sibling of the Cube Optimization Report. Working name:
**"NSPB Current State Assessment"** (architecture + usage inventory). Same inputs
(tenant-kb.json + level0-summary.json + activity-report.json), same BPC design
system, same pipeline shape: `tools/architecture-report.js` → md → `report-to-pdf.js`
(parameterize title/cover so both reports share the PDF generator).

## Goal (Bruno, June 12 2026)
"Un estado de situación de todo: qué módulos tenés implementados, qué estás usando,
qué no estás usando, qué podrías sacar o simplificar — cubos, formularios, reglas,
variables, dashboards — cruzado con dónde realmente hay datos."

## Input #4 (optional but GOLD): Application Audit export
The audit turns usage *inference* into usage *fact*. Ask the client:
1. Confirm audit is enabled (Application → Audit) and WHICH types: Data, Launch
   Business Rules, Form definition, Metadata, Approvals, Copy Version.
2. Export it: EPM Automate `exportAppAudit <filename> /since=YYYY-MM-DD` (zip of
   CSVs) — last 6–12 months is enough (retention is ~365 days; Data audit can be
   huge, filtered export preferred). Alternative: Planning REST audit endpoints.
3. Also ask for the **User Login Report** (Access Control) → active users vs
   dormant licenses.
What it unlocks per section: §3 forms — real edit activity per intersection/user
(not just data footprint); §4 rules — actual launches with user+date far beyond
the Activity Report window; §6 approvals/workflow actually used or abandoned;
new: active-user count and who maintains metadata.
If audit is DISABLED: ship v1 of the report by data footprint now, recommend
enabling audit, and offer a telemetry refresh after 2–3 months — that itself is
a follow-up engagement.
Parser to build: `tools/parse-audit.js` → `clients/<c>/audit-summary.json`
(byForm? audit data rows carry the intersection; map members→forms via kb.forms
POV match; byRule launches; byUser activity; lastTouched per artifact).

## Sections (draft)
1. **Application inventory** — cubes (BSO/ASO, size, density, block counts from AR),
   module detection (Workforce via Workforc cube + OEP_* artifacts, Reporting via Rpt
   ASO, Details), counts: N forms, N rules, N variables, N dashboards, N FRs, N DM
   integrations, N navigation flows.
2. **Cube usage status** — per cube: blocks, density, last-calc activity (AR),
   verdict @@OK@@ active / @@WARN@@ low usage / @@X@@ near-empty (Details 0.05%).
3. **Forms: used vs stale vs broken** — THE core analysis. For each form in
   kb.forms: extract POV/page/row members (scenario, version, years); intersect with
   level-0 `blocksByScenarioVersionYear` / `blocksByScenarioYear`:
   - data at its intersections → **in use** (input forms: writable L0 rows; report
     forms: display only)
   - POV points at scenarios/years with ZERO blocks → **likely unused/stale**
   - references missing members / stale subvars → **broken**
   Output: counts + table of top candidates to retire. Caveat in report: inference
   by data footprint, not telemetry — validate with client before deleting.
4. **Business rules: executed vs dormant** — rules in kb.rules vs rules seen in AR
   (calcScriptsByAvgDuration, slowestBusinessRules, blocksCreatedByCalc). Dormant ≠
   dead (AR window is limited) — label "not executed in the AR window".
5. **Substitution variables health** — compare values to today: CurrentMonth /
   LastClosedMonth / FcstYr1-2 / BSOldestYr etc. Stale = points at past periods.
6. **Dashboards & FRs** — count, which reference stale scenarios/missing members.
7. **What you could be using** (opportunities) — modules present but idle (e.g.
   ASO Rpt cube barely used while history bloats BSO), features unused (valid
   intersections, Smart Lists, navigation flows with dead targets).
8. **Suggested simplifications** (prioritized, @@IDEA@@ framing) + effort estimate
   (~calibrate small: this is mostly deletion/cleanup, target 15-25h total).

## Rules carried over from the optimization report (MUST)
- All client-facing output in ENGLISH; "suggested changes" framing everywhere.
- Status icon on every narrative bullet (@@OK@@/@@WARN@@/@@X@@/@@IDEA@@); legend up top.
- Charts in their sections (inventory treemap/bars, forms used/stale/broken donut,
  variables health, rules executed vs dormant bars).
- No duplicated findings; specificity (name forms/rules/variables); % bases labeled.
- Version stamp vYYYY-MM-DD.HHMM; QA checklist in CUBE-OPTIMIZATION-README §4b applies.
- Effort estimates conservative-LEAN (~1/3 of instinct; see playbook memory).

## Implementation notes
- Form definitions: kb.forms entries have dims/POV from parse-lcm.js — verify field
  names before coding (some forms may lack full POV detail; if so, parse the LCM
  form XML/CSV directly — they're in the export under Plan Type/forms).
- Reuse scenarioAnalysis() STALE regex from optimization-report.js for "form points
  at stale scenario".
- report-to-pdf.js: add a `--title`/report-type param instead of forking the file;
  cover stats become: N forms (X% in use), N rules (Y executed), N stale variables,
  N cubes.
- Squarespace = pilot client; everything must stay generic per CLIENT.

## Reusability — what's generic vs per-client (June 16 2026)
The pipeline is generic; run for any client by dropping inputs in `clients/<c>/` and:
```
unzip -p "clients/<c>/AuditRecords*.xlsx" xl/worksheets/sheet1.xml | node tools/parse-audit.js <c>
# structure the pasted Activity Report into clients/<c>/activity-report.json (incl. dimensionsByCube, attributeDims)
for cube in <BSO+ASO cubes>; do unzip -p "clients/<c>/level0/$cube.zip" data1.txt | node tools/parse-level0-multi.js <c> $cube; done   # optional
node tools/architecture-report.js <c> && node tools/state-report-pdf.js <c>
```
**Fully data-driven (no edits needed):** module detection, artifact inventory, data maps, dimension profile + member counts (reads AR.dimensionsByCube — uses `stored`), attribute analysis, module-retirement impact (auto-detects dims unique to a dormant module's cube), substitution-variable staleness, users/rules/data-channel from audit, level-0 "where data lives" + scenario mix, all charts, Cash Flow gap (from financialsFeatures flags).
**Client-specific PROSE to review/rewrite each run (in architecture-report.js):** the "What the previous team built — model by model" narrative (§1.1) and the KEEP/START USING/REMOVE decision board (§4.2) contain business-specific storytelling (e.g. "psychometric testing revenue"). These reference cube names OEP_FS/RevPlan/WFPlan; for a client with differently-named custom cubes, adjust. Everything else regenerates correctly. The exec summary bullets also name WFPlan/Workforce — fine for any EPBCS Workforce app, review if the dormant module differs.

## Demo / anonymized reports (June 16 2026)
To produce a neutral, sellable version of ANY report (client identity removed, all
numbers kept), set `DEMO_NAME` when running the PDF generator:
```
DEMO_NAME="Northwind" node tools/state-report-pdf.js talogy      # -> state-report-demo.pdf
DEMO_NAME="Northwind" node tools/report-to-pdf.js squarespace    # -> optimization-report-demo.pdf
```
tools/anonymize.js (shared) handles it: client name → DEMO_NAME (incl. member-name
substrings like TotalTalogyGov), user emails → user{n}@<demo>.com (clients) /
advisor{n}@partner.com (consultants) / System, Oracle pod URL + identity domain (a######)
scrubbed. Outputs `*-demo.pdf` (real client deliverables untouched). BPC branding is
KEPT on purpose (seller's material) — strip it too if a white-label version is needed.
