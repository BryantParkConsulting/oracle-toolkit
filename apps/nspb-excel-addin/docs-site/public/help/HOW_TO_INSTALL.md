# How to Install NSPB MCP Assistant in Excel

A step-by-step guide explaining what the installer does, what files and registry keys it touches, and how to load the add-in inside Excel.

---

## Table of contents

1. [Requirements](#1-requirements)
2. [What's in the install package](#2-whats-in-the-install-package)
3. [What `Install NSPB.bat` actually does](#3-what-install-nspbbat-actually-does)
4. [Where things live on disk and in the registry](#4-where-things-live-on-disk-and-in-the-registry)
5. [Step-by-step install](#5-step-by-step-install)
6. [Loading the add-in in Excel](#6-loading-the-add-in-in-excel)
7. [Verifying the install](#7-verifying-the-install)
8. [Uninstalling](#8-uninstalling)
9. [Troubleshooting](#9-troubleshooting)

---

## 1. Requirements

| Item | Minimum |
|---|---|
| OS | Windows 10 / 11 |
| Excel | Microsoft 365, Office 2021, or Office 2019 — **desktop edition** (not Excel for the Web, not Excel for Mac) |
| Excel architecture | 32-bit or 64-bit (both work) |
| Local admin rights | ❌ NOT required — the installer writes only to your own user profile |
| Network | Outbound HTTPS to `*.workers.dev` (the hosted task pane) and to your NSPB tenant URL |
| Group Policy | The user's profile must allow **sideloaded / Developer Office Add-ins** (most enterprise SKUs allow this by default) |

> **Important:** No Node.js, no Python, no `npm`, no Office Developer Tools. The package is just 4 files.

---

## 2. What's in the install package

After unzipping `NSPB-MCP-Assistant-vX.Y.zip` you should see:

| File | Purpose |
|---|---|
| `Install NSPB.bat` | One-click installer — adds the manifest to Excel's developer add-in catalog |
| `Uninstall NSPB.bat` | Removes the add-in from Excel's catalog |
| `manifest.xml` | Office add-in manifest — points Excel at the hosted task-pane URL |
| `HOW_TO_INSTALL.md` | This document |
| `QUICKSTART_USER.md` | What to do once the add-in is loaded (settings, basic test) |

That's it. **No DLLs, no executables, no installers.** Total size: ~30 KB.

---

## 3. What `Install NSPB.bat` actually does

The installer is a plain text batch file (you can open it in Notepad to read it). When you run it, it:

1. **Sets variables** for the manifest path and the registry key location:
   ```bat
   set "MANIFEST=%~dp0manifest.xml"
   set "REGKEY=HKCU\Software\Microsoft\Office\16.0\Wef\Developer"
   ```
   `%~dp0` resolves to the folder where the .bat lives, so the manifest path is always relative to the file itself.

2. **Confirms the manifest exists** — fails fast with a clear message if `manifest.xml` is missing.

3. **Writes ONE registry value** under your own user profile:
   ```bat
   reg add "HKCU\Software\Microsoft\Office\16.0\Wef\Developer" ^
       /v "NSPB.Adhoc" ^
       /t REG_SZ ^
       /d "C:\path\to\manifest.xml" /f
   ```
   - `/v "NSPB.Adhoc"` — the value name. You can have many add-ins side by side, each with a different name.
   - `/t REG_SZ` — string type.
   - `/d` — the data: the absolute path to your `manifest.xml`.
   - `/f` — overwrite if it already exists (no prompt).

4. **Reads the key back** to verify the write succeeded.

5. **Logs everything** to `install.log` in the same folder as the .bat, so if anything fails you have a clean trace.

That's the entire installation. **No file copies, no service installs, no scheduled tasks, no system-wide changes.**

---

## 4. Where things live on disk and in the registry

### Disk

The installer **does NOT copy or create any files** other than `install.log` (a one-time text log next to the .bat). The manifest stays exactly where you extracted the ZIP — that's why you should extract to a stable path you won't move (e.g. `C:\NSPB-Addin\`, or under `Documents\`).

When Excel loads the add-in for the first time, **Excel itself** creates a small cache under your profile:
```
C:\Users\<you>\AppData\Local\Microsoft\Office\WebServiceCache\
```
This is managed by Excel — the installer doesn't touch it.

### Registry

Exactly one key/value pair, all under `HKEY_CURRENT_USER` (no admin needed):

```
Key:    HKCU\Software\Microsoft\Office\16.0\Wef\Developer
Value:  NSPB.Adhoc
Type:   REG_SZ (string)
Data:   C:\path\to\where\you\extracted\manifest.xml
```

The `\16.0\` is Office's internal version code — it's the same for Office 2016 / 2019 / 2021 / 365 (all use `16.0`).

To inspect manually:
```
regedit.exe → navigate to that path
```
or from a shell:
```bat
reg query "HKCU\Software\Microsoft\Office\16.0\Wef\Developer"
```

---

## 5. Step-by-step install

1. **Get the ZIP** from your IT admin or consultant.

2. **Extract** to a stable path like `C:\NSPB-Addin\`. Do **not** run the installer from inside the ZIP — Windows extracts to a temp folder that gets deleted, and Excel won't find the manifest later.

3. **Close Excel completely.** Check Task Manager → Details tab → kill any leftover `EXCEL.EXE` processes. (If Excel is open during install, it may not pick up the new add-in until next launch.)

4. **Run the installer:**
   - Double-click `Install NSPB.bat`, OR
   - Right-click → **Run** (no need for "Run as Administrator").

5. **Watch the console window.** You should see:
   ```
   The operation completed successfully.
   SUCCESS. The add-in is registered permanently.
   ```
   And a final hint:
   ```
   Close Excel completely, then reopen it. The add-in appears at
     Insert > My Add-ins > Developer Add-ins (or Shared Folder).
   ```

6. Press any key to close the console.

If you see an error, open the `install.log` file next to the .bat — it has a complete trace of what was attempted and what failed.

---

## 6. Loading the add-in in Excel

Excel discovers developer add-ins via the registry key the installer just wrote. You don't need to "install" anything inside Excel — only **load** it from the catalog.

### Path: Insert ribbon

1. Open Excel.
2. Click the **Insert** tab on the ribbon.
3. In the **Add-ins** group, click **My Add-ins** (some Excel versions: **Get Add-ins** → then a tab for your loaded ones).
4. In the dialog that appears, click the **DEVELOPER ADD-INS** tab (sometimes labelled **Shared Folder**, sometimes a small dropdown — depends on the Excel build).
5. Find **NSPB MCP Assistant** in the list.
6. Click **Add** (or double-click).

The task pane opens on the right side of the workbook.

> **If the DEVELOPER ADD-INS tab is missing**, your Office Trust Center is blocking sideloaded add-ins. See [§9 Troubleshooting](#9-troubleshooting).

### Path: Excel Options → Trust Center (alternate verification)

If you want to inspect the catalog manually:
1. **File** → **Options** → **Trust Center** → **Trust Center Settings** → **Trusted Add-in Catalogs**.
2. Office's Developer registry catalog is a **built-in trusted catalog** — you should see your manifest listed if everything is wired correctly.

### Path: Excel Options → Add-Ins → Manage

This dialog (**File → Options → Add-Ins**) shows COM and XLL add-ins, **not** Office Web Add-ins like this one. Don't look here — use the **Insert → My Add-ins** path instead.

---

## 7. Verifying the install

Three ways to confirm everything's wired up:

**A. Registry check (one command):**
```
reg query "HKCU\Software\Microsoft\Office\16.0\Wef\Developer" /v NSPB.Adhoc
```
Should print the manifest path.

**B. Visual check in Excel:**
The add-in should appear under **Insert → My Add-ins → Developer / Shared Folder**.

**C. Functional check:**
After loading the task pane, click the **⚙ Environment** tab → fill in NSPB credentials → click **Test connection** → green ✓.

---

## 8. Uninstalling

1. Close all Excel windows.
2. Right-click `Uninstall NSPB.bat` → **Run**.

This deletes the registry value:
```
HKCU\Software\Microsoft\Office\16.0\Wef\Developer\NSPB.Adhoc
```

To verify it's gone:
```
reg query "HKCU\Software\Microsoft\Office\16.0\Wef\Developer" /v NSPB.Adhoc
```
Should print: `ERROR: The system was unable to find the specified registry key or value.`

You can then delete the install folder. Excel's local web service cache (`AppData\Local\Microsoft\Office\WebServiceCache\`) cleans itself up over time and is harmless to leave.

---

## 9. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `ERROR: manifest.xml not found at...` during install | You moved the .bat without the .xml, or you ran it from inside the ZIP | Re-extract to a stable folder and run the installer there |
| `FAILED to write registry key` | Locked-down Group Policy on this account | Run `regedit` and try to manually create `HKCU\...\Wef\Developer` — if denied, IT must unlock it for your user |
| Installer runs OK but add-in not visible in Excel | Excel was open during install | Close ALL Excel processes (Task Manager) and reopen |
| **Developer Add-ins** tab missing in *Insert → My Add-ins* | Office Trust Center is blocking sideloaded add-ins | IT admin: enable "Trusted Catalogs" for sideload, OR distribute via Centralized Deployment in M365 admin |
| `This add-in could not be started` when you click the icon | Outbound HTTPS to `*.workers.dev` blocked by firewall/proxy | IT admin: whitelist `*.workers.dev` and your NSPB tenant URL |
| Task pane loads but shows blank or "Connection failed" | NSPB tenant URL or credentials wrong | Open ⚙ Environment, fix and click **Test connection** |
| Task pane shows old version | Excel is using a stale cache | Close Excel, run `del /q "%LOCALAPPDATA%\Microsoft\Office\WebServiceCache\*"`, reopen |

For deeper issues, run the chat command `debug last` and copy the log to your support contact.

---

## Appendix — What the .bat looks like (for the curious)

```bat
@echo off
setlocal
cd /d "%~dp0"
set "LOG=%~dp0install.log"
set "MANIFEST=%~dp0manifest.xml"
set "REGKEY=HKCU\Software\Microsoft\Office\16.0\Wef\Developer"

reg add "%REGKEY%" /v "NSPB.Adhoc" /t REG_SZ /d "%MANIFEST%" /f
reg query "%REGKEY%" /v "NSPB.Adhoc"
```

That's the entire install. Everything else in the .bat is logging and error handling.
