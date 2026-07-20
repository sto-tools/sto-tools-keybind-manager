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
import { adoptCommandPresentationState } from "../services/commandPresentationState.js";
import {
  COMMAND_CHAIN_GROUP_ORDER,
  projectCommandChainGroups,
  projectCommandChainRow,
} from "../services/commandChainListProjection.js";
import {
  createCommandChainEmptyState,
  materializeCommandChainViewCopy,
} from "./commandChainViewDom.js";
import {
  createCommandChainRow,
  createCommandGroupSeparator,
} from "./commandChainListDom.js";
import {
  createCommandChainInteractionState,
  decodeCommandChainClick,
  decodeCommandChainDoubleClick,
  decodeCommandChainDrop,
  isCommandChainInteractionCurrent,
} from "./commandChainInteractionPolicy.js";
import { resolveDocument, resolveI18n } from "./uiTypes.js";
import {
  findCommandDefinition,
  getCommandWarning,
} from "../../data/commandCatalog.js";
import {
  createCommandChainPreviewPlan,
  planPreviewClipboardCopy,
  projectPreviewClipboardResult,
  settleCommandChainPreview,
} from "../services/commandChainPreviewProjection.js";
import {
  captureCommandChainPreviewElements,
  commitCommandChainPreview,
} from "./commandChainPreviewDom.js";
import { captureCommandChainListenerTargets } from "./commandChainListenerTargets.js";
import {
  captureCommandCustomizationTarget,
  isCommandCustomizationTargetCurrent,
  planCommandCustomization,
} from "../services/commandCustomizationPlanner.js";

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
    this._commandChainLifecycleGeneration = 0;
  }

  onInit() {
    this._commandChainLifecycleGeneration += 1;
    this.setupEventListeners();
  }

  setupEventListeners() {
    if (this.eventListenersSetup) return;
    this.eventListenersSetup = true;
    const domTargets = captureCommandChainListenerTargets(this.document);
    const { copyAlias, copyPreview: preview } = domTargets;

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
    this.onDom(domTargets.stabilizeExecutionOrder, "click", async () => {
      await this.toggleStabilize();
    });

    // Listen for copy alias button click
    this.onDom(copyAlias, "click", () => this.copyAliasToClipboard());

    // Listen for copy command preview button click
    this.onDom(preview, "click", () => this.copyCommandPreviewToClipboard());

    // DOM delegates decode inert data into one typed interaction. Only rows
    // from the currently committed render can reach a side-effect boundary.
    this.onDom(domTargets.commandList, "click", (event) => {
      const interaction = decodeCommandChainClick(
        event.target,
        this._committedInteractionState,
        this._renderGeneration,
      );
      this.handleCommandChainInteraction(interaction, event).catch(() => {});
    });

    this.onDom(domTargets.commandList, "dblclick", (event) => {
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
    if (
      !isCommandChainInteractionCurrent(
        this._committedInteractionState,
        this._renderGeneration,
        interaction.renderToken,
      )
    ) {
      return;
    }

    const target = captureCommandCustomizationTarget({
      snapshot: this.cache.dataState,
      currentEnvironment: this.cache.currentEnvironment,
      selectedKey: this.cache.selectedKey,
      selectedAlias: this.cache.selectedAlias,
      activeBindset: this.cache.activeBindset,
      bindsetsEnabled: this.cache.preferences?.bindsetsEnabled,
      index: interaction.index,
    });
    if (!target) return;
    const plan = planCommandCustomization({
      target,
      action: { type: interaction.type },
    });
    if (
      !plan.valid ||
      !isCommandChainInteractionCurrent(
        this._committedInteractionState,
        this._renderGeneration,
        interaction.renderToken,
      ) ||
      !isCommandCustomizationTargetCurrent(target, {
        snapshot: this.cache.dataState,
        currentEnvironment: this.cache.currentEnvironment,
        selectedKey: this.cache.selectedKey,
        selectedAlias: this.cache.selectedAlias,
        activeBindset: this.cache.activeBindset,
        bindsetsEnabled: this.cache.preferences?.bindsetsEnabled,
      })
    ) {
      return;
    }

    try {
      // DataCoordinator's accepted state broadcast is the only repaint source.
      // The RPC reply is acknowledgement, never state to adopt or render.
      await this.request("data:update-profile", plan.updateProfileRequest);
    } catch (err) {
      console.error(
        "[CommandChainUI] Failed to update command palindromic setting:",
        err,
      );
    }
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
      const emptyPreview = createCommandChainPreviewPlan({
        environment: view.environment,
        selectedName: null,
        commands: [],
      });
      commitCommandChainPreview(
        captureCommandChainPreviewElements(this.document, {
          allowPartialAlias: true,
        }),
        this.i18n,
        { ...emptyPreview, commandPreview: copy.preview },
      );
      titleEl.textContent = copy.title;
      if (countSpanEl) countSpanEl.textContent = copy.count;
      this._committedInteractionState = createCommandChainInteractionState({
        renderToken,
        commandCount: 0,
      });
      container.replaceChildren(
        createCommandChainEmptyState(this.document, copy.empty),
      );
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
    /** @type {ReturnType<typeof projectCommandChainGroups> | null} */
    let nextGroups = null;

    if (view.stabilized) {
      nextGroups = projectCommandChainGroups({
        commands: view.commands,
        presentationState,
      });
    }
    const interactionState = createCommandChainInteractionState({
      renderToken,
      commandCount: view.commandCount,
      groups: nextGroups,
    });

    if (view.stabilized && nextGroups) {
      for (const groupType of COMMAND_CHAIN_GROUP_ORDER) {
        const groupData = nextGroups[groupType];
        if (!groupData || groupData.commands.length === 0) continue;
        newCommandElements.push(
          createCommandGroupSeparator(this.document, {
            groupType,
            title: this.i18n.t(groupData.titleKey),
            hint: this.i18n.t(groupData.hintKey),
            count: groupData.commands.length,
            collapsed: groupData.isCollapsed,
            renderToken,
          }),
        );
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

    // Convert canonical string command to rich object for display
    const commandString =
      typeof command === "string" ? command : normalizeToString(command);

    // Parser enrichment remains the facade's only asynchronous row capability.
    const richCommand = await enrichForDisplay(commandString, this.i18n, {
      eventBus: this.eventBus ?? undefined,
    });
    const commandDef = findCommandDefinition(commandString, this.i18n);
    const row = projectCommandChainRow({
      command,
      commandString,
      index,
      displayIndex,
      stabilized: isStabilized,
      groupType,
      interactionState: rowInteractionState,
      enrichedCommand: richCommand,
      commandDefinition: commandDef,
      warningKey: getCommandWarning(commandString),
      i18n: this.i18n,
    });
    return createCommandChainRow(this.document, row);
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
    const elements = captureCommandChainPreviewElements(this.document);

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

    if (!elements) {
      console.log("[CommandChainUI] Missing command preview elements");
      return false;
    }
    if (!isCurrent()) return false;

    const plan = createCommandChainPreviewPlan({
      environment,
      selectedName: selectedKeyName,
      bindset,
      bindToAliasMode: effectiveBindToAliasMode,
      stabilized: isStabilized,
      commands,
    });
    let projection = plan;

    if (plan.mirroring) {
      try {
        const requestCommands = plan.mirroring.request.commands.map(
          (command) => ({ ...command }),
        );
        const mirroredText = await this.request(
          "command:generate-mirrored-commands",
          { commands: requestCommands },
        );
        if (!isCurrent()) return false;
        projection = settleCommandChainPreview(plan, mirroredText);
      } catch (error) {
        if (!isCurrent()) return false;
        if (plan.mirroring.destination === "generatedAlias") {
          console.warn("[CommandChainUI] Failed to apply mirroring:", error);
        }
        projection = settleCommandChainPreview(plan, null);
      }
    }

    if (!isCurrent()) return false;
    return commitCommandChainPreview(elements, this.i18n, projection);
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

  // Clean up event listeners when component is destroyed
  onDestroy() {
    this._commandChainLifecycleGeneration += 1;
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
   * @param {'aliasPreview' | 'commandPreview'} elementId
   * @param {'alias' | 'command preview'} logContext
   */
  async copyPreviewToClipboard(elementId, logContext) {
    const lifecycleGeneration = this._commandChainLifecycleGeneration;
    const isCurrent = () =>
      lifecycleGeneration === this._commandChainLifecycleGeneration &&
      !this.destroyed;
    if (!isCurrent()) return;

    const element = this.document.getElementById(elementId);
    const copyPlan = planPreviewClipboardCopy(element?.textContent);
    if (copyPlan.type === "empty") {
      this.showToast(this.i18n.t(copyPlan.messageKey), copyPlan.toastType);
      return;
    }

    try {
      const result = await this.request("utility:copy-to-clipboard", {
        text: copyPlan.text,
      });
      if (!isCurrent()) return;
      const toast = projectPreviewClipboardResult(result);
      this.showToast(this.i18n.t(toast.messageKey), toast.toastType);
    } catch (error) {
      if (!isCurrent()) return;
      console.error(`Failed to copy ${logContext} to clipboard:`, error);
      const toast = projectPreviewClipboardResult(null);
      this.showToast(this.i18n.t(toast.messageKey), toast.toastType);
    }
  }

  copyAliasToClipboard() {
    return this.copyPreviewToClipboard("aliasPreview", "alias");
  }

  copyCommandPreviewToClipboard() {
    return this.copyPreviewToClipboard("commandPreview", "command preview");
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
