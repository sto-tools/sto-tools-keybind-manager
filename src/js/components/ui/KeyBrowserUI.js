import UIComponentBase from "../UIComponentBase.js";
import BindsetDeleteConfirmUI from "./BindsetDeleteConfirmUI.js";
import {
  getSnapshotPrimaryKeys,
  getSnapshotProfile,
} from "../services/dataState.js";
import { renderKeyBrowserGrid } from "./keyBrowserGridDom.js";
import {
  acceptViewState,
  cacheViewState,
  clearKeyBrowserError,
  closeBindsetMenus,
  completeInitialRender,
  filterKeyGrid,
  projectViewModeButton,
  readKeyGridAction,
  reconcileViewStateDom,
  scheduleKeyBrowserVisibility,
  showKeyBrowserError,
  showAllKeyGridItems,
  toggleBindsetMenu,
  toggleKeySearchInput,
} from "./keyBrowserViewDom.js";
import {
  bindsetErrorTranslationKey,
  planBindsetDeletion,
  planBindsetMutation,
} from "./keyBrowserBindsetWorkflow.js";
import {
  captureKeyBrowserActionContext,
  isCurrentKeyBrowserDataState,
  isPendingKeyBrowserActionCurrent,
  isSettledKeyBrowserActionCurrent,
} from "./keyBrowserActionContext.js";
import {
  asHTMLElement,
  asHTMLInputElement,
  eventElement,
  resolveDocument,
  resolveI18n,
} from "./uiTypes.js";

/** @typedef {import('../services/serviceTypes.js').StoredCommand} KeyCommand */
/** @typedef {Record<string, KeyCommand[]>} KeyMap */
/** @typedef {import('../../types/events/component-state.js').KeyBrowserViewStateSnapshot} KeyBrowserViewStateSnapshot */
/** @typedef {import('../../types/events/component-state.js').DataCoordinatorStateSnapshot} DataStateSnapshot */
/** @typedef {{ environment?: string, newMode?: string, mode?: string }} EnvironmentChange */
/** @typedef {{ key?: string, value?: unknown, changes?: Record<string, unknown> }} PreferenceChange */
/**
 * @typedef {{
 *   selectedKey: string | null,
 *   selectedAlias: string | null,
 *   currentEnvironment: string,
 *   currentProfile: string | null,
 *   profile: import('../services/serviceTypes.js').ProfileData | null,
 *   keys: KeyMap,
 *   aliases: Record<string, unknown>,
 *   builds: Record<string, unknown>,
 *   preferences: { bindsetsEnabled?: boolean, bindToAliasMode?: boolean, theme?: string },
 *   activeBindset: string,
 *   bindsetNames: string[],
 *   dataState: DataStateSnapshot | null,
 *   keyBrowserViewState: KeyBrowserViewStateSnapshot | null
 * }} KeyBrowserCache
 */

/**
 * KeyBrowserUI owns lifecycle, protocol dispatch, accepted state, and atomic
 * installation. Detached renderers and workflow planners receive captured
 * inputs and never discover application state or register listeners.
 */
export default class KeyBrowserUI extends UIComponentBase {
  /**
   * @param {{
   *   eventBus?: import('./uiTypes.js').EventBus,
   *   modalManager?: import('./uiTypes.js').ModalManagerLike | null,
   *   confirmDialog?: import('./uiTypes.js').ConfirmDialogLike | null,
   *   inputDialog?: import('./uiTypes.js').InputDialogLike | null,
   *   bindsetDeleteConfirm?: { confirm: (name: string, count: number, context: string) => Promise<boolean>, cancelActiveConfirmation?: () => boolean },
   *   document?: Document,
   *   i18n?: import('./uiTypes.js').I18nLike
   * }} [options]
   */
  constructor({
    eventBus,
    modalManager = null,
    confirmDialog = null,
    inputDialog = null,
    bindsetDeleteConfirm,
    i18n,
    document,
  } = {}) {
    super(eventBus);
    this.componentName = "KeyBrowserUI";
    this.modalManager = modalManager;
    this.confirmDialog = confirmDialog;
    this.inputDialog = inputDialog;
    this.i18n = resolveI18n(i18n);
    this.document = resolveDocument(document);
    /** @type {KeyBrowserCache} */
    this.cache = {
      ...this.cache,
      selectedKey: null,
      selectedAlias: null,
      currentEnvironment: "space",
      currentProfile: null,
      profile: null,
      keys: {},
      aliases: {},
      builds: {},
      preferences: {},
      activeBindset: "Primary Bindset",
      bindsetNames: ["Primary Bindset"],
      dataState: null,
      keyBrowserViewState: null,
    };
    this.bindsetDeleteConfirm =
      bindsetDeleteConfirm ??
      new BindsetDeleteConfirmUI({
        eventBus: this.eventBus ?? undefined,
        modalManager: this.modalManager ?? undefined,
        document: this.document,
        i18n: this.i18n,
      });
    this.eventListenersSetup = false;
    this._renderGeneration = 0;
    this._lifecycleGeneration = 0;
    /** @type {{ dataState: DataStateSnapshot, environment: string } | null} */
    this._committedGridContext = null;
    /** @type {ReturnType<typeof setTimeout> | null} */
    this._errorTimer = null;
  }

  onInit() {
    this.setupEventListeners();
  }

  onDestroy() {
    this._renderGeneration += 1;
    this._lifecycleGeneration += 1;
    this.eventListenersSetup = false;
    this.pendingInitialRender = false;
    this.cache.keyBrowserViewState = null;
    this._committedGridContext = null;
    clearKeyBrowserError(this);
    this.bindsetDeleteConfirm.cancelActiveConfirmation?.();
  }

  setupEventListeners() {
    if (this.eventListenersSetup) return;
    this.eventListenersSetup = true;
    const missingTarget = this.document.createDocumentFragment();
    /** @param {string} id */
    const target = (id) => this.document.getElementById(id) ?? missingTarget;

    this.onDom(target("addKeyBtn"), "click", () =>
      this.showKeySelectionModal(),
    );
    this.onDom(target("deleteKeyBtn"), "click", () => {
      if (this.cache.selectedKey)
        void this.confirmDeleteKey(this.cache.selectedKey);
    });
    this.onDom(target("duplicateKeyBtn"), "click", () => {
      if (this.cache.selectedKey) this.duplicateKey(this.cache.selectedKey);
    });
    this.onDomDebounced(
      target("keyFilter"),
      "input",
      (event) => {
        const input = asHTMLInputElement(event.target);
        if (input) this.filterKeys(input.value);
      },
      250,
    );
    this.onDom(target("keyFilter"), "keydown", (event) => {
      const input = asHTMLInputElement(event.target);
      if (!input) return;
      if (!("key" in event) || typeof event.key !== "string") return;
      if (event.key === "Escape") {
        event.preventDefault();
        input.value = "";
        input.classList.remove("expanded");
        this.filterKeys("");
      } else if (event.key === "Enter") {
        input.classList.remove("expanded");
        input.blur();
      }
    });
    this.onDom(target("showAllKeysBtn"), "click", () => this.showAllKeys());
    this.onDom(target("toggleKeyViewBtn"), "click", () => {
      void this.toggleKeyView().catch((error) => {
        console.error("[KeyBrowserUI] Failed to cycle key view mode:", error);
      });
    });
    this.onDom(target("keySearchBtn"), "click", () => this.toggleKeySearch());
    this.onDom(target("keyGrid"), "click", (event) => {
      void this.handleGridClick(event).catch((error) => {
        console.error("[KeyBrowserUI] Grid action failed:", error);
      });
    });
    this.onDom(this.document, "click", (event) => {
      const target = eventElement(event);
      if (!target?.closest(".bindset-actions")) {
        this.closeAllBindsetMenus();
      }
    });

    this.addEventListener("key:list-changed", () => this.scheduleRender());
    this.addEventListener("key-browser:state-changed", (state) => {
      acceptViewState(this, state);
    });
    this.addEventListener("data:state-changed", ({ state }) => {
      if (!isCurrentKeyBrowserDataState(this, state)) return;
      this._committedGridContext = null;
      if (this.pendingInitialRender) completeInitialRender(this);
      else this.scheduleRender();
    });
    this.addEventListener(
      "environment:changed",
      /** @param {string | EnvironmentChange} value */ (value = {}) => {
        const environment =
          typeof value === "string"
            ? value
            : value.environment || value.newMode || value.mode;
        if (!environment) return;
        this.toggleVisibility(environment);
        if (environment !== "alias") this.scheduleRender();
      },
    );
    this.addEventListener("key-selected", () => this.scheduleRender());
    this.addEventListener("profile:switched", () => this.scheduleRender());
    this.addEventListener("language:changed", () => {
      const state = this.cache.keyBrowserViewState;
      if (state) projectViewModeButton(this, state.mode);
      this.scheduleRender();
    });
    this.addEventListener(
      "preferences:changed",
      /** @param {PreferenceChange} data */ (data) => {
        const changes =
          data.changes || (data.key ? { [data.key]: data.value } : {});
        if (
          Object.keys(changes).some((key) =>
            ["theme", "bindsetsEnabled", "bindToAliasMode"].includes(key),
          )
        ) {
          this.scheduleRender();
        }
      },
    );
    this.addEventListener("bindsets:changed", () => {
      if (this.shouldShowBindsetSections()) this.scheduleRender();
    });
  }

  scheduleRender() {
    void this.render().catch((error) => {
      console.error("[KeyBrowserUI] Render failed:", error);
    });
  }

  /** @param {KeyBrowserViewStateSnapshot} state */
  cacheKeyBrowserViewState(state) {
    return cacheViewState(this, state);
  }

  reconcileKeyBrowserViewState() {
    reconcileViewStateDom(this);
  }

  async render() {
    const generation = ++this._renderGeneration;
    const grid = this.document.getElementById("keyGrid");
    if (!grid) return;
    const snapshot = this.cache.dataState;
    const environment =
      snapshot?.currentEnvironment || this.cache.currentEnvironment;
    const profile = getSnapshotProfile(snapshot);
    if (!profile) {
      if (generation !== this._renderGeneration || this.destroyed) return;
      const empty = this.document.createElement("div");
      empty.className = "empty-state";
      empty.innerHTML = '<i class="fas fa-folder-open"></i>';
      const title = this.document.createElement("h4");
      title.textContent = this.i18n.t("no_profile_selected");
      empty.appendChild(title);
      grid.classList.remove("categorized");
      grid.replaceChildren(empty);
      if (snapshot?.ready) {
        this._committedGridContext = { dataState: snapshot, environment };
      }
      return;
    }
    if (!snapshot?.ready) return;
    const mode = this.getCurrentViewMode();
    const viewState = this.cache.keyBrowserViewState;
    if (!mode || !viewState) return;
    const primaryKeyMap = getSnapshotPrimaryKeys(snapshot, environment);
    const result = await renderKeyBrowserGrid({
      document: this.document,
      i18n: this.i18n,
      mode,
      profile,
      environment,
      primaryKeyMap,
      viewState,
      showBindsetSections: Boolean(
        this.cache.preferences?.bindsetsEnabled &&
          this.cache.preferences?.bindToAliasMode &&
          environment !== "alias",
      ),
      selectedKey: this.cache.selectedKey,
      activeBindset: this.cache.activeBindset,
      sortKeys: (keys) => this.request("key:sort", { keys }),
      categorizeByCommand: (keysWithCommands, allKeys) =>
        this.request("key:categorize-by-command", {
          keysWithCommands,
          allKeys,
        }),
      categorizeByType: (keysWithCommands, allKeys) =>
        this.request("key:categorize-by-type", {
          keysWithCommands,
          allKeys,
        }),
    });
    if (generation !== this._renderGeneration || this.destroyed) return;
    grid.classList.toggle("categorized", result.categorized);
    grid.replaceChildren(result.fragment);
    this._committedGridContext = { dataState: snapshot, environment };
    this.reconcileKeyBrowserViewState();
  }

  getCurrentViewMode() {
    return this.cache.keyBrowserViewState?.mode ?? null;
  }

  shouldShowBindsetSections() {
    return Boolean(
      this.cache.preferences?.bindsetsEnabled &&
        this.cache.preferences?.bindToAliasMode &&
        this.cache.currentEnvironment !== "alias",
    );
  }

  /** @param {Event} event */
  async handleGridClick(event) {
    const grid = asHTMLElement(this.document.getElementById("keyGrid"));
    const context = this._committedGridContext;
    if (!grid || !context || context.dataState !== this.cache.dataState) return;
    const action = readKeyGridAction(event.target, grid);
    if (!action) return;

    if (action.type === "select-key") {
      await this.request("key:select", {
        keyName: action.keyName,
        environment: context.environment,
        bindset:
          action.bindsetName && action.bindsetName !== "Primary Bindset"
            ? action.bindsetName
            : null,
      });
    } else if (action.type === "toggle-category") {
      await this.toggleKeyCategory(action.categoryId, action.mode);
    } else if (action.type === "toggle-bindset") {
      await this.toggleBindsetSection(action.bindsetName);
    } else if (action.type === "toggle-bindset-menu") {
      this.toggleBindsetMenu(action.menu);
    } else {
      this.closeAllBindsetMenus();
      if (action.operation === "create") await this.handleCreateBindset();
      if (action.operation === "clone")
        await this.handleCloneBindset(action.bindsetName);
      if (action.operation === "rename")
        await this.handleRenameBindset(action.bindsetName);
      if (action.operation === "delete")
        await this.confirmDeleteBindset(action.bindsetName);
    }
  }

  /** @param {string} categoryId @param {string} [mode] */
  async toggleKeyCategory(categoryId, mode = "command") {
    await this.request("key:toggle-category", { categoryId, mode });
  }

  /** @param {string} bindsetName */
  async toggleBindsetSection(bindsetName) {
    await this.request("bindset:toggle-collapse", { bindsetName });
  }

  async toggleKeyView() {
    if (this.cache.currentEnvironment === "alias") return;
    await this.request("key:cycle-view-mode");
  }

  /** @param {string} [filter] */
  filterKeys(filter = "") {
    filterKeyGrid(this.document, filter);
  }

  showAllKeys() {
    showAllKeyGridItems(this.document);
  }

  toggleKeySearch() {
    return toggleKeySearchInput(this.document);
  }

  /** @param {string} environment */
  toggleVisibility(environment) {
    const schedule =
      this.document.defaultView?.requestAnimationFrame?.bind(
        this.document.defaultView,
      ) ??
      globalThis.requestAnimationFrame ??
      ((callback) => callback(0));
    scheduleKeyBrowserVisibility(this.document, environment, schedule);
  }

  /** @param {HTMLElement} menu */
  toggleBindsetMenu(menu) {
    toggleBindsetMenu(this.document, menu);
  }

  closeAllBindsetMenus() {
    closeBindsetMenus(this.document);
  }

  /** @param {import('../../types/events/component-state.js').ComponentStateReply} reply */
  handleInitialState(reply) {
    const priorDataState = this.cache.dataState;
    const wasPendingInitialRender = this.pendingInitialRender;
    if (reply.sender === "KeyBrowserService") {
      acceptViewState(this, reply.state);
    }
    super.handleInitialState(reply);
    if (
      reply.sender === "DataCoordinator" &&
      this.cache.dataState !== priorDataState
    ) {
      this._committedGridContext = null;
      if (!wasPendingInitialRender && !this.pendingInitialRender) {
        this.scheduleRender();
      }
    }
    if (
      reply.sender === "KeyBrowserService" ||
      reply.sender === "SelectionService"
    )
      return;
    const state = reply.state;
    const environment =
      ("environment" in state ? state.environment : undefined) ||
      ("currentEnvironment" in state ? state.currentEnvironment : undefined);
    if (typeof environment === "string") this.toggleVisibility(environment);
  }

  showKeySelectionModal() {
    this.modalManager?.show("keySelectionModal");
  }

  /** @param {string} keyName */
  async confirmDeleteKey(keyName) {
    if (!keyName || !this.confirmDialog) return false;
    const context = captureKeyBrowserActionContext(this);
    const confirmed = await this.confirmDialog.confirm(
      this.i18n.t("confirm_delete_key", { keyName }),
      this.i18n.t("confirm_delete"),
      "danger",
      "keyDelete",
    );
    if (!confirmed || !isPendingKeyBrowserActionCurrent(this, context))
      return false;
    const result = await this.request("key:delete", { key: keyName });
    if (!isSettledKeyBrowserActionCurrent(this, context)) return false;
    if (result?.success) {
      this.showToast(this.i18n.t("key_deleted", { keyName }), "success");
      return true;
    }
    this.showToast(
      this.i18n.t(result?.error || "error", result?.params),
      "error",
    );
    return false;
  }

  /** @param {string | null} key */
  duplicateKey(key) {
    if (!key) return false;
    this.emit("key:duplicate", { key });
    return true;
  }

  /** @param {unknown} error */
  showError(error) {
    showKeyBrowserError(this, this.i18n.t(bindsetErrorTranslationKey(error)));
  }

  /** @param {'create' | 'clone' | 'rename'} operation @param {string} [sourceName] */
  async runBindsetMutation(operation, sourceName) {
    const context = captureKeyBrowserActionContext(this);
    const plan = await planBindsetMutation({
      operation,
      sourceName,
      existingNames: [...this.cache.bindsetNames],
      inputDialog: this.inputDialog,
      i18n: this.i18n,
    });
    if (!plan || !isPendingKeyBrowserActionCurrent(this, context)) return false;
    /** @type {import('./uiTypes.js').ActionResult} */
    let result;
    if (plan.topic === "bindset:create") {
      result = /** @type {import('./uiTypes.js').ActionResult} */ (
        await this.request("bindset:create", plan.payload)
      );
    } else if (plan.topic === "bindset:clone") {
      result = /** @type {import('./uiTypes.js').ActionResult} */ (
        await this.request("bindset:clone", plan.payload)
      );
    } else {
      result = /** @type {import('./uiTypes.js').ActionResult} */ (
        await this.request("bindset:rename", plan.payload)
      );
    }
    if (!isSettledKeyBrowserActionCurrent(this, context)) return false;
    if (!result?.success) this.showError(result?.error);
    return Boolean(result?.success);
  }

  handleCreateBindset() {
    return this.runBindsetMutation("create");
  }

  /** @param {string} bindsetName */
  handleCloneBindset(bindsetName) {
    return this.runBindsetMutation("clone", bindsetName);
  }

  /** @param {string} bindsetName */
  handleRenameBindset(bindsetName) {
    return this.runBindsetMutation("rename", bindsetName);
  }

  /** @param {string} bindsetName */
  async confirmDeleteBindset(bindsetName) {
    const context = captureKeyBrowserActionContext(this);
    const plan = await planBindsetDeletion({
      profile: getSnapshotProfile(context.dataState),
      bindsetName,
      confirmDialog: this.confirmDialog,
      bindsetDeleteConfirm: this.bindsetDeleteConfirm,
      i18n: this.i18n,
    });
    if (!plan || !isPendingKeyBrowserActionCurrent(this, context)) return false;
    const result =
      plan.topic === "bindset:delete"
        ? await this.request("bindset:delete", plan.payload)
        : await this.request("bindset:delete-with-keys", plan.payload);
    if (!isSettledKeyBrowserActionCurrent(this, context)) return false;
    if (result?.success) {
      this.showToast(
        this.i18n.t("bindset_deleted", { name: bindsetName }),
        "success",
      );
      return true;
    }
    this.showToast(
      this.i18n.t(
        result?.error || "error",
        /** @type {import('i18next').TOptions | undefined} */ (result?.params),
      ),
      "error",
    );
    return false;
  }

  /** @param {string} bindsetName */
  handleDeleteBindset(bindsetName) {
    return this.confirmDeleteBindset(bindsetName);
  }

  hasRequiredData() {
    return Boolean(
      this.cache.dataState?.ready && this.cache.keyBrowserViewState !== null,
    );
  }

  performInitialRender() {
    this.scheduleRender();
  }
}
