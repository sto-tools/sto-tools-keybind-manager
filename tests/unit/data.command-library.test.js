import { describe, expect, it } from "vitest";
import de from "../../src/i18n/de.json";
import en from "../../src/i18n/en.json";
import es from "../../src/i18n/es.json";
import fr from "../../src/i18n/fr.json";
import commandCategories from "../../src/js/data/commandCatalog.js";
import {
  flattenedCommands,
  localizeCommands,
  stoData,
} from "../../src/js/data.js";

describe("command library data", () => {
  it("publishes Refine Dilithium in the System group", () => {
    const command = stoData.commands.system.commands.refine_dilithium;

    expect(command).toEqual({
      name: "Refine Dilithium",
      command: "gensendmessage inventory_root processdilithium",
      description: "Refine dilithium ore from your inventory",
      syntax: "gensendmessage inventory_root processdilithium",
      icon: "⛏️",
    });
    expect(flattenedCommands.refine_dilithium).toMatchObject({
      category: "system",
      key: "refine_dilithium",
    });
    expect(en.command_definitions.refine_dilithium).toEqual({
      name: "Refine Dilithium",
      description: "Refine dilithium ore from your inventory",
    });
    expect(stoData.commands).toBe(commandCategories);
    expect(stoData.settings.version).toBe("1.0.0");
    expect(Object.keys(commandCategories.system.commands).slice(8, 12)).toEqual(
      ["missions", "inventory", "refine_dilithium", "map"],
    );
  });

  it("provides Refine Dilithium translations for every supported language", () => {
    expect(de.command_definitions.refine_dilithium).toEqual({
      name: "Dilithium veredeln",
      description: "Dilithiumerz aus Ihrem Inventar veredeln",
    });
    expect(es.command_definitions.refine_dilithium).toEqual({
      name: "Refinar dilitio",
      description: "Refinar mineral de dilitio de tu inventario",
    });
    expect(fr.command_definitions.refine_dilithium).toEqual({
      name: "Raffiner le dilithium",
      description: "Raffiner le minerai de dilithium de votre inventaire",
    });
    expect(de.invalid_input).toBe("Ungültige Eingabe");
    expect(es.invalid_input).toBe("Entrada no válida");
    expect(fr.invalid_input).toBe("Saisie invalide");
  });

  it("keeps the shared catalog and flattened projection identities stable across relocalization", () => {
    const snapshot = structuredClone(commandCategories);
    const projection = flattenedCommands;
    const flattenedFireAll = flattenedCommands.fire_all;
    const originalFlattenedName = flattenedFireAll.name;
    const sourceFireAll = commandCategories.combat.commands.fire_all;
    const sourceParameters =
      commandCategories.movement.commands.throttle_adjust.parameters;

    try {
      expect(flattenedFireAll).not.toBe(sourceFireAll);
      expect(flattenedCommands.throttle_adjust.parameters).toBe(
        sourceParameters,
      );

      localizeCommands({ t: (key) => `first:${key}` });
      expect(stoData.commands).toBe(commandCategories);
      expect(flattenedCommands).toBe(projection);
      expect(flattenedCommands.fire_all).toBe(flattenedFireAll);
      expect(flattenedFireAll.name).toBe(originalFlattenedName);
      expect(commandCategories.combat.name).toBe(
        "first:command_categories.combat",
      );
      expect(commandCategories.combat.commands.fire_all.name).toBe(
        "first:command_definitions.fire_all.name",
      );

      localizeCommands({ t: (key) => `second:${key}` });
      expect(flattenedCommands).toBe(projection);
      expect(flattenedCommands.fire_all).toBe(flattenedFireAll);
      expect(flattenedFireAll.name).toBe(originalFlattenedName);
      expect(commandCategories.combat.commands.fire_all.name).toBe(
        "second:command_definitions.fire_all.name",
      );
    } finally {
      for (const key of Object.keys(commandCategories)) {
        delete commandCategories[key];
      }
      Object.assign(commandCategories, snapshot);
    }
  });

  it("does not publish the retired static-data compatibility globals", () => {
    expect(Object.hasOwn(window, "STO_DATA")).toBe(false);
    expect(Object.hasOwn(window, "COMMANDS")).toBe(false);
    expect(Object.hasOwn(window, "localizeCommandData")).toBe(false);
  });
});
