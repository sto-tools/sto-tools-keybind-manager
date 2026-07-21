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
import OwnedComponentStack from "./core/ownedComponentStack.js";
import { checkAndShowWelcomeMessage } from "./core/welcomeMessage.js";

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
    this.autoSyncManager = null; // created later when dependencies available
    this.ownedComponents = new OwnedComponentStack(this);

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

    this.importService = null;
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
    if (this.initialized) return;

    const storageService = this.storageService;
    const stoUI = this.ui;
    const create = this.ownedComponents.create.bind(this.ownedComponents);
    let welcomeAttempt = null;

    try {
      if (!this.i18n || !storageService || !stoUI || !this.syncService) {
        throw new Error("Required dependencies not loaded");
      }

      this.modalManagerService = create(ModalManagerService, {
        eventBus,
        i18n: this.i18n,
      });
      this.modalManagerService.init();

      const modalManager = this.modalManagerService;

      this.stoCommandParser = create(STOCommandParser, eventBus);

      this.selectionService = create(SelectionService, { eventBus });
      this.selectionService.init();

      // Modal dialog components - create early so they can be injected into other components
      this.confirmDialogUI = create(ConfirmDialogUI, {
        eventBus,
        modalManager,
        i18n: this.i18n,
      });

      this.inputDialogUI = create(InputDialogUI, {
        eventBus,
        modalManager,
        i18n: this.i18n,
      });

      // Retain the confirmation compatibility surface for remaining consumers.
      window.confirmDialog = this.confirmDialogUI;

      this.profileUI = create(ProfileUI, {
        eventBus,
        ui: stoUI,
        modalManager,
        confirmDialog: this.confirmDialogUI,
        document,
        i18n: this.i18n,
      });

      this.aliasService = create(AliasService, {
        eventBus,
        i18n: this.i18n,
        ui: stoUI,
      });

      await this.aliasService.init();

      this.aliasBrowserService = create(AliasBrowserService, {
        ui: stoUI,
        eventBus,
      });

      this.aliasBrowserUI = create(AliasBrowserUI, {
        eventBus,
        modalManager,
        confirmDialog: this.confirmDialogUI,
        document,
        i18n: this.i18n,
      });

      this.keyBrowserService = create(KeyBrowserService, {
        eventBus,
        i18n: this.i18n,
        localStorage,
      });

      this.keyBrowserUI = create(KeyBrowserUI, {
        eventBus,
        document,
        modalManager,
        confirmDialog: this.confirmDialogUI,
        inputDialog: this.inputDialogUI,
        i18n: this.i18n,
      });

      //this.keyBrowserUI.init()

      this.keyService = create(KeyService, {
        eventBus,
        i18n: this.i18n,
        ui: stoUI,
      });

      this.keyService.init();

      this.importService = create(ImportService, {
        storage: storageService,
        eventBus,
        i18n: this.i18n,
        ui: stoUI,
      });

      this.importService.init();

      this.projectManagementService = create(ProjectManagementService, {
        storage: storageService,
        ui: stoUI,
        app: this,
        eventBus,
        i18n: this.i18n,
      });

      this.projectManagementService.init();

      this.exportService = create(ExportService, {
        storage: storageService,
        eventBus,
        i18n: this.i18n,
      });

      this.exportService.init();

      this.keyCaptureService = create(KeyCaptureService, {
        eventBus,
        i18n: this.i18n,
      });
      this.keyCaptureService.init();

      this.keyCaptureUI = create(KeyCaptureUI, {
        eventBus,
        modalManager,
        document,
        i18n: this.i18n,
      });
      this.keyCaptureUI.init();

      this.commandService = create(CommandService, {
        storage: storageService,
        eventBus,
        i18n: this.i18n,
        ui: stoUI,
      });

      this.commandService.init();

      this.commandLibraryService = create(CommandLibraryService, {
        eventBus,
        i18n: this.i18n,
        ui: stoUI,
        modalManager,
      });

      this.commandPresentationService = create(CommandPresentationService, {
        eventBus,
        localStorage: window.localStorage,
      });

      this.commandLibraryUI = create(CommandLibraryUI, {
        service: this.commandLibraryService,
        eventBus,
        ui: stoUI,
        modalManager,
        document,
        i18n: this.i18n,
      });

      this.commandChainService = create(CommandChainService, {
        eventBus,
        i18n: this.i18n,
      });
      this.commandChainUI = create(CommandChainUI, {
        eventBus,
        ui: stoUI,
        document,
        i18n: this.i18n,
      });

      this.parameterCommandService = create(ParameterCommandService, {
        eventBus,
      });

      this.parameterCommandUI = create(ParameterCommandUI, {
        eventBus,
        modalManager,
        i18n: this.i18n,
        ui: stoUI,
        document,
      });

      this.commandUI = create(CommandUI, {
        eventBus,
        ui: stoUI,
        modalManager,
        parameterCommandUI: this.parameterCommandUI,
        confirmDialog: this.confirmDialogUI,
        i18n: this.i18n,
      });

      this.headerMenuUI = create(HeaderMenuUI, {
        eventBus,
        confirmDialog: this.confirmDialogUI,
        document,
        i18n: this.i18n,
      });

      this.headerToolbarUI = create(HeaderToolbarUI, {
        eventBus,
        document,
      });

      this.syncUI = create(SyncUI, {
        eventBus,
        ui: stoUI,
      });

      this.aboutModalUI = create(AboutModalUI, {
        eventBus,
        document,
      });

      this.interfaceModeService = create(InterfaceModeService, {
        eventBus,
        storage: storageService,
        app: this,
      });

      this.interfaceModeUI = create(InterfaceModeUI, {
        eventBus,
        ui: stoUI,
        profileUI: this.profileUI,
        document,
      });

      this.vfxManagerService = create(VFXManagerService, eventBus, this.i18n);
      this.vfxManagerUI = create(VFXManagerUI, {
        eventBus,
        modalManager,
        i18n: this.i18n,
      });
      this.vfxManagerService.init();
      this.vfxManagerUI.init();

      this.preferencesService = create(PreferencesService, {
        storage: storageService,
        eventBus,
        i18n: this.i18n,
      });
      this.preferencesUI = create(PreferencesUI, { eventBus, ui: stoUI });
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

      this.autoSyncManager = create(AutoSync, {
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

      this.importUI = create(ImportUI, {
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

      this.bindsetService = create(BindsetService, { eventBus });
      this.bindsetManagerUI = create(BindsetManagerUI, {
        eventBus,
        i18n: this.i18n,
        confirmDialog: this.confirmDialogUI,
        inputDialog: this.inputDialogUI,
      });
      this.bindsetService.init();
      this.bindsetManagerUI.init();

      this.bindsetSelectorService = create(BindsetSelectorService, {
        eventBus,
      });
      this.bindsetSelectorUI = create(BindsetSelectorUI, {
        eventBus,
        confirmDialog: this.confirmDialogUI,
        document,
        i18n: this.i18n,
      });
      this.bindsetSelectorService.init();
      this.bindsetSelectorUI.init();

      window.commandChainUI = this.commandChainUI;
      window.keyBrowserUI = this.keyBrowserUI;
      window.keyBrowserService = this.keyBrowserService;

      welcomeAttempt = this.checkAndShowWelcomeMessage();

      stoUI.showToast(
        this.i18n.t("sto_tools_keybind_manager_loaded_successfully"),
        "success",
      );

      this.initialized = true;
      eventBus.emit("sto-app-ready", { app: this });
      welcomeAttempt?.commit();
    } catch (error) {
      try {
        welcomeAttempt?.rollback();
      } catch (rollbackError) {
        console.error("Failed to roll back first-run welcome:", rollbackError);
      }

      if (window.confirmDialog === this.confirmDialogUI) {
        window.confirmDialog = undefined;
      }
      if (window.commandChainUI === this.commandChainUI) {
        window.commandChainUI = undefined;
      }
      if (window.keyBrowserUI === this.keyBrowserUI) {
        window.keyBrowserUI = undefined;
      }
      if (window.keyBrowserService === this.keyBrowserService) {
        window.keyBrowserService = undefined;
      }
      this.initialized = false;

      await this.ownedComponents.destroyAll();

      if (stoUI?.showToast) {
        stoUI.showToast(this.i18n.t("failed_to_load_application"), "error");
      }

      throw error; // Re-throw to ensure the error is visible
    }
  }

  generateCommandId() {
    return `cmd_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  checkAndShowWelcomeMessage() {
    return checkAndShowWelcomeMessage(localStorage, this.modalManagerService);
  }
}
