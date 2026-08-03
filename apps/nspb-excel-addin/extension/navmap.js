"use strict";
// Catalog of NSPB console destinations reachable from the chat.
// Each entry:
//   keys  – trigger words the user might type
//   label – the exact link text in the Navigator (☰) menu
//   group – Navigator column it lives under (for display)
//   desc  – plain-English "what this does"
//   recs  – what the assistant should look at / recommend once it's open
//   faqs  – typical follow-up questions shown as clickable chips after opening
// Navigation for ALL of these = open the Navigator menu, then click `label`.
// (Forms/dashboards are handled separately via kb.navIndex cluster→card→tab.)
window.NAV_MAP = [
  // ── High value (FP&A daily) ───────────────────────────────────────
  { keys:["variables","substitution variables","subvars","sub vars"], label:"Variables", group:"Tools",
    subTab:"Substitution Variables",   // panel opens on "User Variables" by default — auto-switch
    desc:"Substitution Variables — the &VARIABLES that drive forms & rules (current month, forecast year, scenario, etc.). The panel also has a User Variables tab (per-user member picks).",
    recs:"Check which point-in-time vars (CurrMonth, FcstYr, CurrScenario) look stale vs the calendar, and flag any that should roll forward.",
    faqs:[
      "How do I change a substitution variable's value?",
      "Which variables should I roll forward at month-end?",
      "What does &CurrentMonth control?",
      "How do I add a new substitution variable?" ] },
  { keys:["user variables","my variables"], label:"Variables", group:"Tools",
    subTab:"User Variables",
    desc:"User Variables — per-user member selections (e.g. My Department) that some forms require before they will load.",
    recs:"If a form complains a user variable isn't set, set it here and reopen the form." },
  { keys:["rules","business rules","run rule","calc","calculation"], label:"Rules", group:"Tools", near:"Tools",
    desc:"Business Rules — run/manage the calc scripts (aggregations, currency, forecast prep) and see RTP prompts.",
    recs:"Surface the rules attached to the active form, what each does, and whether any should be run now (e.g. after edits).",
    faqs:[
      "How do I run a business rule?",
      "What's the difference between a rule and a ruleset?",
      "Why does a rule ask me for prompts (RTPs)?",
      "How do I see which rules are attached to a form?" ] },
  { keys:["jobs","job console","job history","running jobs"], label:"Jobs", group:"Application",
    desc:"Jobs console — status & history of rule runs, imports, exports, refreshes.",
    recs:"Look for failed or long-running jobs and recently completed exports the user may want to import.",
    faqs:[
      "Did last night's data load run successfully?",
      "Why did a job fail?",
      "How do I re-run a failed job?",
      "How long do jobs usually take?" ] },
  { keys:["dimensions","dimension editor","members","hierarchy"], label:"Dimensions", group:"Create and Manage",
    desc:"Dimension editor — Account, Entity, Product, etc. member hierarchies, aliases, formulas, storage.",
    recs:"Help locate a member, check its level/storage, or spot members missing aliases/formulas.",
    faqs:[
      "How do I add a new member to a dimension?",
      "What's the difference between stored and dynamic calc members?",
      "How do I set an alias for a member?",
      "How do I move or reorder members in the hierarchy?",
      "What does a shared member do?" ] },
  { keys:["audit","audit trail","changes","who changed"], label:"Audit", group:"Tools",
    desc:"Audit — trail of data & metadata changes (who changed what, when).",
    recs:"Filter to recent changes on the cube/account in question to explain a number that moved.",
    faqs:[
      "Who changed this number and when?",
      "How do I filter the audit to a specific account?",
      "What kinds of changes are tracked here?" ] },
  { keys:["data exchange","integration","fdmee","data management","data load"], label:"Data Exchange", group:"Application",
    desc:"Data Exchange / Data Management — NetSuite→Planning integrations, data load rules, mappings.",
    recs:"Check last load status per integration and whether a fresh actuals load is needed before forecasting.",
    faqs:[
      "How do I run the NetSuite integration manually?",
      "Did the latest actuals load succeed?",
      "Which integrations load actuals from NetSuite?",
      "How do I check a data load's mapping?" ] },

  // ── Medium value ──────────────────────────────────────────────────
  { keys:["valid intersections","intersections"], label:"Valid Intersections", group:"Application",
    desc:"Valid Intersections — rules that allow/block specific dimension combinations on forms.",
    recs:"Explain why a cell is read-only/blocked by tracing the governing intersection rule." },
  { keys:["smart lists","smartlists","dropdowns"], label:"Smart Lists", group:"Create and Manage",
    desc:"Smart Lists — the dropdown enumerations used in form cells.",
    recs:"List the values of a Smart List and where it's used." },
  { keys:["currency","exchange rates","currency conversions","fx"], label:"Currency Conversions", group:"Create and Manage",
    desc:"Currency Conversions — exchange-rate tables and conversion setup.",
    recs:"Check whether current-period FX rates are loaded before reporting in a reporting currency." },
  { keys:["forms","manage forms","form designer"], label:"Forms", group:"Create and Manage",
    desc:"Forms (manage) — the form designer: layout, dimensions, attached rules.",
    recs:"Open the definition of a specific form to explain its rows/cols/POV and attached rules." },
  { keys:["settings","application settings"], label:"Settings", group:"Application",
    desc:"Application Settings — global app behavior, defaults, display options.",
    recs:"Point to the setting the user is asking about (e.g. number formatting, current period default)." },
  { keys:["dashboards"], label:"Dashboards", group:"",
    desc:"Dashboards — multi-chart analytic views.",
    recs:"Suggest the dashboard most relevant to the user's question." },
  { keys:["documents","files","repository"], label:"Documents", group:"",
    desc:"Documents — file repository for the app.",
    recs:"Help find a document or the latest uploaded file." },
  { keys:["tasks","task list","my tasks"], label:"Tasks", group:"",
    desc:"Tasks — assigned task lists / close checklist items.",
    recs:"List the user's open tasks and what's overdue." },
  { keys:["data","data card"], label:"Data", group:"",
    desc:"Data — ad-hoc data entry/analysis card.",
    recs:"Open it as a starting point for ad-hoc analysis." },

  // ── Admin / governance ────────────────────────────────────────────
  { keys:["cell level security","cell security"], label:"Cell Level Security", group:"Application",
    desc:"Cell Level Security — cell-level access rules.",
    recs:"Explain why a cell is hidden/read-only for the current user." },
  { keys:["access control","security","provisioning"], label:"Access Control", group:"Tools",
    desc:"Access Control — user/group roles & artifact access.",
    recs:"Check who has access to an artifact." },
  { keys:["rules security"], label:"Rules Security", group:"Create and Manage",
    desc:"Rules Security — which users/groups can launch which rules.",
    recs:"Verify the user can run the rule they're asking about." },
  { keys:["daily maintenance","maintenance window"], label:"Daily Maintenance", group:"Tools",
    desc:"Daily Maintenance — the maintenance window & backup schedule.",
    recs:"Tell the user when the next maintenance/backup runs." },
  { keys:["migration","snapshots","backup","lcm"], label:"Migration", group:"Tools",
    desc:"Migration — LCM snapshots / artifact export & import.",
    recs:"List recent snapshots and whether a fresh backup is warranted before a big change." },
  { keys:["connections"], label:"Connections", group:"Tools",
    desc:"Connections — links to other EPM/Cloud apps.",
    recs:"Check a connection's health." },
  { keys:["clone environment","clone"], label:"Clone Environment", group:"Tools",
    desc:"Clone Environment — copy this env to another.",
    recs:"Warn that this is a heavy admin action; confirm intent." },

  // ── Workflow / approvals ──────────────────────────────────────────
  { keys:["approvals","manage approvals","approval"], label:"Manage Approvals", group:"Workflow",
    desc:"Manage Approvals — approval status of planning units.",
    recs:"Surface units pending the user's approval and what's stuck." },
  { keys:["import and export","import export"], label:"Import and Export", group:"Workflow",
    desc:"Import and Export — bulk data/metadata import & export.",
    recs:"Guide an export of level-0 data (ties into the `import <file>` flow)." },

  // ── Reporting ─────────────────────────────────────────────────────
  { keys:["reports","system reports"], label:"System Reports", group:"Monitor and Explore",
    desc:"System Reports — built-in admin/usage reports.",
    recs:"Point to the report that answers the user's admin question." },
  { keys:["explore repository","financial reports","repository"], label:"Explore Repository", group:"Reporting",
    desc:"Explore Repository — Financial Reports / books library.",
    recs:"Find the FR report the user wants." },

  // ── Actions ───────────────────────────────────────────────────────
  { keys:["clear cell details"], label:"Clear Cell Details", group:"Actions",
    desc:"Clear Cell Details — clear supporting detail on cells.", recs:"Confirm scope before clearing." },
  { keys:["copy data"], label:"Copy Data", group:"Actions",
    desc:"Copy Data — copy a data slice between members.", recs:"Confirm source/target before copying." },
  { keys:["copy versions","copy version"], label:"Copy Versions", group:"Actions",
    desc:"Copy Versions — copy data between versions (e.g. Working→Final).", recs:"Confirm source/target version." },
];
