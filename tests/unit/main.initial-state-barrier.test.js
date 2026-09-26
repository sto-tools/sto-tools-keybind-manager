import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
    devMonitorI18n: null,
    runtimeDiagnostics: null,
    syncOptions: null,
    appInitError: null,
    intermediateInitError: null,
    appConstructorError: null,
    operations: [],
    initialStateReady: Promise.resolve(),
    preferencesInitialStateReady: Promise.resolve(),
    preferencesOptions: null,
    rejectInitialState: () => {},
    resolveInitialState: () => {},
    reset() {
      state.operations.length = 0;
      state.dataRpcTopics.clear();
      state.appDependencies = null;
      state.devMonitorI18n = null;
      state.runtimeDiagnostics = null;
      state.syncOptions = null;
      state.appInitError = null;
      state.intermediateInitError = null;
      state.appConstructorError = null;
      state.preferencesInitialStateReady = Promise.resolve();
      state.preferencesOptions = null;
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
  localizeCommands: () => {
    bootstrap.operations.push("data:localize");
  },
  stoData: { commands: {} },
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

vi.mock("../../src/js/components/services/index.js", () => {
  class StorageService extends bootstrap.ComponentStub {
    init() {
      bootstrap.operations.push("storage:init");
    }

    getSettings() {
      bootstrap.operations.push("storage:get-settings");
      return { language: "en" };
    }

    destroy() {
      bootstrap.operations.push("storage:destroy");
    }
  }

  class DataCoordinator extends bootstrap.ComponentStub {
    constructor() {
      super();
      this.initialStateReady = bootstrap.initialStateReady;
      bootstrap.operations.push("coordinator:construct");
    }

    init() {
      bootstrap.operations.push("coordinator:init");
      bootstrap.dataRpcTopics.add("rpc:data:create-profile");
    }

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
    StorageService,
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

vi.mock("../../src/js/components/services/PreferencesService.js", () => ({
  default: class extends bootstrap.ComponentStub {
    constructor(options) {
      super();
      bootstrap.preferencesOptions = options;
      this.initialStateReady = bootstrap.preferencesInitialStateReady;
      bootstrap.operations.push("preferences:construct");
    }

    init() {
      bootstrap.operations.push("preferences:init");
    }

    destroy() {
      bootstrap.operations.push("preferences:destroy");
    }
  },
}));

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
    configure(i18n) {
      bootstrap.devMonitorI18n = i18n;
      bootstrap.operations.push("dev-monitor:configure");
    },
    registerRuntimeDiagnostics(runtime) {
      bootstrap.runtimeDiagnostics = Object.freeze({ ...runtime });
      bootstrap.operations.push("dev-monitor:register-runtime");
      return bootstrap.runtimeDiagnostics;
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
      "storageService",
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
    expect(bootstrap.operations).not.toContain("storage:init");
    expect(bootstrap.operations).not.toContain("coordinator:construct");
    expect(bootstrap.operations).not.toContain("app:construct");
    release();
    await vi.waitFor(() =>
      expect(bootstrap.operations).toContain("coordinator:init"),
    );
    bootstrap.resolveInitialState();
    await vi.waitFor(() => expect(bootstrap.operations).toContain("app:init"));
    expect(bootstrap.appDependencies.preferencesService).toBeDefined();
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
    expect(bootstrap.operations).not.toContain("storage:init");
    expect(bootstrap.operations).not.toContain("coordinator:construct");
    expect(bootstrap.operations).not.toContain("app:construct");
    expect(localStorage.getItem("sto_keybind_manager")).toBe(before);
  });

  it("does not construct or initialize the app before initial state is ready", async () => {
    await import("../../src/js/main.js");

    await vi.waitFor(() => {
      expect(bootstrap.operations).toContain("coordinator:init");
    });
    expect(bootstrap.operations).not.toContain("storage:get-settings");
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
    expect(bootstrap.operations.indexOf("app:init")).toBeLessThan(
      bootstrap.operations.indexOf("dev-monitor:register-runtime"),
    );
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
      }),
    );
    expect(bootstrap.runtimeDiagnostics).toEqual({
      eventBus: expect.objectContaining({ emit: expect.any(Function) }),
      storageService: expect.anything(),
      dataCoordinator: expect.anything(),
      commandChainUI: { name: "command-chain-ui" },
      keyBrowserUI: { name: "key-browser-ui" },
      keyBrowserService: { name: "key-browser-service" },
    });
    expect(Object.isFrozen(bootstrap.runtimeDiagnostics)).toBe(true);
    for (const property of [
      "eventBus",
      "storageService",
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
    expect(bootstrap.operations.slice(-4)).toEqual([
      "coordinator:destroy",
      "data-service:destroy",
      "storage:destroy",
      "preferences:destroy",
    ]);
    expect(bootstrap.runtimeDiagnostics).toBeNull();
  });

  it("does not register runtime diagnostics when app initialization fails", async () => {
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
    expect(bootstrap.operations).not.toContain("dev-monitor:register-runtime");
    expect(bootstrap.runtimeDiagnostics).toBeNull();
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
      expect(bootstrap.operations).not.toContain(
        "dev-monitor:register-runtime",
      );
      expect(bootstrap.runtimeDiagnostics).toBeNull();
    },
  );
});
