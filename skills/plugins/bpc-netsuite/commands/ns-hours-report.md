---
description: Build a BPC-styled engagement-hours PDF from NetSuite and draft the client Slack post
argument-hint: <client or job> [days]
---

End-to-end Managed Services hours report for **$ARGUMENTS**. Pull the numbers
from NetSuite, produce a BPC-styled report to save as PDF, and draft the Slack
message for the client — for the MS team to share with the client.

For the deeper variant (invoice attribution + reconciliation + monthly work
log), follow `${CLAUDE_PLUGIN_ROOT}/docs/hours-invoice-playbook.md`. For the
whole client book at once, use `/ns-hub-hours`.

## 1 · Get the data from NetSuite (connected NetSuite SuiteQL tool)

Follow the same logic as `/ns-hours` and `/ns-timelog`:
- Resolve the job (number = job id; else `SELECT id, companyname FROM job WHERE LOWER(companyname) LIKE '%<text>%'`). If several match, ask which.
- Hours (always from `projecttask.actualwork`):
  - Retainer / Managed Services (monthly prepaid blocks):
    `SELECT pt.title, pt.custevent_bpc_prepaid_hours AS contracted, pt.actualwork AS used FROM projecttask pt WHERE pt.project = <jobId> AND pt.custevent_bpc_prepaid_hours IS NOT NULL AND pt.custevent_bpc_prepaid_hours > 0 ORDER BY pt.title`
  - If empty, it's an implementation project — budget by workstream:
    `SELECT pt.title, pt.estimatedwork AS budgeted, pt.actualwork AS used FROM projecttask pt WHERE pt.project = <jobId> ORDER BY pt.id`
- Time log (default last 30 days, or the number in **$ARGUMENTS**):
  `SELECT t.trandate, e.entityid AS who, t.hours, t.memo FROM timebill t LEFT JOIN employee e ON e.id = t.employee WHERE t.customer = <jobId> AND t.memo IS NOT NULL AND t.trandate >= (SYSDATE - <days>) ORDER BY t.trandate`

Compute totals: contracted/budgeted, used, remaining, utilization %. For a
retainer, billable overage = Σ per-line `used − contracted` where positive
(unused hours don't roll over).

## 2 · Build the PDF (BPC-styled)

Read the bundled template `${CLAUDE_PLUGIN_ROOT}/templates/hours-report.html` and
fill every `{{PLACEHOLDER}}`:
- Set `{{CONTRACTED_LABEL}}`/`{{REMAINING_LABEL}}` to **Contracted/Available** for a
  retainer, **Budgeted/Remaining** for a project.
- `{{MONTH_ROWS}}` → one `<tr><td>line</td><td class="num">contracted</td><td class="num">used</td><td class="num">remaining</td></tr>` per line, plus a `<tr class="total">…</tr>`. Add `class="over"` to any used cell over its block.
- `{{TIMELOG}}` → per month, a `<div class="month-block"><div class="mlabel">Month — N hrs</div><table>…</table></div>` with columns date / consultant / hours / task. **Clean the memos**: drop `Offline |` / `Internal |` / `<Client> | <SOW> |` prefixes and commit hashes, collapse newlines. Never include internal-only notes ("non-billable per Finance", "covering X", pending-invoice status) — this goes to the client.
- If there is **no** billable overage, delete the whole `<div class="banner">…</div>`; otherwise fill `{{OVERAGE_NOTE}}` with a client-safe sentence (hours over block × rate = amount, billed separately) — never the internal routing status.

Save the filled file as `<client>-<sow>-hours.html` in the current folder and tell
the user to open it and **Save as PDF** (Ctrl/Cmd+P → Save as PDF, A4). In Cowork,
render it to PDF directly.

## 3 · Draft the client Slack post — DO NOT send without confirmation

Draft a short message for the client's Slack channel:

> *{{CLIENT}} — {{SOW}} hours ({{PERIOD}})*
> Contracted *{{CONTRACTED}}* · Used *{{USED}}* · Utilization *{{UTILPCT}}%*
> [one line: within block ✅ / overage of N hrs billed separately]
> _Full report attached (PDF)._

Ask the user which channel (default: the client's project channel, e.g.
`#project-<client>`), show the draft, and only post it with the Slack connector's
send-message tool **after they explicitly confirm**. Remind them to attach the
PDF they just saved (the Slack API can't attach a local file from here).

## Prerequisites
- NetSuite connector (for step 1) and Slack connector (for step 3) on your Claude.
- The report is client-facing: keep every internal figure/note out of steps 2–3.
