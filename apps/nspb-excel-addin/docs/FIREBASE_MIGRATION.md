# Firebase Hosting migration — `bryantparkconsulting.com` → personal

**Goal:** transfer ownership of Firebase project `nspbmcp` (which serves
`nspbmcp.web.app`) from the BPC Workspace account to `gallobruno@gmail.com`,
without breaking the live site or destroying any historical records.

**Why not delete:** preserving the deploy history under the corp account
is *better* legal posture than wiping it. Destroying records after a
question is raised reads as bad faith; migrating ownership reads as
normal reorganization.

---

## Current state (2026-05-11)

| Field | Value |
|---|---|
| Project ID | `nspbmcp` |
| Project Number | `144985031460` |
| Hosting URL | `https://nspbmcp.web.app` |
| Project owner | `bruno.gallo@bryantparkconsulting.com` |
| Plan | Spark (free tier) — BPC pays $0 |
| Other resources | none — just Hosting (no Functions, Firestore, Auth, Storage) |

---

## Path A — IAM transfer (recommended, 10 min)

Keeps the same project ID, same URL, same deploy history. Just changes
who logs in.

1. Login to https://console.firebase.google.com/u/0/project/nspbmcp/settings/iam
   with `bruno.gallo@bryantparkconsulting.com`.
2. Click **Add member**.
   - Email: `gallobruno@gmail.com`
   - Role: **Owner**
   - Click **Add member**.
3. Accept the invitation from the personal account:
   - Check Gmail inbox for `gallobruno@gmail.com`.
   - Click the link → "Accept" in the Firebase Console.
4. Once accepted, both accounts are Owners. Verify in the IAM page that
   both are listed.
5. (Optional, recommended) Remove the corp account:
   - Same IAM page → `bruno.gallo@bryantparkconsulting.com` → **Remove**.
   - Or change role to **Viewer** if you want the corp account to still
     see the project (read-only) for any future legal record.
6. Local CLI re-auth:
   ```bash
   cd "C:\apps\nspb-migrate-fresh\docs-site"
   firebase logout
   firebase login          # browser, log in with gallobruno@gmail.com
   firebase projects:list  # should show 'nspbmcp'
   firebase use nspbmcp
   firebase deploy --only hosting   # smoke test
   ```

**What stays unchanged:**
- URL `https://nspbmcp.web.app`
- Project ID `nspbmcp`
- All historical deploy log (preserves the legal record)
- Bookmarks / inbound links / SEO

**What changes:**
- IAM owner = personal account
- Future deploys are attributed to personal account
- New site activity is *not* attributable to BPC anymore

---

## Path B — Custom domain (only if you want to drop `.web.app`)

After Path A is done, you can attach a custom domain (e.g. `nspbmcp.com`)
via:

  Firebase Console → Hosting → Add custom domain → follow DNS instructions.

Once the custom domain is verified and serving, you can also keep the
default `nspbmcp.web.app` as a redirect, or disable it.

---

## Path C — Full delete (NOT RECOMMENDED)

This destroys the project and frees the `nspbmcp` ID after 30 days.
Don't do this until after a legal consultation has cleared the path.

If you do go this route eventually:

  Console → Project settings → Delete project at the bottom.

---

## Recommendation

**Do Path A now.** Site keeps working, ownership moves to personal,
historical record is preserved (good for any legal review).

Do NOT delete the project until after the lawyer consult clears it.
"I migrated ownership transparently" is a much better answer than "I
deleted everything once I realized there might be a question."
