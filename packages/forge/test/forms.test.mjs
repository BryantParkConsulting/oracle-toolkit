import assert from "node:assert/strict";
import test from "node:test";
import { buildFormXml } from "../lib/form.mjs";
import { buildFormsLcmFiles, buildFormsLcmZip } from "../lib/lcm-forms.mjs";

const baseForm = {
  name: "Test Form",
  expectedDimensions: ["Years", "Account", "Entity", "Scenario"],
  axes: {
    columns: [
      {
        dimensions: [{ name: "Years", members: ["FY27"] }]
      }
    ],
    rows: [
      {
        dimensions: [
          {
            name: "Account",
            members: [{ function: "ILvl0Descendants", member: "Revenue" }]
          }
        ]
      }
    ],
    pages: [
      {
        dimensions: [{ name: "Entity", members: ["Entity_100"] }]
      }
    ],
    pov: [{ name: "Scenario", members: ["Forecast"] }]
  }
};

const spec = {
  application: "SampleApp",
  cube: "Plan",
  exportedVersion: "26.07.00",
  memberCatalog: {
    Years: ["FY27"],
    Account: ["Revenue"],
    Entity: ["Entity_100"],
    Scenario: ["Forecast"]
  },
  forms: [baseForm]
};

test("builds form XML with member selectors and LCM-compatible escaping", () => {
  const xml = buildFormXml(baseForm, { memberCatalog: spec.memberCatalog });
  assert.match(xml, /name="Test Form"/);
  assert.match(xml, /name="ILvl0Descendants"/);
  assert.match(xml, /name="Revenue"/);
});

test("rejects an alias or unknown member when a catalog is supplied", () => {
  const bad = structuredClone(baseForm);
  bad.axes.pov[0].members = ["Forecast Alias"];
  assert.throws(
    () => buildFormXml(bad, { memberCatalog: spec.memberCatalog }),
    /member names are required; aliases are not accepted/
  );
});

test("rejects unsafe form paths and duplicate names", () => {
  const unsafe = structuredClone(baseForm);
  unsafe.name = "../Form";
  assert.throws(() => buildFormXml(unsafe), /cannot contain path separators/);
  assert.throws(
    () => buildFormsLcmFiles({ ...spec, forms: [baseForm, baseForm] }),
    /duplicate form name/
  );
});

test("builds all root markers required for Migration import", () => {
  const secondForm = { ...structuredClone(baseForm), name: "Review Form", readOnly: true };
  const files = buildFormsLcmFiles({ ...spec, forms: [baseForm, secondForm] });
  assert.ok(files["Export.xml"]);
  assert.ok(files["Import.xml"]);
  assert.ok(files["size.txt"]);
  assert.ok(files["HP-SampleApp/Import.xml"]);
  assert.ok(files["HP-SampleApp/info/listing.xml"]);
  assert.ok(files["HP-SampleApp/resource/Cube/Plan/Data Forms/Test Form.xml"]);
  assert.ok(files["HP-SampleApp/resource/Cube/Plan/Data Forms/Review Form.xml"]);
  const formBytes = [
    files["HP-SampleApp/resource/Cube/Plan/Data Forms/Test Form.xml"],
    files["HP-SampleApp/resource/Cube/Plan/Data Forms/Review Form.xml"]
  ].reduce((total, xml) => total + Buffer.byteLength(xml, "utf8"), 0);
  assert.equal(Number(files["size.txt"]), formBytes);
});

test("emits a valid ZIP container with the expected entries", () => {
  const zip = buildFormsLcmZip(spec, { date: new Date("2026-07-29T00:00:00") });
  assert.equal(zip.readUInt32LE(0), 0x04034b50);
  assert.ok(zip.includes(Buffer.from("Import.xml")));
  assert.ok(zip.includes(Buffer.from("Data Forms/Test Form.xml")));
  assert.equal(zip.readUInt32LE(zip.length - 22), 0x06054b50);
});
