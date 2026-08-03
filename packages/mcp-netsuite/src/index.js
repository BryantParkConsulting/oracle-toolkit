#!/usr/bin/env node
'use strict';
/**
 * mcp-netsuite — expone una cuenta NetSuite a Claude por MCP, sobre SuiteQL.
 *
 * Read-only por diseño: SuiteQL no muta, y además se rechaza cualquier consulta
 * que no empiece con SELECT o WITH. El objetivo es poder preguntar en lenguaje
 * natural — "¿cuánto facturamos en 2025?", "¿qué módulos usan?" — sin que el
 * modelo tenga que recordar el esquema ni las trampas de esta base.
 *
 * Las trampas están codificadas en las herramientas, no libradas al prompt:
 * signos del GL invertidos, importes de factura en mainline, revenue sin entity.
 * Ver docs/NETSUITE-DISCOVERY-LEARNINGS.md.
 *
 * Credenciales: las mismas NS_* del toolkit, desde .env en la raíz.
 *
 *   claude mcp add netsuite -- node <ruta>/packages/mcp-netsuite/src/index.js
 */
const path = require('path');
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { ListToolsRequestSchema, CallToolRequestSchema } = require('@modelcontextprotocol/sdk/types.js');

const { suiteql } = require(path.join(__dirname, '..', '..', 'netsuite', 'ns-sql.js'));

const MAX_ROWS = 500;   // techo de lo que se devuelve al modelo: el contexto es finito

/** Solo lectura. SuiteQL no muta, pero cerramos la puerta igual. */
function assertReadOnly(sql) {
  const s = String(sql || '').trim();
  if (!/^(select|with)\b/i.test(s)) throw new Error('Only SELECT / WITH queries are allowed.');
  if (/\b(insert|update|delete|merge|drop|alter|create|truncate)\b/i.test(s))
    throw new Error('Data-modifying statements are not allowed.');
  return s;
}

const table = rows => {
  if (!rows.length) return 'No rows.';
  const cols = Object.keys(rows[0]).filter(c => c !== 'links');
  const w = Object.fromEntries(cols.map(c => [c, Math.min(40, Math.max(c.length, ...rows.map(r => String(r[c] ?? '').length)))]));
  const line = r => cols.map(c => String(r[c] ?? '').slice(0, w[c]).padEnd(w[c])).join('  ');
  return [cols.map(c => c.toUpperCase().padEnd(w[c])).join('  '), ...rows.map(line)].join('\n');
};

const text = s => ({ content: [{ type: 'text', text: s }] });

// ── herramientas ─────────────────────────────────────────────────────────────
const TOOLS = [
  {
    name: 'netsuite_query',
    description: 'Run a read-only SuiteQL query against the connected NetSuite account. Use for anything not covered by the more specific tools. Remember: transactional modules are values of transaction.type, not tables; income and liabilities are stored as negative (credits); invoice amounts live on transactionline.mainline = \'T\'.',
    inputSchema: {
      type: 'object',
      properties: {
        sql: { type: 'string', description: 'A SELECT or WITH statement. Aggregate server-side — never select detail rows from transaction or transactionline.' },
        limit: { type: 'number', description: `Max rows to return (default 200, hard cap ${MAX_ROWS}).` },
      },
      required: ['sql'],
    },
  },
  {
    name: 'netsuite_table_exists',
    description: 'Check whether one or more record types are queryable in this account, and how many rows each holds. A table that does not respond means the feature is disabled OR the integration role cannot see it — the two are indistinguishable, so never report a module as absent on this basis alone.',
    inputSchema: {
      type: 'object',
      properties: { tables: { type: 'array', items: { type: 'string' }, description: 'Record type names, e.g. ["subsidiary","workflow","opportunity"]' } },
      required: ['tables'],
    },
  },
  {
    name: 'netsuite_financials',
    description: 'Profit and loss by year, straight from the general ledger with signs already corrected. Use this rather than writing the query by hand — getting the income sign wrong is the most common mistake when rebuilding statements from the ledger.',
    inputSchema: {
      type: 'object',
      properties: { from_year: { type: 'string', description: 'Earliest calendar year to include, e.g. "2022". Defaults to 2021.' } },
    },
  },
  {
    name: 'netsuite_revenue_by_customer',
    description: 'Billed revenue per customer. Reads the invoice layer on purpose: in many accounts revenue is recognized through journal entries that carry no entity, so the general ledger cannot answer this question.',
    inputSchema: {
      type: 'object',
      properties: {
        from_date: { type: 'string', description: 'ISO date, e.g. "2024-01-01". Defaults to 2024-01-01.' },
        top: { type: 'number', description: 'How many customers to return (default 25).' },
      },
    },
  },
  {
    name: 'netsuite_chart_of_accounts',
    description: 'The chart of accounts with hierarchy and type, optionally flagging which accounts have no journal activity. Useful for sizing an Account dimension before a Planning implementation.',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', description: 'Filter by accttype, e.g. "Income", "Expense", "Bank".' },
        unused_only: { type: 'boolean', description: 'Return only accounts with no accounting lines at all.' },
      },
    },
  },
  {
    name: 'netsuite_dimension_coverage',
    description: 'What share of transaction lines actually carry a value for each segment (subsidiary, department, class, location) over the last twelve months. This is what determines the granularity a report or a plan can support — member counts alone are misleading.',
    inputSchema: { type: 'object', properties: {} },
  },
];

// ── implementación ───────────────────────────────────────────────────────────
async function run(name, a = {}) {
  switch (name) {
    case 'netsuite_query': {
      const sql = assertReadOnly(a.sql);
      const cap = Math.min(Number(a.limit) || 200, MAX_ROWS);
      const rows = await suiteql(sql, cap);
      const shown = rows.slice(0, cap);
      return text(table(shown) + (rows.length > shown.length ? `\n\n(${rows.length} rows total, showing ${shown.length})` : `\n\n${rows.length} row(s).`));
    }

    case 'netsuite_table_exists': {
      const out = [];
      for (const t of (a.tables || [])) {
        if (!/^[a-z0-9_]+$/i.test(t)) { out.push(`  ?  ${t} — invalid name`); continue; }
        try {
          const r = await suiteql(`SELECT COUNT(*) AS n FROM ${t}`, 1);
          out.push(`  ✓  ${t.padEnd(30)} ${Number(r[0]?.n || 0).toLocaleString('en-US')} rows`);
        } catch (e) {
          const notFound = /was not found|Unknown identifier|Invalid search/i.test(e.message);
          out.push(`  ·  ${t.padEnd(30)} ${notFound ? 'not visible (feature off, or role cannot see it)' : e.message.slice(0, 60)}`);
        }
      }
      return text(out.join('\n'));
    }

    case 'netsuite_financials': {
      const from = /^\d{4}$/.test(String(a.from_year)) ? a.from_year : '2021';
      // El signo se invierte acá para que el modelo no tenga que acordarse.
      const rows = await suiteql(`
        SELECT TO_CHAR(t.trandate,'YYYY') AS year, a.accttype AS type, ROUND(SUM(tal.amount)) AS amount
        FROM transactionaccountingline tal
        JOIN transaction t ON t.id = tal.transaction
        JOIN account a ON a.id = tal.account
        WHERE tal.posting = 'T'
          AND a.accttype IN ('Income','OthIncome','COGS','Expense','OthExpense')
          AND t.trandate >= TO_DATE('${from}-01-01','YYYY-MM-DD')
        GROUP BY TO_CHAR(t.trandate,'YYYY'), a.accttype ORDER BY 1, 2`, 5000);
      const y = {};
      for (const r of rows) {
        const k = r.year; if (!k) continue;
        y[k] ||= { revenue: 0, cogs: 0, opex: 0 };
        const m = Number(r.amount || 0);
        if (r.type === 'Income' || r.type === 'OthIncome') y[k].revenue += -m;
        else if (r.type === 'COGS') y[k].cogs += m; else y[k].opex += m;
      }
      const out = Object.entries(y).sort().map(([k, d]) => ({
        year: k, revenue: Math.round(d.revenue), cogs: Math.round(d.cogs), opex: Math.round(d.opex),
        gross_margin_pct: d.revenue ? (100 * (d.revenue - d.cogs) / d.revenue).toFixed(1) : '',
        net_result: Math.round(d.revenue - d.cogs - d.opex),
      }));
      return text(table(out) + '\n\nSigns corrected (NetSuite stores income as credits). Posted entries only — not audited statements. The most recent year is usually partial.');
    }

    case 'netsuite_revenue_by_customer': {
      const from = /^\d{4}-\d{2}-\d{2}$/.test(String(a.from_date)) ? a.from_date : '2024-01-01';
      const top = Math.min(Number(a.top) || 25, 200);
      const rows = await suiteql(`
        SELECT e.altname AS customer, ROUND(SUM(tl.netamount)) AS billed, COUNT(*) AS invoices
        FROM transactionline tl
        JOIN transaction t ON t.id = tl.transaction
        JOIN entity e ON e.id = t.entity
        WHERE t.type = 'CustInvc' AND tl.mainline = 'T' AND t.trandate >= TO_DATE('${from}','YYYY-MM-DD')
        GROUP BY e.altname ORDER BY 2 DESC`, 20000);
      const pos = rows.filter(r => Number(r.billed) > 0);
      const total = pos.reduce((s, r) => s + Number(r.billed), 0);
      const t10 = pos.slice(0, 10).reduce((s, r) => s + Number(r.billed), 0);
      return text(table(pos.slice(0, top)) +
        `\n\n${pos.length} customers billed since ${from}. Top 10 = ${total ? (100 * t10 / total).toFixed(1) : 0}% of the total.` +
        `\nRead from the invoice layer — the general ledger carries no customer on revenue in most accounts.`);
    }

    case 'netsuite_chart_of_accounts': {
      if (a.unused_only) {
        const rows = await suiteql(`
          SELECT a.acctnumber, a.accountsearchdisplayname AS name, a.accttype
          FROM account a WHERE NOT EXISTS (SELECT 1 FROM transactionaccountingline tal WHERE tal.account = a.id)
          ORDER BY a.acctnumber`, 2000);
        return text(table(rows.slice(0, MAX_ROWS)) + `\n\n${rows.length} accounts with no accounting lines at all.`);
      }
      const where = a.type && /^[a-z]+$/i.test(a.type) ? `WHERE a.accttype = '${a.type}'` : '';
      const rows = await suiteql(`
        SELECT a.acctnumber, a.accountsearchdisplayname AS name, a.accttype, a.parent, a.isinactive
        FROM account a ${where} ORDER BY a.acctnumber`, 3000);
      return text(table(rows.slice(0, MAX_ROWS)) + `\n\n${rows.length} accounts.` +
        (rows.length > MAX_ROWS ? ` Showing the first ${MAX_ROWS}.` : ''));
    }

    case 'netsuite_dimension_coverage': {
      const r = (await suiteql(`
        SELECT COUNT(*) AS total_lines,
               COUNT(tl.subsidiary) AS subsidiary, COUNT(tl.department) AS department,
               COUNT(tl.class) AS class, COUNT(tl.location) AS location
        FROM transactionline tl JOIN transaction t ON t.id = tl.transaction
        WHERE t.trandate >= ADD_MONTHS(SYSDATE, -12)`, 1))[0] || {};
      const tot = Number(r.total_lines || 0);
      if (!tot) return text('No transaction lines in the last twelve months.');
      const out = ['subsidiary', 'department', 'class', 'location'].map(k => {
        const p = 100 * Number(r[k] || 0) / tot;
        return { segment: k, tagged_pct: p.toFixed(1), verdict: p >= 95 ? 'reliable' : p >= 70 ? 'usable, confirm the gap' : p >= 30 ? 'partial — not safe for reporting' : 'effectively untagged' };
      });
      return text(table(out) + `\n\nAcross ${tot.toLocaleString('en-US')} transaction lines in the last twelve months.` +
        `\nA plan or report can only be as granular as the tagged actuals underneath it.`);
    }

    default: throw new Error(`Unknown tool: ${name}`);
  }
}

// ── servidor ─────────────────────────────────────────────────────────────────
const server = new Server({ name: 'netsuite', version: '0.1.0' }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
server.setRequestHandler(CallToolRequestSchema, async (req) => {
  try {
    return await run(req.params.name, req.params.arguments || {});
  } catch (e) {
    return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true };
  }
});

(async () => {
  await server.connect(new StdioServerTransport());
  console.error('mcp-netsuite ready');
})();
