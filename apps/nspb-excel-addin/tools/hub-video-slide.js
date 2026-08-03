'use strict';
// hub-video-slide.js — template de slides para los videos del Customer Hub,
// alineado al design system REAL del hub (Bruno marcó la divergencia 2026-07-10):
//   · Sarabun 300/600 embebida en base64 (Google Fonts no carga en headless)
//   · lockup "BryantPark CONSULTING · Customer Hub" como el header de la web
//     (texto sobre navy, "Hub" en gold — sin tarjeta blanca)
//   · el patrón de círculos del hero real (public/circles-pattern.png del hub,
//     mix-blend screen + scrim izquierda→derecha, como .bpc-hero-pattern/-scrim)
// Usado por make-console-video.js y make-client-video.js.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const NAVY = '#1F3C51', GOLD = '#F2CC5F';

const b64 = p => fs.readFileSync(p).toString('base64');
const FONT_300 = b64(path.join(ROOT, 'desgincode', 'assets', 'fonts', 'sarabun-300.ttf'));
const FONT_600 = b64(path.join(ROOT, 'desgincode', 'assets', 'fonts', 'sarabun-600.ttf'));
// El PNG del hero vive en el repo del hub — mismo asset que ve el usuario.
const CIRCLES = b64('C:/apps/nspbhub/public/circles-pattern.png');

function slideHtml(s) {
  const titleHtml = (s.title || '').replace(/\n/g, '<br/>');
  return `<!doctype html><html><head><meta charset="utf-8">
  <style>
    @font-face { font-family:'Sarabun'; font-weight:300; src:url(data:font/ttf;base64,${FONT_300}) format('truetype'); }
    @font-face { font-family:'Sarabun'; font-weight:600; src:url(data:font/ttf;base64,${FONT_600}) format('truetype'); }
    * { margin:0; padding:0; box-sizing:border-box; }
    html,body { width:1920px; height:1080px; overflow:hidden; }
    body { font-family:'Sarabun','Segoe UI',sans-serif; color:#fff; position:relative; background:${NAVY}; }
    /* hero pattern + scrim — mismos assets/valores que .bpc-hero-pattern/.bpc-hero-scrim */
    .pattern { position:absolute; top:0; right:-10%; bottom:0; width:80%;
      background:url(data:image/png;base64,${CIRCLES}) center right/cover no-repeat;
      opacity:.55; mix-blend-mode:screen; }
    .scrim { position:absolute; inset:0;
      background:linear-gradient(90deg, ${NAVY} 0%, rgba(31,60,81,.85) 42%, rgba(31,60,81,.15) 70%, transparent 100%); }
    /* lockup del header de la web: BryantPark CONSULTING · Customer Hub */
    .lockup { position:absolute; top:64px; left:96px; z-index:3; display:flex; align-items:center; gap:26px; }
    .lockup .bp { line-height:1; }
    .lockup .bp .name { font-weight:600; font-size:30px; letter-spacing:.01em; }
    .lockup .bp .name .park { font-weight:300; }
    .lockup .bp .sub { font-weight:300; font-size:13px; letter-spacing:.42em; color:rgba(255,255,255,.75); margin-top:5px; }
    .lockup .div { width:1px; height:44px; background:rgba(255,255,255,.25); }
    .lockup .hub { font-weight:600; font-size:28px; }
    .lockup .hub em { font-style:normal; color:${GOLD}; }
    .brand { position:absolute; top:80px; right:96px; z-index:3; font-weight:300; font-size:20px; letter-spacing:.04em; color:rgba(255,255,255,.55); }
    .wrap { position:absolute; inset:0; z-index:2; padding:120px 120px 230px; display:flex;
      flex-direction:column; align-items:center; justify-content:center; text-align:center; }
    .eyebrow { color:${GOLD}; font-weight:600; font-size:25px; letter-spacing:.24em; text-transform:uppercase; }
    .rule { width:90px; height:4px; background:${GOLD}; border-radius:3px; margin:28px 0; }
    h1 { font-weight:300; letter-spacing:-.022em; line-height:1.06; font-size:116px; }
    .sub { color:rgba(255,255,255,.85); font-weight:300; font-size:38px; margin-top:32px; line-height:1.3; max-width:1250px; }
  </style></head>
  <body>
    <div class="pattern"></div>
    <div class="scrim"></div>
    <div class="lockup">
      <div class="bp"><div class="name">Bryant<span class="park">Park</span></div><div class="sub">CONSULTING</div></div>
      <div class="div"></div>
      <div class="hub">Customer <em>Hub</em></div>
    </div>
    <div class="wrap">
      <div class="eyebrow">${s.eyebrow || ''}</div>
      <div class="rule"></div>
      <h1>${titleHtml}</h1>
      <p class="sub">${s.subtitle || ''}</p>
    </div>
    <div class="brand">bryantparkconsulting.com</div>
  </body></html>`;
}

module.exports = { slideHtml };
