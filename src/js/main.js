import "./core/constants.js";
import eventBus from "./core/eventBus.js";
import { stoData } from "./data.js";
import i18next from "i18next";
import en from "../i18n/en.json";
import de from "../i18n/de.json";
import fr from "../i18n/fr.json";
import es from "../i18n/es.json";
import {
  StorageService,
  DataCoordinator,
  ToastService,
} from "./components/services/index.js";
import DataService from "./components/services/DataService.js";
// ExportService is now created and managed by app.js
import { UIUtilityService } from "./components/services/index.js";
import FileExplorerUI from "./components/ui/FileExplorerUI.js";
import { SyncService } from "./components/services/index.js";
import STOToolsKeybindManager from "./app.js";
// Version display functionality - moved inline to reduce file count
import { DISPLAY_VERSION } from "./core/constants.js";
import { CommandChainValidatorService } from "./components/services/index.js";
import devMonitor from "./dev/DevMonitor.js";

// Retain the retirement-bound DataService late-join snapshot owner.
// Runtime static-data consumers import their catalogs directly, and consumers
// discover this compatibility state through component registration.
const dataService = new DataService({
  eventBus,
  data: stoData,
});

(async () => {
  await i18next.init({
    lng: "en", // Default to English, will be updated after StorageService is created
    fallbackLng: "en",
    resources: {
      en: { translation: en },
      de: { translation: de },
      fr: { translation: fr },
      es: { translation: es },
    },
  });

  /** @param {Document | Element | null} [root] */
  function applyTranslations(root = document) {
    const translationRoot = root || document;
    translationRoot.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      const attr = el.getAttribute("data-i18n-attr");
      if (!key) return;
      const text = i18next.t(key);
      if (attr) {
        el.setAttribute(attr, text);
      } else {
        el.textContent = text;
      }
    });

    translationRoot
      .querySelectorAll("[data-i18n-placeholder]")
      .forEach((el) => {
        const key = el.getAttribute("data-i18n-placeholder");
        if (key) el.setAttribute("placeholder", i18next.t(key));
      });

    translationRoot.querySelectorAll("[data-i18n-title]").forEach((el) => {
      const key = el.getAttribute("data-i18n-title");
      if (key) el.setAttribute("title", i18next.t(key));
    });

    translationRoot.querySelectorAll("[data-i18n-alt]").forEach((el) => {
      const key = el.getAttribute("data-i18n-alt");
      if (key) el.setAttribute("alt", i18next.t(key));
    });
  }

  // Create new StorageService component with i18n support
  const storageService = new StorageService({ eventBus, i18n: i18next });
  storageService.init();

  // Initialize the compatibility late-join owner.
  dataService.init();

  // Create DataCoordinator - the profile-data authority. PreferencesService
  // becomes the separate settings authority inside the app startup barrier.
  const dataCoordinator = new DataCoordinator({
    eventBus,
    storage: storageService,
    i18n: i18next,
  });
  dataCoordinator.init();
  try {
    await dataCoordinator.initialStateReady;
  } catch (error) {
    console.error("DataCoordinator initialization failed:", error);
    for (const component of [dataCoordinator, dataService, storageService]) {
      if (typeof component.destroy === "function") component.destroy();
    }
    return;
  }

  if (document.readyState === "loading") {
    await new Promise((resolve) =>
      document.addEventListener("DOMContentLoaded", resolve, { once: true }),
    );
  }

  // Give DevMonitor the initialized localization capability without publishing
  // it as application-global state.
  devMonitor.configure(i18next);
  if (devMonitor.isDevelopment) {
    console.log(
      "🔧 DevMonitor: Development mode detected, monitoring tools available",
    );
  }

  // Preferences owns initial translation; bootstrap only supplies version text.
  const appVersionElement = document.getElementById("appVersion");
  if (appVersionElement) {
    appVersionElement.textContent = DISPLAY_VERSION;
  }

  // Create dependencies first. ExportService and KeyService are app-owned.
  // Create UI utility service
  const uiUtilityService = new UIUtilityService(eventBus);
  uiUtilityService.init();

  // Helper to bridge legacy UI components with the new utility service
  /**
   * @param {Element} container
   * @param {any} [options]
   * @returns {void | (() => void)}
   */
  const initDragAndDropBridge = (container, options = {}) => {
    if (
      container instanceof HTMLElement &&
      uiUtilityService &&
      typeof uiUtilityService.initDragAndDrop === "function"
    ) {
      return uiUtilityService.initDragAndDrop(container, options);
    } else {
      // Fallback via eventBus so a remote service instance can handle it (test env)
      eventBus.emit("ui:init-drag-drop", { container, options });
    }
  };

  // Create toast service to handle notifications
  const toastService = new ToastService({ eventBus });
  toastService.init();

  // Create the local UI capability facade injected into composed consumers.
  const stoUI = {
    showToast: (
      /** @type {string} */ message,
      /** @type {string} */ type = "info",
    ) => eventBus.emit("toast:show", { message, type }),
    showModal: (/** @type {string} */ modalId) =>
      eventBus.emit("modal:show", { modalId }),
    hideModal: (/** @type {string} */ modalId) =>
      eventBus.emit("modal:hide", { modalId }),
    copyToClipboard: (/** @type {string} */ text) =>
      eventBus.emit("ui:copy-to-clipboard", { text }),
    // New: expose drag-and-drop helper for components
    initDragAndDrop: initDragAndDropBridge,
  };

  // Initialize command chain validator service (after stoUI is defined)
  const chainValidatorService = new CommandChainValidatorService({
    eventBus,
    i18n: i18next,
    ui: stoUI,
  });
  chainValidatorService.init();

  const stoFileExplorer = new FileExplorerUI({
    eventBus,
    storage: storageService,
    ui: stoUI,
    i18n: i18next,
  });
  // Init immediately so header Explorer button works without waiting for sto-app-ready
  stoFileExplorer.init();
  const stoSync = new SyncService({
    eventBus,
    ui: stoUI,
    i18n: i18next,
    directoryPicker: Object.freeze({
      isSupported: () => typeof window.showDirectoryPicker === "function",
      pick: async () => {
        if (typeof window.showDirectoryPicker !== "function") {
          throw new Error("directory_picker_unavailable");
        }
        return await window.showDirectoryPicker();
      },
    }),
  });
  stoSync.init();

  // Initialize app after dependencies are available
  const app = new STOToolsKeybindManager({
    i18n: i18next,
    storageService,
    ui: stoUI,
    syncService: stoSync,
    applyTranslations,
  });

  // App instance is not exposed globally; components communicate via eventBus.
  try {
    await app.init();
    if (devMonitor.isDevelopment) {
      devMonitor.registerRuntimeDiagnostics({
        eventBus,
        storageService,
        dataCoordinator,
        commandChainUI: app.commandChainUI,
        keyBrowserUI: app.keyBrowserUI,
        keyBrowserService: app.keyBrowserService,
      });
    }
  } catch (error) {
    console.error("Application initialization failed:", error);
  }
})();
