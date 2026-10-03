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

  it("coalesces overlapping valid actions but rejects caller receipts before joining the private saga", async () => {
    let release = () => {};
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    resetProjectPersistence.mockImplementationOnce(async () => {
      await gate;
      return {
        success: true,
        receipt: {
          rootClear: complete(),
          backupClear: complete(),
          resetSentinel: complete(),
        },
      };
    });
    service.init();
    const first = request(fixture.eventBus, "application:reset", {}, 0);
    const second = request(fixture.eventBus, "application:reset", {}, 0);
    await expect(
      request(fixture.eventBus, "application:reset", { receipt: {} }, 0),
    ).resolves.toMatchObject({
      success: false,
      stage: "validation",
      durable: false,
    });
    release();
    await expect(first).resolves.toMatchObject({ success: true });
    await expect(second).resolves.toMatchObject({ success: true });
    expect(runPreferencesResetTransition).toHaveBeenCalledOnce();
    expect(runDataResetTransition).toHaveBeenCalledOnce();
    expect(resetProjectPersistence).toHaveBeenCalledOnce();
    expect(resetPreferences).toHaveBeenCalledOnce();
    expect(adoptEmptyProject).toHaveBeenCalledOnce();
    expect(service).not.toHaveProperty("checkpoint");
  });

  it("joins completed reset work without inheriting the initiating action's required listeners", async () => {
    let releaseEscape;
    let releaseListener;
    const escape = new Promise((resolve) => {
      releaseEscape = resolve;
    });
    const listener = new Promise((resolve) => {
      releaseListener = resolve;
    });
    let nested;
    let nestedReply;
    let firstReply;
    const successfulPreferences = resetPreferences();
    resetPreferences.mockClear();
    resetPreferences.mockImplementationOnce(() => {
      nested = service.reset({});
      nested.then((result) => {
        nestedReply = result;
      });
      return {
        ...successfulPreferences,
        settlement: Promise.race([nested, escape]).then(() => listener),
      };
    });
    service.init();
    const first = service.reset({});
    first.then((result) => {
      firstReply = result;
    });
    try {
      await vi.waitFor(() => expect(nestedReply?.success).toBe(true));
      expect(firstReply).toBeUndefined();
      expect(nestedReply.receipt.dataOwnerAdoption).toEqual(complete());
      expect(resetProjectPersistence).toHaveBeenCalledOnce();
      expect(resetPreferences).toHaveBeenCalledOnce();
      expect(adoptEmptyProject).toHaveBeenCalledOnce();
    } finally {
      releaseEscape();
      releaseListener();
      await first;
      if (nested) await nested;
    }
    expect(firstReply.success).toBe(true);
    expect(firstReply).not.toBe(nestedReply);
    expect(firstReply.receipt).not.toBe(nestedReply.receipt);
  });

  it("reports rejecting initiating owner completion without attributing it to a joined caller that started no listeners", async () => {
    let rejectListener;
    const listener = new Promise((resolve, reject) => {
      rejectListener = reject;
    });
    const successfulPreferences = resetPreferences();
    resetPreferences.mockClear();
    resetPreferences.mockReturnValueOnce({
      ...successfulPreferences,
      settlement: listener,
    });
    service.init();
    let firstReply;
    let joinedReply;
    const first = service.reset({});
    first.then((result) => {
      firstReply = result;
    });
    const joined = service.reset({});
    joined.then((result) => {
      joinedReply = result;
    });
    try {
      await vi.waitFor(() => expect(joinedReply?.success).toBe(true));
      expect(firstReply).toBeUndefined();
      expect(joinedReply.receipt.dataOwnerAdoption).toEqual(complete());
    } finally {
      rejectListener(new Error("listener failed"));
      await first;
      await joined;
    }
    expect(firstReply).toMatchObject({
      success: false,
      stage: "preferencesOwnerAdoption",
      durable: true,
      params: { reason: "owner_settlement_failed" },
      receipt: { preferencesOwnerAdoption: complete() },
    });
    expect(resetProjectPersistence).toHaveBeenCalledOnce();
    expect(resetPreferences).toHaveBeenCalledOnce();
    expect(adoptEmptyProject).toHaveBeenCalledOnce();
  });

  it("settles overlapping callers on unavailable owners without admitting a caller receipt", async () => {
    service.runPreferencesResetTransition = null;
    service.init();
    const first = service.reset({});
    const joined = service.reset({});
    await expect(service.reset({ receipt: {} })).resolves.toMatchObject({
      success: false,
      stage: "validation",
      durable: false,
      params: { reason: "invalid_mutation_request" },
    });
    await expect(first).resolves.toMatchObject({
      success: false,
      durable: false,
      params: { reason: "application_reset_unavailable" },
    });
    await expect(joined).resolves.toMatchObject({
      success: false,
      durable: false,
      params: { reason: "application_reset_unavailable" },
    });
    expect(resetProjectPersistence).not.toHaveBeenCalled();
  });

  it("preserves the shared acknowledged prefix for callers admitted before teardown", async () => {
    let releaseProject;
    const project = new Promise((resolve) => {
      releaseProject = resolve;
    });
    resetProjectPersistence.mockImplementationOnce(async () => {
      await project;
      return {
        success: true,
        receipt: {
          rootClear: complete(),
          backupClear: complete(),
          resetSentinel: complete(),
        },
      };
    });
    service.init();
    const first = service.reset({});
    const joined = service.reset({});
    try {
      await vi.waitFor(() =>
        expect(resetProjectPersistence).toHaveBeenCalledOnce(),
      );
      service.destroy();
    } finally {
      releaseProject();
      await Promise.all([first, joined]);
    }
    for (const action of [first, joined]) {
      await expect(action).resolves.toMatchObject({
        success: false,
        durable: true,
        params: { reason: "operation_cancelled" },
        receipt: { rootClear: complete(), resetSentinel: complete() },
      });
    }
    expect(resetPreferences).not.toHaveBeenCalled();
    expect(adoptEmptyProject).not.toHaveBeenCalled();
  });

  it("installs shared admission before a synchronous owner capability can request reset", async () => {
    let nested;
    runPreferencesResetTransition.mockImplementationOnce((operation) => {
      nested = service.reset({});
      return operation({ resetPreferences, assertActive: vi.fn() });
    });
    service.init();
    const first = service.reset({});
    const results = await Promise.all([first, nested]);
    expect(results).toEqual([
      expect.objectContaining({ success: true }),
      expect.objectContaining({ success: true }),
    ]);
    expect(results[0]).not.toBe(results[1]);
    expect(runPreferencesResetTransition).toHaveBeenCalledOnce();
    expect(resetProjectPersistence).toHaveBeenCalledOnce();
    expect(resetPreferences).toHaveBeenCalledOnce();
    expect(adoptEmptyProject).toHaveBeenCalledOnce();
  });

  it("settles every joined exceptional rejection and releases admission", async () => {
    const error = new Error("injected internal clone failure");
    const clone = vi
      .spyOn(globalThis, "structuredClone")
      .mockImplementationOnce(() => {
        throw error;
      });
    service.init();
    try {
      const first = service.reset({});
      const joined = service.reset({});
      await expect(Promise.allSettled([first, joined])).resolves.toEqual([
        { status: "rejected", reason: error },
        { status: "rejected", reason: error },
      ]);
    } finally {
      clone.mockRestore();
    }
    await expect(service.reset({})).resolves.toMatchObject({ success: true });
  });

  it.each([
    { name: "Error", exceptional: new Error("reset bookkeeping failed") },
    { name: "null", exceptional: null },
    { name: "undefined", exceptional: undefined },
  ])(
    "rejects shared bookkeeping $name promptly but withholds the initiator until its own listener drains",
    async ({ exceptional }) => {
      let releaseEscape;
      let releaseListener;
      const escape = new Promise((resolve) => {
        releaseEscape = resolve;
      });
      const listener = new Promise((resolve) => {
        releaseListener = resolve;
      });
      const observe = (action) =>
        action.then(
          (value) => ({ status: "fulfilled", value }),
          (reason) => ({ status: "rejected", reason }),
        );
      let nestedObserved;
      let nestedOutcome;
      let firstOutcome;
      const successfulPreferences = resetPreferences();
      resetPreferences.mockClear();
      resetPreferences.mockImplementationOnce(() => {
        nestedObserved = observe(service.reset({})).then((outcome) => {
          nestedOutcome = outcome;
          return outcome;
        });
        return {
          ...successfulPreferences,
          settlement: Promise.race([nestedObserved, escape]).then(
            () => listener,
          ),
        };
      });
      const clone = vi
        .spyOn(globalThis, "structuredClone")
        .mockImplementationOnce(() => {
          throw exceptional;
        });
      service.init();
      const firstObserved = observe(service.reset({})).then((outcome) => {
        firstOutcome = outcome;
        return outcome;
      });
      try {
        await vi.waitFor(() => expect(nestedOutcome?.status).toBe("rejected"));
        expect(nestedOutcome.reason).toBe(exceptional);
        expect(firstOutcome).toBeUndefined();
        expect(resetProjectPersistence).toHaveBeenCalledOnce();
        expect(resetPreferences).toHaveBeenCalledOnce();
        expect(adoptEmptyProject).toHaveBeenCalledOnce();
      } finally {
        releaseEscape();
        releaseListener();
        await firstObserved;
        if (nestedObserved) await nestedObserved;
        clone.mockRestore();
      }
      expect(firstOutcome.status).toBe("rejected");
      expect(firstOutcome.reason).toBe(exceptional);
      await expect(service.reset({})).resolves.toMatchObject({ success: true });
    },
  );

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

  it("rejects direct reset after destroy without invoking an owner", async () => {
    service.init();
    service.destroy();
    await expect(service.reset({})).resolves.toMatchObject({
      success: false,
      durable: false,
      params: { reason: "operation_cancelled" },
    });
    expect(runPreferencesResetTransition).not.toHaveBeenCalled();
    expect(runDataResetTransition).not.toHaveBeenCalled();
  });

  it("revokes in-flight work after acknowledged project persistence without revoking durability", async () => {
    resetProjectPersistence.mockImplementationOnce(() => {
      service.destroy();
      return {
        success: true,
        receipt: {
          rootClear: complete(),
          backupClear: complete(),
          resetSentinel: complete(),
        },
      };
    });
    service.init();
    await expect(service.reset({})).resolves.toMatchObject({
      success: false,
      durable: true,
      params: { reason: "operation_cancelled" },
      receipt: {
        rootClear: complete(),
        backupClear: complete(),
        resetSentinel: complete(),
      },
    });
    expect(resetPreferences).not.toHaveBeenCalled();
    expect(adoptEmptyProject).not.toHaveBeenCalled();
  });
});
