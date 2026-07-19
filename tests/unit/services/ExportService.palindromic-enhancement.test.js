import { describe, expect, it } from "vitest";
import { planMirroredCommandSequence } from "../../../src/js/components/services/commandTransformationPlanner.js";

describe("command transformation mirroring", () => {
  const projectCommands = (commands, stabilize = false) =>
    planMirroredCommandSequence(commands, { stabilize });

  describe("Basic functionality", () => {
    it("should return empty array for empty input", () => {
      expect(projectCommands([], true)).toEqual([]);
    });

    it("should return single command unchanged", () => {
      const commands = ["Target_Enemy_Near"];
      expect(projectCommands(commands, true)).toEqual(["Target_Enemy_Near"]);
    });

    it("should return commands unchanged when stabilize is false", () => {
      const commands = ["Target_Enemy_Near", "+TrayExecByTray 1 0"];
      expect(projectCommands(commands, false)).toEqual([
        "Target_Enemy_Near",
        "+TrayExecByTray 1 0",
      ]);
    });

    it("should handle rich objects without stabilization", () => {
      const commands = [
        { command: "Target_Enemy_Near" },
        { command: "+TrayExecByTray 1 0", palindromicGeneration: false },
      ];
      expect(projectCommands(commands, false)).toEqual([
        "Target_Enemy_Near",
        "+TrayExecByTray 1 0",
      ]);
    });
  });

  describe("TrayExec-only palindromic generation", () => {
    it("should create simple palindrome with only TrayExec commands", () => {
      const commands = ["+TrayExecByTray 1 0", "+TrayExecByTray 1 1"];
      const result = projectCommands(commands, true);
      expect(result).toEqual([
        "+TrayExecByTray 1 0",
        "+TrayExecByTray 1 1",
        "+TrayExecByTray 1 0",
      ]);
    });

    it("should place non-TrayExec commands before pre-pivot section", () => {
      const commands = [
        "Target_Enemy_Near",
        "+TrayExecByTray 1 0",
        "+TrayExecByTray 1 1",
      ];
      const result = projectCommands(commands, true);
      expect(result).toEqual([
        "Target_Enemy_Near", // Non-TrayExec first
        "+TrayExecByTray 1 0", // Pre-pivot
        "+TrayExecByTray 1 1", // Pivot
        "+TrayExecByTray 1 0", // Post-pivot (mirrored)
      ]);
    });

    it("should handle multiple non-TrayExec commands", () => {
      const commands = [
        "Target_Enemy_Near",
        "FirePhasers",
        "+TrayExecByTray 1 0",
        "+TrayExecByTray 1 1",
      ];
      const result = projectCommands(commands, true);
      expect(result).toEqual([
        "Target_Enemy_Near", // Non-TrayExec first
        "FirePhasers", // Non-TrayExec first
        "+TrayExecByTray 1 0", // Pre-pivot
        "+TrayExecByTray 1 1", // Pivot
        "+TrayExecByTray 1 0", // Post-pivot (mirrored)
      ]);
    });

    it("should handle TrayExec with + prefix", () => {
      const commands = [
        "Target_Enemy_Near",
        "+TrayExecByTray 1 0",
        "+TrayExecByTray 1 1",
      ];
      const result = projectCommands(commands, true);
      expect(result).toEqual([
        "Target_Enemy_Near",
        "+TrayExecByTray 1 0",
        "+TrayExecByTray 1 1",
        "+TrayExecByTray 1 0",
      ]);
    });
  });

  describe("Individual command exclusion", () => {
    it("should handle excluded TrayExec command with before-pre-pivot placement", () => {
      const commands = [
        "+TrayExecByTray 1 0",
        {
          command: "+TrayExecByTray 1 1",
          palindromicGeneration: false,
          placement: "before-pre-pivot",
        },
        "+TrayExecByTray 1 2",
      ];
      const result = projectCommands(commands, true);
      expect(result).toEqual([
        "+TrayExecByTray 1 1", // Excluded, placed before pre-pivot
        "+TrayExecByTray 1 0", // Pre-pivot
        "+TrayExecByTray 1 2", // Pivot
        "+TrayExecByTray 1 0", // Post-pivot (mirrored)
      ]);
    });

    it("should handle excluded TrayExec command with in-pivot-group placement", () => {
      const commands = [
        "+TrayExecByTray 1 0",
        {
          command: "+TrayExecByTray 1 1",
          palindromicGeneration: false,
          placement: "in-pivot-group",
        },
        "+TrayExecByTray 1 2",
      ];
      const result = projectCommands(commands, true);
      expect(result).toEqual([
        "+TrayExecByTray 1 0", // Pre-pivot
        "+TrayExecByTray 1 2", // Pre-pivot
        "+TrayExecByTray 1 1", // Pivot group
        "+TrayExecByTray 1 2", // Post-pivot (mirrored)
        "+TrayExecByTray 1 0", // Post-pivot (mirrored)
      ]);
    });

    it("should handle mixed excluded TrayExec placements", () => {
      const commands = [
        {
          command: "+TrayExecByTray 1 0",
          palindromicGeneration: false,
          placement: "before-pre-pivot",
        },
        "+TrayExecByTray 1 1",
        {
          command: "+TrayExecByTray 1 2",
          palindromicGeneration: false,
          placement: "in-pivot-group",
        },
      ];
      const result = projectCommands(commands, true);
      expect(result).toEqual([
        "+TrayExecByTray 1 0", // Before-pre-pivot
        "+TrayExecByTray 1 1", // Pre-pivot
        "+TrayExecByTray 1 2", // Pivot group
        "+TrayExecByTray 1 1", // Post-pivot (mirrored)
      ]);
    });

    it("should use pivot group when specified, even with single TrayExec left", () => {
      const commands = [
        "+TrayExecByTray 1 0",
        {
          command: "+TrayExecByTray 1 1",
          palindromicGeneration: false,
          placement: "in-pivot-group",
        },
      ];
      const result = projectCommands(commands, true);
      expect(result).toEqual([
        "+TrayExecByTray 1 0", // Pre-pivot
        "+TrayExecByTray 1 1", // Pivot group
        "+TrayExecByTray 1 0", // Post-pivot (mirrored pre-pivot)
      ]);
    });
  });

  describe("Complex scenarios", () => {
    it("should handle mixed non-TrayExec and excluded TrayExec commands", () => {
      const commands = [
        "Target_Enemy_Near",
        {
          command: "+TrayExecByTray 1 0",
          palindromicGeneration: false,
          placement: "before-pre-pivot",
        },
        "+TrayExecByTray 1 1",
        "+TrayExecByTray 1 2",
        "FirePhasers",
      ];
      const result = projectCommands(commands, true);
      expect(result).toEqual([
        "Target_Enemy_Near", // Non-TrayExec first (preserves input order)
        "+TrayExecByTray 1 0", // Before-pre-pivot
        "FirePhasers", // Non-TrayExec (preserves input order)
        "+TrayExecByTray 1 1", // Pre-pivot
        "+TrayExecByTray 1 2", // Pivot
        "+TrayExecByTray 1 1", // Post-pivot (mirrored)
      ]);
    });

    it("should handle all commands excluded from palindrome", () => {
      const commands = [
        "Target_Enemy_Near",
        {
          command: "+TrayExecByTray 1 0",
          palindromicGeneration: false,
          placement: "before-pre-pivot",
        },
        {
          command: "+TrayExecByTray 1 1",
          palindromicGeneration: false,
          placement: "before-pre-pivot",
        },
      ];
      const result = projectCommands(commands, true);
      expect(result).toEqual([
        "Target_Enemy_Near", // Non-TrayExec first
        "+TrayExecByTray 1 0", // Before-pre-pivot
        "+TrayExecByTray 1 1", // Before-pre-pivot (no palindrome since no palindromic commands)
      ]);
    });

    it("should handle single TrayExec command with non-TrayExec commands", () => {
      const commands = [
        "Target_Enemy_Near",
        "+TrayExecByTray 1 0",
        "FirePhasers",
      ];
      const result = projectCommands(commands, true);
      expect(result).toEqual([
        "Target_Enemy_Near", // Non-TrayExec first
        "FirePhasers", // Non-TrayExec first
        "+TrayExecByTray 1 0", // Single TrayExec becomes pivot (no mirroring)
      ]);
    });

    it("should handle empty pivot group with regular TrayExec commands", () => {
      const commands = [
        "+TrayExecByTray 1 0",
        "+TrayExecByTray 1 1",
        "+TrayExecByTray 1 2",
        "+TrayExecByTray 1 3",
      ];
      const result = projectCommands(commands, true);
      expect(result).toEqual([
        "+TrayExecByTray 1 0", // Pre-pivot
        "+TrayExecByTray 1 1", // Pre-pivot
        "+TrayExecByTray 1 2", // Pre-pivot
        "+TrayExecByTray 1 3", // Pivot
        "+TrayExecByTray 1 2", // Post-pivot (mirrored)
        "+TrayExecByTray 1 1", // Post-pivot (mirrored)
        "+TrayExecByTray 1 0", // Post-pivot (mirrored)
      ]);
    });
  });

  describe("Edge cases", () => {
    it("should handle commands with only non-TrayExec types", () => {
      const commands = ["Target_Enemy_Near", "FirePhasers", "ActivateShield"];
      const result = projectCommands(commands, true);
      expect(result).toEqual([
        "Target_Enemy_Near",
        "FirePhasers",
        "ActivateShield",
      ]);
    });

    it("drops empty command strings", () => {
      const commands = ["", "+TrayExecByTray 1 0"];
      const result = projectCommands(commands, true);
      expect(result).toEqual(["+TrayExecByTray 1 0"]);
    });

    it("should handle rich objects without command property", () => {
      const commands = [
        { command: "+TrayExecByTray 1 0" },
        { command: "+TrayExecByTray 1 1", palindromicGeneration: false },
      ];
      const result = projectCommands(commands, true);
      expect(result).toEqual([
        "+TrayExecByTray 1 1", // Before-pre-pivot
        "+TrayExecByTray 1 0", // Single TrayExec becomes pivot
      ]);
    });
  });

  describe("Backward compatibility", () => {
    it("should handle old string-only command format", () => {
      const commands = [
        "Target_Enemy_Near",
        "+TrayExecByTray 1 0",
        "+TrayExecByTray 1 1",
      ];
      const result = projectCommands(commands, true);
      expect(result).toEqual([
        "Target_Enemy_Near",
        "+TrayExecByTray 1 0",
        "+TrayExecByTray 1 1",
        "+TrayExecByTray 1 0",
      ]);
    });

    it("should handle mixed string and rich object format", () => {
      const commands = [
        "Target_Enemy_Near",
        "+TrayExecByTray 1 0",
        { command: "+TrayExecByTray 1 1", palindromicGeneration: false },
      ];
      const result = projectCommands(commands, true);
      expect(result).toEqual([
        "Target_Enemy_Near",
        "+TrayExecByTray 1 1", // Before-pre-pivot
        "+TrayExecByTray 1 0", // Single TrayExec becomes pivot
      ]);
    });
  });

  describe("projection options and compatibility quirks", () => {
    it("can omit the generated post-pivot sequence", () => {
      expect(
        planMirroredCommandSequence(
          ["+TrayExecByTray 1 0", "+TrayExecByTray 1 1"],
          { stabilize: true, includePostPivot: false },
        ),
      ).toEqual(["+TrayExecByTray 1 0", "+TrayExecByTray 1 1"]);
    });

    it("does not classify the historical STO-prefixed form as TrayExec", () => {
      expect(
        planMirroredCommandSequence(
          ["+TrayExecByTray 1 0", "+STOTrayExecByTray 1 1"],
          { stabilize: true },
        ),
      ).toEqual(["+STOTrayExecByTray 1 1", "+TrayExecByTray 1 0"]);
    });
  });
});
