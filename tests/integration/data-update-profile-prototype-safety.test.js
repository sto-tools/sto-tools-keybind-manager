import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ComponentBase from "../../src/js/components/ComponentBase.js";
import DataCoordinator from "../../src/js/components/services/DataCoordinator.js";
import { createServiceFixture } from "../fixtures/index.js";

class RpcClient extends ComponentBase {
  constructor(eventBus) {
    super(eventBus);
    this.componentName = "PrototypeSafetyRpcClient";
  }
}

const profile = {
  name: "Alpha",
  currentEnvironment: "space",
  builds: {
    space: { keys: { F1: ["space-command"] } },
    ground: { keys: {} },
  },
  aliases: {},
  bindsets: {},
  keybindMetadata: {},
  aliasMetadata: {},
  bindsetMetadata: {},
  migrationVersion: "2.1.1",
};

describe("data:update-profile prototype safety", () => {
  let fixture;
  let coordinator;
  let client;

  beforeEach(async () => {
    localStorage.setItem("sto_keybind_manager_visited", "true");
    fixture = createServiceFixture();
    fixture.storage.getAllData.mockReturnValue({
      currentProfile: "alpha",
      profiles: { alpha: structuredClone(profile) },
      settings: {},
      version: "1.0.0",
      lastModified: "2026-07-16T00:00:00.000Z",
    });
    coordinator = new DataCoordinator({
      eventBus: fixture.eventBus,
      storage: fixture.storage,
      i18n: { t: (key) => key },
    });
    client = new RpcClient(fixture.eventBus);

    coordinator.init();
    client.init();
    await vi.waitFor(() => {
      expect(coordinator.getCurrentState().ready).toBe(true);
    });

    fixture.eventBusFixture.clearEventHistory();
    fixture.storage.saveProfile.mockClear();
  });

  afterEach(() => {
    if (!client.destroyed) client.destroy();
    if (!coordinator.destroyed) coordinator.destroy();
    fixture.destroy();
    localStorage.removeItem("sto_keybind_manager_visited");
    vi.restoreAllMocks();
  });

  it("rejects wrapped and legacy JSON attacks before persistence or publication", async () => {
    const prototypeKeys = Object.getOwnPropertyDescriptor(
      Object.prototype,
      "keys",
    );
    const objectKeys = Object.getOwnPropertyDescriptor(Object, "keys");
    const objectSpace = Object.getOwnPropertyDescriptor(Object, "space");
    const prototypePolluted = Object.getOwnPropertyDescriptor(
      Object.prototype,
      "polluted",
    );
    const payloads = [
      JSON.parse(
        '{"profileId":"alpha","updates":{"add":{"builds":{"__proto__":{"keys":{"F9":["polluted"]}}}}}}',
      ),
      JSON.parse(
        '{"profileId":"alpha","modify":{"bindsets":{"constructor":{"space":{"keys":{"F9":["polluted"]}}}}}}',
      ),
      JSON.parse(
        '{"profileId":"prototype","updates":{"properties":{"description":"polluted"}}}',
      ),
    ];
    const ownerBefore = structuredClone(coordinator.state);
    const revisionBefore = coordinator.getCurrentState().revision;

    try {
      for (const payload of payloads) {
        await expect(
          client.request("data:update-profile", payload),
        ).rejects.toThrow("unsafe_profile_operation_key");
      }

      expect(fixture.storage.saveProfile).not.toHaveBeenCalled();
      expect(coordinator.state).toEqual(ownerBefore);
      expect(coordinator.getCurrentState().revision).toBe(revisionBefore);
      expect(
        fixture
          .getEventHistory()
          .filter(({ event }) =>
            ["data:state-changed", "profile:updated"].includes(event),
          ),
      ).toEqual([]);
      expect(Object.getOwnPropertyDescriptor(Object.prototype, "keys")).toEqual(
        prototypeKeys,
      );
      expect(Object.getOwnPropertyDescriptor(Object, "keys")).toEqual(
        objectKeys,
      );
      expect(Object.getOwnPropertyDescriptor(Object, "space")).toEqual(
        objectSpace,
      );
      expect(Object.prototype).not.toHaveProperty("polluted");
    } finally {
      if (prototypeKeys) {
        Object.defineProperty(Object.prototype, "keys", prototypeKeys);
      } else {
        delete Object.prototype.keys;
      }
      if (objectKeys) Object.defineProperty(Object, "keys", objectKeys);
      if (objectSpace) {
        Object.defineProperty(Object, "space", objectSpace);
      } else {
        delete Object.space;
      }
      if (prototypePolluted) {
        Object.defineProperty(Object.prototype, "polluted", prototypePolluted);
      } else {
        delete Object.prototype.polluted;
      }
    }
  });
});
