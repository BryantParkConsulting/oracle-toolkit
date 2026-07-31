#!/usr/bin/env node
// make-dimension.mjs — turn a simple member list into a Planning import CSV.
//
//   node bin/make-dimension.mjs <DimensionName> <input.csv> [--out file.csv] [--delete]
//
// input.csv is author-friendly (header: member,parent,alias[,storage,aggregation,formula]).
// Output is the exact Import Metadata / Outline Load format. Nothing is uploaded —
// review the file, then push it with bin/import.mjs (or the Planning UI).

import fs from "node:fs";
import path from "node:path";
import { buildDimensionCsv, membersFromSimpleCsv } from "../lib/dimension.mjs";

const [, , dim, input, ...rest] = process.argv;
if (!dim || !input) {
  console.log("usage: node bin/make-dimension.mjs <DimensionName> <input.csv> [--out file.csv] [--delete]");
  process.exit(0);
}
const flag = (n, d) => { const i = rest.indexOf("--" + n); return i >= 0 ? (rest[i + 1] || d) : d; };
const out = flag("out", `${dim}-import.csv`);
const operation = rest.includes("--delete") ? "delete" : undefined;

const members = membersFromSimpleCsv(fs.readFileSync(input, "utf8"));
const csv = buildDimensionCsv(dim, members, { operation });
fs.writeFileSync(out, csv);

console.log(`✓ ${out}  (${members.length} members${operation ? ", operation=delete" : ""})`);
console.log("  review it, then upload with:");
console.log(`    node bin/import.mjs <client> ${path.basename(out)} --dimension ${dim}`);
