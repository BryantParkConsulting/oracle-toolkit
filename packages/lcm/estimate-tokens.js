'use strict';
const kb = require('./tenant-kb-client.json');

const forms = kb.forms || [];
const rules = kb.rules || [];
const navFlows = kb.navigationFlows || [];
const vars = kb.substitutionVariables || [];

const tokens = s => typeof s === 'number' ? Math.round(s / 4) : Math.round(s.length / 4);

const formsText = forms.map(f => {
  const rr = (f.attachedRules||[]).map(r => r.name + (r.runOnSave ? '(onSave)' : '')).join(', ');
  const desc = (f.description||'').slice(0, 80);
  return '  - ' + f.name + ' ' + (f.isInput ? '[input]' : '[review]') + ' cube=' + f.cube + (desc ? ' -- ' + desc : '') + (rr ? ' | rules: ' + rr : '');
}).join('\n');

const rulesText = rules.map(r =>
  '  - ' + r.name + ' -- ' + (r.description||'').slice(0, 60) + ' | forms: ' + (r.attachedToForms||[]).slice(0,3).join(', ')
).join('\n');

const navText = navFlows.flatMap(f => f.modules.map(m =>
  '  - ' + m.module + ': tabs=' + m.tabs.slice(0,4).join(' / ')
)).join('\n');

const varsText = vars.map(v => '  - ' + v.name + ' = ' + v.value).join('\n');

const FIXED_INSTRUCTIONS = 10000; // chars: all the tool descriptions, persona, etc.
const kbSection = formsText.length + rulesText.length + navText.length + varsText.length;
const total = FIXED_INSTRUCTIONS + kbSection;

console.log('=== TOKEN ESTIMATE PER REQUEST ===');
console.log('Fixed instructions:       ~' + FIXED_INSTRUCTIONS + ' chars = ~' + tokens(FIXED_INSTRUCTIONS) + ' tokens');
console.log('Forms inventory:           ' + formsText.length + ' chars = ~' + tokens(formsText) + ' tokens');
console.log('Rules inventory:           ' + rulesText.length + ' chars = ~' + tokens(rulesText) + ' tokens');
console.log('Navigation flows:          ' + navText.length + ' chars = ~' + tokens(navText) + ' tokens');
console.log('Substitution variables:    ' + varsText.length + ' chars = ~' + tokens(varsText) + ' tokens');
console.log('');
console.log('TOTAL SYSTEM PROMPT:      ~' + total + ' chars = ~' + tokens(total) + ' tokens');

const sysTokens = tokens(total);
const historyTokens = 1500; // avg conversation history
const userMsgTokens = 100;
const inputTokens = sysTokens + historyTokens + userMsgTokens;
const outputTokens = 600;

console.log('');
console.log('=== COST PER QUERY ===');
console.log('Input tokens:  ~' + inputTokens + ' (system + history + message)');
console.log('Output tokens: ~' + outputTokens);

const flashIn  = 0.075  / 1e6;
const flashOut = 0.30   / 1e6;
const proIn    = 1.25   / 1e6;
const proOut   = 10.0   / 1e6;

const flashCost = inputTokens * flashIn + outputTokens * flashOut;
const proCost   = inputTokens * proIn   + outputTokens * proOut;

console.log('');
console.log('Gemini 2.5 Flash:  $' + flashCost.toFixed(5) + ' / query');
console.log('Gemini 2.5 Pro:    $' + proCost.toFixed(4)  + ' / query');

console.log('');
console.log('=== 20 USERS x 20 QUERIES/DAY ===');
const q = 20 * 20;
console.log('Queries/day: ' + q);
console.log('Flash  -- daily: $' + (q * flashCost).toFixed(2) + '  monthly: $' + (q * flashCost * 30).toFixed(2));
console.log('Pro    -- daily: $' + (q * proCost).toFixed(2)   + '  monthly: $' + (q * proCost   * 30).toFixed(2));
console.log('Mixed (80% Flash / 20% Pro):');
const mixedCost = 0.8 * flashCost + 0.2 * proCost;
console.log('  daily: $' + (q * mixedCost).toFixed(2) + '  monthly: $' + (q * mixedCost * 30).toFixed(2));
