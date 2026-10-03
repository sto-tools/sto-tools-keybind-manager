import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SyncService from "../../../src/js/components/services/SyncService.js";
import { createServiceFixture } from "../../fixtures/index.js";

const success = {
  success: true,
  currentProfile: null,
  imported: { profiles: 1, settings: true },
};
const retryable = {
  success: false,
  error: "project_restore_reload_failed",
  params: { reason: "activation unavailable" },
  durable: true,
  currentProfile: null,
  imported: { profiles: 1, settings: true },
  activation: { data: "pending", preferences: "pending" },
};
const deferred = () => {
  let release;
  const promise = new Promise((resolve) => {
    release = resolve;
  });
  return { promise, release: (value) => release(value) };
};

describe("SyncService existing manual action resumes admitted import before export", () => {
  let fixture, service, load, permission;
  beforeEach(() => {
    fixture = createServiceFixture({ enableFS: false });
    service = new SyncService({
      eventBus: fixture.eventBus,
      fs: {},
      ui: { showToast: vi.fn() },
      i18n: {
        t: (key, params) => (params?.error ? `${key}:${params.error}` : key),
      },
    });
    service.init();
    vi.spyOn(service, "isFirefox").mockReturnValue(false);
    vi.spyOn(service, "isSecureContext").mockReturnValue(true);
    load = vi.spyOn(service, "loadSyncFolderCapability").mockResolvedValue({
      success: true,
      state: "available",
      value: { raw: {} },
    });
    permission = vi
      .spyOn(service, "checkSyncFolderPermission")
      .mockResolvedValue({ success: true, state: "granted" });
    service.invokeRequest = vi.fn().mockResolvedValue(success);
  });
  afterEach(() => {
    service.destroy();
    fixture.destroy();
    vi.restoreAllMocks();
  });
  function retainActivation() {
    service.stagePendingSyncDecision("import", null);
    service._syncDecisionClaimed = true;
    service.pendingRestoreActivationReceipt = {
      currentProfile: null,
      imported: { profiles: 1, settings: true },
      activation: { data: "pending", preferences: "pending" },
    };
  }
  function expectNoExport() {
    expect(
      service.invokeRequest.mock.calls.some(
        ([topic]) => topic === "export:sync-to-folder",
      ),
    ).toBe(false);
  }

  it("manual resumes only retained activation and returns import success without read or export", async () => {
    retainActivation();
    await expect(service.syncProject("manual")).resolves.toEqual({
      success: true,
    });
    expect(service.invokeRequest.mock.calls).toEqual([
      ["project:retry-restore-activation", undefined, 0],
    ]);
    expect(load).not.toHaveBeenCalled();
    expect(permission).not.toHaveBeenCalled();
    expect(service.pendingSyncAction).toBeNull();
    expect(service.ui.showToast).toHaveBeenCalledWith(
      "project_imported_from_sync_folder",
      "success",
    );
  });
  it("manual retries exact admitted predispatch content without rereading the artifact", async () => {
    const content = {
      content: '{"type":"project","data":{"profiles":{}}}',
      fileName: "captured.json",
    };
    service.stagePendingSyncDecision("import", content);
    service._syncDecisionClaimed = true;
    await expect(service.syncProject("manual")).resolves.toEqual({
      success: true,
    });
    expect(service.invokeRequest.mock.calls).toEqual([
      ["project:restore-from-content", content, 0],
    ]);
    expect(load).not.toHaveBeenCalled();
    expectNoExport();
  });
  it("a subsequent manual action exports normally after retained activation completed", async () => {
    retainActivation();
    await expect(service.syncProject("manual")).resolves.toEqual({
      success: true,
    });
    service.invokeRequest.mockResolvedValueOnce(undefined);
    await expect(service.syncProject("manual")).resolves.toEqual({
      success: true,
    });
    expect(service.invokeRequest.mock.calls.map(([topic]) => topic)).toEqual([
      "project:retry-restore-activation",
      "export:sync-to-folder",
    ]);
    expect(load).toHaveBeenCalledOnce();
  });
  it("preserves an already-started acknowledged export despite teardown", async () => {
    const gate = deferred();
    service.invokeRequest.mockReturnValueOnce(gate.promise);
    const manual = service.syncProject("manual");
    await vi.waitFor(() =>
      expect(service.invokeRequest).toHaveBeenCalledOnce(),
    );
    expect(service.invokeRequest.mock.calls[0][0]).toBe(
      "export:sync-to-folder",
    );
    service.destroy();
    gate.release(undefined);
    await expect(manual).resolves.toEqual({ success: true });
  });
  it.each(["auto", "timer", "change"])(
    "%s fails closed without retry or export while activation is pending",
    async (source) => {
      retainActivation();
      await expect(service.syncProject(source)).resolves.toMatchObject({
        success: false,
        error: "failed_to_sync_project",
      });
      expect(service.invokeRequest).not.toHaveBeenCalled();
      expect(load).not.toHaveBeenCalled();
      expect(service.pendingRestoreActivationReceipt).not.toBeNull();
    },
  );
  it("manual cannot consume an unclaimed import choice", async () => {
    service.stagePendingSyncDecision("import", {
      content: "captured",
      fileName: "project.json",
    });
    await expect(service.syncProject("manual")).resolves.toMatchObject({
      success: false,
    });
    expect(service.invokeRequest).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
    expect(service._syncDecisionClaimed).toBe(false);
  });
  it("manual cannot overlap an already-running activation or export stale state", async () => {
    retainActivation();
    const gate = deferred();
    service.invokeRequest.mockReturnValueOnce(gate.promise);
    const applying = service.applyPendingSyncDecision();
    await vi.waitFor(() =>
      expect(service.invokeRequest).toHaveBeenCalledOnce(),
    );
    await expect(service.syncProject("manual")).resolves.toMatchObject({
      success: false,
    });
    expectNoExport();
    expect(load).not.toHaveBeenCalled();
    gate.release(success);
    await applying;
    expect(service.invokeRequest).toHaveBeenCalledOnce();
  });
  it("manual success waits for the retained owner's required listener settlement", async () => {
    retainActivation();
    const gate = deferred();
    service.invokeRequest.mockReturnValueOnce(gate.promise);
    let settled = false;
    const manual = service.syncProject("manual").then((result) => {
      settled = true;
      return result;
    });
    await vi.waitFor(() =>
      expect(service.invokeRequest).toHaveBeenCalledOnce(),
    );
    expect(settled).toBe(false);
    expectNoExport();
    gate.release(success);
    await expect(manual).resolves.toEqual({ success: true });
    expect(settled).toBe(true);
  });
  it.each([
    retryable,
    {
      success: false,
      error: "project_restore_import_failed",
      durable: "indeterminate",
      params: { reason: "uncertain" },
    },
  ])(
    "does not infer success from a consumed or retained failed decision",
    async (failure) => {
      retainActivation();
      service.invokeRequest.mockResolvedValue(failure);
      await expect(service.syncProject("manual")).resolves.toMatchObject({
        success: false,
        error: "failed_to_sync_project",
      });
      expectNoExport();
      expect(load).not.toHaveBeenCalled();
    },
  );
  it.each(["destroy", "new-selection", "folder-selection"])(
    "%s during activation cannot complete the old manual sync",
    async (action) => {
      retainActivation();
      const gate = deferred();
      service.invokeRequest.mockReturnValueOnce(gate.promise);
      const manual = service.syncProject("manual");
      await vi.waitFor(() =>
        expect(service.invokeRequest).toHaveBeenCalledOnce(),
      );
      if (action === "destroy") service.destroy();
      else if (action === "folder-selection")
        service._folderSelectionGeneration += 1;
      else service.stagePendingSyncDecision("overwrite", null);
      gate.release(success);
      await expect(manual).resolves.toMatchObject({ success: false });
      expectNoExport();
      expect(load).not.toHaveBeenCalled();
      if (action === "new-selection")
        expect(service.pendingSyncAction).toBe("overwrite");
    },
  );
  it.each([success, retryable, { success: true }])(
    "a held folder picker suppresses stale activation UI and retains a usable acknowledged decision",
    async (result) => {
      retainActivation();
      const activation = deferred();
      const picker = deferred();
      service.directoryPicker = {
        isSupported: () => true,
        pick: vi.fn(() => picker.promise),
      };
      service.invokeRequest.mockReturnValueOnce(activation.promise);
      const generation = service._syncDecisionGeneration;
      const irrelevantGetter = vi.fn(() => {
        throw new Error("untrusted extra field must stay inert");
      });
      const reply =
        result === success
          ? {
              ...success,
              imported: Object.defineProperty(
                { ...success.imported },
                "ignored",
                { enumerable: true, get: irrelevantGetter },
              ),
            }
          : result;
      const manual = service.syncProject("manual");
      await vi.waitFor(() =>
        expect(service.invokeRequest).toHaveBeenCalledOnce(),
      );
      const selecting = service.selectSyncFolder();
      await vi.waitFor(() =>
        expect(service.directoryPicker.pick).toHaveBeenCalledOnce(),
      );
      activation.release(reply);
      await expect(manual).resolves.toMatchObject({ success: false });
      expect(service.ui.showToast).not.toHaveBeenCalled();
      expect(service._syncDecisionGeneration).toBe(generation);
      expect(service.pendingSyncAction).toBe("import");
      expect(service._syncDecisionApplyInFlight).toBe(false);
      expect(service.pendingRestoreActivationReceipt).toMatchObject({
        activation:
          result === success
            ? { data: "complete", preferences: "complete" }
            : { data: "pending", preferences: "pending" },
      });
      expect(irrelevantGetter).not.toHaveBeenCalled();
      expect(service.pendingRestoreActivationReceipt.imported).toEqual(
        success.imported,
      );
      picker.release(
        Promise.reject(new DOMException("cancelled", "AbortError")),
      );
      await expect(selecting).resolves.toBeNull();
      service.invokeRequest.mockResolvedValueOnce(success);
      await expect(service.syncProject("manual")).resolves.toEqual({
        success: true,
      });
      expect(service.invokeRequest).toHaveBeenCalledTimes(
        result === success ? 1 : 2,
      );
      expect(service.pendingSyncAction).toBeNull();
      expectNoExport();
      expect(load).not.toHaveBeenCalled();
    },
  );
  it("accepted folder selection invalidates old acknowledgement without touching its new decision", async () => {
    retainActivation();
    const activation = deferred();
    const picker = deferred();
    const directory = {
      kind: "directory",
      name: "new-folder",
      queryPermission: vi.fn(async () => "granted"),
      requestPermission: vi.fn(async () => "granted"),
      getDirectoryHandle: vi.fn(),
      getFileHandle: vi.fn(async () => {
        throw new DOMException("absent", "NotFoundError");
      }),
    };
    service.fs = {
      getSyncDirectoryState: vi.fn(async () => ({
        handle: null,
        transitionPending: false,
      })),
      beginSyncDirectoryTransition: vi.fn(async () => {}),
      completeSyncDirectoryTransition: vi.fn(async () => {}),
    };
    service.directoryPicker = {
      isSupported: () => true,
      pick: vi.fn(() => picker.promise),
    };
    service.request = vi.fn(async () => true);
    service.invokeRequest.mockReturnValueOnce(activation.promise);
    const manual = service.syncProject("manual");
    await vi.waitFor(() =>
      expect(service.invokeRequest).toHaveBeenCalledOnce(),
    );
    const selecting = service.selectSyncFolder();
    picker.release(directory);
    await expect(selecting).resolves.toMatchObject({
      folderName: "new-folder",
    });
    const generation = service._syncDecisionGeneration;
    service.ui.showToast.mockClear();
    activation.release(success);
    await expect(manual).resolves.toMatchObject({ success: false });
    expect(service.ui.showToast).not.toHaveBeenCalled();
    expect(service._syncDecisionGeneration).toBe(generation);
    expect(service._syncDecisionApplyInFlight).toBe(false);
    expect(service.pendingSyncAction).toBeNull();
    expect(service.pendingRestoreActivationReceipt).toBeNull();
    expectNoExport();
  });
  it.each([
    "dispatched rejection",
    "malformed reply",
    "terminal reply",
    "missing responder",
  ])(
    "held picker preserves no-replay for %s and releases only its own in-flight flag",
    async (outcome) => {
      const content = {
        content: "captured validated artifact",
        fileName: "project.json",
      };
      service.stagePendingSyncDecision("import", content);
      service._syncDecisionClaimed = true;
      vi.spyOn(fixture.eventBus, "hasListeners").mockReturnValue(
        outcome !== "missing responder",
      );
      const restoring = deferred();
      const picker = deferred();
      service.directoryPicker = {
        isSupported: () => true,
        pick: vi.fn(() => picker.promise),
      };
      service.invokeRequest.mockReturnValueOnce(restoring.promise);
      const manual = service.syncProject("manual");
      await vi.waitFor(() =>
        expect(service.invokeRequest).toHaveBeenCalledOnce(),
      );
      const selecting = service.selectSyncFolder();
      if (outcome === "malformed reply") restoring.release({ success: true });
      else if (outcome === "terminal reply")
        restoring.release({
          success: false,
          error: "project_restore_import_failed",
          durable: "indeterminate",
          params: { reason: "uncertain" },
        });
      else
        restoring.release(
          Promise.reject(new Error("restore transport failed")),
        );
      await expect(manual).resolves.toMatchObject({ success: false });
      expect(service.ui.showToast).not.toHaveBeenCalled();
      expect(service._syncDecisionApplyInFlight).toBe(false);
      const predispatch = outcome === "missing responder";
      expect(service.deferredImportContent).toEqual(
        predispatch ? content : null,
      );
      expect(service.awaitingSyncDecisionApply).toBe(predispatch);
      picker.release(
        Promise.reject(new DOMException("cancelled", "AbortError")),
      );
      await selecting;
      service.invokeRequest.mockResolvedValueOnce(success);
      await expect(service.syncProject("manual")).resolves.toMatchObject({
        success: predispatch,
      });
      expect(service.invokeRequest).toHaveBeenCalledTimes(predispatch ? 2 : 1);
      if (!predispatch)
        await expect(service.applyPendingSyncDecision()).resolves.toBe(false);
      expectNoExport();
      expect(load).not.toHaveBeenCalled();
    },
  );
  it("terminal activation failure during folder selection cannot become retryable retained work", async () => {
    retainActivation();
    const activation = deferred();
    const picker = deferred();
    service.directoryPicker = {
      isSupported: () => true,
      pick: vi.fn(() => picker.promise),
    };
    service.invokeRequest.mockReturnValueOnce(activation.promise);
    const manual = service.syncProject("manual");
    await vi.waitFor(() =>
      expect(service.invokeRequest).toHaveBeenCalledOnce(),
    );
    const selecting = service.selectSyncFolder();
    activation.release({
      success: false,
      error: "project_restore_import_failed",
      durable: "indeterminate",
      params: { reason: "uncertain" },
    });
    await expect(manual).resolves.toMatchObject({ success: false });
    expect(service.ui.showToast).not.toHaveBeenCalled();
    expect(service._syncDecisionApplyInFlight).toBe(false);
    expect(service.awaitingSyncDecisionApply).toBe(false);
    expect(service.pendingRestoreActivationReceipt).toBeNull();
    picker.release(Promise.reject(new DOMException("cancelled", "AbortError")));
    await selecting;
    await expect(service.syncProject("manual")).resolves.toMatchObject({
      success: false,
    });
    await expect(service.applyPendingSyncDecision()).resolves.toBe(false);
    expect(service.invokeRequest).toHaveBeenCalledOnce();
    expectNoExport();
  });
  it.each(
    ["load", "permission"].flatMap((stage) =>
      ["import", "destroy", "folder-selection"].map((action) => [
        stage,
        action,
      ]),
    ),
  )("%s interrupted by %s prevents stale export", async (stage, action) => {
    const gate = deferred();
    if (stage === "load") load.mockReturnValueOnce(gate.promise);
    else permission.mockReturnValueOnce(gate.promise);
    const manual = service.syncProject("manual");
    await vi.waitFor(() =>
      expect(stage === "load" ? load : permission).toHaveBeenCalledOnce(),
    );
    if (action === "destroy") service.destroy();
    else if (action === "folder-selection")
      service._folderSelectionGeneration += 1;
    else
      service.stagePendingSyncDecision("import", {
        content: "new",
        fileName: "project.json",
      });
    gate.release(
      stage === "load"
        ? { success: true, state: "available", value: { raw: {} } }
        : { success: true, state: "granted" },
    );
    await expect(manual).resolves.toMatchObject({ success: false });
    expectNoExport();
  });
});
