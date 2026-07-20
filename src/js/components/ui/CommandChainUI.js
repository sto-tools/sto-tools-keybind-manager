import UIComponentBase from "../UIComponentBase.js";
import {
  enrichForDisplay,
  normalizeToString,
} from "../../lib/commandDisplayAdapter.js";
import {
  getEffectiveCommandBindset,
  getSnapshotCommands,
  isSnapshotCommandStabilized,
} from "../services/dataState.js";
import {
  normalizeCommandList,
  projectCommandChainViewState,
} from "../services/commandChainViewState.js";
import {
  adoptCommandPresentationState,
  isCommandGroupCollapsed,
} from "../services/commandPresentationState.js";
import {
  createCommandChainEmptyState,
  materializeCommandChainViewCopy,
} from "./commandChainViewDom.js";
import {
  createCommandChainInteractionState,
  decodeCommandChainClick,
  decodeCommandChainDoubleClick,
  decodeCommandChainDrop,
  getCommandMoveTarget,
  isCommandChainInteractionCurrent,
} from "./commandChainInteractionPolicy.js";
import { resolveDocument, resolveI18n } from "./uiTypes.js";
import {
  findCommandDefinition,
  getCommandWarning,
} from "../../data/commandCatalog.js";
import { generateBindToAliasName } from "../../lib/aliasNameValidator.js";
import {
  formatCommandChainAliasPreview,
  projectMirroringCommands,
} from "../services/commandChainPreviewProjection.js";

const runtime = /** @type {import('./uiTypes.js').RuntimeGlobals} */ (
  globalThis
);

/** @typedef {'before-pre-pivot' | 'in-pivot-group'} CommandPlacement */
/**
 * @typedef {{
 *   command: string,
 *   palindromicGeneration?: boolean,
 *   placement?: CommandPlacement,
 *   [metadata: string]: unknown
 * }} RichChainCommand
 * @typedef {string | RichChainCommand} ChainCommand
 * @typedef {'non-trayexec' | 'palindromic' | 'pivot'} CommandGroupType
 * @typedef {{ command: ChainCommand, index: number }} GroupedCommand
 * @typedef {{ title: string, commands: GroupedCommand[], isCollapsed: boolean }} CommandGroup
 * @typedef {Record<CommandGroupType, CommandGroup>} CommandGroups
 * @typedef {{
 *   key?: string,
 *   params?: import('i18next').TOptions,
 *   fallback?: string,
 *   text?: string,
 *   name?: string,
 *   displayText?: string
 * }} DisplayTextRecord
 * @typedef {import('./commandChainInteractionPolicy.js').CommandChainInteractionState} CommandChainInteractionState
 * @typedef {import('./commandChainInteractionPolicy.js').CommandChainInteraction} CommandChainInteraction
 */

export default class CommandChainUI extends UIComponentBase {
  /**
   * @param {{
   *   eventBus: import('./uiTypes.js').EventBus,
   *   ui?: import('./uiTypes.js').UIServiceLike | null,
   *   document?: Document,
   *   i18n: import('./uiTypes.js').I18nLike
   * }} options
   */
  constructor({
    eventBus,
    ui = null,
    document = typeof window !== "undefined" ? window.document : undefined,
    i18n,
  }) {
    super(eventBus);
    this.componentName = "CommandChainUI";
    this.ui = ui;
    this.document = resolveDocument(document);
    this.i18n = resolveI18n(i18n);

    /** @type {CommandChainInteractionState | null} */
    this._committedInteractionState = null;
    this.eventListenersSetup = false;
    this._hasSelectionState = false;
    this._renderGeneration = 0;
  }

  onInit() {
    this.setupEventListeners();
  }

  setupEventListeners() {
    if (this.eventListenersSetup) return;
    this.eventListenersSetup = true;

    // The accepted DataCoordinator snapshot is the command authority. This
    // compatibility event is now only a render signal; its uncorrelated command
    // payload must not overwrite a newer selection or coordinator revision.
    this.addEventListener("chain-data-changed", () => {
      this.reconcileAcceptedState();
    });

    // ComponentBase adopts these broadcasts before component-specific
    // listeners run. Reconcile only from the resulting accepted caches.
    this.addEventListener("data:state-changed", () => {
      this.updateChainActions();
      this.reconcileAcceptedState();
    });
    this.addEventListener("selection:state-changed", () => {
      this._hasSelectionState = true;
      this.reconcileAcceptedState();
    });
    this.addEventListener("command-presentation:state-changed", (state) => {
      this.acceptCommandPresentationState(state);
    });

    // Listen for environment or key/alias changes for button state and caching
    this.addEventListener("environment:changed", (data) => {
      const env = typeof data === "string" ? data : data?.environment;

      if (env) {
        this.updateChainActions();
        this.updatePreviewLabel();
        this.reconcileAcceptedState();
      }
    });

    // Listen for key selection
    this.addEventListener("key-selected", (data) => {
      const selectedKey = data.key !== undefined ? data.key : data.name;
      if (selectedKey !== undefined) {
        this.cache.selectedKey = selectedKey;
      }
      if ("environment" in data && data.environment) {
        this.cache.currentEnvironment = data.environment;
      }
      this._hasSelectionState = true;

      this.updateChainActions();
      this.reconcileAcceptedState();
    });

    this.addEventListener("alias-selected", () => {
      this._hasSelectionState = true;
      this.updateChainActions();
      this.reconcileAcceptedState();
    });

    // Listen for profile switching to clear cached state and show empty state
    this.addEventListener("profile:switched", () => {
      console.log("[CommandChainUI] Profile switched, clearing cached state");
      this.reconcileAcceptedState();
    });

    // Listen for language changes to re-render command items with new translations
    this.addEventListener("language:changed", () => {
      this.reconcileAcceptedState();
    });

    this.addEventListener("bindset-selector:active-changed", () => {
      this.updateBindsetBanner();
      this.updateChainActions();
      this.reconcileAcceptedState();
    });

    if (!this.cache.currentEnvironment) {
      this.cache.currentEnvironment = "space";
    }

    // Listen for stabilization button click
    this.onDom("stabilizeExecutionOrderBtn", "click", async () => {
      await this.toggleStabilize();
    });

    // Listen for copy alias button click
    this.onDom("copyAliasBtn", "click", async () => {
      await this.copyAliasToClipboard();
    });

    // Listen for copy command preview button click
    this.onDom("copyPreviewBtn", "click", async () => {
      await this.copyCommandPreviewToClipboard();
    });

    // DOM delegates decode inert data into one typed interaction. Only rows
    // from the currently committed render can reach a side-effect boundary.
    this.onDom("#commandList", "click", (event) => {
      const interaction = decodeCommandChainClick(
        event.target,
        this._committedInteractionState,
        this._renderGeneration,
      );
      this.handleCommandChainInteraction(interaction, event).catch(() => {});
    });

    this.onDom("#commandList", "dblclick", (event) => {
      const interaction = decodeCommandChainDoubleClick(
        event.target,
        this._committedInteractionState,
        this._renderGeneration,
      );
      this.handleCommandChainInteraction(interaction, event).catch(() => {});
    });

    // Setup drag/drop
    this.setupDragAndDrop();

    this.updateChainActions();

    // UIComponentBase will handle initial render when data dependencies are ready

    // Bindset preferences alter chain projection. BindsetSelectorUI exclusively
    // owns the selector container and its visibility.
    this.addEventListener("preferences:changed", (data) => {
      const changes = data.changes || { [data.key]: data.value };
      if (
        Object.hasOwn(changes, "bindsetsEnabled") ||
        Object.hasOwn(changes, "bindToAliasMode")
      ) {
        this.reconcileAcceptedState();
      }
    });
  }

  /**
   * Adapt one authorized, side-effect-free DOM projection to the existing
   * command topics and owner RPCs.
   * @param {CommandChainInteraction} interaction
   * @param {Event} event
   */
  async handleCommandChainInteraction(interaction, event) {
    if (interaction.type === "none") return;
    if (
      !isCommandChainInteractionCurrent(
        this._committedInteractionState,
        this._renderGeneration,
        interaction.renderToken,
      )
    ) {
      return;
    }
    if (interaction.consumeEvent) {
      event.preventDefault();
      event.stopPropagation();
    }

    switch (interaction.type) {
      case "edit":
        this.emit("commandchain:edit", { index: interaction.index });
        return;
      case "delete":
        this.emit("commandchain:delete", { index: interaction.index });
        return;
      case "move":
        this.emit("commandchain:move", {
          fromIndex: interaction.fromIndex,
          toIndex: interaction.toIndex,
        });
        return;
      case "toggle-group":
        try {
          await this.request("command-presentation:toggle-group", {
            groupType: interaction.groupType,
          });
        } catch {
          // The owner publication is the only state source. An absent or
          // failing owner leaves the existing projection unchanged.
        }
        return;
      case "toggle-palindromic":
      case "toggle-placement":
        await this.applyCommandToggle(interaction);
    }
  }

  /**
   * @param {{
   *   type: 'toggle-palindromic' | 'toggle-placement',
   *   index: number,
   *   renderToken: string,
   *   consumeEvent: boolean
   * }} interaction
   */
  async applyCommandToggle(interaction) {
    const commands = await this.getCommandsForCurrentSelection();
    if (
      !isCommandChainInteractionCurrent(
        this._committedInteractionState,
        this._renderGeneration,
        interaction.renderToken,
      ) ||
      !commands ||
      interaction.index < 0 ||
      interaction.index >= commands.length
    ) {
      return;
    }

    const command = commands[interaction.index];
    if (interaction.type === "toggle-palindromic") {
      const isCurrentlyIncluded =
        typeof command !== "object" || command.palindromicGeneration !== false;
      await this.updateCommandPalindromicSetting(
        interaction.index,
        "palindromicGeneration",
        !isCurrentlyIncluded,
        interaction.renderToken,
      );
      return;
    }

    const currentPlacement =
      typeof command === "object" && command.placement
        ? command.placement
        : "before-pre-pivot";
    await this.updateCommandPalindromicSetting(
      interaction.index,
      "placement",
      currentPlacement === "in-pivot-group"
        ? "before-pre-pivot"
        : "in-pivot-group",
      interaction.renderToken,
    );
  }

  /**
   * Reconcile a state signal after ComponentBase has updated its accepted
   * caches. The initial paint waits for both DataCoordinator and selection
   * state; subsequent signals start a generation-guarded render.
   */
  reconcileAcceptedState() {
    if (!this.hasRequiredData()) return;
    if (this.pendingInitialRender) {
      this.pendingInitialRender = false;
      this.performInitialRender();
      return;
    }
    this.render().catch(() => {});
  }

  /** @param {unknown} candidate */
  acceptCommandPresentationState(candidate) {
    const accepted = adoptCommandPresentationState(
      candidate,
      this.cache.commandPresentationState,
    );
    if (!accepted) return false;
    this.cache.commandPresentationState = accepted;
    if (this.eventListenersSetup) this.reconcileAcceptedState();
    return true;
  }

  // Render the command chain from one captured accepted-state projection.
  async render() {
    const generation = ++this._renderGeneration;
    const renderToken = String(generation);
    const isCurrent = () =>
      generation === this._renderGeneration && !this.destroyed;
    const container = this.document.getElementById("commandList");
    const titleEl = this.document.getElementById("chainTitle");
    const previewEl = this.document.getElementById("commandPreview");
    const countSpanEl = this.document.getElementById("commandCount");

    if (!container || !titleEl || !previewEl) return;

    const presentationState = this.cache.commandPresentationState;
    if (!presentationState) return;
    const snapshot = this.cache.dataState;
    const environment = this.cache.currentEnvironment || "space";
    const selectedName =
      environment === "alias"
        ? this.cache.selectedAlias
        : this.cache.selectedKey;
    const activeBindset = this.cache.activeBindset || "Primary Bindset";
    const bindsetsEnabled = this.cache.preferences?.bindsetsEnabled === true;
    const bindToAliasMode = this.cache.preferences?.bindToAliasMode === true;
    const view = projectCommandChainViewState({
      snapshot,
      environment,
      selectedName,
      activeBindset,
      bindsetsEnabled,
    });
    const copy = materializeCommandChainViewCopy(this.i18n, view);

    if (
      view.status === "unavailable" ||
      view.status === "no-selection" ||
      view.status === "stale-selection"
    ) {
      if (!isCurrent() || !copy.empty) return;
      const generatedAlias = this.document.getElementById("generatedAlias");
      const aliasPreview = this.document.getElementById("aliasPreview");
      if (generatedAlias) generatedAlias.style.display = "none";
      if (aliasPreview) aliasPreview.textContent = "";
      titleEl.textContent = copy.title;
      previewEl.textContent = copy.preview;
      if (countSpanEl) countSpanEl.textContent = copy.count;
      this._committedInteractionState = createCommandChainInteractionState({
        renderToken,
        commandCount: 0,
      });
      container.replaceChildren(
        createCommandChainEmptyState(this.document, copy.empty),
      );
      this.updatePreviewLabel();
      this.updateBindsetBanner();
      return;
    }

    await this.updateBindToAliasMode(
      bindToAliasMode,
      view.selectedName,
      view.commands,
      view.stabilized,
      {
        snapshot,
        environment: view.environment,
        bindset: view.bindset,
        bindToAliasMode,
        isCurrent,
      },
    );
    if (!isCurrent()) return;

    if (view.status === "empty") {
      if (!copy.empty) return;
      titleEl.textContent = copy.title;
      if (countSpanEl) countSpanEl.textContent = copy.count;
      this._committedInteractionState = createCommandChainInteractionState({
        renderToken,
        commandCount: 0,
      });
      container.replaceChildren(
        createCommandChainEmptyState(this.document, copy.empty),
      );
      if (!isCurrent()) return;
      this.emit("command-chain:validate", {
        key: view.selectedName,
        stabilized: view.stabilized,
        isAlias: view.environment === "alias",
      });
      this.updateBindsetBanner();
      return;
    }

    /** @type {Element[]} */
    const newCommandElements = [];
    /** @type {CommandGroups | null} */
    let nextGroups = null;

    if (view.stabilized) {
      nextGroups = this.groupCommands(view.commands, presentationState);
    }
    const interactionState = createCommandChainInteractionState({
      renderToken,
      commandCount: view.commandCount,
      groups: nextGroups,
    });

    if (view.stabilized && nextGroups) {
      /** @type {CommandGroupType[]} */
      const groupOrder = ["non-trayexec", "palindromic", "pivot"];
      for (const groupType of groupOrder) {
        const groupData = nextGroups[groupType];
        if (!groupData || groupData.commands.length === 0) continue;
        const separator = this.renderGroupSeparator(
          groupType,
          groupData,
          renderToken,
        );
        if (separator) {
          const separatorEl = this.document.createElement("div");
          separatorEl.innerHTML = separator;
          newCommandElements.push(...separatorEl.children);
        }
        if (groupData.isCollapsed) continue;
        for (
          let groupIndex = 0;
          groupIndex < groupData.commands.length;
          groupIndex++
        ) {
          const { command, index } = groupData.commands[groupIndex];
          const element = await this.createCommandElement(
            command,
            index,
            view.commandCount,
            groupType,
            groupIndex + 1,
            view.stabilized,
            interactionState,
          );
          if (!isCurrent()) return;
          newCommandElements.push(element);
        }
      }
    } else {
      for (let index = 0; index < view.commands.length; index++) {
        const element = await this.createCommandElement(
          view.commands[index],
          index,
          view.commandCount,
          null,
          null,
          view.stabilized,
          interactionState,
        );
        if (!isCurrent()) return;
        newCommandElements.push(element);
      }
    }

    if (!isCurrent()) return;
    const aliasCountSpanEl = this.document.getElementById("aliasCommandCount");
    const commandCountDisplay = this.document.getElementById(
      "commandCountDisplay",
    );
    const aliasCommandCountDisplay = this.document.getElementById(
      "aliasCommandCountDisplay",
    );
    const commandTranslationSpan = commandCountDisplay?.querySelector(
      '[data-i18n="commands"], [data-i18n="command_singular"]',
    );
    const aliasCommandTranslationSpan = aliasCommandCountDisplay?.querySelector(
      '[data-i18n="commands"], [data-i18n="command_singular"]',
    );
    const translationKey =
      view.commandCount === 1 ? "command_singular" : "commands";

    titleEl.textContent = copy.title;
    if (bindToAliasMode && view.environment !== "alias") {
      if (aliasCountSpanEl) aliasCountSpanEl.textContent = copy.count;
      if (aliasCommandTranslationSpan) {
        aliasCommandTranslationSpan.setAttribute("data-i18n", translationKey);
        aliasCommandTranslationSpan.textContent = this.i18n.t(translationKey);
      }
      if (aliasCommandCountDisplay) aliasCommandCountDisplay.style.display = "";
      if (commandCountDisplay) commandCountDisplay.style.display = "none";
    } else {
      if (countSpanEl) countSpanEl.textContent = copy.count;
      if (commandTranslationSpan) {
        commandTranslationSpan.setAttribute("data-i18n", translationKey);
        commandTranslationSpan.textContent = this.i18n.t(translationKey);
      }
      if (commandCountDisplay) commandCountDisplay.style.display = "";
      if (aliasCommandCountDisplay)
        aliasCommandCountDisplay.style.display = "none";
    }
    this._committedInteractionState = interactionState;
    container.replaceChildren(...newCommandElements);
    if (!isCurrent()) return;
    this.emit("command-chain:validate", {
      key: view.selectedName,
      stabilized: view.stabilized,
      isAlias: view.environment === "alias",
    });
    this.updateBindsetBanner();
  }

  // Group commands into sections for stabilized chains
  /**
   * @param {ChainCommand[]} commands
   * @param {import('../../types/events/component-state.js').CommandPresentationStateSnapshot | null} [presentationState]
   * @returns {CommandGroups}
   */
  groupCommands(
    commands,
    presentationState = this.cache.commandPresentationState,
  ) {
    /** @type {CommandGroups} */
    const groups = {
      "non-trayexec": {
        title: this.i18n.t("command_group_non_trayexec"),
        commands: [],
        isCollapsed: isCommandGroupCollapsed(presentationState, "non-trayexec"),
      },
      palindromic: {
        title: this.i18n.t("command_group_palindromic"),
        commands: [],
        isCollapsed: isCommandGroupCollapsed(presentationState, "palindromic"),
      },
      pivot: {
        title: this.i18n.t("command_group_pivot"),
        commands: [],
        isCollapsed: isCommandGroupCollapsed(presentationState, "pivot"),
      },
    };

    // Check if there are any commands explicitly in pivot group
    const hasExplicitPivotGroup = commands.some(
      (cmd) => typeof cmd === "object" && cmd.placement === "in-pivot-group",
    );

    commands.forEach((cmd, index) => {
      const cmdStr = typeof cmd === "string" ? cmd : cmd.command;
      const isTrayExec = cmdStr.match(/^(?:\+)?TrayExecByTray/);
      const isExcluded =
        typeof cmd === "object" && cmd.palindromicGeneration === false;
      const isInPivotGroup =
        typeof cmd === "object" && cmd.placement === "in-pivot-group";

      // Determine which group this command belongs to
      /** @type {CommandGroupType} */
      let targetGroup;
      if (!isTrayExec) {
        targetGroup = "non-trayexec";
      } else if (isExcluded && isInPivotGroup && hasExplicitPivotGroup) {
        // Only add to pivot group if there's an explicit pivot group
        targetGroup = "pivot";
      } else if (isExcluded) {
        // Excluded but not in pivot group (or no explicit pivot group) - goes with non-TrayExec
        targetGroup = "non-trayexec";
      } else {
        // Included in palindrome
        targetGroup = "palindromic";
      }

      groups[targetGroup].commands.push({ command: cmd, index });
    });

    return groups;
  }

  // Render group separator with collapsible header
  /**
   * @param {CommandGroupType} groupType
   * @param {CommandGroup} groupData
   * @param {string} renderToken
   */
  renderGroupSeparator(groupType, groupData, renderToken) {
    const reorderHint = this.getReorderHint(groupType);

    return `
      <div class="command-group-separator" data-group="${groupType}">
        <div class="group-header" data-group="${groupType}" data-render-token="${renderToken}" data-action="commandchain-group-header">
          <div class="group-info">
            <i class="fas fa-chevron-right twisty ${groupData.isCollapsed ? "collapsed" : ""}"></i>
            <span class="group-title">${groupData.title}</span>
            <span class="group-count">(${groupData.commands.length})</span>
          </div>
          ${
            reorderHint
              ? `
            <div class="group-hint">
              ${reorderHint}
            </div>
          `
              : ""
          }
        </div>
      </div>
    `;
  }

  // Get reorder hint for a group type
  /** @param {CommandGroupType} groupType */
  getReorderHint(groupType) {
    switch (groupType) {
      case "non-trayexec":
        return this.i18n.t("command_group_hint_fixed_order");
      case "palindromic":
        return this.i18n.t("command_group_hint_palindromic");
      case "pivot":
        return this.i18n.t("command_group_hint_pivot");
      default:
        return "";
    }
  }

  // Create a command element
  /**
   * @param {'up' | 'down'} direction
   * @param {number} index
   * @param {CommandGroupType | null | undefined} groupType
   * @param {CommandChainInteractionState} interactionState
   */
  getButtonState(direction, index, groupType, interactionState) {
    const disabled =
      getCommandMoveTarget(
        interactionState,
        index,
        groupType ?? null,
        direction,
      ) === null;
    return `<button class="command-action-btn btn-${direction}" title="${direction === "up" ? "Move Up" : "Move Down"}" ${disabled ? "disabled" : ""}><i class="fas fa-chevron-${direction}"></i></button>`;
  }

  /**
   * @param {ChainCommand} command
   * @param {number} index
   * @param {number} total
   * @param {CommandGroupType | null} [groupType]
   * @param {number | null} [displayIndex]
   * @param {boolean} [stabilized]
   * @param {CommandChainInteractionState | null} [interactionState]
   */
  async createCommandElement(
    command,
    index,
    total,
    groupType = null,
    displayIndex = null,
    stabilized = undefined,
    interactionState = null,
  ) {
    const snapshot = this.cache.dataState;
    const environment = this.cache.currentEnvironment || "space";
    const name =
      environment === "alias"
        ? this.cache.selectedAlias
        : this.cache.selectedKey;
    const bindset = this.getEffectiveCommandBindset();
    const isStabilized =
      stabilized ??
      isSnapshotCommandStabilized(snapshot, environment, name, bindset);
    const rowInteractionState =
      interactionState ??
      createCommandChainInteractionState({
        renderToken: this._renderGeneration,
        commandCount: total,
      });
    const element = this.document.createElement("div");
    element.className = "command-item-row";
    element.dataset.index = String(index);
    element.dataset.renderToken = rowInteractionState.renderToken;
    element.draggable = true;
    if (groupType) {
      element.dataset.group = groupType;
    }

    // Convert canonical string command to rich object for display
    const commandString =
      typeof command === "string" ? command : normalizeToString(command);

    // Get i18n object for translations
    const i18n = this.i18n;

    // Enrich command for display
    const richCommand = await enrichForDisplay(commandString, i18n, {
      eventBus: this.eventBus ?? undefined,
    });
    console.log("[CommandChainUI] enriched command:", richCommand);

    // Look up definition for display helpers
    const commandDef = findCommandDefinition(commandString, this.i18n);
    // Determine if this command should expose parameter editing
    const isCustomCmd =
      richCommand.type === "custom" || richCommand.category === "custom";
    const isParameterized =
      (commandDef && commandDef.customizable) || isCustomCmd;

    // Determine if this is a TrayExec command for palindromic controls
    const isTrayExec = commandString.match(/^(?:\+)?TrayExecByTray/);

    // Extract palindromic settings from command object (if rich object)
    // Default is included (palindromicGeneration !== false), so active = included
    // If it's a string, it's included. If it's an object, it's included unless palindromicGeneration is explicitly false
    const isIncludedInPalindromic =
      typeof command !== "object" || command.palindromicGeneration !== false;
    const isExcluded = !isIncludedInPalindromic;
    const placement =
      typeof command === "object" && command.placement
        ? command.placement
        : "before-pre-pivot";
    const isInPivotGroup = placement === "in-pivot-group";

    // Generate palindromic toggle button (only show for TrayExec commands when stabilized)
    // Active = included in palindrome, Inactive = excluded
    let palindromicButton = "";
    if (isStabilized && isTrayExec) {
      const palindromicTooltip = isIncludedInPalindromic
        ? this.i18n.t("palindromic_included_tooltip")
        : this.i18n.t("palindromic_excluded_tooltip");
      palindromicButton = `
        <button class="command-action-btn toolbar-toggle btn-palindromic-toggle ${isIncludedInPalindromic ? "active" : ""}"
                title="${palindromicTooltip}" 
                data-command-index="${index}"
                data-action="commandchain-palindromic-toggle">
          <i class="fas fa-balance-scale"></i>
        </button>
      `;
    }

    // Generate placement toggle button (only show for excluded TrayExec commands when stabilized)
    // Active = in pivot group, Inactive = before pre-pivot
    let placementButton = "";
    if (isStabilized && isTrayExec && isExcluded) {
      const placementTooltip = isInPivotGroup
        ? this.i18n.t("placement_in_pivot_group_tooltip")
        : this.i18n.t("placement_before_palindromes_tooltip");
      placementButton = `
        <button class="command-action-btn toolbar-toggle btn-placement-toggle ${isInPivotGroup ? "active" : ""}"
                title="${placementTooltip}" 
                data-command-index="${index}"
                data-action="commandchain-placement-toggle">
          <i class="fas fa-arrows-left-right-to-line"></i>
        </button>
      `;
    }

    // Helper function to format display text from i18n objects
    /**
     * @param {string | DisplayTextRecord | null | undefined} displayText
     * @returns {string}
     */
    const formatDisplayText = (displayText) => {
      if (typeof displayText === "string") {
        return displayText;
      }
      if (typeof displayText === "object" && displayText) {
        // Handle i18n structure with key/params/fallback
        if (displayText.key && displayText.fallback) {
          // Try to get i18n translation if available
          if (this.i18n && this.i18n.t) {
            const translated = this.i18n.t(
              displayText.key,
              displayText.params || {},
            );
            if (translated && translated !== displayText.key) {
              return translated;
            }
          }
          // Fall back to the fallback text
          return displayText.fallback;
        }
        // Handle simple fallback structure
        if (displayText.fallback) {
          return displayText.fallback;
        }
        // Handle direct object with text properties
        if (displayText.text) {
          return displayText.text;
        }
        // Handle object that might be a direct string value
        const baseName = displayText.name || displayText.displayText;
        if (baseName) {
          return baseName;
        }
      }
      return commandString; // Fallback to command string
    };

    let displayName =
      formatDisplayText(richCommand.displayText) ||
      richCommand.text ||
      commandString;
    let displayIcon = richCommand.icon;

    if (isParameterized) {
      element.dataset.parameters = "true";
      element.classList.add("customizable");
      // Double-click is now handled by EventBus delegation in setupEventListeners()
    }

    // Pass the command string (not object) to get-warning
    const warningInfo = getCommandWarning(commandString);

    // Resolve tooltip text using the central i18n service so that dynamic language switching works
    let warningText = null;
    if (warningInfo) {
      const translated = this.i18n.t(warningInfo);
      // Use translated value if available; otherwise fall back to original (may already be natural language)
      warningText =
        translated && translated !== warningInfo ? translated : warningInfo;
    }

    const warningIcon = warningText
      ? `<span class="command-warning-icon" title="${warningText}" data-i18n-title="${warningInfo}"><i class="fas fa-exclamation-triangle"></i></span>`
      : "";
    const parameterInd = isParameterized
      ? ' <span class="param-indicator" title="Editable parameters">⚙️</span>'
      : "";

    console.log("[CommandChainUI] command", command);
    console.log("[CommandChainUI] commandDef", commandDef);
    // Determine the actual command type from the definition, not from the parsed command
    let commandType = richCommand.type || richCommand.category;
    // Preserve VFX alias type, don't override it with command definition categoryId
    // Also preserve other specific alias types like 'alias' or 'vfx-alias'
    if (
      commandDef &&
      commandDef.categoryId &&
      !["vfx-alias", "alias"].includes(richCommand.type) &&
      !["vfx-alias", "alias"].includes(richCommand.category)
    ) {
      commandType = commandDef.categoryId;
    }

    // Use displayIndex if provided (group-relative for stabilized), otherwise use global index
    const numberToDisplay = displayIndex !== null ? displayIndex : index + 1;
    element.innerHTML = `
      <div class="command-number">${numberToDisplay}</div>
      <div class="command-content">
        <span class="command-icon">${displayIcon}</span>
        <span class="command-text">${displayName}${parameterInd}</span>
        ${warningIcon}
      </div>
      <span class="command-type ${commandType}">${commandType}</span>
      <div class="command-actions">
        ${isParameterized ? `<button class="command-action-btn btn-edit" title="Edit Command"><i class="fas fa-edit"></i></button>` : `<button class="command-action-btn btn-edit btn-placeholder" disabled aria-hidden="true" style="visibility:hidden"><i class="fas fa-edit"></i></button>`}
        <button class="command-action-btn command-action-btn-danger btn-delete" title="Delete Command"><i class="fas fa-times"></i></button>
        ${palindromicButton}
        ${placementButton}
        ${this.getButtonState("up", index, groupType, rowInteractionState)}
        ${this.getButtonState("down", index, groupType, rowInteractionState)}
      </div>`;

    // Command action buttons are now handled by EventBus delegation in setupEventListeners()
    // No need for individual event listeners here

    return element;
  }

  /**
   * Setup drag-and-drop for command list re-ordering.
   */
  setupDragAndDrop() {
    if (!this.ui || typeof this.ui.initDragAndDrop !== "function") return;

    const commandList = this.document.getElementById("commandList");
    if (!commandList) return;

    const detach = this.ui.initDragAndDrop(commandList, {
      draggableSelector: ".command-item-row",
      dropZoneSelector: ".command-item-row",
      onDrop: (e, dragState, dropZone) => {
        const interaction = decodeCommandChainDrop(
          dragState?.dragElement,
          dropZone,
          this._committedInteractionState,
          this._renderGeneration,
        );
        this.handleCommandChainInteraction(interaction, e).catch(() => {});
      },
    });
    if (typeof detach === "function") this.domEventListeners.push(detach);
  }

  // Update previews for bind-to-alias mode
  /** @param {string | null | undefined} [environment] */
  updatePreviewLabel(environment = this.cache.currentEnvironment) {
    const labelEl = this.document.querySelector(
      ".generated-command label[data-i18n]",
    );
    if (labelEl) {
      const newKey =
        environment === "alias" ? "generated_alias" : "generated_command";
      labelEl.setAttribute("data-i18n", newKey);

      // Apply translation immediately using multiple fallback methods
      if (runtime.applyTranslations) {
        runtime.applyTranslations(labelEl.parentElement);
      } else {
        labelEl.textContent = this.i18n.t(newKey);
      }
    }
  }

  /**
   * @param {boolean} bindToAliasMode
   * @param {string | null | undefined} selectedKeyName
   * @param {ChainCommand[]} commands
   * @param {boolean} [stabilized]
   * @param {{
   *   snapshot?: import('../../types/events/component-state.js').DataCoordinatorStateSnapshot | null,
   *   environment?: string,
   *   bindset?: string | null,
   *   bindToAliasMode?: boolean,
   *   isCurrent?: () => boolean
   * }} [renderContext]
   */
  async updateBindToAliasMode(
    bindToAliasMode,
    selectedKeyName,
    commands,
    stabilized = undefined,
    renderContext = {},
  ) {
    const snapshot = renderContext.snapshot ?? this.cache.dataState;
    const environment =
      renderContext.environment || this.cache.currentEnvironment || "space";
    const name = selectedKeyName;
    const bindset =
      renderContext.bindset === undefined
        ? this.getEffectiveCommandBindset()
        : renderContext.bindset;
    const isStabilized =
      stabilized ??
      isSnapshotCommandStabilized(snapshot, environment, name, bindset);
    const generatedAlias = this.document.getElementById("generatedAlias");
    const aliasPreviewEl = this.document.getElementById("aliasPreview");
    const previewEl = this.document.getElementById("commandPreview");

    // Double-check current bindToAliasMode preference to handle race conditions
    const currentBindToAliasMode =
      renderContext.bindToAliasMode ??
      this.cache.preferences?.bindToAliasMode ??
      false;
    const effectiveBindToAliasMode = bindToAliasMode || currentBindToAliasMode;
    const isCurrent = renderContext.isCurrent || (() => true);

    console.log(
      `[CommandChainUI] updateBindToAliasMode: bindToAliasMode=${bindToAliasMode}, current=${currentBindToAliasMode}, effective=${effectiveBindToAliasMode}, selectedKeyName=${selectedKeyName}, environment=${environment}, activeBindset=${bindset}`,
    );

    if (!generatedAlias || !aliasPreviewEl || !previewEl) {
      console.log(
        `[CommandChainUI] Missing UI elements: generatedAlias=${!!generatedAlias}, aliasPreviewEl=${!!aliasPreviewEl}, previewEl=${!!previewEl}`,
      );
      return false;
    }

    if (
      effectiveBindToAliasMode &&
      selectedKeyName &&
      environment !== "alias"
    ) {
      try {
        if (!isCurrent()) return false;
        let aliasName = null;
        try {
          aliasName = generateBindToAliasName(
            environment,
            selectedKeyName,
            bindset,
          );
        } catch (error) {
          console.error(
            "[CommandChainUI] Failed to generate alias name:",
            error,
          );
        }
        if (!isCurrent()) return false;

        if (aliasName) {
          let aliasPreview = formatCommandChainAliasPreview(
            aliasName,
            commands,
          );
          if (!isCurrent()) return false;

          // Apply mirroring when stabilized
          try {
            if (isStabilized && commands.length > 1) {
              const commandObjects = projectMirroringCommands(commands);
              const mirroredStr = await this.request(
                "command:generate-mirrored-commands",
                { commands: commandObjects },
              );
              if (!isCurrent()) return false;
              if (mirroredStr) {
                aliasPreview = `alias ${aliasName} <& ${mirroredStr} &>`;
              }
            }
          } catch (error) {
            if (!isCurrent()) return false;
            console.warn("[CommandChainUI] Failed to apply mirroring:", error);
          }

          if (!isCurrent()) return false;
          generatedAlias.style.display = "";
          aliasPreviewEl.textContent = aliasPreview;
          previewEl.textContent = `${selectedKeyName} "${aliasName}"`;

          // ADDITIONAL SAFEGUARD: Ensure bind-to-alias mode takes precedence over any subsequent mirroring logic
          if (effectiveBindToAliasMode) {
            console.log(
              "[CommandChainUI] Set main preview to alias name - bind-to-alias mode takes precedence",
            );
          }
        } else {
          if (!isCurrent()) return false;
          generatedAlias.style.display = "";
          aliasPreviewEl.textContent = this.i18n.t(
            "invalid_key_name_for_alias_generation",
            { defaultValue: "Invalid key name for alias generation" },
          );
          previewEl.textContent = `${selectedKeyName} "..."`;
        }
      } catch (error) {
        if (!isCurrent()) return false;
        console.error(
          "[CommandChainUI] Failed to generate alias preview:",
          error,
        );
        generatedAlias.style.display = "";
        aliasPreviewEl.textContent = this.i18n.t(
          "error_generating_alias_preview",
          { defaultValue: "Error generating alias preview" },
        );
        previewEl.textContent = `${selectedKeyName} "..."`;
      }
    } else {
      const commandStrings = commands
        .map((cmd) => (typeof cmd === "string" ? cmd : cmd.command))
        .filter(Boolean);
      let previewString = commandStrings.join(" $$ ");

      // Apply mirroring when stabilized
      try {
        if (isStabilized && commands.length > 1) {
          const commandObjects = projectMirroringCommands(commands);
          const mirroredStr = await this.request(
            "command:generate-mirrored-commands",
            { commands: commandObjects },
          );
          if (!isCurrent()) return false;
          if (mirroredStr) previewString = mirroredStr;
        }
      } catch {
        if (!isCurrent()) return false;
        // Keep the locally generated preview when the service is not ready.
      }

      if (!isCurrent()) return false;
      generatedAlias.style.display = "none";
      this.updatePreviewLabel(environment);
      if (selectedKeyName) {
        if (environment === "alias") {
          // In alias mode, show alias format: alias aliasName <& commands &>
          previewEl.textContent = `alias ${selectedKeyName} <& ${previewString} &>`;
        } else {
          // In key mode, show keybind format: keyName "commands"
          previewEl.textContent = `${selectedKeyName} "${previewString}"`;
        }
      } else {
        previewEl.textContent = "";
      }
    }
    return true;
  }

  // Enable/disable chain-related buttons depending on environment & selection.
  async updateChainActions() {
    const snapshot = this.cache.dataState;
    const environment = this.cache.currentEnvironment || "space";
    const name =
      environment === "alias"
        ? this.cache.selectedAlias
        : this.cache.selectedKey;
    const bindset = this.getEffectiveCommandBindset();
    const hasSelectedKey = !!name;

    // Always enable stabilize button only when a chain is selected
    const stabBtn = /** @type {HTMLButtonElement | null} */ (
      this.document.getElementById("stabilizeExecutionOrderBtn")
    );
    if (stabBtn) {
      stabBtn.disabled = !hasSelectedKey;
      // Update active state from metadata
      if (hasSelectedKey) {
        const isActive = isSnapshotCommandStabilized(
          snapshot,
          environment,
          name,
          bindset,
        );
        stabBtn.classList.toggle("active", isActive);
      } else {
        stabBtn.classList.remove("active");
      }
    }

    if (environment === "alias") {
      // Alias mode – alias specific buttons
      const aliasButtons = ["deleteAliasChainBtn", "duplicateAliasChainBtn"];
      aliasButtons.forEach((id) => {
        const btn = /** @type {HTMLButtonElement | null} */ (
          this.document.getElementById(id)
        );
        if (btn) btn.disabled = !hasSelectedKey;
      });

      const importBtn = /** @type {HTMLButtonElement | null} */ (
        this.document.getElementById("importFromKeyOrAliasBtn")
      );
      if (importBtn) importBtn.disabled = !hasSelectedKey;

      const keyButtons = ["deleteKeyBtn", "duplicateKeyBtn"];
      keyButtons.forEach((id) => {
        const btn = /** @type {HTMLButtonElement | null} */ (
          this.document.getElementById(id)
        );
        if (btn) btn.disabled = true;
      });
    } else {
      const keyButtons = [
        "importFromKeyOrAliasBtn",
        "deleteKeyBtn",
        "duplicateKeyBtn",
      ];
      keyButtons.forEach((id) => {
        const btn = /** @type {HTMLButtonElement | null} */ (
          this.document.getElementById(id)
        );
        if (btn) btn.disabled = !hasSelectedKey;
      });

      const aliasButtons = ["deleteAliasChainBtn", "duplicateAliasChainBtn"];
      aliasButtons.forEach((id) => {
        const btn = /** @type {HTMLButtonElement | null} */ (
          this.document.getElementById(id)
        );
        if (btn) btn.disabled = true;
      });
    }
  }

  // Toggle stabilization flag for the current selection
  async toggleStabilize() {
    const snapshot = this.cache.dataState;
    const environment = this.cache.currentEnvironment;
    if (
      !snapshot?.ready ||
      !environment ||
      environment !== snapshot.currentEnvironment
    ) {
      return;
    }
    const selectedName =
      environment === "alias"
        ? this.cache.selectedAlias
        : this.cache.selectedKey;
    const view = projectCommandChainViewState({
      snapshot,
      environment,
      selectedName,
      activeBindset: this.cache.activeBindset,
      bindsetsEnabled: this.cache.preferences?.bindsetsEnabled === true,
    });
    if (view.status !== "empty" && view.status !== "populated") return;
    const name = view.selectedName;
    if (!name) return;

    try {
      // Canonical commands are always stored unmirrored. Stabilization is a
      // metadata-only concern, so the owner is the sole writer and its accepted
      // state broadcast is the sole repaint trigger.
      await this.request("command:set-stabilize", {
        name,
        stabilize: !view.stabilized,
        bindset: view.bindset,
      });
    } catch (err) {
      console.error("[CommandChainUI] Failed to toggle stabilization", err);
    }
  }

  // Update palindromic settings for a specific command using lazy rich object conversion
  /**
   * @param {number} commandIndex
   * @param {'palindromicGeneration' | 'placement'} setting
   * @param {boolean | CommandPlacement} value
   * @param {string} [renderToken]
   */
  async updateCommandPalindromicSetting(
    commandIndex,
    setting,
    value,
    renderToken,
  ) {
    try {
      // Get current commands for the selected key/alias
      const commands = await this.getCommandsForCurrentSelection();
      if (
        renderToken !== undefined &&
        !isCommandChainInteractionCurrent(
          this._committedInteractionState,
          this._renderGeneration,
          renderToken,
        )
      ) {
        return;
      }
      if (!commands || commandIndex < 0 || commandIndex >= commands.length) {
        console.warn("[CommandChainUI] Invalid command index:", commandIndex);
        return;
      }

      const command = commands[commandIndex];
      const commandString =
        typeof command === "string" ? command : normalizeToString(command);

      console.log("[CommandChainUI] updateCommandPalindromicSetting:", {
        commandIndex,
        setting,
        value,
        currentCommand: command,
        commandString,
      });

      // Apply lazy rich object conversion: only convert to rich object when user customizes
      if (typeof command === "string") {
        // Convert string to a rich object only when the user customizes it.
        commands[commandIndex] =
          setting === "palindromicGeneration"
            ? { command: commandString, palindromicGeneration: value === true }
            : {
                command: commandString,
                placement:
                  value === "in-pivot-group"
                    ? "in-pivot-group"
                    : "before-pre-pivot",
              };
      } else {
        // Update existing rich object while keeping each setting's value type precise.
        const updatedCommand = { ...command };
        if (setting === "palindromicGeneration") {
          updatedCommand.palindromicGeneration = value === true;
        } else {
          updatedCommand.placement =
            value === "in-pivot-group" ? "in-pivot-group" : "before-pre-pivot";
        }
        commands[commandIndex] = updatedCommand;
      }

      console.log("[CommandChainUI] Updated command:", commands[commandIndex]);

      // Update the command chain with the modified commands using data:update-profile
      const selectedKeyName =
        this.cache.currentEnvironment === "alias"
          ? this.cache.selectedAlias
          : this.cache.selectedKey;
      if (selectedKeyName) {
        const profileId = this.cache.currentProfile;
        if (!profileId) return;
        const bindset = this.getEffectiveCommandBindset();
        const environment = this.cache.currentEnvironment;

        // Build the update payload - preserve rich objects
        let payload;
        if (this.cache.currentEnvironment === "alias") {
          // For aliases, update the commands property
          payload = {
            modify: {
              aliases: {
                [selectedKeyName]: { commands },
              },
            },
          };
        } else if (bindset && bindset !== "Primary Bindset") {
          // For bindsets, update in bindsets structure
          payload = {
            modify: {
              bindsets: {
                [bindset]: {
                  [environment]: {
                    keys: { [selectedKeyName]: commands },
                  },
                },
              },
            },
          };
        } else {
          // For primary bindset, update in builds structure
          payload = {
            modify: {
              builds: {
                [environment]: {
                  keys: { [selectedKeyName]: commands },
                },
              },
            },
          };
        }

        await this.request("data:update-profile", {
          profileId,
          ...payload,
        });

        if (
          renderToken !== undefined &&
          !isCommandChainInteractionCurrent(
            this._committedInteractionState,
            this._renderGeneration,
            renderToken,
          )
        ) {
          return;
        }

        // CRITICAL: Use the updated commands array directly instead of re-fetching to avoid timing issues
        // This ensures the mirroring logic has the most up-to-date placement data
        console.log("[CommandChainUI] Commands after update:", commands);

        // Trigger re-render to show updated button state with the current placement data
        await this.render();
      }
    } catch (err) {
      console.error(
        "[CommandChainUI] Failed to update command palindromic setting:",
        err,
      );
    }
  }

  // Clean up event listeners when component is destroyed
  onDestroy() {
    this._renderGeneration += 1;
    this._committedInteractionState = null;
    this.eventListenersSetup = false;
    this._hasSelectionState = false;
    this.pendingInitialRender = false;
    this.cache.commandPresentationState = null;
  }

  // Late-join: sync environment if InterfaceModeService broadcasts its snapshot before we registered our listeners.
  /**
   * @param {import('../../types/events/component-state.js').ComponentStateReply} reply
   */
  handleInitialState(reply) {
    const { sender, state } = reply;
    if (sender === "CommandPresentationService") {
      this.acceptCommandPresentationState(state);
    }
    if (sender === "SelectionService") {
      this._hasSelectionState = true;
    }
    super.handleInitialState(reply);

    if (sender === "CommandPresentationService") return;

    if (sender === "BindsetSelectorService") {
      console.log(
        "[CommandChainUI] Received initial state from BindsetSelectorService:",
        state,
      );
      // ComponentBase automatically updates this.cache.activeBindset and other common state
      // Update any UI-specific state if needed
      this.updateBindsetBanner();
      this.updateChainActions();
      return;
    }

    if (sender === "SelectionService") {
      return;
    }

    // Only accept environment updates from authoritative sources
    const initialEnvironment = /** @type {{
      environment?: string,
      currentEnvironment?: string
    }} */ (state);
    const environment =
      sender === "InterfaceModeService"
        ? initialEnvironment.environment ||
          initialEnvironment.currentEnvironment
        : undefined;

    if (environment) {
      this.cache.currentEnvironment = environment;
      this.updateChainActions();
    }
  }

  /** @returns {Promise<ChainCommand[]>} */
  async getCommandsForCurrentSelection() {
    const snapshot = this.cache.dataState;
    const environment = this.cache.currentEnvironment || "space";
    const name =
      environment === "alias"
        ? this.cache.selectedAlias
        : this.cache.selectedKey;
    if (!name) return [];
    const bindset = this.getEffectiveCommandBindset();
    return normalizeCommandList(
      getSnapshotCommands(snapshot, environment, name, bindset),
    );
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

  // Ensure a banner element exists beneath the chain header content showing the currently-active bindset
  updateBindsetBanner() {
    try {
      const header = /** @type {HTMLElement | null} */ (
        this.document.querySelector(".chain-header")
      );
      if (!header) return;

      let banner = this.document.getElementById("bindsetBanner");

      const activeBindset = this.getEffectiveCommandBindset();
      const shouldShow = activeBindset && activeBindset !== "Primary Bindset";

      if (!shouldShow) {
        if (banner) banner.remove();
        return;
      }

      // Ensure header can wrap so banner goes to next line
      header.style.flexWrap = "wrap";

      // Create banner lazily
      if (!banner) {
        banner = this.document.createElement("div");
        banner.id = "bindsetBanner";
        banner.className = "bindset-banner";
        // Basic inline styling; projects stylesheet can override
        Object.assign(banner.style, {
          marginTop: "4px",
          padding: "0.125rem 0.5rem",
          background: "#3a3d42",
          color: "#fff",
          borderRadius: "4px",
          fontSize: "0.85em",
          flex: "0 0 100%",
          textAlign: "center",
        });
        header.appendChild(banner);
      }

      banner.textContent = activeBindset;
    } catch (err) {
      console.error("[CommandChainUI] Failed to update bindset banner", err);
    }
  }

  /**
   * Copy alias content to clipboard
   */
  async copyAliasToClipboard() {
    const aliasPreviewEl = this.document.getElementById("aliasPreview");
    const text = aliasPreviewEl?.textContent?.trim();
    if (!text) {
      this.showToast(this.i18n.t("nothing_to_copy"), "warning");
      return;
    }

    try {
      const result = await this.request("utility:copy-to-clipboard", { text });
      if (result?.success) {
        const successMessage = this.i18n.t(
          result?.message || "content_copied_to_clipboard",
        );
        this.showToast(successMessage, "success");
      } else {
        const errorMessage = this.i18n.t(
          result?.message || "failed_to_copy_to_clipboard",
        );
        this.showToast(errorMessage, "error");
      }
    } catch (error) {
      console.error("Failed to copy alias to clipboard:", error);
      this.showToast(this.i18n.t("failed_to_copy_to_clipboard"), "error");
    }
  }

  async copyCommandPreviewToClipboard() {
    const commandPreviewEl = this.document.getElementById("commandPreview");
    const text = commandPreviewEl?.textContent?.trim();
    if (!text) {
      this.showToast(this.i18n.t("nothing_to_copy"), "warning");
      return;
    }

    try {
      const result = await this.request("utility:copy-to-clipboard", { text });
      if (result?.success) {
        const successMessage = this.i18n.t(
          result?.message || "content_copied_to_clipboard",
        );
        this.showToast(successMessage, "success");
      } else {
        const errorMessage = this.i18n.t(
          result?.message || "failed_to_copy_to_clipboard",
        );
        this.showToast(errorMessage, "error");
      }
    } catch (error) {
      console.error("Failed to copy command preview to clipboard:", error);
      const fallback = this.i18n.t("failed_to_copy_to_clipboard");
      this.showToast(fallback, "error");
    }
  }

  /**
   * UIComponentBase: Check if component has required data for rendering
   * CommandChainUI needs basic cache data to render properly
   */
  hasRequiredData() {
    return Boolean(
      this.cache.dataState &&
        this.cache.commandPresentationState &&
        this._hasSelectionState &&
        this.cache.currentEnvironment,
    );
  }

  /**
   * UIComponentBase: Perform initial render when data dependencies are ready
   * This replaces the setTimeout pattern
   */
  performInitialRender() {
    this.render().catch((error) => {
      console.error("[CommandChainUI] Initial render failed:", error);
    });
  }
}
