# Cloudflare account migration — `bryantparkconsulting.com` → personal

**Goal:** detach the Cloudflare account from the BPC corporate email so the
worker (`gentle-moon-046f`) lives entirely under a personal account, with
no further activity attributable to BPC.

**Current state (snapshot, 2026-05-08):**

| Field | Value |
|---|---|
| Worker name | `gentle-moon-046f` |
| Worker URL | `https://gentle-moon-046f.bruno-gallo-dee.workers.dev` |
| Account ID | `dee3c68d26546183921918fc50024a14` |
| Account display name | `Bruno.gallo@bryantparkconsulting.com's Account` |
| Account email | `bruno.gallo@bryantparkconsulting.com` |
| Plan | Workers free tier (BPC pays $0) |
| Custom domains | none — using auto-generated `*.bruno-gallo-dee.workers.dev` |

---

## Path A — change the email on the existing account (15 min, simplest)

Keeps the same Account ID, same worker, same URL. Only the login email
changes. **Recommended unless you also want to drop the `bruno-gallo-dee`
subdomain.**

1. Login to https://dash.cloudflare.com with `bruno.gallo@bryantparkconsulting.com`
2. Top-right avatar → **My Profile** → tab **Authentication**
3. Click **Change email address** → enter `gallobruno@gmail.com`
4. Cloudflare sends a verification mail to BOTH addresses — confirm both links
5. Once confirmed, log out
6. Log back in with `gallobruno@gmail.com`
7. (Optional) **Members** → if BPC corp email lingers as a member, remove it
8. Local CLI re-auth:
   ```bash
   cd "C:\apps\nspb-migrate-fresh\essbase MPC4 Excel\worker"
   npx wrangler logout
   npx wrangler login        # browser pops, sign in with gallobruno@gmail.com
   npx wrangler whoami       # should show gallobruno@gmail.com
   npx wrangler deploy       # smoke test, should redeploy gentle-moon-046f
   ```

**What stays unchanged:**
- Worker URL (`gentle-moon-046f.bruno-gallo-dee.workers.dev`) — **the subdomain
  prefix `bruno-gallo-dee` does NOT change** when you change the email.
  Cloudflare derives it from the account display name at creation, then never
  changes it.
- Account ID, worker config, deploy history, analytics
- Office add-in manifest URLs (no client re-install needed)

**What changes:**
- Login email
- Future audit log entries are attributed to the new email

---

## Path B — create new account, transfer worker (45 min, cleanest)

Use this if you want a brand-new account with no BPC trace at all (including
removing the `bruno-gallo-dee` subdomain string from the URL).

1. Sign up new Cloudflare account with `gallobruno@gmail.com` from a fresh
   browser session
2. Verify the email
3. Note the new Account ID (Dashboard → top-right shows it)
4. Update `worker/wrangler.toml`:
   ```toml
   account_id = "<new account id>"
   ```
5. Local CLI re-auth:
   ```bash
   cd "C:\apps\nspb-migrate-fresh\essbase MPC4 Excel\worker"
   npx wrangler logout
   npx wrangler login   # sign in with gallobruno@gmail.com
   npx wrangler deploy  # creates a new worker on the new account
   ```
6. The new URL will be something like
   `gentle-moon-046f.<new-subdomain>.workers.dev` — note it down
7. Update `essbase MPC4 Excel/manifest.xml` — find/replace
   `gentle-moon-046f.bruno-gallo-dee.workers.dev` with the new URL
8. Update `README.md`, `claude-memory/project_overview.md`,
   `tests/uat-explain.mjs` — same find/replace
9. Re-build the bundle: `node build.js && npx wrangler deploy`
10. **Re-distribute the manifest to clients** (they re-side-load the add-in)
    — only step that affects users
11. Once new worker is verified working, login to the OLD account and
    **delete the worker** there (Dashboard → Workers → gentle-moon-046f →
    Delete)

**Side effect:** clients who installed the add-in pointing to the old URL
will keep hitting the old worker until they get the new manifest. If you
delete the old worker before they update, they break. Coordinate the cutover.

---

## Path C — custom domain (best long-term, most work)

Get a neutral domain (e.g., `nspbmcp.com` you already use for Firebase) and
point the worker to `api.nspbmcp.com`. Then the URL has zero BPC trace AND
you decouple from any specific Cloudflare account in the future.

1. In Cloudflare dashboard → Workers → `gentle-moon-046f` → **Triggers** →
   **Add Custom Domain** → `api.nspbmcp.com`
2. Cloudflare prompts you to add a CNAME / point DNS — easiest if you also
   move `nspbmcp.com` DNS to Cloudflare (free)
3. Update `manifest.xml` and the other 4 files to use `https://api.nspbmcp.com`
4. Re-build, redeploy, re-distribute manifest

After this, the workers.dev URL becomes optional — you can leave it as a
fallback or disable it (Worker Settings → Routes → remove the workers.dev
route).

---

## Cleanup already done in this commit (2026-05-08)

These removed the corp email from the codebase itself (separate from the
Cloudflare account migration):

- `essbase MPC4 Excel/src/taskpane.js` — `DEMO_SETTINGS.username` was
  hardcoded to `bruno.gallo@bryantparkconsulting.com`, now empty string
- `tests/uat-explain.mjs` — same field, now `demo@example.com`
- Bundle rebuilt (`v0.139`) and redeployed so the live worker no longer
  embeds the corp email anywhere in its served JS

Files that **still contain `bruno-gallo-dee`** (not the email — just the
URL subdomain prefix Cloudflare auto-generated):

- `essbase MPC4 Excel/manifest.xml` (12 occurrences)
- `essbase MPC4 Excel/help/PACKAGING_GUIDE.md`
- `README.md`
- `claude-memory/project_overview.md`
- `tests/uat-explain.mjs`

These all reference the worker URL. They do NOT change with Path A — only
with Path B or C. Search/replace `bruno-gallo-dee.workers.dev` with the new
URL when you do B or C.

---

## Recommendation

**Do Path A first** (15 min, near-zero risk, fixes the IAM trail). That
alone gets you "no future activity attributed to bryantparkconsulting.com".
If after talking to a lawyer you also want to drop the subdomain string,
escalate to Path C (custom domain) since it's strictly better than B.

**Do not delete the old account, the worker, or any of this until the
lawyer review is done** — destroying records can be argued as bad faith.
Migrating ownership while preserving records is normal and clean.
