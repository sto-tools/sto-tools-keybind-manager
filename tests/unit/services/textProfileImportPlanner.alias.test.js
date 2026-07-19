import { describe, expect, it, vi } from "vitest";

import { planAliasTextImport } from "../../../src/js/components/services/textProfileImportPlanner.js";

function aliasProfile() {
  return {
    name: "Captain",
    builds: { space: { keys: {} }, ground: { keys: {} } },
    aliases: {
      Existing: { commands: ["ExistingCommand"], description: "existing" },
      Other: { commands: ["OtherCommand"] },
      sto_kb_existing: { commands: ["GeneratedExisting"] },
    },
    aliasMetadata: {
      Existing: { source: "existing" },
      Other: { source: "other" },
      sto_kb_existing: { source: "generated" },
      Orphan: { source: "orphan" },
    },
    extension: { retained: true },
  };
}

function parsedAliases() {
  return {
    aliases: {
      Existing: { commands: " ImportedConflict ", description: "imported" },
      Fresh: { commands: " First $$  $$ Second ", description: "" },
      sto_kb_generated: { commands: "IgnoredGenerated" },
      STO_KB_uppercase: { commands: "UppercasePrefixImports" },
    },
    errors: ["recoverable alias diagnostic"],
  };
}

describe("alias text profile import planning", () => {
  it.each([
    {
      strategy: "merge_keep",
      expected: {
        imported: 2,
        skipped: 1,
        overwritten: 0,
        cleared: 0,
        aliases: {
          Existing: {
            commands: ["ExistingCommand"],
            description: "existing",
          },
          Other: { commands: ["OtherCommand"] },
          sto_kb_existing: { commands: ["GeneratedExisting"] },
          Fresh: { commands: ["First", "Second"], description: "" },
          STO_KB_uppercase: {
            commands: ["UppercasePrefixImports"],
            description: "",
          },
        },
        optimized: ["First", "Second", "UppercasePrefixImports"],
      },
    },
    {
      strategy: "merge_overwrite",
      expected: {
        imported: 3,
        skipped: 0,
        overwritten: 1,
        cleared: 0,
        aliases: {
          Existing: {
            commands: ["ImportedConflict"],
            description: "imported",
          },
          Other: { commands: ["OtherCommand"] },
          sto_kb_existing: { commands: ["GeneratedExisting"] },
          Fresh: { commands: ["First", "Second"], description: "" },
          STO_KB_uppercase: {
            commands: ["UppercasePrefixImports"],
            description: "",
          },
        },
        optimized: [
          "ImportedConflict",
          "First",
          "Second",
          "UppercasePrefixImports",
        ],
      },
    },
    {
      strategy: "overwrite_all",
      expected: {
        imported: 3,
        skipped: 0,
        overwritten: 0,
        cleared: 3,
        aliases: {
          Existing: {
            commands: ["ImportedConflict"],
            description: "imported",
          },
          Fresh: { commands: ["First", "Second"], description: "" },
          STO_KB_uppercase: {
            commands: ["UppercasePrefixImports"],
            description: "",
          },
        },
        optimized: [
          "ImportedConflict",
          "First",
          "Second",
          "UppercasePrefixImports",
        ],
      },
    },
    {
      strategy: "future_strategy",
      expected: {
        imported: 3,
        skipped: 0,
        overwritten: 0,
        cleared: 0,
        aliases: {
          Existing: {
            commands: ["ImportedConflict"],
            description: "imported",
          },
          Other: { commands: ["OtherCommand"] },
          sto_kb_existing: { commands: ["GeneratedExisting"] },
          Fresh: { commands: ["First", "Second"], description: "" },
          STO_KB_uppercase: {
            commands: ["UppercasePrefixImports"],
            description: "",
          },
        },
        optimized: [
          "ImportedConflict",
          "First",
          "Second",
          "UppercasePrefixImports",
        ],
      },
    },
  ])(
    "preserves $strategy merge behavior and accounting",
    async ({ strategy, expected }) => {
      const profile = aliasProfile();
      const parsed = parsedAliases();
      const optimizeCommand = vi.fn(async (command) => command.trim());

      const result = await planAliasTextImport({
        profile,
        parsed,
        strategy,
        optimizeCommand,
      });

      expect(result).toMatchObject({
        success: true,
        imported: { aliases: expected.imported },
        skipped: expected.skipped,
        overwritten: expected.overwritten,
        cleared: expected.cleared,
        errors: ["recoverable alias diagnostic"],
        message: "import_completed_aliases",
      });
      expect(result.errors).toBe(parsed.errors);
      expect(result.nextProfile.aliases).toEqual(expected.aliases);
      expect(
        optimizeCommand.mock.calls.map(([command]) => command.trim()),
      ).toEqual(expected.optimized);
      expect(result.nextProfile.builds).toEqual(aliasProfile().builds);
      expect(result.nextProfile.extension).toEqual({ retained: true });
      expect(profile).toEqual(aliasProfile());

      if (strategy === "overwrite_all") {
        expect(result.nextProfile.aliasMetadata).toEqual({
          Orphan: { source: "orphan" },
        });
      } else {
        expect(result.nextProfile.aliasMetadata).toEqual(
          aliasProfile().aliasMetadata,
        );
      }
    },
  );

  it("constructs the historical missing-profile draft and uses safe own writes", async () => {
    const parsed = {
      aliases: Object.fromEntries([
        ["toString", { commands: "One", description: undefined }],
        ["valueOf", { commands: "", description: "Empty" }],
      ]),
      errors: [],
    };

    const result = await planAliasTextImport({
      profile: null,
      parsed,
      strategy: "merge_keep",
      optimizeCommand: async (command) => command,
    });

    expect(result.nextProfile).toEqual({
      aliases: {
        toString: { commands: ["One"], description: "" },
        valueOf: { commands: [], description: "Empty" },
      },
    });
    expect(Object.hasOwn(result.nextProfile.aliases, "toString")).toBe(true);
    expect(Object.hasOwn(result.nextProfile.aliases, "valueOf")).toBe(true);
    result.nextProfile.aliases.toString.commands.push("result only");
    expect(parsed.aliases.toString.commands).toBe("One");
  });

  it("adds aliases to an existing profile without an alias container", async () => {
    const source = {
      name: "Missing aliases",
      builds: { space: { keys: {} } },
      extension: { retained: true },
    };
    const result = await planAliasTextImport({
      profile: source,
      parsed: {
        aliases: { Fresh: { commands: "Imported" } },
        errors: [],
      },
      strategy: "merge_keep",
      optimizeCommand: async (command) => command,
    });

    expect(result.nextProfile).toEqual({
      ...source,
      aliases: { Fresh: { commands: ["Imported"], description: "" } },
    });
    expect(source).not.toHaveProperty("aliases");
  });
});
