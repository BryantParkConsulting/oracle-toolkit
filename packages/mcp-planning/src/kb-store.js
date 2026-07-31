import fs from "node:fs";
import path from "node:path";

const COLLECTIONS = [
  "forms",
  "dashboards",
  "financialReports",
  "rules",
  "rulesets",
  "substitutionVariables",
  "navigationFlows"
];

export function loadKnowledgeBase(kbPath) {
  if (!kbPath) throw new Error("Set ORACLE_EPM_KB_PATH or pass kb_path.");
  const resolved = path.resolve(kbPath);
  const kb = JSON.parse(fs.readFileSync(resolved, "utf8"));
  return { kb, resolved };
}

export function summarizeKnowledgeBase(kb, source) {
  const counts = {};
  for (const key of COLLECTIONS) counts[key] = Array.isArray(kb[key]) ? kb[key].length : 0;
  counts.dimensions = Array.isArray(kb.dimensions)
    ? kb.dimensions.length
    : Object.keys(kb.dimensions || {}).length;

  return {
    source,
    schemaVersion: kb.schemaVersion ?? null,
    generatedAt: kb.generatedAt ?? null,
    client: kb.client ?? null,
    application: kb.appName ?? kb.application ?? null,
    counts
  };
}

function searchableText(value) {
  return JSON.stringify(value).toLowerCase();
}

export function searchArtifacts(kb, query, kinds, limit = 25) {
  const needle = query.toLowerCase();
  const selected = kinds?.length ? kinds : COLLECTIONS;
  const hits = [];

  for (const kind of selected) {
    const values = Array.isArray(kb[kind]) ? kb[kind] : [];
    for (const artifact of values) {
      if (!searchableText(artifact).includes(needle)) continue;
      hits.push({
        kind,
        name: artifact.name || artifact.ruleName || artifact.variableName || artifact.title || "(unnamed)",
        cube: artifact.cube || artifact.planType || null,
        summary: artifact.aiSummary || artifact.description || null
      });
      if (hits.length >= limit) return hits;
    }
  }
  return hits;
}

export function getArtifact(kb, kind, name) {
  const values = Array.isArray(kb[kind]) ? kb[kind] : [];
  const exact = values.find((item) => {
    const candidate = item.name || item.ruleName || item.variableName || item.title;
    return String(candidate || "").toLowerCase() === name.toLowerCase();
  });
  if (!exact) throw new Error(`Artifact not found: ${kind}/${name}`);
  return exact;
}
