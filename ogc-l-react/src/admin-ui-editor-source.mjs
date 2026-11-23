import {
  EDITOR_SCHEMA, EDITOR_PAGES, EDITOR_SHELL_AREAS, EDITOR_PAGE_AREAS,
  EDITOR_TOKENS, EDITOR_PROPERTIES, sanitizeEditorDraft,
} from "./admin-ui-editor-model.mjs";

const cssName = key => key.replace(/[A-Z]/g, letter => "-" + letter.toLowerCase());
const properties = new Map([
  ...EDITOR_PROPERTIES,
  {key:"padding",kind:"number"}, {key:"margin",kind:"number"},
].map(property => [cssName(property.key), property]));
const tokens = new Set(EDITOR_TOKENS.map(token => token.id));
const scopeAreas = scope => scope === "*" ? EDITOR_SHELL_AREAS : EDITOR_PAGE_AREAS;
const selectorKey = selector => selector.trim().replace(/\s+/g, " ").replace(/\s*,\s*/g, ",");
const hex = /^#[\da-f]{6}$/i;
const maxDraftBytes = 119920;

function draftSize(value) {
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > maxDraftBytes) {
    throw new Error("The design exceeds the 120 KB draft limit. Remove a few overrides or blocks.");
  }
  return value;
}

function firstDifference(value, clean, path) {
  if (value === clean) return null;
  if (!value || !clean || typeof value !== "object" || typeof clean !== "object" ||
      Array.isArray(value) !== Array.isArray(clean)) return path;
  for (const key of new Set([...Object.keys(value), ...Object.keys(clean)])) {
    if (!Object.hasOwn(value, key) || !Object.hasOwn(clean, key)) return path + "." + key;
    const difference = firstDifference(value[key], clean[key], path + "." + key);
    if (difference) return difference;
  }
  return null;
}

export function parseEditorJson(source) {
  let input;
  try {
    input = JSON.parse(source);
  } catch (error) {
    throw new Error(error.message);
  }
  if (input?.version !== EDITOR_SCHEMA) throw new Error("Expected design schema version " + EDITOR_SCHEMA + ".");
  const clean = sanitizeEditorDraft(input);
  const difference = firstDifference(input, clean, "design");
  if (difference) throw new Error("Unsupported or missing value at " + difference + ".");
  return draftSize(clean);
}

export function formatEditorCss(draft, scope) {
  const areas = draft.areas[scope] || {};
  // Keep stored group rules readable while exposing individual links in a new draft.
  const rules = scopeAreas(scope).filter(area =>
    !["mainNavigation","mainNavLinks"].includes(area.id) || Object.keys(areas[area.id] || {}).length
  ).map(area => [
    area.selector,
    Object.entries(areas[area.id] || {}).map(([key,value]) => {
      const property = cssName(key);
      return [property, properties.get(property)?.kind === "number" ? value + "px" : value];
    }),
  ]);
  if (scope === "*") rules.unshift([":root", Object.entries(draft.tokens)]);
  return rules.map(([selector, declarations]) => (
    selector + " {\n" + declarations.map(([name,value]) => "  " + name + ": " + value + ";\n").join("") + "}"
  )).join("\n\n") + "\n";
}

function cssValue(name, value, palette) {
  const property = properties.get(name);
  if (palette ? tokens.has(name) : property?.kind === "color") {
    return hex.test(value) ? value.toLowerCase() : undefined;
  }
  if (!palette && property?.kind === "number" && /^(?:\d+(?:\.\d)?|\.\d)px$|^0$/.test(value)) {
    return Number.parseFloat(value);
  }
  if (!palette && property?.kind === "select" && property.options.includes(value)) return value;
  return undefined;
}

export function parseEditorCss(source, draft, scope) {
  if (scope !== "*" && !EDITOR_PAGES.some(page => page.path === scope)) {
    throw new Error("Choose an editable page first.");
  }
  const selectors = new Map(scopeAreas(scope).map(area => [selectorKey(area.selector), area.id]));
  const fail = (index, message) => {
    throw new Error("Line " + source.slice(0, index).split("\n").length + ". " + message);
  };
  const css = source.replace(/\/\*[\s\S]*?\*\//g, comment => comment.replace(/[^\r\n]/g, " "));
  const next = structuredClone(draft);
  if (scope === "*") next.tokens = {};
  const styles = {};
  const seen = new Set();
  const rule = /\s*([^{}]+)\{([^{}]*)\}/y;
  let offset = 0;
  while (css.slice(offset).trim()) {
    rule.lastIndex = offset;
    const match = rule.exec(css);
    if (!match) fail(offset, "Expected a selector followed by a declaration block.");
    const [raw, rawSelector, body] = match;
    const selector = selectorKey(rawSelector);
    const palette = selector === ":root" && scope === "*";
    const area = selectors.get(selector);
    const index = offset + raw.search(/\S/);
    if (!palette && !area) fail(index, "This scope cannot edit selector " + selector + ".");
    if (seen.has(selector)) fail(index, "Use one rule per selector.");
    seen.add(selector);

    const values = {};
    const start = offset + raw.indexOf("{") + 1;
    let position = start;
    for (const declaration of body.split(";")) {
      const at = position + Math.max(0, declaration.search(/\S/));
      position += declaration.length + 1;
      if (!declaration.trim()) continue;
      const pair = declaration.match(/^\s*([\w-]+)\s*:\s*(\S(?:.*\S)?)\s*$/);
      if (!pair) fail(at, "Expected a property and value.");
      const [,name,value] = pair;
      const parsed = cssValue(name, value, palette);
      if (parsed === undefined) fail(at, "Unsupported property or value for " + name + ".");
      const key = palette ? name : properties.get(name).key;
      if (Object.hasOwn(values, key)) fail(at, "Duplicate declaration for " + name + ".");
      values[key] = parsed;
      if (!palette) {
        const probe = sanitizeEditorDraft({version:EDITOR_SCHEMA,areas:{[scope]:{[area]:{[key]:parsed}}}});
        if (probe.areas[scope]?.[area]?.[key] !== parsed) fail(at, name + " is out of range or unavailable for this region.");
      }
    }
    if (palette) next.tokens = values;
    else if (Object.keys(values).length) styles[area] = values;
    offset = rule.lastIndex;
  }
  if (Object.keys(styles).length) next.areas[scope] = styles;
  else delete next.areas[scope];
  return draftSize(sanitizeEditorDraft(next));
}
