import ComponentBase from "../ComponentBase.js";
import * as eventPayloads from "../../core/eventPayloads.js";
import {
  getEffectiveCommandBindset,
  getSnapshotCommands,
  getSnapshotProfile,
  isSnapshotCommandStabilized,
} from "./dataState.js";
import { findCommandDefinition } from "../../data/commandCatalog.js";
import {
  planCommandChainClear,
  planCommandStabilization,
} from "./commandChainOperations.js";
import {
  captureCommandEditTarget,
  isCommandEditTargetCurrent,
  planCommandEdit,
} from "./commandChainEditPlanning.js";

/**
 * CommandChainService - Manages command chain display and editing operations
 * Responsible for adding, deleting, and reordering commands within chains
 * Fully decoupled - communicates only via event bus and request/response
 */
export default class CommandChainService extends ComponentBase {
  /** @param {{ i18n?: import('./serviceTypes.js').I18n, eventBus?: import('./serviceTypes.js').EventBus | null }} [options] */
  constructor({ i18n, eventBus = null } = {}) {
    super(eventBus);
    this.componentName = "CommandChainService";
    this.i18n = i18n;

    /** @type {import('./serviceTypes.js').StoredCommand[]} */
    this.commands = [];

    // Flag to prevent race conditions during bindset switching
    this._bindsetSwitchInProgress = false;
    this._bindsetOperationInProgress = false;

    // Store detach functions for cleanup
    /** @type {Array<() => void>} */
    this._responseDetachFunctions = [];
    this._lifecycleGeneration = 0;
    this._editGeneration = 0;
  }

  setupRequestHandlers() {
    if (!this.eventBus || this._responseDetachFunctions.length > 0) return;

    this._responseDetachFunctions.push(
      this.respond("command:set-stabilize", ({ name, stabilize, bindset }) =>
        this.setStabilize(name, stabilize, bindset),
      ),
    );
  }

  onInit() {
    this._lifecycleGeneration += 1;
    this._editGeneration += 1;
    this.setupRequestHandlers();
    this.setupEventListeners();
  }

  setupEventListeners() {
    /**
     * @param {string} label
     * @param {unknown} payload
     */
    const debugLog = (label, payload) => {
      if (typeof window !== "undefined") {
        console.log(`[CommandChainService] ${label}:`, payload);
      }
    };

    this.addEventListener("selection:state-changed", () => {
      this._editGeneration += 1;
    });
    this.addEventListener("preferences:loaded", () => {
      this._editGeneration += 1;
    });

    // DataCoordinator integration - listen for profile updates
    this.addEventListener("profile:updated", (data) => {
      if (data?.profile && data?.profileId) {
        const profileWithId = { ...data.profile, id: data.profileId };
        this.updateCacheFromProfile(profileWithId);
        // Profile broadcasts update cached state only. Rendering is driven by
        // the specific selection or command event that caused the change; a
        // blanket refresh here can race a newly selected key and repaint the
        // command chain with the previous key's commands.
      }
    });

    this.addEventListener("profile:switched", (data) => {
      // ComponentBase handles profile/environment caching automatically
      // Just update our specific cache data from the profile if available
      if (data.profile) {
        this.updateCacheFromProfile(data.profile);
      }
      // ComponentBase handles selection clearing automatically when profiles switch
    });

    // Listen for environment changes
    this.addEventListener("environment:changed", (data) => {
      this._editGeneration += 1;
      const env = typeof data === "string" ? data : data?.environment;
      if (env) {
        // ComponentBase handles currentEnvironment caching
        // Refresh commands when environment changes
        const selectedKeyName =
          this.cache.currentEnvironment === "alias"
            ? this.cache.selectedAlias
            : this.cache.selectedKey;
        if (selectedKeyName) {
          this.refreshCommands();
        }
      }
    });

    // Listen for bindset changes to keep activeBindset synced
    console.log(
      "[CommandChainService] Setting up bindset-selector:active-changed listener",
    );
    this.addEventListener("bindset-selector:active-changed", (data) => {
      this._editGeneration += 1;
      const newName = eventPayloads.activeBindsetFromPayload(data);
      console.log(
        `[CommandChainService] *** bindset-selector:active-changed received: ${this.cache.activeBindset} -> ${newName} ***`,
      );
      if (newName) {
        // Set flag to prevent race conditions
        this._bindsetSwitchInProgress = true;
        // ComponentBase handles updating this.cache.activeBindset automatically
        console.log(
          `[CommandChainService] Calling refreshCommands() for bindset: ${newName}`,
        );
        // Refresh commands to show the chain for the new bindset
        this.refreshCommands();
        // Clear flag after a short delay
        setTimeout(() => {
          this._bindsetSwitchInProgress = false;
          console.log(
            `[CommandChainService] Bindset switch completed for: ${newName}`,
          );
        }, 100);
      }
    });

    // Listen for bindset operations to prevent race conditions
    this.addEventListener(
      "bindset-operation:started",
      ({ type, bindset, key }) => {
        console.log(
          `[CommandChainService] Bindset operation started: ${type} key=${key} bindset=${bindset}`,
        );
        this._bindsetOperationInProgress = true;
      },
    );

    this.addEventListener(
      "bindset-operation:completed",
      ({ type, bindset, key }) => {
        console.log(
          `[CommandChainService] Bindset operation completed: ${type} key=${key} bindset=${bindset}`,
        );
        this._bindsetOperationInProgress = false;
      },
    );

    // Listen for key added to bindset - immediately refresh command chain to show empty state
    this.addEventListener(
      "bindset-selector:key-added",
      async ({ key, bindset }) => {
        console.log(
          `[CommandChainService] bindset-selector:key-added received: key=${key}, bindset=${bindset}, selectedKey=${this.cache.selectedKey}`,
        );

        // Only refresh if this is the currently selected key
        if (key === this.cache.selectedKey) {
          console.log(
            `[CommandChainService] Key added to bindset ${bindset} - refreshing command chain to show empty state`,
          );

          // Using synchronous events ensures proper coordination without setTimeout
          console.log(
            `[CommandChainService] About to refresh commands - activeBindset: ${this.cache.activeBindset}, expected: ${bindset}`,
          );
          const cmds = await this.getCommandsForSelectedKey();
          console.log(
            `[CommandChainService] Refreshed commands for new bindset ${bindset}: ${cmds.length} commands`,
          );
          this.emit("chain-data-changed", { commands: cmds });
        }
      },
    );

    // Directly emit chain data changes whenever key/alias selection changes so
    // the command-chain UI always knows what it should be displaying.
    this.addEventListener("key-selected", async (payload) => {
      this._editGeneration += 1;
      const selectedKey = eventPayloads.selectedKeyFromPayload(payload);
      console.log(
        `[CommandChainService] key-selected event received: key=${selectedKey}`,
      );
      debugLog("key-selected", { key: selectedKey });

      // Early debug check
      if (!this.cache) {
        console.error(`[CommandChainService] Cache not available!`);
        return;
      }
      console.log(
        `[CommandChainService] Cache state: currentEnvironment=${this.cache.currentEnvironment}, activeBindset=${this.cache.activeBindset}`,
      );

      if (this.cache.currentEnvironment === "alias") return;

      // Let ComponentBase handle the selection state update
      // ComponentBase will set this.selectedKey = key and clear this.selectedAlias

      // We don't manage bindset changes here - that's BindsetSelectorService's responsibility
      // We simply react to whatever bindset is currently active in the cache
      const cmds = await this.getCommandsForSelectedKey();
      console.log(
        "[CommandChainService] [key-selected] emitting chain-data-changed with",
        cmds.length,
        "commands",
      );
      this.emit("chain-data-changed", { commands: cmds });
    });

    // Handle alias selections explicitly so environment switches to alias
    this.addEventListener("alias-selected", async ({ name }) => {
      this._editGeneration += 1;
      if (!name) return;

      // Let ComponentBase handle the selection state update
      // ComponentBase will set this.selectedAlias = name and clear this.selectedKey

      // Always emit chain-data-changed for alias selections to ensure UI updates
      // The CommandChainUI will handle environment-specific rendering
      const cmds = await this.getCommandsForSelectedKey();
      console.log(
        "[CommandChainService] [alias-selected] emitting chain-data-changed with",
        cmds.length,
        "commands",
      );
      this.emit("chain-data-changed", { commands: cmds });
    });

    // Handle command additions (from CommandService)
    this.addEventListener("command-added", async ({ command, key }) => {
      console.log("[CommandChainService] command-added received:", {
        command,
        key,
      });
      const cmds = await this.getCommandsForSelectedKey();
      console.log(
        "[CommandChainService] emitting chain-data-changed with",
        cmds.length,
        "commands",
      );
      this.emit("chain-data-changed", { commands: cmds });
    });

    /**
     * @param {string} label
     * @param {{ commands?: import('./serviceTypes.js').StoredCommand[] } | null | undefined} payload
     */
    const refreshAfterChange = async (label, payload) => {
      console.log(`[CommandChainService] ${label} received:`, payload);
      let cmds = Array.isArray(payload?.commands) ? payload.commands : null;
      if (!cmds) {
        cmds = await this.getCommandsForSelectedKey();
      }
      this.emit("chain-data-changed", { commands: cmds });
    };

    this.addEventListener("command-edited", async (data) => {
      await refreshAfterChange("command-edited", data);
    });
    this.addEventListener("command-deleted", async (data) => {
      await refreshAfterChange("command-deleted", data);
    });
    this.addEventListener("command-moved", async (data) => {
      await refreshAfterChange("command-moved", data);
    });

    // Note: command:add events are now handled by CommandUI
    // CommandChainService only handles the resulting command-added events
    // Edit command
    this.addEventListener("commandchain:edit", ({ index }) =>
      this.editCommandAtIndex(index),
    );

    // Delete command
    this.addEventListener("commandchain:delete", async ({ index }) => {
      const selectedKeyName =
        this.cache.currentEnvironment === "alias"
          ? this.cache.selectedAlias
          : this.cache.selectedKey;
      if (index === undefined || !selectedKeyName) return;

      // Determine bindset context
      const effectiveBindset = this.getEffectiveCommandBindset();
      const bindsetParam =
        effectiveBindset === "Primary Bindset" ? null : effectiveBindset;
      try {
        await this.request("command:delete", {
          key: selectedKeyName,
          index,
          bindset: bindsetParam,
        });
        this.emit("chain-data-changed", {
          commands: await this.getCommandsForSelectedKey(),
        });
      } catch (error) {
        console.error("Failed to delete command:", error);
      }
    });

    // Move command
    this.addEventListener(
      "commandchain:move",
      async ({ fromIndex, toIndex }) => {
        const selectedKeyName =
          this.cache.currentEnvironment === "alias"
            ? this.cache.selectedAlias
            : this.cache.selectedKey;
        if (!selectedKeyName) return;

        const effectiveBindset = this.getEffectiveCommandBindset();
        const bindsetParam =
          effectiveBindset === "Primary Bindset" ? null : effectiveBindset;
        try {
          await this.request("command:move", {
            key: selectedKeyName,
            fromIndex,
            toIndex,
            bindset: bindsetParam,
          });
          this.emit("chain-data-changed", {
            commands: await this.getCommandsForSelectedKey(),
          });
        } catch (error) {
          console.error("Failed to move command:", error);
        }
      },
    );

    // Clear entire chain when broadcast event received (Button in UI)
    this.addEventListener("command-chain:clear", async ({ key }) => {
      if (!key) return;
      console.log(
        `[CommandChainService] Clearing command chain for key="${key}", activeBindset="${this.cache.activeBindset}", env="${this.cache.currentEnvironment}"`,
      );
      const effectiveBindset = this.getEffectiveCommandBindset();
      await this.clearCommandChain(
        key,
        effectiveBindset === "Primary Bindset" ? null : effectiveBindset,
      );
    });

    // Handle preferences changes for bind-to-alias mode
    this.addEventListener("preferences:changed", (data) => {
      this._editGeneration += 1;
      // Handle both { key, value } and { changes } event formats
      const changes = data.changes || { [data.key]: data.value };

      for (const [key, value] of Object.entries(changes)) {
        if (key === "bindToAliasMode") {
          console.log(
            `[CommandChainService] Preference changed: bindToAliasMode = ${value}`,
          );
          // Use centralized cache instead of local variable
        }
      }
    });
  }

  /** @returns {Promise<import('./serviceTypes.js').StoredCommand[]>} */
  async getCommandsForSelectedKey() {
    try {
      const selectedKeyName =
        this.cache.currentEnvironment === "alias"
          ? this.cache.selectedAlias
          : this.cache.selectedKey;
      if (!selectedKeyName) return [];

      const activeBindset = this.getEffectiveCommandBindset();

      const cmds = getSnapshotCommands(
        this.cache.dataState,
        this.cache.currentEnvironment,
        selectedKeyName,
        activeBindset,
      );
      console.log(
        `[CommandChainService] Read ${cmds.length} commands from accepted snapshot:`,
        cmds,
      );
      return cmds;
    } catch (error) {
      console.error("Failed to get commands for selected key:", error);
      return Array.isArray(this.commands) ? this.commands : [];
    }
  }

  /** @returns {string | null} */
  getEffectiveCommandBindset() {
    const { currentEnvironment, activeBindset, preferences } = this.cache;
    return getEffectiveCommandBindset(
      currentEnvironment,
      activeBindset,
      preferences?.bindsetsEnabled,
    );
  }

  /**
   * Capture and plan one edit from accepted state. Delayed parser work is
   * discarded when a later edit, lifecycle replacement, owner replacement, or
   * exact command-location change supersedes it.
   *
   * @param {number} index
   * @returns {Promise<boolean>}
   */
  async editCommandAtIndex(index) {
    const lifecycleGeneration = this._lifecycleGeneration;
    const editGeneration = ++this._editGeneration;
    const target = captureCommandEditTarget({
      snapshot: this.cache.dataState,
      currentEnvironment: this.cache.currentEnvironment,
      selectedKey: this.cache.selectedKey,
      selectedAlias: this.cache.selectedAlias,
      activeBindset: this.cache.activeBindset,
      bindsetsEnabled: this.cache.preferences?.bindsetsEnabled,
      index,
    });
    if (!target) return false;
    const isCurrent = () =>
      !this.destroyed &&
      lifecycleGeneration === this._lifecycleGeneration &&
      editGeneration === this._editGeneration &&
      isCommandEditTargetCurrent(target, {
        snapshot: this.cache.dataState,
        currentEnvironment: this.cache.currentEnvironment,
        selectedKey: this.cache.selectedKey,
        selectedAlias: this.cache.selectedAlias,
        activeBindset: this.cache.activeBindset,
        bindsetsEnabled: this.cache.preferences?.bindsetsEnabled,
      });

    try {
      const plan = await planCommandEdit({
        target,
        parseCommandString: (commandString) =>
          isCurrent()
            ? this.request("parser:parse-command-string", {
                commandString,
                options: { generateDisplayText: false },
              })
            : Promise.reject(new Error("Command edit superseded")),
        resolveDefinition: (command) =>
          findCommandDefinition(command, this.i18n || null),
        translate: (key, defaultValue) =>
          this.i18n?.t(key, { defaultValue }) || defaultValue,
      });

      if (!isCurrent()) return false;
      if (plan.parameterDerivationError) {
        console.warn(
          "[CommandChainService] Failed to derive parameters from command:",
          plan.parameterDerivationError,
        );
      }

      if (plan.kind === "edit") {
        this.emit("parameter-command:edit", plan.payload);
      } else {
        this.emit("toast:show", { message: plan.message, type: "info" });
      }
      return true;
    } catch (error) {
      if (isCurrent()) {
        console.error(
          "[CommandChainService] Failed to plan command edit:",
          error,
        );
      }
      return false;
    }
  }

  // Clear all commands from a key's command chain
  /**
   * @param {string} key
   * @param {string | null} bindset
   */
  async clearCommandChain(key, bindset = null) {
    try {
      if (!key) {
        console.warn(
          "CommandChainService: Cannot clear chain - no key specified",
        );
        return false;
      }

      const profileId = this.cache.dataState?.currentProfile;
      if (!profileId) {
        console.error(
          "CommandChainService: Cannot clear command chain - no current profile ID available",
        );
        return false;
      }
      const profile = getSnapshotProfile(this.cache.dataState, profileId);
      if (!profile) {
        console.warn(
          "CommandChainService: Cannot clear chain - no active profile",
        );
        return false;
      }

      const currentEnv = this.cache.currentEnvironment || "space";
      const plan = planCommandChainClear({
        profile,
        profileId,
        key,
        environment: currentEnv,
        bindset,
      });
      if (!plan.valid) {
        console.warn(
          `CommandChainService: Cannot clear command chain - ${plan.reason}`,
        );
        return false;
      }

      const result = await this.request(
        "data:update-profile",
        plan.updateProfileRequest,
      );

      if (result?.success) {
        // Emit chain-data-changed with empty commands to update UI immediately
        this.emit("chain-data-changed", { commands: [] });
        return true;
      } else {
        console.error(
          "CommandChainService: Failed to save profile via DataCoordinator",
        );
        return false;
      }
    } catch (error) {
      console.error(
        "CommandChainService: Failed to clear command chain:",
        error,
      );
      return false;
    }
  }

  // Update local cache from profile data received from DataCoordinator
  /** @param {import('./serviceTypes.js').ProfileData | null | undefined} profile */
  updateCacheFromProfile(profile) {
    if (!profile) {
      console.log(
        "[CommandChainService] updateCacheFromProfile called with null/undefined profile",
      );
      return;
    }

    console.log(
      "[CommandChainService] updateCacheFromProfile called with profile:",
      {
        profileId: profile.id,
        environment: this.cache.currentEnvironment,
        stackTrace: new Error().stack,
      },
    );

    // ComponentBase handles profile, currentProfile, keys, and aliases caching
    // We only need to handle service-specific logic here if needed

    console.log("[CommandChainService] Cache updated:", {
      currentProfile: this.cache.currentProfile,
      keysCount: Object.keys(this.cache.keys || {}).length,
      aliasesCount: Object.keys(this.cache.aliases || {}).length,
    });
  }

  // Refresh commands for the currently selected key
  async refreshCommands() {
    const selectedKeyName =
      this.cache.currentEnvironment === "alias"
        ? this.cache.selectedAlias
        : this.cache.selectedKey;
    if (selectedKeyName) {
      const cmds = await this.getCommandsForSelectedKey();
      this.emit("chain-data-changed", { commands: cmds });
    }
  }

  // Get current state for ComponentBase late-join system
  /** @returns {import('../../types/events/component-state.js').ComponentState<'CommandChainService'>} */
  getCurrentState() {
    return {
      commands: this.commands,
      // REMOVED: selectedKey, currentEnvironment, currentProfile - not owned by CommandChainService
      // These are managed by SelectionService (selection) and DataCoordinator (profile/environment)
    };
  }

  // Cleanup
  onDestroy() {
    this._lifecycleGeneration += 1;
    this._editGeneration += 1;
    // Clean up request/response handlers
    if (this._responseDetachFunctions) {
      this._responseDetachFunctions.forEach((detach) => detach());
      this._responseDetachFunctions = [];
    }
  }

  // Return whether the specified key/alias currently has stabilization enabled.
  /**
   * @param {string | null | undefined} name - The key or alias name
   * @param {string | null} bindset - Optional bindset name
   */
  isStabilized(name, bindset = null) {
    return isSnapshotCommandStabilized(
      this.cache.dataState,
      this.cache.currentEnvironment,
      name,
      bindset,
    );
  }

  // Toggle or set stabilization flag for current key / alias.
  /**
   * @param {string} name - The key or alias name
   * @param {boolean} stabilize - Whether to enable stabilization
   * @param {string | null} bindset - Optional bindset name
   * @returns {Promise<import('../../types/rpc/commands.js').StabilizeResult>}
   */
  async setStabilize(name, stabilize = true, bindset = null) {
    const lifecycleGeneration = this._lifecycleGeneration;
    try {
      if (!name) return { success: false };

      const snapshot = this.cache.dataState;
      const profile = getSnapshotProfile(snapshot);
      const profileId = snapshot?.ready ? snapshot.currentProfile : null;
      const environment = snapshot?.currentEnvironment;
      if (!profile || !profileId || !environment) return { success: false };

      const plan = planCommandStabilization({
        profile,
        profileId,
        name,
        environment,
        stabilize,
        bindset,
      });
      if (!plan.valid) return { success: false };

      // Persist via DataCoordinator
      const result = await this.request(
        "data:update-profile",
        plan.updateProfileRequest,
      );
      if (this.destroyed || lifecycleGeneration !== this._lifecycleGeneration) {
        return { success: false };
      }
      if (result?.success) {
        return { success: true };
      }
      return { success: false };
    } catch (err) {
      if (this.destroyed || lifecycleGeneration !== this._lifecycleGeneration) {
        return { success: false };
      }
      console.error("[CommandChainService] setStabilize failed", err);
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  // Handle initial state - ComponentBase now handles PreferencesService automatically
  /** @param {import('../../types/events/component-state.js').ComponentStateReply} reply */
  handleInitialState(reply) {
    super.handleInitialState(reply);

    // ComponentBase automatically handles PreferencesService late-join
    if (reply.sender === "PreferencesService" && this.cache.preferences) {
      console.log(
        `[CommandChainService] Preferences received via ComponentBase: bindToAliasMode = ${this.cache.preferences.bindToAliasMode}`,
      );
    }
  }
}
