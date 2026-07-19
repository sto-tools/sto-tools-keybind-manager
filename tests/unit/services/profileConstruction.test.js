import { describe, expect, it } from "vitest";

import {
  createClonedProfileDraft,
  createDefaultProfileDraft,
  createEmptyProfileDraft,
  createFallbackProfileDraft,
  generateProfileId,
  planProfileBatch,
} from "../../../src/js/components/services/profileConstruction.js";

describe("profile construction", () => {
  it.each([
    ["Captain Picard", "captain_picard"],
    ["  Multiple\tNames\nHere  ", "_multiple_names_here_"],
    ["Admiral! Kathryn_Janeway", "admiral_kathrynjaneway"],
    ["Crème Brûlée", "crme_brle"],
    ["constructor", "constructor"],
    ["!!!", ""],
    ["A".repeat(51), "a".repeat(50)],
  ])("derives the established profile ID for %j", (name, expected) => {
    expect(generateProfileId(name)).toBe(expected);
  });

  it("constructs the exact empty profile scaffolding from supplied timestamps", () => {
    const profile = createEmptyProfileDraft(
      "  New Captain  ",
      "  Tactical profile  ",
      "ground",
      {
        created: "2026-07-19T00:00:00.001Z",
        lastModified: "2026-07-19T00:00:00.002Z",
      },
    );

    expect(profile).toEqual({
      name: "New Captain",
      description: "Tactical profile",
      currentEnvironment: "ground",
      builds: {
        space: { keys: {} },
        ground: { keys: {} },
      },
      keybindMetadata: { space: {}, ground: {} },
      aliasMetadata: {},
      bindsetMetadata: {},
      bindsets: {},
      aliases: {},
      created: "2026-07-19T00:00:00.001Z",
      lastModified: "2026-07-19T00:00:00.002Z",
    });
  });

  it("deep-clones the complete JSON profile without retaining source references", () => {
    const source = {
      id: "captain",
      name: "Captain",
      description: "Original description",
      currentEnvironment: "space",
      builds: {
        space: { keys: { F1: ["FireAll"] } },
        ground: { keys: {} },
      },
      aliases: {
        engage: {
          commands: ["FireAll"],
          metadata: { origin: "user" },
        },
      },
      bindsets: {
        Tactical: {
          space: { keys: { F2: ["FirePhasers"] } },
          ground: { keys: {} },
        },
      },
      keybindMetadata: { space: { F1: { stabilizeExecutionOrder: true } } },
      aliasMetadata: { engage: { stabilizeExecutionOrder: true } },
      bindsetMetadata: {
        Tactical: {
          space: { F2: { stabilizeExecutionOrder: true } },
        },
      },
      selections: { space: "F1", alias: "engage" },
      extension: { nested: ["preserved"] },
      created: "2025-01-01T00:00:00.000Z",
      lastModified: "2025-02-01T00:00:00.000Z",
    };
    const sourceBefore = structuredClone(source);

    const cloned = createClonedProfileDraft(source, "  Captain Copy  ", {
      created: "2026-07-19T00:00:00.003Z",
      lastModified: "2026-07-19T00:00:00.004Z",
    });

    expect(cloned).toEqual({
      ...sourceBefore,
      name: "Captain Copy",
      description: "Copy of Captain",
      created: "2026-07-19T00:00:00.003Z",
      lastModified: "2026-07-19T00:00:00.004Z",
    });
    expect(source).toEqual(sourceBefore);

    cloned.builds.space.keys.F1.push("local command");
    cloned.aliases.engage.metadata.origin = "local";
    cloned.extension.nested.push("local extension");

    expect(source).toEqual(sourceBefore);
  });

  it("retains the established JSON clone representation semantics", () => {
    const source = {
      name: "Compatibility",
      builds: {
        space: {
          keys: {
            F1: [undefined, Number.POSITIVE_INFINITY],
          },
        },
      },
      aliases: {},
      omittedExtension: undefined,
    };

    const cloned = createClonedProfileDraft(source, "Compatibility Copy", {
      created: "created",
      lastModified: "modified",
    });

    expect(cloned).not.toHaveProperty("omittedExtension");
    expect(cloned.builds.space.keys.F1).toEqual([null, null]);
    expect(source.builds.space.keys.F1).toEqual([
      undefined,
      Number.POSITIVE_INFINITY,
    ]);
  });

  it("projects and detaches only the established static default fields", () => {
    const source = {
      id: "source-id-is-not-persisted",
      name: "Validated Default",
      description: "Source description",
      currentEnvironment: "ground",
      builds: {
        space: { keys: {} },
        ground: { keys: { G: ["Aim"] } },
      },
      bindsets: {
        Tactical: { ground: { keys: { F1: ["FireAll"] } } },
      },
      aliases: { engage: { commands: ["FireAll"] } },
      selections: { ground: "G", alias: "engage" },
      keybindMetadata: {
        ground: { G: { stabilizeExecutionOrder: true } },
      },
      aliasMetadata: { engage: { stabilizeExecutionOrder: true } },
      bindsetMetadata: {
        Tactical: {
          ground: { F1: { stabilizeExecutionOrder: true } },
        },
      },
      created: "source-created",
      lastModified: "source-modified",
      migrationVersion: "2.1.1",
      vertigoSettings: { showPlayerSay: true },
      extension: { nested: ["not persisted"] },
    };
    const sourceBefore = structuredClone(source);

    const draft = createDefaultProfileDraft(source);

    expect(draft).toEqual({
      name: "Validated Default",
      description: "Source description",
      currentEnvironment: "ground",
      builds: sourceBefore.builds,
      bindsets: sourceBefore.bindsets,
      aliases: sourceBefore.aliases,
      selections: sourceBefore.selections,
      keybindMetadata: sourceBefore.keybindMetadata,
      aliasMetadata: sourceBefore.aliasMetadata,
      bindsetMetadata: sourceBefore.bindsetMetadata,
    });
    expect(Object.keys(draft)).toEqual([
      "name",
      "description",
      "currentEnvironment",
      "builds",
      "bindsets",
      "aliases",
      "selections",
      "keybindMetadata",
      "aliasMetadata",
      "bindsetMetadata",
    ]);
    expect(draft).not.toHaveProperty("id");
    expect(draft).not.toHaveProperty("created");
    expect(draft).not.toHaveProperty("lastModified");
    expect(draft).not.toHaveProperty("migrationVersion");
    expect(draft).not.toHaveProperty("vertigoSettings");
    expect(draft).not.toHaveProperty("extension");

    draft.builds.ground.keys.G.push("local command");
    draft.aliases.engage.commands.push("local alias command");
    draft.bindsets.Tactical.ground.keys.F1.push("local bindset command");
    expect(source).toEqual(sourceBefore);
  });

  it("preserves the historical static-default fallback semantics", () => {
    expect(
      createDefaultProfileDraft({
        name: "Name only",
        description: "",
        currentEnvironment: "",
      }),
    ).toEqual({
      name: "Name only",
      description: "",
      currentEnvironment: "space",
      builds: {
        space: { keys: {} },
        ground: { keys: {} },
      },
      bindsets: {},
      aliases: {},
      selections: {},
      keybindMetadata: {},
      aliasMetadata: {},
      bindsetMetadata: {},
    });
  });

  it("passes through a truthy incomplete builds object without synthesizing environments", () => {
    const builds = { ground: { keys: { G: ["Aim"] } } };

    const draft = createDefaultProfileDraft({
      name: "Ground only",
      builds,
    });

    expect(draft.builds).toEqual(builds);
    expect(draft.builds).not.toBe(builds);
    expect(draft.builds).not.toHaveProperty("space");
    draft.builds.ground.keys.G.push("local command");
    expect(builds.ground.keys.G).toEqual(["Aim"]);
  });

  it("constructs the exact timestamp-free fallback representation", () => {
    const draft = createFallbackProfileDraft();

    expect(draft).toEqual({
      name: "Default",
      description: "Basic space build profile",
      currentEnvironment: "space",
      builds: {
        space: { keys: {} },
        ground: { keys: {} },
      },
      bindsets: {},
      aliases: {},
    });
    expect(Object.keys(draft)).toEqual([
      "name",
      "description",
      "currentEnvironment",
      "builds",
      "bindsets",
      "aliases",
    ]);
  });

  it("plans first-incoming activation without mutating either input", () => {
    const state = {
      currentProfile: null,
      currentEnvironment: "space",
      profiles: { existing: { name: "Existing" } },
    };
    const incomingProfiles = {
      first: { name: "First", currentEnvironment: "ground" },
      second: { name: "Second", currentEnvironment: "space" },
    };

    const plan = planProfileBatch(state, incomingProfiles);

    expect(plan).toEqual({
      nextProfiles: {
        existing: state.profiles.existing,
        first: incomingProfiles.first,
        second: incomingProfiles.second,
      },
      nextCurrentProfile: "first",
      nextCurrentEnvironment: "ground",
      profileActivated: true,
    });
    expect(plan.nextProfiles.existing).toBe(state.profiles.existing);
    expect(plan.nextProfiles.first).toBe(incomingProfiles.first);
    expect(state.currentProfile).toBeNull();
    expect(Object.keys(state.profiles)).toEqual(["existing"]);
    expect(Object.keys(incomingProfiles)).toEqual(["first", "second"]);
  });

  it("retains an existing owner selection while incoming collisions replace profiles", () => {
    const selectedProfile = {
      name: "Existing Selection",
      currentEnvironment: "space",
    };
    const state = {
      currentProfile: "selected",
      currentEnvironment: "alias",
      profiles: {
        selected: selectedProfile,
        retained: { name: "Retained" },
      },
    };
    const replacement = {
      name: "Replacement",
      currentEnvironment: "ground",
    };

    const plan = planProfileBatch(state, { selected: replacement });

    expect(plan).toEqual({
      nextProfiles: {
        selected: replacement,
        retained: state.profiles.retained,
      },
      nextCurrentProfile: "selected",
      nextCurrentEnvironment: "alias",
      profileActivated: false,
    });
    expect(state.profiles.selected).toBe(selectedProfile);
  });

  it("leaves owner selection and environment unchanged for an empty incoming batch", () => {
    const existing = { name: "Existing" };
    const state = {
      currentProfile: null,
      currentEnvironment: "alias",
      profiles: { existing },
    };

    const plan = planProfileBatch(state, {});

    expect(plan).toEqual({
      nextProfiles: { existing },
      nextCurrentProfile: null,
      nextCurrentEnvironment: "alias",
      profileActivated: false,
    });
    expect(plan.nextProfiles).not.toBe(state.profiles);
    expect(plan.nextProfiles.existing).toBe(existing);
  });
});
