import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import PreferencesService from "../../../src/js/components/services/PreferencesService.js";
import { createServiceFixture } from "../../fixtures/index.js";

const ownedTopics = [
  "rpc:preferences:activate-persisted-settings",
  "rpc:preferences:persist-sync-folder-settings",
  "rpc:preferences:save-settings",
  "rpc:preferences:set-setting",
  "rpc:preferences:set-settings",
  "theme:toggle",
  "language:change",
  "preferences:state-changed",
];

function expectOwnedListenerCount(eventBus, expected) {
  for (const topic of ownedTopics) {
    expect(eventBus.getListenerCount(topic), topic).toBe(expected);
  }
}

describe("PreferencesService lifecycle ownership", () => {
  let fixture;
  let services;

  beforeEach(() => {
    fixture = createServiceFixture();
    services = [];
  });

  afterEach(() => {
    for (const service of services.reverse()) {
      if (!service.destroyed) service.destroy();
    }
    fixture.destroy();
    vi.restoreAllMocks();
  });

  function createService() {
    const service = new PreferencesService({
      storage: fixture.storage,
      eventBus: fixture.eventBus,
    });
    services.push(service);
    return service;
  }

  it("does not expose commands before initialization", () => {
    createService();

    expectOwnedListenerCount(fixture.eventBus, 0);
  });

  it("owns each command exactly once across destroy and reinitialization", async () => {
    const service = createService();

    service.init();
    await service.initialStateReady;
    const firstEpoch = service.getCurrentState().authorityEpoch;
    expectOwnedListenerCount(fixture.eventBus, 1);

    service.destroy();
    expectOwnedListenerCount(fixture.eventBus, 0);

    service.init();
    await service.initialStateReady;
    expect(service.getCurrentState().authorityEpoch).toBeGreaterThan(
      firstEpoch,
    );
    expectOwnedListenerCount(fixture.eventBus, 1);

    service.destroy();
    expectOwnedListenerCount(fixture.eventBus, 0);
  });

  it("transfers command ownership to a replacement service", async () => {
    const predecessor = createService();
    predecessor.init();
    await predecessor.initialStateReady;
    predecessor.destroy();

    const predecessorSetSetting = vi.spyOn(predecessor, "setSetting");
    const replacement = createService();
    const replacementSetSetting = vi.spyOn(replacement, "setSetting");
    replacement.init();
    await replacement.initialStateReady;

    expectOwnedListenerCount(fixture.eventBus, 1);
    await expect(
      fixture.eventBus.request("preferences:set-setting", {
        key: "autoSave",
        value: false,
      }),
    ).resolves.toBe(true);
    expect(predecessorSetSetting).not.toHaveBeenCalled();
    expect(replacementSetSetting).toHaveBeenCalledOnce();
  });

  it("applies compact view without consulting an ambient app facade", async () => {
    const service = createService();
    service.init();
    await service.initialStateReady;
    const previousDescriptor = Object.getOwnPropertyDescriptor(window, "app");
    Object.defineProperty(window, "app", {
      configurable: true,
      get() {
        throw new Error("ambient app facade must not be read");
      },
    });

    try {
      service.settings.compactView = true;
      expect(() => service.applyOtherSettings()).not.toThrow();
      expect(document.body.classList).toContain("compact-view");

      service.settings.compactView = false;
      service.applyOtherSettings();
      expect(document.body.classList).not.toContain("compact-view");
    } finally {
      if (previousDescriptor) {
        Object.defineProperty(window, "app", previousDescriptor);
      } else {
        delete window.app;
      }
      document.body.classList.remove("compact-view");
    }
  });

  it("contains a theme-toggle persistence exception without changing owner state", async () => {
    const service = createService();
    service.init();
    await service.initialStateReady;
    const before = service.getCurrentState();
    const applySettings = vi.spyOn(service, "applySettings");
    const failure = new Error("settings unavailable");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    fixture.storage.saveSettings.mockImplementationOnce(() => {
      throw failure;
    });
    fixture.eventBusFixture.clearEventHistory();

    fixture.eventBus.emit("theme:toggle");
    await vi.waitFor(() => expect(error).toHaveBeenCalled());

    expect(error).toHaveBeenCalledWith(
      "[PreferencesService] Failed to toggle theme",
      failure,
    );
    expect(service.getCurrentState()).toEqual(before);
    expect(applySettings).not.toHaveBeenCalled();
    expect(
      fixture.eventBusFixture.getEventsOfType("preferences:saved"),
    ).toHaveLength(0);
    expect(
      fixture.eventBusFixture.getEventsOfType("preferences:changed"),
    ).toHaveLength(0);
  });

  it("lets a replacement wait out stale predecessor effects and publish the winning language", async () => {
    let releasePredecessor = () => {};
    const predecessorLanguage = new Promise((resolve) => {
      releasePredecessor = resolve;
    });
    const i18n = {
      language: "en",
      t: (key) => key,
      changeLanguage: vi.fn(async (language) => {
        if (language === "de") await predecessorLanguage;
        i18n.language = language;
      }),
    };
    fixture.storage.getSettings
      .mockReturnValueOnce({ language: "de" })
      .mockReturnValueOnce({ language: "fr" });
    const predecessorLocalize = vi.fn();
    const predecessorTranslations = vi.fn();
    const predecessor = new PreferencesService({
      storage: fixture.storage,
      eventBus: fixture.eventBus,
      i18n,
      localizeCommands: predecessorLocalize,
      applyTranslations: predecessorTranslations,
    });
    services.push(predecessor);
    predecessor.init();
    const predecessorReady = predecessor.initialStateReady;
    await vi.waitFor(() => {
      expect(i18n.changeLanguage).toHaveBeenCalledWith("de");
    });

    predecessor.destroy();
    const replacementLocalize = vi.fn();
    const replacementTranslations = vi.fn();
    const replacement = new PreferencesService({
      storage: fixture.storage,
      eventBus: fixture.eventBus,
      i18n,
      localizeCommands: replacementLocalize,
      applyTranslations: replacementTranslations,
    });
    services.push(replacement);
    replacement.init();
    let replacementSettled = false;
    void replacement.initialStateReady.then(() => {
      replacementSettled = true;
    });

    await expect(predecessorReady).rejects.toThrow("operation_cancelled");
    expect(replacementSettled).toBe(false);
    releasePredecessor();
    await expect(replacement.initialStateReady).resolves.toMatchObject({
      ready: true,
      revision: 1,
      settings: { language: "fr" },
    });

    expect(predecessorLocalize).not.toHaveBeenCalled();
    expect(predecessorTranslations).not.toHaveBeenCalled();
    expect(replacementLocalize).toHaveBeenCalledOnce();
    expect(replacementTranslations).toHaveBeenCalledOnce();
    expect(i18n.language).toBe("fr");
  });

  it("cancels queued predecessor mutations across immediate destroy and reinit", async () => {
    let releaseApplication = () => {};
    const application = new Promise((resolve) => {
      releaseApplication = resolve;
    });
    let blockLanguage = false;
    const i18n = {
      language: "en",
      t: (key) => key,
      changeLanguage: vi.fn(async (language) => {
        if (blockLanguage) await application;
        i18n.language = language;
      }),
    };
    const service = new PreferencesService({
      storage: fixture.storage,
      eventBus: fixture.eventBus,
      i18n,
      applyTranslations: vi.fn(),
      localizeCommands: vi.fn(),
    });
    services.push(service);
    service.init();
    await service.initialStateReady;
    i18n.language = "de";
    blockLanguage = true;
    fixture.storage.saveSettings.mockClear();
    fixture.eventBusFixture.clearEventHistory();

    const first = service.setSetting("theme", "dark");
    await vi.waitFor(() => {
      expect(fixture.storage.saveSettings).toHaveBeenCalledOnce();
    });
    const queued = service.setSetting("autoSave", false);
    service.destroy();
    service.init();
    const replacementReady = service.initialStateReady;

    releaseApplication();
    await expect(first).rejects.toThrow("operation_cancelled");
    await expect(queued).rejects.toThrow("operation_cancelled");
    await expect(replacementReady).resolves.toMatchObject({ ready: true });
    expect(fixture.storage.saveSettings).toHaveBeenCalledOnce();
    expect(
      fixture.eventBusFixture
        .getEventsOfType("preferences:state-changed")
        .filter(({ data }) => data.reason !== "startup-loaded"),
    ).toHaveLength(0);
  });
});
