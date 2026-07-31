#!/usr/bin/env node
'use strict';
/**
 * sanitize-kb.js — turn worker/kb.md into a publishable NSPB product KB.
 *
 *   node tools/sanitize-kb.js            # report only, writes nothing
 *   node tools/sanitize-kb.js --write    # write the sanitized copy + push targets
 *
 * worker/kb.md is the NSPB product knowledge base, flattened from Notion for Gemini
 * context. It is overwhelmingly product documentation, but a FAQ section near the end
 * was written against a real multi-state engagement and names that client's states.
 * Those names identify the client; the knowledge around them does not. So this
 * de-identifies rather than deletes — the reader still learns how alternate hierarchies
 * and alias tables work, just not for whom.
 *
 * Run this before publishing to any public repo. If it reports UNREVIEWED hits, a new
 * client reference has appeared in the KB and the rule list below needs updating —
 * do not publish until that count is zero.
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'worker', 'kb.md');
const OUT = path.join(__dirname, '..', 'worker', 'kb.public.md');

// Consistent pseudonyms: the FAQ contrasts regions with each other, so they have to
// stay distinguishable or the explanations stop making sense.
const RULES = [
  [/North Carolina/g, 'Region C'],
  [/\bCarolinas\b/g, 'other regions'],
  [/\bLouisiana['’]s\b/g, "Region A's"],
  [/\bLouisiana\b/g, 'Region A'],
  [/\bFlorida\b/g, 'Region B'],
  [/\(targeted for April 8th\)/g, '(targeted for the agreed date)'],
  [/\bApril 8th\b/g, 'the agreed go-live date'],
];

// Anything matching these after sanitising means a NEW identifier slipped in.
const TRIPWIRES = [
  { name: 'US state names', re: /\b(Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|Ohio|Oklahoma|Oregon|Pennsylvania|Tennessee|Texas|Utah|Vermont|Virginia|Washington|Wisconsin|Wyoming|Florida|Carolina)\b/g },
  { name: 'real email addresses', re: /[\w.+-]+@(?!company\.com|example\.com)[\w-]+\.[\w.]+/g },
  { name: 'real Oracle pods', re: /epm-(?!a999999)[a-z0-9-]+\.epm\.[a-z0-9-]+\.oraclecloud\.com/g },
  { name: 'NetSuite account URLs', re: /\b\d{6,8}\.app\.netsuite\.com/g },
  { name: 'BPC internal addresses', re: /bryantparkconsulting\.com/g },
];

const HEADER = `<!--
  NSPB Knowledge Base — product documentation for Oracle NetSuite Planning & Budgeting.

  Generated from the internal Notion KB by tools/sanitize-kb.js. Client-identifying
  references have been replaced with neutral placeholders (Region A / Region B / ...);
  the underlying product knowledge is unchanged.

  This file answers "how does NSPB work" — modules, forms, dimensionality, Smart View,
  the business-rule sequences, administration and integration. Read it before inferring
  how a module behaves from a single client's LCM export: an export tells you which
  rules a tenant happens to have, not which sequence is correct.
-->

`;

const src = fs.readFileSync(SRC, 'utf8');
let out = src;
const applied = [];
for (const [re, to] of RULES) {
  const n = (src.match(re) || []).length;
  if (n) applied.push(`  ${String(n).padStart(3)}x  ${re.source}  ->  ${to}`);
  out = out.replace(re, to);
}
out = HEADER + out;

console.log(`source : ${SRC}\n         ${src.length} chars, ${src.split('\n').length} lines\n`);
console.log('replacements:');
console.log(applied.length ? applied.join('\n') : '  (none)');

let unreviewed = 0;
console.log('\ntripwires (must all be 0 before publishing):');
for (const { name, re } of TRIPWIRES) {
  const hits = out.match(re) || [];
  unreviewed += hits.length;
  console.log(`  ${String(hits.length).padStart(3)}  ${name}${hits.length ? '   ' + [...new Set(hits)].slice(0, 5).join(', ') : ''}`);
}

if (!process.argv.includes('--write')) {
  console.log('\n(report only — pass --write to emit the sanitized copy)');
  process.exit(unreviewed ? 1 : 0);
}
if (unreviewed) {
  console.error('\nREFUSING TO WRITE: a tripwire fired. Add a rule for it above, then re-run.');
  process.exit(1);
}
fs.writeFileSync(OUT, out, 'utf8');
console.log(`\nwrote ${OUT}  (${out.length} chars)`);
