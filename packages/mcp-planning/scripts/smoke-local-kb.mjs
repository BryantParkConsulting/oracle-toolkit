import assert from "node:assert/strict";
import {
  loadKnowledgeBase,
  searchArtifacts,
  summarizeKnowledgeBase
} from "../src/kb-store.js";

const kbPath = process.env.LOCAL_KB_PATH;
if (!kbPath) {
  console.error("Set LOCAL_KB_PATH to a local, gitignored tenant-kb.json.");
  process.exit(1);
}

const { kb, resolved } = loadKnowledgeBase(kbPath);
const summary = summarizeKnowledgeBase(kb, resolved);
const sampleHits = searchArtifacts(kb, "cash flow", undefined, 10);

assert.ok(summary.application);
assert.ok(summary.counts.forms >= 0);

console.log(JSON.stringify({
  test: "Local KB smoke test",
  passed: true,
  summary,
  sampleSearchCount: sampleHits.length,
  sampleNames: sampleHits.slice(0, 5).map((hit) => hit.name)
}, null, 2));
