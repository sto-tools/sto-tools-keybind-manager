import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import CommandChainService from "../../../src/js/components/services/CommandChainService.js";
import { createDataCoordinatorState } from "../../fixtures/core/componentState.js";
import { createServiceFixture } from "../../fixtures/index.js";

const responderTopics = ["command:set-stabilize"];
const retiredTopics = [
  "command:is-stabilized",
  "command-chain:is-stabilized",
  "command-chain:clear",
  "command-chain:generate-alias-name",
  "command-chain:generate-alias-preview",
];

const expectResponderState = (eventBus, topics, expected) => {
  for (const topic of topics) {
    expect(eventBus.getListenerCount(`rpc:${topic}`), topic).toBe(expected);
  }
};

function deferred() {
  let resolve;
  const promise = new Promise((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

describe("CommandChainService projection responder lifecycle", () => {
  let fixture;
  let service;

  beforeEach(() => {
    fixture = createServiceFixture();
    service = new CommandChainService({
      eventBus: fixture.eventBus,
      i18n: { t: (key) => key },
    });
  });

  afterEach(() => {
    if (!service.destroyed) service.destroy();
    fixture.destroy();
    vi.restoreAllMocks();
  });

  it("owns the retained stabilization responder and clear event only while initialized", async () => {
    const setStabilize = vi
      .spyOn(service, "setStabilize")
      .mockResolvedValue({ success: true });

    expectResponderState(fixture.eventBus, responderTopics, 0);
    expectResponderState(fixture.eventBus, retiredTopics, 0);
    expect(fixture.eventBus.getListenerCount("command-chain:clear")).toBe(0);

    await service.init();

    expect(service.getCurrentState()).toBeNull();
    expectResponderState(fixture.eventBus, responderTopics, 1);
    expectResponderState(fixture.eventBus, retiredTopics, 0);
    expect(fixture.eventBus.getListenerCount("command-chain:clear")).toBe(1);
    expect(fixture.eventBus.getListenerCount("bindset-operation:started")).toBe(
      0,
    );
    expect(
      fixture.eventBus.getListenerCount("bindset-operation:completed"),
    ).toBe(0);
    expect(fixture.eventBus.getListenerCount("profile:updated")).toBe(1);
    expect(fixture.eventBus.getListenerCount("profile:switched")).toBe(1);
    await service.request("command:set-stabilize", {
      name: "F1",
      stabilize: true,
    });
    expect(setStabilize).toHaveBeenCalledOnce();

    service.destroy();
    expectResponderState(fixture.eventBus, responderTopics, 0);
    expectResponderState(fixture.eventBus, retiredTopics, 0);
    expect(fixture.eventBus.getListenerCount("command-chain:clear")).toBe(0);
    expect(fixture.eventBus.getListenerCount("profile:updated")).toBe(0);
    expect(fixture.eventBus.getListenerCount("profile:switched")).toBe(0);

    await service.init();

    expectResponderState(fixture.eventBus, responderTopics, 1);
    expectResponderState(fixture.eventBus, retiredTopics, 0);
    expect(fixture.eventBus.getListenerCount("command-chain:clear")).toBe(1);
    expect(fixture.eventBus.getListenerCount("profile:updated")).toBe(1);
    expect(fixture.eventBus.getListenerCount("profile:switched")).toBe(1);
    await service.request("command:set-stabilize", {
      name: "F1",
      stabilize: false,
    });
    expect(setStabilize).toHaveBeenCalledTimes(2);

    service.destroy();
    service = new CommandChainService({
      eventBus: fixture.eventBus,
      i18n: { t: (key) => key },
    });
    await service.init();

    expectResponderState(fixture.eventBus, responderTopics, 1);
    expectResponderState(fixture.eventBus, retiredTopics, 0);
    expect(fixture.eventBus.getListenerCount("command-chain:clear")).toBe(1);
  });

  it("refreshes an active bindset once without scheduling transient state", () => {
    service.init();
    const refresh = vi
      .spyOn(service, "refreshCommands")
      .mockResolvedValue(true);
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");

    fixture.eventBus.emit("bindset-selector:active-changed", {
      bindset: "Weapons",
    });

    expect(refresh).toHaveBeenCalledOnce();
    expect(refresh).toHaveBeenCalledWith(service._lifecycleGeneration);
    expect(setTimeoutSpy).not.toHaveBeenCalled();
  });

  it.each([
    ["delete", "commandchain:delete", { index: 0 }],
    ["move", "commandchain:move", { fromIndex: 0, toIndex: 1 }],
  ])(
    "suppresses a predecessor %s refresh after destroy and reinitialization",
    async (_label, topic, payload) => {
      service.init();
      service.cache.selectedKey = "F1";
      const request = deferred();
      service.request = vi.fn().mockReturnValue(request.promise);
      const changed = vi.fn();
      fixture.eventBus.on("chain-data-changed", changed);

      fixture.eventBus.emit(topic, payload);
      await vi.waitFor(() => expect(service.request).toHaveBeenCalledOnce());
      service.destroy();
      service.init();
      request.resolve({ success: true });
      await Promise.resolve();
      await Promise.resolve();

      expect(changed).not.toHaveBeenCalled();
      expect(fixture.eventBus.getListenerCount(topic)).toBe(1);
      expect(
        fixture.eventBus.getListenerCount("rpc:command:set-stabilize"),
      ).toBe(1);
    },
  );

  it("suppresses a predecessor clear result after lifecycle replacement", async () => {
    service.init();
    const profile = {
      id: "captain",
      name: "Captain",
      builds: { space: { keys: { F1: ["FireAll"] } }, ground: { keys: {} } },
      aliases: {},
    };
    service._cacheDataState(
      createDataCoordinatorState({
        currentProfile: "captain",
        currentProfileData: profile,
        profiles: { captain: profile },
      }),
    );
    const request = deferred();
    service.request = vi.fn().mockReturnValue(request.promise);
    const changed = vi.fn();
    fixture.eventBus.on("chain-data-changed", changed);

    const pending = service.clearCommandChain("F1");
    await vi.waitFor(() => expect(service.request).toHaveBeenCalledOnce());
    service.destroy();
    service.init();
    request.resolve({ success: true });

    await expect(pending).resolves.toBe(false);
    expect(changed).not.toHaveBeenCalled();
  });
});
