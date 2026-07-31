#!/usr/bin/env node
/*
 * enrich-kb.js — AI enrichment pass over tenant-kb.json.
 *
 * For every rule and every form in the KB, call Gemini Flash ONCE with the
 * structured metadata + the rule body (or attached-rule bodies) and store
 * the result as `aiSummary` on each entry. The worker's runExplain reads
 * this cached summary at runtime — no per-query Gemini call needed.
 *
 * Two ways to use it:
 *
 *   1. CLI (standalone, after parse-lcm.js):
 *      node tools/enrich-kb.js <kb.json> --api-key=AIza... [--force] [--limit=N]
 *
 *   2. Programmatic (called by parse-lcm.js after writing the KB):
 *      const { enrichKb } = require('./enrich-kb');
 *      await enrichKb({ kb, apiKey, concurrency: 6 });
 *      // kb is mutated in place: each rule/form gets an aiSummary field
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const DEFAULT_MODEL = 'gemini-2.5-flash';
const DEFAULT_CONCURRENCY = 4;
const DEFAULT_MAX_TOKENS = 8192;

// ── Gemini HTTP call ─────────────────────────────────────────────────
function callGemini({ apiKey, model, systemPrompt, userText, maxTokens }) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: userText }] }],
      generationConfig: {
        maxOutputTokens: maxTokens || DEFAULT_MAX_TOKENS,
        temperature: 0.2,
        responseMimeType: 'application/json',
      },
    });
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const req = https.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    }, (res) => {
      let body = '';
      res.on('data', (c) => body += c);
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error(`Gemini ${res.statusCode}: ${body.slice(0, 200)}`));
        try {
          const parsed = JSON.parse(body);
          const cand = parsed.candidates && parsed.candidates[0];
          const parts = cand && cand.content && cand.content.parts;
          const text = Array.isArray(parts) ? parts.map(p => p.text || '').join('') : '';
          const finish = cand && cand.finishReason;
          if (finish && finish !== 'STOP') {
            return reject(new Error(`finishReason=${finish} (truncated — body too long for ${maxTokens || DEFAULT_MAX_TOKENS} tokens)`));
          }
          resolve(text.trim());
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// ── Variable detection (matches worker's runExplain) ────────────────
function buildVarDetector(allVars) {
  return function detectVarsInText(text) {
    if (!text) return [];
    const t = String(text);
    const hits = [];
    const seen = new Set();
    for (const v of allVars) {
      if (!v || !v.name) continue;
      const key = v.name.toLowerCase();
      if (seen.has(key)) continue;
      if (t.includes(v.name) || t.includes('&' + v.name)) {
        seen.add(key);
        hits.push({ name: v.name, value: v.value || '' });
      }
    }
    return hits;
  };
}

// ── System prompts ───────────────────────────────────────────────────
const RULE_SYSTEM = [
  'You are a Hyperion Planning / Oracle NSPB calcscript analyst.',
  'Given a rule\'s metadata and full script body, produce a structured JSON summary for a FINANCE USER (not a programmer).',
  '',
  'Output JSON with this exact shape — no other keys, no prose outside the JSON:',
  '{',
  '  "whatItDoes":   "1-2 sentence plain-English summary. Start with a verb (Aggregates, Calculates, Copies, Initializes, ...). Never mention Groovy/CalcScript syntax.",',
  '  "inputs":       ["bullet points of what the rule READS — source members, substitution vars, RTP prompts. Keep each <80 chars."],',
  '  "outputs":      ["bullet points of what the rule WRITES — target intersection: which cube, which accounts/dims. Keep each <80 chars."],',
  '  "calculations": ["bullet points of the operations performed — AGG by Department, COPY from Actual to Forecast, IF Account == X then Y. Plain English."],',
  '  "whenItRuns":   "onSave / runnable (manual) / scheduled / member-formula. One short phrase.",',
  '  "scope":        "Brief description of FIX block scope: scenarios/years/periods/accounts the rule operates on. Quote substitution vars by name (e.g. &NSP_PER_CurrYr)."',
  '}',
  '',
  'Rules:',
  '- Ground 100% in the provided body. Never invent member names, scenarios, or behaviors not in the script.',
  '- If the body is empty or just a header, return {"whatItDoes":"(empty script — no operation)","inputs":[],"outputs":[],"calculations":[],"whenItRuns":"unknown","scope":""}.',
  '- Keep arrays to 2-5 items max. Be concise. Each bullet under 80 chars (HARD LIMIT — JSON gets truncated otherwise).',
  '- whatItDoes: max 200 chars. scope: max 250 chars.',
].join('\n');

const VAR_SYSTEM = [
  'You are a Hyperion Planning / Oracle NSPB substitution-variable analyst.',
  'Given a substitution variable\'s name, current value, and the bodies of rules that reference it, produce a structured JSON summary for a FINANCE USER.',
  '',
  'Output JSON with this exact shape — no other keys, no prose outside the JSON:',
  '{',
  '  "whatItControls": "1-2 sentence plain-English summary of what this variable controls across the system, inferred from its name pattern (NSP_PER_* = period, NSP_SYS_* = system-wide, NSP_FIN_* = finance) and how rules consume it.",',
  '  "whenToUpdate":   "When does a controller/analyst update this? (Monthly close, year-end roll, forecast cycle start, etc.) One short phrase.",',
  '  "impact":         ["bullet points: what shifts/breaks if the value is wrong. <80 chars each."],',
  '  "category":       "period | scenario | version | currency | system | other. One word."',
  '}',
  '',
  'Rules:',
  '- Ground in the variable name + value + which rules consume it. Never invent rules.',
  '- Keep impact to 2-4 items max. Each <80 chars. whatItControls max 200 chars.',
].join('\n');

const FORM_SYSTEM = [
  'You are a Hyperion Planning / Oracle NSPB form analyst.',
  'Given a form\'s metadata + the bodies of its attached rules, produce a structured JSON summary for a FINANCE USER.',
  '',
  'Output JSON with this exact shape — no other keys, no prose outside the JSON:',
  '{',
  '  "purpose":         "1-2 sentence summary: what does the user DO on this form? (key revenue forecasts / review consolidated P&L / adjust accruals).",',
  '  "whoUses":         "Role: analyst / controller / planner / admin. One word.",',
  '  "behaviorOnSave":  ["What runs when the user saves: each onSave rule + 1-line plain-English of what it does. <80 chars each."],',
  '  "levers":          ["The dimensions/variables the user can change to drive results. <80 chars each."],',
  '  "dependencies":    ["Forms or data sources that FEED this form, if obvious from the metadata. Empty array if not."]',
  '}',
  '',
  'Rules:',
  '- Ground 100% in the metadata + rule bodies provided. Never invent rules, forms, or behaviors.',
  '- If there are no attached rules, behaviorOnSave: [] (do not invent).',
  '- Keep arrays to 2-5 items max. Be concise. Each bullet under 80 chars (HARD LIMIT — JSON gets truncated otherwise).',
  '- purpose: max 200 chars.',
].join('\n');

// ── Per-entry enrichers ──────────────────────────────────────────────
async function enrichRule(rule, { apiKey, model, force, detectVars, maxTokens }) {
  if (!force && rule.aiSummary && typeof rule.aiSummary === 'object') return 'cached';
  const body = rule.body || '';
  const vars = detectVars(body);
  const props = rule.properties || {};
  const userText = [
    `Rule name: ${rule.name}`,
    `Cube: ${rule.cube || '?'}`,
    `Script type: ${rule.scriptType || '?'}`,
    `Designer description: ${rule.description || '(none)'}`,
    `Runtime prompt: ${props.prompt_text || props.promptText || '(none)'}`,
    `Prompt dimension: ${props.dimensionType || '(none)'}`,
    `Scope: ${props.scope || '(unknown)'}`,
    `Attached to ${(rule.attachedToForms || []).length} form(s)`,
    `Substitution variables detected: ${vars.map(v => `${v.name}=${v.value}`).join(', ') || '(none)'}`,
    '',
    'Body:',
    '```',
    body || '(empty)',
    '```',
  ].join('\n');
  try {
    const out = await callGemini({ apiKey, model, systemPrompt: RULE_SYSTEM, userText, maxTokens });
    rule.aiSummary = JSON.parse(out);
    return 'new';
  } catch (e) {
    // If MAX_TOKENS fired (model went too verbose), retry once with a
    // tighter system prompt that caps every string very short. Real-world
    // example: a 556-char rule body produced >8k tokens of JSON because
    // the model went deep on each bullet.
    if (/finishReason=MAX_TOKENS/.test(e.message)) {
      try {
        const tightSystem = RULE_SYSTEM +
          '\n\nULTRA-TIGHT MODE: every string max 60 chars. Arrays max 3 items. whatItDoes max 120 chars. scope max 120 chars. This is a retry after the previous response exceeded the token budget.';
        const out2 = await callGemini({ apiKey, model, systemPrompt: tightSystem, userText, maxTokens });
        rule.aiSummary = JSON.parse(out2);
        return 'new';
      } catch (e2) {
        console.warn(`\n  ⚠ rule ${rule.name} (retry failed): ${e2.message}`);
        return 'fail';
      }
    }
    console.warn(`\n  ⚠ rule ${rule.name}: ${e.message}`);
    return 'fail';
  }
}

async function enrichVar(v, rules, { apiKey, model, force, maxTokens }) {
  if (!force && v.aiSummary && typeof v.aiSummary === 'object') return 'cached';
  // Find rules that reference this variable
  const consumers = rules.filter(r => {
    const body = r.body || '';
    return body.includes(v.name) || body.includes('&' + v.name);
  });
  const sampleBodies = consumers.slice(0, 5)
    .map(r => `### ${r.name}\n${(r.body || '').slice(0, 800)}`)
    .join('\n\n');
  const userText = [
    `Variable: ${v.name}`,
    `Current value: ${v.value || '(empty)'}`,
    `Cube scope: ${v.cube || v.plantype || '(application-wide)'}`,
    `Description: ${v.description || '(none)'}`,
    `Consumed by ${consumers.length} rule(s)${consumers.length ? ': ' + consumers.slice(0, 8).map(r => r.name).join(', ') : ''}`,
    '',
    sampleBodies ? 'Sample rule bodies (first 5, truncated):\n' + sampleBodies : '(no consuming rule bodies available)',
  ].join('\n');
  try {
    const out = await callGemini({ apiKey, model, systemPrompt: VAR_SYSTEM, userText, maxTokens });
    v.aiSummary = JSON.parse(out);
    return 'new';
  } catch (e) {
    if (/finishReason=MAX_TOKENS/.test(e.message)) {
      try {
        const tightSystem = VAR_SYSTEM + '\n\nULTRA-TIGHT MODE: strings max 60 chars. Arrays max 2 items.';
        const out2 = await callGemini({ apiKey, model, systemPrompt: tightSystem, userText, maxTokens });
        v.aiSummary = JSON.parse(out2);
        return 'new';
      } catch (e2) {
        console.warn(`\n  ⚠ variable ${v.name} (retry failed): ${e2.message}`);
        return 'fail';
      }
    }
    console.warn(`\n  ⚠ variable ${v.name}: ${e.message}`);
    return 'fail';
  }
}

async function enrichForm(form, rulesByName, { apiKey, model, force, detectVars, maxTokens }) {
  if (!force && form.aiSummary && typeof form.aiSummary === 'object') return 'cached';
  const attached = Array.isArray(form.attachedRules) ? form.attachedRules : [];
  const attachedBodies = attached
    .map(ar => rulesByName[ar.name])
    .filter(r => r && r.body)
    .map(r => {
      const onSave = attached.find(a => a.name === r.name);
      return `### ${r.name} (${r.scriptType || '?'}, runOnSave=${onSave && onSave.runOnSave})\n${r.body}`;
    })
    .join('\n\n');
  const formText = JSON.stringify({
    rowDims: form.rowDims, columnDims: form.columnDims, povDims: form.povDims,
  });
  const vars = detectVars(formText + '\n' + attachedBodies);
  const userText = [
    `Form name: ${form.name}`,
    `Cube: ${form.cube || '?'}`,
    `Module: ${form.module || '(none)'}`,
    `Path: ${form.path || ''}`,
    `Description: ${form.description || '(none)'}`,
    `Type: ${form.isInput ? 'data-entry (input)' : 'read-only (review)'}`,
    `Rows by: ${(form.rowDims || []).join(', ') || '(none)'}`,
    `Columns by: ${(form.columnDims || []).join(', ') || '(none)'}`,
    `POV (pinned): ${(form.povDims || []).join(', ') || '(none)'}`,
    `Attached rules: ${attached.map(a => `${a.name}${a.runOnSave ? ' (onSave)' : ''}`).join(', ') || '(none)'}`,
    `Variables touched: ${vars.map(v => v.name).join(', ') || '(none)'}`,
    '',
    attachedBodies ? 'Attached rule bodies:\n' + attachedBodies : '(no attached rule bodies)',
  ].join('\n');
  try {
    const out = await callGemini({ apiKey, model, systemPrompt: FORM_SYSTEM, userText, maxTokens });
    form.aiSummary = JSON.parse(out);
    return 'new';
  } catch (e) {
    if (/finishReason=MAX_TOKENS/.test(e.message)) {
      try {
        const tightSystem = FORM_SYSTEM +
          '\n\nULTRA-TIGHT MODE: every string max 60 chars. Arrays max 3 items. purpose max 120 chars. Retry after prior response exceeded the token budget.';
        const out2 = await callGemini({ apiKey, model, systemPrompt: tightSystem, userText, maxTokens });
        form.aiSummary = JSON.parse(out2);
        return 'new';
      } catch (e2) {
        console.warn(`\n  ⚠ form ${form.name} (retry failed): ${e2.message}`);
        return 'fail';
      }
    }
    console.warn(`\n  ⚠ form ${form.name}: ${e.message}`);
    return 'fail';
  }
}

// ── Concurrency-limited processor ────────────────────────────────────
async function processBatch(items, label, fn, concurrency, log) {
  let done = 0, enriched = 0, cached = 0, failed = 0;
  const queue = items.slice();
  async function worker() {
    while (queue.length) {
      const item = queue.shift();
      const result = await fn(item);
      done++;
      if (result === 'new') enriched++;
      else if (result === 'cached') cached++;
      else failed++;
      if (log && (done % 5 === 0 || done === items.length)) {
        process.stdout.write(`\r  ${label}: ${done}/${items.length}  (new ${enriched}, cached ${cached}, failed ${failed})`);
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  if (log) console.log(`\n  ${label}: ${enriched} new, ${cached} cached, ${failed} failed`);
  return { enriched, cached, failed };
}

// ── Programmatic entry point ─────────────────────────────────────────
// Mutates `kb` in place. Returns { rules: {...}, forms: {...} } stats.
async function enrichKb({ kb, apiKey, model = DEFAULT_MODEL, concurrency = DEFAULT_CONCURRENCY, force = false, limit = 0, rulesOnly = false, formsOnly = false, varsOnly = false, maxTokens = DEFAULT_MAX_TOKENS, log = true }) {
  if (!apiKey) throw new Error('enrichKb: apiKey required');
  const rules = Array.isArray(kb.rules) ? kb.rules : [];
  const forms = Array.isArray(kb.forms) ? kb.forms : [];
  const vars = Array.isArray(kb.substitutionVariables) ? kb.substitutionVariables : (Array.isArray(kb.variables) ? kb.variables : []);
  const detectVars = buildVarDetector(vars);
  const rulesByName = {};
  for (const r of rules) if (r && r.name) rulesByName[r.name] = r;
  const ruleSubset = limit > 0 ? rules.slice(0, limit) : rules;
  const formSubset = limit > 0 ? forms.slice(0, limit) : forms;
  const varSubset = limit > 0 ? vars.slice(0, limit) : vars;
  const stats = { rules: null, forms: null, variables: null };
  if (!formsOnly && !varsOnly && ruleSubset.length) {
    if (log) console.log(`\nEnriching ${ruleSubset.length} rules (concurrency ${concurrency}, model ${model})...`);
    stats.rules = await processBatch(
      ruleSubset, 'rules',
      (r) => enrichRule(r, { apiKey, model, force, detectVars, maxTokens }),
      concurrency, log,
    );
  }
  if (!rulesOnly && !varsOnly && formSubset.length) {
    if (log) console.log(`\nEnriching ${formSubset.length} forms (concurrency ${concurrency}, model ${model})...`);
    stats.forms = await processBatch(
      formSubset, 'forms',
      (f) => enrichForm(f, rulesByName, { apiKey, model, force, detectVars, maxTokens }),
      concurrency, log,
    );
  }
  if (!rulesOnly && !formsOnly && varSubset.length) {
    if (log) console.log(`\nEnriching ${varSubset.length} variables (concurrency ${concurrency}, model ${model})...`);
    stats.variables = await processBatch(
      varSubset, 'variables',
      (v) => enrichVar(v, rules, { apiKey, model, force, maxTokens }),
      concurrency, log,
    );
  }
  return stats;
}

module.exports = { enrichKb };

// ── CLI entry point ──────────────────────────────────────────────────
if (require.main === module) {
  (async () => {
    const argv = process.argv.slice(2);
    const FILE = argv.find(a => !a.startsWith('--'));
    if (!FILE) {
      console.error('Usage: node tools/enrich-kb.js <kb.json> [--api-key=KEY] [--model=NAME] [--concurrency=N] [--force] [--rules-only|--forms-only] [--limit=N]');
      process.exit(1);
    }
    const flag = (n) => argv.find(a => a === `--${n}` || a.startsWith(`--${n}=`));
    const flagVal = (n, def) => {
      const f = flag(n);
      if (!f) return def;
      const eq = f.indexOf('=');
      return eq === -1 ? true : f.slice(eq + 1);
    };
    const apiKey = flagVal('api-key', process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
    if (!apiKey) {
      console.error('ERROR: Gemini API key required. Pass --api-key=... or set GEMINI_API_KEY.');
      process.exit(1);
    }
    const ABS = path.resolve(FILE);
    const kb = JSON.parse(fs.readFileSync(ABS, 'utf8'));
    console.log(`Loaded ${path.basename(ABS)}: ${(kb.rules||[]).length} rules, ${(kb.forms||[]).length} forms`);
    const t0 = Date.now();
    await enrichKb({
      kb, apiKey,
      model: flagVal('model', DEFAULT_MODEL),
      concurrency: parseInt(flagVal('concurrency', DEFAULT_CONCURRENCY), 10),
      force: !!flag('force'),
      limit: parseInt(flagVal('limit', '0'), 10) || 0,
      rulesOnly: !!flag('rules-only'),
      formsOnly: !!flag('forms-only'),
    });
    fs.writeFileSync(ABS, JSON.stringify(kb, null, 2), 'utf8');
    console.log(`\n✓ Wrote enriched KB to ${ABS} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  })().catch(e => { console.error(e); process.exit(1); });
}
