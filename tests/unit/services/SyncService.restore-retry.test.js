import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ProjectManagementService from "../../../src/js/components/services/ProjectManagementService.js";
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
const DURABLE_RELOAD_FAILURE = {
  success: false,
  error: "project_restore_reload_failed",
  params: { reason: "state reload unavailable" },
  durable: true,
  currentProfile: null,
  imported: { profiles: 0, settings: false },
};

describe("SyncService restore retry ownership", () => {
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

  it.each([
    [
      "internal import transport failure",
      {
        success: false,
        error: "project_restore_import_failed",
        durable: false,
        params: { reason: "import transport unavailable" },
      },
      "import transport unavailable",
    ],
  ])(
    "retains the exact artifact after a retryable %s",
    async (_label, failure, expectedDetail) => {
      const request = vi
        .fn()
        .mockResolvedValueOnce(failure)
        .mockResolvedValueOnce(RESTORE_SUCCESS);
      service.invokeRequest = request;
      stageImport();

      await service.applyPendingSyncDecision();

      expect(request).toHaveBeenNthCalledWith(
        1,
        "project:restore-from-content",
        PROJECT_FILE,
        0,
      );
      expect(service.pendingSyncAction).toBe("import");
      expect(service.awaitingSyncDecisionApply).toBe(true);
      expect(service.deferredImportContent).toEqual(PROJECT_FILE);
      expect(ui.showToast).toHaveBeenCalledTimes(1);
      expect(ui.showToast).toHaveBeenLastCalledWith(
        `failed_to_import_project:${expectedDetail}`,
        "error",
      );

      await service.applyPendingSyncDecision();

      expect(request).toHaveBeenNthCalledWith(
        2,
        "project:restore-from-content",
        PROJECT_FILE,
        0,
      );
      expect(service.pendingSyncAction).toBeNull();
      expect(service.awaitingSyncDecisionApply).toBe(false);
      expect(service.deferredImportContent).toBeNull();
      expect(ui.showToast.mock.calls).toEqual([
        [`failed_to_import_project:${expectedDetail}`, "error"],
        ["project_imported_from_sync_folder", "success"],
      ]);
    },
  );

  it("resumes durable activation without replaying the imported artifact", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(DURABLE_RELOAD_FAILURE)
      .mockResolvedValueOnce(RELOAD_SUCCESS);
    service.invokeRequest = request;
    stageImport();

    await service.applyPendingSyncDecision();

    expect(request).toHaveBeenNthCalledWith(
      1,
      "project:restore-from-content",
      PROJECT_FILE,
      0,
    );
    expect(service.pendingRestoreActivationReceipt).toEqual({
      currentProfile: null,
      imported: { profiles: 0, settings: false },
    });
    expect(service.deferredImportContent).toEqual(PROJECT_FILE);
    expect(service.pendingSyncAction).toBe("import");

    // The activation receipt owns this retry independently of the source
    // artifact. Losing the retained bytes must never cause another import.
    service.deferredImportContent = null;
    await service.applyPendingSyncDecision();

    expect(request.mock.calls).toEqual([
      ["project:restore-from-content", PROJECT_FILE, 0],
      ["data:reload-state", undefined, 0],
    ]);
    expect(service.pendingRestoreActivationReceipt).toBeNull();
    expect(service.pendingSyncAction).toBeNull();
    expect(service.awaitingSyncDecisionApply).toBe(false);
    expect(ui.showToast.mock.calls).toEqual([
      ["failed_to_import_project:state reload unavailable", "error"],
      ["project_imported_from_sync_folder", "success"],
    ]);
  });

  it("resumes an exact durable activation receipt with an empty reason", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({
        ...DURABLE_RELOAD_FAILURE,
        params: { reason: "" },
      })
      .mockResolvedValueOnce(RELOAD_SUCCESS);
    service.invokeRequest = request;
    stageImport();

    await service.applyPendingSyncDecision();

    expect(service.pendingRestoreActivationReceipt).toEqual({
      currentProfile: null,
      imported: { profiles: 0, settings: false },
    });
    expect(service.pendingSyncAction).toBe("import");

    await service.applyPendingSyncDecision();

    expect(request.mock.calls).toEqual([
      ["project:restore-from-content", PROJECT_FILE, 0],
      ["data:reload-state", undefined, 0],
    ]);
    expect(service.pendingRestoreActivationReceipt).toBeNull();
    expect(service.pendingSyncAction).toBeNull();
  });

  it("retains activation-only work across a failed reload retry", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(DURABLE_RELOAD_FAILURE)
      .mockResolvedValueOnce({
        success: false,
        error: "operation_cancelled",
      })
      .mockResolvedValueOnce(RELOAD_SUCCESS);
    service.invokeRequest = request;
    stageImport();

    await service.applyPendingSyncDecision();
    await service.applyPendingSyncDecision();

    expect(service.pendingRestoreActivationReceipt).toEqual({
      currentProfile: null,
      imported: { profiles: 0, settings: false },
    });
    expect(service.pendingSyncAction).toBe("import");
    expect(request.mock.calls).toEqual([
      ["project:restore-from-content", PROJECT_FILE, 0],
      ["data:reload-state", undefined, 0],
    ]);
    expect(ui.showToast).toHaveBeenLastCalledWith(
      "failed_to_import_project:failed_to_load_profile_data",
      "error",
    );

    await service.applyPendingSyncDecision();

    expect(request.mock.calls).toEqual([
      ["project:restore-from-content", PROJECT_FILE, 0],
      ["data:reload-state", undefined, 0],
      ["data:reload-state", undefined, 0],
    ]);
    expect(service.pendingRestoreActivationReceipt).toBeNull();
    expect(service.pendingSyncAction).toBeNull();
  });

  it.each([
    [
      "registered responder rejection",
      () => {
        throw new Error("import handler failed after dispatch");
      },
    ],
    ["malformed success reply", () => ({ success: true })],
  ])(
    "keeps a %s terminal across the real project owner",
    async (_label, importImplementation) => {
      const importProject = vi.fn(importImplementation);
      const reloadState = vi.fn().mockResolvedValue(RELOAD_SUCCESS);
      const detachImport = respond(
        fixture.eventBus,
        "import:project-file",
        importProject,
      );
      const detachReload = respond(
        fixture.eventBus,
        "data:reload-state",
        reloadState,
      );
      const projectManager = new ProjectManagementService({
        eventBus: fixture.eventBus,
        i18n: service.i18n,
      });
      projectManager.init();
      const restoreRequest = vi.spyOn(service, "invokeRequest");
      stageImport();

      try {
        await service.applyPendingSyncDecision();
        await service.applyPendingSyncDecision();

        expect(restoreRequest).toHaveBeenCalledOnce();
        expect(restoreRequest).toHaveBeenCalledWith(
          "project:restore-from-content",
          PROJECT_FILE,
          0,
        );
        expect(importProject).toHaveBeenCalledOnce();
        expect(reloadState).not.toHaveBeenCalled();
        expect(service.pendingSyncAction).toBeNull();
        expect(service.deferredImportContent).toBeNull();
        expect(service.pendingRestoreActivationReceipt).toBeNull();
      } finally {
        projectManager.destroy();
        detachReload();
        detachImport();
      }
    },
  );

  it.each([
    ["invalid JSON", { success: false, error: "import_failed_invalid_json" }],
    [
      "invalid project file",
      {
        success: false,
        error: "invalid_project_file",
        params: { path: "$" },
      },
    ],
    [
      "invalid project options",
      {
        success: false,
        error: "invalid_project_options",
        params: { path: "$.options" },
      },
    ],
    ["unavailable storage", { success: false, error: "storage_not_available" }],
  ])(
    "clears retry state after exact terminal failure %s",
    async (_label, failure) => {
      const request = vi.fn().mockResolvedValue(failure);
      service.invokeRequest = request;
      stageImport();

      await service.applyPendingSyncDecision();

      expect(request).toHaveBeenCalledOnce();
      expect(service.pendingSyncAction).toBeNull();
      expect(service.awaitingSyncDecisionApply).toBe(false);
      expect(service.deferredImportContent).toBeNull();
      expect(ui.showToast.mock.calls).toEqual([
        [`failed_to_import_project:${failure.error}`, "error"],
      ]);

      await service.applyPendingSyncDecision();
      expect(request).toHaveBeenCalledOnce();
    },
  );

  it("does not let undeclared failure reason data bypass localization", async () => {
    const request = vi.fn().mockResolvedValue({
      success: false,
      error: "invalid_project_file",
      params: { path: "$", reason: "untranslated override" },
    });
    service.invokeRequest = request;
    stageImport();

    await service.applyPendingSyncDecision();

    expect(service.pendingSyncAction).toBeNull();
    expect(ui.showToast).toHaveBeenCalledWith(
      "failed_to_import_project:invalid_project_file",
      "error",
    );
  });

  it.each([
    { success: false, error: "project_restore_reload_failed" },
    { success: false, error: "storage_write_failed" },
  ])("clears retry state for an incomplete $error result", async (failure) => {
    const request = vi.fn().mockResolvedValue(failure);
    service.invokeRequest = request;
    stageImport();

    await service.applyPendingSyncDecision();

    expect(request).toHaveBeenCalledOnce();
    expect(service.pendingSyncAction).toBeNull();
    expect(service.awaitingSyncDecisionApply).toBe(false);
    expect(service.deferredImportContent).toBeNull();
    expect(ui.showToast).toHaveBeenCalledOnce();
  });

  it.each([
    ["missing success fields", { success: true }],
    [
      "wrong success discriminant",
      {
        success: "yes",
        currentProfile: null,
        imported: { profiles: 0, settings: false },
      },
    ],
    [
      "incomplete imported summary",
      { success: true, currentProfile: null, imported: { profiles: 0 } },
    ],
    [
      "prototype-derived success",
      Object.create({
        success: true,
        currentProfile: null,
        imported: { profiles: 0, settings: false },
      }),
    ],
    [
      "prototype-derived failure",
      Object.create({
        success: false,
        error: "project_restore_reload_failed",
        params: { reason: "inherited" },
        durable: true,
        currentProfile: null,
        imported: { profiles: 0, settings: false },
      }),
    ],
  ])(
    "does not replay after a dispatched malformed %s result",
    async (_label, result) => {
      const request = vi.fn().mockResolvedValue(result);
      service.invokeRequest = request;
      stageImport();

      await service.applyPendingSyncDecision();

      expect(service.pendingSyncAction).toBeNull();
      expect(service.deferredImportContent).toBeNull();
      expect(ui.showToast).toHaveBeenLastCalledWith(
        "failed_to_import_project:import_failed:failed_to_load_profile_data",
        "error",
      );

      await service.applyPendingSyncDecision();
      expect(request).toHaveBeenCalledOnce();
    },
  );

  it("does not replay a completed restore when its success notification throws", async () => {
    const request = vi.fn().mockResolvedValue(RESTORE_SUCCESS);
    service.invokeRequest = request;
    ui.showToast.mockImplementationOnce(() => {
      throw new Error("toast unavailable");
    });
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    stageImport();

    await service.applyPendingSyncDecision();

    expect(request).toHaveBeenCalledOnce();
    expect(service.pendingSyncAction).toBeNull();
    expect(service.deferredImportContent).toBeNull();
    expect(consoleError).toHaveBeenCalledWith(
      "[SyncService] restore notification failed",
      expect.any(Error),
    );
    await service.applyPendingSyncDecision();
    expect(request).toHaveBeenCalledOnce();
  });

  it.each([
    [
      "storage failure without acknowledged commits",
      {
        success: false,
        error: "storage_write_failed",
        params: { operation: "project" },
        partial: false,
        committed: {
          profiles: [],
          settings: false,
          project: false,
        },
      },
    ],
    [
      "sparse committed profile list",
      {
        success: false,
        error: "storage_write_failed",
        params: { operation: "project" },
        partial: true,
        committed: {
          profiles: new Array(1),
          settings: false,
          project: false,
        },
      },
    ],
    [
      "acknowledged partial profile commit",
      {
        success: false,
        error: "storage_write_failed",
        params: { operation: "project" },
        partial: true,
        committed: {
          profiles: ["alpha"],
          settings: false,
          project: false,
        },
      },
    ],
    [
      "committed profile hidden behind partial false",
      {
        success: false,
        error: "storage_write_failed",
        params: { operation: "project" },
        partial: false,
        committed: {
          profiles: ["alpha"],
          settings: false,
          project: false,
        },
      },
    ],
    [
      "partial true without an acknowledged write",
      {
        success: false,
        error: "storage_write_failed",
        params: { operation: "project" },
        partial: true,
        committed: {
          profiles: [],
          settings: false,
          project: false,
        },
      },
    ],
  ])("does not replay a terminal %s receipt", async (_label, result) => {
    const request = vi.fn().mockResolvedValue(result);
    service.invokeRequest = request;
    stageImport();

    await service.applyPendingSyncDecision();

    expect(service.pendingSyncAction).toBeNull();
    expect(service.deferredImportContent).toBeNull();
    expect(request).toHaveBeenCalledOnce();

    await service.applyPendingSyncDecision();
    expect(request).toHaveBeenCalledOnce();
  });
});
