# Install the NSPB AI Assistant in Excel

This folder contains the Windows installer for the Excel Office add-in. The installed add-in
loads its interface from the hosted Cloudflare Worker referenced by `manifest.xml`; end users do
not need Node.js, npm, or a local web server.

## Requirements

- Windows 10 or 11.
- Desktop Microsoft Excel with Office web add-in support.
- Internet access to `https://gentle-moon-046f.nspbassistant.workers.dev`.
- Permission to register a developer add-in for the current Windows user. Corporate Office
  policies may block sideloading; in that case an administrator must allow or centrally deploy
  the manifest.

## Install

1. Keep all files in this folder together, especially `manifest.xml` and the `.bat` files.
2. Close every Excel window.
3. Double-click **Install NSPB.bat**. The script registers `manifest.xml` for the current Windows
   user and writes `install.log` beside the installer.
4. Reopen Excel. You can use **Start NSPB.bat** or open Excel normally.
5. Open any workbook.
6. Go to **Insert > My Add-ins > Developer Add-ins**. Some Office versions show the catalog as
   **Shared Folder**.
7. Select **NSPB MCP Assistant**. A button named **NSPB** should also appear on the Home ribbon.

The installer does not require administrator elevation because it writes under `HKCU` for the
current user.

## Configure a tenant

Open the add-in task pane and go to **Settings**:

1. Enter the NSPB base URL, application and user credentials required by your environment.
2. Enter a supported AI API key.
3. Choose **Import Tenant KB** and select the client's local `tenant-kb.json`.
4. Use the Status tab to verify the connection before running a query or rule.

The `tenant-kb.json` is created from an artifact-only LCM export. From the repository root:

```powershell
$env:CLIENT = "example"
$env:LCM_ROOT = "C:\secure\example\lcm-extracted"
$env:GEMINI_API_KEY = "your-key"
node packages\lcm\parse-lcm.js
```

The generated file is `clients\example\tenant-kb.json`. Both the source LCM and generated KB
contain confidential tenant metadata. Keep them local and outside Git. Do not include Essbase
Data in the LCM used for this workflow.

## Update a tenant KB

1. Export a fresh artifact-only LCM with **Essbase Data** unselected.
2. Run the parser again with the same `CLIENT` value.
3. In Excel, open **Settings > Import Tenant KB** and select the new JSON.

No reinstall is required for a KB refresh.

## Uninstall

Run **Uninstall NSPB.bat**. It closes Excel, removes the current user's add-in registration and
clears the Office Wef cache. Clearing that cache affects other sideloaded Office add-ins too, so
save work and confirm that this is acceptable before running it.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| The add-in is not listed | Close all Office apps, run the installer again, and inspect `install.log`. |
| No Developer Add-ins tab | Look under Shared Folder; corporate policy may disable sideloading. |
| The task pane is blank | Confirm the Worker URL is reachable and not blocked by a proxy or firewall. |
| The chat lacks tenant context | Import the correct `tenant-kb.json` again in Settings. |
| Authentication fails | Re-enter the tenant URL and credentials; do not paste credentials into logs or support messages. |

For detailed Office catalog diagnostics, see
[`../add-in/help/HOW_TO_INSTALL.md`](../add-in/help/HOW_TO_INSTALL.md). User instructions are in
[`../add-in/help/USAGE_GUIDE.md`](../add-in/help/USAGE_GUIDE.md).

## Developer build and deployment

End users should not deploy the Worker. Maintainers can build it from the repository checkout:

```powershell
cd apps\nspb-excel-addin\worker
npm install
npm run check
npm run build
```

Deployment requires access to the configured Cloudflare account and should only be performed by
an authorized maintainer:

```powershell
npx wrangler login
npm run deploy
```
