import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
test("advertises tools and serves a KB summary over MCP stdio", async () => {
  const testDir = fs.mkdtempSync(path.join(os.tmpdir(), "oracle-epm-mcp-test-"));
  const kbPath = path.join(testDir, "tenant-kb.json");
  fs.writeFileSync(kbPath, JSON.stringify({
    schemaVersion: 1,
    appName: "Demo",
    forms: [{ name: "Cash Flow Input", cube: "Plan" }],
    rules: [{ name: "Calculate Cash Flow", cube: "Plan" }]
  }));

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(root, "src", "index.js")],
    env: {
      ...process.env,
      ORACLE_EPM_KB_PATH: kbPath
    },
    stderr: "pipe"
  });
  const client = new Client({ name: "oracle-epm-mcp-test", version: "0.1.0" });

  try {
    await client.connect(transport);
    const listed = await client.listTools();
    assert.ok(listed.tools.some((tool) => tool.name === "epm_kb_summary"));
    assert.ok(listed.tools.some((tool) => tool.name === "epm_run_rule"));
    assert.ok(listed.tools.some((tool) => tool.name === "epm_get_application_summary"));
    assert.ok(listed.tools.some((tool) => tool.name === "epm_export_form_data"));
    assert.ok(listed.tools.some((tool) => tool.name === "epm_export_data_slice"));
    assert.ok(listed.tools.some((tool) => tool.name === "epm_clear_data_slice"));

    const result = await client.callTool({ name: "epm_kb_summary", arguments: {} });
    assert.equal(result.isError, undefined);
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.application, "Demo");
    assert.equal(parsed.counts.forms, 1);

    const blocked = await client.callTool({
      name: "epm_clear_data_slice",
      arguments: { cube: "Plan", gridDefinition: {}, confirm: true }
    });
    assert.equal(blocked.isError, true);
    assert.match(blocked.content[0].text, /Mutating tools are disabled/);
  } finally {
    await client.close();
  }
});
