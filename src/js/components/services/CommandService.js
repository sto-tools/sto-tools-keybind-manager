import ComponentBase from "../ComponentBase.js";
import {
  normalizeToString,
  normalizeToStringArray,
} from "../../lib/commandDisplayAdapter.js";
import { clearImportTarget } from "./commandImportPayload.js";
import {
  getSnapshotProfile,
  getSnapshotCommandImportSources,
  getSnapshotCommands,
  getSnapshotUserAliases,
} from "./dataState.js";
import { findCommandByName } from "../../data/commandCatalog.js";
import { planCommandMutation } from "./commandMutationPlanner.js";
import { planMirroredCommandSequence } from "./commandTransformationPlanner.js";

/**
 * CommandService – the authoritative service for creating, deleting and
 * rearranging commands in a profile.  It owns no UI concerns whatsoever.  A
 * higher-level feature (CommandLibraryService / future templates) can call
 * this service to persist changes and broadcast events.
 */
export default class CommandService extends ComponentBase {
  /** @param {{ storage?: import('./serviceTypes.js').Storage, eventBus: import('./serviceTypes.js').EventBus, i18n: import('./serviceTypes.js').I18n, profileService?: unknown, modalManager?: unknown, ui?: import('./serviceTypes.js').ToastUI | null }} options */
  constructor({
    storage,
    eventBus,
    i18n,
    profileService = null,
    modalManager = null,
    ui = null,
  }) {
    super(eventBus);
    this.componentName = "CommandService";
    this.i18n = i18n;
    this.ui = ui;
    void storage;
    void profileService;
    void modalManager;

    // Store detach functions for cleanup
    /** @type {Array<() => void>} */
    this._responseDetachFunctions = [];
    /** @type {Promise<void>} */
    this._mutationQueue = Promise.resolve();
    this._mutationGeneration = 0;
  }

  setupRequestHandlers() {
    if (!this.eventBus || this._responseDetachFunctions.length > 0) return;

    this._responseDetachFunctions.push(
      this.respond("command:delete", async ({ key, index, bindset }) =>
        this.deleteCommand(key, index, bindset),
      ),
      this.respond(
        "command:move",
        async ({ key, fromIndex, toIndex, bindset }) =>
          this.moveCommand(key, fromIndex, toIndex, bindset),
      ),
      this.respond(
        "command:import-from-source",
        ({ sourceValue, targetKey, clearDestination, currentEnvironment }) =>
          this.importFromSource(
            sourceValue,
            targetKey,
            clearDestination,
            currentEnvironment,
          ),
      ),
      this.respond(
        "command:generate-command-preview",
        ({ key, commands, stabilize = false }) =>
          this.generateCommandPreview(key, commands, stabilize),
      ),
      this.respond(
        "command:generate-mirrored-commands",
        async ({ commands = [] }) => this.generateMirroredCommands(commands),
      ),
    );
  }

  onInit() {
    this._mutationGeneration += 1;
    this.setupRequestHandlers();
    this.setupEventListeners();
  }

  // Core command operations are serialized through one accepted-state planner.
  /** @param {number} generation */
  _isCurrentMutationGeneration(generation) {
    return (
      this.initialized &&
      !this.destroyed &&
      generation === this._mutationGeneration
    );
  }

  _captureCommandMutationContext() {
    const snapshot = this.cache.dataState;
    return {
      authorityEpoch: snapshot?.ready ? snapshot.authorityEpoch : null,
      profileId: snapshot?.ready ? snapshot.currentProfile : null,
      environment: snapshot?.ready ? snapshot.currentEnvironment : "",
    };
  }

  /** @param {{ authorityEpoch: number | null, profileId: string | null, environment: string }} context */
  _isCurrentMutationContext(context) {
    const snapshot = this.cache.dataState;
    return Boolean(
      snapshot?.ready &&
        snapshot.authorityEpoch === context.authorityEpoch &&
        snapshot.currentProfile === context.profileId &&
        snapshot.currentEnvironment === context.environment,
    );
  }

  /**
   * Keep mutation planning inside the queue so every operation observes the
   * accepted owner snapshot published by the preceding write.
   *
   * @param {(generation: number, context: { authorityEpoch: number | null, profileId: string | null, environment: string }) => Promise<boolean>} operation
   * @returns {Promise<boolean>}
   */
  _enqueueCommandMutation(operation) {
    const generation = this._mutationGeneration;
    const context = this._captureCommandMutationContext();
    const run = () =>
      this._isCurrentMutationGeneration(generation)
        ? operation(generation, context)
        : false;
    const result = this._mutationQueue.then(run, run);
    this._mutationQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  /**
   * @param {
   *   | { type: 'add', key: string, command: import('./serviceTypes.js').StoredCommand | import('./serviceTypes.js').StoredCommand[], bindset?: string | null }
   *   | { type: 'delete', key: string, index: number, bindset?: string | null }
   *   | { type: 'move', key: string, fromIndex: number, toIndex: number, bindset?: string | null }
   *   | { type: 'edit', key: string, index: number, updatedCommand: import('./serviceTypes.js').StoredCommand, bindset?: string | null }
   * } mutation
   * @param {{ authorityEpoch: number | null, profileId: string | null, environment: string }} context
   */
  _planCommandMutation(mutation, context) {
    const snapshot = this.cache.dataState;
    const ready =
      snapshot?.ready === true &&
      snapshot.authorityEpoch === context.authorityEpoch;
    return planCommandMutation({
      profile: ready ? getSnapshotProfile(snapshot, context.profileId) : null,
      profileId: ready ? context.profileId : null,
      environment: ready ? context.environment : "",
      mutation,
      normalizeCommand: normalizeToString,
      normalizeCommands: normalizeToStringArray,
    });
  }

  /** @param {import('./commandMutationPlanner.js').CommandMutationEvent} event */
  _publishCommandMutationEvent(event) {
    switch (event.topic) {
      case "command-added":
        this.emit("command-added", event.payload);
        break;
      case "command-deleted":
        this.emit("command-deleted", event.payload);
        break;
      case "command-moved":
        this.emit("command-moved", event.payload);
        break;
      case "command-edited":
        this.emit("command-edited", event.payload);
        break;
    }
  }

  /**
   * @param {
   *   | { type: 'add', key: string, command: import('./serviceTypes.js').StoredCommand | import('./serviceTypes.js').StoredCommand[], bindset?: string | null }
   *   | { type: 'delete', key: string, index: number, bindset?: string | null }
   *   | { type: 'move', key: string, fromIndex: number, toIndex: number, bindset?: string | null }
   *   | { type: 'edit', key: string, index: number, updatedCommand: import('./serviceTypes.js').StoredCommand, bindset?: string | null }
   * } mutation
   * @param {{ operation: 'add' | 'delete' | 'move' | 'edit', notifyMissingProfile?: boolean, notifyStorageFailure?: boolean }} diagnostics
   */
  _runCommandMutation(mutation, diagnostics) {
    return this._enqueueCommandMutation(async (generation, context) => {
      const plan = this._planCommandMutation(mutation, context);
      if (!plan.valid) {
        if (plan.reason === "no_valid_commands") {
          console.warn("CommandService: No valid commands to add");
        }
        if (
          plan.reason === "invalid_profile" &&
          diagnostics.notifyMissingProfile
        ) {
          this.ui?.showToast?.(this.i18n.t("no_valid_profile"), "error");
        }
        return false;
      }

      try {
        const result = await this.request(
          "data:update-profile",
          plan.updateProfileRequest,
        );
        if (!result?.success) {
          throw new Error(this.i18n.t("storage_write_failed"));
        }
        if (!this._isCurrentMutationGeneration(generation)) return false;

        if (this._isCurrentMutationContext(context)) {
          this._publishCommandMutationEvent(plan.event);
        }
        return true;
      } catch (error) {
        if (!this._isCurrentMutationGeneration(generation)) return false;
        console.error(`Failed to ${diagnostics.operation} command:`, error);
        if (diagnostics.notifyStorageFailure) {
          this.ui?.showToast?.(this.i18n.t("storage_write_failed"), "error");
        }
        return false;
      }
    });
  }

  /**
   * @param {string} key
   * @param {import('./serviceTypes.js').StoredCommand | import('./serviceTypes.js').StoredCommand[]} command
   * @param {string | null} bindset
   */
  async addCommand(key, command, bindset = null) {
    return this._runCommandMutation(
      { type: "add", key, command, bindset },
      {
        operation: "add",
        notifyMissingProfile: true,
        notifyStorageFailure: true,
      },
    );
  }

  /**
   * @param {string} key
   * @param {number} index
   * @param {string | null} bindset
   */
  async deleteCommand(key, index, bindset = null) {
    if (!key || index === undefined) return false;
    return this._runCommandMutation(
      { type: "delete", key, index, bindset },
      { operation: "delete", notifyStorageFailure: true },
    );
  }

  /**
   * @param {string} key
   * @param {number} fromIndex
   * @param {number} toIndex
   * @param {string | null} bindset
   */
  async moveCommand(key, fromIndex, toIndex, bindset = null) {
    return this._runCommandMutation(
      { type: "move", key, fromIndex, toIndex, bindset },
      { operation: "move" },
    );
  }

  /**
   * @param {string} key
   * @param {number} index
   * @param {import('./serviceTypes.js').StoredCommand} updatedCommand
   * @param {string | null} bindset
   */
  async editCommand(key, index, updatedCommand, bindset = null) {
    if (!key || index === undefined || !updatedCommand) {
      console.warn(
        "CommandService: Cannot edit command - missing key, index, or updated command",
      );
      return false;
    }
    return this._runCommandMutation(
      { type: "edit", key, index, updatedCommand, bindset },
      {
        operation: "edit",
        notifyMissingProfile: true,
        notifyStorageFailure: true,
      },
    );
  }

  // Set up event listeners for DataCoordinator integration
  setupEventListeners() {
    // Listen for command addition events from UI components (broadcast pattern)
    this.addEventListener("command:add", async ({ command, key, bindset }) => {
      await this.addCommand(key, command, bindset);
    });

    // Listen for command edit events from UI components (broadcast pattern)
    this.addEventListener(
      "command:edit",
      async ({ key, index, updatedCommand, bindset = null }) => {
        await this.editCommand(key, index, updatedCommand, bindset);
      },
    );
  }

  // Cleanup method to detach all request/response handlers
  onDestroy() {
    this._mutationGeneration += 1;
    if (this._responseDetachFunctions) {
      this._responseDetachFunctions.forEach((detach) => {
        if (typeof detach === "function") {
          detach();
        }
      });
      this._responseDetachFunctions = [];
    }
  }

  // Get commands for the currently selected key/alias using cached data
  /** @param {{ environment?: string, key?: string | null, bindset?: string | null }} [params] */
  async getCommandsForSelectedKey(params = {}) {
    console.log(
      "[CommandService] getCommandsForSelectedKey called with params:",
      params,
    );
    console.log("[CommandService] Current state:", {
      currentEnvironment: this.cache.currentEnvironment,
      selectedKey: this.cache.selectedKey, // From ComponentBase
      selectedAlias: this.cache.selectedAlias, // From ComponentBase
      cache: this.cache,
    });

    // Use explicit parameters if provided, otherwise use cached selection state
    const environment =
      params.environment || this.cache.currentEnvironment || "space";
    /** @type {string | null | undefined} */
    let selectedKey = params.key;

    if (!selectedKey) {
      // Use cached selection state from ComponentBase (SelectionService broadcasts)
      selectedKey =
        environment === "alias"
          ? this.cache.selectedAlias
          : this.cache.selectedKey;
      if (!selectedKey) {
        console.warn(
          "[CommandService] No key/alias selected for environment:",
          environment,
        );
        return [];
      }
    }

    if (!selectedKey) return [];

    const bindset =
      environment === "alias"
        ? null
        : params.bindset !== undefined
          ? params.bindset
          : this.cache.preferences?.bindsetsEnabled === true
            ? this.cache.activeBindset
            : null;
    return getSnapshotCommands(
      this.cache.dataState,
      environment,
      selectedKey,
      bindset,
    );
  }

  // Normalize commands for display by applying tray execution normalization
  /** @param {import('./serviceTypes.js').StoredCommand[]} commands */
  async normalizeCommandsForDisplay(commands) {
    /** @type {string[]} */
    const normalizedCommands = [];

    for (const cmd of commands) {
      // Support both canonical string and rich object formats
      const cmdStr = typeof cmd === "string" ? cmd : (cmd && cmd.command) || "";
      if (!cmdStr) {
        continue;
      }
      try {
        // Parse the command to check if it's a tray execution command
        const parseResult = await this.request("parser:parse-command-string", {
          commandString: cmdStr,
          options: { generateDisplayText: false },
        });

        if (parseResult.commands && parseResult.commands[0]) {
          const parsedCmd = parseResult.commands[0];
          // Check if it's a tray execution command that needs normalization
          if (
            parsedCmd.signature &&
            (parsedCmd.signature.includes("TrayExecByTray") ||
              parsedCmd.signature.includes("TrayExecByTrayWithBackup")) &&
            parsedCmd.parameters
          ) {
            const params = parsedCmd.parameters;
            const active = params.active !== undefined ? params.active : 1;
            if (parsedCmd.signature.includes("TrayExecByTrayWithBackup")) {
              // Handle TrayExecByTrayWithBackup normalization
              const baseCommand =
                typeof params.baseCommand === "string"
                  ? params.baseCommand
                  : "TrayExecByTrayWithBackup";
              const commandType = baseCommand.replace(/^\+/, "");
              if (active === 1) {
                normalizedCommands.push(
                  `+${commandType} ${params.tray} ${params.slot} ${params.backup_tray} ${params.backup_slot}`,
                );
              } else {
                normalizedCommands.push(
                  `${commandType} ${active} ${params.tray} ${params.slot} ${params.backup_tray} ${params.backup_slot}`,
                );
              }
            } else {
              // Regular TrayExecByTray normalization
              const baseCommand =
                typeof params.baseCommand === "string"
                  ? params.baseCommand
                  : "TrayExecByTray";
              const commandType = baseCommand.replace(/^\+/, "");
              if (active === 1) {
                normalizedCommands.push(
                  `+${commandType} ${params.tray} ${params.slot}`,
                );
              } else {
                normalizedCommands.push(
                  `${commandType} ${active} ${params.tray} ${params.slot}`,
                );
              }
            }
          } else {
            normalizedCommands.push(cmdStr);
          }
        } else {
          normalizedCommands.push(cmdStr);
        }
      } catch (error) {
        console.warn(
          "[CommandLibraryService] Failed to normalize command for display:",
          cmdStr,
          error,
        );
        normalizedCommands.push(cmdStr);
      }
    }

    return normalizedCommands;
  }

  // Generate mirrored command string for execution order stabilization with TrayExec-aware palindromic generation
  /** @param {import('./serviceTypes.js').StoredCommand[]} [commands] */
  async generateMirroredCommands(commands = []) {
    if (!Array.isArray(commands) || commands.length === 0) return "";
    const finalCommands = planMirroredCommandSequence(commands);
    const normalizedStrings = await this.normalizeCommandsForDisplay(
      finalCommands.map((cmd) => ({ command: cmd })),
    );
    return normalizedStrings.join(" $$ ");
  }

  // Command preview generation
  /**
   * @param {string} key
   * @param {import('./serviceTypes.js').StoredCommand[]} commands
   * @param {boolean} stabilize
   */
  generateCommandPreview(key, commands, stabilize = false) {
    if (!Array.isArray(commands) || commands.length === 0) {
      return `${key} ""`;
    }

    let commandString;
    if (stabilize && commands.length > 1) {
      const strs = commands.map((c) => (typeof c === "string" ? c : c.command));
      commandString = [...strs, ...strs.slice(0, -1).reverse()].join(" $$ ");
    } else {
      commandString = commands
        .map((c) => (typeof c === "string" ? c : c.command || String(c)))
        .join(" $$ ");
    }

    return `${key} "${commandString}"`;
  }

  // Check if a command is compatible with the target environment
  /**
   * @param {import('./serviceTypes.js').StoredCommand} commandName
   * @param {string} targetEnvironment
   */
  async isCommandCompatible(commandName, targetEnvironment) {
    if (!commandName) {
      console.warn("isCommandCompatible called with undefined commandName");
      return true; // treat as universal so we don't block import pipeline
    }

    try {
      const commandData = findCommandByName(normalizeToString(commandName));

      // Check command environment compatibility

      if (!commandData || !commandData.environment) {
        // Command has no environment restriction, so it's universal
        // Command has no environment restriction (universal)
        return true;
      }

      // Command has environment restriction - check compatibility
      const compatible = commandData.environment === targetEnvironment;
      // Check environment compatibility
      return compatible;
    } catch (error) {
      // If we can't determine compatibility, assume it's universal
      console.warn(
        `CommandService: Could not check compatibility for command "${commandName}":`,
        error,
      );
      return true;
    }
  }

  // Get available import sources for command import
  /**
   * @param {string} currentEnvironment
   * @param {string | null | undefined} currentKey
   */
  async getImportSources(currentEnvironment, currentKey) {
    return getSnapshotCommandImportSources(
      this.cache.dataState,
      currentEnvironment,
      currentKey,
    );
  }

  // Import commands from a source to a target key
  /**
   * @param {string} sourceValue
   * @param {string} targetKey
   * @param {boolean} clearDestination
   * @param {string} currentEnvironment
   * @returns {Promise<import('../../types/rpc/commands.js').CommandImportResult>}
   */
  async importFromSource(
    sourceValue,
    targetKey,
    clearDestination,
    currentEnvironment,
  ) {
    if (!sourceValue || !targetKey) {
      throw new Error("Source and target are required for import");
    }

    try {
      // Parse source value (format: "environment:key" or "alias:aliasName")
      const [sourceType, sourceName] = sourceValue.split(":");

      /** @type {import('./serviceTypes.js').StoredCommand[]} */
      let sourceCommands = [];

      if (sourceType === "alias") {
        // Get commands from alias
        const aliases = getSnapshotUserAliases(this.cache.dataState);
        const alias = aliases[sourceName];
        if (alias && alias.commands) {
          // Handle both legacy string format and new canonical array format
          let commandString;
          if (Array.isArray(alias.commands)) {
            // New canonical array format - join with $$
            commandString = alias.commands.join(" $$ ");
          } else {
            // Legacy string format
            commandString = alias.commands;
          }

          if (commandString && commandString.trim()) {
            const result = await this.request("parser:parse-command-string", {
              commandString,
            });
            sourceCommands = result.commands || [];
          }
        }
      } else {
        // Get commands from key
        sourceCommands = getSnapshotCommands(
          this.cache.dataState,
          sourceType,
          sourceName,
        );
      }

      if (sourceCommands.length === 0) {
        throw new Error("Source has no commands to import");
      }

      // Check for cross-environment import and filter commands
      let filteredCommands = sourceCommands;
      let droppedCount = 0;

      if (currentEnvironment !== "alias" && sourceType !== "alias") {
        // Key-to-key import: check for cross-environment issues
        if (sourceType !== currentEnvironment) {
          // Cross-environment import: filter out environment-specific commands
          // Cross-environment import detected, filtering commands

          const compatibilityPromises = sourceCommands.map(
            async (cmdString) => {
              const isCompatible = await this.isCommandCompatible(
                cmdString,
                currentEnvironment,
              );
              return { command: cmdString, isCompatible };
            },
          );

          const compatibilityResults = await Promise.all(compatibilityPromises);
          // Compatibility check completed

          // Drop incompatible commands
          filteredCommands = compatibilityResults
            .filter((result) => result.isCompatible)
            .map((result) => result.command);

          droppedCount = sourceCommands.length - filteredCommands.length;
          // Command filtering completed
        }
      }

      if (filteredCommands.length === 0) {
        throw new Error("No compatible commands found for import");
      }

      // Perform the import
      if (clearDestination) {
        await clearImportTarget(
          {
            cache: {
              ...this.cache,
              activeBindset: this.cache.activeBindset || "Primary Bindset",
            },
            i18n: this.i18n,
            request: (_topic, payload) =>
              this.request("data:update-profile", payload),
          },
          currentEnvironment,
          targetKey,
        );
      }

      // Add the filtered commands
      for (const command of filteredCommands) {
        const added = await this.addCommand(targetKey, command);
        if (!added) throw new Error(this.i18n.t("storage_write_failed"));
      }

      return {
        success: true,
        importedCount: filteredCommands.length,
        droppedCount: droppedCount,
        sourceType: sourceType,
        sourceName: sourceName,
      };
    } catch (error) {
      console.error("CommandService: Failed to import from source:", error);
      throw error;
    }
  }
}
