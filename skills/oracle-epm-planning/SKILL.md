---
name: oracle-epm-planning
description: Hard-won mechanics for Oracle EPM Cloud / NetSuite Planning & Budgeting (NSPB, EPBCS, PBCS) implementation work — loading data and metadata without destroying members, building Export Data and Import Metadata jobs, hand-building LCM snapshots that import only what changed, authoring Groovy and calc-script business rules, building data forms, and building navigation flows. Use this whenever the work touches an EPM Planning pod: epmautomate, Calculation Manager, business rules, LCM migration snapshots, OutlineLoad, dimension or member maintenance, data forms, navigation flows, POV or intersection problems, substitution and user variables, or a form/rule that "runs successfully" but produces nothing. Also use it when diagnosing why a Planning import reported success but changed nothing, why a form is empty, or why a rule that validates returns no data — these failures are silent by default and this skill exists because of them.
---

# Oracle EPM Planning — field mechanics

This platform fails quietly. An import reports `completed successfully` and changes nothing.
A rule validates, deploys, runs, and writes nothing. A form opens clean and shows no rows. A
metadata load succeeds and a member disappears. Almost none of these produce an error you can
read.

So the working method matters more than any individual recipe: **write, then read back, then
assert two-sided evidence** — the thing you intended changed, and nothing else did. Most of
what follows exists because a step that looked successful wasn't.

## The dominant failure: read POV vs. data POV

Before blaming a rule, a form, or a load, check the intersection. The cube has one member per
dimension in every cell, and a Planning app quietly disagrees with itself about which one:

- A form's POV pins `Location = No Location` while the data sits at `LOC_01`.
- A rule reads `"Item Purchase Price"` in the current context, but that account is stored at
  `No Class / No Department / No Relationship` and needs all three overridden.
- A starter form is hardcoded to a global master member, but the implementation rewrote the
  model to be per-customer, so the form is now pointed at an empty slice.
- A date-driven rule reads its dates at the master member, so loading them per-customer
  changes nothing.

This single class of mistake accounted for more lost time than every other cause combined in
the engagement this skill came from. When something is empty, get the actual POV of a cell
that *does* have data — export a few rows and print the `Point-of-View` column — and diff it
against where you are reading. Do that before changing any code.

A related trap: **accounts with `~` aggregation are blank at a parent by design**, and
assumption-type accounts are usually excluded from the AGG whitelist. A form read at a parent
item or parent customer will show those rows empty and everything else populated. That is not
a bug; select a level-0 member.

## Verify by reading back, always

After any write, read the result from the pod rather than trusting the tool's exit status.

- After a metadata load: **count the members** and diff the member set against the file you
  sent. A member can vanish even though it was in your file, if the job's refresh step fails.
- After a form or rule import: export the artifact again and inspect the XML you care about.
  Planning silently rewrites and drops things it does not accept.
- After a data load: export the same intersection and compare.
- After a rule run: compare a before and after export **from the same job** (see
  `references/jobs.md` — comparing exports from two different jobs produces a fake catastrophe).

## Where the detail lives

Read the file that matches what you are doing. Each is short and self-contained.

| Doing this | Read |
|---|---|
| Loading data; POV strings; date and smart-list values | `references/data-loads.md` |
| Export Data / Import Metadata jobs; the `/EDD` selection | `references/jobs.md` |
| Adding or changing dimension members without losing any | `references/metadata.md` |
| Hand-building an LCM snapshot to import one artifact | `references/lcm-snapshots.md` |
| Writing or patching a business rule, Groovy or calc script | `references/rules.md` |
| Building or fixing a data form | `references/forms.md` |
| Building or importing a navigation flow | `references/navigation-flows.md` |

## epmautomate, in practice

- **Downloads do not land in your working directory.** `downloadfile` writes into EPM
  Automate's own directory — `C:\ProgramData\Oracle\EPM Automate` on a default Windows
  install. It prints success and you find nothing where you are standing.
- **Re-uploading a file whose name is already on the pod fails** with
  `EPMAT-1:File already exists or upload is in progress`. There is no delete in most wrappers;
  copy the zip to a fresh name. When iterating on one artifact, that means a new name each round.
- **LCM import *is* deploy — if you ship the Planning-side artifact.** A rule lives as two
  artifacts, and `HP-<App>/resource/Cube/<Cube>/Calculation Manager Rules/<Rule>.xml` is the one
  Planning executes; import it and the rule is callable straight away, with nobody in Calculation
  Manager. Ship only the `CALC-Calculation Manager/...` copy and the rule imports undeployed, and
  `runbusinessrule` returns `A job with specified name and type was not found`, which reads like a
  typo in the rule name. The `<deployobjects>` block is *not* what deploys — see
  `references/rules.md` for the two-probe test that settles it.
- **Refresh:** `refreshcube` standalone often succeeds where the refresh embedded in an import
  job fails. If a job reports `One or more child jobs have failed` but the metadata looks
  applied, run a standalone refresh and re-verify before assuming damage.
- **The access log tells you what any UI action really calls.** `downloadfile
  "apr/<date>/access_log.zip"` gives a CSV with Date, Time, URI, Status, User and — the useful
  part — **Screen / Action / Object** columns. It is the fastest way to find the endpoint behind
  a button, and it doubles as a timeline for reconstructing what a previous session did to the
  pod. `listfiles` shows which activity reports exist.

## When you are asked to change a shipped/starter application

Starter content (Oracle's own modules, a partner's accelerator) encodes assumptions that an
implementation often invalidates — most commonly by making a model per-customer, per-entity or
per-location when the starter assumed a single global slice. When that happens, the starter's
own rules and forms go mute rather than erroring.

Treat it as a sweep, not a one-off fix: when you find one artifact pinned to the old
assumption, look for the rest. Grep the exported artifacts for the hardcoded member name.

Modify starter artifacts by patching the exported XML with an exact, counted string
replacement, and assert the count. Do not regenerate them from a builder — regeneration drags
in references that no longer validate and you will spend the afternoon on an unrelated error.
