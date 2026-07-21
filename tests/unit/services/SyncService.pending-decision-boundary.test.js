import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import SyncService from "../../../src/js/components/services/SyncService.js";
import { respond } from "../../../src/js/core/requestResponse.js";
import { createServiceFixture } from "../../fixtures/index.js";
import { createProjectRestoreSuccess } from "../../fixtures/services/projectRestore.js";
import { addSyncTransitionMethods } from "../../fixtures/services/syncFileSystem.js";

function createSelectedHandle(projectContent = null, name = "Fleet Builds") {
  const projectFile =
    projectContent === null
      ? null
      : {
          size: new TextEncoder().encode(projectContent).byteLength,
          text: vi.fn().mockResolvedValue(projectContent),
        };

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
            .mockRejectedValue(new DOMException("not found", "NotFoundError"))
        : vi.fn().mockResolvedValue({
            kind: "file",
            name: "project.json",
            getFile: vi.fn().mockResolvedValue(projectFile),
          }),
  };
}

describe("SyncService pending decision boundary", () => {
  let fixture;
  let service;
  let ui;
  let fs;
  let detachFolderSettings;
  let durableHandle;

  beforeEach(() => {
    fixture = createServiceFixture({ enableFS: false });
    ui = { showToast: vi.fn() };
    durableHandle = null;
    fs = {
      saveDirectoryHandle: vi.fn(async (_key, handle) => {
        durableHandle = handle;
      }),
      getDirectoryHandle: vi.fn(async () => durableHandle),
      deleteDirectoryHandle: vi.fn(async () => {
        durableHandle = null;
      }),
    };
    addSyncTransitionMethods(fs);
    detachFolderSettings = respond(
      fixture.eventBus,
      "preferences:persist-sync-folder-settings",
      () => true,
    );
    service = new SyncService({
      eventBus: fixture.eventBus,
      ui,
      fs,
      i18n: {
        t: vi.fn((key, params) =>
          params?.error ? `${key}:${params.error}` : key,
        ),
      },
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
      0,
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
    service.invokeRequest = vi
      .fn()
      .mockResolvedValue(createProjectRestoreSuccess());

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
      0,
    );
    expect(service.pendingSyncAction).toBeNull();
  });

  it("revalidates a fallback project file before restoring it", async () => {
    const content = '{"type":"project","data":{}}';
    durableHandle = createSelectedHandle(content);
    service.stagePendingSyncDecision("import", null);
    service.invokeRequest = vi
      .fn()
      .mockResolvedValue(createProjectRestoreSuccess());

    await service.applyPendingSyncDecision();

    expect(service.invokeRequest).toHaveBeenCalledOnce();
    expect(service.invokeRequest).toHaveBeenCalledWith(
      "project:restore-from-content",
      { content, fileName: "project.json" },
      0,
    );
    expect(service.pendingSyncAction).toBeNull();
  });

  it("does not restore invalid fallback content", async () => {
    durableHandle = createSelectedHandle('{"type":"project"');
    service.stagePendingSyncDecision("import", null);
    service.invokeRequest = vi.fn();

    await service.applyPendingSyncDecision();

    expect(service.invokeRequest).not.toHaveBeenCalled();
    expect(ui.showToast).toHaveBeenCalledWith(
      "failed_to_import_project:import_failed_invalid_json",
      "error",
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
