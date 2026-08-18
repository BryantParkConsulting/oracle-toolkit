---
name: business-rule-deploy
description: Package an Oracle EPM Planning / Calculation Manager business rule as an importable LCM snapshot ZIP, and walk through getting it into a pod and running it. Use when someone wants to move a business rule between environments, clone one to a new cube/client, or asks "can we deploy a rule automatically" / "puedo automatizar el deploy de una business rule".
---

# Deploying a Calculation Manager business rule

## Read this first — what is and isn't automatable

There is **no Oracle API to author or deploy business rule logic**. Calculation Manager's
UI runs on Oracle ADF, a stateful framework — every network call it makes (`adf.task-flow`,
`_adf.ctrl-state=...`, `.../internal/vbshell/.../keepalive`) is session-bound plumbing, not a
callable endpoint, and Oracle marks the relevant one `internal` in the URL itself. Don't go
looking for a shortcut there — it was tried, confirmed dead, logged here so nobody re-tries it.

What **is** real and does work, in three separate pieces:

| Step | Automatable? | How |
| --- | --- | --- |
| Write the rule's calc-script logic | No | Calculation Manager UI, always. Nobody skips this. |
| Package an already-written rule as an importable ZIP | **Yes** | `bin/make-rule.mjs`, this skill |
| Upload the ZIP to the pod | **Yes** | `epmautomate uploadfile` |
| Select the artifact and import it | No | Tools → Migration → Snapshots, manual click |
| Run the rule afterward | **Yes** | `epm_run_rule` (mcp-planning) or `epmautomate runbusinessrule` |

So the honest pitch is: **everything except writing the logic once and clicking Import once**
is automatable. That's still real leverage — cloning a rule to five clients, or redeploying
the same rule after every sandbox refresh, stops being five manual round trips through
Calculation Manager and becomes one script run plus two clicks.

## The one rule that matters more than any other

**Never hand-write the XML of a rule.** `HBRRepo` is Oracle's internal Calculation Manager
export format — undocumented, and a single wrong attribute can silently corrupt the rule on
import, or worse, import cleanly and calculate wrong. Every rule this tooling touches must
trace back to a real export. Either:

- **carry it over verbatim** (cloning/moving a rule that already exists — the normal case), or
- **generate it from `buildRuleXml()`**, which only fills in the same four fields Oracle's own
  export always has (`name`, `application`, `plantype`, `script`) — never invent a field this
  function doesn't already have a slot for.

This mirrors exactly how `lib/lcm-security.mjs` handles cell-level security, and the schema
below was copied from a real pod export (`clients/symetri/CALC-Calculation Manager/`,
rule `ADMIN - Clear Actual`) — not guessed.

## Step 1 — get a reference export

If you don't already have one, ask the client to export via **Tools → Migration → Export**,
Calculation Manager artifact, and hand you the ZIP (or point you at `clients/<name>/CALC-Calculation Manager/`
if a prior assessment already pulled one — check there first, several clients already have one
downloaded: `daywireless`, `spindrift`, `symetri`, `talogy`).

Inside, `resource/Planning/<App>/<Cube>/Rules/<RuleName>` is the rule itself — no file
extension, plain XML content. `info/listing.xml` and the top-level `Import.xml` show you the
exact artifact path and product/project names for that specific pod; don't assume they match
another client's without checking.

## Step 2 — decide: clone existing, or write new

**Cloning/moving a rule that already exists** (the common case — same rule, different
cube/client/environment): read the real rule file as-is and pass it through untouched via
`rule.xml` in the spec. Do not "clean up" or reformat it.

**Writing new rule logic**: still write and test the calc script by hand in Calculation
Manager first, in a sandbox if one exists. Once it works, export it (Step 1) and treat it
as a clone from here on — don't try to skip straight to `buildRuleXml()` with logic that has
never actually run in the product.

## Step 3 — package it

```bash
node packages/forge/bin/make-rule.mjs spec.json --out my-rule.zip --dir my-rule-review
```

`spec.json`:

```json
{
  "application": "NetSuite",
  "cube": "Plan",
  "exportedBy": "you@bryantparkconsulting.com",
  "exportedVersion": "26.06.95",
  "rules": [
    { "name": "ADMIN - Clear Actual", "xml": "<paste the real exported file's content here>" }
  ]
}
```

Always add `--carry-over <path to the real Rules folder>` unless you have specifically
verified this pod's Migration import merges rather than replaces the target folder — Oracle
does not document which it does, and shipping the existing rules alongside the new one makes
the question moot (the same trick `lcm-security.mjs` already uses).

The package is scoped to exactly `/Planning/<App>/<Cube>/Rules` — it cannot touch a rule in
another cube, a form, a dimension, or security, no matter what.

**Before doing anything with the output**, open `my-rule-review/` and read every file. If
`--dir` produced a rule resource file that doesn't look right, stop — don't zip it.

## Step 4 — get it onto the pod

Upload is scriptable the same way `bin/import.mjs` already uploads metadata files:

```bash
epmautomate login <user> <passfile> <url>
epmautomate uploadfile my-rule.zip
epmautomate logout
```

**Importing it is not scriptable.** Log into the pod, **Tools → Migration → Snapshots**,
find the uploaded ZIP, expand it down to `Planning → <App> → <Cube> → Rules`, select the
rule(s), and run Import. This is the one click Oracle doesn't expose an API for.

**Before you click Import**: export the app's current Calculation Manager snapshot first.
That export is your rollback if the import goes wrong.

## Step 5 — run it

Once imported, running the rule is automatable again:

- From Claude, via the `mcp-planning` MCP server: `epm_run_rule` (disabled by default,
  needs `confirm: true`)
- From a script: `epmautomate runbusinessrule <ruleName> <app> <cube> [runtime prompts...]`

Run it once by hand and read the log before wiring it into anything scheduled.

## Files this skill uses

- `packages/forge/lib/lcm-rules.mjs` — the packaging logic (`buildRuleXml`, `buildRuleLcmFiles`, `buildRuleLcmZip`)
- `packages/forge/bin/make-rule.mjs` — the CLI
- `packages/forge/lib/zip.mjs` — the ZIP writer (shared with security/forms, dependency-free, STORE method)
- `packages/forge/bin/import.mjs` — the EPM Automate upload pattern this reuses for Step 4's upload half
- `packages/mcp-planning/src/index.js` — `epm_list_rules` / `epm_run_rule` for Step 5
