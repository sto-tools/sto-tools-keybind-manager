import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DataCoordinator from "../../src/js/components/services/DataCoordinator.js";
import PreferencesService from "../../src/js/components/services/PreferencesService.js";
import ImportService from "../../src/js/components/services/ImportService.js";
import ProjectManagementService from "../../src/js/components/services/ProjectManagementService.js";
import FileSystemService from "../../src/js/components/services/FileSystemService.js";
import LocalStorageProjectRepository from "../../src/js/components/storage/LocalStorageProjectRepository.js";
import LocalStorageSettingsRepository from "../../src/js/components/storage/LocalStorageSettingsRepository.js";
import LocalStorageCommandPresentationPersistence from "../../src/js/components/storage/LocalStorageCommandPresentationPersistence.js";
import LocalStorageKeyBrowserPersistence from "../../src/js/components/storage/LocalStorageKeyBrowserPersistence.js";
import LocalStorageVisitedStatePersistence from "../../src/js/components/storage/LocalStorageVisitedStatePersistence.js";
import LocalStorageDevelopmentFlagPersistence from "../../src/js/components/storage/LocalStorageDevelopmentFlagPersistence.js";
import { createStorageRuntimeDiagnostics } from "../../src/js/components/storage/storageRuntimeDiagnostics.js";
import {
  STORAGE_DIAGNOSTIC_REGISTRATIONS,
  materializeStorageDiagnosticSnapshot,
} from "../../src/js/components/storage/storageDiagnosticSnapshot.js";
import { runStorageSchemaMigration } from "../../src/js/components/storage/storageSchemaMigration.js";
import { createDefaultPreferencesSettings } from "../../src/js/components/services/preferencesDefaults.js";
import { createRealEventBusFixture } from "../fixtures/core/eventBus.js";

const ROOT = "sto_keybind_manager";
const SETTINGS = "sto_keybind_settings";
const BACKUP = "sto_keybind_manager_backup";
const NOW = "2026-10-03T00:00:00.000Z";
const PRIVATE = "private-profile-command-settings-content";
const root = () => ({
  version: "1.0.0",
  currentProfile: "captain",
  profiles: {
    captain: {
      name: PRIVATE,
      currentEnvironment: "space",
      migrationVersion: "2.1.1",
      builds: { space: { keys: { F1: [PRIVATE] } }, ground: { keys: {} } },
      aliases: {},
      bindsets: {},
      extension: { secret: PRIVATE },
    },
  },
  globalAliases: {},
  extension: { secret: PRIVATE },
});
let cleanup;

beforeEach(() => {
  cleanup = [];
  for (const method of ["log", "debug", "info", "warn", "error"])
    vi.spyOn(console, method).mockImplementation(() => {});
});
afterEach(async () => {
  for (const close of cleanup.reverse()) await close();
  vi.restoreAllMocks();
});

function fixture(
  entries = [
    [ROOT, JSON.stringify(root())],
    [SETTINGS, JSON.stringify(createDefaultPreferencesSettings())],
    ["sto_keybind_manager_visited", "true"],
  ],
) {
  const values = new Map(entries);
  const trace = [];
  let fault = null;
  const storage = {
    get length() {
      return values.size;
    },
    key: (index) => [...values.keys()][index] ?? null,
    getItem(key) {
      trace.push(["read", key]);
      fault?.("read", key);
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      trace.push(["write", key, value]);
      fault?.("write", key);
      values.set(key, value);
    },
    removeItem(key) {
      trace.push(["remove", key]);
      fault?.("remove", key);
      values.delete(key);
    },
  };
  const diagnostics = createStorageRuntimeDiagnostics();
  const defaults = createDefaultPreferencesSettings();
  const projectRepository = new LocalStorageProjectRepository({
    storage,
    version: "1.0.0",
    now: () => NOW,
  });
  const settingsRepository = new LocalStorageSettingsRepository({
    storage,
    defaults,
  });
  const project = diagnostics.observeProjectRepository(projectRepository);
  const settings = diagnostics.observeSettingsRepository(settingsRepository);
  const presentation = diagnostics.observeCommandPresentation(
    new LocalStorageCommandPresentationPersistence({ storage }),
  );
  const keyBrowser = diagnostics.observeKeyBrowser(
    new LocalStorageKeyBrowserPersistence({ storage }),
  );
  const visited = diagnostics.observeVisitedState(
    new LocalStorageVisitedStatePersistence({ storage }),
  );
  const development = diagnostics.observeDevelopmentFlag(
    new LocalStorageDevelopmentFlagPersistence({ storage }),
  );
  const fs = diagnostics.observeFileSystem(
    new FileSystemService({ dbName: "runtime-diagnostic-integration" }),
  );
  return {
    values,
    trace,
    storage,
    diagnostics,
    project,
    settings,
    presentation,
    keyBrowser,
    visited,
    development,
    fs,
    projectRepository,
    settingsRepository,
    defaults,
    fail: (next) => {
      fault = next;
    },
  };
}

function row(f, domain) {
  return f.diagnostics
    .snapshot()
    .domains.find((entry) => entry.domain === domain);
}

async function owners(f) {
  const bus = await createRealEventBusFixture();
  cleanup.push(() => bus.destroy());
  const preferences = new PreferencesService({
    eventBus: bus.eventBus,
    settingsRepository: f.settings,
    defaults: f.defaults,
    i18n: { language: "en", t: (key) => key, changeLanguage: async () => {} },
    applyTranslations: () => {},
  });
  const data = new DataCoordinator({
    eventBus: bus.eventBus,
    projectRepository: f.project,
    visitedState: f.visited,
    defaultProfiles: {},
    i18n: { t: (key) => key },
  });
  cleanup.push(
    () => preferences.destroy(),
    () => data.destroy(),
  );
  preferences.init();
  await preferences.initialStateReady;
  data.init();
  await data.initialStateReady;
  return { bus: bus.eventBus, preferences, data };
}

describe("R13 registered runtime diagnostics over actual owner persistence ports", () => {
  it("registers exactly seven actual narrow adapters and observes no persistence during snapshot reads", async () => {
    const f = fixture();
    const { data, preferences, bus } = await owners(f);
    f.presentation.load();
    f.keyBrowser.load();
    f.development.isEnabled();
    await expect(f.fs.getSyncDirectoryState()).resolves.toEqual({
      handle: null,
      transitionPending: false,
    });
    const beforeTrace = structuredClone(f.trace);
    const beforeBytes = [...f.values];
    const beforeData = data.getCurrentState();
    const beforeSettings = preferences.getCurrentState();
    const snapshot = f.diagnostics.snapshot();
    expect(
      snapshot.domains.map(({ domain, owner, port, adapter }) => ({
        domain,
        owner,
        port,
        adapter,
      })),
    ).toEqual(STORAGE_DIAGNOSTIC_REGISTRATIONS);
    expect(snapshot.domains.every((entry) => entry.portRegistered)).toBe(true);
    expect(row(f, "project").structuralLayout).toBe("settings-free");
    expect(row(f, "settings").structuralLayout).toBe("standalone-settings");
    expect(materializeStorageDiagnosticSnapshot(snapshot)).toEqual(snapshot);
    expect(JSON.stringify(snapshot)).not.toContain(PRIVATE);
    expect(f.trace).toEqual(beforeTrace);
    expect([...f.values]).toEqual(beforeBytes);
    expect(data.getCurrentState()).toBe(beforeData);
    expect(preferences.getCurrentState()).toBe(beforeSettings);
    expect(bus.hasListeners("rpc:storage:get-diagnostics")).toBe(false);
    expect(bus.hasListeners("rpc:storage:get-state")).toBe(false);
    expect(Object.isFrozen(snapshot.domains)).toBe(true);
  });

  it.each([
    ["missing", null, "missing"],
    ["invalid JSON", "{invalid", "invalid_json"],
  ])(
    "distinguishes %s project ingress without retaining raw bytes",
    (_name, raw, reason) => {
      const f = fixture(raw === null ? [] : [[ROOT, raw]]);
      const result = f.project.load();
      expect(result).toMatchObject({ status: "repair_required", reason });
      expect(row(f, "project").lastOperation).toMatchObject({
        operation: "load",
        status: "repair_required",
        reason,
      });
      expect(JSON.stringify(f.diagnostics.snapshot())).not.toContain(
        "{invalid",
      );
      expect(f.trace.every(([operation]) => operation === "read")).toBe(true);
    },
  );

  it("records actual settings-free migration receipts and preserves the exact legacy backup", () => {
    const legacy = { ...root(), settings: { theme: PRIVATE } };
    const raw = JSON.stringify(legacy);
    const f = fixture([[ROOT, raw]]);
    const receipt = runStorageSchemaMigration({
      settingsRepository: f.settings,
      settingsInspection: f.settingsRepository.createMigrationInspectionPort(),
      projectMigration: f.projectRepository.createSchemaMigrationPort(),
      defaults: f.defaults,
      version: "1.0.0",
      now: () => NOW,
    });
    f.diagnostics.recordMigrationReceipt(receipt);
    expect(receipt).toMatchObject({
      status: "complete",
      settingsVerified: true,
      rootLayout: "settings-free",
      exactPriorRootBackedUp: true,
    });
    expect(JSON.parse(f.values.get(ROOT))).not.toHaveProperty("settings");
    expect(JSON.parse(f.values.get(BACKUP)).data).toBe(raw);
    expect(row(f, "project").lastMigration).toEqual(receipt);
    expect(row(f, "settings").lastMigration).toEqual(receipt);
    expect(JSON.stringify(f.diagnostics.snapshot())).not.toContain(PRIVATE);
  });

  it("classifies real read and quota failures and never publishes accepted settings after failed persistence", async () => {
    const f = fixture();
    const { preferences, bus } = await owners(f);
    const before = preferences.getCurrentState();
    const bytes = f.values.get(SETTINGS);
    const success = vi.fn();
    cleanup.push(
      bus.on("preferences:saved", success),
      bus.on("preferences:changed", success),
    );
    f.fail((operation, key) => {
      if (operation === "write" && key === SETTINGS)
        throw new DOMException(PRIVATE, "QuotaExceededError");
    });
    await expect(preferences.setSetting("theme", "dark")).resolves.toBe(false);
    expect(preferences.getCurrentState()).toBe(before);
    expect(f.values.get(SETTINGS)).toBe(bytes);
    expect(success).not.toHaveBeenCalled();
    expect(row(f, "settings").lastOperation).toMatchObject({
      status: "write_failed",
      error: "storage_write_failed",
      category: "quota",
      committed: "indeterminate",
    });
    f.fail((operation, key) => {
      if (operation === "read" && key === ROOT)
        throw new DOMException(PRIVATE, "SecurityError");
    });
    expect(f.project.load()).toMatchObject({ status: "read_failed" });
    expect(row(f, "project").lastOperation).toMatchObject({
      status: "read_failed",
      category: "security",
    });
    expect(JSON.stringify(f.diagnostics.snapshot())).not.toContain(PRIVATE);
  });

  it("retains advisory backup failure separately from a durably accepted real owner commit", async () => {
    const f = fixture();
    const { data, bus } = await owners(f);
    const publication = vi.fn();
    cleanup.push(bus.on("data:state-changed", publication));
    f.fail((operation, key) => {
      if (operation === "write" && key === BACKUP)
        throw new DOMException(PRIVATE, "QuotaExceededError");
    });
    await data.updateProfile("captain", {
      properties: { description: "accepted" },
    });
    expect(JSON.parse(f.values.get(ROOT)).profiles.captain.description).toBe(
      "accepted",
    );
    expect(data.getCurrentState().profiles.captain.description).toBe(
      "accepted",
    );
    expect(publication).toHaveBeenCalledOnce();
    expect(row(f, "project").lastOperation).toMatchObject({
      status: "committed",
      committed: true,
      error: "backup_write_failed",
      category: "quota",
    });
    expect(row(f, "project").lastOperation.stages).toContainEqual(
      expect.objectContaining({
        stage: "backup",
        status: "indeterminate",
        category: "quota",
      }),
    );
  });

  it("records acknowledged settings writes with failed verification without adopting or announcing them", async () => {
    const f = fixture();
    const { preferences, bus } = await owners(f);
    const before = preferences.getCurrentState();
    const saved = vi.fn();
    cleanup.push(bus.on("preferences:saved", saved));
    f.fail((operation, key) => {
      if (operation === "read" && key === SETTINGS)
        throw new DOMException(PRIVATE, "SecurityError");
    });
    await expect(preferences.setSetting("theme", "dark")).resolves.toBe(false);
    expect(JSON.parse(f.values.get(SETTINGS)).theme).toBe("dark");
    expect(preferences.getCurrentState()).toBe(before);
    expect(saved).not.toHaveBeenCalled();
    expect(row(f, "settings").lastOperation).toMatchObject({
      status: "verification_failed",
      error: "verification_failed",
      committed: true,
    });
    expect(row(f, "settings").lastOperation.stages).toContainEqual(
      expect.objectContaining({
        stage: "write",
        status: "acknowledged",
        committed: true,
      }),
    );
  });

  it("observes lifecycle cancellation after a real saved consumer destroys the owner without changing the returned promise", async () => {
    const f = fixture();
    const { preferences, bus } = await owners(f);
    cleanup.push(
      bus.on("preferences:saved", () => {
        preferences.destroy();
      }),
    );
    let actual;
    const action = f.diagnostics.observeWorkflowAction(
      "settings",
      "activation",
      () => {
        actual = preferences.setSetting("theme", "dark");
        return actual;
      },
    );
    const result = action();
    expect(result).toBe(actual);
    await expect(result).rejects.toThrow("operation_cancelled");
    await Promise.resolve();
    expect(row(f, "settings").lastOperation.error).toBe("operation_cancelled");
    expect(JSON.parse(f.values.get(SETTINGS)).theme).toBe("dark");
    expect(JSON.stringify(f.diagnostics.snapshot())).not.toContain(PRIVATE);
  });

  it("retains actual partial restore durability when settings commit but the project write fails", async () => {
    const f = fixture();
    const { data, preferences, bus } = await owners(f);
    const importer = new ImportService({
      eventBus: bus,
      replaceProjectFromImport: f.diagnostics.observeWorkflowAction(
        "project",
        "restore",
        data.replaceProjectFromImport.bind(data),
      ),
      replaceProjectFromImportWithSettlement:
        f.diagnostics.observeWorkflowAction(
          "project",
          "restore",
          data.replaceProjectFromImportWithSettlement.bind(data),
        ),
    });
    const manager = new ProjectManagementService({
      eventBus: bus,
      i18n: { t: (key) => key },
      ui: { showToast: () => {} },
      importProjectWithinPreferencesTransition:
        importer.importProjectWithinPreferencesTransition.bind(importer),
      runPreferencesTransition:
        preferences.runExternalActivationTransition.bind(preferences),
      activateProjectFromImport: data.activateProjectFromImport.bind(data),
      activateImportedSettings:
        preferences.activateImportedSettings.bind(preferences),
    });
    cleanup.push(
      () => importer.destroy(),
      () => manager.destroy(),
    );
    importer.init();
    manager.init();
    const before = data.getCurrentState();
    const raw = f.values.get(ROOT);
    f.fail((operation, key) => {
      if (operation === "write" && key === ROOT)
        throw new DOMException(PRIVATE, "QuotaExceededError");
    });
    const imported = root();
    imported.profiles.captain.name = "Imported";
    const outcome = await manager.restoreFromProjectContent(
      JSON.stringify({
        type: "project",
        version: "1.0.0",
        data: {
          profiles: imported.profiles,
          currentProfile: "captain",
          settings: { ...f.defaults, theme: "dark" },
        },
      }),
      "project.json",
    );
    expect(outcome).toMatchObject({
      success: false,
      partial: true,
      committed: { settings: true, project: false },
    });
    expect(JSON.parse(f.values.get(SETTINGS)).theme).toBe("dark");
    expect(f.values.get(ROOT)).toBe(raw);
    expect(data.getCurrentState()).toBe(before);
    expect(row(f, "project").lastOperation.stages).toContainEqual(
      expect.objectContaining({ stage: "settings", committed: true }),
    );
    expect(JSON.stringify(f.diagnostics.snapshot())).not.toContain(PRIVATE);
  });
});
