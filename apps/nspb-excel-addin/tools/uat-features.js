'use strict';
// Automated feature UAT for the Web Console Copilot side panel.
// Drives the REAL panel (sidepanel.html) via CDP: types each command like a
// user, waits, reads the resulting AI bubble(s), and asserts expected signals.
// KB-card features need no Planning login; worker features hit the live Worker.
//   node tools/uat-features.js
const PORT = process.env.CDP_PORT || 9222;
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function httpJson(p) { return (await fetch(`http://127.0.0.1:${PORT}${p}`)).json(); }
async function panel() {
  const list = await httpJson('/json/list');
  const t = list.find(x => (x.url || '').includes('sidepanel.html'));
  if (!t) throw new Error('panel tab not found — open sidepanel.html');
  return t;
}
function ws(url) {
  return new Promise((resolve, reject) => {
    const s = new WebSocket(url); let id = 0; const pend = new Map();
    s.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { const p = pend.get(d.id); pend.delete(d.id); d.error ? p.rej(new Error(d.error.message)) : p.res(d.result); } };
    s.onopen = () => resolve({
      eval: (expr) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); s.send(JSON.stringify({ id: i, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true, awaitPromise: true } })); }).then(r => r.result && r.result.value),
      key: (k, code, vk) => new Promise((res) => { const i = ++id; pend.set(i, { res, rej: res }); s.send(JSON.stringify({ id: i, method: 'Input.dispatchKeyEvent', params: { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk, text: k === 'Enter' ? '\r' : undefined } })); }),
      close: () => s.close(),
    });
    s.onerror = () => reject(new Error('ws fail — debug Chrome on :' + PORT + '?'));
  });
}

async function send(c, text) {
  // set the input value + dispatch the form submit (same path as a real user)
  await c.eval(`(()=>{const i=document.getElementById('input');i.value=${JSON.stringify(text)};document.getElementById('composer').dispatchEvent(new Event('submit',{cancelable:true,bubbles:true}));return true;})()`);
}
async function lastAi(c, n = 1) {
  return c.eval(`JSON.stringify([...document.querySelectorAll('.msg.ai')].slice(-${n}).map(e=>e.innerText))`);
}
async function chipCount(c) {
  return c.eval(`document.querySelectorAll('.msg .chip').length`);
}

// each test: { q, wait, expect:[...substrings any-of OR all], mode:'all'|'any' }
const SUITE = [
  { q: 'explain form Seed Budget', wait: 2500, mode: 'all', expect: ['input form', 'runs on Save', '= FY26', 'Open as ad-hoc'] },
  { q: 'explain rule AGG - IncStmt - Forecast', wait: 2500, mode: 'all', expect: ['What it calculates', '&FcstYr1', 'Runs from these forms', 'How to run it'] },
  { q: 'explain variable CurrentScenario', wait: 2500, mode: 'all', expect: ['What it controls', 'Forecast', 'When to update'] },
  { q: 'performance', wait: 2500, mode: 'all', expect: ['BPC-delivered service', 'LCM export', 'Level-0 data export', 'Activity Report'] },
  { q: 'change subsidiary to Total Subsidiary', wait: 2500, mode: 'all', expect: ['click the', 'Member Selector', 'parent'] },
  { q: 'check variables', wait: 16000, mode: 'any', expect: ['variable', 'LastClosedMonth', 'month-end', 'roll'] },
  { q: 'month-end close', wait: 18000, mode: 'any', expect: ['Substitution Variables', 'LastClosedMonth', 'Copy', 'actuals'] },
  { q: 'what should I do at the start of a new month?', wait: 16000, mode: 'any', expect: ['variable', 'month', 'actuals', 'forecast'], chips: true },
  { q: 'who changed this cell', wait: 1500, mode: 'all', expect: ['Change History', 'right-click', 'Audit'], chips: true },
  { q: 'cell history', wait: 1500, mode: 'any', expect: ['who last modified', 'change history'] },
];

(async () => {
  const t = await panel();
  const c = await ws(t.webSocketDebuggerUrl);
  // sanity: KB present
  const kb = JSON.parse(await c.eval(`JSON.stringify({forms:(window.KB&&KB.forms||[]).length,rules:(window.KB&&KB.rules||[]).length,vars:(window.KB&&KB.substitutionVariables||[]).length,dims:window.KB&&KB.dimensions?Object.keys(KB.dimensions).length:0})`) || '{}');
  console.log(`KB loaded: ${kb.forms} forms · ${kb.rules} rules · ${kb.vars} vars · ${kb.dims} dims\n`);

  let pass = 0, fail = 0;
  for (const [i, tst] of SUITE.entries()) {
    await send(c, tst.q);
    await sleep(tst.wait);
    const arr = JSON.parse(await lastAi(c, 3) || '[]');
    const text = arr.join('\n').toLowerCase();
    const hits = tst.expect.filter(e => text.includes(e.toLowerCase()));
    let ok = tst.mode === 'all' ? hits.length === tst.expect.length : hits.length > 0;
    if (tst.chips) { const ch = await chipCount(c); if (ch < 1) ok = false; }
    console.log(`${String(i + 1).padStart(2)}. [${ok ? 'PASS' : 'FAIL'}] ${tst.q}`);
    if (!ok) console.log(`      matched ${hits.length}/${tst.expect.length} [${hits.join(', ')}] · got: ${text.slice(0, 160).replace(/\n/g, ' ')}`);
    ok ? pass++ : fail++;
  }
  console.log(`\n────────────────  PASS ${pass} · FAIL ${fail}  ────────────────`);
  c.close();
})().catch(e => { console.error('UAT ERROR:', e.message); process.exit(1); });
