import {
  GLOBAL_ROOT_NAMES,
  NATIVE_GLOBAL_NAMES,
  createGlobalPathResolver,
  normalizeFilename,
  staticObjectKey,
  unwrap,
} from "./applicationGlobalAst.mjs";
import { applicationGlobalAllowlist } from "./applicationGlobalAllowlist.mjs";

function outerExpression(node) {
  return node.parent?.type === "ChainExpression" ? node.parent : node;
}

function isNestedMemberObject(node) {
  const expression = outerExpression(node);
  const parent = expression.parent;
  return (
    parent?.type === "MemberExpression" &&
    unwrap(parent.object) === unwrap(expression)
  );
}

function isAssignmentTarget(node) {
  let child = outerExpression(node);
  let parent = child.parent;
  while (
    parent &&
    [
      "ArrayPattern",
      "AssignmentPattern",
      "ObjectPattern",
      "Property",
      "RestElement",
    ].includes(parent.type)
  ) {
    child = parent;
    parent = parent.parent;
  }
  return (
    (parent?.type === "AssignmentExpression" && parent.left === child) ||
    (parent?.type === "UpdateExpression" && parent.argument === child) ||
    (parent?.type === "UnaryExpression" &&
      parent.operator === "delete" &&
      parent.argument === child) ||
    ((parent?.type === "ForInStatement" || parent?.type === "ForOfStatement") &&
      parent.left === child)
  );
}

export const noUnallowlistedApplicationGlobalReadsRule = {
  meta: {
    type: "problem",
    docs: {
      description: "Prevent undocumented application-global reads",
    },
    schema: [
      {
        type: "object",
        properties: { enforceDeclaredReaders: { type: "boolean" } },
        additionalProperties: false,
      },
    ],
    messages: {
      dynamic:
        "Dynamic application-global reads are forbidden because the compatibility surface cannot be audited.",
      opaque:
        "The global object cannot be read opaquely; access an allowlisted property explicitly.",
      stale:
        'Allowlist reader "{{path}}" is stale for this file; remove or correct its metadata entry.',
      unallowlisted:
        'Application global "{{name}}" is not allowlisted; use an import or injected capability.',
      wrongReader:
        'Application-global path "{{path}}" is not allowlisted for reading in "{{file}}".',
    },
  },

  create(context) {
    const filename = normalizeFilename(context.filename);
    const pathResolver = createGlobalPathResolver(context.sourceCode);
    const seenReads = new Set();
    const enforceDeclaredReaders =
      context.options[0]?.enforceDeclaredReaders !== false;
    const expectedReads = new Set(
      Object.entries(applicationGlobalAllowlist)
        .filter(([, entry]) => entry.consumers.includes(filename))
        .map(([name]) => name),
    );

    const pathIsNative = (segments) =>
      typeof segments[0] === "string" && NATIVE_GLOBAL_NAMES.has(segments[0]);

    const validateSegments = (node, rawSegments) => {
      let segments = rawSegments;
      while (GLOBAL_ROOT_NAMES.has(segments[0])) segments = segments.slice(1);
      if (segments.length === 0) return;
      if (pathIsNative(segments)) return;
      if (segments.some((segment) => segment === null)) {
        context.report({ node, messageId: "dynamic" });
        return;
      }

      const name = segments[0];
      const entry = Object.hasOwn(applicationGlobalAllowlist, name)
        ? applicationGlobalAllowlist[name]
        : null;
      if (!entry) {
        context.report({ node, messageId: "unallowlisted", data: { name } });
        return;
      }
      if (!entry.consumers.includes(filename)) {
        context.report({
          node,
          messageId: "wrongReader",
          data: { file: filename, path: name },
        });
        return;
      }
      seenReads.add(name);
    };

    const validateMember = (node) => {
      if (isNestedMemberObject(node) || isAssignmentTarget(node)) return;
      const pathInfo = pathResolver.globalPath(node);
      if (pathInfo) validateSegments(node, pathInfo.segments);
    };

    const validatePattern = (pattern, baseSegments, reportNode) => {
      if (pattern.type === "AssignmentPattern") {
        validatePattern(pattern.left, baseSegments, reportNode);
        return;
      }
      if (pattern.type === "RestElement") {
        context.report({ node: reportNode, messageId: "opaque" });
        return;
      }
      if (pattern.type !== "ObjectPattern") return;

      for (const property of pattern.properties) {
        if (property.type === "RestElement") {
          context.report({ node: property, messageId: "opaque" });
          continue;
        }
        const key = staticObjectKey(property);
        if (key === null) {
          context.report({ node: property, messageId: "dynamic" });
          continue;
        }
        validateSegments(property, [...baseSegments, key]);
      }
    };

    const validateDestructuringRead = (pattern, expression, reportNode) => {
      if (pattern.type !== "ObjectPattern" && pattern.type !== "ArrayPattern") {
        return;
      }
      const pathInfo = pathResolver.globalPath(expression);
      if (!pathInfo) return;
      if (pattern.type === "ArrayPattern") {
        context.report({ node: reportNode, messageId: "opaque" });
        return;
      }
      validatePattern(pattern, pathInfo.segments, reportNode);
    };

    return {
      AssignmentExpression(node) {
        validateDestructuringRead(node.left, node.right, node);
      },

      MemberExpression: validateMember,

      VariableDeclarator(node) {
        if (node.init) validateDestructuringRead(node.id, node.init, node);
      },

      "Program:exit"(node) {
        if (!enforceDeclaredReaders) return;
        for (const name of expectedReads) {
          if (!seenReads.has(name)) {
            context.report({
              node,
              messageId: "stale",
              data: { path: name },
            });
          }
        }
      },
    };
  },
};
