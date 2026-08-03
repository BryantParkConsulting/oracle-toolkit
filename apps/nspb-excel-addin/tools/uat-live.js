'use strict';
// Live, user-faithful UAT driver: types into the REAL extension side panel
// with TRUSTED keystrokes (CDP Input.insertText + Enter), exactly like a
// human. Then screenshots panel + Planning for visual verification.
//   node tools/uat-live.js say "open form Income Statement Adjustments"
//   node tools/uat-live.js wait 30
//   node tools/uat-live.js shots <prefix>     → <prefix>-panel.png + <prefix>-planning.png
//   node tools/uat-live.js lastmsg            → last chat bubble text
const fs = require('fs');
const PORT = process.env.CDP_PORT || 9222;
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function httpJson(p) { return (await fetch(`http://127.0.0.1:${PORT}${p}`)).json(); }
async function target(part) {
  const list = await httpJson('/json/list');
  const t = list.find(x => (x.url || '').includes(part));
  if (!t) throw new Error('no target ' + part);
  return t;
}
function wsCall(wsUrl, fn) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0; const pending = new Map();
    const send = (m, p) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p || {} })); });
    ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { const q = pending.get(d.id); pending.delete(d.id); d.error ? q.rej(new Error(d.error.message)) : q.res(d.result); } };
    ws.onopen = async () => { try { resolve(await fn(send)); } catch (e) { reject(e); } finally { ws.close(); } };
    ws.onerror = () => reject(new Error('ws fail'));
  });
}
(async () => {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === 'say') {
    const text = rest.join(' ');
    const t = await target('sidepanel.html');
    await wsCall(t.webSocketDebuggerUrl, async (send) => {
      await send('Runtime.enable');
      // focus the chat input like a user clicking it
      await send('Runtime.evaluate', { expression: `(()=>{const i=document.querySelector('#input');i.focus();i.value='';return i.id||i.tagName;})()`, returnByValue: true });
      await send('Input.insertText', { text });            // trusted typing
      await sleep(300);
      for (const type of ['keyDown', 'keyUp'])             // trusted Enter
        await send('Input.dispatchKeyEvent', { type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
      console.log('typed + Enter:', text);
    });
  } else if (cmd === 'wait') {
    await sleep((parseInt(rest[0]) || 10) * 1000); console.log('waited', rest[0] + 's');
  } else if (cmd === 'shots') {
    const prefix = rest[0] || 'uat';
    for (const [part, name] of [['sidepanel.html', 'panel'], ['/HyperionPlanning/', 'planning']]) {
      try {
        const t = await target(part);
        await wsCall(t.webSocketDebuggerUrl, async (send) => {
          await send('Page.enable');
          const { data } = await send('Page.captureScreenshot', { format: 'png' });
          fs.writeFileSync(`${prefix}-${name}.png`, Buffer.from(data, 'base64'));
          console.log('wrote', `${prefix}-${name}.png`);
        });
      } catch (e) { console.log(name, 'shot failed:', e.message); }
    }
  } else if (cmd === 'lastmsg') {
    const t = await target('sidepanel.html');
    await wsCall(t.webSocketDebuggerUrl, async (send) => {
      const r = await send('Runtime.evaluate', { expression: `(()=>{const m=[...document.querySelectorAll('.msg,.message,.bubble,[class*="msg"]')];const last=m[m.length-1];return last?last.innerText.slice(0,1200):'(no messages)';})()`, returnByValue: true });
      console.log(r.result.value);
    });
  } else console.log('usage: say "<text>" | wait <s> | shots <prefix> | lastmsg');
})().catch(e => { console.error('ERR:', e.message); process.exit(1); });
