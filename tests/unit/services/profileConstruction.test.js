import { describe, expect, it } from "vitest";

import {
  createClonedProfileDraft,
  createEmptyProfileDraft,
  generateProfileId,
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
});
