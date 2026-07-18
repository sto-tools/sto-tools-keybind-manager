import path from "node:path";
import { fileURLToPath } from "node:url";

import globals from "globals";

const moduleUrl = new URL(import.meta.url);
const REPOSITORY_ROOT =
  moduleUrl.protocol === "file:"
    ? fileURLToPath(new URL("../../", moduleUrl))
    : process.cwd();
const GLOBAL_ROOT_NAMES = new Set(["global", "globalThis", "self", "window"]);
const NATIVE_GLOBAL_NAMES = new Set([
  ...Object.keys(globals.browser),
  ...Object.keys(globals.node),
]);

function normalizeFilename(filename) {
  const absolute = path.isAbsolute(filename)
    ? filename
    : path.resolve(REPOSITORY_ROOT, filename);
  return path.relative(REPOSITORY_ROOT, absolute).split(path.sep).join("/");
}

function unwrap(node) {
  return node?.type === "ChainExpression" ? node.expression : node;
}

function findVariable(sourceCode, identifier) {
  let scope = sourceCode.getScope(identifier);
  while (scope) {
    const variable = scope.set.get(identifier.name);
    if (variable) return variable;
    scope = scope.upper;
  }
  return null;
}

function isUnshadowed(sourceCode, identifier, expectedName) {
  if (identifier?.type !== "Identifier" || identifier.name !== expectedName) {
    return false;
  }
  const variable = findVariable(sourceCode, identifier);
  return !variable || variable.defs.length === 0;
}

function staticPropertyName(member) {
  if (!member.computed && member.property.type === "Identifier") {
    return member.property.name;
  }
  if (member.computed && member.property.type === "Literal") {
    return typeof member.property.value === "string"
      ? member.property.value
      : null;
  }
  if (
    member.computed &&
    member.property.type === "TemplateLiteral" &&
    member.property.expressions.length === 0
  ) {
    return member.property.quasis[0]?.value.cooked ?? null;
  }
  return null;
}

function staticObjectKey(property) {
  if (!property.computed && property.key.type === "Identifier") {
    return property.key.name;
  }
  if (property.key.type === "Literal") {
    return typeof property.key.value === "string" ? property.key.value : null;
  }
  if (
    property.computed &&
    property.key.type === "TemplateLiteral" &&
    property.key.expressions.length === 0
  ) {
    return property.key.quasis[0]?.value.cooked ?? null;
  }
  return null;
}

function destructuredBindingPath(pattern, targetName, pathSegments = []) {
  if (pattern.type === "Identifier") {
    return pattern.name === targetName ? pathSegments : null;
  }
  if (pattern.type === "AssignmentPattern") {
    return destructuredBindingPath(pattern.left, targetName, pathSegments);
  }
  if (pattern.type !== "ObjectPattern") return null;

  for (const property of pattern.properties) {
    if (property.type !== "Property") continue;
    const key = staticObjectKey(property);
    if (key === null) continue;
    const nestedPath = destructuredBindingPath(property.value, targetName, [
      ...pathSegments,
      key,
    ]);
    if (nestedPath) return nestedPath;
  }
  return null;
}

function destructuredBindingDefaults(pattern, targetName) {
  const defaults = [];

  const visit = (node) => {
    if (node.type === "AssignmentPattern") {
      const bindingPath = destructuredBindingPath(node.left, targetName);
      if (bindingPath !== null) {
        defaults.push({ expression: node.right, path: bindingPath });
      }
      visit(node.left);
      return;
    }
    if (node.type === "ArrayPattern") {
      for (const element of node.elements) {
        if (element) visit(element);
      }
      return;
    }
    if (node.type !== "ObjectPattern") return;

    for (const property of node.properties) {
      if (property.type === "Property") visit(property.value);
    }
  };

  visit(pattern);
  return defaults;
}

function boundIdentifierNames(pattern) {
  if (pattern.type === "Identifier") return [pattern.name];
  if (pattern.type === "AssignmentPattern") {
    return boundIdentifierNames(pattern.left);
  }
  if (pattern.type === "RestElement") {
    return boundIdentifierNames(pattern.argument);
  }
  if (pattern.type === "ArrayPattern") {
    return pattern.elements.flatMap((element) =>
      element ? boundIdentifierNames(element) : [],
    );
  }
  if (pattern.type !== "ObjectPattern") return [];
  return pattern.properties.flatMap((property) =>
    boundIdentifierNames(
      property.type === "Property" ? property.value : property.argument,
    ),
  );
}

function bindingDefaultResolution(pattern, targetName, resolveExpression) {
  let containsGlobal = false;
  let safe = true;

  for (const candidate of destructuredBindingDefaults(pattern, targetName)) {
    if (!candidate.path.every((segment) => GLOBAL_ROOT_NAMES.has(segment))) {
      continue;
    }
    const resolution = resolveExpression(candidate.expression);
    containsGlobal ||= resolution.containsGlobal;
    safe &&= resolution.safe;
  }
  return { containsGlobal, safe };
}

function patternDefaultResolution(pattern, resolveExpression) {
  let containsGlobal = false;
  let safe = true;

  for (const name of boundIdentifierNames(pattern)) {
    const resolution = bindingDefaultResolution(
      pattern,
      name,
      resolveExpression,
    );
    containsGlobal ||= resolution.containsGlobal;
    safe &&= resolution.safe;
  }
  return { containsGlobal, safe };
}

function patternContainsGlobalAliasTarget(pattern, pathSegments = []) {
  if (pattern.type === "Identifier") {
    return pathSegments.every((segment) => GLOBAL_ROOT_NAMES.has(segment));
  }
  if (pattern.type === "AssignmentPattern") {
    return patternContainsGlobalAliasTarget(pattern.left, pathSegments);
  }
  if (pattern.type !== "ObjectPattern") return false;

  return pattern.properties.some((property) => {
    if (property.type !== "Property") return false;
    const key = staticObjectKey(property);
    return (
      key !== null &&
      patternContainsGlobalAliasTarget(property.value, [...pathSegments, key])
    );
  });
}

export {
  GLOBAL_ROOT_NAMES,
  NATIVE_GLOBAL_NAMES,
  REPOSITORY_ROOT,
  bindingDefaultResolution,
  destructuredBindingDefaults,
  destructuredBindingPath,
  findVariable,
  isUnshadowed,
  normalizeFilename,
  patternDefaultResolution,
  patternContainsGlobalAliasTarget,
  staticObjectKey,
  staticPropertyName,
  unwrap,
};
