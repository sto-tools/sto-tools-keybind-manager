/**
 * @typedef {Object} BrowserApplicationRuntime
 * @property {typeof import("../../../src/js/core/eventBus.js").default} eventBus
 * @property {import("../../../src/js/components/services/StorageService.js").default} storageService
 * @property {import("../../../src/js/components/services/DataCoordinator.js").default} dataCoordinator
 * @property {import("../../../src/js/components/ui/CommandChainUI.js").default} commandChainUI
 * @property {import("../../../src/js/components/ui/KeyBrowserUI.js").default} keyBrowserUI
 * @property {import("../../../src/js/components/services/KeyBrowserService.js").default} keyBrowserService
 */

/**
 * Read the explicitly registered checked-bundle runtime through the
 * development-only diagnostics boundary.
 *
 * @returns {BrowserApplicationRuntime}
 */
export function runtime() {
  const devMonitor = window.devMonitor;

  if (!devMonitor || typeof devMonitor.getRuntimeDiagnostics !== "function") {
    throw new Error("Application runtime diagnostics are unavailable");
  }

  const runtime = devMonitor.getRuntimeDiagnostics();
  if (!runtime) {
    throw new Error("Application runtime diagnostics are not registered");
  }

  return runtime;
}

export function ambientGlobals() {
  return [
    "stoKeybinds",
    "STO_DATA",
    "COMMANDS",
    "localizeCommandData",
    "storageService",
    "dataCoordinator",
    "eventBus",
    "commandChainUI",
    "keyBrowserUI",
    "keyBrowserService",
  ].filter((name) => name in window);
}
