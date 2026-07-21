import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ProjectManagementService from "../../../src/js/components/services/ProjectManagementService.js";
import { MAX_PROJECT_JSON_BYTES } from "../../../src/js/components/services/jsonDataBoundary.js";
import { createServiceFixture } from "../../fixtures/index.js";

/** @param {{ name: string, size: number, text: () => Promise<string> }} file */
function installSelectedFile(file) {
  const input = document.createElement("input");
  Object.defineProperty(input, "files", { value: [file] });
  input.click = vi.fn(() => {
    void input.onchange?.(new Event("change"));
  });
  vi.spyOn(document, "createElement").mockReturnValue(input);
  return input;
}

describe("ProjectManagementService restore UI and ownership", () => {
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

  it("shows one localized success toast for a direct file restore", async () => {
    const outcome = {
      success: true,
      currentProfile: "profile-42",
      imported: { profiles: 2, settings: true },
    };
    const restore = vi
      .spyOn(service, "restoreFromProjectContent")
      .mockResolvedValue(outcome);
    const input = document.createElement("input");
    Object.defineProperty(input, "files", {
      value: [
        {
          name: "backup.json",
          text: vi.fn().mockResolvedValue('{"fake":true}'),
        },
      ],
    });
    input.click = vi.fn(() => {
      void input.onchange?.(new Event("change"));
    });
    vi.spyOn(document, "createElement").mockReturnValue(input);

    await expect(service.restoreApplicationState()).resolves.toBe(outcome);

    expect(restore).toHaveBeenCalledWith('{"fake":true}', "backup.json");
    expect(service.ui.showToast).toHaveBeenCalledOnce();
    expect(service.ui.showToast).toHaveBeenCalledWith(
      "Application state restored successfully",
      "success",
    );
  });

  it("shows one localized failure toast for a direct file restore", async () => {
    const outcome = {
      success: false,
      error: "project_restore_reload_failed",
      params: { reason: "reload responder unavailable" },
      durable: true,
      currentProfile: "profile-42",
      imported: { profiles: 2, settings: true },
    };
    vi.spyOn(service, "restoreFromProjectContent").mockResolvedValue(outcome);
    const input = document.createElement("input");
    Object.defineProperty(input, "files", {
      value: [
        {
          name: "backup.json",
          text: vi.fn().mockResolvedValue('{"fake":true}'),
        },
      ],
    });
    input.click = vi.fn(() => {
      void input.onchange?.(new Event("change"));
    });
    vi.spyOn(document, "createElement").mockReturnValue(input);

    await expect(service.restoreApplicationState()).resolves.toBe(outcome);

    expect(service.ui.showToast).toHaveBeenCalledOnce();
    expect(service.ui.showToast).toHaveBeenCalledWith(
      "Failed to restore backup: reload responder unavailable",
      "error",
    );
  });

  it.each([
    [
      "success",
      {
        success: true,
        currentProfile: "profile-42",
        imported: { profiles: 2, settings: true },
      },
    ],
    [
      "durable failure",
      {
        success: false,
        error: "project_restore_reload_failed",
        params: { reason: "reload responder unavailable" },
        durable: true,
        currentProfile: "profile-42",
        imported: { profiles: 2, settings: true },
      },
    ],
  ])(
    "preserves a determined %s outcome when its direct notification throws",
    async (_label, outcome) => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      service.ui.showToast.mockImplementation(() => {
        throw new Error("toast transport failed");
      });
      const restore = vi
        .spyOn(service, "restoreFromProjectContent")
        .mockResolvedValue(outcome);
      installSelectedFile({
        name: "backup.json",
        size: 15,
        text: vi.fn().mockResolvedValue('{"fake":true}'),
      });

      await expect(service.restoreApplicationState()).resolves.toBe(outcome);

      expect(restore).toHaveBeenCalledOnce();
      expect(service.ui.showToast).toHaveBeenCalledOnce();
    },
  );

  it("settles a file-read failure even when its failure notification throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    service.ui.showToast.mockImplementation(() => {
      throw new Error("toast transport failed");
    });
    const text = vi.fn().mockRejectedValue(new Error("file read failed"));
    installSelectedFile({ name: "backup.json", size: 15, text });

    await expect(service.restoreApplicationState()).resolves.toEqual({
      success: false,
      error: "file read failed",
    });

    expect(text).toHaveBeenCalledOnce();
    expect(service.ui.showToast).toHaveBeenCalledOnce();
  });

  it("rejects an oversized project before reading or restoring it", async () => {
    const text = vi.fn().mockResolvedValue("must not be read");
    const restore = vi.spyOn(service, "restoreFromProjectContent");
    installSelectedFile({
      name: "oversized.json",
      size: MAX_PROJECT_JSON_BYTES + 1,
      text,
    });

    await expect(service.restoreApplicationState()).resolves.toEqual({
      success: false,
      error: "invalid_project_file",
      params: { path: "$" },
    });

    expect(text).not.toHaveBeenCalled();
    expect(restore).not.toHaveBeenCalled();
    expect(service.ui.showToast).toHaveBeenCalledWith(
      "Failed to restore backup: invalid_project_file",
      "error",
    );
  });

  it("interpolates a localized detail for a malformed direct restore result", () => {
    // @ts-expect-error Exercise an untyped response at the notification seam.
    service.notifyRestoreOutcome({ success: true });

    expect(service.ui.showToast).toHaveBeenCalledWith(
      "Failed to restore backup: Import failed: Failed to load profile data",
      "error",
    );
    expect(service.ui.showToast.mock.calls[0][0]).not.toContain("{{error}}");
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
