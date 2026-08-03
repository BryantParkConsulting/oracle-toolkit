// One-shot kb.md cleaner.
// Strips broken image refs, dedupes blank lines, removes Notion artifacts.
// Run: node clean-kb.js
const fs = require("fs");
const path = require("path");

const SRC = path.join(__dirname, "kb.md");
const original = fs.readFileSync(SRC, "utf8");

let cleaned = original;
const before = cleaned.length;

// 1. Remove markdown image references — broken local paths from Notion export.
// Patterns:
//   ![alt](path)
//   ![alt](path "title")
//   Standalone or inline.
cleaned = cleaned.replace(/!\[[^\]]*\]\([^)]+\)/g, "");

// 2. Collapse 3+ blank lines into max 2.
cleaned = cleaned.replace(/\n{3,}/g, "\n\n");

// 3. Strip lines that became empty (just whitespace/punctuation after image
//    removal — e.g. lines that were ONLY an image now empty).
cleaned = cleaned.split("\n").map(l => l.trimEnd()).join("\n");

// 4. Remove obvious Notion export artifacts:
//    - "Created by …" tag lines
//    - "Last edited …" timestamps
cleaned = cleaned
  .replace(/^Created by [^\n]+\n/gm, "")
  .replace(/^Last edited [^\n]+\n/gm, "");

// 5. Dedupe consecutive separator lines (`---` ×N → `---`).
cleaned = cleaned.replace(/(?:^---\s*\n){2,}/gm, "---\n");

// 6. Final pass: collapse 3+ blank lines again (in case step 4-5 created them).
cleaned = cleaned.replace(/\n{3,}/g, "\n\n");

const after = cleaned.length;
const saved = before - after;

fs.writeFileSync(SRC, cleaned, "utf8");

console.log(`✓ kb.md cleaned`);
console.log(`  Before: ${(before/1024).toFixed(1)} KB (${before} chars)`);
console.log(`  After:  ${(after/1024).toFixed(1)} KB (${after} chars)`);
console.log(`  Saved:  ${(saved/1024).toFixed(1)} KB (${((saved/before)*100).toFixed(1)}%)`);
