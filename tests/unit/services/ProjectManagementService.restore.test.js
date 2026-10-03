import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ImportService from "../../../src/js/components/services/ImportService.js";
import ProjectManagementService from "../../../src/js/components/services/ProjectManagementService.js";
import { createEventBusFixture } from "../../fixtures/core/index.js";
import { createProjectImportOwnerCompletionAction } from "../../fixtures/services/importProjectOwner.js";

const projectText = (settings = true) =>
  JSON.stringify({
    type: "project",
    data: {
      profiles: { imported: { name: "Imported" } },
      currentProfile: "imported",
      ...(settings ? { settings: { theme: "light" } } : {}),
    },
  });

const complete = (fingerprint) => ({
  status: "complete",
  committed: true,
  fingerprint,
});
const skipped = { status: "skipped", committed: false };

function ownerSuccess(data, settingsValue) {
  return {
    success: true,
    currentProfile: data.currentProfile ?? null,
    importedProfiles: Object.keys(data.profiles || {}).length,
    receipt: {
      validation: complete("validation"),
      settings: settingsValue ? complete("settings-fingerprint") : skipped,
      project: complete("project-fingerprint"),
      preferencesActivation: settingsValue
        ? { status: "pending", committed: false }
        : skipped,
      dataActivation: complete("project-fingerprint"),
    },
    activationMaterial: {
      project: {
        profiles: structuredClone(data.profiles || {}),
        currentProfile: data.currentProfile ?? null,
      },
      ...(settingsValue ? { settings: structuredClone(settingsValue) } : {}),
    },
  };
}

function ownerDataPending(data, settingsValue) {
  return {
    success: false,
    error: "operation_cancelled",
    stage: "dataActivation",
    durable: true,
    receipt: {
      validation: complete("validation"),
      settings: settingsValue ? complete("settings-fingerprint") : skipped,
      project: complete("project-fingerprint"),
      preferencesActivation: settingsValue
        ? { status: "pending", committed: false }
        : skipped,
      dataActivation: {
        status: "failed",
        committed: false,
        fingerprint: "project-fingerprint",
        error: "operation_cancelled",
      },
    },
    activationMaterial: {
      project: {
        profiles: structuredClone(data.profiles || {}),
        currentProfile: data.currentProfile ?? null,
      },
      ...(settingsValue ? { settings: structuredClone(settingsValue) } : {}),
    },
  };
}

describe("ProjectManagementService restore owner workflow", () => {
  let bus;
  let importer;
  let manager;
  let replaceProjectFromImport;
  let activatePersistedSettings;
  let activateProjectFromImport;
  let activateImportedSettings;
  let runPreferencesTransition;

  beforeEach(() => {
    bus = createEventBusFixture();
    activatePersistedSettings = vi.fn(async () => ({
      success: true,
      changed: true,
      revision: 2,
      effects: "applied",
    }));
    activateProjectFromImport = vi.fn(async () => ({
      success: true,
      currentProfile: "imported",
      receipt: complete("project-fingerprint"),
    }));
    activateImportedSettings = vi.fn(async () => ({
      success: true,
      changed: true,
      revision: 3,
      effects: "applied",
    }));
    replaceProjectFromImport = vi.fn(async (data, options = {}) => {
      const settingsResult = data.settings
        ? await options.persistImportedSettings?.(data.settings)
        : null;
      return ownerSuccess(data, settingsResult?.value);
    });
    runPreferencesTransition = vi.fn((_source, operation) =>
      operation(
        activatePersistedSettings,
        () => {},
        async (settings) => ({
          status: "committed",
          value: structuredClone(settings),
          write: { status: "acknowledged" },
          verification: { status: "verified" },
        }),
      ),
    );
    importer = new ImportService({
      eventBus: bus.eventBus,
      replaceProjectFromImport,
      replaceProjectFromImportWithSettlement:
        createProjectImportOwnerCompletionAction(replaceProjectFromImport),
      runPreferencesTransition,
    });
    manager = new ProjectManagementService({
      eventBus: bus.eventBus,
      i18n: { t: (key) => key },
      runPreferencesTransition,
      importProjectWithinPreferencesTransition:
        importer.importProjectWithinPreferencesTransition.bind(importer),
      activateProjectFromImport,
      activateImportedSettings,
    });
    manager.init();
  });

  afterEach(() => {
    manager.destroy();
    bus.destroy();
    vi.restoreAllMocks();
  });

  it("validates once, performs one complete-root owner action, and activates staged settings", async () => {
    const request = vi.spyOn(manager, "request");

    await expect(
      manager.restoreFromProjectContent(projectText(), "backup.json"),
    ).resolves.toEqual({
      success: true,
      currentProfile: "imported",
      imported: { profiles: 1, settings: true },
    });

    expect(runPreferencesTransition).toHaveBeenCalledOnce();
    expect(replaceProjectFromImport).toHaveBeenCalledOnce();
    expect(activatePersistedSettings).toHaveBeenCalledOnce();
    expect(request).not.toHaveBeenCalledWith(
      "data:reload-state",
      expect.anything(),
      expect.anything(),
    );
    expect(manager).not.toHaveProperty("storage");
  });

  it("rejects a malformed artifact before acquiring the Preferences transition", async () => {
    await expect(
      manager.restoreFromProjectContent('{"fake":true}', "backup.json"),
    ).resolves.toEqual({
      success: false,
      error: "invalid_project_file",
      params: { path: "$.type" },
    });
    expect(runPreferencesTransition).not.toHaveBeenCalled();
    expect(replaceProjectFromImport).not.toHaveBeenCalled();
  });

  it("preserves a structured complete-root write failure without activation", async () => {
    replaceProjectFromImport.mockResolvedValueOnce({
      success: false,
      error: "storage_write_failed",
      stage: "project",
      durable: "indeterminate",
      receipt: {
        settings: complete("settings-fingerprint"),
      },
    });

    await expect(
      manager.restoreFromProjectContent(projectText(), "backup.json"),
    ).resolves.toEqual({
      success: false,
      error: "storage_write_failed",
      params: { operation: "project" },
      partial: true,
      committed: { profiles: [], settings: true, project: false },
    });
    expect(activatePersistedSettings).not.toHaveBeenCalled();
  });

  it("retains root-complete material and retries only Data then Preferences activation", async () => {
    replaceProjectFromImport.mockImplementationOnce(async (data, options) => {
      const settings = await options.persistImportedSettings(data.settings);
      return ownerDataPending(data, settings.value);
    });

    await expect(
      manager.restoreFromProjectContent(projectText(), "backup.json"),
    ).resolves.toEqual({
      success: false,
      error: "project_restore_reload_failed",
      params: { reason: "failed_to_load_profile_data" },
      durable: true,
      currentProfile: "imported",
      imported: { profiles: 1, settings: true },
      activation: { data: "pending", preferences: "pending" },
    });

    await expect(manager.retryRestoreActivation()).resolves.toEqual({
      success: true,
      currentProfile: "imported",
      imported: { profiles: 1, settings: true },
    });
    expect(activateProjectFromImport).toHaveBeenCalledWith(
      expect.objectContaining({ currentProfile: "imported" }),
      { fingerprint: "project-fingerprint" },
    );
    expect(activateImportedSettings).toHaveBeenCalledWith(
      expect.objectContaining({ theme: "light" }),
      "settings-fingerprint",
    );
    expect(replaceProjectFromImport).toHaveBeenCalledOnce();
  });

  it("retries only retained Preferences activation after Data already completed", async () => {
    activatePersistedSettings.mockResolvedValueOnce({
      success: false,
      error: "preferences_activation_failed",
      params: { reason: "effects unavailable" },
      retryable: true,
    });

    await expect(
      manager.restoreFromProjectContent(projectText(), "backup.json"),
    ).resolves.toMatchObject({
      success: false,
      error: "project_restore_reload_failed",
      activation: { data: "complete", preferences: "pending" },
    });
    await expect(manager.retryRestoreActivation()).resolves.toMatchObject({
      success: true,
      currentProfile: "imported",
    });
    expect(activateProjectFromImport).not.toHaveBeenCalled();
    expect(activateImportedSettings).toHaveBeenCalledOnce();
    expect(replaceProjectFromImport).toHaveBeenCalledOnce();
  });

  it("retains pending activation when the durable project fingerprint mismatches", async () => {
    replaceProjectFromImport.mockImplementationOnce(async (data) =>
      ownerDataPending(data, null),
    );
    activateProjectFromImport
      .mockResolvedValueOnce({
        success: false,
        error: "invalid_project_activation",
        retryable: true,
        receipt: {
          status: "failed",
          committed: false,
          error: "invalid_project_activation",
        },
      })
      .mockResolvedValueOnce({
        success: true,
        currentProfile: "imported",
        receipt: complete("project-fingerprint"),
      });

    await manager.restoreFromProjectContent(projectText(false));
    await expect(manager.retryRestoreActivation()).resolves.toMatchObject({
      success: false,
      params: { reason: "invalid_project_activation" },
      activation: { data: "pending", preferences: "not-required" },
    });
    await expect(manager.retryRestoreActivation()).resolves.toMatchObject({
      success: true,
    });
    expect(replaceProjectFromImport).toHaveBeenCalledOnce();
    expect(activateProjectFromImport).toHaveBeenCalledTimes(2);
  });

  it("rejects a new restore while an old activation retry is in flight", async () => {
    replaceProjectFromImport.mockImplementationOnce(async (data) =>
      ownerDataPending(data, null),
    );
    await manager.restoreFromProjectContent(projectText(false));

    let release;
    activateProjectFromImport.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () =>
            resolve({
              success: true,
              currentProfile: "imported",
              receipt: complete("project-fingerprint"),
            });
        }),
    );
    const retry = manager.retryRestoreActivation();
    await Promise.resolve();

    await expect(
      manager.restoreFromProjectContent(projectText(false), "new.json"),
    ).resolves.toEqual({
      success: false,
      error: "project_restore_import_failed",
      params: { reason: "project_restore_activation_in_progress" },
      durable: false,
    });
    expect(replaceProjectFromImport).toHaveBeenCalledOnce();
    release();
    await expect(retry).resolves.toMatchObject({ success: true });
  });

  it("fails safely when retry is requested without retained activation material", async () => {
    await expect(manager.retryRestoreActivation()).resolves.toEqual({
      success: false,
      error: "project_restore_import_failed",
      params: { reason: "project_restore_activation_unavailable" },
      durable: false,
    });
    expect(activateProjectFromImport).not.toHaveBeenCalled();
    expect(activateImportedSettings).not.toHaveBeenCalled();
  });

  it("fails closed if a settings-free restore is asked to activate preferences", async () => {
    const restoreWithinTransition = vi
      .spyOn(manager, "_restoreWithinPreferencesTransition")
      .mockImplementation(async (_prepared, activatePersistedSettings) => {
        await activatePersistedSettings();
        throw new Error("unreachable");
      });

    await expect(
      manager.restoreFromProjectContent(projectText(false)),
    ).resolves.toEqual({
      success: false,
      error: "project_restore_import_failed",
      params: { reason: "preferences_activation_not_required" },
      durable: false,
    });

    expect(restoreWithinTransition).toHaveBeenCalledOnce();
    expect(runPreferencesTransition).not.toHaveBeenCalled();
    expect(replaceProjectFromImport).not.toHaveBeenCalled();
  });

  it("releases the activation retry mutex when an unexpected retry rejects", async () => {
    const retryActivation = vi
      .spyOn(manager, "_retryRestoreActivation")
      .mockRejectedValueOnce(new Error("activation transport unavailable"))
      .mockResolvedValueOnce({
        success: false,
        error: "project_restore_import_failed",
        params: { reason: "project_restore_activation_unavailable" },
        durable: false,
      });

    await expect(manager.retryRestoreActivation()).rejects.toThrow(
      "activation transport unavailable",
    );
    expect(manager._restoreActivationRetry).toBeNull();

    await expect(manager.retryRestoreActivation()).resolves.toMatchObject({
      success: false,
      params: { reason: "project_restore_activation_unavailable" },
    });
    expect(retryActivation).toHaveBeenCalledTimes(2);
  });
});
