import { expect, vi } from "vitest";

const scalarNames = [
  "commandPresentationPersistence",
  "keyBrowserPersistence",
  "visitedState",
];

export async function initializePrivateScalarApp(bus, app) {
  const ready = vi.fn();
  bus.on("sto-app-ready", ready);
  await app.init();
  expect(ready).toHaveBeenCalledWith({ app });
  const publishedApp = ready.mock.calls[0][0].app;
  for (const name of scalarNames) {
    expect(publishedApp).not.toHaveProperty(name);
    expect(Object.keys(publishedApp)).not.toContain(name);
  }
}

export function expectScalarBootstrap(bootstrap) {
  expect(bootstrap.dataCoordinator.options).toMatchObject({
    projectRepository: {
      load: expect.any(Function),
      commit: expect.any(Function),
      reset: expect.any(Function),
    },
    visitedState: bootstrap.appDependencies.visitedState,
  });
  expect(
    bootstrap.dataCoordinator.options.projectRepository,
  ).not.toHaveProperty("createSchemaMigrationPort");
  for (const name of scalarNames) {
    expect(bootstrap.appDependencies[name]).toBeTruthy();
    expect(bootstrap.appDependencies[name]).not.toHaveProperty("storage");
    expect(bootstrap.appDependencies[name]).not.toHaveProperty("setItem");
    expect(bootstrap.storageDiagnosticProvider()).not.toHaveProperty(name);
    expect(window).not.toHaveProperty(name);
  }
  expect(bootstrap.developmentFlag.isEnabled()).toBe(false);
  expect(bootstrap.developmentFlag).not.toHaveProperty("replace");
}

export function expectSafeDiagnosticBootstrap(bootstrap) {
  expect(bootstrap.storageDiagnosticProvider).toBeTypeOf("function");
  const snapshot = bootstrap.storageDiagnosticProvider();
  expect(Object.isFrozen(snapshot)).toBe(true);
  expect(snapshot.domains).toHaveLength(7);
  for (const forbidden of [
    "eventBus",
    "dataCoordinator",
    "commandChainUI",
    "keyBrowserUI",
    "keyBrowserService",
    "projectRepository",
    "settingsRepository",
  ])
    expect(snapshot).not.toHaveProperty(forbidden);
  const inspect = (value) => {
    expect(typeof value).not.toBe("function");
    if (value && typeof value === "object") {
      expect(Object.isFrozen(value)).toBe(true);
      for (const child of Object.values(value)) inspect(child);
    }
  };
  inspect(snapshot);
}
