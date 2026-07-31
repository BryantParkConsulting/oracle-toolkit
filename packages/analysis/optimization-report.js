'use strict';
// Build a CLIENT-READY cube optimization report (Markdown) from the LCM
// metadata (tenant-kb.json) + the level-0 data export + the Activity Report.
// Structure (theme-ordered for non-technical readers):
//   Part 1 — Space (where data lives, what can be freed, estimated impact)
//   Part 2 — Calculation speed (slowest calcs, audit, deep dives)
//   Part 3 — Cube design & data flow (reference)
//   Part 4 — Suggested changes & next steps
//   node tools/optimization-report.js [CLIENT]
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const CLIENT = process.argv[2] || 'squarespace';
const dir = path.join(ROOT, 'clients', CLIENT);
const kb = JSON.parse(fs.readFileSync(path.join(dir, 'tenant-kb.json'), 'utf8'));
const L0 = JSON.parse(fs.readFileSync(path.join(dir, 'level0-summary.json'), 'utf8'));
const ARp = path.join(dir, 'activity-report.json');         // optional — Essbase runtime stats
const AR = fs.existsSync(ARp) ? JSON.parse(fs.readFileSync(ARp, 'utf8')) : null;
const n = x => Number(x).toLocaleString('en-US');
const mmss = s => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const TOTAL = L0.totals.blocks;
const pc = x => (100 * x / TOTAL).toFixed(1) + '%';

// ── dimension profile from the LCM ───────────────────────────────────
function dimRows() {
  const rows = [];
  for (const [name, mem] of Object.entries(kb.dimensions || {})) {
    if (!Array.isArray(mem)) continue;
    let dyn = 0, store = 0, noAlias = 0;
    for (const m of mem) { const s = (m.storage || '').toLowerCase(); if (s.includes('dynamic')) dyn++; else if (s === 'store') store++; if (!m.alias) noAlias++; }
    rows.push({ name, count: mem.length, dyn, store, noAlias });
  }
  return rows.sort((a, b) => b.count - a.count);
}

// ── scenario × year matrix → classify scenarios ──────────────────────
const ACTIVE_YEARS = /^FY2[4-9]$|^FY3\d$/;       // FY24+ = active window
const STALE = /copy|test|downside|transfer|lrp|clearscenari|_\d+_\d+|\bv\d+\b|backup|old|tmp|draft|no scenario/i;
function scenarioAnalysis() {
  const sy = L0.blocksByScenarioYear || {};
  const perScn = {};                              // scenario -> {total, oldBlocks, years:Set}
  for (const [k, v] of Object.entries(sy)) {
    const [scn, yr] = k.split('||');
    const s = perScn[scn] || (perScn[scn] = { total: 0, old: 0, years: new Set() });
    s.total += v; s.years.add(yr);
    if (!ACTIVE_YEARS.test(yr)) s.old += v;
  }
  const list = Object.entries(perScn).map(([scn, s]) => ({
    scenario: scn, blocks: s.total, years: [...s.years].sort(),
    oldOnly: s.old / s.total > 0.9,               // >90% of its data in old years
    nameStale: STALE.test(scn),
  })).sort((a, b) => b.blocks - a.blocks);
  return list;
}

// ── shared computations ──────────────────────────────────────────────
const dims = dimRows();
const scn = scenarioAnalysis();
const del = scn.filter(s => s.nameStale || s.oldOnly);
const delBlocks = del.reduce((a, s) => a + s.blocks, 0);
const keep = scn.filter(s => !(s.nameStale || s.oldOnly));
const plan = AR && AR.cubes.find(c => c.name === 'Plan');
const mult = plan ? (plan.totalBlocks / plan.level0Blocks) : 93;
const pageGB = plan ? plan.pageFileMB / 1024 : null;
const yrs = Object.entries(L0.blocksByYears).filter(([k]) => /^FY\d\d$/.test(k)).sort((a, b) => a[0].localeCompare(b[0]));
const oldYrs = yrs.filter(([k]) => k <= 'FY23');
const oldShare = oldYrs.reduce((s, [, v]) => s + v, 0);
const clearPctInput = 100 * (delBlocks + oldShare) / TOTAL;       // % of input blocks clearable
const estGB = pageGB ? (pageGB * clearPctInput / 100) : null;     // proportional estimate

const out = [];
const P = s => out.push(s);

// Version stamp — date + time so every regeneration is distinguishable.
const VER = 'v' + new Date().toISOString().slice(0, 10) + '.' +
  String(new Date().getHours()).padStart(2, '0') + String(new Date().getMinutes()).padStart(2, '0');
P(`# NSPB Cube Optimization Report — ${CLIENT[0].toUpperCase() + CLIENT.slice(1)}`);
P(`_Prepared by BPC · source: LCM metadata + level-0 data export + Activity Report · **${VER}**_\n`);

// ════════════════ EXECUTIVE SUMMARY ═════════════════════════════════
P(`## Executive summary\n`);
if (AR) {
  P(`- @@WARN@@ **Application size:** **${n(AR.appSize.customerDataGB)} GB** customer data on disk (${n(AR.appSize.essbaseDataGB)} GB Essbase + ${n(AR.appSize.snapshotsGB)} GB snapshots). Plan cube page file alone = **${n(plan.pageFileMB)} MB (${pageGB.toFixed(0)} GB)**.`);
  P(`- @@WARN@@ **Plan cube:** **${n(plan.level0Blocks)} input (level-0) blocks** expand to ${n(plan.totalBlocks)} stored blocks via full aggregation (~${mult.toFixed(0)}× — applied to all ${Object.keys(L0.blocksByScenario).length} scenarios and 12 years, including stale ones).`);
  P(`- @@X@@ **Slowest calc:** **${AR.slowestBusinessRules[0].rule}** ran **${mmss(AR.runtimeMetrics.longestCalcExecutionSec)} min** (${(AR.runtimeMetrics.longestCalcExecutionSec / 3600).toFixed(1)} h) — by far the #1 calc-time hotspot. Avg calc execution ${AR.runtimeMetrics.avgCalcExecutionSec}s.`);
}
P(`- @@X@@ **Scenario bloat:** **${del.length} stale / one-off scenarios** hold ${pc(delBlocks)} of the input data — the lowest-risk size & calc-time reduction is to clear them.`);
P(`- @@IDEA@@ **Two biggest levers:** (1) **stop aggregating stale data** — clear the stale scenarios and scope the AGG rules to active scenarios/years (Part 1); and (2) **fix the runaway currency-conversion calc** (Part 2).\n`);
P(`_Everything in this report is presented as **suggested changes** based on the LCM, level-0 export and Activity Report. Each item should be reviewed together with the team that owns the application and validated in a test environment before applying — usage patterns we cannot see (reporting needs, close-process dependencies) may change a recommendation._\n`);
P(`**How to read this report:** @@OK@@ working well / keep as-is · @@WARN@@ caution — verify before relying on it · @@X@@ issue found in the data · @@IDEA@@ suggested change to validate. Best-practice references follow Oracle EPM Cloud / Hybrid BSO guidance (sources in the footer).\n`);

// ════════════════ PART 1 — SPACE ═════════════════════════════════════
P(`## Part 1 — Space: where the data lives and what can be freed\n`);
P(`_In plain terms: this part shows which years and scenarios hold the data, which of them are stale copies that can be deleted, and how much space that would free._\n`);

P(`## 1.1 Where the data actually is\n`);
P(`**By year** (% of input blocks):`);
Object.entries(L0.blocksByYears).sort((a, b) => String(a[0]).localeCompare(String(b[0]))).filter(([, v]) => 100 * v / TOTAL >= 1).forEach(([k, v]) => P(`- ${k}: ${pc(v)} (${n(v)})`));
P(`- (years under 1% omitted — full distribution in the chart above)`);
P(`\n**By scenario** (top 5 of ${Object.keys(L0.blocksByScenario).length} — full split in the chart above):`);
Object.entries(L0.blocksByScenario).sort((a, b) => b[1] - a[1]).slice(0, 5).forEach(([k, v]) => P(`- ${k}: ${pc(v)} (${n(v)})`));
P(``);

P(`## 1.2 Scenario × year — deletion candidates\n`);
P(`A scenario is a **candidate** when its name is a one-off/dated/test copy **or** >90% of its data sits in archived years (FY20–FY23).\n`);
P(`| Scenario | Blocks | % of input blocks | Years with data | Why |`);
P(`|---|--:|--:|---|---|`);
del.slice(0, 40).forEach(s => {
  const why = [s.nameStale ? 'one-off/dated name' : '', s.oldOnly ? 'old-years-only' : ''].filter(Boolean).join('; ');
  const yrsTxt = s.years.length > 6 ? s.years.slice(0, 6).join(',') + '…' : s.years.join(',');
  P(`| ${s.scenario} | ${n(s.blocks)} | ${pc(s.blocks)} | ${yrsTxt} | ${why} |`);
});
P(`\n**Total candidates: ${del.length} scenarios = ${n(delBlocks)} blocks = ${pc(delBlocks)} of input (level-0) blocks.**\n`);

P(`## 1.3 Keep (active scenarios)\n`);
P(keep.slice(0, 12).map(s => `${s.scenario} (${pc(s.blocks)})`).join(' · ') + '\n');

if (AR && plan) {
  P(`## 1.4 Empty-block and zero-value bloat (to confirm)\n`);
  P(`@@X@@ The level-0 data export contains **${n(L0.totals.blocks)} blocks with data**, while Essbase reports **${n(plan.level0Blocks)} level-0 blocks** — a ${(plan.level0Blocks / L0.totals.blocks).toFixed(1)}× gap. A column export only writes blocks that hold values, so the difference (~${n(plan.level0Blocks - L0.totals.blocks)} blocks) is likely **#Missing-only blocks** left behind by CLEARDATA/copies.`);
  P(`@@IDEA@@ Suggested change: \`CLEARBLOCK EMPTY\` / explicit restructure (after a snapshot) — potentially a large, low-risk size win. Validate the count in test first.\n`);
}
if (L0.totals.zeroCells != null) {
  const zc = L0.totals.zeroCells, dcells = L0.totals.dataCells;
  P(`### Zero-valued cells — stored as if they were data\n`);
  P(`@@WARN@@ The export was also scanned cell by cell: **${n(zc)} of the ${n(dcells)} loaded cells (${(100 * zc / dcells).toFixed(1)}%) hold a literal 0** instead of #Missing. Essbase stores, aggregates and currency-converts a 0 exactly like real data — these cells keep blocks alive and add calc work while carrying no information. Typical sources: data loads that send 0 instead of skipping the cell, and calcs/copies that write 0.`);
  P(`@@IDEA@@ Suggested change — a small **clear-zeros custom calc** run after the data loads, followed by \`CLEARBLOCK EMPTY\` so blocks that become fully empty are removed (illustrative — member lists to validate in test):\n`);
  P('```');
  P(`/* Clear-zeros — turn stored 0s back into #Missing (illustrative) */`);
  P(`SET UPDATECALC OFF;`);
  P(`FIX (@LEVMBRS("Account", 0), <active Scenario/Version/Years only>,`);
  P(`     @LEVMBRS("Department", 0), @LEVMBRS("Location", 0), ...)`);
  P(`  "TP1" (IF ("TP1" == 0) "TP1" = #Missing; ENDIF;)`);
  P(`  /* …repeat for TP2..TP12 and BegBalance… */`);
  P(`ENDFIX`);
  P(``);
  P(`CLEARBLOCK EMPTY;   /* drop blocks that are now all #Missing */`);
  P('```');
  P(`_Scoped to the active scenarios this is low-risk; if any report intentionally distinguishes 0 from #Missing (rare), exclude those accounts._\n`);
}

P(`## 1.5 Historical years & archival\n`);
P(`- @@OK@@ The cube carries **${yrs.length} fiscal years** (${yrs[0][0]}–${yrs[yrs.length - 1][0]}). **${pc((L0.blocksByYears.FY25 || 0) + (L0.blocksByYears.FY26 || 0))}** sits in FY25–FY26; the working window used for cleanup decisions is FY24+ (Section 1.2).`);
P(`- @@WARN@@ **FY20–FY23 actuals = ${pc(oldShare)}** of input blocks (${n(oldShare)} blocks). Small in block terms, but they sit in the BSO plan cube unnecessarily.`);
P(`- @@IDEA@@ Keep ~2–3 years of actuals live for YoY; **archive FY20–FY22 to the ASO reporting cube (Rpt)** — it already exists (13 MB ASO) and is built for historical query. Then clear those years from the BSO Plan cube.`);
P(`- @@IDEA@@ Note: the **scenario** cleanup (Section 1.2) is a far bigger lever than the year archival — do both, scenarios first.\n`);

P(`## 1.6 Estimated space impact — what the cleanup frees\n`);
P(`_How to read this: the percentages in 1.1–1.5 are measured on **input (level-0) blocks** — the cells users actually typed or loaded. But every input block also carries stored summary (upper-level) blocks created by aggregation. When an input block is deleted, its summaries disappear with it._\n`);
P(`- @@OK@@ **Measured (exact):** stale scenarios + old years = **${n(delBlocks + oldShare)} input blocks = ${clearPctInput.toFixed(1)}% of input data**.`);
if (pageGB) {
  P(`- @@IDEA@@ **Estimated (proportional):** if those scenarios are aggregated like the rest of the cube, clearing them also removes ≈${clearPctInput.toFixed(0)}% of the stored summary blocks — roughly **${estGB.toFixed(0)} GB of the ${pageGB.toFixed(0)} GB Plan page file**. _This is an estimate: per-scenario aggregation varies (a test copy may never have been aggregated); validate in a test environment._`);
  P(`- @@IDEA@@ On top of that, the **empty-block cleanup (1.4)** and not re-aggregating stale data (Part 2) compound the savings.\n`);
}

// ════════════════ PART 2 — CALCULATION SPEED ════════════════════════
if (AR) {
  P(`## Part 2 — Calculation speed: what runs slow and why\n`);
  P(`_In plain terms: this part shows which calculations take the longest, compares the scripts against Oracle's best practices, and explains — for the three slowest — how each works today and what would make it faster._\n`);

  P(`## 2.1 Slowest calculations (Activity Report)\n`);
  P(`- @@X@@ **Longest single run:** **${AR.slowestBusinessRules[0].rule}** = **${mmss(AR.runtimeMetrics.longestCalcExecutionSec)} min** (${(AR.runtimeMetrics.longestCalcExecutionSec / 3600).toFixed(1)} h). This one currency-conversion calc dominates the whole day's calc time.`);
  P(`\n**Top calc scripts by average duration:**\n`);
  P(`| Calc script | Cube | Execs | Avg | Max |`);
  P(`|---|---|--:|--:|--:|`);
  AR.calcScriptsByAvgDuration.slice(0, 9).forEach(c => P(`| ${c.script} | ${c.cube} | ${c.execs} | ${mmss(c.avgSec)} | ${mmss(c.maxSec)} |`));
  P(``);
  P(`Script-level findings and suggested rewrites for the top 3 are in **Section 2.3**.
`);
  P(`_Runtime metrics: Essbase requests ${AR.runtimeMetrics.essbaseRequestsDurationMin} min/period · avg calc ${AR.runtimeMetrics.avgCalcExecutionSec}s · avg restructure ${AR.runtimeMetrics.avgRestructureSec}s · max ${AR.runtimeMetrics.maxCalcThreads} calc threads._\n`);

  // ── 2.2 best-practice audit (rules from the LCM) ──
  const rules = (kb.rules || []).filter(r => r.body);
  const has = (re) => rules.filter(r => re.test(r.body.toUpperCase()));
  const parallel = has(/CALCPARALLEL|FIXPARALLEL/).length;
  const noPar = rules.length - parallel;
  const createblk = has(/CREATENONMISSINGBLK|CREATEBLOCKONEQ/).length;
  const aggmissg = has(/AGGMISSG/).length;
  const slowNames = AR.calcScriptsByAvgDuration.map(c => c.script);
  const slowNoPar = rules.filter(r => slowNames.includes(r.name) && !/CALCPARALLEL|FIXPARALLEL/.test(r.body.toUpperCase())).map(r => r.name);
  P(`## 2.2 Calc best-practice audit (Oracle EPM Cloud)\n`);
  P(`This is an **EPM Cloud Hybrid BSO** application (Essbase ${AR.app.essbase}). All BSO calc best practices apply, plus Hybrid considerations. Of **${rules.length}** business rules with scripts: **${parallel} use parallel calc** (CALCPARALLEL/FIXPARALLEL), **${noPar} do not**; ${createblk} use CREATENONMISSINGBLK/CREATEBLOCKONEQ; ${aggmissg} set AGGMISSG.\n`);
  P(`| Best practice (Oracle EPM) | Tenant status | Action |`);
  P(`|---|---|---|`);
  P(`| Parallelize heavy aggregations/copies (CALCPARALLEL = cores−1, FIXPARALLEL for AGG/DATACOPY) | ${slowNoPar.length ? '@@X@@ Slowest rules without parallel: **' + slowNoPar.join(', ') + '**' : '@@OK@@ slow rules parallelized'} | @@IDEA@@ Add \`SET CALCPARALLEL ${AR.runtimeMetrics.maxCalcThreads - 1};\` / FIXPARALLEL to **CConv_Plan** first (${mmss(AR.runtimeMetrics.longestCalcExecutionSec)} min, no parallel today) |`);
  P(`| Tight FIX scope; avoid converting/aggregating more than needed | @@X@@ CConv_Plan FIXes the full Forecast scenario | @@IDEA@@ Scope to active years + run incrementally (last closed month forward) |`);
  P(`| Use CREATENONMISSINGBLK/CREATEBLOCKONEQ **sparingly, inside a tight FIX** | @@WARN@@ ${createblk} rules use it | @@IDEA@@ Audit those ${createblk} rules — over-creation materializes empty blocks and inflates size |`);
  P(`| SET AGGMISSG matches version design (OFF for target/top-down, ON for bottom-up level-0) | @@WARN@@ ${aggmissg} rules set it | @@IDEA@@ Verify each matches its version type to avoid wrong #Missing aggregation |`);
  P(`| Order sparse aggregation **fewest→most blocks**; fix outline hourglass order | @@X@@ ${AR.hourglass.sparseDeviations} hourglass deviations on sparse | @@IDEA@@ Re-order aggregating sparse dims **smallest→largest** stored members (concrete order in Section 3.5); non-aggregating sparse last |`);
  P(`| Minimize dynamic-calc dependencies inside calcs; resolve outline warnings | @@WARN@@ dynamic-calc L0 members without formula flagged | @@IDEA@@ Clean the outline warnings (Section 3.3) |`);
  P(`| Periodic **explicit restructure** to drop #Missing blocks & defrag | @@WARN@@ implicit refreshes ~${mmss(AR.restructures[0].durationSec)} min | @@IDEA@@ Schedule a periodic full restructure, especially after cleanup |`);
  P(`| Set CALCPARALLEL ≤ available threads (${AR.runtimeMetrics.maxCalcThreads} max) | — | @@IDEA@@ Use ${AR.runtimeMetrics.maxCalcThreads - 1} on heavy rules; never assume higher = faster — test |`);
  P(``);

  // ── 2.3 deep dives, top 3 ──
  const threads = AR.runtimeMetrics.maxCalcThreads - 1;
  function analyzeRule(body) {
    const B = body.toUpperCase(); const f = [];
    const hasPar = /CALCPARALLEL|FIXPARALLEL/.test(B);
    if (!hasPar) f.push(['Parallelism', 'runs **single-threaded** — one CPU for the whole script.', `add \`SET CALCPARALLEL ${threads};\` (or wrap the heavy FIX/aggregation in FIXPARALLEL) to use all ${AR.runtimeMetrics.maxCalcThreads} threads.`]);
    if (/@CALCMODE\(BOTTOMUP\)\s*;\s*@CALCMODE\(BLOCK\)/.test(B)) f.push(['Calc mode', 'sets `@CALCMODE(BOTTOMUP)` then `@CALCMODE(BLOCK)` — BLOCK **cancels** bottom-up and calculates every potential cell.', 'keep **BOTTOMUP** only — skips millions of empty cells on existing-data calcs.']);
    const yr = (B.match(/&\w*YR\w*/g) || []).length;
    if (yr >= 4) f.push(['Scope', `references **${yr} year variables** (full history + forecast) every run.`, 'build an **incremental** version (changed periods / last-closed-month forward) for routine runs; keep the full version for resets.']);
    const idesc = (B.match(/@IDESCENDANTS/g) || []).length;
    if (idesc >= 3) f.push(['Aggregation', `aggregates ${idesc} sparse dimensions **sequentially** (\`@IDESCENDANTS\`).`, 'order them **fewest-blocks-first** and use a single `AGG(...)` or FIXPARALLEL.']);
    if (/DATACOPY/.test(B) && !hasPar) f.push(['Data copy', 'does a broad `DATACOPY`/`CLEARDATA` single-threaded.', 'tighten the source/target FIX and run it under FIXPARALLEL.']);
    if (/CREATENONMISSINGBLK\s+ON/.test(B)) f.push(['Block creation', 'uses `SET CREATENONMISSINGBLK ON`.', 'keep its FIX narrow so it does not materialize empty blocks.']);
    if (!f.length) f.push(['Already tuned', 'uses parallel calc and scoped FIX — well built.', 'main lever is run **frequency/scope**, not the script.']);
    return f;
  }
  const top3 = [];
  for (const c of AR.calcScriptsByAvgDuration) { if (!top3.find(x => x.script === c.script)) top3.push(c); if (top3.length === 3) break; }
  P(`## 2.3 Deep dive — are the top 3 slowest calcs well-built?\n`);
  P(`For each, the actual LCM script reviewed: **how it works today vs. how it could be faster** (@@IDEA@@ = suggested change, to validate in test).\n`);
  top3.forEach((c, idx) => {
    const r = rules.find(x => x.name === c.script);
    P(`### ${idx + 1}. ${c.script} — avg ${mmss(c.avgSec)}, max ${mmss(c.maxSec)}, ${c.execs} run${c.execs > 1 ? 's' : ''}/day (Activity Report window)`);
    if (!r) { P(`_Script not in the LCM export._\n`); return; }
    if (r.aiSummary && r.aiSummary.whatItDoes) P(`_${r.aiSummary.whatItDoes}_\n`);
    P(`| Area | Today | @@IDEA@@ Suggested change |`);
    P(`|---|---|---|`);
    analyzeRule(r.body).forEach(x => P(`| **${x[0]}** | ${x[1]} | ${x[2]} |`));
    // For the #1 hotspot, show the actual script shape vs the suggested rewrite.
    if (idx === 0 && /@CALCMODE\(BOTTOMUP\);\s*@CALCMODE\(BLOCK\)/i.test(r.body) && /@IDESCENDANTS/i.test(r.body)) {
      P(`\n**Example — how the script looks today vs. the suggested shape.** The left block is extracted from the actual LCM script; the right is illustrative and must be validated in test:\n`);
      P('```');
      P(`/* TODAY — extracts from the actual ${c.script} script */`);
      P(`FIX ({CConv_Scenario}, &CurrentVersion)`);
      P(`  FIX (@LEVMBRS("Account",0), @LEVMBRS("Period",0), ...all 9 dims at level 0)`);
      P(`    "USD_Reporting" (`);
      P(`      IF (@ISMBR(&BSOldestYr:&PriorYr) OR ...)      <- year filter sits INSIDE`);
      P(`        @CALCMODE(BOTTOMUP); @CALCMODE(BLOCK);         the member block: every`);
      P(`        ...conversion logic...                          year's blocks still get`);
      P(`    )                                                   visited; BLOCK cancels`);
      P(`  ENDFIX                                                BOTTOMUP`);
      P(`  /* Aggregation — 7 sparse dims, sequential */`);
      P(`  FIX (&BSOldestYr:&PriorYr, &LastClosedYr, &FcstYr1, &FcstYr2, ...)`);
      P(`    @IDESCENDANTS("Subsidiary"); @IDESCENDANTS("Department");`);
      P(`    @IDESCENDANTS("Class");      @IDESCENDANTS("Location");`);
      P(`    @IDESCENDANTS("Relationship"); @IDESCENDANTS("Tracker"); @IDESCENDANTS("Item");`);
      P(`  ENDFIX`);
      P(`ENDFIX`);
      P(`/* note: no SET CALCPARALLEL anywhere — the whole 3.9h run uses ONE thread */`);
      P('```');
      P('```');
      P(`/* SUGGESTED shape (illustrative — validate in test) */`);
      P(`SET CALCPARALLEL ${threads};                        <- use the ${AR.runtimeMetrics.maxCalcThreads} available threads`);
      P(`FIX ({CConv_Scenario}, &CurrentVersion,`);
      P(`     &LastClosedYr, &FcstYr1, &FcstYr2)              <- years in the FIX, not in IFs:`);
      P(`  FIX (@LEVMBRS("Account",0), @LEVMBRS("Period",0), ...) blocks outside the active`);
      P(`    "USD_Reporting" (                                    window are never touched`);
      P(`      @CALCMODE(BOTTOMUP);                          <- drop @CALCMODE(BLOCK)`);
      P(`      ...same conversion logic...`);
      P(`    )`);
      P(`  ENDFIX`);
      P(`  /* Aggregation — one parallel pass, smallest dimension first */`);
      P(`  FIX ("USD_Reporting", @RELATIVE("Input Currencies",0))`);
      P(`    AGG ("Class","Location","Item","Relationship","Subsidiary","Tracker","Department");`);
      P(`  ENDFIX`);
      P(`ENDFIX`);
      P(`/* keep the full-history version (&BSOldestYr:&PriorYr) as a separate`);
      P(`   on-demand rule for restatements — not in the routine run */`);
      P('```');
    }
    if (c.avgSec > 1800) P(`\n@@IDEA@@ **Suggested change — run it at night.** At ${mmss(c.avgSec)} min it was launched **interactively** (blocking a user session for hours). Schedule the full run via **Application → Jobs → Schedule Jobs** (rule type, daily, e.g. 02:00 after the data loads) or an **EPM Automate** \`runBusinessRule\` step in the nightly pipeline — and give users a light incremental version for intraday.\n`);
    else if (c.execs >= 4) P(`\n@@IDEA@@ **Suggested change — reduce frequency.** It runs **${c.execs}×/day** (~${mmss(c.avgSec * c.execs)} total). Confirm each run is needed, or trigger it only when its source data actually changes.\n`);
    else P(``);
  });

  if (AR.blocksCreatedByCalc) {
    P(`## 2.4 Where the cube grows — blocks created\n`);
    P(`Which calcs CREATE the most blocks (this is what inflates the ${pageGB.toFixed(0)} GB page file):\n`);
    P(`| Calc script | Blocks created | FIX scope |`);
    P(`|---|--:|---|`);
    AR.blocksCreatedByCalc.forEach(b => P(`| ${b.script} | ${n(b.blocks)} | \`${b.fix}\` |`));
    P(`\n- **BS_Fcst_Calc_New** creates the most (${n(AR.blocksCreatedByCalc[0].blocks)}) via a broad FIXPARALLEL across all currencies — @@IDEA@@ a prime candidate to scope tighter and/or dynamic-calc the targets.`);
    P(`- @@WARN@@ Several consolidations create blocks for **non-GAAP** across multiple years — confirm those upper levels need to be stored vs computed on the fly (Hybrid).\n`);
  }
}

// ════════════════ PART 3 — CUBE DESIGN & DATA FLOW ══════════════════
P(`## Part 3 — Cube design & data flow (reference)\n`);
P(`_In plain terms: this part checks whether the cube's structure (which dimensions are dense vs sparse, what is stored vs computed) is well designed — verdict: it is — and documents how data flows in from NetSuite._\n`);

P(`## 3.1 Dimension profile (from LCM — all cubes combined)\n`);
P(`_Note: the LCM lists members across ALL cubes. Employee belongs to the Workforc cube, Index to Details; Account is **dense** in Plan. Per-cube block analysis is in Sections 3.2–3.5._\n`);
P(`| Dimension | Members | Dynamic-calc | Stored | Missing alias |`);
P(`|---|--:|--:|--:|--:|`);
dims.slice(0, 10).forEach(d => P(`| ${d.name} | ${n(d.count)} | ${n(d.dyn)} | ${n(d.store)} | ${n(d.noAlias)} |`));
P(``);
if (AR && AR.planDimensions) {
  const drivers = AR.planDimensions.filter(d => d.storage === 'Sparse').sort((a, b) => b.stored - a.stored).slice(0, 4)
    .map(d => `${d.name} (${n(d.stored)} stored)`);
  P(`- @@OK@@ **Plan cube's sparse block drivers:** ${drivers.join(', ')} — the product of stored sparse members bounds Plan's block count. (Employee drives Workforc; Index drives Details.)`);
}
const aliasGap = dims.filter(d => d.noAlias > 50).sort((a, b) => b.noAlias - a.noAlias);
if (aliasGap.length) P(`- @@WARN@@ **Alias gaps:** ${aliasGap.map(d => d.name + ' (' + n(d.noAlias) + ')').join(', ')} — these members display raw names in reports (quick win to fix).`);
P(``);

// dense / sparse detection from the export structure
function detectDense() {
  const dd = kb.dimensions || {};
  const matchDim = (samples) => {
    let best = null, hits = 0;
    for (const name of Object.keys(dd)) {
      const set = new Set((dd[name] || []).map(m => (m.name || '').toLowerCase()));
      const h = samples.filter(s => set.has(String(s).toLowerCase())).length;
      if (h > hits) { hits = h; best = name; }
    }
    return hits >= 2 ? best : null;
  };
  return { colDim: matchDim(L0.denseColumns || []), rowDim: matchDim(L0.denseRowSample || []) };
}
const dense = detectDense();
const realDensity = plan ? plan.blockDensityPct : L0.totals.densityPct;
const verdict = realDensity >= 20
  ? `**Healthy (${realDensity}%).** The dense/sparse split is fine — the size problem is block COUNT/aggregations, not block design.`
  : `**Low (${realDensity}% on Plan) — but expected** for a fully-aggregated BSO with ${plan ? plan.upperPct : 99}% upper-level blocks. This does **not** mean flip a dimension. The savings path: clear stale scenarios first (Part 1), scope the AGG rules (Part 2), and only then optionally tune selected upper sparse members to dynamic calc (Section 3.5).`;

P(`## 3.2 Block design — dense vs sparse\n`);
if (dense.rowDim || dense.colDim) {
  P(`- @@OK@@ **Dense dimensions** (define the block): ${[dense.rowDim, dense.colDim].filter(Boolean).join(' × ')}` +
    (plan ? ` → block = ${n(plan.blockSizeCells)} cells / ${plan.blockSizeKB} KB.` : ''));
  P(`- @@OK@@ **Sparse dimensions** (create the blocks): ${L0.sparseDimCount} dimensions (Subsidiary, Department, Scenario, Years, Version, Currency, …).`);
}
P(`- ${realDensity >= 20 ? '@@OK@@' : '@@WARN@@'} **Block density:** ${verdict}\n`);

if (AR) {
  P(`## 3.3 Real Essbase cube statistics (Activity Report)\n`);
  P(`| Cube | Total blocks | Level-0 | Upper-level | Density | Block size | Page file |`);
  P(`|---|--:|--:|--:|--:|--:|--:|`);
  AR.cubes.forEach(c => P(`| ${c.name} | ${n(c.totalBlocks)} | ${n(c.level0Blocks)} | ${n(c.upperLevelBlocks)} (${c.upperPct}%) | ${c.blockDensityPct}% | ${c.blockSizeKB} KB | ${n(c.pageFileMB)} MB |`));
  P(``);
  P(`- @@OK@@ **Reading the upper-level share correctly:** ~99% upper-level blocks is **normal** for a fully-aggregated BSO — that alone is not a finding. The meaningful number is the **aggregation multiplier: ${n(plan.totalBlocks)} total ÷ ${n(plan.level0Blocks)} level-0 ≈ ${mult.toFixed(0)}× stored aggregate blocks per input block**, and the fact that this multiplier applies to **all ${Object.keys(L0.blocksByScenario).length} scenarios and 12 years — including the stale ones nobody queries**.`);
  P(`- @@IDEA@@ **Where the page-file savings actually come from:** (1) **clear the stale scenarios/years** (Section 1.2) — their stored aggregations go with them (up to the ~${mult.toFixed(0)}× average; per-scenario aggregation varies, confirm in test); (2) **scope the AGG rules** so routine aggregations only touch active scenarios/years; (3) optionally, with **Hybrid enabled**, convert selected rarely-queried upper-level sparse members to dynamic calc (Section 3.5) — in waves with testing, NOT a blanket flip.`);
  if (AR.outlineWarnings && AR.outlineWarnings.length) P(`- @@X@@ **Outline warnings to clean:** ${AR.outlineWarnings.join('; ')}.`);
  P(``);
}

if (AR && AR.planDimensions) {
  P(`## 3.4 Dimension design — change or keep? (Plan cube)\n`);
  P(`_Counts in this table come from the **Activity Report outline** (Plan cube only); Section 3.1's table counts come from the LCM across all cubes — small differences between the two sources are expected._\n`);
  P(`| # | Dimension | Current | Stored / declared | Recommendation |`);
  P(`|--:|---|---|--:|---|`);
  for (const d of AR.planDimensions) {
    let rec;
    if (d.storage === 'Dense') {
      rec = d.name === 'Period'
        ? '@@OK@@ **Keep dense.** 17 of 37 members stored (BegBalance, TP1–TP12, key aggregates); rest dynamic — correct.'
        : `@@OK@@ **Keep dense, as-is.** Stored upper accounts enlarge the BLOCK, not the block count — and Hybrid guidance says dense L1+ should NOT be dynamic. Leave dense alone; the lever is sparse (Section 3.5).`;
    } else if (d.name === 'Scenario') rec = '@@IDEA@@ **Keep sparse — but CLEAN.** 60 stored scenarios is the bloat source (Section 1.2), not a design issue.';
    else if (d.declared >= 400) rec = `@@OK@@ **Keep sparse.** Correctly sparse — it creates blocks. ${d.declared - d.stored} of ${d.declared} are non-stored (shared/dynamic).`;
    else if (d.declared <= 25) rec = '@@OK@@ **Keep sparse.** Small — could be dense, but moving it would enlarge the block for little gain. Leave as-is.';
    else rec = '@@OK@@ **Keep sparse.** Appropriately sized; no change.';
    P(`| ${d.order} | ${d.name} | ${d.storage} | ${n(d.stored)} / ${n(d.declared)} | ${rec} |`);
  }
  P(`\n**Bottom line: no dimension should be flipped dense↔sparse.** The design is sound; the gains come from (a) **clearing stale scenarios** (Section 1.2), (b) **dynamic calc on the named sparse upper-level members in Section 3.5**, and (c) **outline order** (below).\n`);

  // ── 3.5 dynamic-calc candidates, tiered by parent-child risk ──────
  // Source: tools/analyze-dynamic-candidates.js → dynamic-candidates.json
  // (the LCM parent-child data — direct children per stored parent).
  const DCp = path.join(dir, 'dynamic-candidates.json');
  const DC = fs.existsSync(DCp) ? JSON.parse(fs.readFileSync(DCp, 'utf8')) : null;
  P(`## 3.5 Dynamic-calc candidates — tiered by conversion risk\n`);
  if (DC) {
    P(`Using the LCM's **parent-child data**, every **stored parent** in the Plan cube's sparse dimensions was tiered by how cheap it is to compute at query time (Hybrid):\n`);
    P(`- @@OK@@ **SAFE** — ≤3 direct children, no formula: query-time cost is negligible. **Convert these first.**`);
    P(`- @@WARN@@ **MODERATE** — 4–10 children: fine in Hybrid; verify the hot reports that use them.`);
    P(`- @@X@@ **REVIEW** — >10 children or has a member formula: wide aggregation — test before converting; heavily-queried ones should stay stored.\n`);
    P(`| Dimension | Stored parents | @@OK@@ SAFE | @@WARN@@ MODERATE | @@X@@ REVIEW | Example SAFE members (children) |`);
    P(`|---|--:|--:|--:|--:|---|`);
    for (const r of DC.results) {
      const ex = r.tiers.SAFE.slice(0, 3).map(e => `${e.name} (${e.children})`).join(', ') || '—';
      P(`| ${r.dim} | ${r.totalStoredParents} | ${r.tiers.SAFE.length} | ${r.tiers.MODERATE.length} | ${r.tiers.REVIEW.length} | ${ex} |`);
    }
    P(`\n**${DC.totals.SAFE} SAFE parents** can be converted with negligible risk (full member list with children counts in \`dynamic-calc-candidates.csv\`). Suggested wave plan: (1) all SAFE, (2) MODERATE in batches of ~10 with report-speed checks, (3) REVIEW only after confirming query usage. Department alone holds ${DC.results.find(r => r.dim === 'Department') ? DC.results.find(r => r.dim === 'Department').totalStoredParents : 0} of the stored parents — the hierarchy where this matters most.`);
    P(`\n_Correction note: an earlier level-based count suggested ~529 candidates; the parent-child analysis shows the true population is **${DC.totals.SAFE + DC.totals.MODERATE + DC.totals.REVIEW} stored parents** — the rest are alternate-hierarchy/shared structures that are not conversion targets._\n`);
  } else {
    P(`_Run \`node tools/analyze-dynamic-candidates.js ${CLIENT}\` (needs the LCM dimension CSVs) to generate the tiered candidate list._\n`);
  }
  // ── outline order: current (from the Activity Report outline) vs suggested ──
  const denseDims = AR.planDimensions.filter(d => d.storage === 'Dense').sort((a, b) => a.order - b.order);
  const sparseToday = AR.planDimensions.filter(d => d.storage === 'Sparse').sort((a, b) => a.order - b.order);
  const aggSparse = sparseToday.filter(d => !/Scenario|Version|Years|Currency/.test(d.name)).sort((a, b) => a.stored - b.stored);
  const nonAgg = ['Version', 'Scenario', 'Currency', 'Years'];
  P(`### Outline order — today vs suggested\n`);
  P(`@@WARN@@ The Activity Report flags **${AR.hourglass.sparseDeviations} hourglass deviations** on the sparse dimensions. Best practice: dense first, then aggregating sparse from **smallest to largest stored members**, then non-aggregating sparse (Version/Scenario/Currency/Years) last. Counts = stored members per dimension; @@X@@ marks a dimension out of place today:\n`);
  const misplacedSet = new Set(sparseToday.filter((d, i) => i < sparseToday.length - 1 && !/Scenario|Version|Years|Currency/.test(d.name) && sparseToday.slice(i + 1).some(e => !/Scenario|Version|Years|Currency/.test(e.name) && e.stored < d.stored)).map(d => d.name));
  const todayList = [...denseDims.map(d => `${d.name} — dense`), ...sparseToday.map(d => `${misplacedSet.has(d.name) ? '@@X@@ ' : ''}${d.name} (${n(d.stored)})`)];
  const suggList = [...denseDims.map(d => `${d.name} — dense`), ...aggSparse.map(d => `${d.name} (${n(d.stored)})`), ...nonAgg.map(d => `${d} — non-aggregating`)];
  P(`| # | Today (current outline) | Suggested order |`);
  P(`|--:|---|---|`);
  for (let k = 0; k < Math.max(todayList.length, suggList.length); k++) P(`| ${k + 1} | ${todayList[k] || ''} | ${suggList[k] || ''} |`);
  P(``);
  const misplaced = sparseToday.filter(d => misplacedSet.has(d.name)).map(d => `${d.name} (${n(d.stored)})`);
  if (misplaced.length) P(`@@IDEA@@ Out of place today: **${misplaced.join(', ')}** — each sits before a smaller aggregating dimension. Re-ordering is metadata-only (no data change) but forces a full restructure: schedule it with the cleanup restructure in Section 1.4 so it costs nothing extra.\n`);
}

// 3.6 data refresh
const sv = kb.substitutionVariables || [];
const v = (nm) => { const x = sv.find(s => (s.name || '').toLowerCase() === nm.toLowerCase()); return x ? String(x.value).replace(/^"|"$/g, '') : '?'; };
P(`## 3.6 Data refresh from NetSuite (load window)\n`);
P(`- @@OK@@ **Actuals are loaded for closed months only.** Per the substitution variables, the last closed month is **${v('LastClosedMonth')}** and forecast starts at **${v('FcstStartMonth')}** (current month ${v('CurrentMonth')}, year ${v('CurrentYr')}).`);
P(`- @@OK@@ The daily NetSuite sync (\`ADMIN - Daily Sync AGG\`) FIXes on **FY26, TP1:TP5, Actual** — i.e. it refreshes actuals for the closed periods of the current year, then aggregates.`);
P(`- @@WARN@@ So **TP1–${v('LastClosedMonth')} = NetSuite actuals; ${v('FcstStartMonth')}+ = forecast/plan input.** Confirm with the client that no closed-period forecast data lingers past the load window (a common source of stale blocks).\n`);

// ── 3.7 AI / IPM Insights footprint ──────────────────────────────────
// Source: this client's kb.ipm (populated by parse-lcm). For a composite
// capability sample, IPM_FROM=<client> pulls another client's ipm.json sidecar
// (e.g. IPM_FROM=demo) so a full report can showcase the IPM section even when
// the cube-data client itself has no IPM configured.
let ipmData = kb.ipm;
if ((!ipmData || !ipmData.present) && process.env.IPM_FROM) {
  const sp = path.join(ROOT, 'clients', process.env.IPM_FROM, 'ipm.json');
  if (fs.existsSync(sp)) ipmData = JSON.parse(fs.readFileSync(sp, 'utf8'));
}
if (ipmData && ipmData.present) {
  const { renderIpmSection } = require('./detect-ipm');
  P(renderIpmSection(ipmData, CLIENT[0].toUpperCase() + CLIENT.slice(1), '## 3.7 AI / IPM Insights footprint'));
}

// ════════════════ PART 4 — SUGGESTED CHANGES & NEXT STEPS ═══════════
P(`## Part 4 — Suggested changes & next steps\n`);

P(`## 4.1 Suggested changes (prioritized)\n`);
P(`_@@IDEA@@ marks each **suggested change**. Everything below is a proposal to review with the ${CLIENT[0].toUpperCase() + CLIENT.slice(1)} team and validate in a test environment before applying — nothing has been implemented._\n`);
P(`1. @@IDEA@@ **Fix the runaway CConv_Plan calc (${AR ? mmss(AR.runtimeMetrics.longestCalcExecutionSec) + ' min' : ''})** — it runs **single-threaded today**. Add \`SET CALCPARALLEL ${AR ? AR.runtimeMetrics.maxCalcThreads - 1 : 11};\` (or FIXPARALLEL), scope the FIX to active years and run incrementally. Biggest single calc-time win. (Sections 2.1–2.3.)`);
P(`2. @@IDEA@@ **Clear/archive the ${del.length} stale scenarios** (${pc(delBlocks)} of input blocks) + FY20–FY23 — their stored aggregations go with them (estimated impact in Section 1.6). Then **scope the AGG rules to active scenarios/years** so the bloat doesn't regrow. **Take an LCM snapshot first.**`);
P(`3. @@IDEA@@ **Remove empty blocks and stored zeros** (Section 1.4) — clear-zeros custom calc + \`CLEARBLOCK EMPTY\` / explicit restructure after a snapshot; low-risk size win to validate in test.`);
P(`4. @@IDEA@@ **Convert thin stored parents to dynamic calc (optional, after #2)** — start with the **29 SAFE parents (≤3 children) named in Section 3.5** (mostly Department/Subsidiary), then MODERATE in batches of ~10 with report-speed checks. Skip REVIEW members used heavily in reports.`);
P(`5. @@IDEA@@ **Resolve outline warnings** (Section 3.3) and **fix alias gaps** (${aliasGap.map(d => d.name).join(', ') || 'n/a'}).`);
P(`6. @@IDEA@@ **Re-run the Activity Report + this analysis after cleanup** to confirm the block-count, page-file and calc-time drops.\n`);

P(`## 4.2 Further analysis available (optional next steps)\n`);
P(`Beyond this report, with the same data (or a short follow-up pull) BPC can also deliver:`);
P(`- @@IDEA@@ **Density by scenario** — find near-empty scenarios (cheap deletes) vs dense ones.`);
P(`- @@IDEA@@ **Per-account block contribution** — which accounts drive the most cells, candidates for dynamic calc.`);
P(`- @@IDEA@@ **Cache & config** — index cache ${AR ? n(AR.planCaches.indexCacheMB) + ' MB vs ' + n(AR.planCaches.indexFileMB) + ' MB index file' : ''}; data cache ${AR ? n(AR.planCaches.dataCacheMB) + ' MB' : ''}. _Caches are Oracle-managed in EPM Cloud_ — informational only; the lever is reducing data/blocks, not manual cache tuning.`);
P(`- @@IDEA@@ **Outline order / hourglass** optimization for faster calcs (${AR && AR.hourglass ? AR.hourglass.sparseDeviations + ' sparse deviations today' : 'review'}).`);
P(`- @@IDEA@@ **Calc parallelism audit** — which slow calcs run without Calc/Fix Parallel and could.`);
P(`- @@IDEA@@ **Restructure analysis** — the ${AR ? mmss(AR.restructures[0].durationSec) : ''}-min implicit refreshes; reduce restructure frequency/cost.`);
P(`- @@IDEA@@ **User adoption & Smart View compliance** — ${AR ? AR.uiOver2SecPct + '% UI requests over 2s, ' + AR.availabilityPct + '% availability' : ''}; flag users on old Smart View versions.`);
P(`- @@IDEA@@ **Ongoing monitoring** — re-run this analysis monthly to catch scenario re-growth.\n`);

// ── 4.3 estimated implementation effort & benefits ───────────────────
P(`## 4.3 Estimated implementation effort & benefits\n`);
P(`_All figures below are **conservative estimates** for one experienced EPM consultant, assuming the standard safe path: clone production to a test environment, apply each change there, validate with the client's key users, then promote to production in a planned window. Actual effort depends on client availability for validation — these are planning numbers to size the engagement, not a quote._\n`);
P(`| # | Task | What it involves | Est. hours | Benefit |`);
P(`|--:|---|---|--:|---|`);
P(`| 1 | Test environment & baseline | Clone production to test, LCM snapshot, record baseline stats (block counts, page file, calc timings) | 2 | Safe sandbox; before/after proof for every change |`);
P(`| 2 | Clear ${del.length} stale scenarios | Confirm list with client, snapshot, clear scenario data in test, verify key forms/reports | 4 | Removes ${pc(delBlocks)} of input blocks **and their stored aggregations** — the largest single space win |`);
P(`| 3 | Archive FY20–FY22 to the Rpt (ASO) cube | Map/move historical actuals to the existing reporting cube, clear from Plan, point historical reports at Rpt | 5 | History stays queryable; BSO Plan cube stops aggregating years nobody plans on |`);
P(`| 4 | Remove empty blocks | \`CLEARBLOCK EMPTY\` + explicit restructure, validate counts | 2 | ~${n(plan ? plan.level0Blocks - L0.totals.blocks : 0)} likely #Missing-only blocks dropped; faster restructures and backups |`);
P(`| 5 | Clear-zeros calc | Build the custom calc (Section 1.4), test on the active scenarios, add to the post-load chain | 2 | ${n(L0.totals.zeroCells || 0)} zero cells stop being stored, aggregated and currency-converted |`);
P(`| 6 | Rework CConv_Plan | Parallelize, fix @CALCMODE, move years into the FIX, split incremental vs full-history version, benchmark (Section 2.3) | 6 | The 3.9 h single-threaded run becomes a scheduled, parallel, scoped calc — the biggest calc-time win |`);
P(`| 7 | Parallelize remaining slow rules | Add CALCPARALLEL/FIXPARALLEL + tighter FIX to the other top calcs (Section 2.1), benchmark each | 4 | Shorter nightly window; users stop launching multi-hour interactive calcs |`);
P(`| 8 | Dynamic-calc wave 1 | Convert the ${(() => { try { return JSON.parse(fs.readFileSync(path.join(dir, 'dynamic-candidates.json'), 'utf8')).totals.SAFE; } catch (e) { return '~29'; } })()} SAFE parents (Section 3.5), re-test the hot reports | 3 | Fewer stored upper blocks to aggregate; no report risk at this tier |`);
P(`| 9 | Outline hygiene | Re-order sparse dims (Section 3.5), resolve outline warnings, fill alias gaps — share the restructure with task 4 | 3 | Faster calcs from correct hourglass order; cleaner member display in reports |`);
P(`| 10 | Full regression validation in test | Key forms, reports, month-end sequence end-to-end with client users; sign-off | 5 | Confidence that nothing user-facing changed before touching production |`);
P(`| 11 | Production deployment | Migration window: snapshot, apply validated changes, re-run Activity Report + this analysis to confirm the drops | 3 | Measured before/after: page file, block counts, calc times |`);
P(`\n**Total: ≈ 39 hours** (roughly 5 consulting days; calendar span typically 2–3 weeks because validation windows depend on the client's close calendar). Tasks 1–5 alone (~15 h) deliver most of the **space** benefit; tasks 6–7 (~10 h) deliver most of the **calc-time** benefit — the program can be phased that way if needed.\n`);
P(`**Expected outcome if the full program is applied** (estimates to confirm against the re-run Activity Report): Plan page file from **${pageGB ? pageGB.toFixed(0) : '173'} GB to roughly ${pageGB ? Math.round(pageGB - estGB) : '120'} GB**, the slowest calc from **3.9 h to well under 1 h**, a shorter nightly batch, and faster restructures/backups across the board.\n`);

P(`---`);
P(`_Numbers are exact counts from the level-0 export (${n(L0.totals.blocks)} blocks, ${n(L0.generatedFromLines)} lines parsed) and the Activity Report. Items labeled "estimated" (Section 1.6) are proportional estimates to validate in test._`);
P(`_Best practices per Oracle EPM Cloud / Hybrid BSO guidance: Design Best Practices (F96806), "Optimize BSO Cubes", and the CALCPARALLEL/FIXPARALLEL & CREATENONMISSINGBLK references in the Essbase Calculation guide._`);

const file = path.join(ROOT, 'clients', CLIENT, 'optimization-report.md');
fs.writeFileSync(file, out.join('\n'));
console.log('✓ wrote', path.relative(ROOT, file));
console.log(`\nCandidates: ${del.length} scenarios = ${n(delBlocks)} blocks = ${pc(delBlocks)} · Keep: ${keep.length} scenarios`);
