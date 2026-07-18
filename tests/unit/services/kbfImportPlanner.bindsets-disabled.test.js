import { describe, expect, it } from "vitest";

import { planKBFImport } from "../../../src/js/components/services/kbfImportPlanner.js";

const createProfile = () => ({
  builds: {
    space: { keys: {}, aliases: {} },
    ground: { keys: {}, aliases: {} },
  },
  bindsets: {},
  aliases: {},
  keybindMetadata: {},
  aliasMetadata: {},
  bindsetMetadata: {},
});

const createParseResult = () => ({
  bindsets: {
    Alpha: {
      keys: { F1: { commands: ["AlphaCommand"], metadata: {} } },
      aliases: {},
      metadata: {},
    },
    Beta: {
      keys: { F2: { commands: ["BetaCommand"], metadata: {} } },
      aliases: {},
      metadata: {},
    },
  },
  aliases: {},
  errors: [],
  warnings: [],
  stats: {
    totalBindsets: 2,
    totalKeys: 2,
    totalAliases: 0,
    processedLayers: [1],
    skippedActivities: 0,
  },
});

const plan = (configuration) =>
  planKBFImport({
    profile: createProfile(),
    parseResult: createParseResult(),
    environment: "space",
    strategy: "merge_keep",
    configuration,
    bindsetsEnabled: false,
  });

describe("planKBFImport with bindsets disabled", () => {
  it.each([
    ["null configuration", null],
    [
      "omitted mappings",
      {
        selectedBindsets: ["Alpha", "Beta"],
        bindsetMappings: {},
        bindsetRenames: {},
      },
    ],
  ])("rejects multiple selected bindsets with %s", (_, configuration) => {
    const result = plan(configuration);

    expect(result).toMatchObject({
      success: false,
      error: "multiple_bindsets_not_allowed",
    });
    expect(result).not.toHaveProperty("nextProfile");
  });

  it("materializes an omitted single mapping in the primary build", () => {
    const result = plan({
      selectedBindsets: ["Alpha"],
      bindsetMappings: {},
      bindsetRenames: {},
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.nextProfile.builds.space.keys).toEqual({
      F1: ["AlphaCommand"],
    });
    expect(result.nextProfile.bindsets).not.toHaveProperty("Alpha");
    expect(result.imported.bindsets).toBe(1);
  });
});
