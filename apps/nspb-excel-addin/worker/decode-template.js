"use strict";
const fs = require("fs");
const path = require("path");

const dir = process.argv[2];
const tplPath = path.join(dir, "template.txt");
const raw = fs.readFileSync(tplPath, "utf8");

// The template body is a JSON-encoded string. Parse it.
const decoded = JSON.parse(raw);

// Strip the @font-face declarations that reference UUIDs — substitute system fonts.
// All UUIDs in src: url("...") are font blobs we don't ship.
const cleaned = decoded
  // Remove the entire @font-face block range — they're long but each block is self-contained.
  .replace(/@font-face\s*\{[\s\S]*?\}/g, "");

const out = path.join(dir, "decoded.html");
fs.writeFileSync(out, cleaned, "utf8");
console.log(`decoded.html written (${Math.round(cleaned.length / 1024)} KB, ${cleaned.split("\n").length} lines)`);
