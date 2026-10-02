import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalI18nextDescriptor = Object.getOwnPropertyDescriptor(
  window,
  "i18next",
);
const originalApplyTranslationsDescriptor = Object.getOwnPropertyDescriptor(
  window,
  "applyTranslations",
);

function createI18n(existingKeys = ["known"]) {
  const instance = {
    t: vi.fn(function (key) {
      expect(this).toBe(instance);
      return `translated:${key}`;
    }),
    exists: vi.fn(function (key) {
      expect(this).toBe(instance);
      return existingKeys.includes(String(key));
    }),
  };
  return instance;
}

async function loadMonitor(developmentFlag = { isEnabled: vi.fn(() => true) }) {
  vi.spyOn(console, "log").mockImplementation(() => {});
  const { default: monitor } = await import(
    "../../../src/js/dev/DevMonitor.js"
  );
  if (developmentFlag) monitor.configureDevelopmentFlag(developmentFlag);
  return monitor;
}

describe("DevMonitor localization capability", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal("window", {
      location: {
        hostname: "keybind.example",
        protocol: "https:",
        search: "",
        origin: "https://keybind.example",
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    delete window.devMonitor;
    if (originalI18nextDescriptor) {
      Object.defineProperty(window, "i18next", originalI18nextDescriptor);
    } else {
      delete window.i18next;
    }
    if (originalApplyTranslationsDescriptor) {
      Object.defineProperty(
        window,
        "applyTranslations",
        originalApplyTranslationsDescriptor,
      );
    } else {
      delete window.applyTranslations;
    }
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("tracks through the explicitly configured instance and restores its exact t method", async () => {
    const monitor = await loadMonitor();
    const configuredI18n = createI18n();
    const originalT = configuredI18n.t;

    monitor.configure(/** @type {any} */ (configuredI18n));

    expect(monitor.enableI18nTracking()).toBe(true);
    expect(configuredI18n.t).not.toBe(originalT);
    expect(configuredI18n.t("known")).toBe("translated:known");
    expect(configuredI18n.t("missing")).toBe("translated:missing");
    expect(configuredI18n.exists).toHaveBeenCalledWith("known");
    expect(configuredI18n.exists).toHaveBeenCalledWith("missing");
    expect(monitor.getI18nStats()).toEqual(
      expect.objectContaining({
        summary: {
          totalKeysUsed: 2,
          totalKeysMissing: 1,
          totalUsages: 2,
        },
        usedKeys: ["known", "missing"],
        missingKeys: ["missing"],
      }),
    );

    monitor.disableI18nTracking();

    expect(configuredI18n.t).toBe(originalT);
    expect(monitor.i18nTracking).toBe(false);
  });

  it("restores an active predecessor before accepting a replacement configuration", async () => {
    const monitor = await loadMonitor();
    const predecessor = createI18n();
    const replacement = createI18n();
    const predecessorT = predecessor.t;
    const replacementT = replacement.t;

    monitor.configure(/** @type {any} */ (predecessor));
    monitor.enableI18nTracking();
    expect(predecessor.t).not.toBe(predecessorT);

    monitor.configure(/** @type {any} */ (replacement));

    expect(predecessor.t).toBe(predecessorT);
    expect(replacement.t).toBe(replacementT);
    expect(monitor.i18nTracking).toBe(false);

    monitor.enableI18nTracking();
    expect(replacement.t).not.toBe(replacementT);
    monitor.disableAll();
    expect(replacement.t).toBe(replacementT);
    expect(monitor.isEnabled).toBe(false);
  });

  it("fails closed when localization has not been configured", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const monitor = await loadMonitor();

    expect(monitor.enableI18nTracking()).toBe(false);
    expect(consoleError).toHaveBeenCalledWith(
      "DevMonitor: i18next not configured",
    );
    expect(monitor.i18nTracking).toBe(false);
  });

  it("does not consult poisoned ambient localization globals", async () => {
    Object.defineProperty(window, "i18next", {
      configurable: true,
      get() {
        throw new Error("ambient i18next read");
      },
      set() {
        throw new Error("ambient i18next write");
      },
    });
    Object.defineProperty(window, "applyTranslations", {
      configurable: true,
      get() {
        throw new Error("ambient applyTranslations read");
      },
      set() {
        throw new Error("ambient applyTranslations write");
      },
    });
    const monitor = await loadMonitor();
    const configuredI18n = createI18n();
    const originalT = configuredI18n.t;

    monitor.configure(/** @type {any} */ (configuredI18n));

    expect(monitor.enableI18nTracking()).toBe(true);
    expect(configuredI18n.t("known")).toBe("translated:known");
    monitor.disableI18nTracking();
    expect(configuredI18n.t).toBe(originalT);
  });

  it("keeps development global exposure and CSS interval lifecycle intact", async () => {
    vi.useFakeTimers();
    const monitor = await loadMonitor();

    expect(window.devMonitor).toBe(monitor);
    expect(monitor.enableCSSTracking()).toBe(true);
    expect(monitor.cssTracking).toBe(true);
    expect(monitor.cssCheckInterval).not.toBeNull();

    monitor.disableCSSTracking();

    expect(monitor.cssTracking).toBe(false);
    expect(monitor.cssCheckInterval).toBeNull();
  });

  it("checks live stylesheets and reports used and unused selectors", async () => {
    document.head.innerHTML =
      "<style>.monitor-used {} .monitor-unused {}</style>";
    document.body.innerHTML = '<div class="monitor-used"></div>';
    const monitor = await loadMonitor();

    expect(monitor.getCSSStats()).toBeNull();
    monitor.cssTracking = true;
    monitor.checkCSSUsage();

    expect(monitor.getCSSStats()).toEqual({
      summary: {
        totalSelectorsUsed: 1,
        totalSelectorsUnused: 1,
        lastChecked: expect.any(String),
      },
      usedSelectors: [".monitor-used"],
      unusedSelectors: [".monitor-unused"],
      selectorUsageCount: { ".monitor-used": 1 },
      mostUsedSelectors: [{ selector: ".monitor-used", count: 1 }],
    });
    expect(monitor.checkCSSNow()).toEqual(monitor.getCSSStats());
    expect(monitor.cssStats.selectorUsageCount.get(".monitor-used")).toBe(2);
  });

  it("exports tracked reports, produces cleanup guidance, and clears status", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-26T12:00:00.000Z"));
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    const monitor = await loadMonitor();
    const configuredI18n = createI18n();
    monitor.configure(/** @type {any} */ (configuredI18n));
    monitor.enableI18nTracking();
    configuredI18n.t("known");

    monitor.cssTracking = true;
    monitor.cssStats.usedSelectors.add(".used");
    monitor.cssStats.unusedSelectors.add(".unused");
    monitor.cssStats.selectorUsageCount.set(".used", 3);
    monitor.cssStats.lastChecked = Date.now();

    expect(monitor.exportI18nStats()).toMatchObject({
      summary: { totalKeysUsed: 1, totalKeysMissing: 0, totalUsages: 1 },
    });
    expect(monitor.exportCSSStats()).toMatchObject({
      summary: {
        totalSelectorsUsed: 1,
        totalSelectorsUnused: 1,
        lastChecked: "2026-07-26T12:00:00.000Z",
      },
    });
    expect(monitor.generateCSSCleanupScript()).toContain(
      "UNUSED SELECTORS (1 total):\n- .unused",
    );
    expect(click).toHaveBeenCalledTimes(3);
    expect(URL.createObjectURL).toHaveBeenCalledTimes(3);
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(3);
    expect(monitor.getStatus()).toMatchObject({
      isEnabled: true,
      isDevelopment: true,
      i18nTracking: true,
      cssTracking: true,
      i18nStatsCount: 1,
      cssStatsCount: 1,
    });

    monitor.clearStats();

    expect(monitor.getStatus()).toMatchObject({
      i18nStatsCount: 0,
      cssStatsCount: 0,
    });
    monitor.disableAll();
  });

  it("registers a replaceable frozen runtime record in development", async () => {
    const monitor = await loadMonitor();
    const firstEventBus = { name: "first" };
    const first = monitor.registerRuntimeDiagnostics({
      eventBus: firstEventBus,
      preferencesService: { name: "preferences" },
    });

    expect(first).toBe(monitor.getRuntimeDiagnostics());
    expect(first).toEqual({
      eventBus: firstEventBus,
      preferencesService: { name: "preferences" },
    });
    expect(Object.isFrozen(first)).toBe(true);
    expect(() => {
      first.eventBus = { name: "mutated" };
    }).toThrow(TypeError);
    expect(monitor.getRuntimeDiagnostics().eventBus).toBe(firstEventBus);

    const replacement = monitor.registerRuntimeDiagnostics({
      eventBus: { name: "replacement" },
    });

    expect(replacement).not.toBe(first);
    expect(Object.isFrozen(replacement)).toBe(true);
    expect(monitor.getRuntimeDiagnostics()).toBe(replacement);
    expect(monitor.clearRuntimeDiagnostics()).toBe(true);
    expect(monitor.getRuntimeDiagnostics()).toBeNull();
  });

  it("refuses runtime diagnostics outside development", async () => {
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const monitor = await loadMonitor();
    monitor.isDevelopment = false;

    expect(
      monitor.registerRuntimeDiagnostics({ eventBus: { name: "blocked" } }),
    ).toBeNull();
    expect(monitor.getRuntimeDiagnostics()).toBeNull();
    expect(monitor.clearRuntimeDiagnostics()).toBe(false);
    expect(monitor.runtimeDiagnostics).toBeNull();
    expect(consoleWarn).toHaveBeenCalledTimes(3);
  });

  it("does not enable or expose the production singleton before composition supplies its flag", async () => {
    const monitor = await loadMonitor(null);

    expect(monitor.isDevelopment).toBe(false);
    expect(monitor.checkDevelopmentMode()).toBe(false);
    expect(window.devMonitor).toBeUndefined();

    const developmentFlag = { isEnabled: vi.fn(() => true) };
    monitor.configureDevelopmentFlag(developmentFlag);

    expect(developmentFlag.isEnabled).toHaveBeenCalledOnce();
    expect(monitor.isDevelopment).toBe(true);
    expect(window.devMonitor).toBe(monitor);
  });

  it("keeps a false injected flag disabled on production and does not expose diagnostics", async () => {
    const developmentFlag = { isEnabled: vi.fn(() => false) };
    const monitor = await loadMonitor(developmentFlag);

    expect(monitor.isDevelopment).toBe(false);
    expect(window.devMonitor).toBeUndefined();
    expect(monitor.enableI18nTracking()).toBe(false);
    expect(monitor.enableCSSTracking()).toBe(false);
    expect(monitor.checkCSSNow()).toBe(false);
  });

  it("withdraws only its own global exposure when the injected flag is disabled", async () => {
    const monitor = await loadMonitor();
    const disabledFlag = { isEnabled: vi.fn(() => false) };
    const independentMonitor = new monitor.constructor(disabledFlag);

    independentMonitor.configureDevelopmentFlag(disabledFlag);

    expect(window.devMonitor).toBe(monitor);
    monitor.configureDevelopmentFlag(disabledFlag);
    expect(monitor.isDevelopment).toBe(false);
    expect(window.devMonitor).toBeUndefined();
  });

  it.each([
    { hostname: "localhost", protocol: "https:", search: "" },
    { hostname: "127.0.0.1", protocol: "https:", search: "" },
    { hostname: "", protocol: "file:", search: "" },
    { hostname: "keybind.example", protocol: "https:", search: "?dev=true" },
  ])(
    "preserves initial location-based development detection for %j",
    async (location) => {
      window.location = location;
      const monitor = await loadMonitor(null);

      expect(monitor.isDevelopment).toBe(true);
      expect(window.devMonitor).toBe(monitor);
      const developmentFlag = {
        isEnabled: vi.fn(() => {
          throw new Error("flag must be short-circuited");
        }),
      };
      expect(() =>
        monitor.configureDevelopmentFlag(developmentFlag),
      ).not.toThrow();
      expect(developmentFlag.isEnabled).not.toHaveBeenCalled();
    },
  );

  it("propagates injected flag failures without enabling or exposing a production singleton", async () => {
    const monitor = await loadMonitor(null);
    const failure = new Error("diagnostic flag unavailable");
    const developmentFlag = {
      isEnabled: vi.fn(() => {
        throw failure;
      }),
    };

    expect(() => monitor.configureDevelopmentFlag(developmentFlag)).toThrow(
      failure,
    );
    expect(monitor.isDevelopment).toBe(false);
    expect(window.devMonitor).toBeUndefined();
    expect(() => monitor.checkDevelopmentMode()).toThrow(failure);
  });

  it("supports independently injected constructor flags and never reads poisoned ambient storage", async () => {
    for (const name of ["localStorage", "sessionStorage"]) {
      vi.stubGlobal(name, undefined);
      for (const target of [globalThis, window]) {
        Object.defineProperty(target, name, {
          configurable: true,
          get() {
            throw new Error(`ambient ${name} read`);
          },
        });
      }
    }
    const monitor = await loadMonitor(null);
    const enabledFlag = { isEnabled: vi.fn(() => true) };
    const disabledFlag = { isEnabled: vi.fn(() => false) };
    const enabledMonitor = new monitor.constructor(enabledFlag);
    const disabledMonitor = new monitor.constructor(disabledFlag);

    expect(enabledMonitor.isDevelopment).toBe(true);
    expect(disabledMonitor.isDevelopment).toBe(false);
    expect(monitor.isDevelopment).toBe(false);
    monitor.configureDevelopmentFlag(enabledFlag);
    expect(window.devMonitor).toBe(monitor);
    expect(enabledFlag.isEnabled).toHaveBeenCalledTimes(2);
    expect(disabledFlag.isEnabled).toHaveBeenCalledOnce();
  });

  it("does not expose its read-only capability through the public singleton or runtime diagnostics", async () => {
    const developmentFlag = Object.freeze({ isEnabled: vi.fn(() => true) });
    const monitor = await loadMonitor(developmentFlag);
    monitor.registerRuntimeDiagnostics({ eventBus: {} });

    expect(window.devMonitor).toBe(monitor);
    expect(monitor.developmentFlag).toBeUndefined();
    expect(monitor.developmentFlagPort).toBeUndefined();
    expect(Reflect.ownKeys(monitor).map((key) => monitor[key])).not.toContain(
      developmentFlag,
    );
    expect(monitor.getStatus()).not.toHaveProperty("developmentFlag");
    expect(monitor.getRuntimeDiagnostics()).toEqual({ eventBus: {} });
    expect(monitor.getItem).toBeUndefined();
    expect(monitor.setItem).toBeUndefined();
    expect(monitor.removeItem).toBeUndefined();
  });
});
