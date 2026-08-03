# Set up the chat

For end users. Once IT has installed the add-in, you do this **once** per workstation. Takes 2-3 minutes.

---

## What NSPB MCP gives you

By email, you'll receive:

| File | What it is |
|---|---|
| `tenant-kb.json` | Your NSPB tenant's metadata — all forms, rules, variables, dimensions, navigation flows. Pre-loaded by us from your LCM export. |
| Your AI API key (optional) | If you bought the self-managed key. Otherwise use your own Gemini / Claude key. |

> [!IMPORTANT]
> The `tenant-kb.json` is unique to your NSPB environment. Don't share it across tenants. It's not a credential, but it contains your tenant's structure.

---

## Step 1 · Open the add-in

In Excel → **Home** ribbon → click the **NSPB** button. The task pane opens on the right.

> [!TIP]
> First time only: Excel may prompt to allow the add-in. Click **Trust this add-in**.

---

## Step 2 · Open Settings

Top-right of the task pane → click **Settings**. A modal opens with empty fields.

---

## Step 3 · Fill the credentials

| Field | What to enter |
|---|---|
| **Host** | Your NSPB URL — e.g. `https://nspb-acme.epm.us-1.oraclecloud.com` |
| **Username** | Your NSPB user (usually your email) |
| **Password** | Your NSPB password |
| **Application** | Usually `NetSuite` or your app's name |
| **AI API key** | The key NSPB MCP sent you, OR your own Gemini key (starts with `AIza...`) or Claude key (starts with `sk-ant-...`) |

---

## Step 4 · Pick the tenant-kb.json

Scroll down in Settings to the **Tenant data** section. Click **Choose File** and select the `tenant-kb.json` file NSPB MCP emailed you.

---

## Step 5 · Click "Load everything"

The fields you need to fill (host, username, password, AI key) and the buttons you need to click (Choose File, Load everything) are all on the same screen:

![Settings panel with Host, Username, Password, AI key, Choose File and Load everything circled in red](/images/loadtenant.png)

This single button does the entire setup:

1. Saves your settings (with 4-tier durable storage so they don't get wiped).
2. Imports the `tenant-kb.json` you selected.
3. Tests the connection to NSPB.
4. Discovers everything live: cubes, dimensions, rules, forms, variables, jobs, integrations.
5. Pre-caches all ~150 forms in parallel so future opens are instant.
6. Writes a full report to a sheet called `NSPB_Discovery`.
7. Posts a recap in the chat.

It takes **2-3 minutes** the first time. While it runs, you can keep working in Excel.

When the chat shows the recap (✓ probes OK, forms pre-cached), the add-in is ready.

---

## Step 6 · Save the workbook

Press `Ctrl+S` to save the Excel file. Your settings are also mirrored to a hidden sheet inside the workbook — saving the file makes that backup persistent. If anything ever wipes the local cache, the settings auto-recover from the hidden sheet within 4 seconds.

---

## In-app reference

The add-in includes its own **Help** tab with the same setup instructions plus a quick-start guide for the slash command palette. Open it any time from the top bar of the task pane.

![Help tab inside the add-in showing first-time setup, Detect everything, Import KB, and slash palette quick start](/images/help.png)

---

## You're done

Try it:

```
show me the cubes
```

You should see a list of your tenant's cubes (e.g. `NSP_NFS`, `Workforc`, `Report`) within 1 second.

```
open form Income Statement
```

The form opens on a new sheet with attached business rules listed.

---

## When NSPB MCP sends an updated tenant-kb.json

Sometimes NSPB MCP will send you a refreshed file — typically when:
- New forms / rules / dimensions were added in your NSPB tenant.
- A bug in the parser was fixed.
- You requested a re-export.

To apply the update:

1. Save the file from email to disk.
2. Open Settings → click **Choose File** → pick the new file.
3. Click **⚡ Load everything** again.

The old version is replaced; pre-caching runs again.

---

## Troubleshooting

| Issue | Fix |
|---|---|
| "NSPB credentials required" | Host / username / password is missing. Re-enter and click Load everything. |
| "401 Unauthorized" | Password is wrong or expired. Update it in Settings. |
| "AI key required" | Fill the AI API key field. |
| Settings disappear after closing Excel | Save the workbook (Ctrl+S). The hidden-sheet backup only persists when the file is saved. |
| Add-in shows old version | Close the task pane (X) and reopen from the ribbon. The bundle refreshes from the NSPB MCP edge. |

---

## Support

For setup help: **gallobruno@gmail.com**
