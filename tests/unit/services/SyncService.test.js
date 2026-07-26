import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock i18next before importing the service
vi.mock("i18next", () => ({
  default: {
    t: vi.fn((key) => key),
  },
}));

import SyncService from "../../../src/js/components/services/SyncService.js";
import { respond } from "../../../src/js/core/requestResponse.js";
import { createServiceFixture } from "../../fixtures/index.js";
import { createProjectRestoreSuccess } from "../../fixtures/services/projectRestore.js";
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

describe("SyncService", () => {
  let fixture,
    service,
    uiMock,
    fsMock,
    i18nMock,
    directoryPickerMock,
    confirmMock,
    services,
    persistFolderSettings,
    detachSettings,
    detachConfirm;

  beforeEach(() => {
    global.window = {
      isSecureContext: true,
      location: { protocol: "https:", hostname: "localhost" },
    };
    global.navigator = { userAgent: "Chrome/91.0" };
    fixture = createServiceFixture({ enableFS: false });
    services = [];
    uiMock = { showToast: vi.fn() };

    fsMock = {
      saveDirectoryHandle: vi.fn().mockResolvedValue(undefined),
      getDirectoryHandle: vi.fn().mockResolvedValue(createHandle("syncDir")),
      deleteDirectoryHandle: vi.fn().mockResolvedValue(undefined),
    };
    addSyncTransitionMethods(fsMock);

    i18nMock = { t: vi.fn((key) => key) };
    directoryPickerMock = {
      isSupported: vi.fn().mockReturnValue(true),
      pick: vi.fn(),
    };
    confirmMock = vi.fn();
    persistFolderSettings = vi.fn().mockResolvedValue(true);
    detachSettings = respond(
      fixture.eventBus,
      "preferences:persist-sync-folder-settings",
      (settings) => persistFolderSettings(settings),
    );
    detachConfirm = respond(fixture.eventBus, "ui:confirm", (request) =>
      confirmMock(request),
    );

    service = new SyncService({
      eventBus: fixture.eventBus,
      ui: uiMock,
      fs: fsMock,
      i18n: i18nMock,
      directoryPicker: directoryPickerMock,
    });
    services.push(service);
    service.init();
  });

  afterEach(() => {
    detachSettings?.();
    detachConfirm?.();
    services.forEach((candidate) => {
      if (!candidate.destroyed) candidate.destroy();
    });
    fixture.destroy();
    vi.restoreAllMocks();
  });

  describe("Legacy Functionality", () => {
    it("setSyncFolder saves folder name in preferences", async () => {
      const handle = createHandle("syncDir");
      directoryPickerMock.pick.mockResolvedValue(handle);
      global.navigator = { userAgent: "Chrome/91.0" }; // Non-Firefox
      global.window.location = { protocol: "https:", hostname: "localhost" };
      global.window.isSecureContext = true;

      await service.setSyncFolder(false);

      expect(persistFolderSettings).toHaveBeenCalledWith(
        expect.objectContaining({ syncFolderName: "syncDir" }),
      );
      expect(uiMock.showToast).toHaveBeenCalledWith(
        "sync_folder_set",
        "success",
      );
    });

    it("ensurePermission returns true when already granted", async () => {
      const handle = createHandle("any");
      const ok = await service.ensurePermission(handle);
      expect(ok).toBe(true);
      expect(handle.queryPermission).toHaveBeenCalled();
      expect(handle.requestPermission).not.toHaveBeenCalled();
    });

    it("rejects a partial permission API even when its query reports granted", async () => {
      const handle = {
        name: "alreadyGranted",
        queryPermission: vi.fn().mockResolvedValue("granted"),
      };

      await expect(service.ensurePermission(handle)).resolves.toBe(false);
      expect(handle.queryPermission).not.toHaveBeenCalled();
    });

    describe("syncProject - Browser and Context Detection", () => {
      it("shows Firefox error for Firefox regardless of protocol", async () => {
        // Setup Firefox environment
        global.navigator = { userAgent: "Firefox/91.0" };
        global.window.location = { protocol: "https:", hostname: "localhost" };
        global.window.isSecureContext = true;

        const result = await service.syncProject("manual");

        expect(result).toEqual({
          success: false,
          error: "sync_not_supported_firefox",
        });
        expect(uiMock.showToast).toHaveBeenCalledWith(
          "sync_not_supported_firefox",
          "warning",
        );
      });

      it("shows secure context error for Chrome on HTTP", async () => {
        // Setup Chrome environment on HTTP
        global.navigator = { userAgent: "Chrome/91.0" };
        global.window.location = { protocol: "http:", hostname: "example.com" };
        global.window.isSecureContext = false;

        const result = await service.syncProject("manual");

        expect(result).toEqual({
          success: false,
          error: "sync_not_supported_secure_context",
        });
        expect(uiMock.showToast).toHaveBeenCalledWith(
          "sync_not_supported_secure_context",
          "warning",
        );
      });

      it("shows no sync folder selected for Chrome on HTTPS when no folder is set", async () => {
        // Setup Chrome environment on HTTPS
        global.navigator = { userAgent: "Chrome/91.0" };
        global.window.location = {
          protocol: "https:",
          hostname: "example.com",
        };
        global.window.isSecureContext = true;
        // Mock getDirectoryHandle to return null (no folder set)
        service.fs.getDirectoryHandle = vi.fn().mockResolvedValue(null);

        const result = await service.syncProject("manual");

        expect(result).toEqual({
          success: false,
          error: "no_sync_folder_selected",
        });
        expect(uiMock.showToast).toHaveBeenCalledWith(
          "no_sync_folder_selected",
          "warning",
        );
      });

      it("allows Chrome on HTTPS to proceed when folder is set", async () => {
        // Setup Chrome environment on HTTPS
        global.navigator = { userAgent: "Chrome/91.0" };
        global.window.location = {
          protocol: "https:",
          hostname: "example.com",
        };
        global.window.isSecureContext = true;
        const handle = createHandle("syncDir");
        service.fs.getDirectoryHandle = vi.fn().mockResolvedValue(handle);

        // Mock the export:sync-to-folder request to prevent errors
        service.invokeRequest = vi.fn().mockResolvedValue(undefined);

        const result = await service.syncProject("manual");

        expect(result).toEqual({ success: true });
        expect(service.invokeRequest).toHaveBeenCalledWith(
          "export:sync-to-folder",
          { dirHandle: handle },
          0,
        );
        expect(uiMock.showToast).toHaveBeenCalledWith(
          "project_synced_successfully",
          "success",
        );
      });

      it("returns a stable permission failure without exporting", async () => {
        global.navigator = { userAgent: "Chrome/91.0" };
        global.window.location = {
          protocol: "https:",
          hostname: "example.com",
        };
        global.window.isSecureContext = true;
        const handle = createHandle("syncDir");
        handle.queryPermission.mockResolvedValue("denied");
        handle.requestPermission.mockResolvedValue("denied");
        service.fs.getDirectoryHandle = vi.fn().mockResolvedValue(handle);
        service.invokeRequest = vi.fn();

        await expect(service.syncProject("manual")).resolves.toEqual({
          success: false,
          error: "permission_denied_to_folder",
        });
        expect(service.invokeRequest).not.toHaveBeenCalled();
        expect(uiMock.showToast).toHaveBeenCalledWith(
          "permission_denied_to_folder",
          "error",
        );
      });

      it("returns an export failure with diagnostic parameters", async () => {
        global.navigator = { userAgent: "Chrome/91.0" };
        global.window.location = {
          protocol: "https:",
          hostname: "example.com",
        };
        global.window.isSecureContext = true;
        const handle = createHandle("syncDir");
        service.fs.getDirectoryHandle = vi.fn().mockResolvedValue(handle);
        service.invokeRequest = vi
          .fn()
          .mockRejectedValue(new Error("disk full"));

        await expect(service.syncProject("manual")).resolves.toEqual({
          success: false,
          error: "failed_to_sync_project",
          params: { error: "disk full" },
        });
        expect(uiMock.showToast).toHaveBeenCalledWith(
          "failed_to_sync_project",
          "error",
        );
      });
    });

    describe("Import/Overwrite decision when setting sync folder (applied on save)", () => {
      beforeEach(() => {
        global.navigator = { userAgent: "Chrome/91.0" };
        global.window.location = {
          protocol: "https:",
          hostname: "example.com",
        };
        global.window.isSecureContext = true;
      });

      function createDirHandleWithProject(jsonContent) {
        return {
          kind: "directory",
          name: "syncDir",
          queryPermission: vi.fn().mockResolvedValue("granted"),
          requestPermission: vi.fn().mockResolvedValue("granted"),
          getDirectoryHandle: vi.fn(),
          getFileHandle: vi.fn().mockImplementation(async (name) => {
            if (name !== "project.json") throw new Error("Not found");
            return {
              kind: "file",
              name: "project.json",
              getFile: vi.fn().mockResolvedValue({
                size: new TextEncoder().encode(jsonContent).byteLength,
                text: vi.fn().mockResolvedValue(jsonContent),
              }),
            };
          }),
        };
      }

      it("imports when user confirms import", async () => {
        const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
        const project = {
          version: "x",
          type: "project",
          data: { profiles: {}, settings: {} },
        };
        const handle = createDirHandleWithProject(JSON.stringify(project));
        service.fs.getDirectoryHandle = vi.fn().mockResolvedValue(handle);
        directoryPickerMock.pick.mockResolvedValue(handle);
        confirmMock.mockResolvedValue(true);

        const request = service.invokeRequest;
        const req = vi
          .fn()
          .mockImplementation(async (topic, payload, timeout) => {
            if (topic === "ui:confirm") return request(topic, payload, timeout);
            if (topic === "project:restore-from-content")
              return createProjectRestoreSuccess();
            if (topic === "export:sync-to-folder")
              throw new Error("should not export when importing");
            return undefined;
          });
        service.invokeRequest = req;

        await expect(service.setSyncFolder(false)).resolves.toBe(handle);
        // Apply pending action on preferences save
        await fixture.eventBus.emit(
          "preferences:saved",
          { settings: {} },
          { synchronous: true },
        );
        await Promise.resolve();
        await new Promise((r) => setTimeout(r, 0));
        expect(logSpy).toHaveBeenCalledWith(
          "[SyncService] project restore outcome",
          "success",
        );
        logSpy.mockRestore();
      });

      it("overwrites when user declines import but confirms overwrite", async () => {
        const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
        const project = {
          version: "x",
          type: "project",
          data: { profiles: {}, settings: {} },
        };
        const handle = createDirHandleWithProject(JSON.stringify(project));
        service.fs.getDirectoryHandle = vi.fn().mockResolvedValue(handle);
        directoryPickerMock.pick.mockResolvedValue(handle);
        // First prompt (import?): decline; Second prompt (overwrite?): confirm
        confirmMock.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

        const request = service.invokeRequest;
        const req = vi
          .fn()
          .mockImplementation(async (topic, payload, timeout) => {
            if (topic === "ui:confirm") return request(topic, payload, timeout);
            if (topic === "project:restore-from-content")
              throw new Error("should not import when declined");
            if (topic === "export:sync-to-folder") return undefined;
            return undefined;
          });
        service.invokeRequest = req;

        await service.setSyncFolder(false);
        await fixture.eventBus.emit(
          "preferences:saved",
          { settings: {} },
          { synchronous: true },
        );
        await Promise.resolve();
        await new Promise((r) => setTimeout(r, 0));
        expect(logSpy).toHaveBeenCalledWith(
          "[SyncService] overwrite: export:sync-to-folder completed",
        );
        logSpy.mockRestore();
      });

      it("cancels when user declines both import and overwrite", async () => {
        const project = {
          version: "x",
          type: "project",
          data: { profiles: {}, settings: {} },
        };
        const handle = createDirHandleWithProject(JSON.stringify(project));
        service.fs.getDirectoryHandle = vi.fn().mockResolvedValue(handle);
        directoryPickerMock.pick.mockResolvedValue(handle);
        // First confirm: decline import; Second confirm: decline overwrite
        confirmMock.mockResolvedValueOnce(false).mockResolvedValueOnce(false);

        const request = service.invokeRequest;
        const req = vi
          .fn()
          .mockImplementation(async (topic, payload, timeout) => {
            if (topic === "ui:confirm") return request(topic, payload, timeout);
            if (topic === "project:restore-from-content")
              throw new Error("should not import when cancelled");
            if (topic === "export:sync-to-folder")
              throw new Error("should not export when cancelled");
            return undefined;
          });
        service.invokeRequest = req;

        await expect(service.setSyncFolder(false)).resolves.toBeNull();
        // Simulate preferences open/close without save
        await fixture.eventBus.emit(
          "modal:hidden",
          { modalId: "preferencesModal" },
          { synchronous: true },
        );

        expect(req).not.toHaveBeenCalledWith(
          "project:restore-from-content",
          expect.anything(),
        );
        expect(req).not.toHaveBeenCalledWith(
          "export:sync-to-folder",
          expect.anything(),
        );
        expect(uiMock.showToast).toHaveBeenCalledWith(
          "sync_operation_cancelled",
          "info",
        );
        expect(fsMock.saveDirectoryHandle).not.toHaveBeenCalled();
        expect(persistFolderSettings).not.toHaveBeenCalled();
      });
    });
  });
});
