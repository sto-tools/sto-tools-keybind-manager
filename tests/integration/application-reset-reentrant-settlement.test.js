import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import eventBus from "../../src/js/core/eventBus.js";
import { request } from "../../src/js/core/requestResponse.js";
import ApplicationResetService from "../../src/js/components/services/ApplicationResetService.js";
import DataCoordinator from "../../src/js/components/services/DataCoordinator.js";
import PreferencesService from "../../src/js/components/services/PreferencesService.js";
import LocalStorageVisitedStatePersistence from "../../src/js/components/storage/LocalStorageVisitedStatePersistence.js";
import {
  createResetOwnerWorkflowFixture,
  destroyResetOwnerWorkflowFixture,
  rawPersistence,
} from "../fixtures/services/applicationResetOwnerWorkflow.js";

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

function expectSingleResetWrites(writes, removes, defaults) {
  expect(writes.mock.calls).toEqual([
    ["sto_app_reset", "true"],
    ["sto_keybind_settings", defaults],
  ]);
  expect(removes.mock.calls).toEqual([
    ["sto_keybind_manager"],
    ["sto_keybind_manager_backup"],
    ["sto_keybind_settings"],
  ]);
}

describe("application reset reentrant required listener settlement", () => {
  let owners;
  beforeEach(async () => {
    eventBus.clear();
    owners = await createResetOwnerWorkflowFixture();
    owners.resetService.destroy();
    owners.preferences.destroy();
    owners.coordinator.destroy();
    owners.coordinator = new DataCoordinator({
      eventBus,
      visitedState: new LocalStorageVisitedStatePersistence({
        storage: localStorage,
      }),
      projectRepository: owners.projectRepository,
      i18n: owners.i18n,
      defaultProfiles: {},
    });
    owners.coordinator.init();
    await owners.coordinator.initialStateReady;
    owners.preferences = new PreferencesService({
      eventBus,
      settingsRepository: owners.settingsRepository,
      i18n: owners.i18n,
      localizeCommands: vi.fn(),
      applyTranslations: vi.fn(),
    });
    owners.preferences.init();
    await owners.preferences.initialStateReady;
    owners.resetService = new ApplicationResetService({
      eventBus,
      runPreferencesResetTransition: (operation, checkpoint) =>
        owners.preferences.runApplicationResetTransition(operation, checkpoint),
      runDataResetTransition: (operation, checkpoint) =>
        owners.coordinator.runApplicationResetTransition(operation, checkpoint),
    });
    owners.resetService.init();
  });
  afterEach(() => {
    destroyResetOwnerWorkflowFixture(owners);
    eventBus.clear();
  });

  it.each(["preferences:state-changed", "data:state-changed"])(
    "allows an awaited nested reset from its own required %s listener without replay or premature initiating reply",
    async (topic) => {
      const escape = deferred();
      const ownListener = deferred();
      const publications = { preferences: 0, data: 0 };
      const writes = vi.spyOn(owners.repositoryStorage, "setItem");
      const removes = vi.spyOn(owners.repositoryStorage, "removeItem");
      eventBus.on("preferences:state-changed", () => {
        publications.preferences += 1;
      });
      eventBus.on("data:state-changed", () => {
        publications.data += 1;
      });
      let nested;
      let nestedReply;
      let firstReply;
      let entered = false;
      eventBus.on(topic, async () => {
        if (entered) return;
        entered = true;
        nested = request(eventBus, "application:reset", {}, 0);
        nested.then((result) => {
          nestedReply = result;
        });
        // The escape permits bounded failing reproduction to drain every RPC.
        await Promise.race([nested, escape.promise]);
        await ownListener.promise;
      });
      const first = request(eventBus, "application:reset", {}, 0);
      first.then((result) => {
        firstReply = result;
      });
      try {
        await vi.waitFor(() => expect(nestedReply?.success).toBe(true));
        expect(firstReply).toBeUndefined();
        expect(nestedReply.receipt).toMatchObject({
          preferencesOwnerAdoption: { status: "complete", committed: true },
          dataOwnerAdoption: { status: "complete", committed: true },
        });
        expect(publications).toEqual({ preferences: 1, data: 1 });
        expectSingleResetWrites(writes, removes, owners.defaultSettingsRaw);
        expect(rawPersistence()).toEqual({
          root: null,
          backup: null,
          settings: owners.defaultSettingsRaw,
          resetSentinel: "true",
        });
      } finally {
        escape.resolve();
        ownListener.resolve();
        await first;
        if (nested) await nested;
      }
      expect(firstReply.success).toBe(true);
      expect(firstReply).not.toBe(nestedReply);
      expect(firstReply.receipt).not.toBe(nestedReply.receipt);
      expect(firstReply.receipt.rootClear).not.toBe(
        nestedReply.receipt.rootClear,
      );
    },
  );

  it.each(["preferences:state-changed", "data:state-changed"])(
    "rejects nested bookkeeping work from %s while withholding its publisher and resumes the private saga without replay",
    async (topic) => {
      const escape = deferred();
      const ownListener = deferred();
      const publications = { preferences: 0, data: 0 };
      const writes = vi.spyOn(owners.repositoryStorage, "setItem");
      const removes = vi.spyOn(owners.repositoryStorage, "removeItem");
      const exceptional = new Error("reset bookkeeping failed");
      const originalClone = globalThis.structuredClone;
      let cloneFailureCount = 0;
      const clone = vi
        .spyOn(globalThis, "structuredClone")
        .mockImplementation((value, options) => {
          if (
            cloneFailureCount === 0 &&
            value?.validation?.status === "complete" &&
            value?.dataOwnerAdoption?.status === "complete" &&
            value?.preferencesOwnerAdoption?.status === "complete"
          ) {
            cloneFailureCount += 1;
            throw exceptional;
          }
          return originalClone(value, options);
        });
      eventBus.on("preferences:state-changed", () => {
        publications.preferences += 1;
      });
      eventBus.on("data:state-changed", () => {
        publications.data += 1;
      });
      const observe = (action) =>
        action.then(
          (value) => ({ status: "fulfilled", value }),
          (reason) => ({ status: "rejected", reason }),
        );
      let nestedObserved;
      let nestedOutcome;
      let firstOutcome;
      let entered = false;
      eventBus.on(topic, async () => {
        if (entered) return;
        entered = true;
        nestedObserved = observe(
          request(eventBus, "application:reset", {}, 0),
        ).then((outcome) => {
          nestedOutcome = outcome;
          return outcome;
        });
        await Promise.race([nestedObserved, escape.promise]);
        await ownListener.promise;
      });
      const firstObserved = observe(
        request(eventBus, "application:reset", {}, 0),
      ).then((outcome) => {
        firstOutcome = outcome;
        return outcome;
      });
      let acceptedRevisions;
      try {
        await vi.waitFor(() => expect(nestedOutcome?.status).toBe("rejected"));
        // Core RPC transports the documented reason in a new Error, not identity.
        expect(nestedOutcome.reason.message).toBe(exceptional.message);
        expect(firstOutcome).toBeUndefined();
        expect(cloneFailureCount).toBe(1);
        expect(publications).toEqual({ preferences: 1, data: 1 });
        expectSingleResetWrites(writes, removes, owners.defaultSettingsRaw);
        acceptedRevisions = {
          preferences: owners.preferences.getCurrentState().revision,
          data: owners.coordinator.getCurrentState().revision,
        };
      } finally {
        escape.resolve();
        ownListener.resolve();
        await firstObserved;
        if (nestedObserved) await nestedObserved;
        clone.mockRestore();
      }
      expect(firstOutcome.status).toBe("rejected");
      expect(firstOutcome.reason.message).toBe(exceptional.message);
      const retry = await request(eventBus, "application:reset", {}, 0);
      expect(retry).toMatchObject({
        success: true,
        receipt: {
          preferencesOwnerAdoption: { status: "complete", committed: true },
          dataOwnerAdoption: { status: "complete", committed: true },
        },
      });
      expectSingleResetWrites(writes, removes, owners.defaultSettingsRaw);
      expect(publications).toEqual({ preferences: 1, data: 1 });
      expect({
        preferences: owners.preferences.getCurrentState().revision,
        data: owners.coordinator.getCurrentState().revision,
      }).toEqual(acceptedRevisions);
    },
  );
});
