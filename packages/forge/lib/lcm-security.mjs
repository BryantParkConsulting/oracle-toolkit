// lcm-security.mjs — package cell-level security rules as an importable LCM ZIP.
//
// Same three-layer shape as lcm-forms.mjs, pointed at /Security instead of /Cube.
// The manifests name ONLY /Security/Cell-Level Security Definitions, so importing
// this package can never touch /Security/Access Permissions.
//
// Rules already live in the target app must be passed through in `rules[]` with
// their XML verbatim (see `carriedOver`). Planning does not document whether this
// import merges or replaces the rule set; shipping existing + new makes the
// question moot — the same trick the LCM runbook uses for dimension loads.

import { buildCellLevelSecurityXml } from "./cell-security.mjs";
import { createZip } from "./zip.mjs";
import { xmlEscape } from "./form.mjs";

const ARTIFACT_PATH = "/Security/Cell-Level Security Definitions";

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

export function buildSecurityLcmFiles(spec) {
  const application = requirePathComponent(spec.application, "application");
  const rules = spec.rules;
  if (!Array.isArray(rules) || !rules.length) throw new Error("rules[] is required");
  const product = requirePathComponent(spec.product ?? "HP", "product");
  const project = spec.project ?? "Default Application Group";
  const duplicateNames = rules
    .map((rule) => rule.name)
    .filter((name, index, names) => names.indexOf(name) !== index);
  if (duplicateNames.length) {
    throw new Error(`duplicate rule name: ${duplicateNames[0]}`);
  }
  const folder = `${product}-${application}`;
  const ruleFiles = new Map();

  for (const rule of rules) {
    const name = requirePathComponent(rule.name, "rule name");
    // `xml` = carried over verbatim from the pod's own export; anything else is generated.
    const xml = rule.xml ?? buildCellLevelSecurityXml(rule);
    ruleFiles.set(`${folder}/resource${ARTIFACT_PATH}/${name}.xml`, xml);
  }
  const artifactSize = [...ruleFiles.values()].reduce(
    (total, xml) => total + Buffer.byteLength(xml, "utf8"),
    0
  );

  const importTask = (sourcePath) => `<?xml version="1.0" encoding="UTF-8"?>
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
      <Source type="FileSystem" filePath="${xmlEscape(sourcePath)}"/>
      <Target type="Application" product="${xmlEscape(product)}" project="${xmlEscape(project)}" application="${xmlEscape(application)}"/>
      <Artifact recursive="true" parentPath="${ARTIFACT_PATH}" pattern="*"/>
   </Task>
</Package>
`;

  // type= values copied verbatim from a pod's own info/listing.xml.
  const listing = `<?xml version="1.0" encoding="utf-8"?>
<artifactListing>
${rules
  .map(
    (rule) =>
      `<resource name="${xmlEscape(rule.name)}" id="${xmlEscape(rule.name)}" type="Cell-Level Security Definitions" cloneOnly="false" size="" path="${ARTIFACT_PATH}" pathAlias="${ARTIFACT_PATH}" modifiedBy="${xmlEscape(rule.modifiedBy ?? spec.exportedBy ?? "")}" lastUpdated="" description="${xmlEscape(rule.description ?? "")}" />`
  )
  .join("\n")}
<folder name="Security" type="Folder" size="" id="" path="/Security" pathAlias="" modifiedBy="" lastUpdated="" description="" />
<folder name="Cell-Level Security Definitions" type="Folder" size="" id="" path="${ARTIFACT_PATH}" pathAlias="${ARTIFACT_PATH}" modifiedBy="" lastUpdated="" description="" />
</artifactListing>
`;

  const sourceInfo = `<?xml version="1.0" encoding="UTF-8"?>
<sourceInfo>
   <Application>${xmlEscape(application)}</Application>
   <Product>${xmlEscape(product)}</Product>
   <ProductVersion>11.1.2.3</ProductVersion>
   <Project>${xmlEscape(project)}</Project>
   <usesFriendlyNames>false</usesFriendlyNames>
   <metadataFileSupported>false</metadataFileSupported>
   <groupingSupported>true</groupingSupported>
   <LCMVersion>11.1.2</LCMVersion>
</sourceInfo>
`;

  const rootExport = `<?xml version="1.0" encoding="UTF-8"?>
<Package>
   <LOCALE>${xmlEscape(spec.locale ?? "en_US")}</LOCALE>
   <User name="" password=""/>
   <Task>
      <Source type="Application" product="${xmlEscape(product)}" project="${xmlEscape(project)}" application="${xmlEscape(application)}"/>
      <Target type="FileSystem" filePath="/${xmlEscape(folder)}"/>
      <Artifact recursive="true" parentPath="${ARTIFACT_PATH}" pattern="*"/>
   </Task>
</Package>
`;

  const readme = `# Planning cell-level security LCM package

Rules in this package:
${rules.map((rule) => `- ${rule.name}${rule.xml ? "  (carried over unchanged from the pod)" : ""}`).join("\n")}

Upload this ZIP in Tools > Migration > Snapshots. Expand ${folder} > Security >
Cell-Level Security Definitions, select the rules, and run Import.

Before importing:

- Export the app's current snapshot first. That is the rollback.
- Cell-level security only DENIES. Whoever must keep access simply must not be in
  any group or user list the rules name.
- It does not restrict a Service Administrator. Anyone holding that role reads and
  writes this data regardless of what is imported here.
- Group membership is not part of this package. It is maintained in Access Control.
`;

  return {
    ...Object.fromEntries(ruleFiles),
    "Export.xml": rootExport,
    "Import.xml": importTask(`/${folder}`),
    "README.md": readme,
    "size.txt": `${artifactSize}\n`,
    [`${folder}/Import.xml`]: importTask("/"),
    [`${folder}/info/listing.xml`]: listing,
    [`${folder}/info/sourceInfo.xml`]: sourceInfo
  };
}

export function buildSecurityLcmZip(spec, options) {
  return createZip(buildSecurityLcmFiles(spec), options);
}
