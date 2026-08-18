// cell-security.mjs — build a Planning cell-level security rule XML.
//
// Cell-level security is the only per-cube restriction Planning has. Member
// ("account") access permissions apply to a member everywhere it is valid, and
// they only take effect once *Apply Security* is on for the dimension — which
// puts every member of that dimension under ACLs that usually do not exist yet.
// A cell-level rule is an exception layer: it changes nothing else in the app.
//
// Two things it cannot do, by Oracle's design:
//   - it never GRANTS access, only denies it (Deny Read / Deny Write);
//   - it does not affect a Service Administrator. Restricting an administrator
//     means taking that role away from them, in Access Control.
//
// The XML shape here was taken from a live pod export
// (/Security/Cell-Level Security Definitions/<rule>.xml).

import { selectorXml, xmlEscape } from "./form.mjs";

const RESTRICTIONS = new Set(["Deny Read", "Deny Write"]);

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

function subRuleXml(subRule, index) {
  const where = `sub-rule ${index + 1}`;
  const restriction = requireValue(subRule.restriction, `${where} restriction`);
  if (!RESTRICTIONS.has(restriction)) {
    throw new Error(`${where} restriction must be "Deny Read" or "Deny Write", got "${restriction}"`);
  }
  const members = subRule.members;
  if (!Array.isArray(members) || !members.length) {
    throw new Error(`${where} needs at least one member selector`);
  }
  const groups = subRule.groups ?? [];
  const users = subRule.users ?? [];
  // A rule assigned to nobody imports cleanly and denies nothing — the failure
  // mode is silence, so refuse it here.
  if (!groups.length && !users.length) {
    throw new Error(`${where} needs at least one group or user — a rule assigned to nobody restricts nobody`);
  }

  return [
    " <VCSubRule>",
    "  <mbrSelection>",
    `   <dimension name="${xmlEscape(requireValue(subRule.dimension, `${where} dimension`))}" >`,
    ...members.map((selector) => "   " + selectorXml(selector)),
    "   </dimension>",
    "  </mbrSelection>",
    `  <type>${xmlEscape(restriction)}</type>`,
    "  <assignedUsersAndGroups>",
    ...users.map((user) => `   <user>${xmlEscape(user)}</user>`),
    ...groups.map((group) => `   <group>${xmlEscape(group)}</group>`),
    "  </assignedUsersAndGroups>",
    " </VCSubRule>"
  ].join("\n");
}

export function buildCellLevelSecurityXml(rule) {
  const name = requirePathComponent(rule.name, "rule name");
  const anchorDimension = requireValue(rule.anchorDimension, "anchorDimension");
  const subRules = rule.subRules;
  if (!Array.isArray(subRules) || !subRules.length) {
    throw new Error(`rule "${name}" needs at least one sub-rule`);
  }
  const cubes = rule.cubes ?? [];
  // No cube list means the rule applies everywhere the anchor dimension is
  // valid. Scoping to one cube is the whole point here, so say it explicitly.
  const validForAll = cubes.length === 0;
  const dimensions = [anchorDimension, ...(rule.additionalDimensions ?? [])];

  return [
    '<?xml version="1.0" encoding="UTF-8" ?>',
    ` <CellLevelSecurity position="${xmlEscape(rule.position ?? "1.0")}"` +
      ` anchorMbrsNotInRuleValid="${rule.anchorMembersNotInRuleValid === false ? "false" : "true"}"` +
      ` enabled="${rule.enabled === false ? "false" : "true"}"` +
      ` name="${xmlEscape(name)}" contentVersion="2.0" ruleType="cellLevelSecurity"` +
      ` modifiedBy="${xmlEscape(rule.modifiedBy ?? "")}" anchorDimName="${xmlEscape(anchorDimension)}" >`,
    ` <description>${xmlEscape(rule.description ?? "")}</description>`,
    ` <planTypes validForAll="${validForAll ? "true" : "false"}" >`,
    ...cubes.map((cube) => ` <planType>${xmlEscape(cube)}</planType>`),
    "</planTypes>",
    " <VCSubRules>",
    ...subRules.map((subRule, index) =>
      subRuleXml({ dimension: anchorDimension, ...subRule }, index)
    ),
    "</VCSubRules>",
    " <DimBindings>",
    ...dimensions.map(
      (dimension) =>
        ` <DimBinding valueRequired="true" dimension="${xmlEscape(dimension)}" ></DimBinding>`
    ),
    "</DimBindings>",
    "</CellLevelSecurity>",
    ""
  ].join("\n");
}
