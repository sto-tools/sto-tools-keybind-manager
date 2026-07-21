import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createInterfaceModeServiceHarness,
  deferred,
} from "./interfaceModeServiceTestHarness.js";

describe("InterfaceModeService", () => {
  let harness;
  let fixture;
  let service;
  let publishCoordinatorState;
  let publishProfile;
  let profileUpdateResponder;
  let environmentEvents;

  beforeEach(() => {
    harness = createInterfaceModeServiceHarness();
    ({
      fixture,
      service,
      publishCoordinatorState,
      publishProfile,
      profileUpdateResponder,
      environmentEvents,
    } = harness);
  });

  afterEach(() => {
    harness.destroy();
  });

  it("continues a queued switch after the pending write reports failure", async () => {
    publishProfile("captain", "space");
    fixture.eventBusFixture.clearEventHistory();
    const firstWrite = deferred();
    const update = profileUpdateResponder((payload) =>
      payload.properties.currentEnvironment === "ground"
        ? firstWrite.promise
        : { success: true },
    );

    const failed = service.request("environment:switch", { mode: "ground" });
    const queued = service.request("environment:switch", { mode: "alias" });
    await vi.waitFor(() => expect(update).toHaveBeenCalledOnce());

    firstWrite.resolve({ success: false, error: "write_failed" });

    await expect(failed).resolves.toEqual({
      success: false,
      error: "failed_to_save_profile",
    });
    await expect(queued).resolves.toEqual({ success: true, mode: "alias" });
    expect(update).toHaveBeenCalledTimes(2);
    expect(update.mock.calls[1][0]).toEqual({
      profileId: "captain",
      properties: { currentEnvironment: "alias" },
    });
    expect(service.currentMode).toBe("alias");
    expect(environmentEvents()).toEqual([
      {
        environment: "alias",
        toEnvironment: "alias",
        fromEnvironment: "space",
      },
    ]);
  });

  it("serializes overlapping requests in invocation order", async () => {
    publishProfile("captain", "space");
    fixture.eventBusFixture.clearEventHistory();
    const firstWrite = deferred();
    const secondWrite = deferred();
    const update = profileUpdateResponder((payload) =>
      payload.properties.currentEnvironment === "ground"
        ? firstWrite.promise
        : secondWrite.promise,
    );

    const first = service.request("environment:switch", { mode: "ground" });
    const second = service.request("environment:switch", { mode: "alias" });

    await vi.waitFor(() => expect(update).toHaveBeenCalledOnce());
    expect(update.mock.calls[0][0]).toEqual({
      profileId: "captain",
      properties: { currentEnvironment: "ground" },
    });

    firstWrite.resolve({ success: true });
    await vi.waitFor(() => expect(update).toHaveBeenCalledTimes(2));
    expect(update.mock.calls[1][0]).toEqual({
      profileId: "captain",
      properties: { currentEnvironment: "alias" },
    });

    secondWrite.resolve({ success: true });
    await expect(Promise.all([first, second])).resolves.toEqual([
      { success: true, mode: "ground" },
      { success: true, mode: "alias" },
    ]);
    expect(service.currentMode).toBe("alias");
    expect(environmentEvents()).toEqual([
      {
        environment: "ground",
        toEnvironment: "ground",
        fromEnvironment: "space",
      },
      {
        environment: "alias",
        toEnvironment: "alias",
        fromEnvironment: "ground",
      },
    ]);
  });

  it("adopts an unrelated accepted target while the requested write later fails", async () => {
    publishProfile("captain", "space");
    fixture.eventBusFixture.clearEventHistory();
    const write = deferred();
    const update = profileUpdateResponder(() => write.promise);

    const pending = service.request("environment:switch", { mode: "ground" });
    await vi.waitFor(() => expect(update).toHaveBeenCalledOnce());

    publishCoordinatorState({
      profileId: "captain",
      environment: "ground",
      reason: "profile-updated",
    });
    expect(service.currentMode).toBe("ground");
    expect(environmentEvents()).toEqual([
      {
        environment: "ground",
        toEnvironment: "ground",
        fromEnvironment: "space",
      },
    ]);

    write.resolve({ success: false, error: "write_failed" });
    await expect(pending).resolves.toEqual({
      success: false,
      error: "failed_to_save_profile",
    });
    expect(service.currentMode).toBe("ground");
    expect(environmentEvents()).toHaveLength(1);
  });

  it("cancels a successful pending write after a newer snapshot accepts another mode", async () => {
    publishProfile("captain", "space");
    fixture.eventBusFixture.clearEventHistory();
    const write = deferred();
    const update = profileUpdateResponder(() => write.promise);

    const pending = service.request("environment:switch", { mode: "ground" });
    await vi.waitFor(() => expect(update).toHaveBeenCalledOnce());

    publishCoordinatorState({
      profileId: "captain",
      environment: "alias",
      reason: "profile-updated",
    });
    expect(service.currentMode).toBe("alias");
    expect(environmentEvents()).toEqual([
      {
        environment: "alias",
        toEnvironment: "alias",
        fromEnvironment: "space",
      },
    ]);

    write.resolve({ success: true });
    await expect(pending).resolves.toEqual({
      success: false,
      error: "operation_cancelled",
    });
    expect(service.currentMode).toBe("alias");
    expect(environmentEvents()).toHaveLength(1);
  });

  it("cancels an in-flight completion after a same-ID state reload replaces the profile", async () => {
    publishProfile("captain", "space");
    fixture.eventBusFixture.clearEventHistory();
    const write = deferred();
    const update = profileUpdateResponder(() => write.promise);

    const pending = service.request("environment:switch", { mode: "ground" });
    await vi.waitFor(() => expect(update).toHaveBeenCalledOnce());

    const reloadedProfile = publishCoordinatorState({
      profileId: "captain",
      environment: "alias",
      reason: "state-reloaded",
    });
    fixture.eventBus.emit("profile:switched", {
      fromProfile: null,
      toProfile: "captain",
      profileId: "captain",
      profile: reloadedProfile,
      environment: "alias",
      timestamp: Date.now(),
    });
    expect(service.currentMode).toBe("alias");
    expect(environmentEvents()).toEqual([]);

    const reloadEnvironment = {
      fromEnvironment: null,
      toEnvironment: "alias",
      environment: "alias",
      timestamp: Date.now(),
    };
    fixture.eventBus.emit("environment:changed", reloadEnvironment);
    expect(environmentEvents()).toEqual([reloadEnvironment]);

    write.resolve({ success: true });
    await expect(pending).resolves.toEqual({
      success: false,
      error: "operation_cancelled",
    });
    expect(service.currentMode).toBe("alias");
    expect(environmentEvents()).toHaveLength(1);
  });

  it("cancels an in-flight completion after a same-ID complete profile replacement", async () => {
    publishProfile("captain", "space");
    fixture.eventBusFixture.clearEventHistory();
    const write = deferred();
    const update = profileUpdateResponder(() => write.promise);

    const pending = service.request("environment:switch", { mode: "ground" });
    await vi.waitFor(() => expect(update).toHaveBeenCalledOnce());

    publishCoordinatorState({
      profileId: "captain",
      environment: "ground",
      reason: "profile-replaced",
    });
    expect(service.currentMode).toBe("ground");
    expect(environmentEvents()).toHaveLength(1);

    write.resolve({ success: true });
    await expect(pending).resolves.toEqual({
      success: false,
      error: "operation_cancelled",
    });
    expect(service.currentMode).toBe("ground");
    expect(environmentEvents()).toHaveLength(1);
  });

  it("does not cancel an accepted switch when an unrelated profile is deleted", async () => {
    publishProfile("captain", "space");
    fixture.eventBusFixture.clearEventHistory();
    const write = deferred();
    const update = profileUpdateResponder(() => write.promise);

    const pending = service.request("environment:switch", { mode: "ground" });
    await vi.waitFor(() => expect(update).toHaveBeenCalledOnce());

    publishCoordinatorState({
      profileId: "captain",
      environment: "ground",
      reason: "profile-deleted",
    });
    write.resolve({ success: true });

    await expect(pending).resolves.toEqual({
      success: true,
      mode: "ground",
    });
    expect(service.currentMode).toBe("ground");
    expect(environmentEvents()).toHaveLength(1);
  });

  it("does not cancel an accepted switch when a non-current profile is replaced", async () => {
    publishProfile("captain", "space");
    fixture.eventBusFixture.clearEventHistory();
    const write = deferred();
    const update = profileUpdateResponder(() => write.promise);

    const pending = service.request("environment:switch", { mode: "ground" });
    await vi.waitFor(() => expect(update).toHaveBeenCalledOnce());

    publishCoordinatorState({
      profileId: "captain",
      changedProfileId: "reserve",
      environment: "ground",
      reason: "profile-replaced",
    });
    write.resolve({ success: true });

    await expect(pending).resolves.toEqual({
      success: true,
      mode: "ground",
    });
    expect(service.currentMode).toBe("ground");
    expect(environmentEvents()).toHaveLength(1);
  });

  it("adopts a direct coordinator environment commit without duplicating its compatibility event", () => {
    publishProfile("captain", "space");
    fixture.eventBusFixture.clearEventHistory();

    publishCoordinatorState({
      profileId: "captain",
      environment: "ground",
      reason: "environment-changed",
    });
    expect(service.currentMode).toBe("ground");
    expect(environmentEvents()).toEqual([]);

    const ownerEvent = {
      fromEnvironment: "space",
      toEnvironment: "ground",
      environment: "ground",
      timestamp: Date.now(),
    };
    fixture.eventBus.emit("environment:changed", ownerEvent);
    expect(environmentEvents()).toEqual([ownerEvent]);
  });

  it("suppresses a stale completion after the active profile is replaced", async () => {
    publishProfile("captain", "space");
    fixture.eventBusFixture.clearEventHistory();
    const write = deferred();
    const update = profileUpdateResponder(() => write.promise);

    const pending = service.request("environment:switch", { mode: "ground" });
    await vi.waitFor(() => expect(update).toHaveBeenCalledOnce());

    publishProfile("replacement", "alias");
    expect(service.currentMode).toBe("alias");
    expect(update).toHaveBeenCalledOnce();
    fixture.eventBusFixture.clearEventHistory();

    write.resolve({ success: true });

    await expect(pending).resolves.toEqual({
      success: false,
      error: "operation_cancelled",
    });
    expect(service.currentMode).toBe("alias");
    expect(environmentEvents()).toEqual([]);
  });

  it("cancels a stale queued request after the active profile changes", async () => {
    publishProfile("captain", "space");
    fixture.eventBusFixture.clearEventHistory();
    const firstWrite = deferred();
    const update = profileUpdateResponder(() => firstWrite.promise);

    const active = service.request("environment:switch", { mode: "ground" });
    const queued = service.request("environment:switch", { mode: "alias" });
    await vi.waitFor(() => expect(update).toHaveBeenCalledOnce());

    publishProfile("replacement", "alias");
    expect(service.currentMode).toBe("alias");
    fixture.eventBusFixture.clearEventHistory();

    firstWrite.resolve({ success: true });
    await expect(Promise.all([active, queued])).resolves.toEqual([
      { success: false, error: "operation_cancelled" },
      { success: false, error: "operation_cancelled" },
    ]);
    expect(update).toHaveBeenCalledOnce();
    expect(service.currentMode).toBe("alias");
    expect(environmentEvents()).toEqual([]);
  });

  it("re-registers one responder and suppresses an earlier lifecycle completion", async () => {
    publishProfile("captain", "space");
    fixture.eventBusFixture.clearEventHistory();
    const oldWrite = deferred();
    const update = profileUpdateResponder((payload) =>
      payload.properties.currentEnvironment === "ground"
        ? oldWrite.promise
        : { success: true },
    );
    expect(fixture.eventBus.getListenerCount("rpc:environment:switch")).toBe(1);

    const stale = service.request("environment:switch", { mode: "ground" });
    await vi.waitFor(() => expect(update).toHaveBeenCalledOnce());

    service.destroy();
    expect(fixture.eventBus.getListenerCount("rpc:environment:switch")).toBe(0);
    service.init();
    expect(fixture.eventBus.getListenerCount("rpc:environment:switch")).toBe(1);
    publishProfile("captain", "space");
    fixture.eventBusFixture.clearEventHistory();

    oldWrite.resolve({ success: true });
    await expect(stale).resolves.toEqual({
      success: false,
      error: "operation_cancelled",
    });
    expect(service.currentMode).toBe("space");
    expect(environmentEvents()).toEqual([]);

    await expect(
      service.request("environment:switch", { mode: "alias" }),
    ).resolves.toEqual({ success: true, mode: "alias" });
    expect(update).toHaveBeenCalledTimes(2);
    expect(fixture.eventBus.getListenerCount("rpc:environment:switch")).toBe(1);
    expect(environmentEvents()).toEqual([
      {
        environment: "alias",
        toEnvironment: "alias",
        fromEnvironment: "space",
      },
    ]);
  });
});
