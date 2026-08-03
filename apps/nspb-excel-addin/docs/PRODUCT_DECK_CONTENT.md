# NSPB MCP Assistant — Product Deck Content

**Purpose:** raw content for a Claude Design PowerPoint deck.
**Audience:** finance leaders evaluating the product (CFO, Controller, FP&A Director, NSPB Admin).
**Tone:** technical-credible, value-focused, no fluff.

---

## CORE POSITIONING

> *"NSPB MCP Assistant is **not** just an MCP server.
> It's a complete AI layer for Oracle NSPB:
> the Excel add-in your team already lives in,
> a Cloudflare-hosted brain that knows your tenant cube end-to-end,
> and an editorial-grade report generator that produces month-end close packs in minutes."*

**One-line elevator pitch:** *Finance teams stop fighting NSPB and start using it. Reports that used to take 2 days come out in 2 minutes. Onboarding new analysts drops from 6 months to 6 weeks.*

---

## SLIDE 1 — The problem (open with pain)

**Title:** Most NSPB teams use 30% of the platform — and 40% churn within 2 years.

**Visual:** Funnel diagram

```
   100 NSPB licenses purchased
        │
   ┌────▼────┐
   │ 70% use │  3-4 forms, manually
   │ basic   │  refresh in Smart View
   │ features│
   └────┬────┘
        │
   ┌────▼────┐
   │ 30% use │  Some rules, basic
   │ rules + │  variance reports
   │ KPIs    │
   └────┬────┘
        │
   ┌────▼────┐
   │ 10% are │  Full close pack,
   │ power   │  automation, FDMEE
   │ users   │
   └─────────┘
```

**Speaker notes:**
- Customers pay $50-200k/year for NSPB licenses
- The platform is powerful but opaque — 22+ dimensions, 100+ rules, sub vars, FDMEE, smart push
- The team plateaus, then quietly drifts back to Excel + macros
- Churn happens at year 2-3 when the renewal hits

---

## SLIDE 2 — Where the value leaks today

**Title:** Hidden costs of an under-used NSPB.

**Visual:** Side-by-side cost table

| Activity | Manual (today) | NSPB MCP |
|---|---|---|
| Month-end close pack | 16-22 hours | **5 minutes** |
| Variance analysis | 4-6 hours | **30 seconds** |
| "Why is this cell zero?" debug | 30-60 min | **15 seconds** |
| New analyst onboarding | 4-6 months | **4-6 weeks** |
| Form / rule discovery | constant Slack to admin | **inline AI explanation** |

**Bottom-line math:** for a finance team of 5 (1 controller + 3 analysts + 1 director), the time saved across these activities is 60-80 hours/month, or **$5-8k/month of recovered capacity** at fully-loaded rates.

---

## SLIDE 3 — What NSPB MCP is (and isn't)

**Title:** Not "an MCP server" — a complete AI-native finance workspace.

**Visual:** Layer cake diagram

```
┌─────────────────────────────────────────────────┐
│  USER EXPERIENCE LAYER                          │
│  • Excel add-in (Office.js taskpane)            │
│  • Chat interface with natural language         │
│  • 9 command verbs + 80+ pre-built triggers     │
│  • 3-tier preview: HTML / PDF / inline          │
└─────────────────────────────────────────────────┘
                       │
┌─────────────────────────────────────────────────┐
│  INTELLIGENCE LAYER (Cloudflare Worker)         │
│  • 22 tools registered with Gemini 2.5 Pro/Flash│
│  • Tool routing + system prompt orchestration   │
│  • Multi-turn tool loops                        │
│  • PDF rendering via Browser API                │
└─────────────────────────────────────────────────┘
                       │
┌─────────────────────────────────────────────────┐
│  KNOWLEDGE LAYER (per-tenant)                   │
│  • NSPB generic KB (174 KB markdown)            │
│  • Tenant KB parsed from LCM (~600 KB JSON)     │
│  • Forms + rules + sub vars + dim hierarchies   │
│  • Rule bodies (Groovy/CalcScript) extracted    │
└─────────────────────────────────────────────────┘
                       │
┌─────────────────────────────────────────────────┐
│  ORACLE NSPB / EPM CLOUD (the tenant)           │
│  • REST API v3 + FDMEE V1 (documented)          │
│  • Smart View XML protocol (interop)            │
│  • Form / rule / dim metadata                   │
└─────────────────────────────────────────────────┘
```

**What makes this NOT just an MCP:**
- MCP = a protocol for connecting tools to an LLM. That's one layer.
- We have: an Excel add-in, a CDN-hosted brain, a parsed KB, a design system for editorial-grade output, multi-turn tool orchestration, PDF rendering, anti-churn features.
- We're a full product, with MCP-like patterns inside.

---

## SLIDE 4 — How one request flows

**Title:** Anatomy of "analyze this sheet" — 3 seconds end-to-end.

**Visual:** Sequence diagram (numbered arrows)

```
User in Excel
    │
    │  1. Types "analyze this sheet" → presses Send
    ▼
┌─────────────────────────┐
│ Excel taskpane (Office.js)│
└─────────────────────────┘
    │
    │  2. POST /api/chat with:
    │      • user message
    │      • active sheet data (values, selection)
    │      • tenant settings
    │      • session history (last 8 turns)
    ▼
┌─────────────────────────┐
│ Cloudflare Worker        │
│ gentle-moon-046f         │
└─────────────────────────┘
    │
    │  3. Loads:
    │      • System prompt (~50 KB)
    │      • NSPB KB (174 KB markdown)
    │      • Tenant KB (~600 KB JSON)
    │      • 22 tool schemas
    │
    │  4. Sends to Gemini 2.5 Pro
    ▼
┌─────────────────────────┐
│ Gemini 2.5 Pro           │
│ (Google API)             │
└─────────────────────────┘
    │
    │  5. Returns structured tool call:
    │      analyze_active_sheet({
    │        title, kpis, sections, tables, ...
    │      })
    ▼
┌─────────────────────────┐
│ Worker — tool dispatcher │
└─────────────────────────┘
    │
    │  6. Executes runAnalyzeSheet():
    │      • Builds Excel grid (colors, sections)
    │      • Renders HTML report (master template)
    │
    │  7. Returns to taskpane:
    │      { content, grid, htmlReport, chips }
    ▼
┌─────────────────────────┐
│ Excel taskpane           │
└─────────────────────────┘
    │
    │  8. Renders in chat:
    │      • Prose summary
    │      • 3 chips: HTML / PDF / Preview
    │      • Writes Excel sheet `Analysis_Form_…`
```

**Key numbers:**
- Total round-trip: 3-8 seconds (Flash) or 15-30 seconds (Pro for complex)
- Token usage: ~50k input / ~2k output (cached after first call)
- Cost per call: ~$0.005-0.02

---

## SLIDE 5 — The Knowledge Base architecture

**Title:** Two layers of grounding — generic NSPB + your tenant.

**Visual:** Side-by-side stack

```
┌──────────────────────┐    ┌──────────────────────┐
│ NSPB GENERIC KB      │    │ TENANT KB            │
│ (kb.md, 174 KB)      │    │ (tenant-kb.json,     │
│                      │    │  ~600 KB)            │
│ Generic FAQ:         │    │ Per-customer extract │
│ • What is a sub var? │    │ from LCM export:     │
│ • How do rules work? │    │ • 81 forms           │
│ • Smart Push concept │    │ • 46 rules + bodies  │
│ • FDMEE pipelines    │    │ • 1,848 dim members  │
│ • Substitution vars  │    │ • 37 sub vars        │
│ • Valid intersections│    │ • 20 FDMEE rules     │
│                      │    │ • Navigation flows   │
│ Same for every       │    │                      │
│ customer.            │    │ Unique per tenant.   │
└──────────────────────┘    └──────────────────────┘
                  │           │
                  └─────┬─────┘
                        ▼
              ┌─────────────────┐
              │ Embedded in     │
              │ Cloudflare      │
              │ Worker bundle   │
              │ (~1.4 MB total) │
              └─────────────────┘
```

**Parse pipeline (build time, once per tenant):**

```
Oracle LCM export (folder)
    │  XML files for forms, rules, dims, vars, FDMEE
    ▼
parse-lcm.js (Node script)
    │  • Extracts form layouts + attached rules
    │  • Extracts rule SCRIPT BODIES (Groovy / CalcScript)
    │  • Builds dim hierarchies with metadata
    │  • Parses sub vars + FDMEE data load rules
    │  • Constructs nav flow graph
    ▼
clients/<name>/tenant-kb.json
    │
    ▼
worker/build.js
    │  Embeds tenant-kb + kb.md + UI + assets
    ▼
bundle.js (1.4 MB) → wrangler deploy → Cloudflare
```

**Why rule bodies matter:**
- Most NSPB tools see only rule **names** ("NFS_AGG - Forecast")
- We see the **actual Groovy source** — that's why `explain rule X` can walk through the script line by line
- That's the moat: no competitor has this

---

## SLIDE 6 — The 22 tools, organized

**Title:** What the AI can actually DO inside Oracle NSPB.

**Visual:** Category tiles (icon + verb count)

```
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ 🧠 ANALYZE   │  │ 📋 REPORT    │  │ 🧠 EXPLAIN   │
│ Insights     │  │ Multi-page   │  │ Rule / form  │
│ • analyze_   │  │ • close_     │  │ • explain    │
│   active_    │  │   report     │  │   (5 targets)│
│   sheet      │  │ • 5 recipes  │  │              │
└──────────────┘  └──────────────┘  └──────────────┘

┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ 🧭 NAVIGATE  │  │ 📋 SHOW      │  │ 🛠 BUILD    │
│ Cube context │  │ Discover     │  │ Query data   │
│ • navigate_  │  │ • inventory  │  │ • build_     │
│   grid       │  │ • dimension  │  │   adhoc      │
│ • modify_    │  │ • filebrows. │  │ • compare_   │
│   grid       │  │ • dm_details │  │   grid       │
│              │  │ • mapping    │  │ • top_       │
│              │  │ • pipeline   │  │   drivers    │
└──────────────┘  └──────────────┘  └──────────────┘

┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ ▶ EXECUTE   │  │ 📐 OPEN      │  │ 🎨 TRANSFORM │
│ Run rules    │  │ Forms /      │  │ Sheet ops    │
│ • run_       │  │ dashboards   │  │ • format_    │
│   preset     │  │ • open_form  │  │   active_    │
│              │  │              │  │   sheet      │
│              │  │              │  │ • clean_     │
│              │  │              │  │   sheet      │
│              │  │              │  │ • transform_ │
│              │  │              │  │   to_sv      │
│              │  │              │  │ • map_sheet  │
└──────────────┘  └──────────────┘  └──────────────┘
```

---

## SLIDE 7 — The 5 anti-churn features (what keeps customers)

**Title:** Why teams stay on NSPB instead of fleeing to Excel.

**Visual:** 5 cards with icons

| Feature | What it does | Why it stops churn |
|---|---|---|
| 🧠 **Explain Rule** | Walk through any Groovy / CalcScript line by line, in plain English, grounded in the rule's actual body | Analyst no longer afraid of "what does this rule do?" Reduces dependency on the original implementer. |
| 🩺 **Why is X Zero?** | Diagnoses missing inputs by tracing: what calculates X → which forms feed it → which form has empty input for current POV | The #1 support question. Now self-service. |
| 🔍 **Explain Cell** | Standing on cell B7: shows row dim (Account), column dim (Period), POV (all 5 other dims with values), level, data storage type | Demystifies multi-dim cubes. Builds intuition. |
| 🪜 **Show Bottom Level** | Lists level-0 (input-grade) members of every dim in the active grid | Critical before data entry — users always need to know "which members can I actually type values into?" |
| 📚 **Proactive Tutor** | "How do I load FY26 budget?" → AI uses tenant KB to walk through: open form X, set POV Y, save → triggers rule Z | Onboarding accelerator. New analyst gets tenant-specific answers, not generic Hyperion docs. |

---

## SLIDE 8 — The Editorial Design System

**Title:** Board-ready output, not generic dashboards.

**Visual:** Mockup of the master template — Sarabun typography, navy/green/gold palette, big thin numbers, paginated sections

**Design tokens:**
- **Typography:** Sarabun (display, 300/400/500 weights) + JetBrains Mono (data tables, numerals)
- **Palette:** Navy `#1F3C51` · Green `#047050` · Gold `#F2CC5F` · Orange `#EC8842` on paper `#FBFAF6`
- **Layout:** A4-portrait pages, 1180px max-width, multi-page via `@page` rules
- **Components:** masthead with meta-grid, KPI tile band, formal P&L tables with subtotal bold-borders, pull quotes, var-row bars, donut + line + bar charts, audit-footer colophon

**Three render targets, one source:**

```
        Markdown / structured data
                │
                ▼
        Master template (HTML)
        │
        ├─→ 📄 HTML download
        │     (open in browser, ready to email)
        │
        ├─→ 🖨 PDF (Cloudflare Browser Rendering)
        │     (server-side headless Chrome → identical to HTML)
        │
        └─→ 👁 Preview (iframe srcdoc)
              (inline in the chat, sandboxed)
```

---

## SLIDE 9 — The close pack — composable

**Title:** Build the exact pack each stakeholder wants.

**Visual:** Recipe → sections table

```
┌─────────────────────────────────────────────────────────────────┐
│ RECIPES (presets)                                                │
├──────────┬─────────────┬───────────────────────────────────┬─────┤
│ quick    │ ~10 sec     │ Cover + Exec Summary + P&L       │ 3p  │
│ standard │ ~25 sec     │ + Balance Sheet + Variance       │ 6p  │
│ full     │ ~50 sec     │ + Cash Flow + KPIs + Ops + App.  │ 11p │
│ board    │ ~30 sec     │ Executive style, big numbers     │ 4p  │
│ audit    │ ~60 sec     │ Full + reconciliations + JE log  │ 12p │
└──────────┴─────────────┴───────────────────────────────────┴─────┘

OR fully custom:
  "generate close report with sections:
   cover, executive_summary, pnl_statement, balance_sheet"

11 section types available:
  cover · executive_summary · headline_kpis · pnl_statement ·
  balance_sheet · cash_flow · kpi_dashboard · variance_commentary ·
  operating_metrics · segment_breakdown · appendix_detail
```

Each section is its own page in the PDF (via `page-break-after: always`).
Section numbering (§ 01, § 02 …) auto-increments based on what renders.

---

## SLIDE 10 — Why this beats Excel Copilot for NSPB

**Title:** Excel Copilot is general-purpose. We're cube-aware.

**Visual:** 2-column comparison

| Task | Excel Copilot | NSPB MCP |
|---|---|---|
| Add a Variance % column | ✅ Excellent | ✅ Same |
| Sort / highlight / format | ✅ Excellent | ✅ Same |
| "What does this calc script do?" | ❌ No clue — doesn't know NSPB | ✅ Reads the Groovy body, summarizes |
| "Why is my Forecast empty?" | ❌ Can't trace data flow | ✅ Walks rule → input form → POV |
| "Generate the close pack" | ❌ No template, no NSPB data | ✅ One command, 30 sec |
| "Add FY24 Actual to each row" | ❌ Can't query NSPB | ✅ Build_adhoc + merge |
| "Open the OpEx form" | ❌ Doesn't know NSPB forms | ✅ One command |

**Bottom line:** Excel Copilot is the right tool for pure Excel ops. **For anything that requires understanding NSPB, only this tool can answer.**

---

## SLIDE 11 — Pricing model

**Title:** Per-tenant SaaS, three tiers.

**Visual:** Tier card grid

```
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│ STARTER          │  │ TEAM             │  │ ENTERPRISE       │
│ $XXX / mo        │  │ $X,XXX / mo      │  │ $X,XXX / mo      │
│ per tenant       │  │ per tenant       │  │ per tenant       │
│                  │  │                  │  │                  │
│ • Up to 5 users  │  │ • Up to 20 users │  │ • Unlimited users│
│ • Quick + std    │  │ • Full + Board   │  │ • All recipes    │
│   close recipes  │  │ • Custom sections│  │ • Multi-entity   │
│ • BYO Gemini key │  │ • BYO or managed │  │   close packs    │
│ • Email support  │  │ • 8×5 support    │  │ • SSO + audit    │
│                  │  │                  │  │ • Custom branding│
│                  │  │                  │  │ • 24×7 support   │
└──────────────────┘  └──────────────────┘  └──────────────────┘
```

**ROI calc** (for the Team tier at $X,XXX/mo):
- Saves ~16h/month of controller time at $80/h fully-loaded = $1,280
- Saves ~30h/month of analyst time at $60/h fully-loaded = $1,800
- **Net savings: $3,000+/month vs $X,XXX subscription**
- Break-even: under 1 month

---

## SLIDE 12 — Implementation

**Title:** From signed to live in 1 week.

**Visual:** Timeline

```
Day 1  ────────────────────────────────────────►  Day 7
│                                                    │
├─ Day 1-2: Tenant LCM export (customer's IT)        │
│           → parse-lcm.js → tenant-kb.json           │
│                                                    │
├─ Day 2-3: Per-tenant bundle build + deploy         │
│           → CLIENT=acme npm run deploy              │
│                                                    │
├─ Day 4: Add-in install + tenant settings           │
│         → Install NSPB.bat → enter NSPB host       │
│                                                    │
├─ Day 5-6: Pilot user training (1-2 controllers)    │
│                                                    │
└─ Day 7: Production rollout to team                 │
```

**What we need from the customer:**
- LCM export of their NSPB application (one-time, 5 min by their NSPB admin)
- NSPB host URL + service account (or per-user credentials)
- Excel 365 or Excel 2019+ on Windows or Mac
- Their Gemini API key (free tier works) OR opt for our managed key

**Re-keying the tenant after major NSPB changes:** new LCM export → re-parse → re-deploy. ~30 minutes.

---

## SLIDE 13 — Security & data handling

**Title:** Zero data lake. Everything stays in your tenant.

**Visual:** Data residency diagram

```
┌──────────────────────────────────────────────────┐
│ CUSTOMER'S ORACLE NSPB TENANT                    │
│ (where all data lives — we never copy it)        │
└──────────────────────────────────────────────────┘
                       ▲
                       │  Each request authenticated with
                       │  the customer's NSPB credentials
                       │
┌──────────────────────────────────────────────────┐
│ CLOUDFLARE WORKER (stateless, edge)              │
│ • No database                                    │
│ • No persistent storage                          │
│ • Requests die after the response                │
│ • Tenant KB embedded in the bundle (read-only)   │
└──────────────────────────────────────────────────┘
                       ▲
                       │  HTTPS only
                       │
┌──────────────────────────────────────────────────┐
│ Office.js taskpane (in customer's Excel)         │
│ • Settings in OfficeRuntime.storage (local)      │
│ • Chat history in localStorage (local, 5 days)   │
│ • No telemetry, no analytics                     │
└──────────────────────────────────────────────────┘
```

**What we don't do:**
- ❌ Store customer data anywhere outside their NSPB tenant
- ❌ Send NSPB data to Anthropic or Google (only the user's prompt + minimal context goes to the LLM)
- ❌ Have a database
- ❌ Persist sessions
- ❌ Track users

**What we do:**
- ✅ Use the customer's NSPB credentials per-request (token never leaves the worker memory)
- ✅ Embed their parsed metadata (forms, rules, dims) in the deployed bundle — read-only
- ✅ Pass user prompts + selected context to the LLM (encrypted in transit, ephemeral)

---

## SLIDE 14 — Roadmap

**Title:** Where this is going.

**Visual:** Phased timeline

```
Q2 2026 (NOW)          Q3 2026                Q4 2026
├─ Close pack v1       ├─ Close Sprint 2:     ├─ Multi-tenant
│  (active sheet)      │  auto-fetch NSPB     │  exec dashboard
├─ Explain family      │  (no sheet needed)   ├─ Customer-branded
├─ Navigate cube        ├─ Multi-entity        │  templates
├─ PDF + Preview        │  parallel packs      ├─ Industry KB
                        ├─ Variance / Trend /   │  benchmarks
                        │  Mix / YoY templates │
                        ├─ Excel ribbon       │
                        │  buttons (one-click)│
```

---

## SLIDE 15 — Call to action

**Title:** Try it on your tenant in a 30-minute demo.

**Visual:** Three-step CTA

```
1. Tell us your NSPB host
2. We build your tenant KB (30 min)
3. We give you a live add-in to test
```

Trial: 14 days free, full features, your data.
Contact: gallobruno@gmail.com

---

## APPENDIX — Technical specs (for the IT review slide)

- **Frontend:** Office.js 1.4 + plain JS (no React in the panel for performance)
- **Backend:** Cloudflare Workers (V8 isolates, <50ms cold start)
- **LLM:** Gemini 2.5 Flash + Pro (auto-routed by complexity); optional Claude
- **PDF:** Cloudflare Browser Rendering (headless Chromium)
- **Hosting:** `*.workers.dev` subdomain or custom domain
- **Region:** Cloudflare edge (200+ POPs worldwide)
- **Excel compatibility:** Excel 365, Excel 2019+, Mac Excel, Excel for iPad
- **NSPB compatibility:** v22.07+ (anything with REST v3 API)
- **Auth:** customer credentials per-request (no stored tokens)
- **Updates:** rolling, no version pinning required
- **Code:** TypeScript + JS, ~10k LoC, audited (see `docs/API_AUDIT.md`)
- **License:** proprietary, commercial use
