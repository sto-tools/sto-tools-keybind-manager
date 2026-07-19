import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import CommandService from "../../../src/js/components/services/CommandService.js";
import { respond } from "../../../src/js/core/requestResponse.js";
import { createServiceFixture } from "../../fixtures/index.js";

describe("CommandService Palindromic Enhancement", () => {
  let fixture;
  let service;
  let detachParser;

  beforeEach(() => {
    fixture = createServiceFixture();
    service = new CommandService({
      eventBus: fixture.eventBus,
      i18n: { t: (key) => key },
    });
    service.init();
    detachParser = respond(
      fixture.eventBus,
      "parser:parse-command-string",
      ({ commandString }) => ({ commands: [{ command: commandString }] }),
    );
  });

  afterEach(() => {
    detachParser();
    if (!service.destroyed) service.destroy();
    fixture.destroy();
    vi.restoreAllMocks();
  });

  describe("Basic functionality", () => {
    it("should return empty string for empty input", async () => {
      expect(await service.generateMirroredCommands([])).toEqual("");
    });

    it("should return single command unchanged", async () => {
      const commands = ["Target_Enemy_Near"];
      expect(await service.generateMirroredCommands(commands)).toEqual(
        "Target_Enemy_Near",
      );
    });

    it("should handle single rich object command", async () => {
      const commands = [{ command: "Target_Enemy_Near" }];
      expect(await service.generateMirroredCommands(commands)).toEqual(
        "Target_Enemy_Near",
      );
    });

    it("should return two commands joined with $$ separator", async () => {
      const commands = ["Target_Enemy_Near", "FirePhasers"];
      expect(await service.generateMirroredCommands(commands)).toEqual(
        "Target_Enemy_Near $$ FirePhasers",
      );
    });
  });

  describe("TrayExec-only palindromic generation", () => {
    it("should create simple palindrome with only TrayExec commands", async () => {
      const commands = ["+TrayExecByTray 1 0", "+TrayExecByTray 1 1"];
      const result = await service.generateMirroredCommands(commands);
      expect(result).toEqual(
        "+TrayExecByTray 1 0 $$ +TrayExecByTray 1 1 $$ +TrayExecByTray 1 0",
      );
    });

    it("should place non-TrayExec commands before pre-pivot section", async () => {
      const commands = [
        "Target_Enemy_Near",
        "+TrayExecByTray 1 0",
        "+TrayExecByTray 1 1",
      ];
      const result = await service.generateMirroredCommands(commands);
      expect(result).toEqual(
        "Target_Enemy_Near $$ +TrayExecByTray 1 0 $$ +TrayExecByTray 1 1 $$ +TrayExecByTray 1 0",
      );
    });

    it("should handle multiple non-TrayExec commands", async () => {
      const commands = [
        "Target_Enemy_Near",
        "FirePhasers",
        "+TrayExecByTray 1 0",
        "+TrayExecByTray 1 1",
      ];
      const result = await service.generateMirroredCommands(commands);
      expect(result).toEqual(
        "Target_Enemy_Near $$ FirePhasers $$ +TrayExecByTray 1 0 $$ +TrayExecByTray 1 1 $$ +TrayExecByTray 1 0",
      );
    });

    it("should handle TrayExec with + prefix", async () => {
      const commands = [
        "Target_Enemy_Near",
        "+TrayExecByTray 1 0",
        "+TrayExecByTray 1 1",
      ];
      const result = await service.generateMirroredCommands(commands);
      expect(result).toEqual(
        "Target_Enemy_Near $$ +TrayExecByTray 1 0 $$ +TrayExecByTray 1 1 $$ +TrayExecByTray 1 0",
      );
    });
  });

  describe("Individual command exclusion", () => {
    it("should handle excluded TrayExec command with before-pre-pivot placement", async () => {
      const commands = [
        "+TrayExecByTray 1 0",
        {
          command: "+TrayExecByTray 1 1",
          palindromicGeneration: false,
          placement: "before-pre-pivot",
        },
        "+TrayExecByTray 1 2",
      ];
      const result = await service.generateMirroredCommands(commands);
      expect(result).toEqual(
        "+TrayExecByTray 1 1 $$ +TrayExecByTray 1 0 $$ +TrayExecByTray 1 2 $$ +TrayExecByTray 1 0",
      );
    });

    it("should handle excluded TrayExec command with in-pivot-group placement", async () => {
      const commands = [
        "+TrayExecByTray 1 0",
        {
          command: "+TrayExecByTray 1 1",
          palindromicGeneration: false,
          placement: "in-pivot-group",
        },
        "+TrayExecByTray 1 2",
      ];
      const result = await service.generateMirroredCommands(commands);
      expect(result).toEqual(
        "+TrayExecByTray 1 0 $$ +TrayExecByTray 1 2 $$ +TrayExecByTray 1 1 $$ +TrayExecByTray 1 2 $$ +TrayExecByTray 1 0",
      );
    });

    it("should handle mixed excluded TrayExec placements", async () => {
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
      const result = await service.generateMirroredCommands(commands);
      expect(result).toEqual(
        "+TrayExecByTray 1 0 $$ +TrayExecByTray 1 1 $$ +TrayExecByTray 1 2 $$ +TrayExecByTray 1 1",
      );
    });

    it("should use pivot group when specified, even with single TrayExec left", async () => {
      const commands = [
        "+TrayExecByTray 1 0",
        {
          command: "+TrayExecByTray 1 1",
          palindromicGeneration: false,
          placement: "in-pivot-group",
        },
      ];
      const result = await service.generateMirroredCommands(commands);
      expect(result).toEqual(
        "+TrayExecByTray 1 0 $$ +TrayExecByTray 1 1 $$ +TrayExecByTray 1 0",
      );
    });
  });

  describe("Complex scenarios", () => {
    it("should handle mixed non-TrayExec and excluded TrayExec commands", async () => {
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
      const result = await service.generateMirroredCommands(commands);
      expect(result).toEqual(
        "Target_Enemy_Near $$ +TrayExecByTray 1 0 $$ FirePhasers $$ +TrayExecByTray 1 1 $$ +TrayExecByTray 1 2 $$ +TrayExecByTray 1 1",
      );
    });

    it("should handle all commands excluded from palindrome", async () => {
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
      const result = await service.generateMirroredCommands(commands);
      expect(result).toEqual(
        "Target_Enemy_Near $$ +TrayExecByTray 1 0 $$ +TrayExecByTray 1 1",
      );
    });

    it("should handle single TrayExec command with non-TrayExec commands", async () => {
      const commands = [
        "Target_Enemy_Near",
        "+TrayExecByTray 1 0",
        "FirePhasers",
      ];
      const result = await service.generateMirroredCommands(commands);
      expect(result).toEqual(
        "Target_Enemy_Near $$ FirePhasers $$ +TrayExecByTray 1 0",
      );
    });

    it("should handle empty pivot group with regular TrayExec commands", async () => {
      const commands = [
        "+TrayExecByTray 1 0",
        "+TrayExecByTray 1 1",
        "+TrayExecByTray 1 2",
        "+TrayExecByTray 1 3",
      ];
      const result = await service.generateMirroredCommands(commands);
      expect(result).toEqual(
        "+TrayExecByTray 1 0 $$ +TrayExecByTray 1 1 $$ +TrayExecByTray 1 2 $$ +TrayExecByTray 1 3 $$ +TrayExecByTray 1 2 $$ +TrayExecByTray 1 1 $$ +TrayExecByTray 1 0",
      );
    });
  });

  describe("Edge cases", () => {
    it("should handle commands with only non-TrayExec types", async () => {
      const commands = ["Target_Enemy_Near", "FirePhasers", "ActivateShield"];
      const result = await service.generateMirroredCommands(commands);
      expect(result).toEqual(
        "Target_Enemy_Near $$ FirePhasers $$ ActivateShield",
      );
    });

    it("drops empty command strings", async () => {
      const commands = ["", "+TrayExecByTray 1 0"];
      const result = await service.generateMirroredCommands(commands);
      expect(result).toEqual("+TrayExecByTray 1 0");
    });

    it("should handle rich objects without command property", async () => {
      const commands = [
        { command: "+TrayExecByTray 1 0" },
        { command: "+TrayExecByTray 1 1", palindromicGeneration: false },
      ];
      const result = await service.generateMirroredCommands(commands);
      expect(result).toEqual("+TrayExecByTray 1 1 $$ +TrayExecByTray 1 0");
    });

    it("should handle invalid objects in command array", async () => {
      const commands = [
        "+TrayExecByTray 1 0",
        null,
        undefined,
        { command: "+TrayExecByTray 1 1" },
        { invalid: "object" },
      ];
      const result = await service.generateMirroredCommands(commands);
      expect(result).toEqual(
        "+TrayExecByTray 1 0 $$ +TrayExecByTray 1 1 $$ +TrayExecByTray 1 0",
      );
    });
  });

  describe("Backward compatibility", () => {
    it("should handle old string-only command format", async () => {
      const commands = [
        "Target_Enemy_Near",
        "+TrayExecByTray 1 0",
        "+TrayExecByTray 1 1",
      ];
      const result = await service.generateMirroredCommands(commands);
      expect(result).toEqual(
        "Target_Enemy_Near $$ +TrayExecByTray 1 0 $$ +TrayExecByTray 1 1 $$ +TrayExecByTray 1 0",
      );
    });

    it("should handle mixed string and rich object format", async () => {
      const commands = [
        "Target_Enemy_Near",
        "+TrayExecByTray 1 0",
        { command: "+TrayExecByTray 1 1", palindromicGeneration: false },
      ];
      const result = await service.generateMirroredCommands(commands);
      expect(result).toEqual(
        "Target_Enemy_Near $$ +TrayExecByTray 1 1 $$ +TrayExecByTray 1 0",
      );
    });
  });

  describe("Command normalization integration", () => {
    it("should call normalizeCommandsForDisplay with proper structure", async () => {
      const mockNormalize = vi
        .spyOn(service, "normalizeCommandsForDisplay")
        .mockResolvedValue(["cmd1", "cmd2"]);

      const commands = ["+TrayExecByTray 1 0", "+TrayExecByTray 1 1"];
      await service.generateMirroredCommands(commands);

      expect(mockNormalize).toHaveBeenCalledWith([
        { command: "+TrayExecByTray 1 0" },
        { command: "+TrayExecByTray 1 1" },
        { command: "+TrayExecByTray 1 0" },
      ]);
    });

    it("should handle normalizeCommandsForDisplay for single command", async () => {
      const mockNormalize = vi
        .spyOn(service, "normalizeCommandsForDisplay")
        .mockResolvedValue(["Target_Enemy_Near"]);

      const commands = ["Target_Enemy_Near"];
      await service.generateMirroredCommands(commands);

      expect(mockNormalize).toHaveBeenCalledWith([
        { command: "Target_Enemy_Near" },
      ]);
    });
  });
});
