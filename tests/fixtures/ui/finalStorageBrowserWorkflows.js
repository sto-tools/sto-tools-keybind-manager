import { expect, vi } from "vitest";
import en from "../../../src/i18n/en.json";
import { createDefaultPreferencesSettings } from "../../../src/js/components/services/preferencesDefaults.js";
import {
  BACKUP,
  ROOT,
  SETTINGS,
  confirm,
  seededProject,
  storageDiagnostics,
  withApplication,
} from "./applicationRuntime.js";

const JOURNAL_KEYS = ["sync-folder", "sync-folder-transition-pending"];

function toasts(application, kind) {
  return [
    ...application.document.querySelectorAll(`.toast-${kind} .toast-message`),
  ].map((node) => node.textContent);
}

function clearToasts(application) {
  application.document
    .querySelectorAll(".toast")
    .forEach((node) => node.remove());
}

// Reload the same iframe against the exact durable inputs left by the workflow.
// Unlike withApplication(), this never seeds, clears, or restores storage.
async function restartApplication(application) {
  const frame = application.window.frameElement;
  expect(frame).toBeTruthy();
  const loaded = new Promise((resolve) =>
    frame.addEventListener("load", resolve, { once: true }),
  );
  application.window.location.reload();
  await loaded;
  const document = application.window.document;
  await vi.waitFor(
    () => {
      expect(
        document.getElementById("appVersion")?.textContent.trim(),
      ).not.toBe("");
      expect(storageDiagnostics(application.window).domains).toHaveLength(7);
    },
    { timeout: 10000 },
  );
  expect(application.window.devMonitor.getRuntimeDiagnostics).toBeUndefined();
  expect(
    application.window.devMonitor.registerRuntimeDiagnostics,
  ).toBeUndefined();
  expect(application.window.devMonitor.clearRuntimeDiagnostics).toBeUndefined();
  expect(application.window.devMonitor.runtimeDiagnostics).toBeUndefined();
  return {
    window: application.window,
    document,
    root: application.root,
    settings: application.settings,
    diagnostics: application.diagnostics,
    element(selector) {
      const element = document.querySelector(selector);
      expect(
        element,
        `Required restarted user control ${selector}`,
      ).toBeTruthy();
      return element;
    },
  };
}

async function confirmReset(application) {
  application.element("#resetAppBtn").click();
  await confirm(application);
}

export async function resetRetryAndRestart() {
  await withApplication(async (application) => {
    localStorage.setItem("final-reset-unrelated", "preserved");
    const settingsBefore = localStorage.getItem(SETTINGS);
    const originalRemove = application.window.Storage.prototype.removeItem;
    let interrupted = false;
    const removal = vi
      .spyOn(application.window.Storage.prototype, "removeItem")
      .mockImplementation(function (key) {
        const result = originalRemove.call(this, key);
        if (key === ROOT && !interrupted) {
          interrupted = true;
          // Real removal already happened: a failure cannot promise rollback.
          throw new application.window.DOMException(
            "test-owned removal acknowledgement failure",
            "SecurityError",
          );
        }
        return result;
      });
    clearToasts(application);
    await confirmReset(application);
    // Header reset feedback is deliberately success-only. Its closed public
    // metadata still reports the structured partial failure without a handle.
    await vi.waitFor(() => {
      const outcome = application
        .diagnostics()
        .domains.find(({ domain }) => domain === "project").lastOperation;
      expect(outcome).toMatchObject({
        operation: "reset",
        status: "failed",
        // The fixed diagnostic vocabulary redacts this workflow error code.
        error: "unknown",
        committed: "indeterminate",
      });
      expect(outcome.stages).toContainEqual({
        stage: "rootClear",
        status: "failed",
        committed: "indeterminate",
        error: "storage_write_failed",
        category: null,
      });
    });
    expect(interrupted).toBe(true);
    expect(localStorage.getItem(ROOT)).toBeNull();
    expect(localStorage.getItem(SETTINGS)).toBe(settingsBefore);
    expect(toasts(application, "success")).not.toContain(
      en.application_reset_successfully,
    );
    expect(application.element("#profileSelect").value).toBe("captain");

    removal.mockRestore();
    clearToasts(application);
    await confirmReset(application);
    await vi.waitFor(() =>
      expect(toasts(application, "success")).toContain(
        en.application_reset_successfully,
      ),
    );
    expect(localStorage.getItem(ROOT)).toBeNull();
    expect(localStorage.getItem(BACKUP)).toBeNull();
    expect(localStorage.getItem("sto_app_reset")).toBe("true");
    expect(localStorage.getItem("sto_keybind_manager_visited")).toBe("true");
    expect(localStorage.getItem("final-reset-unrelated")).toBe("preserved");
    expect(application.settings()).toEqual(createDefaultPreferencesSettings());

    const restarted = await restartApplication(application);
    await vi.waitFor(() => {
      expect(localStorage.getItem("sto_app_reset")).toBeNull();
      expect(restarted.root()).toMatchObject({
        profiles: {},
        currentProfile: null,
      });
      expect(restarted.root()).not.toHaveProperty("settings");
      expect(restarted.settings()).toEqual(createDefaultPreferencesSettings());
    });
    expect(
      [...restarted.element("#profileSelect").options].filter(
        (option) => !option.disabled && option.value,
      ),
    ).toHaveLength(0);
    expect(localStorage.getItem(BACKUP)).toBeNull();
    expect(localStorage.getItem("final-reset-unrelated")).toBe("preserved");
    expect(localStorage.getItem("sto_keybind_manager_visited")).toBe("true");
  });
}

async function directoryJournal(target, entries = null) {
  const database = await new Promise((resolve, reject) => {
    const request = target.indexedDB.open("sto-sync-handles", 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("directories");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    const transaction = database.transaction(
      "directories",
      entries ? "readwrite" : "readonly",
    );
    const completed = new Promise((resolve, reject) => {
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    const store = transaction.objectStore("directories");
    if (entries) {
      for (const [key, value] of entries) {
        if (value === undefined) store.delete(key);
        else store.put(value, key);
      }
      await completed;
      return entries;
    }
    const result = await Promise.all(
      JOURNAL_KEYS.map(
        (key) =>
          new Promise((resolve, reject) => {
            const request = store.get(key);
            request.onsuccess = () => resolve([key, request.result]);
            request.onerror = () => reject(request.error);
          }),
      ),
    );
    await completed;
    return result;
  } finally {
    database.close();
  }
}

async function writeNativeFile(directory, name, content) {
  const file = await directory.getFileHandle(name, { create: true });
  const stream = await file.createWritable();
  await stream.write(content);
  await stream.close();
}

export async function syncRestoreRetryAndRestart() {
  const settings = {
    ...createDefaultPreferencesSettings(),
    theme: "dark",
    currentProfile: "captain",
    "plugin:layout": { density: "compact", nested: [1, { retained: true }] },
  };
  await withApplication(
    async (application) => {
      const previousJournal = await directoryJournal(application.window);
      const opfs = await application.window.navigator.storage.getDirectory();
      const directory = await opfs.getDirectoryHandle(
        `final-storage-restore-${Date.now()}`,
        { create: true },
      );
      try {
        const project = seededProject();
        project.profiles.captain.name = "Synced Captain";
        project.profiles.captain.description = "Native restored profile";
        const selectionSettings = {
          ...settings,
          syncFolderName: directory.name,
          syncFolderPath: `Selected folder: ${directory.name}`,
          syncFolderFallback: false,
          autoSync: true,
        };
        const portableSettings = {
          ...selectionSettings,
          theme: "light",
          currentProfile: null,
          "plugin:layout": {
            density: "expanded",
            nested: [2, { retained: false, imported: true }],
          },
        };
        const artifact = JSON.stringify({
          type: "project",
          version: "1.0.0",
          exported: "2026-10-03T01:02:03.000Z",
          data: {
            profiles: project.profiles,
            currentProfile: "captain",
            settings: portableSettings,
          },
        });
        await writeNativeFile(directory, "project.json", artifact);
        const nativeGetFile =
          application.window.FileSystemFileHandle.prototype.getFile;
        const reads = vi
          .spyOn(application.window.FileSystemFileHandle.prototype, "getFile")
          .mockImplementation(function (...args) {
            return nativeGetFile.apply(this, args);
          });
        application.window.showDirectoryPicker = vi
          .fn()
          .mockResolvedValue(directory);
        application.element("#preferencesBtn").click();
        application.element("#setSyncFolderBtn").click();
        await confirm(application);
        await vi.waitFor(() =>
          expect(application.settings().syncFolderName).toBe(directory.name),
        );
        // The durable settings write precedes capability finalization and the
        // staged decision. Wait for the public completion display before Save.
        await vi.waitFor(() =>
          expect(application.element("#currentSyncFolder").textContent).toBe(
            directory.name,
          ),
        );
        expect(application.window.showDirectoryPicker).toHaveBeenCalledOnce();
        expect(application.settings()).toEqual(selectionSettings);
        expect(
          application.document.documentElement.getAttribute("data-theme"),
        ).toBe("dark");
        const nativeClone = application.window.structuredClone;
        const nativeWrite = application.window.Storage.prototype.setItem;
        let rootAcknowledged = false;
        let activationFailed = false;
        const writes = vi
          .spyOn(application.window.Storage.prototype, "setItem")
          .mockImplementation(function (key, value) {
            const result = nativeWrite.call(this, key, value);
            if (key === ROOT) rootAcknowledged = true;
            return result;
          });
        const clone = vi
          .spyOn(application.window, "structuredClone")
          .mockImplementation((value, ...args) => {
            // Only the profile-map clone during post-write owner adoption fails.
            // Root/receipt decoding and the repository acknowledgement succeed.
            if (
              rootAcknowledged &&
              !activationFailed &&
              value?.captain?.name === "Synced Captain"
            ) {
              activationFailed = true;
              throw new application.window.DOMException(
                "test-owned adoption interruption",
                "DataCloneError",
              );
            }
            return nativeClone.call(application.window, value, ...args);
          });
        clearToasts(application);
        application.element("#savePreferencesBtn").click();
        await vi.waitFor(
          () => {
            expect(activationFailed).toBe(true);
            expect(
              application.document.querySelector(".toast-error"),
            ).toBeTruthy();
          },
          { timeout: 10000 },
        );
        expect(application.root().profiles.captain.name).toBe("Synced Captain");
        expect(application.root()).not.toHaveProperty("settings");
        expect(application.settings()).toEqual(portableSettings);
        expect(
          application.document.documentElement.getAttribute("data-theme"),
        ).toBe("dark");
        expect(toasts(application, "success")).not.toContain(
          en.project_imported_from_sync_folder,
        );
        expect(
          application.element('#profileSelect option[value="captain"]')
            .textContent,
        ).not.toContain("Synced Captain");
        expect(writes.mock.calls.filter(([key]) => key === ROOT)).toHaveLength(
          1,
        );
        expect(
          writes.mock.calls.filter(([key]) => key === BACKUP),
        ).toHaveLength(1);
        const importedRoot = localStorage.getItem(ROOT);
        const importedSettings = localStorage.getItem(SETTINGS);
        const projectReads = reads.mock.contexts.filter(
          (handle) => handle.name === "project.json",
        ).length;
        expect(projectReads).toBeGreaterThan(0);

        clone.mockRestore();
        writes.mockClear();
        clearToasts(application);
        // Save is an ordinary settings mutation. Existing Sync Now resumes the
        // acknowledged import activation without rewriting settings or files.
        application.element("#syncNowBtn").click();
        await vi.waitFor(
          () =>
            expect(toasts(application, "success")).toContain(
              en.project_imported_from_sync_folder,
            ),
          { timeout: 10000 },
        );
        expect(
          application.element('#profileSelect option[value="captain"]')
            .textContent,
        ).toContain("Synced Captain");
        expect(localStorage.getItem(ROOT)).toBe(importedRoot);
        expect(localStorage.getItem(SETTINGS)).toBe(importedSettings);
        expect(
          application.document.documentElement.getAttribute("data-theme"),
        ).toBeNull();
        expect(application.element("#themeToggleText").textContent).toBe(
          en.dark_mode,
        );
        expect(writes.mock.calls.filter(([key]) => key === ROOT)).toHaveLength(
          0,
        );
        expect(
          writes.mock.calls.filter(([key]) => key === BACKUP),
        ).toHaveLength(0);
        expect(
          writes.mock.calls.filter(([key]) => key === SETTINGS),
        ).toHaveLength(0);
        expect(
          reads.mock.contexts.filter(
            (handle) => handle.name === "project.json",
          ),
        ).toHaveLength(projectReads);

        // Ordinary preference changes emit saved receipts and would consume a
        // pending folder decision. Disable autosync only after retry completed.
        application.element("#preferencesBtn").click();
        expect(application.element("#autoSync").checked).toBe(true);
        application.element("#autoSync").click();
        const finalSettings = { ...portableSettings, autoSync: false };
        await vi.waitFor(() =>
          expect(application.settings()).toEqual(finalSettings),
        );

        vi.restoreAllMocks();
        const restarted = await restartApplication(application);
        await vi.waitFor(() =>
          expect(
            restarted.element('#profileSelect option[value="captain"]')
              .textContent,
          ).toContain("Synced Captain"),
        );
        expect(restarted.settings()).toEqual(finalSettings);
        expect(
          restarted.document.documentElement.getAttribute("data-theme"),
        ).toBeNull();
        expect(restarted.element("#themeToggleText").textContent).toBe(
          en.dark_mode,
        );
        expect(restarted.root()).not.toHaveProperty("settings");
        restarted.element("#preferencesBtn").click();
        expect(restarted.element("#currentSyncFolder").textContent).toBe(
          directory.name,
        );
        restarted.element("#preferencesModal .modal-close").click();
        clearToasts(restarted);
        restarted.element("#syncNowBtn").click();
        await vi.waitFor(
          () =>
            expect(toasts(restarted, "success")).toContain(
              en.project_synced_successfully,
            ),
          { timeout: 10000 },
        );
        // Native handles belong to the iframe realm that produced them. After
        // navigation inspect the same durable directory through the live realm.
        const restartedOpfs =
          await restarted.window.navigator.storage.getDirectory();
        const restartedDirectory = await restartedOpfs.getDirectoryHandle(
          directory.name,
        );
        const synced = JSON.parse(
          await (
            await (
              await restartedDirectory.getFileHandle("project.json")
            ).getFile()
          ).text(),
        );
        expect(synced.data.settings).toEqual(finalSettings);
        expect(synced.data.profiles.captain.name).toBe("Synced Captain");
        expect(synced.data.profiles.captain.extension).toEqual({
          retained: true,
        });
        expect(synced.data.currentProfile).toBe("captain");
      } finally {
        vi.restoreAllMocks();
        await directoryJournal(application.window, previousJournal);
        const liveOpfs =
          await application.window.navigator.storage.getDirectory();
        await liveOpfs.removeEntry(directory.name, { recursive: true });
      }
    },
    { settings },
  );
}
