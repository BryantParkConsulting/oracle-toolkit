'use strict';
// make-welcome-video.js — genera un mini-video welcome BPC 100% automático.
//   node tools/make-welcome-video.js [--clean] [--voice Kore]
//
// Pipeline (todo offline, 1 comando):
//   1. Render de escenas branded BPC → PNG (Chrome headless por CDP, sin instalar nada)
//   2. Voz IA inglés por escena → WAV (Gemini TTS, GEMINI_API_KEY del .env)
//   3. Subtítulos .srt desde el guion + duraciones reales del audio
//   4. ffmpeg: imagen+audio por escena (Ken-Burns + fades) → concat → subs → .mp4
//
// Salida: media/welcome-bpc.mp4   ·   intermedios en media/.work/
// Patrones reusados: CDP (tools/cdp.js), branding (tools/report-to-pdf.js),
//                    Gemini REST (tools/enrich-kb.js).

const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');
const { SCENES } = require('./welcome-script');

// ── paths ────────────────────────────────────────────────────────────
const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'media');
const WORK = path.join(OUT_DIR, '.work');
const FINAL = path.join(OUT_DIR, 'welcome-bpc.mp4');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const CDP_PORT = 9223; // puerto propio (no choca con el 9222 logueado)

// ── flags ────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const CLEAN = args.includes('--clean');
const VOICE = (args[args.indexOf('--voice') + 1] && !args[args.indexOf('--voice') + 1].startsWith('--'))
  ? args[args.indexOf('--voice') + 1] : 'Kore';

// ── BPC design tokens (de tools/report-to-pdf.js) ────────────────────
const NAVY = '#1F3C51', SAGE = '#619C8A', GOLD = '#F2CC5F', ORANGE = '#EC8842', DANGER = '#C9512E';
const LOGO_B64 = fs.readFileSync(path.join(ROOT, 'desgincode', 'assets', 'logo', 'bpc-logo.png')).toString('base64');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log(...a);

// ── 0. cargar .env (KEY=VALUE simple, como esperan los otros tools) ──
function loadEnv() {
  const p = path.join(ROOT, '.env');
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

function checkFfmpeg() {
  try { execSync('ffmpeg -version', { stdio: 'ignore' }); }
  catch {
    console.error('\nERROR: ffmpeg no está en el PATH.');
    console.error('Instalalo (1 vez):  winget install --id=Gyan.FFmpeg -e');
    console.error('Después abrí una shell nueva y reintentá.\n');
    process.exit(1);
  }
}

// ── escena → HTML branded full-screen 1920×1080 ──────────────────────
function sceneHtml(s) {
  const titleHtml = (s.title || '').replace(/\n/g, '<br/>');
  const bullets = (s.bullets || []).map(b =>
    `<li><span class="dot"></span><span>${b}</span></li>`).join('');
  const centered = s.kind === 'title' || s.kind === 'outro';
  const body = centered
    ? `<div class="wrap center">
         <div class="eyebrow">${s.eyebrow || ''}</div>
         <div class="rule"></div>
         <h1>${titleHtml}</h1>
         <p class="sub">${s.subtitle || ''}</p>
       </div>`
    : `<div class="wrap">
         <div class="accent"></div>
         <div class="col">
           <div class="eyebrow">${s.eyebrow || ''}</div>
           <h1>${titleHtml}</h1>
           <p class="sub">${s.subtitle || ''}</p>
           <ul>${bullets}</ul>
         </div>
       </div>`;
  return `<!doctype html><html><head><meta charset="utf-8">
  <style>
    /* sin @import de red: evita stalls en headless. Stack sans limpio. */
    * { margin:0; padding:0; box-sizing:border-box; }
    html,body { width:1920px; height:1080px; overflow:hidden; }
    body {
      font-family:'Segoe UI','Helvetica Neue',Arial,sans-serif; color:#fff; position:relative;
      background:
        radial-gradient(1200px 700px at 78% 18%, rgba(242,204,95,.16), transparent 60%),
        radial-gradient(900px 700px at 12% 90%, rgba(97,156,138,.18), transparent 60%),
        linear-gradient(135deg, #18313f 0%, ${NAVY} 55%, #142a37 100%);
    }
    /* faint concentric circles, esquina sup-der (sello BPC) */
    body::after {
      content:''; position:absolute; top:-260px; right:-260px; width:760px; height:760px;
      border-radius:50%; border:1px solid rgba(255,255,255,.05);
      box-shadow:0 0 0 70px rgba(255,255,255,.035), 0 0 0 150px rgba(255,255,255,.025),
                 0 0 0 240px rgba(255,255,255,.018);
    }
    .logo { position:absolute; top:64px; left:96px; background:#fff; border-radius:12px;
      padding:14px 20px; display:flex; align-items:center; box-shadow:0 8px 30px rgba(0,0,0,.25); }
    .logo img { height:40px; display:block; }
    .brand { position:absolute; top:80px; right:96px; font-size:20px; letter-spacing:.04em; color:rgba(255,255,255,.5); }
    .wrap { position:absolute; inset:0; padding:190px 120px 230px; display:flex; }
    .wrap.center { flex-direction:column; align-items:center; justify-content:center; text-align:center; padding:120px 120px 230px; }
    .col { max-width:1150px; align-self:center; }
    .accent { width:6px; border-radius:6px; background:linear-gradient(${GOLD},${SAGE}); margin-right:54px; }
    .eyebrow { color:${GOLD}; font-weight:600; font-size:26px; letter-spacing:.22em; text-transform:uppercase; }
    .center .rule { width:90px; height:4px; background:${GOLD}; border-radius:3px; margin:26px 0; }
    h1 { font-weight:300; letter-spacing:-.02em; line-height:1.04; margin:22px 0 0;
      font-size:${centered ? 132 : 104}px; }
    .center h1 { margin-top:0; }
    .sub { color:rgba(255,255,255,.82); font-weight:300; font-size:38px; margin-top:30px; line-height:1.3; }
    .center .sub { max-width:1250px; }
    ul { list-style:none; margin-top:44px; }
    li { display:flex; align-items:flex-start; gap:22px; font-size:40px; font-weight:300;
      color:rgba(255,255,255,.92); margin:24px 0; line-height:1.25; }
    .dot { flex:0 0 auto; width:18px; height:18px; border-radius:50%; margin-top:16px;
      background:${GOLD}; box-shadow:0 0 0 6px rgba(242,204,95,.18); }
  </style></head>
  <body>
    <div class="logo"><img src="data:image/png;base64,${LOGO_B64}"/></div>
    ${body}
    <div class="brand">bryantparkconsulting.com</div>
  </body></html>`;
}

// ── CDP mini-cliente (patrón de tools/cdp.js, + espera de eventos) ───
async function httpJson(p) { return (await fetch(`http://127.0.0.1:${CDP_PORT}${p}`)).json(); }
function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0; const pending = new Map(); const waiters = [];
    const send = (method, params) => new Promise((res, rej) => {
      const i = ++id;
      const to = setTimeout(() => { if (pending.has(i)) { pending.delete(i); rej(new Error('CDP timeout: ' + method)); } }, 20000);
      pending.set(i, { res: v => { clearTimeout(to); res(v); }, rej: e => { clearTimeout(to); rej(e); } });
      ws.send(JSON.stringify({ id: i, method, params: params || {} }));
    });
    const wait = (method, timeout = 12000) => new Promise((res, rej) => {
      const w = { method, res }; waiters.push(w);
      setTimeout(() => { const k = waiters.indexOf(w); if (k >= 0) { waiters.splice(k, 1); rej(new Error('timeout ' + method)); } }, timeout);
    });
    ws.onmessage = m => {
      const d = JSON.parse(m.data);
      if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.rej(new Error(d.error.message)) : p.res(d.result); }
      else if (d.method) { const k = waiters.findIndex(w => w.method === d.method); if (k >= 0) { const w = waiters[k]; waiters.splice(k, 1); w.res(d.params); } }
    };
    ws.onopen = () => resolve({ send, wait, close: () => ws.close() });
    ws.onerror = () => reject(new Error('WS error CDP:' + CDP_PORT));
  });
}

let chromeProc = null;
async function launchChrome() {
  const profile = path.join(WORK, '.chrome');
  fs.mkdirSync(profile, { recursive: true });
  chromeProc = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${profile}`,
    '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
    '--disable-gpu', '--force-color-profile=srgb', '--window-size=1920,1080',
  ], { stdio: 'ignore' });
  for (let i = 0; i < 50; i++) {
    try { await httpJson('/json/version'); return; } catch { await sleep(300); }
  }
  throw new Error('Chrome no levantó el puerto de debug ' + CDP_PORT);
}
function killChrome() {
  if (chromeProc && chromeProc.pid) {
    try { execSync(`taskkill /PID ${chromeProc.pid} /T /F`, { stdio: 'ignore' }); } catch {}
  }
}

async function renderScenes() {
  // Reusar el target INICIAL (el activo → compone frames, así captureScreenshot
  // no cuelga). Navegar en cada escena, espera FIJA acotada (sin awaitPromise).
  const list = await httpJson('/json/list');
  const tgt = list.find(x => x.type === 'page') || list[0];
  const page = await connect(tgt.webSocketDebuggerUrl);
  await page.send('Page.enable').catch(() => {});
  for (const s of SCENES) {
    const htmlPath = path.join(WORK, `scene-${s.id}.html`);
    fs.writeFileSync(htmlPath, sceneHtml(s));
    const url = 'file:///' + htmlPath.replace(/\\/g, '/');
    await page.send('Page.navigate', { url }).catch(() => {});
    await sleep(1500); // layout (estático, local → rápido)
    // Un frame de screencast: se empuja apenas el compositor pinta, no espera
    // un frame "limpio" como captureScreenshot (que cuelga tras navegar).
    await page.send('Page.startScreencast', { format: 'png', maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
    const fr = await page.wait('Page.screencastFrame', 10000);
    await page.send('Page.screencastFrameAck', { sessionId: fr.sessionId }).catch(() => {});
    await page.send('Page.stopScreencast').catch(() => {});
    fs.writeFileSync(path.join(WORK, `scene-${s.id}.png`), Buffer.from(fr.data, 'base64'));
    log(`  · render ${s.id}`);
  }
  page.close();
}

// ── Gemini TTS → WAV ─────────────────────────────────────────────────
function wavHeader(dataLen, rate) {
  const ch = 1, bits = 16, blockAlign = ch * bits / 8, byteRate = rate * blockAlign;
  const b = Buffer.alloc(44);
  b.write('RIFF', 0); b.writeUInt32LE(36 + dataLen, 4); b.write('WAVE', 8);
  b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(ch, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(byteRate, 28); b.writeUInt16LE(blockAlign, 32); b.writeUInt16LE(bits, 34);
  b.write('data', 36); b.writeUInt32LE(dataLen, 40);
  return b;
}
async function ttsScene(s, apiKey) {
  const model = 'gemini-2.5-flash-preview-tts';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const body = {
    contents: [{ parts: [{ text: s.narration }] }],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } },
    },
  };
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      if (!r.ok) { lastErr = new Error(`TTS HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`); await sleep(1500); continue; }
      const j = await r.json();
      const part = j.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
      if (!part) { lastErr = new Error('TTS sin audio en la respuesta'); await sleep(1500); continue; }
      const pcm = Buffer.from(part.inlineData.data, 'base64');
      const rate = parseInt((part.inlineData.mimeType.match(/rate=(\d+)/) || [])[1] || '24000', 10);
      const wav = Buffer.concat([wavHeader(pcm.length, rate), pcm]);
      const out = path.join(WORK, `scene-${s.id}.wav`);
      fs.writeFileSync(out, wav);
      const dur = pcm.length / (rate * 2);
      return { dur, rate };
    } catch (e) { lastErr = e; await sleep(1500); }
  }
  throw lastErr;
}

// ── subtítulos .ass (resolución fija → posición exacta al pie) ───────
function tsAss(sec) {
  const cs = Math.round(sec * 100); // centésimas
  const h = Math.floor(cs / 360000), m = Math.floor(cs % 360000 / 6000),
    sxx = Math.floor(cs % 6000 / 100), c = cs % 100;
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${h}:${p(m)}:${p(sxx)}.${p(c)}`;
}
function writeAss(durs) {
  // caja navy translúcida (BorderStyle=3), centrada abajo, fuente blanca.
  // BackColour ASS = &HAABBGGRR → navy #1F3C51 con alpha 0x80 = &H80513C1F.
  const head =
`[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cap,Segoe UI,42,&H00FFFFFF,&H00000000,&H80513C1F,-1,0,0,0,100,100,0,0,3,14,0,2,160,160,80,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, Effect, Text
`;
  let t = 0, lines = '';
  SCENES.forEach((s, i) => {
    const dur = durs[i].dur, d = clipLen(dur);     // clip dura d; la caption dura el habla
    const text = s.narration.replace(/\s+/g, ' ').trim();
    lines += `Dialogue: 0,${tsAss(t)},${tsAss(t + dur)},Cap,,0,0,,${text}\n`;
    t += d;
  });
  fs.writeFileSync(path.join(WORK, 'welcome.ass'), head + lines);
}

// ── ensamblado ffmpeg ────────────────────────────────────────────────
function ff(cmd, cwd) { execSync(`ffmpeg -y -hide_banner -loglevel error ${cmd}`, { cwd: cwd || WORK, stdio: 'inherit' }); }
const clipLen = dur => Math.max(1.2, dur + 0.5); // clip = habla + colita de aire
function buildVideo(durs) {
  const fps = 30;
  SCENES.forEach((s, i) => {
    const d = clipLen(durs[i].dur);
    const frames = Math.round(d * fps);
    const vf = [
      'scale=3840:2160',
      `zoompan=z='min(zoom+0.00035,1.10)':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':fps=${fps}:s=1920x1080`,
      `fade=t=in:st=0:d=0.4`,
      `fade=t=out:st=${(d - 0.4).toFixed(2)}:d=0.4`,
      'format=yuv420p',
    ].join(',');
    ff(`-loop 1 -framerate ${fps} -t ${d.toFixed(2)} -i scene-${s.id}.png -i scene-${s.id}.wav ` +
      `-filter_complex "[0:v]${vf}[v]" -map "[v]" -map 1:a ` +
      `-c:v libx264 -preset medium -pix_fmt yuv420p -r ${fps} -c:a aac -b:a 192k -ac 1 -ar 48000 -shortest scene-${s.id}.mp4`);
    log(`  · clip ${s.id} (${d.toFixed(1)}s)`);
  });
  // concat
  fs.writeFileSync(path.join(WORK, 'list.txt'), SCENES.map(s => `file 'scene-${s.id}.mp4'`).join('\n'));
  ff(`-f concat -safe 0 -i list.txt -c copy welcome-nosub.mp4`);
  // subtítulos quemados (si falla el filtro, caemos al sin-subs)
  try {
    ff(`-i welcome-nosub.mp4 -vf "ass=welcome.ass" -c:v libx264 -preset medium -pix_fmt yuv420p -c:a copy welcome-bpc.mp4`);
  } catch (e) {
    log('  ! subtítulos fallaron, uso versión sin subs:', e.message);
    fs.copyFileSync(path.join(WORK, 'welcome-nosub.mp4'), path.join(WORK, 'welcome-bpc.mp4'));
  }
  fs.copyFileSync(path.join(WORK, 'welcome-bpc.mp4'), FINAL);
}

// ── main ─────────────────────────────────────────────────────────────
(async () => {
  loadEnv();
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) { console.error('ERROR: falta GEMINI_API_KEY (en .env o env).'); process.exit(1); }
  checkFfmpeg();
  fs.mkdirSync(WORK, { recursive: true });

  log('1/4  Render de escenas (Chrome headless)…');
  await launchChrome();
  try { await renderScenes(); } finally { killChrome(); }

  log('2/4  Voz IA en inglés (Gemini TTS, voz "' + VOICE + '")…');
  const durs = [];
  for (const s of SCENES) { const d = await ttsScene(s, apiKey); durs.push(d); log(`  · tts ${s.id} (${d.dur.toFixed(1)}s)`); }

  log('3/4  Subtítulos…');
  writeAss(durs);

  log('4/4  Ensamblado ffmpeg…');
  buildVideo(durs);

  const total = durs.reduce((a, d) => a + d.dur + 0.5, 0);
  log(`\nLISTO → ${path.relative(ROOT, FINAL)}  (~${Math.round(total)}s)`);
  if (CLEAN) { fs.rmSync(WORK, { recursive: true, force: true }); log('intermedios borrados (--clean)'); }
  else log(`intermedios en ${path.relative(ROOT, WORK)}/ (PNG, WAV, SRT, clips)`);
})().catch(e => { killChrome(); console.error('\nERROR:', e.message); process.exit(1); });
