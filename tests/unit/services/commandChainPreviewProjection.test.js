import { describe, expect, it } from "vitest";

import {
  formatCommandChainAliasPreview,
  projectMirroringCommands,
} from "../../../src/js/components/services/commandChainPreviewProjection.js";

describe("command-chain alias preview projection", () => {
  it("formats string and rich commands in their existing order", () => {
    expect(
      formatCommandChainAliasPreview("MyAlias", [
        "FireAll",
        { command: "FirePhasers" },
        "Distribute_Shields",
      ]),
    ).toBe("alias MyAlias <& FireAll $$ FirePhasers $$ Distribute_Shields &>");
  });

  it("preserves command text exactly without trimming", () => {
    expect(
      formatCommandChainAliasPreview("MyAlias", [
        " FireAll ",
        { command: "  FirePhasers" },
      ]),
    ).toBe("alias MyAlias <&  FireAll  $$   FirePhasers &>");
  });

  it("filters empty and nullish entries while retaining truthy legacy values", () => {
    expect(
      formatCommandChainAliasPreview("MyAlias", [
        "FireAll",
        "",
        null,
        undefined,
        {},
        { command: 7 },
        "FirePhasers",
      ]),
    ).toBe("alias MyAlias <& FireAll $$ 7 $$ FirePhasers &>");
  });

  it.each([[], null, undefined, {}, "FireAll"])(
    "uses the exact empty-chain form for %j",
    (commands) => {
      expect(formatCommandChainAliasPreview("MyAlias", commands)).toBe(
        "alias MyAlias <&  &>",
      );
    },
  );

  it("returns an empty string when the alias name is absent", () => {
    expect(formatCommandChainAliasPreview("", ["FireAll"])).toBe("");
    expect(formatCommandChainAliasPreview(null, ["FireAll"])).toBe("");
  });

  it("falls back to an empty chain when a malformed command throws", () => {
    const malformed = {};
    Object.defineProperty(malformed, "command", {
      get() {
        throw new Error("unreadable command");
      },
    });

    expect(
      formatCommandChainAliasPreview("MyAlias", ["FireAll", malformed]),
    ).toBe("alias MyAlias <&  &>");
  });

  it("retains the empty-chain fallback for a revoked command-list proxy", () => {
    const { proxy, revoke } = Proxy.revocable([], {});
    revoke();

    expect(formatCommandChainAliasPreview("MyAlias", proxy)).toBe(
      "alias MyAlias <&  &>",
    );
  });
});

describe("command-chain mirroring request projection", () => {
  it("preserves the exact mirroring fields while dropping unrelated metadata", () => {
    const commands = [
      "FireAll",
      {
        command: "TrayExecByTray 0 0",
        placement: "in-pivot-group",
        palindromicGeneration: false,
        displayText: "ignored",
      },
    ];

    expect(projectMirroringCommands(commands)).toEqual([
      { command: "FireAll" },
      {
        command: "TrayExecByTray 0 0",
        placement: "in-pivot-group",
        palindromicGeneration: false,
      },
    ]);
    expect(commands[1]).toHaveProperty("displayText", "ignored");
  });

  it("removes sparse entries without mutating the caller's array", () => {
    const commands = Array(2);
    commands[1] = "FireAll";

    expect(projectMirroringCommands(commands)).toEqual([
      { command: "FireAll" },
    ]);
    expect(commands).toHaveLength(2);
    expect(0 in commands).toBe(false);
  });
});
