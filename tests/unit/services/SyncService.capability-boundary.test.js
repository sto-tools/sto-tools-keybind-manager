import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import SyncService from "../../../src/js/components/services/SyncService.js";
import { MAX_PROJECT_JSON_BYTES } from "../../../src/js/components/services/jsonDataBoundary.js";
import { respond } from "../../../src/js/core/requestResponse.js";
import { createServiceFixture } from "../../fixtures/index.js";
import { addSyncTransitionMethods } from "../../fixtures/services/syncFileSystem.js";

function createHandle(name = "syncDir", projectContent = null) {
  return {
    kind: "directory",
    name,
    queryPermission: vi.fn().mockResolvedValue("granted"),
    requestPermission: vi.fn().mockResolvedValue("granted"),
    getDirectoryHandle: vi.fn(),
    getFileHandle:
      projectContent === null
        ? vi
            .fn()
            .mockRejectedValue(new DOMException("missing", "NotFoundError"))
        : vi.fn().mockResolvedValue({
            kind: "file",
            name: "project.json",
            getFile: vi.fn().mockResolvedValue({
              size: new TextEncoder().encode(projectContent).byteLength,
              text: vi.fn().mockResolvedValue(projectContent),
            }),
          }),
  };
}

describe("SyncService filesystem capability boundary", () => {
  let fixture;
  let service;
  let fs;
  let ui;
  let persistFolderSettings;
  let detachSettings;

  beforeEach(() => {
    fixture = createServiceFixture({ enableFS: false });
    fs = {
      getDirectoryHandle: vi.fn().mockResolvedValue(null),
      saveDirectoryHandle: vi.fn().mockResolvedValue(undefined),
      deleteDirectoryHandle: vi.fn().mockResolvedValue(undefined),
    };
    addSyncTransitionMethods(fs);
    ui = { showToast: vi.fn() };
    persistFolderSettings = vi.fn().mockResolvedValue(true);
    detachSettings = respond(
      fixture.eventBus,
      "preferences:persist-sync-folder-settings",
      (settings) => persistFolderSettings(settings),
    );
    service = new SyncService({
      eventBus: fixture.eventBus,
      fs,
      ui,
      i18n: { t: (key) => key },
    });
    service.init();
    vi.spyOn(service, "isFirefox").mockReturnValue(false);
    vi.spyOn(service, "isSecureContext").mockReturnValue(true);
  });

  afterEach(() => {
    detachSettings?.();
    if (service && !service.destroyed) service.destroy();
    fixture?.destroy();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("rejects a malformed picker capability before persistence or settings effects", async () => {
    vi.stubGlobal(
      "showDirectoryPicker",
      vi.fn().mockResolvedValue({ name: "partial" }),
    );

    await expect(service.setSyncFolder(false)).resolves.toBeNull();

    expect(fs.getDirectoryHandle).not.toHaveBeenCalled();
    expect(fs.saveDirectoryHandle).not.toHaveBeenCalled();
    expect(persistFolderSettings).not.toHaveBeenCalled();
    expect(ui.showToast).toHaveBeenCalledWith(
      "failed_to_set_sync_folder",
      "error",
    );
  });

  it("distinguishes a corrupt stored capability from a missing selection", async () => {
    fs.getDirectoryHandle.mockResolvedValue({ name: "partial" });
    service.invokeRequest = vi.fn();

    await expect(service.syncProject("manual")).resolves.toEqual({
      success: false,
      error: "sync_folder_capability_invalid",
    });
    expect(service.invokeRequest).not.toHaveBeenCalled();
    expect(ui.showToast).toHaveBeenCalledWith(
      "sync_folder_capability_invalid",
      "error",
    );
  });

  it("distinguishes an IndexedDB load failure from a missing selection", async () => {
    fs.getDirectoryHandle.mockRejectedValue(new Error("IndexedDB unavailable"));
    service.invokeRequest = vi.fn();

    await expect(service.syncProject("manual")).resolves.toEqual({
      success: false,
      error: "sync_folder_load_failed",
    });
    expect(service.invokeRequest).not.toHaveBeenCalled();
    expect(ui.showToast).toHaveBeenCalledWith(
      "sync_folder_load_failed",
      "error",
    );
  });

  it("distinguishes a permission API failure from explicit denial", async () => {
    const handle = createHandle();
    handle.queryPermission.mockRejectedValue(
      new DOMException("permission API unavailable", "InvalidStateError"),
    );
    fs.getDirectoryHandle.mockResolvedValue(handle);
    service.invokeRequest = vi.fn();

    await expect(service.syncProject("manual")).resolves.toEqual({
      success: false,
      error: "sync_folder_permission_check_failed",
    });
    expect(service.invokeRequest).not.toHaveBeenCalled();
    expect(ui.showToast).toHaveBeenCalledWith(
      "sync_folder_permission_check_failed",
      "error",
    );
  });

  it("never offers an invalid project for import and requires explicit overwrite", async () => {
    const handle = createHandle("syncDir", '{"type":"project"');
    vi.stubGlobal("showDirectoryPicker", vi.fn().mockResolvedValue(handle));
    const confirm = vi.fn().mockResolvedValue(true);
    vi.stubGlobal("confirmDialog", { confirm });

    await expect(service.setSyncFolder(false)).resolves.toBe(handle);

    expect(confirm).toHaveBeenCalledOnce();
    expect(confirm).toHaveBeenCalledWith(
      "sync_invalid_project_overwrite_prompt",
      "sync_overwrite_existing_title",
      "warning",
      "syncOverwriteProject",
    );
    expect(service.pendingSyncAction).toBe("overwrite");
    expect(service.deferredImportContent).toBeNull();
  });

  it("requires explicit overwrite for an oversized project without mutating durable state when declined", async () => {
    const handle = createHandle();
    const readText = vi.fn();
    handle.getFileHandle.mockResolvedValue({
      kind: "file",
      name: "project.json",
      getFile: vi.fn().mockResolvedValue({
        size: MAX_PROJECT_JSON_BYTES + 1,
        text: readText,
      }),
    });
    vi.stubGlobal("showDirectoryPicker", vi.fn().mockResolvedValue(handle));
    const confirm = vi.fn().mockResolvedValue(false);
    vi.stubGlobal("confirmDialog", { confirm });

    await expect(service.setSyncFolder(false)).resolves.toBeNull();

    expect(readText).not.toHaveBeenCalled();
    expect(confirm).toHaveBeenCalledOnce();
    expect(confirm).toHaveBeenCalledWith(
      "sync_invalid_project_overwrite_prompt",
      "sync_overwrite_existing_title",
      "warning",
      "syncOverwriteProject",
    );
    expect(fs.getDirectoryHandle).not.toHaveBeenCalled();
    expect(fs.saveDirectoryHandle).not.toHaveBeenCalled();
    expect(fs.deleteDirectoryHandle).not.toHaveBeenCalled();
    expect(persistFolderSettings).not.toHaveBeenCalled();
    expect(service.pendingSyncAction).toBeNull();
    expect(service.deferredImportContent).toBeNull();
  });
});
