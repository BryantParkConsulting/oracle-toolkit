// form.mjs — build Oracle EPM Planning data-form XML from a plain JSON spec.
//
// The XML shape mirrors a form exported through Migration/LCM. Member names are
// emitted exactly as supplied: callers should pass Planning member names, not
// aliases. Use `memberCatalog` validation to catch that class of mistake before
// uploading a package.

export const xmlEscape = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

const bool = (value) => (value ? "true" : "false");

const DIMENSION_DEFAULTS = {
  displayMemberFormulaDesc: false,
  allowFlexibleDefinition: false,
  displayAlias: false,
  applyToAllDim: false,
  displayMemberFormula: false,
  dimWidth: 0,
  hide: false,
  showQualifiedName: "never",
  drillOnSharedMbrs: false,
  displayName: true,
  expand: false,
  displayConsolidationOperators: false,
  showCurrency: false
};

function attributes(values) {
  return Object.entries(values)
    .filter(([, value]) => value !== undefined)
    .map(([name, value]) => `${name}="${xmlEscape(typeof value === "boolean" ? bool(value) : value)}"`)
    .join(" ");
}

function normalizeSelector(selector) {
  if (typeof selector === "string") return { member: selector };
  if (!selector || typeof selector !== "object") {
    throw new Error("member selectors must be strings or objects");
  }
  return selector;
}

// Also used by cell-security.mjs — Planning writes the same
// <function>/<member> shape inside a cell-level security member selection.
export function selectorXml(rawSelector) {
  const selector = normalizeSelector(rawSelector);
  if (!selector.member) throw new Error("each selector needs `member`");
  const memberAttrs = attributes({
    name: selector.member,
    selectionType: selector.selectionType ?? "Auto",
    visible: selector.visible
  });
  if (!selector.function) return ` <member ${memberAttrs} />`;

  return [
    ` <function ${attributes({
      include: selector.include ?? true,
      name: selector.function,
      offset: selector.offset ?? 0
    })} >`,
    `  <member ${memberAttrs} />`,
    " </function>"
  ].join("\n");
}

function dimensionXml(dimension, { axis } = {}) {
  if (!dimension?.name) throw new Error(`${axis ?? "axis"} dimension needs a name`);
  if (!Array.isArray(dimension.members) || dimension.members.length === 0) {
    throw new Error(`${dimension.name} needs at least one member selector`);
  }

  const axisOptions =
    axis === "pov"
      ? { applyToAllDim: true }
      : axis === "rows"
        ? { enableDropdown: false }
        : {};
  const attrs = attributes({
    ...DIMENSION_DEFAULTS,
    ...axisOptions,
    ...dimension.options,
    name: dimension.name
  });
  return [
    ` <dimension ${attrs} >`,
    ...dimension.members.map(selectorXml),
    " </dimension>"
  ].join("\n");
}

function segmentsXml(segments, axis) {
  if (!Array.isArray(segments) || segments.length === 0) {
    throw new Error(`${axis} needs at least one segment`);
  }
  return segments
    .map((segment) => {
      if (!Array.isArray(segment.dimensions) || segment.dimensions.length === 0) {
        throw new Error(`${axis} segment needs dimensions[]`);
      }
      return [
        " <segment>",
        ...segment.dimensions.map((dimension) => dimensionXml(dimension, { axis })),
        " </segment>"
      ].join("\n");
    })
    .join("\n");
}

function collectDimensionNames(form) {
  const axes = form.axes ?? {};
  const dimensions = [];
  for (const axis of ["columns", "rows", "pages"]) {
    for (const segment of axes[axis] ?? []) {
      for (const dimension of segment.dimensions ?? []) {
        dimensions.push({ axis, name: dimension.name });
      }
    }
  }
  for (const dimension of axes.pov ?? []) dimensions.push({ axis: "pov", name: dimension.name });
  return dimensions;
}

function allSelectors(form) {
  const axes = form.axes ?? {};
  const results = [];
  for (const axis of ["columns", "rows", "pages"]) {
    for (const segment of axes[axis] ?? []) {
      for (const dimension of segment.dimensions ?? []) {
        for (const selector of dimension.members ?? []) {
          results.push({ dimension: dimension.name, selector: normalizeSelector(selector) });
        }
      }
    }
  }
  for (const dimension of axes.pov ?? []) {
    for (const selector of dimension.members ?? []) {
      results.push({ dimension: dimension.name, selector: normalizeSelector(selector) });
    }
  }
  return results;
}

export function validateFormSpec(form, { memberCatalog } = {}) {
  if (!form?.name) throw new Error("each form needs `name`");
  if (/[\\/\0]/.test(form.name) || form.name === "." || form.name === "..") {
    throw new Error(`${form.name}: form name cannot contain path separators`);
  }
  const axes = form.axes ?? {};
  if (!Array.isArray(axes.columns) || !axes.columns.length) {
    throw new Error(`${form.name}: axes.columns[] is required`);
  }
  if (!Array.isArray(axes.rows) || !axes.rows.length) {
    throw new Error(`${form.name}: axes.rows[] is required`);
  }
  if (!Array.isArray(axes.pov) || !axes.pov.length) {
    throw new Error(`${form.name}: axes.pov[] is required`);
  }

  const dimensions = collectDimensionNames(form);
  const byName = new Map();
  for (const { axis, name } of dimensions) {
    if (!name) throw new Error(`${form.name}: a ${axis} dimension is missing its name`);
    if (byName.has(name) && byName.get(name) !== axis) {
      throw new Error(
        `${form.name}: dimension "${name}" is on both ${byName.get(name)} and ${axis}`
      );
    }
    byName.set(name, axis);
  }

  if (form.expectedDimensions) {
    const actual = new Set(dimensions.map(({ name }) => name));
    const missing = form.expectedDimensions.filter((name) => !actual.has(name));
    const extra = [...actual].filter((name) => !form.expectedDimensions.includes(name));
    if (missing.length || extra.length) {
      throw new Error(
        `${form.name}: dimension mismatch; missing=[${missing.join(", ")}], extra=[${extra.join(", ")}]`
      );
    }
  }

  if (memberCatalog) {
    const catalogs = new Map(
      Object.entries(memberCatalog).map(([dimension, members]) => [
        dimension,
        new Set(members)
      ])
    );
    for (const { dimension, selector } of allSelectors(form)) {
      // Substitution variables are resolved by Planning and cannot be checked
      // against a static member catalog.
      if (String(selector.member).startsWith("&")) continue;
      const catalog = catalogs.get(dimension);
      if (catalog && !catalog.has(selector.member)) {
        throw new Error(
          `${form.name}: member "${selector.member}" is not in memberCatalog.${dimension} ` +
            "(member names are required; aliases are not accepted)"
        );
      }
    }
  }
}

export function buildFormXml(form, options = {}) {
  validateFormSpec(form, options);
  const columns = segmentsXml(form.axes.columns, "columns");
  const rows = segmentsXml(form.axes.rows, "rows");
  const pages = form.axes.pages?.length
    ? `<pages>\n${segmentsXml(form.axes.pages, "pages")}\n </pages>`
    : "<pages>\n </pages>";
  const pov = form.axes.pov.map((dimension) => dimensionXml(dimension, { axis: "pov" })).join("\n");

  return `<?xml version="1.0" encoding="UTF-8" ?>
 <form xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ${attributes({
    options2: 0,
    suppressMissingRowsNative: false,
    enableOffline: false,
    smartForm: false,
    disableSpreading: false,
    hide: false,
    suppressZero: form.suppressZero ?? false,
    calcOnAutoSubmit: false,
    enableCubeView: false,
    repeatMemberLabels: form.repeatMemberLabels ?? true,
    suppressInvalidScenarioTPs: false,
    disableSheetProtection: false,
    planType: form.planType ?? 1,
    dir: form.directory ?? "Forms",
    autoSubmit: false,
    readOnly: form.readOnly ?? false,
    nativeSuppressMissingRowsOfSmartPush: false,
    enableFlexForm: form.enableFlexForm ?? false,
    runSmartPushAsynchronously: false,
    globalAssumptions: false,
    disableFormatting: false,
    name: form.name
  })} >
 <description>${xmlEscape(form.description ?? "")}</description>
 <query>
 <columns width="${xmlEscape(form.columnWidth ?? 100)}" >
${columns}
 </columns>
 <rows height="${xmlEscape(form.rowHeight ?? 22)}" suppressInvalid="${bool(form.suppressInvalidRows ?? true)}" >
${rows}
 </rows>
 ${pages}
 <pov>
${pov}
 </pov>
 </query>
 <businessRules>
 </businessRules>
 <displayOptions>
 <precision useCurrencyPrecision="false" nonCurrencyMax="0" nonCurrencyMin="0" currencyMax="0" percentageMax="0" currencyMin="0" percentageMin="0" />
 <display multiCurrency="false" enableMassAllocation="false" enableGridSpread="${bool(!form.readOnly)}" hideSaveConfirmMessage="false" accountAnnotation="false" enableAdHoc="true" poundMissing="true" enableAttributeDisplay="false" enableCellAttach="false" />
 <printOptions>
 <pageSettings pageSize="A4" font="" orientation="0" fontSize="8" rowHeaderPercentage="35" numDataCols="10" />
 <format supportingDetails="false" applyPrecision="false" repeatHeaders="true" reverseSupport="false" formatData="true" />
 <printDisplay currency="true" shading="true" cellNotes="false" attribute="true" accountAnnotation="true" />
 </printOptions>
 <smartViewOptions enableForSmartSlice="false" enableOfflineUsage="false" />
 </displayOptions>
 <dataValidationRules>
 <dataValidationRulesOptions>
 <RunValidationsAsLoggedInUser>true</RunValidationsAsLoggedInUser>
 <ValidateOnlyForPagesWithBlocks>true</ValidateOnlyForPagesWithBlocks>
 <ValidateOnlyForUsersWithAccessToForm>true</ValidateOnlyForUsersWithAccessToForm>
 <ReplaceUserVarWithPuMember>false</ReplaceUserVarWithPuMember>
 <LoopOverEveryPossiblePuUserVarValue>false</LoopOverEveryPossiblePuUserVarValue>
 </dataValidationRulesOptions>
 </dataValidationRules>
 <formFormattings>
 </formFormattings>
 <smartpush>
 </smartpush>
 </form>
`;
}
