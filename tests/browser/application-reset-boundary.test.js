import { runtime } from "../fixtures/ui/applicationRuntime.js";
import { describe, expect, it, vi } from "vitest";

import { readPreferencesState } from "../fixtures/ui/preferencesState.js";
import {
  PROJECT_BACKUP_KEY,
  PROJECT_RESET_KEY,
  PROJECT_ROOT_KEY,
} from "../fixtures/ui/projectStorage.js";

describe("Application reset checked-bundle boundary", () => {
  it("routes the confirmed UI action through both owners before reporting success", async () => {
    const applicationRuntime = runtime();
    const { eventBus: bus, dataCoordinator: coordinator } = applicationRuntime;

    expect(bus.hasListeners("rpc:application:reset")).toBe(true);
    expect(bus.hasListeners("storage:data-reset")).toBe(false);
    expect(applicationRuntime).not.toHaveProperty("storageService");
    expect(applicationRuntime).not.toHaveProperty("projectRepository");
    expect(coordinator.getCurrentState().currentProfile).toBeTruthy();

    const unrelatedKey = "application-reset-browser-unrelated";
    localStorage.setItem(unrelatedKey, "preserved");
    const order = [];
    const detachers = [
      bus.on("data:state-changed", ({ reason }) =>
        order.push(`data:${reason}`),
      ),
      bus.on("preferences:state-changed", ({ reason }) =>
        order.push(`preferences:${reason}`),
      ),
      bus.on("toast:show", ({ type }) => order.push(`toast:${type}`)),
    ];

    try {
      document.getElementById("resetAppBtn").click();
      await vi.waitFor(() => {
        expect(
          document.getElementById("resetApplicationConfirmModal"),
        ).toBeTruthy();
      });
      document
        .querySelector("#resetApplicationConfirmModal .confirm-yes")
        .click();

      await vi.waitFor(() => {
        expect(order).toContain("toast:success");
      });

      expect(order).toEqual([
        "preferences:settings-reset",
        "data:storage-reset",
        "toast:success",
      ]);
      expect(localStorage.getItem(PROJECT_ROOT_KEY)).toBeNull();
      expect(localStorage.getItem(PROJECT_BACKUP_KEY)).toBeNull();
      expect(localStorage.getItem(PROJECT_RESET_KEY)).toBe("true");
      expect(localStorage.getItem(unrelatedKey)).toBe("preserved");
      expect(coordinator.getCurrentState()).toMatchObject({
        ready: true,
        currentProfile: null,
        currentEnvironment: "space",
        profiles: {},
      });

      const preferences = await readPreferencesState(bus);
      expect(JSON.parse(localStorage.getItem("sto_keybind_settings"))).toEqual(
        preferences.settings,
      );
      expect(preferences.settings).toMatchObject({
        theme: "default",
        language: "en",
        compactView: false,
        autoSync: false,
      });
    } finally {
      detachers.forEach((detach) => detach());
      localStorage.removeItem(unrelatedKey);
    }
  });
});
