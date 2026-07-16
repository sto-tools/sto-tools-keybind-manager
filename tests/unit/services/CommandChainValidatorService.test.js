import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServiceFixture } from "../../fixtures/index.js";
import { createDataCoordinatorState } from "../../fixtures/core/componentState.js";
import { respond } from "../../../src/js/core/requestResponse.js";
import CommandChainValidatorService from "../../../src/js/components/services/CommandChainValidatorService.js";

function createLongPreview(len) {
  return "x".repeat(len);
}

describe("CommandChainValidatorService", () => {
  let fixture, eventBus, service;

  beforeEach(() => {
    fixture = createServiceFixture();
    eventBus = fixture.eventBus;

    // Default stubs
    respond(eventBus, "command:generate-command-preview", () =>
      createLongPreview(995),
    );
    respond(eventBus, "toast:show", () => {});

    service = new CommandChainValidatorService({ eventBus });
    service.init();
    const profile = {
      name: "Captain",
      currentEnvironment: "space",
      builds: { space: { keys: { F1: ["cmd1"] } }, ground: { keys: {} } },
      aliases: {},
    };
    service._cacheDataState(
      createDataCoordinatorState({
        authorityEpoch: 60,
        revision: 2,
        currentProfile: "captain",
        currentProfileData: profile,
        profiles: { captain: profile },
      }),
    );
  });

  afterEach(() => {
    fixture.destroy();
  });

  it("emits validation-result with error when preview >= 990", async () => {
    const spy = vi.fn();
    eventBus.on("command-chain:validation-result", spy);

    eventBus.emit("command-chain:validate", { key: "F1" });

    await new Promise((r) => setTimeout(r, 0));

    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ severity: "error" }),
    );
  });

  it("validates the pre-ready empty projection without a command-state query", async () => {
    service.cache.dataState = null;
    const requestSpy = vi.spyOn(service, "request");

    await service.validateChain("F1");

    expect(requestSpy).toHaveBeenCalledWith(
      "command:generate-command-preview",
      expect.objectContaining({ commands: [] }),
    );
    expect(
      requestSpy.mock.calls.some(
        ([topic]) => topic === "command:get-for-selected-key",
      ),
    ).toBe(false);
  });

  it("validates commands from an accepted replacement authority", async () => {
    const replacement = {
      name: "Replacement",
      currentEnvironment: "space",
      builds: {
        space: { keys: { F1: ["replacement-one", "replacement-two"] } },
        ground: { keys: {} },
      },
      aliases: {},
    };
    service._cacheDataState(
      createDataCoordinatorState({
        authorityEpoch: 61,
        revision: 0,
        currentProfile: "replacement",
        currentProfileData: replacement,
        profiles: { replacement },
      }),
    );
    const requestSpy = vi.spyOn(service, "request");

    await service.validateChain("F1", false, false);

    expect(requestSpy).toHaveBeenCalledWith(
      "command:generate-command-preview",
      expect.objectContaining({
        commands: ["replacement-one", "replacement-two"],
      }),
    );
    expect(
      requestSpy.mock.calls.some(
        ([topic]) => topic === "command:get-for-selected-key",
      ),
    ).toBe(false);
  });

  it("uses primary commands when a disabled named bindset remains cached", async () => {
    const profile = {
      name: "Captain",
      currentEnvironment: "space",
      builds: { space: { keys: { F1: ["primary"] } }, ground: { keys: {} } },
      bindsets: {
        Tactical: {
          space: { keys: { F1: ["named"] } },
          ground: { keys: {} },
        },
      },
      aliases: {},
    };
    service._cacheDataState(
      createDataCoordinatorState({
        authorityEpoch: 62,
        revision: 1,
        currentProfile: "captain",
        currentProfileData: profile,
        profiles: { captain: profile },
      }),
    );
    service.cache.activeBindset = "Tactical";
    service.cache.preferences.bindsetsEnabled = false;
    const requestSpy = vi.spyOn(service, "request");

    await service.validateChain("F1", false, false);

    expect(requestSpy).toHaveBeenCalledWith(
      "command:generate-command-preview",
      expect.objectContaining({ commands: ["primary"] }),
    );
  });
});
