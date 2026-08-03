"use strict";
const fs = require("fs");
const path = require("path");

const dir = process.argv[2];
const manifest = JSON.parse(fs.readFileSync(path.join(dir, "manifest.txt"), "utf8"));
const template = fs.readFileSync(path.join(dir, "template.txt"), "utf8");

// Show summary of each manifest entry
console.log("\n=== MANIFEST ENTRIES ===");
for (const [uuid, val] of Object.entries(manifest)) {
  if (typeof val === "string") {
    console.log(`${uuid}: string ${val.length} bytes — head: ${val.slice(0, 80).replace(/\s+/g, " ")}`);
  } else if (Array.isArray(val)) {
    console.log(`${uuid}: array len=${val.length}`);
  } else if (val && typeof val === "object") {
    console.log(`${uuid}: object keys=${Object.keys(val).join(",")}`);
  } else {
    console.log(`${uuid}: ${typeof val}`);
  }
}

// Find any entries that look like HTML or CSS
console.log("\n=== HTML/CSS-LIKE ENTRIES ===");
for (const [uuid, val] of Object.entries(manifest)) {
  if (typeof val === "string") {
    if (/<html|<style|<body|<div|@media|background:/i.test(val.slice(0, 500))) {
      console.log(`>>> ${uuid} looks HTML/CSS — first 200: ${val.slice(0, 200)}`);
    }
  }
}

console.log("\n=== TEMPLATE HEAD (first 1000 chars) ===");
console.log(template.slice(0, 1000));
console.log("\n=== TEMPLATE TAIL (last 500 chars) ===");
console.log(template.slice(-500));
