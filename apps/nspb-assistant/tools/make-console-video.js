'use strict';
// make-console-video.js — video "1-minute tour" del BPC Console (Customer Hub).
//   node tools/make-console-video.js [--clean] [--voice Puck] [--hub http://localhost:5180]
//
// Igual que make-welcome-video.js (slides branded + Gemini TTS + ffmpeg) pero
// las escenas del medio son CAPTURAS REALES del hub: headless Chrome entra a
// localhost con la sesión demoadmin inyectada por localStorage, navega el SPA
// clickeando botones, ANONIMIZA los nombres de clientes en el DOM (el mp4
// termina en hosting público) y saca un frame por screencast.
//
// Salida: media/console-tour.mp4 (+ poster jpg)   ·   intermedios en media/.work-console/

const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');
const { slideHtml } = require('./hub-video-slide');

// ── paths / flags ────────────────────────────────────────────────────
const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'media');
const WORK = path.join(OUT_DIR, '.work-console');
const FINAL = path.join(OUT_DIR, 'console-tour.mp4');
const POSTER = path.join(OUT_DIR, 'console-tour-poster.jpg');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const CDP_PORT = 9224;

const args = process.argv.slice(2);
const CLEAN = args.includes('--clean');
const flag = (name, dflt) => {
  const i = args.indexOf('--' + name);
  return (i >= 0 && args[i + 1] && !args[i + 1].startsWith('--')) ? args[i + 1] : dflt;
};
const VOICE = flag('voice', 'Puck');
const HUB = flag('hub', 'http://localhost:5180');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log(...a);

// ── guion: 6 escenas ≈ 57s (aprobado por Bruno 2026-07-10) ───────────
const SCENES = [
  {
    id: 'intro', kind: 'title',
    eyebrow: 'BPC Customer Hub', title: 'Clients that answer\ntheir own questions.',
    subtitle: 'The one-minute tour for the BPC team.',
    narration: 'This is the BPC Customer Hub — one portal where every client answers their own questions, instead of calling you.',
  },
  {
    id: 'clients', kind: 'shot',
    narration: 'From the console you run every client in one place: their knowledge base, their hours, shared notes, and settings.',
  },
  {
    id: 'kbflow', kind: 'shot',
    narration: "Drop a client's LCM export and the AI writes their Implementation KB — forms, rules, data flows — then answers questions grounded in their build.",
  },
  {
    id: 'notes', kind: 'shot',
    narration: 'Notes are a live checklist both sides edit, and every assessment we offer starts from artifacts the client already has.',
  },
  {
    id: 'videos', kind: 'shot',
    narration: 'And new — training videos: upload a session once, it transcribes itself, and clients rewatch it, search the transcript, and ask the AI, which cites the exact moment.',
  },
  {
    id: 'outro', kind: 'outro',
    eyebrow: 'Get started', title: 'Add a client. Publish.\nSend the link.',
    subtitle: 'bpccustomerhub.web.app',
    narration: 'Add a client, publish their hub, send the link. Bryant Park Consulting — Customer Hub.',
  },
];
const CAPTION_OVERRIDE = {};

// ── anonimización: el mp4 va a hosting público, nada de nombres reales ──
// (DOM-level: React repinta los nombres reales al re-render, así que se
// corre INMEDIATAMENTE antes de cada captura.)
const SANITIZE_JS = `(() => {
  const map = [
    ['Hub Console Tour (test)','NSPB Admin Training — Session 1'],
    ['Hub Console Tour','NSPB Admin Training'],
    ['Video Test','Meridian Health'], ['videotest.example','meridianhealth.example'],
    ['Enfinity Global','Acme Corp'], ['Overture Promotions','Globex Media'],
    ['enfinity.global','acme.example'], ['overturepromo.com','globex.example'],
    ['radiopharmacy.com','initech.example'], ['squarespace.com','umbrella.example'],
    ['coursera.org','contoso.example'],
    ['chime.com','northwind.example'], ['swoop.com','hooli.example'],
    ['symetri.com','vertex.example'], ['talogy.com','zenith.example'],
    ['Pharmalogic','Initech'], ['Squarespace','Umbrella'], ['Coursera','Contoso'],
    ['Enfinity','Acme'], ['Overture','Globex'], ['Chime','Northwind'],
    ['Swoop','Hooli'], ['Symetri','Vertex'], ['Talogy','Zenith'],
    ['Bruno Gallo','the BPC team'], ['bruno.gallo','team'], ['gallobruno','team'],
    // consultores BPC en el time log — genéricos para el asset público
    ['Saqib Yasin','J. Smith'], ['Melissa Metzger','A. Taylor'],
  ];
  const walk = n => {
    if (n.nodeType === 3) { let t = n.nodeValue; for (const [k,v] of map) t = t.split(k).join(v); n.nodeValue = t; }
    else n.childNodes.forEach(walk);
  };
  walk(document.body);
  // logos de clientes (hosteados fuera del app shell) → ocultar
  document.querySelectorAll('img').forEach(i => {
    const s = i.getAttribute('src') || '';
    if (s.startsWith('http') && !s.startsWith(location.origin)) i.style.visibility = 'hidden';
  });
  // chat "Ask the Hub" (panel flotante) + su launcher: fuera del frame
  document.querySelectorAll('div').forEach(d => {
    const cs = getComputedStyle(d);
    if ((cs.position === 'fixed' || cs.position === 'absolute') && d.textContent.includes('Ask the Hub')) d.style.display = 'none';
  });
  document.querySelectorAll('button').forEach(b => {
    if (getComputedStyle(b).position !== 'fixed') return;
    const r = b.getBoundingClientRect();
    if (r.top > innerHeight * 0.7 && r.left > innerWidth * 0.7) b.style.display = 'none';
  });
  return 'sanitized';
})()`;

// ── .env / ffmpeg ────────────────────────────────────────────────────
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
  // winget no lo pone en PATH de esta shell — buscarlo e inyectarlo al proceso
  const base = path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Packages');
  if (fs.existsSync(base)) {
    for (const d of fs.readdirSync(base)) {
      if (!d.startsWith('Gyan.FFmpeg')) continue;
      const pkg = path.join(base, d);
      const stack = [pkg];
      while (stack.length) {
        const cur = stack.pop();
        for (const e of fs.readdirSync(cur, { withFileTypes: true })) {
          if (e.isDirectory()) stack.push(path.join(cur, e.name));
          else if (e.name === 'ffmpeg.exe') { process.env.PATH = path.dirname(path.join(cur, e.name)) + ';' + process.env.PATH; return; }
        }
      }
    }
  }
  console.error('\nERROR: ffmpeg no encontrado. winget install --id=Gyan.FFmpeg -e\n');
  process.exit(1);
}

// ── CDP mini-cliente ─────────────────────────────────────────────────
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

async function getPage() {
  const list = await httpJson('/json/list');
  const tgt = list.find(x => x.type === 'page') || list[0];
  const page = await connect(tgt.webSocketDebuggerUrl);
  await page.send('Page.enable').catch(() => {});
  return page;
}

// Un frame por screencast (captureScreenshot cuelga en headless tras navegar).
async function snap(page, file) {
  await page.send('Page.startScreencast', { format: 'png', maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
  const fr = await page.wait('Page.screencastFrame', 12000);
  await page.send('Page.screencastFrameAck', { sessionId: fr.sessionId }).catch(() => {});
  await page.send('Page.stopScreencast').catch(() => {});
  fs.writeFileSync(file, Buffer.from(fr.data, 'base64'));
}

// ── captura de las escenas reales del hub ────────────────────────────
async function captureShots(page) {
  const ev = async expr => {
    const r = await page.send('Runtime.evaluate', { expression: expr, returnByValue: true });
    if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception?.description || 'error').slice(0, 200));
    return r.result?.value;
  };
  const waitJs = async (expr, label, timeout = 20000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      if (await ev(expr).catch(() => false)) return;
      await sleep(500);
    }
    throw new Error('timeout esperando: ' + label);
  };
  const clickText = txt =>
    ev(`(() => { const b = [...document.querySelectorAll('button, a, [role="button"]')].find(x => x.textContent.trim().includes(${JSON.stringify(txt)})); if (!b) return 'NOT FOUND'; b.click(); return 'ok'; })()`);
  const shotPng = id => path.join(WORK, `scene-${id}.png`);
  // Cinturón y tiradores: si un nombre real sigue visible, ABORTAR (mp4 público).
  const assertClean = async label => {
    const leak = await ev(`['Chime','Coursera','Enfinity','Overture','Pharmalogic','Squarespace','Swoop','Symetri','Talogy','Saqib','Metzger','Video Test','videotest','Hub Console Tour'].filter(n => document.body.innerText.includes(n)).join(',')`);
    if (leak) throw new Error(`sanitize incompleto en ${label}: ${leak}`);
  };

  log('  · login (localStorage demoadmin) …');
  await page.send('Page.navigate', { url: HUB });
  await sleep(3000);
  await ev(`localStorage.setItem('nspbmcp_auth','1');localStorage.setItem('nspbmcp_role','super');localStorage.setItem('nspbmcp_email','demoadmin');'ok'`);
  await page.send('Page.navigate', { url: HUB });
  await sleep(2500);
  await waitJs(`document.body.innerText.includes('Start here')`, 'console shell');
  await sleep(2000);

  // ESCENA kbflow — Start here scrolleado a la animación del KB flow
  log('  · shot kbflow (Start here / animación)…');
  await ev(`(() => { const h = [...document.querySelectorAll('h2')].find(x => x.textContent.includes('grounded answers out')); if (h) h.scrollIntoView({ block: 'start' }); return 'ok'; })()`);
  await sleep(3000); // que la animación esté a mitad de loop
  await ev(SANITIZE_JS); // (acá solo importa esconder el chat flotante)
  await snap(page, shotPng('kbflow'));

  // ESCENA clients — dashboard con la tabla fleet de horas.
  // OJO: la tabla llega async y React repinta los nombres REALES si el
  // sanitize corre antes de que termine de cargar → esperar la última fila
  // (Talogy) y sanitizar DOS veces pegado al frame.
  log('  · shot clients (fleet dashboard)…');
  if (await clickText('Clients') !== 'ok') throw new Error('nav Clients no encontrada');
  await waitJs(`document.body.innerText.includes('All clients')`, 'client rail');
  await waitJs(`document.body.innerText.includes('Talogy')`, 'fleet data completa');
  await sleep(1500);
  await ev(SANITIZE_JS);
  await sleep(500);
  await ev(SANITIZE_JS);
  await sleep(300);
  await assertClean('clients');
  await snap(page, shotPng('clients'));

  // Abrir un cliente para la escena Notes (la vieja escena hours quedó afuera:
  // HOURS_HIDDEN oculta esas superficies; su lugar lo tomó Training Videos).
  // (post-sanitize Enfinity quedó renombrado "Acme" en el rail)
  log('  · abrir cliente Acme (para Notes)…');
  if (await clickText('Acme') !== 'ok') throw new Error('cliente Acme/Enfinity no encontrado en el rail');
  await waitJs(`document.body.innerText.includes('View as client')`, 'client detail');
  await sleep(1000);

  // ESCENA notes — tab Notes del mismo cliente (contenido = templates genéricos)
  log('  · shot notes…');
  if (await clickText('Notes') !== 'ok') throw new Error('tab Notes no encontrada');
  await waitJs(`document.body.innerText.includes('Kickoff')`, 'notes pages');
  await sleep(1500);
  await ev(SANITIZE_JS);
  await sleep(400);
  await ev(SANITIZE_JS);
  await assertClean('notes');
  await snap(page, shotPng('notes'));

  // ESCENA videos — el navegador Browse & ask de Training Videos (Video Test →
  // Meridian Health). El rail ya está sanitizado → probar ambos nombres.
  log('  · shot videos (Training Videos, Browse & ask)…');
  await waitJs(`document.body.innerText.includes('Video Test') || document.body.innerText.includes('Meridian Health')`, 'fila Video Test en el rail');
  if (await clickText('Video Test') !== 'ok' && await clickText('Meridian Health') !== 'ok')
    throw new Error('cliente Video Test/Meridian Health no encontrado en el rail');
  await waitJs(`document.body.innerText.includes('View as client')`, 'client detail (videos)');
  if (await clickText('Training Videos') !== 'ok') throw new Error('tab Training Videos no encontrada');
  await waitJs(`document.body.innerText.includes('Transcript ready')`, 'video row transcripto');
  if (await clickText('Browse & ask') !== 'ok') throw new Error('switcher Browse & ask no encontrado');
  await waitJs(`document.body.innerText.includes('click a line to jump')`, 'browse transcript');
  // pintar el frame del player: un seek en frío queda negro en headless —
  // reproducir muted y esperar a que el playhead AVANCE de verdad (frames
  // decodificados) antes de pausar.
  await ev(`(() => { const v = document.querySelector('video'); if (v) { v.muted = true; v.preload = 'auto'; v.currentTime = 7; v.play().catch(() => {}); } return 'ok'; })()`);
  await waitJs(`(() => { const v = document.querySelector('video'); return v && !v.paused && v.currentTime > 7.5; })()`, 'video reproduciendo', 25000);
  await ev(`(() => { const v = document.querySelector('video'); if (v) v.pause(); return 'ok'; })()`);
  await sleep(1000);
  await ev(SANITIZE_JS);
  await sleep(400);
  await ev(SANITIZE_JS);
  await assertClean('videos');
  await snap(page, shotPng('videos'));
}

// ── render slides intro/outro ────────────────────────────────────────
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
  const out = path.join(WORK, `scene-${s.id}.wav`);
  if (fs.existsSync(out)) { // cache: los WAV sobreviven re-runs (rate limits)
    const st = fs.statSync(out);
    if (st.size > 44) {
      const rate = fs.readFileSync(out).readUInt32LE(24);
      return { dur: (st.size - 44) / (rate * 2), rate };
    }
  }
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
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      if (!r.ok) { lastErr = new Error(`TTS HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`); await sleep(4000 * (attempt + 1)); continue; }
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

// ── subtítulos .ass ──────────────────────────────────────────────────
function tsAss(sec) {
  const cs = Math.round(sec * 100);
  const h = Math.floor(cs / 360000), m = Math.floor(cs % 360000 / 6000),
    sxx = Math.floor(cs % 6000 / 100), c = cs % 100;
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${h}:${p(m)}:${p(sxx)}.${p(c)}`;
}
const clipLen = dur => Math.max(1.2, dur + 0.5);
function writeAss(durs) {
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
    const dur = durs[i].dur, d = clipLen(dur);
    const text = (CAPTION_OVERRIDE[s.id] || s.narration).replace(/\s+/g, ' ').trim();
    lines += `Dialogue: 0,${tsAss(t)},${tsAss(t + dur)},Cap,,0,0,,${text}\n`;
    t += d;
  });
  fs.writeFileSync(path.join(WORK, 'tour.ass'), head + lines);
}

// ── ensamblado ffmpeg ────────────────────────────────────────────────
function ff(cmd) { execSync(`ffmpeg -y -hide_banner -loglevel error ${cmd}`, { cwd: WORK, stdio: 'inherit' }); }
function buildVideo(durs) {
  const fps = 30;
  SCENES.forEach((s, i) => {
    const d = clipLen(durs[i].dur);
    const frames = Math.round(d * fps);
    // shots de UI: zoom más suave que en slides (texto chico, no marear)
    const zMax = s.kind === 'shot' ? 1.05 : 1.10;
    const zStep = s.kind === 'shot' ? 0.00018 : 0.00035;
    const vf = [
      'scale=3840:2160',
      `zoompan=z='min(zoom+${zStep},${zMax})':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':fps=${fps}:s=1920x1080`,
      `fade=t=in:st=0:d=0.4`,
      `fade=t=out:st=${(d - 0.4).toFixed(2)}:d=0.4`,
      'format=yuv420p',
    ].join(',');
    ff(`-loop 1 -framerate ${fps} -t ${d.toFixed(2)} -i scene-${s.id}.png -i scene-${s.id}.wav ` +
      `-filter_complex "[0:v]${vf}[v]" -map "[v]" -map 1:a ` +
      `-c:v libx264 -preset medium -pix_fmt yuv420p -r ${fps} -c:a aac -b:a 192k -ac 1 -ar 48000 -shortest scene-${s.id}.mp4`);
    log(`  · clip ${s.id} (${d.toFixed(1)}s)`);
  });
  fs.writeFileSync(path.join(WORK, 'list.txt'), SCENES.map(s => `file 'scene-${s.id}.mp4'`).join('\n'));
  ff(`-f concat -safe 0 -i list.txt -c copy tour-nosub.mp4`);
  try {
    ff(`-i tour-nosub.mp4 -vf "ass=tour.ass" -c:v libx264 -preset medium -pix_fmt yuv420p -c:a copy tour.mp4`);
  } catch (e) {
    log('  ! subtítulos fallaron, uso versión sin subs:', e.message);
    fs.copyFileSync(path.join(WORK, 'tour-nosub.mp4'), path.join(WORK, 'tour.mp4'));
  }
  fs.copyFileSync(path.join(WORK, 'tour.mp4'), FINAL);
  ff(`-i scene-intro.png -vf scale=1280:720 -q:v 4 poster.jpg`);
  fs.copyFileSync(path.join(WORK, 'poster.jpg'), POSTER);
}

// ── main ─────────────────────────────────────────────────────────────
(async () => {
  loadEnv();
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) { console.error('ERROR: falta GEMINI_API_KEY (.env).'); process.exit(1); }
  ensureFfmpeg();
  fs.mkdirSync(WORK, { recursive: true });

  log(`1/4  Captura de escenas (hub en ${HUB} + slides)…`);
  await launchChrome();
  try {
    const page = await getPage();
    await captureShots(page);
    await renderSlides(page);
    page.close();
  } finally { killChrome(); }

  log(`2/4  Voz IA (Gemini TTS, voz "${VOICE}")…`);
  const durs = [];
  for (const s of SCENES) {
    const d = await ttsScene(s, apiKey);
    durs.push(d);
    log(`  · tts ${s.id} (${d.dur.toFixed(1)}s)`);
    await sleep(7000); // rate limit del TTS
  }

  log('3/4  Subtítulos…');
  writeAss(durs);

  log('4/4  Ensamblado ffmpeg…');
  buildVideo(durs);

  const total = durs.reduce((a, d) => a + clipLen(d.dur), 0);
  log(`\nLISTO → ${path.relative(ROOT, FINAL)}  (~${Math.round(total)}s)  + poster`);
  if (CLEAN) { fs.rmSync(WORK, { recursive: true, force: true }); }
})().catch(e => { killChrome(); console.error('\nERROR:', e.message); process.exit(1); });
