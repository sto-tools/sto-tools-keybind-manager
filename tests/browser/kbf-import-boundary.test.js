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

const createMultiBindsetKBF = () => {
  const createKeyset = (name, keyName) => {
    const activity = encode("Activity:1;");
    const key = encode(
      `Key:${keyName};Control:0;Alt:0;Shift:0;Combo:;ACT:${activity};`,
    );
    return encode(`Name:${name};KEY:${key};`);
  };
  return encode(
    `GROUPSET:1;KEYSET:${createKeyset("Master", "F23")};KEYSET:${createKeyset("Alternate", "F24")};`,
  );
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

  it("imports one visibly selected bindset through the checked-bundle menu workflow", async () => {
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
    const environment = ["space", "ground"].includes(
      beforeState.currentEnvironment,
    )
      ? beforeState.currentEnvironment
      : "space";
    const beforeRoot = localStorage.getItem(storage.storageKey);
    const beforeSettings = localStorage.getItem(storage.settingsKey);
    const beforeProfile = structuredClone(beforeState.profiles[profileId]);
    const originalBindsetsEnabled = consumer.cache.preferences.bindsetsEnabled;
    const originalLanguage = window.i18next.language;
    let input = null;

    try {
      await expect(
        request(bus, "preferences:set-setting", {
          key: "bindsetsEnabled",
          value: false,
        }),
      ).resolves.toBe(true);
      await vi.waitFor(() => {
        expect(consumer.cache.preferences.bindsetsEnabled).toBe(false);
      });
      expect(
        JSON.parse(localStorage.getItem(storage.settingsKey)).bindsetsEnabled,
      ).toBe(false);

      const importMenuButton = document.getElementById("importMenuBtn");
      const importKbfButton = document.getElementById("importKbfBtn");
      expect(importMenuButton).toBeInstanceOf(HTMLButtonElement);
      expect(importKbfButton).toBeInstanceOf(HTMLButtonElement);
      importMenuButton.click();
      expect(importMenuButton.closest(".dropdown").classList).toContain(
        "active",
      );
      importKbfButton.click();

      input = document.querySelector('input[type="file"][accept=".kbf,.txt"]');
      expect(input).toBeInstanceOf(HTMLInputElement);
      Object.defineProperty(input, "files", {
        configurable: true,
        value: [
          new File([createMultiBindsetKBF()], "browser-single-bindset.kbf", {
            type: "text/plain",
          }),
        ],
      });
      input.dispatchEvent(new Event("change", { bubbles: true }));

      await vi.waitFor(() => {
        const decision = document.getElementById("importModal");
        expect(decision).toBeInstanceOf(HTMLDivElement);
        expect(decision?.classList).toContain("active");
      });
      const decisionPredecessor = document.getElementById("importModal");
      const staleEnvironmentButton = decisionPredecessor.querySelector(
        `.import-${environment}`,
      );
      const overwrite = decisionPredecessor.querySelector(
        'input[name="import-strategy"][value="merge_overwrite"]',
      );
      expect(overwrite).toBeInstanceOf(HTMLInputElement);
      overwrite.checked = true;
      await window.i18next.changeLanguage(
        originalLanguage === "de" ? "en" : "de",
      );
      const decisionReplacement = document.getElementById("importModal");
      expect(decisionReplacement).not.toBe(decisionPredecessor);
      expect(decisionPredecessor.isConnected).toBe(false);
      expect(decisionReplacement.classList).toContain("active");
      expect(
        decisionReplacement.querySelector(
          'input[name="import-strategy"][value="merge_overwrite"]',
        ).checked,
      ).toBe(true);
      staleEnvironmentButton.click();
      expect(document.getElementById("importModal")).toBe(decisionReplacement);
      expect(
        document.getElementById("enhancedBindsetSelectionModal"),
      ).toBeNull();
      decisionReplacement.querySelector(`.import-${environment}`).click();

      await vi.waitFor(() => {
        expect(
          document.querySelector(
            "#enhancedBindsetSelectionModal.single-bindset-selection.active",
          ),
        ).toBeInstanceOf(HTMLDivElement);
      });
      const modal = document.getElementById("enhancedBindsetSelectionModal");
      const options = Array.from(
        modal.querySelectorAll(".single-bindset-option"),
      );
      expect(options).toHaveLength(2);
      expect(
        options.filter((option) => option.classList.contains("selected")),
      ).toHaveLength(1);

      const alternate = options.find(
        (option) => option.dataset.bindset?.toLowerCase() === "alternate",
      );
      const master = options.find(
        (option) => option.dataset.bindset?.toLowerCase() === "master",
      );
      expect(alternate).toBeInstanceOf(HTMLElement);
      expect(master).toBeInstanceOf(HTMLElement);
      alternate.click();
      expect(alternate.classList).toContain("selected");
      expect(master.classList).not.toContain("selected");
      expect(alternate.querySelector(".single-bindset-radio").checked).toBe(
        true,
      );
      expect(document.getElementById("modalOverlay").classList).toContain(
        "active",
      );
      expect(document.body.classList).toContain("modal-open");

      modal.querySelector(".single-bindset-confirm").click();

      await vi.waitFor(() => {
        const committedState = coordinator.getCurrentState();
        expect(committedState.revision).toBe(beforeState.revision + 1);
        expect(
          committedState.profiles[profileId].builds[environment].keys.F24,
        ).toEqual(["target_clear"]);
        expect(consumer.cache.dataState).toBe(committedState);
        expect(input.isConnected).toBe(false);
      });

      const committedState = coordinator.getCurrentState();
      expect(
        committedState.profiles[profileId].builds[environment].keys.F23,
      ).toEqual(beforeProfile.builds[environment].keys.F23);
      expect(storage.getProfile(profileId)).toEqual(
        committedState.profiles[profileId],
      );
      expect(
        JSON.parse(localStorage.getItem(storage.storageKey)).profiles[
          profileId
        ],
      ).toEqual(committedState.profiles[profileId]);
      expect(document.querySelector("#importModal")).toBeNull();
      expect(
        document.querySelector("#enhancedBindsetSelectionModal"),
      ).toBeNull();
      expect(document.getElementById("modalOverlay").classList).not.toContain(
        "active",
      );
      expect(document.body.classList).not.toContain("modal-open");
    } finally {
      await window.i18next.changeLanguage(originalLanguage);
      if (typeof originalBindsetsEnabled === "boolean") {
        await request(bus, "preferences:set-setting", {
          key: "bindsetsEnabled",
          value: originalBindsetsEnabled,
        });
      }
      if (localStorage.getItem(storage.settingsKey) !== beforeSettings) {
        if (beforeSettings === null) {
          localStorage.removeItem(storage.settingsKey);
        } else {
          localStorage.setItem(storage.settingsKey, beforeSettings);
        }
        await request(bus, "preferences:load-settings");
      }
      if (beforeRoot === null) localStorage.removeItem(storage.storageKey);
      else localStorage.setItem(storage.storageKey, beforeRoot);
      storage.getAllData(true);
      await request(bus, "data:reload-state");
      await vi.waitFor(() => {
        expect(coordinator.getCurrentState().profiles[profileId]).toEqual(
          beforeProfile,
        );
        expect(consumer.cache.preferences.bindsetsEnabled).toBe(
          originalBindsetsEnabled,
        );
      });
      input?.remove();
      document.getElementById("importModal")?.remove();
      document.getElementById("enhancedBindsetSelectionModal")?.remove();
    }
  });

  it("settles Escape and overlay import cancellation without durable effects", async () => {
    const bus = window.eventBus;
    const storage = window.storageService;
    const coordinator = window.dataCoordinator;
    const beforeState = coordinator?.getCurrentState?.();
    expect(bus).toBeTruthy();
    expect(storage).toBeTruthy();
    expect(beforeState?.ready).toBe(true);
    if (!bus || !storage || !coordinator || !beforeState?.ready) return;

    const profileId = beforeState.currentProfile;
    const beforeRoot = localStorage.getItem(storage.storageKey);
    const beforeProfile = structuredClone(beforeState.profiles[profileId]);
    const requests = [];
    const detach = bus.on("rpc:import:keybind-file", ({ payload }) => {
      requests.push(payload);
    });

    try {
      for (const cancellation of ["Escape", "overlay"]) {
        document.getElementById("importMenuBtn").click();
        document.getElementById("importKeybindsBtn").click();
        const input = document.querySelector(
          'input[type="file"][accept=".txt"]',
        );
        expect(input).toBeInstanceOf(HTMLInputElement);
        Object.defineProperty(input, "files", {
          configurable: true,
          value: [new File(['F12 "FireAll"'], `${cancellation}.txt`)],
        });
        input.dispatchEvent(new Event("change", { bubbles: true }));

        await vi.waitFor(() => {
          const modal = document.getElementById("importModal");
          expect(modal).toBeInstanceOf(HTMLDivElement);
          expect(modal?.classList).toContain("active");
        });
        if (cancellation === "Escape") {
          document.dispatchEvent(
            new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
          );
        } else {
          document.getElementById("modalOverlay").click();
        }

        await vi.waitFor(() => {
          expect(input.isConnected).toBe(false);
          expect(document.getElementById("importModal")).toBeNull();
        });
        expect(document.getElementById("modalOverlay").classList).not.toContain(
          "active",
        );
        expect(document.body.classList).not.toContain("modal-open");
      }

      expect(requests).toEqual([]);
      expect(coordinator.getCurrentState().revision).toBe(beforeState.revision);
      expect(storage.getProfile(profileId)).toEqual(beforeProfile);
      expect(localStorage.getItem(storage.storageKey)).toBe(beforeRoot);
    } finally {
      detach();
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
      for (const input of document.querySelectorAll('input[type="file"]')) {
        input.remove();
      }
      document.getElementById("importModal")?.remove();
      if (beforeRoot === null) localStorage.removeItem(storage.storageKey);
      else localStorage.setItem(storage.storageKey, beforeRoot);
      storage.getAllData(true);
      await request(bus, "data:reload-state");
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
