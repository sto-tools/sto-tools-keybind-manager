import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import PreferencesService from "../../../src/js/components/services/PreferencesService.js";
import { createServiceFixture } from "../../fixtures/index.js";

describe("PreferencesService transition activation", () => {
  let fixture;
  let service;
  let i18n;
  let localizeCommands;
  let applyTranslations;

  beforeEach(async () => {
    fixture = createServiceFixture();
    i18n = {
      language: "en",
      changeLanguage: vi.fn(async (language) => {
        i18n.language = language;
      }),
      t: (key) =>
        ({ light_mode: "Light Mode", dark_mode: "Dark Mode" })[key] ?? key,
    };
    localizeCommands = vi.fn();
    applyTranslations = vi.fn();
    service = new PreferencesService({
      storage: fixture.storage,
      eventBus: fixture.eventBus,
      i18n: /** @type {any} */ (i18n),
      localizeCommands,
      applyTranslations,
    });
    service.init();
    await service.initialStateReady;
  });

  afterEach(() => {
    if (service && !service.destroyed) service.destroy();
    fixture.destroy();
    document.body.replaceChildren();
    document.body.classList.remove("compact-view");
    document.documentElement.removeAttribute("data-theme");
    vi.restoreAllMocks();
  });

  function clearTransitionHistory() {
    localizeCommands.mockClear();
    applyTranslations.mockClear();
    i18n.changeLanguage.mockClear();
    fixture.storage.saveSettings.mockClear();
    fixture.eventBusFixture.clearEventHistory();
  }

  it("applies startup language, catalog, translations, theme, and layout exactly once", () => {
    expect(localizeCommands).toHaveBeenCalledOnce();
    expect(applyTranslations).toHaveBeenCalledOnce();
    expect(service.getCurrentState()).toMatchObject({
      ready: true,
      revision: 1,
    });
    expect(
      fixture.eventBusFixture.getEventsOfType("preferences:state-changed"),
    ).toHaveLength(1);
    expect(
      fixture.eventBusFixture.getEventsOfType("preferences:loaded"),
    ).toHaveLength(1);
  });

  it("rejects startup without publishing ready state when language activation fails", async () => {
    service.destroy();
    const failure = new Error("startup language unavailable");
    const failingI18n = {
      language: "en",
      changeLanguage: vi.fn().mockRejectedValue(failure),
      t: (key) => key,
    };
    const startupLocalize = vi.fn();
    const startupTranslations = vi.fn();
    fixture.storage.getSettings.mockReturnValueOnce({ language: "de" });
    fixture.eventBusFixture.clearEventHistory();
    service = new PreferencesService({
      storage: fixture.storage,
      eventBus: fixture.eventBus,
      i18n: /** @type {any} */ (failingI18n),
      localizeCommands: startupLocalize,
      applyTranslations: startupTranslations,
    });

    service.init();

    await expect(service.initialStateReady).rejects.toEqual(
      expect.objectContaining({ errors: [failure] }),
    );
    expect(service.getCurrentState()).toMatchObject({
      ready: false,
      revision: 0,
    });
    expect(startupLocalize).not.toHaveBeenCalled();
    expect(startupTranslations).not.toHaveBeenCalled();
    expect(
      fixture.eventBusFixture.getEventsOfType("preferences:state-changed"),
    ).toHaveLength(0);
    expect(
      fixture.eventBusFixture.getEventsOfType("preferences:loaded"),
    ).toHaveLength(0);
    expect(fixture.eventBus.hasListeners("rpc:preferences:set-setting")).toBe(
      false,
    );
  });

  it("keeps theme presentation compatibility on the extracted effect seam", () => {
    const button = document.createElement("button");
    button.id = "themeToggleBtn";
    const icon = document.createElement("i");
    button.append(icon);
    const text = document.createElement("span");
    text.id = "themeToggleText";
    document.body.append(button, text);

    service.updateThemeToggleButton("dark");
    expect(icon.className).toBe("fas fa-sun");
    expect(text.dataset.i18n).toBe("light_mode");
    expect(text.textContent).toBe("Light Mode");

    service.updateThemeToggleButton("default");
    expect(icon.className).toBe("fas fa-moon");
    expect(text.dataset.i18n).toBe("dark_mode");
    expect(text.textContent).toBe("Dark Mode");
  });

  it("toggles theme without publishing a toast", async () => {
    clearTransitionHistory();
    const before = service.getSetting("theme") || "default";

    await expect(service.toggleTheme()).resolves.toBe(true);

    expect(service.getSetting("theme")).toBe(
      before === "dark" ? "default" : "dark",
    );
    expect(fixture.eventBusFixture.getEventsOfType("toast:show")).toHaveLength(
      0,
    );
  });

  it.each([
    ["single setting", () => service.setSetting("language", "de"), "de"],
    ["bulk replacement", () => service.setSettings({ language: "fr" }), "fr"],
    ["language wrapper", () => service.changeLanguage("es"), "es"],
  ])(
    "publishes one language semantic event for a %s",
    async (_name, mutate, language) => {
      clearTransitionHistory();

      await expect(mutate()).resolves.toBe(true);

      expect(i18n.changeLanguage).toHaveBeenCalledOnce();
      expect(i18n.changeLanguage).toHaveBeenCalledWith(language);
      expect(localizeCommands).toHaveBeenCalledOnce();
      expect(applyTranslations).toHaveBeenCalledOnce();
      expect(
        fixture.eventBusFixture.getEventsOfType("language:changed"),
      ).toEqual([expect.objectContaining({ data: { language } })]);
      const transitionEvents = fixture
        .getEventHistory()
        .map(({ event }) => event)
        .filter((event) =>
          [
            "preferences:state-changed",
            "preferences:saved",
            "preferences:changed",
            "language:changed",
          ].includes(event),
        );
      expect(transitionEvents).toEqual([
        "preferences:state-changed",
        "preferences:saved",
        "preferences:changed",
        "language:changed",
      ]);
    },
  );

  it("does not relocalize or announce an unchanged language", async () => {
    clearTransitionHistory();

    await expect(service.setSetting("language", "en")).resolves.toBe(true);

    expect(i18n.changeLanguage).not.toHaveBeenCalled();
    expect(localizeCommands).not.toHaveBeenCalled();
    expect(
      fixture.eventBusFixture.getEventsOfType("language:changed"),
    ).toHaveLength(0);
  });

  it.each(["false", "throw"])(
    "does not activate or announce language when persistence returns %s",
    async (failureMode) => {
      const before = service.getCurrentState();
      const failure = new Error("settings unavailable");
      if (failureMode === "false") {
        fixture.storage.saveSettings.mockReturnValueOnce(false);
      } else {
        fixture.storage.saveSettings.mockImplementationOnce(() => {
          throw failure;
        });
      }
      clearTransitionHistory();

      const mutation = service.changeLanguage("de");
      if (failureMode === "false") {
        await expect(mutation).resolves.toBe(false);
      } else {
        await expect(mutation).rejects.toBe(failure);
      }

      expect(service.getCurrentState()).toBe(before);
      expect(localizeCommands).not.toHaveBeenCalled();
      expect(
        fixture.eventBusFixture.getEventsOfType("language:changed"),
      ).toHaveLength(0);
    },
  );

  it("materializes the complete next snapshot before persistence", async () => {
    const before = service.getCurrentState();
    delete service.defaultSettings.language;
    clearTransitionHistory();

    await expect(service.setSettings({ autoSave: false })).rejects.toThrow(
      "Invalid preferences state snapshot",
    );

    expect(fixture.storage.saveSettings).not.toHaveBeenCalled();
    expect(service.getCurrentState()).toBe(before);
    expect(service.getSettings()).toEqual(before.settings);
    expect(
      fixture.eventBusFixture.getEventsOfType("preferences:state-changed"),
    ).toHaveLength(0);
  });

  it("publishes durable success and every receipt after activation degradation", async () => {
    const localizeFailure = new Error("catalog activation failed");
    const translationFailure = new Error("DOM activation failed");
    localizeCommands.mockImplementationOnce(() => {
      throw localizeFailure;
    });
    applyTranslations.mockImplementationOnce(() => {
      throw translationFailure;
    });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    clearTransitionHistory();

    await expect(
      service.setSettings({
        language: "de",
        theme: "dark",
        compactView: true,
      }),
    ).resolves.toBe(true);

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.body.classList).toContain("compact-view");
    expect(service.getCurrentState()).toMatchObject({
      revision: 2,
      settings: { language: "de", theme: "dark", compactView: true },
    });
    expect(error).toHaveBeenCalledWith(
      "[PreferencesService] Durable settings accepted with activation degradation",
      expect.objectContaining({
        errors: [localizeFailure, translationFailure],
      }),
    );
    for (const event of [
      "preferences:state-changed",
      "preferences:saved",
      "preferences:changed",
    ]) {
      expect(
        fixture.eventBusFixture.getEventsOfType(event),
        event,
      ).toHaveLength(1);
    }
    expect(
      fixture.eventBusFixture.getEventsOfType("language:changed"),
    ).toHaveLength(0);
    expect(service._languageActivationDirty).toBe(true);

    clearTransitionHistory();
    await expect(service.setSetting("theme", "default")).resolves.toBe(true);
    expect(localizeCommands).toHaveBeenCalledOnce();
    expect(applyTranslations).toHaveBeenCalledOnce();
    expect(fixture.eventBusFixture.getEventsOfType("language:changed")).toEqual(
      [expect.objectContaining({ data: { language: "de" } })],
    );
    expect(service._languageActivationDirty).toBe(false);
  });

  it("fails synchronous effect re-entry without hanging or rejecting durable success", async () => {
    clearTransitionHistory();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    service.applyTranslations = () => {
      void service.setSetting("autoSave", false);
    };

    await expect(service.setSetting("theme", "dark")).resolves.toBe(true);

    expect(service.getSetting("theme")).toBe("dark");
    expect(service.getSetting("autoSave")).toBe(true);
    expect(service.getCurrentState().revision).toBe(2);
    expect(error).toHaveBeenCalledWith(
      "[PreferencesService] Durable settings accepted with activation degradation",
      expect.objectContaining({
        errors: [
          expect.objectContaining({
            message: "preferences_effect_in_progress",
          }),
        ],
      }),
    );
  });

  it("recovers the complete language group after i18n activation fails", async () => {
    const languageFailure = new Error("language backend unavailable");
    i18n.changeLanguage.mockRejectedValueOnce(languageFailure);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    clearTransitionHistory();

    await expect(
      service.setSettings({
        language: "de",
        theme: "default",
        compactView: true,
      }),
    ).resolves.toBe(true);

    expect(i18n.language).toBe("en");
    expect(localizeCommands).not.toHaveBeenCalled();
    expect(applyTranslations).not.toHaveBeenCalled();
    expect(document.documentElement.getAttribute("data-theme")).toBeNull();
    expect(document.body.classList).toContain("compact-view");
    expect(service.getSetting("language")).toBe("de");
    expect(service._languageActivationDirty).toBe(true);
    expect(
      fixture.eventBusFixture.getEventsOfType("language:changed"),
    ).toHaveLength(0);
    expect(error).toHaveBeenCalledWith(
      "[PreferencesService] Durable settings accepted with activation degradation",
      expect.objectContaining({
        languageActivationFailed: true,
        errors: [languageFailure],
      }),
    );

    clearTransitionHistory();
    await expect(service.setSetting("showTooltips", false)).resolves.toBe(true);

    expect(i18n.language).toBe("de");
    expect(localizeCommands).toHaveBeenCalledOnce();
    expect(applyTranslations).toHaveBeenCalledOnce();
    expect(service._languageActivationDirty).toBe(false);
    expect(fixture.eventBusFixture.getEventsOfType("language:changed")).toEqual(
      [expect.objectContaining({ data: { language: "de" } })],
    );
    expect(
      fixture
        .getEventHistory()
        .map(({ event }) => event)
        .filter((event) =>
          [
            "preferences:state-changed",
            "preferences:saved",
            "preferences:changed",
            "language:changed",
          ].includes(event),
        ),
    ).toEqual([
      "preferences:state-changed",
      "preferences:saved",
      "preferences:changed",
      "language:changed",
    ]);
  });

  it("queues ordinary overlap while an asynchronous language effect is pending", async () => {
    let releaseLanguage = () => {};
    const languagePending = new Promise((resolve) => {
      releaseLanguage = resolve;
    });
    i18n.changeLanguage.mockImplementationOnce(async (language) => {
      await languagePending;
      i18n.language = language;
    });
    clearTransitionHistory();

    const languageMutation = service.setSetting("language", "de");
    await vi.waitFor(() => expect(i18n.changeLanguage).toHaveBeenCalledOnce());
    const themeMutation = service.setSetting("theme", "dark");
    expect(fixture.storage.saveSettings).toHaveBeenCalledOnce();

    releaseLanguage();
    await expect(languageMutation).resolves.toBe(true);
    await expect(themeMutation).resolves.toBe(true);

    expect(fixture.storage.saveSettings).toHaveBeenCalledTimes(2);
    expect(service.getCurrentState()).toMatchObject({
      revision: 3,
      settings: { language: "de", theme: "dark" },
    });
    expect(
      fixture.eventBusFixture
        .getEventsOfType("preferences:state-changed")
        .map(({ data }) => data.state.revision),
    ).toEqual([2, 3]);
  });

  it("does not persist or adopt bulk state when activation planning throws", async () => {
    const before = service.getCurrentState();
    Object.defineProperty(i18n, "language", {
      configurable: true,
      get() {
        throw new Error("language capability unavailable");
      },
    });
    fixture.storage.saveSettings.mockClear();
    fixture.eventBusFixture.clearEventHistory();

    await expect(service.setSettings({ theme: "default" })).rejects.toThrow(
      "language capability unavailable",
    );

    expect(fixture.storage.saveSettings).not.toHaveBeenCalled();
    expect(service.getCurrentState()).toBe(before);
    expect(
      fixture.eventBusFixture.getEventsOfType("preferences:state-changed"),
    ).toHaveLength(0);
  });
});
