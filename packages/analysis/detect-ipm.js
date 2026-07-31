'use strict';
// ── IPM / AI Insights detector ───────────────────────────────────────────
// Scans an Oracle NSPB/EPM LCM export for the IPM (Intelligent Performance
// Management) footprint — the "Auto Predict" Global Artifact that stores every
// Auto Predict / Prediction Insights / Anomaly Insights / Historical Insights /
// Multivariate batch defined in the app — and turns it into:
//   1. a structured object (merged into tenant-kb.json as kb.ipm), and
//   2. a markdown section for the optimization / state reports.
//
// Pure-LCM: needs no level-0 export, audit or Activity Report — so it works for
// any client whose LCM we have, even when the heavier inputs are missing.
//
// API:
//   detectIPM(lcmRoot)          -> kb.ipm object (or { present:false } if none)
//   renderIpmSection(ipm, cap, heading)  -> markdown string
//
// CLI (standalone deliverable, no full report needed):
//   node tools/detect-ipm.js <CLIENT>
//     reads lcm-export/<CLIENT>, writes clients/<client>/ipm.json
//     and clients/<client>/ipm-section.md
const fs = require('fs');
const path = require('path');

const dec = s => decodeURIComponent(String(s).replace(/%(?![0-9A-F]{2})/gi, '%25'));
const attr = (tag, name) => { const m = tag.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`, 'i')); return m ? m[1].trim() : ''; };

// IPM job-type flags → human label. A batch can carry several at once
// (e.g. "Revenue Insight" enables all of them).
const JOB_TYPES = [
  ['isAutoPredictJob', 'Auto Predict'],
  ['isPredictionInsightJob', 'Prediction Insights'],
  ['isAnomalyInsightJob', 'Anomaly Insights'],
  ['isHistoricalInsightJob', 'Historical Insights'],
  ['isMultivariateJob', 'Multivariate (ML)'],
];

// A MbrSelection is a comma list. By Auto Predict convention the first members
// are Scenario, Version, Currency, Entity…; the account target is the
// ILvl0Descendants(...) / @-function (or the last member).
function sliceParts(mbr) {
  const parts = (mbr || '').split(',').map(s => s.trim()).filter(Boolean);
  const account = parts.filter(p => /Descendants|^ILvl0|^@|NFS_|Account/i.test(p)).join(', ')
    || parts[parts.length - 1] || '';
  return { scenario: parts[0] || '', version: parts[1] || '', currency: parts[2] || '', account, raw: parts };
}

function parseBatch(xml) {
  const tag = (xml.match(/<APBatch\b[^>]*>/i) || [''])[0];
  const types = JOB_TYPES.filter(([k]) => /true/i.test(attr(tag, k))).map(([, label]) => label);
  const slices = {};
  const re = /<SliceMapping\b([^>]*)>([\s\S]*?)<\/SliceMapping>/gi;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const defType = attr('<x ' + m[1] + '>', 'sliceDefType');
    const planType = attr('<x ' + m[1] + '>', 'planType');
    const mbr = (m[2].match(/<MbrSelection>([\s\S]*?)<\/MbrSelection>/i) || [, ''])[1];
    const p = sliceParts(mbr);
    if (/historical/i.test(defType)) slices.source = { ...p, planType };
    else if (/target/i.test(defType)) slices.target = { ...p, planType };
  }
  const dr = (xml.match(/<APBatchDateRange\b[^>]*>/i) || [''])[0];
  const start = (xml.match(/<startDate\b[^>]*>/i) || [''])[0];
  const end = (xml.match(/<endDate\b[^>]*>/i) || [''])[0];
  let options = null;
  const optm = xml.match(/<APPredictionOptions>\s*<!\[CDATA\[([\s\S]*?)\]\]>/i);
  if (optm) { try { options = JSON.parse(optm[1]); } catch (_) {} }
  return {
    name: attr(tag, 'name'),
    description: (xml.match(/<description>([\s\S]*?)<\/description>/i) || [, ''])[1].trim(),
    createdBy: attr(tag, 'createdBy'),
    generateReport: /true/i.test(attr(tag, 'generateReport')),
    savePrediction: /true/i.test(attr(tag, 'savePrediction')),
    jobTypes: types,
    planType: (slices.source && slices.source.planType) || (slices.target && slices.target.planType) || '',
    source: slices.source || null,
    target: slices.target || null,
    dateRange: {
      historicalPeriod: +attr(dr, 'historicalPeriod') || null,
      futurePeriod: +attr(dr, 'futurePeriod') || null,
      start: start ? `${attr(start, 'year')} ${attr(start, 'period')}` : '',
      end: end ? `${attr(end, 'year')} ${attr(end, 'period')}` : '',
    },
    model: options,
  };
}

function findAutoPredictDir(lcmRoot) {
  let entries = [];
  try { entries = fs.readdirSync(lcmRoot); } catch (_) { return null; }
  const hp = entries.find(n => /^HP-/.test(n));
  if (!hp) return null;
  const p = path.join(lcmRoot, hp, 'resource', 'Global Artifacts', 'Auto Predict');
  return fs.existsSync(p) ? p : null;
}

/** Detect the IPM footprint in an LCM export. Returns kb.ipm. */
function detectIPM(lcmRoot) {
  const dir = findAutoPredictDir(lcmRoot);
  if (!dir) return { present: false, count: 0, batches: [] };
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.xml'));
  const batches = files.map(f => {
    try { return parseBatch(fs.readFileSync(path.join(dir, f), 'utf8')); }
    catch (_) { return null; }
  }).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
  const typeSet = new Set(batches.flatMap(b => b.jobTypes));
  return {
    present: batches.length > 0,
    count: batches.length,
    jobTypesUsed: [...typeSet],
    batches,
  };
}

// Summarize a model-options object into a short, human phrase.
function modelSummary(o) {
  if (!o) return '—';
  const bits = [];
  const methods = [o.arima && 'ARIMA', o.seasonalMethods && 'seasonal', o.nonSeasonalMethods && 'non-seasonal'].filter(Boolean);
  if (methods.length) bits.push(methods.join(' + '));
  if (o.arimaExtendedSearch) bits.push('extended ARIMA search');
  if (o.fillInMissingValues) bits.push('fill missing');
  if (o.adjustOutliers) bits.push('adjust outliers');
  if (o.includeEvents) bits.push('events on');
  return bits.join(', ') || '—';
}

/**
 * Render the IPM section as markdown. `heading` is the section number/title
 * (e.g. "## 8. AI / IPM Insights footprint"). Icon tokens (@@OK@@ etc.) are
 * resolved by the PDF pipeline; framing is "suggested changes" per BPC rule.
 */
function renderIpmSection(ipm, cap, heading) {
  const P = [];
  P.push(heading || '## AI / IPM Insights footprint');
  P.push('');
  if (!ipm || !ipm.present) {
    P.push(`- @@OK@@ **No IPM / Auto Predict artifacts found in the LCM.** ${cap} is not using Oracle's built-in AI forecasting (Intelligent Performance Management) today — there is no \`Auto Predict\` Global Artifact in the export.`);
    P.push(`- @@IDEA@@ **Opportunity (suggested change to validate):** IPM is included with the EPM/NSPB license. If the team forecasts series with history (revenue, expense, volumes), Auto Predict can seed forecasts and flag anomalies with no extra cost — worth a scoped pilot.`);
    P.push('');
    return P.join('\n');
  }
  P.push(`_In plain terms: Oracle's **IPM (Intelligent Performance Management)** is the built-in AI/ML layer of EPM/NSPB — **Auto Predict** (bulk statistical forecasts), **Prediction / Historical Insights** and **Anomaly Insights**. This section reads every IPM batch defined in the application straight from the LCM, so you can see what AI is configured, on which data, and with which model settings._`);
  P.push('');
  P.push(`- @@OK@@ **${cap} uses IPM.** The LCM contains **${ipm.count} Auto Predict batch${ipm.count > 1 ? 'es' : ''}** covering: ${ipm.jobTypesUsed.join(', ')}.`);
  P.push('');
  P.push(`| Batch | Insight type(s) | Predicts (accounts) | History → Future | Source → Target (scn / version) | Model |`);
  P.push(`|---|---|---|---|---|---|`);
  for (const b of ipm.batches) {
    const acct = (b.target && b.target.account) || (b.source && b.source.account) || '—';
    const win = b.dateRange.historicalPeriod ? `${b.dateRange.historicalPeriod} mo → ${b.dateRange.futurePeriod || '?'} mo` : '—';
    const flow = b.source && b.target
      ? `${b.source.scenario}/${b.source.version} → ${b.target.scenario}/${b.target.version}`
      : '—';
    P.push(`| ${b.name} | ${b.jobTypes.join(', ') || '—'} | ${acct} | ${win} | ${flow} | ${modelSummary(b.model)} |`);
  }
  P.push('');

  // ── findings ──
  const writesToAiVersion = ipm.batches.filter(b => b.target && /AI Prediction/i.test(b.target.version));
  const saving = ipm.batches.filter(b => b.savePrediction);
  const multi = ipm.batches.filter(b => b.jobTypes.includes('Multivariate (ML)'));
  const fullInsight = ipm.batches.filter(b => b.jobTypes.length >= 4);

  if (writesToAiVersion.length) {
    P.push(`- @@OK@@ **Predictions are written to a dedicated \`AI Prediction\` version** (${writesToAiVersion.length} of ${ipm.count} batches) — a clean, non-destructive design: the AI forecast never overwrites the planners' working numbers, it sits side-by-side for comparison.`);
  }
  if (fullInsight.length) {
    P.push(`- @@OK@@ **${fullInsight.map(b => `"${b.name}"`).join(', ')} run the full Insights suite** (Auto Predict + Prediction + Historical + Anomaly) — the richest configuration: forecast, accuracy back-test and anomaly detection on the same series.`);
  }
  const noSave = ipm.count - saving.length;
  if (noSave > 0) {
    P.push(`- @@WARN@@ **${noSave} of ${ipm.count} batches have \`savePrediction = false\`** — they compute the insight but do **not** persist results to the cube. Confirm whether that is intentional (preview/ad-hoc only) or whether the forecasts are meant to be saved and consumed in forms/reports.`);
  }
  if (!multi.length) {
    P.push(`- @@IDEA@@ **All batches are univariate (each series predicted from its own history).** If drivers exist (e.g. headcount → salary, volume → revenue), a **Multivariate** Auto Predict can lift accuracy — a low-effort suggested change to pilot on the top revenue/expense lines.`);
  }
  P.push(`- @@IDEA@@ **Operationalize it (suggested change to validate):** if these are run manually, schedule the saved batches via **Application → Jobs → Schedule Jobs** (or an EPM Automate \`runAutoPredict\` step) so the AI forecast refreshes each cycle, and surface the \`AI Prediction\` version next to Forecast on the key revenue/expense forms so planners actually see and use it.`);
  P.push('');
  P.push(`_All items above are **suggested changes** to review with the ${cap} team — the LCM shows what is configured, not how often each batch is actually run or how its output is consumed._`);
  P.push('');
  return P.join('\n');
}

module.exports = { detectIPM, renderIpmSection };

// ── CLI ──────────────────────────────────────────────────────────────────
if (require.main === module) {
  const ROOT = path.join(__dirname, '..');
  const CLIENT = process.argv[2];
  if (!CLIENT) { console.error('usage: node tools/detect-ipm.js <CLIENT>  (matches lcm-export/<CLIENT>)'); process.exit(1); }
  // case-insensitive match of the lcm-export subfolder
  const lcmBase = process.env.LCM_ROOT ? path.resolve(process.env.LCM_ROOT) : path.join(ROOT, 'lcm-export');
  const sub = fs.readdirSync(lcmBase).find(d => d.toLowerCase() === CLIENT.toLowerCase());
  const lcmRoot = sub ? path.join(lcmBase, sub) : path.join(lcmBase, CLIENT);
  const cap = CLIENT[0].toUpperCase() + CLIENT.slice(1).toLowerCase();
  const ipm = detectIPM(lcmRoot);

  const outDir = path.join(ROOT, 'clients', CLIENT.toLowerCase());
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'ipm.json'), JSON.stringify(ipm, null, 2));
  const md = renderIpmSection(ipm, cap, '## AI / IPM Insights footprint');
  fs.writeFileSync(path.join(outDir, 'ipm-section.md'), md);

  console.log(`IPM present: ${ipm.present} · batches: ${ipm.count} · types: ${(ipm.jobTypesUsed || []).join(', ') || '—'}`);
  for (const b of ipm.batches) console.log(`  • ${b.name}  [${b.jobTypes.join(', ')}]  hist ${b.dateRange.historicalPeriod}mo→${b.dateRange.futurePeriod}mo  target ${b.target ? b.target.scenario + '/' + b.target.version : '—'}`);
  console.log(`\nWrote ${path.relative(ROOT, path.join(outDir, 'ipm.json'))} and ipm-section.md`);
}
