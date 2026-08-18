import assert from "node:assert/strict";
import test from "node:test";
import { buildCellLevelSecurityXml } from "../lib/cell-security.mjs";
import { buildSecurityLcmFiles, buildSecurityLcmZip } from "../lib/lcm-security.mjs";

const rule = {
  name: "Restrict Workforce",
  anchorDimension: "Account",
  cubes: ["Workforc"],
  position: "2.0",
  subRules: [
    {
      restriction: "Deny Read",
      members: [{ function: "Descendants", member: "Account" }, "Account"],
      groups: ["WF Data Restricted"]
    }
  ]
};

const spec = {
  application: "SampleApp",
  exportedVersion: "26.06.95",
  rules: [rule]
};

test("builds a rule scoped to one cube with the pod's element shape", () => {
  const xml = buildCellLevelSecurityXml(rule);
  assert.match(xml, /ruleType="cellLevelSecurity"/);
  assert.match(xml, /anchorDimName="Account"/);
  assert.match(xml, /<planTypes validForAll="false" >/);
  assert.match(xml, /<planType>Workforc<\/planType>/);
  assert.match(xml, /<function include="true" name="Descendants" offset="0" >/);
  assert.match(xml, /<type>Deny Read<\/type>/);
  assert.match(xml, /<group>WF Data Restricted<\/group>/);
  assert.match(xml, /<DimBinding valueRequired="true" dimension="Account" >/);
});

test("an omitted cube list means every cube, and says so", () => {
  const xml = buildCellLevelSecurityXml({ ...rule, cubes: [] });
  assert.match(xml, /<planTypes validForAll="true" >/);
});

test("refuses a rule that would restrict nobody or deny nothing", () => {
  assert.throws(
    () => buildCellLevelSecurityXml({ ...rule, subRules: [{ ...rule.subRules[0], groups: [] }] }),
    /restricts nobody/
  );
  assert.throws(
    () =>
      buildCellLevelSecurityXml({
        ...rule,
        subRules: [{ ...rule.subRules[0], restriction: "Allow Read" }]
      }),
    /must be "Deny Read" or "Deny Write"/
  );
  assert.throws(() => buildCellLevelSecurityXml({ ...rule, name: "../evil" }), /path separators/);
});

test("builds all root markers required for Migration import", () => {
  const files = buildSecurityLcmFiles(spec);
  assert.ok(files["Export.xml"]);
  assert.ok(files["Import.xml"]);
  assert.ok(files["HP-SampleApp/Import.xml"]);
  assert.ok(files["HP-SampleApp/info/listing.xml"]);
  assert.ok(files["HP-SampleApp/info/sourceInfo.xml"]);
  const artifact =
    files["HP-SampleApp/resource/Security/Cell-Level Security Definitions/Restrict Workforce.xml"];
  assert.ok(artifact);
  assert.equal(Number(files["size.txt"]), Buffer.byteLength(artifact, "utf8"));
  assert.match(
    files["HP-SampleApp/info/listing.xml"],
    /type="Cell-Level Security Definitions"/
  );
});

test("the manifests never name Access Permissions", () => {
  const files = buildSecurityLcmFiles(spec);
  for (const manifest of [files["Import.xml"], files["HP-SampleApp/Import.xml"], files["Export.xml"]]) {
    assert.match(manifest, /parentPath="\/Security\/Cell-Level Security Definitions"/);
    assert.doesNotMatch(manifest, /Access Permissions/);
  }
});

test("carries an existing rule through verbatim", () => {
  const verbatim = '<?xml version="1.0" encoding="UTF-8" ?>\n<CellLevelSecurity name="Old" />\n';
  const files = buildSecurityLcmFiles({
    ...spec,
    rules: [{ name: "Old", xml: verbatim }, rule]
  });
  assert.equal(
    files["HP-SampleApp/resource/Security/Cell-Level Security Definitions/Old.xml"],
    verbatim
  );
});

test("rejects duplicate rule names", () => {
  assert.throws(() => buildSecurityLcmFiles({ ...spec, rules: [rule, rule] }), /duplicate rule name/);
});

test("emits a valid ZIP container with the expected entries", () => {
  const zip = buildSecurityLcmZip(spec, { date: new Date("2026-08-14T00:00:00") });
  assert.equal(zip.readUInt32LE(0), 0x04034b50);
  assert.ok(zip.includes(Buffer.from("Cell-Level Security Definitions/Restrict Workforce.xml")));
  assert.equal(zip.readUInt32LE(zip.length - 22), 0x06054b50);
});
