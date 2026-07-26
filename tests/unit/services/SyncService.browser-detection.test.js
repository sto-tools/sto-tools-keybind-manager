import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import SyncService from "../../../src/js/components/services/SyncService.js";
import { respond } from "../../../src/js/core/requestResponse.js";
import { createServiceFixture } from "../../fixtures/index.js";
import { addSyncTransitionMethods } from "../../fixtures/services/syncFileSystem.js";

function createHandle(name) {
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

describe("SyncService browser capability detection", () => {
  let fixture;
  let service;
  let ui;
  let fs;
  let directoryPicker;
  let inform;
  let persistFolderSettings;
  let detachSettings;
  let detachInform;

  beforeEach(() => {
    global.window = {
      isSecureContext: true,
      location: { protocol: "https:", hostname: "localhost" },
    };
    global.navigator = { userAgent: "Chrome/91.0" };
    fixture = createServiceFixture({ enableFS: false });
    ui = { showToast: vi.fn() };
    fs = {
      saveDirectoryHandle: vi.fn().mockResolvedValue(undefined),
      getDirectoryHandle: vi.fn().mockResolvedValue(null),
      deleteDirectoryHandle: vi.fn().mockResolvedValue(undefined),
    };
    addSyncTransitionMethods(fs);
    directoryPicker = {
      isSupported: vi.fn().mockReturnValue(true),
      pick: vi.fn(),
    };
    inform = vi.fn().mockResolvedValue(undefined);
    persistFolderSettings = vi.fn().mockResolvedValue(true);
    detachSettings = respond(
      fixture.eventBus,
      "preferences:persist-sync-folder-settings",
      (settings) => persistFolderSettings(settings),
    );
    detachInform = respond(fixture.eventBus, "ui:inform", (request) =>
      inform(request),
    );
    service = new SyncService({
      eventBus: fixture.eventBus,
      ui,
      fs,
      i18n: { t: (key) => key },
      directoryPicker,
    });
    service.init();
  });

  afterEach(() => {
    detachSettings?.();
    detachInform?.();
    if (!service.destroyed) service.destroy();
    fixture.destroy();
    vi.restoreAllMocks();
  });

  it("detects Firefox without classifying Chrome or Edge as Firefox", () => {
    global.navigator = {
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:91.0) Gecko/20100101 Firefox/91.0",
    };
    expect(service.isFirefox()).toBe(true);

    global.navigator = {
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/91.0.4472.124 Safari/537.36",
    };
    expect(service.isFirefox()).toBe(false);

    global.navigator = {
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/91.0.4472.124 Safari/537.36 Edg/91.0.864.59",
    };
    expect(service.isFirefox()).toBe(false);
  });

  it("does not detect Firefox without a navigator", () => {
    global.navigator = undefined;
    expect(service.isFirefox()).toBe(false);
  });

  it.each([
    [true, "https:", "example.com", true],
    [undefined, "file:", "", true],
    [undefined, "http:", "localhost", true],
    [undefined, "http:", "127.0.0.1", true],
    [false, "http:", "example.com", false],
  ])(
    "evaluates secure context state %# for %s//%s",
    (isSecureContext, protocol, hostname, expected) => {
      global.window = {
        isSecureContext,
        location: { protocol, hostname },
      };
      expect(service.isSecureContext()).toBe(expected);
    },
  );

  it("does not report a secure context without a window", () => {
    global.window = undefined;
    expect(service.isSecureContext()).toBe(false);
  });

  it("reports Firefox before consulting the picker capability", async () => {
    global.navigator = { userAgent: "Firefox/91.0" };

    await expect(service.setSyncFolder(false)).resolves.toBeNull();

    expect(ui.showToast).toHaveBeenCalledWith(
      "sync_not_supported_firefox",
      "error",
    );
    expect(inform).toHaveBeenCalledWith({
      message: "sync_not_supported_detailed",
      title: "sync_not_supported_title",
      type: "info",
      context: "syncNotSupported",
    });
    expect(directoryPicker.isSupported).not.toHaveBeenCalled();
    expect(directoryPicker.pick).not.toHaveBeenCalled();
  });

  it("reports an insecure context before consulting the picker", async () => {
    global.window = {
      isSecureContext: false,
      location: { protocol: "http:", hostname: "example.com" },
    };

    await expect(service.setSyncFolder(false)).resolves.toBeNull();

    expect(ui.showToast).toHaveBeenCalledWith(
      "sync_not_supported_secure_context",
      "error",
    );
    expect(inform).toHaveBeenCalled();
    expect(directoryPicker.isSupported).not.toHaveBeenCalled();
    expect(directoryPicker.pick).not.toHaveBeenCalled();
  });

  it.each([
    ["https:", "example.com"],
    ["file:", ""],
  ])(
    "selects a folder in a supported %s context",
    async (protocol, hostname) => {
      global.window = {
        isSecureContext: true,
        location: { protocol, hostname },
      };
      const handle = createHandle("syncDir");
      directoryPicker.pick.mockResolvedValue(handle);

      await expect(service.setSyncFolder(false)).resolves.toBe(handle);

      expect(directoryPicker.pick).toHaveBeenCalledOnce();
      expect(persistFolderSettings).toHaveBeenCalledWith({
        syncFolderName: "syncDir",
        syncFolderPath: "Selected folder: syncDir",
        syncFolderFallback: false,
        autoSync: false,
      });
      expect(ui.showToast).toHaveBeenCalledWith("sync_folder_set", "success");
    },
  );

  it("reports an unsupported injected picker capability", async () => {
    directoryPicker.isSupported.mockReturnValue(false);

    await expect(service.setSyncFolder(false)).resolves.toBeNull();

    expect(ui.showToast).toHaveBeenCalledWith(
      "sync_not_supported_browser",
      "error",
    );
    expect(inform).toHaveBeenCalledWith({
      message: "sync_not_supported_browser_detailed",
      title: "sync_not_supported_browser_title",
      type: "info",
      context: "syncNotSupportedBrowser",
    });
    expect(directoryPicker.pick).not.toHaveBeenCalled();
  });
});
