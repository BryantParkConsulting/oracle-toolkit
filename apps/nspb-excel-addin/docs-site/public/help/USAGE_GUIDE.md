# NSPB MCP Assistant — Usage Guide

Organized by **what you want to do**, not by command.
Each section has the command(s), an example, and what you should see.

---

## Table of contents

- [Setup (first time)](#setup-first-time)
- [Browse and discover](#browse-and-discover)
- [Open a form and see its data](#open-a-form-and-see-its-data)
- [Run a business rule](#run-a-business-rule)
- [Update substitution variables](#update-substitution-variables)
- [Work with dimensions](#work-with-dimensions)
- [Manage files in NSPB inbox/outbox](#manage-files-in-nspb-inboxoutbox)
- [Run jobs (export/import metadata or data)](#run-jobs-exportimport-metadata-or-data)
- [Build and analyze ad-hoc grids](#build-and-analyze-ad-hoc-grids)
- [Format and clean a sheet](#format-and-clean-a-sheet)
- [Ask questions about NSPB](#ask-questions-about-nspb)
- [Tips that save time](#tips-that-save-time)

---

## Setup (first time)

**What you want:** load credentials and the catalog so the chat can do real work.

1. Open the task pane → click **⚙ Environment** at the top.
2. Fill in:
   - **NSPB URL** — `https://YOUR-TENANT.epm.YOUR-REGION.ocs.oraclecloud.com`
   - **Username** / **Password**
   - **Application** — usually `NetSuite`
3. *(Optional)* paste a **Gemini** (`AIza…`) or **Claude** (`sk-ant-…`) AI key. Auto-detected.
4. Click **Test connection** → green ✓.
5. Click **Load KB** → wait ~30 sec while it pulls dimensions, forms, rules, jobs.

**You should see:** the badge "🟢 Detected: Gemini" or "🟣 Detected: Claude" under the AI key field, and a "KB loaded" status.

---

## Browse and discover

**What you want:** explore what exists in your tenant — dimensions, forms, rules, jobs.

| Command | What it does |
|---|---|
| `show me the rules` | List all business rules with descriptions |
| `show all forms` | Inventory of all forms (~150-200) |
| `show me the variables` | All substitution variables with current values |
| `show recent jobs` | Last jobs that ran, with status and duration |
| `show DM integrations` | Data Management integrations |
| `cubes` | List cubes with their dimensions |
| `show navigation flow` | The NSPB menu tree |
| `show me the Account hierarchy` | Display a dim tree inline |
| `find member EBS_REVENUE` | Locate a member across all dimensions |

**Tip:** type `/show` to open a menu of all read-only queries.

---

## Open a form and see its data

**What you want:** pull a Planning form into Excel as a working data grid.

```
/openform Income Statement
```

Replace the form name. Form names are **case-insensitive** and partial matches work.

**You should see:**
- A new sheet `Income Statement` with the form's data grid.
- The chat shows the **POV** (Period, Year, Scenario, etc.) and the **attached business rules** (onLoad, onSave, OnDemand).

**Variations:**
- `/openform OpEx by Dept.` — any form name
- `adhoc2 Income Statement` — opens the form as a SmartView ad-hoc pivot (raw SmartView format, connect SmartView and click Refresh)

---

## Run a business rule

**What you want:** execute a rule directly from the chat — including ones that need runtime prompts (RTPs).

```
/run CURRENCY
```

Replace `CURRENCY` with any rule name. If the rule has no RTPs, it submits immediately.
If it needs RTPs (e.g. Period, Entity), the chat opens an **inline form** with **autocomplete from your KB**:

```
Rule "BR_AllocateExpenses" needs runtime prompts:
  Period:  [type to search 12 Period members…]
  Entity:  [type to search 87 Entity members…]
  [▶️ Run]
```

**You should see:** `✓ Rule submitted. Job ID: 12345 · Status: PROCESSING`. Then run `show recent jobs` to track it.

**Cancel:** click the **Cancel** button (top right of chat) if you opened the form by mistake.

---

## Update substitution variables

### Edit one quickly
```
set variable CurrentMonth = Jan
set variable CurrentYear = FY26 in NetSuite
```
First form = app-level. Second form (with `in <Cube>`) = cube-scoped.

**You should see:** `✓ Variable updated (application): &CurrentMonth = Jan` in 1 second.

### Edit several at once (the live picker)
```
update variables
```

**You should see:** a list of every variable, grouped by scope (Global / per-cube), each with an editable input and a **Save** button. Click Save → green ✓ next to that row.

This is the fastest way to do month-end variable updates — no `setSubstVars` script, no EPM Automate.

---

## Work with dimensions

### Display a hierarchy inline
```
show me the Scenario hierarchy
show me the Account hierarchy
```

### Export a dimension to a sheet
```
export Account dimension
export Entity dimension
export <Dim> dimension from <Cube>     ← override the cube
```

**You should see:** a new sheet `DIM_Account` with all members + their parent, alias, level, type, formula, etc. **No Job Definition needed** — this is a live REST GET.

### Import (PATCH) a dimension from the active sheet
```
import dimension from this sheet
```

Edits the dim members directly via the Planning REST API. **Always runs a dry-run first** to preview the changes. You confirm → it commits.

### AI-assisted dimension import file (DEV PENDING)
```
create dimension import file from this sheet     [dev pending]
create <Dim> from this sheet                     [dev pending]
```

These will let you paste any tree shape (indented, list, JSON) and get back a Planning-compatible CSV/ZIP. **In development.**

---

## Manage files in NSPB inbox/outbox

```
list files
```
Shows all files in inbox/outbox (snapshots, exports, imports) with size and last-modified date.

```
delete file Old_export_FY24.zip
```
Removes a file by exact name.

```
download file Account_export.zip      [dev pending]
upload file from this sheet            [dev pending]
```

---

## Run jobs (export/import metadata or data)

For things that need a **pre-defined Job Definition** in NSPB (export metadata, import data, plan-type maps, ruleset bundles):

```
run job ExportAccountMetadata
run job NightlyRefresh
```

The KB knows each job's `jobType`, so the chat sends the right payload to the Planning `/jobs` REST endpoint.

**You should see:** `✓ Job submitted (EXPORT_METADATA). Job ID: 67890`. Track with `show recent jobs`.

**Tip:** `/show jobs` lists all available job names.

---

## Build and analyze ad-hoc grids

### NL → ad-hoc grid
Plain English questions become ad-hoc queries:
```
revenue by month FY25 forecast
opex by dept Q1 FY25 actual vs budget
top 10 customers by revenue FY25
```

The AI builds the right SmartView grid layout, fetches the data, writes it to a sheet.

### Pre-built analytics (`/analyze`)
```
/analyze
```
Opens a menu of cached analyses: variance trees, top drivers, lost customers, missing forecast checks, etc.

### NL → SQL on the active sheet
After loading a sheet into DuckDB (`/transform`), ask anything:
```
what's the total of column D where region = 'West'
which products have negative margin
```

The AI generates DuckDB SQL, runs it, paints the result. **Rows never leave the browser** — only the schema is sent to the AI.

---

## Format and clean a sheet

```
format this sheet as an executive report
format this sheet as a financial report
clean zero rows from this sheet
highlight negative values in red
freeze top 4 rows
auto-fit column widths
```

These act on the **active sheet** in Excel. Type `/format` to open the menu.

---

## Ask questions about NSPB

The `/help` menu has 30+ FAQs answered from cache (instant, $0 cost):

```
what is a substitution variable
how do I run a business rule in NSPB
how do I do month-end close in NSPB
how does data management work
what is the difference between input and review forms
what runs without EPM Automate now
```

If your question doesn't match an FAQ, the AI answers it using your tenant's KB as context.

---

## Tips that save time

- **`/`** anywhere — open the slash palette. Type to filter.
- **Up/Down arrow** — navigate the slash palette. **Enter** picks. **Esc** closes.
- **Tab in the input** — accepts the highlighted slash command.
- **`/clear` or 🗑 button** — clear chat history (settings + KB stay).
- **Cancel button** (top right of chat) — abort a long-running rule, form open, or analysis.
- **Re-load KB** when somebody adds new dims/forms/rules in NSPB (KB caches for ~24h).
- **Debug mode** — Settings → Debug mode = ON → every command shows tool calls and timings in chat. Great for understanding what the AI did.
- **Two AI providers** — paste either Gemini (`AIza…`) or Claude (`sk-ant-…`) in Settings. Same chat, same commands. Gemini is free up to 500 req/day; Claude charges per token.
- **`debug last` or `debug all`** — dump the last command(s) for a clean trace to send to support.

---

*See `USAGE_CHEATSHEET.md` for a 1-page printable command reference.*
