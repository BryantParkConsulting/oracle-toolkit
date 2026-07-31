// lcm-forms.mjs — package one or more Planning forms as an importable LCM ZIP.

import { buildFormXml } from "./form.mjs";
import { createZip } from "./zip.mjs";

const xmlEscape = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

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

export function buildFormsLcmFiles(spec) {
  const application = requirePathComponent(spec.application, "application");
  const cube = requirePathComponent(spec.cube, "cube");
  const forms = spec.forms;
  if (!Array.isArray(forms) || !forms.length) throw new Error("forms[] is required");
  const product = requirePathComponent(spec.product ?? "HP", "product");
  const project = spec.project ?? "Default Application Group";
  const duplicateNames = forms
    .map((form) => form.name)
    .filter((name, index, names) => names.indexOf(name) !== index);
  if (duplicateNames.length) {
    throw new Error(`duplicate form name: ${duplicateNames[0]}`);
  }
  const folder = `${product}-${application}`;
  const artifactPath = `/Cube/${cube}/Data Forms`;
  const formFiles = new Map();

  for (const form of forms) {
    const xml = buildFormXml(
      { ...form, planType: form.planType ?? spec.planType ?? 1 },
      { memberCatalog: spec.memberCatalog }
    );
    formFiles.set(`${folder}/resource${artifactPath}/${form.name}.xml`, xml);
  }
  const artifactSize = [...formFiles.values()].reduce(
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
      <Artifact recursive="true" parentPath="${xmlEscape(artifactPath)}" pattern="*"/>
   </Task>
</Package>
`;

  const listing = `<?xml version="1.0" encoding="utf-8"?>
<artifactListing>
${forms
  .map(
    (form) =>
      `<resource name="${xmlEscape(form.name)}" id="${xmlEscape(form.name)}" type="Data Form" cloneOnly="false" size="" path="${xmlEscape(artifactPath)}" pathAlias="${xmlEscape(artifactPath)}" modifiedBy="${xmlEscape(spec.exportedBy ?? "")}" lastUpdated="" description="${xmlEscape(form.description ?? "")}" />`
  )
  .join("\n")}
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
      <Artifact recursive="true" parentPath="${xmlEscape(artifactPath)}" pattern="*"/>
   </Task>
</Package>
`;

  const readme = `# Planning forms LCM package

Forms:
${forms.map((form) => `- ${form.name}`).join("\n")}

Upload this ZIP in Tools > Migration > Snapshots. Expand ${folder} > Cube >
${cube} > Data Forms, select the forms, and run Import.

Important: selectors use Planning member names, not aliases. The
exportedVersion should match a recent snapshot from the target pod.
`;

  return {
    ...Object.fromEntries(formFiles),
    "Export.xml": rootExport,
    "Import.xml": importTask(`/${folder}`),
    "README.md": readme,
    "size.txt": `${artifactSize}\n`,
    [`${folder}/Import.xml`]: importTask("/"),
    [`${folder}/info/listing.xml`]: listing,
    [`${folder}/info/sourceInfo.xml`]: sourceInfo
  };
}

export function buildFormsLcmZip(spec, options) {
  return createZip(buildFormsLcmFiles(spec), options);
}
