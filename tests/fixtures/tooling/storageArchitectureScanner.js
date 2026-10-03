import { basename } from "node:path";
import ts from "typescript";
import {
  concreteAdapters,
  scalarBoundaryFiles,
  scalarWriterRoutes,
} from "./storageArchitectureInventory.js";
import { indexedDbCallsites, scalarCallsites } from "./persistenceScanner.js";

const syncFile = "components/services/FileSystemService.js";
const scalarMethods = new Set(["getItem", "setItem", "removeItem"]);
const idbMethods = new Set([
  "transaction",
  "objectStore",
  "createObjectStore",
  "getKey",
  "put",
  "deleteDatabase",
]);
const parsedSnapshots = new WeakMap();

function* parsedEntries(entries, fileOnly) {
  // Only exact immutable snapshots can share ASTs. Mutable negative probes
  // must always be parsed anew, including a frozen outer array with mutable rows.
  const immutable =
    Object.isFrozen(entries) &&
    entries.every(
      (entry) =>
        Object.isFrozen(entry) &&
        typeof entry[0] === "string" &&
        typeof entry[1] === "string",
    );
  let parsed = immutable ? parsedSnapshots.get(entries) : undefined;
  if (immutable && !parsed) {
    parsed = new Map();
    parsedSnapshots.set(entries, parsed);
  }
  for (const entry of entries) {
    const [file, source] = entry;
    if (fileOnly !== undefined && file !== fileOnly) continue;
    let ast = parsed?.get(entry);
    if (!ast) {
      ast = ts.createSourceFile(
        file,
        source,
        {
          languageVersion: ts.ScriptTarget.Latest,
          jsDocParsingMode: ts.JSDocParsingMode.ParseNone,
        },
        true,
        ts.ScriptKind.JS,
      );
      parsed?.set(entry, ast);
    }
    yield [file, ast];
  }
}

function literal(node) {
  if (!node) return null;
  if (ts.isComputedPropertyName(node)) return literal(node.expression);
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isParenthesizedExpression(node)) return literal(node.expression);
  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.PlusToken
  ) {
    const left = literal(node.left);
    const right = literal(node.right);
    return left !== null && right !== null ? left + right : null;
  }
  return null;
}

function member(node) {
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  if (ts.isElementAccessExpression(node))
    return literal(node.argumentExpression);
  return null;
}

function constructorName(node) {
  const name = member(node);
  return name === null
    ? node.getText()
    : `${node.expression.getText()}.${name}`;
}

function registerAlias(node, aliases) {
  if (
    ts.isImportDeclaration(node) &&
    ts.isStringLiteralLike(node.moduleSpecifier)
  ) {
    const adapter = basename(node.moduleSpecifier.text, ".js");
    if (!concreteAdapters.includes(adapter)) return;
    if (node.importClause?.name)
      aliases.set(node.importClause.name.text, adapter);
    const bindings = node.importClause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) {
      for (const binding of bindings.elements)
        aliases.set(binding.name.text, adapter);
    } else if (bindings && ts.isNamespaceImport(bindings)) {
      aliases.set(`${bindings.name.text}.default`, adapter);
    }
  }
  if (
    ts.isVariableDeclaration(node) &&
    ts.isIdentifier(node.name) &&
    node.initializer
  ) {
    const adapter = aliases.get(constructorName(node.initializer));
    if (adapter) aliases.set(node.name.text, adapter);
  }
}

/**
 * Conservative executable-syntax checks, not a semantic graph. Known globals,
 * literal/concatenated members, extraction/destructuring, imported constructor
 * aliases, and dynamic access on recognizable storage receivers are covered.
 * Arbitrary reflection, eval, and unknown injected aliases are not resolved.
 */
export function storageArchitectureViolations(entries) {
  const violations = [];
  for (const [file, parsed] of parsedEntries(entries)) {
    const aliases = new Map(concreteAdapters.map((name) => [name, name]));
    const report = (code, node) =>
      violations.push({ file, code, expression: node.getText(parsed) });
    const scalarAllowed = scalarBoundaryFiles.includes(file);
    function visit(node) {
      registerAlias(node, aliases);
      if (
        ts.isImportDeclaration(node) &&
        ts.isStringLiteralLike(node.moduleSpecifier)
      ) {
        const adapter = basename(node.moduleSpecifier.text, ".js");
        if (concreteAdapters.includes(adapter)) {
          if (file !== "main.js")
            report("adapter_import_outside_composition", node);
          if (node.importClause?.name)
            aliases.set(node.importClause.name.text, adapter);
          const bindings = node.importClause?.namedBindings;
          if (bindings && ts.isNamedImports(bindings)) {
            for (const element of bindings.elements)
              aliases.set(element.name.text, adapter);
          }
        }
      }
      if (ts.isNewExpression(node)) {
        const name = constructorName(node.expression);
        if (aliases.has(name) && file !== "main.js")
          report("adapter_constructor_outside_composition", node);
      }
      if (
        ts.isIdentifier(node) &&
        ["localStorage", "indexedDB"].includes(node.text)
      ) {
        const allowed =
          node.text === "localStorage" ? file === "main.js" : file === syncFile;
        if (!allowed) report("storage_global_outside_boundary", node);
      }
      if (
        ts.isPropertyAccessExpression(node) ||
        ts.isElementAccessExpression(node)
      ) {
        const name = member(node);
        if (["localStorage", "indexedDB"].includes(name)) {
          const allowed =
            name === "localStorage" ? file === "main.js" : file === syncFile;
          if (!allowed) report("storage_global_outside_boundary", node);
        }
        if (scalarMethods.has(name) && !scalarAllowed)
          report("scalar_access_outside_boundary", node);
        if (idbMethods.has(name) && file !== syncFile)
          report("indexeddb_access_outside_boundary", node);
        if (
          ts.isElementAccessExpression(node) &&
          name === null &&
          /(?:^|[.#])(?:[a-z_$]*storage|indexedDB|db|tx|store)$/i.test(
            node.expression.getText(parsed),
          )
        ) {
          report("dynamic_storage_access", node);
        }
      }
      if (ts.isBindingElement(node)) {
        const name = node.propertyName
          ? (literal(node.propertyName) ?? node.propertyName.getText(parsed))
          : node.name.getText(parsed);
        if (["localStorage", "indexedDB"].includes(name)) {
          const allowed =
            name === "localStorage" ? file === "main.js" : file === syncFile;
          if (!allowed)
            report("storage_global_extraction_outside_boundary", node);
        }
        if (scalarMethods.has(name) && !scalarAllowed)
          report("scalar_extraction_outside_boundary", node);
        if (idbMethods.has(name) && file !== syncFile)
          report("indexeddb_extraction_outside_boundary", node);
      }
      if (
        ts.isCallExpression(node) &&
        node.expression.kind === ts.SyntaxKind.ImportKeyword
      ) {
        const specifier = literal(node.arguments[0]);
        if (
          specifier === null ||
          concreteAdapters.some((name) => specifier.endsWith(`/${name}.js`))
        )
          report("dynamic_adapter_import", node);
      }
      ts.forEachChild(node, visit);
    }
    visit(parsed);
  }
  return violations;
}

export function adapterRegistrations(entries) {
  const registrations = [];
  for (const [file, parsed] of parsedEntries(entries)) {
    const aliases = new Map(concreteAdapters.map((name) => [name, name]));
    function visit(node) {
      registerAlias(node, aliases);
      if (
        ts.isNewExpression(node) &&
        aliases.has(constructorName(node.expression))
      )
        registrations.push({
          file,
          adapter: aliases.get(constructorName(node.expression)),
        });
      ts.forEachChild(node, visit);
    }
    visit(parsed);
  }
  return registrations;
}

// In the sole IDB implementation, also count writes on *any* receiver. The
// older exact-call inventory independently retains receiver/key/argument proof.
export function indexedDbWriterMethods(entries) {
  const methods = {};
  for (const [, parsed] of parsedEntries(entries, syncFile)) {
    function visit(node) {
      if (ts.isCallExpression(node)) {
        const name = member(node.expression);
        if (["put", "delete", "clear", "deleteDatabase"].includes(name))
          methods[name] = (methods[name] ?? 0) + 1;
      }
      ts.forEachChild(node, visit);
    }
    visit(parsed);
  }
  return methods;
}

export function representationWriterRoutes(entries) {
  const routes = [];
  for (const [callsite, count] of Object.entries(scalarCallsites(entries))) {
    const [file, , method, key] = callsite.split("|");
    if (!["setItem", "removeItem", "clear"].includes(method)) continue;
    const module = basename(file, ".js");
    // Private scoped transport has no separately constructed owner authority.
    if (module === "scopedLocalStorage") {
      routes.push({
        callsite,
        count,
        adapter: "scoped-transport",
        representations: [],
      });
      continue;
    }
    const representations = scalarWriterRoutes[module]?.[key] ?? [];
    routes.push({
      callsite,
      count,
      adapter: [
        "projectSchemaMigrationPersistence",
        "projectRepositoryReset",
      ].includes(module)
        ? "LocalStorageProjectRepository"
        : module,
      representations,
    });
  }
  for (const [callsite, count] of Object.entries(indexedDbCallsites(entries))) {
    const [, , , method, , key] = callsite.split("|");
    if (!["put", "delete"].includes(method)) continue;
    const actualKey = method === "delete" ? callsite.split("|")[4] : key;
    const representations =
      actualKey === "KEY_SYNC_FOLDER"
        ? ["sto-sync-handles/directories/sync-folder"]
        : actualKey === "KEY_SYNC_FOLDER_TRANSITION"
          ? ["sto-sync-handles/directories/sync-folder-transition-pending"]
          : actualKey === "key"
            ? [
                "sto-sync-handles/directories/sync-folder",
                "sto-sync-handles/directories/sync-folder-transition-pending",
              ]
            : [];
    routes.push({
      callsite,
      count,
      adapter: "FileSystemService",
      representations,
    });
  }
  return routes;
}

// Exact-name read/materialization ratchet for root boundaries. Deletion is the
// sole permitted own settings member operation in the legacy decoder. This
// scans all receiver names in these files, not only variables named root.
export function embeddedSettingsOperations(entries) {
  const operations = [];
  for (const [file, parsed] of parsedEntries(entries)) {
    function visit(node) {
      if (
        (ts.isPropertyAccessExpression(node) ||
          ts.isElementAccessExpression(node)) &&
        member(node) === "settings"
      ) {
        operations.push({
          file,
          kind: ts.isDeleteExpression(node.parent) ? "delete" : "member",
          expression: node.getText(parsed),
        });
      }
      const field = ts.isBindingElement(node)
        ? (node.propertyName ?? node.name)
        : node.name;
      if (
        (ts.isPropertyAssignment(node) ||
          ts.isShorthandPropertyAssignment(node) ||
          ts.isBindingElement(node)) &&
        (literal(field) ?? field.getText(parsed)) === "settings"
      ) {
        operations.push({
          file,
          kind: "materialize-or-extract",
          expression: node.getText(parsed),
        });
      }
      ts.forEachChild(node, visit);
    }
    visit(parsed);
  }
  return operations;
}

/** Ban retired live-runtime registries, including literal bracket and explicit
 * Object/Reflect property registration. No arbitrary reflection/alias claim. */
export function runtimeDiagnosticEscapes(entries) {
  const forbidden = new Set([
    "runtimeDiagnostics",
    "getRuntimeDiagnostics",
    "registerRuntimeDiagnostics",
    "clearRuntimeDiagnostics",
  ]);
  const escapes = [];
  for (const [file, parsed] of parsedEntries(entries)) {
    function visit(node) {
      let name = ts.isIdentifier(node) ? node.text : member(node);
      if (
        (ts.isPropertyAssignment(node) ||
          ts.isMethodDeclaration(node) ||
          ts.isGetAccessorDeclaration(node) ||
          ts.isSetAccessorDeclaration(node)) &&
        node.name
      ) {
        name = literal(node.name) ?? node.name.getText(parsed);
      }
      if (
        ts.isCallExpression(node) &&
        ["defineProperty", "set", "get"].includes(member(node.expression)) &&
        /^(?:Object|Reflect)$/.test(
          node.expression.expression?.getText(parsed) ?? "",
        )
      ) {
        name = literal(node.arguments[1]);
      }
      if (forbidden.has(name))
        escapes.push({ file, name, expression: node.getText(parsed) });
      ts.forEachChild(node, visit);
    }
    visit(parsed);
  }
  return escapes;
}
