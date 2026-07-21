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
    operations: [],
    initialStateReady: Promise.resolve(),
    rejectInitialState: () => {},
    resolveInitialState: () => {},
    reset() {
      state.operations.length = 0;
      state.dataRpcTopics.clear();
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
    changeLanguage: async () => {},
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

  return {
    CommandChainValidatorService: bootstrap.ComponentStub,
    DataCoordinator,
    StorageService,
    SyncService: bootstrap.ComponentStub,
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
    constructor() {
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
      "stoSync",
      "stoUI",
    ]) {
      delete window[property];
    }
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
      bootstrap.operations.indexOf("storage:get-settings"),
    );
    expect(bootstrap.operations.indexOf("storage:get-settings")).toBeLessThan(
      bootstrap.operations.indexOf("data:localize"),
    );
    expect(bootstrap.operations.indexOf("data:localize")).toBeLessThan(
      bootstrap.operations.indexOf("app:construct"),
    );
    expect(bootstrap.operations.indexOf("app:construct")).toBeLessThan(
      bootstrap.operations.indexOf("app:init"),
    );
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
