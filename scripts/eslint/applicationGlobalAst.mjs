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

function createGlobalPathResolver(sourceCode) {
  const aliases = new Set();
  const resolvingAliases = new Set();

  const isGlobalRootIdentifier = (node) =>
    node?.type === "Identifier" &&
    GLOBAL_ROOT_NAMES.has(node.name) &&
    isUnshadowed(sourceCode, node, node.name);

  let expressionCanOnlyResolveToGlobalOrPrimitive;

  const variableIsGlobalAlias = (variable) => {
    if (aliases.has(variable)) return true;
    if (resolvingAliases.has(variable)) return false;

    const definition = variable.defs.find(
      (candidate) => candidate.type === "Variable",
    );
    const declarator = definition?.node;
    if (
      declarator?.type !== "VariableDeclarator" ||
      declarator.parent.kind !== "const" ||
      !declarator.init
    ) {
      return false;
    }

    resolvingAliases.add(variable);
    const bindingPath = destructuredBindingPath(declarator.id, variable.name);
    const resolution = expressionCanOnlyResolveToGlobalOrPrimitive(
      declarator.init,
    );
    const defaultResolution = bindingDefaultResolution(
      declarator.id,
      variable.name,
      expressionCanOnlyResolveToGlobalOrPrimitive,
    );
    resolvingAliases.delete(variable);
    const initializerAliasesGlobal =
      bindingPath !== null &&
      bindingPath.every((segment) => GLOBAL_ROOT_NAMES.has(segment)) &&
      resolution.safe &&
      resolution.containsGlobal;
    const defaultAliasesGlobal =
      defaultResolution.safe && defaultResolution.containsGlobal;
    if (!initializerAliasesGlobal && !defaultAliasesGlobal) return false;

    aliases.add(variable);
    return true;
  };

  const isAliasIdentifier = (node) => {
    if (node?.type !== "Identifier") return false;
    const variable = findVariable(sourceCode, node);
    return Boolean(variable && variableIsGlobalAlias(variable));
  };

  const isGlobalRootPath = (rawNode) => {
    let node = unwrap(rawNode);
    if (!node) return false;
    if (isGlobalRootIdentifier(node) || isAliasIdentifier(node)) return true;

    const segments = [];
    while (node?.type === "MemberExpression") {
      segments.unshift(staticPropertyName(node));
      node = unwrap(node.object);
    }
    return (
      (isGlobalRootIdentifier(node) || isAliasIdentifier(node)) &&
      segments.length > 0 &&
      segments.every((segment) => GLOBAL_ROOT_NAMES.has(segment))
    );
  };

  expressionCanOnlyResolveToGlobalOrPrimitive = (rawNode) => {
    const node = unwrap(rawNode);
    if (!node) return { containsGlobal: false, safe: false };
    if (isGlobalRootPath(node)) return { containsGlobal: true, safe: true };
    if (
      node.type === "Literal" &&
      (node.value === null || typeof node.value !== "object")
    ) {
      return { containsGlobal: false, safe: true };
    }
    if (
      node.type === "Identifier" &&
      node.name === "undefined" &&
      isUnshadowed(sourceCode, node, "undefined")
    ) {
      return { containsGlobal: false, safe: true };
    }
    if (node.type === "UnaryExpression" && node.operator === "void") {
      return { containsGlobal: false, safe: true };
    }
    if (node.type === "SequenceExpression") {
      return expressionCanOnlyResolveToGlobalOrPrimitive(
        node.expressions[node.expressions.length - 1],
      );
    }
    if (node.type === "ConditionalExpression") {
      const consequent = expressionCanOnlyResolveToGlobalOrPrimitive(
        node.consequent,
      );
      const alternate = expressionCanOnlyResolveToGlobalOrPrimitive(
        node.alternate,
      );
      return {
        containsGlobal: consequent.containsGlobal || alternate.containsGlobal,
        safe: consequent.safe && alternate.safe,
      };
    }
    if (node.type === "LogicalExpression") {
      const left = expressionCanOnlyResolveToGlobalOrPrimitive(node.left);
      const right = expressionCanOnlyResolveToGlobalOrPrimitive(node.right);
      return {
        containsGlobal: left.containsGlobal || right.containsGlobal,
        safe: left.safe && right.safe,
      };
    }
    return { containsGlobal: false, safe: false };
  };

  const globalPath = (rawNode) => {
    let node = unwrap(rawNode);
    if (!node) return null;
    if (isGlobalRootIdentifier(node) || isAliasIdentifier(node)) {
      return { node: rawNode, segments: [] };
    }

    const segments = [];
    while (node?.type === "MemberExpression") {
      segments.unshift(staticPropertyName(node));
      node = unwrap(node.object);
    }
    if (!isGlobalRootIdentifier(node) && !isAliasIdentifier(node)) return null;
    while (GLOBAL_ROOT_NAMES.has(segments[0])) segments.shift();
    return { node: rawNode, segments };
  };

  const analyzeDeclarator = (node) => {
    const resolution = expressionCanOnlyResolveToGlobalOrPrimitive(node.init);
    const declaredVariables = sourceCode.getDeclaredVariables(node);
    const aliasVariables = declaredVariables.filter((variable) => {
      const defaultResolution = bindingDefaultResolution(
        node.id,
        variable.name,
        expressionCanOnlyResolveToGlobalOrPrimitive,
      );
      if (defaultResolution.containsGlobal) return true;
      if (!resolution.containsGlobal) return false;
      const bindingPath = destructuredBindingPath(node.id, variable.name);
      return (
        bindingPath !== null &&
        bindingPath.every((segment) => GLOBAL_ROOT_NAMES.has(segment))
      );
    });
    const defaultsAreSafe = aliasVariables.every(
      (variable) =>
        bindingDefaultResolution(
          node.id,
          variable.name,
          expressionCanOnlyResolveToGlobalOrPrimitive,
        ).safe,
    );
    return { aliasVariables, defaultsAreSafe, resolution };
  };

  return {
    analyzeDeclarator,
    expressionCanOnlyResolveToGlobalOrPrimitive,
    globalPath,
    registerAliases(variables) {
      for (const variable of variables) aliases.add(variable);
    },
  };
}

export {
  GLOBAL_ROOT_NAMES,
  NATIVE_GLOBAL_NAMES,
  REPOSITORY_ROOT,
  bindingDefaultResolution,
  createGlobalPathResolver,
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
