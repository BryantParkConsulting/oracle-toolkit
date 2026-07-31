'use strict';

/**
 * parse-lcm.js
 * Parses an Oracle Planning LCM export at ./lcm-export/ and produces tenant-kb.json.
 * Uses Node.js built-ins only (fs, path).
 *
 * Actual formats discovered in this export:
 *  - Form XMLs:            standard EPM <form> XML
 *  - Dimension "CSVs":    XML header block + "#--!\n" separator + CSV with columns:
 *                          "Account/Member, Parent, Alias: Default, ..., Data Storage, ..."
 *                          Level is derived from parent→child depth computation.
 *  - Substitution Vars:   one <substitutionVariable> per file, child-element style (not attrs)
 *  - FDMEE App Def:       <TargetApplicationForLcmVO><TargetApplicationForLcmVORow>...</...>
 *  - FDMEE Data Load Rule:<DataRuleForLcmVO><DataRuleForLcmVORow>...</...>
 */

const fs   = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
// Monorepo layout — tools/ is top-level, lcm-export/ and clients/ are siblings.
//   Input:  <root>/lcm-export/                       (raw Oracle LCM dump, gitignored)
//   Output: <root>/clients/<CLIENT>/tenant-kb.json   (CLIENT env var, default "demo")
// Override via env vars:
//   CLIENT=acme node tools/parse-lcm.js
//   LCM_ROOT=path/to/dump CLIENT=acme node tools/parse-lcm.js
const PROJECT_ROOT = path.join(__dirname, '..', '..');
const LCM_ROOT     = process.env.LCM_ROOT
                       ? path.resolve(process.env.LCM_ROOT)
                       : path.join(PROJECT_ROOT, 'lcm-export');
const CLIENT_NAME  = (process.env.CLIENT || 'demo').trim();
const CLIENT_DIR   = path.join(PROJECT_ROOT, 'clients', CLIENT_NAME);
if (!fs.existsSync(CLIENT_DIR)) fs.mkdirSync(CLIENT_DIR, { recursive: true });
const OUT_FILE     = path.join(CLIENT_DIR, 'tenant-kb.json');

// The Planning app folder is named after the application (e.g. "HP-NetSuite",
// "HP-PAI_PLN"). Auto-detect it from the LCM dump so the parser works for any
// client, not only apps literally named "NetSuite". Override with LCM_APP.
function detectAppName() {
  if (process.env.LCM_APP) return process.env.LCM_APP.trim();
  try {
    const hp = fs.readdirSync(LCM_ROOT).find(d =>
      /^HP-/.test(d) && (() => { try { return fs.statSync(path.join(LCM_ROOT, d)).isDirectory(); } catch (_) { return false; } })());
    if (hp) return hp.slice(3);
  } catch (_) {}
  return 'NetSuite';
}
const APP_NAME = detectAppName();
const HP_DIR   = 'HP-' + APP_NAME;

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

/** HTML-entity decode the common entities, then strip all remaining HTML tags */
function htmlToPlainText(raw) {
  if (!raw) return '';
  return raw
    .replace(/&lt;/g,   '<')
    .replace(/&gt;/g,   '>')
    .replace(/&amp;/g,  '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g,  "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/<[^>]*>/g, '')   // strip tags
    .replace(/\s+/g, ' ')
    .trim();
}

// Decode XML entities WITHOUT stripping tags or collapsing whitespace.
// Use for short attribute values (form names, member refs, etc).
function decodeXmlEntities(s) {
  if (!s) return '';
  return String(s)
    .replace(/&lt;/g,   '<')
    .replace(/&gt;/g,   '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g,  "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g,  '&');  // last so we don't double-decode
}

/** Return the value of a named XML attribute from a tag string */
function xmlAttr(tagStr, name) {
  const re = new RegExp(`(?:^|\\s)${name}="([^"]*)"`, 'i');
  const m  = tagStr.match(re);
  return m ? m[1].trim() : '';
}

/** Return the text content of the FIRST occurrence of an XML element */
function xmlInner(xml, tagName) {
  const re = new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tagName}>`, 'i');
  const m  = xml.match(re);
  return m ? m[1] : '';
}

/** Return ALL text content values for a given element name */
function xmlAllInner(xml, tagName) {
  const re = new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tagName}>`, 'gi');
  const results = [];
  let m;
  while ((m = re.exec(xml)) !== null) results.push(m[1]);
  return results;
}

/** Read a file safely; returns null on error and logs a warning */
function readFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    warn(`Cannot read ${filePath}: ${e.message}`);
    return null;
  }
}

function info(msg) { console.log(`[INFO]  ${msg}`); }
function warn(msg) { console.warn(`[WARN]  ${msg}`); }

// ---------------------------------------------------------------------------
// Recursive directory walker
// ---------------------------------------------------------------------------

/**
 * Walk dir recursively.
 * @param {string} dir
 * @param {function(string):void} fileCb   – called for every file
 * @param {function(string):void} [dirCb]  – called for every *leaf* directory (no files)
 */
function walkDir(dir, fileCb, dirCb) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    warn(`Cannot read dir ${dir}: ${e.message}`);
    return;
  }
  let hasFile = false;
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      walkDir(full, fileCb, dirCb);
    } else if (ent.isFile()) {
      hasFile = true;
      fileCb(full);
    }
  }
  if (!hasFile && dirCb) dirCb(dir);
}

// ---------------------------------------------------------------------------
// 1. Parse Forms
// ---------------------------------------------------------------------------

function parseForms() {
  // Returns { forms: [...], dashboards: [...] } — separates real forms from
  // dashboards based on the dashboard="true" attribute on the <form> root.
  const forms = [];
  const dashboards = [];

  const hpRoot = path.join(LCM_ROOT, HP_DIR, 'resource', 'Cube');
  const globalDashRoot = path.join(LCM_ROOT, HP_DIR, 'resource', 'Global Artifacts', 'Dashboards');

  if (!fs.existsSync(hpRoot)) {
    warn(`HP-NetSuite Cube root not found: ${hpRoot}`);
    return { forms, dashboards };
  }

  info('Scanning for form/dashboard XMLs under Cube/...');

  walkDir(hpRoot, (filePath) => {
    if (!filePath.endsWith('.xml')) return;

    const rel   = filePath.replace(hpRoot + path.sep, '');
    const parts = rel.split(path.sep);

    if (parts.length < 3) return;
    if (parts[1] !== 'Data Forms' && parts[1] !== 'Dashboards') return;

    const cubeName = parts[0];
    const xml = readFile(filePath);
    if (!xml) return;

    try {
      const item = parseFormXml(xml, cubeName, filePath);
      if (!item) return;
      if (item.kind === 'dashboard') dashboards.push(item);
      else forms.push(item);
    } catch (e) {
      warn(`Failed to parse ${filePath}: ${e.message}`);
    }
  });

  // Also scan Global Artifacts/Dashboards/ — these are dashboards that live
  // outside any single cube. Same XML format (<form dashboard="true">).
  if (fs.existsSync(globalDashRoot)) {
    info('Scanning Global Artifacts/Dashboards/...');
    walkDir(globalDashRoot, (filePath) => {
      if (!filePath.endsWith('.xml')) return;
      const xml = readFile(filePath);
      if (!xml) return;
      try {
        const item = parseFormXml(xml, '(global)', filePath);
        if (!item) return;
        // Force dashboard kind for items in Global Artifacts/Dashboards
        item.kind = 'dashboard';
        item.scope = 'global';
        dashboards.push(item);
      } catch (e) {
        warn(`Failed to parse global dashboard ${filePath}: ${e.message}`);
      }
    });
  }

  info(`Parsed ${forms.length} forms (input/review) and ${dashboards.length} dashboards.`);
  return { forms, dashboards };
}

function parseFormXml(xml, cubeNameFromPath, filePath) {
  // Match the outer <form …> tag
  const formTagMatch = xml.match(/<form\s([\s\S]*?)>/);
  if (!formTagMatch) return null;

  const formTag    = formTagMatch[0];
  const name       = decodeXmlEntities(xmlAttr(formTag, 'name'));
  const readOnly   = xmlAttr(formTag, 'readOnly');
  const isDashAttr = xmlAttr(formTag, 'dashboard') === 'true';
  const isComp     = xmlAttr(formTag, 'composite') === 'true';
  const planType   = xmlAttr(formTag, 'planType') || cubeNameFromPath;
  const dirAttr    = xmlAttr(formTag, 'dir');

  // Strip leading "Forms/" from dir attribute
  let formPath = dirAttr.replace(/^Forms\//, '');
  if (!formPath) {
    // Derive from file location
    const idx = filePath.indexOf('Data Forms');
    if (idx !== -1) {
      formPath = path.dirname(filePath.substring(idx + 'Data Forms'.length + 1))
                     .replace(/\\/g, '/');
    }
  }

  const description  = htmlToPlainText(xmlInner(xml, 'description'));
  const titleRaw     = xmlInner(xml, 'title');
  const title        = htmlToPlainText(titleRaw);
  const instructions = htmlToPlainText(xmlInner(xml, 'instruction'));

  // Business rules — extract attachments AND classify each one:
  //   - "runnable"     : real Business Rule. Default classification — we
  //                       cross-check against the registered rules list at
  //                       the end and downgrade if it's not found there.
  //   - "calcScript"   : built-in script like CURRENCY (currency conversion)
  //                       or DEFAULT (default member calc). calcType "3"
  //                       is a strong signal — auto-fires in SmartView,
  //                       NOT runnable on demand via REST.
  //   - "notRegistered": calcType doesn't help (often "0" is used for both
  //                       real BRs AND member formulas), so we lean on the
  //                       registered-rules cross-check downstream.
  // The chat uses `kind` to decide whether to offer a "Run" chip.
  const attachedRules = [];
  const brBlock = xmlInner(xml, 'businessRules');
  const ruleRe  = /<businessRule\s+([^>]*?)\/>/g;
  let rm;
  while ((rm = ruleRe.exec(brBlock)) !== null) {
    const tag = rm[0];
    const calcType = xmlAttr(tag, 'calcType');
    // Only calcType "3" is a definite calc script (CURRENCY/DEFAULT).
    // calcType "0" is ambiguous — could be a real BR OR a member formula.
    // We default to "runnable" and let the cross-check downgrade if needed.
    const kind = (calcType === '3') ? 'calcScript' : 'runnable';
    attachedRules.push({
      name:      xmlAttr(tag, 'name'),
      runOnSave: xmlAttr(tag, 'runOnSave') === 'true',
      calcType,
      kind,
    });
  }

  // ── DASHBOARD branch ──
  // Dashboards have dashboard="true" composite="true" + <pane>/<block>, no <query>
  if (isDashAttr) {
    // Extract referenced form names from <block name="X" ...> tags inside panes
    const refs = [];
    const blockRe = /<block\s+([^>]*?)\/>/g;
    let bm;
    while ((bm = blockRe.exec(xml)) !== null) {
      const nm = xmlAttr(bm[0], 'name');
      const lbl = xmlAttr(bm[0], 'resourceLabel');
      const chartType = xmlAttr(bm[0], 'chartType');
      if (nm && !refs.find(r => r.name === nm)) {
        refs.push({ name: nm, label: lbl || nm, chartType: chartType || '' });
      }
    }
    return {
      kind:           'dashboard',
      name,
      cube:           planType,
      path:           formPath,
      title,
      description,
      composite:      isComp,
      referencedForms: refs,
    };
  }

  // ── REGULAR FORM branch ──
  // Query dimensions
  const queryBlock = xmlInner(xml, 'query');

  function dimsIn(sectionName) {
    const section = xmlInner(queryBlock, sectionName);
    const dims    = [];
    const re      = /<dimension\s+[^>]*name="([^"]+)"/g;
    let dm;
    while ((dm = re.exec(section)) !== null) {
      if (!dims.includes(dm[1])) dims.push(dm[1]);
    }
    return dims;
  }

  // Collect every member reference (literal strings + &SUBVAR refs) from
  // rows / columns / pov / pageMembers blocks. We need these so the
  // worker's detectVarsInText() can spot substitution variables actually
  // used by the form's structure — without this all forms looked like
  // 'Variables used: none detected' because the dim names alone don't
  // contain &VAR_NAME references. The form XML stores members as either
  // <member name="X"/> or <selectedMember name="X"/> inside dimensions.
  function memberRefsIn(sectionName) {
    const section = xmlInner(queryBlock, sectionName);
    const refs = [];
    const seen = new Set();
    const re = /<(?:member|selectedMember|defaultMember)\s+[^>]*name="([^"]+)"/g;
    let m;
    while ((m = re.exec(section)) !== null) {
      // Decode entities — &amp;NSP_PER_FcstCurrYr → &NSP_PER_FcstCurrYr so
      // the worker's detectVarsInText can match the literal &VAR_NAME.
      const v = decodeXmlEntities(m[1]);
      if (!seen.has(v)) { seen.add(v); refs.push(v); }
    }
    return refs;
  }
  const rowMembers = memberRefsIn('rows');
  const columnMembers = memberRefsIn('columns');
  const povMembers = memberRefsIn('pov');
  const pageMembers = memberRefsIn('pageMembers');

  // ── Input vs Review classification ──
  // - readOnly="true"                       → review
  // - has rules with runOnSave=true         → input (clear data-entry intent)
  // - else                                  → input (default for editable forms)
  const isReadOnly = readOnly === 'true';
  const hasOnSaveRules = attachedRules.some(r => r.runOnSave);
  const kind = isReadOnly ? 'review' : 'input';

  return {
    kind,                              // 'input' | 'review'
    name,
    cube:           planType,
    path:           formPath,
    description,
    instructions,
    isInput:        !isReadOnly,       // back-compat
    isReadOnly,
    hasOnSaveRules,
    attachedRules,
    columnDims:     dimsIn('columns'),
    rowDims:        dimsIn('rows'),
    povDims:        dimsIn('pov'),
    rowMembers,                         // literal + &SUBVAR refs in <rows>
    columnMembers,                      // ... in <columns>
    povMembers,                         // ... in <pov>
    pageMembers,                        // ... in <pageMembers>
  };
}

// ---------------------------------------------------------------------------
// 2. Parse Rules and RuleSets (directory names = rule/ruleset names)
// ---------------------------------------------------------------------------

function parseRulesAndRuleSets() {
  const rules    = {};
  const rulesets = [];

  const calcRoot   = path.join(LCM_ROOT, 'CALC-Calculation Manager', 'resource', 'Planning', APP_NAME);
  const hpCubeRoot = path.join(LCM_ROOT, HP_DIR, 'resource', 'Cube');

  function readRuleDescription(filePath) {
    try {
      const xml = fs.readFileSync(filePath, 'utf8');
      const m = xml.match(/<property\s+name="description"[^>]*>([\s\S]*?)<\/property>/);
      return m ? htmlToPlainText(m[1]).trim() : '';
    } catch { return ''; }
  }

  // Full rule reader — returns {description, body, properties, scriptType}.
  // The body is the actual Groovy/Calc-Manager script source — we keep up
  // to 12KB so the explain_rule tool can show / summarize it. Properties
  // are the <property name=X>value</property> entries (description, app,
  // plantype, seeded, etc.).
  function readRuleDetails(filePath) {
    try {
      const xml = fs.readFileSync(filePath, 'utf8');
      const props = {};
      const propRe = /<property\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/property>/g;
      let m;
      while ((m = propRe.exec(xml)) !== null) {
        props[m[1]] = htmlToPlainText(m[2]).trim();
      }
      // Script body — Groovy or older Calc Manager format
      const scriptM = xml.match(/<script[^>]*type="([^"]*)"[^>]*>([\s\S]*?)<\/script>/);
      let scriptType = scriptM ? scriptM[1] : null;
      let body = scriptM ? htmlToPlainText(scriptM[2]).trim() : '';
      // Trim to keep tenant-kb.json reasonable (~12KB per rule max)
      const MAX = 12000;
      if (body.length > MAX) body = body.slice(0, MAX) + '\n\n... [truncated]';
      return {
        description: props.description || '',
        properties: props,
        body,
        scriptType,
      };
    } catch (e) {
      return { description: '', properties: {}, body: '', scriptType: null };
    }
  }

  function ruleNameFromEntry(entryName) {
    return entryName.toLowerCase().endsWith('.xml') ? entryName.slice(0, -4) : entryName;
  }

  function scanRulesDir(cubeDir, cubeName) {
    // Rules — entries can be XML files or directories depending on LCM export shape
    const rulesDir = path.join(cubeDir, 'Rules');
    if (fs.existsSync(rulesDir)) {
      try {
        for (const r of fs.readdirSync(rulesDir, { withFileTypes: true })) {
          const ruleName = ruleNameFromEntry(r.name);
          let details = { description: '', properties: {}, body: '', scriptType: null };
          if (r.isFile()) {
            details = readRuleDetails(path.join(rulesDir, r.name));
          } else if (r.isDirectory()) {
            // some exports nest the XML inside a folder of the same name
            const inner = path.join(rulesDir, r.name, r.name);
            if (fs.existsSync(inner)) details = readRuleDetails(inner);
          }
          if (!rules[ruleName]) rules[ruleName] = { name: ruleName, cube: cubeName, attachedToForms: [] };
          if (details.description && !rules[ruleName].description) rules[ruleName].description = details.description;
          if (details.body && !rules[ruleName].body) {
            rules[ruleName].body = details.body;
            rules[ruleName].scriptType = details.scriptType;
            rules[ruleName].properties = details.properties;
          }
        }
      } catch (e) { warn(`Cannot read ${rulesDir}: ${e.message}`); }
    }

    // RuleSets
    const rsDir = path.join(cubeDir, 'RuleSets');
    if (fs.existsSync(rsDir)) {
      try {
        for (const rs of fs.readdirSync(rsDir, { withFileTypes: true })) {
          if (!rs.isDirectory()) continue;
          if (!rulesets.includes(rs.name)) rulesets.push(rs.name);
        }
      } catch (e) { warn(`Cannot read ${rsDir}: ${e.message}`); }
    }
  }

  // CALC root: .../NetSuite/<cubeName>/Rules and RuleSets
  if (fs.existsSync(calcRoot)) {
    info('Scanning CALC rules directories…');
    try {
      for (const cube of fs.readdirSync(calcRoot, { withFileTypes: true })) {
        if (!cube.isDirectory()) continue;
        scanRulesDir(path.join(calcRoot, cube.name), cube.name);
      }
    } catch (e) { warn(`Cannot read CALC root: ${e.message}`); }
  } else {
    warn(`CALC root not found: ${calcRoot}`);
  }

  // HP-NetSuite Cube tree: .../Cube/<cubeName>/Calculation Manager Rules/<name>/
  if (fs.existsSync(hpCubeRoot)) {
    info('Scanning HP-NetSuite Calculation Manager Rules…');
    try {
      for (const cube of fs.readdirSync(hpCubeRoot, { withFileTypes: true })) {
        if (!cube.isDirectory()) continue;
        const cmDir = path.join(hpCubeRoot, cube.name, 'Calculation Manager Rules');
        if (!fs.existsSync(cmDir)) continue;
        try {
          for (const r of fs.readdirSync(cmDir, { withFileTypes: true })) {
            const ruleName = ruleNameFromEntry(r.name);
            let details = { description: '', properties: {}, body: '', scriptType: null };
            if (r.isFile()) {
              details = readRuleDetails(path.join(cmDir, r.name));
            } else if (r.isDirectory()) {
              const inner = path.join(cmDir, r.name, r.name);
              if (fs.existsSync(inner)) details = readRuleDetails(inner);
            }
            if (!rules[ruleName]) rules[ruleName] = { name: ruleName, cube: cube.name, attachedToForms: [] };
            if (details.description && !rules[ruleName].description) rules[ruleName].description = details.description;
            if (details.body && !rules[ruleName].body) {
              rules[ruleName].body = details.body;
              rules[ruleName].scriptType = details.scriptType;
              rules[ruleName].properties = details.properties;
            }
          }
        } catch (e) { warn(`Cannot read ${cmDir}: ${e.message}`); }
      }
    } catch (e) { warn(`Cannot read HP Cube root for rules: ${e.message}`); }
  }

  info(`Found ${Object.keys(rules).length} rules, ${rulesets.length} rulesets.`);
  return { rules, rulesets };
}

/** Build rule → forms reverse index from form businessRules sections */
function buildRuleFormIndex(rulesMap, forms) {
  for (const form of forms) {
    for (const br of form.attachedRules) {
      if (!br.name) continue;
      if (!rulesMap[br.name]) {
        // Seen in form XML but not in dir listing — add it
        rulesMap[br.name] = { name: br.name, cube: form.cube, attachedToForms: [] };
      }
      if (!rulesMap[br.name].attachedToForms.includes(form.name)) {
        rulesMap[br.name].attachedToForms.push(form.name);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 3. Parse Dimension CSVs
//
// Actual format:
//   #!-- HEADERBLOCK DIMENSION XML
//   (XML block describing dimension metadata)
//   </DIMENSIONS>
//   #--!
//   <DimName>, Parent, Alias: Default, ..., Data Storage, Two Pass Calculation, ...
//   Member1, ParentA, alias, ..., store, FALSE, ...
//   ...
//
// Level is derived by building a parent→child depth map.
// ---------------------------------------------------------------------------

function parseDimensions() {
  const dimensions = {};

  const globalDimsDir = path.join(
    LCM_ROOT, HP_DIR, 'resource', 'Global Artifacts',
    'Common Dimensions', 'Standard Dimensions'
  );
  const hpCubeRoot = path.join(LCM_ROOT, HP_DIR, 'resource', 'Cube');

  const csvPaths = [];

  if (fs.existsSync(globalDimsDir)) {
    try {
      for (const f of fs.readdirSync(globalDimsDir)) {
        if (f.endsWith('.csv')) {
          csvPaths.push({ file: path.join(globalDimsDir, f), dim: path.basename(f, '.csv') });
        }
      }
    } catch (e) { warn(`Cannot read global dims dir: ${e.message}`); }
  } else {
    warn(`Global dimensions dir not found: ${globalDimsDir}`);
  }

  if (fs.existsSync(hpCubeRoot)) {
    try {
      for (const cube of fs.readdirSync(hpCubeRoot, { withFileTypes: true })) {
        if (!cube.isDirectory()) continue;
        const sdDir = path.join(hpCubeRoot, cube.name, 'Standard Dimensions');
        if (!fs.existsSync(sdDir)) continue;
        try {
          for (const f of fs.readdirSync(sdDir)) {
            if (f.endsWith('.csv')) {
              csvPaths.push({ file: path.join(sdDir, f), dim: path.basename(f, '.csv') });
            }
          }
        } catch (e) { warn(`Cannot read cube std dims ${sdDir}: ${e.message}`); }
      }
    } catch (e) { warn(`Cannot read HP Cube root for dims: ${e.message}`); }
  }

  info(`Found ${csvPaths.length} dimension CSV file(s).`);

  for (const { file, dim } of csvPaths) {
    try {
      const members = parseDimensionCsv(file, dim);
      if (members.length > 0) {
        if (dimensions[dim]) {
          const existing = new Set(dimensions[dim].map(m => m.name));
          for (const m of members) {
            if (!existing.has(m.name)) { dimensions[dim].push(m); existing.add(m.name); }
          }
        } else {
          dimensions[dim] = members;
        }
        info(`  ${dim}: ${members.length} members`);
      }
    } catch (e) {
      warn(`Failed to parse ${file}: ${e.message}`);
    }
  }

  return dimensions;
}

function parseDimensionCsv(filePath, dimName) {
  const raw = readFile(filePath);
  if (!raw) return [];

  // Strip BOM
  const content = raw.replace(/^\uFEFF/, '');

  // Find the CSV section after the "#--!" separator
  const sepIdx = content.indexOf('#--!\n');
  const csvContent = sepIdx !== -1
    ? content.substring(sepIdx + 5)
    : content;   // fallback: use the whole file

  // Split into LOGICAL rows that respect quoted multi-line fields.
  // A naive split on \n would break multi-line formula cells in half
  // (e.g. SalesPrice has a /* ... */ comment + code spanning many lines).
  const lines = splitCsvRows(csvContent);
  if (lines.length < 2) return [];

  // Parse header — the first column is named after the dimension (e.g. "Account") or generic
  const header = parseCsvLine(lines[0]);
  const colMap = {};
  header.forEach((h, i) => { colMap[h.trim()] = i; });

  // Find column indices (case-insensitive helper)
  function findCol(...candidates) {
    for (const cand of candidates) {
      for (const key of Object.keys(colMap)) {
        if (key.toLowerCase() === cand.toLowerCase()) return colMap[key];
      }
    }
    return -1;
  }

  // The first column is the member name — could be "Account", "Department", "Period", etc.
  // It's always index 0.
  const iName    = 0;
  const iParent  = findCol('Parent');
  const iAlias   = findCol('Alias: Default');
  const iStorage = findCol('Data Storage', 'DataStorage');
  const iFormula = findCol('Formula');
  const iUda     = findCol('UDA');
  const iDesc    = findCol('Description');

  // Build parent map first to compute levels
  const parentOf = {};   // memberName → parentName
  const dataRows = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const cols = parseCsvLine(line);
    if (cols.length === 0) continue;
    const memberName = (cols[iName] || '').trim();
    if (!memberName) continue;
    const parentName = iParent !== -1 ? (cols[iParent] || '').trim() : '';
    parentOf[memberName] = parentName;
    dataRows.push({ cols, memberName, parentName });
  }

  // Compute level for each member by walking up the parent chain
  const levelCache = {};
  function getLevel(name, visited) {
    if (levelCache[name] !== undefined) return levelCache[name];
    if (!visited) visited = new Set();
    if (visited.has(name)) return 0;   // cycle guard
    visited.add(name);
    const parent = parentOf[name];
    if (!parent || parent === name) {
      levelCache[name] = 0;
      return 0;
    }
    if (parentOf[parent] === undefined) {
      // parent is root (not in member list)
      levelCache[name] = 0;
      return 0;
    }
    const parentLevel = getLevel(parent, visited);
    levelCache[name] = parentLevel + 1;
    return levelCache[name];
  }

  // We want depth from root: root = highest level number, leaves = 0.
  // First pass: compute raw depth from root (root=0, each child +1).
  // Then flip: level = maxDepth - depth.
  const rawDepth = {};
  for (const { memberName } of dataRows) getLevel(memberName);

  // maxDepth among all members
  let maxDepth = 0;
  for (const v of Object.values(levelCache)) { if (v > maxDepth) maxDepth = v; }

  const members = [];
  for (const { cols, memberName } of dataRows) {
    const depth = levelCache[memberName] || 0;
    const level = maxDepth - depth;   // leaf=0, top-level root=maxDepth

    const member = {
      name:  memberName,
      alias: iAlias   !== -1 ? (cols[iAlias]   || '').trim() : '',
      level,
    };

    // Only include optional fields if they have values. The LCM CSV
    // writes the literal "<none>" for empty formula columns — strip that
    // here so downstream code doesn't have to special-case it.
    if (iFormula !== -1) {
      const f = (cols[iFormula] || '').trim();
      if (f && f !== '<none>' && f.toLowerCase() !== 'none') member.formula = f;
    }
    if (iUda     !== -1 && (cols[iUda]     || '').trim()) member.uda     = cols[iUda].trim();
    if (iDesc    !== -1 && (cols[iDesc]    || '').trim()) member.description = cols[iDesc].trim();
    if (iStorage !== -1 && (cols[iStorage] || '').trim()) member.storage = cols[iStorage].trim();

    members.push(member);
  }

  return members;
}

/** Simple CSV line parser that handles quoted fields and escaped double-quotes */
// Split a CSV blob into logical rows, respecting quoted multi-line fields.
// A row ends at a newline ONLY when we're not inside an open double-quote.
// Without this, multi-line formulas (Groovy / calc-manager code with /* */
// comments or line breaks) get sliced and the parser sees only the first
// line of the formula.
function splitCsvRows(content) {
  const rows = [];
  let buf = '';
  let inQuote = false;
  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (ch === '"') {
      // Escaped quote ("") inside a quoted field — keep both, stay in quote
      if (inQuote && content[i + 1] === '"') { buf += '""'; i++; continue; }
      inQuote = !inQuote;
      buf += ch;
    } else if ((ch === '\n' || ch === '\r') && !inQuote) {
      // Eat \r\n as one boundary
      if (ch === '\r' && content[i + 1] === '\n') i++;
      rows.push(buf);
      buf = '';
    } else {
      buf += ch;
    }
  }
  if (buf.length) rows.push(buf);
  return rows;
}

function parseCsvLine(line) {
  const result = [];
  let cur = '';
  let inQuote = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuote = !inQuote;
    } else if (ch === ',' && !inQuote) {
      result.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  result.push(cur);
  return result;
}

// ---------------------------------------------------------------------------
// 4. Parse Substitution Variables
//
// Actual format (one variable per file):
//   <substitutionVariable>
//     <name>NSP_FIN_AccDepreciation</name>
//     <value>&quot;P_1700&quot;</value>
//     <planType>ALL</planType>
//   </substitutionVariable>
// ---------------------------------------------------------------------------

function parseSubstitutionVariables() {
  const variables = [];
  const seen      = new Set();

  // Cube-scoped variables live under resource/Cube/<cube>/Substitution
  // Variables and are invisible to the Global Artifacts scan — the KB used
  // to under-report them (Swoop: 48 parsed vs 51 the REST API returns).
  const cubeSubVarDirs = (() => {
    const base = path.join(LCM_ROOT, HP_DIR, 'resource', 'Cube');
    try {
      return fs.readdirSync(base)
        .map(c => path.join(base, c, 'Substitution Variables'))
        .filter(d => { try { return fs.statSync(d).isDirectory(); } catch (_) { return false; } });
    } catch (_) { return []; }
  })();

  const subVarDirs = [
    path.join(LCM_ROOT, HP_DIR, 'resource', 'Global Artifacts', 'Substitution Variables'),
    path.join(LCM_ROOT, HP_DIR, 'resource', 'Global Artifacts',
              'Common Dimensions', 'Substitution Variables'),
    ...cubeSubVarDirs,
  ].filter(d => fs.existsSync(d));

  if (subVarDirs.length === 0) {
    warn('No Substitution Variables directory found.');
    return variables;
  }

  for (const dir of subVarDirs) {
    info(`Scanning substitution variables in ${path.basename(dir)} (${dir})…`);
    try {
      const files = fs.readdirSync(dir);
      for (const f of files) {
        if (!f.endsWith('.xml')) continue;
        const xml = readFile(path.join(dir, f));
        if (!xml) continue;
        try {
          const parsed = parseSubVarXml(xml, f);
          for (const v of parsed) {
            const key = `${v.name}||${v.planType}`;
            if (!seen.has(key)) { seen.add(key); variables.push(v); }
          }
        } catch (e) {
          warn(`Failed to parse subvar ${f}: ${e.message}`);
        }
      }
    } catch (e) {
      warn(`Cannot read subvar dir ${dir}: ${e.message}`);
    }
  }

  info(`Parsed ${variables.length} substitution variables.`);
  return variables;
}

function parseSubVarXml(xml, filename) {
  const vars = [];

  // Handle both formats:
  // 1) Child-element style: <substitutionVariable><name>X</name><value>Y</value>...</>
  // 2) Attribute style:     <substitutionVariable name="X" value="Y" .../>

  // Try attribute style first
  const attrRe = /<substitutionVariable\s+([^>]*?)\/>/g;
  let m;
  while ((m = attrRe.exec(xml)) !== null) {
    const tag = m[0];
    vars.push({
      name:     xmlAttr(tag, 'name'),
      value:    htmlToPlainText(xmlAttr(tag, 'value')),
      planType: xmlAttr(tag, 'planType'),
      scope:    xmlAttr(tag, 'scope'),
    });
  }

  if (vars.length > 0) return vars;

  // Child-element style — each <substitutionVariable> block
  const blockRe = /<substitutionVariable>([\s\S]*?)<\/substitutionVariable>/g;
  while ((m = blockRe.exec(xml)) !== null) {
    const block = m[1];
    vars.push({
      name:     htmlToPlainText(xmlInner(block, 'name')),
      value:    htmlToPlainText(xmlInner(block, 'value')),
      planType: xmlInner(block, 'planType').trim(),
      scope:    xmlInner(block, 'scope').trim(),
    });
  }

  return vars;
}

// ---------------------------------------------------------------------------
// 5. Parse FDMEE
//
// Actual XML formats:
//  Datasource Application Definition.xml:
//    <TargetApplicationForLcmVO>
//      <TargetApplicationForLcmVORow>
//        <ApplicationName>…</ApplicationName>
//        <DataLoadMethod>NETSUITE</DataLoadMethod>
//        <TargetApplicationSubType>NETSUITE</TargetApplicationSubType>
//        <TargetApplicationType>DATASOURCE</TargetApplicationType>
//        …
//
//  Planning Application Definition.xml:
//    <TargetApplicationForLcmVO>
//      <TargetApplicationForLcmVORow>
//        <ApplicationName>…</ApplicationName>
//        <TargetApplicationType>HPL</TargetApplicationType>
//        <TargetApplicationName>NetSuite</TargetApplicationName>
//        …
//
//  Data Load Rule.xml:
//    <DataRuleForLcmVO>
//      <DataRuleForLcmVORow>
//        <RuleName>…</RuleName>
//        <PlanType>…</PlanType>
//        <ApplicationName>…</ApplicationName>
//        …
// ---------------------------------------------------------------------------

function parseFdmee() {
  const datasources  = [];
  const integrations = [];

  const fdmeeRoot = path.join(
    LCM_ROOT, 'FDMEE-FDM Enterprise Edition', 'resource', 'Application Data'
  );

  if (!fs.existsSync(fdmeeRoot)) {
    warn(`FDMEE root not found: ${fdmeeRoot}`);
    return { datasources, integrations };
  }

  // --- Datasource Applications ---
  const dsRoot = path.join(fdmeeRoot, 'Datasource Applications');
  if (fs.existsSync(dsRoot)) {
    info('Scanning FDMEE Datasource Applications…');
    try {
      for (const app of fs.readdirSync(dsRoot, { withFileTypes: true })) {
        if (!app.isDirectory()) continue;
        const defFile = path.join(dsRoot, app.name, 'Application Definition.xml');
        if (!fs.existsSync(defFile)) continue;
        const xml = readFile(defFile);
        if (!xml) continue;
        try {
          const ds = parseFdmeeAppDef(xml, app.name, 'datasource');
          if (ds) datasources.push(ds);
        } catch (e) { warn(`Failed DS app ${app.name}: ${e.message}`); }
      }
    } catch (e) { warn(`Cannot read FDMEE DS root: ${e.message}`); }
  } else {
    warn(`FDMEE Datasource Applications not found: ${dsRoot}`);
  }

  // --- Planning Applications (integrations) ---
  const plRoot = path.join(fdmeeRoot, 'Planning Applications');
  if (fs.existsSync(plRoot)) {
    info('Scanning FDMEE Planning Applications…');
    try {
      for (const app of fs.readdirSync(plRoot, { withFileTypes: true })) {
        if (!app.isDirectory()) continue;
        try {
          const integration = parsePlanningApp(path.join(plRoot, app.name), app.name);
          if (integration) integrations.push(integration);
        } catch (e) { warn(`Failed Planning app ${app.name}: ${e.message}`); }
      }
    } catch (e) { warn(`Cannot read FDMEE Planning root: ${e.message}`); }
  } else {
    warn(`FDMEE Planning Applications not found: ${plRoot}`);
  }

  info(`Parsed ${datasources.length} FDMEE datasources, ${integrations.length} integrations.`);
  return { datasources, integrations };
}

/**
 * Parse a TargetApplicationForLcmVO XML.
 * Returns a simple object with name, type, subType, description.
 */
function parseFdmeeAppDef(xml, fallbackName) {
  const rowBlock = xmlInner(xml, 'TargetApplicationForLcmVORow');
  if (!rowBlock) {
    // Try legacy format
    const m = xml.match(/<applicationDetails\s+([^>]*?)>/);
    if (m) {
      return {
        name:        xmlAttr(m[0], 'name') || fallbackName,
        type:        xmlAttr(m[0], 'type'),
        description: htmlToPlainText(xmlInner(xml, 'description')),
      };
    }
    return { name: fallbackName, type: '', description: '' };
  }

  const name    = xmlInner(rowBlock, 'ApplicationName').trim() || fallbackName;
  const type    = xmlInner(rowBlock, 'TargetApplicationSubType').trim() ||
                  xmlInner(rowBlock, 'DataLoadMethod').trim();
  const appType = xmlInner(rowBlock, 'TargetApplicationType').trim();

  return { name, type, appType };
}

function parsePlanningApp(appDir, appName) {
  // Application Definition
  let targetCube = '';
  let appType    = '';
  const defFile = path.join(appDir, 'Application Definition.xml');
  if (fs.existsSync(defFile)) {
    const xml = readFile(defFile);
    if (xml) {
      const row = xmlInner(xml, 'TargetApplicationForLcmVORow');
      if (row) {
        targetCube = xmlInner(row, 'TargetApplicationName').trim();
        appType    = xmlInner(row, 'TargetApplicationType').trim();
      }
    }
  }

  // Data Load Rules — collect all rules from all DataRuleForLcmVORow blocks
  const rules = [];
  const dlrFile = path.join(appDir, 'Data Load Rule.xml');
  if (fs.existsSync(dlrFile)) {
    const xml = readFile(dlrFile);
    if (xml) {
      const blockRe = /<DataRuleForLcmVORow>([\s\S]*?)<\/DataRuleForLcmVORow>/g;
      let bm;
      while ((bm = blockRe.exec(xml)) !== null) {
        const block = bm[1];
        const ruleName = xmlInner(block, 'RuleName').trim();
        if (!ruleName) continue;

        // Scenario is usually in Data Load Mapping By Location files,
        // but PlanType gives us the cube/plan info
        const planType      = xmlInner(block, 'PlanType').trim();
        const balanceType   = xmlInner(block, 'BalanceType').trim();
        const scenario      = xmlInner(block, 'ScenarioName').trim() ||
                              xmlInner(block, 'Scenario').trim();

        rules.push({
          name:     ruleName,
          planType,
          ...(scenario  ? { targetScenario: scenario } : {}),
          ...(balanceType && balanceType !== 'null' ? { balanceType } : {}),
        });
      }
    }
  }

  // Mapping dimensions (csv filenames under Data Load Mapping By Location)
  const mappingDims = [];
  const mapDir = path.join(appDir, 'Data Load Mapping By Location');
  if (fs.existsSync(mapDir)) {
    try {
      for (const f of fs.readdirSync(mapDir)) {
        if (f.endsWith('.csv')) mappingDims.push(path.basename(f, '.csv'));
      }
    } catch (e) { warn(`Cannot read mapping dir ${mapDir}: ${e.message}`); }
  }

  return {
    appName,
    targetCube,
    appType,
    rules,
    ...(mappingDims.length > 0 ? { mappingDims } : {}),
  };
}

// ---------------------------------------------------------------------------
// 7. Parse Navigation Flows
// ---------------------------------------------------------------------------
// Navigation Flows XML has a large CDATA block (usageXML) containing the full
// menu tree. Each <card> is a top-level module (Revenue, OpEx, Workforce…).
// Each <tab> is a sub-section. Artifacts reference form/dashboard names.
// We extract only the business modules (skip system/admin cards).

const SYSTEM_CARDS = new Set([
  'Tasks','Reporting and Analytics','Strategic Modeling','Approvals','Application',
  'Overview','Settings','Valid Intersections','Data Exchange','Jobs','Configure',
  'Cell Level Security','Approval Groups','Task Manager','Services','Data',
  'Dashboards','Rules','Reports','Tools','Appearance','Variables','Announcements',
  'Artifact Labels','Access Control','Navigation Flows','Daily Maintenance',
  'Connections','Migration','Clone Environment','Audit','User Preferences','IPM',
  'Insights','ML Models','Training','Academy','Documentation','NetSuite Support',
  'Setup','Access Simplified Interface','Integration','Data Load Settings',
  'Data Management','Create and Manage','Action Menus','Alias Tables','Dimensions',
  'Forms','Rules Security','Smart Lists','Task Lists','Manage Exchange Rates',
  'Currency Conversions','Actions','Clear Cell Details','Copy Data','Copy Versions',
  'Reporting','Explore Repository','Reporting Web Studio','Monitor and Explore',
  'Task List Report','Application Diagnostics','System Reports','Workflow',
  'Manage Approvals','Approval Unit','Approval Unit Assignment','Import and Export',
  'Infolets','Dynamic','Financial Reports','Documents'
]);

function parseNavigationFlows() {
  const navFlowsDir = path.join(LCM_ROOT, HP_DIR, 'resource',
                                'Global Artifacts', 'Navigation Flows');
  if (!fs.existsSync(navFlowsDir)) {
    warn(`Navigation Flows dir not found: ${navFlowsDir}`);
    return [];
  }

  const flows = [];

  for (const file of fs.readdirSync(navFlowsDir)) {
    if (!file.endsWith('.xml')) continue;
    const xml = readFile(path.join(navFlowsDir, file));
    if (!xml) continue;

    // Flow name from outer tag attribute
    const outerM = xml.match(/<fuseStructure[^>]*name="([^"]+)"/);
    const flowName = outerM ? outerM[1] : file.replace('.xml', '');

    // The menu tree is inside a CDATA block
    const cdataM = xml.match(/<usageXML><!\[CDATA\[([\s\S]*?)\]\]><\/usageXML>/);
    if (!cdataM) continue;
    const usage = cdataM[1];

    // Parse card blocks — each card is a top-level module
    // We need to track nesting manually because cards can contain cards (sub-menus)
    const modules = [];
    const cardBlockRe = /<card\b([^>]*)>([\s\S]*?)<\/card>/g;
    let m;
    while ((m = cardBlockRe.exec(usage)) !== null) {
      const attrs   = m[1];
      const content = m[2];
      const label   = (attrs.match(/label="([^"]+)"/) || [])[1];
      if (!label || SYSTEM_CARDS.has(label)) continue;

      // Capture LEAF tabs only — those whose refObjectDefId points to a real
      // artifact (form / dashboard / FR report). Skip container tabs like
      // EFS_CHILD_TABS_TF that just hold more tabs. Walk the card content
      // linearly: find each <tab ...> opening, examine its attributes, and
      // grab the next <tfParameter ... artifactName="..."> after it.
      const LEAF_TYPES = {
        FORMS_RT_TF: 'form',
        DASHBOARDS_TF: 'dashboard',
        DASHBOARDS_RT_TF: 'dashboard',
        FR_REPORTS_TF: 'report',
        MR_REPORTS_TF: 'report',
        MR_REPORTS_RT_TF: 'report'
      };
      const tabs = [];
      // Match every <tab ...> opening (greedy attrs to first '>')
      const tabOpenRe = /<tab\s+([^>]*?)(\/?)>/g;
      let tbm;
      while ((tbm = tabOpenRe.exec(content)) !== null) {
        const tabAttrs = tbm[1];
        const isSelfClose = tbm[2] === '/';
        const refObjDef = (tabAttrs.match(/refObjectDefId="([^"]+)"/) || [])[1] || '';
        const tabType = LEAF_TYPES[refObjDef];
        if (!tabType) continue; // skip containers + system tabs
        const tabLabel = (tabAttrs.match(/label="([^"]+)"/) || [])[1];
        if (!tabLabel || tabLabel === 'Child Tabs') continue;
        // For self-closing tabs, artifactName might be in attributes; otherwise
        // look in the body up to the next </tab> at the same nesting level.
        let artifactName = '';
        if (isSelfClose) {
          artifactName = (tabAttrs.match(/artifactName="([^"]+)"/) || [])[1] || '';
        } else {
          // Inner tfParameter artifactName — search forward up to ~3000 chars
          // (a single tab's tfParameters block is small).
          const after = content.slice(tbm.index + tbm[0].length, tbm.index + tbm[0].length + 3000);
          const artM = after.match(/<tfParameter[^>]*artifactName="([^"]+)"/);
          artifactName = artM ? artM[1].trim() : '';
        }
        tabs.push({ label: tabLabel, artifactName: artifactName.trim(), type: tabType });
      }

      // Back-compat: also expose the flat name lists older add-in code expects
      const tabLabels = tabs.map(t => t.label);
      const artifacts = new Set();
      for (const t of tabs) if (t.artifactName) artifacts.add(t.artifactName.replace(/\.$/, ''));

      modules.push({
        module:    label,
        tabs:      tabLabels,                // back-compat: array of strings
        tabsDetail: tabs,                    // NEW: full {label, artifactName, type}
        artifacts: [...artifacts]
      });
    }

    if (modules.length) {
      flows.push({ name: flowName, modules });
    }
  }

  // Enrich: for each module, match artifact names against form names to get formNames[]
  // (so the KB has a direct module→forms link for Gemini)
  info(`Parsed ${flows.length} navigation flow(s).`);
  return flows;
}

// ---------------------------------------------------------------------------
// Financial Reports (FR) — live in DOCREP-Document Repository, separate from
// Planning. Listed in info/listing.xml as <resource type="application/hyperion-reports-report">
// ---------------------------------------------------------------------------
function parseFinancialReports() {
  const reports = [];
  const listingPath = path.join(LCM_ROOT, 'DOCREP-Document Repository', 'info', 'listing.xml');
  if (!fs.existsSync(listingPath)) {
    info('No DOCREP listing.xml — skipping Financial Reports.');
    return reports;
  }
  const xml = readFile(listingPath);
  if (!xml) return reports;

  // Match <resource ... type="application/hyperion-reports-report" .../>
  const re = /<resource\s+([^>]*?type="application\/hyperion-reports-report"[^>]*?)\/>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const tag = m[0];
    const name = xmlAttr(tag, 'name');
    if (!name) continue;
    reports.push({
      kind: 'financial-report',
      name,
      path: xmlAttr(tag, 'path'),
      description: xmlAttr(tag, 'description'),
      lastUpdated: xmlAttr(tag, 'lastUpdated'),
      modifiedBy: xmlAttr(tag, 'modifiedBy'),
    });
  }
  // Also pick up book objects (compound reports)
  const reBook = /<resource\s+([^>]*?type="application\/hyperion-reports-book"[^>]*?)\/>/g;
  while ((m = reBook.exec(xml)) !== null) {
    const tag = m[0];
    const name = xmlAttr(tag, 'name');
    if (!name) continue;
    reports.push({
      kind: 'fr-book',
      name,
      path: xmlAttr(tag, 'path'),
      description: xmlAttr(tag, 'description'),
    });
  }
  info(`Parsed ${reports.length} Financial Report artifacts.`);
  return reports;
}

/** Normalize a name for fuzzy matching: lowercase, strip NFS_ prefix, trailing dots, extra spaces */
function normalizeName(s) {
  return (s || '')
    .toLowerCase()
    .replace(/^nfs_/i, '')
    .replace(/\.$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Post-process: attach module info to each form (which module owns this form?) */
function buildFormModuleIndex(forms, navigationFlows) {
  // Build map from normalized artifact/tab name → module
  const artifactToModule = {};
  for (const flow of navigationFlows) {
    for (const mod of flow.modules) {
      for (const art of [...mod.artifacts, ...mod.tabs]) {
        const key = normalizeName(art);
        if (key && !artifactToModule[key]) artifactToModule[key] = mod.module;
      }
    }
  }
  for (const form of forms) {
    const key = normalizeName(form.name);
    const mod = artifactToModule[key];
    if (mod) { form.module = mod; continue; }
    // Fallback: partial match — form name is contained in artifact or vice versa
    for (const [art, artMod] of Object.entries(artifactToModule)) {
      if (key.length > 6 && (art.includes(key) || key.includes(art))) {
        form.module = artMod;
        break;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('========================================');
  console.log(' parse-lcm.js  –  LCM Export Parser');
  console.log(`  LCM root : ${LCM_ROOT}`);
  console.log(`  Output   : ${OUT_FILE}`);
  console.log('========================================\n');

  if (!fs.existsSync(LCM_ROOT)) {
    console.error(`ERROR: LCM root directory not found: ${LCM_ROOT}`);
    process.exit(1);
  }

  // 1. Forms + Dashboards (separated by dashboard="true" attribute)
  const { forms, dashboards } = parseForms();

  // 2. Rules & rulesets
  const { rules: rulesMap, rulesets } = parseRulesAndRuleSets();

  // 3. Reverse index — rules referenced by forms (not by dashboards)
  buildRuleFormIndex(rulesMap, forms);
  const rules = Object.values(rulesMap).sort((a, b) => a.name.localeCompare(b.name));

  // 3b. Cross-check form.attachedRules against the registered rules list.
  // If a rule is tagged kind="runnable" by calcType heuristic BUT isn't in
  // the parsed rules list (i.e. has no separate <rule> file in the LCM →
  // not registered as a Job Definition), downgrade to "notRegistered".
  // This catches edge cases where calcType is missing/empty but the rule
  // can't actually be invoked via REST.
  const registeredNames = new Set(rules.map(r => (r.name||"").toLowerCase()));
  let downgraded = 0;
  for (const f of forms) {
    if (!Array.isArray(f.attachedRules)) continue;
    for (const r of f.attachedRules) {
      if (r.kind === 'runnable' && r.name) {
        if (!registeredNames.has(r.name.toLowerCase())) {
          r.kind = 'notRegistered';
          downgraded++;
        }
      }
    }
  }
  if (downgraded > 0) {
    console.log(`[INFO]  Downgraded ${downgraded} form-rule attachment(s) to kind='notRegistered' (not in rules list).`);
  }

  // 4. Dimensions
  const dimensions = parseDimensions();

  // 5. Substitution variables
  const substitutionVariables = parseSubstitutionVariables();

  // 6. FDMEE
  const fdmee = parseFdmee();

  // 7. Navigation flows
  const navigationFlows = parseNavigationFlows();

  // 7b. Financial Reports (FR) — separate repository from Planning
  const financialReports = parseFinancialReports();

  // 7c. IPM / AI Insights footprint (Auto Predict batches) — pure-LCM
  const { detectIPM } = require('./detect-ipm');
  const ipm = detectIPM(LCM_ROOT);

  // 8. Enrich forms with their owning module (from nav flows)
  buildFormModuleIndex(forms, navigationFlows);

  // Derive app name from the HP-* folder in the LCM root (e.g. "HP-NetSuite" → "NetSuite").
  let appName = "Unknown";
  try {
    const hpFolder = fs.readdirSync(LCM_ROOT).find(n => n.startsWith("HP-"));
    if (hpFolder) appName = hpFolder.replace(/^HP-/, "");
  } catch (_) {}

  // Assemble
  const kb = {
    generatedAt: new Date().toISOString(),
    appName,
    client: appName,
    schemaVersion: 6,                    // bump: + kb.ipm (IPM/Auto Predict footprint). v5: form.attachedRules[].kind classifies runnable vs calcScript vs memberFormula vs notRegistered
    forms,                                // input + review only (kind: 'input' | 'review')
    dashboards,                           // dashboard="true" composite forms
    financialReports,                     // FR reports + books from DOCREP
    rules,
    rulesets,
    dimensions,
    substitutionVariables,
    fdmee,
    navigationFlows,
    ipm,                                  // IPM/Auto Predict footprint (kb.ipm)
  };

  // Write
  try {
    fs.writeFileSync(OUT_FILE, JSON.stringify(kb, null, 2), 'utf8');
    console.log(`\nWrote ${OUT_FILE}`);
  } catch (e) {
    console.error(`ERROR writing output: ${e.message}`);
    process.exit(1);
  }

  // Summary
  const totalDimMembers  = Object.values(dimensions).reduce((s, a) => s + a.length, 0);
  const ruleAttachments  = forms.reduce((s, f) => s + f.attachedRules.length, 0);

  const inputForms = forms.filter(f => f.kind === 'input').length;
  const reviewForms = forms.filter(f => f.kind === 'review').length;
  console.log('\n========================================');
  console.log(' Summary');
  console.log('========================================');
  console.log(`  Forms (total)          : ${forms.length}  (input: ${inputForms}, review: ${reviewForms})`);
  console.log(`  Dashboards             : ${dashboards.length}`);
  console.log(`  Financial Reports      : ${financialReports.length}`);
  console.log(`  Rules (unique)         : ${rules.length}`);
  console.log(`  Rule attachments       : ${ruleAttachments}`);
  console.log(`  RuleSets               : ${rulesets.length}`);
  console.log(`  Dimensions             : ${Object.keys(dimensions).length}`);
  console.log(`  Dimension members      : ${totalDimMembers}`);
  console.log(`  Substitution variables : ${substitutionVariables.length}`);
  console.log(`  FDMEE datasources      : ${fdmee.datasources.length}`);
  console.log(`  FDMEE integrations     : ${fdmee.integrations.length}`);
  const totalModules = navigationFlows.reduce((s, f) => s + f.modules.length, 0);
  const formsWithModule = forms.filter(f => f.module).length;
  console.log(`  Navigation flows       : ${navigationFlows.length} (${totalModules} modules)`);
  console.log(`  Forms with module tag  : ${formsWithModule} / ${forms.length}`);
  console.log('========================================\n');

  // ── AI enrichment (optional) ────────────────────────────────────────
  // If GEMINI_API_KEY (or GOOGLE_API_KEY) is set, run one Gemini pass per
  // rule/form to generate plain-English aiSummary fields. The worker's
  // runExplain reads these directly — no runtime AI call needed.
  // Set SKIP_ENRICH=1 to disable.
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (apiKey && !process.env.SKIP_ENRICH) {
    try {
      const { enrichKb } = require('./enrich-kb');
      console.log('========================================');
      console.log(' AI enrichment pass (Gemini Flash)');
      console.log('========================================');
      const t0 = Date.now();
      await enrichKb({
        kb,
        apiKey,
        concurrency: parseInt(process.env.ENRICH_CONCURRENCY || '6', 10),
        force: !!process.env.ENRICH_FORCE,
      });
      // Re-write the KB with the enrichment fields populated
      fs.writeFileSync(OUT_FILE, JSON.stringify(kb, null, 2), 'utf8');
      console.log(`\n✓ Enriched + rewrote ${OUT_FILE} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    } catch (e) {
      console.warn(`\n⚠ Enrichment failed (KB still usable without aiSummary): ${e.message}`);
    }
  } else if (!apiKey) {
    console.log('ℹ Skipping AI enrichment — set GEMINI_API_KEY to enable plain-English summaries on each rule/form.');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
