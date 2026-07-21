import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ProjectManagementService from "../../../src/js/components/services/ProjectManagementService.js";
import { respond } from "../../../src/js/core/requestResponse.js";
import { createServiceFixture } from "../../fixtures/index.js";

describe("ProjectManagementService restore RPC boundary", () => {
  let fixture;
  let service;

  beforeEach(() => {
    fixture = createServiceFixture();
    service = new ProjectManagementService({
      eventBus: fixture.eventBus,
      i18n: {
        t: (key, params = {}) =>
          key === "backup_restore_failed"
            ? `Failed to restore backup: ${params.error}`
            : key,
      },
    });
    service.ui = { showToast: vi.fn() };
    service.init();
  });

  afterEach(() => {
    vi.useRealTimers();
    if (!service.destroyed) service.destroy();
    fixture.destroy();
    vi.restoreAllMocks();
  });

  it("waits for durable import acknowledgement beyond the default transport timeout", async () => {
    vi.useFakeTimers();
    let releaseImport = () => {};
    const importResult = new Promise((resolve) => {
      releaseImport = () =>
        resolve({
          success: true,
          message: "project_imported_successfully",
          currentProfile: "profile-42",
          imported: { profiles: 1, settings: true },
        });
    });
    const importHandler = vi.fn(() => importResult);
    const detachImport = respond(
      fixture.eventBus,
      "import:project-file",
      importHandler,
    );
    const detachReload = respond(fixture.eventBus, "data:reload-state", () => ({
      success: true,
      profiles: 1,
      currentProfile: "profile-42",
      environment: "space",
    }));

    const restore = service.restoreFromProjectContent("{}", "backup.json");
    const settled = vi.fn();
    void restore.then(settled);

    await vi.advanceTimersByTimeAsync(5_001);

    expect(settled).not.toHaveBeenCalled();
    expect(importHandler).toHaveBeenCalledOnce();

    releaseImport();
    await expect(restore).resolves.toEqual({
      success: true,
      currentProfile: "profile-42",
      imported: { profiles: 1, settings: true },
    });
    expect(importHandler).toHaveBeenCalledOnce();

    detachReload();
    detachImport();
  });

  it("closes a registered import responder rejection as durability-indeterminate", async () => {
    const detachImport = respond(
      fixture.eventBus,
      "import:project-file",
      () => {
        throw new Error("import handler failed after dispatch");
      },
    );

    await expect(
      service.restoreFromProjectContent('{"fake":true}', "backup.json"),
    ).resolves.toEqual({
      success: false,
      error: "project_restore_import_failed",
      params: { reason: "import handler failed after dispatch" },
      durable: "indeterminate",
    });
    expect(service.ui.showToast).not.toHaveBeenCalled();

    detachImport();
  });

  it("uses a detached import receipt without invoking proxy data reads", async () => {
    const importedTarget = { profiles: 2, settings: true };
    const importedGet = vi.fn(() => {
      throw new Error("imported get trap must not run");
    });
    const resultGet = vi.fn((_target, property) => {
      if (property === "then") return undefined;
      throw new Error("result data get trap must not run");
    });
    const importedProxy = new Proxy(importedTarget, { get: importedGet });
    const resultProxy = new Proxy(
      {
        success: true,
        message: "project_imported_successfully",
        currentProfile: "profile-42",
        imported: importedProxy,
      },
      { get: resultGet },
    );
    const requestMock = vi
      .spyOn(service, "request")
      .mockImplementation(async (topic) => {
        if (topic === "import:project-file") return resultProxy;
        if (topic === "data:reload-state") {
          importedTarget.profiles = 99;
          return {
            success: true,
            profiles: 2,
            currentProfile: "profile-42",
            environment: "space",
          };
        }
        throw new Error(`Unexpected request for topic ${topic}`);
      });

    await expect(
      service.restoreFromProjectContent('{"fake":true}', "backup.json"),
    ).resolves.toEqual({
      success: true,
      currentProfile: "profile-42",
      imported: { profiles: 2, settings: true },
    });

    expect(requestMock).toHaveBeenCalledTimes(2);
    expect(resultGet).toHaveBeenCalledOnce();
    expect(resultGet).toHaveBeenCalledWith(
      expect.anything(),
      "then",
      expect.anything(),
    );
    expect(importedGet).not.toHaveBeenCalled();
  });

  it("rejects inherited, accessor, array, and trapping content without invoking user code", async () => {
    const inherited = Object.create({ content: "{}" });
    const contentGetter = vi.fn(() => {
      throw new Error("content getter must not run");
    });
    const accessor = {};
    Object.defineProperty(accessor, "content", { get: contentGetter });
    const trapping = new Proxy(
      { content: "{}" },
      {
        getPrototypeOf() {
          throw new Error("prototype trap");
        },
      },
    );
    const decoratedArray = Object.assign([], { content: "{}" });

    for (const payload of [inherited, accessor, trapping, decoratedArray]) {
      await expect(
        // @ts-expect-error Exercise hostile untyped callers at the raw boundary.
        service.request("project:restore-from-content", payload),
      ).resolves.toEqual({
        success: false,
        error: "invalid_project_file",
        params: { path: "$" },
      });
    }
    expect(contentGetter).not.toHaveBeenCalled();
  });

  it("accepts null-prototype data and rejects inherited or accessor-bearing envelopes", async () => {
    const outcome = {
      success: true,
      currentProfile: null,
      imported: { profiles: 0, settings: false },
    };
    const restore = vi
      .spyOn(service, "restoreFromProjectContent")
      .mockResolvedValue(outcome);
    const nullPrototype = Object.assign(Object.create(null), {
      content: "null-prototype",
    });
    const inheritedFileName = Object.assign(
      Object.create({ fileName: "inherited.json" }),
      { content: "inherited-file-name" },
    );
    const fileNameGetter = vi.fn(() => {
      throw new Error("fileName getter must not run");
    });
    const accessor = { content: "accessor-file-name" };
    Object.defineProperty(accessor, "fileName", { get: fileNameGetter });

    await expect(
      service.request("project:restore-from-content", nullPrototype),
    ).resolves.toBe(outcome);
    await expect(
      service.request("project:restore-from-content", inheritedFileName),
    ).resolves.toEqual({
      success: false,
      error: "invalid_project_file",
      params: { path: "$" },
    });
    await expect(
      // @ts-expect-error Exercise an accessor-bearing untyped request.
      service.request("project:restore-from-content", accessor),
    ).resolves.toEqual({
      success: false,
      error: "invalid_project_file",
      params: { path: "$.fileName" },
    });

    expect(restore).toHaveBeenCalledOnce();
    expect(restore).toHaveBeenCalledWith("null-prototype", undefined);
    expect(fileNameGetter).not.toHaveBeenCalled();
  });

  it("does not let undeclared failure reason data bypass localization", () => {
    service.notifyRestoreOutcome({
      success: false,
      error: "invalid_project_file",
      // @ts-expect-error Exercise an untyped producer with an undeclared field.
      params: { path: "$", reason: "untranslated override" },
    });

    expect(service.ui.showToast).toHaveBeenCalledWith(
      "Failed to restore backup: invalid_project_file",
      "error",
    );
  });
});
