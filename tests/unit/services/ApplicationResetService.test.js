import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ApplicationResetService from "../../../src/js/components/services/ApplicationResetService.js";
import { request } from "../../../src/js/core/requestResponse.js";
import { createEventBusFixture } from "../../fixtures/core/eventBus.js";

const complete = () => ({ status: "complete", committed: true });

describe("ApplicationResetService", () => {
  let fixture;
  let service;
  let resetProjectPersistence;
  let adoptEmptyProject;
  let resetPreferences;
  let runPreferencesResetTransition;
  let runDataResetTransition;

  beforeEach(() => {
    fixture = createEventBusFixture();
    resetProjectPersistence = vi.fn(() => ({
      success: true,
      receipt: {
        rootClear: complete(),
        backupClear: complete(),
        resetSentinel: complete(),
      },
    }));
    adoptEmptyProject = vi.fn(() => ({
      success: true,
      currentProfile: null,
      receipt: { dataOwnerAdoption: complete() },
    }));
    resetPreferences = vi.fn(() => ({
      result: {
        success: true,
        receipt: {
          settingsClear: complete(),
          settingsDefaults: complete(),
          preferencesOwnerAdoption: complete(),
        },
      },
      settlement: Promise.resolve(),
    }));
    runPreferencesResetTransition = vi.fn((operation) =>
      operation({ resetPreferences, assertActive: vi.fn() }),
    );
    runDataResetTransition = vi.fn(async (operation) => ({
      result: await operation({
        resetProjectPersistence,
        adoptEmptyProject,
        assertActive: vi.fn(),
      }),
      settlement: Promise.resolve(),
    }));
    service = new ApplicationResetService({
      eventBus: fixture.eventBus,
      runPreferencesResetTransition,
      runDataResetTransition,
    });
  });

  afterEach(() => {
    service?.destroy();
    fixture?.destroy();
  });

  it("owns the no-payload reset responder and returns the settled receipt", async () => {
    service.init();

    await expect(
      request(fixture.eventBus, "application:reset", {}, 0),
    ).resolves.toMatchObject({
      success: true,
      receipt: {
        validation: complete(),
        rootClear: complete(),
        preferencesOwnerAdoption: complete(),
      },
    });
    expect(runDataResetTransition).toHaveBeenCalledOnce();
    expect(runPreferencesResetTransition).toHaveBeenCalledOnce();
    expect(resetProjectPersistence).toHaveBeenCalledOnce();
    expect(resetPreferences).toHaveBeenCalledOnce();
    expect(adoptEmptyProject).toHaveBeenCalledOnce();
  });

  it("validates the payload before invoking an owner through the RPC", async () => {
    service.init();
    const getter = vi.fn(() => true);
    const payload = Object.defineProperty({}, "unexpected", {
      enumerable: true,
      get: getter,
    });

    await expect(
      request(fixture.eventBus, "application:reset", payload, 0),
    ).resolves.toMatchObject({
      success: false,
      stage: "validation",
      durable: false,
      params: { reason: "invalid_mutation_request" },
    });
    expect(getter).not.toHaveBeenCalled();
    expect(runDataResetTransition).not.toHaveBeenCalled();
    expect(runPreferencesResetTransition).not.toHaveBeenCalled();
    expect(resetProjectPersistence).not.toHaveBeenCalled();
    expect(adoptEmptyProject).not.toHaveBeenCalled();
  });

  it("detaches on destroy and installs exactly one responder on reinit", async () => {
    service.init();
    service.init();
    expect(fixture.eventBus.getListenerCount("rpc:application:reset")).toBe(1);

    service.destroy();
    expect(fixture.eventBus.getListenerCount("rpc:application:reset")).toBe(0);
    expect(() => request(fixture.eventBus, "application:reset", {}, 0)).toThrow(
      'No handler registered for topic "application:reset"',
    );

    service.init();
    expect(fixture.eventBus.getListenerCount("rpc:application:reset")).toBe(1);
    await expect(
      request(fixture.eventBus, "application:reset", {}, 0),
    ).resolves.toMatchObject({ success: true });
  });
});
