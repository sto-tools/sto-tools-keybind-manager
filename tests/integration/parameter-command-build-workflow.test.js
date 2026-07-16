import { afterEach, beforeEach, describe, expect, it } from "vitest";

import ParameterCommandService from "../../src/js/components/services/ParameterCommandService.js";
import { createServiceFixture } from "../fixtures/index.js";

const cases = [
  {
    name: "tray commands",
    categoryId: "tray",
    commandId: "custom_tray",
    commandDef: {
      name: "Execute Tray Slot",
      icon: "⚡",
      baseCommand: "+STOTrayExecByTray",
    },
    params: { tray: 2, slot: 5 },
    expected: {
      command: "+STOTrayExecByTray 2 5",
      displayText: "Execute Tray 3 Slot 6",
    },
  },
  {
    name: "communication commands",
    categoryId: "communication",
    commandId: "communication",
    commandDef: { name: "Communication Command", icon: "💬", command: "say" },
    params: { verb: "team", message: "Attack now!" },
    expected: {
      command: 'team "Attack now!"',
      displayText: 'team: "Attack now!"',
    },
  },
  {
    name: "VFX commands",
    categoryId: "vfx",
    commandId: "vfx_exclusion",
    commandDef: { name: "VFX Exclusion List", icon: "✨" },
    params: { effects: "Fx_Explosion,Fx_Beam" },
    expected: {
      command: "dynFxSetFXExlusionList Fx_Explosion,Fx_Beam",
      displayText: "VFX Exclude: Fx_Explosion,Fx_Beam",
    },
  },
  {
    name: "targeting commands",
    categoryId: "targeting",
    commandId: "target_entity",
    commandDef: { name: "Target Entity", icon: "🎯", command: "Target" },
    params: { entityName: "Enemy Ship" },
    expected: {
      command: 'Target "Enemy Ship"',
      displayText: "Target: Enemy Ship",
    },
  },
  {
    name: "power commands",
    categoryId: "power",
    commandId: "power_exec",
    commandDef: { name: "Execute Power", icon: "🔋", command: "+power_exec" },
    params: { powerName: "SomePower" },
    expected: {
      command: "+power_exec SomePower",
      displayText: "Power: SomePower",
    },
  },
];

describe("Integration: parameter command build workflow", () => {
  let fixture;
  let service;

  beforeEach(() => {
    fixture = createServiceFixture();
    service = new ParameterCommandService({ eventBus: fixture.eventBus });
    service.init();
  });

  afterEach(() => {
    if (!service.destroyed) service.destroy();
    fixture.destroy();
  });

  it.each(cases)(
    "builds $name through the retained action RPC",
    async (entry) => {
      const result = await service.request("parameter-command:build", {
        categoryId: entry.categoryId,
        commandId: entry.commandId,
        commandDef: entry.commandDef,
        params: entry.params,
      });

      expect(result).toMatchObject({
        ...entry.expected,
        type: entry.categoryId,
        icon: entry.commandDef.icon,
        parameters: entry.params,
      });
      expect(result?.id).toMatch(/^cmd_/);
    },
  );
});
