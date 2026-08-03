---
name: bpc-design
description: Use this skill to generate well-branded interfaces and assets for Bryant Park Consulting (BPC), either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping.
user-invocable: true
---

# Bryant Park Consulting — Design Skill

Read the `README.md` file within this skill, and explore the other available files. The most important entry points:

- `README.md` — full brand context: voice, palette, typography, visual foundations, content rules, iconography.
- `colors_and_type.css` — every token (hex, font, spacing, radius, shadow) as CSS variables. Import this into any HTML output.
- `assets/` — real BPC visual assets: `logo/`, `patterns/` (the signature circle pattern + corner ribbon), `backgrounds/` (duotone city photos), `illustrations/` (hand-drawn monoline figures), `partners/` (NetSuite alliance + award badges), `charts/`, `diagrams/`.
- `preview/` — one-off cards that visualize the system (palettes, type specimens, buttons, badges, form inputs, cards, etc). Copy from these when you need a component pattern.
- `slides/` — six reusable slide layouts matching the BPC deck system (title, agenda, stats, section divider, three-column content, thank-you).
- `ui_kits/marketing-site/` — a faithful recreation of bryantparkconsulting.com with modular React components (`Nav`, `Hero`, `StatsStrip`, `ServiceCards`, `PartnerLogos`, `AwardsRow`, `CtaBlock`, `Footer`, `ContactModal`).

## How to use

If creating visual artifacts (slides, mocks, throwaway prototypes, etc.), copy assets out of `assets/` and import `colors_and_type.css` into static HTML files for the user to view. The `slides/` and `ui_kits/` folders contain working examples you can lift directly.

If working on production code, copy assets and read the rules in `README.md` to become an expert in designing with this brand.

## If invoked without other guidance

Ask the user what they want to build or design. Some focused questions to consider:
- Is this a client deck, a marketing page, an internal tool UI, or something else?
- Dark hero (navy) or light (white/gray)?
- Are we including the circle pattern motif?
- Which assets or partner logos are relevant?

Then act as an expert designer who outputs HTML artifacts or production code, depending on the need.

## Non-negotiables

- Always use tokens from `colors_and_type.css`. Never invent new hexes.
- Never generate your own illustrations or icons — use what's in `assets/`, or Lucide from CDN for UI chrome.
- Never use emoji in formal deliverables.
- Slide titles are title-cased; body copy is sentence case.
- Headlines and body both use Sarabun — lean on the Light (300) weight. Code uses JetBrains Mono.
- Backgrounds are solid navy or white-on-gray — not gradients.
- The circle pattern is a hero motif, not a decorative filler. Use it deliberately.
