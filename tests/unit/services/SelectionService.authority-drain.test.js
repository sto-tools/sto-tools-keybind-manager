import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SelectionService from "../../../src/js/components/services/SelectionService.js";
import { createDataCoordinatorState } from "../../fixtures/core/componentState.js";
import { createServiceFixture } from "../../fixtures/index.js";

const profile = {
  id: "captain",
  name: "Captain",
  builds: {
    space: { keys: { S0: [], S1: [], Imported: [] } },
    ground: { keys: {} },
  },
  aliases: {},
  selections: { space: "S0" },
};
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

describe("SelectionService admitted correction authority drain", () => {
  let fixture, service, oldWrite, durable;
  function publish(authorityEpoch, revision, selections) {
    fixture.eventBus.emit("data:state-changed", {
      reason: "test-owner-commit",
      state: createDataCoordinatorState({
        authorityEpoch,
        revision,
        currentProfile: "captain",
        currentProfileData: { ...profile, selections },
      }),
    });
  }
  beforeEach(() => {
    fixture = createServiceFixture();
    service = new SelectionService({ eventBus: fixture.eventBus });
    service.init();
    publish(41, 1, profile.selections);
    oldWrite = deferred();
    durable = { ...profile.selections };
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(async () => {
    oldWrite.resolve();
    service.destroy();
    await service.selectionPersistenceSettled;
    fixture.destroy();
    vi.restoreAllMocks();
  });

  it.each(["success", "rejection", "malformed receipt"])(
    "uses the acknowledged revision for an admitted correction and cleans up after %s",
    async (outcome) => {
      const calls = [];
      service.request = vi.fn(async (_topic, payload) => {
        calls.push(structuredClone(payload));
        if (calls.length === 1) {
          await oldWrite.promise;
          durable = { ...payload.updates.properties.selections };
          publish(41, 3, durable);
          return {
            success: true,
            profile: { ...profile, selections: durable },
          };
        }
        expect(payload.precondition).toEqual({
          authorityEpoch: 41,
          revision: 3,
        });
        if (outcome === "rejection") throw new Error("write rejected");
        if (outcome === "malformed receipt") return { success: true };
        durable = { ...payload.updates.properties.selections };
        publish(41, 4, durable);
        return { success: true, profile: { ...profile, selections: durable } };
      });
      const pending = service.selectKey("S1");
      await vi.waitFor(() => expect(calls).toHaveLength(1));
      expect(calls[0].precondition).toEqual({
        authorityEpoch: 41,
        revision: 1,
      });
      service.selectionPersistence.reset("captain", { space: "Imported" });
      const beforeDestroy = structuredClone(service.cache);
      service.destroy();
      const publishSelection = vi.spyOn(service, "broadcastState");
      expect(fixture.eventBus.getListenerCount("data:state-changed")).toBe(1);
      await expect(
        service.selectionPersistence.persist("captain", "space", "S0"),
      ).resolves.toBe(false);
      oldWrite.resolve();
      await pending;
      await service.selectionPersistenceSettled;
      expect(calls).toHaveLength(2);
      expect(calls[1].updates.properties.selections).toEqual({
        space: "Imported",
      });
      expect(durable).toEqual({
        space: outcome === "success" ? "Imported" : "S1",
      });
      expect(service.cache).toEqual(beforeDestroy);
      expect(publishSelection).not.toHaveBeenCalled();
      expect(fixture.eventBus.getListenerCount("data:state-changed")).toBe(0);
    },
  );

  it("rejects a replacement authority without reviving disposed cache or issuing a correction", async () => {
    service.request = vi.fn(async (_topic, payload) => {
      await oldWrite.promise;
      durable = { ...payload.updates.properties.selections };
      publish(41, 3, durable);
      return { success: true, profile: { ...profile, selections: durable } };
    });
    const pending = service.selectKey("S1");
    await vi.waitFor(() => expect(service.request).toHaveBeenCalledOnce());
    service.selectionPersistence.reset("captain", { space: "Imported" });
    service.destroy();
    const before = structuredClone(service.cache);
    publish(42, 0, { space: "Replacement" });
    oldWrite.resolve();
    await pending;
    await service.selectionPersistenceSettled;
    expect(service.request).toHaveBeenCalledOnce();
    expect(service.cache).toEqual(before);
    expect(durable).toEqual({ space: "S1" });
    expect(console.warn).toHaveBeenCalled();
    expect(fixture.eventBus.getListenerCount("data:state-changed")).toBe(0);
  });

  it("rejects rather than retargeting a fresh intent behind the old authority drain", async () => {
    const calls = [];
    service.request = vi.fn(async (_topic, payload) => {
      calls.push(structuredClone(payload));
      await oldWrite.promise;
      durable = { ...payload.updates.properties.selections };
      return { success: true, profile: { ...profile, selections: durable } };
    });
    const oldPending = service.selectKey("S1");
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    service.selectionPersistence.reset("captain", { space: "Imported" });
    service.destroy();
    const oldSettled = service.selectionPersistenceSettled;
    service.init();
    const freshAuthority = service.selectionPersistenceAuthority;
    const freshPrecondition = vi.spyOn(freshAuthority, "precondition");
    const freshPending = service.selectKey("Imported", null, {
      forceEmit: true,
    });
    await Promise.resolve();
    expect(calls.map(({ precondition }) => precondition)).toEqual([
      { authorityEpoch: 41, revision: 1 },
    ]);
    expect(freshPrecondition).not.toHaveBeenCalled();

    publish(42, 0, { space: "S0" });
    oldWrite.resolve();
    await oldPending;
    await oldSettled;
    await expect(freshPending).resolves.toBe("S0");

    expect(
      calls.map(({ precondition, updates }) => ({
        precondition,
        selections: updates.properties.selections,
      })),
    ).toEqual([
      {
        precondition: { authorityEpoch: 41, revision: 1 },
        selections: { space: "S1" },
      },
    ]);
    expect(calls).not.toContainEqual(
      expect.objectContaining({
        updates: { properties: { selections: { space: "Imported" } } },
      }),
    );
    expect(freshPrecondition).not.toHaveBeenCalled();
    expect(durable).toEqual({ space: "S1" });
    expect(console.warn).toHaveBeenCalled();
  });

  it("accepts fresh selections after destroy and same-instance reinitialization", async () => {
    service.destroy();
    await service.selectionPersistenceSettled;
    service.init();
    publish(41, 2, profile.selections);
    service.request = vi.fn(async (_topic, payload) => {
      expect(payload.precondition).toEqual({ authorityEpoch: 41, revision: 2 });
      durable = { ...payload.updates.properties.selections };
      publish(41, 3, durable);
      return { success: true, profile: { ...profile, selections: durable } };
    });
    await expect(service.selectKey("S1")).resolves.toBe("S1");
    expect(service.request).toHaveBeenCalledOnce();
    expect(durable).toEqual({ space: "S1" });
    expect(service.cache.selectedKey).toBe("S1");
  });
});
