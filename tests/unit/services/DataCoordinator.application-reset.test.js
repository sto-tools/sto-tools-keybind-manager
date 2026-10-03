import LocalStorageVisitedStatePersistence from "../../../src/js/components/storage/LocalStorageVisitedStatePersistence.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import DataCoordinator from "../../../src/js/components/services/DataCoordinator.js";
import { createServiceFixture } from "../../fixtures/index.js";

const acknowledged = () => ({ status: "acknowledged" });
const notAttempted = () => ({ status: "not_attempted" });
const indeterminate = () => ({
  status: "indeterminate",
  error: "storage_write_failed",
  category: "unknown",
});

const successfulReset = () => ({
  status: "reset",
  rootRemoval: acknowledged(),
  backupRemoval: acknowledged(),
  sentinelWrite: acknowledged(),
});

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("DataCoordinator application reset owner action", () => {
  let fixture;
  let coordinator;
  let projectRepository;

  beforeEach(async () => {
    localStorage.setItem("sto_keybind_manager_visited", "true");
    fixture = createServiceFixture();
    projectRepository = fixture.projectRepository;
    projectRepository.load.mockReturnValue({
      status: "current",
      value: {
        currentProfile: "alpha",
        profiles: {
          alpha: {
            name: "Alpha",
            currentEnvironment: "ground",
            builds: { space: { keys: {} }, ground: { keys: {} } },
            aliases: {},
            bindsets: {},
            keybindMetadata: {},
            aliasMetadata: {},
            bindsetMetadata: {},
            migrationVersion: "2.1.1",
          },
        },
        version: "1.0.0",
        lastModified: "2026-09-26T00:00:00.000Z",
      },
    });
    projectRepository.reset.mockImplementation(() => {
      projectRepository.load.mockReturnValue({
        status: "repair_required",
        value: {
          currentProfile: null,
          profiles: {},
          version: "1.0.0",
          lastModified: "2026-09-26T00:00:01.000Z",
        },
        resetSentinel: {
          status: "pending_consumption",
          expectedValue: "reset-token",
        },
      });
      return successfulReset();
    });
    coordinator = new DataCoordinator({
      visitedState: new LocalStorageVisitedStatePersistence({
        storage: localStorage,
      }),
      eventBus: fixture.eventBus,
      projectRepository,
      i18n: { t: (key) => key },
    });
    coordinator.init();
    await coordinator.initialStateReady;
    fixture.eventBusFixture.clearEventHistory();
  });

  afterEach(() => {
    if (!coordinator.destroyed) coordinator.destroy();
    fixture.destroy();
    localStorage.removeItem("sto_keybind_manager_visited");
    vi.restoreAllMocks();
  });

  const runResetTransition = () =>
    coordinator.runApplicationResetTransition(
      async ({ resetProjectPersistence, adoptEmptyProject, assertActive }) => {
        assertActive();
        const persistence = await resetProjectPersistence();
        if (!persistence.success) return persistence;
        const adoption = await adoptEmptyProject();
        return {
          ...adoption,
          receipt: { ...persistence.receipt, ...adoption.receipt },
        };
      },
    );

  it("adopts empty state after repository reset and publishes canonical then compatibility events", async () => {
    const priorRevision = coordinator.getCurrentState().revision;

    const action = await runResetTransition();

    expect(action.result).toEqual({
      success: true,
      currentProfile: null,
      receipt: {
        rootClear: { status: "complete", committed: true },
        backupClear: { status: "complete", committed: true },
        resetSentinel: { status: "complete", committed: true },
        dataOwnerAdoption: { status: "complete", committed: true },
      },
    });
    await action.settlement;
    expect(projectRepository.reset).toHaveBeenCalledTimes(1);
    expect(coordinator.getCurrentState()).toMatchObject({
      ready: true,
      revision: priorRevision + 1,
      currentProfile: null,
      currentEnvironment: "space",
      profiles: {},
    });
    expect(
      fixture
        .getEventHistory()
        .filter(({ event }) =>
          [
            "data:state-changed",
            "profile:updated",
            "profile:switched",
          ].includes(event),
        )
        .map(({ event }) => event),
    ).toEqual(["data:state-changed", "profile:updated", "profile:switched"]);
    expect(
      fixture.eventBusFixture.getEventsOfType("data:state-changed")[0].data
        .reason,
    ).toBe("storage-reset");
    expect(
      fixture.eventBusFixture.getEventsOfType("storage:data-reset"),
    ).toHaveLength(0);
  });

  it.each([
    {
      stage: "rootClear",
      expectedDurability: "indeterminate",
      repositoryResult: {
        status: "reset_failed",
        rootRemoval: indeterminate(),
        backupRemoval: notAttempted(),
        sentinelWrite: notAttempted(),
      },
      expectedReceipt: {
        rootClear: {
          status: "failed",
          committed: "indeterminate",
          error: "storage_write_failed",
        },
        backupClear: { status: "pending", committed: false },
        resetSentinel: { status: "pending", committed: false },
      },
    },
    {
      stage: "backupClear",
      expectedDurability: true,
      repositoryResult: {
        status: "reset_failed",
        rootRemoval: acknowledged(),
        backupRemoval: indeterminate(),
        sentinelWrite: notAttempted(),
      },
      expectedReceipt: {
        rootClear: { status: "complete", committed: true },
        backupClear: {
          status: "failed",
          committed: "indeterminate",
          error: "storage_write_failed",
        },
        resetSentinel: { status: "pending", committed: false },
      },
    },
    {
      stage: "resetSentinel",
      expectedDurability: true,
      repositoryResult: {
        status: "reset_failed",
        rootRemoval: acknowledged(),
        backupRemoval: acknowledged(),
        sentinelWrite: indeterminate(),
      },
      expectedReceipt: {
        rootClear: { status: "complete", committed: true },
        backupClear: { status: "complete", committed: true },
        resetSentinel: {
          status: "failed",
          committed: "indeterminate",
          error: "storage_write_failed",
        },
      },
    },
  ])(
    "translates an exact $stage repository failure receipt",
    async ({
      stage,
      repositoryResult,
      expectedReceipt,
      expectedDurability,
    }) => {
      projectRepository.reset.mockReturnValueOnce(repositoryResult);
      const stateBefore = coordinator.getCurrentState();

      const action = await runResetTransition();

      expect(action.result).toEqual({
        success: false,
        error: "storage_write_failed",
        stage,
        durable: expectedDurability,
        params: { reason: "storage_write_failed" },
        receipt: {
          ...expectedReceipt,
        },
      });
      await action.settlement;
      expect(coordinator.getCurrentState()).toBe(stateBefore);
      expect(
        fixture.eventBusFixture.getEventsOfType("data:state-changed"),
      ).toHaveLength(0);
      expect(
        fixture.eventBusFixture.getEventsOfType("profile:updated"),
      ).toHaveLength(0);
    },
  );

  it("reports an indeterminate root clear when the repository throws", async () => {
    projectRepository.reset.mockImplementationOnce(() => {
      throw new Error("unavailable");
    });

    const action = await runResetTransition();

    expect(action.result).toMatchObject({
      success: false,
      error: "storage_write_failed",
      stage: "rootClear",
      durable: "indeterminate",
      params: { reason: "storage_write_failed" },
      receipt: {
        rootClear: {
          status: "failed",
          committed: "indeterminate",
          error: "storage_write_failed",
        },
        backupClear: { status: "pending", committed: false },
        resetSentinel: { status: "pending", committed: false },
      },
    });
  });

  it("returns publication settlement separately from ordered mutation completion", async () => {
    const publicationGate = deferred();
    const originalEmit = coordinator.emit.bind(coordinator);
    vi.spyOn(coordinator, "emit").mockImplementation(
      (event, payload, options) => {
        const emitted = originalEmit(event, payload, options);
        return event === "data:state-changed"
          ? publicationGate.promise
          : emitted;
      },
    );

    const action = await runResetTransition();
    let settled = false;
    void action.settlement.then(() => {
      settled = true;
    });

    expect(action.result.success).toBe(true);
    await Promise.resolve();
    expect(settled).toBe(false);

    publicationGate.resolve();
    await action.settlement;
    expect(settled).toBe(true);
  });

  it("reports durable cancellation when the lifecycle ends after repository reset", async () => {
    projectRepository.reset.mockImplementationOnce(() => {
      coordinator.destroy();
      return successfulReset();
    });

    const action = await runResetTransition();

    expect(action.result).toEqual({
      success: false,
      error: "operation_cancelled",
      stage: "dataOwnerAdoption",
      durable: true,
      params: { reason: "operation_cancelled" },
      receipt: {
        rootClear: { status: "complete", committed: true },
        backupClear: { status: "complete", committed: true },
        resetSentinel: { status: "complete", committed: true },
        dataOwnerAdoption: {
          status: "failed",
          committed: false,
          error: "operation_cancelled",
        },
      },
    });
    expect(
      fixture.eventBusFixture.getEventsOfType("data:state-changed"),
    ).toHaveLength(0);
  });
});
