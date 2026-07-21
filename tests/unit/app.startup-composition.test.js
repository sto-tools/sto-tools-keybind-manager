import { afterEach, describe, expect, it, vi } from "vitest";

const startupHarness = vi.hoisted(() => {
  const listeners = new Map();
  const operations = [];

  const bus = {
    on(topic, handler) {
      const topicListeners = listeners.get(topic) ?? new Set();
      topicListeners.add(handler);
      listeners.set(topic, topicListeners);
      operations.push({ operation: "on", topic });
      return () => bus.off(topic, handler);
    },
    off(topic, handler) {
      const topicListeners = listeners.get(topic);
      topicListeners?.delete(handler);
      if (topicListeners?.size === 0) listeners.delete(topic);
      operations.push({ operation: "off", topic });
    },
    emit(topic, payload = null, options = {}) {
      operations.push({ operation: "emit", topic });
      const results = [...(listeners.get(topic) ?? [])].map((handler) => {
        try {
          return handler(payload);
        } catch (error) {
          return Promise.reject(error);
        }
      });

      return options.synchronous
        ? Promise.allSettled(results.map((result) => Promise.resolve(result)))
        : Promise.resolve();
    },
    onDom() {
      return () => {};
    },
    onDomDebounced() {
      return () => {};
    },
    once(topic, handler) {
      const detach = bus.on(topic, (payload) => {
        detach();
        return handler(payload);
      });
      return detach;
    },
    clear() {
      listeners.clear();
      operations.length = 0;
    },
    hasListeners(topic) {
      return (listeners.get(topic)?.size ?? 0) > 0;
    },
    getListenerCount(topic) {
      return listeners.get(topic)?.size ?? 0;
    },
  };

  class StubComponent {
    constructor(options = {}) {
      if (options && typeof options === "object") Object.assign(this, options);
      this.initialized = false;
      this.destroyed = false;
      this.lifecycleId = `${this.constructor.name}:${operations.length}`;
      operations.push({
        operation: "construct-component",
        component: this.lifecycleId,
      });
    }

    init() {
      if (this.initialized) return;
      this.initialized = true;
      this.destroyed = false;
    }

    destroy() {
      this.initialized = false;
      this.destroyed = true;
      operations.push({
        operation: "destroy-component",
        component: this.lifecycleId,
      });
    }

    renderProfiles() {}

    updateProfileInfo() {}

    show(modalId) {
      operations.push({ operation: "show-modal", modalId });
      return true;
    }

    hide(modalId) {
      operations.push({ operation: "hide-modal", modalId });
      return true;
    }
  }

  let bindsetSelectorInitError = null;

  class BindsetSelectorUIStub extends StubComponent {
    constructor(options = {}) {
      super(options);
      this.detachConstructorResponder = options.eventBus.on(
        "rpc:test:late-bindset-owner",
        () => undefined,
      );
    }

    init() {
      if (bindsetSelectorInitError) {
        const error = bindsetSelectorInitError;
        bindsetSelectorInitError = null;
        throw error;
      }
      super.init();
    }

    destroy() {
      this.detachConstructorResponder();
      super.destroy();
    }
  }

  return {
    bus,
    operations,
    StubComponent,
    BindsetSelectorUIStub,
    failNextBindsetSelectorInit(message) {
      bindsetSelectorInitError = new Error(message);
    },
    resetFailures() {
      bindsetSelectorInitError = null;
    },
  };
});

const welcomeModalOperations = () =>
  startupHarness.operations
    .filter(({ modalId }) => modalId === "aboutModal")
    .map(({ operation }) => operation);

vi.mock("../../src/js/core/eventBus.js", () => ({
  default: startupHarness.bus,
}));

vi.mock("../../src/js/components/services/index.js", async (importOriginal) => {
  const actual = await importOriginal();
  const Stub = startupHarness.StubComponent;
  return {
    ...actual,
    AutoSync: Stub,
    CommandLibraryService: Stub,
    CommandPresentationService: Stub,
    CommandService: Stub,
    InterfaceModeService: Stub,
    ModalManagerService: Stub,
    PreferencesService: Stub,
    VFXManagerService: Stub,
  };
});

vi.mock("../../src/js/components/ui/index.js", () => {
  const Stub = startupHarness.StubComponent;
  return {
    AboutModalUI: Stub,
    CommandLibraryUI: Stub,
    CommandUI: Stub,
    ConfirmDialogUI: Stub,
    HeaderMenuUI: Stub,
    ImportUI: Stub,
    InputDialogUI: Stub,
    InterfaceModeUI: Stub,
    VFXManagerUI: Stub,
  };
});

vi.mock("../../src/js/components/aliases/index.js", () => ({
  AliasBrowserService: startupHarness.StubComponent,
  AliasBrowserUI: startupHarness.StubComponent,
}));

vi.mock("../../src/js/components/chain/index.js", () => ({
  CommandChainService: startupHarness.StubComponent,
  CommandChainUI: startupHarness.StubComponent,
}));

vi.mock("../../src/js/components/keybinds/index.js", () => ({
  KeyBrowserService: startupHarness.StubComponent,
  KeyBrowserUI: startupHarness.StubComponent,
}));

vi.mock("../../src/js/components/services/ExportService.js", () => ({
  default: startupHarness.StubComponent,
}));
vi.mock("../../src/js/components/services/KeyCaptureService.js", () => ({
  default: startupHarness.StubComponent,
}));
vi.mock("../../src/js/components/services/KeyService.js", () => ({
  default: startupHarness.StubComponent,
}));
vi.mock("../../src/js/components/services/ParameterCommandService.js", () => ({
  default: startupHarness.StubComponent,
}));
vi.mock("../../src/js/components/services/SelectionService.js", () => ({
  default: startupHarness.StubComponent,
}));
vi.mock("../../src/js/components/services/BindsetService.js", () => ({
  default: startupHarness.StubComponent,
}));

vi.mock("../../src/js/components/ui/HeaderToolbarUI.js", () => ({
  default: startupHarness.StubComponent,
}));
vi.mock("../../src/js/components/ui/KeyCaptureUI.js", () => ({
  default: startupHarness.StubComponent,
}));
vi.mock("../../src/js/components/ui/ParameterCommandUI.js", () => ({
  default: startupHarness.StubComponent,
}));
vi.mock("../../src/js/components/ui/PreferencesUI.js", () => ({
  default: startupHarness.StubComponent,
}));
vi.mock("../../src/js/components/ui/ProfileUI.js", () => ({
  default: startupHarness.StubComponent,
}));
vi.mock("../../src/js/components/ui/BindsetManagerUI.js", () => ({
  default: startupHarness.StubComponent,
}));
vi.mock("../../src/js/components/ui/BindsetSelectorUI.js", () => ({
  default: startupHarness.BindsetSelectorUIStub,
}));
vi.mock("../../src/js/components/services/BindsetSelectorService.js", () => ({
  default: startupHarness.StubComponent,
}));

vi.mock("../../src/js/components/sync/index.js", () => ({
  SyncUI: startupHarness.StubComponent,
}));

import STOToolsKeybindManager from "../../src/js/app.js";
import ImportService from "../../src/js/components/services/ImportService.js";
import ProjectManagementService from "../../src/js/components/services/ProjectManagementService.js";
import SyncService from "../../src/js/components/services/SyncService.js";
import { request } from "../../src/js/core/requestResponse.js";

describe("STOToolsKeybindManager startup composition", () => {
  let app;
  let syncService;

  afterEach(async () => {
    syncService?.destroy();
    await app?.ownedComponents.destroyAll(() => {});
    window.confirmDialog = undefined;
    window.commandChainUI = undefined;
    window.keyBrowserUI = undefined;
    window.keyBrowserService = undefined;
    startupHarness.resetFailures();
    startupHarness.bus.clear();
    localStorage.clear();
    vi.restoreAllMocks();
    app = null;
    syncService = null;
  });

  it("registers the import and project restore responders before SyncService handles app ready", async () => {
    localStorage.setItem("sto_keybind_manager_visited", "true");
    const restoreResult = {
      success: true,
      currentProfile: null,
      imported: { profiles: 0, settings: false },
    };
    const restore = vi
      .spyOn(ProjectManagementService.prototype, "restoreFromProjectContent")
      .mockResolvedValue(restoreResult);
    const ui = { showToast: vi.fn() };
    const i18n = { t: (key) => key };
    const syncFolder = {
      kind: "directory",
      name: "Fleet Builds",
      getFileHandle: vi.fn(),
      getDirectoryHandle: vi.fn(),
      queryPermission: vi.fn().mockResolvedValue("granted"),
      requestPermission: vi.fn().mockResolvedValue("granted"),
    };

    syncService = new SyncService({
      eventBus: startupHarness.bus,
      fs: {
        getSyncDirectoryState: vi.fn().mockResolvedValue({
          handle: syncFolder,
          transitionPending: false,
        }),
      },
      i18n,
      ui,
    });
    syncService.init();
    syncService.stagePendingSyncDecision("import", {
      content: '{"type":"project","data":{}}',
      fileName: "project.json",
    });

    app = new STOToolsKeybindManager({
      i18n,
      storageService: {},
      syncService,
      ui,
    });
    await app.init();

    await vi.waitFor(() => expect(restore).toHaveBeenCalledOnce());
    expect(restore).toHaveBeenCalledWith(
      '{"type":"project","data":{}}',
      "project.json",
    );
    expect(ui.showToast).not.toHaveBeenCalledWith(
      "failed_to_import_project",
      "error",
    );

    const operationIndex = (operation, topic) =>
      startupHarness.operations.findIndex(
        (entry) => entry.operation === operation && entry.topic === topic,
      );
    const importReady = operationIndex("on", "rpc:import:project-file");
    const projectReady = operationIndex(
      "on",
      "rpc:project:restore-from-content",
    );
    const appReady = operationIndex("emit", "sto-app-ready");

    expect(importReady).toBeGreaterThanOrEqual(0);
    expect(projectReady).toBeGreaterThan(importReady);
    expect(appReady).toBeGreaterThan(projectReady);
    expect(
      startupHarness.bus.getListenerCount("rpc:project:restore-from-content"),
    ).toBe(1);

    app.projectManagementService.init();
    expect(
      startupHarness.bus.getListenerCount("rpc:project:restore-from-content"),
    ).toBe(1);

    app.projectManagementService.destroy();
    expect(
      startupHarness.bus.getListenerCount("rpc:project:restore-from-content"),
    ).toBe(0);

    app.projectManagementService.init();
    expect(
      startupHarness.bus.getListenerCount("rpc:project:restore-from-content"),
    ).toBe(1);
    await expect(
      request(startupHarness.bus, "project:restore-from-content", {
        content: "{}",
        fileName: "replacement.json",
      }),
    ).resolves.toEqual(restoreResult);
    expect(restore).toHaveBeenCalledTimes(2);
  });

  it("removes failed-startup restore responders before retrying initialization", async () => {
    const importResult = {
      success: true,
      profilesImported: 1,
      settingsImported: false,
    };
    const restoreResult = {
      success: true,
      currentProfile: null,
      imported: { profiles: 0, settings: false },
    };
    const importProject = vi
      .spyOn(ImportService.prototype, "importProjectFile")
      .mockResolvedValue(importResult);
    const restoreProject = vi
      .spyOn(ProjectManagementService.prototype, "restoreFromProjectContent")
      .mockResolvedValue(restoreResult);
    let failLoadedToast = true;
    const ui = {
      showToast: vi.fn((_message, type) => {
        if (type !== "success" || !failLoadedToast) return;
        failLoadedToast = false;
        throw new Error("forced post-welcome startup failure");
      }),
    };
    const i18n = { t: (key) => key };

    app = new STOToolsKeybindManager({
      i18n,
      storageService: {},
      syncService: {},
      ui,
    });

    await expect(app.init()).rejects.toThrow(
      "forced post-welcome startup failure",
    );

    expect(app.initialized).toBe(false);
    expect(localStorage.getItem("sto_keybind_manager_visited")).toBeNull();
    expect(welcomeModalOperations()).toEqual(["show-modal", "hide-modal"]);
    expect(app.projectManagementService).toBeNull();
    expect(app.importService).toBeNull();
    expect(
      startupHarness.bus.getListenerCount("rpc:project:restore-from-content"),
    ).toBe(0);
    expect(startupHarness.bus.getListenerCount("rpc:import:project-file")).toBe(
      0,
    );

    const restoreDetach = startupHarness.operations.findIndex(
      (entry) =>
        entry.operation === "off" &&
        entry.topic === "rpc:project:restore-from-content",
    );
    const importDetach = startupHarness.operations.findIndex(
      (entry) =>
        entry.operation === "off" && entry.topic === "rpc:import:project-file",
    );
    expect(restoreDetach).toBeGreaterThanOrEqual(0);
    expect(importDetach).toBeGreaterThan(restoreDetach);

    await app.init();

    expect(app.initialized).toBe(true);
    expect(localStorage.getItem("sto_keybind_manager_visited")).toBe("true");
    expect(welcomeModalOperations()).toHaveLength(3);
    expect(welcomeModalOperations().at(-1)).toBe("show-modal");
    expect(
      startupHarness.bus.getListenerCount("rpc:project:restore-from-content"),
    ).toBe(1);
    expect(startupHarness.bus.getListenerCount("rpc:import:project-file")).toBe(
      1,
    );

    await expect(
      request(startupHarness.bus, "import:project-file", {
        content: "{}",
      }),
    ).resolves.toEqual(importResult);
    await expect(
      request(startupHarness.bus, "project:restore-from-content", {
        content: "{}",
        fileName: "retry.json",
      }),
    ).resolves.toEqual(restoreResult);
    expect(importProject).toHaveBeenCalledOnce();
    expect(restoreProject).toHaveBeenCalledOnce();
  });

  it("reverse-destroys every owner after a late Bindset failure and retries exactly once", async () => {
    window.confirmDialog = undefined;
    window.commandChainUI = undefined;
    window.keyBrowserUI = undefined;
    window.keyBrowserService = undefined;

    const storageService = { destroy: vi.fn() };
    const syncDependency = { destroy: vi.fn() };
    const ui = { showToast: vi.fn(), destroy: vi.fn() };
    const i18n = { t: (key) => key };
    app = new STOToolsKeybindManager({
      i18n,
      storageService,
      syncService: syncDependency,
      ui,
    });
    startupHarness.failNextBindsetSelectorInit(
      "forced late Bindset composition failure",
    );

    await expect(app.init()).rejects.toThrow(
      "forced late Bindset composition failure",
    );

    expect(app.initialized).toBe(false);
    expect(localStorage.getItem("sto_keybind_manager_visited")).toBeNull();
    expect(welcomeModalOperations()).toEqual([]);
    expect(app.ownedComponents.entries).toEqual([]);
    expect(app.bindsetSelectorUI).toBeNull();
    expect(app.preferencesManager).toBeNull();
    expect(window.confirmDialog).toBeUndefined();
    expect(window.commandChainUI).toBeUndefined();
    expect(window.keyBrowserUI).toBeUndefined();
    expect(window.keyBrowserService).toBeUndefined();
    expect(storageService.destroy).not.toHaveBeenCalled();
    expect(syncDependency.destroy).not.toHaveBeenCalled();
    expect(ui.destroy).not.toHaveBeenCalled();
    expect(ui.showToast).toHaveBeenCalledOnce();
    expect(ui.showToast).toHaveBeenCalledWith(
      "failed_to_load_application",
      "error",
    );
    expect(
      startupHarness.operations.filter(
        ({ operation, topic }) =>
          operation === "emit" && topic === "sto-app-ready",
      ),
    ).toEqual([]);

    const constructed = startupHarness.operations
      .filter(({ operation }) => operation === "construct-component")
      .map(({ component }) => component);
    const destroyed = startupHarness.operations
      .filter(({ operation }) => operation === "destroy-component")
      .map(({ component }) => component);
    expect(destroyed).toEqual([...constructed].reverse());

    const responderTopics = [
      "rpc:parser:parse-command-string",
      "rpc:parser:clear-cache",
      "rpc:alias:add",
      "rpc:import:project-file",
      "rpc:project:restore-from-content",
      "rpc:test:late-bindset-owner",
    ];
    for (const topic of responderTopics) {
      expect(startupHarness.bus.getListenerCount(topic), topic).toBe(0);
    }

    await app.init();

    expect(app.initialized).toBe(true);
    expect(localStorage.getItem("sto_keybind_manager_visited")).toBe("true");
    expect(welcomeModalOperations()).toEqual(["show-modal"]);
    for (const topic of responderTopics) {
      expect(startupHarness.bus.getListenerCount(topic), topic).toBe(1);
    }
    expect(ui.showToast).toHaveBeenCalledTimes(2);
    expect(ui.showToast).toHaveBeenLastCalledWith(
      "sto_tools_keybind_manager_loaded_successfully",
      "success",
    );
    expect(
      startupHarness.operations.filter(
        ({ operation, topic }) =>
          operation === "emit" && topic === "sto-app-ready",
      ),
    ).toHaveLength(1);

    const operationCount = startupHarness.operations.length;
    await app.init();
    expect(startupHarness.operations).toHaveLength(operationCount);
    expect(ui.showToast).toHaveBeenCalledTimes(2);
    expect(storageService.destroy).not.toHaveBeenCalled();
    expect(syncDependency.destroy).not.toHaveBeenCalled();
    expect(ui.destroy).not.toHaveBeenCalled();
  });
});
