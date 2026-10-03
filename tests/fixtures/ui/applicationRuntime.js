import { expect, vi } from "vitest";
import { createDefaultPreferencesSettings } from "../../../src/js/components/services/preferencesDefaults.js";
import {
  STORAGE_DIAGNOSTIC_REGISTRATIONS,
  materializeStorageDiagnosticSnapshot,
} from "../../../src/js/components/storage/storageDiagnosticSnapshot.js";

export const ROOT = "sto_keybind_manager";
export const SETTINGS = "sto_keybind_settings";
export const BACKUP = "sto_keybind_manager_backup";

// Metadata only: no owner, repository or event-bus lookup exists.
export function storageDiagnostics(target = window) {
  const snapshot = target.devMonitor?.getStorageDiagnostics?.();
  if (!snapshot) throw new Error("Storage diagnostics are not registered");
  assertClosedDiagnostics(snapshot);
  return snapshot;
}

function assertClosedDiagnostics(snapshot) {
  const seen = new Set();
  const inspect = (value) => {
    expect(typeof value).not.toBe("function");
    if (value === null || typeof value !== "object") return;
    expect(seen.has(value)).toBe(false);
    seen.add(value);
    expect(Object.isFrozen(value)).toBe(true);
    for (const key of Reflect.ownKeys(value)) {
      expect(typeof key).toBe("string");
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      expect(descriptor).toHaveProperty("value");
      expect(descriptor.get).toBeUndefined();
      expect(descriptor.set).toBeUndefined();
      if (!(Array.isArray(value) && key === "length"))
        expect(descriptor.enumerable).toBe(true);
      inspect(descriptor.value);
    }
  };
  inspect(snapshot);
  const detached = JSON.parse(JSON.stringify(snapshot));
  expect(materializeStorageDiagnosticSnapshot(detached)).toEqual(detached);
  expect(
    snapshot.domains.map(({ domain, owner, port, adapter }) => ({
      domain,
      owner,
      port,
      adapter,
    })),
  ).toEqual(STORAGE_DIAGNOSTIC_REGISTRATIONS);
}

function ambientGlobals(target = window) {
  return [
    "stoKeybinds",
    "STO_DATA",
    "COMMANDS",
    "localizeCommandData",
    "dataCoordinator",
    "eventBus",
    "commandChainUI",
    "keyBrowserUI",
    "keyBrowserService",
    "projectRepository",
    "settingsRepository",
    "commandPresentationService",
    "preferencesService",
  ].filter((name) => name in target);
}

export function seededProject() {
  return {
    version: "1.0.0",
    currentProfile: "captain",
    profiles: {
      captain: {
        name: "Captain",
        currentEnvironment: "space",
        migrationVersion: "2.1.1",
        builds: {
          space: {
            keys: {
              F1: ["FireAll"],
              F2: ["+TrayExecByTray 0 0", "FireAll"],
              F3: ['Target "Alpha"', "UncataloguedCommandForBoundary"],
            },
          },
          ground: { keys: { G: ["FireAll"] } },
        },
        aliases: { engage: { commands: ["FireAll"] } },
        bindsets: {
          Tactical: {
            space: { keys: { F1: ["FireAll"] } },
            ground: { keys: {} },
          },
        },
        selections: { space: "F1", ground: "G", alias: null },
        keybindMetadata: {
          space: { F2: { stabilizeExecutionOrder: true } },
          ground: {},
        },
        aliasMetadata: {},
        bindsetMetadata: {},
        extension: { retained: true },
      },
    },
    globalAliases: {},
    extension: { retained: true },
  };
}

function captureStorage() {
  return Array.from({ length: localStorage.length }, (_, index) =>
    localStorage.key(index),
  ).map((key) => [key, localStorage.getItem(key)]);
}

// Fresh checked production bundle. Test-owned handles are DOM/browser handles,
// never application services. Native storage inputs are seeded before startup.
export async function withApplication(
  run,
  {
    root = seededProject(),
    settings = createDefaultPreferencesSettings(),
    entries = [],
  } = {},
) {
  const previous = captureStorage();
  const frame = document.createElement("iframe");
  frame.title = "Checked production bundle test";
  try {
    localStorage.clear();
    if (root !== null) localStorage.setItem(ROOT, JSON.stringify(root));
    if (settings !== null)
      localStorage.setItem(SETTINGS, JSON.stringify(settings));
    localStorage.setItem("sto_keybind_manager_visited", "true");
    for (const [key, value] of entries) localStorage.setItem(key, value);
    const loaded = new Promise((resolve) =>
      frame.addEventListener("load", resolve, { once: true }),
    );
    frame.src = "/src/index.html?dev=true";
    document.body.appendChild(frame);
    await loaded;
    const applicationWindow = frame.contentWindow;
    const applicationDocument = frame.contentDocument;
    await vi.waitFor(
      () => {
        expect(
          applicationWindow.devMonitor?.getStorageDiagnostics?.(),
        ).toBeTruthy();
        expect(
          applicationDocument.getElementById("appVersion")?.textContent.trim(),
        ).not.toBe("");
        if (root?.currentProfile)
          expect(
            applicationDocument.getElementById("profileSelect")?.value,
          ).toBe(root.currentProfile);
      },
      { timeout: 10000 },
    );
    expect(ambientGlobals(applicationWindow)).toEqual([]);
    expect(applicationWindow.devMonitor.getRuntimeDiagnostics).toBeUndefined();
    expect(
      applicationWindow.devMonitor.registerRuntimeDiagnostics,
    ).toBeUndefined();
    expect(
      applicationWindow.devMonitor.clearRuntimeDiagnostics,
    ).toBeUndefined();
    expect(applicationWindow.devMonitor.runtimeDiagnostics).toBeUndefined();
    assertClosedDiagnostics(storageDiagnostics(applicationWindow));
    await run({
      window: applicationWindow,
      document: applicationDocument,
      root: () => JSON.parse(localStorage.getItem(ROOT)),
      settings: () => JSON.parse(localStorage.getItem(SETTINGS)),
      diagnostics: () => storageDiagnostics(applicationWindow),
      element: (selector) => {
        const element = applicationDocument.querySelector(selector);
        expect(element, `Required user control ${selector}`).toBeTruthy();
        return element;
      },
    });
  } finally {
    vi.restoreAllMocks();
    frame.remove();
    localStorage.clear();
    for (const [key, value] of previous) localStorage.setItem(key, value);
  }
}

export async function selectKey(application, key = "F1") {
  application.element(`#keyGrid .key-item[data-key="${key}"]`).click();
  await vi.waitFor(() =>
    expect(application.element("#chainTitle").textContent).toContain(key),
  );
}

export function setInput(application, selector, value) {
  const input = application.element(selector);
  input.value = value;
  input.dispatchEvent(new application.window.Event("input", { bubbles: true }));
  input.dispatchEvent(
    new application.window.Event("change", { bubbles: true }),
  );
  return input;
}

export async function confirm(application) {
  await vi.waitFor(() =>
    expect(
      application.document.querySelector(".modal.active .confirm-yes"),
    ).toBeTruthy(),
  );
  application.element(".modal.active .confirm-yes").click();
}

export function faultWrites(application, key = ROOT) {
  const original = application.window.Storage.prototype.setItem;
  return vi
    .spyOn(application.window.Storage.prototype, "setItem")
    .mockImplementation(function (name, value) {
      if (name === key)
        throw new application.window.DOMException(
          "private fault text",
          "QuotaExceededError",
        );
      return original.call(this, name, value);
    });
}
