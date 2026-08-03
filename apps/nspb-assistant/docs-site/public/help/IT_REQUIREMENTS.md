# IT Requirements & Mini Help

This page is for IT teams responsible for deploying the **NSPB MCP Assistant** add-in to end users. It covers the system requirements, network access needed, and the steps for a clean rollout.

---

## System requirements

### Workstation

| Component | Minimum | Recommended |
|---|---|---|
| **OS** | Windows 10 (1903+) / macOS 11 | Windows 11 / macOS 13+ |
| **Excel** | Microsoft 365 (Excel 2019+) | Microsoft 365 (current channel) |
| **Browser engine in Excel** | WebView2 / Edge runtime | latest WebView2 |
| **RAM** | 4 GB | 8 GB+ |
| **Disk** | 200 MB free | 500 MB free |

> [!IMPORTANT]
> Excel 2016 and older are **not** supported — they don't include WebView2. The add-in will silently fail to load on those versions.

### Microsoft 365 license requirements

- **Excel for Windows / Mac / Web** — any commercial M365 SKU (Business Basic, Business Standard, E1, E3, E5).
- **Office Add-ins must be allowed** — some tenants disable sideloaded add-ins via Group Policy. Verify with the M365 admin.

---

## Network access

The add-in talks to **two** external services from the user's machine:

| Destination | Purpose | Protocol |
|---|---|---|
| `gentle-moon-046f.nspbassistant.workers.dev` | NSPB MCP edge worker (chat / AI / NSPB proxy) | HTTPS 443 |
| `*.epm.*.oraclecloud.com` (your tenant) | Oracle NSPB REST + SmartView | HTTPS 443 |
| `generativelanguage.googleapis.com` *(only if user has a personal Gemini key)* | Google Gemini API direct | HTTPS 443 |

> [!NOTE]
> The default flow routes Gemini calls **through** the NSPB MCP worker (single egress IP). If you have an outbound proxy, allow only the worker URL — the user does not need direct access to Google.

### Required allowlist (if your firewall blocks unknown domains)

```
*.workers.dev                 (Edge worker)
*.epm.*.oraclecloud.com       (your NSPB tenant)
appsforoffice.microsoft.com   (Office.js library)
res.cdn.office.net            (Office add-in runtime)
```

---

## Deployment options

There are **three ways** to deploy the add-in across your organization. Pick one:

### Option 1 — Sideload manually (per user)

The simplest. Each user installs once on their machine.

1. Download the installer ZIP from the **Downloads** section in this site.
2. Extract anywhere (e.g. `C:\NSPB_MCP\installer\`).
3. Right-click `Install NSPB.bat` → **Run as administrator**.
4. Open Excel → **Insert** ribbon → **My Add-ins** → **Shared Folder** tab → select **NSPB MCP Assistant**.

> [!TIP]
> First-time users: after install, Excel needs a one-time restart. The add-in then appears in the **Home** ribbon as a "NSPB" button.

### Option 2 — M365 admin centralized deployment

For tenants with 50+ users — push the manifest from the M365 Admin Center.

1. Open `manifest.xml` (in the installer ZIP) and verify the `<SourceLocation>` URL is reachable from your network.
2. Microsoft 365 Admin Center → **Settings** → **Integrated apps** → **Upload custom apps** → **Office add-in** → upload `manifest.xml`.
3. Choose audience (specific groups / entire org) → assign.
4. Users will see the add-in automatically next time they open Excel (typically within 24 h).

### Option 3 — Microsoft AppSource *(coming soon)*

Once we publish to AppSource, users can install directly from the Excel **Insert → Get Add-ins** dialog. No IT involvement needed.

---

## End-user one-time setup

After install, each user does this **once**:

1. Open Excel → click the **NSPB** button in the ribbon.
2. Click **Settings** (top right of the task pane).
3. Fill in:
   - **Host** → your NSPB URL (e.g. `https://nspb-acme.epm.us-1.oraclecloud.com`)
   - **Username** → their NSPB user (email)
   - **Password** → their NSPB password
   - **Application name** → typically `NetSuite` or your app's name
   - **AI API key** → either the self-managed key (we provide) or their own Gemini / Claude key
4. Pick the **`tenant-kb.json`** file that NSPB MCP emailed you for this tenant.
5. Click **⚡ Load everything** → wait 1-3 minutes.
6. When the chat shows the recap, the add-in is ready.

> [!IMPORTANT]
> **Settings persist locally on the user's machine** in 4 storage tiers (OfficeRuntime, localStorage, IndexedDB, hidden Excel sheet). Nothing is sent to us servers except the live API request payload (per query), which is not retained.

---

## Data & privacy

| What's stored where | Location | Retention |
|---|---|---|
| User credentials (host, username, password, API key) | User's local Excel storage | Until user clears them |
| Tenant KB (forms, rules, vars, dims) | User's local Excel storage | Until refreshed |
| Form cache (data slices) | User's local IndexedDB | Persistent — manual refresh |
| Chat history | User's local Excel storage | Last 5 days |
| **Edge worker** | Cloudflare (stateless) | **Nothing persisted** |
| AI requests (prompt + response) | Google Gemini (or Anthropic Claude) | Per Google/Anthropic policy |

The NSPB MCP edge worker is **stateless** — it processes each request and stores nothing. No logs of user data on NSPB MCP infrastructure.

---

## Troubleshooting (mini help)

### "Add-in won't load"
- Check Excel version (must be M365 / 2019+).
- Verify network access to `*.workers.dev`.
- Try **Insert → My Add-ins → ⚙ → Refresh**.

### "Settings keep getting wiped"
- Office's WebView2 cache occasionally resets. The add-in mirrors settings to a **hidden sheet in the workbook** — re-opening the same `.xlsx` recovers them automatically (within 4 seconds).
- If completely wiped, click **Settings → Load everything** with the original `tenant-kb.json` to restore.

### "AI requests are slow (15+ seconds)"
- Implementation questions ("how do I X in my tenant") use the reasoning model (Gemini 2.5 Pro) → 12-15s expected.
- Concept questions ("what is X") use Flash → 5s expected.
- If both are consistently > 30s, check network latency to `workers.dev`.

### "Form open is slow"
- First open: 2-3 seconds (live REST call to NSPB).
- Subsequent opens: ~80 ms (served from local cache).
- If always slow, click **Settings → ⚡ Pre-cache forms now** to warm all forms once.

### "Chat says 'NSPB credentials required'"
- Check **Settings** → password field is filled in (Office sometimes wipes only the password).
- Re-enter and click Save / Load everything.

### "I get NSPB 401 / 403 errors"
- User's NSPB password expired or got rotated. Re-enter password in Settings.

### "I get NSPB 404 errors on a form"
- The form was renamed or deleted in NSPB. Have NSPB MCP re-export the `tenant-kb.json` and re-import.

---

## Support escalation

For issues IT cannot resolve, the user can:

1. Open the add-in → **Report a bug** tab.
2. Type a short description of the issue.
3. Submit. The report includes: model used, last 5 chat turns, anonymised tenant context, and trace data — sent to us.

NSPB MCP responds within:
- **48 h** for Base tier
- **24 h** for Team tier
- **4 h** for Enterprise tier (contracted SLA)

---

## Updating the add-in

The add-in **updates automatically**. Every NSPB MCP improvement (new tools, KB additions, bug fixes) ships through the Cloudflare edge — your users get the new version on their next chat turn, with **zero install steps**.

The only file that needs manual refresh is `tenant-kb.json` — and only when:
- A new form / rule / variable was added in NSPB.
- NSPB MCP sends a new file by email.
- The user re-imports it via **Settings → Load everything**.

---

## Contact

| What you need | Who to email |
|---|---|
| Add-in installation help | `gallobruno@gmail.com` |
| Tenant KB refresh request | `gallobruno@gmail.com` |
| Pricing & licensing | `gallobruno@gmail.com` |
| Security / DPA / compliance | `gallobruno@gmail.com` |
