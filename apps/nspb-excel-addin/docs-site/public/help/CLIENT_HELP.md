# Quick Help for Users

Welcome to **NSPB MCP Assistant** — your AI copilot for Oracle NSPB inside Excel. This page covers the 90 % of things you'll do day to day. For deeper docs see the **Usage Guide** in the sidebar.

---

## What can I do with it?

| Action | Type this in chat |
|---|---|
| **Open a form** | `open form OpEx by Department` *(forms grouped by module — type the start of any name)* |
| **Run a business rule** | `run rule NFS_All Accts Forecast Data Refresh` |
| **Set a substitution variable** | `set variable NSP_PER_RptCurrMo = TP4` |
| **Update many variables at once** | `update variables` *(opens a live picker)* |
| **Show all forms / rules / variables** | `show me the forms` · `show me the rules` · `show me the variables` |
| **Show cubes & dimensions** | `show me the cubes` · `show dimensions` |
| **Analyze a sheet** | `analyze this sheet` *(after opening a form)* |
| **Compare scenarios** | `compare actual vs forecast revenue by month` |
| **Find top variance drivers** | `top 5 variance drivers actual vs forecast` |
| **Drill / pivot / filter the active grid** | `zoom in on Marketing` · `keep only Sales` · `same but FY24` |
| **Build an ad-hoc query** | `revenue by month FY25 forecast` |
| **Recent jobs / integrations** | `show recent jobs` · `show integrations` |
| **List inbox / outbox files** | `list files` |
| **Ask any NSPB question** | `How do I copy data between scenarios?` · `What is a smart push?` |

---

## The slash menu

Type `/` to see all categories. Pick one and the chat fills the command for you.

| Command | What it does |
|---|---|
| `/openform` | Live form picker (grouped by module) |
| `/runrule` | Live rule picker |
| `/show` | List / browse metadata |
| `/set` | Set one substitution variable |
| `/update` | Bulk variable editor |
| `/analyze` | AI commentary on the active sheet |
| `/help` | This help |

---

## Three ways to ask the same thing

The chat is forgiving. All of these work:

- **Slash command** — `/openform Income Statement`
- **Natural language** — `open form Income Statement` *(no slash needed)*
- **Question** — `How do I open the Income Statement form?` *(triggers a teaching answer + chips)*

---

## Tips that save time

> [!TIP]
> **Click any chip below an answer** — chips are one-click follow-ups. They're always pre-formed with names that exist in your tenant.

> [!TIP]
> **The first form open of the day takes 2–3 s** (live fetch). After that, every re-open is ~80 ms because we cache the form locally. Click **Settings → Pre-cache forms now** to warm all of them once.

> [!TIP]
> **Try-it chips on the rotating tip bar** — at the bottom of the chat there's a rotating tip with a `Try it →` button. Clicking it shows you a teaching answer with example chips. Great for learning new commands.

> [!TIP]
> **Paste images** — Ctrl+V a screenshot into the input. Useful for asking "what does this error mean?"

> [!TIP]
> **The active sheet matters** — when you say `analyze this sheet`, the add-in reads what's on screen *now* in Excel. Open the form, then ask. If you switch to a different sheet, the next question uses that one.

---

## Common things that confuse new users

### "It opened a form but the data is not refreshed"
Right-click the sheet in Excel → **Refresh** (the SmartView refresh). The add-in writes the form *structure* — SmartView pulls the *data* from NSPB via the active connection.

### "The chat says 'NSPB credentials required'"
You haven't filled in **Settings** → Host / Username / Password yet. Or the password got cleared by Excel on a refresh. Re-enter and click Save.

### "The chat says 'no active grid' when I try zoom in / keep only"
You need an open form or grid first. Try `open form X` or build something with `revenue by month FY25`, then drill on it.

### "I asked a 'how do I' question and it took 12 seconds"
That's normal — implementation questions route to the reasoning model (Gemini 2.5 Pro) for higher precision and to use real names from *your* tenant. Concept questions ("what is X") use the fast model and reply in ~5 s.

### "Settings disappeared"
Excel sometimes invalidates the WebView2 cache. The add-in auto-recovers from a hidden sheet in your `.xlsx` — within 4 seconds your settings reappear. **Save the workbook** after configuring settings the first time so the hidden sheet persists with the file.

---

## Keyboard shortcuts inside the chat

| Key | Action |
|---|---|
| `/` | Open slash command menu |
| `?` | Open intent tree (alternative to slash) |
| `↑` `↓` | Navigate command list |
| `Enter` | Send message / select command |
| `Esc` | Close the menu |
| `Ctrl+V` | Paste image (multimodal) |

---

## When something doesn't work

1. **Try the same question phrased differently.** "Open OpEx" vs "open form OpEx by Department" sometimes routes differently.
2. **Click `Report a bug`** in the top right of the task pane. Type a short description. We see it within hours.
3. **Force-refresh the panel** — close the task pane (X) and re-open from the ribbon button.
4. **As a last resort** — close Excel completely and reopen.

---

## What's new

The add-in updates automatically. New features ship continuously through the Cloudflare edge. There's nothing to install.

You can see the version number in the top of the task pane (e.g. `NSPB MCP v0.120`). When the number changes, you got an update on your next chat turn.

---

## Need more depth?

- **Usage Guide** *(in the sidebar)* — full feature reference
- **Usage Cheatsheet** — printable one-page summary
- **Quickstart Guide** — first-time setup walkthrough

Or just **ask the chat**: `What can this add-in do?` — it'll tell you, with chips for the most common things.
