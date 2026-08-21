# Business rules — Groovy and calc script

## Validate is the only diagnostic worth having

Both the CLI and the Jobs console report a Groovy compile failure as
`EPMAT-1:An unknown error occurred when executing the script`. No line number, no message. The
**Validate** button in Calculation Manager is the only thing that returns the real compile
error with a position. Ask for a Validate before every deploy of a rule you have edited, and
treat a rule that "runs successfully but writes nothing" as a possible silent compile failure
until you have seen it validate.

Because deploy needs a human (there is no API for it), batch rule changes so they only have to
click once.

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
