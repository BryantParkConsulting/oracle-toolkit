# Changing dimension members without losing any

OutlineLoad will happily remove members, and the job that does it can report success. Treat
every metadata load as a potentially destructive operation.

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
