# Workforce roster load — the recipe that works

Distilled from a production OCI Planning pod (NetSuite Planning template, "Workforc"
cube), 2026-07. Loading a 464-employee roster over REST, no Import Data job, no UI.
Everything here is the stuff that cost hours to discover.

## 1. The wire shape (the #1 gotcha)

`POST .../plantypes/{cube}/importdataslice`

```jsonc
{
  "cellNotesOption": "Overwrite",
  "dateFormat": "YYYYMMDD",            // must match how you encode dates
  "dataGrid": {                        // NOT "slices" — that returns HTTP 400
    "pov": ["BegBalance","No Year","Forecast","Base","USD","SUB_4",
            "Undefined_Class","No Location","DEPT_27"],   // FLAT, one member per POV dim
    "columns": [["SalRate"]],          // [[account,...]]
    "rows": [{ "headers": ["EMP_5471"], "data": [97129.2] }]  // headers = non-POV dims (Employee)
  }
}
```

- **`dataGrid`, never `slices`.** `{slices:[…]}` → `400 "field is not recognized: slices"`.
- **POV is a flat member array**, cube evaluation order, **Period first**. Not `{dimensions,members}`.
- The **read** endpoint (`exportdataslice`) is the opposite — there POV *is* `{dimensions,members}`.
- Load **one account per call** if you want per-cell reject reporting; batching multiple
  accounts/rows in one `dataGrid` is possible but you lose the per-cell error detail.

## 2. Where roster properties live — the intersection that bites

Employee properties (SalRate, FTE, SalBasis, StartDate, EndDate…) load at:

```
Period=BegBalance, Years=No Year, Scenario=Forecast, Version=Base, Currency=USD,
Subsidiary=SUB_4, Class=Undefined_Class, Location=No Location, Department=<dept>, Employee=<emp>
```

**Class MUST be `Undefined_Class`, not the employee's business-area class.** The business
area (CLASS_6, CLASS_8…) is for downstream allocation, not roster input. Load properties at
CLASS_6 and `CalcComp` reads `Undefined_Class`, finds nothing, and computes zero — silently.

## 2b. A wrong-Class load does NOT get fixed by reloading — it has to be cleared

This is the trap behind §2, and it costs a week if you miss it. Loading at the business-area
class fails *silently*: CalcComp returns zero, so the natural reaction is to rebuild the grid
with `Undefined_Class` and load again. That second load writes new blocks. **It does not
remove the first ones.** Both survive:

```
EMP_5471 / DEPT_27, SalRate
  Undefined_Class   97,129.20     <- the good load
  CLASS_6           97,129.20     <- the abandoned first load, still there
  TC              194,258.40      <- Total Class now double-counts
```

Symptom the client reports: *"employees appear twice, under different classes"*, and headcount
or salary reads 2x on anything that rolls up Class. It looks like a broken source integration —
it is not. Check the load history first.

Confirm it is real before clearing, because `exportdataslice` returning a value does not by
itself prove the POV was honoured. Read the same employee at a class that should hold nothing
(`CLASS_11`, `CLASS_119`). If the control comes back empty and `CLASS_6` comes back with the
salary, the duplicate is genuine.

**The clear:** write `#Missing` to the same properties, at the `CLASS_x` intersection only,
then run `AggAll` so the Class rollups recompute. Drive it off the *first* load's grid — that
file already holds the exact employee/department/class triples, so no guessing is needed. Never
reference `Undefined_Class` in the clear grid; then an accidental submit cannot touch the good
data.

Either route works, and the Smart View one is usually better with a client in the loop:

- headless — `importdataslice` with `data: ['#Missing']`, one account per grid, same payload
  shape as the load;
- Smart View — generate an ad-hoc sheet of the stale intersections pre-filled with `#Missing`
  and let the admin Refresh / Submit. **An ad-hoc grid is not a tenant object**: it is just an
  Excel sheet of member names plus a Submit, so nothing has to be created in the application to
  make this work.

Clear the dates last-in-first-out (EndDate, StartDate, SalBasis, FTE, SalRate). `SalRate` opened
the block on the way in, so it goes out last.

## 3. Member names, never aliases

This template duplicates aliases (two "Public Sector" classes, three "MFG" departments,
two "Construction"). An alias-keyed grid fails to retrieve. Use `DEPT_27`, `CLASS_6`,
`EMP_5471`, `SUB_4` — the member names, everywhere.

## 4. Period members are TP1..TP12, not Jan..Dec

Reading back comp, the months are `TP1`…`TP12` with a `YearTotal` parent. `&FcstYr1`/`&FcstYr2`
substitution vars gave FY26/FY27; `FcstStartMonth`=TP6.

## 4b. Load the Setup assumptions BEFORE any of this

The roster is only half the input. The **Setup** tab of the Workforce module holds the drivers
every compensation rule reads:

| Form | What it holds |
| --- | --- |
| Company Pay Schedule | workdays and pay periods per month |
| Annual Assumptions | tax capabilities for the budget year |
| Monthly Assumptions | the data that computes the cost of employee benefits |
| Location Assumptions | per-location driver overrides |

With these empty, `Update Workforce` fails outright — *"Error detected while attempting to Run
job: Update Workforce"* is the assumptions error, not a roster error. Salaries can be loaded and
tie to the penny while compensation still computes to nothing, which reads as a broken load and
is not one. Check Setup first.

## 5. Rule order after the load, with runtime prompts

Straight from the NSPB module documentation ("Workforce Calculating data"), which is the
authority here — **not** whatever custom rules happen to exist in the tenant:

> Workforce calculations, after you have loaded all data: `ActiveStatus`, `CopyToPlan`
> (Moves data to Plan), `CalcComp`. Plan calculations, to then see the aggregated data
> on the Plan: `Agg_Select`.

| Order | Rule | Cube | Runs headless? | RTPs |
| --- | --- | --- | --- | --- |
| 1 | `ActiveStatus` | Workforc | **NO — grid rule** | — |
| 2 | `CopyToPlan` | Workforc | yes | — |
| 3 | `CalcComp` | Workforc | yes | `Subsidiary=SUB_4 Scenario=Forecast Version=Base Currency=USD` |
| 4 | `Agg_Select` / `AGG - Select` | Plan | yes | `Subsidiary=SUB_4 Scenario=Forecast Version=Base Currency=USD Years=FY26` |

**`CopyToPlan` is the step people miss.** Workforce's Account dimension deliberately has almost
no income-statement accounts — the calculated earnings, taxes and benefits are *pushed* into the
Plan cube's Expense accounts by a rule. Nothing appears on the OpEx forms or the P&L until it
runs, no matter how correct the roster is.

Do not substitute a same-sounding tenant rule for these. A tenant can carry an `AggAll` that
aggregates Employee/Department/Subsidiary and an `ADMIN - Aggregate WF Expenses` that does
`AGG("Department","Class")` inside Plan; neither one moves data between cubes, so running them
in place of `CopyToPlan` leaves the P&L empty and gives no error. Read the module sequence,
then map it onto the tenant's rule names — not the other way round.

The forms shortcut the same work: **Update Workforce** runs the Workforce calculations and the
transfer to Plan in one go, **Update Financial** runs the Plan-side calculations. Most Workforce
forms have these embedded, which is why a client clicking Save sees results that a headless run
does not reproduce.

**`ActiveStatus` is a Groovy rule that calls `operation.getGrid()`** — it derives Status +
CalcStartDate + CalcEndDate from the hire/term dates, and it only runs from a Planning form.
The Jobs API returns `A method called by the script failed … The property [grid] is not valid`.
Without it, employees have no active period and `CalcComp` produces nothing, even though the
salaries loaded fine. `epm_run_rule` warns on rule names that look grid-bound.

Those three system accounts (`Status`, `CalcStartDate`, `CalcEndDate`) also reject a direct
data load — that is exactly why the grid rule exists. Don't try to fake them; run ActiveStatus
in the UI once, then finish `CalcComp`/`AggAll` headless.

## 6. Auth: a 401 is usually the username format, not "REST is closed"

An **nginx-style HTML 401** (not Planning's JSON error) means the edge rejected Basic Auth —
almost always the username format. `cli/epm-auth-probe.js` tries the common OCI variants and
tells you which returns 200. On this pod the plain email worked.

## 7. Validate by reading back the aggregate

After AggAll, read `SalRate` at `Employee=Existing_Emps / Department=TD / Class=Undefined_Class,
BegBalance, No Year` — it should equal the sum of the source file. Ours tied to the dollar.
