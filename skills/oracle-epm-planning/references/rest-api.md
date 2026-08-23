# Calling the pod directly (REST)

`epmautomate` is a thin wrapper over these endpoints, and it exposes maybe a third of them.
The REST surface does three things the CLI cannot, all of which matter here:

- returns the **evaluated form grid** — what the planner actually sees, after suppression and
  expansion — so a form can be verified without anyone opening the UI (`verifying-in-the-pod.md`);
- reads dimensions, members, substitution and user variables **live**, instead of reconstructing
  them from a downloaded snapshot;
- returns the **per-message detail of a failed child job**, which is the only place the real
  cause of `One or more child jobs have failed` is written down.

## Auth

Two schemes. Only one of them avoids putting a plaintext password on disk.

**Basic** — `Authorization: Basic base64(<identitydomain>.<user>:<password>)`. Works everywhere,
but the `.epw` files are encrypted for `epmautomate` alone and cannot be decrypted for this, so
using Basic means the password exists in clear somewhere. Avoid it for anything scheduled.

**OAuth 2** — the one to use. Oracle recommends it over Basic for both REST and EPM Automate.
One-time setup by the *domain* administrator, not the service administrator:

1. Identity & Security → Domains → Integrated applications → create a **Mobile Application**.
2. Grant types: **Refresh token** and **Device code**.
3. Add the EPM Cloud Service resource; add the Identity Domain Administrator role.
4. Add the pod base URL as a **secondary audience** and enable *Allow token refresh*.
5. Activate; hand the service admin the **IDCS URL** and **Client ID**.

Then, per run:

```bash
curl -s -X POST "https://<idcs-host>/oauth2/v1/token" \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode 'grant_type=refresh_token' \
  --data-urlencode "client_id=$EPM_CLIENT_ID" \
  --data-urlencode "refresh_token=$EPM_REFRESH_TOKEN"
```

`<idcs-host>` looks like `idcs-<hex>.identity.oraclecloud.com`. The response carries
`access_token` (1 hour) **and a new `refresh_token`**.

- **Each refresh token is single-use.** The response's new one replaces the one you sent. A script
  that keeps re-sending the original gets a `400` that reads like a bad client ID. Persist the
  returned token every time.
- Refresh tokens die after 7 days of inactivity. Anything scheduled less often than weekly needs
  a keep-alive.
- Scope, when a request needs it stated explicitly:
  `urn:opc:serviceInstanceID=<SERVICE_INSTANCE_ID>urn:opc:resource:consumer::all`

Every call below then carries `Authorization: Bearer <access_token>`.

## Base URLs and versions

| Surface | Base |
|---|---|
| Planning / EPCM / FCC / FreeForm | `https://<pod>/HyperionPlanning/rest/v3/applications/{app}` |
| Infrastructure, LCM, files, users | `https://<pod>/interop/rest/...` |

The `interop` family mixes versions — `11.1.2.3.600`, `v1` and `v2` coexist and each operation
pins one. Calling the right operation at the wrong version returns something that reads like a
missing resource, not a version error.

The metadata and agentic endpoints (`summary`, `plantypes`, `dimensions`, `forms/{id}/data`)
shipped in **26.04**. On an older pod they 404, which reads exactly like a typo in the path.
Check the pod's monthly update before concluding the URL is wrong.

## Seeing what the planner sees

| Purpose | Call |
|---|---|
| Evaluated form grid | `GET .../forms/{idOrName}/data` |
| Exact intersection, any shape | `POST .../plantypes/{cube}/exportdataslice` |
| Write or clear a slice with no job | `POST .../plantypes/{cube}/importdataslice`, `.../clear_dataslices` |
| Whole-app orientation, as markdown | `GET .../summary` |

`GET .../summary` accepts `fullHierarchyThreshold` (default 100 — dimensions at or below it are
printed in full), `aliasTableName` and `dimensionsToInclude`. Oracle states the response shape is
**not stable between releases**: it is written for a model to read, not to be parsed. Treat it as
orientation, never as a contract.

The first two are covered with their response shapes in `verifying-in-the-pod.md`.

## Resolving a POV

This block shortcuts the dominant failure described in `SKILL.md`. All `GET`, all `Any Role`
except `members` (Service Administrator).

```
.../plantypes                              → planTypeName, cubeName, numDimensions, cubeType
.../plantypes/{cube}/dimensions            → every dimension on that cube
.../plantypes/{cube}/dimensions/{dim}      → the hierarchy: children, path, level, generation,
                                             dataStorage, usedIn, alias
.../dimensions/{dim}/members/{member}      → parentName, dataStorage, dataType, twoPass
.../substitutionvariables                  → name, value, planType ("ALL" or a cube)
.../uservariablevalues                     → userName, name, dimension, member
```

`cubeType` on `plantypes` is `0` for BSO and `136` for ASO — the fastest way to know whether an
empty result is an aggregation problem or a storage-type problem.

`uservariablevalues` returns the value **per user**, which is the only way to reproduce "the form
is empty for them and fine for me" without logging in as them.

Substitution variables also exist per plan type (`.../plantypes/{cube}/substitutionvariables`,
plus a `derived` variant), and the app-level and cube-level values of one name can disagree — the
`planType` field in the response is how you tell which one a rule will pick up.

For user *variable definitions* rather than values — create, update, delete, get by id — the
operations sit under `uservariables`; confirm the exact path in the reference page before writing
to them.

## Running things

```
POST .../jobs                     {"jobType":"Rules","jobName":"...",
                                   "parameters":{...,"planType":"Plan1"}}
GET  .../jobs/{jobId}             → status
GET  .../jobs/{jobId}/childjobs/{childId}/details?q={"messageType":"ERROR"}&limit=-1
```

`POST .../jobs` is the entire job surface, not just rules — `jobType` selects it. Runtime prompts
go in `parameters`; omit them only if Calculation Manager holds defaults. A rule runs against the
plan type it was deployed to, so a rule that "runs and writes nothing" may be executing on the
wrong cube — check `planType`.

The child-job detail endpoint covers `IMPORT_METADATA`, `EXPORT_METADATA`, `IMPORT_DATA` and
`EXPORT_DATA`, with paging on the data ones, and `messageType` filters `ERROR`/`WARNING`/`INFO`.
This is the answer to `One or more child jobs have failed` — see `jobs.md` for what that message
does and does not mean.

Other job types run through the same `POST .../jobs` (confirm each one's `jobType` string in its
own reference page): Cube Refresh, Clear Cube, Compact Cube, Restructure Cube, Merge Data Slices,
Optimize Aggregation, Import/Export Data, Import/Export Metadata, Plan Type Map, Sort Members,
Auto Predict, Administration Mode, Execute Application Diagnostics, Import/Export Security,
Import/Export Cell-Level Security, Import/Export Valid Intersections, Import/Export User Variable
Values, Export Audit, Export Job Console, Ruleset, Execute Report Bursting Definition, and the
Library document jobs.

Two of those earn a mention here:

- **Export Valid Intersections** — when cells drop silently and the POV looks right, an invalid
  intersection rule is the next suspect, and this is how you read them.
- **Export Audit** — who changed what, and when. Faster than reconstructing a prior session from
  the access log when the change was made in the UI.

## Approvals and insights

`planningunits` and friends: list units, current status, available actions, promotional path,
history and annotations, and change status. `Insights` / `Insights Summary` return the anomaly
detection the UI puts on a form.

## Infrastructure (`/interop/rest`)

LCM and migration: list files and snapshots, snapshot details and the actions each supports,
upload, download, apply a snapshot, `recreate`. These are the operations `epmautomate` wraps —
worth calling directly only when scripting around the CLI's two standing annoyances (downloads
landing in `C:\ProgramData\Oracle\EPM Automate`, and re-upload refusing a filename already on the
pod). Also here: the daily maintenance window, and the activity and access reports.

## Practical notes

- **`limit` defaults to 25.** Every paged collection — dimensions, members, user variable values,
  child job messages — quietly returns the first 25 with a `hasMore` you have to go looking for.
  Pass `limit=-1` (or `0`) for all. A truncated dimension listing looks exactly like missing
  metadata, which is the same trap as everything else in this skill.
- `fields=` trims the response; on `dimensions/{dim}` without it you get the whole subtree.
- `q=` takes MongoDB-style filters, e.g. `q={"objectType":"DIMENSION","level":{$gt:1}}`. It is
  URL-encoded JSON, so quoting it from PowerShell needs care.
- URL-encode member names: `North%20America`. A raw space returns a 404 that reads like the member
  does not exist.
- The `links` array carries `next`/`prev` — follow those rather than computing offsets.

`scripts/epm_rest.py` wraps the token exchange and the calls above; `--help` lists them.
