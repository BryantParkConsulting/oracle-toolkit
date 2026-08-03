// Extract the embedded template + manifest from a Claude Design bundler HTML.
// Usage: node extract-bundler.js <input.html> <out-dir>
"use strict";
const fs = require("fs");
const path = require("path");

const [, , inputPath, outDir] = process.argv;
if (!inputPath || !outDir) {
  console.error("Usage: node extract-bundler.js <input.html> <out-dir>");
  process.exit(1);
}

const html = fs.readFileSync(inputPath, "utf8");
fs.mkdirSync(outDir, { recursive: true });

function pickScriptBody(html, type) {
  const re = new RegExp(`<script\\s+type="${type.replace(/[/]/g, "\\/")}"[^>]*>([\\s\\S]*?)<\\/script>`, "i");
  const m = html.match(re);
  return m ? m[1].trim() : null;
}

const manifestRaw = pickScriptBody(html, "__bundler/manifest");
const templateRaw = pickScriptBody(html, "__bundler/template");

if (manifestRaw) {
  fs.writeFileSync(path.join(outDir, "manifest.txt"), manifestRaw, "utf8");
  console.log(`manifest.txt written (${Math.round(manifestRaw.length / 1024)} KB)`);
}
if (templateRaw) {
  fs.writeFileSync(path.join(outDir, "template.txt"), templateRaw, "utf8");
  console.log(`template.txt written (${Math.round(templateRaw.length / 1024)} KB)`);
}

// Try to JSON-parse the manifest to get a file list.
try {
  const m = JSON.parse(manifestRaw);
  console.log("manifest is JSON. keys:", Object.keys(m));
  if (m.files) console.log("files:", Object.keys(m.files));
} catch (_) {
  // Try as base64 blob
  const head = manifestRaw.slice(0, 200);
  console.log("manifest not JSON. first 200 chars:", head);
}
