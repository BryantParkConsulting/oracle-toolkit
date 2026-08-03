# NSPB MCP Assistant — 1-Page Cheatsheet

Print and keep next to your monitor.

---

## Slash menu shortcuts

| Action | Keys |
|---|---|
| Open slash menu | type `/` |
| Filter the menu | keep typing |
| Navigate menu | ↑ / ↓ |
| Pick item | **Enter** |
| Close menu | **Esc** |

---

## Browse / discover (read-only)

| Command | Result |
|---|---|
| `show me the rules` | List business rules |
| `show all forms` | List all forms |
| `show me the variables` | All sub vars + values |
| `show recent jobs` | Last jobs run |
| `show DM integrations` | DM pipelines |
| `cubes` | Cubes + their dims |
| `show navigation flow` | NSPB menu tree |
| `show me the <Dim> hierarchy` | Display dim tree |
| `find member <id>` | Locate across all dims |
| `which dim contains <id>` | Where does a code live |

---

## Forms

| Command | Result |
|---|---|
| `/openform <Form>` | Open form as Excel grid |
| `adhoc2 <Form>` | Open form as SmartView pivot |
| `rules of <Form>` | Rules attached to form |

---

## Rules

| Command | Result |
|---|---|
| `/run <Rule>` | Execute rule (RTP form if needed) |
| `which rules run on save` | onSave rules across forms |
| `which rules run on load` | onLoad rules across forms |
| `which forms use rule <name>` | Reverse lookup |

---

## Substitution variables

| Command | Result |
|---|---|
| `update variables` | **Live picker** — edit any var inline |
| `set variable X = Y` | Set ONE app-level var |
| `set variable X = Y in <Cube>` | Set ONE cube-scoped var |

---

## Dimensions

| Command | Result |
|---|---|
| `export <Dim> dimension` | Write `DIM_<Dim>` sheet (live REST) |
| `export <Dim> dimension from <Cube>` | Override cube |
| `import dimension from this sheet` | PATCH dim members (dry-run first) |
| `rename alias of <Member> to <NewAlias>` | Rename one alias |

---

## Files (NSPB inbox/outbox)

| Command | Result |
|---|---|
| `list files` | All files with size/date |
| `delete file <name>` | Remove by exact name |

---

## Jobs

| Command | Result |
|---|---|
| `run job <name>` | Submit any pre-defined Planning job |
| `show recent jobs` | Track running/finished jobs |
| `show job status <id>` | Detail one job |

---

## Build / analyze

| Command | Result |
|---|---|
| `/adhoc <Form>` or NL question | Build ad-hoc grid |
| `/analyze` | Pre-built analytics menu |
| `/transform` | Load active sheet → DuckDB |
| Free-form NL on a sheet | NL → SQL → result |

---

## Format

| Command | Result |
|---|---|
| `format this sheet as an executive report` | Exec-style |
| `format this sheet as a financial report` | Finance-style |
| `clean zero rows from this sheet` | Hide all-zero rows |
| `highlight negative values in red` | Cond. format |
| `freeze top 4 rows` | Freeze pane |
| `auto-fit column widths` | Resize cols |

---

## Help & questions

| Command | Result |
|---|---|
| `/help` | FAQ menu |
| `what is a substitution variable` | Concept Q&A |
| `how do I do month-end close in NSPB` | Process Q&A |
| `<your question in plain English>` | AI answers using your KB |

---

## Chat housekeeping

| Action | How |
|---|---|
| Clear chat | 🗑 button (top right) |
| Cancel running command | **Cancel** button (top right) |
| Reload KB | ⚙ Environment → **Load KB** |
| Switch AI provider | ⚙ Environment → paste new key |
| Toggle debug mode | ⚙ Environment → Debug checkbox |
| Dump last debug log | `debug last` |

---

## What runs **without** EPM Automate

✅ Run rules · Set / update variables · Export dim · Import dim (PATCH)
✅ Run any pre-defined job · List/delete files · All `show` commands
✅ Open forms · Ad-hoc grids · AI analysis · Format / clean

⚠️ Still pending: download file, upload file, AI-built dim import file, DM integration runner

---

## AI key formats

| Provider | Format |
|---|---|
| Gemini | `AIzaSy...` (free 500 req/day) |
| Claude | `sk-ant-api03-...` (paid per token) |

Auto-detected. Paste either one in Settings → AI API key.

---

*Full guide: `USAGE_GUIDE.md` · Install: `HOW_TO_INSTALL.md` · Quickstart: `QUICKSTART_USER.md`*
