// Chequeo de sintaxis de todo el toolkit. CJS y ESM conviven por paquete,
// así que se valida cada archivo con el parser que le corresponde.
const { execFileSync } = require("child_process");
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..", "packages");
let ok = 0, bad = [];
const walk = d => fs.readdirSync(d, { withFileTypes: true }).forEach(e => {
  const p = path.join(d, e.name);
  if (e.isDirectory()) { if (!/node_modules|test|examples|templates/.test(e.name)) walk(p); return; }
  if (!/\.(js|mjs)$/.test(e.name)) return;
  try { execFileSync(process.execPath, ["--check", p], { stdio: "pipe" }); ok++; }
  catch (err) { bad.push(`${path.relative(root, p)}: ${String(err.stderr).split("\n").find(l => /Error/.test(l)) || "?"}`); }
});
walk(root);
console.log(`sintaxis OK: ${ok}`);
if (bad.length) { console.log(`FALLAN ${bad.length}:`); bad.forEach(b => console.log("  " + b)); process.exit(1); }
