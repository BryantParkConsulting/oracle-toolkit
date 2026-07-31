#!/usr/bin/env node
'use strict';
/**
 * ns-financials.js — mapa del plan de cuentas + Income Statement y Balance Sheet
 * reconstruidos, orientados a la integración con NSPB.
 *
 * Por qué existe: el primer trabajo de cualquier implementación de Planning es
 * mapear el COA de NetSuite a la dimensión Account. Ese trabajo se hace hoy a
 * mano, mirando pantallas. Acá sale del dato: jerarquía real, qué es hoja y qué
 * es rollup, qué cuenta tiene movimiento y cuál no, y cómo se agrupa cada una en
 * IS o BS.
 *
 * Entrada:  netsuite/coa.json (445 cuentas con parent) + netsuite/balances.json
 * Salida:   erp/financials.json  — estructura para el diseño de la dimensión
 *           erp/FINANCIALS.md    — COA map + IS + BS legibles
 *
 * Uso: CLIENT=<cliente> node packages/netsuite/ns-financials.js
 */
const fs = require('fs');
const path = require('path');

const CLIENT = process.env.CLIENT || 'pra';
const ROOT = path.join(__dirname, '..', '..');
const DIR = path.join(ROOT, 'clients', CLIENT);
const rd = f => { try { return JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')); } catch { return null; } };

const coa = rd('netsuite/coa.json');
if (!coa) { console.error('Falta netsuite/coa.json — corré la consulta del COA primero.'); process.exit(1); }
const balances = rd('netsuite/balances.json') || [];

const fmt = x => Number(x || 0).toLocaleString('en-US');
const money = x => (x < 0 ? '-' : '') + '$' + Math.abs(Number(x) || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });

/**
 * Clasificación de accttype de NetSuite en las dos caras del estado financiero.
 * El signo importa: NetSuite guarda Income y pasivos como crédito (negativo),
 * así que para presentarlos hay que invertirlos. Equivocarse acá es el error más
 * común al reconstruir un P&L desde el GL.
 */
const IS_TYPES = { Income: 'Revenue', OthIncome: 'Other income', COGS: 'Cost of sales', Expense: 'Operating expenses', OthExpense: 'Other expenses' };
const BS_TYPES = {
  Bank: 'Current assets', AcctRec: 'Current assets', OthCurrAsset: 'Current assets',
  FixedAsset: 'Non-current assets', OthAsset: 'Non-current assets', DeferExpense: 'Non-current assets',
  AcctPay: 'Current liabilities', CredCard: 'Current liabilities', OthCurrLiab: 'Current liabilities',
  LongTermLiab: 'Non-current liabilities', DeferRevenue: 'Non-current liabilities',
  Equity: 'Equity', RetEarnings: 'Equity',
};
const FLIP = new Set(['Income', 'OthIncome', 'AcctPay', 'CredCard', 'OthCurrLiab', 'LongTermLiab', 'DeferRevenue', 'Equity', 'RetEarnings']);

// ── índice de cuentas + jerarquía ────────────────────────────────────────────
const byId = new Map(coa.map(a => [String(a.id), {
  id: String(a.id), number: a.acctnumber || '', name: a.name || '',
  type: a.accttype || '', parent: a.parent ? String(a.parent) : null,
  inactive: a.isinactive === 'T', summary: a.issummary === 'T',
  children: [], amounts: {}, lines: 0,
}]));
for (const a of byId.values()) if (a.parent && byId.has(a.parent)) byId.get(a.parent).children.push(a);

const roots = [...byId.values()].filter(a => !a.parent || !byId.has(a.parent));
const depthOf = (a, d = 0) => a.children.length ? Math.max(...a.children.map(c => depthOf(c, d + 1))) : d;
const maxDepth = roots.length ? Math.max(...roots.map(r => depthOf(r))) + 1 : 0;

// ── saldos ───────────────────────────────────────────────────────────────────
// Los schedules de revenue y amortización proyectan asientos a futuro (acá hasta
// 2035). Se descartan los años sin movimiento real para no ensuciar el estado.
const yearActivity = {};
for (const b of balances) if (b.y) yearActivity[b.y] = (yearActivity[b.y] || 0) + Math.abs(Number(b.amt || 0));
const years = Object.keys(yearActivity).filter(y => yearActivity[y] > 0).sort();
for (const b of balances) {
  const a = byId.get(String(b.acct)); if (!a) continue;
  a.amounts[b.y] = (a.amounts[b.y] || 0) + Number(b.amt || 0);
  a.lines += Number(b.lines || 0);
}
// Un rollup no tiene movimiento propio: hereda el de sus hojas.
function rollup(a) {
  for (const c of a.children) rollup(c);
  for (const c of a.children) { for (const [y, v] of Object.entries(c.rolled || c.amounts)) { (a.rolled ||= { ...a.amounts })[y] = (a.rolled[y] || 0) + v; } }
  a.rolled ||= { ...a.amounts };
  return a;
}
roots.forEach(rollup);

const leaves = [...byId.values()].filter(a => !a.children.length);
const withActivity = [...byId.values()].filter(a => a.lines > 0);
const leavesNoActivity = leaves.filter(a => !a.lines && !a.inactive);

// ── estados financieros ──────────────────────────────────────────────────────
function statement(map) {
  const groups = {};
  for (const a of byId.values()) {
    const g = map[a.type]; if (!g) continue;
    if (a.children.length) continue;               // solo hojas: los padres se suman abajo
    (groups[g] ||= { accounts: [], totals: {} }).accounts.push(a);
    for (const y of years) {
      const raw = a.amounts[y] || 0;
      groups[g].totals[y] = (groups[g].totals[y] || 0) + (FLIP.has(a.type) ? -raw : raw);
    }
  }
  return groups;
}
const IS = statement(IS_TYPES);
const BS = statement(BS_TYPES);

const sumGroups = (st, names) => Object.fromEntries(years.map(y => [y, names.reduce((s, g) => s + (st[g]?.totals[y] || 0), 0)]));
const revenue = sumGroups(IS, ['Revenue', 'Other income']);
const cos = sumGroups(IS, ['Cost of sales']);
const opex = sumGroups(IS, ['Operating expenses', 'Other expenses']);

// ── salida para el diseño de la dimensión Account de NSPB ────────────────────
const out = {
  client: CLIENT, generatedAt: new Date().toISOString().slice(0, 10),
  coa: {
    total: byId.size, active: [...byId.values()].filter(a => !a.inactive).length,
    leaves: leaves.length, rollups: byId.size - leaves.length,
    maxDepth, roots: roots.length,
    withActivity: withActivity.length,
    leavesWithoutActivity: leavesNoActivity.length,
    byType: Object.entries([...byId.values()].reduce((m, a) => { m[a.type] = (m[a.type] || 0) + 1; return m; }, {})).sort((x, y) => y[1] - x[1]),
  },
  nspbDimensionNotes: [
    `La dimensión Account de Planning se alimenta de las ${leaves.length} hojas, no de las ${byId.size} cuentas: los ${byId.size - leaves.length} rollups se reconstruyen con la jerarquía de Planning.`,
    `${leavesNoActivity.length} hojas activas no tienen ni una línea contable en el período analizado — candidatas a excluir del mapeo.`,
    `Profundidad máxima del árbol: ${maxDepth} niveles. Planning necesita al menos esa para reproducir el rollup nativo.`,
    `Cuentas de tipo Statistical: se mapean a la dimensión Account pero no cargan moneda — verificar el tratamiento antes de diseñar.`,
  ],
  incomeStatement: Object.fromEntries(Object.entries(IS).map(([g, v]) => [g, { accounts: v.accounts.length, totals: v.totals }])),
  balanceSheet: Object.fromEntries(Object.entries(BS).map(([g, v]) => [g, { accounts: v.accounts.length, totals: v.totals }])),
  years,
  caveats: [
    "Cifras del GL con posting='T', agregadas por año calendario. NO son estados financieros auditados ni respetan el calendario fiscal del cliente.",
    'Income y pasivos se invierten de signo para presentarlos: NetSuite los guarda como crédito (negativo).',
    'El Balance Sheet acá muestra el MOVIMIENTO del período, no el saldo acumulado: para saldos de apertura hace falta traer el histórico completo.',
  ],
};
fs.mkdirSync(path.join(DIR, 'erp'), { recursive: true });
fs.writeFileSync(path.join(DIR, 'erp', 'financials.json'), JSON.stringify(out, null, 2));

// ── markdown ─────────────────────────────────────────────────────────────────
const L = [];
const p = (...s) => L.push(...s);   // varargs: se llama con la fila y su separador
const yCols = years.map(y => `| ${y}`).join(' ');

p(`# Chart of accounts, Income Statement & Balance Sheet — ${CLIENT}`, '');
p(`Reconstruido desde el GL de NetSuite. Pensado como insumo para el mapeo de la dimensión **Account** de NSPB.`, '');

p(`## 1. Estructura del plan de cuentas`, '');
p(`| | |`, `| --- | ---: |`);
p(`| Cuentas totales | ${fmt(byId.size)} |`);
p(`| Activas | ${fmt(out.coa.active)} |`);
p(`| **Hojas** (las que se mapean) | **${fmt(leaves.length)}** |`);
p(`| Rollups / summary | ${fmt(out.coa.rollups)} |`);
p(`| Profundidad máxima | ${maxDepth} niveles |`);
p(`| Con movimiento en el período | ${fmt(withActivity.length)} |`);
p(`| Hojas activas SIN movimiento | ${fmt(leavesNoActivity.length)} |`, '');

p(`### Por tipo de cuenta`, '');
p(`| Tipo | Cuentas | Cara del estado |`, `| --- | ---: | --- |`);
for (const [t, c] of out.coa.byType) p(`| ${t} | ${c} | ${IS_TYPES[t] ? 'P&L — ' + IS_TYPES[t] : BS_TYPES[t] ? 'Balance — ' + BS_TYPES[t] : '—'} |`);
p('');

p(`### Qué significa para el mapeo a NSPB`, '');
out.nspbDimensionNotes.forEach(x => p(`- ${x}`));
p('');

p(`## 2. Income Statement`, '');
p(`| Línea | Cuentas ${yCols} |`);
p(`| --- | ---: ${years.map(() => '| ---:').join(' ')} |`);
for (const g of ['Revenue', 'Other income', 'Cost of sales', 'Operating expenses', 'Other expenses']) {
  if (!IS[g]) continue;
  p(`| ${g} | ${IS[g].accounts.length} ${years.map(y => `| ${money(IS[g].totals[y] || 0)}`).join(' ')} |`);
}
p(`| **Gross profit** | ${years.map(y => `| **${money((revenue[y] || 0) - (cos[y] || 0))}**`).join(' ')} |`.replace('| |', '| — |'));
p(`| **Net result** | ${years.map(y => `| **${money((revenue[y] || 0) - (cos[y] || 0) - (opex[y] || 0))}**`).join(' ')} |`.replace('| |', '| — |'));
p('');
p(`Margen bruto: ${years.map(y => `${y} ${revenue[y] ? (100 * ((revenue[y] - cos[y]) / revenue[y])).toFixed(0) : '—'}%`).join(' · ')}`, '');

p(`## 3. Balance Sheet (movimiento del período)`, '');
p(`| Línea | Cuentas ${yCols} |`);
p(`| --- | ---: ${years.map(() => '| ---:').join(' ')} |`);
for (const g of ['Current assets', 'Non-current assets', 'Current liabilities', 'Non-current liabilities', 'Equity']) {
  if (!BS[g]) continue;
  p(`| ${g} | ${BS[g].accounts.length} ${years.map(y => `| ${money(BS[g].totals[y] || 0)}`).join(' ')} |`);
}
p('');

p(`## 4. Salvedades`, '');
out.caveats.forEach(c => p(`- ${c}`));
p('');

fs.writeFileSync(path.join(DIR, 'erp', 'FINANCIALS.md'), L.join('\n'));
console.log(`→ ${path.join(DIR, 'erp', 'financials.json')}`);
console.log(`→ ${path.join(DIR, 'erp', 'FINANCIALS.md')}`);
console.log(`   ${fmt(byId.size)} cuentas · ${fmt(leaves.length)} hojas · ${maxDepth} niveles · ${fmt(leavesNoActivity.length)} hojas sin movimiento`);
