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
import {
  materializeCommandMutation,
  dispatchCommandMutationRequest,
  enqueueCommandMutation,
  watchCommandMutationAdmission,
  currentCommandMutationEvent,
  publishCommandMutationEvent,
} from "./commandMutationBoundary.js";
import {
  materializeMutationRequest,
  requireMutationString,
  requireMutationIdentifier,
  requireProfileUpdateResult,
} from "./mutationRequestBoundary.js";
import {
  captureProfileMutationContext,
  assertProfileMutationContext,
  canPublishProfileMutation,
} from "./profileMutationContext.js";
import { planMirroredCommandSequence } from "./commandTransformationPlanner.js";
import { normalizeParsedCommandForDisplay } from "./commandDisplayProjection.js";

/**
 * CommandService – the authoritative service for creating, deleting and
 * rearranging commands in a profile.  It owns no UI concerns whatsoever.  A
 * higher-level feature (CommandLibraryService / future templates) can call
 * this service to persist changes and broadcast events.
 */
export default class CommandService extends ComponentBase {
  /** @param {{ eventBus: import('./serviceTypes.js').EventBus, i18n: import('./serviceTypes.js').I18n, ui?: import('./serviceTypes.js').ToastUI | null }} options */
  constructor({ eventBus, i18n, ui = null }) {
    super(eventBus);
    this.componentName = "CommandService";
    this.i18n = i18n;
    this.ui = ui;

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
      this.respond("command:delete", (payload) =>
        this._handleCommandRequest("delete", payload),
      ),
      this.respond("command:move", (payload) =>
        this._handleCommandRequest("move", payload),
      ),
      this.respond("command:import-from-source", (payload) => {
        const input = materializeMutationRequest(payload, [
          "sourceValue",
          "targetKey",
          "clearDestination",
          "currentEnvironment",
        ]);
        return this.importFromSource(
          input.sourceValue,
          input.targetKey,
          input.clearDestination,
          input.currentEnvironment,
        );
      }),
      this.respond(
        "command:generate-mirrored-commands",
        async ({ commands = [] }) => this.generateMirroredCommands(commands),
      ),
    );
  }

  /** @param {'add'|'delete'|'move'|'edit'} type @param {unknown} payload */
  _handleCommandRequest(type, payload) {
    return dispatchCommandMutationRequest(this, type, payload);
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

  /** @param {Parameters<typeof enqueueCommandMutation>[1]} operation */
  _enqueueCommandMutation(operation) {
    return enqueueCommandMutation(this, operation);
  }

  /**
   * @param {
   *   | { type: 'add', key: string, command: import('./serviceTypes.js').StoredCommand | import('./serviceTypes.js').StoredCommand[], bindset?: string | null }
   *   | { type: 'delete', key: string, index: number, bindset?: string | null }
   *   | { type: 'move', key: string, fromIndex: number, toIndex: number, bindset?: string | null }
   *   | { type: 'edit', key: string, index: number, updatedCommand: import('./serviceTypes.js').StoredCommand, bindset?: string | null, target?: import('../../types/events/commands.js').CommandEditTarget }
   * } mutation
   * @param {{ authorityEpoch: number | null, profileId: string | null, environment: string }} context
   */
  _planCommandMutation(mutation, context) {
    const snapshot = this.cache.dataState;
    const hasEditTarget =
      mutation.type === "edit" && mutation.target !== undefined;
    const ready =
      snapshot?.ready === true &&
      (hasEditTarget || snapshot.authorityEpoch === context.authorityEpoch);
    const profileId = hasEditTarget
      ? snapshot?.currentProfile || null
      : context.profileId;
    const environment = hasEditTarget
      ? snapshot?.currentEnvironment || ""
      : context.environment;
    return planCommandMutation({
      profile: ready ? getSnapshotProfile(snapshot, profileId) : null,
      profileId: ready ? profileId : null,
      environment: ready ? environment : "",
      authorityEpoch: ready ? snapshot.authorityEpoch : null,
      revision: ready ? snapshot.revision : null,
      mutation,
      normalizeCommand: normalizeToString,
      normalizeCommands: normalizeToStringArray,
    });
  }

  /** @param {import('./commandMutationPlanner.js').CommandMutationEvent} event */
  _publishCommandMutationEvent(event) {
    publishCommandMutationEvent(this, event);
  }

  /**
   * @param {
   *   | { type: 'add', key: string, command: import('./serviceTypes.js').StoredCommand | import('./serviceTypes.js').StoredCommand[], bindset?: string | null }
   *   | { type: 'delete', key: string, index: number, bindset?: string | null }
   *   | { type: 'move', key: string, fromIndex: number, toIndex: number, bindset?: string | null }
   *   | { type: 'edit', key: string, index: number, updatedCommand: import('./serviceTypes.js').StoredCommand, bindset?: string | null, target?: import('../../types/events/commands.js').CommandEditTarget }
   * } mutation
   * @param {{ operation: 'add' | 'delete' | 'move' | 'edit', notifyMissingProfile?: boolean, notifyStorageFailure?: boolean }} diagnostics
   */
  _runCommandMutation(mutation, diagnostics) {
    try {
      mutation = materializeCommandMutation(mutation);
    } catch {
      return Promise.resolve(false);
    }
    return this._enqueueCommandMutation(
      async (generation, context, release) => {
        const plan = this._planCommandMutation(mutation, context);
        if (!plan.valid) {
          if (plan.reason === "no_valid_commands") {
            console.warn("CommandService: No valid commands to add");
          }
          if (plan.reason === "stale_edit_target") {
            this.ui?.showToast?.(
              this.i18n.t("command_edit_target_changed"),
              "warning",
            );
          }
          if (
            plan.reason === "invalid_profile" &&
            diagnostics.notifyMissingProfile
          ) {
            this.ui?.showToast?.(this.i18n.t("no_valid_profile"), "error");
          }
          return false;
        }

        let stop = () => {};
        try {
          const snapshot = this.cache.dataState;
          if (!snapshot?.ready) return false;
          const precondition = {
            authorityEpoch: snapshot.authorityEpoch,
            revision: snapshot.revision,
          };
          stop = watchCommandMutationAdmission(this, precondition, release);
          const result = await this.request("data:update-profile", {
            ...plan.updateProfileRequest,
            precondition,
          });
          requireProfileUpdateResult(result);

          if (
            this._isCurrentMutationGeneration(generation) &&
            this._isCurrentMutationContext(context)
          ) {
            this._publishCommandMutationEvent(
              currentCommandMutationEvent(
                plan,
                this.cache.dataState,
                precondition.revision,
              ),
            );
          }
          return true;
        } catch (error) {
          if (!this._isCurrentMutationGeneration(generation)) return false;
          console.error(`Failed to ${diagnostics.operation} command:`, error);
          if (diagnostics.notifyStorageFailure) {
            this.ui?.showToast?.(this.i18n.t("storage_write_failed"), "error");
          }
          return false;
        } finally {
          stop();
        }
      },
    );
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
   * @param {import('../../types/events/commands.js').CommandEditTarget} [target]
   */
  async editCommand(key, index, updatedCommand, bindset = null, target) {
    if (!key || index === undefined || !updatedCommand) {
      console.warn(
        "CommandService: Cannot edit command - missing key, index, or updated command",
      );
      return false;
    }
    return this._runCommandMutation(
      { type: "edit", key, index, updatedCommand, bindset, target },
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
    this.addEventListener("command:add", (payload) =>
      this._handleCommandRequest("add", payload),
    );

    // Listen for command edit events from UI components (broadcast pattern)
    this.addEventListener("command:edit", (payload) =>
      this._handleCommandRequest("edit", payload),
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

        normalizedCommands.push(
          normalizeParsedCommandForDisplay(cmdStr, parseResult),
        );
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
   * @param {unknown} sourceValue
   * @param {unknown} targetKey
   * @param {unknown} clearDestination
   * @param {unknown} currentEnvironment
   * @returns {Promise<import('../../types/rpc/commands.js').CommandImportResult>}
   */
  async importFromSource(
    sourceValue,
    targetKey,
    clearDestination,
    currentEnvironment,
  ) {
    const input = materializeMutationRequest(
      { sourceValue, targetKey, clearDestination, currentEnvironment },
      ["sourceValue", "targetKey", "clearDestination", "currentEnvironment"],
    );
    sourceValue = requireMutationString(input.sourceValue);
    targetKey = requireMutationString(input.targetKey);
    currentEnvironment = requireMutationIdentifier(input.currentEnvironment);
    const sourceParts = String(sourceValue).split(":");
    requireMutationIdentifier(sourceParts[0]);
    requireMutationIdentifier(sourceParts[1]);
    if (typeof input.clearDestination !== "boolean")
      throw new TypeError("invalid_mutation_request");
    clearDestination = input.clearDestination;
    // Validate dynamic destinations before reading accepted authority.
    requireMutationIdentifier(targetKey);
    const invocation = captureProfileMutationContext(
      this,
      this._mutationGeneration,
    );
    const assertInvocation = () => {
      if (
        !canPublishProfileMutation(this, invocation, this._mutationGeneration)
      )
        throw new Error("operation_cancelled");
    };

    try {
      // Parse source value (format: "environment:key" or "alias:aliasName")
      const [sourceType, sourceName] = String(sourceValue).split(":");

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
                String(currentEnvironment),
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
      assertProfileMutationContext(this, invocation, this._mutationGeneration);
      if (clearDestination) {
        assertInvocation();
        const planning = captureProfileMutationContext(
          this,
          this._mutationGeneration,
        );
        assertProfileMutationContext(this, planning, this._mutationGeneration);
        await clearImportTarget(
          {
            cache: {
              ...this.cache,
              activeBindset: this.cache.activeBindset || "Primary Bindset",
            },
            i18n: this.i18n,
            request: (_topic, payload) =>
              this.request("data:update-profile", {
                ...payload,
                precondition: planning.precondition,
              }),
          },
          String(currentEnvironment),
          String(targetKey),
        );
      }

      // Add the filtered commands
      for (const command of filteredCommands) {
        assertInvocation();
        const added = await this.addCommand(String(targetKey), command);
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
