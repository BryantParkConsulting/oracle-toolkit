'use strict';

/**
 * add-nav-ids.js
 * Enriches an existing clients/<CLIENT>/tenant-kb.json with a `navIndex`:
 * a map from form/dashboard name → its Planning navigation landing target
 * (cluster ~ card IDs) so the browser extension can deep-link straight to
 * the card in the real console:
 *
 *   …/HyperionPlanning/vb/index.html?page=ecvbs-v2&ecvbs-v2=efs
 *      &efs=efs-start&efs-start=blank&efsLandingPage=<CLUSTER>~<CARD>&isHomePage=false
 *
 * The nav XML nests:  <cardCluster id="CST_CL_x"> <card id="CST_CA_y">
 *                       <tab id="CST_TA_z" label="…" refObjectDefId="FORMS_RT_TF"> … </tab>
 *
 * IMPORTANT: this only ADDS kb.navIndex — it never re-parses or re-enriches,
 * so existing aiSummary fields are preserved. Run after parse-lcm.js.
 *
 *   CLIENT=squarespace LCM_ROOT="…/lcm-export/Squarespace" node tools/add-nav-ids.js
 */

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..');
const LCM_ROOT = process.env.LCM_ROOT
  ? path.resolve(process.env.LCM_ROOT)
  : path.join(PROJECT_ROOT, 'lcm-export');
const CLIENT = (process.env.CLIENT || 'demo').trim();
const KB_FILE = path.join(PROJECT_ROOT, 'clients', CLIENT, 'tenant-kb.json');

// Leaf tab types that point at a real artifact (form / dashboard / report).
const LEAF_TYPES = new Set([
  'FORMS_RT_TF', 'FORMS_TF',
  'DASHBOARDS_RT_TF', 'DASHBOARDS_TF',
  'FR_REPORTS_RT_TF', 'FR_REPORTS_TF',
  'MR_REPORTS_RT_TF', 'MR_REPORTS_TF',
]);

function normalize(s) {
  return (s || '').toLowerCase().replace(/\.$/, '').replace(/\s+/g, ' ').trim();
}

function buildNavIndex(xml) {
  // Token scanner tracking cluster / card / tab nesting. Tabs nest: a GROUP
  // tab (EFS_CHILD_TABS_TF) contains LEAF tabs (FORMS_RT_TF, etc.). We record
  // each leaf's full click path: cluster → card → group → tab.
  const tokenRe = new RegExp(
    [
      '<cardCluster\\b[^>]*\\bid="(CST_CL_\\d+)"[^>]*\\blabel="([^"]*)"', // 1,2 cluster open
      '</cardCluster>',                                                  //     cluster close
      '<card\\b[^>]*\\bid="(CST_CA_\\d+)"[^>]*\\blabel="([^"]*)"',       // 3,4 card open
      '</card>',                                                         //     card close
      '<tab\\b([^>]*?)(/?)>',                                            // 5 attrs, 6 self-close
      '</tab>',                                                          //     tab close
    ].join('|'),
    'g'
  );

  const index = {};
  const clusterStack = [], cardStack = [], tabStack = [];
  let m;

  while ((m = tokenRe.exec(xml)) !== null) {
    if (m[1]) { clusterStack.push({ id: m[1], label: m[2] }); continue; }
    if (m[0] === '</cardCluster>') { clusterStack.pop(); continue; }
    if (m[3]) { cardStack.push({ id: m[3], label: m[4] }); continue; }
    if (m[0] === '</card>') { cardStack.pop(); continue; }
    if (m[0] === '</tab>') { tabStack.pop(); continue; }
    if (m[5] === undefined) continue;

    // tab open
    const attrs = m[5];
    const selfClose = m[6] === '/';
    if (!/\bid="CST_TA_\d+"/.test(attrs)) { if (!selfClose) { /* skip non-custom tab nesting */ } continue; }
    const type = (attrs.match(/\brefObjectDefId="([^"]*)"/) || [])[1] || '';
    const tabLabel = (attrs.match(/\blabel="([^"]*)"/) || [])[1] || '';

    if (LEAF_TYPES.has(type)) {
      const cluster = clusterStack[clusterStack.length - 1];
      const card = cardStack[cardStack.length - 1];
      // group = nearest ancestor tab that is a child-tabs container
      const group = [...tabStack].reverse().find(t => t.type === 'EFS_CHILD_TABS_TF');
      if (card) {
        const landingId = cluster ? `${cluster.id}~${card.id}` : card.id;
        const after = xml.slice(m.index, m.index + 3000);
        const artifactName = (after.match(/<tfParameter[^>]*\bartifactName="([^"]+)"/) || [])[1] || '';
        const entry = {
          landing: landingId,
          cluster: cluster ? cluster.id : null,
          card: card.id, cardLabel: card.label,
          clusterLabel: cluster ? cluster.label : null,
          groupLabel: group ? group.label : null,
          standalone: !cluster,
          tabLabel, type,
        };
        for (const key of [normalize(tabLabel), normalize(artifactName)]) {
          if (key && !index[key]) index[key] = entry;
        }
      }
    }
    // Push onto the tab stack so descendants see this as an ancestor.
    if (!selfClose) tabStack.push({ type, label: tabLabel });
  }
  return index;
}

function main() {
  if (!fs.existsSync(KB_FILE)) {
    console.error(`KB not found: ${KB_FILE} — run parse-lcm.js first.`);
    process.exit(1);
  }
  const navDir = path.join(LCM_ROOT, 'HP-NetSuite', 'resource',
    'Global Artifacts', 'Navigation Flows');
  if (!fs.existsSync(navDir)) {
    console.error(`Navigation Flows dir not found: ${navDir}`);
    process.exit(1);
  }

  let navIndex = {};
  for (const file of fs.readdirSync(navDir)) {
    if (!file.endsWith('.xml')) continue;
    const xml = fs.readFileSync(path.join(navDir, file), 'utf8');
    const idx = buildNavIndex(xml);
    for (const [k, v] of Object.entries(idx)) if (!navIndex[k]) navIndex[k] = v;
    console.log(`  ${file}: ${Object.keys(idx).length} artifact→landing entries`);
  }

  const kb = JSON.parse(fs.readFileSync(KB_FILE, 'utf8'));
  kb.navIndex = navIndex;
  fs.writeFileSync(KB_FILE, JSON.stringify(kb, null, 2), 'utf8');

  console.log(`\n✓ Added navIndex with ${Object.keys(navIndex).length} entries to ${KB_FILE}`);
  // Sample
  const sample = Object.entries(navIndex).slice(0, 6);
  for (const [k, v] of sample) console.log(`   "${k}" → ${v.landing}  (${v.cardLabel} / ${v.type})`);
}

main();
