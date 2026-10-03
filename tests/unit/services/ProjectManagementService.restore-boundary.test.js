import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ProjectManagementService from "../../../src/js/components/services/ProjectManagementService.js";
import {
  createCurrentArtifactSerializerFixture,
  createServiceFixture,
} from "../../fixtures/index.js";

const project = JSON.stringify({
  type: "project",
  data: { profiles: {}, currentProfile: null },
});
const settingsProject = JSON.stringify({
  type: "project",
  data: { profiles: {}, currentProfile: null, settings: { theme: "light" } },
});
const importSuccess = {
  success: true,
  message: "project_imported_successfully",
  currentProfile: null,
  imported: { profiles: 0, settings: false },
};

describe("ProjectManagementService restore RPC boundary", () => {
  let fixture;
  let service;
  let currentArtifactSerializer;
  let runPreferencesTransition;
  let importProject;

  beforeEach(() => {
    fixture = createServiceFixture();
    currentArtifactSerializer = createCurrentArtifactSerializerFixture();
    runPreferencesTransition = vi.fn((_source, operation) =>
      operation(
        vi.fn(),
        () => {},
        vi.fn(async (settings) => ({
          status: "committed",
          value: structuredClone(settings),
        })),
      ),
    );
    importProject = vi.fn(async () => importSuccess);
    service = new ProjectManagementService({
      eventBus: fixture.eventBus,
      currentArtifactSerializer,
      i18n: {
        t: (key, params = {}) =>
          key === "backup_restore_failed"
            ? `Failed to restore backup: ${params.error}`
            : key,
      },
      runPreferencesTransition,
      importProjectWithinPreferencesTransition: async (...args) => ({
        result: await importProject(...args),
        settlement: Promise.resolve(),
      }),
    });
    service.ui = { showToast: vi.fn() };
    service.init();
  });

  afterEach(() => {
    vi.useRealTimers();
    if (!service.destroyed) service.destroy();
    fixture.destroy();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("downloads only the injected fixed artifact without a storage or repository capability", async () => {
    let parts = [];
    vi.stubGlobal(
      "Blob",
      class CapturedBlob {
        constructor(nextParts) {
          parts = [...nextParts];
        }
      },
    );
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    await expect(service.backupApplicationState()).resolves.toEqual({
      success: true,
      filename: "STO_Tools_Backup_2026-07-18.json",
    });
    expect(parts.join("")).toBe(currentArtifactSerializer.calls[0].artifact);
    expect(service).not.toHaveProperty("storage");
    expect(service).not.toHaveProperty("projectRepository");
    expect(service).not.toHaveProperty("settingsRepository");
  });

  it("validates and detaches a settings-free artifact without acquiring Preferences", async () => {
    await expect(
      service.restoreFromProjectContent(project, "backup.json"),
    ).resolves.toEqual({
      success: true,
      currentProfile: null,
      imported: { profiles: 0, settings: false },
    });
    expect(runPreferencesTransition).not.toHaveBeenCalled();
    expect(importProject).toHaveBeenCalledOnce();
    expect(importProject.mock.calls[0][0]).toMatchObject({
      success: true,
      data: { profiles: {}, currentProfile: null },
    });
  });

  it("rejects an invalid artifact before acquiring either owner transition", async () => {
    await expect(
      service.restoreFromProjectContent("{}", "backup.json"),
    ).resolves.toEqual({
      success: false,
      error: "invalid_project_file",
      params: { path: "$.type" },
    });
    expect(runPreferencesTransition).not.toHaveBeenCalled();
    expect(importProject).not.toHaveBeenCalled();
  });

  it("fails closed before import dispatch when the Preferences transition is unavailable", async () => {
    service.runPreferencesTransition = null;
    await expect(
      service.restoreFromProjectContent(settingsProject),
    ).resolves.toEqual({
      success: false,
      error: "project_restore_import_failed",
      params: { reason: "preferences_transition_unavailable" },
      durable: false,
    });
    expect(importProject).not.toHaveBeenCalled();
  });

  it("waits for the direct owner acknowledgement without a transport timeout", async () => {
    vi.useFakeTimers();
    let releaseImport;
    importProject.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseImport = () => resolve(importSuccess);
        }),
    );
    const restore = service.restoreFromProjectContent(settingsProject);
    const settled = vi.fn();
    void restore.then(settled);

    await vi.advanceTimersByTimeAsync(5_001);
    expect(settled).not.toHaveBeenCalled();
    releaseImport();
    await expect(restore).resolves.toMatchObject({ success: true });
    expect(importProject).toHaveBeenCalledOnce();
  });

  it("reports indeterminate durability when destroyed after owner dispatch", async () => {
    let releaseImport;
    importProject.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseImport = () => resolve(importSuccess);
        }),
    );
    const restore = service.restoreFromProjectContent(project);
    await vi.waitFor(() => expect(importProject).toHaveBeenCalledOnce());
    service.destroy();
    releaseImport();
    await expect(restore).resolves.toEqual({
      success: false,
      error: "project_restore_import_failed",
      params: { reason: "operation_cancelled" },
      durable: "indeterminate",
    });
  });

  it("reports no durable write when destroyed before queued dispatch", async () => {
    let releaseTransition;
    const blocked = new Promise((resolve) => {
      releaseTransition = resolve;
    });
    service.runPreferencesTransition = async (_source, operation) => {
      await blocked;
      return operation(vi.fn(), () => {}, vi.fn());
    };
    const restore = service.restoreFromProjectContent(settingsProject);
    await Promise.resolve();
    service.destroy();
    releaseTransition();
    await expect(restore).resolves.toEqual({
      success: false,
      error: "project_restore_import_failed",
      params: { reason: "operation_cancelled" },
      durable: false,
    });
    expect(importProject).not.toHaveBeenCalled();
  });

  it("closes an owner action rejection as durability-indeterminate", async () => {
    importProject.mockRejectedValueOnce(new Error("owner action failed"));
    await expect(service.restoreFromProjectContent(project)).resolves.toEqual({
      success: false,
      error: "project_restore_import_failed",
      params: { reason: "owner action failed" },
      durable: "indeterminate",
    });
  });

  it("rejects inherited, accessor, array, and trapping request content without invoking user code", async () => {
    const inherited = Object.create({ content: project });
    const contentGetter = vi.fn(() => project);
    const accessor = {};
    Object.defineProperty(accessor, "content", { get: contentGetter });
    const trapping = new Proxy(
      { content: project },
      {
        getPrototypeOf() {
          throw new Error("prototype trap");
        },
      },
    );
    const decoratedArray = Object.assign([], { content: project });

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

  it("accepts null-prototype requests and rejects unsafe file names", async () => {
    const restore = vi
      .spyOn(service, "restoreFromProjectContent")
      .mockResolvedValue(importSuccess);
    const nullPrototype = Object.assign(Object.create(null), {
      content: project,
    });
    const inheritedFileName = Object.assign(
      Object.create({ fileName: "inherited.json" }),
      { content: project },
    );
    const fileNameGetter = vi.fn(() => "accessor.json");
    const accessor = { content: project };
    Object.defineProperty(accessor, "fileName", { get: fileNameGetter });

    await expect(
      service.request("project:restore-from-content", nullPrototype),
    ).resolves.toBe(importSuccess);
    await expect(
      service.request("project:restore-from-content", inheritedFileName),
    ).resolves.toMatchObject({ success: false, params: { path: "$" } });
    await expect(
      // @ts-expect-error Exercise an accessor-bearing untyped request.
      service.request("project:restore-from-content", accessor),
    ).resolves.toMatchObject({
      success: false,
      params: { path: "$.fileName" },
    });
    expect(restore).toHaveBeenCalledWith(project, undefined);
    expect(fileNameGetter).not.toHaveBeenCalled();
  });

  it("validates the no-payload activation retry before reading retained state", async () => {
    const getter = vi.fn(() => true);
    const payload = Object.defineProperty({}, "unexpected", { get: getter });
    const retry = vi.spyOn(service, "retryRestoreActivation");

    await expect(
      // @ts-expect-error Exercise an exotic payload at the no-payload boundary.
      service.request("project:retry-restore-activation", payload),
    ).resolves.toEqual({
      success: false,
      error: "project_restore_import_failed",
      params: { reason: "invalid_mutation_request" },
      durable: false,
    });
    expect(getter).not.toHaveBeenCalled();
    expect(retry).not.toHaveBeenCalled();
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
