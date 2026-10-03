import { expect, it, vi } from "vitest";
import SyncService from "../../../src/js/components/services/SyncService.js";
import { request } from "../../../src/js/core/requestResponse.js";
import { importedProject } from "../../fixtures/services/projectImportOwnerChain.js";

export function registerManualSyncActivationCases(owners) {
  it.each([false, true])(
    "existing manual Sync Now completes different imported preferences without replay (explicit preceding Save: %s)",
    async (explicitSave) => {
      const {
        eventBusFixture,
        preferences,
        coordinator,
        projectRepository,
        settingsRepository,
        projectManager,
        importedProjectOwnerAction,
      } = owners();
      await preferences.setSettings({
        ...preferences.getSettings(),
        theme: "dark",
        plugin: { enabled: true, obsolete: "old" },
      });
      const artifact = structuredClone(importedProject);
      artifact.data.currentProfile = null;
      artifact.data.settings.plugin = {
        enabled: false,
        nested: { values: [1, "new"] },
      };
      const content = JSON.stringify(artifact);
      const directory = {
        kind: "directory",
        name: "selected",
        queryPermission: vi.fn(async () => "granted"),
        requestPermission: vi.fn(async () => "granted"),
        getFileHandle: vi.fn(),
        getDirectoryHandle: vi.fn(),
      };
      const fs = {
        getSyncDirectoryState: vi.fn(async () => ({
          handle: directory,
          transitionPending: false,
        })),
      };
      const sync = new SyncService({
        eventBus: eventBusFixture.eventBus,
        fs,
        ui: { showToast: vi.fn() },
        i18n: {
          t: (key, params) => (params?.error ? `${key}:${params.error}` : key),
        },
      });
      sync.init();
      vi.spyOn(sync, "isFirefox").mockReturnValue(false);
      vi.spyOn(sync, "isSecureContext").mockReturnValue(true);
      const committed = projectRepository.commit.bind(projectRepository);
      const rootWrites = vi
        .spyOn(projectRepository, "commit")
        .mockImplementationOnce((...args) => {
          const receipt = committed(...args);
          coordinator._lifecycleGeneration += 1;
          return receipt;
        });
      const settingsWrites = vi.spyOn(settingsRepository, "replace");
      const restore = vi.spyOn(projectManager, "restoreFromProjectContent");
      const retry = vi.spyOn(projectManager, "retryRestoreActivation");
      const invoke = vi.spyOn(sync, "invokeRequest");
      try {
        sync.stagePendingSyncDecision("import", {
          content,
          fileName: "project.json",
        });
        await preferences.saveSettings();
        expect(sync.pendingRestoreActivationReceipt).toMatchObject({
          activation: { data: "pending", preferences: "pending" },
        });
        expect(preferences.getSettings()).toMatchObject({
          theme: "dark",
          plugin: { enabled: true, obsolete: "old" },
        });
        expect(settingsRepository.load().value).toMatchObject({
          theme: "light",
          plugin: artifact.data.settings.plugin,
        });
        expect(rootWrites).toHaveBeenCalledOnce();
        expect(restore).toHaveBeenCalledOnce();
        expect(importedProjectOwnerAction).toHaveBeenCalledOnce();
        if (explicitSave) {
          await preferences.saveSettings();
          expect(settingsRepository.load().value.theme).toBe("dark");
        }
        const root = localStorage.getItem("sto_keybind_manager");
        const backup = localStorage.getItem("sto_keybind_manager_backup");
        const settings = localStorage.getItem("sto_keybind_settings");
        const writes = settingsWrites.mock.calls.length;
        const reads = directory.getFileHandle.mock.calls.length;
        const loads = fs.getSyncDirectoryState.mock.calls.length;
        const retries = retry.mock.calls.length;
        const result = await request(
          eventBusFixture.eventBus,
          "sync:sync-project",
          { source: "manual" },
          0,
        );
        expect(result).toMatchObject({ success: !explicitSave });
        expect(retry).toHaveBeenCalledTimes(retries + 1);
        expect(rootWrites).toHaveBeenCalledOnce();
        expect(settingsWrites).toHaveBeenCalledTimes(writes);
        expect(restore).toHaveBeenCalledOnce();
        expect(importedProjectOwnerAction).toHaveBeenCalledOnce();
        expect(directory.getFileHandle).toHaveBeenCalledTimes(reads);
        expect(fs.getSyncDirectoryState).toHaveBeenCalledTimes(loads);
        expect(
          invoke.mock.calls.some(
            ([topic]) => topic === "export:sync-to-folder",
          ),
        ).toBe(false);
        expect(localStorage.getItem("sto_keybind_manager")).toBe(root);
        expect(localStorage.getItem("sto_keybind_manager_backup")).toBe(backup);
        expect(localStorage.getItem("sto_keybind_settings")).toBe(settings);
        if (explicitSave) {
          expect(sync.pendingRestoreActivationReceipt).not.toBeNull();
          expect(preferences.getSettings().theme).toBe("dark");
        } else {
          expect(sync.pendingSyncAction).toBeNull();
          expect(coordinator.getCurrentState().currentProfile).toBe("existing");
          expect(preferences.getSettings()).toMatchObject({
            theme: "light",
            plugin: artifact.data.settings.plugin,
          });
          expect(preferences.getSettings().plugin).not.toHaveProperty(
            "obsolete",
          );
          expect(sync.ui.showToast).toHaveBeenLastCalledWith(
            "project_imported_from_sync_folder",
            "success",
          );
        }
      } finally {
        sync.destroy();
      }
    },
  );
}
