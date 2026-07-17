import { describe, it, beforeEach, afterEach, expect } from "vitest";
import { createServiceFixture } from "../../fixtures/index.js";
import CommandLibraryService from "../../../src/js/components/services/CommandLibraryService.js";

describe("CommandLibraryService", () => {
  let fixture, service, eventBusFixture;

  beforeEach(() => {
    fixture = createServiceFixture();
    eventBusFixture = fixture.eventBusFixture;

    // Simple i18n stub that returns the default value
    const i18nStub = { t: (_key, { defaultValue }) => defaultValue };

    service = new CommandLibraryService({
      eventBus: eventBusFixture.eventBus,
      i18n: i18nStub,
    });
  });

  afterEach(() => {
    document.body.replaceChildren();
    fixture.destroy();
  });

  it("should generate unique command IDs", () => {
    const id1 = service.generateCommandId();
    const id2 = service.generateCommandId();
    expect(id1).not.toEqual(id2);
  });

  it("filters catalog commands using the cached environment", () => {
    document.body.innerHTML = `
      <div class="category">
        <div class="command-item" data-command="fire_all"></div>
        <div class="command-item" data-command="aim"></div>
      </div>
    `;
    const fireAll = document.querySelector('[data-command="fire_all"]');
    const aim = document.querySelector('[data-command="aim"]');

    service.cache.currentEnvironment = "space";
    service.filterCommandLibrary();
    expect(fireAll?.style.display).toBe("flex");
    expect(fireAll?.dataset.envHidden).toBe("false");
    expect(aim?.style.display).toBe("none");
    expect(aim?.dataset.envHidden).toBe("true");

    service.cache.currentEnvironment = "ground";
    service.filterCommandLibrary();
    expect(fireAll?.style.display).toBe("none");
    expect(aim?.style.display).toBe("flex");

    service.cache.currentEnvironment = "alias";
    service.filterCommandLibrary();
    expect(fireAll?.style.display).toBe("flex");
    expect(aim?.style.display).toBe("flex");
  });
});
