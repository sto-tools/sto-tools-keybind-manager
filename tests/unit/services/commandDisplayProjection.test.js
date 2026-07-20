import { describe, expect, it } from "vitest";

import {
  formatCommandValidationPreview,
  normalizeParsedCommandForDisplay,
} from "../../../src/js/components/services/commandDisplayProjection.js";

describe("parsed command display projection", () => {
  it("keeps the original command for absent, empty, and non-TrayExec results", () => {
    for (const parseResult of [
      {},
      { commands: [] },
      { commands: [{ signature: "FireAll()", parameters: {} }] },
      { commands: [{ signature: "TrayExecByTray()" }] },
    ]) {
      expect(
        normalizeParsedCommandForDisplay("OriginalCommand", parseResult),
      ).toBe("OriginalCommand");
    }
  });

  it("normalizes implicit and explicit regular TrayExec forms", () => {
    expect(
      normalizeParsedCommandForDisplay("original", {
        commands: [
          {
            signature: "TrayExecByTray(active, tray, slot)",
            parameters: {
              tray: 2,
              slot: 4,
              baseCommand: "+STOTrayExecByTray",
            },
          },
        ],
      }),
    ).toBe("+STOTrayExecByTray 2 4");

    expect(
      normalizeParsedCommandForDisplay("original", {
        commands: [
          {
            signature: "TrayExecByTray(active, tray, slot)",
            parameters: { active: 0, tray: 2, slot: 4 },
          },
        ],
      }),
    ).toBe("TrayExecByTray 0 2 4");
  });

  it("normalizes implicit and explicit TrayExec-with-backup forms", () => {
    expect(
      normalizeParsedCommandForDisplay("original", {
        commands: [
          {
            signature:
              "TrayExecByTrayWithBackup(active, tray, slot, backup_tray, backup_slot)",
            parameters: {
              active: 1,
              tray: 1,
              slot: 2,
              backup_tray: 3,
              backup_slot: 4,
              baseCommand: "+STOTrayExecByTrayWithBackup",
            },
          },
        ],
      }),
    ).toBe("+STOTrayExecByTrayWithBackup 1 2 3 4");

    expect(
      normalizeParsedCommandForDisplay("original", {
        commands: [
          {
            signature: "TrayExecByTrayWithBackup(active, tray, slot)",
            parameters: {
              active: 0,
              tray: 1,
              slot: 2,
              backup_tray: 3,
              backup_slot: 4,
            },
          },
        ],
      }),
    ).toBe("TrayExecByTrayWithBackup 0 1 2 3 4");
  });

  it("retains strict numeric active semantics and legacy parameter interpolation", () => {
    expect(
      normalizeParsedCommandForDisplay("original", {
        commands: [
          {
            signature: "TrayExecByTray(active, tray, slot)",
            parameters: { active: "1", tray: 2, slot: undefined },
          },
        ],
      }),
    ).toBe("TrayExecByTray 1 2 undefined");
  });

  it("accepts the historical indexable parser result shape", () => {
    expect(
      normalizeParsedCommandForDisplay("original", {
        commands: {
          0: {
            signature: "TrayExecByTray(active, tray, slot)",
            parameters: { tray: 5, slot: 6 },
          },
        },
      }),
    ).toBe("+TrayExecByTray 5 6");
  });

  it("lets malformed parser properties fail for the facade fallback", () => {
    const parsedCommand = {};
    Object.defineProperty(parsedCommand, "signature", {
      get() {
        throw new Error("unreadable signature");
      },
    });

    expect(() =>
      normalizeParsedCommandForDisplay("original", {
        commands: [parsedCommand],
      }),
    ).toThrow("unreadable signature");
    expect(() => normalizeParsedCommandForDisplay("original", null)).toThrow();
  });
});

describe("command validation preview projection", () => {
  it.each([[], null, undefined, {}, "FireAll"])(
    "uses the exact empty preview for %j",
    (commands) => {
      expect(formatCommandValidationPreview("F1", commands)).toBe('F1 ""');
    },
  );

  it("joins string and rich commands without trimming", () => {
    expect(
      formatCommandValidationPreview("F1", [
        " FireAll ",
        { command: "FirePhasers" },
        {},
      ]),
    ).toBe('F1 " FireAll  $$ FirePhasers $$ [object Object]"');
  });

  it("applies the exact legacy palindrome only when requested for a chain", () => {
    expect(
      formatCommandValidationPreview(
        "F1",
        ["First", { command: "Second" }, "Third"],
        true,
      ),
    ).toBe('F1 "First $$ Second $$ Third $$ Second $$ First"');
    expect(formatCommandValidationPreview("F1", ["First"], true)).toBe(
      'F1 "First"',
    );
  });

  it("preserves malformed-command failures for the validation facade", () => {
    expect(() => formatCommandValidationPreview("F1", [null])).toThrow();

    const malformed = {};
    Object.defineProperty(malformed, "command", {
      get() {
        throw new Error("unreadable command");
      },
    });
    expect(() => formatCommandValidationPreview("F1", [malformed])).toThrow(
      "unreadable command",
    );
  });
});
