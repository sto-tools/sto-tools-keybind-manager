import { expect, vi } from "vitest";

export function createProjectRestoreSuccess() {
  return {
    success: true,
    currentProfile: null,
    imported: { profiles: 0, settings: false },
  };
}

export function rejectFinalProjectRootWrite(storage, profileId = "imported") {
  const setItem = localStorage.setItem.bind(localStorage);
  localStorage.setItem = (key, value) => {
    if (key === storage.storageKey) {
      const candidate = JSON.parse(value);
      if (candidate.currentProfile === profileId) {
        throw new DOMException("quota exceeded", "QuotaExceededError");
      }
    }
    setItem(key, value);
  };
}

export async function assertMundaneSettingsFinalRootFailure({
  storage,
  coordinator,
  eventBus,
  projectManager,
  importedProject,
}) {
  expect(
    storage.saveSettings({ theme: "dark", language: "en" }, { replace: true }),
  ).toBe(true);
  const beforeRoot = JSON.parse(localStorage.getItem(storage.storageKey));
  const beforeState = coordinator.getCurrentState();
  const stateChanged = vi.fn();
  const profileSwitched = vi.fn();
  const environmentChanged = vi.fn();
  eventBus.on("data:state-changed", stateChanged);
  eventBus.on("profile:switched", profileSwitched);
  eventBus.on("environment:changed", environmentChanged);
  rejectFinalProjectRootWrite(storage);

  const result = await projectManager.restoreFromProjectContent(
    JSON.stringify(importedProject),
  );

  expect(result).toEqual({
    success: false,
    error: "storage_write_failed",
    params: { operation: "project" },
    partial: true,
    committed: {
      profiles: ["imported"],
      settings: true,
      project: false,
    },
  });
  const durableRootText = localStorage.getItem(storage.storageKey);
  const durableRoot = JSON.parse(durableRootText);
  expect(durableRoot).toMatchObject({
    currentProfile: "existing",
    profiles: {
      existing: { name: "Existing" },
      imported: { name: "Imported" },
    },
  });
  expect(durableRoot.currentProfile).toBe(beforeRoot.currentProfile);
  expect(durableRoot.settings).toEqual(beforeRoot.settings);
  const durableBackup = JSON.parse(localStorage.getItem(storage.backupKey));
  expect(durableBackup.version).toBe("1.0.0");
  expect(durableBackup.data).toBe(durableRootText);

  const durableSettings = JSON.parse(localStorage.getItem(storage.settingsKey));
  expect(durableSettings).toMatchObject({ theme: "light", language: "de" });
  expect(Object.hasOwn(durableSettings, "version")).toBe(false);
  expect(Object.hasOwn(durableSettings, "firstRun")).toBe(false);
  expect(storage.getAllData()).toEqual(durableRoot);
  expect(coordinator.getCurrentState()).toBe(beforeState);
  expect(stateChanged).not.toHaveBeenCalled();
  expect(profileSwitched).not.toHaveBeenCalled();
  expect(environmentChanged).not.toHaveBeenCalled();
  expect(projectManager.ui.showToast).not.toHaveBeenCalled();
}
