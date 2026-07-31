'use strict';
// NSPB FULL IMPLEMENTATION REPORT — everything configured in the tenant, from
// the LCM parse output (tenant-kb.json) + raw LCM artifacts. No telemetry needed
// (unlike architecture-report.js / state-report-pdf.js).
//   node tools/impl-report-pdf.js [CLIENT]
// Writes: clients/<CLIENT>/implementation-report.html + .pdf (via debug Chrome :9222)

const fs = require('fs');
const path = require('path');
const PORT = process.env.CDP_PORT || 9222;
const ROOT = path.join(__dirname, '..', '..');
const CLIENT = process.argv[2] || 'spindrift';
const dir = path.join(ROOT, 'clients', CLIENT);
const CAP = CLIENT[0].toUpperCase() + CLIENT.slice(1);

const NAVY = '#1F3C51', SAGE = '#619C8A', GOLD = '#F2CC5F', ORANGE = '#EC8842', DANGER = '#C9512E', GRAY = '#D9D9D9';
const INK = '#374151', SUB = '#6b7280';
const b64 = f => fs.existsSync(f) ? fs.readFileSync(f).toString('base64') : '';
const LOGO_B64 = b64(path.join(ROOT, 'desgincode', 'assets', 'logo', 'bpc-logo.png'));
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const n = x => Number(x).toLocaleString('en-US');

const kb = JSON.parse(fs.readFileSync(path.join(dir, 'tenant-kb.json'), 'utf8'));
const hp = fs.readdirSync(dir).find(f => f.startsWith('HP-'));
const hpRes = hp ? path.join(dir, hp, 'resource') : null;
const APP = hp ? hp.replace(/^HP-/, '') : (kb.appName || CAP);

// ── cubes: from raw LCM Cube folder (kb.forms carry numeric cube ids) ─
const cubes = hpRes && fs.existsSync(path.join(hpRes, 'Cube'))
  ? fs.readdirSync(path.join(hpRes, 'Cube')) : [];

// ── dimensions ────────────────────────────────────────────────────────
const DIMS = Object.entries(kb.dimensions).map(([name, members]) => ({ name, count: Array.isArray(members) ? members.length : 0 }))
  .sort((a, b) => b.count - a.count);

// ── forms ─────────────────────────────────────────────────────────────
const forms = kb.forms || [];
const formsInput = forms.filter(f => f.isInput && !f.isReadOnly);
const formsWithRules = forms.filter(f => (f.attachedRules || []).length);
// group by path (folder) for the catalog
const formFolders = {};
forms.forEach(f => { const p = f.path || '(root)'; (formFolders[p] = formFolders[p] || []).push(f); });

// ── rules ─────────────────────────────────────────────────────────────
const rules = kb.rules || [];
const byCube = {};
rules.forEach(r => { (byCube[r.cube || '?'] = byCube[r.cube || '?'] || []).push(r); });
const groovy = rules.filter(r => /groovy/i.test(r.scriptType || ''));
const attached = rules.filter(r => (r.attachedToForms || []).length);

// ── FDMEE / integrations ──────────────────────────────────────────────
const DS = (kb.fdmee && kb.fdmee.datasources) || [];
const INTEG = (kb.fdmee && kb.fdmee.integrations) || [];

// ── global artifacts present in the LCM (jobs, smart lists, task lists…)
const gaDir = hpRes ? path.join(hpRes, 'Global Artifacts') : null;
const listGA = sub => {
  const p = gaDir && path.join(gaDir, sub);
  if (!p || !fs.existsSync(p)) return [];
  return fs.readdirSync(p).map(f => f.replace(/\.(xml|csv)$/i, ''));
};
const smartLists = listGA('Smart Lists');
const taskLists = listGA('Task Lists');
const jobs = listGA('Jobs');
const customMenus = listGA('Custom Menus');
const hasSecurity = hpRes && fs.existsSync(path.join(hpRes, 'Security'));

// ── settings (Configuration/) ─────────────────────────────────────────
const cfgDir = hpRes && path.join(hpRes, 'Configuration');
const cfgFiles = cfgDir && fs.existsSync(cfgDir) ? fs.readdirSync(cfgDir) : [];

const SUBVARS = kb.substitutionVariables || [];
const DASH = kb.dashboards || [];
const FRS = kb.financialReports || [];
const NAV = kb.navigationFlows || [];

const DATE_STR = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

// ── html helpers ──────────────────────────────────────────────────────
const stat = (v, l) => `<div class="stat"><div class="v">${v}</div><div class="l">${l}</div></div>`;
const table = (heads, rows, cls) => `<table class="${cls || ''}"><thead><tr>${heads.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
const sec = (id, t, body) => `<div class="sec"><h2><span class="num">${id}</span>${t}</h2>${body}</div>`;
const note = t => `<div class="note">${t}</div>`;

// datasource rows (NetSuite saved-search backed loads)
const dsRows = DS.map(d => [esc(d.name), esc(d.type || ''), esc(d.appType || '')]);
const integRows = INTEG.map(i => [esc(i.appName), esc(i.targetCube || ''), (i.rules || []).map(r => esc(r.name)).join(', '), (i.mappingDims || []).join(', ')]);

// rule catalog rows (name, cube, type, attached forms, what it does)
const ruleRows = rules.slice().sort((a, b) => (a.cube || '').localeCompare(b.cube || '') || a.name.localeCompare(b.name))
  .map(r => [esc(r.name), esc(r.cube), /groovy/i.test(r.scriptType || '') ? 'Groovy' : 'Calc', (r.attachedToForms || []).length ? esc((r.attachedToForms || []).join(', ')) : '—', esc((r.description || '').slice(0, 110))]);

// form folder rows
const folderRows = Object.entries(formFolders).sort((a, b) => b[1].length - a[1].length)
  .map(([p, fl]) => [esc(p), fl.length, fl.filter(f => f.isInput && !f.isReadOnly).length, fl.filter(f => (f.attachedRules || []).length).length]);

// dependency pairs: form → rules
const depRows = formsWithRules.slice(0, 60).map(f => [esc(f.name), esc((f.attachedRules || []).map(r => r.name || r).join(', '))]);

const subvarRows = SUBVARS.map(v => [esc(v.name), `<code>${esc(v.value)}</code>`, esc(v.planType || 'ALL')]);

const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  @page { size: letter portrait; margin: 14mm 12mm 16mm 12mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: ${INK}; font-size: 9.5px; margin: 0; }
  .cover { background: ${NAVY}; color: #fff; border-radius: 10px; padding: 34px 30px; margin-bottom: 18px; }
  .cover h1 { font-size: 26px; margin: 8px 0 4px; }
  .cover .sub { color: rgba(255,255,255,.85); font-size: 12px; }
  .cover img { height: 34px; }
  .stats { display: flex; gap: 8px; margin: 14px 0 4px; flex-wrap: wrap; }
  .stat { background: #fff; border: 1px solid ${GRAY}; border-radius: 8px; padding: 8px 12px; min-width: 88px; text-align: center; }
  .stat .v { font-size: 17px; font-weight: 800; color: ${NAVY}; }
  .stat .l { font-size: 8px; color: ${SUB}; text-transform: uppercase; letter-spacing: .04em; }
  .sec { margin-top: 18px; page-break-inside: auto; }
  h2 { color: ${NAVY}; font-size: 14px; border-bottom: 2px solid ${SAGE}; padding-bottom: 4px; margin: 0 0 8px; }
  h2 .num { background: ${SAGE}; color: #fff; border-radius: 4px; padding: 1px 7px; margin-right: 8px; font-size: 11px; }
  h3 { color: ${NAVY}; font-size: 11px; margin: 12px 0 4px; }
  table { width: 100%; border-collapse: collapse; margin: 6px 0; }
  th { background: ${NAVY}; color: #fff; text-align: left; padding: 4px 7px; font-size: 8.5px; }
  td { border-bottom: 1px solid #eceff1; padding: 3.5px 7px; vertical-align: top; }
  tr:nth-child(even) td { background: #f8fafb; }
  code { background: #f1f5f4; border-radius: 3px; padding: 0 4px; font-size: 8.5px; }
  .note { background: #FDF6E3; border-left: 3px solid ${GOLD}; padding: 7px 10px; border-radius: 4px; margin: 8px 0; }
  .warn { background: #FBEDE6; border-left: 3px solid ${DANGER}; padding: 7px 10px; border-radius: 4px; margin: 8px 0; }
  .muted { color: ${SUB}; }
  .footer { position: fixed; bottom: -10mm; left: 0; right: 0; font-size: 7.5px; color: ${SUB}; text-align: center; }
</style></head><body>

<div class="cover">
  ${LOGO_B64 ? `<img src="data:image/png;base64,${LOGO_B64}">` : ''}
  <h1>${CAP} — NSPB Implementation Report</h1>
  <div class="sub">Full configuration inventory from the Migration (LCM) snapshot · Application "${esc(APP)}" · ${DATE_STR}</div>
  <div class="sub" style="margin-top:6px">All findings are presented as suggested items to validate with ${CAP} — the snapshot reflects the environment at export time.</div>
</div>

<div class="stats">
  ${stat(cubes.length, 'Cubes')}${stat(DIMS.length, 'Dimensions')}${stat(n(forms.length), 'Forms')}
  ${stat(n(rules.length), 'Business rules')}${stat(SUBVARS.length, 'Sub variables')}${stat(DS.length, 'Data sources')}
  ${stat(INTEG.length, 'Integrations')}${stat(FRS.length, 'Fin. reports')}${stat(DASH.length, 'Dashboards')}
</div>

${sec('1', 'Application & modules', `
  <p>Planning application <b>${esc(APP)}</b> with <b>${cubes.length} cubes</b>: ${cubes.map(c => `<code>${esc(c)}</code>`).join(' ')}.
  Global artifacts present: ${smartLists.length} Smart Lists, ${taskLists.length} Task Lists, ${jobs.length} scheduled job definitions,
  ${NAV.length} navigation flow(s), ${customMenus.length} custom menus.</p>
  <h3>Configuration artifacts in the snapshot</h3>
  ${table(['Setting file', 'Purpose'], cfgFiles.map(f => [esc(f), ({ 'Adhoc Options.xml': 'Smart View ad-hoc behavior', 'Data Load Settings.xml': 'Data load configuration', 'Properties': 'Application properties', 'User Preferences.xml': 'Default user preferences', 'User Variables.xml': 'User variable definitions' })[f] || '']))}
`)}

${sec('2', 'Dimensions', `
  ${table(['Dimension', 'Members'], DIMS.map(d => [esc(d.name), n(d.count)]))}
  <p class="muted">Member counts include stored + shared members as exported in the LCM Standard Dimensions CSVs.</p>
`)}

${sec('3', 'Substitution variables (' + SUBVARS.length + ')', table(['Variable', 'Value', 'Plan type'], subvarRows))}

${sec('4', 'Forms (' + n(forms.length) + ')', `
  <p><b>${formsInput.length}</b> input forms, <b>${forms.length - formsInput.length}</b> read-only/review forms; <b>${formsWithRules.length}</b> forms have business rules attached (run on save/load).</p>
  ${table(['Folder', 'Forms', 'Input', 'With rules'], folderRows)}
`)}

${sec('5', 'Business rules & calculations (' + rules.length + ')', `
  <p>${Object.entries(byCube).map(([c, rl]) => `<b>${esc(c)}</b>: ${rl.length}`).join(' · ')} — ${groovy.length} Groovy, ${rules.length - groovy.length} calc-script. ${attached.length} rules are attached to forms.</p>
  ${table(['Rule', 'Cube', 'Type', 'Attached to forms', 'Description'], ruleRows, 'rules')}
`)}

${sec('6', 'Integrations, data sources & saved searches', `
  <p>Data Management is configured with <b>${DS.length} data sources</b> (type <code>NETSUITE</code> entries are backed by NetSuite saved searches) feeding <b>${INTEG.length} integrations</b> into the Planning cubes.</p>
  <h3>Data sources</h3>
  ${table(['Data source', 'Type', 'App type'], dsRows)}
  <h3>Integrations (target applications & mappings)</h3>
  ${table(['Integration', 'Target cube', 'Load rules', 'Mapping dimensions'], integRows)}
`)}

${sec('7', 'Reports & dashboards', `
  <p><b>${FRS.length} financial reports</b> and <b>${DASH.length} dashboards</b> are defined.</p>
  <h3>Dashboards</h3>
  ${table(['Dashboard', 'Referenced forms'], DASH.map(d => [esc(d.name), (d.referencedForms || []).map(f => esc(f.name)).join(', ') || '—']))}
  <h3>Financial reports</h3>
  ${table(['Report', 'Path'], FRS.map(r => [esc(r.name), `<span class="muted">${esc(r.path)}</span>`]))}
`)}

${sec('8', 'Security', hasSecurity
  ? '<p>Access-permission artifacts are included in the snapshot (see Security/Access Permissions).</p>'
  : `<div class="warn"><b>Not included in this snapshot.</b> The LCM export does not contain a <code>Security/Access Permissions</code> folder — security artifacts (groups, per-artifact ACLs) may have been excluded from the backup. Suggested: re-export with the Security category selected to complete this section.</div>`)}

${sec('9', 'Dependencies — forms → rules', `
  <p>Forms that trigger business rules (run-on-save / attached), the key calculation dependencies of daily use${formsWithRules.length > 60 ? ` (first 60 of ${formsWithRules.length})` : ''}:</p>
  ${table(['Form', 'Attached rules'], depRows)}
`)}

<div class="footer">Bryant Park Consulting — ${CAP} NSPB Implementation Report · generated from the LCM snapshot · confidential</div>
</body></html>`;

const htmlFile = path.join(dir, 'implementation-report.html');
fs.writeFileSync(htmlFile, html, 'utf8');
console.log('Wrote', htmlFile);

const pdfFile = path.join(dir, 'implementation-report.pdf');
const fileUrl = 'file:///' + htmlFile.replace(/\\/g, '/');
async function httpJson(p) { return (await fetch(`http://127.0.0.1:${PORT}${p}`)).json(); }
function wsCall(wsUrl, fn) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl); let id = 0; const pend = new Map(); const evs = [];
    const send = (m, p2) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p2 || {} })); });
    ws.onmessage = e => { const d = JSON.parse(e.data); if (d.id && pend.has(d.id)) { const q = pend.get(d.id); pend.delete(d.id); d.error ? q.rej(new Error(d.error.message)) : q.res(d.result); } else if (d.method) evs.push(d); };
    ws.onopen = async () => { try { resolve(await fn(send, evs)); } catch (e) { reject(e); } finally { ws.close(); } };
    ws.onerror = () => reject(new Error('CDP not reachable on :' + PORT));
  });
}
(async () => {
  const ver = await httpJson('/json/version');
  await wsCall(ver.webSocketDebuggerUrl, async (send) => {
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const list = await httpJson('/json/list');
    const t = list.find(x => x.id === targetId);
    await wsCall(t.webSocketDebuggerUrl, async (s2, evs) => {
      await s2('Page.enable');
      await s2('Page.navigate', { url: fileUrl });
      for (let k = 0; k < 40; k++) { await new Promise(r => setTimeout(r, 200)); if (evs.some(e => e.method === 'Page.loadEventFired')) break; }
      await new Promise(r => setTimeout(r, 600));
      const { data } = await s2('Page.printToPDF', { printBackground: true, preferCSSPageSize: true });
      fs.writeFileSync(pdfFile, Buffer.from(data, 'base64'));
    });
    await send('Target.closeTarget', { targetId });
  });
  console.log('PDF:', pdfFile, `(${(fs.statSync(pdfFile).size / 1024).toFixed(0)} KB)`);
})().catch(e => { console.error('PDF failed:', e.message); console.log('HTML ready at', htmlFile); process.exit(1); });
