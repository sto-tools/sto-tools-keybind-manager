import { afterEach, describe, expect, it, vi } from "vitest";

import STOToolsKeybindManager from "../../src/js/app.js";
import eventBus from "../../src/js/core/eventBus.js";

function deferred() {
  let resolve = () => {};
  let reject = () => {};
  const promise = new Promise((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, reject, resolve };
}

function createComponentStub(initialStateReady = Promise.resolve()) {
  const component = {
    destroyed: false,
    initialStateReady,
    init: vi.fn(),
    destroy: vi.fn(function destroy() {
      component.destroyed = true;
    }),
    hide: vi.fn(() => true),
    renderProfiles: vi.fn(),
    show: vi.fn(() => true),
    updateProfileInfo: vi.fn(),
  };
  return new Proxy(component, {
    get(target, property) {
      if (property in target) return Reflect.get(target, property);
      if (property === "then") return undefined;
      const method = vi.fn();
      Reflect.set(target, property, method);
      return method;
    },
  });
}

function createAppHarness(preferencesReady) {
  const ui = { showToast: vi.fn() };
  const applyTranslations = vi.fn();
  const preferencesService = createComponentStub(preferencesReady);
  const app = new STOToolsKeybindManager({
    i18n: { t: (key) => key },
    preferencesService,
    applicationDataResetTransitionRunner: vi.fn(),
    syncService: {},
    ui,
    applyTranslations,
  });
  const constructed = [];
  app.ownedComponents.create = /** @type {any} */ (
    (Component, ...args) => {
      const component = createComponentStub();
      component.type = Component.name;
      component.options = args[0];
      component.args = args;
      constructed.push(component);
      return app.ownedComponents.own(component);
    }
  );
  return { app, constructed, ui, preferencesService };
}

describe("application Preferences readiness barrier", () => {
  afterEach(() => {
    eventBus.clear();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("does not compose downstream components until Preferences state is ready", async () => {
    localStorage.setItem("sto_keybind_manager_visited", "true");
    const readiness = deferred();
    const ready = vi.fn();
    eventBus.on("sto-app-ready", ready);
    const { app, constructed, preferencesService } = createAppHarness(
      readiness.promise,
    );

    const initialization = app.init();
    await Promise.resolve();
    expect(constructed).toHaveLength(0);
    expect(preferencesService.init).not.toHaveBeenCalled();
    expect(app.modalManagerService).toBeUndefined();
    expect(ready).not.toHaveBeenCalled();

    readiness.resolve();
    await initialization;

    expect(constructed.length).toBeGreaterThan(1);
    expect(app.modalManagerService).toBeTruthy();
    expect(app.modalManagerService.options.applyTranslations).toBe(
      app.applyTranslations,
    );
    expect(app.applicationResetService.options).toMatchObject({
      runPreferencesResetTransition: expect.any(Function),
      runDataResetTransition: app.applicationDataResetTransitionRunner,
    });
    expect(app.stoCommandParser.args[1]).toEqual({ i18n: app.i18n });
    expect(ready).toHaveBeenCalledOnce();
    await app.ownedComponents.destroyAll();
    expect(preferencesService.destroy).not.toHaveBeenCalled();
  });

  it("leaves the injected owner's cleanup to bootstrap after readiness rejection", async () => {
    const readiness = deferred();
    const error = new Error("preferences activation failed");
    const ready = vi.fn();
    eventBus.on("sto-app-ready", ready);
    const { app, constructed, ui, preferencesService } = createAppHarness(
      readiness.promise,
    );

    const initialization = app.init();
    await Promise.resolve();
    expect(constructed).toHaveLength(0);
    readiness.reject(error);

    await expect(initialization).rejects.toBe(error);
    expect(preferencesService.destroy).not.toHaveBeenCalled();
    expect(app.ownedComponents.entries).toEqual([]);
    expect(app.preferencesService).toBe(preferencesService);
    expect(app.modalManagerService).toBeUndefined();
    expect(ready).not.toHaveBeenCalled();
    expect(ui.showToast).toHaveBeenCalledWith(
      "failed_to_load_application",
      "error",
    );

    preferencesService.initialStateReady = Promise.resolve();
    await app.init();
    expect(app.initialized).toBe(true);
    expect(ready).toHaveBeenCalledOnce();
    await app.ownedComponents.destroyAll();
  });
});
