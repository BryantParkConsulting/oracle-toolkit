import { requireLiveConfig } from "./config.js";

function requireGridDefinition(gridDefinition) {
  if (!gridDefinition || typeof gridDefinition !== "object" || Array.isArray(gridDefinition)) {
    throw new Error("gridDefinition is required");
  }
  if (!gridDefinition.pov || !Array.isArray(gridDefinition.columns) || !Array.isArray(gridDefinition.rows)) {
    throw new Error("gridDefinition must include pov, columns[], and rows[]");
  }
}

function appendQueryValue(search, key, value, { repeat = false } = {}) {
  if (value === undefined || value === null || value === "") return;
  if (Array.isArray(value)) {
    if (repeat) {
      for (const item of value) search.append(key, String(item));
    } else if (value.length) {
      search.set(key, value.join(","));
    }
    return;
  }
  search.set(key, String(value));
}

function withQuery(apiPath, entries) {
  const search = new URLSearchParams();
  for (const [key, value, options] of entries) appendQueryValue(search, key, value, options);
  const query = search.toString();
  return query ? `${apiPath}?${query}` : apiPath;
}

export class PlanningClient {
  constructor(config) {
    this.config = config;
  }

  authHeader() {
    requireLiveConfig(this.config);
    return `Basic ${Buffer.from(`${this.config.username}:${this.config.password}`).toString("base64")}`;
  }

  async request(apiPath, options = {}) {
    requireLiveConfig(this.config);
    const url = `${this.config.baseUrl}${apiPath}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: this.authHeader(),
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    });

    const text = await response.text();
    let body = text;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      // Some Oracle endpoints return text even when JSON was requested.
    }
    if (!response.ok) {
      throw new Error(`Oracle EPM ${response.status} ${response.statusText}: ${typeof body === "string" ? body : JSON.stringify(body)}`);
    }
    return body;
  }

  listApplications() {
    return this.request("/HyperionPlanning/rest/v3/applications");
  }

  getApplicationSummary({
    application = this.config.application,
    fullHierarchyThreshold,
    aliasTableName,
    dimensionsToInclude
  } = {}) {
    if (!application) throw new Error("application is required");
    const path = `/HyperionPlanning/rest/v3/applications/${encodeURIComponent(application)}/summary`;
    return this.request(withQuery(path, [
      ["fullHierarchyThreshold", fullHierarchyThreshold],
      ["aliasTableName", aliasTableName],
      ["dimensionsToInclude", dimensionsToInclude]
    ]));
  }

  exportFormData({
    application = this.config.application,
    form,
    pageMembers,
    displayMemberAs,
    memberAliasDelimiter,
    forceStartExpanded,
    filterMembers,
    fields
  } = {}) {
    if (!application || !form) throw new Error("application and form are required");
    const path = `/HyperionPlanning/rest/v3/applications/${encodeURIComponent(application)}/forms/${encodeURIComponent(form)}/data`;
    return this.request(withQuery(path, [
      ["pageMbrList", pageMembers, { repeat: true }],
      ["displayMemberAs", displayMemberAs],
      ["memberAliasDelimiter", memberAliasDelimiter],
      ["forceStartExpanded", forceStartExpanded],
      ["filterMembers", filterMembers, { repeat: true }],
      ["fields", fields]
    ]));
  }

  listJobs({ application = this.config.application, limit = 50 } = {}) {
    if (!application) throw new Error("application is required");
    return this.request(`/HyperionPlanning/rest/v3/applications/${encodeURIComponent(application)}/jobs?limit=${limit}`);
  }

  listRules({ application = this.config.application, cube = this.config.cube } = {}) {
    if (!application) throw new Error("application is required");
    const query = cube ? `?planType=${encodeURIComponent(cube)}` : "";
    return this.request(`/HyperionPlanning/rest/v3/applications/${encodeURIComponent(application)}/businessrules${query}`);
  }

  runRule({ rule, application = this.config.application, cube = this.config.cube, parameters = {} }) {
    if (!application || !rule) throw new Error("application and rule are required");
    const body = { jobType: "Rules", jobName: rule, parameters: { ...parameters } };
    if (cube) body.parameters.PlanType = cube;
    return this.request(`/HyperionPlanning/rest/v3/applications/${encodeURIComponent(application)}/jobs`, {
      method: "POST",
      body: JSON.stringify(body)
    });
  }

  // ---- data plane (proven against a production OCI pod, 2026-07) ----------
  //
  // IMPORTANT WIRE-SHAPE NOTE (learned the hard way):
  //   * The write endpoint wants `dataGrid`, NOT `slices`. Posting `{slices:[...]}`
  //     returns HTTP 400 "The following field is not recognized by the system: slices".
  //   * `pov` is a FLAT array of members — one member per POV dimension, in the cube's
  //     evaluation order (Period first). It is NOT {dimensions,members}.
  //   * `columns` is [[account,...]] and each row is {headers:[member,...], data:[value,...]}.
  //     The row headers cover the dimensions NOT in the POV (e.g. Employee), left to right.
  //   * `dateFormat` (e.g. "YYYY-MM-DD" or "MM-DD-YYYY") must match how date values are encoded.
  //
  // Write cells into a cube WITHOUT a predefined "Import Data" job.
  importDataSlice({
    application = this.config.application,
    cube,
    pov,
    columns,
    rows,
    dateFormat,
    strictDateValidation,
    aggregate = false,
    cellNotesOption = "Overwrite",
    customParams
  }) {
    if (!application || !cube) throw new Error("application and cube are required");
    if (!Array.isArray(pov) || !Array.isArray(columns) || !Array.isArray(rows)) {
      throw new Error("pov[], columns[][], and rows[{headers,data}] are required (flat POV; see the header note)");
    }
    const body = {
      aggregateEssbaseData: aggregate,
      cellNotesOption,
      ...(dateFormat ? { dateFormat } : {}),
      ...(strictDateValidation === undefined ? {} : { strictDateValidation }),
      ...(customParams ? { customParams } : {}),
      dataGrid: { pov, columns, rows }
    };
    return this.request(
      `/HyperionPlanning/rest/v3/applications/${encodeURIComponent(application)}/plantypes/${encodeURIComponent(cube)}/importdataslice`,
      { method: "POST", body: JSON.stringify(body) }
    );
  }

  // Export a region. Here the POV IS {dimensions,members} — the read and write
  // endpoints use different POV shapes, which is easy to get wrong.
  exportDataSlice({
    application = this.config.application,
    cube,
    gridDefinition,
    exportPlanningData = true
  }) {
    if (!application || !cube) throw new Error("application and cube are required");
    requireGridDefinition(gridDefinition);
    const body = {
      exportPlanningData,
      gridDefinition
    };
    return this.request(
      `/HyperionPlanning/rest/v3/applications/${encodeURIComponent(application)}/plantypes/${encodeURIComponent(cube)}/exportdataslice`,
      { method: "POST", body: JSON.stringify(body) }
    );
  }

  readCell({
    application = this.config.application,
    cube,
    povDims,
    povMembers,
    rowDim,
    rowMember,
    colDim,
    colMember
  }) {
    if (!Array.isArray(povDims) || !Array.isArray(povMembers) || povDims.length !== povMembers.length) {
      throw new Error("povDims and povMembers must be arrays of equal length");
    }
    return this.exportDataSlice({
      application,
      cube,
      exportPlanningData: true,
      gridDefinition: {
        suppressMissingBlocks: false,
        pov: { dimensions: povDims, members: povMembers.map((member) => [member]) },
        columns: [{ dimensions: [colDim], members: [[colMember]] }],
        rows: [{ dimensions: [rowDim], members: [[rowMember]] }]
      }
    });
  }

  clearDataSlice({
    application = this.config.application,
    cube,
    gridDefinition,
    clearEssbaseData = true,
    clearPlanningData = false
  }) {
    if (!application || !cube) throw new Error("application and cube are required");
    requireGridDefinition(gridDefinition);
    return this.request(
      `/HyperionPlanning/rest/v3/applications/${encodeURIComponent(application)}/plantypes/${encodeURIComponent(cube)}/cleardataslice`,
      {
        method: "POST",
        body: JSON.stringify({ clearEssbaseData, clearPlanningData, gridDefinition })
      }
    );
  }
}
