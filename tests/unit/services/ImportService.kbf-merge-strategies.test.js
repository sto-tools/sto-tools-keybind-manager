import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ImportService from "../../../src/js/components/services/ImportService.js";
import { createPreferencesState } from "../../fixtures/core/componentState.js";
import {
  createServiceFixture,
  respondWithImportedProfileCommits,
} from "../../fixtures/index.js";

const profileId = "captain";
const sourceProfile = {
  name: "Captain",
  currentEnvironment: "space",
  builds: {
    space: {
      keys: {
        F1: ["ExistingConflict"],
        F2: ["ExistingOnly"],
      },
      aliases: {},
    },
    ground: { keys: {}, aliases: {} },
  },
  aliases: {},
  bindsets: {},
  keybindMetadata: {
    space: {
      F1: { stabilizeExecutionOrder: true },
      F2: { stabilizeExecutionOrder: true },
    },
  },
  aliasMetadata: {},
  bindsetMetadata: {},
};

function createParseResult() {
  return {
    bindsets: {
      Master: {
        keys: {
          F1: ["ImportedConflict"],
          F3: ["ImportedOnly"],
        },
        metadata: {},
      },
    },
    aliases: {},
    stats: {
      totalBindsets: 1,
      totalKeys: 2,
      totalAliases: 0,
      totalActivities: 2,
      processedLayers: [1, 2, 3, 4, 5, 6],
      skippedActivities: 0,
    },
    errors: [],
    warnings: [],
  };
}

describe("ImportService KBF merge strategies", () => {
  let fixture;
  let service;

  beforeEach(() => {
    fixture = createServiceFixture();
    fixture.storage.getProfile.mockReturnValue(structuredClone(sourceProfile));

    service = new ImportService({
      eventBus: fixture.eventBus,
      storage: fixture.storage,
    });
    service.init();
    respondWithImportedProfileCommits(fixture.eventBus, fixture.storage);
    fixture.eventBus.emit(
      "preferences:loaded",
      createPreferencesState({ bindsetsEnabled: true }),
    );

    vi.spyOn(service.kbfParser.decoder, "validateFormat").mockReturnValue({
      isValid: true,
      isKBF: true,
      warnings: [],
    });
    vi.spyOn(service.kbfParser, "parseFile").mockResolvedValue(
      createParseResult(),
    );
  });

  afterEach(() => {
    service?.destroy();
    fixture?.destroy();
    vi.restoreAllMocks();
  });

  it.each([
    {
      strategy: "merge_keep",
      expectedKeys: {
        F1: ["ExistingConflict"],
        F2: ["ExistingOnly"],
        F3: ["ImportedOnly"],
      },
      expectedMetadata: sourceProfile.keybindMetadata,
      expectedResult: { imported: 1, skipped: 1, overwritten: 0, cleared: 0 },
    },
    {
      strategy: "merge_overwrite",
      expectedKeys: {
        F1: ["ImportedConflict"],
        F2: ["ExistingOnly"],
        F3: ["ImportedOnly"],
      },
      expectedMetadata: sourceProfile.keybindMetadata,
      expectedResult: { imported: 2, skipped: 0, overwritten: 1, cleared: 0 },
    },
    {
      strategy: "overwrite_all",
      expectedKeys: {
        F1: ["ImportedConflict"],
        F3: ["ImportedOnly"],
      },
      expectedMetadata: { space: {} },
      expectedResult: { imported: 2, skipped: 0, overwritten: 0, cleared: 2 },
    },
  ])(
    "applies $strategy conflict and clearing semantics before persistence",
    async ({ strategy, expectedKeys, expectedMetadata, expectedResult }) => {
      const result = await service.importKBFFile(
        "valid KBF data",
        profileId,
        "space",
        { strategy },
      );

      expect(result).toMatchObject({
        success: true,
        imported: { bindsets: 1, keys: expectedResult.imported, aliases: 0 },
        skipped: expectedResult.skipped,
        overwritten: expectedResult.overwritten,
        cleared: expectedResult.cleared,
      });
      expect(fixture.storage.saveProfile).toHaveBeenCalledOnce();
      const savedProfile = fixture.storage.saveProfile.mock.calls[0][1];
      expect(savedProfile.builds.space.keys).toEqual(expectedKeys);
      expect(savedProfile.keybindMetadata).toEqual(expectedMetadata);
      expect(sourceProfile.builds.space.keys).toEqual({
        F1: ["ExistingConflict"],
        F2: ["ExistingOnly"],
      });
    },
  );

  it("uses the cached bindsets preference without issuing a settings query", async () => {
    fixture.eventBus.emit(
      "preferences:loaded",
      createPreferencesState({ bindsetsEnabled: false }),
    );
    service.kbfParser.parseFile.mockResolvedValue({
      ...createParseResult(),
      bindsets: {
        ...createParseResult().bindsets,
        Secondary: {
          keys: { F4: ["ImportedSecondary"] },
          metadata: {},
        },
      },
      stats: {
        ...createParseResult().stats,
        totalBindsets: 2,
        totalKeys: 3,
      },
    });

    const result = await service.importKBFFile(
      "valid KBF data",
      profileId,
      "space",
      { strategy: "merge_keep" },
      {
        selectedBindsets: ["Master", "Secondary"],
        bindsetMappings: { Master: "primary", Secondary: "primary" },
        bindsetRenames: {},
      },
    );

    expect(result).toMatchObject({
      success: false,
      error: "multiple_bindsets_not_allowed",
    });
    expect(fixture.storage.saveProfile).not.toHaveBeenCalled();
    expect(
      fixture
        .getEventHistory()
        .filter(({ event }) => event === "rpc:preferences:get-settings"),
    ).toHaveLength(0);
  });
});
