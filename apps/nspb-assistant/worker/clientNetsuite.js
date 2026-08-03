/**
 * clientNetsuite.js — single source of truth for this client's metadata.
 *
 * Edited by hand, concatenated into bundle.js by build.js, deployed to
 * Cloudflare with `wrangler deploy`. No ES imports — the variables below are
 * exposed as module-scope constants in the final bundle and referenced from
 * worker.js.
 *
 * Four sections:
 *   1. Shape ........... cubes, cubeDims, cubeDimDefaults (every cube dim
 *                        must have a default so SmartView ad-hocs succeed).
 *   2. Presets ......... named ad-hoc queries. Invoked via run_preset tool —
 *                        fully deterministic, Gemini is NOT asked to infer.
 *   3. Member hints .... user-friendly term → canonical member expression.
 *                        Inlined into Gemini's system prompt so NL queries
 *                        map cleanly onto the cube.
 *   4. Glossary ........ free-form client notes. Inlined into system prompt.
 */

const CLIENT_CONFIG = {
  // ── 1. SHAPE ───────────────────────────────────────────────────────────────
  appName: "NetSuite",
  mainCube: "Plan",
  cubes: ["Plan", "Details", "Rpt", "Workforc"],

  // Dims pre-loaded by the "Discover dimensions" button. Structural dims are
  // small and cheap; Account is the largest but worth the one-time cost.
  // The catalog ships with every /api/chat so find_member is a local lookup.
  discoveryDims: ["Scenario", "Version", "Years", "Subsidiary", "Currency",
                  "Department", "Class", "Location", "ReportingSegment", "Account"],

  cubeDims: {
    Plan: ["Account", "Scenario", "Version", "Years", "Period", "Subsidiary",
           "Currency", "Department", "Class", "Location", "Relationship",
           "Tracker", "Item", "ReportingSegment"],
    Details: ["Subsidiary", "Currency", "Period", "Account", "Scenario",
              "Version", "Years", "Department", "Tracker", "Index"],
    Rpt: ["Account", "Scenario", "Version", "Years", "Period", "Subsidiary",
          "Currency", "Department", "Class", "Location"],
    Workforc: ["Subsidiary", "Currency", "Period", "Account", "Scenario",
               "Version", "Years", "Department", "Location", "Employee",
               "ReportingSegment", "EmpType"]
  },

  // Every cube dim needs a default — SmartView rejects grids with missing dims.
  // Values verified against MCP3's RevenueCrosstabFY24 known-working POV.
  cubeDimDefaults: {
    Plan: {
      Account: "Account", Scenario: "Actual", Version: "Base", Years: "FY24",
      Period: "BegBalance", Subsidiary: "SUB_2", Currency: "USD",
      Department: "TD", Class: "TC", Location: "TL", Relationship: "TR",
      Tracker: "Load", Item: "TI",
      ReportingSegment: "TRS"
    },
    Details: {
      Subsidiary: "SUB_2", Currency: "USD", Period: "BegBalance",
      Account: "Account", Scenario: "Forecast", Version: "Base",
      Years: "FY25", Department: "TD", Tracker: "MOD4", Index: "TIndex"
    },
    Rpt: {
      Account: "Account", Scenario: "Actual", Version: "Base", Years: "FY25",
      Period: "BegBalance", Subsidiary: "SUB_2", Currency: "USD",
      Department: "TD", Class: "TC", Location: "TL"
    },
    Workforc: {
      Subsidiary: "SUB_2", Currency: "USD", Period: "BegBalance",
      Account: "Account", Scenario: "Actual", Version: "Base", Years: "FY25",
      Department: "TD", Location: "TL", Employee: "TE",
      ReportingSegment: "TRS", EmpType: "TEmpType"
    }
  },

  // ── 2. PRESETS ─────────────────────────────────────────────────────────────
  // Shape matches the build_adhoc / compare_grid tool input so the preset
  // runner is a thin wrapper. Presets with kind:"compare" dispatch to
  // runCompareGrid; everything else goes through runBuildAdhoc.
  //
  // Every preset here uses VERIFIED codes (P_400000 = revenue top,
  // P_600000 = opex top, TD/TL/TC = structural totals). Presets needing
  // catalog-specific codes (PnLSummary, BalanceSheet, Headcount) are left
  // out until those codes are confirmed from the catalog.
  presets: {
    RevenueCrosstabFY24: {
      description: "Revenue leaf by Location × Relationship × Department × " +
                   "Segment × Item × Account, monthly FY24 Actual.",
      cube: "Plan",
      rows: [
        { dimension: "Location",         fn: "ILvl0Descendants", member: "TL" },
        { dimension: "Relationship",     fn: "ILvl0Descendants", member: "TR" },
        { dimension: "Department",       fn: "ILvl0Descendants", member: "TD" },
        { dimension: "ReportingSegment", fn: "ILvl0Descendants", member: "TRS" },
        { dimension: "Item",             fn: "ILvl0Descendants", member: "TI" },
        { dimension: "Account",          fn: "ILvl0Descendants", member: "P_400000" }
      ],
      columns: [{
        dimension: "Period",
        members: ["TP1","TP2","TP3","TP4","TP5","TP6","TP7","TP8","TP9",
                  "TP10","TP11","TP12","YearTotal"]
      }],
      pov: {
        Class: "TC", Subsidiary: "SUB_2", Version: "Base", Currency: "USD",
        Tracker: "Load", Scenario: "Actual", Years: "FY24"
      }
    },

    RevenueByMonth: {
      description: "Revenue (P_400000 leaves) by month, FY24 Actual.",
      cube: "Plan",
      rows: [{ dimension: "Account", fn: "ILvl0Descendants", member: "P_400000" }],
      columns: [{
        dimension: "Period",
        members: ["TP1","TP2","TP3","TP4","TP5","TP6","TP7","TP8","TP9",
                  "TP10","TP11","TP12","YearTotal"]
      }],
      pov: { Scenario: "Actual", Years: "FY24" }
    },

    RevenueByDept: {
      description: "Revenue by Department, FY24 Actual, YearTotal only.",
      cube: "Plan",
      rows: [
        { dimension: "Account", fn: "ILvl0Descendants", member: "P_400000" },
        { dimension: "Department", fn: "Children", member: "TD" }
      ],
      columns: [{ dimension: "Period", members: ["YearTotal"] }],
      pov: { Scenario: "Actual", Years: "FY24" }
    },

    OpexByMonth: {
      description: "Operating Expense (P_600000 leaves) by month, FY24 Actual.",
      cube: "Plan",
      rows: [{ dimension: "Account", fn: "ILvl0Descendants", member: "P_600000" }],
      columns: [{
        dimension: "Period",
        members: ["TP1","TP2","TP3","TP4","TP5","TP6","TP7","TP8","TP9",
                  "TP10","TP11","TP12","YearTotal"]
      }],
      pov: { Scenario: "Actual", Years: "FY24" }
    },

    OpexByDept: {
      description: "Operating Expense by Department, FY24 Actual, YearTotal only.",
      cube: "Plan",
      rows: [
        { dimension: "Account", fn: "ILvl0Descendants", member: "P_600000" },
        { dimension: "Department", fn: "Children", member: "TD" }
      ],
      columns: [{ dimension: "Period", members: ["YearTotal"] }],
      pov: { Scenario: "Actual", Years: "FY24" }
    },

    ActualVsBudgetRevenue: {
      kind: "compare",
      description: "Revenue Actual vs Budget FY24 by month with Δ and %Δ columns.",
      cube: "Plan",
      rows: [{ dimension: "Account", fn: "ILvl0Descendants", member: "P_400000" }],
      columns: [{
        dimension: "Period",
        members: ["TP1","TP2","TP3","TP4","TP5","TP6","TP7","TP8","TP9",
                  "TP10","TP11","TP12","YearTotal"]
      }],
      basePov: { Years: "FY24" },
      compare: { dim: "Scenario", a: "Actual", b: "Budget", showPct: true }
    },

    ActualVsBudgetOpex: {
      kind: "compare",
      description: "Opex Actual vs Budget FY24 by Department (YearTotal), Δ + %Δ.",
      cube: "Plan",
      rows: [
        { dimension: "Account", fn: "ILvl0Descendants", member: "P_600000" },
        { dimension: "Department", fn: "Children", member: "TD" }
      ],
      columns: [{ dimension: "Period", members: ["YearTotal"] }],
      basePov: { Years: "FY24" },
      compare: { dim: "Scenario", a: "Actual", b: "Budget", showPct: true }
    },

    ActualVsForecastFY25: {
      kind: "compare",
      description: "Revenue + Opex Actual vs Forecast FY25 by month, Δ + %Δ.",
      cube: "Plan",
      rows: [
        { dimension: "Account", fn: "ILvl0Descendants", member: "P_400000" },
        { dimension: "Account", fn: "ILvl0Descendants", member: "P_600000" }
      ],
      columns: [{
        dimension: "Period",
        members: ["TP1","TP2","TP3","TP4","TP5","TP6","TP7","TP8","TP9",
                  "TP10","TP11","TP12","YearTotal"]
      }],
      basePov: { Years: "FY25" },
      compare: { dim: "Scenario", a: "Actual", b: "Forecast", showPct: true }
    },

    YoYRevenue: {
      kind: "compare",
      description: "Revenue FY25 vs FY24 (Actual) by month with Δ + %Δ.",
      cube: "Plan",
      rows: [{ dimension: "Account", fn: "ILvl0Descendants", member: "P_400000" }],
      columns: [{
        dimension: "Period",
        members: ["TP1","TP2","TP3","TP4","TP5","TP6","TP7","TP8","TP9",
                  "TP10","TP11","TP12","YearTotal"]
      }],
      basePov: { Scenario: "Actual" },
      compare: { dim: "Years", a: "FY25", b: "FY24", showPct: true }
    },

    YoYOpex: {
      kind: "compare",
      description: "Opex FY25 vs FY24 (Actual) by month with Δ + %Δ.",
      cube: "Plan",
      rows: [{ dimension: "Account", fn: "ILvl0Descendants", member: "P_600000" }],
      columns: [{
        dimension: "Period",
        members: ["TP1","TP2","TP3","TP4","TP5","TP6","TP7","TP8","TP9",
                  "TP10","TP11","TP12","YearTotal"]
      }],
      basePov: { Scenario: "Actual" },
      compare: { dim: "Years", a: "FY25", b: "FY24", showPct: true }
    }
    // Add presets that require specific account codes (PnLSummary, BalanceSheet,
    // Headcount, Rent by month, etc.) after resolving codes from the catalog.
  },

  // ── 3. MEMBER HINTS ────────────────────────────────────────────────────────
  // User-facing term → canonical expression. Inlined into Gemini's system
  // prompt so "revenue" maps to ILvl0Descendants(P_400000) without the user
  // having to spell it out. ONLY includes codes that have been verified.
  // For account names that aren't listed (rent, cogs, payroll, marketing, …)
  // Gemini is instructed to call find_member first.
  memberHints: [
    // Top-of-tree Account nodes (verified)
    { term: "revenue",            dim: "Account",    fn: "ILvl0Descendants", member: "P_400000" },
    { term: "sales",              dim: "Account",    fn: "ILvl0Descendants", member: "P_400000" },
    { term: "top line",           dim: "Account",    fn: "ILvl0Descendants", member: "P_400000" },
    { term: "opex",               dim: "Account",    fn: "ILvl0Descendants", member: "P_600000" },
    { term: "operating expense",  dim: "Account",    fn: "ILvl0Descendants", member: "P_600000" },
    { term: "expenses",           dim: "Account",    fn: "ILvl0Descendants", member: "P_600000" },

    // Structural rollups (verified totals)
    { term: "all locations",      dim: "Location",   fn: "ILvl0Descendants", member: "TL" },
    { term: "all departments",    dim: "Department", fn: "ILvl0Descendants", member: "TD" },
    { term: "all classes",        dim: "Class",      fn: "ILvl0Descendants", member: "TC" },
    { term: "total department",   dim: "Department", member: "TD" },
    { term: "total location",     dim: "Location",   member: "TL" },
    { term: "total class",        dim: "Class",      member: "TC" },
    { term: "every department",   dim: "Department", fn: "Children", member: "TD" },

    // Entity
    { term: "pharmalogic",        dim: "Subsidiary", member: "SUB_2" },
    { term: "main entity",        dim: "Subsidiary", member: "SUB_2" },

    // Scenario + Version (standard Essbase naming)
    { term: "actual",             dim: "Scenario",   member: "Actual" },
    { term: "actuals",            dim: "Scenario",   member: "Actual" },
    { term: "budget",             dim: "Scenario",   member: "Budget" },
    { term: "plan",               dim: "Scenario",   member: "Budget" },
    { term: "forecast",           dim: "Scenario",   member: "Forecast" },
    { term: "fcst",               dim: "Scenario",   member: "Forecast" },

    // Years (verified from catalog: FY23, FY24, FY25 exist)
    { term: "this year",          dim: "Years",      member: "FY24" },
    { term: "current year",       dim: "Years",      member: "FY24" },
    { term: "last year",          dim: "Years",      member: "FY23" },
    { term: "prior year",         dim: "Years",      member: "FY23" },
    { term: "next year",          dim: "Years",      member: "FY25" },

    // Time windows — these are Period COLUMN members, not row seeds.
    // Gemini should drop them into columns[0].members when the user names them.
    { term: "q1",  dim: "Period", members: ["TP1","TP2","TP3"] },
    { term: "q2",  dim: "Period", members: ["TP4","TP5","TP6"] },
    { term: "q3",  dim: "Period", members: ["TP7","TP8","TP9"] },
    { term: "q4",  dim: "Period", members: ["TP10","TP11","TP12"] },
    { term: "h1",  dim: "Period", members: ["TP1","TP2","TP3","TP4","TP5","TP6"] },
    { term: "h2",  dim: "Period", members: ["TP7","TP8","TP9","TP10","TP11","TP12"] },
    { term: "full year",     dim: "Period", members: ["YearTotal"] },
    { term: "year total",    dim: "Period", members: ["YearTotal"] },
    { term: "by month",      dim: "Period", members: ["TP1","TP2","TP3","TP4","TP5","TP6",
                                                      "TP7","TP8","TP9","TP10","TP11","TP12","YearTotal"] }
  ],

  // ── 4. GLOSSARY ────────────────────────────────────────────────────────────
  // Free-form text about this client. Inlined verbatim into Gemini's system
  // prompt. Keep it tight — it's read on every /api/chat call.
  glossary: [
    "The main financial cube is **Plan**. Use it unless the user explicitly asks for",
    "workforce data (Workforc cube) or operational-detail data (Details cube).",
    "",
    "The subsidiary dimension defaults to **SUB_2** (Pharmalogic Holdings Corp), the",
    "primary operating entity. \"Consolidated\" means SUB_Total.",
    "",
    "Periods use the TPn convention: TP1=Jan, TP2=Feb, ..., TP12=Dec. YearTotal is the",
    "sum. Quarters are NOT stored members — if the user asks for Q1, send",
    "[TP1, TP2, TP3] in columns.members.",
    "",
    "Years default to **FY24** if the user doesn't specify. FY25 and FY23 are also",
    "populated. Use 'FY' + 2-digit year format.",
    "",
    "Scenario has three useful members: Actual, Forecast, Budget. Default Actual.",
    "",
    "Account member P_400000 is the top-of-tree revenue node; P_600000 is the",
    "top-of-tree opex node. Use ILvl0Descendants(X) to get every leaf below X.",
    "For more specific accounts (rent, COGS, G&A, payroll, marketing, travel, …)",
    "always call find_member first to resolve the code — DO NOT guess.",
    "",
    "### Comparisons (compare_grid)",
    "- 'A vs B', 'compare X and Y', 'variance' → compare_grid.",
    "- 'actual vs budget' / 'act vs bud' / 'BvA' → compare.dim=Scenario, a='Actual', b='Budget'.",
    "- 'forecast vs actual' / 'AvF' → compare.dim=Scenario, a='Forecast', b='Actual'.",
    "- 'this year vs last year' / 'YoY' → compare.dim=Years, a='FY25', b='FY24'.",
    "- Put the shared POV in basePov; the compare dim itself stays OUT of basePov.",
    "",
    "### Time intelligence",
    "- Q1=TP1..TP3, Q2=TP4..TP6, Q3=TP7..TP9, Q4=TP10..TP12.",
    "- H1=TP1..TP6, H2=TP7..TP12. Full year = ['YearTotal'].",
    "- 'YTD through <month>' = TP1..TP<month_index>. 'YTD' alone = all 12 months.",
    "- 'rolling 3' = last 3 TPn columns; 'rolling 12' = all 12 TPn + YearTotal.",
    "",
    "### Ranking (top_drivers)",
    "- 'top N …' / 'biggest …' / 'largest …' → top_drivers, rankDim = dim the user",
    "  mentions ('accounts' → Account, 'departments' → Department).",
    "- 'top 10 accounts by revenue' → rankDim='Account', rankSeed='P_400000'.",
    "- 'top 10 accounts by opex/expense' → rankSeed='P_600000'.",
    "- 'biggest variances' / 'top variance drivers' → pass byVariance={dim,a,b}.",
    "- topN defaults to 10. Measure defaults to the last column (typically YearTotal)."
  ].join("\n")
};
