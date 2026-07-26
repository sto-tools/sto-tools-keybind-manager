import { describe, expect, it, vi } from "vitest";

import { request } from "../../src/js/core/requestResponse.js";

describe("Project restore checked-bundle boundary", () => {
  it("reports a durable reload failure without stale owner success and converges on retry", async () => {
    const bus = window.eventBus;
    const coordinator = window.dataCoordinator;
    const storage = window.storageService;

    expect(bus?.hasListeners("rpc:project:restore-from-content")).toBe(true);
    expect(coordinator?.getCurrentState?.().ready).toBe(true);
    expect(storage).toBeTruthy();
    if (!bus || !coordinator || !storage) return;

    const savedStorage = Array.from(
      { length: localStorage.length },
      (_, index) => {
        const key = localStorage.key(index);
        return key === null ? null : [key, localStorage.getItem(key)];
      },
    ).filter(Boolean);
    const beforeOwner = coordinator.getCurrentState();
    const profileId = "__browser-project-reload-failure__";
    const content = JSON.stringify({
      version: "1.0.0",
      exported: "2026-07-21T00:00:00.000Z",
      type: "project",
      data: {
        profiles: {
          [profileId]: {
            id: profileId,
            name: "Browser reload failure probe",
            description: "Durable import before owner reload",
            currentEnvironment: "ground",
            migrationVersion: "2.1.1",
            builds: {
              space: { keys: {} },
              ground: { keys: { G: ["Sprint"] } },
            },
            aliases: {},
            bindsets: {},
            keybindMetadata: {},
            aliasMetadata: {},
            bindsetMetadata: {},
            selections: {},
          },
        },
        currentProfile: profileId,
      },
    });
    const stateEvents = [];
    const profileEvents = [];
    const environmentEvents = [];
    const toastEvents = [];
    const detachers = [
      bus.on("data:state-changed", (event) => stateEvents.push(event)),
      bus.on("profile:switched", (event) => profileEvents.push(event)),
      bus.on("environment:changed", (event) => environmentEvents.push(event)),
      bus.on("toast:show", (event) => toastEvents.push(event)),
    ];
    const originalReload = coordinator.reloadState.bind(coordinator);
    const reload = vi
      .spyOn(coordinator, "reloadState")
      .mockImplementation(originalReload);
    reload.mockResolvedValueOnce({
      success: false,
      error: "browser reload blocked",
    });

    try {
      await expect(
        request(bus, "project:restore-from-content", {
          content,
          fileName: "browser-project.json",
        }),
      ).resolves.toEqual({
        success: false,
        error: "project_restore_reload_failed",
        params: { reason: "browser reload blocked" },
        durable: true,
        currentProfile: profileId,
        imported: { profiles: 1, settings: false },
        activation: { data: "pending", preferences: "not-required" },
      });
      expect(coordinator.getCurrentState()).toBe(beforeOwner);
      expect(stateEvents).toEqual([]);
      expect(profileEvents).toEqual([]);
      expect(environmentEvents).toEqual([]);
      expect(storage.getAllData()).toMatchObject({
        currentProfile: profileId,
        profiles: { [profileId]: { name: "Browser reload failure probe" } },
      });
      expect(toastEvents).toEqual([]);

      await expect(
        request(bus, "project:restore-from-content", {
          content,
          fileName: "browser-project.json",
        }),
      ).resolves.toEqual({
        success: true,
        currentProfile: profileId,
        imported: { profiles: 1, settings: false },
      });
      await vi.waitFor(() => {
        expect(coordinator.getCurrentState()).toMatchObject({
          currentProfile: profileId,
          currentEnvironment: "ground",
        });
      });
      expect(stateEvents).toHaveLength(1);
      expect(stateEvents[0]).toMatchObject({
        reason: "state-reloaded",
        state: { currentProfile: profileId, currentEnvironment: "ground" },
      });
      expect(profileEvents).toHaveLength(1);
      expect(profileEvents[0]).toMatchObject({
        profileId,
        environment: "ground",
      });
      expect(environmentEvents).toHaveLength(1);
      expect(environmentEvents[0]).toMatchObject({
        fromEnvironment: null,
        toEnvironment: "ground",
        environment: "ground",
      });
      expect(toastEvents).toEqual([]);
    } finally {
      for (const detach of detachers) detach();
      reload.mockRestore();
      localStorage.clear();
      for (const entry of savedStorage) {
        const [key, value] = entry;
        if (value !== null) localStorage.setItem(key, value);
      }
      storage.getAllData(true);
      await request(bus, "data:reload-state");
      await vi.waitFor(() => {
        expect(coordinator.getCurrentState()).toMatchObject({
          currentProfile: beforeOwner.currentProfile,
          currentEnvironment: beforeOwner.currentEnvironment,
        });
      });
    }
  });
});
