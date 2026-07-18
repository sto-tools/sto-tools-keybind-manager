import { describe, expect, it } from "vitest";

import { planKBFImport } from "../../../src/js/components/services/kbfImportPlanner.js";

function createProfile() {
  return {
    name: "Captain",
    description: "Source profile",
    currentEnvironment: "space",
    builds: {
      space: {
        keys: {
          F1: ["ExistingConflict"],
          F2: ["ExistingOnly"],
        },
        aliases: {},
      },
      ground: { keys: { G: ["GroundOnly"] }, aliases: {} },
    },
    aliases: {
      Shared: {
        commands: ["ExistingAlias"],
        description: "existing",
        metadata: { source: "profile" },
      },
      ExistingOnly: { commands: ["KeepAlias"] },
    },
    bindsets: {
      Existing: {
        space: {
          keys: {
            F4: ["ExistingBindsetConflict"],
            F9: ["ExistingBindsetOnly"],
          },
        },
        ground: { keys: { G4: ["ExistingGroundBindset"] } },
      },
    },
    keybindMetadata: {
      space: {
        F1: { source: "profile" },
        F2: { stabilizeExecutionOrder: true },
      },
    },
    aliasMetadata: { ExistingOnly: { source: "profile" } },
    bindsetMetadata: {
      Existing: {
        space: {
          F4: { source: "profile" },
          F9: { stabilizeExecutionOrder: true },
        },
      },
    },
    selections: {},
  };
}

function createMasterParseResult() {
  return {
    bindsets: {
      Master: {
        keys: {
          F1: {
            commands: [" ImportedConflict ", ""],
            metadata: { stabilizeExecutionOrder: true, source: "kbf" },
          },
          F3: {
            commands: [" ImportedOnly "],
            metadata: { stabilizeExecutionOrder: true },
          },
        },
        aliases: {
          IgnoredScopedAlias: { commands: ["ScopedCommand"] },
        },
        metadata: { source: "kbf" },
      },
    },
    aliases: {
      Shared: {
        commands: [" ImportedAlias ", ""],
        description: "imported",
        metadata: { source: "kbf", nested: { layer: 1 } },
      },
      Fresh: { commands: [" FreshAlias "] },
    },
    errors: [{ message: "recoverable parse issue", fatal: false }],
    warnings: ["parse warning"],
    stats: {
      totalBindsets: 1,
      totalKeys: 2,
      totalAliases: 2,
      processedLayers: [1, 2, 3],
      skippedActivities: 1,
      totalActivities: 4,
    },
  };
}

function planMaster(strategy) {
  return planKBFImport({
    profile: createProfile(),
    parseResult: createMasterParseResult(),
    environment: "space",
    strategy,
    configuration: null,
    bindsetsEnabled: true,
  });
}

function plan(profile, parseResult, overrides = {}) {
  return planKBFImport({
    profile,
    parseResult,
    environment: "space",
    strategy: "merge_keep",
    configuration: null,
    bindsetsEnabled: true,
    ...overrides,
  });
}

function successful(result) {
  if (!result.success) throw new Error("Expected a successful plan");
  return result;
}

describe("planKBFImport", () => {
  it.each([
    {
      strategy: "merge_keep",
      keys: {
        F1: ["ExistingConflict"],
        F2: ["ExistingOnly"],
        F3: ["ImportedOnly"],
      },
      metadata: {
        F1: { source: "profile" },
        F2: { stabilizeExecutionOrder: true },
        F3: { stabilizeExecutionOrder: true },
      },
      counters: { imported: 1, skipped: 1, overwritten: 0, cleared: 0 },
    },
    {
      strategy: "merge_overwrite",
      keys: {
        F1: ["ImportedConflict"],
        F2: ["ExistingOnly"],
        F3: ["ImportedOnly"],
      },
      metadata: {
        F1: { source: "profile", stabilizeExecutionOrder: true },
        F2: { stabilizeExecutionOrder: true },
        F3: { stabilizeExecutionOrder: true },
      },
      counters: { imported: 2, skipped: 0, overwritten: 1, cleared: 0 },
    },
    {
      strategy: "overwrite_all",
      keys: {
        F1: ["ImportedConflict"],
        F3: ["ImportedOnly"],
      },
      metadata: {
        F1: { stabilizeExecutionOrder: true },
        F3: { stabilizeExecutionOrder: true },
      },
      counters: { imported: 2, skipped: 0, overwritten: 0, cleared: 2 },
    },
  ])(
    "preserves $strategy primary-build behavior and accounting",
    ({ strategy, keys, metadata, counters }) => {
      const result = successful(planMaster(strategy));

      expect(result).toMatchObject({
        success: true,
        imported: { bindsets: 1, keys: counters.imported, aliases: 2 },
        skipped: counters.skipped,
        overwritten: counters.overwritten,
        cleared: counters.cleared,
        errors: ["recoverable parse issue"],
        warnings: ["parse warning"],
        stats: {
          processedLayers: [1, 2, 3],
          skippedActivities: 1,
          totalActivities: 4,
          totalErrors: 1,
          totalWarnings: 1,
        },
        bindsetNames: ["Master"],
        masterBindset: {
          hasMasterBindset: true,
          masterBindsetName: "Master",
          mappedToPrimary: true,
          displayName: "Primary Bindset",
        },
        singleBindsetFile: {
          isSingleBindset: true,
          onlyBindsetIsMaster: true,
          requiresBindsetSelection: false,
          totalBindsetsAvailable: 1,
          selectedBindsetsCount: 1,
        },
      });
      expect(result.nextProfile.builds.space.keys).toEqual(keys);
      expect(result.nextProfile.builds.ground.keys).toEqual({
        G: ["GroundOnly"],
      });
      expect(result.nextProfile.keybindMetadata.space).toEqual(metadata);
      expect(result.nextProfile.aliases).toEqual({
        Shared: {
          commands: ["ImportedAlias"],
          description: "imported",
          metadata: { source: "kbf", nested: { layer: 1 } },
        },
        ExistingOnly: { commands: ["KeepAlias"] },
        Fresh: { commands: ["FreshAlias"], description: "", metadata: {} },
      });
      expect(result.nextProfile.aliases.IgnoredScopedAlias).toBeUndefined();
      expect(result.nextProfile.aliasMetadata).toEqual({
        ExistingOnly: { source: "profile" },
      });
    },
  );

  it("maps selected bindsets to renamed custom destinations", () => {
    const profile = createProfile();
    const parseResult = {
      bindsets: {
        Alpha: {
          keys: {
            F4: {
              commands: ["ImportedBindsetConflict"],
              metadata: { stabilizeExecutionOrder: true },
            },
            F5: { commands: ["ImportedBindsetOnly"], metadata: {} },
          },
          aliases: {},
          metadata: {},
        },
        Beta: {
          keys: {
            F6: { commands: ["Unselected"], metadata: {} },
          },
          aliases: {},
          metadata: {},
        },
      },
      aliases: {},
      errors: [],
      warnings: [],
      stats: {
        totalBindsets: 2,
        totalKeys: 3,
        totalAliases: 0,
        processedLayers: [1],
        skippedActivities: 0,
      },
    };

    const result = successful(
      plan(profile, parseResult, {
        strategy: "merge_overwrite",
        configuration: {
          selectedBindsets: ["Alpha"],
          bindsetMappings: { Alpha: "custom" },
          bindsetRenames: { Alpha: "Existing" },
        },
      }),
    );

    expect(result).toMatchObject({
      success: true,
      imported: { bindsets: 1, keys: 2, aliases: 0 },
      skipped: 0,
      overwritten: 1,
      cleared: 0,
      masterBindset: { mappedToPrimary: false },
      singleBindsetFile: {
        isSingleBindset: false,
        requiresBindsetSelection: true,
        selectedBindsetsCount: 1,
      },
    });
    expect(result.nextProfile.bindsets.Existing.space.keys).toEqual({
      F4: ["ImportedBindsetConflict"],
      F9: ["ExistingBindsetOnly"],
      F5: ["ImportedBindsetOnly"],
    });
    expect(result.nextProfile.bindsets.Existing.ground.keys).toEqual({
      G4: ["ExistingGroundBindset"],
    });
    expect(result.nextProfile.bindsets.Beta).toBeUndefined();
    expect(result.nextProfile.builds.space.keys).toEqual(
      profile.builds.space.keys,
    );
    expect(result.nextProfile.bindsetMetadata.Existing.space).toEqual({
      F4: { source: "profile", stabilizeExecutionOrder: true },
      F9: { stabilizeExecutionOrder: true },
    });
  });

  it("returns the established bindsets-disabled failures without mutation", () => {
    const profile = createProfile();
    const parseResult = createMasterParseResult();
    parseResult.bindsets.Secondary = {
      keys: {},
      aliases: {},
      metadata: {},
    };
    parseResult.stats.totalBindsets = 2;

    const multiple = plan(profile, parseResult, {
      configuration: {
        selectedBindsets: ["Master", "Secondary"],
        bindsetMappings: {},
        bindsetRenames: {},
      },
      bindsetsEnabled: false,
    });
    expect(multiple).toMatchObject({
      success: false,
      error: "multiple_bindsets_not_allowed",
    });
    expect("nextProfile" in multiple).toBe(false);

    const nonPrimary = plan(profile, parseResult, {
      configuration: {
        selectedBindsets: ["Secondary"],
        bindsetMappings: { Secondary: "custom" },
        bindsetRenames: {},
      },
      bindsetsEnabled: false,
    });
    expect(nonPrimary).toMatchObject({
      success: false,
      error: "non_primary_mapping_not_allowed",
    });
    expect(profile).toEqual(createProfile());
  });

  it("creates missing profile containers and retains the Master primary default", () => {
    const profile = { name: "Minimal profile" };
    const result = successful(
      plan(profile, createMasterParseResult(), {
        environment: "ground",
        bindsetsEnabled: false,
      }),
    );

    expect(result).toMatchObject({
      success: true,
      imported: { bindsets: 1, keys: 2, aliases: 2 },
      masterBindset: { mappedToPrimary: true },
    });
    expect(result.nextProfile.builds.ground).toMatchObject({
      keys: { F1: ["ImportedConflict"], F3: ["ImportedOnly"] },
      aliases: {},
    });
    expect(result.nextProfile.bindsets).toEqual({});
    expect(profile).toEqual({ name: "Minimal profile" });
  });

  it("deeply detaches the result from profile and parser-owned data", () => {
    const profile = createProfile();
    const parseResult = createMasterParseResult();
    const result = successful(
      plan(profile, parseResult, {
        strategy: "merge_overwrite",
      }),
    );

    expect(result.nextProfile).not.toBe(profile);
    expect(result.nextProfile.builds).not.toBe(profile.builds);
    expect(result.nextProfile.aliases.Shared.metadata).not.toBe(
      parseResult.aliases.Shared.metadata,
    );
    result.nextProfile.builds.space.keys.F1.push("ResultOnly");
    result.nextProfile.aliases.Shared.metadata.nested.layer = 9;

    expect(profile.builds.space.keys.F1).toEqual(["ExistingConflict"]);
    expect(parseResult.bindsets.Master.keys.F1.commands).toEqual([
      " ImportedConflict ",
      "",
    ]);
    expect(parseResult.aliases.Shared.metadata.nested.layer).toBe(1);
  });

  it("materializes cycle controllers from the selected step with alias fidelity", () => {
    const parseResult = createMasterParseResult();
    parseResult.aliases = {
      cycle_controller: {
        steps: ["cycle_step_0", "cycle_step_1"],
        currentIndex: 1,
        name: "cycle_controller",
        type: "cycle",
        isGenerated: true,
        metadata: { source: "activity-97" },
      },
      cycle_step_0: {
        commands: ["emote_notext wave"],
        next: "cycle_step_1",
        name: "cycle_step_0",
      },
      cycle_step_1: {
        commands: ["emote_notext dance"],
        next: "cycle_step_0",
        name: "cycle_step_1",
        description: "Cycle step",
        category: "generated",
        isLoader: false,
      },
    };
    parseResult.stats.totalAliases = 3;

    const result = successful(plan(createProfile(), parseResult));

    expect(result.nextProfile.aliases.cycle_controller).toEqual({
      commands: ["cycle_step_1"],
      description: "",
      metadata: { source: "activity-97" },
      type: "cycle",
      name: "cycle_controller",
      isGenerated: true,
      currentIndex: 1,
      steps: ["cycle_step_0", "cycle_step_1"],
    });
    expect(result.nextProfile.aliases.cycle_step_1).toEqual({
      commands: ["emote_notext dance"],
      description: "Cycle step",
      metadata: {},
      name: "cycle_step_1",
      isLoader: false,
      category: "generated",
      next: "cycle_step_0",
    });
    expect(result.imported.aliases).toBe(3);

    result.nextProfile.aliases.cycle_controller.steps.push("result_only");
    result.nextProfile.aliases.cycle_controller.metadata.source = "result";
    expect(parseResult.aliases.cycle_controller.steps).toEqual([
      "cycle_step_0",
      "cycle_step_1",
    ]);
    expect(parseResult.aliases.cycle_controller.metadata.source).toBe(
      "activity-97",
    );
  });

  it("refuses colliding custom destinations outside its decoded precondition", () => {
    const parseResult = createMasterParseResult();
    parseResult.bindsets.Secondary = {
      keys: {},
      aliases: {},
      metadata: {},
    };
    parseResult.stats.totalBindsets = 2;

    expect(() =>
      plan(createProfile(), parseResult, {
        configuration: {
          selectedBindsets: ["Master", "Secondary"],
          bindsetMappings: { Master: "custom", Secondary: "custom" },
          bindsetRenames: { Master: "Shared", Secondary: "Shared" },
        },
      }),
    ).toThrow(
      'Canonical KBF configuration contains colliding custom destination "Shared"',
    );
  });

  it("uses own-data reads and writes for prototype-shaped names", () => {
    const profile = createProfile();
    const parseResult = {
      bindsets: {
        toString: {
          keys: {
            hasOwnProperty: { commands: ["SafeCommand"], metadata: {} },
          },
          aliases: {},
          metadata: {},
        },
      },
      aliases: {
        toString: {
          commands: ["SafeAlias"],
          metadata: { source: "kbf" },
        },
      },
      errors: [],
      warnings: [],
      stats: {
        totalBindsets: 1,
        totalKeys: 1,
        totalAliases: 1,
        processedLayers: [1],
        skippedActivities: 0,
      },
    };

    const result = successful(
      plan(profile, parseResult, {
        configuration: {
          selectedBindsets: ["toString"],
          bindsetMappings: { toString: "custom" },
          bindsetRenames: { toString: "toString" },
        },
      }),
    );

    expect(Object.hasOwn(result.nextProfile.bindsets, "toString")).toBe(true);
    expect(
      Object.hasOwn(
        result.nextProfile.bindsets.toString.space.keys,
        "hasOwnProperty",
      ),
    ).toBe(true);
    expect(
      result.nextProfile.bindsets.toString.space.keys.hasOwnProperty,
    ).toEqual(["SafeCommand"]);
    expect(Object.hasOwn(result.nextProfile.aliases, "toString")).toBe(true);
    expect(result.nextProfile.aliases.toString.commands).toEqual(["SafeAlias"]);
    expect(Object.hasOwn(result.nextProfile.bindsetMetadata, "toString")).toBe(
      false,
    );
    expect(Object.prototype).not.toHaveProperty("SafeCommand");
  });
});
