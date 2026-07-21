import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import InterfaceModeService from "../../../src/js/components/services/InterfaceModeService.js";
import { createDataCoordinatorState } from "../../fixtures/core/componentState.js";
import { createRealEventBusFixture } from "../../fixtures/core/eventBus.js";
import {
  createInterfaceModeServiceHarness,
  deferred,
  profile,
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

  it("persists the captured profile before committing and broadcasting a switch", async () => {
    publishProfile("captain", "space");
    fixture.eventBusFixture.clearEventHistory();
    const write = deferred();
    const update = profileUpdateResponder(() => write.promise);

    const pending = service.request("environment:switch", { mode: "ground" });

    await vi.waitFor(() => expect(update).toHaveBeenCalledOnce());
    expect(update.mock.calls[0][0]).toEqual({
      profileId: "captain",
      properties: { currentEnvironment: "ground" },
    });
    expect(service.currentMode).toBe("space");
    expect(environmentEvents()).toEqual([]);

    write.resolve({ success: true });

    await expect(pending).resolves.toEqual({
      success: true,
      mode: "ground",
    });
    expect(service.currentMode).toBe("ground");
    expect(environmentEvents()).toEqual([
      {
        environment: "ground",
        toEnvironment: "ground",
        fromEnvironment: "space",
      },
    ]);
  });

  it("settles a successful switch only after synchronous environment listeners finish", async () => {
    const realFixture = await createRealEventBusFixture();
    const realService = new InterfaceModeService({
      eventBus: realFixture.eventBus,
    });
    const listenerStarted = deferred();
    const releaseListener = deferred();
    let listenerFinished = false;
    let requestSettled = false;
    let detachUpdate = () => {};
    let detachListener = () => {};

    try {
      realService.init();
      const selectedProfile = profile("captain", "space");
      realFixture.eventBus.emit("data:state-changed", {
        reason: "profile-switched",
        state: createDataCoordinatorState({
          authorityEpoch: 1,
          revision: 1,
          currentProfile: "captain",
          currentEnvironment: "space",
          currentProfileData: selectedProfile,
          profiles: { captain: selectedProfile },
        }),
      });
      realFixture.eventBus.emit("profile:switched", {
        fromProfile: null,
        toProfile: "captain",
        profileId: "captain",
        profile: selectedProfile,
        environment: "space",
        timestamp: Date.now(),
      });
      detachUpdate = realService.respond("data:update-profile", () => ({
        success: true,
      }));
      detachListener = realFixture.eventBus.on(
        "environment:changed",
        async () => {
          listenerStarted.resolve();
          await releaseListener.promise;
          listenerFinished = true;
        },
      );

      const pending = realService
        .request("environment:switch", { mode: "ground" })
        .finally(() => {
          requestSettled = true;
        });

      await listenerStarted.promise;
      await Promise.resolve();
      expect(requestSettled).toBe(false);
      expect(listenerFinished).toBe(false);

      releaseListener.resolve();
      await expect(pending).resolves.toEqual({
        success: true,
        mode: "ground",
      });
      expect(listenerFinished).toBe(true);
    } finally {
      releaseListener.resolve();
      detachListener();
      detachUpdate();
      if (!realService.destroyed) realService.destroy();
      realFixture.destroy();
    }
  });

  it("settles an owner-published switch only after synchronous environment listeners finish", async () => {
    const realFixture = await createRealEventBusFixture();
    const realService = new InterfaceModeService({
      eventBus: realFixture.eventBus,
    });
    const listenerStarted = deferred();
    const releaseListener = deferred();
    let listenerFinished = false;
    let requestSettled = false;
    let detachUpdate = () => {};
    let detachListener = () => {};

    try {
      realService.init();
      const selectedProfile = profile("captain", "space");
      realFixture.eventBus.emit("data:state-changed", {
        reason: "profile-switched",
        state: createDataCoordinatorState({
          authorityEpoch: 1,
          revision: 1,
          currentProfile: "captain",
          currentEnvironment: "space",
          currentProfileData: selectedProfile,
          profiles: { captain: selectedProfile },
        }),
      });
      detachUpdate = realService.respond(
        "data:update-profile",
        ({ properties }) => {
          const acceptedProfile = profile(
            "captain",
            properties.currentEnvironment,
          );
          realFixture.eventBus.emit("data:state-changed", {
            reason: "profile-updated",
            state: createDataCoordinatorState({
              authorityEpoch: 1,
              revision: 2,
              currentProfile: "captain",
              currentEnvironment: properties.currentEnvironment,
              currentProfileData: acceptedProfile,
              profiles: { captain: acceptedProfile },
            }),
          });
          return { success: true, profile: acceptedProfile };
        },
      );
      detachListener = realFixture.eventBus.on(
        "environment:changed",
        async () => {
          listenerStarted.resolve();
          await releaseListener.promise;
          listenerFinished = true;
        },
      );

      const pending = realService
        .request("environment:switch", { mode: "ground" })
        .finally(() => {
          requestSettled = true;
        });

      await listenerStarted.promise;
      await Promise.resolve();
      expect(realService.cache.dataState).toMatchObject({
        revision: 2,
        currentEnvironment: "ground",
      });
      expect(realService.currentMode).toBe("ground");
      expect(requestSettled).toBe(false);
      expect(listenerFinished).toBe(false);

      releaseListener.resolve();
      await expect(pending).resolves.toEqual({
        success: true,
        mode: "ground",
      });
      expect(listenerFinished).toBe(true);
    } finally {
      releaseListener.resolve();
      detachListener();
      detachUpdate();
      if (!realService.destroyed) realService.destroy();
      realFixture.destroy();
    }
  });

  it.each([
    [undefined, "missing mode"],
    [null, "null mode"],
    ["", "empty mode"],
    ["sector", "unknown mode"],
    [{ environment: "ground" }, "non-string mode"],
  ])("rejects %s as an invalid environment", async (mode) => {
    publishProfile("captain", "space");
    fixture.eventBusFixture.clearEventHistory();
    const update = profileUpdateResponder();

    await expect(
      service.request("environment:switch", { mode }),
    ).resolves.toEqual({
      success: false,
      error: "invalid_environment",
    });
    expect(service.currentMode).toBe("space");
    expect(update).not.toHaveBeenCalled();
    expect(environmentEvents()).toEqual([]);
  });

  it("returns a coded failure when no profile is selected", async () => {
    const update = profileUpdateResponder();
    fixture.eventBusFixture.clearEventHistory();

    await expect(
      service.request("environment:switch", { mode: "ground" }),
    ).resolves.toEqual({
      success: false,
      error: "no_profile_selected",
    });
    expect(service.currentMode).toBe("space");
    expect(update).not.toHaveBeenCalled();
    expect(environmentEvents()).toEqual([]);
  });

  it.each([
    ["a resolved failure", () => ({ success: false, error: "write_failed" })],
    ["a rejected write", () => Promise.reject(new Error("disk full"))],
  ])("does not publish or adopt a mode after %s", async (_label, persist) => {
    publishProfile("captain", "space");
    fixture.eventBusFixture.clearEventHistory();
    const update = profileUpdateResponder(persist);

    await expect(
      service.request("environment:switch", { mode: "ground" }),
    ).resolves.toEqual({
      success: false,
      error: "failed_to_save_profile",
    });
    expect(update).toHaveBeenCalledOnce();
    expect(service.currentMode).toBe("space");
    expect(environmentEvents()).toEqual([]);
  });

  it("treats a same-mode request as a successful no-op", async () => {
    publishProfile("captain", "space");
    fixture.eventBusFixture.clearEventHistory();
    const update = profileUpdateResponder();

    await expect(
      service.request("environment:switch", { mode: "space" }),
    ).resolves.toEqual({ success: true, mode: "space" });
    expect(update).not.toHaveBeenCalled();
    expect(environmentEvents()).toEqual([]);
  });

  it("treats a same-mode request as a successful no-op in ready no-profile state", async () => {
    publishCoordinatorState({
      profileId: null,
      environment: "space",
      reason: "storage-reset",
    });
    fixture.eventBusFixture.clearEventHistory();
    const update = profileUpdateResponder();

    await expect(
      service.request("environment:switch", { mode: "space" }),
    ).resolves.toEqual({ success: true, mode: "space" });
    expect(update).not.toHaveBeenCalled();
    expect(environmentEvents()).toEqual([]);
  });

  it("returns a coded failure for a different mode in ready no-profile state", async () => {
    publishCoordinatorState({
      profileId: null,
      environment: "space",
      reason: "storage-reset",
    });
    fixture.eventBusFixture.clearEventHistory();
    const update = profileUpdateResponder();

    await expect(
      service.request("environment:switch", { mode: "ground" }),
    ).resolves.toEqual({
      success: false,
      error: "no_profile_selected",
    });
    expect(service.currentMode).toBe("space");
    expect(update).not.toHaveBeenCalled();
    expect(environmentEvents()).toEqual([]);
  });

  it("publishes one exact compatibility event for profile, reset, and late-join adoption", () => {
    const update = profileUpdateResponder();

    publishProfile("captain", "ground");
    expect(service.currentMode).toBe("ground");
    expect(environmentEvents()).toEqual([
      {
        environment: "ground",
        toEnvironment: "ground",
        fromEnvironment: "space",
      },
    ]);

    fixture.eventBusFixture.clearEventHistory();
    publishCoordinatorState({
      profileId: null,
      environment: "space",
      reason: "storage-reset",
    });
    fixture.eventBus.emit("profile:switched", {
      profileId: null,
      profile: null,
      environment: "space",
      updateSource: "DataCoordinator-Reset",
    });
    expect(service.currentMode).toBe("space");
    expect(environmentEvents()).toEqual([
      { environment: "space", isInitialization: true },
    ]);

    fixture.eventBusFixture.clearEventHistory();
    const lateProfile = profile("late", "alias");
    const lateJoin = {
      sender: "DataCoordinator",
      state: createDataCoordinatorState({
        authorityEpoch: 2,
        currentProfile: "late",
        currentEnvironment: "alias",
        currentProfileData: lateProfile,
        profiles: { late: lateProfile },
      }),
    };
    service._onInitialState(lateJoin);
    expect(service.currentMode).toBe("alias");
    expect(environmentEvents()).toEqual([
      { environment: "alias", isInitialization: true },
    ]);
    expect(update).not.toHaveBeenCalled();
  });
});
