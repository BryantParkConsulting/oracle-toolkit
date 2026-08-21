'use strict';
/**
 * _cover.js — the BPC cover page, shared by every deliverable.
 *
 * It was written inline in state-report-pdf.js and copied nowhere, which is why the
 * NSPB reports have a photographic cover and the NetSuite ones had a plain gradient.
 * This is that same cover, extracted so any generator can call it.
 *
 *   const COVER = require('./_cover');
 *   COVER.css({ NAVY, GOLD })        → the <style> rules
 *   COVER.render({ title, sub, ... }) → the <section class="cover">
 *
 * Asset resolution matters: the design assets live under apps/nspb-excel-addin/desgincode,
 * not at the repo root. state-report-pdf.js looked for ROOT/desgincode and silently found
 * nothing — the cover still rendered, just without photo or circles. Every candidate path
 * is tried here so the cover degrades only when the asset genuinely is not in the repo.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');

// Ordered by preference; the first that exists wins.
const ASSET_DIRS = [
  path.join(ROOT, 'assets', 'brand'),          // the toolkit's own copy — always present
  path.join(ROOT, 'desgincode', 'assets'),
  path.join(ROOT, 'apps', 'nspb-excel-addin', 'desgincode', 'assets'),
  path.join(ROOT, 'apps', 'nspb-excel-addin', 'docs-site', 'public', 'pitch', 'assets'),
];

/** base64 of the first candidate that exists, '' when none do. */
function asset(...rel) {
  for (const dir of ASSET_DIRS) {
    const p = path.join(dir, ...rel);
    if (fs.existsSync(p)) return fs.readFileSync(p).toString('base64');
  }
  return '';
}

// The hero photo has been named differently over time; accept any of them.
const hero = () => asset('backgrounds', 'hero-office.png')
  || asset('backgrounds', 'hero-skyline-nyc.png');
const circles = () => asset('patterns', 'circles-pattern.png');

// hero-skyline-nyc.png already has the circle pattern composited into it. Overlaying
// .cover-circles on top of that blends two copies of the same motif and the result reads
// as noise, so the overlay is only for a plain photograph.
const heroHasCircles = () => !asset('backgrounds', 'hero-office.png')
  && !!asset('backgrounds', 'hero-skyline-nyc.png');

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * The cover stylesheet. Takes the brand tokens so a generator that already defines
 * its own palette does not end up with two sources of truth for navy.
 */
/**
 * The cover bleeds to the paper edge, which means cancelling the @page margin with a
 * negative one. That margin differs per generator (15mm/11mm here, 14mm/13mm in the
 * shell), so it is a parameter — hardcoding it leaves the photo visibly off-register.
 */
function css({ NAVY = '#1F3C51', GOLD = '#F2CC5F', marginV = '15mm', marginH = '11mm' } = {}) {
  return `
  /* The cover bleeds past the @page margin by pulling itself out with a negative one.
     Sized in vw/vh so it tracks the printed page box rather than a hardcoded mm figure,
     which broke whenever the host generator declared @page{size:A4}. */
  .cover { position:relative; width:calc(100% + ${marginH} + ${marginH}); height:255mm; background:${NAVY}; color:#fff; overflow:hidden; page-break-after:always; margin:-${marginV} -${marginH} 0; padding:0; }
  /* The photo is painted as a background rather than an <img>: background-size:cover
     resolves against the box itself, so it cannot overflow the way a replaced element
     does when its intrinsic ratio fights a percentage height. */
  /* Heights are 100vh, not a fixed mm value: with @page{size:A4} the print box is sized
     differently than without it, and a hardcoded 255mm left the photo a thin strip in any
     generator that declares a page size. vh tracks whatever box Chrome actually paints. */
  .cover-photo { position:absolute; top:0; right:0; left:50%; height:255mm; overflow:hidden;
                 background-position:70% center; background-size:cover; background-repeat:no-repeat;
                 filter:saturate(.65) contrast(1.05); }
  /* Sits over the photo half only, fading the navy into it so the text side stays solid. */
  .cover-grad { position:absolute; top:0; right:0; left:38%; height:255mm; background:linear-gradient(90deg, ${NAVY} 0%, rgba(31,60,81,.72) 38%, rgba(31,60,81,.20) 100%); }
  .cover-circles { position:absolute; top:0; right:0; left:0; height:255mm; background-position:center right; background-size:cover; background-repeat:no-repeat; mix-blend-mode:screen; opacity:.42; }
  .cover-top { position:absolute; top:20mm; left:18mm; font-size:12px; font-weight:500; letter-spacing:.02em; display:flex; align-items:center; gap:8px; z-index:3; }
  .cover-top .dot { width:9px; height:9px; border-radius:50%; background:${GOLD}; display:inline-block; }
  .cover-body { position:absolute; left:18mm; right:52%; top:78mm; z-index:3; }
  .cover-eyebrow { font-size:11px; font-weight:600; letter-spacing:.14em; text-transform:uppercase; color:${GOLD}; margin-bottom:14px; }
  .cover-title { font-family:'Sarabun'; font-weight:300; font-size:40px; line-height:1.08; letter-spacing:-.02em; color:#fff; margin:0; }
  .cover-rule { width:54px; height:3px; background:${GOLD}; margin:18px 0; }
  .cover-sub { font-size:12.5px; line-height:1.6; color:rgba(255,255,255,.8); max-width:330px; font-weight:300; }
  .cover-stats { display:flex; flex-wrap:wrap; gap:10px 26px; margin-top:30px; }
  .cstat { min-width:120px; }
  .cstat .cnum { font-family:'Sarabun'; font-weight:500; font-size:25px; color:${GOLD}; line-height:1; letter-spacing:-.01em; }
  .cstat .clab { font-size:9.5px; color:rgba(255,255,255,.72); margin-top:4px; letter-spacing:.02em; }
  .cover-foot { position:absolute; bottom:18mm; left:18mm; right:18mm; display:flex; justify-content:space-between; font-size:9.5px; color:rgba(255,255,255,.6); z-index:3; }`;
}

/**
 * @param title   headline, may contain <br/> to control the line break
 * @param sub     one sentence on what the document is built from
 * @param stats   [[value, label], ...] — the four figures in gold. Measured, never estimated.
 * @param eyebrow the CONFIDENTIAL · MONTH · VERSION line
 * @param footRight what sits opposite the domain in the footer
 */
function render({ title, sub, stats = [], eyebrow, footRight = '' } = {}) {
  const H = hero(), C = heroHasCircles() ? '' : circles();
  const cells = stats
    .map(([num, label]) => `<div class="cstat"><div class="cnum">${esc(num)}</div><div class="clab">${esc(label)}</div></div>`)
    .join('');
  return `<section class="cover">
    <div class="cover-photo"${H ? ` style="background-image:url('data:image/png;base64,${H}')"` : ''}></div>
    <div class="cover-grad"></div>
    ${C ? `<div class="cover-circles" style="background-image:url('data:image/png;base64,${C}')"></div>` : ''}
    <div class="cover-top"><span class="dot"></span>Bryant Park Consulting</div>
    <div class="cover-body">
      ${eyebrow ? `<div class="cover-eyebrow">${esc(eyebrow)}</div>` : ''}
      <h1 class="cover-title">${title}</h1>
      <div class="cover-rule"></div>
      ${sub ? `<p class="cover-sub">${sub}</p>` : ''}
      ${cells ? `<div class="cover-stats">${cells}</div>` : ''}
    </div>
    <div class="cover-foot"><span>bryantparkconsulting.com</span><span>${esc(footRight)}</span></div>
  </section>`;
}

/** CONFIDENTIAL · JUNE 2026 · V2026-06-16.1121 */
function eyebrow(version, date = new Date()) {
  const when = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  return `Confidential · ${when}${version ? ` · ${version}` : ''}`;
}

module.exports = { asset, css, render, eyebrow, hero, circles };
