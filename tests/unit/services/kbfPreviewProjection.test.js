import { describe, expect, it } from "vitest";

import { projectKBFPreview } from "../../../src/js/components/services/kbfPreviewProjection.js";

function bindset(keys, metadata = {}) {
  return {
    keys,
    metadata,
    aliases: {},
    layers: [],
  };
}

function parseResult(overrides = {}) {
  return {
    bindsets: {},
    aliases: {},
    metadata: {},
    errors: [],
    warnings: [],
    stats: {
      totalBindsets: 0,
      totalKeys: 0,
      totalAliases: 0,
      totalActivities: 0,
    },
    ...overrides,
  };
}

describe("KBF preview projection", () => {
  it("projects multi-bindset counts, case-insensitive Master metadata, and diagnostics", () => {
    const source = parseResult({
      bindsets: {
        Space: bindset({ F1: { commands: ["One"] }, F2: { commands: [] } }),
        MASTER: bindset(
          { G: { commands: ["Ground"] } },
          {
            displayName: "Canonical Master",
          },
        ),
      },
      aliases: { Fire: { commands: ["FireAll"] } },
      stats: {
        totalBindsets: 2,
        totalKeys: 3,
        totalAliases: 1,
        totalActivities: 0,
      },
    });
    const errors = ["recoverable parse issue"];
    const warnings = ["selection warning"];

    const result = projectKBFPreview(source, 4096, errors, warnings);

    expect(result).toEqual({
      valid: true,
      bindsets: source.bindsets,
      bindsetNames: ["Space", "MASTER"],
      bindsetKeyCounts: { Space: 2, MASTER: 1 },
      hasMasterBindset: true,
      masterDisplayName: "Canonical Master",
      metadata: {
        totalBindsets: 2,
        estimatedSize: 4096,
        hasAliases: true,
      },
      validation: { valid: true, errors, warnings },
      singleBindsetFile: {
        isSingleBindset: false,
        onlyBindsetIsMaster: false,
        requiresBindsetSelection: true,
      },
      requiresBindsetSelection: true,
    });
    expect(result.bindsets).toBe(source.bindsets);
    expect(result.validation.errors).toBe(errors);
    expect(result.validation.warnings).toBe(warnings);
  });

  it("preserves the single non-Master fallback contract", () => {
    const source = parseResult({
      bindsets: { Solo: bindset(undefined, { displayName: "Ignored" }) },
      aliases: undefined,
      stats: {
        totalBindsets: 1,
        totalKeys: 0,
        totalAliases: 0,
        totalActivities: 0,
      },
    });

    expect(projectKBFPreview(source, 0, [], [])).toEqual({
      valid: true,
      bindsets: source.bindsets,
      bindsetNames: ["Solo"],
      bindsetKeyCounts: { Solo: 0 },
      hasMasterBindset: false,
      masterDisplayName: "Primary Bindset",
      metadata: {
        totalBindsets: 1,
        estimatedSize: 0,
        hasAliases: undefined,
      },
      validation: { valid: true, errors: [], warnings: [] },
      singleBindsetFile: {
        isSingleBindset: true,
        onlyBindsetIsMaster: false,
        requiresBindsetSelection: false,
      },
      requiresBindsetSelection: false,
    });
  });

  it("marks a single Master bindset while retaining an empty display name", () => {
    const source = parseResult({
      bindsets: { Master: bindset({}, { displayName: "" }) },
      stats: {
        totalBindsets: 1,
        totalKeys: 0,
        totalAliases: 0,
        totalActivities: 0,
      },
    });

    const result = projectKBFPreview(source, 12, [], []);

    expect(result).toMatchObject({
      hasMasterBindset: true,
      masterDisplayName: "",
      bindsetKeyCounts: { Master: 0 },
      singleBindsetFile: {
        isSingleBindset: true,
        onlyBindsetIsMaster: true,
        requiresBindsetSelection: false,
      },
      requiresBindsetSelection: false,
    });
  });
});
