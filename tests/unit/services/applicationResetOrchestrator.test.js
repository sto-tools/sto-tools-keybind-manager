import { describe, expect, it, vi } from "vitest";

import { orchestrateApplicationReset } from "../../../src/js/components/services/applicationResetOrchestrator.js";

const complete = (committed = true) => ({ status: "complete", committed });
const pending = () => ({ status: "pending", committed: false });
const failed = (committed = false, error = "storage_write_failed") => ({
  status: "failed",
  committed,
  error,
});

function projectSuccess() {
  return {
    success: true,
    receipt: {
      rootClear: complete(),
      backupClear: complete(),
      resetSentinel: complete(),
    },
  };
}

function dataAdoptionSuccess() {
  return {
    success: true,
    currentProfile: null,
    receipt: { dataOwnerAdoption: complete() },
  };
}

function preferencesSuccess(settlement = Promise.resolve()) {
  return {
    result: {
      success: true,
      receipt: {
        settingsClear: complete(),
        settingsDefaults: complete(),
        preferencesOwnerAdoption: complete(),
      },
    },
    settlement,
  };
}

function deferred() {
  let resolve = () => {};
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function preferencesTransition(resetPreferences, order = []) {
  return vi.fn(async (operation) => {
    order.push("preferences-transition-entered");
    const result = await operation({
      resetPreferences,
      assertActive: () => order.push("preferences-assert-active"),
    });
    order.push("preferences-transition-released");
    return result;
  });
}

function dataTransition({
  resetProjectPersistence,
  adoptEmptyProject,
  order = [],
  settlement = Promise.resolve(),
}) {
  return vi.fn(async (operation) => {
    order.push("data-transition-entered");
    const result = await operation({
      resetProjectPersistence,
      adoptEmptyProject,
      assertActive: () => order.push("data-assert-active"),
    });
    order.push("data-transition-released");
    return { result, settlement };
  });
}

describe("application reset orchestrator", () => {
  it("rejects an accessor-bearing payload before invoking either owner", async () => {
    const getter = vi.fn(() => true);
    const payload = Object.defineProperty({}, "unexpected", {
      enumerable: true,
      get: getter,
    });
    const runPreferencesResetTransition = vi.fn();
    const runDataResetTransition = vi.fn();

    await expect(
      orchestrateApplicationReset({
        payload,
        runPreferencesResetTransition,
        runDataResetTransition,
      }),
    ).resolves.toMatchObject({
      success: false,
      error: "invalid_reset_request",
      stage: "validation",
      durable: false,
      params: { reason: "invalid_mutation_request" },
      receipt: {
        validation: failed(false, "invalid_data"),
        rootClear: { status: "skipped", committed: false },
        preferencesOwnerAdoption: { status: "skipped", committed: false },
      },
    });
    expect(getter).not.toHaveBeenCalled();
    expect(runPreferencesResetTransition).not.toHaveBeenCalled();
    expect(runDataResetTransition).not.toHaveBeenCalled();
  });

  it("orders persistence, Preferences adoption, and Data adoption before releasing queues and awaiting settlements", async () => {
    const order = [];
    const dataSettlement = deferred();
    const preferencesSettlement = deferred();
    const resetProjectPersistence = vi.fn(() => {
      order.push("project-persistence-invoked");
      return projectSuccess();
    });
    const resetPreferences = vi.fn(() => {
      order.push("preferences-reset-invoked");
      return preferencesSuccess(
        preferencesSettlement.promise.then(() =>
          order.push("preferences-settled"),
        ),
      );
    });
    const adoptEmptyProject = vi.fn(() => {
      order.push("data-adoption-invoked");
      return dataAdoptionSuccess();
    });
    const runPreferencesResetTransition = preferencesTransition(
      resetPreferences,
      order,
    );
    const runDataResetTransition = dataTransition({
      resetProjectPersistence,
      adoptEmptyProject,
      order,
      settlement: dataSettlement.promise.then(() => order.push("data-settled")),
    });
    let responseSettled = false;

    const response = orchestrateApplicationReset({
      payload: {},
      runPreferencesResetTransition,
      runDataResetTransition,
    });
    void response.then(() => {
      responseSettled = true;
      order.push("response-settled");
    });

    await vi.waitFor(() => {
      expect(order).toContain("data-transition-released");
    });
    expect(order.filter((entry) => !entry.endsWith("assert-active"))).toEqual([
      "preferences-transition-entered",
      "data-transition-entered",
      "project-persistence-invoked",
      "preferences-reset-invoked",
      "data-adoption-invoked",
      "data-transition-released",
      "preferences-transition-released",
    ]);
    expect(responseSettled).toBe(false);

    preferencesSettlement.resolve();
    await Promise.resolve();
    expect(responseSettled).toBe(false);
    dataSettlement.resolve();

    await expect(response).resolves.toEqual({
      success: true,
      receipt: {
        validation: complete(),
        rootClear: complete(),
        backupClear: complete(),
        resetSentinel: complete(),
        settingsClear: complete(),
        settingsDefaults: complete(),
        dataOwnerAdoption: complete(),
        preferencesOwnerAdoption: complete(),
      },
    });
    expect(order.indexOf("data-transition-released")).toBeLessThan(
      order.indexOf("preferences-settled"),
    );
    expect(order.indexOf("data-transition-released")).toBeLessThan(
      order.indexOf("data-settled"),
    );
    expect(order.at(-1)).toBe("response-settled");
  });

  it("returns the persistence failure without entering Preferences or adopting Data", async () => {
    const resetPreferences = vi.fn();
    const runPreferencesResetTransition =
      preferencesTransition(resetPreferences);
    const adoptEmptyProject = vi.fn();
    const resetProjectPersistence = vi.fn(() => ({
      success: false,
      stage: "backupClear",
      durable: true,
      params: { reason: "storage_write_failed" },
      receipt: {
        rootClear: complete(),
        backupClear: failed("indeterminate"),
        resetSentinel: pending(),
      },
    }));

    await expect(
      orchestrateApplicationReset({
        payload: {},
        runPreferencesResetTransition,
        runDataResetTransition: dataTransition({
          resetProjectPersistence,
          adoptEmptyProject,
        }),
      }),
    ).resolves.toMatchObject({
      success: false,
      stage: "backupClear",
      durable: true,
      params: { reason: "storage_write_failed" },
      receipt: {
        validation: complete(),
        rootClear: complete(),
        backupClear: failed("indeterminate"),
        settingsClear: pending(),
        dataOwnerAdoption: pending(),
      },
    });
    expect(runPreferencesResetTransition).toHaveBeenCalledOnce();
    expect(resetPreferences).not.toHaveBeenCalled();
    expect(adoptEmptyProject).not.toHaveBeenCalled();
  });

  it("keeps live Data unchanged when Preferences fails after project persistence", async () => {
    const adoptEmptyProject = vi.fn();
    const resetPreferences = vi.fn(() => ({
      result: {
        success: false,
        stage: "settingsDefaults",
        durable: true,
        params: { reason: "verification_failed" },
        receipt: {
          settingsClear: complete(),
          settingsDefaults: failed(true, "verification_failed"),
          preferencesOwnerAdoption: pending(),
        },
      },
      settlement: Promise.resolve(),
    }));

    await expect(
      orchestrateApplicationReset({
        payload: {},
        runPreferencesResetTransition: preferencesTransition(resetPreferences),
        runDataResetTransition: dataTransition({
          resetProjectPersistence: () => projectSuccess(),
          adoptEmptyProject,
        }),
      }),
    ).resolves.toMatchObject({
      success: false,
      stage: "settingsDefaults",
      durable: true,
      params: { reason: "verification_failed" },
      receipt: {
        rootClear: complete(),
        settingsClear: complete(),
        settingsDefaults: failed(true, "verification_failed"),
        preferencesOwnerAdoption: pending(),
        dataOwnerAdoption: pending(),
      },
    });
    expect(adoptEmptyProject).not.toHaveBeenCalled();
  });

  it("merges a final Data adoption failure with completed Preferences evidence", async () => {
    const adoptEmptyProject = vi.fn(() => ({
      success: false,
      error: "operation_cancelled",
      stage: "dataOwnerAdoption",
      durable: true,
      params: { reason: "operation_cancelled" },
      receipt: {
        dataOwnerAdoption: failed(false, "operation_cancelled"),
      },
    }));

    await expect(
      orchestrateApplicationReset({
        payload: {},
        runPreferencesResetTransition: preferencesTransition(() =>
          preferencesSuccess(),
        ),
        runDataResetTransition: dataTransition({
          resetProjectPersistence: () => projectSuccess(),
          adoptEmptyProject,
        }),
      }),
    ).resolves.toMatchObject({
      success: false,
      stage: "dataOwnerAdoption",
      durable: true,
      params: { reason: "operation_cancelled" },
      receipt: {
        rootClear: complete(),
        settingsDefaults: complete(),
        preferencesOwnerAdoption: complete(),
        dataOwnerAdoption: failed(false, "operation_cancelled"),
      },
    });
  });

  it("preserves indeterminate persistence durability in the public failure", async () => {
    const resetPreferences = vi.fn();
    await expect(
      orchestrateApplicationReset({
        payload: {},
        runPreferencesResetTransition: preferencesTransition(resetPreferences),
        runDataResetTransition: dataTransition({
          resetProjectPersistence: () => ({
            success: false,
            stage: "rootClear",
            durable: "indeterminate",
            params: { reason: "storage_write_failed" },
            receipt: {
              rootClear: failed("indeterminate"),
              backupClear: pending(),
              resetSentinel: pending(),
            },
          }),
          adoptEmptyProject: vi.fn(),
        }),
      }),
    ).resolves.toMatchObject({
      success: false,
      stage: "rootClear",
      durable: "indeterminate",
    });
    expect(resetPreferences).not.toHaveBeenCalled();
  });
});
