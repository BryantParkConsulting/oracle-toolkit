# Bryant Park Consulting — Design System

A reference kit of tokens, components, and guidelines for designing anything
that carries the **Bryant Park Consulting (BPC)** brand: client decks, proposal
documents, internal tools, the public marketing site, or throwaway prototypes.

---

## 1. Company context

**Bryant Park Consulting (BPC)** is a top Oracle NetSuite Alliance Partner
headquartered in New York City, <cite index="8-2,8-3">founded in 2021 with a mission to help clients shape the future of business by partnering with them on technology transformations, and positioning itself as a people-first, excellence-driven NetSuite Alliance Partner</cite>. The firm offers
<cite index="1-2,1-3">NetSuite implementations, customization, integrations, and managed services — with key practice areas in NetSuite Planning & Budgeting, Analytics Warehouse, Configure Price Quote (CPQ), and NSAR</cite>.

- **Tagline / positioning:** *"We bring people together to build the future of business."*
- **HQ:** New York, NY. Additional hubs in Los Angeles, Denver, Chicago, Toronto, Montreal, with near/offshore teams in Chile, Colombia, and India.
- **Size:** ~120+ employees (and growing fast).
- **Core partnerships:** Oracle NetSuite (primary), Boomi, Celigo, Workato, Avalara, Zone & Co, RF-SMART, Netgain.
- **Recognition:** NetSuite Alliance Partner, multiple NetSuite Partner of the Year and Spotlight Awards (2022–2024) — awards imagery is a prominent brand trust signal.

## 2. The products represented here

This design system was built from BPC's **client-facing presentation templates** — a collection of seven PowerPoint decks used for managed-services pitches, account-management intros, executive roadmap workshops, and project closure.

There is no application / codebase in scope here: BPC is a **consulting firm**, so the "product" is the body of client-facing material — decks, proposals, one-pagers, and the marketing site. The UI kits in this repo therefore cover:

- **`decks/`** — the core product: slide templates that match the source PPTX system.
- **`ui_kits/marketing-site/`** — a faithful recreation of the BPC public marketing site style (bryantparkconsulting.com).

## 3. Sources

All brand inference came from the following files (kept in this project):

- `source_decks/BPC Managed Services Overview.pptx` — primary source, most complete template.
- `source_decks/BPC Managed Services Sales Reference.pptx`
- `source_decks/AM Customer Intro.pptx`
- `source_decks/AM Business Review Exec Roadmap.pptx`
- `source_decks/AM Business Review Condensed.pptx`
- `source_decks/Pharmalogic Project Closure.pptx`
- `source_decks/Project Completion Template.pptx`

Public web sources (for brand voice + positioning): bryantparkconsulting.com, linkedin.com/company/bryant-park-consulting.

---

## 4. Visual foundations

### 4.1 Colors

BPC's palette is built around a **deep navy** with **warm, earthy accents** — think Bryant Park in autumn, not a SaaS gradient. The palette is concentrated in a handful of hues; variation comes from tone, not hue-shifting.

| Role        | Hex       | Notes                                                         |
|-------------|-----------|---------------------------------------------------------------|
| **Navy 900** | `#1F3C51` | Primary brand. Every hero uses this as the canvas.           |
| Navy 800    | `#233D4C` | Alt deep navy seen in backgrounds.                           |
| Green 500   | `#619C8A` | Signature muted sage-teal — the "BPC green."                 |
| Green 700   | `#047050` | Saturated forest, used for ring/stroke emphasis.             |
| Green 300   | `#9BBB7E` | Light olive-green from the circle pattern.                   |
| Gold 500    | `#F2CC5F` | Warm primary accent. Used on arcs, highlights, CTAs.         |
| Orange 600  | `#EC8842` | Coral-orange, the "energy" color. Used sparingly.            |
| Gray 100–700 | `#F3F3F3…#595959` | Cool neutrals for text and UI surfaces.           |

All tokens live in `colors_and_type.css` as both raw (`--bpc-navy-900`) and semantic (`--ds-brand`, `--ds-fg`) vars.

### 4.2 Typography

BPC's brand font is **Sarabun** (confirmed by client), used primarily at the **Light (300)** weight for headlines and body. Sarabun is a humanist grotesque originally designed for Thai that also carries Latin at the same weight, giving BPC a warm, open, slightly soft feel — less corporate than Helvetica, not as editorial as a serif.

- **Display / headings:** **Sarabun 300** (Light). Tight letter-spacing, generous line-height.
- **UI / body:** **Sarabun 400** (Regular) for paragraphs; **500 / 600** for buttons, labels, emphasis.
- **Numerals / stats:** **Sarabun 300** at large sizes — the Light weight reads beautifully at 48px+.
- **Mono:** **JetBrains Mono** — for code, IDs, file paths.

Sarabun is loaded from Google Fonts. If you have a licensed desktop copy, drop it in `fonts/` for use in Keynote / PowerPoint.

### 4.3 Backgrounds & imagery

The single most recognizable element of BPC's system is the **curved-circle pattern** — a set of interlocking quarter-rings in the brand colors (navy, sage, gold, orange, forest-green), arranged like a stylized "8" or infinity motif.

- On **section openers**, the pattern is overlaid on a duotone photo of a BPC city (NYC, Toronto, Denver, Austin, Bryant Park subway, office photography). The left half stays dark navy; the pattern + photo live on the right half.
- On **content slides**, a smaller corner-ribbon version of the pattern anchors the top-left or bottom-right.
- Imagery is always **warm-cool duotone** (navy shadows, warm gold highlights) — never raw full-color photography. Never cold bluish gradients.

Full-bleed photo is rare; partial-bleed (photo + solid navy panel) is the default.

### 4.4 Illustration system

BPC's decks use a distinctive set of **hand-drawn, loose-line black doodle illustrations** (monoline people figures: a presenter at an easel, a person running with a briefcase, someone puzzling with a question mark). These feel deliberately low-fi and approachable — the opposite of corporate stock illustration.

**Rule:** never generate your own doodles. Always reuse the ones in `assets/illustrations/`. If a scene is needed that isn't covered, leave a placeholder and ask.

### 4.5 Spacing, radii, shadows

- **Spacing:** 4px grid, tokenized `--ds-space-1` … `--ds-space-12`. Section padding on slides is generous (64–120px).
- **Radii:** small (4–8px) for most UI; 20px for stat cards and callouts; pill for badges and tags. The brand's "circle" motif means you can comfortably use full-round pills on buttons and chips — it reinforces the pattern.
- **Shadows:** subtle. BPC lives on solid navy backgrounds most of the time, so shadows are used sparingly and reserved for lifted cards on light surfaces. `--ds-shadow-md` and below.

### 4.6 Borders & dividers

- Hairline 1px dividers in `--ds-gray-200` for table rows and list separators.
- Strong navy 1px borders for form inputs (not teal, not gray — navy).
- No decorative colored-left-border cards (anti-slop rule).

### 4.7 Animation / motion

The source is static, so BPC has no motion library of record. House rules for anything we animate:

- **Easing:** `cubic-bezier(0.2, 0, 0, 1)` for standard transitions; `cubic-bezier(0.2, 0, 0, 1.2)` for emphasis (cards arriving, stats counting up).
- **Durations:** 120 / 200 / 360 ms.
- **No bounces, no spring-in-from-offscreen, no typewriter effects.** Prefer quiet fades and small translations (4–12px).
- Hover: 2–3% opacity/brightness shift, never a color hue change.
- Press: 2% scale-down, no color change.

### 4.8 Transparency & blur

- Dark navy backgrounds use **pure solid fill**, not gradients.
- The circle pattern on imagery is typically painted at **~70–80% opacity multiply** over the photo.
- No backdrop-filter blur anywhere in source decks — avoid it unless building a web UI where glassmorphism is already expected.

### 4.9 Card system

- **Light card:** white bg, 1px `--bpc-gray-200` border, `--ds-shadow-sm`, `--ds-radius-md`.
- **Stat card:** white bg or navy bg, larger radius (`--ds-radius-xl`), heavy display-serif number, small eyebrow label above, body underneath.
- **Dark card:** `--bpc-navy-900` bg, no border, `--ds-shadow-md`, white text, `--ds-brand-accent` eyebrow.
- **No** colored-left-border cards, **no** gradient cards.

---

## 5. Content fundamentals

### 5.1 Voice

BPC's copy is **professional-but-warm**. It reads like a senior consultant who trusts their client — knowledgeable without being stiff, confident without being cocky. It's **not** engineering-team casual, and it's **not** McKinsey-grey.

### 5.2 Register & pronouns

- **First person plural** ("we", "our") for BPC. <cite index="6-17,6-18">The LinkedIn tagline reads "Strategy, technology, and business transformation. We bring people together to build the future of business"</cite>.
- **Second person** ("you", "your team") when addressing the client.
- **Avoid** "users" — BPC talks about clients, teams, leaders, SMEs, steering committees, stakeholders.

### 5.3 Tone rules

- Write in **title case** for slide titles and section eyebrows. Body copy is sentence case.
- Avoid exclamation points in slide copy (one per deck, tops).
- Frame everything in **outcomes**, not features: "Streamlining IT with proactive management," not "24/7 monitoring."
- Acronyms: define once, then use. NetSuite-land is heavy with acronyms (ERP, SOW, PGL, FTE, SME, UAT, OCM, CPQ, NSAW, EPM) — BPC uses them confidently without over-explaining.
- **Emoji:** not used in decks. LinkedIn posts do use 🎉🏅✨ sparingly — **not** part of the formal design system.
- **Unicode dashes:** em-dash "—" for parenthetical phrases. Bulleted lists in decks use a middle-dot "•" or a small filled triangle glyph, not arrows or checkboxes.

### 5.4 Example copy lifted from real BPC decks

> "As a leading NetSuite Alliance Partner, we are a one-stop NetSuite consulting and development partner with depth and breadth of platform expertise."

> "Managed Services with a GOAL: BPC will enable your internal support teams to support your NetSuite ERP long-term."

> "When you need help, we're here."

> "Our focus is your team."

> "The best way to predict the future is to create it." — recurring Peter Drucker close-slide quote.

Section titles are short and declarative: *"Introductions", "Proposal", "Project Governance", "Thank You"*. The subtitle does the work of explaining: *"Ensuring Accountability and Alignment in Project Execution."*

### 5.5 Numbers & stats

BPC uses **big serif numerals** + small caps label. Every proposal deck opens with a stats row:

- `1`  ERP partnership = NetSuite
- `300+` NetSuite Implementations
- `175+` NetSuite Consulting Resources
- `2,000+` Combined Implementations
- `7+` Average Years Experience

Keep the label short and sentence case. Never put a unit after the number on the same line — put it underneath.

---

## 6. Iconography

### 6.1 The three-tier icon approach

BPC's source decks blend three distinct icon styles, each with a job:

1. **Loose monoline doodles** — hand-drawn black line illustrations of people (presenter, runner-with-briefcase, puzzled figure, etc). Used for **narrative** slides where you want warmth, not precision. Stored in `assets/illustrations/`.
2. **Filled silhouette pictograms** — simple 1-color flat pictograms (location pin, pie chart). Used in **data/diagram** contexts. Stored in `assets/diagrams/`.
3. **No icon-font library** is present in the source. For UI (buttons, nav items), we use **Lucide Icons** (CDN) — a clean, consistent 1.5px-stroke set that pairs well with the navy + Inter combo. This is a **flagged substitution**: BPC has no proprietary icon font.

### 6.2 Rules

- Never hand-roll SVG icons; always copy from `assets/` or pull from Lucide.
- Never mix the doodle illustrations and the Lucide icons in the same component (doodles in hero/narrative; Lucide in UI chrome).
- Never use emoji in decks or production UI.
- The curved-circle brand pattern (`assets/patterns/circles-pattern.png`) is **not an icon** — treat it as a hero background texture only.

### 6.3 Partner logos

`assets/partners/` holds the most-used third-party marks (NetSuite, Boomi, Celigo, Avalara, Netgain, Zone & Co, RF-SMART) and the NetSuite Alliance Partner award badges. Use them at their native aspect ratio; don't recolor; don't crop the official NetSuite award badges.

---

## 7. File index

```
.
├── README.md                  ← this file
├── SKILL.md                   ← entry point for Claude/Claude Code
├── colors_and_type.css        ← all tokens + type classes
├── fonts/                     ← (empty; drop licensed BPC fonts here)
├── assets/
│   ├── logo/                  ← BryantPark CONSULTING wordmark
│   ├── patterns/              ← the circle pattern + corner ribbon
│   ├── backgrounds/           ← duotone hero photos (NYC, Toronto, Denver, etc.)
│   ├── illustrations/         ← hand-drawn doodle figures
│   ├── charts/                ← example pie/diagram imagery
│   ├── diagrams/              ← NA map, location pin, NetSuite wheel
│   └── partners/              ← Oracle/NetSuite, award badges, partner logos
├── preview/                   ← cards shown in the Design System tab
├── ui_kits/
│   ├── marketing-site/        ← faithful recreation of bryantparkconsulting.com
│   └── decks/                 ← reusable deck component system
└── slides/                    ← sample slides (title, section, content, stats, thank-you)
```

---

## 8. Known caveats & open questions

- **Fonts:** Confirmed — **Sarabun Light**. Served from Google Fonts. Swap to a licensed desktop copy in `fonts/` if you need offline/PowerPoint use.
- **Exact brand hexes:** all colors were sampled from slide XML + extracted pattern PNGs. They're internally consistent across seven decks but may drift slightly from the "official" brand book (if one exists). **Action:** share a brand book if you have one.
- **Iconography for UI chrome:** Lucide is a substitution. If BPC standardizes on Heroicons, Feather, or a custom set, swap the reference in `ui_kits/marketing-site/`.
- **No mobile-app product in scope:** BPC is consulting-first. Whatever client portal or internal tool exists, I don't have it, so the UI kit is marketing-site-only.

---

## 9. Next steps for iteration

Once you review, please flag:

1. Font substitution — approve or send the real files.
2. Palette — confirm the six brand hexes or send a brand guide.
3. Illustration style — do these doodles represent the *current* brand, or is there a more recent illustration system I should copy in?
4. Missing products — is there a BPC client portal, DemandSync product UI, or internal tool I should add as a UI kit?

---

## Index · quick links

- `SKILL.md` — how other Claude agents (including Claude Code) should use this kit.
- `colors_and_type.css` — all design tokens.
- `preview/` — Design System tab cards: 4 color cards, 4 type cards, 3 spacing cards, 4 component cards, 5 brand cards.
- `slides/` — six reusable slide layouts + `slides/index.html` to preview them as a flight.
- `ui_kits/marketing-site/` — homepage recreation with modular React components.
- `assets/` — logo, patterns, duotone backgrounds, hand-drawn illustrations, partner marks, NetSuite awards.
- `source_decks/` — the seven original PPTX files all brand inference came from.
