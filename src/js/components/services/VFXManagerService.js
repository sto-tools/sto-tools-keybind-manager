import ComponentBase from "../ComponentBase.js";
import { formatAliasLine } from "../../lib/STOFormatter.js";
import { getSnapshotProfile } from "./dataState.js";

/** @typedef {'space' | 'ground'} VFXEnvironment */
/** @typedef {{ selectedEffects?: { space?: string[], ground?: string[] }, showPlayerSay?: boolean }} VertigoSettings */
/** @typedef {import('./serviceTypes.js').ProfileData & { vertigoSettings?: VertigoSettings }} VFXProfile */
/** @typedef {{ space: Set<string>, ground: Set<string> }} SelectedEffects */
/** @typedef {import('../../types/rpc/base.js').VirtualAlias} VirtualAlias */

export default class VFXManagerService extends ComponentBase {
  /**
   * @param {import('./serviceTypes.js').EventBus} eventBus
   * @param {import('./serviceTypes.js').I18n} i18n
   */
  constructor(eventBus, i18n) {
    super(eventBus);
    this.componentName = "VFXManagerService";
    this.i18n = i18n;

    /** @type {SelectedEffects} */
    this.selectedEffects = {
      space: new Set(),
      ground: new Set(),
    };
    this.showPlayerSay = false;

    this._vfxInitialized = false;
    this._vfxDataAuthorityEpoch = 0;
    this._vfxDataRevision = -1;
    /** @type {string | null} */
    this._acceptedVFXStateSignature = null;
    /** @type {Array<() => void>} */
    this._responseDetachFunctions = [];
    this._vfxSettingsPublishScheduled = false;
    /** @type {import('../../types/events/base.js').VfxSettingsSnapshot | null} */
    this._pendingVFXSettingsEvent = null;
    this._vfxPublishGeneration = 0;

    // Register request/response handlers for virtual VFX aliases
    this.setupRequestHandlers();
  }

  setupRequestHandlers() {
    if (!this.eventBus || this._responseDetachFunctions.length > 0) return;

    this._responseDetachFunctions.push(
      this.respond("vfx:get-virtual-aliases", () =>
        this.getVirtualVFXAliases(),
      ),
    );
  }

  onInit() {
    if (this._vfxInitialized) {
      console.log(`[${this.componentName}] Already initialized`);
      return;
    }

    this.setupRequestHandlers();
    this.setupEventListeners();
    this._vfxInitialized = true;
    console.log(`[${this.componentName}] Initialized`);
  }

  onDestroy() {
    for (const detach of this._responseDetachFunctions) detach();
    this._responseDetachFunctions = [];
    this._vfxInitialized = false;
    this._vfxDataAuthorityEpoch = 0;
    this._vfxDataRevision = -1;
    this._acceptedVFXStateSignature = null;
    this._vfxSettingsPublishScheduled = false;
    this._pendingVFXSettingsEvent = null;
    this._vfxPublishGeneration += 1;
  }

  // Handle initial state from other components
  /** @param {import('../../types/events/component-state.js').ComponentStateReply} reply */
  handleInitialState(reply) {
    if (reply.sender === "DataCoordinator") {
      this.adoptCoordinatorVFXState(reply.state);
    }
  }

  setupEventListeners() {
    const eventBus = this.eventBus;
    if (!eventBus) return;

    // Simple VFX Manager operations - no request/response overhead
    this.addEventListener("vfx:show-modal", () => this.showModal());
    this.addEventListener("vfx:save-effects", () => this.saveEffects());

    this.addEventListener("data:state-changed", ({ state }) => {
      this.adoptCoordinatorVFXState(state);
    });
  }

  /**
   * Derive VFX state only from the exact DataCoordinator snapshot accepted by
   * ComponentBase. Ready revisions from a replacement authority are admitted,
   * while duplicate or stale predecessor deliveries are ignored.
   *
   * @param {import('../../types/events/component-state.js').DataCoordinatorStateSnapshot} delivered
   */
  adoptCoordinatorVFXState(delivered) {
    const accepted = this.cache.dataState;
    if (
      !accepted ||
      accepted.authorityEpoch !== delivered.authorityEpoch ||
      accepted.revision !== delivered.revision ||
      (accepted.authorityEpoch === this._vfxDataAuthorityEpoch &&
        accepted.revision === this._vfxDataRevision)
    ) {
      return;
    }

    const replacementAuthority =
      accepted.authorityEpoch !== this._vfxDataAuthorityEpoch;
    this._vfxDataAuthorityEpoch = accepted.authorityEpoch;
    this._vfxDataRevision = accepted.revision;
    this.loadState(getSnapshotProfile(accepted), {
      force: replacementAuthority,
      profileId: accepted.ready ? accepted.currentProfile : null,
    });
  }

  // Generate alias line for display (formatted for STO export only)
  /** @param {VFXEnvironment} environment */
  generateAlias(environment) {
    const effects = Array.from(this.selectedEffects[environment]);
    if (effects.length === 0) return this.i18n.t("no_effects_selected");

    const aliasName = `dynFxSetFXExclusionList_${environment.charAt(0).toUpperCase() + environment.slice(1)}`;
    const commands = this.generateAliasCommand(environment);
    // Only join with $$ for STO file export format
    const commandString = commands.join(" $$ ");

    return formatAliasLine(aliasName, { commands: commandString }).trim();
  }

  // Generate just the command part (without alias definition) for storage
  /** @param {VFXEnvironment} environment */
  generateAliasCommand(environment) {
    // Defensive check to ensure selectedEffects is properly initialized
    if (!this.selectedEffects || !this.selectedEffects[environment]) {
      console.warn(
        `[${this.componentName}] generateAliasCommand: selectedEffects not properly initialized for ${environment}`,
      );
      console.warn(
        `[${this.componentName}] selectedEffects state:`,
        this.selectedEffects,
      );
      return [];
    }

    const effects = Array.from(this.selectedEffects[environment]);
    console.log(
      `[${this.componentName}] generateAliasCommand(${environment}): found ${effects.length} effects:`,
      effects,
    );

    if (effects.length === 0) {
      console.log(
        `[${this.componentName}] generateAliasCommand(${environment}): No effects selected, returning empty command`,
      );
      return [];
    }

    const commands = [`dynFxSetFXExlusionList ${effects.join(",")}`];

    if (this.showPlayerSay) {
      // Check translateGeneratedMessages preference - only translate if enabled
      const shouldTranslate = this.cache.preferences.translateGeneratedMessages;
      const message = shouldTranslate
        ? this.i18n.t("vfx_suppression_loaded")
        : "VFX Suppression Loaded";
      commands.push(`PlayerSay ${message}`);
    }

    console.log(
      `[${this.componentName}] generateAliasCommand(${environment}): generated commands:`,
      commands,
    );
    return commands;
  }

  // Generate just the command part (without alias definition) for storage
  /** @param {VFXEnvironment | VFXEnvironment[]} environments */
  generateCombinedAliasCommand(environments) {
    // Ensure environments is an array
    const envArray = Array.isArray(environments)
      ? environments
      : [environments];

    // Defensive check to ensure selectedEffects is properly initialized
    if (!this.selectedEffects) {
      console.warn(
        `[${this.componentName}] generateCombinedAliasCommand: selectedEffects not properly initialized, returning empty command`,
      );
      return [];
    }

    /** @type {string[]} */
    const allEffects = [];

    for (const environment of envArray) {
      if (!this.selectedEffects[environment]) {
        console.warn(
          `[${this.componentName}] generateCombinedAliasCommand: selectedEffects not properly initialized for ${environment}, skipping`,
        );
        continue;
      }

      const environmentEffects = Array.from(this.selectedEffects[environment]);
      if (environmentEffects.length === 0) continue;

      allEffects.push(...environmentEffects);
    }

    if (allEffects.length === 0) return [];

    const commands = [`dynFxSetFXExlusionList ${allEffects.join(",")}`];

    if (this.showPlayerSay) {
      // Check translateGeneratedMessages preference - only translate if enabled
      const shouldTranslate = this.cache.preferences.translateGeneratedMessages;
      const message = shouldTranslate
        ? this.i18n.t("vfx_suppression_loaded")
        : "VFX Suppression Loaded";
      commands.push(`PlayerSay ${message}`);
    }

    return commands;
  }

  // Toggle an effect
  /** @param {VFXEnvironment} environment @param {string} effectName */
  toggleEffect(environment, effectName) {
    if (!this.selectedEffects[environment]) {
      throw new Error(`Invalid environment: ${environment}`);
    }

    if (!effectName) {
      throw new Error(
        `Invalid effect: ${effectName} for environment: ${environment}`,
      );
    }

    if (this.selectedEffects[environment].has(effectName)) {
      this.selectedEffects[environment].delete(effectName);
    } else {
      this.selectedEffects[environment].add(effectName);
    }
  }

  // Set all effects for an environment
  /** @param {VFXEnvironment} environment */
  selectAllEffects(environment) {
    // Explicitly access VFX_EFFECTS from window object for clarity
    const effectsByEnvironment =
      /** @type {import('./serviceTypes.js').AppWindow} */ (window)
        .VFX_EFFECTS || {};
    if (!effectsByEnvironment[environment]) {
      throw new Error(`Invalid environment: ${environment}`);
    }

    if (!this.selectedEffects[environment]) {
      throw new Error(`Invalid environment: ${environment}`);
    }

    effectsByEnvironment[environment].forEach((effect) => {
      this.selectedEffects[environment].add(effect.effect);
    });
  }

  // Get effect count for an environment
  /** @param {VFXEnvironment} environment */
  getEffectCount(environment) {
    if (!this.selectedEffects[environment]) {
      throw new Error(`Invalid environment: ${environment}`);
    }
    return this.selectedEffects[environment].size;
  }

  // Check if effect is selected
  /** @param {VFXEnvironment} environment @param {string} effectName */
  isEffectSelected(environment, effectName) {
    if (!this.selectedEffects[environment]) {
      throw new Error(`Invalid environment: ${environment}`);
    }
    return this.selectedEffects[environment].has(effectName);
  }

  // Load state from current profile
  /**
   * @param {VFXProfile | null | undefined} profile
   * @param {{ force?: boolean, profileId?: string | null }} [options]
   */
  loadState(profile, { force = false, profileId = profile?.id ?? null } = {}) {
    // Ensure selectedEffects is properly initialized
    if (!this.selectedEffects) {
      this.selectedEffects = {
        space: new Set(),
        ground: new Set(),
      };
      console.log(
        `[${this.componentName}] loadState: Initialized selectedEffects object`,
      );
    }

    const settings = profile?.vertigoSettings;
    const nextState = {
      profileId,
      selectedEffects: {
        space: [...(settings?.selectedEffects?.space || [])],
        ground: [...(settings?.selectedEffects?.ground || [])],
      },
      showPlayerSay: settings?.showPlayerSay || false,
    };
    const signature = JSON.stringify(nextState);
    const changed = signature !== this._acceptedVFXStateSignature;
    if (!changed && !force) return;

    if (settings) {
      console.log(
        `[${this.componentName}] loadState: Found vertigoSettings in profile:`,
        settings,
      );

      // Restore selected effects
      this.selectedEffects.space = new Set(nextState.selectedEffects.space);
      this.selectedEffects.ground = new Set(nextState.selectedEffects.ground);

      console.log(
        `[${this.componentName}] loadState: Loaded space effects:`,
        Array.from(this.selectedEffects.space),
      );
      console.log(
        `[${this.componentName}] loadState: Loaded ground effects:`,
        Array.from(this.selectedEffects.ground),
      );

      // Restore PlayerSay setting
      this.showPlayerSay = nextState.showPlayerSay;
    } else {
      console.log(
        `[${this.componentName}] loadState: No vertigoSettings found in profile, resetting to defaults`,
      );
      console.log(
        `[${this.componentName}] loadState: Profile structure:`,
        profile,
      );
      // Reset to defaults if no saved state
      this.selectedEffects.space.clear();
      this.selectedEffects.ground.clear();
      this.showPlayerSay = false;
    }

    this._acceptedVFXStateSignature = signature;
    if (changed) {
      // Publish after the complete data:state-changed fanout so downstream
      // consumers combine the new VFX projection with the same profile revision.
      this.scheduleVFXSettingsChanged({
        selectedEffects: {
          space: Array.from(this.selectedEffects.space),
          ground: Array.from(this.selectedEffects.ground),
        },
        showPlayerSay: this.showPlayerSay,
      });
    }
  }

  /**
   * Coalesce derived state while the authoritative data snapshot is fanning out.
   * The generation prevents a queued publication from escaping a destroy/reinit
   * boundary and reviving a retired service owner.
   *
   * @param {import('../../types/events/base.js').VfxSettingsSnapshot} settings
   */
  scheduleVFXSettingsChanged(settings) {
    this._pendingVFXSettingsEvent = settings;
    if (this._vfxSettingsPublishScheduled) return;

    this._vfxSettingsPublishScheduled = true;
    const generation = this._vfxPublishGeneration;
    queueMicrotask(() => {
      if (generation !== this._vfxPublishGeneration || this.destroyed) return;

      this._vfxSettingsPublishScheduled = false;
      const pending = this._pendingVFXSettingsEvent;
      this._pendingVFXSettingsEvent = null;
      if (pending) this.emit("vfx:settings-changed", pending);
    });
  }

  // Get virtual VFX aliases for CommandLibrary display
  // These are NOT stored in profile - only generated dynamically
  getVirtualVFXAliases() {
    /** @type {Record<string, VirtualAlias>} */
    const virtualAliases = {};

    // Generate environment-specific aliases
    /** @type {VFXEnvironment[]} */
    const environments = ["space", "ground"];
    environments.forEach((environment) => {
      const commands = this.generateAliasCommand(environment);
      // Always create virtual aliases, even when empty (for export consistency)
      const aliasName = `dynFxSetFXExclusionList_${environment.charAt(0).toUpperCase() + environment.slice(1)}`;
      virtualAliases[aliasName] = {
        commands,
        description: this.i18n.t("vfx_suppression_for_environment", {
          environment,
        }),
        type: "vfx-alias",
        virtual: true, // Mark as virtual
      };
    });

    // Generate combined alias (always create, even when empty)
    const combinedCommands = this.generateCombinedAliasCommand(environments);
    virtualAliases.dynFxSetFXExclusionList_Combined = {
      commands: combinedCommands,
      description: this.i18n.t("vfx_suppression_for_all_environments"),
      type: "vfx-alias",
      virtual: true, // Mark as virtual
    };

    return virtualAliases;
  }

  async showModal() {
    console.log(`[${this.componentName}] Showing VFX modal`);

    const snapshot = this.cache.dataState;
    const profile = getSnapshotProfile(snapshot);
    if (profile) {
      this.loadState(profile, {
        force: true,
        profileId: snapshot?.ready ? snapshot.currentProfile : null,
      });
      console.log(
        `[${this.componentName}] Loaded VFX state from accepted coordinator snapshot`,
      );
    }

    // Emit event to populate and show the modal
    this.emit("vfx:modal-populate", {
      vfxManager: this, // Pass the service itself as the vfxManager
    });
  }

  async saveEffects() {
    console.log(`[${this.componentName}] Saving VFX effects`);

    // Defensive check to ensure selectedEffects is properly initialized
    if (
      !this.selectedEffects ||
      !this.selectedEffects.space ||
      !this.selectedEffects.ground
    ) {
      console.error(
        `[${this.componentName}] ERROR: selectedEffects not properly initialized:`,
        this.selectedEffects,
      );
      return;
    }

    console.log(
      `[${this.componentName}] Current selected effects:`,
      this.selectedEffects,
    );
    console.log(`[${this.componentName}] Show player say:`, this.showPlayerSay);
    console.log(
      `[${this.componentName}] Current profile:`,
      this.cache.currentProfile,
    );

    const snapshot = this.cache.dataState;
    const profileId = snapshot?.ready ? snapshot.currentProfile : null;
    const profile = getSnapshotProfile(snapshot);

    // Save to current profile via DataCoordinator
    if (profileId && profile) {
      try {
        const vertigoSettings = {
          selectedEffects: {
            space: Array.from(this.selectedEffects.space),
            ground: Array.from(this.selectedEffects.ground),
          },
          showPlayerSay: this.showPlayerSay,
        };

        await this.request("data:update-profile", {
          profileId,
          properties: {
            vertigoSettings,
          },
          updateSource: "VFXManagerService",
        });

        console.log(
          `[${this.componentName}] VFX settings saved to profile: ${profileId}`,
        );
      } catch (error) {
        console.error(
          `[${this.componentName}] ERROR: Failed to update profile:`,
          error,
        );
      }
    } else {
      console.error(`[${this.componentName}] ERROR: No current profile set`);
    }

    this.emit("modal:hide", { modalId: "vertigoModal" });
  }

  // Get current state for late-join support
  /** @returns {import('../../types/events/component-state.js').ComponentState<'VFXManagerService'>} */
  getCurrentState() {
    return {
      selectedEffects: {
        space: Array.from(this.selectedEffects.space),
        ground: Array.from(this.selectedEffects.ground),
      },
      showPlayerSay: this.showPlayerSay,
    };
  }
}
