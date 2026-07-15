import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import DataCoordinator from "../../../src/js/components/services/DataCoordinator.js";
import { createServiceFixture } from "../../fixtures/index.js";

const PROFILE_ID = "characterization-profile";
const FIXED_TIME = "2026-07-15T12:34:56.000Z";

function createProfile() {
  return {
    id: PROFILE_ID,
    name: "Before Operations",
    description: "Original description",
    currentEnvironment: "space",
    builds: {
      space: {
        keys: {
          DeleteThenReAdd: ["old-delete-value"],
          ModifyExistingKey: ["old-modify-value"],
          SpaceUntouched: ["keep-space"],
        },
        aliases: { SpaceBuildAlias: ["keep-space-alias"] },
      },
      ground: {
        keys: { GroundUntouched: ["keep-ground"] },
        aliases: { GroundBuildAlias: ["keep-ground-alias"] },
      },
    },
    aliases: {
      DeleteThenReAdd: {
        commands: ["old-delete-alias"],
        description: "old delete description",
      },
      ModifyExistingAlias: {
        commands: ["old-modify-alias"],
        description: "preserve this description",
      },
      UntouchedAlias: {
        commands: ["keep-alias"],
        description: "keep alias description",
      },
    },
    bindsets: {
      "Recycled Bindset": {
        space: {
          keys: {
            OldOnly: ["remove-with-bindset"],
            RemoveViaNull: ["old-null-target"],
          },
        },
        ground: { keys: { OldGround: ["remove-old-ground"] } },
      },
      "Existing Named Bindset": {
        space: {
          keys: {
            ExistingKey: ["old-existing-key"],
            RemoveMe: ["remove-me"],
            UntouchedKey: ["keep-named-key"],
          },
        },
        ground: { keys: { GroundNamed: ["keep-named-ground"] } },
      },
      "Untouched Bindset": {
        space: { keys: { UntouchedBindsetKey: ["keep-bindset"] } },
        ground: { keys: {} },
      },
    },
    keybindMetadata: {
      space: {
        ReplaceMeta: {
          stabilizeExecutionOrder: false,
          note: "old key metadata",
        },
        ClearMeta: { stabilizeExecutionOrder: true },
        UntouchedMeta: { note: "keep key metadata" },
      },
      ground: { GroundMeta: { note: "keep ground key metadata" } },
    },
    aliasMetadata: {
      ModifyExistingAlias: {
        stabilizeExecutionOrder: false,
        note: "old alias metadata",
      },
      ClearAliasMeta: { stabilizeExecutionOrder: true },
      UntouchedAlias: { note: "keep alias metadata" },
    },
    bindsetMetadata: {
      "Recycled Bindset": {
        space: { OldOnly: { note: "remove old bindset metadata" } },
        ground: { OldGround: { note: "remove old ground metadata" } },
      },
      "Existing Named Bindset": {
        space: {
          ExistingKey: {
            stabilizeExecutionOrder: false,
            note: "preserve during metadata merge",
          },
          ClearMeta: { stabilizeExecutionOrder: true },
          UntouchedMeta: { note: "keep named metadata" },
        },
        ground: { GroundNamed: { note: "keep named ground metadata" } },
      },
      "Untouched Bindset": {
        space: { UntouchedBindsetKey: { note: "keep bindset metadata" } },
      },
    },
    selections: {
      space: "SpaceUntouched",
      ground: "GroundUntouched",
      alias: "UntouchedAlias",
    },
    customRootSibling: { nested: "keep root sibling" },
    created: "2025-01-02T03:04:05.000Z",
    lastModified: "2025-06-07T08:09:10.000Z",
  };
}

function createOperations() {
  return {
    delete: {
      aliases: ["DeleteThenReAdd"],
      builds: { space: { keys: ["DeleteThenReAdd"] } },
      bindsets: ["Recycled Bindset"],
      bindsetMetadata: ["Recycled Bindset"],
    },
    add: {
      aliases: {
        DeleteThenReAdd: {
          commands: ["alias-from-add"],
          description: "description from add",
        },
        AddedAlias: {
          commands: ["new-alias"],
          description: "new alias description",
        },
      },
      builds: {
        space: {
          keys: {
            DeleteThenReAdd: ["key-from-add"],
            AddedKey: ["new-key"],
          },
        },
      },
      bindsets: {
        "Recycled Bindset": {
          space: {
            keys: {
              ReAddedKey: ["bindset-key-from-add"],
              RemoveViaNull: ["remove-after-add"],
            },
          },
          ground: { keys: { NewGround: ["new-bindset-ground"] } },
        },
      },
      bindsetMetadata: {
        "Recycled Bindset": {
          space: {
            ReAddedKey: {
              stabilizeExecutionOrder: false,
              note: "preserve from add",
            },
            ClearAfterAdd: { stabilizeExecutionOrder: true },
          },
          ground: { NewGround: { note: "new ground metadata" } },
        },
      },
    },
    modify: {
      aliases: {
        DeleteThenReAdd: { description: "modified after re-add" },
        ModifyExistingAlias: { commands: ["modified-existing-alias"] },
      },
      builds: {
        space: {
          keys: {
            DeleteThenReAdd: ["modified-after-re-add"],
            ModifyExistingKey: ["modified-existing-key"],
          },
        },
      },
      keybindMetadata: {
        space: {
          ReplaceMeta: { stabilizeExecutionOrder: true },
          ClearMeta: {},
          AddedMeta: { note: "new key metadata" },
        },
      },
      aliasMetadata: {
        ModifyExistingAlias: { stabilizeExecutionOrder: true },
        ClearAliasMeta: {},
        AddedAlias: { note: "new alias metadata" },
      },
      bindsets: {
        "Recycled Bindset": {
          space: {
            keys: {
              ReAddedKey: ["modified-after-bindset-add"],
              RemoveViaNull: null,
              AddedByModify: ["added-by-modify"],
            },
          },
        },
        "Existing Named Bindset": {
          space: {
            keys: {
              ExistingKey: ["modified-existing-bindset-key"],
              RemoveMe: null,
              AddedByModify: ["new-existing-bindset-key"],
            },
          },
        },
      },
      bindsetMetadata: {
        "Recycled Bindset": {
          space: {
            ReAddedKey: { stabilizeExecutionOrder: true },
            ClearAfterAdd: {},
          },
        },
        "Existing Named Bindset": {
          space: {
            ExistingKey: { stabilizeExecutionOrder: true },
            ClearMeta: {},
            AddedByModify: { note: "new named bindset metadata" },
          },
        },
      },
    },
    properties: {
      name: "After Operations",
      description: "Updated through properties",
      currentEnvironment: "ground",
      selections: {
        space: "AddedKey",
        ground: "GroundUntouched",
        alias: "AddedAlias",
      },
    },
  };
}

function expectCharacterizedProfile(profile) {
  expect(profile).toMatchObject({
    id: PROFILE_ID,
    name: "After Operations",
    description: "Updated through properties",
    currentEnvironment: "ground",
    selections: {
      space: "AddedKey",
      ground: "GroundUntouched",
      alias: "AddedAlias",
    },
    customRootSibling: { nested: "keep root sibling" },
    created: "2025-01-02T03:04:05.000Z",
    lastModified: FIXED_TIME,
  });

  expect(profile.builds.space).toEqual({
    keys: {
      DeleteThenReAdd: ["modified-after-re-add"],
      ModifyExistingKey: ["modified-existing-key"],
      SpaceUntouched: ["keep-space"],
      AddedKey: ["new-key"],
    },
    aliases: { SpaceBuildAlias: ["keep-space-alias"] },
  });
  expect(profile.builds.ground).toEqual({
    keys: { GroundUntouched: ["keep-ground"] },
    aliases: { GroundBuildAlias: ["keep-ground-alias"] },
  });

  expect(profile.aliases).toEqual({
    DeleteThenReAdd: {
      commands: ["alias-from-add"],
      description: "modified after re-add",
    },
    ModifyExistingAlias: {
      commands: ["modified-existing-alias"],
      description: "preserve this description",
    },
    UntouchedAlias: {
      commands: ["keep-alias"],
      description: "keep alias description",
    },
    AddedAlias: {
      commands: ["new-alias"],
      description: "new alias description",
    },
  });

  expect(profile.bindsets["Recycled Bindset"]).toEqual({
    space: {
      keys: {
        ReAddedKey: ["modified-after-bindset-add"],
        AddedByModify: ["added-by-modify"],
      },
    },
    ground: { keys: { NewGround: ["new-bindset-ground"] } },
  });
  expect(profile.bindsets["Existing Named Bindset"]).toEqual({
    space: {
      keys: {
        ExistingKey: ["modified-existing-bindset-key"],
        UntouchedKey: ["keep-named-key"],
        AddedByModify: ["new-existing-bindset-key"],
      },
    },
    ground: { keys: { GroundNamed: ["keep-named-ground"] } },
  });
  expect(profile.bindsets["Untouched Bindset"]).toEqual({
    space: { keys: { UntouchedBindsetKey: ["keep-bindset"] } },
    ground: { keys: {} },
  });

  expect(profile.keybindMetadata).toEqual({
    space: {
      ReplaceMeta: { stabilizeExecutionOrder: true },
      UntouchedMeta: { note: "keep key metadata" },
      AddedMeta: { note: "new key metadata" },
    },
    ground: { GroundMeta: { note: "keep ground key metadata" } },
  });
  expect(profile.aliasMetadata).toEqual({
    ModifyExistingAlias: { stabilizeExecutionOrder: true },
    UntouchedAlias: { note: "keep alias metadata" },
    AddedAlias: { note: "new alias metadata" },
  });
  expect(profile.bindsetMetadata["Recycled Bindset"]).toEqual({
    space: {
      ReAddedKey: {
        stabilizeExecutionOrder: true,
        note: "preserve from add",
      },
    },
    ground: { NewGround: { note: "new ground metadata" } },
  });
  expect(profile.bindsetMetadata["Existing Named Bindset"]).toEqual({
    space: {
      ExistingKey: {
        stabilizeExecutionOrder: true,
        note: "preserve during metadata merge",
      },
      UntouchedMeta: { note: "keep named metadata" },
      AddedByModify: { note: "new named bindset metadata" },
    },
    ground: { GroundNamed: { note: "keep named ground metadata" } },
  });
  expect(profile.bindsetMetadata["Untouched Bindset"]).toEqual({
    space: { UntouchedBindsetKey: { note: "keep bindset metadata" } },
  });
}

describe("DataCoordinator explicit profile operations", () => {
  let fixture;
  let coordinator;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(FIXED_TIME));
    fixture = createServiceFixture();
    coordinator = new DataCoordinator({
      eventBus: fixture.eventBus,
      storage: fixture.storage,
      i18n: { t: (key) => key },
    });
  });

  afterEach(() => {
    coordinator.destroy();
    fixture.destroy();
    vi.useRealTimers();
  });

  it("applies delete before add and modify across profile collections without mutating the source", () => {
    const source = createProfile();
    const sourceSnapshot = JSON.parse(JSON.stringify(source));
    const operations = createOperations();

    const result = coordinator.processUpdateOperations(source, {
      ...operations,
      properties: {
        ...operations.properties,
        lastModified: FIXED_TIME,
      },
    });

    expectCharacterizedProfile(result);
    expect(source).toEqual(sourceSnapshot);
  });

  it("persists, returns, caches, and broadcasts the same explicit-operation result", async () => {
    const operations = createOperations();
    const updateSource = "explicit-operation-characterization";
    coordinator.state.currentProfile = PROFILE_ID;
    coordinator.state.profiles[PROFILE_ID] = createProfile();
    const emitSpy = vi.spyOn(coordinator, "emit");

    const result = await coordinator.updateProfile(PROFILE_ID, {
      ...operations,
      updateSource,
    });

    expect(result.success).toBe(true);
    expectCharacterizedProfile(result.profile);
    expect(coordinator.state.profiles[PROFILE_ID]).toBe(result.profile);
    expect(fixture.storage.saveProfile).toHaveBeenCalledTimes(1);
    expect(fixture.storage.saveProfile).toHaveBeenCalledWith(
      PROFILE_ID,
      result.profile,
    );
    expect(fixture.storage.getProfile(PROFILE_ID)).toEqual(result.profile);

    expect(emitSpy).toHaveBeenCalledTimes(1);
    expect(emitSpy).toHaveBeenCalledWith("profile:updated", {
      profileId: PROFILE_ID,
      profile: result.profile,
      updates: operations,
      updateSource,
      timestamp: Date.parse(FIXED_TIME),
    });
  });
});
