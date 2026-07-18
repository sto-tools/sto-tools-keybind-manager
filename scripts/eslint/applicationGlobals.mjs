import {
  GLOBAL_ROOT_NAMES,
  NATIVE_GLOBAL_NAMES,
  bindingDefaultResolution,
  destructuredBindingPath,
  findVariable,
  isUnshadowed,
  normalizeFilename,
  patternDefaultResolution,
  patternContainsGlobalAliasTarget,
  staticObjectKey,
  staticPropertyName,
  unwrap,
} from "./applicationGlobalAst.mjs";
import { applicationGlobalAllowlist } from "./applicationGlobalAllowlist.mjs";

export { applicationGlobalAllowlist };

export const noUnallowlistedApplicationGlobalWritesRule = {
  meta: {
    type: "problem",
    docs: {
      description: "Prevent undocumented application-global writes",
    },
    schema: [
      {
        type: "object",
        properties: { enforceDeclaredWriters: { type: "boolean" } },
        additionalProperties: false,
      },
    ],
    messages: {
      dynamic:
        "Dynamic application-global writes are forbidden because the compatibility surface cannot be audited.",
      mutableAlias:
        "Aliases of the global object must be immutable const bindings so writes remain auditable.",
      opaqueBulk:
        "Application-global bulk writes require inline object literals without spreads.",
      stale:
        'Allowlist writer "{{path}}" is stale for this file; remove or correct its metadata entry.',
      unallowlisted:
        'Application global "{{name}}" is not allowlisted; use an import or injected capability.',
      unsafeAlias:
        "Global-object aliases may only fall back to primitive values; object fallbacks make writes unauditable.",
      wrongWriter:
        'Application-global path "{{path}}" is not allowlisted in "{{file}}".',
    },
  },

  create(context) {
    const sourceCode = context.sourceCode;
    const filename = normalizeFilename(context.filename);
    const aliases = new Set();
    const resolvingAliases = new Set();
    const seenWrites = new Set();
    const enforceDeclaredWriters =
      context.options[0]?.enforceDeclaredWriters !== false;
    const expectedWrites = new Set(
      Object.values(applicationGlobalAllowlist)
        .flatMap((entry) => entry.writers)
        .filter((candidate) => candidate.file === filename)
        .map((candidate) => candidate.path),
    );

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
      if (initializerAliasesGlobal || defaultAliasesGlobal) {
        aliases.add(variable);
        return true;
      }
      return false;
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
      if (isGlobalRootPath(node)) {
        return { containsGlobal: true, safe: true };
      }
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
        return { node, segments: [] };
      }

      const segments = [];
      while (node?.type === "MemberExpression") {
        segments.unshift(staticPropertyName(node));
        node = unwrap(node.object);
      }
      if (!isGlobalRootIdentifier(node) && !isAliasIdentifier(node)) {
        return null;
      }
      while (GLOBAL_ROOT_NAMES.has(segments[0])) segments.shift();
      return { node: rawNode, segments };
    };

    const pathIsNative = (segments) =>
      typeof segments[0] === "string" && NATIVE_GLOBAL_NAMES.has(segments[0]);

    const reportDynamic = (node, segments = []) => {
      if (!pathIsNative(segments)) {
        context.report({ node, messageId: "dynamic" });
      }
    };

    const validateSegments = (node, segments) => {
      while (GLOBAL_ROOT_NAMES.has(segments[0])) segments = segments.slice(1);
      if (
        segments.length === 0 ||
        segments.some((segment) => segment === null)
      ) {
        reportDynamic(node, segments);
        return;
      }
      if (pathIsNative(segments)) return;

      const name = segments[0];
      const propertyPath = segments.join(".");
      const entry = Object.hasOwn(applicationGlobalAllowlist, name)
        ? applicationGlobalAllowlist[name]
        : null;
      if (!entry) {
        context.report({
          node,
          messageId: "unallowlisted",
          data: { name },
        });
        return;
      }

      const allowed = entry.writers.some(
        (candidate) =>
          candidate.file === filename && candidate.path === propertyPath,
      );
      if (!allowed) {
        context.report({
          node,
          messageId: "wrongWriter",
          data: { file: filename, path: propertyPath },
        });
        return;
      }
      return propertyPath;
    };

    const validateTarget = (node, countsAsDeclaration = false) => {
      const pathInfo = globalPath(node);
      if (!pathInfo) return;
      const propertyPath = validateSegments(node, pathInfo.segments);
      if (countsAsDeclaration && propertyPath) seenWrites.add(propertyPath);
    };

    const validatePattern = (node) => {
      if (!node) return;
      if (node.type === "MemberExpression" || node.type === "ChainExpression") {
        validateTarget(node);
      } else if (node.type === "AssignmentPattern") {
        validatePattern(node.left);
      } else if (node.type === "RestElement") {
        validatePattern(node.argument);
      } else if (node.type === "ArrayPattern") {
        for (const element of node.elements) validatePattern(element);
      } else if (node.type === "ObjectPattern") {
        for (const property of node.properties) {
          validatePattern(
            property.type === "Property" ? property.value : property.argument,
          );
        }
      }
    };

    const builtinOwner = (node, owner) => {
      if (isUnshadowed(sourceCode, node, owner)) return true;
      const pathInfo = globalPath(node);
      return pathInfo?.segments.length === 1 && pathInfo.segments[0] === owner;
    };

    const directBuiltinMethod = (callee, owner, method) => {
      const node = unwrap(callee);
      return (
        node?.type === "MemberExpression" &&
        builtinOwner(node.object, owner) &&
        staticPropertyName(node) === method
      );
    };

    const resolvingBuiltinAliases = new Set();
    const builtinMethod = (callee, owner, method) => {
      if (directBuiltinMethod(callee, owner, method)) return true;
      const node = unwrap(callee);
      if (node?.type !== "Identifier") return false;
      const variable = findVariable(sourceCode, node);
      if (!variable || resolvingBuiltinAliases.has(variable)) return false;

      const definition = variable.defs.find(
        (candidate) => candidate.type === "Variable",
      );
      const declarator = definition?.node;
      if (declarator?.type !== "VariableDeclarator" || !declarator.init) {
        return false;
      }

      resolvingBuiltinAliases.add(variable);
      const directAlias =
        declarator.id.type === "Identifier" &&
        directBuiltinMethod(declarator.init, owner, method);
      const destructuredPath = destructuredBindingPath(
        declarator.id,
        variable.name,
      );
      const destructuredAlias =
        destructuredPath?.length === 1 &&
        destructuredPath[0] === method &&
        builtinOwner(declarator.init, owner);
      resolvingBuiltinAliases.delete(variable);
      return directAlias || destructuredAlias;
    };

    const validateBulkProperties = (base, objectExpression, callNode) => {
      if (objectExpression?.type !== "ObjectExpression") {
        if (!pathIsNative(base.segments)) {
          context.report({ node: callNode, messageId: "opaqueBulk" });
        }
        return;
      }
      for (const property of objectExpression.properties) {
        if (property.type === "SpreadElement") {
          if (!pathIsNative(base.segments)) {
            context.report({ node: property, messageId: "opaqueBulk" });
          }
          continue;
        }
        const key = staticObjectKey(property);
        if (key === null) {
          reportDynamic(property, base.segments);
          continue;
        }
        const propertyPath = validateSegments(property, [
          ...base.segments,
          key,
        ]);
        if (propertyPath) seenWrites.add(propertyPath);
      }
    };

    const validateKeyedCall = (target, keyNode, callNode) => {
      const base = globalPath(target);
      if (!base) return;
      const key =
        keyNode?.type === "Literal" && typeof keyNode.value === "string"
          ? keyNode.value
          : keyNode?.type === "TemplateLiteral" &&
              keyNode.expressions.length === 0
            ? (keyNode.quasis[0]?.value.cooked ?? null)
            : null;
      if (key === null) {
        reportDynamic(callNode, base.segments);
        return;
      }
      const propertyPath = validateSegments(callNode, [...base.segments, key]);
      if (propertyPath) seenWrites.add(propertyPath);
    };

    return {
      VariableDeclarator(node) {
        if (!node.init) return;
        const resolution = expressionCanOnlyResolveToGlobalOrPrimitive(
          node.init,
        );
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
        if (aliasVariables.length === 0) return;
        const defaultsAreSafe = aliasVariables.every(
          (variable) =>
            bindingDefaultResolution(
              node.id,
              variable.name,
              expressionCanOnlyResolveToGlobalOrPrimitive,
            ).safe,
        );
        if (
          (resolution.containsGlobal && !resolution.safe) ||
          !defaultsAreSafe
        ) {
          context.report({ node: node.id, messageId: "unsafeAlias" });
          return;
        }
        if (node.parent.kind !== "const") {
          context.report({ node: node.id, messageId: "mutableAlias" });
          return;
        }
        for (const variable of aliasVariables) aliases.add(variable);
      },

      AssignmentExpression(node) {
        const resolution = expressionCanOnlyResolveToGlobalOrPrimitive(
          node.right,
        );
        const defaultResolution = patternDefaultResolution(
          node.left,
          expressionCanOnlyResolveToGlobalOrPrimitive,
        );
        if (
          (resolution.containsGlobal &&
            patternContainsGlobalAliasTarget(node.left)) ||
          defaultResolution.containsGlobal
        ) {
          context.report({
            node: node.left,
            messageId:
              (!resolution.containsGlobal || resolution.safe) &&
              defaultResolution.safe
                ? "mutableAlias"
                : "unsafeAlias",
          });
        }
        if (
          node.left.type === "MemberExpression" ||
          node.left.type === "ChainExpression"
        ) {
          validateTarget(node.left, node.operator === "=");
        } else {
          validatePattern(node.left);
        }
      },

      UpdateExpression(node) {
        validateTarget(node.argument);
      },

      UnaryExpression(node) {
        if (node.operator === "delete") validateTarget(node.argument);
      },

      ForInStatement(node) {
        validatePattern(node.left);
      },

      ForOfStatement(node) {
        validatePattern(node.left);
      },

      CallExpression(node) {
        if (builtinMethod(node.callee, "Object", "assign")) {
          const base = globalPath(node.arguments[0]);
          if (!base) return;
          for (const source of node.arguments.slice(1)) {
            validateBulkProperties(base, source, node);
          }
          return;
        }
        if (
          builtinMethod(node.callee, "Object", "defineProperty") ||
          builtinMethod(node.callee, "Reflect", "defineProperty") ||
          builtinMethod(node.callee, "Reflect", "set")
        ) {
          validateKeyedCall(node.arguments[0], node.arguments[1], node);
          return;
        }
        if (builtinMethod(node.callee, "Object", "defineProperties")) {
          const base = globalPath(node.arguments[0]);
          if (base) validateBulkProperties(base, node.arguments[1], node);
          return;
        }
        if (builtinMethod(node.callee, "Object", "setPrototypeOf")) {
          const base = globalPath(node.arguments[0]);
          if (base) validateBulkProperties(base, node.arguments[1], node);
          return;
        }
        const callee = unwrap(node.callee);
        if (
          callee?.type === "MemberExpression" &&
          ["__defineGetter__", "__defineSetter__"].includes(
            staticPropertyName(callee),
          )
        ) {
          validateKeyedCall(callee.object, node.arguments[0], node);
        }
      },

      "Program:exit"(node) {
        if (!enforceDeclaredWriters) return;
        for (const propertyPath of expectedWrites) {
          if (!seenWrites.has(propertyPath)) {
            context.report({
              node,
              messageId: "stale",
              data: { path: propertyPath },
            });
          }
        }
      },
    };
  },
};

export default {
  rules: {
    "no-unallowlisted-writes": noUnallowlistedApplicationGlobalWritesRule,
  },
};
