'use strict';
// Automated survey of the REAL NSPB Planning console via CDP (port 9222).
// Crawls: home clusters/cards → inside each card: groups + bottom tabs +
// load timing; plus the full Navigator menu inventory. Produces a VERIFIED
// console map (vs the LCM-inferred navIndex):
//   clients/<CLIENT>/console-map.json
// Run:  node tools/survey-console.js   (Chrome must be up with --remote-debugging-port)
const fs = require('fs');
const path = require('path');
const PORT = process.env.CDP_PORT || 9222;
const CLIENT = process.env.CLIENT || 'squarespace';
const OUT = path.join(__dirname, '..', 'clients', CLIENT, 'console-map.json');
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function httpJson(p) { return (await fetch(`http://127.0.0.1:${PORT}${p}`)).json(); }
async function planningTarget() {
  const list = await httpJson('/json/list');
  const t = list.find(x => (x.url || '').includes('/HyperionPlanning/'));
  if (!t) throw new Error('No Planning tab open');
  return t;
}

// One persistent WS session for the whole survey (faster than per-call).
function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0; const pending = new Map();
    ws.onmessage = m => {
      const d = JSON.parse(m.data);
      if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.rej(new Error(d.error.message)) : p.res(d.result); }
    };
    ws.onopen = () => resolve({
      send: (method, params) => new Promise((res, rej) => { const mid = ++id; pending.set(mid, { res, rej }); ws.send(JSON.stringify({ id: mid, method, params: params || {} })); }),
      close: () => ws.close(),
    });
    ws.onerror = () => reject(new Error('WS connect failed — browser running with --remote-debugging-port=' + PORT + '?'));
  });
}

const evalJs = async (s, expr) => {
  const r = await s.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description || 'error').slice(0, 200));
  return r.result ? r.result.value : undefined;
};

async function click(s, x, y) {
  await s.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
  await s.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 1, clickCount: 1 });
}

// In-page inventory helper (injected once per evaluation; ES5-safe).
const INVENTORY = `(function(){
  function vis(el){var r=el.getBoundingClientRect();return r.width>4&&r.height>4&&r.bottom>0&&r.right>0;}
  function txt(e){return (e.textContent||'').trim();}
  var out={homeCards:[],topStrip:[],groups:[],bottomTabs:[],title:document.title};
  [].slice.call(document.querySelectorAll('.app-nav-label')).filter(vis).forEach(function(e){
    var r=e.getBoundingClientRect();out.homeCards.push({label:txt(e),x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)});});
  [].slice.call(document.querySelectorAll('a[role="tab"]')).filter(vis).forEach(function(e){
    var r=e.getBoundingClientRect();var item={label:txt(e)||e.getAttribute('title')||'',x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)};
    if(!item.label)return;
    if(r.top<100)out.topStrip.push(item);else if(r.left<130)out.groups.push(item);else if(r.top>700)out.bottomTabs.push(item);});
  return JSON.stringify(out);
})()`;

async function inventory(s) { return JSON.parse(await evalJs(s, INVENTORY)); }
async function waitFor(s, expr, maxMs, step) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    try { if (await evalJs(s, expr)) return Date.now() - t0; } catch (_) {}
    await sleep(step || 1500);
  }
  return -1;
}
async function goHome(s) {
  // click the ⌂ Home icon, then wait for home tiles
  const c = await evalJs(s, `(function(){var e=document.querySelector('[aria-label="Home"],a[title="Home"]');if(!e)return null;var r=e.getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)};})()`);
  if (c) { await click(s, c.x, c.y); }
  return waitFor(s, `!!document.querySelector('.app-nav-label')`, 40000);
}

(async () => {
  const t = await planningTarget();
  const s = await connect(t.webSocketDebuggerUrl);
  await s.send('Runtime.enable'); await s.send('Page.enable');
  const map = { surveyedAt: new Date().toISOString(), client: CLIENT, clusters: [], navigator: null, timingsMs: {} };

  console.log('— ensuring home —');
  const tHome = await goHome(s);
  console.log('home ready in', tHome, 'ms');

  // 1) Home inventory
  let inv = await inventory(s);
  const cards = inv.homeCards.filter((c, i, a) => a.findIndex(x => x.label === c.label) === i);
  console.log('home cards:', cards.map(c => c.label).join(' · '));

  // 2) Navigator inventory (open ☰, capture links, close with Esc)
  const navBtn = await evalJs(s, `(function(){var e=document.querySelector('[aria-label="Navigator"],a[title="Navigator"]');if(!e)return null;var r=e.getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)};})()`);
  if (navBtn) {
    await click(s, navBtn.x, navBtn.y); await sleep(2500);
    map.navigator = await evalJs(s, `(function(){
      var links=[].slice.call(document.querySelectorAll('a')).filter(function(e){var r=e.getBoundingClientRect();return r.width>4&&r.height>4;});
      return links.map(function(e){return (e.textContent||'').trim();}).filter(function(t){return t&&t.length<40;}).slice(0,120);
    })()`);
    await s.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await s.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await sleep(1200);
    console.log('navigator items:', (map.navigator || []).length);
  }

  // 3) Deep-crawl each home card (skip obvious system tiles to save time)
  const SKIP = new Set(['Academy', 'Tour', 'Documents']);
  for (const card of cards) {
    if (SKIP.has(card.label)) { console.log('skip', card.label); continue; }
    console.log('→ card:', card.label);
    const entry = { card: card.label, groups: [], bottomTabs: [], topStrip: [], loadMs: -1 };
    try {
      // re-locate the tile fresh (layout can shift), then click
      const c = await evalJs(s, `(function(){
        var els=[].slice.call(document.querySelectorAll('.app-nav-label'));
        for(var i=0;i<els.length;i++){if((els[i].textContent||'').trim()===${JSON.stringify(card.label)}){var r=els[i].getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)};}}
        return null;})()`);
      if (!c) { console.log('  tile not found, skipping'); continue; }
      await click(s, c.x, c.y);
      // wait until either tabs render or home tiles are gone+content present
      entry.loadMs = await waitFor(s, `(!!document.querySelector('a[role="tab"]') && !document.querySelector('.app-nav-label'))`, 50000);
      await sleep(2500);
      inv = await inventory(s);
      const ded = arr => arr.map(x => x.label).filter((v, i, a) => v && a.indexOf(v) === i);
      entry.topStrip = ded(inv.topStrip);
      entry.groups = ded(inv.groups);
      entry.bottomTabs = ded(inv.bottomTabs);
      entry.title = inv.title;
      console.log(`  loaded ${entry.loadMs}ms · strip[${entry.topStrip.join(', ')}] · groups[${entry.groups.join(', ')}] · tabs[${entry.bottomTabs.join(', ')}]`);
    } catch (e) { entry.error = String(e.message).slice(0, 120); console.log('  ERROR', entry.error); }
    map.clusters.push(entry);
    map.timingsMs[card.label] = entry.loadMs;
    const back = await goHome(s);
    if (back < 0) { console.log('  could not return home — aborting crawl'); break; }
  }

  fs.writeFileSync(OUT, JSON.stringify(map, null, 2));
  console.log('\n✓ wrote', OUT);
  s.close();
})().catch(e => { console.error('SURVEY ERROR:', e.message); process.exit(1); });
