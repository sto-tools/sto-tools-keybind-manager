import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const bootstrap = vi.hoisted(() => {
  class ComponentStub {
    init() {}

    destroy() {}

    initDragAndDrop() {}
  }

  const state = {
    ComponentStub,
    dataRpcTopics: new Set(),
    appDependencies: null,
    syncOptions: null,
    operations: [],
    initialStateReady: Promise.resolve(),
    rejectInitialState: () => {},
    resolveInitialState: () => {},
    reset() {
      state.operations.length = 0;
      state.dataRpcTopics.clear();
      state.appDependencies = null;
      state.syncOptions = null;
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

vi.mock("../../src/js/components/ui/FileExplorerUI.js", () => ({
  default: bootstrap.ComponentStub,
}));

vi.mock("../../src/js/app.js", () => ({
  default: class {
    constructor(dependencies) {
      bootstrap.appDependencies = dependencies;
      bootstrap.operations.push("app:construct");
    }

    async init() {
      bootstrap.operations.push("app:init");
    }
  },
}));

vi.mock("../../src/js/dev/DevMonitor.js", () => ({
  default: { isDevelopment: false },
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
    expect(bootstrap.operations).not.toContain("storage:get-settings");
    expect(bootstrap.operations).not.toContain("i18next:change-language");
    expect(bootstrap.operations).not.toContain("data:localize");
    expect(window).not.toHaveProperty("stoSync");
    expect(window).not.toHaveProperty("stoUI");
    expect(bootstrap.appDependencies).toEqual(
      expect.objectContaining({
        applyTranslations: expect.any(Function),
      }),
    );
    expect(window.applyTranslations).toBe(
      bootstrap.appDependencies.applyTranslations,
    );
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

  it("waits for DOM readiness after DataCoordinator state is ready", async () => {
    const readyState = vi
      .spyOn(document, "readyState", "get")
      .mockReturnValue("loading");
    await import("../../src/js/main.js");

    await vi.waitFor(() => {
      expect(bootstrap.operations).toContain("coordinator:init");
    });
    bootstrap.resolveInitialState();
    await Promise.resolve();
    await Promise.resolve();

    expect(bootstrap.operations).not.toContain("app:construct");
    document.dispatchEvent(new Event("DOMContentLoaded"));

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
      "storage:destroy",
    ]);
  });
});
