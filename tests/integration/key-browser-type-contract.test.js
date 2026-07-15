import { afterEach, describe, expect, it, vi } from "vitest";

import KeyBrowserService from "../../src/js/components/services/KeyBrowserService.js";
import KeyBrowserUI from "../../src/js/components/ui/KeyBrowserUI.js";
import { createServiceFixture } from "../fixtures/index.js";

describe("Key browser type categorization contract", () => {
  let fixture;
  let service;
  let ui;

  afterEach(() => {
    ui?.destroy();
    service?.destroy();
    fixture?.destroy();
    vi.restoreAllMocks();
  });

  it("renders batch categories returned by the real KeyBrowserService", async () => {
    fixture = createServiceFixture();
    service = new KeyBrowserService({
      eventBus: fixture.eventBus,
      i18n: { t: (key) => key },
    });
    service.init();
    ui = new KeyBrowserUI({
      eventBus: fixture.eventBus,
      document,
      i18n: { t: (key) => key },
    });
    ui.init();
    vi.spyOn(ui, "createKeyElement").mockImplementation((key) => {
      const element = document.createElement("button");
      element.dataset.key = key;
      return element;
    });
    const content = document.createElement("div");

    await ui.renderKeyTypeViewForKeys(content, {}, ["F1", "A"], {
      F1: ["FireAll"],
      A: [],
    });

    expect(content.querySelector('[data-key="F1"]')).not.toBeNull();
    expect(content.querySelector('[data-key="A"]')).not.toBeNull();
    expect(content.textContent).toContain("key_type.function_keys");
    expect(content.textContent).toContain("key_type.letters_numbers");
  });
});
