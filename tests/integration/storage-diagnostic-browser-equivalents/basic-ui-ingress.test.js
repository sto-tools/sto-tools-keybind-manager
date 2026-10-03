// Exact internal assertions preserved from tests/browser/basic-ui.test.js.
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

describe("Application source-composition ingress equivalent", () => {
  it("rejects deeply invalid project data before the live import route writes", async () => {
    const bus = runtime().commandChainUI?.eventBus;
    const coordinator = runtime().dataCoordinator;

    expect(bus?.hasListeners("rpc:import:project-file")).toBe(true);
    expect(coordinator?.getCurrentState?.().ready).toBe(true);
    if (!bus || !coordinator) return;

    const beforeRoot = localStorage.getItem("sto_keybind_manager");
    const beforeSettings = localStorage.getItem("sto_keybind_settings");
    const beforeState = coordinator.getCurrentState();
    const result = await request(bus, "import:project-file", {
      content: JSON.stringify({
        type: "project",
        data: {
          profiles: {
            valid: {
              name: "Valid",
              builds: { space: { keys: { F1: ["FireAll"] } } },
            },
            invalid: {
              name: "Invalid",
              builds: { ground: { keys: { G: 42 } } },
            },
          },
        },
      }),
    });

    expect(result).toEqual({
      success: false,
      error: "invalid_project_file",
      params: { path: "$.data.profiles.invalid.builds.ground.keys.G" },
    });
    expect(localStorage.getItem("sto_keybind_manager")).toBe(beforeRoot);
    expect(localStorage.getItem("sto_keybind_settings")).toBe(beforeSettings);
    expect(coordinator.getCurrentState()).toBe(beforeState);
  });

  it("restores a valid wrapped project through the live owner chain", async () => {
    const bus = runtime().commandChainUI?.eventBus;
    const coordinator = runtime().dataCoordinator;

    expect(bus?.hasListeners("rpc:project:restore-from-content")).toBe(true);
    expect(coordinator?.getCurrentState?.().ready).toBe(true);
    if (!bus || !coordinator) return;

    const beforeStorage = new Map();
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);
      if (key !== null) beforeStorage.set(key, localStorage.getItem(key));
    }
    const profileId = "__browser-project-import-probe__";

    try {
      const result = await request(bus, "project:restore-from-content", {
        content: JSON.stringify({
          version: "1.0.0",
          exported: "2026-07-17T00:00:00.000Z",
          type: "project",
          data: {
            profiles: {
              [profileId]: {
                id: profileId,
                name: "Browser project import probe",
                description: "Live owner-chain restore",
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
        }),
        fileName: "browser-project-import.json",
      });

      expect(result).toEqual({
        success: true,
        currentProfile: profileId,
        imported: { profiles: 1, settings: false },
      });
      await vi.waitFor(() => {
        expect(coordinator.getCurrentState()).toMatchObject({
          ready: true,
          currentProfile: profileId,
          currentEnvironment: "ground",
          currentProfileData: {
            id: profileId,
            name: "Browser project import probe",
            builds: { ground: { keys: { G: ["Sprint"] } } },
          },
        });
      });
      expect(
        JSON.parse(localStorage.getItem("sto_keybind_manager")),
      ).toMatchObject({
        currentProfile: profileId,
        profiles: {
          [profileId]: { name: "Browser project import probe" },
        },
      });
    } finally {
      localStorage.clear();
      for (const [key, value] of beforeStorage) {
        if (value !== null) localStorage.setItem(key, value);
      }
      await request(bus, "data:reload-state");
    }
  });
});
