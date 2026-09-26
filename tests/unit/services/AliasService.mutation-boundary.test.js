import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AliasService from "../../../src/js/components/services/AliasService.js";
import { request } from "../../../src/js/core/requestResponse.js";
import { createDataCoordinatorState } from "../../fixtures/core/componentState.js";
import { createServiceFixture } from "../../fixtures/index.js";

const profile = {
  name: "Captain",
  currentEnvironment: "space",
  builds: { space: { keys: {} }, ground: { keys: {} } },
  aliases: {
    Source: { description: "source", commands: ["FireAll"], type: "alias" },
  },
};
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

describe("AliasService accepted-owner mutation boundary", () => {
  let fixture, service;
  beforeEach(() => {
    fixture = createServiceFixture();
    service = new AliasService({ eventBus: fixture.eventBus });
    service.init();
    service._cacheDataState(
      createDataCoordinatorState({
        currentProfile: "captain",
        currentProfileData: profile,
      }),
    );
    service.request = vi.fn(async () => ({ success: true, profile }));
  });
  afterEach(() => {
    service.destroy();
    fixture.destroy();
    vi.restoreAllMocks();
  });

  it.each(["alias:add", "alias:delete", "alias:duplicate-with-name"])(
    "rejects accessor payloads for %s before accepted-state reads",
    async (topic) => {
      const getter = vi.fn(() => "Source");
      const payload = Object.defineProperty(
        {},
        topic === "alias:duplicate-with-name" ? "sourceName" : "name",
        { enumerable: true, get: getter },
      );
      const read = vi.fn(() => {
        throw new Error("owner read before validation");
      });
      Object.defineProperty(service.cache, "dataState", {
        configurable: true,
        get: read,
      });
      expect(await request(fixture.eventBus, topic, payload)).toMatchObject({
        success: false,
      });
      expect(getter).not.toHaveBeenCalled();
      expect(read).not.toHaveBeenCalled();
      expect(service.request).not.toHaveBeenCalled();
    },
  );

  it.each([undefined, "", null, 4])(
    "rejects an invalid delete name %# before accepted-state reads",
    async (name) => {
      const read = vi.fn(() => {
        throw new Error("owner read before validation");
      });
      Object.defineProperty(service.cache, "dataState", {
        configurable: true,
        get: read,
      });
      expect(await service.deleteAlias(name)).toMatchObject({
        success: false,
        error: "alias_not_found",
      });
      expect(read).not.toHaveBeenCalled();
      expect(service.request).not.toHaveBeenCalled();
    },
  );

  it.each(["revision", "destroy and reinitialize"])(
    "retains acknowledged alias success but suppresses late selection across %s",
    async (change) => {
      const handedOff = deferred();
      const resume = deferred();
      service.request.mockImplementation(async (topic) => {
        if (topic === "data:update-profile") {
          handedOff.resolve();
          await resume.promise;
        }
        return { success: true, profile };
      });
      const pending = service.addAlias("NewAlias");
      await handedOff.promise;
      if (change === "revision")
        service._cacheDataState(
          createDataCoordinatorState({
            currentProfile: "other",
            currentProfileData: profile,
            revision: 2,
          }),
        );
      else {
        service.destroy();
        service.init();
      }
      resume.resolve();
      expect(await pending).toEqual({
        success: true,
        message: "alias_created",
        data: { name: "NewAlias" },
      });
      expect(service.request.mock.calls.map(([topic]) => topic)).toEqual([
        "data:update-profile",
      ]);
    },
  );

  it("cancels after asynchronous validation when its lifecycle changes before owner handoff", async () => {
    const validating = deferred();
    const resume = deferred();
    service.isValidAliasName = vi.fn(async () => {
      validating.resolve();
      await resume.promise;
      return true;
    });
    const pending = service.addAlias("NewAlias");
    await validating.promise;
    service.destroy();
    service.init();
    resume.resolve();
    await expect(pending).resolves.toEqual({
      success: false,
      error: "failed_to_add_alias",
    });
    expect(service.request).not.toHaveBeenCalled();
  });

  it("retains acknowledged alias success when selection presentation fails", async () => {
    service.request.mockImplementation(async (topic) => {
      if (topic === "data:update-profile") return { success: true, profile };
      throw new Error("selection unavailable");
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(service.addAlias("NewAlias")).resolves.toEqual({
      success: true,
      message: "alias_created",
      data: { name: "NewAlias" },
    });
    expect(service.request).toHaveBeenNthCalledWith(
      2,
      "selection:select-alias",
      { aliasName: "NewAlias", skipPersistence: true },
    );
  });

  it("duplicates through a detached guarded action without editing accepted alias state", async () => {
    const before = service.cache.dataState;
    expect(
      await service.duplicateAliasWithName("Source", "Copy"),
    ).toMatchObject({ success: true });
    const [, payload] = service.request.mock.calls[0];
    expect(payload.precondition).toEqual({ authorityEpoch: 1, revision: 1 });
    expect(payload.add.aliases.Copy.commands).toEqual(["FireAll"]);
    expect(payload.add.aliases.Copy.commands).not.toBe(
      before.profiles.captain.aliases.Source.commands,
    );
    expect(service.cache.dataState).toBe(before);
    expect(before.profiles.captain.aliases).not.toHaveProperty("Copy");
  });

  it.each([
    false,
    { success: false },
    { success: true },
    { success: true, profile: {} },
  ])(
    "rejects malformed delete acknowledgement %# without success event",
    async (result) => {
      service.request.mockResolvedValue(result);
      expect(await service.deleteAlias("Source")).toEqual({
        success: false,
        error: "failed_to_delete_alias",
      });
      expect(
        fixture.eventBusFixture.getEventsOfType("alias-deleted"),
      ).toHaveLength(0);
    },
  );

  it("does not emit predecessor deletion after an acknowledged commit and teardown", async () => {
    const resume = deferred();
    service.request.mockReturnValue(resume.promise);
    const pending = service.deleteAlias("Source");
    service.destroy();
    service.init();
    resume.resolve({ success: true, profile });
    expect(await pending).toMatchObject({
      success: true,
      message: "alias_deleted",
    });
    expect(
      fixture.eventBusFixture.getEventsOfType("alias-deleted"),
    ).toHaveLength(0);
  });
});
