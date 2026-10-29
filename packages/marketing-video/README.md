# Marketing mode — BPC module & service videos

The kit behind `bpc-assessments-v2.mp4` ("está increíble", Bruno, 27-oct-2026), the Workforce video and the
Managed Services video. One Remotion project, one motion system, one voice pipeline. Every new module video
(PCM, FCCS, NSAR, …) is a new composition in `src/` that reuses the same pieces.

| Composition | File | What it is |
|---|---|---|
| `AssessmentsV2` | `src/V2.tsx` | NetSuite + NSPB assessments — sell first, then explain (1:51) |
| `Workforce` | `src/WF.tsx` | Workforce Planning — why, then how: assumptions → roster → new hire → math → P&L (1:50) |
| `Revenue` | `src/RV.tsx` | Revenue forecasting — 30 s of marketing, then how: POV → input sheet → new stream → monthly spread → units × price → by project / department / category → vs budget (2:13) |
| `Cash` | `src/CF.tsx` | Liquidity & cash forecasting — 30 s of marketing, then how: DSO/DPO/DIO → AR/AP/inventory → cash accounts → cash flow → liquidity vs minimum → what-if → vs plan (1:42) |
| `ManagedServices` | `src/MS.tsx` | Managed Services, calmer cut with a synthesized ambient bed |
| `Assessments` | `src/Video.tsx` | v1 (camera over PDF pages) — kept as the "not WOW" reference |

## Setup (once per machine)

```powershell
powershell -ExecutionPolicy Bypass -File packages\marketing-video\scripts\setup.ps1 -NsPdf <acme-netsuite-abr-full.pdf> -PbPdf <acme-nspb-current-state.pdf>
```

It installs npm + Python deps, pulls the SFX and music from video-shotcraft, downloads the Kokoro voice models
and regenerates all voiceovers. The PDFs are the public ACME / Northwind examples from the Customer Hub
downloads; they are only needed for the Assessments compositions.

## Make a video

1. **Script** `vo/<name>.json` — scenes with `key`, `lead`, `tail`, `captions`, `lines`. English, CFO audience,
   no prices. Sell in the first ~45 s (hook → pain → promise → value), then explain (how it works → result → CTA).
2. **Voice** `python -X utf8 vo/tts.py <name>.json <subdir> timing-<name>.json` → `public/vo/<subdir>/*.wav` +
   `src/timing-<name>.json` (per-line start/end). Respellings live in `SAY` (BPC, NetSuite, 401k…).
3. **Scenes** one component per scene in `src/<Name>.tsx`; key frames come from `at(lines, i, offset)` so each
   animation lands on the word. Register it in `src/Root.tsx`.
4. **QA** `npx remotion still src/index.ts <Comp> out/qa/x.png --frame=N --scale=0.5` on every scene, contact sheet, fix.
5. **Final** `npx remotion render src/index.ts <Comp> out/<name>.mp4 --concurrency=2 --crf=18`.

## Why it works (the rules)

1. **One hero animation per shot** (shotcraft P4): slam, needle gauge, dot wave, text-as-mask, graze-face tour,
   orbit drop, card flock, row embed. Never the same trick as the hero twice.
2. **Numbers are the show.** Each figure gets a physical visual — it drops, fills, lights up, dims — not text on screen.
3. **Screens rebuilt in HTML inside 3D**, not screenshots: crisp at any zoom (Q2: render large, scale down), and no
   client data. Workforce copies the real NSPB form layout (Company Roster, New Hires, Annual Assumptions,
   Update Workforce / Update Financials) with invented people and numbers.
4. **Believable physics**: contact shadows, squash on landing, decaying shake, speed blur, grain, vignette.
5. **At most 3 full-frame impacts** (R4). The rest breathes.
6. **BPC 2026 brand**: Navy #1D445A, Gold #FCCA47, Green #376858, Google Sans Flex; eyebrow tracked caps, Medium
   headlines, white cards with an 8 px left bar (from Juan Krevisky's bpc-demo-video kit); logo never faded —
   full-colour on light, white wordmark on navy.
7. **Voice Kokoro `af_heart` 0.97** + music at ~0.075 + an SFX on every hit. Animation timing comes from the voice timing.

## Pieces

- `src/fx.tsx` — Stage / LightStage, Slam (kanada snap), Drop (score slam), Marker, Float + liftOf (contact-shadow
  lift), Plane (3D camera), cruise, DoF, Flash.
- `src/polish.tsx` — EASE curves, ramp, mix, Grain, Vignette, SpeedBlur (from video-shotcraft, Apache-2.0).
- `src/lib.tsx` — brand colours `C`, `FONT`, `FontFaces`, Eyebrow, Words, Count, Captions, `at()`.
- `src/V2.tsx` exports BlurWords, Roll, Gauge, DotWave, StatCol, Big, Eyebrow2, Relay, Sfx, Source2.
- Shot recipes to borrow from: `.cache/video-shotcraft/references/shots/*`.

## Hard rules

- **No client identity**: no client logo, names, salaries or real figures from a live tenant. Look at the client's
  screens only to copy the layout; rebuild with invented data and label it "Demo data" / "Illustrative example".
  Real numbers only from the anonymized example assessments, labelled "client identity removed".
- **No prices**, and nothing about whether a service is free — Bruno decides that per email.
- No NSAR / NSAW claims until those offers exist.
- English only. CTA pattern: "Write to BPC to … · Get the most out of your implementation."

## Traps we already hit

- `delayRender("fonts")` hung at 28 s: load fonts with `<FontFaces/>`; if you must measure text, race
  `document.fonts.load` against a 4 s timeout.
- A missing SFX file breaks the render: check `public/sfx/` before referencing one.
- Text-as-mask zoom-through: shift the origin onto the letter stem (+3% of width) and take over earlier.
- Windows Python: `PYTHONIOENCODING=utf-8 -X utf8`.
- The browser pane scales an emulated viewport oddly — for layout reference, screenshot at the pane's own size.
