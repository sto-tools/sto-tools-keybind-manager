import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import * as ts from "typescript";
import { describe, expect, it } from "vitest";

import {
  componentStateOwnerNames,
  createComponentStateReply,
} from "../../../src/js/core/componentState.js";

const componentsRoot = resolve(process.cwd(), "src/js/components");

function javascriptFilesUnder(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) return javascriptFilesUnder(entryPath);
    return entry.isFile() && entry.name.endsWith(".js") ? [entryPath] : [];
  });
}

function declaredMemberName(member) {
  const { name } = member;
  if (!name) return null;
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text;
  if (ts.isComputedPropertyName(name) && ts.isStringLiteral(name.expression)) {
    return name.expression.text;
  }
  return null;
}

function extendedClassName(declaration) {
  const extendsClause = declaration.heritageClauses?.find(
    (clause) => clause.token === ts.SyntaxKind.ExtendsKeyword,
  );
  const expression = extendsClause?.types[0]?.expression;
  if (!expression) return null;
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  return null;
}

function componentStateOverrides() {
  const declarations = new Map();

  for (const filePath of javascriptFilesUnder(componentsRoot)) {
    const sourceFile = ts.createSourceFile(
      filePath,
      readFileSync(filePath, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.JS,
    );

    const visit = (node) => {
      if (ts.isClassDeclaration(node) && node.name) {
        const className = node.name.text;
        if (declarations.has(className)) {
          throw new Error(`Duplicate component class name: ${className}`);
        }
        declarations.set(className, {
          baseName: extendedClassName(node),
          ownsState: node.members.some(
            (member) => declaredMemberName(member) === "getCurrentState",
          ),
        });
      }
      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
  }

  const inheritsFromComponentBase = (className, ancestors = new Set()) => {
    if (className === "ComponentBase") return true;
    if (!className || ancestors.has(className)) return false;

    const declaration = declarations.get(className);
    if (!declaration) return false;

    const nextAncestors = new Set(ancestors);
    nextAncestors.add(className);
    return inheritsFromComponentBase(declaration.baseName, nextAncestors);
  };

  return [...declarations.entries()]
    .filter(
      ([className, declaration]) =>
        className !== "ComponentBase" &&
        declaration.ownsState &&
        inheritsFromComponentBase(className),
    )
    .map(([className]) => className)
    .sort();
}

describe("component late-join state registry", () => {
  it("exactly matches explicit production component state owners", () => {
    expect(Object.isFrozen(componentStateOwnerNames)).toBe(true);
    expect([...componentStateOwnerNames].sort()).toEqual(
      componentStateOverrides(),
    );
  }, 20_000);

  it("constructs replies only for registered owners with non-null state", () => {
    const state = {
      defaultProfiles: {},
      hasCommands: false,
      dataAvailable: true,
    };

    expect(createComponentStateReply("DataService", state)).toEqual({
      sender: "DataService",
      state,
    });
    expect(
      createComponentStateReply("UnregisteredStateOwner", { ready: true }),
    ).toBeNull();
    expect(
      createComponentStateReply("CommandChainService", { commands: [] }),
    ).toBeNull();
    expect(createComponentStateReply("DataService", null)).toBeNull();
  });
});
