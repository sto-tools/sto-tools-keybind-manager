import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import PreferencesService from "../../../src/js/components/services/PreferencesService.js";
import { createServiceFixture } from "../../fixtures/index.js";

describe("PreferencesService persisted settings activation", () => {
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
      t: (key) => key,
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
    clearHistory();
  });

  afterEach(() => {
    if (service && !service.destroyed) service.destroy();
    fixture.destroy();
    document.body.replaceChildren();
    document.body.classList.remove("compact-view");
    document.documentElement.removeAttribute("data-theme");
    vi.restoreAllMocks();
  });

  function clearHistory() {
    fixture.storage.getSettings.mockClear();
    fixture.storage.saveSettings.mockClear();
    fixture.storage.clearSettings.mockClear();
    fixture.eventBusFixture.clearEventHistory();
    i18n.changeLanguage.mockClear();
    localizeCommands.mockClear();
    applyTranslations.mockClear();
  }

  /** @param {unknown} payload */
  function activate(payload) {
    return fixture.eventBus.request(
      "preferences:activate-persisted-settings",
      payload,
    );
  }

  it("activates changed project settings without rewriting or save/load receipts", async () => {
    const extension = { nested: ["alpha"] };
    const persisted = {
      ...service.getSettings(),
      theme: "default",
      language: "de",
      compactView: true,
      extension,
    };
    fixture.storage.getSettings.mockReturnValueOnce(persisted);

    await expect(activate({ source: "project-restore" })).resolves.toEqual({
      success: true,
      changed: true,
      revision: 2,
      effects: "applied",
    });

    expect(fixture.storage.getSettings).toHaveBeenCalledOnce();
    expect(fixture.storage.clearSettings).not.toHaveBeenCalled();
    expect(fixture.storage.saveSettings).not.toHaveBeenCalled();
    const state = service.getCurrentState();
    expect(state).toMatchObject({
      ready: true,
      revision: 2,
      settings: {
        theme: "default",
        language: "de",
        compactView: true,
        extension: { nested: ["alpha"] },
      },
    });
    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(state.settings)).toBe(true);
    expect(Object.isFrozen(state.settings.extension)).toBe(true);
    expect(Object.isFrozen(state.settings.extension.nested)).toBe(true);

    extension.nested.push("mutated");
    persisted.language = "fr";
    expect(service.getCurrentState().settings).toMatchObject({
      language: "de",
      extension: { nested: ["alpha"] },
    });

    expect(
      fixture.eventBusFixture.getEventsOfType("preferences:state-changed"),
    ).toEqual([
      expect.objectContaining({
        data: expect.objectContaining({
          reason: "project-settings-activated",
          state,
        }),
      }),
    ]);
    expect(
      fixture.eventBusFixture.getEventsOfType("preferences:changed"),
    ).toEqual([
      expect.objectContaining({
        data: {
          changes: {
            theme: "default",
            compactView: true,
            language: "de",
            extension: { nested: ["alpha"] },
          },
          settings: expect.objectContaining({ language: "de" }),
        },
      }),
    ]);
    expect(fixture.eventBusFixture.getEventsOfType("language:changed")).toEqual(
      [expect.objectContaining({ data: { language: "de" } })],
    );
    expect(
      fixture.eventBusFixture.getEventsOfType("preferences:saved"),
    ).toHaveLength(0);
    expect(
      fixture.eventBusFixture.getEventsOfType("preferences:loaded"),
    ).toHaveLength(0);
    expect(
      fixture
        .getEventHistory()
        .map(({ event }) => event)
        .filter((event) =>
          [
            "preferences:state-changed",
            "preferences:changed",
            "language:changed",
          ].includes(event),
        ),
    ).toEqual([
      "preferences:state-changed",
      "preferences:changed",
      "language:changed",
    ]);
  });

  it("clears and adopts reset defaults inside the owner queue", async () => {
    const defaults = structuredClone(service.defaultSettings);
    fixture.storage.getSettings.mockReturnValueOnce(defaults);

    await expect(activate({ source: "application-reset" })).resolves.toEqual({
      success: true,
      changed: true,
      revision: 2,
      effects: "applied",
    });

    expect(fixture.storage.clearSettings).toHaveBeenCalledOnce();
    expect(fixture.storage.getSettings).toHaveBeenCalledOnce();
    expect(fixture.storage.saveSettings).not.toHaveBeenCalled();
    expect(service.getCurrentState()).toMatchObject({
      ready: true,
      revision: 2,
      settings: defaults,
    });
    expect(
      fixture.eventBusFixture.getEventsOfType("preferences:state-changed"),
    ).toEqual([
      expect.objectContaining({
        data: expect.objectContaining({ reason: "settings-reset" }),
      }),
    ]);
    expect(
      fixture.eventBusFixture.getEventsOfType("preferences:saved"),
    ).toHaveLength(0);
    expect(
      fixture.eventBusFixture.getEventsOfType("preferences:loaded"),
    ).toHaveLength(0);
  });

  it("publishes a fresh revision but no diff for unchanged durable settings", async () => {
    fixture.storage.getSettings.mockReturnValueOnce(service.getSettings());

    await expect(activate({ source: "project-restore" })).resolves.toEqual({
      success: true,
      changed: false,
      revision: 2,
      effects: "applied",
    });

    expect(service.getCurrentState().revision).toBe(2);
    expect(
      fixture.eventBusFixture.getEventsOfType("preferences:state-changed"),
    ).toEqual([
      expect.objectContaining({
        data: expect.objectContaining({
          reason: "project-settings-activated",
        }),
      }),
    ]);
    expect(
      fixture.eventBusFixture.getEventsOfType("preferences:changed"),
    ).toHaveLength(0);
    expect(
      fixture.eventBusFixture.getEventsOfType("language:changed"),
    ).toHaveLength(0);
    expect(fixture.storage.saveSettings).not.toHaveBeenCalled();
  });

  it("treats freshly decoded nested extension data as structurally unchanged", async () => {
    await service.setExtensionSetting("plugin:layout", {
      density: "compact",
      rows: [{ id: "primary", enabled: true }],
      options: { alpha: 1, beta: 2 },
    });
    clearHistory();
    fixture.storage.getSettings.mockReturnValueOnce({
      ...service.getSettings(),
      "plugin:layout": {
        options: { beta: 2, alpha: 1 },
        rows: [{ enabled: true, id: "primary" }],
        density: "compact",
      },
    });

    await expect(activate({ source: "project-restore" })).resolves.toEqual({
      success: true,
      changed: false,
      revision: 3,
      effects: "applied",
    });

    expect(
      fixture.eventBusFixture.getEventsOfType("preferences:state-changed"),
    ).toEqual([
      expect.objectContaining({
        data: expect.objectContaining({
          reason: "project-settings-activated",
          state: expect.objectContaining({ revision: 3 }),
        }),
      }),
    ]);
    expect(
      fixture.eventBusFixture.getEventsOfType("preferences:changed"),
    ).toHaveLength(0);
    expect(fixture.storage.saveSettings).not.toHaveBeenCalled();
  });

  it.each([
    null,
    [],
    {},
    { source: "restore" },
    { source: "project-restore", extra: true },
    Object.create({ source: "project-restore" }),
  ])(
    "rejects invalid action payload %# without reading or publishing",
    async (payload) => {
      const before = service.getCurrentState();

      await expect(activate(payload)).resolves.toEqual({
        success: false,
        error: "preferences_activation_failed",
        params: { reason: "invalid_preferences_activation_request" },
        retryable: true,
      });

      expect(fixture.storage.getSettings).not.toHaveBeenCalled();
      expect(fixture.storage.saveSettings).not.toHaveBeenCalled();
      expect(service.getCurrentState()).toBe(before);
      expect(
        fixture.eventBusFixture.getEventsOfType("preferences:state-changed"),
      ).toHaveLength(0);
    },
  );

  it("does not invoke request accessors or leak proxy reflection failures", async () => {
    const sourceGetter = vi.fn(() => {
      throw new Error("source getter must not run");
    });
    const accessorPayload = {};
    Object.defineProperty(accessorPayload, "source", {
      enumerable: true,
      get: sourceGetter,
    });
    const hostilePayload = new Proxy(
      { source: "project-restore" },
      {
        ownKeys() {
          throw new Error("ownKeys trap");
        },
      },
    );

    for (const payload of [accessorPayload, hostilePayload]) {
      await expect(activate(payload)).resolves.toMatchObject({
        success: false,
        error: "preferences_activation_failed",
        retryable: true,
      });
    }
    expect(sourceGetter).not.toHaveBeenCalled();
    expect(fixture.storage.getSettings).not.toHaveBeenCalled();
  });

  it("returns a retryable read failure without changing canonical state", async () => {
    const before = service.getCurrentState();
    fixture.storage.getSettings.mockImplementationOnce(() => {
      throw new Error("standalone settings unavailable");
    });

    await expect(activate({ source: "application-reset" })).resolves.toEqual({
      success: false,
      error: "preferences_activation_failed",
      params: { reason: "standalone settings unavailable" },
      retryable: true,
    });

    expect(service.getCurrentState()).toBe(before);
    expect(fixture.storage.saveSettings).not.toHaveBeenCalled();
    expect(
      fixture.eventBusFixture.getEventsOfType("preferences:state-changed"),
    ).toHaveLength(0);
  });

  it("returns a retryable reset-clear failure without reading or publishing", async () => {
    const before = service.getCurrentState();
    fixture.storage.clearSettings.mockReturnValueOnce(false);

    await expect(activate({ source: "application-reset" })).resolves.toEqual({
      success: false,
      error: "preferences_activation_failed",
      params: { reason: "preferences_settings_clear_failed" },
      retryable: true,
    });

    expect(fixture.storage.clearSettings).toHaveBeenCalledOnce();
    expect(fixture.storage.getSettings).not.toHaveBeenCalled();
    expect(fixture.storage.saveSettings).not.toHaveBeenCalled();
    expect(service.getCurrentState()).toBe(before);
    expect(
      fixture.eventBusFixture.getEventsOfType("preferences:state-changed"),
    ).toHaveLength(0);
    expect(
      fixture.eventBusFixture.getEventsOfType("preferences:changed"),
    ).toHaveLength(0);
  });

  it("acknowledges degradation and retries the dirty language group", async () => {
    const failure = new Error("catalog activation failed");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const persisted = { ...service.getSettings(), language: "de" };
    fixture.storage.getSettings.mockReturnValue(persisted);
    localizeCommands.mockImplementationOnce(() => {
      throw failure;
    });

    await expect(activate({ source: "project-restore" })).resolves.toEqual({
      success: true,
      changed: true,
      revision: 2,
      effects: "degraded",
    });
    expect(service._languageActivationDirty).toBe(true);
    expect(
      fixture.eventBusFixture.getEventsOfType("language:changed"),
    ).toHaveLength(0);
    expect(error).toHaveBeenCalledWith(
      "[PreferencesService] Durable settings accepted with activation degradation",
      expect.objectContaining({ errors: [failure] }),
    );

    fixture.eventBusFixture.clearEventHistory();
    localizeCommands.mockClear();
    applyTranslations.mockClear();
    i18n.changeLanguage.mockClear();
    await expect(activate({ source: "project-restore" })).resolves.toEqual({
      success: true,
      changed: false,
      revision: 3,
      effects: "applied",
    });

    expect(localizeCommands).toHaveBeenCalledOnce();
    expect(applyTranslations).toHaveBeenCalledOnce();
    expect(service._languageActivationDirty).toBe(false);
    expect(fixture.eventBusFixture.getEventsOfType("language:changed")).toEqual(
      [expect.objectContaining({ data: { language: "de" } })],
    );
    expect(
      fixture.eventBusFixture.getEventsOfType("preferences:changed"),
    ).toHaveLength(0);
    expect(fixture.storage.saveSettings).not.toHaveBeenCalled();
  });

  it("performs its durable read only after an overlapping mutation settles", async () => {
    let releaseLanguage = () => {};
    const languagePending = new Promise((resolve) => {
      releaseLanguage = resolve;
    });
    i18n.changeLanguage.mockImplementationOnce(async (language) => {
      await languagePending;
      i18n.language = language;
    });

    const mutation = service.setSetting("language", "de");
    await vi.waitFor(() => expect(i18n.changeLanguage).toHaveBeenCalledOnce());
    fixture.storage.getSettings.mockReturnValueOnce({
      ...service.getSettings(),
      language: "fr",
    });
    const activation = activate({ source: "project-restore" });
    expect(fixture.storage.getSettings).not.toHaveBeenCalled();

    releaseLanguage();
    await expect(mutation).resolves.toBe(true);
    await expect(activation).resolves.toEqual({
      success: true,
      changed: true,
      revision: 3,
      effects: "applied",
    });

    expect(fixture.storage.getSettings).toHaveBeenCalledOnce();
    expect(fixture.storage.saveSettings).toHaveBeenCalledOnce();
    expect(service.getCurrentState()).toMatchObject({
      revision: 3,
      settings: { language: "fr" },
    });
  });

  it("returns operation_cancelled and publishes nothing after destruction", async () => {
    let releaseLanguage = () => {};
    const languagePending = new Promise((resolve) => {
      releaseLanguage = resolve;
    });
    i18n.changeLanguage.mockImplementationOnce(async (language) => {
      await languagePending;
      i18n.language = language;
    });
    fixture.storage.getSettings.mockReturnValueOnce({
      ...service.getSettings(),
      language: "de",
    });

    const activation = activate({ source: "application-reset" });
    await vi.waitFor(() => expect(i18n.changeLanguage).toHaveBeenCalledOnce());
    service.destroy();
    releaseLanguage();

    await expect(activation).resolves.toEqual({
      success: false,
      error: "operation_cancelled",
      params: { reason: "operation_cancelled" },
      retryable: true,
    });
    expect(
      fixture.eventBusFixture.getEventsOfType("preferences:state-changed"),
    ).toHaveLength(0);
    expect(
      fixture.eventBusFixture.getEventsOfType("preferences:changed"),
    ).toHaveLength(0);
    expect(
      fixture.eventBusFixture.getEventsOfType("language:changed"),
    ).toHaveLength(0);
    expect(fixture.storage.saveSettings).not.toHaveBeenCalled();
  });

  it("closes synchronous effect re-entry as a typed failure", async () => {
    /** @type {Promise<unknown> | undefined} */
    let nested;
    service.applyTranslations = () => {
      nested = service.activatePersistedSettings("project-restore");
    };
    fixture.storage.getSettings.mockReturnValueOnce(service.getSettings());

    await expect(activate({ source: "project-restore" })).resolves.toEqual({
      success: true,
      changed: false,
      revision: 2,
      effects: "applied",
    });
    await expect(nested).resolves.toEqual({
      success: false,
      error: "preferences_activation_failed",
      params: { reason: "preferences_effect_in_progress" },
      retryable: true,
    });

    expect(fixture.storage.getSettings).toHaveBeenCalledOnce();
    expect(service.getCurrentState().revision).toBe(2);
  });
});
