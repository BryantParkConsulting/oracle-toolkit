import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { parseLcmInventory } from "../src/lcm-parser.js";

test("parses a minimal Planning LCM inventory", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "oracle-epm-mcp-"));
  const forms = path.join(root, "HP-Demo", "resource", "Cube", "Plan", "Data Forms");
  fs.mkdirSync(forms, { recursive: true });
  fs.writeFileSync(path.join(forms, "Cash Flow.xml"), '<form name="Cash Flow" planType="Plan"></form>');

  const kb = parseLcmInventory(root);
  assert.equal(kb.appName, "Demo");
  assert.equal(kb.forms.length, 1);
  assert.equal(kb.forms[0].name, "Cash Flow");
  assert.equal(kb.forms[0].cube, "Plan");
});
