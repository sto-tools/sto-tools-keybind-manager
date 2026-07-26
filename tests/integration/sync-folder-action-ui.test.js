import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import SyncService from "../../src/js/components/services/SyncService.js";
import PreferencesUI from "../../src/js/components/ui/PreferencesUI.js";
import eventBus from "../../src/js/core/eventBus.js";
import { respond } from "../../src/js/core/requestResponse.js";
import { addSyncTransitionMethods } from "../fixtures/services/syncFileSystem.js";

/** @returns {import('../../src/js/types/sync-boundary.js').SyncDirectoryHandle} */
function createHandle(name) {
  return {
    kind: "directory",
    name,
    getFileHandle: vi.fn(),
    getDirectoryHandle: vi.fn(),
  };
}

describe("sync folder action UI integration", () => {
  let sync;
  let preferencesUI;
  let fs;
  let durableHandle;
  let persistFolderSettings;
  let detachFolderSettings;
  let directoryPicker;

  beforeEach(() => {
    eventBus.clear();
    document.body.innerHTML = `
      <button id="setSyncFolderBtn" type="button">Set folder</button>
      <span id="currentSyncFolder"></span>
    `;
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
    directoryPicker = {
      isSupported: vi.fn().mockReturnValue(true),
      pick: vi.fn(),
    };
    persistFolderSettings = vi.fn().mockResolvedValue(true);
    detachFolderSettings = respond(
      eventBus,
      "preferences:persist-sync-folder-settings",
      (settings) => persistFolderSettings(settings),
    );
    sync = new SyncService({
      eventBus,
      fs,
      i18n: { t: (key) => key },
      directoryPicker,
    });
    preferencesUI = new PreferencesUI({ eventBus, document });
    sync.init();
    preferencesUI.init();
  });

  afterEach(() => {
    detachFolderSettings?.();
    detachFolderSettings = null;
    preferencesUI?.destroy();
    sync?.destroy();
    eventBus.clear();
    document.body.replaceChildren();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("projects the detached folder-name reply from the sync owner", async () => {
    const handle = createHandle("Fleet Builds");
    const select = vi
      .spyOn(sync, "selectSyncFolder")
      .mockResolvedValue({ handle, folderName: "Fleet Builds" });

    document.getElementById("setSyncFolderBtn")?.click();

    await vi.waitFor(() => {
      expect(document.getElementById("currentSyncFolder")?.textContent).toBe(
        "Fleet Builds",
      );
    });
    expect(select).toHaveBeenCalledOnce();
    expect(select).toHaveBeenCalledWith(true);
  });

  it("does not replace the field when the owner reports no selection", async () => {
    const select = vi.spyOn(sync, "selectSyncFolder").mockResolvedValue(null);
    const display = document.getElementById("currentSyncFolder");
    if (display) display.textContent = "Existing Folder";

    document.getElementById("setSyncFolderBtn")?.click();

    await vi.waitFor(() => expect(select).toHaveBeenCalledOnce());
    await Promise.resolve();
    expect(display?.textContent).toBe("Existing Folder");
  });

  it("renders the ingress-captured name when the committed handle later changes it", async () => {
    const nameGetter = vi
      .fn()
      .mockReturnValueOnce("Boundary Stable")
      .mockReturnValue("Changed After Ingress");
    const handle = {
      kind: "directory",
      queryPermission: vi.fn().mockResolvedValue("granted"),
      requestPermission: vi.fn().mockResolvedValue("granted"),
      getDirectoryHandle: vi.fn(),
      getFileHandle: vi
        .fn()
        .mockRejectedValue(new DOMException("not found", "NotFoundError")),
    };
    Object.defineProperty(handle, "name", {
      enumerable: true,
      configurable: true,
      get: nameGetter,
    });
    directoryPicker.pick.mockResolvedValue(handle);
    vi.spyOn(sync, "isFirefox").mockReturnValue(false);
    vi.spyOn(sync, "isSecureContext").mockReturnValue(true);

    document.getElementById("setSyncFolderBtn")?.click();

    await vi.waitFor(() => {
      expect(document.getElementById("currentSyncFolder")?.textContent).toBe(
        "Boundary Stable",
      );
    });
    expect(nameGetter).toHaveBeenCalledOnce();
    expect(durableHandle).toBe(handle);
    expect(fs.completeSyncDirectoryTransition).toHaveBeenCalledOnce();
    expect(persistFolderSettings).toHaveBeenCalledWith({
      syncFolderName: "Boundary Stable",
      syncFolderPath: "Selected folder: Boundary Stable",
      syncFolderFallback: false,
      autoSync: true,
    });
  });
});
