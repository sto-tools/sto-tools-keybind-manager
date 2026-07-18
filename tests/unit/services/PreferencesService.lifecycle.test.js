import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import PreferencesService from "../../../src/js/components/services/PreferencesService.js";
import { createServiceFixture } from "../../fixtures/index.js";

const ownedTopics = [
  "rpc:preferences:init",
  "rpc:preferences:load-settings",
  "rpc:preferences:persist-sync-folder-settings",
  "rpc:preferences:save-settings",
  "rpc:preferences:set-setting",
  "rpc:preferences:set-settings",
  "theme:toggle",
  "language:change",
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

  it("owns each command exactly once across destroy and reinitialization", () => {
    const service = createService();

    service.init();
    expectOwnedListenerCount(fixture.eventBus, 1);

    service.destroy();
    expectOwnedListenerCount(fixture.eventBus, 0);

    service.init();
    expectOwnedListenerCount(fixture.eventBus, 1);

    service.destroy();
    expectOwnedListenerCount(fixture.eventBus, 0);
  });

  it("transfers command ownership to a replacement service", async () => {
    const predecessor = createService();
    predecessor.init();
    predecessor.destroy();

    const predecessorSetSetting = vi.spyOn(predecessor, "setSetting");
    const replacement = createService();
    const replacementSetSetting = vi.spyOn(replacement, "setSetting");
    replacement.init();

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

  it("contains a theme-toggle persistence exception without changing owner state", async () => {
    const service = createService();
    service.init();
    const before = service.getCurrentState();
    const applySettings = vi.spyOn(service, "applySettings");
    const failure = new Error("settings unavailable");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    fixture.storage.saveSettings.mockImplementationOnce(() => {
      throw failure;
    });
    fixture.eventBusFixture.clearEventHistory();

    fixture.eventBus.emit("theme:toggle");
    await Promise.resolve();

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
});
