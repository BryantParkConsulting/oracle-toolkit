---
name: marketing-video
description: Marketing mode — make BPC marketing videos (a module like Workforce, PCM or FCCS, a service like Assessments or Managed Services) in the style of bpc-assessments-v2, the BPC reference video. Use when the user asks for a sales/marketing video, "un video de <módulo>", "modo marketing", a teaser or GIF of an existing one, or wants to change one of the BPC videos.
---

# Marketing mode — BPC videos

Everything lives in `packages/marketing-video/` — read its `README.md` first (rules, pieces, traps).
If `node_modules/`, `models/` or `public/sfx/` are missing, run `scripts/setup.ps1` once.

## Flow

1. **Understand the product.** For a module, open it in the client's tenant only to map the screens and the
   order a user goes through them (e.g. Workforce: Annual Assumptions → Company Roster → New Hires →
   Update Workforce → Update Financials → Total Compensation). Write down the layout, never the data.
2. **Script** `vo/<name>.json`: ~110 s, 10–11 scenes. First ~45 s sell (hook, pain, promise, value), then
   "Here is how it works." and the real flow, then the CTA. Audience: CFOs. No prices.
3. **Voice** with `vo/tts.py`, then build `src/<Name>.tsx` scene by scene from the pieces in `fx.tsx`,
   `polish.tsx`, `lib.tsx` and the exports of `V2.tsx`. One hero animation per scene, numbers as visuals,
   max 3 full-frame impacts.
4. **QA** stills of every scene into a contact sheet; fix overlaps (captions sit at the bottom ~130 px).
5. **Render** at `--crf=18`, open it for the user with `Invoke-Item`, and say what you did not check
   (e.g. you did not watch it end to end with sound).

## Never

- Client logos, names, salaries or live figures on screen — rebuild in HTML with invented data.
- Prices or "free".
- Publishing it anywhere (Customer Hub, Slack, email) without the user saying so.
