// dimension.mjs — generate an Oracle EPM Planning dimension import CSV.
//
// This is the format Planning's Outline Load / Import Metadata consumes and the
// same one an LCM export produces. It is the most reliable object to create
// programmatically: plain rows, no XML. Proven by loading members this way.
//
// The header line names the columns; each data row is one member. Only the
// columns you pass are emitted, so you can do a minimal add (member,parent,alias)
// or a full definition.

const DEFAULT_COLUMNS = [
  "Parent",
  "Alias: Default",
  "Data Storage",
  "Two Pass Calculation",
  "Data Type",
  "Aggregation (Plan)"
];

// members: [{ member, parent, alias?, dataStorage?, aggregation?, twoPass?, dataType?, formula?, ...extra }]
// dimensionName is the leading header cell (e.g. "Account", "Department", "Employee").
export function buildDimensionCsv(dimensionName, members, { columns = DEFAULT_COLUMNS, operation } = {}) {
  if (!dimensionName) throw new Error("dimensionName is required (e.g. 'Account')");
  if (!Array.isArray(members) || !members.length) throw new Error("members[] is required");

  const map = {
    Parent: (m) => m.parent ?? "",
    "Alias: Default": (m) => m.alias ?? "",
    "Data Storage": (m) => m.dataStorage ?? "store",
    "Two Pass Calculation": (m) => (m.twoPass ? "true" : "false"),
    "Data Type": (m) => m.dataType ?? "unspecified",
    "Aggregation (Plan)": (m) => m.aggregation ?? "+",
    Formula: (m) => m.formula ?? "",
    "Plan Type (Plan)": (m) => (m.planPlan === false ? "false" : "true"),
    Operation: () => operation ?? "" // e.g. "delete" for removals; blank = add/update
  };

  const cols = operation ? [...columns, "Operation"] : columns;
  const esc = (v) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const header = [dimensionName, ...cols].join(",");
  const lines = members.map((m) => {
    if (!m.member) throw new Error("each member needs a `member` name");
    const cells = cols.map((c) => (map[c] ? esc(map[c](m)) : esc(m[c] ?? "")));
    return [esc(m.member), ...cells].join(",");
  });
  return header + "\n" + lines.join("\n") + "\n";
}

// Convenience: read a simple {member,parent,alias,...} array from a plain CSV
// (member,parent,alias[,dataStorage,aggregation]) so a consultant can author in Excel.
export function membersFromSimpleCsv(text) {
  const rows = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const head = rows.shift().split(",").map((h) => h.trim().toLowerCase());
  const idx = (n) => head.indexOf(n);
  return rows.map((line) => {
    const c = line.split(",");
    const get = (n) => { const i = idx(n); return i >= 0 ? (c[i] ?? "").trim() : undefined; };
    return {
      member: get("member"),
      parent: get("parent"),
      alias: get("alias"),
      dataStorage: get("datastorage") || get("storage"),
      aggregation: get("aggregation") || get("agg"),
      formula: get("formula")
    };
  });
}
