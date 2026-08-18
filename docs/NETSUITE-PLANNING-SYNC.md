# NetSuite recurring planning sync

This pipeline is the operational bridge between a NetSuite account and a planning data store. It is deliberately separate from `netsuite-export.js`, which remains the broad assessment and discovery snapshot.

## Guarantees

- NetSuite access is read-only SuiteQL over the existing TBA integration.
- A run processes explicit accounting periods, not an opaque full-history refresh.
- Account, Subsidiary, Department, Class, Location, Item and Relationship use NetSuite internal IDs as stable source keys. Names and account numbers are aliases, not keys. Relationship is sourced from standard NetSuite Entity and retains its source type (Customer/Job/Vendor/etc.).
- New source members used by the selected periods enter `source-member-mappings.json` as `unmapped`; unused active catalog members are `available`, inactive members are `inactive`, and members no longer returned by NetSuite remain visible as `retired`. Approved target mappings survive later refreshes.
- Each period is extracted and reconciled independently. Amount and contributing line count must match both for the whole GL and for every account. A zero-sum double-entry total alone is never accepted as sufficient evidence.
- The checkpoint advances only after every selected period passes. Failed runs remain in a `*-staging` directory with their evidence.
- A run manifest records scope, periods, dimension visibility, row counts, controls, warnings and failure details.
- Each period control file retains the independently queried Account totals and line counts so the destination can certify the imported staging slice without trusting only the source summary.

This does **not** yet write facts into WisePlanner. The published run directory is a certified hand-off boundary for that loader. Keeping these steps separate prevents an incomplete NetSuite pull from replacing a trusted Actual slice.

## Commands

```powershell
# First controlled period
node packages/cli/oracle-toolkit.js netsuite sync planning --client pra --scope period --period "Jul 2026"

# A bounded historical range
node packages/cli/oracle-toolkit.js netsuite sync planning --client pra --scope range --from "Jan 2026" --to "Jul 2026"

# Normal recurring run: transactions changed since the last successful checkpoint.
# If the role cannot expose lastmodifieddate, it safely falls back to open/latest periods.
node packages/cli/oracle-toolkit.js netsuite sync planning --client pra --scope affected --lookback 2

# Human-readable evidence of what ran and which periods are certified
node packages/cli/oracle-toolkit.js netsuite sync status --client pra
node packages/cli/oracle-toolkit.js netsuite sync status --client pra --json
```

Use `--scope all` only for an intentional initial backfill. Prefer a range so that a failed historical period can be corrected and rerun in isolation.

## Files

```text
clients/<client>/integration/netsuite/
├── state.json                         successful checkpoint by period
├── source-member-mappings.json        persistent source ID → target member decisions
└── runs/
    ├── <run-id>/                      certified published run
    │   ├── manifest.json
    │   ├── dimensions/*.json
    │   ├── facts/<period-id>.json
    │   ├── controls/<period-id>.json
    │   └── source-member-mappings.json
    └── <run-id>-staging/              failed or interrupted run evidence
```

Client data remains under `clients/` and is gitignored.

## Custom segments

NetSuite custom segment tables and source columns vary by account. Do not guess them. Relationship is already handled through the standard Entity table; other segments must be confirmed through the discovery snapshot and added with a client-local config:

```json
{
  "customDimensions": [
    {
      "key": "relationship",
      "table": "customrecord_example_relationship",
      "id": "id",
      "name": "name",
      "parent": "parent",
      "inactive": "isinactive"
    }
  ]
}
```

Pass it with `--config=clients/<client>/integration/netsuite/config.json`. Adding a member catalog does not automatically add that segment to financial facts: its transaction-line field must also be verified before extending the fact contract.

## Scheduling policy

Schedule the `affected` command only after a single period and a short range have passed. A production sequence should be:

1. extract changed members and affected periods;
2. reconcile each source period;
3. publish the certified run;
4. load/replace only those Actual periods in the planning store;
5. run planning aggregations and financial validations;
6. notify owners with the run ID and evidence link.

Never advance the planning Actual version or send a success notification merely because the SuiteQL request completed.
