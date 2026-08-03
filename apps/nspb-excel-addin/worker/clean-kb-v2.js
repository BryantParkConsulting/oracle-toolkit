// Round-2 cleaner — fixes Notion-export artifacts in headings.
const fs = require("fs");
const path = require("path");

const SRC = path.join(__dirname, "kb.md");
let txt = fs.readFileSync(SRC, "utf8");
const before = txt.length;

// 1. Strip ** bold markers from headings (e.g. "### **Title**" → "### Title").
txt = txt.replace(/^(#{2,4})\s+\*\*(.+?)\*\*\s*$/gm, "$1 $2");

// 2. Remove empty / malformed headings (e.g. "### ****" or "###  ").
txt = txt.replace(/^#{2,4}\s*\*+\s*$/gm, "");
txt = txt.replace(/^#{2,4}\s*$/gm, "");

// 3. Strip leading numbered prefix in headings ("### 1. Why..." → keep —
//    we LEAVE numbered FAQ headings alone since they're our format).
//    But strip orphan-looking "## Step 0/1/2..." that have no useful body.
//    For now we just leave them but flatten to ### so they don't bubble up.
txt = txt.replace(/^## Step (\d+)\s*$/gm, "### Step $1");

// 4. Collapse 3+ blank lines to 2.
txt = txt.replace(/\n{3,}/g, "\n\n");

// 5. Trim trailing whitespace per line.
txt = txt.split("\n").map(l => l.trimEnd()).join("\n");

// 6. Detect duplicate consecutive headings (same text within 50 lines apart).
// We don't auto-remove (might lose content) — just log them.
const lines = txt.split("\n");
const seenHeadings = new Map();
const duplicateLines = [];
for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(/^(#{2,4})\s+(.+)$/);
  if (m) {
    const key = m[2].trim().toLowerCase();
    if (seenHeadings.has(key)) {
      const prev = seenHeadings.get(key);
      if (i - prev < 200) {
        duplicateLines.push({ line: i + 1, text: lines[i], prevLine: prev + 1 });
      }
    }
    seenHeadings.set(key, i);
  }
}

fs.writeFileSync(SRC, txt, "utf8");
const after = txt.length;
const saved = before - after;

console.log(`✓ kb.md cleaned (round 2)`);
console.log(`  Before: ${(before/1024).toFixed(1)} KB`);
console.log(`  After:  ${(after/1024).toFixed(1)} KB`);
console.log(`  Saved:  ${(saved/1024).toFixed(1)} KB`);
console.log(`  Duplicate-ish headings: ${duplicateLines.length}`);
if (duplicateLines.length) {
  console.log(`\n  Suspicious duplicates (review manually):`);
  for (const d of duplicateLines.slice(0, 20)) {
    console.log(`    L${d.line}: "${d.text.slice(0, 80)}"  (prev at L${d.prevLine})`);
  }
}
