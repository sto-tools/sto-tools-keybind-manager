import { describe, expect, it, vi } from "vitest";

import { request } from "../../src/js/core/requestResponse.js";

const encode = (value) => btoa(value);

const createKBF = ({
  keyName = "F24",
  activityFields = "Activity:1;",
  combo = "",
} = {}) => {
  const activity = encode(activityFields);
  const key = encode(
    `Key:${keyName};Control:0;Alt:0;Shift:0;Combo:${combo};ACT:${activity};`,
  );
  const keyset = encode(`Name:Master;KEY:${key};`);
  return encode(`GROUPSET:1;KEYSET:${keyset};`);
};

describe("KBF import browser boundary", () => {
  it("commits canonical nested data through the checked-bundle owner chain", async () => {
    const bus = window.eventBus;
    const storage = window.storageService;
    const coordinator = window.dataCoordinator;
    const consumer = window.commandChainUI;
    const beforeState = coordinator?.getCurrentState?.();
    expect(bus).toBeTruthy();
    expect(storage).toBeTruthy();
    expect(beforeState?.ready).toBe(true);
    expect(consumer?.cache.dataState).toBe(beforeState);
    if (!bus || !storage || !coordinator || !consumer || !beforeState?.ready)
      return;

    const profileId = beforeState.currentProfile;
    const environment = beforeState.currentEnvironment;
    const beforeRoot = localStorage.getItem(storage.storageKey);
    const beforeProfile = structuredClone(beforeState.profiles[profileId]);
    const ownershipEvents = [];
    const detachState = bus.on("data:state-changed", ({ state }) => {
      ownershipEvents.push({ event: "data:state-changed", state });
    });
    const detachLegacy = bus.on("profile:updated", (payload) => {
      ownershipEvents.push({ event: "profile:updated", payload });
    });

    try {
      await expect(
        request(bus, "import:kbf-file", {
          content: createKBF(),
          profileId,
          environment,
          strategy: "merge_overwrite",
          configuration: {
            selectedBindsets: ["master"],
            singleBindsetMode: true,
          },
        }),
      ).resolves.toMatchObject({
        success: true,
        imported: { bindsets: 1, keys: 1 },
      });

      const committedState = coordinator.getCurrentState();
      expect(committedState.revision).toBe(beforeState.revision + 1);
      expect(
        committedState.profiles[profileId].builds[environment].keys.F24,
      ).toEqual(["target_clear"]);
      expect(ownershipEvents.map(({ event }) => event)).toEqual([
        "data:state-changed",
        "profile:updated",
      ]);
      await vi.waitFor(() => {
        expect(consumer.cache.dataState).toBe(committedState);
      });
      expect(storage.getProfile(profileId)).toEqual(
        committedState.profiles[profileId],
      );
      expect(
        JSON.parse(localStorage.getItem(storage.storageKey)).profiles[
          profileId
        ],
      ).toEqual(committedState.profiles[profileId]);
    } finally {
      detachState();
      detachLegacy();
      if (beforeRoot === null) localStorage.removeItem(storage.storageKey);
      else localStorage.setItem(storage.storageKey, beforeRoot);
      storage.getAllData(true);
      await request(bus, "data:reload-state");
      await vi.waitFor(() => {
        expect(coordinator.getCurrentState().profiles[profileId]).toEqual(
          beforeProfile,
        );
      });
    }
  });

  it.each([
    [
      "a prototype-sensitive nested key",
      createKBF({ keyName: "__proto__" }),
      null,
      "invalid_kbf_parse_result",
    ],
    [
      "an unbounded activity range",
      createKBF({
        activityFields: "Activity:95;N1:0;N2:0;N3:10;",
      }),
      null,
      "invalid_kbf_parse_result",
    ],
    [
      "malformed Base64 activity text",
      createKBF({ activityFields: "Activity:96;Text:not.base64;" }),
      null,
      "invalid_kbf_parse_result",
    ],
    [
      "a control character in a combo token",
      createKBF({ combo: encode("Alt\nF2") }),
      null,
      "invalid_kbf_parse_result",
    ],
    [
      "an excessive combo chord",
      createKBF({
        combo: Array.from({ length: 11 }, (_, index) =>
          encode(`F${index + 1}`),
        ).join("*"),
      }),
      null,
      "invalid_kbf_parse_result",
    ],
    [
      "a negative execution order",
      createKBF({ activityFields: "Activity:1;O:-1;" }),
      null,
      "invalid_kbf_parse_result",
    ],
    [
      "a prototype-sensitive destination",
      createKBF(),
      {
        selectedBindsets: ["master"],
        bindsetMappings: { master: "custom" },
        bindsetRenames: { master: "__proto__" },
      },
      "invalid_kbf_configuration",
    ],
  ])(
    "rejects %s without owner or durable effects",
    async (_, content, configuration, error) => {
      const bus = window.eventBus;
      const storage = window.storageService;
      const coordinator = window.dataCoordinator;
      const consumer = window.commandChainUI;
      const state = coordinator?.getCurrentState?.();
      expect(bus).toBeTruthy();
      expect(storage).toBeTruthy();
      expect(state?.ready).toBe(true);
      expect(consumer?.cache.dataState).toBe(state);
      if (!bus || !storage || !coordinator || !consumer || !state?.ready)
        return;

      const beforeRoot = localStorage.getItem(storage.storageKey);
      await expect(
        request(bus, "import:kbf-file", {
          content,
          profileId: state.currentProfile,
          environment: state.currentEnvironment,
          strategy: "merge_keep",
          configuration,
        }),
      ).resolves.toMatchObject({ success: false, error });
      expect(localStorage.getItem(storage.storageKey)).toBe(beforeRoot);
      expect(coordinator.getCurrentState()).toBe(state);
      expect(consumer.cache.dataState).toBe(state);
    },
  );
});
