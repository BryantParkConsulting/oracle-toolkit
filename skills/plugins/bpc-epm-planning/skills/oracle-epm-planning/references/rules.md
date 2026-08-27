# Business rules — Groovy and calc script

## Validate is the only diagnostic worth having

Both the CLI and the Jobs console report a Groovy compile failure as
`EPMAT-1:An unknown error occurred when executing the script`. No line number, no message. The
**Validate** button in Calculation Manager is the only thing that returns the real compile
error with a position. Ask for a Validate before every deploy of a rule you have edited, and
treat a rule that "runs successfully but writes nothing" as a possible silent compile failure
until you have seen it validate.

Deploy itself does **not** need a human — see the next section — but Validate does, so batch
rule changes when you want someone to eyeball a compile before a run.

## Deploying without the UI

Calculation Manager's **Deploy** button has no API. It is an ADF postback to
`/calcmgr/faces/cmshell`, it shows in the pod access log as `CalcMgr / Partial Deployment`, and
`epmautomate` has no deploy command — the CLI's own action definitions inside `epmautomate.jar`
(`actions/PLANNING/*.json`) confirm it.

An LCM import can still deploy a rule. What does it is **not** the `<deployobjects>` block, which
is the natural suspect and is wrong. Two probe rules, identical apart from the block, imported in
a single snapshot on a 26.07 pod:

| rule | `<deployobjects>` | Planning-side artifact | `runbusinessrule` |
|---|---|---|---|
| A | yes | no | `job with specified name and type was not found` |
| B | no | yes | ran |

The deployment is the **Planning-side artifact**:

```
HP-<App>/resource/Cube/<Cube>/Calculation Manager Rules/<Rule Name>.xml
```

and it carries no `<deployobjects>` of its own — the block only ever appears on the Calculation
Manager copy. Ship the HP artifact and the rule is callable immediately; ship only the
`CALC-Calculation Manager/resource/Planning/<App>/<Cube>/Rules/<Rule Name>` copy and the rule
lands in Calculation Manager undeployed no matter what the block says.

Why the block gets the credit: a full build snapshot contains **both** trees, so the HP artifact
rides along unnoticed and the correlation with `<deployobjects>` looks causal. Include the block
anyway for fidelity with what Calculation Manager itself exports — just do not rely on it.

So a rule change ships **both** artifacts: the CALC copy so Calculation Manager shows the current
source, and the HP copy because that is what Planning executes. Patch only the CALC side and you
get a rule that reads correctly in the UI and runs the old logic — the worst of both.

The two copies escape differently: the CALC artifact is XML-escaped (`&amp;`, `&lt;`, `>` left
literal) while the HP artifact wraps its script in `CDATA`. Patch each in place; never generate
one from the other through an unescape/re-escape round trip.

**Rulesets are not covered by this.** Adding a rule to a ruleset sequence still needed a human
Deploy.

**Packaging**: the outer `Import.xml` names the application folder —
`filePath="/CALC-Calculation Manager"`, `filePath="/HP-<App>"`. Copying the `filePath="/"` that
an application's own inner `Import.xml` carries fails with a bare
`EPMAT-1:Command failed to execute`. Use literal artifact names in `pattern`, not a wildcard.

`scripts/deploy_rule.py` builds and imports such a snapshot, emitting both artifacts:

```bash
python scripts/deploy_rule.py --app NetSuite --cube Plan --rule "MY_RULE=my_rule.csc" --run
```

`--rule NAME=FILE` is repeatable, so a batch deploys in one import. `--type groovy` for Groovy.
Snapshot names are timestamped because re-uploading a name already on the pod fails outright.
`--dry-run` builds the zip without touching the pod.

Sessions expire, so store the password once and later runs are unattended:

```bash
epmautomate encrypt YOUR_PASSWORD anykeyphrase C:\path\to\pod.epw
epmautomate login USER C:\path\to\pod.epw https://<pod>.oraclecloud.com
```

## Groovy traps

**Never XML-escape `>`.** Planning does not unescape `&gt;` before compiling, so every closure
arrow `->` arrives broken. Escape only `&` and `<`.

**No `+` on lists.** Static type checking reads `myList + [x]` as `myList` followed by unary
`+[x]` and fails with `Cannot find matching method java.util.List#positive()`. Use:

```groovy
List<String> l = new ArrayList<String>()
l.addAll(base)
l.add(extra)
```

**No nested multi-line list literals** inside grid-builder calls. Build the lists first, then
pass the variables.

**A rule that only writes data must end with `return null`.** A returned String is executed as
a calc script.

`getFormattedValue()` reads text and smart-list accounts fine. Smart lists in a calc script are
resolved with the `HSP_ID_` idiom:

```
@MEMBER(@CONCATENATE("HSP_ID_", @HspNumToString("My SmartList Account"->...)))
```

## Do not assume `OR` short-circuits

Essbase evaluates both sides of a boolean condition. A guard written as
`IF (a == #MISSING OR f(a) ...)` will still evaluate `f(a)` on the missing case, and if that
function cannot handle it the rule aborts — taking out everything downstream. Structure the
guard as nested `IF`s instead of relying on short-circuit behaviour.

## Patching an existing rule

Starter rules are often long and mechanically repetitive — the same block unrolled per tracker,
per level, per revision. Patch them with an exact string replacement per block and **assert the
count**:

```python
for n in range(1, 51):
    old = pattern_for(n)
    assert t.count(old) == 1, "block %d matched %d times" % (n, t.count(old))
    t = t.replace(old, new_for(n), 1)
assert done == 50
```

Then check structural invariants on the result — but compare them to the original rather than
to an ideal. A shipped, working rule may already have unbalanced-looking counts (one starter
rule carries 106 `IF(` against 105 `ENDIF` and works fine). The invariant that matters is that
your patch did not *change* the difference:

```python
assert (new.count("IF(") - new.count("ENDIF")) == (old.count("IF(") - old.count("ENDIF"))
```

Parentheses should balance exactly, and `FIX(`/`ENDFIX` should match.

## Watch the breadth of a FIX

A `FIX` spanning every customer × every item × every location × every week, with a member-block
assignment inside, is a block-creation hazard even when the assignment sits behind a false
condition. Scope the FIX to what the rule actually needs to touch.

## Where a rule reads its drivers

Before changing what a rule consumes, find the intersection it reads from. A per-customer model
does not imply per-customer drivers: an explosion rule may read its effective dates, its
selections and its flags at the **global master member** while iterating customers. Loading
those drivers per customer then changes nothing at all, and the rule quietly keeps its old
behaviour.

Confirm by reading a driver back from the exact POV the rule names, not from the POV you assume.

## A range with a substitution variable inside `@ISMBR` fails silently

```
IF ((@ISMBR(&FcstYr1) AND @ISMBR(&FcstStartMonth:TP12)) OR @ISMBR(&FcstYr2))
```

This never evaluates true. The rule finishes `completed successfully`, touches nothing, and
gives you no reason at all — the worst failure mode there is. Put the range in the FIX
instead, where it expands reliably and also narrows the blocks Essbase walks:

```
FIX(…, &FcstYr1, &FcstStartMonth:"TP12", …)
```

Two FIX blocks (one per year) beat one FIX plus an inner IF.

**Prove a rule wrote something before believing it.** Load a sentinel — `-999` at the target
intersection — run the rule, and read it back. If the sentinel survives, the rule did not
write; if it is `0`, the rule ran and its arithmetic produced zero. `completed successfully`
distinguishes neither.

Related traps in the same family, all of which end in a rule that runs and does nothing:

- **Sparse blocks that do not exist yet.** Assignments into a non-existent block are
  discarded. `SET CREATENONMISSINGBLK ON;` at the top, or pre-create by loading zeros.
- **Metadata changed but the cube not refreshed.** `@RELATIVE("TD", 0)` reflects the Essbase
  outline, not Planning's. Run a Refresh Database job after any hierarchy change.
- **A member grafted at the wrong place.** A dimension CSV loaded with an empty `Parent`
  puts the member at the dimension root — a *sibling* of the intended parent, not a child.
  `@RELATIVE("TD", 0)` then misses the whole subtree. Always give `Parent` explicitly.

## The rule's name lives inside the artifact, in two places — not in the filename

Cloning a working rule to make a new one is the right instinct, and the trap is that the
name is **inside** the XML, twice:

```xml
<rule id="1" name="ALLOC_CostCenter" product="Planning">
…
<deployobject … name="ALLOC_COSTCENTER"/>      <- uppercase
```

Rename the file and swap the script, and LCM still reads the name from inside: the artifact
imports **on top of the template's rule**. Clone the same template three times and all three
land on that one rule, overwriting each other — the import reports
`completed successfully` every time.

The symptoms are baffling until you know this:

- a rule you "fixed" keeps throwing an error your new code no longer contains, because the
  file never reached it;
- a rule runs clean and writes nothing, because it is executing another rule's script;
- an error naming a member that appears in none of your rules — it came from whichever
  clone landed there last;
- and a new rule simply does not appear in Calculation Manager.

`objectName=` is not the attribute — it does not exist in this format. Rewrite both:

```python
t = re.sub(r'(<rule\b[^>]*\bname=")[^"]*(")',         r'\g<1>%s\g<2>' % name,         t)
t = re.sub(r'(<deployobject\b[^>]*\bname=")[^"]*(")', r'\g<1>%s\g<2>' % name.upper(), t)
```

Then assert that the only names left in the file are the two you intended. Do this check in
the packaging code, not by eye — the failure is silent at every later step.

Worth pairing with the sentinel test above: a sentinel proves whether *a* rule wrote, and
this check proves *which* rule you actually deployed. Chasing the calc script while the
wrong artifact is in the pod is unfalsifiable — it cost most of a session here.

## Drop the `%Script(...)` header when building the artifact yourself

A rule exported from Calculation Manager often starts with

```
%Script(name:="Housekeeping",application:="NetSuite",plantype:="Plan")
```

Keep it when you clone that whole artifact. **Remove it** when a script is packaged into an
artifact built from scratch (`deploy_rule.py`): the directive belongs to a Calc Manager
*Script* object, not to the body of a rule, and Planning rejects the rule with

```
EPMAT-1:Invalid Calc Script syntax [

%]
```

The message points at a lone `%` and says nothing about the directive, so it reads like a
stray character in a comment. It is not — percent signs inside `/* */` are harmless. The
first line of the script should be the first real statement (`SET …` or `FIX(`).

## Deploying a rule without the UI: it takes two artifacts, not one

A business rule lives in two places, and Planning needs both:

```
CALC-Calculation Manager/resource/Planning/<app>/<cube>/Rules/<Name>          the code
HP-NetSuite/resource/Cube/<cube>/Calculation Manager Rules/<Name>.xml         the registration
```

Ship only the first and the rule shows up in Calculation Manager while Planning denies it exists:

```
EPMAT-1:A job with specified name and type was not found.
```

Attaching it to a form silently does nothing too. The second file is byte-identical to the
first — same `HBRRepo` — it just has to be listed under the app with `type="Rule"` and
`path="/Cube/<cube>/Calculation Manager Rules"`.

### A rules-only snapshot needs its own manifest

A zip containing just `CALC-Calculation Manager/` is rejected with `EPMAT-1:Invalid snapshot`
before LCM looks inside. The root needs `Export.xml`, `Import.xml` and `size.txt`, where
`Import.xml` carries the Calculation Manager task:

```xml
<Task>
  <Source type="FileSystem" filePath="/CALC-Calculation Manager"/>
  <Target type="Application" product="CALC" project="Foundation" application="Calculation Manager"/>
  <Artifact recursive="true" parentPath="/" pattern="*"/>
</Task>
```

### Runtime prompts must be declared as variables

The `/*RTPS: {var} */` comment tells the Groovy engine to expect the prompts; it does not
create them. Without a matching `<variable>` in the artifact's `<variables>` block the rule
refuses to start:

```
EPMAT-1:Unable to retrieve variable prjUbicacion deployed in application NetSuite
```

Only `type="member"` and `type="string"` appear in practice. A member prompt on a custom
dimension takes `<property name="dimensionInputMode">name</property>` plus the dimension
name in `dimensionType`.

## Groovy: never use GString interpolation in a rule

Planning scans the **text** of a rule for `{token}` and treats each one as a runtime prompt.
A Groovy interpolation has exactly that shape, so this line:

```groovy
guiones << """FIX("${sub}", "${ver}") ... """
```

deploys cleanly, validates cleanly, and then fails the first time a planner saves the form:

```
Unable to retrieve variable sub deployed in application NetSuite
```

Build the script with concatenation instead. The scanner does not skip comments either — a
comment that merely *mentions* a brace-wrapped name triggers the same error, so keep braces
out of the prose as well. The failure surfaces at save time, never at deploy time, which is
what makes it expensive to find.

## `operation.grid` exists only inside a form operation

`runOnLoad="true"` in the form XML is the classic calc-script hook and runs the rule **without
a grid**. A Groovy rule that touches `operation.grid` there greets the planner with a red banner
the moment the form opens:

```
The property [grid] is not valid for the current operation.
```

Oracle's Groovy-only "Run After Load" and "Run Before Save" are separate options. Whatever hook
you use, guard the access, so a gridless invocation exits quietly instead of breaking the form:

```groovy
def grilla = null
try { grilla = operation.grid } catch (ignorado) { }
if (grilla == null) return
```

## Writing to a cell whose intersection is dynamic calc

A top-down adjustment typed at a parent (rubro x total department x YearTotal — three dynamic
calc members) cannot be stored, and dropping any of the three to `store` breaks the
aggregation the form exists for. The working pattern is grid-level, not cube-level:

1. A rule on form load opens the cells: `celda.forceEditable = true`. This affects the grid
   only — it never promises Essbase will persist anything.
2. A rule on save reads `celda.edited`, spreads the value across the level-0 intersections
   (weighted by an existing measure so the mix is respected), and closes the cell again with
   `forceEditable = false` — otherwise Planning tries to persist the dynamic intersection and
   the save fails.
3. The parent re-aggregates to exactly what the planner typed.

Verified end to end: 50,000 entered on a rubro spread across 38 cost centres and aggregated
back to 50,000.00, deviation 0.00000000.

## Assumptions live outside the operating rollup — check every rule agrees

In a NetSuite-derived app, `No Department` is a child of the **root** of the dimension, not of
the total-department member. Anything parked there is invisible to every total: it never
reaches the P&L, the cost-centre allocation, or any form pointed at the rollup.

That is the right home for institutional rates and pools, precisely because they must not be
summed. But it splits the model in two, and every rule has to be on the correct side:

- A rule that **reads** an assumption must read it at `No Department`.
- A rule that **propagates** assumptions to another year must write to `No Department` — not to
  `@RELATIVE(<total department>, 0)`, which scatters copies across cost centres where nothing
  looks for them.

Writer and reader disagreeing produces no error at all. The rule reports success, the
assumption is simply never found, and the calculation quietly falls through to its
`#MISSING` branch. The tell is an outer year that comes out *exactly* equal to the year it
was supposed to grow from — a ratio of 1.0000 is a missing rate, not a zero rate.

## Two rules writing the same Tracker will overwrite each other

When a driver rule assigns `"Load"` across `@RELATIVE(<expense parent>, 0)`, it owns *every*
account under that parent — including the ones a different rule is responsible for. The second
rule's result survives only until the first one runs again, so the number disappears on the
next recalculation rather than at the moment of the mistake.

Carve the exceptions out of the driver's scope explicitly:

```
@REMOVE(@RELATIVE("CBL_Expense", 0), @RELATIVE("FLI_Other_Costs___PBI", 0))
```

Ordering the rules differently only hides it: whichever runs last wins, and on-save chains do
not run in a guaranteed order across forms.

## Of the two rule artifacts, the Planning-side one is what actually executes

Deploying a change to `CALC-Calculation Manager/.../Rules/<Name>` alone is not enough: the
rule keeps running its **previous** code. `runbusinessrule` reports success, the calculation
completes, and the result is simply the old logic — the most misleading failure mode there is,
because nothing anywhere says the new script was ignored.

The copy under `HP-NetSuite/.../Cube/<cube>/Calculation Manager Rules/<Name>.xml` is the one
Planning executes. The Calculation Manager copy is what the editor shows.

**Always deploy both snapshots together**, and treat "I changed the rule but the numbers did
not move" as a stale Planning-side registration before suspecting the logic.

## Compile-checking a form rule without opening the form

A Groovy rule that touches `operation.grid` can still be run standalone once it carries the
grid guard: it compiles, finds no grid, and exits. That turns `runbusinessrule` into a free
syntax and static-type check, which matters because Groovy rules compile with static type
checking on and a wrong method name is a hard error the planner would otherwise discover:

```
Compile Error: [Static type checking] - Cannot find matching method
oracle.epm.api.model.Application#executeCalcScript(java.lang.String)
```

Two habits that avoid the whole class of problem:

- `executeCalcScript` belongs to **Cube**, not Application: `operation.application.getCube('Plan').executeCalcScript(text)`.
- Call anything uncertain through a `def` reference. Static checking skips it, so a missing
  method fails at runtime where a `try` can catch it, instead of refusing to compile and taking
  the whole rule down.

## "An unknown error occurred when executing the script" means it never executed

Groovy rules compile with **static type checking on**. A method name that does not exist on a
typed reference is therefore a *compile* error, and three things follow that make it hard to
diagnose:

- A `try`/`catch` around the whole script does not help — nothing ran.
- Through `runbusinessrule` the failure arrives only as
  `EPMAT-1:An unknown error occurred when executing the script.`
- Opening the form gives the real message instead:
  `The Groovy script failed to compile ... Cannot find matching method ...`

So: **a bare "unknown error" from epmautomate is the signature of a compile failure**, while a
runtime problem comes back with a line number and text — a `throwVetoException` message, for
instance, surfaces in full. Use that contrast to tell the two apart before hunting for logic bugs.

Two consequences for how to write these rules:

- **Do not introspect the outline unless the method name is certain.** `Member.getChildMembers()`
  is not universally available, and guessing costs a full deploy cycle each time. Where a rule
  needs a member list for validation, generate it into the script at packaging time from the
  dimension CSV — same source of truth, no API risk. Note in the rule that adding a member there
  means redeploying it.
- **Dynamic dispatch is rejected outright.** `member."$methodName"()` does not compile under
  static checking, so the usual trick of trying several method names in a loop is unavailable.
  A `def` reference only helps for *calls whose receiver is dynamic*, not for a GString method name.

## A member-type runtime prompt arrives quoted

`rtps.<name>.toString()` on a `member` RTP returns the name **with its quotes** — `"PRJ_East_Bay"`,
not `PRJ_East_Bay`. Compared raw against a list of member names it never matches, and the user
gets a validation error that lists the very option they just picked. Strip them on the way in:

```groovy
def limpiar = { v -> v == null ? '' : v.toString().replace('"', '').trim() }
```

## A dynamic child cannot be reached by a calc script in the same rule run

`saveMember(map, DynamicChildStrategy.DYNAMIC_IF_AVAILABLE)` creates the member and returns it
with exactly the name you asked for — `getName()` matches, so nothing looks wrong. But the
member occupies a pre-reserved dynamic-child slot that **Essbase knows by its internal
identifier**; the name is not resolvable in the outline yet. A calc script launched from the
same rule looks the member up by text, fails to find it, and falls back to treating the whole
script as a member formula:

```
CalcScriptException -- Error parsing formula for [PRJ_Foo, at or after line:
["SET CREATENONMISSINGBLK ON; FIX(...)"]] (line 1): invalid object type
```

Two things make this hard to place. The message names the *member*, not the script, so it reads
like corrupt metadata. And the same script runs fine against any pre-existing member, so the
script itself is obviously valid.

**Write through Planning's data API instead of a calc script.** Planning holds the member it
just created and resolves the reference by id, so no refresh is needed:

```groovy
def cubo = app.getCube('Plan')
def bld  = cubo.dataGridBuilder('MM/DD/YYYY')
bld.addPov(/* one member per remaining dimension */)
bld.addColumn('TP8')
bld.addRow([cuenta], [0d])
cubo.saveGrid(bld.build())
```

The calc-script route only starts working after a cube refresh — which is why pushing the same
member through an LCM metadata import appears to "fix" it and sends you chasing the wrong cause.

## Setting Data Storage on a new child means setting it per plan type too

`newChildAsMap` seeds the map from the **parent's** properties. When the parent is
`dynamic calc` — as a rollup branch normally is — overriding only `Data Storage` leaves
`Data Storage (Plan)` inherited, and the member ends up dynamic in the cube with no formula.
Essbase then fails to parse a formula for it, and the damage is not limited to that member:
**any FIX that spans the branch breaks**.

Set both, plus the aggregation and plan-type flags, so the new member matches its siblings:

```groovy
nuevo['Data Storage']        = 'store'
nuevo['Data Storage (Plan)'] = 'store'
nuevo['Aggregation (Plan)']  = '+'
nuevo['Plan Type (Plan)']    = 'true'
```

## Reading a dimension from Groovy: the second argument is the Cube, not its name

Hardcoding a member list into a rule — injected at packaging from the metadata CSVs, or
typed by hand — drifts silently. On this engagement the baked cost-centre list said 41 while
the cube had 38, and nobody had noticed. Read the members instead:

```groovy
def app  = operation.application
def cubo = app.getCube('Plan')
def nombres = app.getDimension('Relationship')
        .getEvaluatedMembers('Children(CBL_Projects)', cubo)
        .collect { it.getName() }
```

`getEvaluatedMembers(selection, cube)` takes the **Cube object**. Passing the cube *name* —
`getEvaluatedMembers('Children(X)', 'Plan')`, which is what the signature looks like at a
glance — does not compile, and under static type checking that is not an exception a
try/catch can reach: the whole rule fails to compile and `runbusinessrule` reports only
`An unknown error occurred when executing the script`, never mentioning compilation.

Any member selection the form dialog accepts works as the string: `Children(X)`,
`ILvl0Descendants(X)`, `Descendants(X)`.

`member.getAlias('Default')` is readable, which is how to filter a rollup that mixes
categories — e.g. excluding the `ACCUM DEP` contra-accounts from a fixed-asset rollup when
no member property distinguishes them.

**Constructs verified to compile** (each proven by its own probe, see below):
`.collect { it.getName() }`, the spread operator `*.name` on a direct call result,
`for (x in <call>) { }`, `findAll`, typed closure parameters, `getName()`, `getAlias()`.
What broke was neither: it was **`def cubo` declared twice in the same scope** after a
rewrite added one at the top while the original still sat further down. A duplicate `def`
is a compile error, and it presents identically to a wrong method name.

## Probing a Groovy API when the error message tells you nothing

Because every compile failure collapses to the same sentence, guessing is expensive. Build a
harness instead — the veto message is the return channel:

1. Write a rule whose entire body is one API call ending in
   `throwVetoException('A OK n=' + resultado.size())`.
2. Launch it by **REST**, not epmautomate: `POST /jobs {jobType:'Rules', jobName:'X'}`,
   then `GET /jobs/{id}` and read `details`.
3. A working call returns
   `A method called by the script failed on line: N, with error: A OK n=7`.
   A compile failure returns `An unknown error occurred when executing the script`.

`epmautomate runbusinessrule` collapses **both** to `EPMAT-1:An unknown error occurred`, so
by CLI a successful probe is indistinguishable from a broken one. `GET /jobs/{id}/details`
returns 400 on this pod; the `details` field of `GET /jobs/{id}` is what carries the text.

**Run two controls first**, or you will misread every result: a rule whose body is only
`throwVetoException('CONTROL')` (proves veto text surfaces) and one that is only
`def x = 1 + 1` (proves the XML scaffolding is sound, status `Completed`).

**One API call per rule.** Several in one body with individual try/catch does not work —
a single uncompilable call takes the whole rule down, hiding the ones that would have worked.

## Setting a user's variable values: REST writes, LCM reports success and does not

A form whose POV uses `&Department` or similar does not open for a user with no value for it.
The `User Preferences.xml` LCM artifact accepts a `<UserPreference>` block per user and
imports with `importSnapshot completed successfully` — and the values are not written.
Verified by reading `GET /uservariablevalues` afterwards: still empty.

What works is `POST /uservariablevalues` (**`PUT` returns 405**):

```json
{"items": [{"userName": "u@example.com", "name": "Department",
            "dimension": "Department", "member": "CC_1"}]}
```

It returns `204` with no body — which on this platform proves nothing — so read
`GET /uservariablevalues` back and compare.

There is no application-level default: `<mbrSelection>` in `User Variables.xml` only
constrains which members are *selectable*. Seeding is therefore per user and belongs in the
user-provisioning checklist, not in the metadata.
