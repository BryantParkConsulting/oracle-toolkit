import fs from "node:fs";
import path from "node:path";

function walk(root) {
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else if (entry.isFile()) files.push(full);
  }
  return files;
}

function decode(value = "") {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function first(xml, names) {
  for (const name of names) {
    const attribute = xml.match(new RegExp(`\\b${name}="([^"]+)"`, "i"));
    if (attribute) return decode(attribute[1].trim());
    const element = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i"));
    if (element) return decode(element[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
  }
  return "";
}

function relativeUnix(root, file) {
  return path.relative(root, file).split(path.sep).join("/");
}

export function parseLcmInventory(rootPath) {
  const root = path.resolve(rootPath);
  if (!fs.existsSync(root)) throw new Error(`LCM path does not exist: ${root}`);
  const files = walk(root);
  const hpFolder = files
    .map((file) => relativeUnix(root, file).split("/")[0])
    .find((part) => part.startsWith("HP-"));

  const kb = {
    generatedAt: new Date().toISOString(),
    schemaVersion: 1,
    appName: hpFolder ? hpFolder.slice(3) : null,
    forms: [],
    dashboards: [],
    financialReports: [],
    rules: [],
    rulesets: [],
    dimensions: [],
    substitutionVariables: [],
    navigationFlows: [],
    sourceInventory: { fileCount: files.length }
  };

  for (const file of files) {
    const rel = relativeUnix(root, file);
    const lower = rel.toLowerCase();
    if (!/\.(xml|csv|txt)$/i.test(file)) continue;
    let content;
    try {
      content = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    const fallbackName = path.basename(file, path.extname(file));
    const source = rel;

    if (lower.includes("/data forms/") && lower.endsWith(".xml")) {
      const item = {
        name: first(content, ["name", "formName"]) || fallbackName,
        cube: first(content, ["cube", "planType", "planTypeName"]) || null,
        source
      };
      const dashboard = /dashboard\s*=\s*"true"/i.test(content);
      (dashboard ? kb.dashboards : kb.forms).push(item);
    } else if (lower.includes("calculation manager") && lower.endsWith(".xml")) {
      kb.rules.push({
        name: first(content, ["name", "ruleName"]) || fallbackName,
        cube: first(content, ["cube", "planType", "planTypeName"]) || null,
        source
      });
    } else if (lower.includes("substitution variable")) {
      kb.substitutionVariables.push({
        name: first(content, ["name", "variableName"]) || fallbackName,
        value: first(content, ["value", "variableValue"]) || null,
        source
      });
    } else if (lower.includes("standard dimensions") && /\.(csv|xml)$/i.test(file)) {
      kb.dimensions.push({ name: fallbackName, source });
    } else if (lower.includes("/reports/") || lower.includes("financial reports")) {
      kb.financialReports.push({ name: first(content, ["name"]) || fallbackName, source });
    } else if (lower.includes("navigation flow")) {
      kb.navigationFlows.push({ name: first(content, ["name"]) || fallbackName, source });
    }
  }

  for (const key of ["forms", "dashboards", "financialReports", "rules", "substitutionVariables", "navigationFlows"]) {
    const seen = new Set();
    kb[key] = kb[key].filter((item) => {
      const token = `${item.name}|${item.source}`.toLowerCase();
      if (seen.has(token)) return false;
      seen.add(token);
      return true;
    });
  }
  return kb;
}
