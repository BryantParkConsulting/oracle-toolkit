'use strict';
// make-kb-video.js — 1-min explainer of the Customer Hub's Knowledge Hub + AI
// chat (the "clients answer their own questions" core). Same pipeline as
// make-console-video.js: branded slides + Gemini TTS + ffmpeg, with the middle
// scenes captured live from the real hub (Products KB, 3-panel tree/article/
// chat) as demoadmin. Public asset → chat panel hidden of any real names.
//
// Salida: media/kb-tour.mp4 (+ poster) · intermedios en media/.work-kb/

const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');
const { slideHtml } = require('./hub-video-slide');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'media');
const WORK = path.join(OUT_DIR, '.work-kb');
const FINAL = path.join(OUT_DIR, 'kb-tour.mp4');
const POSTER = path.join(OUT_DIR, 'kb-tour-poster.jpg');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const CDP_PORT = 9228;

const args = process.argv.slice(2);
const CLEAN = args.includes('--clean');
const flag = (name, dflt) => { const i = args.indexOf('--' + name); return (i >= 0 && args[i + 1] && !args[i + 1].startsWith('--')) ? args[i + 1] : dflt; };
const VOICE = flag('voice', 'Puck');
const HUB = flag('hub', 'https://bpccustomerhub.web.app');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log(...a);

const SCENES = [
  {
    id: 'intro', kind: 'title',
    eyebrow: 'BPC Customer Hub · Knowledge Hub', title: 'Ask. Get answers\ngrounded in your world.',
    subtitle: 'How your team finds its own answers — in one minute.',
    narration: 'Every product guide and your own environment, documented in one place — with an AI that answers from it.',
  },
  {
    id: 'kb', kind: 'shot',
    narration: 'Your Knowledge Hub holds the product guides and your own build: forms, rules, the close process — searchable, organized, always current.',
  },
  {
    id: 'chat', kind: 'shot',
    narration: 'Ask anything in plain language. The AI answers grounded in your knowledge base and cites the exact article, so you can trust it.',
  },
  {
    id: 'article', kind: 'shot',
    narration: 'Follow the citation and the whole answer is right there — less re-training, fewer repeat questions to your team.',
  },
  {
    id: 'outro', kind: 'outro',
    eyebrow: 'The result', title: 'Your team answers\nits own questions.',
    subtitle: 'bpccustomerhub.web.app',
    narration: 'And when an answer misses, one tap flags it — we fix the source, and the AI never misses it again. Bryant Park Consulting — Customer Hub.',
  },
];
const CAPTION_OVERRIDE = {};

// Public asset: hide the floating "Ask the Hub" launcher + any client names.
const SANITIZE_JS = `(() => {
  const map = [['Coursera','Contoso'],['coursera.org','contoso.example'],['Chime','Northwind'],['Enfinity','Acme'],['Overture','Globex'],['Squarespace','Umbrella'],['Talogy','Zenith'],['Symetri','Vertex'],['Swoop','Hooli'],['Pharmalogic','Initech'],['Intelerad','Umbrella Med'],['Westman','Northwind Co']];
  const walk = n => { if (n.nodeType === 3) { let t = n.nodeValue; for (const [k,v] of map) t = t.split(k).join(v); n.nodeValue = t; } else n.childNodes.forEach(walk); };
  walk(document.body);
  document.querySelectorAll('div,button').forEach(d => {
    const cs = getComputedStyle(d);
    if ((cs.position === 'fixed' || cs.position === 'absolute') && /Ask the Hub/.test(d.textContent) && d.getBoundingClientRect().width < 520) d.style.display = 'none';
  });
  document.querySelectorAll('button').forEach(b => { if (getComputedStyle(b).position === 'fixed') { const r = b.getBoundingClientRect(); if (r.top > innerHeight*0.7 && r.left > innerWidth*0.7) b.style.display = 'none'; } });
  return 'ok';
})()`;

function loadEnv() {
  const p = path.join(ROOT, '.env');
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
function ensureFfmpeg() {
  try { execSync('ffmpeg -version', { stdio: 'ignore' }); return; } catch {}
  const base = path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Packages');
  if (fs.existsSync(base)) for (const d of fs.readdirSync(base)) {
    if (!d.startsWith('Gyan.FFmpeg')) continue;
    const stack = [path.join(base, d)];
    while (stack.length) { const cur = stack.pop(); for (const e of fs.readdirSync(cur, { withFileTypes: true })) { if (e.isDirectory()) stack.push(path.join(cur, e.name)); else if (e.name === 'ffmpeg.exe') { process.env.PATH = cur + ';' + process.env.PATH; return; } } }
  }
  console.error('\nERROR: ffmpeg no encontrado.\n'); process.exit(1);
}

async function httpJson(p) { return (await fetch(`http://127.0.0.1:${CDP_PORT}${p}`)).json(); }
function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0; const pending = new Map(); const waiters = [];
    const send = (method, params) => new Promise((res, rej) => {
      const i = ++id;
      const to = setTimeout(() => { if (pending.has(i)) { pending.delete(i); rej(new Error('CDP timeout: ' + method)); } }, 25000);
      pending.set(i, { res: v => { clearTimeout(to); res(v); }, rej: e => { clearTimeout(to); rej(e); } });
      ws.send(JSON.stringify({ id: i, method, params: params || {} }));
    });
    const wait = (method, timeout = 12000) => new Promise((res, rej) => { const w = { method, res }; waiters.push(w); setTimeout(() => { const k = waiters.indexOf(w); if (k >= 0) { waiters.splice(k, 1); rej(new Error('timeout ' + method)); } }, timeout); });
    ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.rej(new Error(d.error.message)) : p.res(d.result); } else if (d.method) { const k = waiters.findIndex(w => w.method === d.method); if (k >= 0) { const w = waiters[k]; waiters.splice(k, 1); w.res(d.params); } } };
    ws.onopen = () => resolve({ send, wait, close: () => ws.close() });
    ws.onerror = () => reject(new Error('WS error CDP:' + CDP_PORT));
  });
}
let chromeProc = null;
async function launchChrome() {
  const profile = path.join(WORK, '.chrome'); fs.mkdirSync(profile, { recursive: true });
  chromeProc = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${profile}`, '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--force-color-profile=srgb', '--window-size=1920,1080'], { stdio: 'ignore' });
  for (let i = 0; i < 50; i++) { try { await httpJson('/json/version'); return; } catch { await sleep(300); } }
  throw new Error('Chrome no levantó el debug port ' + CDP_PORT);
}
function killChrome() { if (chromeProc && chromeProc.pid) { try { execSync(`taskkill /PID ${chromeProc.pid} /T /F`, { stdio: 'ignore' }); } catch {} } }
async function getPage() { const list = await httpJson('/json/list'); const tgt = list.find(x => x.type === 'page') || list[0]; const page = await connect(tgt.webSocketDebuggerUrl); await page.send('Page.enable').catch(() => {}); return page; }
async function snap(page, file) {
  await page.send('Page.startScreencast', { format: 'png', maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
  const fr = await page.wait('Page.screencastFrame', 12000);
  await page.send('Page.screencastFrameAck', { sessionId: fr.sessionId }).catch(() => {});
  await page.send('Page.stopScreencast').catch(() => {});
  fs.writeFileSync(file, Buffer.from(fr.data, 'base64'));
}

async function captureShots(page) {
  const ev = async expr => { const r = await page.send('Runtime.evaluate', { expression: expr, returnByValue: true }); if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception?.description || 'error').slice(0, 200)); return r.result?.value; };
  const waitJs = async (expr, label, timeout = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < timeout) { if (await ev(expr).catch(() => false)) return; await sleep(500); } throw new Error('timeout esperando: ' + label); };
  const clickText = txt => ev(`(() => { const b = [...document.querySelectorAll('button, a, [role="button"]')].find(x => x.textContent.trim() === ${JSON.stringify(txt)}); if (!b) return 'NOT FOUND'; b.click(); return 'ok'; })()`);
  const shotPng = id => path.join(WORK, `scene-${id}.png`);

  log('  · login demoadmin …');
  await page.send('Page.navigate', { url: HUB }); await sleep(3000);
  await ev(`localStorage.setItem('nspbmcp_auth','1');localStorage.setItem('nspbmcp_role','super');localStorage.setItem('nspbmcp_email','demoadmin');localStorage.setItem('kb_chat_open','1');localStorage.setItem('kb_tree_open','1');'ok'`);
  await page.send('Page.navigate', { url: HUB }); await sleep(2500);
  await waitJs(`document.body.innerText.includes('Start here')`, 'console shell');

  log('  · nav Products KB …');
  if (await clickText('Products KB') !== 'ok') throw new Error('nav Products KB no encontrada');
  await waitJs(`document.body.innerText.includes('Knowledge Base') && document.body.innerText.includes('ARTICLE')`, 'KB 3-panel');
  await sleep(1800);

  // scene 'kb' — full 3-panel (tree + article + chat)
  log('  · shot kb …');
  await ev(SANITIZE_JS); await sleep(300);
  await snap(page, shotPng('kb'));

  // scene 'chat' — collapse the tree so article + AI chat get the room
  log('  · shot chat …');
  await ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => /Collapse the tree/i.test(x.title||'')); if (b) b.click(); return 'ok'; })()`);
  await sleep(1200); await ev(SANITIZE_JS); await sleep(300);
  await snap(page, shotPng('chat'));

  // scene 'article' — scroll the article body a bit for a fresh frame
  log('  · shot article …');
  await ev(`(() => { const el = [...document.querySelectorAll('div')].find(d => { const cs = getComputedStyle(d); return cs.overflowY === 'auto' && d.scrollHeight > d.clientHeight * 1.4 && /Business|Overview|SmartView|process/i.test(d.innerText); }); if (el) el.scrollTop = 240; return 'ok'; })()`);
  await sleep(900); await ev(SANITIZE_JS); await sleep(300);
  await snap(page, shotPng('article'));
}

async function renderSlides(page) {
  for (const s of SCENES.filter(x => x.kind !== 'shot')) {
    const htmlPath = path.join(WORK, `scene-${s.id}.html`);
    fs.writeFileSync(htmlPath, slideHtml(s));
    await page.send('Page.navigate', { url: 'file:///' + htmlPath.replace(/\\/g, '/') }).catch(() => {});
    await sleep(1500);
    await snap(page, path.join(WORK, `scene-${s.id}.png`));
    log(`  · slide ${s.id}`);
  }
}

function wavHeader(dataLen, rate) { const ch = 1, bits = 16, ba = ch * bits / 8, br = rate * ba; const b = Buffer.alloc(44); b.write('RIFF', 0); b.writeUInt32LE(36 + dataLen, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(ch, 22); b.writeUInt32LE(rate, 24); b.writeUInt32LE(br, 28); b.writeUInt16LE(ba, 32); b.writeUInt16LE(bits, 34); b.write('data', 36); b.writeUInt32LE(dataLen, 40); return b; }
async function ttsScene(s, apiKey) {
  const out = path.join(WORK, `scene-${s.id}.wav`);
  if (fs.existsSync(out)) { const st = fs.statSync(out); if (st.size > 44) { const rate = fs.readFileSync(out).readUInt32LE(24); return { dur: (st.size - 44) / (rate * 2), rate }; } }
  const model = 'gemini-2.5-flash-preview-tts';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const body = { contents: [{ parts: [{ text: s.narration }] }], generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } } } };
  let lastErr;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      if (!r.ok) { lastErr = new Error(`TTS HTTP ${r.status}`); await sleep(4000 * (attempt + 1)); continue; }
      const j = await r.json();
      const part = j.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
      if (!part) { lastErr = new Error('TTS sin audio'); await sleep(4000); continue; }
      const pcm = Buffer.from(part.inlineData.data, 'base64');
      const rate = parseInt((part.inlineData.mimeType.match(/rate=(\d+)/) || [])[1] || '24000', 10);
      fs.writeFileSync(out, Buffer.concat([wavHeader(pcm.length, rate), pcm]));
      return { dur: pcm.length / (rate * 2), rate };
    } catch (e) { lastErr = e; await sleep(4000); }
  }
  throw lastErr;
}

function tsAss(sec) { const cs = Math.round(sec * 100); const h = Math.floor(cs / 360000), m = Math.floor(cs % 360000 / 6000), sx = Math.floor(cs % 6000 / 100), c = cs % 100; const p = (n, w = 2) => String(n).padStart(w, '0'); return `${h}:${p(m)}:${p(sx)}.${p(c)}`; }
const clipLen = dur => Math.max(1.2, dur + 0.5);
function writeAss(durs) {
  const head = `[Script Info]\nScriptType: v4.00+\nPlayResX: 1920\nPlayResY: 1080\nWrapStyle: 0\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Cap,Segoe UI,42,&H00FFFFFF,&H00000000,&H80513C1F,-1,0,0,0,100,100,0,0,3,14,0,2,160,160,80,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, Effect, Text\n`;
  let t = 0, lines = '';
  SCENES.forEach((s, i) => { const dur = durs[i].dur, d = clipLen(dur); const text = (CAPTION_OVERRIDE[s.id] || s.narration).replace(/\s+/g, ' ').trim(); lines += `Dialogue: 0,${tsAss(t)},${tsAss(t + dur)},Cap,,0,0,,${text}\n`; t += d; });
  fs.writeFileSync(path.join(WORK, 'tour.ass'), head + lines);
}

function ff(cmd) { execSync(`ffmpeg -y -hide_banner -loglevel error ${cmd}`, { cwd: WORK, stdio: 'inherit' }); }
function buildVideo(durs) {
  const fps = 30;
  SCENES.forEach((s, i) => {
    const d = clipLen(durs[i].dur); const frames = Math.round(d * fps);
    const zMax = s.kind === 'shot' ? 1.05 : 1.10, zStep = s.kind === 'shot' ? 0.00018 : 0.00035;
    const vf = ['scale=3840:2160', `zoompan=z='min(zoom+${zStep},${zMax})':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':fps=${fps}:s=1920x1080`, `fade=t=in:st=0:d=0.4`, `fade=t=out:st=${(d - 0.4).toFixed(2)}:d=0.4`, 'format=yuv420p'].join(',');
    ff(`-loop 1 -framerate ${fps} -t ${d.toFixed(2)} -i scene-${s.id}.png -i scene-${s.id}.wav -filter_complex "[0:v]${vf}[v]" -map "[v]" -map 1:a -c:v libx264 -preset medium -pix_fmt yuv420p -r ${fps} -c:a aac -b:a 192k -ac 1 -ar 48000 -shortest scene-${s.id}.mp4`);
    log(`  · clip ${s.id} (${d.toFixed(1)}s)`);
  });
  fs.writeFileSync(path.join(WORK, 'list.txt'), SCENES.map(s => `file 'scene-${s.id}.mp4'`).join('\n'));
  ff(`-f concat -safe 0 -i list.txt -c copy tour-nosub.mp4`);
  try { ff(`-i tour-nosub.mp4 -vf "ass=tour.ass" -c:v libx264 -preset medium -pix_fmt yuv420p -c:a copy tour.mp4`); }
  catch (e) { log('  ! subs fallaron:', e.message); fs.copyFileSync(path.join(WORK, 'tour-nosub.mp4'), path.join(WORK, 'tour.mp4')); }
  fs.copyFileSync(path.join(WORK, 'tour.mp4'), FINAL);
  ff(`-i scene-intro.png -vf scale=1280:720 -q:v 4 poster.jpg`);
  fs.copyFileSync(path.join(WORK, 'poster.jpg'), POSTER);
}

(async () => {
  loadEnv();
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) { console.error('ERROR: falta GEMINI_API_KEY (.env).'); process.exit(1); }
  ensureFfmpeg(); fs.mkdirSync(WORK, { recursive: true });
  log(`1/4  Captura (hub ${HUB} + slides)…`);
  await launchChrome();
  try { const page = await getPage(); await captureShots(page); await renderSlides(page); page.close(); } finally { killChrome(); }
  log(`2/4  Voz IA (Gemini TTS "${VOICE}")…`);
  const durs = [];
  for (const s of SCENES) { const d = await ttsScene(s, apiKey); durs.push(d); log(`  · tts ${s.id} (${d.dur.toFixed(1)}s)`); await sleep(7000); }
  log('3/4  Subtítulos…'); writeAss(durs);
  log('4/4  Ensamblado ffmpeg…'); buildVideo(durs);
  const total = durs.reduce((a, d) => a + clipLen(d.dur), 0);
  log(`\nLISTO → ${path.relative(ROOT, FINAL)}  (~${Math.round(total)}s) + poster`);
  if (CLEAN) fs.rmSync(WORK, { recursive: true, force: true });
})().catch(e => { killChrome(); console.error('\nERROR:', e.message); process.exit(1); });
