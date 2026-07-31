#!/usr/bin/env node
// make-forms.mjs — generate an importable Planning LCM ZIP from a JSON spec.
//
//   node bin/make-forms.mjs forms.json [--out forms-lcm.zip]

import fs from "node:fs";
import path from "node:path";
import { buildFormsLcmFiles, buildFormsLcmZip } from "../lib/lcm-forms.mjs";

const [, , input, ...rest] = process.argv;
if (!input) {
  console.log("usage: node bin/make-forms.mjs <forms.json> [--out forms-lcm.zip] [--dir folder]");
  process.exit(0);
}
const flag = (name, fallback) => {
  const index = rest.indexOf(`--${name}`);
  return index >= 0 ? rest[index + 1] || fallback : fallback;
};
const out = flag("out", "forms-lcm.zip");
const directory = flag("dir");
const spec = JSON.parse(fs.readFileSync(input, "utf8"));
const zip = buildFormsLcmZip(spec);
fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
fs.writeFileSync(out, zip);

if (directory) {
  for (const [relativePath, content] of Object.entries(buildFormsLcmFiles(spec))) {
    const target = path.join(directory, ...relativePath.split("/"));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
}

console.log(`✓ ${out}  (${spec.forms.length} forms)`);
if (directory) console.log(`✓ ${directory}  (expanded review copy)`);
console.log("  upload the ZIP in Tools > Migration > Snapshots, then import the forms");
