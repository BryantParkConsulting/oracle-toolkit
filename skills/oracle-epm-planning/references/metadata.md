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
