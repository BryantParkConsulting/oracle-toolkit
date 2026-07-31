# Cube Performance & Optimization Analysis — BPC Playbook

Reusable, per-client process to analyze an NSPB/Essbase cube's **size, data
distribution, dense/sparse design, and calc performance**, and produce a
BPC-branded PDF deliverable + a chat-surfaced summary.

This is a **BPC-led service** (the cleanup is destructive — needs human judgment).
The chat shows the summary as the value teaser; BPC produces & executes the report.

---

## 0. What to ASK THE CLIENT for (3 inputs)

| # | Input | Where the client gets it | What it gives us |
|---|---|---|---|
| 1 | **LCM export** (metadata) | Migration → export Essbase/Planning artifacts | dimensions, members, storage, rules, forms → `tenant-kb.json` (via `parse-lcm.js`) |
| 2 | **Level-0 data export** (`level0.zip` → `data1.txt`, Essbase **column format**) | Application → export level-0 data, or a calc `DATAEXPORT` | REAL block distribution by year / scenario / version + density + dense/sparse detection |
| 3 | **Activity Report** | Application → **Activity Reports** → select-all the page, paste/save the text | AUTHORITATIVE Essbase stats (total/L0/upper blocks, page-file size, block density), **calc durations (slowest rules)**, app size, outline warnings |

> #1 + #2 give size & cleanup. **#3 is what unlocks calc-time hotspots and the real
> page-file/aggregation story** — always ask for it. It's a UI page (cookie-auth),
> so the client pastes it (or the chat can open & read it — roadmap).

Put inputs in `clients/<CLIENT>/`:
`tenant-kb.json` (from LCM), `level0.zip`, `activity-report.json` (structured from
the pasted Activity Report — see the existing squarespace one as the schema).

---

## 1. Run it (one command + PDF)

```bash
node tools/cube-optimize.js <CLIENT> [path/to/level0.zip]   # parse → analyze → report
node tools/report-to-pdf.js <CLIENT>                        # BPC-branded PDF w/ charts
```

## 2. Pipeline (each step standalone)
1. **parse-level0.js** — `unzip -p level0.zip | node parse-level0.js out.json`. Streams
   the 100s-of-MB export; classifies lines (block header ≥3 quoted = sparse combo, 1
   quoted = account data row); extracts Version/Scenario/Currency/Years by END-relative
   position; counts blocks, density, scenario×year matrix, dense-dim samples.
2. **analyze-level0.js** — `CLIENT=<c> node tools/analyze-level0.js` → `level0-cleanup.json`
   (% + Pareto + deletion candidates: stale-name regex + >90%-old-years scenarios).
3. **(manual) activity-report.json** — structure the pasted Activity Report into JSON
   (cube stats, slowestBusinessRules, calcScriptsByAvgDuration, runtimeMetrics, appSize,
   outlineWarnings). Schema = `clients/squarespace/activity-report.json`.
4. **optimization-report.js** — merges LCM dims + level-0 distribution + activity report
   into `optimization-report.md`:
   - §1 exec summary (size, top calc, levers)
   - §2 dimension profile · §2b dense/sparse **verdict** · §2c **real Essbase cube stats**
   - §3 where the data is (% by year/scenario)
   - §4 **scenario × year deletion table** · §5 keep
   - §6 prioritized recs · §7 **slowest calculations** (from activity report)
   Also merges `kb.level0` into the tenant-kb so the chat surfaces it.
5. **report-to-pdf.js** — md → styled HTML (BPC brand) → PDF via headless Chrome
   (`Page.printToPDF`), with inline SVG charts: blocks-by-year, density donut, cleanup
   donut, top-scenarios keep/delete, slowest-calc bars.

## 3. Questions the analysis answers
- How big is the cube *really*? (blocks, page-file GB, density)
- Where is the data? (% by year / scenario / version)
- **What can we delete to shrink it?** (stale scenarios, old years — quantified %)
- Is the dense/sparse design wrong? (verdict from real block density)
- **Which calcs take longest / what slows the nightly run?** (from the Activity Report)
- What's the prioritized fix list?

## 4. Key interpretation notes (Essbase) — READ BEFORE WRITING THE REPORT
These rules come from real review rounds (Bruno's critiques, June 2026). Violating
them makes the report look amateur to an Essbase admin.

**Framing rules (non-negotiable):**
- **Everything is a "suggested change"** — never assert prescriptions. Disclaimer in the
  exec summary; section is "Suggested changes (prioritized)", scorecard column
  "Suggested changes". We see exports, not usage patterns.
- **Specificity or it's useless**: never say "convert upper levels to dynamic calc" —
  NAME the members (LCM has level+storage per member → §2e table + a
  `dynamic-calc-candidates.csv` working file). Same for outline warnings (name the
  members), scheduling (name the mechanism: Application → Jobs → Schedule Jobs / EPM
  Automate `runBusinessRule`), and outline order (print the actual order).
- **Icon language** end-to-end: OK-check = working well/keep · X-cross = issue found ·
  lightbulb = suggested change. Legend after the exec summary. No emoji (BPC rule).

**Essbase interpretation traps:**
- **"99% upper-level blocks" is NOT a finding** — it's normal for any fully-aggregated
  BSO. The meaningful metrics: the **aggregation multiplier** (total ÷ level-0 blocks)
  and **WHAT gets aggregated** (stale scenarios/years aggregated = the real waste).
  Savings order: (1) clear stale scenarios, (2) scope AGG rules to active data,
  (3) dynamic-calc selected upper sparse members (waves + testing) — in that order.
- **Don't claim "each cleared block removes its 93×"** as fact — aggregation may not be
  uniform across scenarios (a Test scenario may never have been aggregated). Say "up
  to ~93×, proportional, to confirm".
- **Separate dimensions BY CUBE.** The LCM mixes all cubes — Employee is Workforc-only,
  Index is Details-only, Account is DENSE in Plan. Never present a cross-cube member
  table as if it described the Plan cube's sparse drivers.
- **Reconcile the two level-0 numbers**: the column export only writes blocks WITH
  data; Essbase's level-0 block count includes #Missing-only blocks. A big gap
  (e.g. 529k export vs 3.6M Essbase) is itself a finding → empty level-0 blocks →
  CLEARBLOCK EMPTY / explicit restructure candidate. State it; don't leave the
  discrepancy unexplained.
- **Label "% of input blocks"** — never "% of cube" when the base is the level-0
  export (155k of 337M total is 0.05%, not 29.5%).
- **One outline-order convention**: dense first, then **aggregating sparse smallest →
  largest (stored members)**, non-aggregating sparse (Scenario/Version/Years/Currency)
  last. Don't let two sections state opposite orders.
- **EPM Cloud nuances**: caches are Oracle-managed (informational only); Hybrid =
  balanced dynamic-sparse for large apps (not a blanket flip); never dynamic on leaf
  sparse without formula; dense L1+ not dynamic.
- Block density from the **Activity Report** (authoritative), not the level-0 input
  density — and label which metric you're showing.
- **Slowest calc** is usually a currency-conversion / datacopy / consolidation FIXing
  too broad — check parallel (CALCPARALLEL/FIXPARALLEL), contradictory @CALCMODE
  (BOTTOMUP then BLOCK = BLOCK wins), year-scope, sequential @IDESCENDANTS. If run
  interactively for hours → schedule overnight + light incremental rule for intraday.
- Delete list is **heuristic** — confirm with the client (numbered iterations like
  Forecast7/10/12 may also be archivable but aren't auto-flagged).
- **Always take an LCM snapshot before any cleanup.**

## 4b. Pre-delivery QA checklist
Before sending the PDF, verify:
- [ ] No dimension/member claims that mix cubes (check §2 vs the per-cube sections).
- [ ] The 529k-vs-3.6M (export vs Essbase level-0) gap is explained, not ignored.
- [ ] One consistent outline-order recommendation across §2e and §7b.
- [ ] All percentages labeled with their base ("% of input blocks" vs total).
- [ ] No "93× savings" stated as certainty.
- [ ] §2b/§2c/§6 tell the SAME story (cleanup first, dynamic-calc third).
- [ ] Consistent units (×/day vs runs/period) and one "active window" definition.
- [ ] Source noted when LCM and Activity Report numbers differ for the same thing.
- [ ] Every recommendation names members / settings / mechanisms.
- [ ] "Suggested change" framing + icon legend present.
- [ ] **Every narrative bullet carries a status icon** (@@OK@@ green / @@WARN@@ yellow / @@X@@ red / @@IDEA@@ bulb). Pure data lists (year %, scenario %) stay icon-free.
- [ ] **No duplicated findings** — the slowest calc appears in detail ONCE (deep dive §2.3) plus one line in the prioritized list; no "hotspots"/"top win" repeats.
- [ ] **Charts live in their sections** (1.1 distribution, 1.6 impact, 2.1 calcs, 3.5 tiers), not in a separate visual-summary page.
- [ ] Calc suggestions show **today-vs-suggested code** (real extracts from the LCM script vs illustrative rewrite, fenced blocks).
- [ ] Outline-order advice shows **TODAY vs SUGGESTED order** with stored-member counts.
- [ ] Zeros analyzed (`totals.zeroCells` from parse-level0.js) — if material, clear-zeros calc example included.
- [ ] **Effort estimate (§4.3) totals ~35–40 h** for an app of this size (Bruno calibrated June 2026: a 100+ h total is ~3× too high). Scale tasks proportionally for bigger/smaller apps; phases = dev clone → apply → validate → prod.
- [ ] Version stamp `vYYYY-MM-DD.HHMM` in header + PDF filename; superseded copies deleted from Downloads/Desktop/deliverables.
- [ ] Tables: text columns left-aligned, numeric columns right-aligned (markdown `--:` drives it).

## 4c. AI / IPM Insights footprint (pure-LCM, no level-0 needed)
`tools/detect-ipm.js` scans the LCM's `Global Artifacts/Auto Predict` folder and
reports every IPM batch (Auto Predict / Prediction / Anomaly / Historical /
Multivariate): what it predicts (accounts), history→future window, source→target
scenario/version, and the model settings (ARIMA/seasonal/outliers…).
- `parse-lcm.js` now embeds it as **`kb.ipm`** (schemaVersion 6).
- Renders as **§3.7** in the optimization report and **§1.8** in the state
  assessment (auto-skipped when the app has no IPM).
- Standalone, when you only have the LCM:
  `node tools/detect-ipm.js <CLIENT>` → `clients/<client>/ipm.json` + `ipm-section.md`.
- Heuristic note: the source→target scenario/version is positional
  (Scenario, Version, Currency, …); cubes with a different dim order (e.g. the
  multivariate Revenue cube) can show an account number in the scenario column —
  verify against the app before quoting it to the client.

## 5. Outputs (in `clients/<CLIENT>/`)
`level0-summary.json`, `level0-cleanup.json`, `activity-report.json`,
`optimization-report.md` / `.html` / `.pdf`, `ipm.json` / `ipm-section.md`,
and `kb.level0` + `kb.ipm` merged into `tenant-kb.json`.
