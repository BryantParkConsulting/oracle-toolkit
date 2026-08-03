# NSPB Excel Add-in — Packaging & Distribution Guide

For the consultant / IT admin who **builds the install ZIP** and ships it to end users.

---

## 1. What the package does

The add-in is a **shared-folder Office Add-in**: Excel loads the task pane from a hosted URL (Cloudflare Worker). The local files are tiny — they only **register** the add-in in the user's HKCU registry.

Per-user install (no admin rights, no machine-wide changes).

## 2. Files to include in the ZIP

Pack these from `C:\apps\nspb-migrate-fresh\essbase MPC4 Excel\`:

| File | Required? | Purpose |
|---|---|---|
| `Install NSPB.bat` | ✅ Yes | Adds the manifest path to HKCU registry |
| `Uninstall NSPB.bat` | ✅ Yes | Removes the registry entry |
| `manifest.xml` | ✅ Yes | Office add-in manifest (points to the hosted URL) |
| `QUICKSTART_USER.md` | ✅ Yes | End-user guide (install + smoke test) |
| `Start NSPB.bat` | ❌ Optional | Dev-only — launches Excel in sideload mode (`npx office-addin-debugging`). Do NOT ship to non-dev users. |

**Do NOT include**: `worker/` folder, `src/` folder, `node_modules/`, `.git/`, any `.epw` files, any `package*.json`, any `.log`. Only the 4 files above.

## 3. How to make the ZIP

### Option A — Windows Explorer (manual)

1. Create a folder: `NSPB-Addin-v1.0\`
2. Copy in: `Install NSPB.bat`, `Uninstall NSPB.bat`, `manifest.xml`, `QUICKSTART_USER.md`.
3. Right-click the folder → **Send to → Compressed (zipped) folder**.
4. Rename: `NSPB-Addin-v1.0.zip`.

### Option B — PowerShell (scriptable)

```powershell
$src = "C:\apps\nspb-migrate-fresh\essbase MPC4 Excel"
$out = "C:\Releases\NSPB-Addin-v1.0.zip"
$tmp = "$env:TEMP\NSPB-Addin-v1.0"

if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
New-Item -ItemType Directory -Path $tmp | Out-Null

Copy-Item "$src\Install NSPB.bat"       $tmp
Copy-Item "$src\Uninstall NSPB.bat"     $tmp
Copy-Item "$src\manifest.xml"           $tmp
Copy-Item "$src\QUICKSTART_USER.md"     $tmp

if (Test-Path $out) { Remove-Item $out -Force }
Compress-Archive -Path "$tmp\*" -DestinationPath $out
Write-Host "Built: $out"
```

## 4. Verify the manifest URL is current

Before zipping, open `manifest.xml` and confirm the `<SourceLocation>` points to the **production** worker URL:

```xml
<SourceLocation DefaultValue="https://gentle-moon-046f.nspbassistant.workers.dev/taskpane.html"/>
```

If you've redeployed to a different domain (custom domain, dev preview, etc.), update this value before packaging.

## 5. Permissions the user needs

| Permission | Why | Default? |
|---|---|---|
| Read access on the install folder | To run the .bat | ✅ Always |
| Write access to `HKCU\Software\Microsoft\Office\16.0\Wef\Developer` | Registers the add-in (per-user) | ✅ Default for Windows users |
| Outbound HTTPS to `*.workers.dev` (and `*.oraclecloud.com` for the user's tenant) | Loads the task pane + calls NSPB | ⚠ Check corporate firewall/proxy |
| Office "Trust Center" allows sideloaded add-ins | Required to load Developer add-ins | ⚠ Check Group Policy |

### Group Policy gotchas

If users are on a managed device, IT may have set:

```
User Configuration > Administrative Templates > Microsoft Office 2016 > Trust Center >
  Trusted Catalogs > Block all unmanaged add-ins = Enabled
```

If that's the case, **the install will succeed but Excel will silently refuse to load the add-in**. Two ways to fix:

1. **Whitelist the manifest path** in Trusted Catalogs (preferred).
2. **Disable the policy** for the user/device.

Either requires the IT admin (Group Policy editor or Intune profile).

## 6. Distribution

### Small audience (1–10 users)
- Email the ZIP, or share via Drive / SharePoint / Slack.
- Include a link to `QUICKSTART_USER.md` if you don't want to ship it inside the ZIP.

### Medium-large audience (10–500 users)
- Host the ZIP on an internal share or download portal.
- Send users a short email with: download link → 5-step install (paraphrase from QUICKSTART) → contact for support.

### Enterprise (auto-deploy)
- Convert to a **Centralized Deployment** add-in via Microsoft 365 Admin Center: upload `manifest.xml` once, assign to users — no `.bat` needed. (Requires Microsoft 365 admin role and a tenant where Centralized Deployment is allowed.)
- Or push the registry key via Group Policy / Intune to skip the manual install step.

## 7. Versioning

Bump versions when you change the **manifest** itself (icons, ID, permissions) — not when you only deploy new worker code (worker URL stays the same, no user re-install needed).

When you DO bump:
1. Edit `manifest.xml` `<Version>` element (e.g. `1.0.0.0` → `1.0.1.0`).
2. Rebuild ZIP as `NSPB-Addin-v1.0.1.zip`.
3. Users re-run `Install NSPB.bat` (overwrites the registry entry — same `NSPB.Adhoc` key name).
4. Excel auto-picks up the new manifest on next launch.

## 8. Uninstalling cleanly

Users run `Uninstall NSPB.bat`. It removes the registry entry under:
```
HKCU\Software\Microsoft\Office\16.0\Wef\Developer\NSPB.Adhoc
```

To verify:
```
reg query "HKCU\Software\Microsoft\Office\16.0\Wef\Developer" /v NSPB.Adhoc
```
Should return `ERROR: The system was unable to find the specified registry key or value.`

## 9. Things that DON'T require re-shipping the ZIP

You can keep deploying new backend versions to the same worker URL forever. The user never needs to update the ZIP for:

- New slash commands
- New REST endpoints  
- Bug fixes
- AI provider changes
- KB updates

What DOES require re-ship: anything in `manifest.xml` (icons, capabilities, hosted URL change).

## 10. Common distribution mistakes

| Mistake | Symptom | Fix |
|---|---|---|
| Shipped `Start NSPB.bat` to non-devs | "npx not recognized" or hangs | Remove from ZIP — it's dev-only |
| Forgot to update manifest URL after redeploy | Add-in shows old version / errors | Edit `<SourceLocation>` and rezip |
| Included `node_modules/` | ZIP is 200+ MB | Use the file list in §2, not the whole folder |
| Mixed slashes in `manifest.xml` paths | Some Excel versions reject | Stick to forward slashes in URLs |
| Forgot to close Excel before installing | Add-in not visible | Tell users in big bold letters: **CLOSE EXCEL FIRST** |

---

## TL;DR Cheat Sheet

```
ZIP = 4 files: Install.bat + Uninstall.bat + manifest.xml + QUICKSTART_USER.md
URL in manifest = current worker URL
Permissions = HKCU only (no admin) + outbound HTTPS to workers.dev
Re-ship when = manifest changes (rare). NOT for backend updates.
```
