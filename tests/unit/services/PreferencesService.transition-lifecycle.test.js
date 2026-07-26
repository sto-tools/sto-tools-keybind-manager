import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import PreferencesService from "../../../src/js/components/services/PreferencesService.js";
import { createServiceFixture } from "../../fixtures/index.js";

describe("PreferencesService transition lifecycle boundaries", () => {
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
    fixture.storage.getSettings.mockClear();
    fixture.storage.saveSettings.mockClear();
    fixture.storage.clearSettings.mockClear();
    fixture.eventBusFixture.clearEventHistory();
  }

  async function replaceOwnerDuring(topic, mutate) {
    let successorReady;
    let replaced = false;
    const detach = fixture.eventBus.on(topic, () => {
      if (replaced) return;
      replaced = true;
      service.destroy();
      service.init();
      successorReady = service.initialStateReady;
    });
    try {
      await expect(mutate()).rejects.toThrow("operation_cancelled");
      expect(successorReady).toBeDefined();
      await expect(successorReady).resolves.toMatchObject({
        ready: true,
        revision: 1,
      });
    } finally {
      detach();
    }
  }

  it("rejects predecessor readiness when canonical startup publication replaces the owner", async () => {
    service.destroy();
    clearTransitionHistory();
    let successorReady;
    let replaced = false;
    const detach = fixture.eventBus.on(
      "preferences:state-changed",
      ({ reason }) => {
        if (replaced || reason !== "startup-loaded") return;
        replaced = true;
        service.destroy();
        service.init();
        successorReady = service.initialStateReady;
      },
    );

    service.init();
    const predecessorReady = service.initialStateReady;
    await expect(predecessorReady).rejects.toThrow("operation_cancelled");
    expect(successorReady).toBeDefined();
    await expect(successorReady).resolves.toMatchObject({
      ready: true,
      revision: 1,
    });
    detach();

    expect(
      fixture.eventBusFixture.getEventsOfType("preferences:state-changed"),
    ).toHaveLength(2);
    expect(
      fixture.eventBusFixture.getEventsOfType("preferences:loaded"),
    ).toHaveLength(1);
  });

  it("stops a durable transition after canonical publication replaces the owner", async () => {
    clearTransitionHistory();

    await replaceOwnerDuring("preferences:state-changed", () =>
      service.setSetting("theme", "dark"),
    );

    expect(
      fixture.eventBusFixture.getEventsOfType("preferences:saved"),
    ).toHaveLength(0);
    expect(
      fixture.eventBusFixture.getEventsOfType("preferences:changed"),
    ).toHaveLength(0);
    expect(service.getCurrentState()).toMatchObject({
      revision: 1,
      settings: { theme: "dark" },
    });
  });

  it("stops semantic publication after a saved listener replaces the owner", async () => {
    clearTransitionHistory();

    await replaceOwnerDuring("preferences:saved", () =>
      service.setSetting("theme", "dark"),
    );

    expect(
      fixture.eventBusFixture.getEventsOfType("preferences:saved"),
    ).toHaveLength(1);
    expect(
      fixture.eventBusFixture.getEventsOfType("preferences:changed"),
    ).toHaveLength(0);
  });

  it("stops sync-folder compatibility publication after canonical replacement", async () => {
    clearTransitionHistory();

    await replaceOwnerDuring("preferences:state-changed", () =>
      service.persistSyncFolderSettings({
        syncFolderName: "Fleet Builds",
        syncFolderPath: "Selected folder: Fleet Builds",
        syncFolderFallback: false,
        autoSync: true,
      }),
    );

    expect(
      fixture.eventBusFixture.getEventsOfType("preferences:loaded"),
    ).toHaveLength(1);
    expect(service.getCurrentState()).toMatchObject({
      revision: 1,
      settings: { syncFolderName: "Fleet Builds", autoSync: true },
    });
  });

  it("suppresses language notification when a changed listener replaces the owner", async () => {
    clearTransitionHistory();

    await replaceOwnerDuring("preferences:changed", () =>
      service.setSetting("language", "de"),
    );

    expect(
      fixture.eventBusFixture.getEventsOfType("preferences:changed"),
    ).toHaveLength(1);
    expect(
      fixture.eventBusFixture.getEventsOfType("language:changed"),
    ).toHaveLength(0);
  });

  it("does not write after activation planning invalidates the owner", async () => {
    const before = service.getCurrentState();
    Object.defineProperty(i18n, "language", {
      configurable: true,
      get() {
        service.destroy();
        return "en";
      },
    });
    clearTransitionHistory();

    await expect(service.setSettings({ theme: "dark" })).rejects.toThrow(
      "operation_cancelled",
    );

    expect(fixture.storage.saveSettings).not.toHaveBeenCalled();
    expect(service.getCurrentState()).toBe(before);
    expect(
      fixture.eventBusFixture.getEventsOfType("preferences:state-changed"),
    ).toHaveLength(0);
  });

  it("keeps a reentrant storage capability from adopting or broadcasting", async () => {
    const before = service.getCurrentState();
    clearTransitionHistory();
    fixture.storage.saveSettings.mockImplementationOnce(() => {
      service.destroy();
      return true;
    });

    await expect(
      service.persistSyncFolderSettings({
        syncFolderName: "Fleet Builds",
        syncFolderPath: "Selected folder: Fleet Builds",
        syncFolderFallback: false,
        autoSync: true,
      }),
    ).rejects.toThrow("operation_cancelled");

    expect(service.getCurrentState()).toBe(before);
    expect(service.getSettings()).toEqual(before.settings);
    expect(
      fixture.eventBusFixture.getEventsOfType("preferences:state-changed"),
    ).toHaveLength(0);
    expect(
      fixture.eventBusFixture.getEventsOfType("preferences:loaded"),
    ).toHaveLength(0);
  });

  it("rejects an activation callback retained beyond its transition lease", async () => {
    clearTransitionHistory();
    /** @type {undefined | (() => Promise<import('../../../src/js/types/rpc/parameters-preferences.js').PreferencesActivationResult>)} */
    let escapedActivation;

    await expect(
      service.runExternalActivationTransition(
        "application-reset",
        (activatePersistedSettings) => {
          escapedActivation = activatePersistedSettings;
          return "operation-complete";
        },
      ),
    ).resolves.toBe("operation-complete");

    expect(escapedActivation).toBeTypeOf("function");
    await expect(escapedActivation()).resolves.toEqual({
      success: false,
      error: "operation_cancelled",
      params: { reason: "operation_cancelled" },
      retryable: true,
    });
    expect(fixture.storage.clearSettings).not.toHaveBeenCalled();
    expect(fixture.storage.getSettings).not.toHaveBeenCalled();
    expect(
      fixture.eventBusFixture.getEventsOfType("preferences:state-changed"),
    ).toHaveLength(0);
  });

  it.each([
    ["returns", null],
    ["throws", new Error("external operation failed")],
  ])(
    "holds the lease when a fire-and-forget activation %s",
    async (_outcome, operationFailure) => {
      clearTransitionHistory();
      let releaseLanguage = () => {};
      const languageBlocked = new Promise((resolve) => {
        releaseLanguage = resolve;
      });
      i18n.changeLanguage.mockImplementationOnce(async (language) => {
        await languageBlocked;
        i18n.language = language;
      });
      fixture.storage.getSettings.mockReturnValueOnce({
        ...service.getSettings(),
        language: "de",
      });

      const transition = service.runExternalActivationTransition(
        "project-restore",
        (activatePersistedSettings) => {
          void activatePersistedSettings();
          if (operationFailure) throw operationFailure;
          return "operation-complete";
        },
      );
      await vi.waitFor(() => {
        expect(i18n.changeLanguage).toHaveBeenCalledWith("de");
      });
      const settled = vi.fn();
      void transition.then(settled, settled);
      const queuedMutation = service.setSetting("theme", "default");
      await Promise.resolve();

      expect(settled).not.toHaveBeenCalled();
      expect(fixture.storage.saveSettings).not.toHaveBeenCalled();

      releaseLanguage();
      if (operationFailure) {
        await expect(transition).rejects.toBe(operationFailure);
      } else {
        await expect(transition).resolves.toBe("operation-complete");
      }
      await expect(queuedMutation).resolves.toBe(true);
      expect(fixture.storage.saveSettings).toHaveBeenCalledOnce();
      expect(service.getCurrentState()).toMatchObject({
        revision: 3,
        settings: { language: "de", theme: "default" },
      });
    },
  );

  it("logs a rejected language event action without leaking a synchronous throw", async () => {
    const failure = new Error("settings unavailable");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    fixture.storage.saveSettings.mockImplementationOnce(() => {
      throw failure;
    });

    expect(() =>
      fixture.eventBus.emit("language:change", { language: "de" }),
    ).not.toThrow();
    await vi.waitFor(() => {
      expect(error).toHaveBeenCalledWith(
        "[PreferencesService] Failed to change language",
        failure,
      );
    });
  });
});
