import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

import { storageServiceMethodNames } from "./persistenceInventory.js";

export const sourceRoot = join(process.cwd(), "src/js");
export const rpcTypeRoot = join(sourceRoot, "types/rpc");

const parsedSnapshots = new WeakMap();

function* parsedEntries(entries, scriptKind = ts.ScriptKind.JS, methodNames) {
  // Cache only immutable snapshots, never caller-owned mutable probe arrays.
  const immutable =
    Object.isFrozen(entries) &&
    entries.every((entry) => Object.isFrozen(entry));
  let snapshots = immutable ? parsedSnapshots.get(entries) : undefined;
  if (immutable) {
    if (!snapshots) {
      snapshots = new Map();
      parsedSnapshots.set(entries, snapshots);
    }
    if (!snapshots.has(scriptKind)) snapshots.set(scriptKind, new Map());
  }
  const parsed = snapshots?.get(scriptKind);
  // A recognized literal method is followed by a call, optional call, closing
  // string/template quote, or comments/whitespace before one of those tokens.
  // Any backslash disables this filter, retaining escaped names and line joins.
  const candidate = methodNames
    ? new RegExp(`(?:${methodNames.join("|")})(?=\\s*[(?"'\\x60\\]/])`)
    : null;
  for (const entry of entries) {
    const [fileName, source] = entry;
    if (candidate && !source.includes("\\") && !candidate.test(source))
      continue;
    let sourceFile = parsed?.get(entry);
    if (!sourceFile) {
      sourceFile = ts.createSourceFile(
        fileName,
        source,
        {
          languageVersion: ts.ScriptTarget.Latest,
          // Collectors inspect syntax only, not JSDoc or type information.
          jsDocParsingMode: ts.JSDocParsingMode.ParseNone,
        },
        // Traversal is downward-only; getText always supplies this source file.
        false,
        scriptKind,
      );
      parsed?.set(entry, sourceFile);
    }
    yield [fileName, sourceFile];
  }
}

export function javascriptFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "dist" ? [] : javascriptFiles(path);
    }
    return entry.isFile() && entry.name.endsWith(".js") ? [path] : [];
  });
}

function normalizeSource(value) {
  let normalized = "";
  let quote = null;
  let escaped = false;
  let pendingSpace = false;
  for (const character of value.trim()) {
    if (quote) {
      normalized += character;
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'" || character === "`") {
      if (pendingSpace && normalized) normalized += " ";
      pendingSpace = false;
      quote = character;
      normalized += character;
    } else if (/\s/.test(character)) {
      pendingSpace = true;
    } else {
      if (pendingSpace && normalized) normalized += " ";
      pendingSpace = false;
      normalized += character;
    }
  }
  return normalized;
}

function memberCall(node, sourceFile) {
  if (!ts.isCallExpression(node)) return null;
  const expression = node.expression;
  if (ts.isPropertyAccessExpression(expression)) {
    return {
      get receiver() {
        return normalizeSource(expression.expression.getText(sourceFile));
      },
      method: expression.name.text,
      get arguments() {
        return node.arguments.map((argument) =>
          normalizeSource(argument.getText(sourceFile)),
        );
      },
    };
  }
  if (
    ts.isElementAccessExpression(expression) &&
    expression.argumentExpression &&
    ts.isStringLiteralLike(expression.argumentExpression)
  ) {
    return {
      get receiver() {
        return normalizeSource(expression.expression.getText(sourceFile));
      },
      method: expression.argumentExpression.text,
      get arguments() {
        return node.arguments.map((argument) =>
          normalizeSource(argument.getText(sourceFile)),
        );
      },
    };
  }
  return null;
}

function collectCalls(
  entries,
  predicate,
  { includeOwner = false, methodNames } = {},
) {
  const counts = {};
  for (const [fileName, sourceFile] of parsedEntries(
    entries,
    ts.ScriptKind.JS,
    methodNames,
  )) {
    function visit(node, owner = "top") {
      let nextOwner = owner;
      if (
        (ts.isMethodDeclaration(node) || ts.isFunctionDeclaration(node)) &&
        node.name
      ) {
        nextOwner = node.name.getText(sourceFile);
      }
      const call = memberCall(node, sourceFile);
      if (call && predicate(call)) {
        const key = [
          fileName,
          ...(includeOwner ? [owner] : []),
          call.receiver,
          call.method,
          ...call.arguments,
        ].join("|");
        counts[key] = (counts[key] || 0) + 1;
      }
      ts.forEachChild(node, (child) => visit(child, nextOwner));
    }
    visit(sourceFile);
  }
  return counts;
}

export function sourceEntries() {
  return Object.freeze(
    javascriptFiles(sourceRoot).map((file) =>
      Object.freeze([relative(sourceRoot, file), readFileSync(file, "utf8")]),
    ),
  );
}

export function scalarCallsites(entries) {
  return collectCalls(
    entries,
    (call) =>
      ["key", "getItem", "setItem", "removeItem"].includes(call.method) ||
      (call.method === "clear" && /storage/i.test(call.receiver)),
    { methodNames: ["key", "getItem", "setItem", "removeItem", "clear"] },
  );
}

export function indexedDbCallsites(entries) {
  const methods = new Set([
    "open",
    "createObjectStore",
    "transaction",
    "objectStore",
    "get",
    "getKey",
    "put",
    "delete",
    "deleteDatabase",
    "clear",
    "close",
  ]);
  return collectCalls(
    entries,
    (call) =>
      methods.has(call.method) &&
      (["indexedDB", "request.result", "db", "tx", "store"].includes(
        call.receiver,
      ) ||
        call.receiver.endsWith(".indexedDB") ||
        call.receiver.startsWith("tx.objectStore(")),
    { includeOwner: true, methodNames: [...methods] },
  );
}

export function storageServiceCallsites(entries) {
  return collectCalls(
    entries,
    ({ method }) => storageServiceMethodNames.includes(method),
    { includeOwner: true, methodNames: storageServiceMethodNames },
  );
}

export function constructorCallsites(entries, names) {
  const counts = {};
  for (const [fileName, sourceFile] of parsedEntries(entries)) {
    function visit(node) {
      if (ts.isNewExpression(node)) {
        const name = normalizeSource(node.expression.getText(sourceFile));
        if (names.includes(name)) {
          const key = [
            fileName,
            name,
            ...(node.arguments || []).map((argument) =>
              normalizeSource(argument.getText(sourceFile)),
            ),
          ].join("|");
          counts[key] = (counts[key] || 0) + 1;
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(sourceFile);
  }
  return counts;
}

export function declaredRpcTopics(entries) {
  const topics = new Set();
  for (const [, sourceFile] of parsedEntries(entries, ts.ScriptKind.TS)) {
    function visit(node) {
      if (
        ts.isPropertySignature(node) &&
        node.name &&
        ts.isStringLiteralLike(node.name)
      ) {
        topics.add(node.name.text);
      }
      ts.forEachChild(node, visit);
    }
    visit(sourceFile);
  }
  return [...topics].sort();
}

export function observedRpcTopics(entries) {
  const topics = new Set();
  for (const [, sourceFile] of parsedEntries(entries)) {
    function visit(node) {
      if (ts.isCallExpression(node)) {
        const expression = node.expression;
        const call = memberCall(node, sourceFile);
        const method =
          call?.method ??
          (ts.isIdentifier(expression) ? expression.text : null);
        const firstArgument = node.arguments[0];
        const topicIndexes =
          ts.isIdentifier(expression) &&
          firstArgument &&
          !ts.isStringLiteralLike(firstArgument)
            ? [1]
            : [0];
        if (
          ["request", "respond", "invokeRequest", "invokeRespond"].includes(
            method || "",
          )
        ) {
          for (const index of topicIndexes) {
            const topic = node.arguments[index];
            if (topic && ts.isStringLiteralLike(topic)) topics.add(topic.text);
          }
        }
        if (["hasListeners", "on", "once", "emit", "off"].includes(method)) {
          const topic = node.arguments[0];
          if (
            topic &&
            ts.isStringLiteralLike(topic) &&
            topic.text.startsWith("rpc:")
          ) {
            topics.add(topic.text.slice(4));
          }
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(sourceFile);
  }
  return [...topics].sort();
}

export function namedMethodCallCounts(entries = sourceEntries()) {
  const callsites = storageServiceCallsites(entries);
  const counts = {};
  for (const [callsite, count] of Object.entries(callsites)) {
    const [fileName, , receiver, method] = callsite.split("|");
    const key = `${fileName}|${receiver}|${method}`;
    counts[key] = (counts[key] || 0) + count;
  }
  return counts;
}

/**
 * Syntactic action inventory, not alias resolution or a semantic call graph.
 * Anonymous callbacks retain their enclosing named function/method; named
 * arrow/function-valued variables establish their own location. Payload text
 * and physical line numbers deliberately do not define caller identity.
 */
export function profileMutationCallsites(entries, { dynamic = false } = {}) {
  const counts = {};
  for (const [fileName, sourceFile] of parsedEntries(
    entries,
    ts.ScriptKind.JS,
    ["request", "invokeRequest"],
  )) {
    function visit(node, owner = "top") {
      let nextOwner = owner;
      if (ts.isConstructorDeclaration(node)) {
        nextOwner = "constructor";
      } else if (
        (ts.isMethodDeclaration(node) || ts.isFunctionDeclaration(node)) &&
        node.name
      ) {
        nextOwner = node.name.getText(sourceFile);
      } else if (
        ts.isVariableDeclaration(node) &&
        node.initializer &&
        (ts.isArrowFunction(node.initializer) ||
          ts.isFunctionExpression(node.initializer))
      ) {
        nextOwner = node.name.getText(sourceFile);
      }
      if (ts.isCallExpression(node)) {
        const call = memberCall(node, sourceFile);
        const bareName = ts.isIdentifier(node.expression)
          ? node.expression.text
          : null;
        const member = call?.method === "request";
        if (member || ["request", "invokeRequest"].includes(bareName)) {
          const index =
            member ||
            (node.arguments[0] && ts.isStringLiteralLike(node.arguments[0]))
              ? 0
              : 1;
          const argument = node.arguments[index];
          const topic =
            argument && ts.isStringLiteralLike(argument) ? argument.text : null;
          if (dynamic ? topic === null : topic === "data:update-profile") {
            const key = [
              fileName,
              owner,
              member ? call.receiver : bareName,
              topic ?? "<dynamic-topic>",
            ].join("|");
            counts[key] = (counts[key] || 0) + 1;
          }
        }
      }
      ts.forEachChild(node, (child) => visit(child, nextOwner));
    }
    visit(sourceFile);
  }
  return counts;
}

/**
 * Freeze explicit helper edges so adding/moving a cohort import is reviewable.
 * Includes re-exports and dynamic import expressions (including nonliterals).
 * Does not resolve aliases, require(), or arbitrary runtime module loaders.
 */
export function profileMutationModuleDependencies(entries) {
  const counts = {};
  for (const [fileName, sourceFile] of parsedEntries(entries)) {
    function visit(node) {
      let kind;
      let argument;
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
        kind = "static";
        argument = node.moduleSpecifier;
      } else if (
        ts.isCallExpression(node) &&
        node.expression.kind === ts.SyntaxKind.ImportKeyword
      ) {
        kind = "dynamic";
        argument = node.arguments[0];
      }
      if (kind && argument) {
        const specifier = ts.isStringLiteralLike(argument)
          ? argument.text
          : "<dynamic-module>";
        const key = [fileName, kind, specifier].join("|");
        counts[key] = (counts[key] || 0) + 1;
      }
      ts.forEachChild(node, visit);
    }
    visit(sourceFile);
  }
  return counts;
}
