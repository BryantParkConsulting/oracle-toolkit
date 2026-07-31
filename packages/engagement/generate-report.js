'use strict';
// Engagement-hours report generator — works for ANY Managed Services customer.
//
//   node generate-report.js <client>      e.g.  node generate-report.js overture
//
// Reads clients/<client>/config.js, renders clients/<client>/engagement-report.html,
// then prints it to clients/<client>/engagement-report.pdf via headless Chrome (see README).
const fs = require('fs');
const path = require('path');
const { buildHtml } = require('./lib/template');
const { htmlToPdf } = require('./lib/render');

const client = (process.argv[2] || '').trim().toLowerCase();
if (!client) { console.error('Usage: node generate-report.js <client>   (folder name under clients/)'); process.exit(1); }

const clientDir = path.join(__dirname, 'clients', client);
const configPath = path.join(clientDir, 'config.js');
if (!fs.existsSync(configPath)) { console.error(`No config at ${path.relative(__dirname, configPath)} — copy clients/_TEMPLATE/config.js and fill it.`); process.exit(1); }

const cfg = require(configPath);
const htmlFile = path.join(clientDir, 'engagement-report.html');
const pdfFile = path.join(clientDir, 'engagement-report.pdf');

const html = buildHtml(cfg, clientDir);
fs.writeFileSync(htmlFile, html);
console.log('✓ wrote', path.relative(__dirname, htmlFile), `(${(html.length / 1024).toFixed(0)} KB)`);

const port = process.env.CDP_PORT || 9222;
htmlToPdf(htmlFile, pdfFile, port)
  .then(() => console.log('✓ wrote', path.relative(__dirname, pdfFile), `(${(fs.statSync(pdfFile).size / 1024).toFixed(0)} KB)`))
  .catch(e => {
    console.error('\nPDF step failed:', e.message);
    console.error(`Is headless Chrome listening on :${port}? See README §Run. The HTML above is fine — open it in a browser and Print-to-PDF as a fallback.`);
    process.exit(1);
  });
