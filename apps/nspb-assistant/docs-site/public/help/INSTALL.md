# Install

For IT teams. End users do not need to install — IT runs this once per machine, then users just open Excel.

> [!IMPORTANT]
> This add-in runs on **Windows + Microsoft 365 Excel** only. macOS and Excel 2019 or older are not supported.

---

## 1 · Download

<a href="/downloads/nspb-mcp-installer-v0.121.zip" download style="display:inline-block;background:#2563eb;color:white;padding:14px 24px;border-radius:8px;font-weight:600;text-decoration:none;margin:8px 0;box-shadow:0 4px 12px rgba(37,99,235,0.25);">📦 Download installer v0.121 (zip · 24 KB)</a>

Released 2026-05-07. Contains the manifest, install / uninstall scripts, and the help bundle.

---

## 2 · System requirements

| Component | Minimum | Recommended |
|---|---|---|
| OS | Windows 10 (1903+) | Windows 11 |
| Excel | Microsoft 365 (current channel) | Microsoft 365 (current channel) |
| WebView2 runtime | required | latest |
| RAM | 4 GB | 8 GB |
| Disk | 200 MB free | 500 MB free |

---

## 3 · Network access

The add-in needs HTTPS 443 access to:

| Domain | Purpose |
|---|---|
| `*.workers.dev` | NSPB MCP edge worker (chat / AI / NSPB proxy) |
| `*.epm.*.oraclecloud.com` | Your Oracle NSPB tenant |
| `appsforoffice.microsoft.com` | Office.js library |
| `res.cdn.office.net` | Office add-in runtime |

The user does **not** need direct access to Google or Anthropic — all AI calls flow through the NSPB MCP worker.

---

## 4 · Install (per machine)

### Step 1 — Extract the ZIP

Drop the contents into a stable folder you control. The recommended path is:

```
C:\NSPB_MCP\installer\
```

The folder should contain `Install NSPB.bat`, `Uninstall NSPB.bat`, `Start NSPB.bat`, `manifest.xml` and the `help\` subfolder.

### Step 2 — Run the installer

Right-click `Install NSPB.bat` → **Run as administrator**. A Command Prompt window opens, writes a registry entry pointing Excel at the manifest, and prints a success log:

![Command Prompt running Install NSPB.bat — success log with registry verification](/images/installation.png)

When you see **"SUCCESS. The add-in is registered permanently."** you can press any key to close.

### Step 3 — Open the add-ins picker in Excel

Open Excel. In the ribbon click **Add-ins** (or **Insert → My Add-ins** depending on your Excel version). At the bottom of the popup, click **Advanced…**:

![Excel Add-ins popup — Advanced link at the bottom (circled in red)](/images/installation2.png)

### Step 4 — Add NSPB MCP Assistant

The Office Add-ins dialog opens with a **SHARED FOLDER** section showing **NSPB MCP Assistant**. Select it and click **Add**:

![Office Add-ins dialog with NSPB MCP Assistant selected and the Add button highlighted](/images/innstalation3.png)

### Step 5 — Done

The "NSPB" / "Open NSPB pane" button now lives in the **Home** ribbon. Click it any time to open the assistant.

---

## 5 · Centralized deployment (optional)

For 50+ users, push the manifest from the Microsoft 365 Admin Center instead of per-machine sideload:

1. M365 Admin → **Settings → Integrated apps → Upload custom apps → Office add-in**.
2. Upload `manifest.xml` from the ZIP.
3. Assign audience → users see it within 24 h.

---

## Updating the add-in

The add-in **updates itself**. Every NSPB MCP improvement reaches all users automatically through the Cloudflare edge — no install, no notification, no IT involvement.

The only file IT or NSPB MCP refreshes is the per-tenant `tenant-kb.json` (separate page → "Set up the chat").

---

## Uninstall

Run `Uninstall NSPB.bat` (or remove the manifest from the M365 admin center). User credentials stored on their own machine are not touched — they need to clear those manually via Excel → Add-ins → Settings → Clear all.

---

## Support

For installation help: **gallobruno@gmail.com**
