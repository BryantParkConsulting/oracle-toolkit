#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import { loadConfig } from "./config.js";
import {
  getArtifact,
  loadKnowledgeBase,
  searchArtifacts,
  summarizeKnowledgeBase
} from "./kb-store.js";
import { parseLcmInventory } from "./lcm-parser.js";
import { PlanningClient } from "./planning-client.js";

const config = loadConfig();
const planning = new PlanningClient(config);

const gridDefinitionSchema = {
  type: "object",
  properties: {
    pov: { type: "object", additionalProperties: true },
    columns: { type: "array", items: { type: "object", additionalProperties: true } },
    rows: { type: "array", items: { type: "object", additionalProperties: true } }
  },
  required: ["pov", "columns", "rows"],
  additionalProperties: true
};

const tools = [
  {
    name: "epm_kb_summary",
    description: "Summarize a normalized Oracle EPM LCM knowledge base without exposing its full contents.",
    inputSchema: {
      type: "object",
      properties: { kb_path: { type: "string" } }
    }
  },
  {
    name: "epm_parse_lcm",
    description: "Parse an extracted Oracle EPM LCM folder into a normalized JSON inventory.",
    inputSchema: {
      type: "object",
      properties: { lcm_path: { type: "string" } },
      required: ["lcm_path"]
    }
  },
  {
    name: "epm_search_artifacts",
    description: "Search forms, rules, variables, reports, dashboards, and navigation flows in a local LCM knowledge base.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        kinds: { type: "array", items: { type: "string" } },
        limit: { type: "integer", minimum: 1, maximum: 100 },
        kb_path: { type: "string" }
      },
      required: ["query"]
    }
  },
  {
    name: "epm_get_artifact",
    description: "Return one exact artifact from a local LCM knowledge base.",
    inputSchema: {
      type: "object",
      properties: {
        kind: { type: "string" },
        name: { type: "string" },
        kb_path: { type: "string" }
      },
      required: ["kind", "name"]
    }
  },
  {
    name: "epm_list_applications",
    description: "List applications from a live Oracle EPM Cloud environment using Basic Authentication.",
    inputSchema: { type: "object", properties: {} }
  },
  {
    name: "epm_get_application_summary",
    description: "Return Oracle's AI-focused Markdown summary of a live Planning application. The response shape is release-dependent and intended for orientation, not stable automation.",
    inputSchema: {
      type: "object",
      properties: {
        application: { type: "string" },
        fullHierarchyThreshold: { type: "integer", minimum: 0 },
        aliasTableName: { type: "string" },
        dimensionsToInclude: { type: "array", items: { type: "string" } }
      }
    }
  },
  {
    name: "epm_export_form_data",
    description: "Read the evaluated JSON grid for a Planning form by name or ID, including its resolved POV, rows and columns after suppression and expansion.",
    inputSchema: {
      type: "object",
      properties: {
        application: { type: "string" },
        form: { type: "string" },
        pageMembers: { type: "array", items: { type: "string" } },
        displayMemberAs: {
          type: "string",
          enum: ["MEMBER_NAME", "MEMBER_NAME_THEN_ALIAS", "ALIAS_THEN_MEMBER_NAME"]
        },
        memberAliasDelimiter: { type: "string" },
        forceStartExpanded: { type: "boolean" },
        filterMembers: { type: "array", items: { type: "string" } },
        fields: { type: "array", items: { type: "string" } }
      },
      required: ["form"]
    }
  },
  {
    name: "epm_list_jobs",
    description: "List recent jobs from a live Oracle EPM Planning application.",
    inputSchema: {
      type: "object",
      properties: {
        application: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 500 }
      }
    }
  },
  {
    name: "epm_list_rules",
    description: "List business rules from a live Oracle EPM Planning application.",
    inputSchema: {
      type: "object",
      properties: {
        application: { type: "string" },
        cube: { type: "string" }
      }
    }
  },
  {
    name: "epm_run_rule",
    description: "Run a Planning business rule. Disabled by default and requires explicit confirmation.",
    inputSchema: {
      type: "object",
      properties: {
        rule: { type: "string" },
        application: { type: "string" },
        cube: { type: "string" },
        parameters: { type: "object", additionalProperties: true, description: "runtime prompts, e.g. {Subsidiary:'SUB_4',Scenario:'Forecast',Version:'Base',Currency:'USD'}" },
        confirm: { type: "boolean" },
        acknowledgeGridRule: { type: "boolean", description: "override the grid-bound-rule guard (ActiveStatus etc. need the UI)" }
      },
      required: ["rule", "confirm"]
    }
  },
  {
    name: "epm_read_cell",
    description: "Read one cell back from a cube (exportdataslice). Read-only. Give the POV dimensions+members plus the row and column intersection.",
    inputSchema: {
      type: "object",
      properties: {
        application: { type: "string" },
        cube: { type: "string" },
        povDims: { type: "array", items: { type: "string" } },
        povMembers: { type: "array", items: { type: "string" } },
        rowDim: { type: "string" },
        rowMember: { type: "string" },
        colDim: { type: "string" },
        colMember: { type: "string" }
      },
      required: ["cube", "povDims", "povMembers", "rowDim", "rowMember", "colDim", "colMember"]
    }
  },
  {
    name: "epm_export_data_slice",
    description: "Export an exact read-only cube region through exportdataslice. Pass Oracle's gridDefinition with POV, row and column dimension/member selections.",
    inputSchema: {
      type: "object",
      properties: {
        application: { type: "string" },
        cube: { type: "string" },
        gridDefinition: gridDefinitionSchema,
        exportPlanningData: { type: "boolean", description: "Include cell notes and supporting detail; defaults to true." }
      },
      required: ["cube", "gridDefinition"]
    }
  },
  {
    name: "epm_load_data",
    description:
      "Write cells into a cube via importdataslice — NO predefined Import Data job needed. " +
      "Mutating: requires ORACLE_EPM_ENABLE_MUTATIONS=true and confirm=true. " +
      "Wire shape (get this exact or it fails): body uses `dataGrid` (NOT `slices`); " +
      "`pov` is a FLAT member array, one per POV dimension in cube order (Period first), " +
      "not {dimensions,members}; `columns` is [[account,...]]; each row is {headers:[member,...],data:[value,...]} " +
      "where headers cover the non-POV dimensions (e.g. Employee). Dates need matching `dateFormat`.",
    inputSchema: {
      type: "object",
      properties: {
        application: { type: "string" },
        cube: { type: "string", description: "e.g. Workforc, Plan" },
        pov: { type: "array", items: { type: "string" }, description: "flat: one member per POV dim, Period first" },
        columns: { type: "array", items: { type: "array", items: { type: "string" } }, description: "[[account,...]]" },
        rows: {
          type: "array",
          items: {
            type: "object",
            properties: { headers: { type: "array", items: { type: "string" } }, data: { type: "array" } },
            required: ["headers", "data"]
          }
        },
        dateFormat: {
          type: "string",
          enum: ["MM-DD-YYYY", "DD-MM-YYYY", "YYYY-MM-DD", "MM/DD/YYYY", "DD/MM/YYYY", "YYYY/MM/DD"],
          description: "Must match the date values."
        },
        strictDateValidation: { type: "boolean" },
        aggregate: { type: "boolean" },
        cellNotesOption: { type: "string", enum: ["Overwrite", "Append", "Skip"] },
        customParams: {
          type: "object",
          additionalProperties: true,
          description: "Oracle import controls, including rejected-cell detail or post-import rules."
        },
        confirm: { type: "boolean" }
      },
      required: ["cube", "pov", "columns", "rows", "confirm"]
    }
  },
  {
    name: "epm_clear_data_slice",
    description: "Clear Planning and/or Essbase data for an exact cube region. Requires Service Administrator, mutations enabled, and confirm=true.",
    inputSchema: {
      type: "object",
      properties: {
        application: { type: "string" },
        cube: { type: "string" },
        gridDefinition: gridDefinitionSchema,
        clearEssbaseData: { type: "boolean", description: "Clear numeric Essbase data; defaults to true." },
        clearPlanningData: { type: "boolean", description: "Delete notes, attachments and supporting detail; defaults to false." },
        confirm: { type: "boolean" }
      },
      required: ["cube", "gridDefinition", "confirm"]
    }
  }
];

// Business rules whose script fetches a form grid (operation.getGrid) cannot run
// headless via the Jobs API — they need a Planning form. We can't inspect the script
// from here, but these Workforce-template names are known grid rules across tenants.
const GRID_BOUND_RULE_HINTS = ["activestatus", "synchronize", "processloaded", "incrementalprocess"];

function asText(value) {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

function kbFrom(args) {
  return loadKnowledgeBase(args.kb_path || config.kbPath);
}

const server = new Server(
  { name: "oracle-epm-mcp", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;
  try {
    if (name === "epm_kb_summary") {
      const { kb, resolved } = kbFrom(args);
      return asText(summarizeKnowledgeBase(kb, resolved));
    }
    if (name === "epm_parse_lcm") return asText(parseLcmInventory(args.lcm_path));
    if (name === "epm_search_artifacts") {
      const { kb } = kbFrom(args);
      return asText(searchArtifacts(kb, args.query, args.kinds, args.limit || 25));
    }
    if (name === "epm_get_artifact") {
      const { kb } = kbFrom(args);
      return asText(getArtifact(kb, args.kind, args.name));
    }
    if (name === "epm_list_applications") return asText(await planning.listApplications());
    if (name === "epm_get_application_summary") return asText(await planning.getApplicationSummary(args));
    if (name === "epm_export_form_data") return asText(await planning.exportFormData(args));
    if (name === "epm_list_jobs") return asText(await planning.listJobs(args));
    if (name === "epm_list_rules") return asText(await planning.listRules(args));
    if (name === "epm_run_rule") {
      if (!config.mutationsEnabled) throw new Error("Mutating tools are disabled. Set ORACLE_EPM_ENABLE_MUTATIONS=true.");
      if (args.confirm !== true) throw new Error("Explicit confirm=true is required.");
      const hint = String(args.rule || "").toLowerCase().replace(/[^a-z]/g, "");
      if (GRID_BOUND_RULE_HINTS.some((h) => hint.includes(h)) && args.acknowledgeGridRule !== true) {
        throw new Error(
          `"${args.rule}" looks like a grid-bound Groovy rule (operation.getGrid). ` +
          "Those cannot run headless via the Jobs API — they need a Planning form in the UI. " +
          "If you are sure this one is a plain calc script, retry with acknowledgeGridRule=true."
        );
      }
      return asText(await planning.runRule(args));
    }
    if (name === "epm_read_cell") return asText(await planning.readCell(args));
    if (name === "epm_export_data_slice") return asText(await planning.exportDataSlice(args));
    if (name === "epm_load_data") {
      if (!config.mutationsEnabled) throw new Error("Mutating tools are disabled. Set ORACLE_EPM_ENABLE_MUTATIONS=true.");
      if (args.confirm !== true) throw new Error("Explicit confirm=true is required.");
      return asText(await planning.importDataSlice(args));
    }
    if (name === "epm_clear_data_slice") {
      if (!config.mutationsEnabled) throw new Error("Mutating tools are disabled. Set ORACLE_EPM_ENABLE_MUTATIONS=true.");
      if (args.confirm !== true) throw new Error("Explicit confirm=true is required.");
      return asText(await planning.clearDataSlice(args));
    }
    throw new Error(`Unknown tool: ${name}`);
  } catch (error) {
    return {
      isError: true,
      content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }]
    };
  }
});

await server.connect(new StdioServerTransport());
