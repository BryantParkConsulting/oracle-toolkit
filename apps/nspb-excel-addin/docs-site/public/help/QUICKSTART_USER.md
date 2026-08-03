# NSPB Excel Add-in — Quick Start (End User)

A 5-minute guide. Install once, then run a basic test to confirm everything works.

---

## 1. Install the add-in

1. Get the install package (ZIP) from your IT admin or consultant.
2. Right-click the ZIP → **Extract All** → save to a stable location (e.g. `C:\NSPB-Addin\`). **Don't run from inside the ZIP.**
3. **Close all Excel windows** completely.
4. Right-click `Install NSPB.bat` → **Run**.
5. Wait for the green **SUCCESS** message in the console window.

> No admin rights needed — the installer writes only to your user profile.

## 2. Load the add-in in Excel

1. Open Excel.
2. Go to **Insert → My Add-ins**.
3. Click the **Shared Folder** tab (sometimes called **Developer Add-ins**).
4. Select **NSPB Ad-hoc** → **Add**.
5. The task pane opens on the right side of Excel.

## 3. First-time configuration

1. In the task pane, click the **⚙ Environment** tab at the top.
2. Fill in:
   - **NSPB URL**: `https://YOUR-TENANT.epm.YOUR-REGION.ocs.oraclecloud.com`
   - **Username**: your NSPB user
   - **Password**: your NSPB password
   - **Application**: usually `NetSuite`
3. *(Optional)* **AI API key** — paste your Gemini key (`AIza…`) **or** Claude key (`sk-ant-…`). The badge shows which one is detected.
4. Click **Test Connection** → wait for the green ✓.
5. Click **Load KB** → wait ~30 seconds while it pulls dimensions, forms, rules.
6. Switch back to the **Chat** tab. You're ready.

## 4. Smoke test — basic commands

Type these in the chat to verify everything works:

### a. Show inventory (read-only — should always work)
```
show me the rules
```
Expected: a list of business rules with descriptions.

### b. Open a form (writes a sheet)
```
/openform Income Statement
```
Replace **Income Statement** with any form name from your tenant.
Expected: a new sheet appears with the form's data grid + the chat shows the POV and attached rules.

### c. Run a rule (interactive)
```
/run CURRENCY
```
Replace **CURRENCY** with any rule name. If the rule needs runtime prompts, the chat opens an inline form with autocomplete from your KB.

### d. Update a substitution variable (instant, REST)
```
update variables
```
Expected: a list of all variables grouped by scope. Edit any value, click **Save** → green ✓ in 1 second.

### e. Ask a question
```
how does data management work
```
Expected: a cached FAQ answer (instant) or an AI explanation if no FAQ matches.

## 5. Common slash commands

| You type | What happens |
|---|---|
| `/show` | Menu of read-only queries |
| `/openform <Form>` | Open a form's data grid |
| `/run <Rule>` | Run a business rule with RTP prompts |
| `/adhoc <Form>` | Build a SmartView ad-hoc grid |
| `/admin` | Admin actions (vars, dim ops, jobs) |
| `/help` | Full help — concepts, troubleshooting, FAQs |
| `/clear` | Clear chat history (settings stay) |

## 6. Troubleshooting

| If you see… | Try this |
|---|---|
| "401 Unauthorized" | Re-check username/password in Environment. Re-test connection. |
| "Add-in could not be started" | Outbound HTTPS to `*.workers.dev` is blocked → ask IT to whitelist. |
| Add-in doesn't appear after install | Close ALL Excel processes (check Task Manager → `EXCEL.EXE`), reopen. |
| Form/rule/dim names autocomplete is empty | KB never loaded — go to ⚙ Environment → click **Load KB**. |
| Slash menu is empty | Type `/` in the chat input — the menu opens beside it. |

For deeper problems, type `/help` in the chat or contact your consultant.

---

*Need help installing? See `PACKAGING_GUIDE.md` (for IT admins / consultants who distribute the package).*
