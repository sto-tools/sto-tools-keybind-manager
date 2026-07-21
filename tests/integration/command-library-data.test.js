import { describe, expect, it } from "vitest";
import {
  commandCategories,
  findCommandDefinition,
} from "../../src/js/data/commandCatalog.js";
import { stoData } from "../../src/js/data.js";

describe("Integration: command library data", () => {
  it("resolves Refine Dilithium through the shared module catalog", () => {
    const definition = findCommandDefinition(
      "gensendmessage inventory_root processdilithium",
    );

    expect(stoData.commands).toBe(commandCategories);
    expect(definition).toMatchObject({
      categoryId: "system",
      commandId: "refine_dilithium",
      name: "Refine Dilithium",
      icon: "⛏️",
    });
    expect(window).not.toHaveProperty("STO_DATA");
    expect(window).not.toHaveProperty("COMMANDS");
    expect(window).not.toHaveProperty("localizeCommandData");
  });
});
