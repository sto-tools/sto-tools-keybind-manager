import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  expectSafeDiagnosticBootstrap,
  expectScalarBootstrap,
} from "../fixtures/ui/scalarCompositionAssertions.js";

const bootstrap = vi.hoisted(() => {
  class ComponentStub {
    init() {
      if (state.intermediateInitError) throw state.intermediateInitError;
    }

    destroy() {}

    initDragAndDrop() {}
  }

  const state = {
    ComponentStub,
    dataRpcTopics: new Set(),
    appDependencies: null,
    dataCoordinator: null,
    projectRepository: null,
    devMonitorI18n: null,
    storageDiagnosticProvider: null,
    syncOptions: null,
    appInitError: null,
    intermediateInitError: null,
    appConstructorError: null,
    operations: [],
    initialStateReady: Promise.resolve(),
    preferencesInitialStateReady: Promise.resolve(),
    preferencesOptions: null,
    artifactCaptureOwners: null,
    artifactCapturePort: null,
    currentArtifactSerializer: null,
    rejectInitialState: () => {},
    resolveInitialState: () => {},
    reset() {
      state.operations.length = 0;
      state.dataRpcTopics.clear();
      state.appDependencies = null;
      state.dataCoordinator = null;
      state.projectRepository = null;
      state.devMonitorI18n = null;
      state.storageDiagnosticProvider = null;
      state.syncOptions = null;
      state.appInitError = null;
      state.intermediateInitError = null;
      state.appConstructorError = null;
      state.preferencesInitialStateReady = Promise.resolve();
      state.preferencesOptions = null;
      state.artifactCaptureOwners = null;
      state.artifactCapturePort = null;
      state.currentArtifactSerializer = null;
      state.initialStateReady = new Promise((resolve, reject) => {
        state.resolveInitialState = resolve;
        state.rejectInitialState = reject;
      });
    },
  };
  state.reset();
  return state;
});

vi.mock("../../src/js/core/eventBus.js", () => ({
  default: { emit: () => Promise.resolve() },
}));

vi.mock("../../src/js/data.js", () => ({
  localizeCommands: () => bootstrap.operations.push("data:localize"),
  stoData: { commands: {}, settings: { version: "test-version" } },
}));

vi.mock("../../src/js/components/services/projectArtifactCapture.js", () => ({
  createArtifactCapturePort: (owners) => {
    bootstrap.artifactCaptureOwners = owners;
    bootstrap.artifactCapturePort = Object.freeze({ capture: vi.fn() });
    return bootstrap.artifactCapturePort;
  },
  createCurrentProjectArtifactSerializer: (options) => {
    bootstrap.currentArtifactSerializer = Object.freeze({
      serialize: vi.fn(),
      options,
    });
    return bootstrap.currentArtifactSerializer;
  },
}));

vi.mock("i18next", () => ({
  default: {
    language: "en",
    init: async () => {
      bootstrap.operations.push("i18next:init");
    },
    changeLanguage: async () => {
      bootstrap.operations.push("i18next:change-language");
    },
    t: (key) => key,
  },
}));

vi.mock("../../src/js/core/constants.js", () => ({
  DISPLAY_VERSION: "vtest",
}));

vi.mock(
  "../../src/js/components/storage/LocalStorageProjectRepository.js",
  async () =>
    (
      await import("../fixtures/ui/mainProjectRepositoryMock.js")
    ).createMainProjectRepositoryMock(bootstrap),
);

vi.mock("../../src/js/components/storage/storageSchemaMigration.js", () => ({
  runStorageSchemaMigration: () => {
    bootstrap.operations.push("migration:verify");
    return { status: "absent", settingsVerified: true };
  },
}));

vi.mock("../../src/js/components/services/index.js", () => {
  class DataCoordinator extends bootstrap.ComponentStub {
    constructor(options) {
      super();
      this.initialStateReady = bootstrap.initialStateReady;
      bootstrap.dataCoordinator = { owner: this, options };
      bootstrap.operations.push("coordinator:construct");
    }

    init() {
      bootstrap.operations.push("coordinator:init");
      bootstrap.dataRpcTopics.add("rpc:data:create-profile");
    }

    replaceProjectFromImport() {}

    replaceProjectFromImportWithSettlement() {}

    activateProjectFromImport() {}

    runApplicationResetTransition() {}

    destroy() {
      bootstrap.operations.push("coordinator:destroy");
      bootstrap.dataRpcTopics.clear();
    }
  }

  class SyncService extends bootstrap.ComponentStub {
    constructor(options) {
      super();
      bootstrap.syncOptions = options;
    }
  }

  return {
    CommandChainValidatorService: bootstrap.ComponentStub,
    DataCoordinator,
    SyncService,
    ToastService: bootstrap.ComponentStub,
    UIUtilityService: bootstrap.ComponentStub,
  };
});

vi.mock("../../src/js/components/services/DataService.js", () => ({
  default: class extends bootstrap.ComponentStub {
    init() {
      bootstrap.operations.push("data-service:init");
    }

    destroy() {
      bootstrap.operations.push("data-service:destroy");
    }
  },
}));

vi.mock("../../src/js/components/services/PreferencesService.js", async () =>
  (
    await import("../fixtures/ui/mainProjectRepositoryMock.js")
  ).createMainPreferencesMock(bootstrap),
);

vi.mock("../../src/js/components/ui/FileExplorerUI.js", () => ({
  default: bootstrap.ComponentStub,
}));

vi.mock("../../src/js/app.js", () => ({
  default: class {
    constructor(dependencies) {
      bootstrap.appDependencies = dependencies;
      this.commandChainUI = { name: "command-chain-ui" };
      this.keyBrowserUI = { name: "key-browser-ui" };
      this.keyBrowserService = { name: "key-browser-service" };
      bootstrap.operations.push("app:construct");
      if (bootstrap.appConstructorError) throw bootstrap.appConstructorError;
    }

    async init() {
      bootstrap.operations.push("app:init");
      if (bootstrap.appInitError) throw bootstrap.appInitError;
    }
  },
}));

vi.mock("../../src/js/dev/DevMonitor.js", () => ({
  default: {
    isDevelopment: true,
    configureDevelopmentFlag(flag) {
      bootstrap.developmentFlag = flag;
    },
    configure(i18n) {
      bootstrap.devMonitorI18n = i18n;
      bootstrap.operations.push("dev-monitor:configure");
    },
    configureStorageDiagnostics(provider) {
      bootstrap.storageDiagnosticProvider = provider;
      bootstrap.operations.push("dev-monitor:configure-storage");
    },
  },
}));

describe("main DataCoordinator startup barrier", () => {
  beforeEach(() => {
    bootstrap.reset();
    vi.resetModules();
  });

  afterEach(async () => {
    bootstrap.resolveInitialState();
    await Promise.resolve();
    for (const property of [
      "applyTranslations",
      "dataCoordinator",
      "eventBus",
      "i18next",
      "showDirectoryPicker",
    ]) {
      delete window[property];
    }
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("blocks all root initialization and Data composition until Preferences verifies readiness", async () => {
    let release;
    bootstrap.preferencesInitialStateReady = new Promise((resolve) => {
      release = resolve;
    });
    await import("../../src/js/main.js");
    await vi.waitFor(() =>
      expect(bootstrap.operations).toContain("preferences:init"),
    );
    expect(bootstrap.operations).not.toContain("coordinator:construct");
    expect(bootstrap.operations).not.toContain("app:construct");
    expect(bootstrap.operations.indexOf("migration:verify")).toBeLessThan(
      bootstrap.operations.indexOf("preferences:construct"),
    );
    expect(bootstrap.preferencesOptions.startupMigration).toEqual({
      status: "absent",
      settingsVerified: true,
    });
    release();
    await vi.waitFor(() =>
      expect(bootstrap.operations).toContain("coordinator:init"),
    );
    bootstrap.resolveInitialState();
    await vi.waitFor(() => expect(bootstrap.operations).toContain("app:init"));
    expect(bootstrap.appDependencies.preferencesService).toBeDefined();
    expect(bootstrap.appDependencies.importedProjectOwnerAction).toBeTypeOf(
      "function",
    );
    expect(
      bootstrap.appDependencies.importedProjectOwnerCompletionAction,
    ).toBeTypeOf("function");
    expect(
      bootstrap.operations.filter(
        (operation) => operation === "preferences:init",
      ),
    ).toHaveLength(1);
  });

  it("leaves the legacy root untouched and destroys the blocked owner on Preferences failure", async () => {
    const before = '{"legacy":"unchanged"}';
    localStorage.setItem("sto_keybind_manager", before);
    let reject;
    bootstrap.preferencesInitialStateReady = new Promise(
      (_resolve, onReject) => {
        reject = onReject;
      },
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    await import("../../src/js/main.js");
    await vi.waitFor(() =>
      expect(bootstrap.operations).toContain("preferences:init"),
    );
    reject(new Error("storage_read_failed"));
    await vi.waitFor(() =>
      expect(bootstrap.operations).toContain("preferences:destroy"),
    );
    expect(bootstrap.operations).not.toContain("coordinator:construct");
    expect(bootstrap.operations).not.toContain("app:construct");
    expect(localStorage.getItem("sto_keybind_manager")).toBe(before);
  });

  it("does not construct or initialize the app before initial state is ready", async () => {
    await import("../../src/js/main.js");

    await vi.waitFor(() => {
      expect(bootstrap.operations).toContain("coordinator:init");
    });
    expect(bootstrap.operations).not.toContain("app:construct");
    expect(bootstrap.operations).not.toContain("app:init");

    bootstrap.resolveInitialState();

    await vi.waitFor(() => {
      expect(bootstrap.operations).toContain("app:init");
    });
    expect(bootstrap.operations.indexOf("coordinator:init")).toBeLessThan(
      bootstrap.operations.indexOf("app:construct"),
    );
    expect(bootstrap.operations.indexOf("app:construct")).toBeLessThan(
      bootstrap.operations.indexOf("app:init"),
    );
    expect(
      bootstrap.operations.indexOf("dev-monitor:configure-storage"),
    ).toBeLessThan(bootstrap.operations.indexOf("preferences:construct"));
    expect(bootstrap.operations).not.toContain("storage:get-settings");
    expect(bootstrap.operations).not.toContain("i18next:change-language");
    expect(bootstrap.operations).not.toContain("data:localize");
    expect(bootstrap.operations.indexOf("i18next:init")).toBeLessThan(
      bootstrap.operations.indexOf("dev-monitor:configure"),
    );
    expect(bootstrap.devMonitorI18n).toEqual(
      expect.objectContaining({
        language: "en",
        t: expect.any(Function),
      }),
    );
    expect(window).not.toHaveProperty("stoSync");
    expect(window).not.toHaveProperty("stoUI");
    expect(window).not.toHaveProperty("i18next");
    expect(window).not.toHaveProperty("applyTranslations");
    expect(bootstrap.appDependencies).toEqual(
      expect.objectContaining({
        applyTranslations: expect.any(Function),
        applicationDataResetTransitionRunner: expect.any(Function),
        currentArtifactSerializer: bootstrap.currentArtifactSerializer,
      }),
    );
    expectScalarBootstrap(bootstrap);
    const { options: repositoryOptions } = bootstrap.projectRepository;
    expect(repositoryOptions).toMatchObject({
      version: "test-version",
      storage: localStorage,
    });
    expect(bootstrap.artifactCaptureOwners).toEqual({
      preferencesOwner: bootstrap.appDependencies.preferencesService,
      dataOwner: bootstrap.dataCoordinator.owner,
    });
    expect(bootstrap.currentArtifactSerializer.options).toEqual({
      capturePort: bootstrap.artifactCapturePort,
      version: "test-version",
    });
    expectSafeDiagnosticBootstrap(bootstrap);
    for (const property of [
      "eventBus",
      "dataCoordinator",
      "commandChainUI",
      "keyBrowserUI",
      "keyBrowserService",
    ]) {
      expect(window).not.toHaveProperty(property);
    }
    expect(bootstrap.syncOptions.directoryPicker.isSupported()).toBe(false);
    const selectedDirectory = { kind: "directory", name: "late-picker" };
    const showDirectoryPicker = vi.fn().mockResolvedValue(selectedDirectory);
    window.showDirectoryPicker = showDirectoryPicker;
    expect(bootstrap.syncOptions.directoryPicker.isSupported()).toBe(true);
    await expect(bootstrap.syncOptions.directoryPicker.pick()).resolves.toBe(
      selectedDirectory,
    );
    expect(showDirectoryPicker).toHaveBeenCalledOnce();

    const translated = document.createElement("span");
    translated.dataset.i18n = "translated_by_injected_capability";
    document.body.append(translated);
    bootstrap.appDependencies.applyTranslations(document);
    expect(translated.textContent).toBe("translated_by_injected_capability");
  });

  it("does not read or replace poisoned ambient localization globals", async () => {
    const ambientI18next = { poisoned: "i18next" };
    const ambientApplyTranslations = vi.fn();
    let i18nextReads = 0;
    let applyTranslationsReads = 0;
    Object.defineProperty(window, "i18next", {
      configurable: true,
      get() {
        i18nextReads += 1;
        return /** @type {any} */ (ambientI18next);
      },
      set() {
        throw new Error("ambient i18next write");
      },
    });
    Object.defineProperty(window, "applyTranslations", {
      configurable: true,
      get() {
        applyTranslationsReads += 1;
        return ambientApplyTranslations;
      },
      set() {
        throw new Error("ambient applyTranslations write");
      },
    });

    await import("../../src/js/main.js");
    await vi.waitFor(() => {
      expect(bootstrap.operations).toContain("coordinator:init");
    });
    bootstrap.resolveInitialState();

    await vi.waitFor(() => {
      expect(bootstrap.operations).toContain("app:init");
    });
    expect(i18nextReads).toBe(0);
    expect(applyTranslationsReads).toBe(0);
    expect(ambientApplyTranslations).not.toHaveBeenCalled();
    expect(bootstrap.devMonitorI18n).not.toBe(ambientI18next);
  });

  it("waits for DOM readiness before starting Preferences effects and Data", async () => {
    const readyState = vi
      .spyOn(document, "readyState", "get")
      .mockReturnValue("loading");
    await import("../../src/js/main.js");

    await Promise.resolve();
    await Promise.resolve();

    expect(bootstrap.operations).not.toContain("preferences:init");
    expect(bootstrap.operations).not.toContain("coordinator:init");
    expect(bootstrap.operations).not.toContain("app:construct");
    document.dispatchEvent(new Event("DOMContentLoaded"));

    await vi.waitFor(() =>
      expect(bootstrap.operations).toContain("coordinator:init"),
    );
    bootstrap.resolveInitialState();

    await vi.waitFor(() => {
      expect(bootstrap.operations).toContain("app:init");
    });
    readyState.mockRestore();
  });

  it("aborts bootstrap when initial state fails", async () => {
    const error = new Error("initial storage failed");
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    await import("../../src/js/main.js");

    await vi.waitFor(() => {
      expect(bootstrap.operations).toContain("coordinator:init");
    });
    bootstrap.rejectInitialState(error);

    await vi.waitFor(() => {
      expect(consoleError).toHaveBeenCalledWith(
        "DataCoordinator initialization failed:",
        error,
      );
    });
    expect(bootstrap.operations).not.toContain("storage:get-settings");
    expect(bootstrap.operations).not.toContain("app:construct");
    expect(bootstrap.operations).not.toContain("app:init");
    expect(bootstrap.dataRpcTopics.size).toBe(0);
    expect(bootstrap.operations.slice(-3)).toEqual([
      "coordinator:destroy",
      "data-service:destroy",
      "preferences:destroy",
    ]);
    expectSafeDiagnosticBootstrap(bootstrap);
  });

  it("retains only safe storage metadata when app initialization fails", async () => {
    const error = new Error("app initialization failed");
    bootstrap.appInitError = error;
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    await import("../../src/js/main.js");

    await vi.waitFor(() => {
      expect(bootstrap.operations).toContain("coordinator:init");
    });
    bootstrap.resolveInitialState();

    await vi.waitFor(() => {
      expect(consoleError).toHaveBeenCalledWith(
        "Application initialization failed:",
        error,
      );
    });
    expect(bootstrap.operations).toContain("app:init");
    expectSafeDiagnosticBootstrap(bootstrap);
  });

  it.each([
    ["intermediate component initialization", "intermediateInitError", false],
    ["application construction", "appConstructorError", true],
  ])(
    "releases the bootstrap Preferences owner when %s throws",
    async (_label, fault, constructsApp) => {
      const error = new Error("post-Data composition failed");
      bootstrap[fault] = error;
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      await import("../../src/js/main.js");
      await vi.waitFor(() =>
        expect(bootstrap.operations).toContain("coordinator:init"),
      );
      expect(bootstrap.operations).not.toContain("preferences:destroy");
      bootstrap.resolveInitialState();

      await vi.waitFor(() => {
        expect(consoleError).toHaveBeenCalledWith(
          "Application initialization failed:",
          error,
        );
        expect(
          bootstrap.operations.filter(
            (operation) => operation === "preferences:destroy",
          ),
        ).toHaveLength(1);
      });
      expect(bootstrap.operations.includes("app:construct")).toBe(
        constructsApp,
      );
      expect(bootstrap.operations).not.toContain("app:init");
      expectSafeDiagnosticBootstrap(bootstrap);
    },
  );
});
