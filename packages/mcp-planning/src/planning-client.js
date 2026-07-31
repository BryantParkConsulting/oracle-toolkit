import { requireLiveConfig } from "./config.js";

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
  //   * `dateFormat` (e.g. "YYYYMMDD" or "MM-DD-YYYY") must match how date values are encoded.
  //
  // Write cells into a cube WITHOUT a predefined "Import Data" job.
  importDataSlice({ application = this.config.application, cube, pov, columns, rows, dateFormat, aggregate = false }) {
    if (!application || !cube) throw new Error("application and cube are required");
    if (!Array.isArray(pov) || !Array.isArray(columns) || !Array.isArray(rows)) {
      throw new Error("pov[], columns[][], and rows[{headers,data}] are required (flat POV; see the header note)");
    }
    const body = {
      aggregateEssbaseData: aggregate,
      cellNotesOption: "Overwrite",
      ...(dateFormat ? { dateFormat } : {}),
      dataGrid: { pov, columns, rows }
    };
    return this.request(
      `/HyperionPlanning/rest/v3/applications/${encodeURIComponent(application)}/plantypes/${encodeURIComponent(cube)}/importdataslice`,
      { method: "POST", body: JSON.stringify(body) }
    );
  }

  // Read one cell back (exportdataslice). Here the POV IS {dimensions,members} — the
  // read and write endpoints use different POV shapes, which is easy to get wrong.
  exportDataSlice({ application = this.config.application, cube, povDims, povMembers, rowDim, rowMember, colDim, colMember }) {
    if (!application || !cube) throw new Error("application and cube are required");
    const body = {
      exportPlanningData: true,
      gridDefinition: {
        suppressMissingBlocks: false,
        pov: { dimensions: povDims, members: povMembers.map((m) => [m]) },
        columns: [{ dimensions: [colDim], members: [[colMember]] }],
        rows: [{ dimensions: [rowDim], members: [[rowMember]] }]
      }
    };
    const j = this.request(
      `/HyperionPlanning/rest/v3/applications/${encodeURIComponent(application)}/plantypes/${encodeURIComponent(cube)}/exportdataslice`,
      { method: "POST", body: JSON.stringify(body) }
    );
    return j;
  }
}
