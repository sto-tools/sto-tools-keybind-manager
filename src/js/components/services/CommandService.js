import ComponentBase from "../ComponentBase.js";
import {
  normalizeToString,
  normalizeToStringArray,
} from "../../lib/commandDisplayAdapter.js";
import { formatAliasLine } from "../../lib/STOFormatter.js";
import { clearImportTarget } from "./commandImportPayload.js";
import {
  getSnapshotCommandImportSources,
  getSnapshotCommands,
  getSnapshotUserAliases,
} from "./dataState.js";

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

    this.setupRequestHandlers();
  }

  setupRequestHandlers() {
    if (!this.eventBus || this._responseDetachFunctions.length > 0) return;

    this._responseDetachFunctions.push(
      this.respond("command:add", async ({ command, key, position, bindset }) =>
        this.addCommand(key, command, bindset || position),
      ),
      this.respond(
        "command:edit",
        async ({ key, index, updatedCommand, bindset }) =>
          this.editCommand(key, index, updatedCommand, bindset),
      ),
      this.respond("command:validate", ({ command }) =>
        this.validateCommand(command),
      ),
      this.respond("command:delete", async ({ key, index, bindset }) =>
        this.deleteCommand(key, index, bindset),
      ),
      this.respond(
        "command:move",
        async ({ key, fromIndex, toIndex, bindset }) =>
          this.moveCommand(key, fromIndex, toIndex, bindset),
      ),
      this.respond(
        "command:get-empty-state-info",
        async () => await this.getEmptyStateInfo(),
      ),
      this.respond(
        "command:check-environment-compatibility",
        ({ command, environment }) =>
          this.isCommandCompatible(command, environment),
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
    this.setupRequestHandlers();
    this.setupEventListeners();
  }

  // Profile helpers now use cached data
  getCurrentProfile() {
    if (!this.cache.currentProfile) return null;
    return this.getCurrentBuild(this.cache.profile);
  }

  /** @param {import('./serviceTypes.js').ProfileData | null} profile */
  getCurrentBuild(profile) {
    if (!profile) return null;

    // Use cached builds data
    const builds = this.cache.builds || {
      space: { keys: {} },
      ground: { keys: {} },
    };

    if (!builds[this.cache.currentEnvironment]) {
      builds[this.cache.currentEnvironment] = { keys: {} };
    }

    if (!builds[this.cache.currentEnvironment].keys) {
      builds[this.cache.currentEnvironment].keys = {};
    }

    return {
      ...profile,
      keys: builds[this.cache.currentEnvironment].keys,
      aliases: this.cache.aliases || {},
    };
  }

  // Core command operations now use DataCoordinator
  /**
   * @param {string} key
   * @param {import('./serviceTypes.js').StoredCommand | import('./serviceTypes.js').StoredCommand[]} command
   * @param {string | null} bindset
   */
  async addCommand(key, command, bindset = null) {
    const profile = this.getCurrentProfile();
    if (!profile) {
      this.ui?.showToast?.(this.i18n.t("no_valid_profile"), "error");
      return false;
    }
    const profileId = this.cache.currentProfile;
    if (!profileId) return false;

    // Determine if we should use a bindset (when bindset is specified and not in alias mode)
    const useBindset =
      bindset &&
      bindset !== "Primary Bindset" &&
      this.cache.currentEnvironment !== "alias";

    // Get current alias commands (handle both legacy string and new array format)
    const currentAlias = this.cache.aliases && this.cache.aliases[key];
    /** @type {import('./serviceTypes.js').StoredCommand[]} */
    let currentCommands = [];
    if (currentAlias && Array.isArray(currentAlias.commands)) {
      currentCommands = [...currentAlias.commands];
    }

    // Normalize commands to canonical strings
    const commandsToAdd = Array.isArray(command)
      ? normalizeToStringArray(command)
      : [normalizeToString(command)];

    // Filter out empty commands
    const validCommands = commandsToAdd.filter((cmd) => cmd.length > 0);
    if (validCommands.length === 0) {
      console.warn("CommandService: No valid commands to add");
      return false;
    }

    // Add normalized commands to current list
    currentCommands.push(...validCommands);

    // ----- Key-bind -----
    let currentKeys = [];
    if (useBindset) {
      currentKeys =
        profile.bindsets?.[bindset]?.[this.cache.currentEnvironment]?.keys?.[
          key
        ] || [];
    } else {
      currentKeys = this.cache.keys[key] || [];
    }

    // Use the same normalized commands for keybinds
    const newKeys = [...currentKeys, ...validCommands];

    try {
      // Build explicit operations object
      /** @type {import('./serviceTypes.js').ProfileOperations} */
      const ops = {};
      if (this.cache.currentEnvironment === "alias") {
        const aliasExists = !!profile.aliases?.[key];
        if (aliasExists) {
          ops.modify = {
            aliases: {
              [key]: {
                ...(profile.aliases[key] || {}),
                commands: currentCommands, // Use array format
              },
            },
          };
        } else {
          ops.add = {
            aliases: {
              [key]: {
                commands: currentCommands,
                description: "",
                type: "alias",
              },
            },
          };
        }
      } else if (!useBindset) {
        const keyExists =
          !!profile.builds?.[this.cache.currentEnvironment]?.keys?.[key];
        if (keyExists) {
          ops.modify = {
            builds: {
              [this.cache.currentEnvironment]: {
                keys: { [key]: newKeys },
              },
            },
          };
        } else {
          ops.add = {
            builds: {
              [this.cache.currentEnvironment]: {
                keys: { [key]: newKeys },
              },
            },
          };
        }
      } else {
        // Bindset path
        const bindsetExists = !!profile.bindsets?.[bindset];
        const envExists =
          !!profile.bindsets?.[bindset]?.[this.cache.currentEnvironment];
        // If bindset or environment does not exist, use add; otherwise always use modify
        if (!bindsetExists || !envExists) {
          ops.add = {
            bindsets: {
              [bindset]: {
                [this.cache.currentEnvironment]: {
                  keys: { [key]: newKeys },
                },
              },
            },
          };
        } else {
          ops.modify = {
            bindsets: {
              [bindset]: {
                [this.cache.currentEnvironment]: {
                  keys: { [key]: newKeys },
                },
              },
            },
          };
        }
      }

      await this.request("data:update-profile", {
        profileId,
        ...ops,
      });

      this.emit("command-added", { key, command });
      return true;
    } catch (error) {
      console.error("Failed to add command:", error);
      this.ui?.showToast?.("Failed to add command", "error");
      return false;
    }
  }

  // Delete command
  /**
   * @param {string} key
   * @param {number} index
   * @param {string | null} bindset
   */
  async deleteCommand(key, index, bindset = null) {
    // Determine if we should use a bindset (when bindset is specified and not in alias mode)
    const useBindset =
      bindset &&
      bindset !== "Primary Bindset" &&
      this.cache.currentEnvironment !== "alias";

    const profile = this.getCurrentProfile();
    if (!profile) return false;
    const profileId = this.cache.currentProfile;
    if (!profileId) return false;

    if (!key || index === undefined) return false;

    const isAliasContext =
      this.cache.currentEnvironment === "alias" ||
      (this.cache.aliases &&
        Object.prototype.hasOwnProperty.call(this.cache.aliases, key));

    let payload = null;
    /** @type {import('./serviceTypes.js').StoredCommand[]} */
    let updatedCommands = []; // capture latest commands for event emission

    if (isAliasContext) {
      const aliasObj = this.cache.aliases[key];
      if (!aliasObj || !Array.isArray(aliasObj.commands)) return false;

      const commandsArr = [...aliasObj.commands];

      if (index < 0 || index >= commandsArr.length) return false;

      commandsArr.splice(index, 1);

      // Store for later emission
      updatedCommands = [...commandsArr];

      // Always use modify to preserve empty aliases - don't auto-delete when commands become empty
      payload = {
        modify: {
          aliases: {
            [key]: {
              ...aliasObj,
              commands: commandsArr, // Preserve empty array instead of deleting alias
            },
          },
        },
      };
    } else {
      // Fetch commands from appropriate location depending on active bindset
      const keyCommands = useBindset
        ? profile.bindsets?.[bindset]?.[this.cache.currentEnvironment]?.keys?.[
            key
          ] || []
        : this.cache.keys[key] || [];

      if (!keyCommands[index]) return false;

      const newKeyCommands = [...keyCommands];
      newKeyCommands.splice(index, 1);

      // Store for later emission
      updatedCommands = [...newKeyCommands];

      // Build explicit operations
      if (useBindset) {
        payload = {
          modify: {
            bindsets: {
              [bindset]: {
                [this.cache.currentEnvironment]: {
                  keys: { [key]: newKeyCommands },
                },
              },
            },
          },
        };
      } else {
        // Always use modify to preserve empty keys - don't auto-delete when commands become empty
        payload = {
          modify: {
            builds: {
              [this.cache.currentEnvironment]: {
                keys: { [key]: newKeyCommands }, // Preserve empty array instead of deleting key
              },
            },
          },
        };
      }
    }

    if (!payload) return false;

    try {
      await this.request("data:update-profile", {
        profileId,
        ...payload,
      });

      // Emit event with the commands we just computed
      this.emit("command-deleted", { key, index, commands: updatedCommands });
      return true;
    } catch (error) {
      console.error("Failed to delete command:", error);
      this.ui?.showToast?.("Failed to delete command", "error");
      return false;
    }
  }

  // Move command
  /**
   * @param {string} key
   * @param {number} fromIndex
   * @param {number} toIndex
   * @param {string | null} bindset
   */
  async moveCommand(key, fromIndex, toIndex, bindset = null) {
    const useBindset =
      bindset &&
      bindset !== "Primary Bindset" &&
      this.cache.currentEnvironment !== "alias";

    const profile = this.getCurrentProfile();
    if (!profile) return false;
    const profileId = this.cache.currentProfile;
    if (!profileId) return false;

    let payload = null;

    if (this.cache.currentEnvironment === "alias") {
      const aliasObj = this.cache.aliases && this.cache.aliases[key];
      if (!aliasObj || !Array.isArray(aliasObj.commands)) return false;

      const commandsArr = [...aliasObj.commands];

      if (
        fromIndex < 0 ||
        fromIndex >= commandsArr.length ||
        toIndex < 0 ||
        toIndex >= commandsArr.length
      )
        return false;

      const [moved] = commandsArr.splice(fromIndex, 1);
      commandsArr.splice(toIndex, 0, moved);

      payload = {
        modify: {
          aliases: {
            [key]: {
              ...aliasObj,
              commands: commandsArr, // Keep as array in new format
            },
          },
        },
      };
    } else {
      const keyCmds = useBindset
        ? profile.bindsets?.[bindset]?.[this.cache.currentEnvironment]?.keys?.[
            key
          ] || []
        : this.cache.keys[key] || [];

      if (
        fromIndex < 0 ||
        fromIndex >= keyCmds.length ||
        toIndex < 0 ||
        toIndex >= keyCmds.length
      )
        return false;

      const newCmds = [...keyCmds];
      const [moved] = newCmds.splice(fromIndex, 1);
      newCmds.splice(toIndex, 0, moved);

      if (useBindset) {
        payload = {
          modify: {
            bindsets: {
              [bindset]: {
                [this.cache.currentEnvironment]: {
                  keys: { [key]: newCmds },
                },
              },
            },
          },
        };
      } else {
        payload = {
          modify: {
            builds: {
              [this.cache.currentEnvironment]: {
                keys: { [key]: newCmds },
              },
            },
          },
        };
      }
    }

    try {
      await this.request("data:update-profile", {
        profileId,
        ...payload,
      });

      const updatedCmds = await this.fetchCommandsForKey(key, bindset);
      this.emit("command-moved", {
        key,
        fromIndex,
        toIndex,
        commands: updatedCmds,
      });
      return true;
    } catch (error) {
      console.error("Failed to move command:", error);
      return false;
    }
  }

  // Edit/Update a command at a specific index
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

    const useBindset =
      bindset &&
      bindset !== "Primary Bindset" &&
      this.cache.currentEnvironment !== "alias";

    const profile = this.getCurrentProfile();
    if (!profile) {
      this.ui?.showToast?.("No valid profile", "error");
      return false;
    }
    const profileId = this.cache.currentProfile;
    if (!profileId) return false;

    let payload = null;

    if (this.cache.currentEnvironment === "alias") {
      const aliasObj = this.cache.aliases[key];
      if (!aliasObj || !Array.isArray(aliasObj.commands)) return false;

      const commandsArr = [...aliasObj.commands];

      if (index < 0 || index >= commandsArr.length) return false;

      // Normalize updated command to string
      const commandString = normalizeToString(updatedCommand);
      commandsArr[index] = commandString;

      payload = {
        modify: {
          aliases: {
            [key]: {
              ...aliasObj,
              commands: commandsArr, // Keep as array in new format
            },
          },
        },
      };
    } else {
      const keyCmds = useBindset
        ? profile.bindsets?.[bindset]?.[this.cache.currentEnvironment]?.keys?.[
            key
          ] || []
        : this.cache.keys[key] || [];

      if (index < 0 || index >= keyCmds.length) return false;

      const newCmds = [...keyCmds];
      // Normalize updated command to string for keybinds too
      newCmds[index] = normalizeToString(updatedCommand);

      if (useBindset) {
        payload = {
          modify: {
            bindsets: {
              [bindset]: {
                [this.cache.currentEnvironment]: {
                  keys: { [key]: newCmds },
                },
              },
            },
          },
        };
      } else {
        payload = {
          modify: {
            builds: {
              [this.cache.currentEnvironment]: {
                keys: { [key]: newCmds },
              },
            },
          },
        };
      }
    }

    try {
      await this.request("data:update-profile", {
        profileId,
        ...payload,
      });

      const updatedCmds = await this.fetchCommandsForKey(key, bindset);
      this.emit("command-edited", {
        key,
        index,
        updatedCommand,
        commands: updatedCmds,
      });
      return true;
    } catch (error) {
      console.error("Failed to edit command:", error);
      this.ui?.showToast?.("Failed to update command", "error");
      return false;
    }
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

  // Placeholder command validator – always returns true.
  // Can be expanded later with proper validation logic.
  /**
   * @param {unknown} command
   * @returns {import('../../types/rpc/commands.js').CommandValidationResult}
   */
  validateCommand(command) {
    if (!command) return { valid: false, reason: "empty" };
    return { valid: true };
  }

  // Cleanup method to detach all request/response handlers
  onDestroy() {
    if (this._responseDetachFunctions) {
      this._responseDetachFunctions.forEach((detach) => {
        if (typeof detach === "function") {
          detach();
        }
      });
      this._responseDetachFunctions = [];
    }
  }

  // Helper: fetch latest commands for a key taking bindset into account
  /**
   * @param {string} key
   * @param {string | null} bindset
   */
  async fetchCommandsForKey(key, bindset = null) {
    try {
      return getSnapshotCommands(
        this.cache.dataState,
        this.cache.currentEnvironment,
        key,
        bindset,
      );
    } catch {
      return [];
    }
  }

  // Get empty state information
  /** @returns {Promise<import('../../types/rpc/commands.js').EmptyStateInfo>} */
  async getEmptyStateInfo() {
    // Use cached selection state from ComponentBase (SelectionService broadcasts)
    const selectedKey =
      this.cache.currentEnvironment === "alias"
        ? this.cache.selectedAlias
        : this.cache.selectedKey;

    console.log("[CommandService] getEmptyStateInfo DEBUG:", {
      currentEnvironment: this.cache.currentEnvironment,
      selectedKey: this.cache.selectedKey,
      selectedAlias: this.cache.selectedAlias,
      resolvedSelectedKey: selectedKey,
    });

    if (!selectedKey) {
      const selectText =
        this.cache.currentEnvironment === "alias"
          ? this.i18n.t("select_an_alias_to_edit")
          : this.i18n.t("select_a_key_to_edit");
      const previewText =
        this.cache.currentEnvironment === "alias"
          ? this.i18n.t("select_an_alias_to_see_the_generated_command")
          : this.i18n.t("select_a_key_to_see_the_generated_command");

      const emptyIcon =
        this.cache.currentEnvironment === "alias"
          ? "fas fa-mask"
          : "fas fa-keyboard";
      const emptyTitle =
        this.cache.currentEnvironment === "alias"
          ? this.i18n.t("no_alias_selected")
          : this.i18n.t("no_key_selected");
      const emptyDesc =
        this.cache.currentEnvironment === "alias"
          ? this.i18n.t("select_alias_from_left_panel")
          : this.i18n.t("select_key_from_left_panel");

      return {
        title: selectText,
        preview: previewText,
        icon: emptyIcon,
        emptyTitle,
        emptyDesc,
        commandCount: "0",
      };
    }

    const commands = await this.getCommandsForSelectedKey();

    // Helper function to decode HTML entities using DOM
    /** @param {string} str */
    const decodeHtmlEntities = (str) => {
      if (typeof str !== "string") return str;
      const textarea = document.createElement("textarea");
      textarea.innerHTML = str;
      return textarea.value;
    };

    const chainType =
      this.cache.currentEnvironment === "alias"
        ? decodeHtmlEntities(this.i18n.t("alias_chain"))
        : decodeHtmlEntities(this.i18n.t("command_chain"));

    // Check if selected key/alias actually exists in current environment (stale selection check)
    // A key/alias with no commands is valid, but a non-existent key/alias is stale
    let isStaleSelection = false;
    if (selectedKey) {
      if (this.cache.currentEnvironment === "alias") {
        const alias = this.cache.aliases && this.cache.aliases[selectedKey];
        isStaleSelection = !alias;
      } else {
        isStaleSelection = !this.validateKeyExistsInCurrentContext(selectedKey);
      }
    }

    // If we have a stale selection (key doesn't exist in current environment), treat as no selection
    if (isStaleSelection) {
      console.log(
        `[CommandService] Detected stale selection "${selectedKey}" in environment ${this.cache.currentEnvironment} - treating as no selection`,
      );

      const selectText =
        this.cache.currentEnvironment === "alias"
          ? this.i18n.t("select_an_alias_to_edit")
          : this.i18n.t("select_a_key_to_edit");
      const previewText =
        this.cache.currentEnvironment === "alias"
          ? this.i18n.t("select_an_alias_to_see_the_generated_command")
          : this.i18n.t("select_a_key_to_see_the_generated_command");

      const emptyIcon =
        this.cache.currentEnvironment === "alias"
          ? "fas fa-mask"
          : "fas fa-keyboard";
      const emptyTitle =
        this.cache.currentEnvironment === "alias"
          ? this.i18n.t("no_alias_selected")
          : this.i18n.t("no_key_selected");
      const emptyDesc =
        this.cache.currentEnvironment === "alias"
          ? this.i18n.t("select_alias_from_left_panel")
          : this.i18n.t("select_key_from_left_panel");

      return {
        title: selectText,
        preview: previewText,
        icon: emptyIcon,
        emptyTitle,
        emptyDesc,
        commandCount: "0",
      };
    }

    if (commands.length === 0) {
      const emptyMessage =
        this.cache.currentEnvironment === "alias"
          ? `${this.i18n.t("click_add_command_to_start_building_your_alias_chain")} ${selectedKey}.`
          : `${this.i18n.t("click_add_command_to_start_building_your_command_chain")} ${selectedKey}.`;

      return {
        title: decodeHtmlEntities(
          this.i18n.t("chain_for_key", { chainType, key: selectedKey }),
        ),
        preview: await this.getCommandChainPreview(),
        icon: "fas fa-plus-circle",
        emptyTitle: this.i18n.t("no_commands"),
        emptyDesc: emptyMessage,
        commandCount: "0",
      };
    }

    return {
      title: decodeHtmlEntities(
        this.i18n.t("chain_for_key", { chainType, key: selectedKey }),
      ),
      preview: await this.getCommandChainPreview(),
      commandCount: commands.length.toString(),
    };
  }

  /**
   * Validate if a key exists in the current bindset context
   * Checks both primary bindset and active bindset if applicable
   * @param {string} keyName - The key name to validate
   * @returns {boolean} - True if key exists in current context
   */
  validateKeyExistsInCurrentContext(keyName) {
    if (!keyName) return false;

    // First check primary bindset (this.cache.keys)
    const existsInPrimary =
      this.cache.keys && this.cache.keys[keyName] !== undefined;
    if (existsInPrimary) {
      return true;
    }

    // If we have an active bindset that's not the primary bindset, check it too
    if (
      this.cache.activeBindset &&
      this.cache.activeBindset !== "Primary Bindset" &&
      this.cache.profile
    ) {
      const existsInBindset =
        this.cache.profile.bindsets?.[this.cache.activeBindset]?.[
          this.cache.currentEnvironment
        ]?.keys?.[keyName] !== undefined;
      console.log(
        `[CommandService] validateKeyExistsInCurrentContext: key "${keyName}" in bindset "${this.cache.activeBindset}" -> ${existsInBindset}`,
      );
      return existsInBindset;
    }

    // No active bindset or key not found in active bindset
    return false;
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

  // Get command chain preview text
  async getCommandChainPreview() {
    // Use cached selection state from ComponentBase (SelectionService broadcasts)
    const selectedKey =
      this.cache.currentEnvironment === "alias"
        ? this.cache.selectedAlias
        : this.cache.selectedKey;

    console.log("[CommandService] getCommandChainPreview DEBUG:", {
      currentEnvironment: this.cache.currentEnvironment,
      selectedKey: this.cache.selectedKey,
      selectedAlias: this.cache.selectedAlias,
      resolvedSelectedKey: selectedKey,
    });

    if (!selectedKey) {
      const selectText =
        this.cache.currentEnvironment === "alias"
          ? this.i18n.t("select_an_alias_to_see_the_generated_command")
          : this.i18n.t("select_a_key_to_see_the_generated_command");
      return selectText;
    }

    const commands = await this.getCommandsForSelectedKey();

    if (commands.length === 0) {
      if (this.cache.currentEnvironment === "alias") {
        return formatAliasLine(selectedKey, { commands: "" }).trim();
      } else {
        return `${selectedKey} ""`;
      }
    }

    if (this.cache.currentEnvironment === "alias") {
      // For aliases, mirror when metadata requests it
      const profile = this.getCurrentProfile();
      console.log(
        "[CommandLibraryService] alias : getCommandChainPreview: profile",
        profile,
      );
      let shouldStabilize = false;
      if (
        profile &&
        profile.aliasMetadata &&
        profile.aliasMetadata[selectedKey] &&
        profile.aliasMetadata[selectedKey].stabilizeExecutionOrder
      ) {
        shouldStabilize = true;
      }

      let commandString;
      if (shouldStabilize && commands.length > 1) {
        commandString = await this.generateMirroredCommandString(commands);
      } else {
        // Normalize commands before joining
        const normalizedCommands =
          await this.normalizeCommandsForDisplay(commands);
        commandString = normalizedCommands.join(" $$ ");
      }

      return formatAliasLine(selectedKey, { commands: commandString }).trim();
    } else {
      // For keybinds, determine mirroring based on per-key metadata
      const profile = this.getCurrentProfile();
      console.log(
        "[CommandLibraryService] keybind : getCommandChainPreview: profile",
        profile,
      );
      let shouldStabilize = false;
      if (
        profile &&
        profile.keybindMetadata &&
        profile.keybindMetadata[this.cache.currentEnvironment] &&
        profile.keybindMetadata[this.cache.currentEnvironment][selectedKey] &&
        profile.keybindMetadata[this.cache.currentEnvironment][selectedKey]
          .stabilizeExecutionOrder
      ) {
        shouldStabilize = true;
      }

      let commandString;
      if (shouldStabilize && commands.length > 1) {
        commandString = await this.generateMirroredCommandString(commands);
      } else {
        // Normalize commands before joining
        const normalizedCommands =
          await this.normalizeCommandsForDisplay(commands);
        commandString = normalizedCommands.join(" $$ ");
      }

      return `${selectedKey} "${commandString}"`;
    }
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

  // Generate mirrored command string for stabilization
  /** @param {import('./serviceTypes.js').StoredCommand[]} commands */
  async generateMirroredCommandString(commands) {
    return await this.generateMirroredCommands(commands);
  }

  // Generate mirrored command string for execution order stabilization with TrayExec-aware palindromic generation
  /** @param {import('./serviceTypes.js').StoredCommand[]} [commands] */
  async generateMirroredCommands(commands = []) {
    // Accept either an array of command objects or plain strings.
    if (!Array.isArray(commands) || commands.length === 0) return "";

    // Normalise to command objects first
    /** @type {Array<import('./serviceTypes.js').RichCommand & { command: string }>} */
    const cmdObjects = [];
    for (const command of commands) {
      if (typeof command === "string") {
        cmdObjects.push({ command });
      } else if (command && typeof command.command === "string") {
        cmdObjects.push({ ...command, command: command.command });
      }
    }

    if (cmdObjects.length <= 1) {
      const normalized = await this.normalizeCommandsForDisplay(cmdObjects);
      return normalized.join(" $$ ");
    }

    // Apply TrayExec-aware palindromic generation
    /** @type {string[]} */
    const beforePrePivot = []; // Non-TrayExec + excluded TrayExec (before)
    /** @type {string[]} */
    const palindromic = []; // TrayExec for mirroring (pre-pivot candidates)
    /** @type {string[]} */
    const pivotGroup = []; // Excluded TrayExec (in pivot)

    cmdObjects.forEach((cmd) => {
      const cmdStr = cmd.command;
      const isTrayExec = cmdStr.match(/^(?:\+)?TrayExecByTray/);
      const isExcluded = cmd.palindromicGeneration === false;

      if (!isTrayExec) {
        beforePrePivot.push(cmdStr); // Non-TrayExec first
      } else if (isExcluded) {
        if (cmd.placement === "in-pivot-group") {
          pivotGroup.push(cmdStr);
        } else {
          beforePrePivot.push(cmdStr); // before-pre-pivot
        }
      } else {
        palindromic.push(cmdStr); // Normal TrayExec palindrome
      }
    });

    // Determine pivot/pivot group + pre-pivot
    /** @type {string[]} */
    let pivot = [];
    let prePivot = palindromic;

    if (pivotGroup.length > 0) {
      pivot = pivotGroup; // Use specified pivot group
    } else if (palindromic.length > 0) {
      pivot = [palindromic[palindromic.length - 1]]; // Last item becomes pivot
      prePivot = palindromic.slice(0, -1); // All others are pre-pivot
    }

    const postPivot = [...prePivot].reverse(); // Mirror pre-pivot to create post-pivot

    // Build final sequence: [non-TrayExec + before-pre-pivot] + [pre-pivot] + [pivot] + [post-pivot]
    const finalCommands = [
      ...beforePrePivot,
      ...prePivot,
      ...pivot,
      ...postPivot,
    ];

    // Apply normalization before returning
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
      const commandData = await this.request("data:find-command-by-name", {
        command: normalizeToString(commandName),
      });

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
