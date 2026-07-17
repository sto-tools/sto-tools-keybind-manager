import { describe, expect, it } from "vitest";
import de from "../../src/i18n/de.json";
import en from "../../src/i18n/en.json";
import es from "../../src/i18n/es.json";
import fr from "../../src/i18n/fr.json";
import commandCategories from "../../src/js/data/commandCatalog.js";
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
    expect(window.STO_DATA.commands).toBe(commandCategories);
    expect(window.COMMAND_CATEGORIES).toBe(commandCategories);
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

  it("localizes the shared catalog object in place", () => {
    const snapshot = structuredClone(commandCategories);
    const previousI18n = window.i18next;
    window.i18next = /** @type {typeof window.i18next} */ ({
      t: (key) => `localized:${key}`,
    });

    try {
      window.localizeCommandData();
      expect(window.STO_DATA.commands).toBe(commandCategories);
      expect(commandCategories.combat.name).toBe(
        "localized:command_categories.combat",
      );
      expect(commandCategories.combat.commands.fire_all.name).toBe(
        "localized:command_definitions.fire_all.name",
      );
    } finally {
      for (const key of Object.keys(commandCategories)) {
        delete commandCategories[key];
      }
      Object.assign(commandCategories, snapshot);
      window.i18next = previousI18n;
    }
  });
});
