# BPC Claude plugins

Shared Claude Code / Cowork skills for the Bryant Park Consulting team.
Install once, use in any project — no cloning the app, no code, no GitHub
account needed.

This repo is public on purpose so anyone at BPC can install with zero setup.
It contains prompts and a report template only — **no credentials, no client
data, no account ids** (and none may ever be committed here).

## Install (two commands)

**Easiest — plain terminal (PowerShell/Terminal), no interactive UI:**

```
claude plugin marketplace add brunogallo-bpc/bpc
claude plugin install bpc-netsuite@bpc-plugins --scope user
```

(Or just paste those two lines into any Claude Code chat and ask Claude to run
them for you.)

Alternative, inside an interactive Claude Code session: `/plugin marketplace add
brunogallo-bpc/bpc` then `/plugin install bpc-netsuite@bpc-plugins`.

Update anytime with `claude plugin marketplace update bpc-plugins`.

### Prerequisite: connect NetSuite (one time, per person)

These commands read NetSuite through **your own** NetSuite connector — the
plugin ships the *skills*, not the access. Each teammate adds the NetSuite
connector to their Claude (Settings → Connectors) and signs in with their own
NetSuite login (or a shared BPC service account). Nobody's credentials are in
this repo.

## What you get — `bpc-netsuite` (read-only)

| Command | What it shows |
|---|---|
| `/ns-client <name>` | A customer's id, its jobs/SOWs, and contacts |
| `/ns-hours <job>` | Contracted/budgeted vs used vs remaining hours for a SOW |
| `/ns-timelog <job> [days]` | Recent time entries — date, consultant, hours, task |
| `/ns-savedsearches [filter]` | Saved searches available to you (and run one) |
| `/ns-query <SuiteQL>` | Run any read-only SuiteQL and get a table |
| `/ns-hours-report <client>` | **BPC-styled hours PDF + client Slack draft** (the MS deliverable) |
| `/ns-hours-note <client>` | Paste-ready hours block for a **Customer Hub note** (renders as a table) |

The `/ns-` view commands are read-only. `/ns-hours-report` is the Managed
Services deliverable: it pulls the hours from NetSuite, fills the bundled
BPC-styled template (`templates/hours-report.html`) for you to **Save as PDF**,
and **drafts** the client Slack post — it never sends without your explicit
confirmation, and keeps every internal figure out of the client-facing output.

**Extra prerequisite for `/ns-hours-report`:** the **Slack** connector on your
Claude (for the post step), on top of NetSuite.

## For BPC maintainers — add or change a skill

- A command is one markdown file in `plugins/bpc-netsuite/commands/` — frontmatter
  (`description`, `argument-hint`) + a prompt body. `$ARGUMENTS` is what the user
  typed after the command.
- Bump `version` in `plugins/bpc-netsuite/.claude-plugin/plugin.json` when you
  ship a change; teammates get it via `/plugin marketplace update`.
- List any new plugin in `.claude-plugin/marketplace.json`.
- Keep it read-only. If you ever add write actions, put them in a separate,
  clearly-named plugin so "view" stays safe to hand to anyone.

## Publishing rule (maintainers)

This repo is **public**: never commit credentials, tokens, NetSuite account
ids, client names, or client data. Skills must reference connectors
generically — each user brings their own NetSuite/Slack auth.
