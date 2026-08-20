# Export Data and Import Metadata jobs

Jobs are LCM artifacts under `Global Artifacts/Jobs/<type>/<name>.xml`, holding a JSON blob in
a CDATA block. Creating one is cloning an existing job's XML, editing the JSON, and importing
it as a snapshot. That is usually faster and more repeatable than clicking through the UI, and
it lets you version the definition.

## Export Data: the `/EDD` selection

```
"<group 1>","<group 2>","<group 3>",<cube>
```

Three quoted groups then the plan type. Members within a group are comma-separated; functions
like `ILvl0Descendants(X)` and `IDescendants(X)` are allowed.

**Every dimension in the cube must appear exactly once across the three groups.** Miss one and
the job fails with:

```
EPMAT-1:Required job parameter is missing : cube
```

which names the wrong thing entirely — the cube is right there at the end of the string. When
you see that error, count your dimensions before touching anything else.

A working example from a 13-dimension cube:

```
"BoM Quantity,Component Item","BegBalance",
"FY18,Forecast,Base,USD,No Entity,CUST_01,No Relationship,No Item,
 ILvl0Descendants(Member Lines),No Location,Load,REV_01",Plan
```

The safest way to build a new one is to copy the `/EDD` of a job you have already run
successfully and change only the member lists — the shape is easy to get subtly wrong.

## Exports do not return dynamic calc members

This is not documented anywhere obvious and it will waste an afternoon. A member whose
`Data Storage` is `dynamic calc` — including dynamic-calc parents used as rollups — comes back
empty from an Export Data job even though a form displays it correctly.

Consequences:
- You cannot verify a dynamic-calc formula through an export. Verify it on a form, or
  temporarily verify the stored inputs it reads and compute the expected value yourself.
- Reading a total at a dynamic parent (`All <something>`) returns nothing. Export the level-0
  members and sum them, or read a stored parent if one exists.

## Never diff two exports from different jobs

Each Export Data job has its own scope buried in `/EDD`, invisible in the output file and in
the file name. Comparing a baseline taken with one job against a result taken with another
produces a diff that reads exactly like catastrophic data loss — hundreds of thousands of cells
"gone" — when the second job simply never covered those versions or scenarios.

Before treating any before/after diff as evidence: confirm both files came from the same job,
and sanity-check which Version and Scenario members actually appear in each.

## Import Metadata jobs: one dimension per job

A job's `dimsMap` can name several dimensions. A job that names several is a job that can
damage a dimension you were not thinking about — including, in one case, deleting hundreds of
members from a dimension the operator believed was untouched.

Create a single-dimension job by cloning a known-good one and swapping the dimension:

```json
"dimsMap": { "Item": { "jobPropMap": { "/D": "Item", "/I": "Item.csv", ... } } }
```

Change `/D` (dimension), `/I` (file name inside the zip), and the log/exception file names.
Leave the rest of `jobPropMap` alone — the flags are load-bearing and copying a working set is
safer than reasoning about them.

Keep `isRefreshDB: true` so the outline refresh runs, but see the note in SKILL.md: the
embedded refresh can fail where a standalone `refreshcube` succeeds, so a job reporting
`One or more child jobs have failed` does not by itself mean the metadata was rejected.

## Reading a job's real scope

To find out what a job actually does, read its definition rather than its name:

```
Global Artifacts/Jobs/Export Data/<name>.xml     → jobPropMap./EDD
Global Artifacts/Jobs/Import Metadata/<name>.xml → dimsMap keys
Global Artifacts/Jobs/Import Data/<name>.xml     → importFileName
```

A job called something reassuring can still be scoped to a slice, or to every dimension at once.

## Import Data jobs — the working recipe

This one cost the better part of a day. Copy the job definition and the file layout
below and it loads first try.

### The job

```json
{"importFileName":"test.csv","location":3,
 "logFileName":"<user>_OLULog.txt","exceptionFileName":"<user>_OLUException.txt",
 "locationDetails":"","errorFile":"Loading_Test_Data_err.zip","customMissingValue":"",
 "jobPropMap":{
   "/A":"NetSuite", "/I":"test.csv", "/DL":"comma", "/DF":"MM-DD-YYYY", "/LR":"true",
   "/-IMD":"",                          <- APAGA Include Metadata
   "/SDM":"<autodetect>",               <- deduce la dimension de carga del header
   "/C2A":"(<ignoreUndefined>,@Plan*)",
   "/-UCH":""}}
```

**`/-IMD` is the switch you are looking for.** A leading `-` on an OLU switch *disables*
that feature, so `/-IMD` = "no Include MetaData". Without it the job's Include Metadata
box comes up ticked and the file is read as a metadata load. Do **not** reach for `/D`
or `/TR` to fix that — both tick the box themselves:

- `/D` names a load dimension → metadata mode. Symptom:
  `Unrecognized column header value(s) were specified for the "Account" dimension: "TP1", …`
- `/TR` → ticks the box for any value, `"true"` and `""` alike.
- Neither, and without `/-IMD`/`/SDM` →
  `A load dimension name (/D option) must be specified if an input file (/I option) is specified.`
  That message reads like a demand for `/D`. It is not. Add `/SDM":"<autodetect>"`.

`/CU` is **not a valid switch** — `Invalid switch / Unrecognized switch: /CU:Plan`. The cube
is named by a column in the file, never by the job.

### `location: 3` is the repository ROOT, not `inbox/`

`epmautomate uploadFile <file>` with no second argument puts the file where the job looks.
Upload it to `inbox` and the job answers `File test.csv does not exist.`

The other values are all dead ends: `4` means a browser-side local upload, so the file
never exists server-side (`x.csv (No such file or directory)`) no matter where you put it;
`2` and `5` are rejected with `The parameter locationDetails is invalid`.

### The file layout

```
Account,BegBalance,TP1,…,TP12,AdjPct,AdjUnit,Point-of-View,Data Load Cube Name
DRV_OpexGrowth,0.04,#missing,…,#missing,#missing,#missing,"FY26,Forecast,TopLevelDrivers,BSD,TS,TD,No Class,No Location,No Relationship,No Item,Load",Plan
```

- Column 1 is the **load dimension** (Account), one member per row.
- Then **every driver member of Period**, including `AdjPct` and `AdjUnit`. Dropping the two
  Adj columns because they look like export-only noise breaks the header before the cube is
  resolved, and you get the badly-worded
  `Unable to set temporary driver members, cannot find cube with name ""`.
- Cells with no value are **`#missing`**, never blank.
- `Point-of-View` holds every remaining dimension as one quoted, comma-separated list.
- `Data Load Cube Name` is the last column, and it is the only place the cube is named.

To get this header for an app you do not know, run an **Export Data** job over the target
intersection and read the header row it emits — it is exactly the import header, and it
works even when the slice is empty.

### The diagnostic trap that hides all of the above

The job reads a fixed filename from the repository root. A stale file of that name sits
there from an earlier attempt, so **the error stays identical no matter how you fix the
CSV** — you end up "fixing" a file the job never reads. Delete both copies before every
attempt:

```
epmautomate deleteFile test.csv
epmautomate deleteFile inbox/test.csv
epmautomate uploadFile <local>	est.csv     # no destination = root
epmautomate importData Loading_Test_Data
```

Success looks like `importData completed successfully` / `Outline load finished successfully.`
Anything else: set `errorFile` in the job, `downloadFile` it, and read the CSV inside — the
console `EPMAT-1:` line is far vaguer than the real message.

### Verify by reading back, not by trusting the log

Point an Export Data job at the same intersection the form uses and confirm the values are
there. That closes the loop; a clean import log alone does not prove the data landed where
the form reads.

### Keep the artifact path and the listing entry in sync

Typed subfolders (`Jobs/Import Data/`, `Jobs/Export Data/`, …) work, but `info/listing.xml`
must give the job's real folder in `path`/`pathAlias`. A mismatch — or an entry left behind
after you delete a job XML — fails the whole snapshot import with
`The import file (…/X.xml) was not found for artifact`. Regenerate job entries by walking
the `Jobs/` tree rather than hand-editing.

**LCM never deletes.** Dropping a job from the snapshot leaves it live in the pod with its
old parameters. Removing it is a UI action.
