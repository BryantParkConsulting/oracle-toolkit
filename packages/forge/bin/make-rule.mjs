#!/usr/bin/env node
// make-rule.mjs — generate an importable Calculation Manager rule LCM ZIP from a JSON spec.
//
//   node bin/make-rule.mjs <spec.json> [--out rule-lcm.zip] [--dir folder]
//                                      [--carry-over <pod snapshot .../Rules>]
//
// --carry-over reads every rule already in the target cube's Rules folder straight
// out of a downloaded snapshot and ships it alongside the new one, verbatim. Rules
// whose name the spec redefines are replaced, not duplicated. Without it, an
// import that happens to replace rather than merge would silently drop the
// client's existing rules in that cube — same risk lcm-security.mjs guards
// against, and the reason this flag exists here too.

import fs from "node:fs";
import path from "node:path";
import { buildRuleLcmFiles, buildRuleLcmZip } from "../lib/lcm-rules.mjs";

const [, , input, ...rest] = process.argv;
if (!input) {
  console.log(
    "usage: node bin/make-rule.mjs <spec.json> [--out rule-lcm.zip] [--dir folder] [--carry-over <dir>]"
  );
  process.exit(0);
}
const flag = (name, fallback) => {
  const index = rest.indexOf(`--${name}`);
  return index >= 0 ? rest[index + 1] || fallback : fallback;
};
const out = flag("out", "rule-lcm.zip");
const directory = flag("dir");
const carryOver = flag("carry-over");
const spec = JSON.parse(fs.readFileSync(input, "utf8"));
spec.rules = spec.rules ?? [];

if (carryOver) {
  const defined = new Set(spec.rules.map((rule) => rule.name));
  const existing = fs
    .readdirSync(carryOver)
    // Real exports have no file extension on a rule resource - see lcm-rules.mjs.
    .filter((file) => !fs.statSync(path.join(carryOver, file)).isDirectory())
    .map((file) => ({ name: file, file }))
    .filter((rule) => !defined.has(rule.name));
  for (const rule of existing) {
    spec.rules.unshift({
      name: rule.name,
      xml: fs.readFileSync(path.join(carryOver, rule.file), "utf8")
    });
  }
  console.log(
    `  carried over ${existing.length} existing rule(s): ${existing.map((r) => r.name).join(", ") || "none"}`
  );
}

const zip = buildRuleLcmZip(spec);
fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
fs.writeFileSync(out, zip);

if (directory) {
  for (const [relativePath, content] of Object.entries(buildRuleLcmFiles(spec))) {
    const target = path.join(directory, ...relativePath.split("/"));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
}

console.log(`✓ ${out}  (${spec.rules.length} rule(s), cube ${spec.cube})`);
if (directory) console.log(`✓ ${directory}  (expanded review copy)`);
console.log("  upload the ZIP in Tools > Migration > Snapshots, then import the rule(s)");
console.log("  reminder: export the app's current Calc Manager snapshot first — that is the rollback");
