#!/usr/bin/env node
'use strict';
/**
 * netsuite-full-pack.js — los cuatro entregables en un solo PDF, separados por
 * páginas divisorias a pantalla completa.
 *
 * No reimplementa el contenido: lee el HTML que ya generaron los cuatro
 * generadores, les saca la portada y los encadena. Así hay un solo lugar donde
 * vive cada sección — si cambia el brief, el pack cambia solo.
 *
 * Requiere que los cuatro se hayan generado antes. Los que falten se omiten y se
 * avisa: mejor un pack incompleto y explícito que uno con secciones vacías.
 *
 *   CLIENT=pra CLIENT_NAME=PRA node packages/reports/netsuite-full-pack.js
 */
const fs = require('fs');
const path = require('path');
const S = require('./_shell');

const CLIENT = process.env.CLIENT || 'pra';
const NAME = process.env.CLIENT_NAME || CLIENT.toUpperCase();
const DIR = path.join(S.ROOT, 'clients', CLIENT);
const { esc } = S;

// `sys` es lo que evita que el lector se pierda entre partes: cada una habla de
// un sistema distinto, y el documento tiene que decirlo antes de empezar.
const SECTIONS = [
  { file: `${CLIENT}-executive-brief.html`, num: '1', t: 'Executive Brief',
    sys: 'NETSUITE · FOR THE FINANCE SPONSOR',
    d: 'Where the business stands according to NetSuite, what we found, and where we would start. The short version, for anyone who will not read the rest.' },
  { file: `${CLIENT}-netsuite-abr-full.html`, num: '2', t: 'Account Analysis',
    sys: 'NETSUITE · FULL ANALYSIS',
    d: 'How the business runs according to the system, which NetSuite modules are configured and actually used, the connected ecosystem, and our recommendations.' },
  { file: `${CLIENT}-nspb-integration.html`, num: '3', t: 'Planning Integration Discovery',
    sys: 'NETSUITE → ORACLE EPM PLANNING · FOR THE IMPLEMENTATION TEAM',
    d: 'What the NetSuite side offers a Planning implementation: dimensions, tagging coverage, reconciliation feasibility and the saved searches the integration would need.' },
  { file: `${CLIENT}-optimization-review.html`, num: '4', t: 'Optimization Review',
    sys: 'NETSUITE · FOR THE SYSTEM ADMINISTRATORS',
    d: 'NetSuite configuration that appears unused — fields, accounts, script deployments — each with the caveat that would make it a false positive.' },
];

/** Saca la portada y el wrapper, deja solo el contenido de la sección. */
function bodyOf(file) {
  const p = path.join(DIR, file);
  if (!fs.existsSync(p)) return null;
  const html = fs.readFileSync(p, 'utf8');
  const body = html.slice(html.indexOf('<body>') + 6, html.lastIndexOf('</body>'));
  // La portada es el primer <div class="cover">…</div>; termina justo antes del
  // primer salto de página, que es como cada documento arranca su contenido.
  const brk = body.indexOf('<div class="page-break">');
  return brk > -1 ? body.slice(brk + '<div class="page-break"></div>'.length) : body;
}

const found = SECTIONS.map(s => ({ ...s, body: bodyOf(s.file) })).filter(s => s.body !== null);
const missing = SECTIONS.filter(s => !found.find(f => f.file === s.file));
if (!found.length) {
  console.error(`No hay HTML generado en ${DIR}. Corré primero los cuatro generadores.`);
  process.exit(1);
}
if (missing.length) console.log(`  ⚠ omitidas (sin generar): ${missing.map(m => m.t).join(', ')}`);

// El salto va en su propio div: si `page-break-before` vive en .divider, su
// margen negativo superior sangra sobre la página anterior y deja una franja.
const divider = s => `<div class="page-break"></div><div class="divider">
  <div class="dnum">${s.num}</div>
  <div>
    <div class="dsys">${esc(s.sys)}</div>
    <h1>${esc(s.t)}</h1>
    <p>${esc(s.d)}</p>
  </div>
  <div class="dfoot">${esc(NAME)} · Part ${s.num} of ${found.length}</div>
</div>`;

const extraCss = `
.divider{height:262mm;display:flex;flex-direction:column;justify-content:center;
  background:linear-gradient(150deg,${S.NAVY} 0%,#16303f 100%);color:#fff;margin:-14mm -13mm;padding:22mm 18mm;position:relative}
.divider .dsys{font-size:8.2pt;font-weight:700;letter-spacing:.09em;color:${S.GOLD};margin-bottom:7px}
.divider .dnum{font-size:86pt;font-weight:800;color:${S.GOLD};opacity:.28;line-height:.9;margin-bottom:6mm}
.divider h1{color:#fff;font-size:26pt;margin:0 0 8px;line-height:1.15}
.divider p{font-size:11pt;opacity:.85;max-width:118mm;margin:0}
.divider .dfoot{position:absolute;bottom:22mm;left:18mm;font-size:8.3pt;opacity:.55}
.toc{margin:14px 0}
.toc div{display:flex;gap:10px;padding:7px 0;border-bottom:1px solid #eceff1}
.toc .n{color:${S.SAGE};font-weight:700;min-width:18px}
.toc .t{font-weight:600;color:${S.NAVY};min-width:74mm}
.toc .d{color:#6b7280;font-size:8.4pt}
`;

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>${esc(NAME)} — NetSuite Account Analysis</title>
<style>${S.CSS}${extraCss}</style></head><body>
${S.cover({
  name: NAME,
  sub: 'NetSuite — Complete Account Analysis',
  meta: `Four documents in one: executive summary, full account analysis, Planning integration discovery and optimization review.`,
  footer: `Generated ${new Date().toISOString().slice(0, 10)} from the live account over SuiteQL / REST.<br>Every figure is measured, none estimated. Recommendations are suggestions to validate together.`,
})}

<div class="page-break"></div>
<h2>What is in this document</h2>
<div class="toc">
${found.map(s => `<div><span class="n">${s.num}</span><span class="t">${esc(s.t)}<br><span class="small" style="font-weight:400">${esc(s.sys)}</span></span><span class="d">${esc(s.d)}</span></div>`).join('')}
</div>
<p class="small">Each part is also available as a standalone document, so it can be shared with the audience it was written for without the rest.</p>

${found.map(s => divider(s) + s.body).join('\n')}
</body></html>`;

const htmlFile = path.join(DIR, `${CLIENT}-netsuite-complete.html`);
const pdfFile = path.join(DIR, `${CLIENT}-netsuite-complete.pdf`);
S.renderPdf(html, htmlFile, pdfFile)
  .then(() => console.log(`   ${found.length} sections: ${found.map(s => s.t).join(' · ')}`))
  .catch(e => { console.error('PDF ERROR:', e.message); process.exit(1); });
