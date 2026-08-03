# Deliverables — which document, for whom

The same extraction feeds four documents. They exist separately because they have
different readers, and a document that tries to serve all of them serves none well.

All four are generated from `clients/<client>/`, need nothing extracted a second time,
and require Chrome with `--remote-debugging-port=9222`.

---

| document | reader | length | script |
| --- | --- | --- | --- |
| **Executive Brief** | CFO, sponsor | ~2 pages | `netsuite-exec-brief.js` |
| **Account Analysis** | GSA, account team, discovery | ~15 pages | `netsuite-abr-full.js` |
| **NSPB Integration Discovery** | Planning delivery team | ~6 pages | `nspb-integration-pdf.js` |
| **Optimization Review** | client's admin / technical team | ~4 pages | `netsuite-optimization-pdf.js` |

```bash
CLIENT=<c> CLIENT_NAME=<Name> node packages/reports/netsuite-exec-brief.js
```

```bash
CLIENT=<c> CLIENT_NAME=<Name> node packages/reports/netsuite-abr-full.js
```

```bash
CLIENT=<c> CLIENT_NAME=<Name> node packages/reports/nspb-integration-pdf.js
```

```bash
CLIENT=<c> CLIENT_NAME=<Name> node packages/reports/netsuite-optimization-pdf.js
```

---

## Executive Brief

Three questions, nothing else: how the business is doing according to the system, what we
found, and where we would start. No module inventory, no configuration tables, no jargon.

Findings are emitted only when the evidence exists, and each one is written the way a CFO
would care about it — "you cannot currently see the profit on an individual event", not
"projecttask = 0".

## Account Analysis

The long one, and the only one that covers everything: business profile derived from the
data, P&L and seasonality, customer concentration, cost composition, module inventory,
connected ecosystem, the Planning data foundation, and recommendations split into three
tracks (inside NetSuite / for an EPM implementation / to clarify before scoping).

Use it for an account business review, a discovery session, or scoping.

## NSPB Integration Discovery

Written for whoever will scope or build the Planning implementation. What the Account
dimension will look like, which segment dimensions the data can actually support, the
tagging coverage that decides granularity, reconciliation feasibility point by point, and
which saved searches the integration would need.

## Optimization Review

Configuration that appears unused: never-populated custom fields, accounts with no activity,
dormant script deployments, inactive workflows. Every finding carries the caveat that would
make it a false positive — recommending the deletion of a field written once a year by a
year-end script is worse than recommending nothing.

---

## What they share

- **Every figure is measured.** Nothing is estimated or benchmarked from outside.
- **An absence is reported as `unknown`**, never as `absent` — SuiteQL cannot distinguish a
  disabled feature from one the integration role cannot see.
- **Everything prescriptive is a suggestion to validate**, not a conclusion.
- **Sections are conditional.** If the underlying data was not extracted, the section is
  omitted rather than filled with blanks. An empty section in a PDF usually means a missing
  extraction phase.
- **English, `en-US` number formatting**, no internal commercial language.

## Adding a fifth

`packages/reports/_shell.js` holds the data loading, the brand tokens, the shared CSS, the
cover and the CDP render. A new deliverable is a file that requires it, builds its content,
and calls `renderPdf`. Look at `netsuite-exec-brief.js` — it is the smallest one.
