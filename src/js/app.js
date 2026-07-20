// STO Tools Keybind Manager - Main Application Controller
// Coordinates all modules and handles global application state
import store from "./core/store.js";
import eventBus from "./core/eventBus.js";
import { AutoSync } from "./components/services/index.js";
import ProfileUI from "./components/ui/ProfileUI.js";

import ParameterCommandUI from "./components/ui/ParameterCommandUI.js";
import { InterfaceModeService } from "./components/services/index.js";
import { ProjectManagementService } from "./components/services/index.js";
import { InterfaceModeUI } from "./components/ui/index.js";
import {
  CommandService,
  CommandLibraryService,
  CommandPresentationService,
} from "./components/services/index.js";
import { CommandLibraryUI, CommandUI } from "./components/ui/index.js";
import {
  AliasBrowserService,
  AliasBrowserUI,
} from "./components/aliases/index.js";

import {
  CommandChainService,
  CommandChainUI,
} from "./components/chain/index.js";
import {
  KeyBrowserService,
  KeyBrowserUI,
} from "./components/keybinds/index.js";
import { PreferencesService } from "./components/services/index.js";
import PreferencesUI from "./components/ui/PreferencesUI.js";
import KeyService from "./components/services/KeyService.js";
import AliasService from "./components/services/AliasService.js";
import ExportService from "./components/services/ExportService.js";
import KeyCaptureService from "./components/services/KeyCaptureService.js";
import KeyCaptureUI from "./components/ui/KeyCaptureUI.js";
import SelectionService from "./components/services/SelectionService.js";
import {
  VFXManagerService,
  ModalManagerService,
} from "./components/services/index.js";
import {
  VFXManagerUI,
  HeaderMenuUI,
  AboutModalUI,
  ImportUI,
  ConfirmDialogUI,
  InputDialogUI,
} from "./components/ui/index.js";
import HeaderToolbarUI from "./components/ui/HeaderToolbarUI.js";
import { SyncUI } from "./components/sync/index.js";
import { STOCommandParser } from "./lib/STOCommandParser.js";
import ImportService from "./components/services/ImportService.js";
import ParameterCommandService from "./components/services/ParameterCommandService.js";

export default class STOToolsKeybindManager {
  /**
   * @param {{
   *   i18n?: any,
   *   storageService?: any,
   *   ui?: any,
   *   syncService?: any
   * }} [dependencies]
   */
  constructor({ i18n, storageService, ui, syncService } = {}) {
    this.i18n = i18n;
    this.storageService = storageService;
    this.ui = ui;
    this.syncService = syncService;
    this.store = store;
    this.eventListeners = new Map();
    this.autoSyncManager = null; // created later when dependencies available

    this.profileUI = null;
    this.aliasService = null;
    this.aliasUI = null;
    this.commandService = null;
    this.commandLibraryService = null;
    this.commandPresentationService = null;
    this.keyBrowserService = null;
    this.keyBrowserUI = null;
    this.commandUI = null;
    this.keyService = null;
    this.fileOperationsService = null;
    this.keyCaptureService = null;
    this.keyCaptureUI = null;
    this.importUI = null;
    this.confirmDialogUI = null;
    this.inputDialogUI = null;

    this.projectManagementService = null;
  }

  get currentMode() {
    return this.interfaceModeService
      ? this.interfaceModeService.currentMode
      : this.store?.currentMode;
  }

  set currentMode(val) {
    if (this.store) {
      this.store.currentMode = val;
    }
    if (this.interfaceModeService) {
      this.interfaceModeService.currentMode = val;
    }
  }

  get undoStack() {
    // Safeguard for cases where getter is accessed on prototype or an instance
    // not yet fully constructed (e.g. via pretty-printer libraries).
    const targetStore = this && this.store ? this.store : store;
    return targetStore.undoStack;
  }
  set undoStack(val) {
    const targetStore = this && this.store ? this.store : store;
    targetStore.undoStack = val;
  }

  get redoStack() {
    const targetStore = this && this.store ? this.store : store;
    return targetStore.redoStack;
  }
  set redoStack(val) {
    const targetStore = this && this.store ? this.store : store;
    targetStore.redoStack = val;
  }

  get maxUndoSteps() {
    const targetStore = this && this.store ? this.store : store;
    return targetStore.maxUndoSteps;
  }
  set maxUndoSteps(val) {
    const targetStore = this && this.store ? this.store : store;
    targetStore.maxUndoSteps = val;
  }

  get commandIdCounter() {
    const targetStore = this && this.store ? this.store : store;
    return targetStore.commandIdCounter;
  }
  set commandIdCounter(val) {
    const targetStore = this && this.store ? this.store : store;
    targetStore.commandIdCounter = val;
  }

  async init() {
    const storageService = this.storageService;
    const stoUI = this.ui;

    try {
      if (!this.i18n || !storageService || !stoUI || !this.syncService) {
        throw new Error("Required dependencies not loaded");
      }

      this.modalManagerService = new ModalManagerService({
        eventBus,
        i18n: this.i18n,
      });
      this.modalManagerService.init();

      const modalManager = this.modalManagerService;

      this.stoCommandParser = new STOCommandParser(eventBus);

      this.selectionService = new SelectionService({ eventBus });
      this.selectionService.init();

      // Modal dialog components - create early so they can be injected into other components
      this.confirmDialogUI = new ConfirmDialogUI({
        eventBus,
        modalManager,
        i18n: this.i18n,
      });

      this.inputDialogUI = new InputDialogUI({
        eventBus,
        modalManager,
        i18n: this.i18n,
      });

      // Retain the confirmation compatibility surface for remaining consumers.
      window.confirmDialog = this.confirmDialogUI;

      this.profileUI = new ProfileUI({
        eventBus,
        ui: stoUI,
        modalManager,
        confirmDialog: this.confirmDialogUI,
        document,
        i18n: this.i18n,
      });

      this.aliasService = new AliasService({
        eventBus,
        i18n: this.i18n,
        ui: stoUI,
      });

      await this.aliasService.init();

      this.aliasBrowserService = new AliasBrowserService({
        ui: stoUI,
        eventBus,
      });

      this.aliasBrowserUI = new AliasBrowserUI({
        eventBus,
        modalManager,
        confirmDialog: this.confirmDialogUI,
        document,
        i18n: this.i18n,
      });

      this.keyBrowserService = new KeyBrowserService({
        eventBus,
        i18n: this.i18n,
        localStorage,
      });

      this.keyBrowserUI = new KeyBrowserUI({
        eventBus,
        document,
        modalManager,
        confirmDialog: this.confirmDialogUI,
        inputDialog: this.inputDialogUI,
        i18n: this.i18n,
      });

      //this.keyBrowserUI.init()

      this.keyService = new KeyService({
        eventBus,
        i18n: this.i18n,
        ui: stoUI,
      });

      this.keyService.init();

      this.importService = new ImportService({
        storage: storageService,
        eventBus,
        i18n: this.i18n,
        ui: stoUI,
      });

      this.importService.init();

      this.exportService = new ExportService({
        storage: storageService,
        eventBus,
        i18n: this.i18n,
      });

      this.exportService.init();

      this.keyCaptureService = new KeyCaptureService({
        eventBus,
        i18n: this.i18n,
      });
      this.keyCaptureService.init();

      this.keyCaptureUI = new KeyCaptureUI({
        eventBus,
        modalManager,
        document,
        i18n: this.i18n,
      });
      this.keyCaptureUI.init();

      this.commandService = new CommandService({
        storage: storageService,
        eventBus,
        i18n: this.i18n,
        ui: stoUI,
      });

      this.commandService.init();

      this.commandLibraryService = new CommandLibraryService({
        eventBus,
        i18n: this.i18n,
        ui: stoUI,
        modalManager,
      });

      this.commandPresentationService = new CommandPresentationService({
        eventBus,
        localStorage: window.localStorage,
      });

      this.commandLibraryUI = new CommandLibraryUI({
        service: this.commandLibraryService,
        eventBus,
        ui: stoUI,
        modalManager,
        document,
        i18n: this.i18n,
      });

      this.commandChainService = new CommandChainService({
        eventBus,
        i18n: this.i18n,
      });
      this.commandChainUI = new CommandChainUI({
        eventBus,
        ui: stoUI,
        document,
        i18n: this.i18n,
      });

      this.parameterCommandService = new ParameterCommandService({
        eventBus,
      });

      this.parameterCommandUI = new ParameterCommandUI({
        eventBus,
        modalManager,
        i18n: this.i18n,
        ui: stoUI,
        document,
      });

      this.commandUI = new CommandUI({
        eventBus,
        ui: stoUI,
        modalManager,
        parameterCommandUI: this.parameterCommandUI,
        confirmDialog: this.confirmDialogUI,
        i18n: this.i18n,
      });

      this.headerMenuUI = new HeaderMenuUI({
        eventBus,
        confirmDialog: this.confirmDialogUI,
        document,
        i18n: this.i18n,
      });

      this.headerToolbarUI = new HeaderToolbarUI({
        eventBus,
        document,
      });

      this.syncUI = new SyncUI({
        eventBus,
        ui: stoUI,
      });

      this.aboutModalUI = new AboutModalUI({
        eventBus,
        document,
      });

      this.interfaceModeService = new InterfaceModeService({
        eventBus,
        storage: storageService,
        app: this,
      });

      this.interfaceModeUI = new InterfaceModeUI({
        eventBus,
        ui: stoUI,
        profileUI: this.profileUI,
        document,
      });

      this.vfxManagerService = new VFXManagerService(eventBus, this.i18n);
      this.vfxManagerUI = new VFXManagerUI({
        eventBus,
        modalManager,
        i18n: this.i18n,
      });
      this.vfxManagerService.init();
      this.vfxManagerUI.init();

      this.preferencesService = new PreferencesService({
        storage: storageService,
        eventBus,
        i18n: this.i18n,
      });
      this.preferencesUI = new PreferencesUI({ eventBus, ui: stoUI });
      this.preferencesManager = this.preferencesUI;
      this.preferencesService.init();
      this.preferencesUI.init();

      this.aliasBrowserService.init();
      this.aliasBrowserUI.init();
      this.commandPresentationService.init();
      this.commandLibraryService.init();
      this.commandLibraryUI.init();
      this.commandChainService.init();
      this.commandChainUI.init();
      this.keyBrowserService.init();
      this.keyBrowserUI.init();
      this.parameterCommandService.init();
      this.commandUI.init();
      this.parameterCommandUI.init();

      this.autoSyncManager = new AutoSync({
        eventBus,
        storage: storageService,
        syncManager: this.syncService,
        ui: stoUI,
        i18n: this.i18n,
      });
      this.autoSyncManager.init();

      this.profileUI.init();

      this.interfaceModeService.init();
      this.headerMenuUI.init();
      this.headerToolbarUI.init();
      this.syncUI.init();
      this.aboutModalUI.init();
      this.interfaceModeUI.init();

      this.profileUI.renderProfiles();

      this.profileUI.updateProfileInfo();

      this.checkAndShowWelcomeMessage();

      stoUI.showToast(
        this.i18n.t("sto_tools_keybind_manager_loaded_successfully"),
        "success",
      );

      this.initialized = true;

      eventBus.emit("sto-app-ready", { app: this });

      window.commandChainUI = this.commandChainUI;

      window.keyBrowserUI = this.keyBrowserUI;
      window.keyBrowserService = this.keyBrowserService;

      this.projectManagementService = new ProjectManagementService({
        storage: storageService,
        ui: stoUI,
        app: this,
        eventBus,
        i18n: this.i18n,
      });

      this.projectManagementService.init();

      this.importUI = new ImportUI({
        eventBus,
        document,
        i18n: this.i18n,
        modalManager: this.modalManagerService,
      });
      this.importUI.init();

      const { default: BindsetService } = await import(
        "./components/services/BindsetService.js"
      );
      const { default: BindsetManagerUI } = await import(
        "./components/ui/BindsetManagerUI.js"
      );
      const { default: BindsetSelectorService } = await import(
        "./components/services/BindsetSelectorService.js"
      );
      const { default: BindsetSelectorUI } = await import(
        "./components/ui/BindsetSelectorUI.js"
      );

      this.bindsetService = new BindsetService({ eventBus });
      this.bindsetManagerUI = new BindsetManagerUI({
        eventBus,
        i18n: this.i18n,
        confirmDialog: this.confirmDialogUI,
        inputDialog: this.inputDialogUI,
      });
      this.bindsetService.init();
      this.bindsetManagerUI.init();

      this.bindsetSelectorService = new BindsetSelectorService({ eventBus });
      this.bindsetSelectorUI = new BindsetSelectorUI({
        eventBus,
        confirmDialog: this.confirmDialogUI,
        document,
        i18n: this.i18n,
      });
      this.bindsetSelectorService.init();
      this.bindsetSelectorUI.init();
    } catch (error) {
      if (stoUI?.showToast) {
        stoUI.showToast(this.i18n.t("failed_to_load_application"), "error");
      }

      throw error; // Re-throw to ensure the error is visible
    }
  }

  generateCommandId() {
    return `cmd_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  // Welcome message functionality (moved from welcome mixin)
  isFirstTime() {
    return !localStorage.getItem("sto_keybind_manager_visited");
  }

  checkAndShowWelcomeMessage() {
    if (this.isFirstTime()) {
      localStorage.setItem("sto_keybind_manager_visited", "true");
      this.modalManagerService?.show("aboutModal");
    }
  }
}
