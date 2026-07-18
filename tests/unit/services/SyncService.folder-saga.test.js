import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import SyncService from "../../../src/js/components/services/SyncService.js";
import { respond } from "../../../src/js/core/requestResponse.js";
import { createServiceFixture } from "../../fixtures/index.js";
import { addSyncTransitionMethods } from "../../fixtures/services/syncFileSystem.js";

function createSelectedHandle(name = "Fleet Builds") {
  return {
    kind: "directory",
    name,
    queryPermission: vi.fn().mockResolvedValue("granted"),
    requestPermission: vi.fn().mockResolvedValue("granted"),
    getDirectoryHandle: vi.fn(),
    getFileHandle: vi
      .fn()
      .mockRejectedValue(new DOMException("not found", "NotFoundError")),
  };
}

describe("SyncService folder compensation saga", () => {
  let fixture;
  let service;
  let fs;
  let ui;
  let persistFolderSettings;
  let detachFolderSettings;
  let durableHandle;
  let transitionState;

  beforeEach(() => {
    fixture = createServiceFixture({ enableFS: false });
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
    transitionState = addSyncTransitionMethods(fs);
    ui = { showToast: vi.fn() };
    persistFolderSettings = vi.fn().mockResolvedValue(true);
    detachFolderSettings = respond(
      fixture.eventBus,
      "preferences:persist-sync-folder-settings",
      (mutation) => persistFolderSettings(mutation),
    );
    service = new SyncService({
      eventBus: fixture.eventBus,
      fs,
      ui,
      i18n: {
        t: (key, params) => (params?.error ? `${key}:${params.error}` : key),
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

  function selectHandle(handle) {
    vi.stubGlobal("showDirectoryPicker", vi.fn().mockResolvedValue(handle));
  }

  it("keeps a failed compensation quarantined after service recreation", async () => {
    const priorHandle = createSelectedHandle("Prior Fleet Builds");
    durableHandle = priorHandle;
    const handle = createSelectedHandle();
    selectHandle(handle);
    persistFolderSettings.mockResolvedValue(false);
    fs.saveDirectoryHandle
      .mockImplementationOnce(async (_key, value) => {
        durableHandle = value;
      })
      .mockRejectedValueOnce(new Error("restore transaction aborted"));
    service.stagePendingSyncDecision("overwrite", null);

    await expect(service.setSyncFolder(false)).resolves.toBeNull();

    expect(durableHandle).toBe(handle);
    expect(service.pendingSyncAction).toBe("overwrite");
    expect(service.awaitingSyncDecisionApply).toBe(true);
    expect(ui.showToast).toHaveBeenCalledWith(
      "failed_to_set_sync_folder:sync_folder_compensation_failed",
      "error",
    );
    service.destroy();
    service = new SyncService({
      eventBus: fixture.eventBus,
      fs,
      ui,
      i18n: {
        t: (key, params) => (params?.error ? `${key}:${params.error}` : key),
      },
    });
    service.init();
    vi.spyOn(service, "isFirefox").mockReturnValue(false);
    vi.spyOn(service, "isSecureContext").mockReturnValue(true);
    service.invokeRequest = vi.fn();

    await expect(service.syncProject("manual")).resolves.toEqual({
      success: false,
      error: "sync_folder_transition_incomplete",
    });
    expect(service.invokeRequest).not.toHaveBeenCalled();
    expect(transitionState.transitionPending).toBe(true);
  });

  it("quarantines a coherent handle when transition finalization fails", async () => {
    const handle = createSelectedHandle();
    selectHandle(handle);
    fs.completeSyncDirectoryTransition.mockRejectedValue(
      new Error("marker delete transaction aborted"),
    );

    await expect(service.setSyncFolder(false)).resolves.toBeNull();

    expect(persistFolderSettings).toHaveBeenCalledOnce();
    expect(durableHandle).toBe(handle);
    expect(transitionState.transitionPending).toBe(true);
    await expect(service.loadSyncFolderCapability()).resolves.toEqual({
      success: false,
      error: "sync_folder_transition_incomplete",
    });
    expect(ui.showToast).toHaveBeenCalledWith(
      "failed_to_set_sync_folder:sync_folder_transition_incomplete",
      "error",
    );
  });

  it("restores the prior handle when destruction occurs during the handle write", async () => {
    const priorHandle = createSelectedHandle("Prior Fleet Builds");
    durableHandle = priorHandle;
    const handle = createSelectedHandle();
    selectHandle(handle);
    /** @type {() => void} */
    let releaseWrite = () => {};
    fs.saveDirectoryHandle.mockImplementationOnce(
      (_key, value) =>
        new Promise((resolve) => {
          releaseWrite = () => {
            durableHandle = value;
            resolve();
          };
        }),
    );

    const selection = service.setSyncFolder(false);
    await vi.waitFor(() => {
      expect(fs.saveDirectoryHandle).toHaveBeenCalledOnce();
    });
    service.destroy();
    releaseWrite();

    await expect(selection).resolves.toBeNull();
    expect(fs.saveDirectoryHandle.mock.calls).toEqual([
      ["sync-folder", handle],
      ["sync-folder", priorHandle],
    ]);
    expect(durableHandle).toBe(priorHandle);
    expect(persistFolderSettings).not.toHaveBeenCalled();
  });

  it("does not persist a picker result superseded before its write", async () => {
    const firstHandle = createSelectedHandle("First");
    const secondHandle = createSelectedHandle("Second");
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

  it("compensates an in-flight superseded write before committing the latest selection", async () => {
    const firstHandle = createSelectedHandle("First");
    const secondHandle = createSelectedHandle("Second");
    vi.stubGlobal(
      "showDirectoryPicker",
      vi
        .fn()
        .mockResolvedValueOnce(firstHandle)
        .mockResolvedValueOnce(secondHandle),
    );
    /** @type {() => void} */
    let releaseFirstWrite = () => {};
    fs.saveDirectoryHandle.mockImplementationOnce(
      (_key, value) =>
        new Promise((resolve) => {
          releaseFirstWrite = () => {
            durableHandle = value;
            resolve();
          };
        }),
    );

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

    expect(fs.saveDirectoryHandle.mock.calls).toEqual([
      ["sync-folder", firstHandle],
      ["sync-folder", secondHandle],
    ]);
    expect(fs.deleteDirectoryHandle).toHaveBeenCalledOnce();
    expect(durableHandle).toBe(secondHandle);
    expect(persistFolderSettings).toHaveBeenCalledOnce();
  });

  it("restores a coherent earlier commit when the queued newer settings write fails", async () => {
    const firstHandle = createSelectedHandle("First");
    const secondHandle = createSelectedHandle("Second");
    vi.stubGlobal(
      "showDirectoryPicker",
      vi
        .fn()
        .mockResolvedValueOnce(firstHandle)
        .mockResolvedValueOnce(secondHandle),
    );
    /** @type {(value: boolean) => void} */
    let resolveFirstSettings = () => {};
    persistFolderSettings
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirstSettings = resolve;
          }),
      )
      .mockResolvedValueOnce(false);
    const folderSet = vi.fn();
    fixture.eventBus.on("sync:folder-set", folderSet);

    const first = service.setSyncFolder(false);
    await vi.waitFor(() => {
      expect(persistFolderSettings).toHaveBeenCalledOnce();
    });
    const second = service.setSyncFolder(true);
    await Promise.resolve();
    expect(fs.saveDirectoryHandle).toHaveBeenCalledOnce();

    resolveFirstSettings(true);
    await expect(first).resolves.toBeNull();
    await expect(second).resolves.toBeNull();

    expect(persistFolderSettings.mock.calls).toEqual([
      [expect.objectContaining({ syncFolderName: "First", autoSync: false })],
      [expect.objectContaining({ syncFolderName: "Second", autoSync: true })],
    ]);
    expect(fs.saveDirectoryHandle.mock.calls).toEqual([
      ["sync-folder", firstHandle],
      ["sync-folder", secondHandle],
      ["sync-folder", firstHandle],
    ]);
    expect(durableHandle).toBe(firstHandle);
    expect(folderSet).not.toHaveBeenCalled();
  });

  it("keeps capability consumers behind the commit tail through compensation", async () => {
    const priorHandle = createSelectedHandle("Prior Fleet Builds");
    durableHandle = priorHandle;
    const handle = createSelectedHandle();
    selectHandle(handle);
    /** @type {() => void} */
    let rejectSettings = () => {};
    persistFolderSettings.mockImplementation(
      () =>
        new Promise((resolve) => {
          rejectSettings = () => resolve(false);
        }),
    );

    const selection = service.setSyncFolder(false);
    await vi.waitFor(() => {
      expect(persistFolderSettings).toHaveBeenCalledOnce();
    });
    expect(durableHandle).toBe(handle);

    let consumerSettled = false;
    const consumer = service.loadSyncFolderCapability().finally(() => {
      consumerSettled = true;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(consumerSettled).toBe(false);
    expect(fs.getDirectoryHandle).toHaveBeenCalledOnce();

    rejectSettings();
    await expect(selection).resolves.toBeNull();
    await expect(consumer).resolves.toMatchObject({
      success: true,
      state: "available",
      value: { name: "Prior Fleet Builds", raw: priorHandle },
    });
    expect(fs.saveDirectoryHandle.mock.calls).toEqual([
      ["sync-folder", handle],
      ["sync-folder", priorHandle],
    ]);
    expect(fs.getDirectoryHandle).toHaveBeenCalledTimes(2);
    expect(durableHandle).toBe(priorHandle);
  });

  it("keeps a later folder transition behind an in-flight capability read", async () => {
    const priorHandle = createSelectedHandle("Prior Fleet Builds");
    const nextHandle = createSelectedHandle("Next Fleet Builds");
    durableHandle = priorHandle;
    selectHandle(nextHandle);
    /** @type {() => void} */
    let releaseRead = () => {};
    fs.getDirectoryHandle.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseRead = () => resolve(priorHandle);
        }),
    );

    const consumer = service.loadSyncFolderCapability();
    await vi.waitFor(() => {
      expect(fs.getDirectoryHandle).toHaveBeenCalledOnce();
    });

    const selection = service.setSyncFolder(false);
    await Promise.resolve();
    await Promise.resolve();
    expect(fs.saveDirectoryHandle).not.toHaveBeenCalled();

    releaseRead();
    await expect(consumer).resolves.toMatchObject({
      success: true,
      state: "available",
      value: { name: "Prior Fleet Builds", raw: priorHandle },
    });
    await expect(selection).resolves.toBe(nextHandle);

    expect(fs.getDirectoryHandle).toHaveBeenCalledTimes(2);
    expect(fs.saveDirectoryHandle).toHaveBeenCalledOnce();
    expect(fs.saveDirectoryHandle).toHaveBeenCalledWith(
      "sync-folder",
      nextHandle,
    );
    expect(durableHandle).toBe(nextHandle);
  });
});
