// lcm-rules.mjs — package Calculation Manager business rules as an importable LCM ZIP.
//
// Same three-layer shape as lcm-security.mjs (Package/listing/sourceInfo, one ZIP,
// createZip() reused verbatim) — but a different product ("CALC" not "HP"), a
// different artifact path (rules live under /Planning/<App>/<Cube>/Rules, one
// folder per cube, not a single fixed path like Cell-Level Security), and a
// completely different rule schema (HBRRepo, not the security XML).
//
// The schema below was NOT invented. It is copied verbatim from a real export
// pulled out of Symetri's own pod (clients/symetri/CALC-Calculation Manager/,
// rule "ADMIN - Clear Actual") — the same trust rule the security package
// follows: never hand-fabricate an LCM artifact format, only ever generate one
// from a real Oracle export you have open next to you.
//
// The manifest scopes the import to ONE cube's Rules folder per package
// (parentPath="/Planning/<App>/<Cube>/Rules"), so importing this can never touch
// a rule in a different cube, let alone a form, a dimension, or security.
//
// Rules already live in the target app must be passed through in `rules[]` with
// their `xml` verbatim (see `carriedOver` in bin/make-rule.mjs) — same
// merge-not-replace safety net the security package uses, because Oracle does
// not document whether a Migration import into /Rules merges or replaces.
//
// IMPORTANT — what this does NOT do: it does not import the ZIP into the pod.
// Uploading the file can be automated (epmautomate uploadfile, same command
// import.mjs already uses for metadata). Selecting the artifact and running
// Import inside the Migration wizard is a manual UI step — Oracle does not
// expose a documented EPM Automate command for a *scoped* LCM package import
// (only a full-application importsnapshot exists, which replaces far more than
// intended and is not what this is for). See bin/make-rule.mjs's printed
// reminder, and the SKILL.md this ships with.

import { createZip } from "./zip.mjs";
import { xmlEscape } from "./form.mjs";

function requireValue(value, name) {
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function requirePathComponent(value, name) {
  requireValue(value, name);
  if (/[\\/\0]/.test(value) || value === "." || value === "..") {
    throw new Error(`${name} cannot contain path separators`);
  }
  return value;
}

// Builds one <rule> HBRRepo document from a plain spec. This is the ONLY place
// that generates rule XML from scratch rather than carrying one over — keep it
// to the exact shape of the real export: <rules><rule>...<script></rule></rules>,
// no <components> (shared scripts) and no <deployobjects> unless supplied, since
// those two sections are optional in a real export and inventing content for them
// is exactly the kind of guess that corrupts an import.
export function buildRuleXml(rule) {
  const name = requireValue(rule.name, "rule.name");
  const application = requireValue(rule.application, "rule.application");
  const plantype = requireValue(rule.plantype, "rule.plantype");
  const script = requireValue(rule.script, "rule.script");
  const description = rule.description ?? "";

  const components = (rule.components ?? [])
    .map(
      (c) => `<component type="script" id="${xmlEscape(c.id ?? "1")}" name="${xmlEscape(c.name)}" product="Planning">` +
        `<property name="application">${xmlEscape(application)}</property>` +
        `<property name="plantype">${xmlEscape(plantype)}</property>` +
        `<script type="calcscript">${xmlEscape(c.script)}</script></component>`
    )
    .join("");

  const deployobjects = (rule.deployobjects ?? [])
    .map(
      (d) => `<deployobject product="${xmlEscape(d.product ?? "2")}" application="${xmlEscape(application.toLowerCase())}" ` +
        `plantype="${xmlEscape(plantype.toLowerCase())}" obj_id="${xmlEscape(d.objId ?? "1")}" obj_type="${xmlEscape(d.objType ?? "1")}" ` +
        `name="${xmlEscape(d.name ?? name.toUpperCase())}"/>`
    )
    .join("");

  return `<?xml version = '1.0' encoding = 'UTF-8'?>\n` +
    `<HBRRepo><variables/><rulesets/><rules><rule id="1" name="${xmlEscape(name)}" product="Planning">` +
    `<property name="description">${xmlEscape(description)}</property>` +
    `<property name="application">${xmlEscape(application)}</property>` +
    `<property name="plantype">${xmlEscape(plantype)}</property>` +
    `<script type="calcscript">${xmlEscape(script)}</script></rule></rules>` +
    `<components>${components}</components>` +
    (deployobjects ? `<deployobjects>${deployobjects}</deployobjects>` : `<deployobjects/>`) +
    `</HBRRepo>\n`;
}

export function buildRuleLcmFiles(spec) {
  const application = requirePathComponent(spec.application, "application");
  const cube = requirePathComponent(spec.cube, "cube"); // e.g. "Plan", "Details", "Workforc", "Rpt"
  const rules = spec.rules;
  if (!Array.isArray(rules) || !rules.length) throw new Error("rules[] is required");
  const project = spec.project ?? "Foundation";
  const duplicateNames = rules
    .map((rule) => rule.name)
    .filter((name, index, names) => names.indexOf(name) !== index);
  if (duplicateNames.length) {
    throw new Error(`duplicate rule name: ${duplicateNames[0]}`);
  }

  const ARTIFACT_PATH = `/Planning/${application}/${cube}/Rules`;
  const folder = `CALC-${application}-${cube}`;
  const ruleFiles = new Map();

  for (const rule of rules) {
    const name = requirePathComponent(rule.name, "rule name");
    // `xml` = carried over verbatim from the pod's own export; anything else is generated
    // from buildRuleXml() using the caller's plain {name, application, plantype, script} spec.
    const xml = rule.xml ?? buildRuleXml({ ...rule, application, plantype: cube });
    ruleFiles.set(`${folder}/resource${ARTIFACT_PATH}/${name}`, xml); // NO .xml extension — matches the real export
  }
  const artifactSize = [...ruleFiles.values()].reduce(
    (total, xml) => total + Buffer.byteLength(xml, "utf8"),
    0
  );

  const importTask = () => `<?xml version="1.0" encoding="UTF-8"?>
<Package>
   <LOCALE>${xmlEscape(spec.locale ?? "en_US")}</LOCALE>
   <User name="" password=""/>
   <ExportedVersion>${xmlEscape(requireValue(spec.exportedVersion, "exportedVersion"))}</ExportedVersion>
   <ExportedDateUTC>${xmlEscape(spec.exportedDateUTC ?? new Date().toISOString().slice(0, 10).replaceAll("-", ""))}</ExportedDateUTC>
   <ExportedTimeUTC>${xmlEscape(spec.exportedTimeUTC ?? "00:00")}</ExportedTimeUTC>
   <ExportedBy>${xmlEscape(spec.exportedBy ?? "")}</ExportedBy>
   <IDMDomain>${xmlEscape(spec.idmDomain ?? "")}</IDMDomain>
   <ServiceInstance>${xmlEscape(spec.serviceInstance ?? "")}</ServiceInstance>
   <Task>
      <Source type="FileSystem" filePath="/"/>
      <Target type="Application" product="CALC" project="${xmlEscape(project)}" application="Calculation Manager"/>
      <Artifact recursive="true" parentPath="${ARTIFACT_PATH}" pattern="*"/>
   </Task>
</Package>
`;

  // type="Rule" — copied verbatim from the real export's own listing.xml. Everything else
  // (folder ancestry down to Planning/<App>/<Cube>/Rules) mirrors what Oracle itself wrote.
  const listing = `<?xml version="1.0" encoding="utf-8"?>
<artifactListing>
${rules
  .map(
    (rule) =>
      `<resource name="${xmlEscape(rule.name)}" id="${xmlEscape(rule.name)}" type="Rule" cloneOnly="false" size="0" path="${ARTIFACT_PATH}" pathAlias="${ARTIFACT_PATH}" modifiedBy="${xmlEscape(rule.modifiedBy ?? spec.exportedBy ?? "")}" lastUpdated="" description="${xmlEscape(rule.description ?? "")}" />`
  )
  .join("\n")}
<folder name="Planning" type="Folder" size="" id="" path="/Planning" pathAlias="/Planning" modifiedBy="" lastUpdated="" description="" />
<folder name="${xmlEscape(application)}" type="Folder" size="" id="" path="/Planning/${xmlEscape(application)}" pathAlias="/Planning/${xmlEscape(application)}" modifiedBy="" lastUpdated="" description="" />
<folder name="${xmlEscape(cube)}" type="Folder" size="" id="" path="/Planning/${xmlEscape(application)}/${xmlEscape(cube)}" pathAlias="/Planning/${xmlEscape(application)}/${xmlEscape(cube)}" modifiedBy="" lastUpdated="" description="" />
<folder name="Rules" type="Folder" size="" id="" path="${ARTIFACT_PATH}" pathAlias="${ARTIFACT_PATH}" modifiedBy="" lastUpdated="" description="" />
</artifactListing>
`;

  const sourceInfo = `<?xml version="1.0" encoding="UTF-8"?>
<sourceInfo>
   <ApplicationName>${xmlEscape(application)}</ApplicationName>
   <ApplicationType>Planning</ApplicationType>
   <ExportedVersion>${xmlEscape(spec.exportedVersion ?? "")}</ExportedVersion>
</sourceInfo>
`;

  const readme = `# Calculation Manager rule LCM package — ${cube}

Rules in this package:
${rules.map((rule) => `- ${rule.name}${rule.xml ? "  (carried over unchanged from the pod)" : ""}`).join("\n")}

Upload this ZIP in Tools > Migration > Snapshots. Expand ${folder} > Planning >
${application} > ${cube} > Rules, select the rules, and run Import.

Before importing:

- Export the app's current Calculation Manager snapshot first. That is the rollback.
- This package is scoped to /Planning/${application}/${cube}/Rules only. It cannot
  touch a rule in another cube, or anything outside Calculation Manager.
- Whether the import MERGES or REPLACES the target folder is not documented by
  Oracle. Ship every existing rule in that folder alongside the new one
  (--carry-over) unless you have verified merge behaviour on this pod.
- Run the rule once by hand after import and read the log before relying on it
  from a schedule or from epm_run_rule.
`;

  return {
    ...Object.fromEntries(ruleFiles),
    "README.md": readme,
    "size.txt": `${artifactSize}\n`,
    [`${folder}/Import.xml`]: importTask(),
    [`${folder}/info/listing.xml`]: listing,
    [`${folder}/info/sourceInfo.xml`]: sourceInfo
  };
}

export function buildRuleLcmZip(spec, options) {
  return createZip(buildRuleLcmFiles(spec), options);
}
