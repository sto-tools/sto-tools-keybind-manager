import { describe, expect, it } from "vitest";
import {
  commandCategories,
  findCommandDefinition,
} from "../../src/js/data/commandCatalog.js";
import "../../src/js/data.js";

describe("Integration: command library data", () => {
  it("resolves Refine Dilithium through the shared global catalog", () => {
    const definition = findCommandDefinition(
      "gensendmessage inventory_root processdilithium",
    );

    expect(window.STO_DATA.commands).toBe(commandCategories);
    expect(definition).toMatchObject({
      categoryId: "system",
      commandId: "refine_dilithium",
      name: "Refine Dilithium",
      icon: "⛏️",
    });
  });
});
