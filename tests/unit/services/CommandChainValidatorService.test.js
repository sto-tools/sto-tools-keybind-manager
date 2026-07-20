import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServiceFixture } from "../../fixtures/index.js";
import { createDataCoordinatorState } from "../../fixtures/core/componentState.js";
import CommandChainValidatorService from "../../../src/js/components/services/CommandChainValidatorService.js";

function createLongPreview(len) {
  return "x".repeat(len);
}

describe("CommandChainValidatorService", () => {
  let fixture, eventBus, service;

  beforeEach(() => {
    fixture = createServiceFixture();
    eventBus = fixture.eventBus;

    service = new CommandChainValidatorService({ eventBus });
    service.init();
    const profile = {
      name: "Captain",
      currentEnvironment: "space",
      builds: {
        space: { keys: { F1: [createLongPreview(990)] } },
        ground: { keys: {} },
      },
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
    if (!service.destroyed) service.destroy();
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

  it("keeps the asynchronous busy boundary when validations overlap", async () => {
    const spy = vi.fn();
    eventBus.on("command-chain:validation-result", spy);

    const first = service.validateChain("F1");
    const overlapping = service.validateChain("F1");
    await Promise.all([first, overlapping]);

    expect(spy).toHaveBeenCalledOnce();
  });

  it("keeps malformed overlapping validations behind the same busy boundary", async () => {
    const malformedProfile = {
      name: "Captain",
      currentEnvironment: "space",
      builds: { space: { keys: { F1: [null] } }, ground: { keys: {} } },
      aliases: {},
    };
    service._cacheDataState(
      createDataCoordinatorState({
        authorityEpoch: 63,
        revision: 1,
        currentProfile: "captain",
        currentProfileData: malformedProfile,
        profiles: { captain: malformedProfile },
      }),
    );
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = vi.fn();
    eventBus.on("command-chain:validation-result", result);

    const first = service.validateChain("F1");
    const overlapping = service.validateChain("F1");
    await Promise.all([first, overlapping]);

    expect(error).toHaveBeenCalledOnce();
    expect(result).not.toHaveBeenCalled();

    const recoveredProfile = {
      ...malformedProfile,
      builds: {
        space: { keys: { F1: ["recovered"] } },
        ground: { keys: {} },
      },
    };
    service._cacheDataState(
      createDataCoordinatorState({
        authorityEpoch: 64,
        revision: 0,
        currentProfile: "recovered",
        currentProfileData: recoveredProfile,
        profiles: { recovered: recoveredProfile },
      }),
    );
    await service.validateChain("F1");

    expect(result).toHaveBeenCalledOnce();
    expect(result).toHaveBeenCalledWith(
      expect.objectContaining({ length: 'F1 "recovered"'.length }),
    );
  });

  it("validates the pre-ready empty projection without a command-state query", async () => {
    service.cache.dataState = null;
    const requestSpy = vi.spyOn(service, "request");
    const resultSpy = vi.fn();
    eventBus.on("command-chain:validation-result", resultSpy);

    await service.validateChain("F1");

    expect(resultSpy).toHaveBeenCalledWith(
      expect.objectContaining({ key: "F1", length: 'F1 ""'.length }),
    );
    expect(requestSpy).not.toHaveBeenCalled();
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
    const resultSpy = vi.fn();
    eventBus.on("command-chain:validation-result", resultSpy);

    await service.validateChain("F1", false, false);

    expect(resultSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        length: 'F1 "replacement-one $$ replacement-two"'.length,
      }),
    );
    expect(requestSpy).not.toHaveBeenCalled();
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
    const resultSpy = vi.fn();
    eventBus.on("command-chain:validation-result", resultSpy);

    await service.validateChain("F1", false, false);

    expect(resultSpy).toHaveBeenCalledWith(
      expect.objectContaining({ length: 'F1 "primary"'.length }),
    );
    expect(requestSpy).not.toHaveBeenCalled();
  });
});
