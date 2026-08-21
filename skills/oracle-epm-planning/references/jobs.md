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
