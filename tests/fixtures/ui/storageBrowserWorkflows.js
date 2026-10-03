import { expect, vi } from "vitest";
import {
  BACKUP,
  ROOT,
  SETTINGS,
  confirm,
  faultWrites,
  seededProject,
  withApplication,
} from "./applicationRuntime.js";

export async function writerRouting() {
  await withApplication(async (app) => {
    const snapshot = app.diagnostics();
    expect(snapshot.domains.map((row) => row.domain)).toEqual([
      "project",
      "settings",
      "presentation",
      "key-browser",
      "welcome",
      "diagnostic",
      "sync-capability",
    ]);
    expect(snapshot.domains.every((row) => row.portRegistered)).toBe(true);
    expect(
      snapshot.domains.find((row) => row.domain === "project"),
    ).toMatchObject({
      owner: "DataCoordinator",
      adapter: "LocalStorageProjectRepository",
      structuralLayout: "settings-free",
    });
    expect(
      snapshot.domains.find((row) => row.domain === "settings"),
    ).toMatchObject({
      owner: "PreferencesService",
      adapter: "LocalStorageSettingsRepository",
      structuralLayout: "standalone-settings",
    });
    expect(app.root()).not.toHaveProperty("settings");
    const setItem = vi.spyOn(app.window.Storage.prototype, "setItem");
    const removeItem = vi.spyOn(app.window.Storage.prototype, "removeItem");
    const clear = vi.spyOn(app.window.Storage.prototype, "clear");
    const before = app.settings().theme;
    app.element("#themeToggleBtn").click();
    await vi.waitFor(() => expect(app.settings().theme).not.toBe(before));
    expect(setItem.mock.calls.map(([key]) => key)).toEqual([SETTINGS]);
    expect(removeItem).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
    setItem.mockClear();
    app.element("#newProfileBtn").click();
    app.element("#profileName").value = "Writer Probe";
    app.element("#profileDescription").value = "durable writer probe";
    app.element("#saveProfileBtn").click();
    await vi.waitFor(() =>
      expect(app.root().profiles.writer_probe.description).toBe(
        "durable writer probe",
      ),
    );
    // The public creation workflow commits creation and then selection separately.
    expect(setItem.mock.calls.map(([key]) => key)).toEqual([
      BACKUP,
      ROOT,
      BACKUP,
      ROOT,
    ]);
    expect(removeItem).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
  });
}

export async function failedSettings({ readback = false } = {}) {
  await withApplication(async (app) => {
    const beforeRaw = localStorage.getItem(SETTINGS);
    const rootBefore = localStorage.getItem(ROOT);
    const backupBefore = localStorage.getItem(BACKUP);
    const beforeText = app.element("#themeToggleText").textContent;
    app.document.querySelectorAll(".toast").forEach((toast) => toast.remove());
    const write = readback
      ? vi.spyOn(app.window.Storage.prototype, "setItem")
      : faultWrites(app, SETTINGS);
    if (readback) {
      const original = app.window.Storage.prototype.getItem;
      vi.spyOn(app.window.Storage.prototype, "getItem").mockImplementation(
        function (key) {
          if (key === SETTINGS)
            throw new app.window.DOMException(
              "private read fault",
              "SecurityError",
            );
          return original.call(this, key);
        },
      );
    }
    app.element("#themeToggleBtn").click();
    await vi.waitFor(() =>
      expect(write.mock.calls.filter(([key]) => key === SETTINGS)).toHaveLength(
        1,
      ),
    );
    await vi.waitFor(() =>
      expect(
        app.diagnostics().domains.find((row) => row.domain === "settings")
          .lastOperation.status,
      ).toBe(readback ? "verification_failed" : "write_failed"),
    );
    expect(app.element("#themeToggleText").textContent).toBe(beforeText);
    expect(app.document.querySelectorAll(".toast-success")).toHaveLength(0);
    expect(localStorage.getItem(ROOT)).toBe(rootBefore);
    expect(localStorage.getItem(BACKUP)).toBe(backupBefore);
    if (readback)
      expect(JSON.parse(localStorage.getItem(SETTINGS)).theme).not.toBe(
        JSON.parse(beforeRaw).theme,
      );
    else expect(localStorage.getItem(SETTINGS)).toBe(beforeRaw);
  });
}

export async function savedPreferences() {
  await withApplication(async (app) => {
    app.element("#preferencesBtn").click();
    await vi.waitFor(() =>
      expect(
        app.element("#preferencesModal").classList.contains("active"),
      ).toBe(true),
    );
    const check = app.element("#bindToAliasModeCheckbox");
    check.checked = !app.settings().bindToAliasMode;
    check.dispatchEvent(new app.window.Event("change", { bubbles: true }));
    const expected = check.checked;
    app.element("#savePreferencesBtn").click();
    await vi.waitFor(() => {
      expect(app.settings().bindToAliasMode).toBe(expected);
      expect(
        app.element("#preferencesModal").classList.contains("active"),
      ).toBe(false);
    });
    expect(app.root()).not.toHaveProperty("settings");
  });
}

export async function syncFolderFailure() {
  await withApplication(async (app) => {
    const before = localStorage.getItem(SETTINGS);
    const original = app.element("#currentSyncFolder").textContent;
    const opfs = await app.window.navigator.storage.getDirectory();
    const handle = await opfs.getDirectoryHandle(`quota-folder-${Date.now()}`, {
      create: true,
    });
    app.window.showDirectoryPicker = vi.fn().mockResolvedValue(handle);
    app.element("#preferencesBtn").click();
    app.document.querySelectorAll(".toast").forEach((toast) => toast.remove());
    const writes = faultWrites(app, SETTINGS);
    app.element("#setSyncFolderBtn").click();
    await vi.waitFor(() =>
      expect(writes.mock.calls.some(([key]) => key === SETTINGS)).toBe(true),
    );
    await vi.waitFor(() =>
      expect(app.document.querySelector(".toast-error")).toBeTruthy(),
    );
    expect(localStorage.getItem(SETTINGS)).toBe(before);
    expect(app.element("#currentSyncFolder").textContent).toBe(original);
    expect(app.document.querySelectorAll(".toast-success")).toHaveLength(0);
    expect(app.window.showDirectoryPicker).toHaveBeenCalledOnce();
    await opfs.removeEntry(handle.name, { recursive: true });
  });
}

export async function resetApplication() {
  await withApplication(async (app) => {
    localStorage.setItem("unrelated-reset-probe", "preserved");
    app.document.querySelectorAll(".toast").forEach((toast) => toast.remove());
    app.element("#resetAppBtn").click();
    await confirm(app);
    await vi.waitFor(() =>
      expect(app.document.querySelector(".toast-success")).toBeTruthy(),
    );
    expect(localStorage.getItem(ROOT)).toBeNull();
    expect(localStorage.getItem(BACKUP)).toBeNull();
    expect(localStorage.getItem("sto_app_reset")).toBe("true");
    expect(localStorage.getItem("unrelated-reset-probe")).toBe("preserved");
    expect(app.settings()).toMatchObject({
      theme: "default",
      language: "en",
      compactView: false,
      autoSync: false,
    });
    expect(
      [...app.element("#profileSelect").options].filter(
        (option) => !option.disabled && option.value,
      ),
    ).toHaveLength(0);
  });
}

export async function migratedRoot() {
  const root = seededProject();
  root.settings = { theme: "embedded-must-not-win", language: "fr" };
  const raw = JSON.stringify(root);
  await withApplication(
    async (app) => {
      expect(app.root()).not.toHaveProperty("settings");
      expect(app.root().profiles.captain.extension).toEqual({ retained: true });
      expect(app.root().extension).toEqual({ retained: true });
      expect(app.settings()).toMatchObject({
        theme: "default",
        language: "en",
      });
      expect(JSON.parse(localStorage.getItem(BACKUP)).data).toBe(raw);
      expect(
        app.diagnostics().domains.find((row) => row.domain === "project")
          .lastMigration,
      ).toMatchObject({
        status: "complete",
        rootLayout: "settings-free",
        exactPriorRootBackedUp: true,
      });
      expect(app.element("#profileSelect").value).toBe("captain");
      app.element("#fileExplorerBtn").click();
      expect(
        app.element('#fileTree .profile[data-profileid="captain"]').textContent,
      ).toContain("Captain");
    },
    { root },
  );
}
