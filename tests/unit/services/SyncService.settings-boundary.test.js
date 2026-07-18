import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import SyncService from "../../../src/js/components/services/SyncService.js";
import { respond } from "../../../src/js/core/requestResponse.js";
import { createServiceFixture } from "../../fixtures/index.js";

function createSelectedHandle(projectContent = null) {
  return {
    name: "Fleet Builds",
    queryPermission: vi.fn().mockResolvedValue("granted"),
    requestPermission: vi.fn().mockResolvedValue("granted"),
    getFileHandle:
      projectContent === null
        ? vi
            .fn()
            .mockRejectedValue(new DOMException("not found", "NotFoundError"))
        : vi.fn().mockResolvedValue({
            getFile: vi.fn().mockResolvedValue({
              text: vi.fn().mockResolvedValue(projectContent),
            }),
          }),
  };
}

describe("SyncService settings boundary", () => {
  let fixture;
  let service;
  let ui;
  let fs;
  let i18n;
  let persistFolderSettings;
  let detachFolderSettings;

  beforeEach(() => {
    fixture = createServiceFixture({ enableFS: false });
    ui = { showToast: vi.fn() };
    fs = {
      saveDirectoryHandle: vi.fn().mockResolvedValue(undefined),
      getDirectoryHandle: vi.fn(),
    };
    i18n = {
      t: vi.fn((key, params) =>
        params?.error ? `${key}:${params.error}` : key,
      ),
    };
    persistFolderSettings = vi.fn().mockResolvedValue(true);
    detachFolderSettings = respond(
      fixture.eventBus,
      "preferences:persist-sync-folder-settings",
      (mutation) => persistFolderSettings(mutation),
    );
    service = new SyncService({
      eventBus: fixture.eventBus,
      ui,
      fs,
      i18n,
    });
    service.init();
    vi.spyOn(service, "isFirefox").mockReturnValue(false);
    vi.spyOn(service, "isSecureContext").mockReturnValue(true);
  });

  afterEach(() => {
    detachFolderSettings?.();
    if (service && !service.destroyed) service.destroy();
    fixture?.destroy();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function selectHandle(handle) {
    vi.stubGlobal("showDirectoryPicker", vi.fn().mockResolvedValue(handle));
  }

  it("persists only the folder settings patch before publishing success", async () => {
    const handle = createSelectedHandle();
    selectHandle(handle);
    const folderSet = vi.fn();
    fixture.eventBus.on("sync:folder-set", folderSet);

    await expect(service.setSyncFolder(true)).resolves.toBe(handle);

    expect(persistFolderSettings).toHaveBeenCalledOnce();
    expect(persistFolderSettings).toHaveBeenCalledWith({
      syncFolderName: "Fleet Builds",
      syncFolderPath: "Selected folder: Fleet Builds",
      syncFolderFallback: false,
      autoSync: true,
    });
    expect(folderSet).toHaveBeenCalledOnce();
    expect(folderSet).toHaveBeenCalledWith({ handle });
    expect(ui.showToast).toHaveBeenCalledWith("sync_folder_set", "success");
  });

  it.each([
    ["returns false", () => false, "storage_write_failed"],
    [
      "throws",
      () => {
        throw new Error("quota exhausted");
      },
      "quota exhausted",
    ],
  ])(
    "does not adopt a pending decision or publish success when persistence %s",
    async (_label, persistSettings, expectedError) => {
      const handle = createSelectedHandle('{"type":"project"}');
      selectHandle(handle);
      vi.stubGlobal("confirmDialog", {
        confirm: vi.fn().mockResolvedValue(true),
      });
      service.pendingSyncAction = "overwrite";
      service.awaitingSyncDecisionApply = true;
      service.deferredImportContent = {
        content: "old project",
        fileName: "project.json",
      };
      persistFolderSettings.mockImplementation(persistSettings);
      const folderSet = vi.fn();
      fixture.eventBus.on("sync:folder-set", folderSet);

      await expect(service.setSyncFolder(true)).resolves.toBeNull();

      expect(service.pendingSyncAction).toBeNull();
      expect(service.awaitingSyncDecisionApply).toBe(false);
      expect(service.deferredImportContent).toBeNull();
      expect(folderSet).not.toHaveBeenCalled();
      expect(ui.showToast).not.toHaveBeenCalledWith(
        "sync_folder_set",
        "success",
      );
      expect(ui.showToast).toHaveBeenCalledWith(
        `failed_to_set_sync_folder:${expectedError}`,
        "error",
      );
    },
  );

  it("does not report success when the preferences owner is unavailable", async () => {
    const handle = createSelectedHandle();
    selectHandle(handle);
    detachFolderSettings();
    detachFolderSettings = null;
    const folderSet = vi.fn();
    fixture.eventBus.on("sync:folder-set", folderSet);

    await expect(service.setSyncFolder(false)).resolves.toBeNull();

    expect(folderSet).not.toHaveBeenCalled();
    expect(ui.showToast).not.toHaveBeenCalledWith("sync_folder_set", "success");
    expect(ui.showToast).toHaveBeenCalledWith(
      expect.stringContaining(
        'failed_to_set_sync_folder:Request failed: No handler registered for topic "preferences:persist-sync-folder-settings"',
      ),
      "error",
    );
  });

  it("preserves the prior decision and skips preferences when the handle write fails", async () => {
    const handle = createSelectedHandle();
    selectHandle(handle);
    const writeError = new Error("IndexedDB transaction aborted");
    fs.saveDirectoryHandle.mockRejectedValueOnce(writeError);
    service.pendingSyncAction = "overwrite";
    service.awaitingSyncDecisionApply = true;
    service.deferredImportContent = {
      content: "old project",
      fileName: "project.json",
    };
    const folderSet = vi.fn();
    fixture.eventBus.on("sync:folder-set", folderSet);

    await expect(service.setSyncFolder(false)).resolves.toBeNull();

    expect(persistFolderSettings).not.toHaveBeenCalled();
    expect(service.pendingSyncAction).toBe("overwrite");
    expect(service.awaitingSyncDecisionApply).toBe(true);
    expect(service.deferredImportContent).toEqual({
      content: "old project",
      fileName: "project.json",
    });
    expect(folderSet).not.toHaveBeenCalled();
    expect(ui.showToast).not.toHaveBeenCalledWith("sync_folder_set", "success");
    expect(ui.showToast).toHaveBeenCalledWith(
      "failed_to_set_sync_folder:IndexedDB transaction aborted",
      "error",
    );
  });

  it("adopts a deferred import only after the settings write succeeds", async () => {
    const content = '{"type":"project","data":{}}';
    const handle = createSelectedHandle(content);
    selectHandle(handle);
    vi.stubGlobal("confirmDialog", {
      confirm: vi.fn().mockResolvedValue(true),
    });
    persistFolderSettings.mockImplementation(() => {
      expect(service.pendingSyncAction).toBeNull();
      expect(service.awaitingSyncDecisionApply).toBe(false);
      expect(service.deferredImportContent).toBeNull();
      return true;
    });

    await expect(service.setSyncFolder(false)).resolves.toBe(handle);

    expect(service.pendingSyncAction).toBe("import");
    expect(service.awaitingSyncDecisionApply).toBe(true);
    expect(service.deferredImportContent).toEqual({
      content,
      fileName: "project.json",
    });
    expect(ui.showToast).not.toHaveBeenCalledWith("sync_folder_set", "success");
  });

  it("uses the broadcast preference cache for change-triggered toast policy", async () => {
    const handle = createSelectedHandle();
    fs.getDirectoryHandle.mockResolvedValue(handle);
    service.invokeRequest = vi.fn().mockResolvedValue(undefined);
    await fixture.eventBus.emit(
      "preferences:loaded",
      {
        settings: {
          autoSync: true,
          autoSyncInterval: "change",
        },
      },
      { synchronous: true },
    );
    ui.showToast.mockClear();

    await expect(service.syncProject("auto")).resolves.toEqual({
      success: true,
    });

    expect(service).not.toHaveProperty("storage");
    expect(ui.showToast).not.toHaveBeenCalledWith(
      "project_synced_successfully",
      "success",
    );
  });

  it("shows automatic success for a cached time-based interval", async () => {
    const handle = createSelectedHandle();
    fs.getDirectoryHandle.mockResolvedValue(handle);
    service.invokeRequest = vi.fn().mockResolvedValue(undefined);
    await fixture.eventBus.emit(
      "preferences:loaded",
      {
        settings: {
          autoSync: true,
          autoSyncInterval: "30",
        },
      },
      { synchronous: true },
    );
    ui.showToast.mockClear();

    await expect(service.syncProject("auto")).resolves.toEqual({
      success: true,
    });

    expect(ui.showToast).toHaveBeenCalledWith(
      "project_synced_successfully",
      "success",
    );
  });

  it("does not resume a folder selection across destroy and reinitialization", async () => {
    const handle = createSelectedHandle();
    let releasePicker;
    vi.stubGlobal(
      "showDirectoryPicker",
      vi.fn(
        () =>
          new Promise((resolve) => {
            releasePicker = () => resolve(handle);
          }),
      ),
    );
    const folderSet = vi.fn();
    fixture.eventBus.on("sync:folder-set", folderSet);

    const selection = service.setSyncFolder(false);
    service.destroy();
    service.init();
    releasePicker();

    await expect(selection).resolves.toBeNull();
    expect(fs.saveDirectoryHandle).not.toHaveBeenCalled();
    expect(persistFolderSettings).not.toHaveBeenCalled();
    expect(folderSet).not.toHaveBeenCalled();
  });

  it("does not persist a picker result superseded before its write", async () => {
    const firstHandle = createSelectedHandle();
    firstHandle.name = "First";
    const secondHandle = createSelectedHandle();
    secondHandle.name = "Second";
    let releaseFirst;
    let releaseSecond;
    vi.stubGlobal(
      "showDirectoryPicker",
      vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              releaseFirst = () => resolve(firstHandle);
            }),
        )
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              releaseSecond = () => resolve(secondHandle);
            }),
        ),
    );

    const first = service.setSyncFolder(false);
    const second = service.setSyncFolder(false);
    releaseFirst();
    releaseSecond();

    await expect(first).resolves.toBeNull();
    await expect(second).resolves.toBe(secondHandle);
    expect(fs.saveDirectoryHandle).toHaveBeenCalledOnce();
    expect(fs.saveDirectoryHandle).toHaveBeenCalledWith(
      "sync-folder",
      secondHandle,
    );
    expect(persistFolderSettings).toHaveBeenCalledOnce();
    expect(persistFolderSettings).toHaveBeenCalledWith(
      expect.objectContaining({ syncFolderName: "Second" }),
    );
  });

  it("orders overlapping handle writes so the latest selection is durable last", async () => {
    const firstHandle = createSelectedHandle();
    firstHandle.name = "First";
    const secondHandle = createSelectedHandle();
    secondHandle.name = "Second";
    vi.stubGlobal(
      "showDirectoryPicker",
      vi
        .fn()
        .mockResolvedValueOnce(firstHandle)
        .mockResolvedValueOnce(secondHandle),
    );
    /** @type {() => void} */
    let releaseFirstWrite = () => {};
    fs.saveDirectoryHandle
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            releaseFirstWrite = resolve;
          }),
      )
      .mockResolvedValueOnce(undefined);

    const first = service.setSyncFolder(false);
    await vi.waitFor(() => {
      expect(fs.saveDirectoryHandle).toHaveBeenCalledOnce();
    });
    const second = service.setSyncFolder(false);
    await Promise.resolve();
    expect(fs.saveDirectoryHandle).toHaveBeenCalledOnce();

    releaseFirstWrite();
    await expect(first).resolves.toBeNull();
    await expect(second).resolves.toBe(secondHandle);

    expect(fs.saveDirectoryHandle).toHaveBeenCalledTimes(2);
    expect(fs.saveDirectoryHandle.mock.calls).toEqual([
      ["sync-folder", firstHandle],
      ["sync-folder", secondHandle],
    ]);
    expect(persistFolderSettings).toHaveBeenCalledOnce();
    expect(persistFolderSettings).toHaveBeenCalledWith(
      expect.objectContaining({ syncFolderName: "Second" }),
    );
  });

  it("cannot arm a stale decision after a newer selection completes", async () => {
    const firstHandle = createSelectedHandle('{"type":"project"}');
    firstHandle.name = "First";
    const secondHandle = createSelectedHandle();
    secondHandle.name = "Second";
    vi.stubGlobal(
      "showDirectoryPicker",
      vi
        .fn()
        .mockResolvedValueOnce(firstHandle)
        .mockResolvedValueOnce(secondHandle),
    );
    /** @type {(value: boolean) => void} */
    let resolveFirstDecision = () => {};
    const firstDecision = new Promise((resolve) => {
      resolveFirstDecision = resolve;
    });
    const confirm = vi.fn().mockReturnValueOnce(firstDecision);
    vi.stubGlobal("confirmDialog", { confirm });
    const folderSet = vi.fn();
    fixture.eventBus.on("sync:folder-set", folderSet);

    const first = service.setSyncFolder(false);
    await vi.waitFor(() => expect(confirm).toHaveBeenCalledOnce());
    const second = service.setSyncFolder(false);
    await expect(second).resolves.toBe(secondHandle);

    resolveFirstDecision(true);
    await expect(first).resolves.toBeNull();

    expect(persistFolderSettings).toHaveBeenCalledOnce();
    expect(persistFolderSettings).toHaveBeenCalledWith(
      expect.objectContaining({ syncFolderName: "Second" }),
    );
    expect(service.pendingSyncAction).toBeNull();
    expect(service.awaitingSyncDecisionApply).toBe(false);
    expect(service.deferredImportContent).toBeNull();
    expect(folderSet).toHaveBeenCalledOnce();
    expect(folderSet).toHaveBeenCalledWith({ handle: secondHandle });
    expect(ui.showToast).toHaveBeenCalledTimes(1);
    expect(ui.showToast).toHaveBeenCalledWith("sync_folder_set", "success");
  });

  it("allows only one saved publication to claim a pending decision", async () => {
    const handle = createSelectedHandle();
    /** @type {(value: ReturnType<typeof createSelectedHandle>) => void} */
    let releaseHandle = () => {};
    fs.getDirectoryHandle.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseHandle = resolve;
        }),
    );
    service.stagePendingSyncDecision("overwrite", null);
    service.invokeRequest = vi.fn().mockResolvedValue(undefined);

    const firstSaved = service.applyPendingSyncDecision();
    await vi.waitFor(() => {
      expect(fs.getDirectoryHandle).toHaveBeenCalledOnce();
    });
    const secondSaved = service.applyPendingSyncDecision();
    await secondSaved;
    expect(service.invokeRequest).not.toHaveBeenCalled();

    releaseHandle(handle);
    await firstSaved;

    expect(service.invokeRequest).toHaveBeenCalledOnce();
    expect(service.invokeRequest).toHaveBeenCalledWith(
      "export:sync-to-folder",
      { dirHandle: handle },
    );
    expect(service.pendingSyncAction).toBeNull();
    expect(service.awaitingSyncDecisionApply).toBe(false);
  });

  it("does not let an old saved handler consume a newer decision", async () => {
    const oldHandle = createSelectedHandle();
    const newHandle = createSelectedHandle();
    /** @type {(value: ReturnType<typeof createSelectedHandle>) => void} */
    let releaseOldHandle = () => {};
    fs.getDirectoryHandle
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            releaseOldHandle = resolve;
          }),
      )
      .mockResolvedValueOnce(newHandle);
    service.stagePendingSyncDecision("overwrite", null);
    service.invokeRequest = vi.fn().mockResolvedValue({ success: true });

    const oldSaved = service.applyPendingSyncDecision();
    await vi.waitFor(() => {
      expect(fs.getDirectoryHandle).toHaveBeenCalledOnce();
    });
    service.stagePendingSyncDecision("import", {
      content: "new project",
      fileName: "project.json",
    });

    releaseOldHandle(oldHandle);
    await oldSaved;
    expect(service.invokeRequest).not.toHaveBeenCalled();
    expect(service.pendingSyncAction).toBe("import");
    expect(service.awaitingSyncDecisionApply).toBe(true);
    expect(service.deferredImportContent).toEqual({
      content: "new project",
      fileName: "project.json",
    });

    await service.applyPendingSyncDecision();
    expect(service.invokeRequest).toHaveBeenCalledOnce();
    expect(service.invokeRequest).toHaveBeenCalledWith(
      "project:restore-from-content",
      { content: "new project", fileName: "project.json" },
    );
    expect(service.pendingSyncAction).toBeNull();
  });

  it("does not resume a claimed decision after destruction", async () => {
    const handle = createSelectedHandle();
    /** @type {(value: ReturnType<typeof createSelectedHandle>) => void} */
    let releaseHandle = () => {};
    fs.getDirectoryHandle.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseHandle = resolve;
        }),
    );
    service.stagePendingSyncDecision("overwrite", null);
    service.invokeRequest = vi.fn().mockResolvedValue(undefined);

    const saved = service.applyPendingSyncDecision();
    await vi.waitFor(() => {
      expect(fs.getDirectoryHandle).toHaveBeenCalledOnce();
    });
    service.destroy();
    releaseHandle(handle);
    await saved;

    expect(service.invokeRequest).not.toHaveBeenCalled();
    expect(service.pendingSyncAction).toBeNull();
    expect(service.awaitingSyncDecisionApply).toBe(false);
    expect(service.deferredImportContent).toBeNull();
  });

  it("clears deferred import content when Preferences closes without a save", async () => {
    service.stagePendingSyncDecision("import", {
      content: "cancelled project",
      fileName: "project.json",
    });
    service.invokeRequest = vi.fn().mockResolvedValue({ success: true });

    await fixture.eventBus.emit(
      "modal:hidden",
      { modalId: "preferencesModal" },
      { synchronous: true },
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(service.pendingSyncAction).toBeNull();
    expect(service.awaitingSyncDecisionApply).toBe(false);
    expect(service.deferredImportContent).toBeNull();
    await fixture.eventBus.emit("sto-app-ready", undefined, {
      synchronous: true,
    });
    expect(service.invokeRequest).not.toHaveBeenCalled();
  });
});
