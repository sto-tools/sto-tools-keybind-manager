import { describe, expect, it } from "vitest";
import en from "../../src/i18n/en.json";
import "../../src/js/data.js";

describe("command library data", () => {
  it("publishes Refine Dilithium in the System group", () => {
    const command = window.STO_DATA.commands.system.commands.refine_dilithium;

    expect(command).toEqual({
      name: "Refine Dilithium",
      command: "gensendmessage inventory_root processdilithium",
      description: "Refine dilithium ore from your inventory",
      syntax: "gensendmessage inventory_root processdilithium",
      icon: "⛏️",
    });
    expect(window.COMMANDS.refine_dilithium).toMatchObject({
      category: "system",
      key: "refine_dilithium",
    });
    expect(en.command_definitions.refine_dilithium).toEqual({
      name: "Refine Dilithium",
      description: "Refine dilithium ore from your inventory",
    });
  });
});
