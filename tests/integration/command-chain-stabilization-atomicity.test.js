import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import CommandChainService from "../../src/js/components/services/CommandChainService.js";
import DataCoordinator from "../../src/js/components/services/DataCoordinator.js";
import CommandChainUI from "../../src/js/components/ui/CommandChainUI.js";
import { isSnapshotCommandStabilized } from "../../src/js/components/services/dataState.js";
import { createServiceFixture } from "../fixtures/index.js";

function isCachedCommandStabilized(service, name, bindset) {
  return isSnapshotCommandStabilized(
    service.cache.dataState,
    service.cache.currentEnvironment,
    name,
    bindset,
  );
}

const profile = {
  name: "Captain",
  description: "Failure-atomic stabilization fixture",
  currentEnvironment: "space",
  builds: {
    space: {
      keys: {
        F1: ["TrayExecByTray 0 0", "FireAll", "TrayExecByTray 1 0"],
      },
    },
    ground: { keys: {} },
  },
  aliases: {
    Alpha: { commands: ["FireAll"], description: "Preserve alias" },
  },
  bindsets: {
    Weapons: {
      space: { keys: { F2: ["FirePhasers"] } },
      ground: { keys: {} },
    },
  },
  keybindMetadata: {
    space: {
      F1: {
        stabilizeExecutionOrder: true,
        source: "primary",
        extension: { nested: 1 },
      },
    },
  },
  aliasMetadata: {
    Alpha: {
      stabilizeExecutionOrder: true,
      source: "alias",
      extension: { nested: 2 },
    },
  },
  bindsetMetadata: {
    Weapons: {
      space: {
        F2: {
          stabilizeExecutionOrder: false,
          source: "bindset",
          extension: { nested: 3 },
        },
      },
    },
  },
};

const root = {
  version: "1.0.0",
  created: "2026-01-01T00:00:00.000Z",
  lastModified: "2026-01-01T00:00:00.000Z",
  currentProfile: "captain",
  profiles: { captain: profile },
  globalAliases: {},
  settings: { theme: "default", autoSave: true },
};

const targets = [
  {
    label: "primary metadata",
    name: "F1",
    bindset: null,
    stabilize: false,
    kind: "primary",
  },
  {
    label: "alias metadata with bindset precedence",
    name: "Alpha",
    bindset: "Weapons",
    stabilize: false,
    kind: "alias",
  },
  {
    label: "named-bindset metadata",
    name: "F2",
    bindset: "Weapons",
    stabilize: true,
    kind: "bindset",
  },
  {
    label: "historical no-op metadata",
    name: "F1",
    bindset: "Primary Bindset",
    stabilize: true,
    kind: "primary",
  },
];

function targetMetadata(currentProfile, target) {
  if (target.kind === "alias") {
    return currentProfile.aliasMetadata?.[target.name];
  }
  if (target.kind === "bindset") {
    return currentProfile.bindsetMetadata?.[target.bindset]?.space?.[
      target.name
    ];
  }
  return currentProfile.keybindMetadata?.space?.[target.name];
}

function configureTarget(service, target) {
  service.cache.currentEnvironment = "space";
  service.cache.activeBindset = target.bindset || "Primary Bindset";
}

function createStabilizationDocument() {
  const classes = new Set();
  const stabilizeButton = {
    disabled: false,
    classList: {
      contains: (name) => classes.has(name),
      remove: (...names) => names.forEach((name) => classes.delete(name)),
      toggle: (name, force) => {
        const active = force === undefined ? !classes.has(name) : force;
        if (active) classes.add(name);
        else classes.delete(name);
        return active;
      },
    },
  };
  return {
    document: {
      getElementById: vi.fn((id) =>
        id === "stabilizeExecutionOrderBtn" ? stabilizeButton : null,
      ),
      querySelector: vi.fn(() => null),
    },
    stabilizeButton,
  };
}

const mutationEvents = [
  "data:state-changed",
  "profile:updated",
  "chain-data-changed",
  "storage:data-changed",
  "stabilize-changed",
];

describe("CommandChainService stabilization owner atomicity", () => {
  let fixture;
  let coordinator;
  let service;
  let ui;
  const lateJoiners = [];

  beforeEach(async () => {
    lateJoiners.length = 0;
    fixture = createServiceFixture({
      initialStorageData: { sto_keybind_manager: root },
    });
    coordinator = new DataCoordinator({
      eventBus: fixture.eventBus,
      storage: fixture.storage,
      i18n: { t: (key) => key },
    });
    service = new CommandChainService({
      eventBus: fixture.eventBus,
      i18n: { t: (key) => key },
    });

    coordinator.init();
    await vi.waitFor(() => {
      expect(coordinator.getCurrentState().ready).toBe(true);
    });
    service.init();
    await vi.waitFor(() => {
      expect(service.cache.dataState?.ready).toBe(true);
    });

    fixture.eventBusFixture.clearEventHistory();
    fixture.storage.saveProfile.mockClear();
  });

  afterEach(() => {
    for (const lateJoiner of lateJoiners) {
      if (!lateJoiner.destroyed) lateJoiner.destroy();
    }
    if (ui && !ui.destroyed) ui.destroy();
    if (!service.destroyed) service.destroy();
    if (!coordinator.destroyed) coordinator.destroy();
    fixture.destroy();
    vi.restoreAllMocks();
  });

  it("routes the UI toggle through one metadata-only owner update", async () => {
    const mixedCommands = [
      "TrayExecByTray 0 0",
      "FireAll",
      "TrayExecByTray 1 0",
    ];
    const { document, stabilizeButton } = createStabilizationDocument();
    ui = new CommandChainUI({
      eventBus: fixture.eventBus,
      document,
      i18n: { t: (key) => key },
      ui: { showToast: vi.fn() },
    });
    ui.init();
    ui.cache.selectedKey = "F1";
    ui.cache.selectedAlias = null;
    ui.cache.currentEnvironment = "space";
    ui.cache.activeBindset = "Primary Bindset";
    ui.cache.preferences.bindsetsEnabled = true;
    const request = vi.spyOn(ui, "request");

    await ui.updateChainActions();
    expect(stabilizeButton.classList.contains("active")).toBe(true);
    const revisionBefore = coordinator.getCurrentState().revision;

    await ui.toggleStabilize();

    const ownerAfter = coordinator.getCurrentState();
    expect(request).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledWith("command:set-stabilize", {
      name: "F1",
      stabilize: false,
      bindset: "Primary Bindset",
    });
    expect(fixture.storage.saveProfile).toHaveBeenCalledOnce();
    expect(ownerAfter.revision).toBe(revisionBefore + 1);
    expect(ownerAfter.profiles.captain.builds.space.keys.F1).toEqual(
      mixedCommands,
    );
    expect(fixture.storage.getProfile("captain").builds.space.keys.F1).toEqual(
      mixedCommands,
    );
    expect(ui.cache.dataState?.profiles.captain.builds.space.keys.F1).toEqual(
      mixedCommands,
    );
    expect(
      ownerAfter.profiles.captain.keybindMetadata.space.F1
        .stabilizeExecutionOrder,
    ).toBe(false);
    expect(stabilizeButton.classList.contains("active")).toBe(false);
  });

  it.each(targets)(
    "keeps owner, caches, storage, and publications unchanged when $label persistence fails",
    async (target) => {
      configureTarget(service, target);
      const ownerBefore = coordinator.getCurrentState();
      const cacheBefore = structuredClone(service.cache.dataState);
      const compatibilityBefore = structuredClone({
        profile: service.cache.profile,
        builds: service.cache.builds,
        keys: service.cache.keys,
        aliases: service.cache.aliases,
      });
      const durableBefore = structuredClone(
        fixture.storage.getProfile("captain"),
      );
      fixture.storage.saveProfile.mockReturnValue(false);
      vi.spyOn(console, "error").mockImplementation(() => {});

      await expect(
        service.setStabilize(target.name, target.stabilize, target.bindset),
      ).resolves.toEqual({
        success: false,
        error: "failed_to_save_profile",
      });

      expect(fixture.storage.saveProfile).toHaveBeenCalledOnce();
      expect(coordinator.getCurrentState()).toEqual(ownerBefore);
      expect(service.cache.dataState).toEqual(cacheBefore);
      expect({
        profile: service.cache.profile,
        builds: service.cache.builds,
        keys: service.cache.keys,
        aliases: service.cache.aliases,
      }).toEqual(compatibilityBefore);
      expect(fixture.storage.getProfile("captain")).toEqual(durableBefore);
      expect(
        fixture
          .getEventHistory()
          .filter(({ event }) => mutationEvents.includes(event)),
      ).toEqual([]);

      const lateJoiner = new CommandChainService({
        eventBus: fixture.eventBus,
        i18n: { t: (key) => key },
      });
      lateJoiners.push(lateJoiner);
      lateJoiner.init();
      await vi.waitFor(() => {
        expect(lateJoiner.cache.dataState?.ready).toBe(true);
      });
      configureTarget(lateJoiner, target);

      expect(
        isCachedCommandStabilized(lateJoiner, target.name, target.bindset),
      ).toBe(target.kind === "bindset" ? false : true);
    },
  );

  it.each(targets)(
    "writes before one accepted $label owner update and its compatibility publication",
    async (target) => {
      configureTarget(service, target);
      const order = [];
      const saveProfile = fixture.storage.saveProfile.getMockImplementation();
      if (!saveProfile) throw new Error("Expected storage fixture writer");
      fixture.storage.saveProfile.mockImplementation((...args) => {
        order.push("storage:save");
        return saveProfile(...args);
      });
      const detachState = fixture.eventBus.on("data:state-changed", () =>
        order.push("data:state-changed"),
      );
      const detachProfile = fixture.eventBus.on("profile:updated", () =>
        order.push("profile:updated"),
      );
      const ownerBefore = coordinator.getCurrentState();
      const revisionBefore = ownerBefore.revision;
      const metadataBefore = structuredClone(
        targetMetadata(ownerBefore.profiles.captain, target),
      );

      try {
        await expect(
          service.setStabilize(target.name, target.stabilize, target.bindset),
        ).resolves.toEqual({ success: true });
      } finally {
        detachState();
        detachProfile();
      }

      const ownerAfter = coordinator.getCurrentState();
      const durableAfter = fixture.storage.getProfile("captain");
      const ownerMetadata = targetMetadata(ownerAfter.profiles.captain, target);
      const durableMetadata = targetMetadata(durableAfter, target);

      expect(fixture.storage.saveProfile).toHaveBeenCalledOnce();
      expect(ownerAfter.revision).toBe(revisionBefore + 1);
      expect(ownerMetadata).toEqual({
        ...metadataBefore,
        stabilizeExecutionOrder: target.stabilize,
      });
      expect(durableMetadata).toEqual(ownerMetadata);
      expect(service.cache.dataState).toEqual(ownerAfter);
      expect(order).toEqual([
        "storage:save",
        "data:state-changed",
        "profile:updated",
      ]);

      const emitted = fixture.getEventHistory();
      expect(
        emitted.filter(({ event }) => event === "profile:updated"),
      ).toHaveLength(1);
      expect(
        emitted.filter(({ event }) =>
          [
            "chain-data-changed",
            "storage:data-changed",
            "stabilize-changed",
          ].includes(event),
        ),
      ).toEqual([]);

      const lateJoiner = new CommandChainService({
        eventBus: fixture.eventBus,
        i18n: { t: (key) => key },
      });
      lateJoiners.push(lateJoiner);
      lateJoiner.init();
      await vi.waitFor(() => {
        expect(lateJoiner.cache.dataState?.revision).toBe(ownerAfter.revision);
      });
      configureTarget(lateJoiner, target);

      expect(
        isCachedCommandStabilized(lateJoiner, target.name, target.bindset),
      ).toBe(target.stabilize);
    },
  );
});
