# Oracle EPM MCP — publishing and onboarding

> Technical reference created on 2026-07-26 after reviewing the public GitHub
> repository and the local checkout.

## Handoff for the next chat

Use this section as the starting point when continuing the project in a new
conversation.

### Repository state

- Repository: <https://github.com/BryantParkConsulting/oracle-toolkit>
- Local checkout: `C:\apps\oracle-toolkit`
- Default branch: `main`
- Documentation baseline before this handoff:
  `c59ccaa Translate Claude and ChatGPT guides to English (#2)`
- Working tree was clean and synchronized with `origin/main` before this
  handoff update.
- All public Markdown documentation must remain in English.

### Completed work

- The initial Node.js MCP server is public under the MIT license.
- Local `stdio` transport works with Codex, Claude Code, and compatible MCP
  clients.
- The LCM parser generates a local `tenant-kb.json`.
- Local KB summary, search, and exact-artifact retrieval tools are implemented.
- Read-only Planning tools list applications, jobs, and rules.
- Rule execution exists but is disabled by default and requires explicit
  confirmation.
- Snapshot restore is intentionally not implemented.
- `README.md` includes the snapshot-to-question diagram.
- `CLAUDE-QUICKSTART.md` contains the English Claude installation, selective
  snapshot export, local parsing, example prompts, and ChatGPT limitation.
- This document contains the English publishing, security, and onboarding
  architecture.
- `npm.cmd run check` and `npm.cmd test` pass; the current suite has two tests.

### Not implemented yet

- An npm package that users can run with `npx`
- A Claude Desktop `.dxt` installer
- A remote Streamable HTTP MCP endpoint
- HTTPS hosting and OAuth for Claude web and ChatGPT
- Multi-tenant credential storage and isolation
- A ChatGPT MCP app or workspace publication

### Recommended next task

Build and test the Claude Desktop Extension first. It is the smallest next step
that gives non-technical users a local installer while keeping the LCM and
credentials on their computers.

The implementation should:

1. Confirm the current official DXT manifest schema and packaging commands.
2. Add the extension manifest and required metadata.
3. Expose `ORACLE_EPM_KB_PATH`, profile, and non-sensitive settings.
4. Mark the Oracle password as sensitive and store it through the operating
   system credential store.
5. Package `oracle-epm-mcp.dxt`.
6. Test installation in Claude Desktop.
7. Document uninstall, upgrade, and troubleshooting steps in English.
8. Publish the package as a GitHub Release only after local installation works.

### Prompt to continue in another chat

```text
Continue the Oracle EPM MCP project in C:\apps\oracle-epm-mcp.
Read README.md, CLAUDE-QUICKSTART.md, and MCP-PUBLISHING.md first.
All public documentation must remain in English.

The current local stdio MCP and LCM-to-tenant-kb workflow already work.
The next task is to build a Claude Desktop .dxt extension. Verify the latest
official Anthropic DXT requirements before implementing it. Keep LCM files,
tenant-kb.json, profiles, and Oracle credentials outside Git. Do not implement
snapshot restore. Run the existing checks and tests, add packaging validation,
and publish the completed change through a pull request.
```

## Verified status

### GitHub

- Public repository: <https://github.com/BryantParkConsulting/oracle-toolkit>
- Default branch: `main`
- Current version: `0.1.0`
- License: MIT
- The README, `package.json`, and local implementation are consistent.
- This is a real MCP server built with `@modelcontextprotocol/sdk`.

### Local checkout

- Location: `C:\apps\oracle-epm-mcp`
- Originally reviewed commit: `26e4f503e70b38f16b7aadb4ae1bdabde6ecc06c`
- Current transport: local **stdio**
- Runtime: Node.js 20 or later

Current tools:

| Tool | Source | Status |
| --- | --- | --- |
| `epm_parse_lcm` | Local extracted LCM | Read-only |
| `epm_kb_summary` | Local `tenant-kb.json` | Read-only |
| `epm_search_artifacts` | Local `tenant-kb.json` | Read-only |
| `epm_get_artifact` | Local `tenant-kb.json` | Read-only |
| `epm_list_applications` | Planning REST | Read-only |
| `epm_list_jobs` | Planning REST | Read-only |
| `epm_list_rules` | Planning REST | Read-only |
| `epm_run_rule` | Planning REST | Disabled by default; requires `confirm=true` |

Snapshot restore is explicitly out of scope.

## What a user can do today

A technical user can clone the repository, install its dependencies, and point
Codex, Claude Code, or another local MCP client to `src/index.js`:

```powershell
git clone https://github.com/BryantParkConsulting/oracle-toolkit.git
cd oracle-toolkit
npm.cmd install
npm.cmd run check
npm.cmd test
```

The MCP client must run:

```text
node C:/apps/oracle-toolkit/packages/mcp-planning/src/index.js
```

A GitHub URL alone is not enough. The user must clone and install the project,
or use a package or installer that performs those steps.

## Distribution options

### 1. Local installation from GitHub

This is suitable for Codex, Claude Code, and MCP clients that support `stdio`
servers. The user clones the repository, runs `npm install`, and configures the
Node command.

To make installation closer to “point at the repository,” the project could:

- publish `oracle-epm-mcp` to npm for use through `npx`
- provide a signed installer that clones, installs, and configures the MCP
- keep credentials and LCM files outside the cloned directory

### 2. Claude Desktop Extension

Packaging the `stdio` MCP as a Claude Desktop Extension provides a friendlier
local installation while keeping LCM files, the KB, and credentials on the
user's computer.

The public repository can remain the source, but the extension package must
still be built and distributed. Claude Desktop does not run a GitHub repository
URL directly.

### 3. Codex plugin

A Codex plugin can include:

- the MCP configuration
- an LCM onboarding and analysis skill
- installation documentation and scripts

This makes installation easier through a repository or marketplace. It does not
turn the project into a ChatGPT app or a Claude web connector.

## Requirements for Claude web and ChatGPT

Claude web and ChatGPT cannot connect to the current `stdio` transport. They
need a **remote MCP server** available through HTTPS.

Target architecture:

```text
Claude / ChatGPT / other MCP clients
                  |
                  | MCP Streamable HTTP + OAuth
                  v
          Oracle EPM MCP Gateway
             |              |
             |              +-- KB derived from the LCM
             |
             +----------------- Oracle EPM Planning REST
```

Required work:

1. Keep `src/index.js` as the local `stdio` entry point.
2. Extract tools and handlers into a shared module.
3. Add a second entry point using **Streamable HTTP**.
4. Host it at a stable HTTPS URL.
5. Implement OAuth 2.1/OIDC with refresh and revocation.
6. Resolve tenant, user, and permissions from the authenticated identity.
7. Store Oracle EPM credentials in an encrypted secret manager.
8. Never accept credentials as tool arguments or chat content.
9. Separate read-only permissions from mutations.
10. Add tenant isolation, rate limits, timeouts, secret-free auditing, and
    observability.
11. Validate the server with MCP Inspector, Claude, and ChatGPT.

## Claude

### Local

The current server works with Claude Code and can work with Claude Desktop after
it is packaged as a Desktop Extension.

### Claude web or remote connector

After publishing the Streamable HTTP server:

1. Open **Settings → Connectors**.
2. Select **Add custom connector**.
3. Enter the MCP server's HTTPS URL.
4. Complete OAuth.
5. Enable the required tools.

Official reference:
[Anthropic — Custom connectors using remote MCP](https://support.anthropic.com/en/articles/11175166-about-custom-integrations-using-remote-mcp).

## ChatGPT

ChatGPT needs the same remote variant:

1. Deploy the MCP server over HTTPS.
2. Enable Developer mode.
3. Create an app with its endpoint, metadata, and authentication.
4. Scan and test the tools.
5. Publish the app within the workspace.

The Apps SDK is only required for an interactive interface inside the chat. A
remote MCP server is sufficient to expose Oracle EPM tools.

Official reference:
[OpenAI — Developer mode and MCP apps in ChatGPT](https://help.openai.com/en/articles/12584461-developer-mode-apps-and-full-mcp-connectors-in-chatgpt-beta).

## User onboarding

Use this order:

1. Download a structural LCM export.
2. Parse it locally.
3. Explore and validate the KB.
4. Only then configure live access and credentials.

### Required LCM export

Ask the user for a snapshot from **Tools → Migration** containing all relevant
environment metadata, including:

- Planning applications and cubes
- dimensions, hierarchies, and members
- data forms
- Calculation Manager rules and rulesets
- substitution variables
- Smart Lists
- dashboards
- reports
- jobs and navigation flows
- Data Management/FDMEE
- security and access permissions only when access analysis is in scope

Exclude from standard onboarding:

- **Essbase Data / Planning Data**
- cube data exports
- unnecessary inbox/outbox and data-load files
- passwords, tokens, cookies, and `.env` files

A snapshot without Essbase Data is sufficient to inventory the environment,
understand dimensions, forms, rules, variables, navigation, and integrations,
and build the local KB.

Exception: optimization or performance analysis may require a level-0 export
and the Activity Report. Request them separately and with explicit approval
because they contain more sensitive information and are unnecessary for normal
onboarding.

### Local parsing

The user extracts the ZIP and runs:

```powershell
node src/lcm-cli.js C:/path/to/extracted-lcm C:/secure/tenant-kb.json
```

Then configure:

```text
ORACLE_EPM_KB_PATH=C:/secure/tenant-kb.json
```

The LCM and `tenant-kb.json` contain confidential metadata. Keep them local and
gitignored. They may be analyzed with ChatGPT, Claude, or another AI provider
only when the client's policy permits sending that metadata to the provider.
Use the local MCP for maximum privacy.

### Live credentials

Only after validating the KB, request:

- the Oracle EPM pod base URL
- the default application and cube names
- a dedicated least-privilege username
- a password delivered through a secure channel

Non-sensitive configuration:

```text
ORACLE_EPM_BASE_URL=https://...
ORACLE_EPM_APPLICATION=...
ORACLE_EPM_CUBE=...
ORACLE_EPM_USERNAME=...
```

Inject the password into the process through the operating system credential
store or a secret manager. Do not save it in the repository, profile, shared
configuration, or a conversation:

```text
ORACLE_EPM_PASSWORD=<injected when the process starts>
```

### Gradual activation

1. Run `epm_list_applications`.
2. Run `epm_list_rules` and `epm_list_jobs` in read-only mode.
3. Compare the live environment with the KB produced from the LCM.
4. Keep `ORACLE_EPM_ENABLE_MUTATIONS=false` during validation.
5. Enable mutations only with minimum permissions, explicit confirmation, and
   an appropriate environment.

## Recommended implementation order

1. Publish the package to npm or create a local installer.
2. Package a Claude Desktop Extension.
3. Refactor handlers so `stdio` and Streamable HTTP share the same logic.
4. Deploy a read-only remote MCP server with OAuth.
5. Connect it to Claude and ChatGPT.
6. Add mutations only after validating identity, permissions, and auditing.
