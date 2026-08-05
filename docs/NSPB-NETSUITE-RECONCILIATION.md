# NetSuite ↔ NSPB reconciliation, and writing results into a live Excel

Proven end to end on PRA, FY26: 198 leaf accounts, 7 periods, **0.00 difference**.

Nothing here is client-specific. Onboarding the next tenant is four commands.

---

## 0. Onboard the tenant

```jsonc
// ~/.epm/clients.json  — no secrets, only where to point
"pra": {
  "url":      "https://planning-a565453.pbcs.us2.oraclecloud.com",
  "user":     "someone@bryantparkconsulting.com",
  "passfile": "pra.epw",
  "app":      "NetSuite"
}
```

The password goes in `~/.epm/<client>.pass` (plaintext, for REST Basic Auth) — the human
creates it, we never see it. `.epw` is for `epmautomate` only and **cannot** be used for REST.

NetSuite credentials live in the repo root `.env` (`NS_ACCOUNT`, `NS_CONSUMER_KEY`, …).

Then drop the LCM export in `clients/<client>/lcm/` and unzip it to `extracted/`:

```bash
node packages/mcp-planning/src/lcm-cli.js clients/<client>/lcm/extracted \
                                          clients/<client>/lcm/tenant-kb.json
```

That yields forms, rules, dimensions and substitution variables. **The reconciliation needs
it**: the Planning account roll-up exists nowhere else, so without the LCM there is no way to
know which leaf accounts hang under Net Income.

---

## 1. Reconcile

```bash
node packages/recon/recon-income-statement.js <client> --year FY26 --through TP7
```

Writes `clients/<client>/recon-income-statement-FY26.csv` — one row per account/period with
both sides and the delta — and prints totals, the break count and the worst offenders.

### The three conventions that decide whether the numbers are real

Each of these produced plausible-but-wrong output before it was pinned down.

1. **The sign flips on income accounts ONLY.** The GL carries revenue as a credit (negative)
   while Planning stores it as the statement reads. Expenses and COGS share the same sign in
   both systems. Flipping everything, or flipping nothing, breaks every row — and the totals
   can still look right, which is the trap.
2. **SuiteQL returns period start dates as `M/D/YYYY` strings.** Sorting them as text puts
   October and November ahead of February and silently shifts every account into the wrong
   period. Parse to a real date before ordering.
3. **`Sales Rep` and `Item SubType` are attribute dimensions.** They must not appear in the
   `exportdataslice` POV, or the call 400s.

Also: Planning periods are `TP1..TP12`, mapped to the NetSuite accounting periods ordered by
start date within the fiscal year. `TP6` is the sixth open period, not "June" by name.

---

## 2. Pull a statement

```bash
node packages/planning/nspb-is-to-csv.js <client> --year FY26 --through TP7 --out is.csv
```

Roll-up lines in statement order. For anything else, go straight at the API:

```bash
node packages/planning/nspb-rest.js <client> "applications/NetSuite/plantypes"
node packages/planning/nspb-rest.js <client> "applications/NetSuite/jobdefinitions"
```

`nspb-rest.js` exists because ad-hoc `node -e` one-liners kept getting mangled by the shell —
a `$` inside a regex is enough — and the resulting `Method Not Allowed` reads like an API
problem when it is a quoting problem.

---

## 3. Write it into the workbook the user has open

```powershell
powershell -File packages/planning/write-to-open-excel.ps1 `
  -Csv is.csv -Workbook "pra demo" -Sheet "Income Statement" -Clear `
  -Title "PRA Events, Inc. - Income Statement FY26" `
  -Subtitle "Actual - USD - consolidated (TS)"
```

Attaches to the **running** Excel instance, so the user watches it land. Creates the tab if it
does not exist, reuses it if it does. Never saves — the workbook is left dirty on purpose so
the user decides.

~1.5 s per tab, and almost all of that is the NSPB round trip.

### Why it is fast, and how to make it faster

- **One 2-D array assignment**, not one call per cell. A 12×9 table written cell by cell is 108
  cross-process COM round trips and visibly crawls; as a single assignment it lands at once.
- `ScreenUpdating = $false` and calculation set to manual for the duration of the write.
- The LCM parse is cached as `tenant-kb.json` — never re-parse 767 files.
- Next lever: cache the data slice per close and invalidate on the `LastClosedMonth`
  substitution variable, which is exactly the "the numbers changed" signal.

### PowerShell + COM traps that cost real time

- `$grid[$r + 1, $c]` — the comma binds **before** the `+`, so PowerShell evaluates
  `$r + (1, $c)` and throws *"[System.Object[]] does not contain a method named op_Addition"*.
  Write `$grid[($r + 1), $c]`.
- `Range($cell1, $cell2)` is ambiguous through the PS COM binder and throws *"Unable to cast
  object of type 'System.Double' to type 'System.String'"*. Address ranges as strings: `"A3:I13"`.
- `[char] + [string]` has no `op_Addition`. Cast the char to `[string]` first.

---

## 4. Auth, when it goes wrong

A `401` from a Planning pod, or `EPMAT-9` from `epmautomate`, means **stale credentials**. It
does not mean the tenant blocks Basic Auth, has SSO, or needs OAuth. That misreading cost a
whole detour on PRA — see `NETSUITE-DISCOVERY-LEARNINGS.md`.

`nspb-auth-probe.js` fires six logins back to back. On a tenant with lockout that burns the
account. Try **one** request with the plain email first; if it fails, stop and ask for a fresh
password rather than retrying.
