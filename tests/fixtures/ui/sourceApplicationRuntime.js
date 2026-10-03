// Integration-only composition. This module is never loaded by the browser
// driver or production: its local handles retain the removed white-box tests.
import { readFileSync } from "node:fs";
import { Blob, File } from "node:buffer";
import { JSDOM } from "jsdom";
import i18next from "i18next";
import { vi } from "vitest";
import en from "../../../src/i18n/en.json";
import de from "../../../src/i18n/de.json";
import eventBus from "../../../src/js/core/eventBus.js";
import { stoData } from "../../../src/js/data.js";
import STOToolsKeybindManager from "../../../src/js/app.js";
import DataCoordinator from "../../../src/js/components/services/DataCoordinator.js";
import DataService from "../../../src/js/components/services/DataService.js";
import PreferencesService from "../../../src/js/components/services/PreferencesService.js";
import UIUtilityService from "../../../src/js/components/services/UIUtilityService.js";
import ToastService from "../../../src/js/components/services/ToastService.js";
import CommandChainValidatorService from "../../../src/js/components/services/CommandChainValidatorService.js";
import SyncService from "../../../src/js/components/services/SyncService.js";
import FileExplorerUI from "../../../src/js/components/ui/FileExplorerUI.js";
import LocalStorageProjectRepository from "../../../src/js/components/storage/LocalStorageProjectRepository.js";
import LocalStorageSettingsRepository from "../../../src/js/components/storage/LocalStorageSettingsRepository.js";
import LocalStorageVisitedStatePersistence from "../../../src/js/components/storage/LocalStorageVisitedStatePersistence.js";
import LocalStorageCommandPresentationPersistence from "../../../src/js/components/storage/LocalStorageCommandPresentationPersistence.js";
import LocalStorageKeyBrowserPersistence from "../../../src/js/components/storage/LocalStorageKeyBrowserPersistence.js";
import { runStorageSchemaMigration } from "../../../src/js/components/storage/storageSchemaMigration.js";
import { createDefaultPreferencesSettings } from "../../../src/js/components/services/preferencesDefaults.js";
import {
  createArtifactCapturePort,
  createCurrentProjectArtifactSerializer,
} from "../../../src/js/components/services/projectArtifactCapture.js";

let current;
let app;
let storageRealm;
let components = [];
let clipboardDescriptor;

export function runtime() {
  if (!current) throw new Error("Source test composition is not initialized");
  return current;
}

export function ambientGlobals() {
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
  ].filter((name) => name in window);
}

export async function initializeSourceApplication() {
  for (const method of ["debug", "info", "log"])
    vi.spyOn(console, method).mockImplementation(() => {});
  eventBus.clear();
  storageRealm = new JSDOM("", { url: "http://localhost" });
  vi.stubGlobal("localStorage", storageRealm.window.localStorage);
  vi.stubGlobal("sessionStorage", storageRealm.window.sessionStorage);
  vi.stubGlobal("Storage", storageRealm.window.Storage);
  vi.stubGlobal("Blob", Blob);
  vi.stubGlobal("File", File);
  clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
  class TestFileReader extends EventTarget {
    result = null;
    error = null;
    onload = null;
    onerror = null;
    readAsText(file) {
      void file.text().then((text) => {
        this.result = text;
        this.onload?.({ target: this });
        this.dispatchEvent(new Event("load"));
      });
    }
  }
  vi.stubGlobal("FileReader", TestFileReader);
  const shell = new DOMParser().parseFromString(
    readFileSync("src/index.html", "utf8"),
    "text/html",
  );
  document.title = shell.title;
  document.body.replaceChildren(
    ...[...shell.body.childNodes]
      .filter((node) => node.nodeName !== "SCRIPT")
      .map((node) => document.importNode(node, true)),
  );
  const localization = i18next.createInstance();
  await localization.init({
    lng: "en",
    fallbackLng: "en",
    resources: { en: { translation: en }, de: { translation: de } },
  });
  document.title = localization.t("sto_tools_keybind_manager");
  const applyTranslations = (root = document) => {
    root.querySelectorAll("[data-i18n]").forEach((element) => {
      const text = localization.t(element.getAttribute("data-i18n"));
      const attribute = element.getAttribute("data-i18n-attr");
      if (attribute) element.setAttribute(attribute, text);
      else element.textContent = text;
    });
    for (const attribute of ["placeholder", "title"])
      root.querySelectorAll(`[data-i18n-${attribute}]`).forEach((element) => {
        element.setAttribute(
          attribute,
          localization.t(element.getAttribute(`data-i18n-${attribute}`)),
        );
      });
  };
  const defaults = createDefaultPreferencesSettings();
  const settingsRepository = new LocalStorageSettingsRepository({
    storage: localStorage,
    defaults,
  });
  const projectRepository = new LocalStorageProjectRepository({
    storage: localStorage,
    version: stoData.settings.version,
    now: () => new Date().toISOString(),
  });
  const startupMigration = runStorageSchemaMigration({
    settingsRepository,
    settingsInspection: settingsRepository.createMigrationInspectionPort(),
    projectMigration: projectRepository.createSchemaMigrationPort(),
    defaults,
    version: stoData.settings.version,
    now: () => new Date().toISOString(),
  });
  const preferencesService = new PreferencesService({
    eventBus,
    settingsRepository,
    startupMigration,
    defaults,
    i18n: localization,
    applyTranslations,
  });
  components.push(preferencesService);
  preferencesService.init();
  await preferencesService.initialStateReady;
  const visitedState = new LocalStorageVisitedStatePersistence({
    storage: localStorage,
  });
  const dataCoordinator = new DataCoordinator({
    eventBus,
    projectRepository: Object.freeze({
      load: projectRepository.load.bind(projectRepository),
      commit: projectRepository.commit.bind(projectRepository),
      reset: projectRepository.reset.bind(projectRepository),
    }),
    visitedState,
    i18n: localization,
  });
  const dataService = new DataService({ eventBus, data: stoData });
  components.push(dataService, dataCoordinator);
  dataService.init();
  dataCoordinator.init();
  await dataCoordinator.initialStateReady;
  visitedState.markVisited();
  document.getElementById("appVersion").textContent = "source-composition-test";
  const utility = new UIUtilityService(eventBus);
  const toast = new ToastService({ eventBus });
  components.push(utility, toast);
  utility.init();
  toast.init();
  const ui = {
    showToast: (message, type = "info") =>
      eventBus.emit("toast:show", { message, type }),
    showModal: (modalId) => eventBus.emit("modal:show", { modalId }),
    hideModal: (modalId) => eventBus.emit("modal:hide", { modalId }),
    copyToClipboard: (text) => eventBus.emit("ui:copy-to-clipboard", { text }),
    initDragAndDrop: (container, options) =>
      utility.initDragAndDrop(container, options),
  };
  const validator = new CommandChainValidatorService({
    eventBus,
    i18n: localization,
    ui,
  });
  const explorer = new FileExplorerUI({ eventBus, i18n: localization, ui });
  const sync = new SyncService({
    eventBus,
    i18n: localization,
    ui,
    directoryPicker: {
      isSupported: () => typeof window.showDirectoryPicker === "function",
      pick: () => window.showDirectoryPicker(),
    },
  });
  components.push(validator, explorer, sync);
  validator.init();
  explorer.init();
  sync.init();
  const capturePort = createArtifactCapturePort({
    preferencesOwner: preferencesService,
    dataOwner: dataCoordinator,
  });
  app = new STOToolsKeybindManager({
    i18n: localization,
    preferencesService,
    visitedState,
    commandPresentationPersistence:
      new LocalStorageCommandPresentationPersistence({ storage: localStorage }),
    keyBrowserPersistence: new LocalStorageKeyBrowserPersistence({
      storage: localStorage,
    }),
    applicationDataResetTransitionRunner:
      dataCoordinator.runApplicationResetTransition.bind(dataCoordinator),
    importedProjectOwnerAction:
      dataCoordinator.replaceProjectFromImport.bind(dataCoordinator),
    importedProjectOwnerCompletionAction:
      dataCoordinator.replaceProjectFromImportWithSettlement.bind(
        dataCoordinator,
      ),
    importedProjectActivationAction:
      dataCoordinator.activateProjectFromImport.bind(dataCoordinator),
    importedSettingsActivationAction:
      preferencesService.activateImportedSettings.bind(preferencesService),
    currentArtifactSerializer: createCurrentProjectArtifactSerializer({
      capturePort,
      version: stoData.settings.version,
    }),
    ui,
    syncService: sync,
    applyTranslations,
  });
  await app.init();
  await new Promise((resolve) => setTimeout(resolve, 0));
  current = {
    eventBus,
    dataCoordinator,
    commandChainUI: app.commandChainUI,
    keyBrowserUI: app.keyBrowserUI,
    keyBrowserService: app.keyBrowserService,
  };
}

export async function destroySourceApplication() {
  await app?.ownedComponents.destroyAll();
  for (const component of components.reverse()) component.destroy();
  await new Promise((resolve) => setTimeout(resolve, 0));
  components = [];
  eventBus.clear();
  current = null;
  app = null;
  storageRealm?.window.close();
  storageRealm = null;
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (clipboardDescriptor)
    Object.defineProperty(navigator, "clipboard", clipboardDescriptor);
  else delete navigator.clipboard;
}
