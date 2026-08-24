import assert from "node:assert/strict";
import test from "node:test";
import { PlanningClient } from "../src/planning-client.js";

const config = {
  baseUrl: "https://example.invalid",
  username: "user",
  password: "secret",
  application: "Vision App",
  cube: "Plan 1"
};

function captureRequests() {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      text: async () => JSON.stringify({ ok: true })
    };
  };
  return {
    calls,
    restore() {
      globalThis.fetch = originalFetch;
    }
  };
}

test("builds application-summary and evaluated-form requests", async () => {
  const capture = captureRequests();
  const client = new PlanningClient(config);
  try {
    await client.getApplicationSummary({
      fullHierarchyThreshold: 25,
      aliasTableName: "Default Alias",
      dimensionsToInclude: ["Account", "Entity"]
    });
    await client.exportFormData({
      form: "Revenue Input/Review",
      pageMembers: ["FY26", "Forecast"],
      forceStartExpanded: true,
      fields: ["gridInfo", "pov", "rows", "columns"]
    });

    const summaryUrl = new URL(capture.calls[0].url);
    assert.equal(summaryUrl.pathname, "/HyperionPlanning/rest/v3/applications/Vision%20App/summary");
    assert.equal(summaryUrl.searchParams.get("fullHierarchyThreshold"), "25");
    assert.equal(summaryUrl.searchParams.get("aliasTableName"), "Default Alias");
    assert.equal(summaryUrl.searchParams.get("dimensionsToInclude"), "Account,Entity");

    const formUrl = new URL(capture.calls[1].url);
    assert.equal(formUrl.pathname, "/HyperionPlanning/rest/v3/applications/Vision%20App/forms/Revenue%20Input%2FReview/data");
    assert.deepEqual(formUrl.searchParams.getAll("pageMbrList"), ["FY26", "Forecast"]);
    assert.equal(formUrl.searchParams.get("forceStartExpanded"), "true");
    assert.equal(formUrl.searchParams.get("fields"), "gridInfo,pov,rows,columns");
  } finally {
    capture.restore();
  }
});

test("exports a generic slice and keeps the one-cell compatibility wrapper", async () => {
  const capture = captureRequests();
  const client = new PlanningClient(config);
  const gridDefinition = {
    suppressMissingBlocks: false,
    pov: { dimensions: ["Scenario"], members: [["Forecast"]] },
    columns: [{ dimensions: ["Period"], members: [["Jan", "Feb"]] }],
    rows: [{ dimensions: ["Account"], members: [["Revenue"]] }]
  };
  try {
    await client.exportDataSlice({ cube: "Plan 1", gridDefinition, exportPlanningData: false });
    await client.readCell({
      cube: "Plan 1",
      povDims: ["Scenario"],
      povMembers: ["Forecast"],
      rowDim: "Account",
      rowMember: "Revenue",
      colDim: "Period",
      colMember: "Jan"
    });

    assert.equal(new URL(capture.calls[0].url).pathname,
      "/HyperionPlanning/rest/v3/applications/Vision%20App/plantypes/Plan%201/exportdataslice");
    assert.deepEqual(JSON.parse(capture.calls[0].options.body), {
      exportPlanningData: false,
      gridDefinition
    });
    const oneCell = JSON.parse(capture.calls[1].options.body);
    assert.deepEqual(oneCell.gridDefinition.pov, {
      dimensions: ["Scenario"],
      members: [["Forecast"]]
    });
  } finally {
    capture.restore();
  }
});

test("builds import and clear requests with explicit options", async () => {
  const capture = captureRequests();
  const client = new PlanningClient(config);
  const gridDefinition = {
    pov: { dimensions: ["Scenario"], members: [["Forecast"]] },
    columns: [{ dimensions: ["Period"], members: [["Jan"]] }],
    rows: [{ dimensions: ["Account"], members: [["Revenue"]] }]
  };
  try {
    await client.importDataSlice({
      cube: "Plan 1",
      pov: ["Forecast"],
      columns: [["Jan"]],
      rows: [{ headers: ["Revenue"], data: [100] }],
      dateFormat: "YYYY-MM-DD",
      strictDateValidation: true,
      cellNotesOption: "Skip",
      customParams: { IncludeRejectedCellsWithDetails: true }
    });
    await client.clearDataSlice({
      cube: "Plan 1",
      gridDefinition,
      clearEssbaseData: true,
      clearPlanningData: true
    });

    const imported = JSON.parse(capture.calls[0].options.body);
    assert.equal(imported.cellNotesOption, "Skip");
    assert.equal(imported.strictDateValidation, true);
    assert.deepEqual(imported.customParams, { IncludeRejectedCellsWithDetails: true });

    assert.equal(new URL(capture.calls[1].url).pathname,
      "/HyperionPlanning/rest/v3/applications/Vision%20App/plantypes/Plan%201/cleardataslice");
    assert.deepEqual(JSON.parse(capture.calls[1].options.body), {
      clearEssbaseData: true,
      clearPlanningData: true,
      gridDefinition
    });
  } finally {
    capture.restore();
  }
});

test("rejects malformed slice definitions before making a request", async () => {
  const client = new PlanningClient(config);
  assert.throws(
    () => client.exportDataSlice({ cube: "Plan", gridDefinition: null }),
    /gridDefinition is required/
  );
  assert.throws(
    () => client.clearDataSlice({ cube: "Plan", gridDefinition: {} }),
    /must include pov, columns\[\], and rows\[\]/
  );
  assert.throws(
    () => client.readCell({ cube: "Plan", povDims: ["Scenario"], povMembers: [] }),
    /arrays of equal length/
  );
});
