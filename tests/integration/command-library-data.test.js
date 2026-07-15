import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createServiceFixture } from "../fixtures/index.js";
import CommandLibraryService from "../../src/js/components/services/CommandLibraryService.js";
import DataService from "../../src/js/components/services/DataService.js";
import "../../src/js/data.js";

describe("Integration: command library data services", () => {
  let fixture;
  let commandLibraryService;
  let dataService;

  beforeEach(async () => {
    fixture = createServiceFixture();
    dataService = new DataService({
      eventBus: fixture.eventBus,
      data: window.STO_DATA,
    });
    commandLibraryService = new CommandLibraryService({
      eventBus: fixture.eventBus,
      i18n: {
        t: (key, { defaultValue } = {}) => defaultValue ?? key,
      },
    });

    await dataService.init();
    await commandLibraryService.init();
  });

  afterEach(() => {
    commandLibraryService.destroy();
    dataService.destroy();
    fixture.destroy();
  });

  it("resolves Refine Dilithium through the command-library service", async () => {
    const definition = await commandLibraryService.findCommandDefinition(
      "gensendmessage inventory_root processdilithium",
    );

    expect(definition).toMatchObject({
      categoryId: "system",
      commandId: "refine_dilithium",
      name: "Refine Dilithium",
      icon: "⛏️",
    });
  });
});
