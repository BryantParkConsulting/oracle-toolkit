# NSPB Excel Add-in — Install & User Guide

A short, two-part guide:

1. **For IT Admin** — install the add-in on a Windows workstation
2. **For End User** — first run, settings, and how to use the chat

---

## Part 1 — IT Admin: Install on a User's Computer

### What this add-in does

It registers a **shared folder add-in** in Excel's add-in catalog (per-user, no machine-wide changes).
Excel loads the task pane from a hosted URL — nothing executes locally.

### Files in the install package

| File | Purpose |
|---|---|
| `Install NSPB.bat` | Registers the manifest under `HKCU\...\Wef\Developer` |
| `Uninstall NSPB.bat` | Removes that registry entry |
| `Start NSPB.bat` | Optional — launches Excel with the add-in pre-loaded (dev mode) |
| `manifest.xml` | Office add-in manifest — points to the hosted task-pane URL |
| `INSTALL_AND_USER_GUIDE.md` | This document |

### Prerequisites

- Windows 10 / 11
- Microsoft Excel **2019, 2021, or Microsoft 365** (desktop, not Web/Online)
- The user's Office license must allow third-party add-ins (most enterprise SKUs do)

### Permissions needed

The installer writes **only** to `HKEY_CURRENT_USER`, so it does **not** require admin rights on the machine.

It needs:

- **Read access** on the install folder (for the user to see the `.bat` and `manifest.xml`)
- **Write access to `HKCU\Software\Microsoft\Office\16.0\Wef\Developer`** (a normal user has this by default)
- Outbound HTTPS to `*.workers.dev` (the Cloudflare-hosted backend) — open this on the corporate firewall/proxy if traffic is filtered

If your organization **blocks Office "Developer" / sideloaded add-ins** via Group Policy:
`User Configuration > Administrative Templates > Microsoft Office 2016 > Trust Center > Trusted Catalogs`
must allow at least one trusted location, or the policy
`Block all unmanaged add-ins` must be set to **Disabled**.

### Install steps

1. Copy the entire folder to the user's machine (e.g. `C:\NSPB-Addin\`).
2. **Close all open Excel windows.**
3. Right-click `Install NSPB.bat` → **Run** (no admin needed).
4. Wait for the "SUCCESS" message in the console window. A log is saved to `install.log` next to the .bat.
5. Open Excel.
6. Go to **Insert → My Add-ins → Shared Folder** (or **Developer Add-ins**) → select **NSPB Ad-hoc** → **Add**.
7. The task pane opens on the right.

### Verify install

Run from a normal command prompt:
```
reg query "HKCU\Software\Microsoft\Office\16.0\Wef\Developer" /v NSPB.Adhoc
```
You should see the path to `manifest.xml`.

### Uninstall

Run `Uninstall NSPB.bat`. Restart Excel.

### Common install issues

| Symptom | Fix |
|---|---|
| "ERROR: manifest.xml not found" | Don't separate the `.bat` from `manifest.xml` — keep them in the same folder. |
| Add-in doesn't appear in Excel | Close ALL Excel windows (check Task Manager for `EXCEL.EXE`), then reopen. |
| "This add-in could not be started" | Outbound HTTPS to `*.workers.dev` is blocked — whitelist it. |
| Group Policy blocks sideload | IT must enable Trusted Add-in Catalogs, see "Permissions needed" above. |

---

## Part 2 — End User: Getting Started

### First-time setup

1. Open Excel. The **NSPB** task pane appears on the right (if not, **Insert → My Add-ins → NSPB Ad-hoc**).
2. Click the **⚙ Environment** tab at the top of the pane.
3. Fill in:
   - **NSPB URL** — your tenant URL (e.g. `https://epm12345-myorg.epm.us-phoenix-1.ocs.oraclecloud.com`)
   - **Username** — your NSPB user (usually email-style)
   - **Password** — your NSPB password
   - **Application** — usually `NetSuite`
4. Click **Test Connection** — should show ✓ green.
5. Click **Load KB** — pulls the dimension/form/rule catalog (~30 sec). This powers all autocompletes.
6. Switch to the **Chat** tab. You're ready.

> **Privacy note**: settings are stored in your Office app on this device. Nothing is sent to a third party other than your NSPB tenant and the chat backend.

### How to use the chat

Type a question or use a slash command. Click `/` in the input to see the menu.

### Most useful commands

| Command | What it does |
|---|---|
| `/show` | List / find / count NSPB metadata (dims, forms, rules, jobs, vars) |
| `/openform <FormName>` | Open a Planning form — shows POV, attached rules, and the data slice as an inline grid |
| `/run <RuleName>` | Run a business rule. Auto-prompts for runtime parameters (RTPs) with member autocompletes |
| `/adhoc <Form>` | Build a SmartView ad-hoc grid in the active sheet |
| `/analyze` | Pre-built analytics + ask anything in plain English (NL → SQL on the active sheet) |
| `/format` | Clean up / format the active sheet |
| `/admin` | Admin actions: jobs, dim export, alias rename, set substitution variables |
| `/set variable <name> = <value>` | Update a substitution variable instantly (no EPM Automate needed) |
| `/help` | FAQ — how NSPB works, concepts, troubleshooting |
| `/clear` | Clear chat (keeps settings + KB) |

### Examples

```
/show me all rules
show me the Account hierarchy
/openform Income Statement
/run CURRENCY
/run BR_AllocateExpenses
set variable CurrentMonth = Jan
set variable CurrentYear = FY26 in NetSuite
how do I add a new entity in NSPB?
analyze the active sheet — find missing forecast values
```

### Tips

- **Cancel** button (top right of chat) stops a long-running rule, form open, or analysis.
- The **🗑 Clear chat** button only clears history — settings and KB stay.
- Reload KB whenever someone adds new dims, forms, or rules in NSPB (KB is cached for ~24h).
- Form/rule names are **case-insensitive**, partial matches work too.
- For autocompletes inside RTP forms (e.g. picking a Period or Entity), start typing — the cached KB feeds suggestions in real time.

### Need help?

- Type `/help` in the chat for the FAQ.
- Type `ask <your question>` for any NSPB concept question.
- Open the **❓ Help** tab in the pane for the full topic list.

---

*Document version 1.0 — keep this file alongside the install package.*
