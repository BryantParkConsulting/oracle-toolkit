'use strict';
// Dependency-free Chrome DevTools Protocol client (Node ≥21, global WebSocket).
// Professional live-debugging bridge: run Edge/Chrome with
//   --remote-debugging-port=9222
// and this tool gets BROWSER-LEVEL access — including chrome-extension://
// pages (the NSPB AI side panel!), service workers, console logs, screenshots.
//
// Usage:
//   node tools/cdp.js targets                      list all debuggable targets
//   node tools/cdp.js shot   <idOrUrlPart> <out.png>   screenshot a target
//   node tools/cdp.js eval   <idOrUrlPart> "<js>"      evaluate JS in a target
//   node tools/cdp.js open   <url>                     open a new tab (any scheme)
//   node tools/cdp.js logs   <idOrUrlPart>             dump recent console msgs (5s)

const fs = require('fs');
const PORT = process.env.CDP_PORT || 9222;

async function httpJson(path) {
  const r = await fetch(`http://127.0.0.1:${PORT}${path}`);
  return r.json();
}

function wsCall(wsUrl, fn) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0; const pending = new Map(); const events = [];
    const send = (method, params) => new Promise((res, rej) => {
      const mid = ++id;
      pending.set(mid, { res, rej });
      ws.send(JSON.stringify({ id: mid, method, params: params || {} }));
    });
    ws.onmessage = (m) => {
      const d = JSON.parse(m.data);
      if (d.id && pending.has(d.id)) {
        const p = pending.get(d.id); pending.delete(d.id);
        d.error ? p.rej(new Error(d.error.message)) : p.res(d.result);
      } else if (d.method) events.push(d);
    };
    ws.onopen = async () => {
      try { resolve(await fn(send, events)); }
      catch (e) { reject(e); }
      finally { ws.close(); }
    };
    ws.onerror = (e) => reject(new Error('WS error — is the browser running with --remote-debugging-port=' + PORT + '?'));
  });
}

async function findTarget(needle) {
  const list = await httpJson('/json/list');
  const t = list.find(x => x.id === needle)
    || list.find(x => (x.url || '').includes(needle))
    || list.find(x => (x.title || '').toLowerCase().includes(needle.toLowerCase()));
  if (!t) throw new Error(`No target matching "${needle}". Run: node tools/cdp.js targets`);
  return t;
}

(async () => {
  const [cmd, a, b] = process.argv.slice(2);
  if (cmd === 'targets') {
    const list = await httpJson('/json/list');
    for (const t of list) {
      console.log(`${t.type.padEnd(15)} ${t.id}  ${(t.title || '').slice(0, 45).padEnd(46)} ${(t.url || '').slice(0, 90)}`);
    }
  } else if (cmd === 'shot') {
    const t = await findTarget(a);
    const out = b || 'cdp-shot.png';
    await wsCall(t.webSocketDebuggerUrl, async (send) => {
      await send('Page.enable');
      const { data } = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(out, Buffer.from(data, 'base64'));
      console.log('wrote', out, `(${t.title})`);
    });
  } else if (cmd === 'eval') {
    const t = await findTarget(a);
    await wsCall(t.webSocketDebuggerUrl, async (send) => {
      const r = await send('Runtime.evaluate', { expression: b, returnByValue: true, awaitPromise: true });
      console.log(JSON.stringify(r.result && r.result.value !== undefined ? r.result.value : r.result, null, 1));
    });
  } else if (cmd === 'setfile') {
    // setfile <urlPart> <cssSelector> <absoluteFilePath>  → fills a file <input>
    const t = await findTarget(a);
    const selector = process.argv[4], filePath = process.argv[5];
    await wsCall(t.webSocketDebuggerUrl, async (send) => {
      await send('DOM.enable'); await send('Runtime.enable');
      const { result } = await send('Runtime.evaluate', { expression: `document.querySelector(${JSON.stringify(selector)})` });
      if (!result.objectId) throw new Error('selector not found: ' + selector);
      await send('DOM.setFileInputFiles', { files: [filePath], objectId: result.objectId });
      console.log('set file', filePath, 'on', selector);
    });
  } else if (cmd === 'reload') {
    const t = await findTarget(a);
    await wsCall(t.webSocketDebuggerUrl, async (send) => { await send('Page.enable'); await send('Page.reload'); console.log('reloaded', t.title); });
  } else if (cmd === 'click') {
    // click <urlPart> "<cssSelector>"  → real trusted click at element center
    const t = await findTarget(a);
    await wsCall(t.webSocketDebuggerUrl, async (send) => {
      await send('Runtime.enable');
      const r = await send('Runtime.evaluate', { expression: `(()=>{const e=document.querySelector(${JSON.stringify(b)});if(!e)return null;e.scrollIntoView({block:'center'});const c=e.getBoundingClientRect();return{x:Math.round(c.left+c.width/2),y:Math.round(c.top+c.height/2)};})()`, returnByValue: true });
      const p = r.result.value; if (!p) throw new Error('not found: ' + b);
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1 });
      console.log('clicked', b, 'at', p.x, p.y);
    });
  } else if (cmd === 'type') {
    // type <urlPart> "<cssSelector>" "<text>"  → set input value + fire input event
    const t = await findTarget(a);
    const txt = process.argv[5] || '';
    await wsCall(t.webSocketDebuggerUrl, async (send) => {
      await send('Runtime.evaluate', { expression: `(()=>{const e=document.querySelector(${JSON.stringify(b)});e.value=${JSON.stringify(txt)};e.dispatchEvent(new Event('input',{bubbles:true}));return true;})()`, returnByValue: true });
      console.log('typed into', b);
    });
  } else if (cmd === 'open') {
    const browserWs = (await httpJson('/json/version')).webSocketDebuggerUrl;
    await wsCall(browserWs, async (send) => {
      const r = await send('Target.createTarget', { url: a });
      console.log('opened targetId:', r.targetId);
    });
  } else if (cmd === 'logs') {
    const t = await findTarget(a);
    await wsCall(t.webSocketDebuggerUrl, async (send, events) => {
      await send('Runtime.enable');
      await send('Log.enable').catch(() => {});
      await new Promise(r => setTimeout(r, 5000));
      for (const e of events) {
        if (e.method === 'Runtime.consoleAPICalled') {
          const args = (e.params.args || []).map(x => x.value !== undefined ? x.value : x.description).join(' ');
          console.log(`[console.${e.params.type}]`, String(args).slice(0, 300));
        } else if (e.method === 'Log.entryAdded') {
          console.log(`[${e.params.entry.level}]`, String(e.params.entry.text).slice(0, 300));
        }
      }
      console.log('(5s window done)');
    });
  } else {
    console.log('usage: node tools/cdp.js targets | shot <id|urlPart> [out.png] | eval <id|urlPart> "<js>" | open <url> | logs <id|urlPart>');
  }
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
