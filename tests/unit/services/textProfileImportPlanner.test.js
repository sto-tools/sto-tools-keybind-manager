import { describe, expect, it, vi } from "vitest";

import {
  extractOriginalTextCommands,
  planKeybindTextImport,
} from "../../../src/js/components/services/textProfileImportPlanner.js";

const normalizeCommands = (commands) => {
  const values = Array.isArray(commands) ? commands : [commands];
  return values
    .map((command) =>
      typeof command === "string"
        ? command.trim()
        : (command?.command || command?.text || "").trim(),
    )
    .filter(Boolean);
};

function keybindProfile() {
  return {
    name: "Captain",
    currentEnvironment: "space",
    builds: {
      space: {
        keys: {
          F1: ["ExistingConflict"],
          F2: ["ExistingOnly"],
        },
        extension: { retained: true },
      },
      ground: { keys: { G: ["GroundOnly"] } },
    },
    aliases: { ExistingAlias: { commands: ["KeepAlias"] } },
    keybindMetadata: {
      space: {
        F1: { stabilizeExecutionOrder: true, source: "existing" },
        F2: { source: "existing-only" },
        Orphan: { source: "orphan" },
      },
      ground: { G: { source: "ground" } },
    },
    extension: { retained: [1, 2, 3] },
  };
}

function parsedKeybinds() {
  return {
    keybinds: {
      F1: {
        raw: "ImportedConflict",
        commands: [{ command: " ImportedConflict " }],
      },
      F3: { raw: "ImportedOnly", commands: [{ text: " ImportedOnly " }] },
    },
    aliases: {},
    errors: ["recoverable line diagnostic"],
  };
}

function commandCapabilities() {
  return {
    parseCommand: vi.fn(async (commandString) => ({
      commands: commandString
        .split(/\s*\$\$\s*/)
        .map((command) => ({ command })),
      isMirrored: false,
    })),
    normalizeCommands,
    optimizeCommand: vi.fn(async (command) => command),
  };
}

describe("keybind text profile import planning", () => {
  it.each([
    {
      strategy: "merge_keep",
      expected: {
        keys: {
          F1: ["ExistingConflict"],
          F2: ["ExistingOnly"],
          F3: ["ImportedOnly"],
        },
        imported: 1,
        skipped: 1,
        overwritten: 0,
        cleared: 0,
        parsedCommands: ["ImportedOnly"],
      },
    },
    {
      strategy: "merge_overwrite",
      expected: {
        keys: {
          F1: ["ImportedConflict"],
          F2: ["ExistingOnly"],
          F3: ["ImportedOnly"],
        },
        imported: 2,
        skipped: 0,
        overwritten: 1,
        cleared: 0,
        parsedCommands: ["ImportedConflict", "ImportedOnly"],
      },
    },
    {
      strategy: "overwrite_all",
      expected: {
        keys: { F1: ["ImportedConflict"], F3: ["ImportedOnly"] },
        imported: 2,
        skipped: 0,
        overwritten: 0,
        cleared: 2,
        parsedCommands: ["ImportedConflict", "ImportedOnly"],
      },
    },
    {
      strategy: "future_strategy",
      expected: {
        keys: {
          F1: ["ImportedConflict"],
          F2: ["ExistingOnly"],
          F3: ["ImportedOnly"],
        },
        imported: 2,
        skipped: 0,
        overwritten: 0,
        cleared: 0,
        parsedCommands: ["ImportedConflict", "ImportedOnly"],
      },
    },
  ])(
    "preserves $strategy merge behavior and accounting",
    async ({ strategy, expected }) => {
      const profile = keybindProfile();
      const parsed = parsedKeybinds();
      const capabilities = commandCapabilities();

      const result = await planKeybindTextImport({
        profile,
        parsed,
        environment: "space",
        strategy,
        capabilities,
      });

      expect(result).toMatchObject({
        success: true,
        imported: { keys: expected.imported },
        skipped: expected.skipped,
        overwritten: expected.overwritten,
        cleared: expected.cleared,
        errors: ["recoverable line diagnostic"],
        message: "import_completed_keybinds",
      });
      expect(result.errors).toBe(parsed.errors);
      expect(result.nextProfile.builds.space.keys).toEqual(expected.keys);
      expect(
        capabilities.parseCommand.mock.calls.map(([command]) => command),
      ).toEqual(expected.parsedCommands);
      expect(
        capabilities.optimizeCommand.mock.calls.map(([command]) => command),
      ).toEqual(expected.parsedCommands);
      expect(result.nextProfile.builds.ground.keys).toEqual({
        G: ["GroundOnly"],
      });
      expect(result.nextProfile.extension).toEqual({ retained: [1, 2, 3] });
      expect(profile).toEqual(keybindProfile());

      if (strategy === "overwrite_all") {
        expect(result.nextProfile.keybindMetadata.space).toEqual({
          Orphan: { source: "orphan" },
        });
      } else {
        expect(result.nextProfile.keybindMetadata).toEqual(
          keybindProfile().keybindMetadata,
        );
      }
    },
  );

  it("reconstructs mirrored commands in order and preserves sibling metadata", async () => {
    const profile = keybindProfile();
    const parsed = {
      keybinds: {
        F1: {
          raw: "First $$ Pivot $$ First",
          commands: ["ignored mirrored materialization"],
        },
      },
      aliases: {},
      errors: [],
    };
    const parseCommand = vi
      .fn()
      .mockResolvedValueOnce({ isMirrored: true, commands: [] })
      .mockResolvedValueOnce({
        isMirrored: false,
        commands: [{ command: " First " }, { text: " Pivot " }, { text: "" }],
      });
    const optimizeCommand = vi.fn(async (command) => `optimized:${command}`);

    const result = await planKeybindTextImport({
      profile,
      parsed,
      environment: "space",
      strategy: "merge_overwrite",
      capabilities: { parseCommand, normalizeCommands, optimizeCommand },
    });

    expect(parseCommand.mock.calls.map(([command]) => command)).toEqual([
      "First $$ Pivot $$ First",
      "First $$ Pivot",
    ]);
    expect(optimizeCommand.mock.calls.map(([command]) => command)).toEqual([
      "First",
      "Pivot",
    ]);
    expect(result.nextProfile.builds.space.keys.F1).toEqual([
      "optimized:First",
      "optimized:Pivot",
    ]);
    expect(result.nextProfile.keybindMetadata.space.F1).toEqual({
      stabilizeExecutionOrder: true,
      source: "existing",
    });
    expect(profile).toEqual(keybindProfile());
  });

  it("creates own metadata for an inherited mirrored key without mutating the prototype", async () => {
    const inheritedMetadata = Object.prototype.toString;
    expect(inheritedMetadata).not.toHaveProperty("stabilizeExecutionOrder");
    const profile = {
      builds: { space: { keys: {} }, ground: { keys: {} } },
      keybindMetadata: { space: {} },
    };
    const parseCommand = vi
      .fn()
      .mockResolvedValueOnce({ isMirrored: true, commands: [] })
      .mockResolvedValueOnce({
        isMirrored: false,
        commands: [{ command: "First" }, { command: "Pivot" }],
      });

    const result = await planKeybindTextImport({
      profile,
      parsed: {
        keybinds: Object.fromEntries([
          [
            "toString",
            {
              raw: "First $$ Pivot $$ First",
              commands: ["ignored mirrored materialization"],
            },
          ],
        ]),
        aliases: {},
        errors: [],
      },
      environment: "space",
      strategy: "merge_overwrite",
      capabilities: {
        parseCommand,
        normalizeCommands,
        optimizeCommand: async (command) => command,
      },
    });

    expect(
      Object.hasOwn(result.nextProfile.keybindMetadata.space, "toString"),
    ).toBe(true);
    expect(result.nextProfile.keybindMetadata.space.toString).toEqual({
      stabilizeExecutionOrder: true,
    });
    expect(inheritedMetadata).not.toHaveProperty("stabilizeExecutionOrder");
    expect(profile.keybindMetadata.space).toEqual({});
  });

  it("keeps historical mirrored extraction for short, even, and odd chains", () => {
    expect(extractOriginalTextCommands("One")).toEqual(["One"]);
    expect(extractOriginalTextCommands("One $$ Two")).toEqual(["One", "Two"]);
    expect(extractOriginalTextCommands("One $$ Pivot $$ One")).toEqual([
      "One",
      "Pivot",
    ]);
    expect(extractOriginalTextCommands("One $$ Two $$ Two $$ One")).toEqual([
      "One",
      "Two",
      "Two",
      "One",
    ]);
  });

  it("constructs the historical missing-profile draft and detaches every input", async () => {
    const parsed = {
      keybinds: {
        toString: { raw: "SafeCommand", commands: ["SafeCommand"] },
      },
      aliases: {},
      errors: [],
    };
    const capabilities = commandCapabilities();

    const result = await planKeybindTextImport({
      profile: null,
      parsed,
      environment: "ground",
      strategy: "merge_keep",
      capabilities,
    });

    expect(result.nextProfile).toEqual({
      builds: {
        space: { keys: {} },
        ground: { keys: { toString: ["SafeCommand"] } },
      },
    });
    expect(
      Object.hasOwn(result.nextProfile.builds.ground.keys, "toString"),
    ).toBe(true);
    result.nextProfile.builds.ground.keys.toString.push("result only");
    expect(parsed.keybinds.toString.commands).toEqual(["SafeCommand"]);
  });

  it("scaffolds only the historically missing build containers", async () => {
    const capabilities = commandCapabilities();
    const parsed = {
      keybinds: { F3: { raw: "Imported", commands: ["Imported"] } },
      aliases: {},
      errors: [],
    };

    const missingBuilds = await planKeybindTextImport({
      profile: { name: "Missing builds", extension: { retained: true } },
      parsed,
      environment: "space",
      strategy: "merge_keep",
      capabilities,
    });
    expect(missingBuilds.nextProfile).toEqual({
      name: "Missing builds",
      extension: { retained: true },
      builds: {
        space: { keys: { F3: ["Imported"] } },
        ground: { keys: {} },
      },
    });

    const missingEnvironment = await planKeybindTextImport({
      profile: {
        name: "Missing ground",
        builds: { space: { keys: { F1: ["SpaceOnly"] } } },
      },
      parsed,
      environment: "ground",
      strategy: "merge_keep",
      capabilities,
    });
    expect(missingEnvironment.nextProfile.builds).toEqual({
      space: { keys: { F1: ["SpaceOnly"] } },
      ground: { keys: { F3: ["Imported"] } },
    });
  });

  it("does not silently repair an existing target environment without keys", async () => {
    const source = { name: "Incomplete", builds: { space: {} } };
    await expect(
      planKeybindTextImport({
        profile: source,
        parsed: {
          keybinds: { F1: { raw: "Imported", commands: ["Imported"] } },
          aliases: {},
          errors: [],
        },
        environment: "space",
        strategy: "merge_keep",
        capabilities: commandCapabilities(),
      }),
    ).rejects.toThrow(TypeError);
    expect(source).toEqual({ name: "Incomplete", builds: { space: {} } });
  });
});
