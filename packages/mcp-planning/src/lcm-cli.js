#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { parseLcmInventory } from "./lcm-parser.js";

const [input, output = "tenant-kb.json"] = process.argv.slice(2);
if (!input) {
  console.error("Usage: oracle-epm-lcm <lcm-folder> [output.json]");
  process.exit(1);
}

const kb = parseLcmInventory(input);
const out = path.resolve(output);
fs.writeFileSync(out, `${JSON.stringify(kb, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ output: out, application: kb.appName, inventory: kb.sourceInventory }, null, 2));
