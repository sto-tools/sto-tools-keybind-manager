import ComponentBase from "../ComponentBase.js";
import * as eventPayloads from "../../core/eventPayloads.js";
import {
  getEffectiveCommandBindset,
  getSnapshotCommands,
  getSnapshotProfile,
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
    this.addEventListener("selection:state-changed", () => {
      this._editGeneration += 1;
    });
    this.addEventListener("preferences:loaded", () => {
      this._editGeneration += 1;
    });

    this.addEventListener("environment:changed", (data) => {
      this._editGeneration += 1;
      const env = typeof data === "string" ? data : data?.environment;
      if (env) {
        const selectedKeyName =
          this.cache.currentEnvironment === "alias"
            ? this.cache.selectedAlias
            : this.cache.selectedKey;
        if (selectedKeyName) {
          this.refreshCommands(this._lifecycleGeneration);
        }
      }
    });

    this.addEventListener("bindset-selector:active-changed", (data) => {
      this._editGeneration += 1;
      const newName = eventPayloads.activeBindsetFromPayload(data);
      if (newName) {
        this.refreshCommands(this._lifecycleGeneration);
      }
    });

    this.addEventListener("bindset-selector:key-added", async ({ key }) => {
      const lifecycleGeneration = this._lifecycleGeneration;
      if (key === this.cache.selectedKey) {
        const cmds = await this.getCommandsForSelectedKey();
        this._publishChainCommands(cmds, lifecycleGeneration);
      }
    });

    this.addEventListener("key-selected", async () => {
      const lifecycleGeneration = this._lifecycleGeneration;
      this._editGeneration += 1;
      if (this.cache.currentEnvironment === "alias") return;
      const cmds = await this.getCommandsForSelectedKey();
      this._publishChainCommands(cmds, lifecycleGeneration);
    });

    this.addEventListener("alias-selected", async ({ name }) => {
      const lifecycleGeneration = this._lifecycleGeneration;
      this._editGeneration += 1;
      if (!name) return;
      const cmds = await this.getCommandsForSelectedKey();
      this._publishChainCommands(cmds, lifecycleGeneration);
    });

    this.addEventListener("command-added", async () => {
      const lifecycleGeneration = this._lifecycleGeneration;
      const cmds = await this.getCommandsForSelectedKey();
      this._publishChainCommands(cmds, lifecycleGeneration);
    });

    /** @param {{ commands?: import('./serviceTypes.js').StoredCommand[] } | null | undefined} payload */
    const refreshAfterChange = async (payload) => {
      const lifecycleGeneration = this._lifecycleGeneration;
      let cmds = Array.isArray(payload?.commands) ? payload.commands : null;
      if (!cmds) {
        cmds = await this.getCommandsForSelectedKey();
      }
      this._publishChainCommands(cmds, lifecycleGeneration);
    };

    this.addEventListener("command-edited", async (data) => {
      await refreshAfterChange(data);
    });
    this.addEventListener("command-deleted", async (data) => {
      await refreshAfterChange(data);
    });
    this.addEventListener("command-moved", async (data) => {
      await refreshAfterChange(data);
    });

    // Note: command:add events are now handled by CommandUI
    // CommandChainService only handles the resulting command-added events
    // Edit command
    this.addEventListener("commandchain:edit", ({ index }) =>
      this.editCommandAtIndex(index),
    );

    // Delete command
    this.addEventListener("commandchain:delete", async ({ index }) => {
      const lifecycleGeneration = this._lifecycleGeneration;
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
        const commands = await this.getCommandsForSelectedKey();
        this._publishChainCommands(commands, lifecycleGeneration);
      } catch (error) {
        if (this._isCurrentLifecycle(lifecycleGeneration)) {
          console.error("Failed to delete command:", error);
        }
      }
    });

    // Move command
    this.addEventListener(
      "commandchain:move",
      async ({ fromIndex, toIndex }) => {
        const lifecycleGeneration = this._lifecycleGeneration;
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
          const commands = await this.getCommandsForSelectedKey();
          this._publishChainCommands(commands, lifecycleGeneration);
        } catch (error) {
          if (this._isCurrentLifecycle(lifecycleGeneration)) {
            console.error("Failed to move command:", error);
          }
        }
      },
    );

    // Clear entire chain when broadcast event received (Button in UI)
    this.addEventListener("command-chain:clear", async ({ key }) => {
      if (!key) return;
      const effectiveBindset = this.getEffectiveCommandBindset();
      await this.clearCommandChain(
        key,
        effectiveBindset === "Primary Bindset" ? null : effectiveBindset,
      );
    });

    this.addEventListener("preferences:changed", () => {
      this._editGeneration += 1;
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
      return cmds;
    } catch (error) {
      console.error("Failed to get commands for selected key:", error);
      return [];
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

  /** @param {number} lifecycleGeneration */
  _isCurrentLifecycle(lifecycleGeneration) {
    return !this.destroyed && lifecycleGeneration === this._lifecycleGeneration;
  }

  /**
   * @param {import('./serviceTypes.js').StoredCommand[]} commands
   * @param {number} lifecycleGeneration
   */
  _publishChainCommands(commands, lifecycleGeneration) {
    if (!this._isCurrentLifecycle(lifecycleGeneration)) return false;
    this.emit("chain-data-changed", { commands });
    return true;
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
      this._isCurrentLifecycle(lifecycleGeneration) &&
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
    const lifecycleGeneration = this._lifecycleGeneration;
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

      if (!this._isCurrentLifecycle(lifecycleGeneration)) return false;
      if (result?.success) {
        return this._publishChainCommands([], lifecycleGeneration);
      } else {
        console.error(
          "CommandChainService: Failed to save profile via DataCoordinator",
        );
        return false;
      }
    } catch (error) {
      if (this._isCurrentLifecycle(lifecycleGeneration)) {
        console.error(
          "CommandChainService: Failed to clear command chain:",
          error,
        );
      }
      return false;
    }
  }

  /** @param {number} [lifecycleGeneration] */
  async refreshCommands(lifecycleGeneration = this._lifecycleGeneration) {
    const selectedKeyName =
      this.cache.currentEnvironment === "alias"
        ? this.cache.selectedAlias
        : this.cache.selectedKey;
    if (selectedKeyName) {
      const cmds = await this.getCommandsForSelectedKey();
      return this._publishChainCommands(cmds, lifecycleGeneration);
    }
    return false;
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
      if (!this._isCurrentLifecycle(lifecycleGeneration)) {
        return { success: false };
      }
      if (result?.success) {
        return { success: true };
      }
      return { success: false };
    } catch (err) {
      if (!this._isCurrentLifecycle(lifecycleGeneration)) {
        return { success: false };
      }
      console.error("[CommandChainService] setStabilize failed", err);
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
