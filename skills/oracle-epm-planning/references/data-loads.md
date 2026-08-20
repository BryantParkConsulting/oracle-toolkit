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
