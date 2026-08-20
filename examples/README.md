# Sample deliverables

Four real engagements, anonymized. Every figure is the one the toolkit measured — only the
proper nouns changed. Client names, legal entities, billed third parties and user emails are
aliased; nothing is estimated, rounded or invented to make a sample look better.

| file | what the toolkit did to produce it |
| --- | --- |
| [`acme-netsuite-abr-full.pdf`](acme-netsuite-abr-full.pdf) | **NetSuite Account Business Review.** Reads the account over SuiteQL: modules across five states, connectors and bundles, micro-vertical benchmark, COA, P&L, seasonality, customer concentration. Ends in recommendations, each carrying the evidence that produced it. |
| [`acme-nspb-current-state.pdf`](acme-nspb-current-state.pdf) | **NSPB Current State Assessment.** What is implemented, what is actually used, and what to simplify — from the LCM export, application audit and Activity Report. |
| [`acme-nspb-cube-optimization.pdf`](acme-nspb-cube-optimization.pdf) | **Cube optimization / performance.** Real block counts from a level-0 export, block distribution, and a deletion plan sized against what is actually stored. |
| [`acme-ipm-predictive-insights.pdf`](acme-ipm-predictive-insights.pdf) | **IPM predictive insights.** Which accounts carry enough history and signal to be worth forecasting. |

## Generating them

Every deliverable renders through Chrome headless over the DevTools Protocol:

```bash
chrome.exe --headless=new --remote-debugging-port=9222 --user-data-dir=<temp> about:blank
```

Then, for a normal client run:

```bash
CLIENT=<client> CLIENT_NAME="<Client Name>" node packages/reports/netsuite-abr-full.js
```

## Demo mode

`DEMO_NAME` produces the anonymized version — the one in this folder:

```bash
DEMO_NAME=ACME CLIENT=<client> CLIENT_NAME=ACME node packages/reports/netsuite-abr-full.js
```

Two layers do the work, and they cover different things:

- `packages/reports/anonymize.js` — the NSPB reports. Aliases audited users, identity
  domains and pod URLs.
- `packages/reports/anonymize-ns.js` — the NetSuite reports. Aliases the client's own legal
  entities and the third parties it bills. `CLIENT_NAME` alone only retitles the document;
  the subsidiaries are in the data, so they need aliasing too.

Check the output before publishing anything. A grep for the client name is not sufficient on
a PDF — the text is inside compressed streams, so search the generated `.html` next to it,
which is plain text.

## Brand assets

The cover pulls its photo, circle pattern and logo from `assets/brand/`. It degrades to a
flat navy cover when they are missing rather than failing the render.
