import { afterEach, describe, expect, it, vi } from "vitest";

import KeyBrowserService from "../../src/js/components/services/KeyBrowserService.js";
import KeyBrowserUI from "../../src/js/components/ui/KeyBrowserUI.js";
import { createDataCoordinatorState } from "../fixtures/core/componentState.js";
import { createServiceFixture } from "../fixtures/index.js";

describe("Key browser type categorization contract", () => {
  let fixture;
  let service;
  let ui;

  afterEach(() => {
    ui?.destroy();
    service?.destroy();
    fixture?.destroy();
    localStorage.removeItem("keyViewMode");
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("renders batch categories returned by the real KeyBrowserService", async () => {
    document.body.innerHTML = `
      <div class="key-selector-container">
        <button id="toggleKeyViewBtn"><i></i></button>
        <div id="keyGrid"></div>
      </div>
    `;
    fixture = createServiceFixture();
    localStorage.setItem("keyViewMode", "key-types");
    service = new KeyBrowserService({
      eventBus: fixture.eventBus,
      i18n: { t: (key) => key },
      localStorage,
    });
    service.init();
    ui = new KeyBrowserUI({
      eventBus: fixture.eventBus,
      document,
      i18n: { t: (key) => key },
    });
    const profile = {
      id: "captain",
      name: "Captain",
      builds: {
        space: { keys: { F1: ["FireAll"], A: [] } },
        ground: { keys: {} },
      },
      bindsets: {},
      aliases: {},
    };
    ui._cacheDataState(
      createDataCoordinatorState({
        currentProfile: profile.id,
        currentProfileData: profile,
        profiles: { [profile.id]: profile },
      }),
    );
    ui.init();

    await vi.waitFor(() => {
      expect(document.querySelector('[data-key="F1"]')).not.toBeNull();
      expect(document.querySelector('[data-key="A"]')).not.toBeNull();
    });

    expect(document.getElementById("keyGrid")?.textContent).toContain(
      "key_type.function_keys",
    );
    expect(document.getElementById("keyGrid")?.textContent).toContain(
      "key_type.letters_numbers",
    );
  });
});
