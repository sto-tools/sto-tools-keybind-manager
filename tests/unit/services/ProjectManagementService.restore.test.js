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
        t: (key) => {
          if (key === "backup_restored_successfully")
            return "Application state restored successfully";
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
            currentProfile: "profile-42",
            imported: { profiles: 2 },
          };
        }
        if (topic === "data:reload-state") {
          return { success: true };
        }
        if (topic === "data:switch-profile") {
          expect(payload).toEqual({ profileId: "profile-42" });
          return { success: true };
        }
        return { success: true };
      });
    const result = await service.restoreFromProjectContent(
      '{"fake":true}',
      "backup.json",
    );

    expect(requestMock).toHaveBeenCalledWith("import:project-file", {
      content: '{"fake":true}',
    });
    expect(requestMock).toHaveBeenCalledWith("data:reload-state");
    expect(requestMock).toHaveBeenCalledWith("data:switch-profile", {
      profileId: "profile-42",
    });
    expect(service.ui.showToast).toHaveBeenCalledWith(
      "Application state restored successfully",
      "success",
    );
    expect(result).toEqual({
      success: true,
      currentProfile: "profile-42",
      imported: { profiles: 2 },
    });
  });

  it("propagates import errors without emitting success side effects", async () => {
    const requestMock = vi
      .spyOn(service, "request")
      .mockImplementation(async (topic) => {
        if (topic === "import:project-file") {
          return {
            success: false,
            error: "project_invalid",
            params: { reason: "corrupt" },
          };
        }
        throw new Error(`Unexpected request for topic ${topic}`);
      });
    const result = await service.restoreFromProjectContent(
      "bad-data",
      "broken.json",
    );

    expect(result).toEqual({
      success: false,
      error: "project_invalid: corrupt",
    });
    expect(service.ui.showToast).not.toHaveBeenCalled();
    expect(requestMock).toHaveBeenCalledTimes(1);
  });

  it("owns project actions and restore RPC across init, teardown, reinit, and replacement", async () => {
    const expectOwnerCount = (expected) => {
      expect(fixture.eventBus.getListenerCount("project:save")).toBe(expected);
      expect(fixture.eventBus.getListenerCount("project:open")).toBe(expected);
      expect(
        fixture.eventBus.getListenerCount("rpc:project:restore-from-content"),
      ).toBe(expected);
    };
    const backup = vi
      .spyOn(service, "backupApplicationState")
      .mockResolvedValue({ success: true, filename: "backup.json" });
    const restore = vi
      .spyOn(service, "restoreApplicationState")
      .mockResolvedValue({ success: false, cancelled: true });

    service.init();
    expectOwnerCount(1);
    fixture.eventBus.emit("project:save");
    fixture.eventBus.emit("project:open");
    expect(backup).toHaveBeenCalledOnce();
    expect(restore).toHaveBeenCalledOnce();

    service.destroy();
    expectOwnerCount(0);
    fixture.eventBus.emit("project:save");
    fixture.eventBus.emit("project:open");
    expect(backup).toHaveBeenCalledOnce();
    expect(restore).toHaveBeenCalledOnce();

    service.init();
    expectOwnerCount(1);
    service.destroy();
    expectOwnerCount(0);

    const replacement = new ProjectManagementService({
      eventBus: fixture.eventBus,
      storage: fixture.storage,
      i18n: { t: (key) => key },
    });
    services.push(replacement);
    const replacementResult = {
      success: true,
      currentProfile: null,
      imported: { profiles: 0, settings: false },
    };
    const replacementRestore = vi
      .spyOn(replacement, "restoreFromProjectContent")
      .mockResolvedValue(replacementResult);

    expectOwnerCount(0);
    replacement.init();
    expectOwnerCount(1);
    await expect(
      replacement.request("project:restore-from-content", {
        content: "{}",
        fileName: "project.json",
      }),
    ).resolves.toEqual(replacementResult);
    expect(replacementRestore).toHaveBeenCalledWith("{}", "project.json");
  });
});
