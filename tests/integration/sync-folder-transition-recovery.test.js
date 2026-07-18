import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import FileSystemService from "../../src/js/components/services/FileSystemService.js";
import SyncService from "../../src/js/components/services/SyncService.js";
import { respond } from "../../src/js/core/requestResponse.js";
import { createServiceFixture } from "../fixtures/index.js";

function createHandle(name) {
  return {
    kind: "directory",
    name,
    queryPermission: vi.fn().mockResolvedValue("granted"),
    requestPermission: vi.fn().mockResolvedValue("granted"),
    getDirectoryHandle: vi.fn(),
    getFileHandle: vi
      .fn()
      .mockRejectedValue(new DOMException("missing", "NotFoundError")),
  };
}

describe("sync folder durable transition recovery", () => {
  let fixture;
  let service;
  let fs;
  let detachSettings;

  beforeEach(() => {
    fixture = createServiceFixture({ enableFS: false });
    fs = new FileSystemService({
      eventBus: fixture.eventBus,
      dbName: `sync-transition-recovery-${crypto.randomUUID()}`,
    });
    detachSettings = respond(
      fixture.eventBus,
      "preferences:persist-sync-folder-settings",
      () => false,
    );
  });

  afterEach(() => {
    detachSettings?.();
    if (service && !service.destroyed) service.destroy();
    fixture?.destroy();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("blocks export after recreation when compensation leaves a dirty marker", async () => {
    const candidate = createHandle("Candidate Fleet Builds");
    vi.stubGlobal("showDirectoryPicker", vi.fn().mockResolvedValue(candidate));
    vi.spyOn(fs, "restoreSyncDirectoryState").mockRejectedValue(
      new Error("rollback transaction aborted"),
    );
    service = new SyncService({
      eventBus: fixture.eventBus,
      fs,
      ui: { showToast: vi.fn() },
      i18n: {
        t: (key, params) => (params?.error ? `${key}:${params.error}` : key),
      },
    });
    service.init();
    vi.spyOn(service, "isFirefox").mockReturnValue(false);
    vi.spyOn(service, "isSecureContext").mockReturnValue(true);

    await expect(service.setSyncFolder(false)).resolves.toBeNull();
    await expect(fs.getSyncDirectoryState()).resolves.toEqual({
      handle: candidate,
      transitionPending: true,
    });

    service.destroy();
    service = new SyncService({
      eventBus: fixture.eventBus,
      fs: new FileSystemService({
        eventBus: fixture.eventBus,
        dbName: fs.dbName,
      }),
      ui: { showToast: vi.fn() },
      i18n: { t: (key) => key },
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
  });
});
