'use strict';
// Automated UAT for the NSPB chat (extension payload shape, real Worker).
// Simulates a finance user's typical questions and checks each reply for
// expected signals. Run:  node tools/uat-chat.js
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const API = 'https://gentle-moon-046f.nspbassistant.workers.dev';
const KB = JSON.parse(fs.readFileSync(path.join(ROOT, 'clients/squarespace/tenant-kb.json'), 'utf8'));

// Gemini key from repo .env
const env = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
const GEMINI_KEY = (env.match(/GEMINI_API_KEY=(\S+)/) || [])[1];
if (!GEMINI_KEY) { console.error('no GEMINI_API_KEY in .env'); process.exit(1); }

// Same slimming the extension does
function slimTenantKb(kb) {
  const slim = { ...kb };
  delete slim.financialReports;
  slim.dimensions = (kb.dimensions && kb.dimensions.Account) ? { Account: kb.dimensions.Account } : undefined;
  return slim;
}
const kbForms = KB.forms.map(f => ({ name: f.name, cube: f.cube, kind: f.kind, isInput: f.isInput, description: f.description || '' }));
const kbRules = KB.rules.map(r => ({ name: r.name, description: r.description || '' }));
const kbVars = KB.substitutionVariables.map(v => ({ name: v.name, value: v.value, planType: v.planType }));

// ── The finance-user scenario suite ────────────────────────────────
// expect: reply must contain at least one of these (case-insensitive)
const SUITE = [
  { q: 'what should I do at the start of a new month in NSPB?',
    expect: ['substitution variable', 'current month', 'rollover', 'roll forward', 'data load', 'actuals'] },
  { q: 'are the substitution variables up to date?',
    expect: ['nsp_', 'currentmonth', 'curmo', 'variable'] },
  { q: 'did the overnight data loads run successfully?',
    expect: ['jobs', 'job console', 'data exchange', 'data management', 'check'] },
  { q: 'how do I run the NetSuite integration manually?',
    expect: ['data exchange', 'data management', 'integration', 'pipeline'] },
  { q: 'which form do I use to adjust the income statement?',
    expect: ['income statement adjustment'] },
  { q: 'what rules run when I save the income statement adjustments form?',
    expect: ['form_incstmtadj', 'on save', 'onsave', 'run after save'] },
  { q: 'explain rule AGG - IncStmt - Forecast',
    expect: ['aggregate', 'income statement', 'forecast'] },
  { q: 'what is the current forecast year?',
    expect: ['fy', 'year', 'nsp_'] },
  { q: 'why would a form show no data?',
    expect: ['pov', 'intersection', 'level', 'member', 'scenario', 'subsidiary'] },
  { q: 'how do I change the period shown on a form?',
    expect: ['pov', 'page', 'period', 'substitution'] },
  { q: 'what does the Company Roster form do?',
    expect: ['workforce', 'employee', 'roster'] },
  { q: 'which integrations load actuals from NetSuite?',
    expect: ['integration', 'data load', 'netsuite', 'fdmee'] },
];

async function ask(question) {
  const body = {
    messages: [{ role: 'user', content: question }],
    language: 'en',
    tenantKb: slimTenantKb(KB),
    forms: kbForms, businessRules: kbRules, variables: kbVars,
    activeSheet: null, forceExplain: true, debug: false,
    settings: { host: null, username: null, password: null, appName: 'NetSuite', geminiKey: GEMINI_KEY },
  };
  const t0 = Date.now();
  const r = await fetch(API + '/api/chat', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const d = await r.json().catch(() => ({}));
  return { status: r.status, ms: Date.now() - t0, reply: (d.reply || d.error || '').toString() };
}

(async () => {
  console.log(`UAT — ${SUITE.length} finance-user questions against ${API}\n`);
  let pass = 0, warn = 0, fail = 0;
  for (const [i, t] of SUITE.entries()) {
    let res;
    try { res = await ask(t.q); }
    catch (e) { res = { status: 0, ms: 0, reply: 'NETWORK: ' + e.message }; }
    const low = res.reply.toLowerCase();
    const hit = t.expect.find(k => low.includes(k));
    const verdict = res.status !== 200 ? 'FAIL' : (hit ? 'PASS' : 'WARN');
    if (verdict === 'PASS') pass++; else if (verdict === 'WARN') warn++; else fail++;
    const snippet = res.reply.replace(/\s+/g, ' ').slice(0, 150);
    console.log(`${String(i + 1).padStart(2)}. [${verdict}] (${res.ms}ms) ${t.q}`);
    console.log(`      ${verdict === 'PASS' ? 'matched "' + hit + '" · ' : ''}${snippet}…\n`);
  }
  console.log(`──────────────────────────────────`);
  console.log(`PASS ${pass} · WARN ${warn} · FAIL ${fail}  (WARN = answered but expected signal missing — review)`);
})();
