# NSPB by-file: LCM metadata/forms + data loads — hard-won runbook

Everything learned wiring up the Wedbush POC on the shared SC demo pod
(`epm12119-demoepm2119`, app **NetSuite**, product HP) in July 2026. This is the
"by file, no UI clicking" path: build artifacts locally → load with `epmautomate`.

Tools built alongside this:
- `tools/build-lcm-snapshot.py` — generalized snapshot builder (any artifact type).
- `tools/build-wedbush-snapshot.py` — first, dims-only version (kept for reference).
- `tools/gen-wedbush-pod.js` / `gen-wedbush-metadata.js` — generate additive dim/smartlist files.

---

## START HERE — operating on a client

This runbook is meant to be handed to a fresh chat and used to do real work on a
client's pod. Before touching anything, get these two things from the user. With them,
everything below is executable; without them, stop and ask — do not guess a pod or a POV.

**1. Where is the client's environment?**  `clients/<name>/` is the source of truth for
that tenant (see the repo's `CLAUDE.md` → "`clients/` — snapshots por cliente"). It holds:
- `metadata/*.csv` — the dimension + smart-list files (Account, Employee, Item, Department…).
- `forms/*.xml` — the form definitions (the POV a data load must match lives HERE — see §POV).
- `tenant-kb.json` — parsed LCM (forms, rules, variables, dimensions).
- `env-docs/04-how-to-load-data.md` — the client's own load procedure, if present. **Read it
  first** — use it instead of inventing a format.
- the raw LCM export (`Export.xml` + `CALC-*/`, `HP-*/`, `FDMEE-*/` folders) if unpacked.

If the client isn't set up yet, the user drops their Oracle LCM export and you run
`CLIENT=<name> node tools/parse-lcm.js` (see the repo's per-tenant KB pipeline) to create
`clients/<name>/tenant-kb.json`.

**2. Connection (url / user / password).**  Register the pod once in `~/.epm/clients.json`
(NO secrets in it):
```json
{ "<name>": { "url": "https://<pod>.epm.<region>.ocs.oraclecloud.com/",
              "user": "you@bryantparkconsulting.com", "app": "NetSuite",
              "passfile": "<name>.epw" } }
```
Two credential forms, because REST and epmautomate need different things:
- **REST loads / read-backs** (`nspb-load-*.js`, `nspb-validate-calc.js`) use HTTP **Basic Auth
  → need the plaintext password** in `EPM_PASS`. Set it in the shell for the run, clear it after.
  The `.epw` CANNOT be used for REST (only epmautomate can decrypt it).
- **epmautomate** (snapshots, running rules, export jobs — `epm-run.js`) uses the encrypted
  `.epw`: `epmautomate encrypt '<pwd>' '<key>' ~/.epm/<name>.epw` (the human makes it once).

To keep the password out of the chat entirely, the human can drop it in `~/.epm/<name>.pass`
(one line, plaintext, gitignored) and you source it inline:
`EPM_PASS=$(cat ~/.epm/<name>.pass) node tools/nspb-load-<x>.js <name> --validate`.

**Then the pipeline is just §6.** Point at the client folder, set the creds, go:
dims → forms → load → rules → validate. The rest of this doc is the *how* and the *gotchas*.

---

## 0. Credentials / connection
- `epmautomate` login: `login <user> <path-to.epw> <podUrl>`. The `.epw` is Oracle-encrypted
  (`epmautomate encrypt '<pwd>' '<key>' <out.epw>`) — created once by the human; we never see the
  plaintext. Registry: `~/.epm/clients.json` (no secrets) + `<client>.epw`. Wrapper: `tools/epm-run.js`.
- Pod URL for REST: `https://<pod>.epm.<region>.ocs.oraclecloud.com/HyperionPlanning/rest/v3`.
  REST uses **HTTP Basic Auth** (needs the plaintext password — the `.epw` does NOT work for REST).

## 1. Cube dimensions (from `GET .../plantypes/{cube}/dimensions`)
- **Workforc (11):** Account, Period, Years, Scenario, Version, Currency, **Subsidiary**, Class, Department, Location, Employee
- **NSP_NFS (13):** Account, Period, Years, Scenario, Version, Currency, **Subsidiary**, Class, Department, Location, Item, Relationship, Tracker
- ⚠️ **Subsidiary is easy to forget** — it's not on the Manage Employee form (form default) but a
  data load MUST specify it. Undefined member = **`No Entity`**.
- Other "undefined" members: `NSP_Undefined_Class`, `NSP_Undefined_Location`,
  `NSP_Undefined_Department`, `NSP_Undefined_Relationship`. Years "no year" = **`No Year`**.

## ⚠️ THE #1 GOTCHA — load POV must match where the FORM reads

This bit us **twice** (Workforce, then Revenue). Symptom: rules run "successfully", the
read-back validates, but the **form is empty**. Cause: the data landed at a POV the form
doesn't look at. A form's POV is authored in its XML (`clients/<name>/forms/<form>.xml`) —
often via **substitution variables**, so you must resolve them:

| Sub var (in form XML) | Resolves to (this pod) | A load that ignores it writes to… |
| --- | --- | --- |
| `&NSP_SYS_CurrentScenario` | **`NSP_Forecast`** | ❌ `NSP_Budget` → off-form |
| `&NSP_SYS_CurrentVersion` | `NSP_Base` | usually fine |
| `&NSP_PER_FcstCurrYr` | **`FY24`** | ❌ `FY26` → off-form |
| Subsidiary (Page default) | **`SUB_2`** (= "United States") | ❌ `No Entity` → off-form |

**Before any load, open the target form's XML and read its POV/Page block.** Whatever the
form reads is where the data has to go. The employees that DO compute live in
`SUB_2 / NSP_Forecast`; using `No Entity / NSP_Budget` (the "obvious" undefined members) is
the classic wrong turn. Confirm by opening the real form in the pod UI (Page shows
Subsidiary=United States, Version=Base) — the API alone hid this both times.

Corollary — **page dimensions need a guaranteed default.** If a form's `<pages>` Subsidiary/
Currency is a bare dropdown (`ILvl0Descendants(NSP_Total Subsidiary)`) with no default, the
same ambiguity hides in the UI instead of the load. Pin the default in the form XML.

## 2. Building an LCM import snapshot (metadata, smart lists, forms, rules…)
Use `tools/build-lcm-snapshot.py <manifest.json>`. A valid minimal snapshot for one app needs,
at these exact paths (forward-slash zip entries; use Python zipfile, NOT Compress-Archive):
```
Import.xml  Export.xml  size.txt                     (root)
<App>/Import.xml                                      (copy verbatim from a real pod snapshot)
<App>/info/listing.xml                               (trim to only your <resource> entries)
<App>/info/sourceInfo.xml   <-- REQUIRED. Missing it = "21000: Invalid filesystem … in MDF"
<App>/resource/<path>/<name>.<ext>                   (the artifacts)
```
- `size.txt` = total UNCOMPRESSED bytes of all other entries.
- Root `Import.xml` = one `<Task>` with `<Artifact recursive="true" parentPath="/" pattern="*"/>`.
- Resource paths / types come from the real snapshot's `info/listing.xml` `<resource .../>` entries
  (copy verbatim for existing artifacts; synthesize for new ones with the same attribute shape).
- **Artifact types & paths** (from listing.xml `type=`): Dimensions = `Dimension`/`Account Dimension`
  under `/Global Artifacts/Common Dimensions/Standard Dimensions` (Employee → `/Cube/Workforc/Standard
  Dimensions`, Item → `/Cube/NSP_NFS/Standard Dimensions`); Smart Lists = `Smart List` under
  `/Global Artifacts/Smart Lists`; Forms = `Data Form` under `/Cube/<cube>/Data Forms/<folder>`;
  file ext = `.csv` for dims/smartlists, `.xml` for forms/dashboards/rules.

### Dimension / smart-list files
- Format = Planning "Import Dimensions": HEADERBLOCK + column-header row + member rows, all copied
  **verbatim** from the pod's own export so the property columns match exactly.
- **Safe additive load:** write the file FULL = existing members (verbatim) + new `WB_` members
  appended. Then merge-vs-replace doesn't matter — result is always existing+new. `build-lcm-snapshot.py`
  mode `merge_append` does this.
- Smart lists: append `addentry` rows continuing the id sequence (WorkLocation existing max id 5,
  JobTitle max 33). Keep the full file (addsmartlist + all entries) to be replace-safe.
- Alias collisions **fail the import** — every alias must be unique across the whole app. (E.g.
  "Product Revenue" already existed on account 4100 → had to rename.)

### Forms
- Clone a working form's XML and repoint members; keep the rest of the structure intact (safest).
  Good bases: `Employee Roster` (Workforc roster) and **`NetSuite Item Price`** (clean Item×Account,
  the right base for a revenue-by-product form — NOT `Sales Units by Item`, which is Relationship-based).
- Repoint row/col member functions, e.g. `<function name="ILvl0Descendants"><member name="TE"/></function>`
  → `WB_Wedbush Emps`; `NSP_Total Department` → `WB_Total Wedbush`. Validate the XML parses.
- A form's internal `dir="…"` attribute can override the manifest path (it may land in the source
  folder, e.g. under the SC team's forms). Cosmetic; rename the form clearly (`Wedbush - …`).

## 3. Loading a snapshot (the exact epmautomate dance)
```
epmautomate login <user> <.epw> <url>
epmautomate deletefile "<Name>.zip"     # uploadfile has NO overwrite flag — delete first
epmautomate uploadfile "<local path>"   # goes to the pod's /u03 inbox
epmautomate importsnapshot "<Name>"     # name WITHOUT .zip
epmautomate refreshcube                 # push metadata to Essbase so members exist in cubes
```
Gotchas:
- `uploadfile --overwrite=true` is **invalid** (`EPMAT-7`). Use `deletefile` then `uploadfile`.
- `importsnapshot` on a bad zip → `21000: Invalid filesystem … in MDF` (usually missing `sourceInfo.xml`).

## 4. Validating what's actually live (NOT the maintenance snapshot!)
- `downloadfile "Artifact Snapshot.zip"` returns the **nightly maintenance** snapshot (stale, ~07:41).
  It does NOT reflect your import.
- To capture LIVE state: `exportsnapshot "Artifact Snapshot"` (regenerates it now) → then
  `downloadfile` → grep for your `WB_` members. (`exportsnapshot "<newname>"` fails — it re-exports an
  EXISTING snapshot definition, so reuse `"Artifact Snapshot"`.)
- epmautomate writes downloads to `C:\ProgramData\Oracle\EPM Automate\` regardless of cwd — copy from there.

## 5. Data loads
### 5a. File load — UI Data → Import, Source Type = **Essbase** (shows the cube dropdown)
- **Essbase free-form format: NO header row.** A header of dimension NAMES makes Essbase treat
  "Account","Employee",… as members and "Data"/"Value" as an unknown member →
  **`Essbase Error: 1003121` (unknown member), Records Read: 0.**
- Each row = one member per dimension + the value last, comma-delimited. Quote members with spaces
  (`"No Year"`, `"No Entity"`). **Every cube dimension must appear** (don't forget Subsidiary).
- Workforc employee-property intersection (from the Manage Employee form XML — see §POV, the
  values below are the CORRECTED, form-matching ones, not the undefined-member guesses):
  `Period=BegBalance, Years=No Year, Scenario=NSP_Forecast, Version=NSP_Base, Currency=USD,
  Subsidiary=SUB_2, Class=NSP_Undefined_Class, Location=NSP_Undefined_Location`, then
  Employee, Department, Account=property, value.
- Property value encodings (**verify these**): JobTitle / WorkInLocation = **smart-list IDs**
  (JobTitle 34-41, WorkLocation 6-11); SalBasis = 1 (Salary); dates = number (form's Date Format
  dropdown, e.g. `20261001` for YYYYMMDD or `2026-10-01` for YYYY-MM-DD); Bonus% likely a fraction
  (0.35). Generator: `clients/wedbush/data/*.csv` from the inline Python in the data folder.
- Always **Validate** before **Import** — it dry-runs with no writes.

### 5b. REST data slice — direct cell write/read, no file, no job ✅ WORKING
Tools: `tools/nspb-load-workforce.js` (write) + `tools/nspb-validate-calc.js` (read + run rule).
**IMPORT and EXPORT use DIFFERENT wrappers** — this is the thing that cost hours:

**importdataslice** — wrapper is **`dataGrid`**, pov is a **FLAT** member array (POV members
here are the form-matching ones — `NSP_Forecast` / `SUB_2`, per §POV, NOT `NSP_Budget`/`No Entity`):
```json
{ "cellNotesOption":"Overwrite", "dateFormat":"YYYY-MM-DD",
  "dataGrid": {
    "pov":     ["BegBalance","No Year","NSP_Forecast","NSP_Base","USD","SUB_2","NSP_Undefined_Class","NSP_Undefined_Location","WB_925"],
    "columns": [["SalRate"],["FTE"]],
    "rows":    [ {"headers":["WB_H_MD_INV"], "data":[100000,1]} ] } }
```
Response: `{numAcceptedCells, numRejectedCells, rejectedCells[]}`.

**exportdataslice** — wrapper is **`gridDefinition`**, pov is `{dimensions,members}` with
members as **array-of-single-arrays** (`[["BegBalance"],["No Year"],...]`):
```json
{ "exportPlanningData":true,
  "gridDefinition": { "suppressMissingBlocks":false,
    "pov":     {"dimensions":[...8 dims...], "members":[["BegBalance"],["No Year"],...]},
    "columns": [{"dimensions":["Account"], "members":[["SalRate"]]}],
    "rows":    [{"dimensions":["Employee"], "members":[["WB_H_MD_INV"]]}] } }
```

**Hard rules learned live (epm12119, 2026-07-23):**
- Rows carry **ONE** dimension only (Employee). Put Department (and every other non-row/col dim)
  in the POV. Multi-dimension rows → 400 "Dimension name must be specified for every member".
- **exportdataslice tolerates only ONE member per axis** — read cell by cell (1 account × 1
  employee). Multi-member columns/rows → same 400 cardinality error.
- **importdataslice: never mix account TYPES in one grid.** Numerics (SalRate/FTE/Bonus%) load
  together, but smart-list accounts (JobTitle/SalBasis/WorkInLocation) reject when grouped — send
  **one grid per smart-list account** — and dates go in their own grid **with `dateFormat`** (a
  date grid mixed with numerics rejects). So load in passes: numerics · one-per-smartlist · dates.
- A grid rejects **wholesale** (whole row in `rejectedCells`) if any one cell is invalid — and the
  first write to an empty block can reject; writing SalRate first "opens" the block.
- pov member names must be EXACT and unique (they self-identify their dimension — no `dimensions`
  list on import). Undefined members: `No Entity` (Subsidiary), `No Year` (Years),
  `NSP_Undefined_Class/Location`. Smart-list values are the numeric IDs; dates `YYYY-MM-DD`.
- **PowerShell `ConvertTo-Json` mangles nested single-element arrays** (`@(,@("x"))` → `{value,Count}`
  → "cannot be parsed"). Build the JSON in Node (`JSON.stringify`) or a raw heredoc, NEVER ConvertTo-Json.
- Reference impls that WORK: the two `nspb-*.js` tools above. The older `nspb-dataslice-load.js`
  used a `slices` wrapper that this pod version rejects — superseded.

### 5c. Running rules — epmautomate beats the REST Jobs API for runtime prompts
- REST `POST /jobs {jobType:"Rules", jobName:"CalcComp"}` → 400 "Value is missing for the runtime
  prompt: Currency" (no clean way to pass RTPs).
- **`epmautomate runbusinessrule CalcComp Currency=USD "Subsidiary=SUB_2" Scenario=NSP_Forecast
  Version=NSP_Base Department=WB_925`** → `completed successfully`. Quote any RTP value with a
  space. epmautomate names each missing RTP one at a time — add them until it runs. **The RTPs
  ARE a POV** — pass the form-matching ones (§POV), or the rule computes the wrong intersection.

### 5d. Two kinds of "calculation" — member formula vs Business Rule (decide which you need)
Not everything that computes needs a rule. Check the member's **Data Storage** in the
dimension CSV (`clients/<name>/metadata/*.csv`) before you plan a load or a rule run:

- **Member formula (dynamic calc).** The account carries a `Formula` and Data Storage =
  `dynamic calc`. It computes **on retrieve**, at whatever POV you read — no rule, no stored
  data. This IS the "change a driver, see it live" behaviour clients love. Example (Wedbush
  NSP_NFS): `WB_AUM_REVENUE` = `"WB_AUM_ASSETS" * "WB_AUM_BPS" / 10000` (dynamic calc). Load
  only the **inputs** (ASSETS, BPS) at the form POV → revenue appears by itself.
  - ⚠️ **You cannot write a dynamic-calc member** — `importdataslice` rejects those cells.
    Loading `WB_AUM_REVENUE` was a real bug (silent rejected cells). Only load `store` members.
- **Business Rule (Calculation Manager).** Stored logic you invoke: Workforce comp
  (`CalcComp`), aggregations (`AggAll` / `AGG ALL WF`), status spreads (`ActiveStatus`). Needed
  when the target is a **stored** member, when you must spread across Periods, or to roll up
  stored parents. Author it in the pod's Calculation Manager; it ships in the LCM as a
  `Calculation Manager Rules` artifact (`.xml`) under `/Global Artifacts`. Run it with
  `epm-run.js runrule` / `runchain` (RTPs = the POV, above).
- **Which for a given ask?** Driver math per leaf (rate × qty, assets × bps, price × units) →
  member formula. Comp with eligibility/proration, anything time-phased, or materializing a
  stored rollup for reporting → Business Rule. Wedbush proved both: revenue = member formula,
  Workforce comp = rules.
- **Stored parents still need an AGG.** Leaf `store` members show after a load, but `never
  share`/`store` **parents** (e.g. Item `WB_Total Products`, `WB_P_ADVISORY`) only populate
  after an aggregation rule runs for that POV. Dynamic-calc parents roll up on their own.

## 6. Order of operations for a clean build
0. **Read the target form's XML for its POV** (§POV) — everything downstream loads to it.
1. Download a real pod snapshot (backup + template).  2. Generate dim/smartlist files (additive).
3. `build-lcm-snapshot.py` → metadata zip → upload/import/refresh.  4. Validate via live exportsnapshot.
5. Build forms (clone+repoint) → snapshot → import.  6. Load data (5a file, or 5b slice) to the
**form POV** — load only `store` members, never dynamic-calc (§5d).  7. Compute:
- Workforce (stored comp) → run `ActiveStatus → CalcComp → AggAll`.
- Revenue (member-formula drivers) → **no rule** for the leaf numbers; run an NSP_NFS
  aggregation only if the stored **parent** rollups (Advisory/Total Products) must show.
8. Validate a known cell: Wedbush MD fully-loaded ≈ $333,000 (rule);
   IVES revenue = AUM 1,085,108,086 × 75 bps = **$8,138,311** (member formula — appears from the
   inputs alone, at `SUB_2 / NSP_Forecast / FY24`).

---

## 7. Symetri Workforce (production, app `NetSuite`, pod `nspb-symetri` ca-montreal-1)

Concrete instance of everything above. Prepared for the 2026-07-23 checkpoint.

### The load — one command, plus the human typing a password
`tools/nspb-load-symetri-workforce.js` reads the 464-row grid
(`clients/symetri/workforce/symetri-workforce-roster-load-SUBMIT.xlsx`, $39.81M,
reconciled against the LIVE dimension) and writes it cell-by-cell via importdataslice.
```
# set the password in YOUR shell (never on the command line, never in the repo):
$env:EPM_PASS = 'the-plaintext'
node tools/nspb-load-symetri-workforce.js --test        # 2 employees, prove the shape
node tools/nspb-load-symetri-workforce.js --yes         # all 464   (add --validate to read one back)
Remove-Item Env:\EPM_PASS                                # clear it afterwards
```
Symetri specifics that differ from Wedbush:
- POV members: `Base / Forecast / SUB_4 / USD / No Year / BegBalance / No Location`.
  Undefined class = **`Undefined_Class`** (no `NSP_` prefix on this tenant), subsidiary
  is **`SUB_4`** (Symetri USA), NOT `No Entity`.
- **Class varies per employee** (253 are `Undefined_Class`, the rest carry a real
  `CLASS_x`), so Class rides in the per-row POV alongside Department — one grid per row.
- SalBasis smart-list `WF_Salary_Basis`: **Salary = 1**, Hourly = 2. Everyone is 1.
- Loaded accounts: SalRate, FTE, SalBasis, StartDate, EndDate. JobTitle is deliberately
  NOT loaded — 215 of Eric's titles are not in the `WF_JobTitle` smart-list; he is mapping
  them separately. Benefit plans are costs in Eric's file, not plan elections, so skipped.

### After the load — run the rules and read the total back
```
node tools/epm-run.js symetri runchain workforce --yes
#   Update Workforce -> CalcComp -> AggAll -> ADMIN - Aggregate WF Expenses
node tools/epm-run.js symetri exportdata Employees_load       # the roster read-back job
node tools/epm-run.js symetri download Employees_load.zip
```
`Employees_load` is a real Export Data job already defined on the pod; it returns the
exact Stat-Accounts × Employee slice, so it doubles as validation. (It confirmed on
2026-07-22 that only 2 employees had roster data — the cube was effectively empty, so
this load is not overwriting anything.)

### The "missing" employees — do NOT create them
Comparing Eric's file to the LIVE dimension (not the June LCM) leaves only **6** with no
`EMP_` member, **all $0**: 5 terminated (the sync doesn't carry terminated employees) +
`Smoky Mountain` (test record). Building an Import Dimension LCM for them adds no
compensation and risks orphan members. `clients/symetri/workforce/Employee-missing-members-import.csv`
is kept only as a record of the investigation — it is stale and should not be run.
The earlier "20 active employees missing / $2.86M at risk" was a stale-snapshot artifact,
fully retracted; see WORKFORCE-LOAD-RUNBOOK.md §0.
