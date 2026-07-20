import UIComponentBase from "../UIComponentBase.js";
import { enrichForDisplay } from "../../lib/commandDisplayAdapter.js";
import { isCommandEditTargetCurrent } from "../services/commandChainEditPlanning.js";
import ParameterCommandEditSession from "./parameterCommandEditSession.js";
import {
  captureParameterAddTarget,
  isParameterAddTargetCurrent,
  isParameterDef,
} from "./parameterCommandModel.js";
import { resolveDocument, resolveI18n } from "./uiTypes.js";

/** @typedef {import('../../types/events/commands.js').CommandEditTarget} CommandEditTarget */
/** @typedef {import('../../types/events/commands.js').ParameterCommandEditPayload} ParameterCommandEditPayload */
/** @typedef {import('../../types/rpc/parameters-preferences.js').ParameterCommandDefinition} ParameterCommandDefinition */
/** @typedef {NonNullable<ReturnType<typeof captureParameterAddTarget>>} ParameterAddTarget */
/** @typedef {string | { command: string, [field: string]: unknown }} BuiltCommand */
/**
 * @typedef {{
 *   snapshot: import('../../types/events/component-state.js').DataCoordinatorStateSnapshot | null,
 *   currentEnvironment: string,
 *   selectedKey: string | null,
 *   selectedAlias: string | null,
 *   activeBindset: string | undefined,
 *   bindsetsEnabled: boolean | undefined
 * }} ParameterCommandContext
 */

/**
 * Thin lifecycle and protocol facade for the parameter-command modal. The
 * session owner contains modal-local state; this component supplies only the
 * accepted broadcast/cache context and typed EventBus/RPC capabilities.
 */
export default class ParameterCommandUI extends UIComponentBase {
  /**
   * @param {{
   *   eventBus?: import('./uiTypes.js').EventBus,
   *   modalManager?: import('./uiTypes.js').ModalManagerLike | null,
   *   i18n?: import('./uiTypes.js').I18nLike | null,
   *   ui?: import('./uiTypes.js').UIServiceLike | null,
   *   document?: Document | null
   * }} [options]
   */
  constructor({
    eventBus,
    modalManager = null,
    i18n = null,
    ui = null,
    document = null,
  } = {}) {
    super(eventBus);
    this.componentName = "ParameterCommandUI";
    this.modalManager = modalManager;
    this.i18n = resolveI18n(i18n);
    this.ui = ui;
    this.document = resolveDocument(document);

    this.contextGeneration = 0;
    this.contextFingerprint = this.captureContext();
    /** @type {ParameterCommandEditSession | null} */
    this.parameterSession = this.createSession();
  }

  onInit() {
    if (!this.parameterSession) this.parameterSession = this.createSession();
    this.trackAuthoritativeContext();

    this.addEventListener("parameter-command:edit", (payload) => {
      const { categoryId, commandId, commandDef } = payload;
      if (
        typeof categoryId === "string" &&
        typeof commandId === "string" &&
        isParameterDef(commandDef)
      ) {
        void this.parameterSession?.showEdit(payload);
      }
    });
    this.addEventListener("modal:hidden", (message) => {
      this.parameterSession?.handleModalHidden(message);
    });
  }

  onDestroy() {
    this.contextGeneration += 1;
    this.parameterSession?.destroy();
    this.parameterSession = null;
    this.contextFingerprint = this.captureContext();
  }

  /** @param {import('../../types/events/component-state.js').ComponentStateReply} reply */
  handleInitialState(reply) {
    super.handleInitialState(reply);
    if (
      reply.sender === "DataCoordinator" ||
      reply.sender === "SelectionService" ||
      reply.sender === "PreferencesService" ||
      reply.sender === "BindsetSelectorService"
    ) {
      this.adoptContextTransition();
    }
  }

  trackAuthoritativeContext() {
    this.addEventListener("data:state-changed", () => {
      this.adoptContextTransition();
    });
    this.addEventListener("selection:state-changed", () => {
      this.adoptContextTransition();
    });
    this.addEventListener("preferences:loaded", () => {
      this.adoptContextTransition();
    });
    this.addEventListener("preferences:saved", () => {
      this.adoptContextTransition();
    });
    this.addEventListener("preferences:changed", () => {
      this.adoptContextTransition();
    });
    this.addEventListener("bindset-selector:active-changed", () => {
      this.adoptContextTransition();
    });
  }

  /** @returns {ParameterCommandContext} */
  captureContext() {
    return {
      snapshot: this.cache.dataState,
      currentEnvironment: this.cache.currentEnvironment,
      selectedKey: this.cache.selectedKey,
      selectedAlias: this.cache.selectedAlias,
      activeBindset: this.cache.activeBindset,
      bindsetsEnabled: this.cache.preferences?.bindsetsEnabled,
    };
  }

  adoptContextTransition() {
    const next = this.captureContext();
    const previous = this.contextFingerprint;
    this.contextFingerprint = next;
    if (
      previous.snapshot !== next.snapshot ||
      previous.currentEnvironment !== next.currentEnvironment ||
      previous.selectedKey !== next.selectedKey ||
      previous.selectedAlias !== next.selectedAlias ||
      previous.activeBindset !== next.activeBindset ||
      previous.bindsetsEnabled !== next.bindsetsEnabled
    ) {
      this.contextGeneration += 1;
      this.parameterSession?.handleContextTransition();
    }
  }

  createSession() {
    return new ParameterCommandEditSession({
      document: this.document,
      modalManager: this.modalManager,
      translate: (key, options) => this.i18n.t(key, options),
      enrichCommand: (command) =>
        enrichForDisplay(command, this.i18n, {
          eventBus: this.eventBus ?? undefined,
        }),
      buildCommand: (payload) =>
        this.request("parameter-command:build", payload),
      captureAddTarget: () => captureParameterAddTarget(this.captureContext()),
      isAddTargetCurrent: (target, generation) =>
        generation === this.contextGeneration &&
        isParameterAddTargetCurrent(target, this.captureContext()),
      isEditTargetCurrent: (target, generation) =>
        generation === this.contextGeneration &&
        isCommandEditTargetCurrent(target, this.captureContext()),
      getContextGeneration: () => this.contextGeneration,
      getMissingSelectionKey: () => this.getMissingSelectionKey(),
      publishAdd: (target, command) => this.publishAdd(target, command),
      publishEdit: (target, command) => this.publishEdit(target, command),
      showToast: (message, type) => this.publishToast(message, type),
    });
  }

  getMissingSelectionKey() {
    const aliasMode = this.cache.currentEnvironment === "alias";
    const selection = aliasMode
      ? this.cache.selectedAlias
      : this.cache.selectedKey;
    if (selection) return null;
    return aliasMode
      ? "please_select_an_alias_first"
      : "please_select_a_key_first";
  }

  /** @param {ParameterAddTarget} target @param {BuiltCommand | BuiltCommand[]} command */
  publishAdd(target, command) {
    return this.emit("command:add", {
      command,
      key: target.name,
      bindset: target.bindset,
    });
  }

  /** @param {CommandEditTarget} target @param {BuiltCommand} command */
  publishEdit(target, command) {
    return this.emit("command:edit", {
      key: target.name,
      index: target.index,
      updatedCommand: command,
      bindset: target.bindset,
      target,
    });
  }

  /** @param {string} message @param {'warning' | 'error'} type */
  publishToast(message, type) {
    if (this.ui?.showToast) return this.ui.showToast(message, type);
    return this.showToast(message, type);
  }

  /** @param {string} categoryId @param {string} commandId @param {ParameterCommandDefinition} commandDef */
  showParameterModal(categoryId, commandId, commandDef) {
    if (!isParameterDef(commandDef)) return false;
    return (
      this.parameterSession?.showAdd(categoryId, commandId, commandDef) ?? false
    );
  }

  /** @param {ParameterCommandEditPayload} payload */
  editParameterizedCommand(payload) {
    if (!isParameterDef(payload.commandDef)) return Promise.resolve(false);
    return this.parameterSession?.showEdit(payload) ?? Promise.resolve(false);
  }

  updateParameterPreview() {
    return this.parameterSession?.updatePreview() ?? Promise.resolve(false);
  }

  saveParameterCommand() {
    return this.parameterSession?.save() ?? Promise.resolve(false);
  }

  cancelParameterCommand() {
    return this.parameterSession?.cancel() ?? false;
  }

  regenerateParameterModal() {
    return this.parameterSession?.regenerate() ?? false;
  }

  get currentParameterCommand() {
    return this.parameterSession?.currentParameterCommand ?? null;
  }
}
