# Verifying without opening the UI

Every other file in this skill ends the same way: *read it back and assert two-sided evidence*.
Until 26.04 the last step of that — "and the form actually renders right" — could only be done by
a human with a browser. It can now be done in two calls. Auth and the wider catalog are in
`rest-api.md`.

## The evaluated form grid

```
GET /HyperionPlanning/rest/v3/applications/{app}/forms/{idOrName}/data
```

| Parameter | Meaning |
|---|---|
| `fields` | `gridInfo`, `pov`, `rows`, `columns` — comma separated. Omit for everything |
| `pageMbrList` | page members to render at |
| `forceStartExpanded` | `true` expands every row and column; `false` (default) honours the form's own settings |
| `filterMembers` | narrow the grid further |
| `displayMemberAs` | `MEMBER_NAME`, `MEMBER_NAME_THEN_ALIAS`, `ALIAS_THEN_MEMBER_NAME` |
| `memberAliasDelimiter` | default `:` |

Required role: any. Use it in two calls — structure first, then contents:

```bash
curl -s -H "Authorization: Bearer $TOK" \
  "https://<pod>/HyperionPlanning/rest/v3/applications/$APP/forms/$FORM/data?fields=gridInfo,pov"

curl -s -H "Authorization: Bearer $TOK" \
  "https://<pod>/HyperionPlanning/rest/v3/applications/$APP/forms/$FORM/data?fields=gridInfo,rows,columns&forceStartExpanded=true&displayMemberAs=MEMBER_NAME_THEN_ALIAS"
```

The response:

```json
{
  "gridInfo": {
    "pageDimNames": ["Product"],
    "allowedPageMembersByDim": { "Product": ["Total Product", "Widget", "Gadget"] },
    "rowDimNames": ["Account"],
    "columnDimNames": ["Year", "Scenario", "Version"]
  },
  "pov":     { "Year": "FY25", "Scenario": "Plan", "Version": "Working" },
  "rows":    [ { "headers": ["Sales"], "data": [12345, 23456] } ],
  "columns": [ ["FY25", "Plan", "Working"] ]
}
```

This is the form after Planning has resolved it, which makes it the direct test for the defects
in `forms.md` — each of which imports clean and shows no error:

| Defect | What the response shows |
|---|---|
| A dimension placed on two axes | it is missing from the `rowDimNames`/`columnDimNames` you expected and has been absorbed into `pov` |
| `IDescendants` stripped on import | `rows` has exactly one entry even with `forceStartExpanded=true` |
| A user variable that cannot reach the members the form needs | the members are absent from `allowedPageMembersByDim` |
| A `~` aggregation account read at a parent | `data` is null at the parent, populated at level 0 — by design, not a bug |
| A starter artifact still pinned to a global master member | `pov` names the old member |

`rows` empty while `gridInfo` is well-formed means the axes are right and the data is somewhere
else. That is a POV problem, not a form problem — go to the triage below.

## The exact intersection

When you need a shape the form does not have, or a single cell:

```
POST /HyperionPlanning/rest/v3/applications/{app}/plantypes/{cube}/exportdataslice
```

```json
{
  "exportPlanningData": false,
  "gridDefinition": {
    "suppressMissingBlocks": false,
    "suppressMissingRows": false,
    "suppressMissingColumns": false,
    "pov":     { "dimensions": ["Year","Scenario"], "members": [["FY25"],["Plan"]] },
    "columns": [ { "dimensions": ["Period"],  "members": [["Jan","Feb"]] } ],
    "rows":    [ { "dimensions": ["Account"], "members": [["Sales"]] } ]
  }
}
```

Response mirrors it: `pov`, `columns`, and `rows` of `{headers, data}`, plus `cellNotes` and
`supportingDetail` when `exportPlanningData` is `true`.

**Turn every `suppressMissing*` off when verifying.** Suppression is what makes a wrong POV look
like a missing rule: with it on you get an empty grid either way, and with it off you can see the
difference between "the cells exist and are `null`" and "the intersection does not exist".

Naming the dimensions in the payload is worth doing — Oracle recommends it for efficiency, and it
also makes the payload self-documenting when it ends up in a diff.

## Triage for an empty form or a rule that writes nothing

In this order. Do not touch XML or Groovy until step 4 is done.

1. `GET .../summary` — orient on the app, dimensions and cubes, if you did not build it.
2. `GET .../forms/{id}/data?fields=gridInfo,pov` — where is the form *actually* pointed.
3. Find a POV that does have data: `exportdataslice` with all suppression off, or export a few
   rows through a job and read the `Point-of-View` column.
4. Diff the two POVs **dimension by dimension**, including the ones you did not think about.
   `No Class`, `No Department`, `No Relationship` and `No Location` are where this usually ends.
5. Only now: `plantypes/{cube}/dimensions/{dim}` to confirm the member exists where you think,
   `dimensions/{dim}/members/{member}` for its `dataStorage`, `substitutionvariables` and
   `uservariablevalues` for what the form and rule resolve at run time.

Step 5 is also the answer to "it is empty for that planner and fine for me" —
`uservariablevalues` carries `userName`, so their resolution is readable without their password.

## When a job reports a failed child

```
GET .../jobs/{jobId}/childjobs/{childId}/details?q={"messageType":"ERROR"}&limit=-1
```

Returns `{msgType, msgCategory, msgText}`. This is the only place the actual cause of
`One or more child jobs have failed` is written; the parent job's status never carries it. Covers
`IMPORT_METADATA`, `EXPORT_METADATA`, `IMPORT_DATA`, `EXPORT_DATA`. Read it *before* running a
standalone `refreshcube` and re-verifying, so you know what you are re-verifying against.

## The two-sided assertion, as code

The point is never one call. It is the pair:

```python
before = form_grid(app, form, expanded=True)
run_rule(app, rule, params)
after  = form_grid(app, form, expanded=True)

changed   = cells_differing(before, after)
assert changed, "rule ran and wrote nothing"          # the thing you intended changed
assert changed <= intended_scope, sorted(changed - intended_scope)   # and nothing else did
```

Both halves matter. A rule that writes the right cells *and* silently clears a neighbouring
Version passes the first assertion on its own, and that is the failure this platform produces
most often.

Same shape for metadata (count and diff the member set against the file you sent) and for data
loads (export the same intersection back). And when the before and after come from Export Data
jobs rather than these endpoints, confirm both came from the *same job definition* — see
`jobs.md`, where comparing two different jobs produced a convincing but entirely fake catastrophe.
