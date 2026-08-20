# Loading data

## The file shape

An Import Data job in Planning expects the same shape the matching Export Data job produces.
The reliable move is to export first and mirror the header exactly.

```
Account,BegBalance,W01,W02,...,W53,Point-of-View,Data Load Cube Name
Planned Supply,,295.27,284.45,...,"No Class,No Entity,LOC_01,No Department,Load,ITEM_1001,No Relationship,Working,Forecast,USD,FY26",Plan
```

- Column 1 is the member from the dimension the job is keyed on (usually Account).
- The value columns are the members of the dimension spread across columns (usually Period).
- `Point-of-View` is a **quoted, comma-separated list holding one member for every remaining
  dimension**. Order does not matter to the loader, but it must be complete.
- `Data Load Cube Name` is the plan type.

Get the POV string by exporting a row that already has data and copying its `Point-of-View`
verbatim, then changing only what you mean to change. Hand-assembling it from the dimension
list is where mistakes enter.

## Values

- **Numbers** load as plain decimals.
- **Dates** load in the job's `/DF` format — commonly `MM-DD-YYYY`, and single-digit month and
  day are accepted (`9-6-2026`).
- **Smart lists** load by their *label*, not the internal id (`Yes`, `VB2 (0.25-0.55)`).
- **Text** loads as-is.
- An **empty cell means "leave alone"**, not "clear". Clearing requires `#MISSING` or a clear
  rule; a data load cannot blank a cell by omitting it.

## The job

Most pods have one Import Data job already defined, and its `importFileName` is fixed. Your zip
must contain a file with **that exact name** regardless of what you call it locally:

```python
with zipfile.ZipFile("mydata.zip", "w", zipfile.ZIP_DEFLATED) as z:
    z.write("whatever.csv", "LOAD_01_Sales_History.csv")   # the name the job expects
```

Read the expected name out of the job definition rather than guessing:
`Global Artifacts/Jobs/Import Data/<job>.xml` → `importFileName`.

## Two mistakes that cost real time

**Zipping a file Python has not flushed.** If you build the CSV with a bare
`csv.writer(io.open(...))` and zip it in the same breath, the file on disk may still be empty
and the load fails with `Input file "X.csv" does not contain a header record` — which sounds
like a format problem and is not. Always write inside a `with` block, then zip.

**Assuming the load applied.** Export the same intersection back and look at the values before
you build anything on top of them. A load can report success and write to a POV one member off
from the one you meant.

## Generating plausible demo data

When inventing data for a CRP or demo, derive it from figures the model already computed rather
than from a random range. Calibrating a supply figure against real demand makes the numbers
defensible; a flat or arbitrary series produces a screen a domain expert dismisses in seconds —
a supply line twenty times the demand it serves is noticed immediately.

Use a fixed random seed so the data is reproducible across rebuilds, and be careful that the
figure you calibrate against is the same one the form will display: summing an export without
filtering can double-count across revisions or customers and inflate everything.

## `downloadFile` writes to `C:\ProgramData\Oracle\EPM Automate\`

Not the current directory, and not anywhere `cd` can influence — the command reports
`downloadFile completed successfully` and the file is simply somewhere else. Every
downloaded artifact and every per-command `.log` lands in that one directory.

This matters because the real error detail for a failed job lives in the job's
`errorFile`, and the loop is: set `errorFile` in the job definition → run the job →
`downloadFile <errorFile>` → unzip from `C:\ProgramData\Oracle\EPM Automate\`. The CSV
inside carries the actual message, which is usually far more specific than the
`EPMAT-1:` line printed on the console.

## Parent members cannot receive data

Obvious for sparse dimensions, easy to forget for the dense ones. `YearTotal` is a
**dynamic** parent of `Period` — a load targeting it fails regardless of density or
version type. Target level-0 periods (`TP1`…`TP12`).

The related trap is on the write side: writing to a parent needs a version whose
**Version Type is `target`**, and the member must not be dynamic. In a SuiteSuccess
app `TopLevelDrivers` is the existing target version; `Base` is `bottom up` and will
refuse the write with no useful message.

## Load level 0, and know whether the parents will show anything

Check `Data Storage (Plan)` on the parents before deciding where to load:

- **dynamic calc** parents roll up on retrieve. Load level 0 and the totals appear.
- **store** parents do not. Level-0 data alone leaves every rollup — and therefore every
  summary form — blank until an aggregation rule runs for that POV.

In a SuiteSuccess NetSuite app the financial hierarchy is `store` all the way down
(`CBL_Expense` → 66 `FLI_` line items → 221 `GL_` accounts), so a level-0 load shows
nothing on a P&L form until an AGG runs.

Two consequences worth planning around:

- `ILvl0Descendants(<parent>)` in an export returns the **GL** accounts, not the line items.
  Exporting that to check a load you made against the `FLI_` level comes back looking empty
  and sends you hunting for a problem that is not there. Use `IDescendants(...)` to see the
  parents too.
- Writing directly to a parent is possible — but only under a version whose **Version Type
  is `target`**. Under a `bottom up` version the cell simply refuses input, with no useful
  message.

For a demo that has to look right before the aggregation rules are deployed, load level 0
*and* the computed rollups in the same file, and reconcile them in the generator so the
numbers tie. Say so in the file's header comment: it is scaffolding, and the AGG replaces it.

## `#missing` does not clear a smart-list cell

Writing `#missing` into an enumeration (smart list) account through an Import Data job is
accepted — `importdata completed successfully`, no exception file — and **the old value stays**.
The next rule that reads the account still sees the value you thought you erased.

The symptom is confusing because it looks like the *rule* is wrong: you clear a flag, re-run the
calc, and the flag's effect is still there.

To clear one, load the entry that means "nothing", by **id or label**:

```
Forecast Line Status,...,1,...,"<pov>",Plan     # 1 = the neutral entry
```

Design the list so a neutral entry exists. Giving the smart list a **Missing Label** makes empty
cells render as that word, so a stored neutral entry and a truly empty cell look identical on the
form — which is what you want, since only one of them is reachable by a data load.

Corollary when reading back: an export shows the *label*, not the id, so the check is
`== "Removed"`, not `== 4`.

## Export Data returns the stored ancestor for a dynamic-calc POV member

Putting a `dynamic calc` member in the `/EDD` POV does not give you its calculated rollup —
it comes back with the value of its nearest stored ancestor. Both `Total Cost Center` and
`CBL_Branches` returned exactly the `TD` figure, before and after a change to a leaf below
them, which reads as "the rollup is broken" when the cube is fine.

So do not verify an aggregation this way. Read the level-0 members (one POV member per
export) and sum them yourself, or check the rollup in a form. The `/EDD` POV takes exactly
one member per dimension and rejects functions there — `ILvl0Descendants(...)` in the POV
is an error, not a fan-out.

Account behaves differently and does aggregate in the export: `CBL_Expense` came back as the
correct sum of its rubros. The limitation shows up on the sparse dimension in the POV.

## Load into the version the form actually reads

An easy hour to lose: loading a top-down total into `Base` while every form points at the
`target` version. The load succeeds, the export confirms the number is in the cube, and the
form still shows blank cells — because it is reading a different version.

Check the form's POV first, then load there. In a top-down flow the whole chain — planner
input, the allocation's output, and the override — belongs in the same target version.
