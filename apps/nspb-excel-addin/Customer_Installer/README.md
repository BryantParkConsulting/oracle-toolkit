# NSPB MCP — folder layout

```
C:\NSPB_MCP\
├── installer\        ← What we send to clients (zip these files + email)
│   ├── Install NSPB.bat
│   ├── Uninstall NSPB.bat
│   ├── Start NSPB.bat
│   ├── manifest.xml
│   └── help\
│
├── dev\              ← Junction to C:\apps\nspb-migrate-fresh
│                       (source code, worker, build.js, parsers)
│
└── clients\          ← One folder per tenant — the JSONs we email
    ├── demo\
    │   └── tenant-kb.json
    ├── acme\
    │   └── tenant-kb.json
    └── pharmalogic\
        └── tenant-kb.json
```

## Workflows

### New client onboarding (Delivery side)

1. Run LCM parser against client's NSPB → produces `tenant-kb.json`.
2. Save to `C:\NSPB_MCP\clients\<client-name>\tenant-kb.json`.
3. Zip `C:\NSPB_MCP\installer\` → email to client with install instructions.
4. Email `tenant-kb.json` separately with: *"In Excel → NSPB MCP → Settings →
   Import Tenant KB → pick this file."*

### Updating a client's KB

1. Re-run LCM parser → save fresh `tenant-kb.json` over the old one.
2. Email the new file to client.
3. Client re-imports via Settings. Done.

### Building a custom bundle (advanced — only if NSPB MCP wants embedded KB per
client instead of manual import)

```powershell
cd "C:\NSPB_MCP\dev\essbase MPC4 Excel\worker"
$env:CLIENT = "acme"          # picks clients\acme\tenant-kb.json
node build.js
npx wrangler deploy
```

Default `CLIENT=demo`.

## Files NOT in this layout

- **help.md** (the generic NSPB how-to) — lives in
  `dev\essbase MPC4 Excel\worker\kb.md`, embedded in the bundle, served from
  Cloudflare. Same for every client.
- **API keys / passwords** — never written to disk anywhere. Stored in each
  user's browser localStorage (Settings panel).
