import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import PreferencesService from "../../../src/js/components/services/PreferencesService.js";
import { extensionPreferenceKey } from "../../../src/js/components/services/preferenceKeys.js";
import { MAX_PROJECT_JSON_BYTES } from "../../../src/js/components/services/jsonDataBoundary.js";
import { createServiceFixture } from "../../fixtures/index.js";

describe("PreferencesService mutation boundary", () => {
  let fixture;
  let service;

  beforeEach(async () => {
    fixture = createServiceFixture();
    service = new PreferencesService({
      settingsRepository: fixture.settingsRepository,
      eventBus: fixture.eventBus,
    });
    service.init();
    await service.initialStateReady;
    fixture.settingsRepository.replace.mockClear();
    fixture.eventBusFixture.clearEventHistory();
  });

  afterEach(() => {
    service?.destroy();
    fixture?.destroy();
  });

  function expectNoMutation(before) {
    expect(service.getCurrentState()).toEqual(before);
    expect(fixture.settingsRepository.replace).not.toHaveBeenCalled();
    expect(
      fixture.eventBusFixture.getEventsOfType("preferences:saved"),
    ).toHaveLength(0);
    expect(
      fixture.eventBusFixture.getEventsOfType("preferences:changed"),
    ).toHaveLength(0);
    expect(
      fixture.eventBusFixture.getEventsOfType("preferences:state-changed"),
    ).toHaveLength(0);
  }

  it.each([
    ["oversized string", () => "x".repeat(MAX_PROJECT_JSON_BYTES)],
    [
      "expanded shared DAG",
      () => {
        let value = { text: "x".repeat(MAX_PROJECT_JSON_BYTES / 4) };
        for (let level = 0; level < 3; level += 1)
          value = { left: value, right: value };
        return value;
      },
    ],
  ])(
    "rejects %s before owner capture or queue admission",
    async (_label, makeValue) => {
      const before = service.getCurrentState();
      const ownerRead = vi.spyOn(service, "getSettings");
      const queue = vi.spyOn(service, "_enqueueMutation");
      const generation = vi.spyOn(service, "_readyMutationGeneration");

      const value = makeValue();
      for (const operation of [
        () => service.setSettings({ "plugin:oversized": value }),
        () =>
          service.setExtensionSetting(
            extensionPreferenceKey("plugin:oversized"),
            value,
          ),
        () =>
          fixture.eventBus.request("preferences:set-setting", {
            key: extensionPreferenceKey("plugin:oversized"),
            value,
            extension: true,
          }),
      ]) {
        const outcome = await Promise.resolve()
          .then(operation)
          .catch((error) => error);
        expect({
          generation: generation.mock.calls.length,
          queue: queue.mock.calls.length,
          ownerRead: ownerRead.mock.calls.length,
          repository: fixture.settingsRepository.replace.mock.calls.length,
        }).toEqual({ generation: 0, queue: 0, ownerRead: 0, repository: 0 });
        expect(outcome).toBeInstanceOf(Error);
        expect(outcome.message).toMatch(/^Invalid /);
      }
      expectNoMutation(before);
    },
  );

  it("rejects oversized sync-folder input before owner capture or queue admission", async () => {
    const before = service.getCurrentState();
    const ownerRead = vi.spyOn(service, "getSettings");
    const queue = vi.spyOn(service, "_enqueueMutation");
    const generation = vi.spyOn(service, "_readyMutationGeneration");
    await expect(
      Promise.resolve().then(() =>
        service.persistSyncFolderSettings({
          syncFolderName: "folder",
          syncFolderPath: "é".repeat(MAX_PROJECT_JSON_BYTES / 2),
          syncFolderFallback: false,
          autoSync: false,
        }),
      ),
    ).rejects.toThrow();
    expect(generation).not.toHaveBeenCalled();
    expect(queue).not.toHaveBeenCalled();
    expect(ownerRead).not.toHaveBeenCalled();
    expectNoMutation(before);
  });

  it.each(["__proto__", "prototype", "constructor"])(
    "rejects reserved extension key %s before persistence",
    async (unsafeKey) => {
      const before = service.getCurrentState();

      await expect(
        fixture.eventBus.request("preferences:set-setting", {
          key: extensionPreferenceKey(unsafeKey),
          value: { polluted: true },
          extension: true,
        }),
      ).rejects.toThrow();

      expectNoMutation(before);
      expect({}.polluted).toBeUndefined();
    },
  );

  it.each([
    ["function", () => {}],
    [
      "cyclic object",
      (() => {
        const value = {};
        value.self = value;
        return value;
      })(),
    ],
    [
      "over-depth object",
      (() => {
        let value = { leaf: true };
        for (let depth = 0; depth < 102; depth += 1) value = { nested: value };
        return value;
      })(),
    ],
  ])("rejects non-JSON %s extension values", async (_label, value) => {
    const before = service.getCurrentState();

    await expect(
      fixture.eventBus.request("preferences:set-setting", {
        key: extensionPreferenceKey("plugin:unsafe-value"),
        value,
        extension: true,
      }),
    ).rejects.toThrow();

    expectNoMutation(before);
  });

  it("rejects an unsafe nested bulk extension atomically", async () => {
    const before = service.getCurrentState();
    const payload = JSON.parse(
      '{"autoSave":false,"plugin:layout":{"constructor":{"polluted":true}}}',
    );

    await expect(
      fixture.eventBus.request("preferences:set-settings", payload),
    ).rejects.toThrow("Invalid preferences settings payload");

    expectNoMutation(before);
    expect({}.polluted).toBeUndefined();
  });

  it("rejects descriptor-hostile single-setting RPC envelopes without invoking accessors", async () => {
    const before = service.getCurrentState();
    const keyGetter = vi.fn(() => "autoSave");
    const nestedGetter = vi.fn(() => "compact");
    const accessorEnvelope = { value: false };
    Object.defineProperty(accessorEnvelope, "key", {
      enumerable: true,
      get: keyGetter,
    });
    const nested = {};
    Object.defineProperty(nested, "density", {
      enumerable: true,
      get: nestedGetter,
    });
    const hostileProxy = new Proxy(
      { key: "autoSave", value: false },
      {
        ownKeys() {
          throw new Error("producer reflection failure");
        },
      },
    );

    for (const payload of [
      { key: "autoSave", value: false, extra: true },
      accessorEnvelope,
      {
        key: extensionPreferenceKey("plugin:layout"),
        value: nested,
        extension: true,
      },
      hostileProxy,
    ]) {
      await expect(
        fixture.eventBus.request("preferences:set-setting", payload),
      ).rejects.toThrow();
    }

    expect(keyGetter).not.toHaveBeenCalled();
    expect(nestedGetter).not.toHaveBeenCalled();
    expectNoMutation(before);
  });

  it("rejects descriptor-hostile bulk RPC payloads without invoking accessors", async () => {
    const before = service.getCurrentState();
    const settingGetter = vi.fn(() => false);
    const accessorPayload = {};
    Object.defineProperty(accessorPayload, "autoSave", {
      enumerable: true,
      get: settingGetter,
    });
    const hiddenPayload = {};
    Object.defineProperty(hiddenPayload, "autoSave", {
      enumerable: false,
      value: false,
    });
    const hostileProxy = new Proxy(
      { autoSave: false },
      {
        getOwnPropertyDescriptor() {
          throw new Error("producer reflection failure");
        },
      },
    );

    for (const payload of [accessorPayload, hiddenPayload, hostileProxy]) {
      await expect(
        fixture.eventBus.request("preferences:set-settings", payload),
      ).rejects.toThrow("Invalid preferences settings payload");
    }

    expect(settingGetter).not.toHaveBeenCalled();
    expectNoMutation(before);
  });
});
