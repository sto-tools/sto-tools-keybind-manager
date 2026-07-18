import { describe, expect, it } from "vitest";

import {
  decodeAliasText,
  decodeKeybindText,
  MAX_STO_TEXT_IMPORT_BYTES,
} from "../../../src/js/components/services/textImportBoundary.js";
import { formatKeybindLine } from "../../../src/js/lib/STOFormatter.js";

describe("STO text import boundary", () => {
  it.each([
    [decodeKeybindText, null, "invalid_keybind_file_content"],
    [decodeKeybindText, "", "invalid_keybind_file_content"],
    [decodeKeybindText, "\ufeff", "invalid_keybind_file_content"],
    [decodeAliasText, undefined, "invalid_alias_file_content"],
    [decodeAliasText, "", "invalid_alias_file_content"],
    [decodeAliasText, "\ufeff", "invalid_alias_file_content"],
  ])("rejects an unknown or empty document", (decode, input, error) => {
    expect(decode(input)).toEqual({ success: false, error });
  });

  it.each([
    [decodeKeybindText, "keybind_file_too_large"],
    [decodeAliasText, "alias_file_too_large"],
  ])("enforces an exact UTF-8 byte cap", (decode, error) => {
    expect(decode("x".repeat(MAX_STO_TEXT_IMPORT_BYTES)).success).toBe(true);
    expect(decode("x".repeat(MAX_STO_TEXT_IMPORT_BYTES + 1))).toEqual({
      success: false,
      error,
      size: MAX_STO_TEXT_IMPORT_BYTES + 1,
      limit: MAX_STO_TEXT_IMPORT_BYTES,
    });

    const exactMultibyte = "x".repeat(MAX_STO_TEXT_IMPORT_BYTES - 2) + "é";
    expect(decode(exactMultibyte).success).toBe(true);
    expect(decode(`${exactMultibyte}x`)).toEqual({
      success: false,
      error,
      size: MAX_STO_TEXT_IMPORT_BYTES + 1,
      limit: MAX_STO_TEXT_IMPORT_BYTES,
    });
  });

  it("decodes BOM/CRLF, encoded and punctuation keys, embedded quotes, and empty commands", () => {
    const result = decodeKeybindText(
      '\ufeff; comment\r\n0x29 "say "Hello World""\r\nALT+0x29 ""\r\n',
    );

    expect(result).toEqual({
      success: true,
      value: {
        entries: {
          "0x29": { key: "0x29", raw: 'say "Hello World"', line: 2 },
          "ALT+0x29": { key: "ALT+0x29", raw: "", line: 3 },
        },
        diagnostics: [],
      },
    });
  });

  it("accepts the live exporter grammar and retires ambiguous trailing text", () => {
    const exportedLine = formatKeybindLine("F2", [
      'say "Exporter quotes survive"',
    ]).trim();
    const result = decodeKeybindText(
      `F1 "FireAll" trailing\nalias Other <& FireAll &>\n${exportedLine}`,
    );

    expect(result).toEqual({
      success: true,
      value: {
        entries: {
          F2: {
            key: "F2",
            raw: 'say "Exporter quotes survive"',
            line: 3,
          },
        },
        diagnostics: [
          {
            code: "unrecognized_keybind_line",
            line: 1,
            source: 'F1 "FireAll" trailing',
          },
        ],
      },
    });
  });

  it("uses safe last-wins key properties and rejects dangerous names", () => {
    const result = decodeKeybindText(
      'F1 "First"\nF1 "Second"\n__proto__ "pollute"\nconstructor "pollute"',
    );
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.value.entries.F1).toEqual({
      key: "F1",
      raw: "Second",
      line: 2,
    });
    expect(Object.hasOwn(result.value.entries, "__proto__")).toBe(false);
    expect(Object.hasOwn(result.value.entries, "constructor")).toBe(false);
    expect(result.value.diagnostics.map(({ code }) => code)).toEqual([
      "unsafe_keybind_name",
      "unsafe_keybind_name",
    ]);
    expect(Object.prototype).not.toHaveProperty("pollute");
  });

  it("round-trips bracket/quoted aliases, punctuation names, empty commands, and adjacent descriptions", () => {
    const result = decodeAliasText(
      '; Exact description\r\nalias legacy-name <&  &>\r\n\r\n; Detached description\r\n\r\nalias quoted.name "say "Hello""',
    );

    expect(result).toEqual({
      success: true,
      value: {
        entries: {
          "legacy-name": {
            name: "legacy-name",
            commands: "",
            description: "Exact description",
            line: 2,
          },
          "quoted.name": {
            name: "quoted.name",
            commands: 'say "Hello"',
            line: 6,
          },
        },
        diagnostics: [],
      },
    });
  });

  it("requires full alias lines, skips valid keybinds, and safely handles duplicates and dangerous names", () => {
    const result = decodeAliasText(
      'alias Fire <& First &> trailing\nF1 "FireAll"\nalias Fire <& First &>\nalias Fire "Second"\nalias __proto__ <& pollute &>\nalias prototype <& pollute &>',
    );
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.value.entries.Fire).toEqual({
      name: "Fire",
      commands: "Second",
      line: 4,
    });
    expect(Object.hasOwn(result.value.entries, "__proto__")).toBe(false);
    expect(Object.hasOwn(result.value.entries, "prototype")).toBe(false);
    expect(result.value.diagnostics).toEqual([
      {
        code: "unrecognized_alias_line",
        line: 1,
        source: "alias Fire <& First &> trailing",
      },
      {
        code: "unsafe_alias_name",
        line: 5,
        source: "alias __proto__ <& pollute &>",
      },
      {
        code: "unsafe_alias_name",
        line: 6,
        source: "alias prototype <& pollute &>",
      },
    ]);
    expect(Object.prototype).not.toHaveProperty("pollute");
  });

  it("diagnoses a long unterminated bracket alias without regex backtracking", () => {
    const source = `alias Slow <& ${" ".repeat(100_000)}X`;
    const started = performance.now();
    const result = decodeAliasText(source);
    const elapsed = performance.now() - started;

    expect(result).toEqual({
      success: true,
      value: {
        entries: {},
        diagnostics: [{ code: "unrecognized_alias_line", line: 1, source }],
      },
    });
    expect(elapsed).toBeLessThan(1_000);
  });
});
