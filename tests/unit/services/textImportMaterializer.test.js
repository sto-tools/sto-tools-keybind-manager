import { describe, expect, it, vi } from "vitest";

import {
  aliasTextFailureResult,
  keybindTextFailureResult,
  materializeAliasText,
  materializeKeybindText,
} from "../../../src/js/components/services/textImportMaterializer.js";

const translate = (key, params) => `${key}:${params.line}`;

describe("text import materializer", () => {
  it("adapts decoded keybinds through the injected command parser", async () => {
    const parseCommand = vi.fn(async (commandString) => ({
      commands: commandString ? [{ command: commandString }] : [],
    }));

    const result = await materializeKeybindText('0x29 "say "Hello""\nF2 ""', {
      parseCommand,
      translate,
    });

    expect(result).toEqual({
      keybinds: {
        "`": { raw: 'say "Hello"', commands: [{ command: 'say "Hello"' }] },
        F2: { raw: "", commands: [] },
      },
      aliases: {},
      errors: [],
    });
    expect(parseCommand).toHaveBeenCalledTimes(2);
  });

  it("isolates parser failures to their line and materializes lexical diagnostics", async () => {
    const result = await materializeKeybindText(
      'F1 "FireAll" trailing\nF2 "Jump"',
      {
        parseCommand: async () => {
          throw new Error("parser unavailable");
        },
        translate: (key, params) => `${key}:${params.line}:${params.reason}`,
      },
    );

    expect(result).toEqual({
      keybinds: {},
      aliases: {},
      errors: [
        "import_keybind_line_unrecognized:1:undefined",
        "import_keybind_line_parse_error:2:parser unavailable",
      ],
    });
  });

  it("resolves decoded-key collisions in source order", async () => {
    const parseCommand = vi.fn(async (commandString) => ({
      commands: [commandString],
    }));

    const result = await materializeKeybindText(
      '0x2 "encoded first"\n1 "display last"',
      { parseCommand, translate },
    );

    expect(result.keybinds).toEqual({
      1: { raw: "display last", commands: ["display last"] },
    });
    expect(parseCommand.mock.calls.map(([command]) => command)).toEqual([
      "encoded first",
      "display last",
    ]);
  });

  it("materializes safe alias records and maps document failures to RPC results", () => {
    expect(
      materializeAliasText(
        "; Desc\nalias legacy-name <&  &>\nalias bad <& x &> trailing",
        translate,
      ),
    ).toEqual({
      aliases: {
        "legacy-name": { commands: "", description: "Desc" },
      },
      errors: ["import_alias_line_unrecognized:3"],
    });
    expect(
      keybindTextFailureResult({
        success: false,
        error: "keybind_file_too_large",
        size: 11,
        limit: 10,
      }),
    ).toEqual({
      success: false,
      error: "keybind_file_too_large",
      params: { size: 11, limit: 10 },
    });
    expect(
      aliasTextFailureResult({
        success: false,
        error: "invalid_alias_file_content",
      }),
    ).toEqual({ success: false, error: "invalid_alias_file_content" });
  });
});
