# Changing dimension members without losing any

OutlineLoad will happily remove members, and the job that does it can report success. Treat
every metadata load as a potentially destructive operation.

## An additive change must be incapable of removing anything

The framing that matters: a load whose *intent* is to add a member or set a property must not
be able to delete. Not "check the job's delete setting" -- that makes this sound like a rare
misconfiguration you can screen for. It is not rare. **Any partial metadata file can wipe a
dimension**, because an Import Metadata job may treat the file as the whole dimension rather
than as a delta, and nothing in the file says which it will be.

What that costs, from the incident this came from: a 7-row file meant to add a UDA took an Item
dimension from 182 members to 41. The members' data went with them. Every smart-list value
pointing at them was orphaned -- BoM recipes rendered `Component Item` as raw ids like
`3.482835779077E15`, because members restored afterwards come back with **new Data Ids**, so
the stored ids no longer resolve. The job reported `One or more child jobs have failed`, which
reads like the routine refresh warning, and the 7 UDAs were all set correctly.

So the rule is mechanical, not judgemental:

**Export the dimension, edit that exact file, send it whole.** Never hand-build a file with
only the rows you want. A complete file cannot be misread as a deletion instruction, whatever
the job is configured to do. `scripts/metadata_guard.py` enforces this: it exports a restore
point, refuses a file that omits existing members, and diffs the member set after the load.

**Then count members before and after.** Confirming that your change landed is not
verification -- the property you set can be perfectly correct on a dimension that just lost
three quarters of its members. The count is the check.

**Know the recovery before you take the risk.** Reloading the dimension brings members back
*empty* and leaves every reference to them orphaned. Real recovery is `recreate` followed by
`importsnapshot` from a snapshot that includes Essbase data -- `importsnapshot` over a live
application merges artifacts and does not restore data.

## The safe pattern

1. **Export the whole dimension** immediately before the change. This is your baseline and your
   restore point.
2. **Edit that exact file** — append or modify rows. Do not hand-write a fresh file with only
   the rows you want; a partial file is where members get orphaned.
3. **Assert the delta before sending.** Compare the member set before and after in code:

```python
before = {r["Account"] for r in rows}
# ...append new rows...
after = {r["Account"] for r in rows}
assert after - before == {"My New Member"}, "added something unexpected"
assert not before - after, "a member disappeared from the file"
```

   Note the row count and the *distinct member* count are different numbers — shared members
   repeat a name under another parent, so a dimension can legitimately have more rows than
   members. Assert on both, separately.

4. **Export again after the load and diff against the baseline.** This is the step people skip.
   A member can vanish even when it was present in your file, if the refresh child job fails
   partway. The only way to know is to count.

## Field semantics that surprise people

**An empty field means "do not change", not "clear".** To blank a property you generally need
an explicit sentinel — `<none>` for formulas, an explicit value for others. This matters when
cloning a row as a template: an inherited alias you left in place will be applied, and two
siblings sharing an alias fails the cube refresh.

**Formulas go only in the cube-specific column.** Every account in a working app carries
`Formula = <none>` and `Formula (Plan) = <the script>`. Setting *both* makes OutlineLoad drop
the formula silently — the member imports as `dynamic calc` with no formula and computes
nothing, with no error anywhere. Multi-line formulas are fine; the newlines survive CSV quoting.

**Clear identity fields on new rows.** When you build a new member by copying an existing row
as a template, blank `UUID`, `Data Id`, `Old Name`, `Old Unique Name` and any alias columns you
do not intend to reuse. Leaving a UUID in place makes the load ambiguous about which member you
mean.

## Aggregate storage (ASO) cubes reject some hierarchies

A reporting cube is usually ASO, and ASO will not accept a parent whose children all aggregate
`~`:

```
Aggregate storage outline requires dynamic hierarchies to have at least one child to
consolidate by addition, subtraction, multiplication, division, or percentage. Parent: <X>
```

For accounts that only make sense in the planning cube, set `Plan Type (<Rpt>) = false` and
`Plan Type (<Details>) = false` rather than fighting the aggregation. Scoping them out is
correct anyway — a planning-only assumption has no meaning in a reporting cube.

## Alternate hierarchies

To add a second rollup over existing members — grouping SKUs by format, by value band, by
whatever the source system does not carry — add a top member plus its groups, then repeat the
leaf members as **shared** rows under the new groups:

- The alternate top member must aggregate `~` into its parent. With `+` every leaf counts twice
  and every total in the application doubles. This is the one detail that makes an alternate
  hierarchy alternate rather than a bug.
- The shared rows carry `Data Storage = shared` in the generic column **and** the cube-specific
  one. If `shared` is missing, OutlineLoad **moves** the member instead of sharing it and the
  primary hierarchy loses it.
- Verify afterwards that the primary parent still has all its children and that none of them
  came back marked shared.

A sanity check worth running: the alternate top's total should equal the primary parent's total,
and the grand total above them both should be unchanged.

## Never ship an `Operation` column you did not intend

A dimension CSV exported from a pod ends with an `Operation` column. Values there are
executed on import — `delete` removes the member, and with it every child and all its data.
An additive load simply omits the column (or leaves every cell blank), which is a merge.

So when you build a load file by editing an export, check that column before you upload:

```
head -1 dim.csv | grep -i operation      # is it even there?
grep -ci delete dim.csv                  # must be 0
```

The risk is highest exactly when you are being careful — round-tripping a real export to
change one property is what puts a live `Operation` column in your file.

## `Data Type` controls how the number reads on the form

A rate loaded as `0.05` shows as `0.05` unless the member says otherwise. Set
`Data Type = percentage` on the account and the same stored value renders as a percentage.
Do not "fix" it by loading `5` instead — every formula referencing the member would then be
off by 100×.

Apply it per member, not per branch: in a drivers hierarchy the growth rates are
percentages while a ratio like profit-per-employee-dollar is not.

## `Account Type` and `Time Balance` decide whether the totals are right

Members created without these two land on the default `revenue` / `flow`, and nothing
complains — the numbers are simply wrong in a way that only shows up on a report:

- `flow` on a balance-sheet account makes YearTotal the **sum of twelve months** instead of
  the closing balance, so assets come out roughly 12× too big.
- `revenue` on an expense inverts variance analysis.

Set them per family: expense → `expense`/`flow`/`expense`; revenue → `revenue`/`flow`/
`non-expense`; asset → `asset`/`balance`; liability → `liability`/`balance`; equity →
`equity`/`balance`.

Check the whole subtree, not the members you just added — GL accounts arriving from an ERP
mapping are exactly where the default hides.

## Contra-accounts need `Aggregation = -`

A provisions rubro sitting under assets with the default `+` **adds** the provision to the
asset it is meant to reduce. Gross loans 41.5M plus a 7.0M provision reads as 48.5M when
net loans are 34.5M. Give the contra rubro `-` and keep the lines inside it summing
normally — it is the rubro as a whole that subtracts.

Netting the provision into the gross line instead would hide the split the credit committee
needs to see, so keep both and let the aggregation operator do the work.

## Where the input goes decides the storage

`dynamic calc` parents roll up on retrieve and cannot be written to; `store` parents can be
written to (under a `target` version) but do not roll up. So the storage follows the flow:

```
GL account   store          <- the ERP loads here
line item    dynamic calc   <- aggregates its GLs by itself
rubro        store          <- the planner's top-down input lands here
CBL_ total   dynamic calc   <- read-only total
```

Making everything `store` — the easy default — means nothing aggregates and every rollup
has to be loaded by hand or rebuilt by an AGG. That is a scaffold, not a design.

## Never Share on a rollup member silently breaks every form above level 0

`Never Share` and `store` both **hold** data; neither aggregates on the fly. A rollup member
with either storage shows whatever the last `AGG` left there — and if no rule aggregates that
dimension, it shows nothing at all, while level 0 underneath is full of data.

The symptom is a form that opens blank at a total and shows numbers as soon as you drill to a
leaf. Check the storage of every member *between* the total and level 0, not just the total:
one `Never Share` link in the middle severs the whole chain.

Rollup members that nobody loads into should be `dynamic calc`. Reserve `store` for members
that genuinely receive data.

Changing a member from `store`/`never share` to `dynamic calc` discards anything stored at that
member, so move the data to level 0 first, verify it arrived, and only then change the storage.

## Exporting a dynamic calc POV member returns more than the branch you asked for

Export Data resolves a `dynamic calc` POV member into the stored members that actually hold
data — and not only the ones under the member requested. Asking for `Relationship = CBL_Projects`
comes back with `No Relationship` rows too, which belong to a different branch entirely.

Totals computed by summing such an export are wrong. Filter the returned rows by the POV column
before adding anything up.
