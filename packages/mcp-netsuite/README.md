# NetSuite MCP for Claude

This package connects Claude to a NetSuite account over SuiteTalk REST and SuiteQL. It is
read-only by design: the query tool accepts only `SELECT` or `WITH` statements.

## Requirements

- Node.js 20 or newer.
- A NetSuite Token-Based Authentication integration.
- A NetSuite role with REST Web Services, Log in using Access Tokens, SuiteAnalytics Workbook,
  and read access to the records that should be discoverable.
- Claude Code with MCP support.

Run `npm install` once from the repository root before registering the server.

## Credentials

Set these variables in the shell that starts Claude. Never commit their values.

```text
NS_ACCOUNT=1234567
NS_CONSUMER_KEY=...
NS_CONSUMER_SECRET=...
NS_TOKEN_ID=...
NS_TOKEN_SECRET=...
```

PowerShell:

```powershell
$env:NS_ACCOUNT = "1234567"
$env:NS_CONSUMER_KEY = "..."
$env:NS_CONSUMER_SECRET = "..."
$env:NS_TOKEN_ID = "..."
$env:NS_TOKEN_SECRET = "..."
```

macOS/Linux:

```bash
export NS_ACCOUNT="1234567"
export NS_CONSUMER_KEY="..."
export NS_CONSUMER_SECRET="..."
export NS_TOKEN_ID="..."
export NS_TOKEN_SECRET="..."
```

For a sandbox, the account normally includes a suffix such as `1234567_SB1`. The complete
NetSuite-side token and role procedure is in
[`docs/GETTING-STARTED.md`](../../docs/GETTING-STARTED.md#route-b--netsuite-erp).

## Test the connection

From the repository root, with the variables set:

```bash
node packages/netsuite/ns-sql.js "SELECT COUNT(*) AS n FROM account"
```

A `401` normally means that a credential is wrong or was reset. A `403` normally means that
the assigned role lacks a required permission.

## Register the MCP server

Use an absolute path to this checkout:

```bash
claude mcp add netsuite -- node /absolute/path/to/oracle-toolkit/packages/mcp-netsuite/src/index.js
```

Restart Claude after registration. Example questions:

- "List the NetSuite record types this role can query."
- "Show the chart of accounts."
- "What was revenue by customer last year?"
- "Run this read-only SuiteQL query: SELECT ..."

The credentials belong to the client account. Keep them out of chat, email, logs and Git, and
revoke or rotate the token when access is no longer required.
