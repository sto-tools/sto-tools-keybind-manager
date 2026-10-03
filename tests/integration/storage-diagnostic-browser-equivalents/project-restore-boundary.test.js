// Exact internal assertions preserved from tests/browser/project-restore-boundary.test.js.
import { beforeEach, afterEach } from "vitest";
import {
  initializeSourceApplication,
  destroySourceApplication,
} from "../../fixtures/ui/sourceApplicationRuntime.js";
beforeEach(initializeSourceApplication);
afterEach(destroySourceApplication);

import { runtime } from "../../fixtures/ui/sourceApplicationRuntime.js";
import { describe, expect, it, vi } from "vitest";

import { request } from "../../../src/js/core/requestResponse.js";
import {
  PROJECT_ROOT_KEY,
  readProjectRoot,
} from "../../fixtures/ui/projectStorage.js";

describe("Project restore source-composition equivalent boundary", () => {
  it("adopts the exact durable repository result without a post-write reload", async () => {
    const bus = runtime().eventBus;
    const coordinator = runtime().dataCoordinator;

    expect(bus?.hasListeners("rpc:project:restore-from-content")).toBe(true);
    expect(bus?.hasListeners("rpc:project:retry-restore-activation")).toBe(
      true,
    );
    expect(coordinator?.getCurrentState?.().ready).toBe(true);
    if (!bus || !coordinator) return;

    const savedStorage = Array.from(
      { length: localStorage.length },
      (_, index) => {
        const key = localStorage.key(index);
        return key === null ? null : [key, localStorage.getItem(key)];
      },
    ).filter(Boolean);
    const beforeOwner = coordinator.getCurrentState();
    const profileId = "__browser-project-exact-adoption__";
    const content = JSON.stringify({
      version: "1.0.0",
      exported: "2026-07-21T00:00:00.000Z",
      type: "project",
      data: {
        profiles: {
          [profileId]: {
            id: profileId,
            name: "Browser exact adoption probe",
            description: "Durable import adopted from the commit result",
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
    const originalGetItem = Storage.prototype.getItem;
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    let rejectImportedAdoption = true;
    const getItem = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation((key) => {
        const raw = originalGetItem.call(localStorage, key);
        if (
          key === PROJECT_ROOT_KEY &&
          rejectImportedAdoption &&
          raw &&
          JSON.parse(raw).currentProfile === profileId
        ) {
          rejectImportedAdoption = false;
          throw new Error("browser reload blocked");
        }
        return raw;
      });

    try {
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
      expect(rejectImportedAdoption).toBe(true);
      getItem.mockRestore();
      expect(readProjectRoot()).toMatchObject({
        currentProfile: profileId,
        profiles: { [profileId]: { name: "Browser exact adoption probe" } },
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
      expect(
        setItem.mock.calls.filter(([key]) => key === PROJECT_ROOT_KEY),
      ).toHaveLength(1);
    } finally {
      for (const detach of detachers) detach();
      getItem.mockRestore();
      setItem.mockRestore();
      localStorage.clear();
      for (const entry of savedStorage) {
        const [key, value] = entry;
        if (value !== null) localStorage.setItem(key, value);
      }
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
