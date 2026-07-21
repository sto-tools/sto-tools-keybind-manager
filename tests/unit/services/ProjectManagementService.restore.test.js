import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import ProjectManagementService from "../../../src/js/components/services/ProjectManagementService.js";
import { createServiceFixture } from "../../fixtures/index.js";

describe("ProjectManagementService.restoreFromProjectContent", () => {
  let fixture;
  let service;
  let services;

  beforeEach(() => {
    fixture = createServiceFixture();
    services = [];
    service = new ProjectManagementService({
      eventBus: fixture.eventBus,
      storage: fixture.storage,
      i18n: {
        t: (key, params = {}) => {
          if (key === "backup_restored_successfully")
            return "Application state restored successfully";
          if (key === "backup_restore_failed")
            return `Failed to restore backup: ${params.error}`;
          if (key === "storage_write_failed") return "Storage write failed";
          if (key === "failed_to_load_profile_data")
            return "Failed to load profile data";
          if (key === "import_failed") return `Import failed: ${params.error}`;
          return key;
        },
      },
    });
    services.push(service);
    service.ui = { showToast: vi.fn() };
    service.init();
  });

  afterEach(() => {
    services.forEach((candidate) => {
      if (!candidate.destroyed) candidate.destroy();
    });
    vi.restoreAllMocks();
    fixture.destroy();
  });

  it("delegates restore and returns the accepted import outcome", async () => {
    const requestMock = vi
      .spyOn(service, "request")
      .mockImplementation(async (topic, payload) => {
        if (topic === "import:project-file") {
          expect(payload).toEqual({ content: '{"fake":true}' });
          return {
            success: true,
            message: "project_imported_successfully",
            currentProfile: "profile-42",
            imported: { profiles: 2, settings: true },
          };
        }
        if (topic === "data:reload-state") {
          return {
            success: true,
            profiles: 2,
            currentProfile: "profile-42",
            environment: "space",
          };
        }
        return { success: true };
      });
    const result = await service.restoreFromProjectContent(
      '{"fake":true}',
      "backup.json",
    );

    expect(requestMock).toHaveBeenCalledWith(
      "import:project-file",
      { content: '{"fake":true}' },
      0,
    );
    expect(requestMock).toHaveBeenCalledWith("data:reload-state", undefined, 0);
    expect(requestMock).toHaveBeenCalledTimes(2);
    expect(service.ui.showToast).not.toHaveBeenCalled();
    expect(result).toEqual({
      success: true,
      currentProfile: "profile-42",
      imported: { profiles: 2, settings: true },
    });
  });

  it("preserves structured import failures without emitting side effects", async () => {
    const importFailure = {
      success: false,
      error: "storage_write_failed",
      params: { operation: "settings" },
      partial: true,
      committed: {
        profiles: ["profile-42"],
        settings: false,
        project: false,
      },
    };
    const requestMock = vi
      .spyOn(service, "request")
      .mockImplementation(async (topic) => {
        if (topic === "import:project-file") return importFailure;
        throw new Error(`Unexpected request for topic ${topic}`);
      });
    const result = await service.restoreFromProjectContent(
      "bad-data",
      "broken.json",
    );

    expect(result).toBe(importFailure);
    expect(service.ui.showToast).not.toHaveBeenCalled();
    expect(requestMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    [
      "committed writes hidden behind partial false",
      {
        success: false,
        error: "storage_write_failed",
        params: { operation: "project" },
        partial: false,
        committed: {
          profiles: ["profile-42"],
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
  ])(
    "closes an inconsistent storage receipt with indeterminate durability: %s",
    async (_label, importResult) => {
      const requestMock = vi
        .spyOn(service, "request")
        .mockResolvedValue(importResult);

      await expect(
        service.restoreFromProjectContent('{"fake":true}', "backup.json"),
      ).resolves.toEqual({
        success: false,
        error: "project_restore_import_failed",
        params: { reason: "Import failed: Failed to load profile data" },
        durable: "indeterminate",
      });
      expect(requestMock).toHaveBeenCalledOnce();
      expect(service.ui.showToast).not.toHaveBeenCalled();
    },
  );

  it("does not invoke hostile committed accessors before closing durability", async () => {
    const settingsGetter = vi.fn(() => {
      throw new Error("settings getter must not run");
    });
    const committed = { profiles: [], project: false };
    Object.defineProperty(committed, "settings", { get: settingsGetter });
    const requestMock = vi.spyOn(service, "request").mockResolvedValue({
      success: false,
      error: "storage_write_failed",
      params: { operation: "project" },
      partial: false,
      committed,
    });

    await expect(
      service.restoreFromProjectContent('{"fake":true}', "backup.json"),
    ).resolves.toEqual({
      success: false,
      error: "project_restore_import_failed",
      params: { reason: "Import failed: Failed to load profile data" },
      durable: "indeterminate",
    });
    expect(settingsGetter).not.toHaveBeenCalled();
    expect(requestMock).toHaveBeenCalledOnce();
  });

  it("keeps a pre-dispatch import request rejection safely non-durable", async () => {
    const requestMock = vi
      .spyOn(service, "request")
      .mockRejectedValue(new Error("import responder unavailable"));

    await expect(
      service.restoreFromProjectContent('{"fake":true}', "backup.json"),
    ).resolves.toEqual({
      success: false,
      error: "project_restore_import_failed",
      params: { reason: "import responder unavailable" },
      durable: false,
    });
    expect(requestMock).toHaveBeenCalledOnce();
    expect(service.ui.showToast).not.toHaveBeenCalled();
  });

  it.each([
    ["incomplete success", { success: true }],
    ["incomplete failure", { success: false }],
    [
      "prototype-derived success",
      Object.create({
        success: true,
        message: "project_imported_successfully",
        currentProfile: null,
        imported: { profiles: 0, settings: false },
      }),
    ],
  ])(
    "maps a malformed import %s to a durability-indeterminate failure",
    async (_label, result) => {
      const requestMock = vi
        .spyOn(service, "request")
        .mockResolvedValue(result);

      await expect(
        service.restoreFromProjectContent('{"fake":true}', "backup.json"),
      ).resolves.toEqual({
        success: false,
        error: "project_restore_import_failed",
        params: { reason: "Import failed: Failed to load profile data" },
        durable: "indeterminate",
      });
      expect(requestMock).toHaveBeenCalledOnce();
      expect(service.ui.showToast).not.toHaveBeenCalled();
    },
  );

  it("rejects non-string runtime content with the import boundary shape", async () => {
    const requestMock = vi.spyOn(service, "request");

    await expect(
      // @ts-expect-error Exercise the runtime boundary beneath the typed RPC.
      service.restoreFromProjectContent(undefined, "backup.json"),
    ).resolves.toEqual({
      success: false,
      error: "invalid_project_file",
      params: { path: "$" },
    });
    expect(requestMock).not.toHaveBeenCalled();
    expect(service.ui.showToast).not.toHaveBeenCalled();
  });

  it("safely rejects a malformed raw RPC payload before import", async () => {
    await expect(
      // @ts-expect-error Exercise an untyped EventBus caller at the raw boundary.
      service.request("project:restore-from-content", null),
    ).resolves.toEqual({
      success: false,
      error: "invalid_project_file",
      params: { path: "$" },
    });
    await expect(
      // @ts-expect-error Exercise a missing payload from an untyped caller.
      service.request("project:restore-from-content"),
    ).resolves.toEqual({
      success: false,
      error: "invalid_project_file",
      params: { path: "$" },
    });
  });

  it.each([
    ["null", null],
    ["number", 42],
    ["object", { unsafe: true }],
  ])(
    "rejects a raw %s fileName before invoking the restore path",
    async (_label, fileName) => {
      const restore = vi.spyOn(service, "restoreFromProjectContent");

      await expect(
        // @ts-expect-error Exercise an untyped EventBus caller at the raw boundary.
        service.request("project:restore-from-content", {
          content: '{"type":"project","data":{}}',
          fileName,
        }),
      ).resolves.toEqual({
        success: false,
        error: "invalid_project_file",
        params: { path: "$.fileName" },
      });
      expect(restore).not.toHaveBeenCalled();
      expect(service.ui.showToast).not.toHaveBeenCalled();
    },
  );

  it("keeps omitted and valid string file names on the restore path", async () => {
    const outcome = {
      success: true,
      currentProfile: null,
      imported: { profiles: 0, settings: false },
    };
    const restore = vi
      .spyOn(service, "restoreFromProjectContent")
      .mockResolvedValue(outcome);

    await expect(
      service.request("project:restore-from-content", { content: "{}" }),
    ).resolves.toBe(outcome);
    await expect(
      service.request("project:restore-from-content", {
        content: "{}",
        fileName: "backup.json",
      }),
    ).resolves.toBe(outcome);
    await expect(
      service.request("project:restore-from-content", {
        content: "{}",
        fileName: undefined,
      }),
    ).resolves.toBe(outcome);

    expect(restore.mock.calls).toEqual([
      ["{}", undefined],
      ["{}", "backup.json"],
      ["{}", undefined],
    ]);
  });

  it("reports a rejected reload as a durable activation failure", async () => {
    const requestMock = vi
      .spyOn(service, "request")
      .mockImplementation(async (topic) => {
        if (topic === "import:project-file") {
          return {
            success: true,
            message: "project_imported_successfully",
            currentProfile: "profile-42",
            imported: { profiles: 2, settings: true },
          };
        }
        if (topic === "data:reload-state") {
          return { success: false, error: "reload_validation_failed" };
        }
        throw new Error(`Unexpected request for topic ${topic}`);
      });

    await expect(
      service.restoreFromProjectContent('{"fake":true}', "backup.json"),
    ).resolves.toEqual({
      success: false,
      error: "project_restore_reload_failed",
      params: { reason: "reload_validation_failed" },
      durable: true,
      currentProfile: "profile-42",
      imported: { profiles: 2, settings: true },
    });
    expect(requestMock).toHaveBeenCalledTimes(2);
    expect(service.ui.showToast).not.toHaveBeenCalled();
  });

  it("maps a reload request rejection to the same durable failure", async () => {
    const requestMock = vi
      .spyOn(service, "request")
      .mockImplementation(async (topic) => {
        if (topic === "import:project-file") {
          return {
            success: true,
            message: "project_imported_successfully",
            currentProfile: null,
            imported: { profiles: 1, settings: false },
          };
        }
        if (topic === "data:reload-state") {
          throw new Error("reload responder unavailable");
        }
        throw new Error(`Unexpected request for topic ${topic}`);
      });

    await expect(
      service.restoreFromProjectContent('{"fake":true}', "backup.json"),
    ).resolves.toEqual({
      success: false,
      error: "project_restore_reload_failed",
      params: { reason: "reload responder unavailable" },
      durable: true,
      currentProfile: null,
      imported: { profiles: 1, settings: false },
    });
    expect(requestMock).toHaveBeenCalledTimes(2);
    expect(service.ui.showToast).not.toHaveBeenCalled();
  });

  it("does not expose the internal lifecycle-cancellation code as restore copy", async () => {
    const requestMock = vi
      .spyOn(service, "request")
      .mockImplementation(async (topic) => {
        if (topic === "import:project-file") {
          return {
            success: true,
            message: "project_imported_successfully",
            currentProfile: "profile-42",
            imported: { profiles: 1, settings: false },
          };
        }
        if (topic === "data:reload-state") {
          return { success: false, error: "operation_cancelled" };
        }
        throw new Error(`Unexpected request for topic ${topic}`);
      });

    await expect(
      service.restoreFromProjectContent('{"fake":true}', "backup.json"),
    ).resolves.toEqual({
      success: false,
      error: "project_restore_reload_failed",
      params: { reason: "Failed to load profile data" },
      durable: true,
      currentProfile: "profile-42",
      imported: { profiles: 1, settings: false },
    });
    expect(requestMock).toHaveBeenCalledTimes(2);
    expect(service.ui.showToast).not.toHaveBeenCalled();
  });

  it("localizes a rejected lifecycle cancellation before returning it", async () => {
    const requestMock = vi
      .spyOn(service, "request")
      .mockImplementation(async (topic) => {
        if (topic === "import:project-file") {
          return {
            success: true,
            message: "project_imported_successfully",
            currentProfile: "profile-42",
            imported: { profiles: 1, settings: false },
          };
        }
        if (topic === "data:reload-state") {
          throw new Error("operation_cancelled");
        }
        throw new Error(`Unexpected request for topic ${topic}`);
      });

    await expect(
      service.restoreFromProjectContent('{"fake":true}', "backup.json"),
    ).resolves.toEqual({
      success: false,
      error: "project_restore_reload_failed",
      params: { reason: "Failed to load profile data" },
      durable: true,
      currentProfile: "profile-42",
      imported: { profiles: 1, settings: false },
    });
    expect(requestMock).toHaveBeenCalledTimes(2);
    expect(service.ui.showToast).not.toHaveBeenCalled();
  });

  it.each([
    ["incomplete success", { success: true }],
    ["incomplete failure", { success: false }],
  ])(
    "maps a malformed reload %s to a durable activation failure",
    async (_label, reload) => {
      const requestMock = vi
        .spyOn(service, "request")
        .mockImplementation(async (topic) => {
          if (topic === "import:project-file") {
            return {
              success: true,
              message: "project_imported_successfully",
              currentProfile: "profile-42",
              imported: { profiles: 2, settings: true },
            };
          }
          if (topic === "data:reload-state") return reload;
          throw new Error(`Unexpected request for topic ${topic}`);
        });

      await expect(
        service.restoreFromProjectContent('{"fake":true}', "backup.json"),
      ).resolves.toEqual({
        success: false,
        error: "project_restore_reload_failed",
        params: { reason: "Failed to load profile data" },
        durable: true,
        currentProfile: "profile-42",
        imported: { profiles: 2, settings: true },
      });
      expect(requestMock).toHaveBeenCalledTimes(2);
      expect(service.ui.showToast).not.toHaveBeenCalled();
    },
  );
});
