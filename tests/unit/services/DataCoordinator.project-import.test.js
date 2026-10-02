import LocalStorageVisitedStatePersistence from "../../../src/js/components/storage/LocalStorageVisitedStatePersistence.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import DataCoordinator from "../../../src/js/components/services/DataCoordinator.js";
import { createDefaultPreferencesSettings } from "../../../src/js/components/services/preferencesDefaults.js";
import { fingerprintWorkflowValue } from "../../../src/js/components/services/storageWorkflowReceipt.js";
import { createServiceFixture } from "../../fixtures/index.js";

const profile = (name, currentEnvironment = "space") => ({
  name,
  description: "",
  currentEnvironment,
  builds: {
    space: { keys: {}, aliases: {} },
    ground: { keys: {}, aliases: {} },
  },
  aliases: {},
  bindsets: {},
  keybindMetadata: {},
  aliasMetadata: {},
  bindsetMetadata: {},
  selections: {},
});

describe("DataCoordinator complete project import owner action", () => {
  let fixture;
  let coordinator;

  beforeEach(async () => {
    fixture = createServiceFixture();
    coordinator = new DataCoordinator({
      visitedState: new LocalStorageVisitedStatePersistence({
        storage: localStorage,
      }),
      eventBus: fixture.eventBus,
      projectRepository: fixture.projectRepository,
      i18n: { t: (key) => key },
      defaultProfiles: {},
    });
    coordinator.init();
    await coordinator.initialStateReady;
    fixture.projectRepository.load.mockClear();
    fixture.projectRepository.commit.mockClear();
    fixture.eventBusFixture.clearEventHistory();
  });

  afterEach(() => {
    coordinator?.destroy();
    fixture?.destroy();
    vi.restoreAllMocks();
  });

  it("rejects an unresolved current-profile reference before either durable stage", async () => {
    const persistImportedSettings = vi.fn();

    await expect(
      coordinator.replaceProjectFromImport(
        {
          profiles: { imported: profile("Imported") },
          currentProfile: "missing",
          settings: { theme: "light" },
        },
        { persistImportedSettings },
      ),
    ).resolves.toMatchObject({
      success: false,
      error: "invalid_project_file",
      params: { path: "$.data.currentProfile" },
      durable: false,
      receipt: {
        settings: { status: "skipped", committed: false },
        project: {
          status: "failed",
          committed: false,
          error: "invalid_data",
        },
      },
    });

    expect(persistImportedSettings).not.toHaveBeenCalled();
    expect(fixture.projectRepository.commit).not.toHaveBeenCalled();
  });

  it("rejects a complete-root candidate when the current durable root is corrupt", async () => {
    const destination = structuredClone(coordinator._projectRoot);
    coordinator._projectRoot = {
      ...destination,
      globalAliases: [],
    };

    await expect(
      coordinator.replaceProjectFromImport({
        profiles: { imported: profile("Imported") },
        currentProfile: "imported",
      }),
    ).resolves.toMatchObject({
      success: false,
      error: "invalid_project_file",
      params: { path: "$.data" },
      durable: false,
      receipt: {
        project: {
          status: "failed",
          committed: false,
          error: "invalid_data",
        },
        dataActivation: { status: "skipped", committed: false },
      },
    });

    expect(fixture.projectRepository.commit).not.toHaveBeenCalled();
  });

  it("persists settings once, replaces the complete root once, then publishes adopted owner state", async () => {
    const acceptedSettings = {
      ...createDefaultPreferencesSettings("en"),
      theme: "light",
      extensionSetting: { retained: true },
    };
    const persistImportedSettings = vi.fn(async () => ({
      status: "committed",
      value: acceptedSettings,
      write: { status: "acknowledged" },
      verification: { status: "verified" },
    }));

    const result = await coordinator.replaceProjectFromImport(
      {
        profiles: { imported: profile("Imported", "ground") },
        currentProfile: "imported",
        settings: { theme: "light" },
      },
      { persistImportedSettings },
    );

    expect(result).toMatchObject({
      success: true,
      currentProfile: "imported",
      importedProfiles: 1,
      receipt: {
        validation: { status: "complete", committed: true },
        settings: { status: "complete", committed: true },
        project: { status: "complete", committed: true },
        preferencesActivation: { status: "pending", committed: false },
        dataActivation: { status: "complete", committed: true },
      },
    });
    expect(persistImportedSettings).toHaveBeenCalledOnce();
    expect(fixture.projectRepository.commit).toHaveBeenCalledOnce();
    expect(fixture.projectRepository.commit).toHaveBeenCalledWith(
      expect.objectContaining({
        currentProfile: "imported",
        profiles: expect.objectContaining({
          default_space: expect.any(Object),
          imported: expect.objectContaining({ name: "Imported" }),
        }),
      }),
      { verification: "not_requested" },
    );
    expect(coordinator.getCurrentState()).toMatchObject({
      currentProfile: "imported",
      currentEnvironment: "ground",
      profiles: { imported: { name: "Imported" } },
    });
    expect(fixture.getEventHistory()).toContainEqual(
      expect.objectContaining({ event: "data:state-changed" }),
    );
  });

  it("retains an acknowledged settings stage when the one root write is indeterminate", async () => {
    const acceptedSettings = createDefaultPreferencesSettings("en");
    fixture.projectRepository.commit.mockReturnValueOnce({
      status: "write_failed",
      error: "storage_write_failed",
    });

    const result = await coordinator.replaceProjectFromImport(
      {
        profiles: { imported: profile("Imported") },
        currentProfile: "imported",
        settings: { theme: "light" },
      },
      {
        persistImportedSettings: async () => ({
          status: "committed",
          value: acceptedSettings,
          write: { status: "acknowledged" },
          verification: { status: "verified" },
        }),
      },
    );

    expect(result).toMatchObject({
      success: false,
      error: "storage_write_failed",
      stage: "project",
      durable: "indeterminate",
      receipt: {
        settings: { status: "complete", committed: true },
        project: {
          status: "failed",
          committed: "indeterminate",
          error: "storage_write_failed",
        },
        dataActivation: { status: "skipped", committed: false },
      },
    });
    expect(fixture.projectRepository.commit).toHaveBeenCalledOnce();
    expect(fixture.getEventHistory()).not.toContainEqual(
      expect.objectContaining({ event: "data:state-changed" }),
    );
  });

  it("verifies durability and retries only retained owner adoption", async () => {
    const project = {
      profiles: { imported: profile("Imported", "ground") },
      currentProfile: "imported",
    };
    const fingerprint = fingerprintWorkflowValue(project);
    fixture.projectRepository.load.mockReturnValue({
      status: "current",
      value: {
        ...structuredClone(coordinator._projectRoot),
        ...structuredClone(project),
      },
    });
    const writesBefore = fixture.projectRepository.commit.mock.calls.length;

    await expect(
      coordinator.activateProjectFromImport(project, { fingerprint }),
    ).resolves.toMatchObject({
      success: true,
      currentProfile: "imported",
      receipt: { status: "complete", fingerprint },
    });
    expect(fixture.projectRepository.load).toHaveBeenCalledOnce();
    expect(fixture.projectRepository.load).toHaveBeenCalledWith();
    expect(fixture.projectRepository.commit).toHaveBeenCalledTimes(
      writesBefore,
    );
    expect(coordinator.getCurrentState()).toMatchObject({
      currentProfile: "imported",
      currentEnvironment: "ground",
    });

    await expect(
      coordinator.activateProjectFromImport(project, {
        fingerprint: "fnv1a32:00000000:0",
      }),
    ).resolves.toMatchObject({
      success: false,
      error: "invalid_project_activation",
      retryable: true,
    });
    expect(fixture.projectRepository.load).toHaveBeenCalledOnce();
    expect(fixture.projectRepository.commit).toHaveBeenCalledTimes(
      writesBefore,
    );
  });

  it("refuses retained activation when current durability has changed", async () => {
    const project = {
      profiles: { imported: profile("Imported") },
      currentProfile: "imported",
    };
    const before = coordinator.getCurrentState();
    fixture.projectRepository.load.mockReturnValue({
      status: "current",
      value: {
        ...structuredClone(coordinator._projectRoot),
        profiles: { replacement: profile("Replacement") },
        currentProfile: "replacement",
        lastModified: "2026-09-26T00:00:00.000Z",
      },
    });

    await expect(
      coordinator.activateProjectFromImport(project, {
        fingerprint: fingerprintWorkflowValue(project),
      }),
    ).resolves.toMatchObject({
      success: false,
      error: "invalid_project_activation",
      retryable: true,
      receipt: { error: "verification_failed" },
    });
    expect(fixture.projectRepository.commit).not.toHaveBeenCalled();
    expect(coordinator.getCurrentState()).toBe(before);
  });

  it("rejects a non-record project before entering the owner mutation queue", async () => {
    await expect(
      coordinator.replaceProjectFromImport(["not", "a", "project"]),
    ).rejects.toThrow("invalid_project_file");

    expect(fixture.projectRepository.load).not.toHaveBeenCalled();
    expect(fixture.projectRepository.commit).not.toHaveBeenCalled();
  });

  it("reports an indeterminate settings stage when settings persistence throws", async () => {
    const persistImportedSettings = vi.fn(async () => {
      throw new Error("settings repository unavailable");
    });

    await expect(
      coordinator.replaceProjectFromImport(
        {
          profiles: { imported: profile("Imported") },
          currentProfile: "imported",
          settings: { theme: "light" },
        },
        { persistImportedSettings },
      ),
    ).resolves.toMatchObject({
      success: false,
      error: "storage_write_failed",
      stage: "settings",
      durable: "indeterminate",
      receipt: {
        settings: {
          status: "failed",
          committed: "indeterminate",
          error: "storage_write_failed",
        },
        project: { status: "skipped", committed: false },
        dataActivation: { status: "skipped", committed: false },
      },
    });

    expect(persistImportedSettings).toHaveBeenCalledOnce();
    expect(fixture.projectRepository.commit).not.toHaveBeenCalled();
  });

  it("rejects a committed settings receipt whose value is not canonical", async () => {
    const persistImportedSettings = vi.fn(async () => ({
      status: "committed",
      value: { theme: "light" },
      write: { status: "acknowledged" },
      verification: { status: "verified" },
    }));

    await expect(
      coordinator.replaceProjectFromImport(
        {
          profiles: { imported: profile("Imported") },
          currentProfile: "imported",
          settings: { theme: "light" },
        },
        { persistImportedSettings },
      ),
    ).resolves.toMatchObject({
      success: false,
      error: "storage_write_failed",
      stage: "settings",
      durable: "indeterminate",
      receipt: {
        settings: {
          status: "failed",
          committed: "indeterminate",
          error: "verification_failed",
        },
        project: { status: "skipped", committed: false },
        dataActivation: { status: "skipped", committed: false },
      },
    });

    expect(persistImportedSettings).toHaveBeenCalledOnce();
    expect(fixture.projectRepository.commit).not.toHaveBeenCalled();
  });

  it("reports an indeterminate project stage when the complete-root writer throws", async () => {
    fixture.projectRepository.commit.mockImplementationOnce(() => {
      throw new Error("project storage unavailable");
    });

    await expect(
      coordinator.replaceProjectFromImport({
        profiles: { imported: profile("Imported") },
        currentProfile: "imported",
      }),
    ).resolves.toMatchObject({
      success: false,
      error: "storage_write_failed",
      stage: "project",
      durable: "indeterminate",
      receipt: {
        settings: { status: "skipped", committed: false },
        project: {
          status: "failed",
          committed: "indeterminate",
          error: "storage_write_failed",
        },
        dataActivation: { status: "skipped", committed: false },
      },
    });

    expect(fixture.projectRepository.commit).toHaveBeenCalledOnce();
    expect(fixture.getEventHistory()).not.toContainEqual(
      expect.objectContaining({ event: "data:state-changed" }),
    );
  });

  it("returns a non-durable cancellation when its owner expires before the queued import", async () => {
    coordinator.destroy();

    await expect(
      coordinator.replaceProjectFromImport({
        profiles: { imported: profile("Imported") },
        currentProfile: "imported",
      }),
    ).resolves.toMatchObject({
      success: false,
      error: "operation_cancelled",
      stage: "project",
      durable: false,
      receipt: {
        project: {
          status: "failed",
          committed: false,
          error: "operation_cancelled",
        },
        dataActivation: { status: "skipped", committed: false },
      },
    });

    expect(fixture.projectRepository.commit).not.toHaveBeenCalled();
  });

  it("rejects malformed retained material and a retained activation queued after owner expiry", async () => {
    await expect(
      coordinator.activateProjectFromImport([], {
        fingerprint: fingerprintWorkflowValue({}),
      }),
    ).resolves.toMatchObject({
      success: false,
      error: "invalid_project_activation",
      retryable: true,
      receipt: { status: "failed", error: "invalid_data" },
    });

    const project = {
      profiles: { imported: profile("Imported") },
      currentProfile: "imported",
    };
    coordinator.destroy();

    await expect(
      coordinator.activateProjectFromImport(project, {
        fingerprint: fingerprintWorkflowValue(project),
      }),
    ).resolves.toMatchObject({
      success: false,
      error: "operation_cancelled",
      retryable: true,
      receipt: {
        status: "failed",
        committed: false,
        error: "operation_cancelled",
      },
    });
    expect(fixture.projectRepository.load).not.toHaveBeenCalled();
  });
});
