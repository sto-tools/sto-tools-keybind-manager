import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import SyncService from "../../../src/js/components/services/SyncService.js";
import { respond } from "../../../src/js/core/requestResponse.js";
import { createServiceFixture } from "../../fixtures/index.js";
import { addSyncTransitionMethods } from "../../fixtures/services/syncFileSystem.js";

function createHandle(name) {
  return {
    kind: "directory",
    name,
    getFileHandle: vi.fn(),
    getDirectoryHandle: vi.fn(),
  };
}

describe("SyncService folder-selection action", () => {
  let fixture;
  let service;
  let fs;
  let durableHandle;
  let detachFolderSettings;

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
    addSyncTransitionMethods(fs);
    service = new SyncService({
      eventBus: fixture.eventBus,
      fs,
      i18n: { t: (key) => key },
    });
    service.init();
  });

  afterEach(() => {
    detachFolderSettings?.();
    detachFolderSettings = null;
    service?.destroy();
    fixture?.destroy();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("maps a selected handle to an exact detached action result", async () => {
    const handle = createHandle("Fleet Builds");
    const select = vi
      .spyOn(service, "selectSyncFolder")
      .mockResolvedValue({ handle, folderName: "Fleet Builds" });

    const result = await service.request(
      "sync:select-folder",
      { autoSync: true },
      0,
    );

    expect(select).toHaveBeenCalledOnce();
    expect(select).toHaveBeenCalledWith(true);
    expect(result).toStrictEqual({ success: true, folderName: "Fleet Builds" });
    expect(Object.keys(result)).toEqual(["success", "folderName"]);
    expect(Object.isFrozen(result)).toBe(true);
    expect(result).not.toHaveProperty("handle");
  });

  it("maps a cancelled or failed direct selection to the exact failure result", async () => {
    const select = vi
      .spyOn(service, "selectSyncFolder")
      .mockResolvedValue(null);

    await expect(
      service.request("sync:select-folder", { autoSync: false }, 0),
    ).resolves.toStrictEqual({ success: false });

    expect(select).toHaveBeenCalledOnce();
    expect(select).toHaveBeenCalledWith(false);
  });

  it.each([
    undefined,
    null,
    true,
    [],
    {},
    { autoSync: "true" },
    { autoSync: true, extra: true },
    Object.defineProperty({}, "autoSync", { get: () => true }),
    Object.defineProperty({}, "autoSync", { value: true }),
    new (class FolderSelectionRequest {
      constructor() {
        this.autoSync = true;
      }
    })(),
  ])(
    "rejects non-exact request payload %# before selection",
    async (payload) => {
      const select = vi.spyOn(service, "selectSyncFolder");

      await expect(
        service.selectFolderFromAction(payload),
      ).resolves.toStrictEqual({ success: false });

      expect(select).not.toHaveBeenCalled();
    },
  );

  it("accepts an exact null-prototype data record", async () => {
    const select = vi
      .spyOn(service, "selectSyncFolder")
      .mockResolvedValue(null);
    const payload = Object.assign(Object.create(null), { autoSync: true });

    await expect(
      service.selectFolderFromAction(payload),
    ).resolves.toStrictEqual({ success: false });

    expect(select).toHaveBeenCalledOnce();
    expect(select).toHaveBeenCalledWith(true);
  });

  it("contains hostile reflection before invoking the selection workflow", async () => {
    const select = vi.spyOn(service, "selectSyncFolder");
    const payload = new Proxy(
      {},
      {
        getPrototypeOf() {
          throw new Error("hostile prototype");
        },
      },
    );

    await expect(
      service.selectFolderFromAction(payload),
    ).resolves.toStrictEqual({ success: false });

    expect(select).not.toHaveBeenCalled();
  });

  it("contains an unexpected direct-method rejection inside the action result", async () => {
    const error = new Error("picker failed outside the normal saga");
    vi.spyOn(service, "selectSyncFolder").mockRejectedValue(error);
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    await expect(
      service.request("sync:select-folder", { autoSync: true }, 0),
    ).resolves.toStrictEqual({ success: false });
    expect(consoleError).toHaveBeenCalledWith(
      "[SyncService] sync folder action failed",
      error,
    );
  });

  it("builds a committed receipt from the boundary name without rereading the raw handle", async () => {
    let nameReads = 0;
    const nameGetter = vi.fn(() => {
      nameReads += 1;
      if (nameReads === 1) return "Stable Fleet Builds";
      throw new Error("raw handle name was read again");
    });
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
    const persistFolderSettings = vi.fn().mockResolvedValue(true);
    detachFolderSettings = respond(
      fixture.eventBus,
      "preferences:persist-sync-folder-settings",
      (settings) => persistFolderSettings(settings),
    );
    vi.stubGlobal("showDirectoryPicker", vi.fn().mockResolvedValue(handle));
    vi.spyOn(service, "isFirefox").mockReturnValue(false);
    vi.spyOn(service, "isSecureContext").mockReturnValue(true);
    const folderSet = vi.fn();
    fixture.eventBus.on("sync:folder-set", folderSet);

    await expect(
      service.request("sync:select-folder", { autoSync: true }, 0),
    ).resolves.toStrictEqual({
      success: true,
      folderName: "Stable Fleet Builds",
    });

    expect(nameGetter).toHaveBeenCalledOnce();
    expect(durableHandle).toBe(handle);
    expect(fs.completeSyncDirectoryTransition).toHaveBeenCalledOnce();
    expect(persistFolderSettings).toHaveBeenCalledWith({
      syncFolderName: "Stable Fleet Builds",
      syncFolderPath: "Selected folder: Stable Fleet Builds",
      syncFolderFallback: false,
      autoSync: true,
    });
    expect(folderSet).toHaveBeenCalledOnce();
    expect(folderSet.mock.calls[0][0].handle).toBe(handle);
  });
});
