import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import SyncService from "../../../src/js/components/services/SyncService.js";
import { respond } from "../../../src/js/core/requestResponse.js";
import { createServiceFixture } from "../../fixtures/index.js";

const PROJECT_CONTENT = '{"type":"project","data":{"profiles":{}}}';
const PROJECT_FILE = {
  content: PROJECT_CONTENT,
  fileName: "project.json",
};
const RESTORE_SUCCESS = {
  success: true,
  currentProfile: null,
  imported: { profiles: 0, settings: false },
};
const RELOAD_SUCCESS = {
  success: true,
  profiles: 0,
  currentProfile: null,
  environment: "space",
};

describe("SyncService restore startup retry", () => {
  let fixture;
  let service;
  let ui;

  beforeEach(() => {
    fixture = createServiceFixture({ enableFS: false });
    ui = { showToast: vi.fn() };
    service = new SyncService({
      eventBus: fixture.eventBus,
      ui,
      fs: {},
      i18n: {
        t: (key, params) => (params?.error ? `${key}:${params.error}` : key),
      },
    });
    service.init();
    vi.spyOn(service, "loadSyncFolderCapability").mockResolvedValue({
      success: true,
      state: "available",
      value: { raw: {} },
    });
    vi.spyOn(service, "checkSyncFolderPermission").mockResolvedValue({
      success: true,
      state: "granted",
    });
  });

  afterEach(() => {
    if (!service.destroyed) service.destroy();
    fixture.destroy();
    vi.restoreAllMocks();
  });

  function stageImport(content = PROJECT_FILE) {
    service.stagePendingSyncDecision("import", content);
  }

  it("retains a no-responder failure through modal close and retries it once at startup", async () => {
    const unavailableRequest = vi
      .fn()
      .mockRejectedValue(
        new Error(
          'Request failed: No handler registered for topic "project:restore-from-content"',
        ),
      );
    service.invokeRequest = unavailableRequest;
    stageImport();

    await service.applyPendingSyncDecision();

    expect(unavailableRequest).toHaveBeenCalledOnce();
    expect(service.pendingSyncAction).toBe("import");
    expect(service.deferredImportContent).toEqual(PROJECT_FILE);
    expect(ui.showToast).toHaveBeenCalledOnce();
    expect(ui.showToast).toHaveBeenCalledWith(
      expect.stringContaining(
        'failed_to_import_project:Request failed: No handler registered for topic "project:restore-from-content"',
      ),
      "error",
    );

    await fixture.eventBus.emit(
      "modal:hidden",
      { modalId: "preferencesModal" },
      { synchronous: true },
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(service.pendingSyncAction).toBe("import");
    expect(service.deferredImportContent).toEqual(PROJECT_FILE);

    const startupRequest = vi.fn().mockResolvedValue(RESTORE_SUCCESS);
    service.invokeRequest = startupRequest;
    await fixture.eventBus.emit("sto-app-ready", undefined, {
      synchronous: true,
    });

    await vi.waitFor(() => expect(startupRequest).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(service.pendingSyncAction).toBeNull());
    expect(startupRequest).toHaveBeenCalledWith(
      "project:restore-from-content",
      PROJECT_FILE,
      0,
    );
    expect(service.pendingSyncAction).toBeNull();
    expect(service.deferredImportContent).toBeNull();
    expect(ui.showToast).toHaveBeenCalledTimes(2);
    expect(ui.showToast).toHaveBeenLastCalledWith(
      "project_imported_from_sync_folder",
      "success",
    );
  });

  it("does not replay a rejection from a registered restore responder", async () => {
    const restoreHandler = vi.fn(() => {
      throw new Error("restore failed after dispatch");
    });
    const detachRestore = respond(
      fixture.eventBus,
      "project:restore-from-content",
      restoreHandler,
    );
    stageImport();

    try {
      await service.applyPendingSyncDecision();

      expect(restoreHandler).toHaveBeenCalledOnce();
      expect(service.pendingSyncAction).toBeNull();
      expect(service.deferredImportContent).toBeNull();
      expect(ui.showToast).toHaveBeenCalledWith(
        "failed_to_import_project:restore failed after dispatch",
        "error",
      );

      await service.applyPendingSyncDecision();
      expect(restoreHandler).toHaveBeenCalledOnce();
    } finally {
      detachRestore();
    }
  });

  it("makes only one startup retry when the recoverable failure persists", async () => {
    const request = vi.fn().mockResolvedValue({
      success: false,
      error: "project_restore_reload_failed",
      params: { reason: "owner reload unavailable" },
      durable: true,
      currentProfile: null,
      imported: { profiles: 0, settings: false },
    });
    service.invokeRequest = request;
    stageImport();

    await fixture.eventBus.emit("sto-app-ready", undefined, {
      synchronous: true,
    });
    await vi.waitFor(() => expect(request).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(ui.showToast).toHaveBeenCalledOnce());
    await fixture.eventBus.emit("sto-app-ready", undefined, {
      synchronous: true,
    });

    expect(request).toHaveBeenCalledOnce();
    expect(service.pendingSyncAction).toBe("import");
    expect(service.deferredImportContent).toEqual(PROJECT_FILE);
    expect(ui.showToast).toHaveBeenCalledOnce();
    expect(ui.showToast).toHaveBeenCalledWith(
      "failed_to_import_project:owner reload unavailable",
      "error",
    );
  });

  it("restores one startup retry budget after destroy and reinitialization", async () => {
    await fixture.eventBus.emit("sto-app-ready", undefined, {
      synchronous: true,
    });

    service.destroy();
    service.init();
    const request = vi.fn().mockResolvedValue(RESTORE_SUCCESS);
    service.invokeRequest = request;
    stageImport();

    await fixture.eventBus.emit("sto-app-ready", undefined, {
      synchronous: true,
    });

    await vi.waitFor(() => expect(request).toHaveBeenCalledOnce());
    expect(request).toHaveBeenCalledWith(
      "project:restore-from-content",
      PROJECT_FILE,
      0,
    );
    expect(service.pendingSyncAction).toBeNull();
    expect(service.deferredImportContent).toBeNull();
    expect(ui.showToast).toHaveBeenLastCalledWith(
      "project_imported_from_sync_folder",
      "success",
    );
  });

  it("does not replay fallback content after an unacknowledged storage failure", async () => {
    const changedContent = '{"type":"project","data":{"changed":true}}';
    const readContent = vi
      .fn()
      .mockResolvedValueOnce(PROJECT_CONTENT)
      .mockResolvedValueOnce(changedContent);
    const getFileHandle = vi.fn().mockResolvedValue({
      kind: "file",
      name: "project.json",
      getFile: vi.fn().mockResolvedValue({
        size: new TextEncoder().encode(PROJECT_CONTENT).byteLength,
        text: readContent,
      }),
    });
    service.loadSyncFolderCapability.mockResolvedValue({
      success: true,
      state: "available",
      value: {
        kind: "directory",
        name: "Fleet Builds",
        raw: {},
        getFileHandle,
        getDirectoryHandle: vi.fn(),
      },
    });
    const request = vi.fn().mockResolvedValue({
      success: false,
      error: "storage_write_failed",
      params: { operation: "project" },
      partial: false,
      committed: { profiles: [], settings: false, project: false },
    });
    service.invokeRequest = request;
    stageImport(null);

    await service.applyPendingSyncDecision();
    await service.applyPendingSyncDecision();

    expect(getFileHandle).toHaveBeenCalledOnce();
    expect(readContent).toHaveBeenCalledOnce();
    expect(request.mock.calls).toEqual([
      ["project:restore-from-content", PROJECT_FILE, 0],
    ]);
    expect(service.pendingSyncAction).toBeNull();
    expect(service.deferredImportContent).toBeNull();
  });

  it("retries retained activation without reacquiring a changed folder capability", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({
        success: false,
        error: "project_restore_reload_failed",
        params: { reason: "owner reload unavailable" },
        durable: true,
        currentProfile: null,
        imported: { profiles: 0, settings: false },
      })
      .mockResolvedValueOnce(RELOAD_SUCCESS);
    service.invokeRequest = request;
    stageImport();

    await service.applyPendingSyncDecision();
    service.loadSyncFolderCapability.mockResolvedValue({
      success: true,
      state: "missing",
    });
    service.checkSyncFolderPermission.mockResolvedValue({
      success: false,
      error: "permission_denied",
    });

    await service.applyPendingSyncDecision();

    expect(service.loadSyncFolderCapability).toHaveBeenCalledOnce();
    expect(service.checkSyncFolderPermission).toHaveBeenCalledOnce();
    expect(request.mock.calls).toEqual([
      ["project:restore-from-content", PROJECT_FILE, 0],
      ["data:reload-state", undefined, 0],
    ]);
    expect(service.pendingSyncAction).toBeNull();
    expect(service.deferredImportContent).toBeNull();
    expect(service.pendingRestoreActivationReceipt).toBeNull();
    expect(ui.showToast).toHaveBeenLastCalledWith(
      "project_imported_from_sync_folder",
      "success",
    );
  });
});
