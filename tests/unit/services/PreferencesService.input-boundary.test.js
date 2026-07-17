import { afterEach, beforeEach, describe, expect, it } from "vitest";

import PreferencesService from "../../../src/js/components/services/PreferencesService.js";
import { extensionPreferenceKey } from "../../../src/js/components/services/preferenceKeys.js";
import { createServiceFixture } from "../../fixtures/index.js";

describe("PreferencesService mutation boundary", () => {
  let fixture;
  let service;

  beforeEach(() => {
    fixture = createServiceFixture();
    service = new PreferencesService({
      storage: fixture.storage,
      eventBus: fixture.eventBus,
    });
    service.init();
    fixture.storage.saveSettings.mockClear();
    fixture.eventBusFixture.clearEventHistory();
  });

  afterEach(() => {
    service?.destroy();
    fixture?.destroy();
  });

  function expectNoMutation(before) {
    expect(service.getCurrentState()).toEqual(before);
    expect(fixture.storage.saveSettings).not.toHaveBeenCalled();
    expect(
      fixture.eventBusFixture.getEventsOfType("preferences:saved"),
    ).toHaveLength(0);
    expect(
      fixture.eventBusFixture.getEventsOfType("preferences:changed"),
    ).toHaveLength(0);
  }

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
});
