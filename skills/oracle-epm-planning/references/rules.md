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
