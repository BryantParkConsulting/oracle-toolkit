// Replicates the extension's resolution logic and runs it against the real KB.
const kb = require(process.argv[2]);

function findForms(kb, name) {
  const forms = kb.forms || [];
  const n = name.toLowerCase().trim();
  const exact = forms.find(f => (f.name||"").toLowerCase() === n);
  if (exact) { const a=[exact]; a.exact=true; return a; }
  return forms.filter(f => (f.name||"").toLowerCase().includes(n));
}
function resolveLanding(kb, name) {
  const idx = kb.navIndex || {};
  const n = (name||"").toLowerCase().replace(/\.$/,"").replace(/\s+/g," ").trim();
  if (idx[n]) return idx[n];
  for (const k of Object.keys(idx)) if (k.length>4 && (k.includes(n)||n.includes(k))) return idx[k];
  return null;
}
function buildLandingUrl(planning, landing){
  return planning+"/HyperionPlanning/vb/index.html?page=ecvbs-v2&ecvbs-v2=efs&efs=efs-start&efs-start=blank&efsLandingPage="+String(landing).replace(/~/g,"%7E")+"&isHomePage=false";
}

const PLANNING="https://nspb-squarespace.epm.us-ashburn-1.ocs.oraclecloud.com";
const forms = kb.forms||[];
let resolved=0, missing=[];
for (const f of forms) {
  const l = resolveLanding(kb, f.name);
  if (l) resolved++; else missing.push(f.name);
}
console.log(`navIndex present: ${kb.navIndex?Object.keys(kb.navIndex).length:0} entries`);
console.log(`FORMS resolved to a landing: ${resolved}/${forms.length}`);
console.log(`\nSample deep-links:`);
for (const name of ["Income Statement Report","Income Statement Adjustments","NetSuite Item Price","Company Roster"]) {
  const l = resolveLanding(kb, name);
  console.log(`  "${name}" -> ${l? l.landing+" ("+l.cardLabel+")" : "NO MATCH"}`);
}
console.log(`\nForms WITHOUT a landing (${missing.length}):`);
console.log("  " + missing.slice(0,25).join("\n  ") + (missing.length>25?`\n  …(+${missing.length-25} more)`:""));
