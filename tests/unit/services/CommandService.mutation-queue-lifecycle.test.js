import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import CommandChainService from "../../../src/js/components/services/CommandChainService.js";
import CommandService from "../../../src/js/components/services/CommandService.js";
import { applyProfileOperations } from "../../../src/js/components/services/profileOperations.js";
import { createDataCoordinatorState } from "../../fixtures/core/componentState.js";
import { createServiceFixture } from "../../fixtures/index.js";

function createProfile() {
  return {
    id: "captain",
    name: "Captain",
    currentEnvironment: "space",
    builds: {
      space: { keys: { F1: ["One", "Two"] } },
      ground: { keys: { G1: ["GroundOne", "GroundTwo"] } },
    },
    aliases: {},
    bindsets: {},
  };
}

function deferred() {
  let resolve;
  const promise = new Promise((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

describe("CommandService mutation queue and lifecycle", () => {
  let fixture;
  let chainService;
  let service;
  let profile;
  let revision;

  const publish = ({
    currentProfile = "captain",
    currentEnvironment = "space",
    profiles = { captain: profile },
  } = {}) => {
    revision += 1;
    fixture.eventBus.emit("data:state-changed", {
      reason: "test-owner-commit",
      state: createDataCoordinatorState({
        authorityEpoch: 50,
        revision,
        currentProfile,
        currentEnvironment,
        currentProfileData: profiles[currentProfile] || null,
        profiles,
      }),
    });
  };

  beforeEach(() => {
    fixture = createServiceFixture();
    profile = createProfile();
    revision = 0;
    service = new CommandService({
      eventBus: fixture.eventBus,
      i18n: { t: (key) => key },
      ui: { showToast: vi.fn() },
    });
    chainService = new CommandChainService({
      eventBus: fixture.eventBus,
      i18n: { t: (key) => key },
    });
    service.init();
    chainService.init();
    publish();
    fixture.eventBusFixture.clearEventHistory();
  });

  const captureEditTarget = (overrides = {}) => {
    const snapshot = service.cache.dataState;
    return Object.freeze({
      authorityEpoch: snapshot.authorityEpoch,
      revision: snapshot.revision,
      profileId: snapshot.currentProfile,
      environment: snapshot.currentEnvironment,
      name: "F1",
      bindset: null,
      index: 0,
      originalEntry: structuredClone(
        snapshot.profiles.captain.builds.space.keys.F1[0],
      ),
      ...overrides,
    });
  };

  afterEach(() => {
    if (!chainService.destroyed) chainService.destroy();
    if (!service.destroyed) service.destroy();
    fixture.destroy();
    vi.restoreAllMocks();
  });

  it("plans overlapping additions in queue order from each accepted owner commit", async () => {
    const firstWrite = deferred();
    const requests = [];
    service.request = vi.fn(async (_topic, payload) => {
      requests.push(structuredClone(payload));
      if (requests.length === 1) await firstWrite.promise;
      profile = applyProfileOperations(profile, payload);
      publish();
      return { success: true };
    });

    const first = service.addCommand("F1", "Three");
    const second = service.addCommand("F1", "Four");

    await vi.waitFor(() => expect(service.request).toHaveBeenCalledOnce());
    expect(requests[0]).toEqual({
      profileId: "captain",
      modify: {
        builds: { space: { keys: { F1: ["One", "Two", "Three"] } } },
      },
    });
    firstWrite.resolve();

    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
    expect(service.request).toHaveBeenCalledTimes(2);
    expect(requests[1]).toEqual({
      profileId: "captain",
      modify: {
        builds: {
          space: { keys: { F1: ["One", "Two", "Three", "Four"] } },
        },
      },
    });
    expect(profile.builds.space.keys.F1).toEqual([
      "One",
      "Two",
      "Three",
      "Four",
    ]);
  });

  it("rejects a targeted edit when an earlier queued write commits first", async () => {
    const firstWrite = deferred();
    const requests = [];
    service.request = vi.fn(async (_topic, payload) => {
      requests.push(structuredClone(payload));
      await firstWrite.promise;
      profile = applyProfileOperations(profile, payload);
      publish();
      return { success: true };
    });
    const edited = vi.fn();
    fixture.eventBus.on("command-edited", edited);
    const target = captureEditTarget();

    const first = service.editCommand("F1", 0, "Intervening");
    const stale = service.editCommand("F1", 0, "UserEdit", null, target);
    await vi.waitFor(() => expect(service.request).toHaveBeenCalledOnce());
    firstWrite.resolve();

    await expect(Promise.all([first, stale])).resolves.toEqual([true, false]);
    expect(service.request).toHaveBeenCalledOnce();
    expect(requests[0]).toEqual({
      profileId: "captain",
      modify: {
        builds: { space: { keys: { F1: ["Intervening", "Two"] } } },
      },
    });
    expect(profile.builds.space.keys.F1).toEqual(["Intervening", "Two"]);
    expect(edited).toHaveBeenCalledOnce();
    expect(edited.mock.calls[0][0].updatedCommand).toBe("Intervening");
    expect(service.ui.showToast).toHaveBeenCalledOnce();
    expect(service.ui.showToast).toHaveBeenCalledWith(
      "command_edit_target_changed",
      "warning",
    );
  });

  it("preserves targetless edits queued behind an accepted write", async () => {
    const firstWrite = deferred();
    const requests = [];
    service.request = vi.fn(async (_topic, payload) => {
      requests.push(structuredClone(payload));
      if (requests.length === 1) await firstWrite.promise;
      profile = applyProfileOperations(profile, payload);
      publish();
      return { success: true };
    });

    const first = service.addCommand("F1", "Three");
    const legacyEdit = service.editCommand("F1", 0, "Changed");
    await vi.waitFor(() => expect(service.request).toHaveBeenCalledOnce());
    firstWrite.resolve();

    await expect(Promise.all([first, legacyEdit])).resolves.toEqual([
      true,
      true,
    ]);
    expect(requests).toEqual([
      {
        profileId: "captain",
        modify: {
          builds: { space: { keys: { F1: ["One", "Two", "Three"] } } },
        },
      },
      {
        profileId: "captain",
        modify: {
          builds: {
            space: { keys: { F1: ["Changed", "Two", "Three"] } },
          },
        },
      },
    ]);
    expect(profile.builds.space.keys.F1).toEqual(["Changed", "Two", "Three"]);
    expect(service.ui.showToast).not.toHaveBeenCalled();
  });

  it("keeps queued work attached to its invocation profile and environment", async () => {
    const firstWrite = deferred();
    const requests = [];
    const replacement = {
      id: "replacement",
      name: "Replacement",
      currentEnvironment: "ground",
      builds: {
        space: { keys: {} },
        ground: { keys: { G1: ["ReplacementGround"] } },
      },
      aliases: {},
      bindsets: {},
    };
    service.request = vi.fn(async (_topic, payload) => {
      requests.push(structuredClone(payload));
      if (requests.length === 1) await firstWrite.promise;
      profile = applyProfileOperations(profile, payload);
      publish({
        currentProfile: "replacement",
        currentEnvironment: "ground",
        profiles: { captain: profile, replacement },
      });
      return { success: true };
    });
    const added = vi.fn();
    fixture.eventBus.on("command-added", added);

    const first = service.addCommand("F1", "FirstQueuedWrite");
    const second = service.addCommand("F1", "SecondQueuedWrite");
    await vi.waitFor(() => expect(service.request).toHaveBeenCalledOnce());
    publish({
      currentProfile: "replacement",
      currentEnvironment: "ground",
      profiles: { captain: profile, replacement },
    });
    firstWrite.resolve();

    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
    expect(requests).toEqual([
      {
        profileId: "captain",
        modify: {
          builds: {
            space: {
              keys: { F1: ["One", "Two", "FirstQueuedWrite"] },
            },
          },
        },
      },
      {
        profileId: "captain",
        modify: {
          builds: {
            space: {
              keys: {
                F1: ["One", "Two", "FirstQueuedWrite", "SecondQueuedWrite"],
              },
            },
          },
        },
      },
    ]);
    expect(profile.builds.space.keys.F1).toEqual([
      "One",
      "Two",
      "FirstQueuedWrite",
      "SecondQueuedWrite",
    ]);
    expect(replacement.builds.ground.keys.G1).toEqual(["ReplacementGround"]);
    expect(added).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: "move",
      invoke: (current) => current.moveCommand("F1", 0, 1),
      topic: "command-moved",
    },
    {
      label: "edit",
      invoke: (current) => current.editCommand("F1", 0, "Changed"),
      topic: "command-edited",
    },
    {
      label: "delete",
      invoke: (current) => current.deleteCommand("F1", 0),
      topic: "command-deleted",
    },
  ])(
    "suppresses the captured $label event when its profile and environment are no longer current",
    async ({ invoke, topic }) => {
      const write = deferred();
      service.request = vi.fn(() => write.promise);
      const listener = vi.fn();
      const chainChanged = vi.fn();
      fixture.eventBus.on(topic, listener);
      fixture.eventBus.on("chain-data-changed", chainChanged);
      const pending = invoke(service);
      await vi.waitFor(() => expect(service.request).toHaveBeenCalledOnce());

      const replacement = {
        id: "replacement",
        name: "Replacement",
        currentEnvironment: "ground",
        builds: {
          space: { keys: {} },
          ground: { keys: { G1: ["ReplacementGround"] } },
        },
        aliases: {},
        bindsets: {},
      };
      publish({
        currentProfile: "replacement",
        currentEnvironment: "ground",
        profiles: { captain: profile, replacement },
      });
      chainService.cache.selectedKey = "G1";
      chainChanged.mockClear();
      write.resolve({ success: true });

      await expect(pending).resolves.toBe(true);
      expect(listener).not.toHaveBeenCalled();
      expect(chainChanged).not.toHaveBeenCalled();
      expect(chainService.cache.dataState.currentProfile).toBe("replacement");
      expect(chainService.cache.dataState.currentEnvironment).toBe("ground");
    },
  );

  it("suppresses queued and in-flight work from a destroyed generation", async () => {
    const firstWrite = deferred();
    service.request = vi
      .fn()
      .mockImplementationOnce(() => firstWrite.promise)
      .mockResolvedValue({ success: true });
    const added = vi.fn();
    fixture.eventBus.on("command-added", added);

    const inFlight = service.addCommand("F1", "OldInFlight");
    const queued = service.addCommand("F1", "OldQueued");
    await vi.waitFor(() => expect(service.request).toHaveBeenCalledOnce());

    service.destroy();
    service.init();
    const current = service.addCommand("F1", "CurrentGeneration");
    firstWrite.resolve({ success: true });

    await expect(inFlight).resolves.toBe(false);
    await expect(queued).resolves.toBe(false);
    await expect(current).resolves.toBe(true);
    expect(service.request).toHaveBeenCalledTimes(2);
    expect(service.request.mock.calls[1]).toEqual([
      "data:update-profile",
      {
        profileId: "captain",
        modify: {
          builds: {
            space: {
              keys: { F1: ["One", "Two", "CurrentGeneration"] },
            },
          },
        },
      },
    ]);
    expect(added).toHaveBeenCalledOnce();
    expect(added).toHaveBeenCalledWith({
      key: "F1",
      command: "CurrentGeneration",
    });
  });
});
