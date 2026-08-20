# Data forms

Forms are built by cloning a shipped form's LCM XML and editing the three axes: `<pov>`,
`<columns>`, `<rows>`. Every defect below imports clean and shows no error — the form simply
opens wrong.

## Each dimension exactly once across the three axes

The cube has N dimensions and a form must place every one of them, exactly once. Repetition
*within* one axis is fine and normal — that is what `<segment>` is for — but a dimension
appearing on two different axes is silently resolved by the POV, and the rows then point at a
member where no data lives. Every row suppresses away and the form is empty.

Assert it after generating the XML:

```python
byaxis = {}
for ax in ("pov", "columns", "rows"):
    blk = re.search(r"<%s\b.*?</%s>" % (ax, ax), xml, re.S).group(0)
    byaxis[ax] = set(re.findall(r'<dimension[^>]*\bname="([A-Za-z ]+)"', blk))
allp = set().union(*byaxis.values())
assert not [d for d in allp if sum(1 for a in byaxis if d in byaxis[a]) > 1]
assert len(allp) == N_DIMENSIONS
```

The related error is a member placed under the wrong dimension — easy to do when a rename chain
uses positional `str.replace(..., 1)` calls. It surfaces as
`The member <X> does not exist for the specified cube or you do not have access to it`, where
the member plainly does exist. Planning is looking for it in the wrong dimension. Build each
axis explicitly from a template rather than patching a clone with ordered replacements.

## `IDescendants` is not valid, and Planning deletes it

Only `ILvl0Descendants`, `Descendants` and `Children` are accepted in a form definition.
`IDescendants` is not rejected — the import strips the whole `<function>` block and leaves the
bare anchor member, so the form opens showing exactly one row.

For "the parent plus everything under it", write the member on its own followed by the function:

```xml
<member name="X" selectionType="Auto" />
<function name="Descendants" offset="0" >
  <member name="X" selectionType="Auto" />
</function>
```

## Hide a POV dimension only when the value comes from elsewhere

Using a user variable instead of a hardcoded member is right. Hiding the dimension as well is
right *only* when the value is genuinely set somewhere else in the planner's context.

When the dimension is the planner's main choice on that screen — which recipe, which component,
which customer — hiding it produces a form that opens empty with no way to fix it from the
screen. Keep the variable as the default and leave the dimension visible.

Check too that the variable's member range can actually reach the members the form needs. A
variable scoped to `IDescendants(Finished Goods)` cannot select a component, so a form about
components resolves to nothing. Widening the range is a one-line change to
`Configuration/User Variables.xml` and is usually the real fix.

## Rows that look merged in pairs

Before rebuilding anything: **this is almost always display scaling, not the form.** Rows are
defined at `height="22"` px; at 125%/150% OS scaling or a fractional browser zoom the rounding
alternates between 27 and 28 px and borders group in twos. Shipped forms show it too. Check
`Ctrl+0` and compare against a form you did not build.

On the tag itself, Planning normalises `suppressMissing` on import — every form in the pod ends
up with `<rows height="22" >` regardless of what the imported XML said. Do not spend time on it.
If you do assert on the tag, match the `<rows>` tag itself and not the whole document: the form
options block contains `suppressMissingBlocks`, whose name contains the same substring and
defeats a naive `"suppressMissing" not in xml` check.

## Showing two things that live at different intersections

A form can only hold one member per dimension per **segment**, but it can hold several segments,
each fixing its own members. That is how you put two heterogeneous blocks on one screen — for
example a demand figure stored per revision and per customer, directly above a supply figure
stored globally:

```
segment 1   Class=All Revisions  Tracker=Level 2  Relationship=All Customer  → Demand
segment 2   Class=No Class       Tracker=Load     Relationship=No Rel.       → Supply, Gap
```

The dimensions those segments fix live on the rows axis, not the POV, so the earlier
"exactly once across axes" rule still holds.

## Accounts that are blank at a parent

Aggregation `~` means "do not roll up", and assumption-type accounts are usually left out of the
AGG whitelist on purpose — summing days or percentages across items is meaningless. A form read
at a parent shows those rows empty while `+` accounts show totals.

This is correct behaviour and it confuses everyone. Either design the form to be read at level 0
and say so, or put the dimension on the rows so a parent cannot be selected by accident.

## Custom menus

The artifact type is **Custom Menus**. A form references one from inside `<displayOptions>`:

```xml
<contextMenu><menu>My Actions</menu></contextMenu>
```

It surfaces as the right-click menu on the grid. In the menu item, `ruleType` is `graphical`
for a single Calculation Manager rule and `sequence` for a ruleset — check which one you are
pointing at rather than copying whichever example is nearest. `hidePrompt = Yes` launches
without asking.

Prefer the Actions menu over run-on-save for anything that fans out over a dimension: a heavy
rule attached to save makes the form unusable.

## Hierarchy selections use `<function>`, not a function name

A row of `CBL_Expense` shows that one member and nothing else — the total, with no way to
see what is in it. To show the tree, wrap the base member in a `<function>` element:

```xml
<dimension name="Account" displayAlias="true" expand="true" >
  <function include="true" name="Children" offset="0" >
    <member name="CBL_Expense" selectionType="Auto" />
  </function>
</dimension>
```

`include="true"` is the `I-` variant (keeps the base member itself); `name` is `Children`
or `Descendants`. Writing `<member name="IChildren(CBL_Expense)" .../>` instead looks
plausible and fails the **entire snapshot import**:

```
The member IChildren(CBL_Income) does not exist for the specified cube
```

One bad form takes the whole snapshot with it, so validate before uploading.

## A new form needs an entry in `info/listing.xml`

Same trap as jobs. The form XML alone is silently ignored: the snapshot imports clean, the
navigation flow activates, the card appears — and the tab behind it points at a form that
was never created. Nothing errors anywhere.

Symptom: a card exists in the flow but its form does not open. Cross-check the two before
publishing:

```
ls "…/Data Forms/<dir>/"                                  # on disk
grep -o 'name="[^"]*"[^>]*type="Data Form"' listing.xml    # declared
```

Generate the entries by walking the forms directory rather than adding them by hand.

## What each form is *for* decides its POV

Worth settling before designing the grid, because it fixes the POV:

- **Top-down entry** — the planner types a total and a rule spreads it. Department is
  pinned to the top member; the split is the allocation's job, not the planner's.
- **Detail entry** — same scope, opened to the account level.
- **Review** — read-only, and this is where a per-department breakdown belongs. Put it on
  the allocation card, next to the rule that produced the split.

Giving an entry form a department breakdown invites the planner to type where the rule is
about to overwrite them.

Layout that reads well for all three: prior-year Actual and current-year Budget as
read-only reference columns on the left, the editable months in the middle, the year total
on the right.

## Anything the planner picks should be a user variable, not a POV member

A dimension sitting visible in the POV with a fixed member *looks* selectable and is the
wrong thing. The pattern the pod itself uses:

1. Define the user variable once (`Configuration/User Variables.xml`) with the member range
   it may take — a NetSuite pod ships `Department` = `IDescendants(TD)`, plus `Class`,
   `Currency`, `Subsidiary`, `Customer Category`, `Variance Scenario`.
2. In the form, put the dimension in the POV **hidden**, with the variable as its member:

```xml
<dimension name="Department" displayAlias="false" hide="true" displayName="true" >
  <member name="&amp;Department" selectionType="Auto" />
</dimension>
```

3. Declare it on the `<pov>` element:

```xml
<pov enableDynamicUVs="true" dynamicUVs="Department" >
```

`dynamicUVs` takes a comma-separated list (`"Customer Category,Class"`). In the UI this is
*Other Options → Dynamic User Variables*.

The selector then sits above the grid and, unlike a POV member, **persists per user** across
forms and sessions — the planner picks their department once.

Keep a dimension in **rows** instead when it is the axis the form is *about*: an allocation
review compares cost centres side by side, so Department belongs in rows there, not behind
a selector.
