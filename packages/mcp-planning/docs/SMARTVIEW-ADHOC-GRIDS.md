# Authoring a Smart View ad-hoc grid offline

How to write an `.xlsx` that Smart View will Refresh and Submit against, without opening
Smart View to build it first. Useful for handing an admin a targeted correction — a set of
intersections to clear, a slice to re-enter — instead of driving the write yourself over REST.

**An ad-hoc grid is not an application object.** Nothing has to be created in the tenant: it is
an Excel sheet of member names plus Refresh / Submit Data. That is what makes it the right
vehicle when the client, not you, must be the one to press the button.

## The layout

Take it from the grid builder, not from what a sheet looks like by eye. With **M** column
dimensions and **N** row dimensions, every cell is classified by position:

| Condition | Cell holds |
| --- | --- |
| `r < M` **and** `c < N` | nothing — the blank corner block |
| `r < M` | a **column**-dimension member |
| `c < N` | a **row**-dimension member |
| otherwise | data |

```
        <-------- N -------->  <------ data columns ------>
   ^    ┌───────────────────┬───────────────────────────────┐
   |    │                   │  col dim 1 member ...         │
   M    │   blank corner    │  col dim 2 member ...         │
   |    │                   │  col dim M members  <- vary   │
   v    ├───────────────────┼───────────────────────────────┤
        │ row dim members   │  data cells                   │
        └───────────────────┴───────────────────────────────┘
```

Three rules follow, and each one is a way people get it wrong:

**A POV dimension is a column dimension with exactly one member.** It is not a caption line
floating above the grid, and it does not sit in the row-header columns. It gets its own header
row and repeats across the entire data area. Seven POV dims plus an Account dimension means
**eight header rows**, not one "POV:" line.

**The corner block must be empty.** Those blank cells are what tell Smart View that the first
N columns carry row members and the first M rows carry column members. Writing `Employee`,
`Department`, `Class` there as friendly headings looks tidy and breaks the retrieve — Smart View
tries to resolve them as members.

**Every populated cell is a member name.** No titles, no `POV →` labels, no notes in the margin.
Anything explanatory belongs on a separate sheet. Use member names, never aliases, if the
application has duplicate aliases across dimensions.

Members on the outer column dimensions repeat across the data columns in a cartesian unroll:
with block size *b* = the product of the sizes of the dimensions after it, column *p* of
dimension *i* shows member `(p // b[i]) % size[i]`. Put the dimension whose members should vary
across the columns last.

## Clearing data through a grid

Type `#Missing` in the data cells and Submit. Same mechanism as any other submit, so the same
rules apply — the submitter needs write access to the intersection, and the cells must not be
dynamic-calc or never-share.

Build the grid so it addresses only the intersections you intend to clear, and so the ones you
want preserved are **not referenced anywhere on the sheet**. If the good data lives at
`Undefined_Class` and the junk at `CLASS_6`, a grid that mentions only `CLASS_6` cannot damage
the good data even if someone submits it twice by accident. That property is worth more than a
warning in the instructions.

Clear the accounts in reverse of the order you loaded them: whichever account opened the block
on the way in goes out last.

## Worked example

195 employees carrying stale roster properties at their business-area class, to be cleared while
leaving `Undefined_Class` untouched. N=3 row dims, M=8 column dims (seven POV + Account):

```
      A            B          C           D            E       F         G           H
 1                             BegBalance   BegBalance  ...     ...       ...         ...
 2                             No Year      No Year     ...
 3                             Forecast     Forecast    ...
 4                             Base         Base        ...
 5                             USD          USD         ...
 6                             SUB_4        SUB_4       ...
 7                             No Location  No Location ...
 8                             SalRate      FTE         SalBasis  StartDate  EndDate
 9    EMP_5471     DEPT_27    CLASS_6      #Missing     #Missing  #Missing   #Missing   #Missing
10    EMP_413763   DEPT_36    CLASS_6      #Missing     #Missing  #Missing   #Missing   #Missing
```

A generator that produces exactly this shape is in the NSPB repo at
`clients/symetri/workforce/build-clear-grid.py`; the header comment carries the same cell
classifier so the two stay in step.

## Verifying before you hand it over

Refresh should return the current values in the data area. If cells come back empty when you
expect data, the grid is not addressing what you think — check the corner block first, then
whether a caption slipped into a member cell. A retrieve that silently returns nothing looks
identical to an intersection that genuinely holds nothing, so confirm against a REST read of
the same intersection before concluding either way.
