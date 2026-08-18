#!/usr/bin/env node
// make-security.mjs — generate an importable cell-level security LCM ZIP from a JSON spec.
//
//   node bin/make-security.mjs <spec.json> [--out security-lcm.zip] [--dir folder]
//                                         [--carry-over <pod snapshot .../Cell-Level Security Definitions>]
//
// --carry-over reads every rule XML already in the target app straight out of a
// downloaded snapshot and ships it alongside the new ones, verbatim. Rules whose
// name the spec redefines are replaced, not duplicated. Without it, an import that
// happens to replace rather than merge would silently drop the client's existing
// rules.

import fs from "node:fs";
import path from "node:path";
import { buildSecurityLcmFiles, buildSecurityLcmZip } from "../lib/lcm-security.mjs";

const [, , input, ...rest] = process.argv;
if (!input) {
  console.log(
    "usage: node bin/make-security.mjs <spec.json> [--out security-lcm.zip] [--dir folder] [--carry-over <dir>]"
  );
  process.exit(0);
}
const flag = (name, fallback) => {
  const index = rest.indexOf(`--${name}`);
  return index >= 0 ? rest[index + 1] || fallback : fallback;
};
const out = flag("out", "security-lcm.zip");
const directory = flag("dir");
const carryOver = flag("carry-over");
const spec = JSON.parse(fs.readFileSync(input, "utf8"));
spec.rules = spec.rules ?? [];

if (carryOver) {
  const defined = new Set(spec.rules.map((rule) => rule.name));
  const existing = fs
    .readdirSync(carryOver)
    .filter((file) => file.toLowerCase().endsWith(".xml"))
    .map((file) => ({ name: path.basename(file, path.extname(file)), file }))
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

const zip = buildSecurityLcmZip(spec);
fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
fs.writeFileSync(out, zip);

if (directory) {
  for (const [relativePath, content] of Object.entries(buildSecurityLcmFiles(spec))) {
    const target = path.join(directory, ...relativePath.split("/"));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
}

console.log(`✓ ${out}  (${spec.rules.length} rules)`);
if (directory) console.log(`✓ ${directory}  (expanded review copy)`);
console.log("  upload the ZIP in Tools > Migration > Snapshots, then import the rules");
console.log("  reminder: this denies only — Service Administrators are not affected");
