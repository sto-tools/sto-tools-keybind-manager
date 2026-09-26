import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import DataCoordinator from "../../src/js/components/services/DataCoordinator.js";
import InterfaceModeService from "../../src/js/components/services/InterfaceModeService.js";
import { request } from "../../src/js/core/requestResponse.js";
import { createRealEventBusFixture } from "../fixtures/core/eventBus.js";

const profileId = "reentrant-environment";
const profile = {
  name: "Reentrant environment",
  currentEnvironment: "space",
  builds: { space: { keys: {} }, ground: { keys: {} } },
  aliases: {},
  bindsets: {},
  keybindMetadata: {},
  aliasMetadata: {},
  bindsetMetadata: {},
  migrationVersion: "2.1.1",
};

function deferred() {
  let resolve;
  const promise = new Promise((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

describe("reentrant environment switch ordering", () => {
  let fixture;
  let eventBus;
  let storage;
  let owner;
  let service;
  let detachers;

  beforeEach(async () => {
    fixture = await createRealEventBusFixture();
    eventBus = fixture.eventBus;
    let durable = {
      currentProfile: profileId,
      profiles: { [profileId]: profile },
      globalAliases: {},
      settings: {},
      version: "1.0.0",
      lastModified: "2026-01-01T00:00:00.000Z",
    };
    storage = {
      version: "1.0.0",
      getAllData: vi.fn(() => structuredClone(durable)),
      getProfile: vi.fn((id) => structuredClone(durable.profiles[id] ?? null)),
      saveProfile: vi.fn((id, nextProfile) => {
        durable = {
          ...durable,
          profiles: {
            ...durable.profiles,
            [id]: structuredClone(nextProfile),
          },
          lastModified: new Date().toISOString(),
        };
        return true;
      }),
      saveAllData: vi.fn((nextRoot) => {
        durable = structuredClone(nextRoot);
        return true;
      }),
    };
    owner = new DataCoordinator({
      eventBus,
      storage,
      i18n: { t: (key) => key },
    });
    owner.init();
    await owner.initialStateReady;
    service = new InterfaceModeService({ eventBus });
    service.init();
    await vi.waitFor(() => expect(service.currentMode).toBe("space"));
    detachers = [];
  });

  afterEach(() => {
    for (const detach of detachers.splice(0)) detach();
    if (service && !service.destroyed) service.destroy();
    if (owner && !owner.destroyed) owner.destroy();
    fixture?.destroy();
    vi.restoreAllMocks();
  });

  it("allows an environment listener to await the next ordered switch", async () => {
    const startRevision = owner.getCurrentState().revision;
    const writes = vi.spyOn(storage, "saveProfile");
    const publications = [];
    let aliasSwitch;
    detachers.push(
      eventBus.on("environment:changed", ({ environment }) => {
        publications.push(environment);
        if (environment !== "ground") return undefined;
        aliasSwitch = request(
          eventBus,
          "environment:switch",
          { mode: "alias" },
          0,
        );
        return aliasSwitch;
      }),
    );

    const groundSwitch = request(
      eventBus,
      "environment:switch",
      { mode: "ground" },
      0,
    );
    await vi.waitFor(() => expect(aliasSwitch).toBeDefined());

    await expect(Promise.all([groundSwitch, aliasSwitch])).resolves.toEqual([
      { success: true, mode: "ground" },
      { success: true, mode: "alias" },
    ]);
    expect(
      writes.mock.calls.map(([, saved]) => saved.currentEnvironment),
    ).toEqual(["ground", "alias"]);
    expect(publications).toEqual(["ground", "alias"]);
    expect(owner.getCurrentState()).toMatchObject({
      revision: startRevision + 2,
      currentEnvironment: "alias",
    });
    expect(storage.getProfile(profileId).currentEnvironment).toBe("alias");
    expect(service.currentMode).toBe("alias");
  });

  it("lets a later reply finish while the earlier listener is still settling", async () => {
    const startRevision = owner.getCurrentState().revision;
    const listenerStarted = deferred();
    const releaseListener = deferred();
    const replyOrder = [];
    detachers.push(
      eventBus.on("environment:changed", async ({ environment }) => {
        if (environment !== "ground") return;
        listenerStarted.resolve();
        await releaseListener.promise;
      }),
    );

    let groundSettled = false;
    const groundSwitch = request(
      eventBus,
      "environment:switch",
      { mode: "ground" },
      0,
    ).then((result) => {
      groundSettled = true;
      replyOrder.push("ground");
      return result;
    });
    await listenerStarted.promise;

    const aliasSwitch = request(
      eventBus,
      "environment:switch",
      { mode: "alias" },
      0,
    ).then((result) => {
      replyOrder.push("alias");
      return result;
    });
    await expect(aliasSwitch).resolves.toEqual({
      success: true,
      mode: "alias",
    });
    expect(groundSettled).toBe(false);
    expect(replyOrder).toEqual(["alias"]);
    expect(owner.getCurrentState()).toMatchObject({
      revision: startRevision + 2,
      currentEnvironment: "alias",
    });

    releaseListener.resolve();
    await expect(groundSwitch).resolves.toEqual({
      success: true,
      mode: "ground",
    });
    expect(replyOrder).toEqual(["alias", "ground"]);
    expect(storage.getProfile(profileId).currentEnvironment).toBe("alias");
    expect(service.currentMode).toBe("alias");
  });

  it("retains accepted success when a listener reinitializes the presentation lifecycle", async () => {
    const startRevision = owner.getCurrentState().revision;
    const publications = [];
    let reinitialized = false;
    detachers.push(
      eventBus.on("environment:changed", ({ environment }) => {
        publications.push(environment);
        if (environment !== "ground" || reinitialized) return;
        reinitialized = true;
        service.destroy();
        service.init();
      }),
    );

    await expect(
      request(eventBus, "environment:switch", { mode: "ground" }, 0),
    ).resolves.toEqual({ success: true, mode: "ground" });
    expect(reinitialized).toBe(true);
    expect(service.currentMode).toBe("ground");
    expect(owner.getCurrentState()).toMatchObject({
      revision: startRevision + 1,
      currentEnvironment: "ground",
    });

    await expect(
      request(eventBus, "environment:switch", { mode: "alias" }, 0),
    ).resolves.toEqual({ success: true, mode: "alias" });
    expect(publications).toEqual(["ground", "alias"]);
    expect(storage.getProfile(profileId).currentEnvironment).toBe("alias");
    expect(service.currentMode).toBe("alias");
  });
});
