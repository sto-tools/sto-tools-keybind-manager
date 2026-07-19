import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ImportService from "../../../src/js/components/services/ImportService.js";
import { request, respond } from "../../../src/js/core/requestResponse.js";
import { createServiceFixture } from "../../fixtures/index.js";

const profileId = "captain";

function profile(overrides = {}) {
  return {
    name: "Captain",
    currentEnvironment: "space",
    builds: {
      space: { keys: { F1: ["Existing"], F9: ["ExistingOnly"] } },
      ground: { keys: {} },
    },
    aliases: {
      Existing: { commands: ["ExistingAlias"] },
      sto_kb_existing: { commands: ["GeneratedExisting"] },
    },
    keybindMetadata: {
      space: {
        F1: { stabilizeExecutionOrder: true, source: "existing" },
        F9: { source: "existing-only" },
        Orphan: { source: "orphan" },
      },
    },
    aliasMetadata: {
      Existing: { source: "existing" },
      sto_kb_existing: { source: "generated" },
      Orphan: { source: "orphan" },
    },
    ...overrides,
  };
}

describe("ImportService text-profile planner facade", () => {
  let fixture;
  let service;
  let detachCommit;
  let detachParser;
  let trace;
  let commitPayloads;

  beforeEach(() => {
    fixture = createServiceFixture();
    fixture.storage.saveProfile(profileId, profile());
    fixture.storage.saveProfile.mockClear();
    trace = [];
    commitPayloads = [];

    detachCommit = respond(
      fixture.eventBus,
      "data:update-profile",
      async (payload) => {
        const { profileId: targetProfileId, updates } = payload;
        commitPayloads.push(structuredClone(payload));
        trace.push("commit");
        const saved = await fixture.storage.saveProfile(
          targetProfileId,
          structuredClone(updates.replacement),
        );
        if (saved === false) return { success: false };
        return {
          success: true,
          profile: fixture.storage.getProfile(targetProfileId),
        };
      },
    );
    detachParser = respond(
      fixture.eventBus,
      "parser:parse-command-string",
      ({ commandString, options }) => {
        trace.push(`parse:${commandString}:${options ? "optimize" : "plain"}`);
        return {
          commands: commandString
            ? commandString.split(/\s*\$\$\s*/).map((command) => ({ command }))
            : [],
          isMirrored: false,
        };
      },
    );

    service = new ImportService({
      eventBus: fixture.eventBus,
      storage: fixture.storage,
      i18n: { t: (key) => key },
    });
    service.init();
    fixture.eventBus.on("profile:updated", () => trace.push("legacy"));
    vi.spyOn(service, "markAppModified").mockImplementation(() => {
      trace.push("modified");
    });
  });

  afterEach(() => {
    service?.destroy();
    detachParser?.();
    detachCommit?.();
    fixture?.destroy();
    vi.restoreAllMocks();
  });

  it("wires keybind planning through one authoritative commit in per-entry order", async () => {
    const result = await service.importKeybindFile(
      'F1 "Imported"\nF2 "Second"',
      profileId,
      "space",
      { strategy: "merge_overwrite" },
    );
    trace.push("resolved");

    expect(result).toEqual({
      success: true,
      imported: { keys: 2 },
      skipped: 0,
      overwritten: 1,
      cleared: 0,
      errors: [],
      message: "import_completed_keybinds",
    });
    expect(trace).toEqual([
      "parse:Imported:plain",
      "parse:Second:plain",
      "parse:Imported:plain",
      "parse:Imported:optimize",
      "parse:Second:plain",
      "parse:Second:optimize",
      "commit",
      "legacy",
      "modified",
      "resolved",
    ]);
    expect(fixture.storage.saveProfile).toHaveBeenCalledOnce();
    expect(commitPayloads).toEqual([
      {
        profileId,
        updates: {
          replacement: expect.objectContaining({
            name: "Captain",
            builds: expect.objectContaining({
              space: expect.objectContaining({
                keys: {
                  F1: ["Imported"],
                  F2: ["Second"],
                  F9: ["ExistingOnly"],
                },
              }),
            }),
          }),
          updateSource: "ImportService",
        },
        createIfMissing: true,
      },
    ]);
    expect(fixture.storage.getProfile(profileId)).toMatchObject({
      builds: {
        space: {
          keys: {
            F1: ["Imported"],
            F2: ["Second"],
            F9: ["ExistingOnly"],
          },
        },
      },
      keybindMetadata: {
        space: {
          F1: { stabilizeExecutionOrder: true, source: "existing" },
          F9: { source: "existing-only" },
          Orphan: { source: "orphan" },
        },
      },
    });
  });

  it("wires alias overwrite-all policy without re-importing generated aliases", async () => {
    const result = await service.importAliasFile(
      'alias Existing "ImportedAlias"\nalias Fresh "First $$ Second"\nalias sto_kb_generated "Ignored"',
      profileId,
      { strategy: "overwrite_all" },
    );

    expect(result).toEqual({
      success: true,
      imported: { aliases: 2 },
      skipped: 0,
      overwritten: 0,
      cleared: 2,
      errors: [],
      message: "import_completed_aliases",
    });
    expect(fixture.storage.getProfile(profileId)).toMatchObject({
      aliases: {
        Existing: { commands: ["ImportedAlias"], description: "" },
        Fresh: { commands: ["First", "Second"], description: "" },
      },
      aliasMetadata: { Orphan: { source: "orphan" } },
    });
    expect(fixture.storage.getProfile(profileId).aliases).not.toHaveProperty(
      "sto_kb_existing",
    );
    expect(fixture.storage.getProfile(profileId).aliases).not.toHaveProperty(
      "sto_kb_generated",
    );
    expect(trace.slice(-3)).toEqual(["commit", "legacy", "modified"]);
  });

  it.each([
    ["omitted top-level strategy", undefined, 1, 0],
    ["invalid top-level strategy", "future_strategy", 1, 0],
    ["valid top-level strategy", "merge_overwrite", 0, 1],
  ])(
    "uses the historical RPC strategy precedence for %s",
    async (_label, strategy, skipped, overwritten) => {
      const result = await request(fixture.eventBus, "import:keybind-file", {
        content: 'F1 "Imported"\nF2 "Second"',
        profileId,
        environment: "space",
        options: { strategy: "overwrite_all" },
        ...(strategy === undefined ? {} : { strategy }),
      });

      expect(result).toMatchObject({
        success: true,
        imported: { keys: skipped === 1 ? 1 : 2 },
        skipped,
        overwritten,
        cleared: 0,
      });
      const keys = fixture.storage.getProfile(profileId).builds.space.keys;
      expect(keys.F9).toEqual(["ExistingOnly"]);
      expect(keys.F1).toEqual(skipped === 1 ? ["Existing"] : ["Imported"]);
    },
  );

  it.each([
    {
      kind: "keybind",
      importContent: async () =>
        service.importKeybindFile(
          'F1 "Imported"\nF2 "Second"',
          profileId,
          "space",
        ),
      imported: { keys: 1 },
      preserved: () =>
        fixture.storage.getProfile(profileId).builds.space.keys.F1,
      expectedPreserved: ["Existing"],
    },
    {
      kind: "alias",
      importContent: async () =>
        service.importAliasFile(
          'alias Existing "ImportedAlias"\nalias Fresh "FreshAlias"',
          profileId,
        ),
      imported: { aliases: 1 },
      preserved: () => fixture.storage.getProfile(profileId).aliases.Existing,
      expectedPreserved: { commands: ["ExistingAlias"] },
    },
  ])("defaults a direct $kind text import to merge_keep", async (scenario) => {
    const result = await scenario.importContent();

    expect(result).toMatchObject({
      success: true,
      imported: scenario.imported,
      skipped: 1,
      overwritten: 0,
      cleared: 0,
    });
    expect(scenario.preserved()).toEqual(scenario.expectedPreserved);
  });

  it.each([
    ["omitted top-level strategy", undefined, 1, 0],
    ["invalid top-level strategy", "future_strategy", 1, 0],
    ["valid top-level strategy", "merge_overwrite", 0, 1],
  ])(
    "uses the historical alias RPC strategy precedence for %s",
    async (_label, strategy, skipped, overwritten) => {
      const result = await request(fixture.eventBus, "import:alias-file", {
        content: 'alias Existing "ImportedAlias"\nalias Fresh "FreshAlias"',
        profileId,
        options: { strategy: "overwrite_all" },
        ...(strategy === undefined ? {} : { strategy }),
      });

      expect(result).toMatchObject({
        success: true,
        imported: { aliases: skipped === 1 ? 1 : 2 },
        skipped,
        overwritten,
        cleared: 0,
      });
      const aliases = fixture.storage.getProfile(profileId).aliases;
      expect(aliases.sto_kb_existing).toEqual({
        commands: ["GeneratedExisting"],
      });
      expect(aliases.Existing).toEqual(
        skipped === 1
          ? { commands: ["ExistingAlias"] }
          : { commands: ["ImportedAlias"], description: "" },
      );
    },
  );

  it("defaults a missing keybind environment to space", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await service.importKeybindFile('F2 "Imported"', profileId);

    expect(result).toMatchObject({ success: true, imported: { keys: 1 } });
    expect(fixture.storage.getProfile(profileId).builds.space.keys.F2).toEqual([
      "Imported",
    ]);
    expect(warn).toHaveBeenCalledWith(
      "[ImportService] No environment specified for keybind import, defaulting to space",
    );
  });

  it("rejects invalid environments and absent profile ids before profile access", async () => {
    fixture.storage.getProfile.mockClear();

    await expect(
      service.importKeybindFile('F2 "Imported"', profileId, "pvp"),
    ).resolves.toEqual({
      success: false,
      error: "invalid_environment",
      params: {
        environment: "pvp",
        validEnvironments: ["space", "ground"],
      },
    });
    await expect(
      service.importKeybindFile('F2 "Imported"', null, "space"),
    ).resolves.toEqual({ success: false, error: "no_active_profile" });
    expect(fixture.storage.getProfile).not.toHaveBeenCalled();
    expect(commitPayloads).toEqual([]);
  });

  it("preserves empty-result and missing-storage precondition ordering", async () => {
    service.destroy();
    service = new ImportService({
      eventBus: fixture.eventBus,
      i18n: { t: (key) => key },
    });
    service.init();

    await expect(
      service.importKeybindFile("; comment only", profileId, "space"),
    ).resolves.toEqual({
      success: false,
      error: "no_keybinds_found_in_file",
    });
    await expect(
      service.importKeybindFile('F1 "FireAll"', profileId, "space"),
    ).resolves.toEqual({
      success: false,
      error: "storage_not_available",
    });
    await expect(
      service.importAliasFile('alias sto_kb_generated "FireAll"', profileId),
    ).resolves.toEqual({
      success: false,
      error: "no_aliases_found_in_file",
    });
    await expect(
      service.importAliasFile('alias Fire "FireAll"', profileId),
    ).resolves.toEqual({ success: false, error: "no_active_profile" });
    expect(fixture.storage.saveProfile).not.toHaveBeenCalled();
  });

  it("keeps a partially planned parser failure detached and effect-free", async () => {
    detachParser();
    let plainCalls = 0;
    detachParser = respond(
      fixture.eventBus,
      "parser:parse-command-string",
      ({ commandString, options }) => {
        if (!options && ++plainCalls === 4) {
          throw new Error("mid-plan parser failure");
        }
        trace.push(`parse:${commandString}:${options ? "optimize" : "plain"}`);
        return {
          commands: [{ command: commandString }],
          isMirrored: false,
        };
      },
    );
    const before = fixture.storage.getProfile(profileId);
    trace.length = 0;

    const result = await service.importKeybindFile(
      'F1 "Imported"\nF2 "Second"',
      profileId,
      "space",
      { strategy: "merge_overwrite" },
    );

    expect(result).toEqual({
      success: false,
      error: "import_failed",
      params: { reason: "mid-plan parser failure" },
    });
    expect(fixture.storage.getProfile(profileId)).toEqual(before);
    expect(fixture.storage.saveProfile).not.toHaveBeenCalled();
    expect(trace).not.toContain("commit");
    expect(trace).not.toContain("legacy");
    expect(trace).not.toContain("modified");
  });
});
