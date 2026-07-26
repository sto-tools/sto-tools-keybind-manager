import ComponentBase from "../ComponentBase.js";
import { localizeCommands as defaultLocalizeCommands } from "../../data.js";
import { extensionPreferenceKey } from "./preferenceKeys.js";
import {
  hasValidKnownSettingValue,
  isKnownSettingKey,
  sanitizeStoredSettings,
} from "./settingsDataBoundary.js";
import {
  applyOtherPreferences,
  applyPreferenceEffects,
  PreferencesApplicationEffectsError,
  reportPreferencesActivationError,
  updatePreferenceThemeToggle,
} from "./preferencesApplicationEffects.js";
import { createDefaultPreferencesSettings } from "./preferencesDefaults.js";
import {
  invalidMutationError,
  materializePreferencesActivationRequest,
  requirePreferenceMutation,
} from "./preferencesMutationBoundary.js";
import {
  activatePersistedPreferences,
  commitPreferenceSetting,
  persistSyncFolderPreferenceSettings,
  preferencesActivationFailure,
  replacePreferenceSettings,
  runExternalPreferencesActivation,
} from "./preferencesOwnerMutationOperations.js";
import {
  createPreferencesStateSnapshot,
  isCurrentPreferencesStateAuthority,
  nextPreferencesStateAuthorityEpoch,
} from "./preferencesState.js";
import {
  preparePreferencesTransition,
  publishPreferencesTransitionReceipts,
  settlePreferencesMutation,
} from "./preferencesTransitionState.js";

/** @typedef {import('../../types/events/base.js').KnownPreferenceKey} KnownPreferenceKey */
/** @typedef {import('../../types/events/base.js').KnownPreferencesSettings} KnownPreferencesSettings */
/** @typedef {import('../../types/events/base.js').PreferencesSettings} PreferencesSettings */
/** @typedef {import('../../types/events/base.js').SettingsRecord} SettingsRecord */
/** @typedef {import('../../types/rpc/parameters-preferences.js').PreferencesActivationResult} PreferencesActivationResult */
/** @typedef {import('../../types/rpc/parameters-preferences.js').PreferencesActivationSource} PreferencesActivationSource */
/** @typedef {import('../../types/rpc/parameters-preferences.js').SyncFolderSettingsMutation} SyncFolderSettingsMutation */

// DOM and i18n are shared process capabilities. Serializing application work
// across owner lifecycles ensures a delayed predecessor finishes before its
// replacement reapplies the winning state.
let preferencesEffectTail = Promise.resolve();

/**
 * PreferencesService – persistent user settings (theme, language, etc.)
 * Pure logic / no DOM querying.  UI interactions live in PreferencesUI.
 */
export default class PreferencesService extends ComponentBase {
  /** @param {{ storage?: import('./serviceTypes.js').Storage, eventBus?: import('./serviceTypes.js').EventBus, i18n?: import('./serviceTypes.js').I18n, localizeCommands?: typeof defaultLocalizeCommands, applyTranslations?: (root?: Document | Element | null) => void }} [options] */
  constructor({
    storage,
    eventBus,
    i18n,
    localizeCommands,
    applyTranslations,
  } = {}) {
    super(eventBus);
    this.componentName = "PreferencesService";
    this.storage = storage;
    this.i18n = i18n;
    this.localizeCommands = localizeCommands ?? defaultLocalizeCommands;
    this.applyTranslations = applyTranslations ?? (() => {});

    // Defaults
    /** @type {PreferencesSettings} */
    this.defaultSettings = createDefaultPreferencesSettings();

    // Runtime copy
    /** @type {PreferencesSettings} */
    this.settings = { ...this.defaultSettings };
    this._lifecycleGeneration = 0;
    this._stateAuthorityEpoch = 0;
    this._stateRevision = 0;
    this._languageActivationDirty = true;
    /** @type {import('../../types/events/component-state.js').PreferencesStateSnapshot | null} */
    this._currentStateSnapshot = null;
    /** @type {Promise<import('../../types/events/component-state.js').PreferencesStateSnapshot | null>} */
    this.initialStateReady = Promise.resolve(null);
    /** @type {((state: import('../../types/events/component-state.js').PreferencesStateSnapshot) => void) | null} */
    this._resolveInitialState = null;
    /** @type {((error: unknown) => void) | null} */
    this._rejectInitialState = null;
    this._mutationTail = Promise.resolve();
    this._effectInvocationInProgress = false;
    /** @type {Array<() => void>} */
    this._responseDetachFunctions = [];
  }

  init() {
    if (this.initialized) return;
    this._beginLifecycle();
    super.init();
  }

  _beginLifecycle() {
    this._lifecycleGeneration += 1;
    this._stateAuthorityEpoch = nextPreferencesStateAuthorityEpoch();
    this._stateRevision = 0;
    this._languageActivationDirty = true;
    this.settings = { ...this.defaultSettings };
    this._currentStateSnapshot = createPreferencesStateSnapshot(this.settings, {
      authorityEpoch: this._stateAuthorityEpoch,
      ready: false,
      revision: 0,
    });
    this.initialStateReady = new Promise((resolve, reject) => {
      this._resolveInitialState = resolve;
      this._rejectInitialState = reject;
    });
    // Lifecycle owners may be initialized by callers that do not observe the
    // barrier. Keep the public promise rejecting while preventing an unhandled
    // rejection from masking the actual startup error.
    void this.initialStateReady.catch(() => undefined);
  }

  /** @param {number} generation */
  _assertCurrentLifecycle(generation) {
    if (
      generation !== this._lifecycleGeneration ||
      !isCurrentPreferencesStateAuthority(this._stateAuthorityEpoch) ||
      !this.initialized ||
      this.destroyed
    ) {
      throw new Error("operation_cancelled");
    }
  }

  attachResponders() {
    if (!this.eventBus || this._responseDetachFunctions.length > 0) return;
    this._responseDetachFunctions = [
      this.respond("preferences:activate-persisted-settings", (payload) => {
        const request = materializePreferencesActivationRequest(payload);
        return request
          ? this.activatePersistedSettings(request.source)
          : preferencesActivationFailure(
              new TypeError("invalid_preferences_activation_request"),
            );
      }),
      this.respond("preferences:persist-sync-folder-settings", (mutation) =>
        this.persistSyncFolderSettings(mutation),
      ),
      this.respond("preferences:save-settings", () => this.saveSettings()),
      this.respond("preferences:set-setting", (mutation) => {
        const request = requirePreferenceMutation(mutation);
        return request.extension === true
          ? this.setExtensionSetting(request.key, request.value)
          : this.setSetting(request.key, request.value);
      }),
      this.respond("preferences:set-settings", (newSettings) =>
        this.setSettings(newSettings),
      ),
    ];
  }

  setupEventListeners() {
    if (!this.eventBus) return;

    // Listen for theme toggle events from HeaderMenuUI
    this.addEventListener("theme:toggle", () => {
      try {
        void this.toggleTheme().catch((error) => {
          console.error("[PreferencesService] Failed to toggle theme", error);
        });
      } catch (error) {
        console.error("[PreferencesService] Failed to toggle theme", error);
      }
    });

    // Listen for language change events from HeaderMenuUI
    this.addEventListener("language:change", ({ language }) => {
      if (language) {
        void this.changeLanguage(language).catch((error) => {
          console.error(
            "[PreferencesService] Failed to change language",
            error,
          );
        });
      }
    });
  }

  onInit() {
    const generation = this._lifecycleGeneration;
    const resolveInitialState = this._resolveInitialState;
    const rejectInitialState = this._rejectInitialState;
    void this._loadInitialState(generation).then(
      (snapshot) => {
        resolveInitialState?.(snapshot);
        if (this._resolveInitialState === resolveInitialState) {
          this._resolveInitialState = null;
          this._rejectInitialState = null;
        }
      },
      (error) => {
        rejectInitialState?.(error);
        if (this._rejectInitialState === rejectInitialState) {
          this._resolveInitialState = null;
          this._rejectInitialState = null;
        }
      },
    );
  }

  /**
   * Read and apply the durable settings once, then expose the first ready owner
   * snapshot. Storage read failures retain the established defaults fallback;
   * language or application failures reject readiness without publishing ready.
   * @param {number} generation
   */
  async _loadInitialState(generation) {
    /** @type {PreferencesSettings} */
    let nextSettings = { ...this.defaultSettings };
    try {
      if (this.storage) {
        const stored = this.storage.getSettings();
        nextSettings = sanitizeStoredSettings(stored, this.defaultSettings);
      }
      console.log("[PreferencesService] loadSettings", {
        settings: { ...nextSettings },
      });
    } catch (err) {
      console.error("[PreferencesService] loadSettings failed", err);
      nextSettings = { ...this.defaultSettings };
    }

    this._assertCurrentLifecycle(generation);
    this.settings = nextSettings;
    this._stateRevision = 1;
    await this.applySettings({ generation, localizeCommands: true });
    this._assertCurrentLifecycle(generation);
    this._languageActivationDirty = false;
    this._currentStateSnapshot = createPreferencesStateSnapshot(this.settings, {
      authorityEpoch: this._stateAuthorityEpoch,
      ready: true,
      revision: this._stateRevision,
    });
    this.attachResponders();
    this.setupEventListeners();
    this._publishState("startup-loaded");
    this._assertCurrentLifecycle(generation);
    this.emit("preferences:loaded", { settings: this.getSettings() });
    this._assertCurrentLifecycle(generation);
    return this.getCurrentState();
  }

  saveSettings() {
    const generation = this._readyMutationGeneration();
    const publication = this._enqueueMutation(() => {
      this._assertCurrentLifecycle(generation);
      if (!this.storage) return { ok: false, settlement: null };
      const settings = this.getSettings();
      const ok = this.persistSettings(settings);
      console.log("[PreferencesService] saveSettings", { ok, settings });
      if (!ok) return { ok: false, settlement: null };
      this._assertCurrentLifecycle(generation);
      return publishPreferencesTransitionReceipts(
        this,
        generation,
        settings,
        null,
        null,
      );
    });
    return settlePreferencesMutation(publication, () =>
      this._assertCurrentLifecycle(generation),
    );
  }

  // Accessors
  getSettings() {
    return structuredClone(this.settings);
  }

  /** @param {string} key */
  getSetting(key) {
    return structuredClone(this.settings[key]);
  }

  /**
   * @template {KnownPreferenceKey} Key
   * @param {Key} key
   * @param {KnownPreferencesSettings[Key]} value
   * @returns {Promise<boolean>}
   */
  setSetting(key, value) {
    if (!isKnownSettingKey(key) || !hasValidKnownSettingValue(key, value)) {
      throw invalidMutationError({ key, value });
    }
    return this.commitSetting(key, value);
  }

  /**
   * Explicit mutation path for application-defined extension preferences.
   * @param {string} key
   * @param {unknown} value
   * @returns {Promise<boolean>}
   */
  setExtensionSetting(key, value) {
    const extensionKey = extensionPreferenceKey(key);
    return this.commitSetting(extensionKey, value);
  }

  /** @param {string} key @param {unknown} value @returns {Promise<boolean>} */
  commitSetting(key, value) {
    return commitPreferenceSetting(this, key, value);
  }

  /** @param {SettingsRecord} [newSettings] @returns {Promise<boolean>} */
  setSettings(newSettings = {}) {
    return replacePreferenceSettings(this, newSettings);
  }

  /**
   * Re-read the standalone durable settings record after another authoritative
   * workflow has replaced it. The transition joins the owner mutation queue
   * and is fully prepared before adoption. Project restore only reads the
   * record written by import; application reset clears it inside the same
   * serialized owner transition before adopting defaults.
   * @param {PreferencesActivationSource} source
   * @returns {Promise<PreferencesActivationResult>}
   */
  async activatePersistedSettings(source) {
    return activatePersistedPreferences(this, source);
  }

  /**
   * Serialize an external durable workflow with its optional activation of the
   * standalone settings record. This is a narrow composition capability, not a
   * state-access API.
   *
   * @template Result
   * @param {PreferencesActivationSource} source
   * @param {(
   *   activatePersistedSettings: () => Promise<PreferencesActivationResult>,
   *   assertTransitionActive: () => void
   * ) => Result | Promise<Result>} operation
   * @returns {Promise<Result>}
   */
  runExternalActivationTransition(source, operation) {
    return runExternalPreferencesActivation(this, source, operation);
  }

  /**
   * Persist and publish the selected sync folder without applying settings or
   * emitting preferences:saved. The next saved publication, normally produced
   * by the Preferences modal Save action, remains SyncService's established
   * import/overwrite trigger.
   * @param {SyncFolderSettingsMutation} mutation
   * @returns {Promise<boolean>}
   */
  persistSyncFolderSettings(mutation) {
    return persistSyncFolderPreferenceSettings(this, mutation);
  }

  /** @param {PreferencesSettings} settings @returns {boolean} */
  persistSettings(settings) {
    if (!this.storage) return false;
    return (
      this.storage.saveSettings(structuredClone(settings), {
        replace: true,
      }) === true
    );
  }

  /**
   * @param {PreferencesSettings} settings
   * @returns {import('../../types/events/protocol.js').EventEmitResult}
   */
  publishSavedSettings(settings) {
    return Promise.resolve(
      this.emit(
        "preferences:saved",
        { settings: structuredClone(settings) },
        { synchronous: true },
      ),
    );
  }

  _readyMutationGeneration() {
    const generation = this._lifecycleGeneration;
    if (this._effectInvocationInProgress) {
      throw new Error("preferences_effect_in_progress");
    }
    if (!this._currentStateSnapshot?.ready) {
      throw new Error("preferences_not_ready");
    }
    this._assertCurrentLifecycle(generation);
    return generation;
  }

  /**
   * Serialize owner transitions, but release the queue as soon as publications
   * are invoked. Callers await saved-listener settlement outside this tail.
   * @template Result
   * @param {() => Result | Promise<Result>} operation
   * @returns {Promise<Result>}
   */
  _enqueueMutation(operation) {
    const result = this._mutationTail.then(operation);
    this._mutationTail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  /**
   * Guard only the synchronous entry into a one-way effect capability. The
   * guard is released before a returned promise is awaited, so unrelated
   * concurrent user mutations still queue normally.
   * @template Result
   * @param {() => Result} capability
   * @returns {Result}
   */
  _invokeEffectCollaborator(capability) {
    this._effectInvocationInProgress = true;
    try {
      return capability();
    } finally {
      this._effectInvocationInProgress = false;
    }
  }

  /**
   * Attempt every required application effect before exposing the new state.
   * Once persistence has accepted a transition, activation degradation cannot
   * revoke durable success: publish the canonical owner snapshot and let the
   * normal saved/changed receipts continue after logging the effect failure.
   * @param {import('../../types/events/component-state.js').PreferencesStateSnapshot} state
   * @param {import('../../types/events/preferences.js').PreferencesStateChangeReason} reason
   * @param {{ generation: number, localizeCommands: boolean }} application
   */
  async _applyAndPublishTransition(state, reason, application) {
    /** @type {unknown} */
    let applicationError;
    let effectsDegraded = false;
    try {
      await this.applySettings(application);
    } catch (error) {
      applicationError = error;
      effectsDegraded = true;
    }
    this._assertCurrentLifecycle(application.generation);
    this._currentStateSnapshot = state;
    this._publishState(reason, state);
    this._assertCurrentLifecycle(application.generation);
    reportPreferencesActivationError(applicationError);
    return {
      effectsDegraded,
      languageActivationFailed:
        applicationError instanceof PreferencesApplicationEffectsError
          ? applicationError.languageActivationFailed
          : Boolean(effectsDegraded && application.localizeCommands),
    };
  }

  /**
   * @param {PreferencesSettings} settings
   */
  _prepareSettingsTransition(settings) {
    return preparePreferencesTransition(
      settings,
      this._stateAuthorityEpoch,
      this._stateRevision,
    );
  }

  /** @param {ReturnType<typeof preparePreferencesTransition>} prepared */
  _adoptPreparedTransition(prepared) {
    this.settings = prepared.settings;
    this._stateRevision = prepared.state.revision;
    return prepared.state;
  }

  /**
   * @param {import('../../types/events/preferences.js').PreferencesStateChangeReason} reason
   * @param {import('../../types/events/component-state.js').PreferencesStateSnapshot} [state]
   */
  _publishState(reason, state = this.getCurrentState()) {
    this.emit("preferences:state-changed", { reason, state });
    return state;
  }

  // Late-join state sharing
  // Provide current settings so late-joining components can use them without
  // making explicit RPC requests that may race the service startup.
  /** @returns {import('../../types/events/component-state.js').ComponentState<'PreferencesService'>} */
  getCurrentState() {
    if (!this._currentStateSnapshot) {
      throw new Error("PreferencesService state is unavailable before init");
    }
    return this._currentStateSnapshot;
  }

  // Application of settings
  /** @param {{ generation?: number, localizeCommands?: boolean }} [options] */
  async applySettings({
    generation = this._lifecycleGeneration,
    localizeCommands = false,
  } = {}) {
    const application = preferencesEffectTail.then(() =>
      this._applySettingsNow({ generation, localizeCommands }),
    );
    preferencesEffectTail = application.then(
      () => undefined,
      () => undefined,
    );
    return application;
  }

  /** @param {{ generation: number, localizeCommands: boolean }} options */
  async _applySettingsNow({ generation, localizeCommands }) {
    this._assertCurrentLifecycle(generation);
    await applyPreferenceEffects({
      settings: this.settings,
      i18n: this.i18n,
      localizeCommands: this.localizeCommands,
      applyTranslations: this.applyTranslations,
      localizeCommandCatalog: localizeCommands,
      assertCurrent: () => this._assertCurrentLifecycle(generation),
      invokeCollaborator: (capability) =>
        this._invokeEffectCollaborator(capability),
    });
  }

  applyOtherSettings() {
    applyOtherPreferences(this.settings);
  }

  // Theme Management
  /** @returns {Promise<boolean>} */
  toggleTheme() {
    const currentTheme = this.settings.theme || "default";
    const newTheme = currentTheme === "dark" ? "default" : "dark";

    return this.setSetting("theme", newTheme);
  }

  /** @param {string} theme */
  updateThemeToggleButton(theme) {
    updatePreferenceThemeToggle(theme, this.i18n);
  }

  // Language Management
  /** @param {string} lang */
  async changeLanguage(lang) {
    return this.setSetting("language", lang);
  }

  onDestroy() {
    this._lifecycleGeneration += 1;
    this._rejectInitialState?.(new Error("operation_cancelled"));
    this._resolveInitialState = null;
    this._rejectInitialState = null;
    for (const detach of this._responseDetachFunctions) detach();
    this._responseDetachFunctions = [];
  }
}
