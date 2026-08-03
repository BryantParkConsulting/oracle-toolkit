# User guide

Brief reference of what you can type in the chat. The chat is forgiving — slash commands, natural language, or questions all work.

---

## The most common 10 commands

| Type this | What happens |
|---|---|
| `show me the cubes` | Lists all your cubes with their dimensions |
| `show dimensions` | Picker — choose a dim → writes its hierarchy to a sheet |
| `open form Income Statement` | Opens any form by name, with data + attached rules |
| `show me the forms` | Picker grouped by module — pick one to open |
| `show me the rules` | Lists all business rules in your tenant |
| `run rule NFS_All Accts Forecast` | Runs a business rule (auto-prompts RTPs) |
| `show me the variables` | Lists substitution variables with current values |
| `set variable NSP_PER_RptCurrMo = TP4` | Sets one substitution variable |
| `update variables` | Opens a bulk variable editor |
| `analyze this sheet` | AI commentary on the active sheet (variance, trends, anomalies) |

---

## Three ways to start a command

| Style | Example |
|---|---|
| **Slash** | `/openform Income Statement` |
| **Natural** | `open form Income Statement` *(no slash needed)* |
| **Question** | `How do I open the Income Statement form?` *(teaching answer + chips)* |

---

## Drilling on the active grid

After opening a form or building an ad-hoc grid, you can modify it without rebuilding:

| Type this | What it does |
|---|---|
| `zoom in on Revenue` | Drill one level down |
| `zoom to bottom of Department` | Drill to leaves |
| `zoom out` | Collapse one level up |
| `keep only Marketing` | Filter rows to one member |
| `same but FY24` | Swap a POV value |
| `same but Budget` | Swap scenario |
| `add Subsidiary to rows` | Pivot another dim |

---

## Analysis

After opening a form / grid:

| Type this | What it does |
|---|---|
| `analyze this sheet` | Full analysis: Summary + Trends + Variance + Anomalies + Recommendations on a new sheet |
| `compare actual vs forecast revenue by month` | Side-by-side comparison with deltas |
| `top 5 variance drivers actual vs forecast` | Biggest movers |
| `what stands out in this data?` | Spot-the-anomaly read |
| `summarize this sheet for an executive` | One-paragraph TL;DR |

---

## Slash menu

Type `/` to see all categories:

| Command | What it does |
|---|---|
| `/openform` | Live form picker |
| `/runrule` | Live rule picker |
| `/show` | Browse metadata |
| `/set` | Set one variable |
| `/update` | Bulk variable editor |
| `/analyze` | AI commentary picker |

The palette also opens automatically as you type — for example, typing `show vari` immediately suggests "show variables":

![Chat input with 'show vari' typed and the palette suggesting 'show variables'](/images/slash-palette.png)

When you type `show dimensions` it drills directly into the live list of dimensions with the cubes each one belongs to:

![Slash palette showing all 14 dimensions with the cubes they belong to](/images/show-dimensions.png)

The form picker is grouped by module, so finding the form you need is fast:

![Form picker grouped by module — Balance Sheet section expanded with 4 forms](/images/excel-openform.png)

---

## Keyboard shortcuts (in the chat)

| Key | Action |
|---|---|
| `/` | Open slash menu |
| `?` | Open intent tree (alternative to slash) |
| `↑` `↓` | Navigate command list |
| `Enter` | Send / select |
| `Esc` | Close menu |
| `Ctrl+V` | Paste image (multimodal — useful for "what's this error?") |

---

## Tips

> [!TIP]
> **First form open of the day takes 2-3 s** (live REST). Subsequent opens are ~80 ms (local cache). Pre-cache them all in Settings if you want everything instant.

> [!TIP]
> **Click any chip below an answer.** Chips are one-click follow-ups, always pre-formed with names that exist in your tenant.

> [!TIP]
> **Ask a "how do I" question** to get a teaching answer. Saying `how do I copy data between scenarios` returns an explanation grounded in your real scenarios, plus chips to drill deeper.

> [!TIP]
> **Save the workbook** after the first setup. Settings get mirrored to a hidden sheet — saving makes that backup persist with the file.

---

## Getting unstuck

| Issue | Fix |
|---|---|
| "No active grid" | Open a form first (`open form X`) or build one (`revenue by month FY25`). |
| Settings got wiped | Wait 4 seconds; the watchdog auto-recovers from the hidden sheet. If not, reload them with Load everything. |
| Answer is generic / made-up | Re-ask with "in my tenant" or "in this NSPB" to force tenant-grounding. |
| Form name not found | Try the start of the name; the picker filters live as you type. |
| Anything else | Click **Report a bug** in the top-right. Reply usually within 24 h. |

---

## Reporting bugs from inside the add-in

The "Report a bug" tab sends a short report directly to us, with the model used, the last few chat turns, and anonymised tenant context attached automatically.

![Report a bug tab with type, summary, description, email, and attach-debug-log fields](/images/report-bug.png)

---

## Support

For everything: **gallobruno@gmail.com**
