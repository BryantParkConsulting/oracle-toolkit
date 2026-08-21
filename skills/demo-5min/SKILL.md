---
name: demo-5min
description: Run the five-minute Oracle Toolkit demo — NetSuite discovery, chart of accounts, custom fields, then the NSPB Account dimension packaged for LCM and the saved search definition. Use when Bruno says "demo", "la demo de 5 minutos", "demo del toolkit", or is about to present the toolkit to an audience.
---

# The five-minute demo

Three acts on a stopwatch, driven from a snapshot so nothing can fail in front of a room.

```bash
node skills/demo-5min/demo.js all
```

## What it is, and what it is not

Every figure is **real**, extracted from the PRA account by the normal pipeline. What is
staged is the *timing*: it replays `clients/pra/` instead of calling SuiteQL now, so each
run takes the same time and cannot break on an expired token or a throttled endpoint.

The banner on screen says "replayed offline". Leave it there. If someone asks whether it is
live, the honest answer is that the data is real and the connection is not being made now —
and the same commands run live against any account with a token.

## The three acts

| act | what the audience sees | machine |
| --- | --- | --- |
| `1` | Connect, probe 101 record types, pull 445 GL accounts, find the Program fields among 3,187 | ~6s |
| `tech` | Who owns which objects, 46% of deployments dead, integrations holding live tokens | ~4s |
| `2` | Map NetSuite account types to Planning members, generate `Account.csv`, package for LCM | ~4s |
| `3` | The saved search definition and the equivalent SuiteQL, written to a file | ~3s |

Act `tech` is aimed at the ERP side of the room — the rest speaks to consultants. Drop it
if the audience is purely commercial.

**The machine takes 15 seconds. You take five minutes.** That is the point — the toolkit is
fast and the talking is the demo. So `all` stops between acts and waits for you to press
enter, which is where you explain what just appeared. For a rehearsal that runs straight
through:

```bash
HANDS_FREE=1 node skills/demo-5min/demo.js all
```

Run them separately if you prefer three deliberate commands over one with pauses:

```bash
node skills/demo-5min/demo.js 1
```

Pace control changes how long each progress line lingers — useful if the projector is slow
or the room is reading along:

```bash
PACE=slow node skills/demo-5min/demo.js all
```

`PACE=fast` (0.35x) · `normal` (default) · `slow` (1.8x)

## The script

**Act 1 — "connect to the customer and find what I need"**

> "Real NetSuite account. The toolkit authenticates with a token, probes what the role can
> actually see — 101 record types — and pulls the chart of accounts. 445 accounts."
>
> "Look at the structure: Revenue Site Visit, Cost of Sales Site Visits. Revenue
> Décor/Scenic, Cost of sales Décor/Scenic. The chart is already built for margin by
> service line."
>
> "But this is an events agency — the unit of business is the *program*. 3,187 custom
> fields, and six of them are Program fields. Six. Successive implementations, each
> leaving its own behind. One is scripted CUSTBODYCUSTBODY_ — a typo that shipped and
> nobody caught. Deciding which one is authoritative is the first hour of the project,
> and you just did it in six seconds."

**Act tech — "what is this account made of"** *(for the ERP team)*

> "Every custom object attributed to its bundle. NetLease owns 1,217, the Salesforce
> connector 769. Those are not yours — touch one and the next bundle update overwrites it
> silently."
>
> "46% of script deployments never run. 651 Scheduled and MapReduce deployments sitting at
> NOTSCHEDULED. Either they are leftovers from implementations that ended, or something
> that should be running is not. Nobody knows without asking, and now you can ask
> precisely."
>
> "integrator.io has held tokens since 2018. And the NSPB bundle is installed — 230
> objects. Planning is not something to sell them. They own it and are not using it."

**Act 2 — "now build it in Planning"**

> "Same chart of accounts, mapped to Planning. NetSuite account type decides both the
> Planning type and the consolidation sign — get that wrong and the P&L never ties to the
> GL. 403 level-0 members, packaged for Lifecycle Management."
>
> "Nothing was written to the tenant. This is the artifact, ready to import."

**Act 3 — "and how do I get that field in?"**

> "The saved search definition, and the SuiteQL that does the same thing. The toolkit runs
> the second one directly — no round trip to the customer for a screenshot of a search
> somebody built by hand."

## Before you present

```bash
HANDS_FREE=1 node skills/demo-5min/demo.js all
```

Check: terminal at least 90 columns, dark background, font large enough to read from the
back. Output lands in `output/demo/` — that directory is disposable.

## Changing the client

```bash
DEMO_CLIENT=squarespace node skills/demo-5min/demo.js all
```

Any client with a `netsuite/probe.json`, `netsuite/coa.json` and `netsuite/shape.json`
snapshot works. PRA is the one with the richest custom-field story.
