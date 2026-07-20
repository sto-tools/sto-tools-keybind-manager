import { normalizeToString } from "../../lib/commandDisplayAdapter.js";
import { errorMessage } from "./uiTypes.js";
import {
  projectParameterBuildPreview,
  projectParameterMutation,
} from "./parameterCommandModel.js";
import {
  captureParameterFormDraft,
  createParameterModal,
  normalizeBooleanParameterInput,
  projectParameterPreview,
  readParameterFormValues,
  renderParameterModal,
} from "./parameterCommandModalDom.js";
import {
  captureModalViewDraft,
  restoreModalViewDraft,
} from "./modalSessionLifecycle.js";
import {
  detachParameterControls,
  listenParameterControl,
  releaseParameterSessionResources,
} from "./parameterCommandSessionResources.js";
import {
  commandParameters,
  isParameterSessionRecord,
  projectCurrentParameterCommand,
} from "./parameterCommandSessionState.js";
import {
  isParameterActionCurrent,
  isParameterEditSessionCurrent,
  isParameterPreviewCurrent,
  isParameterSessionCurrent,
} from "./parameterCommandSessionAuthority.js";
import {
  cancelParameterSession,
  settleStaleEditOnContextTransition,
  settleHiddenParameterSession,
  settleStaleParameterEdit,
} from "./parameterCommandSessionSettlement.js";
import { translateParameterValidationIssue } from "./parameterCommandValidation.js";

/** @typedef {import('../../types/events/commands.js').ParameterCommandEditPayload} ParameterCommandEditPayload */
/** @typedef {import('../../types/rpc/parameters-preferences.js').ParameterCommandDefinition} ParameterCommandDefinition */
/** @typedef {import('../../types/rpc/parameters-preferences.js').ParameterBuildParameters} ParameterBuildParameters */
/** @typedef {import('../../types/events/commands.js').CommandEditTarget} CommandEditTarget */
/** @typedef {NonNullable<ReturnType<import('./parameterCommandModel.js').captureParameterAddTarget>>} ParameterAddTarget */
/** @typedef {string | { command: string, [field: string]: unknown }} BuiltCommand */
/**
 * @typedef {{
 *   mode: 'add',
 *   categoryId: string,
 *   commandId: string,
 *   commandDef: ParameterCommandDefinition
 * } | {
 *   mode: 'edit',
 *   categoryId: string,
 *   commandId: string,
 *   commandDef: ParameterCommandDefinition,
 *   command: Record<string, unknown>,
 *   target: CommandEditTarget
 * }} ParameterCommandDescriptor
 */
/**
 * @typedef {{
 *   generation: number,
 *   descriptor: ParameterCommandDescriptor,
 *   contextGeneration: number,
 *   formRevision: number,
 *   previewRevision: number,
 *   saving: boolean,
 *   settled: boolean,
 *   callbackRegistered: boolean,
 *   regenerateCallback: () => boolean,
 *   controlDetachers: Array<() => void>
 * }} ActiveParameterSession
 */

const MODAL_ID = "parameterModal";
const VIEW_SELECTORS = Object.freeze([
  "#parameterInputs input",
  "#parameterInputs select",
  "#saveParameterCommandBtn",
]);

/**
 * Owns one parameter-command modal generation. The application facade injects
 * authoritative context checks and event publication; this owner contains no
 * EventBus, persistence, or application-global access.
 */
export default class ParameterCommandEditSession {
  /**
   * @param {{
   *   document: Document,
   *   modalManager?: import('./uiTypes.js').ModalManagerLike | null,
   *   translate: (key: string, options?: import('i18next').TOptions) => string,
   *   enrichCommand: (command: string) => Promise<unknown>,
   *   buildCommand: (payload: { categoryId: string, commandId: string, commandDef: ParameterCommandDefinition, params: ParameterBuildParameters }) => Promise<unknown>,
   *   captureAddTarget: () => ParameterAddTarget | null,
   *   isAddTargetCurrent: (target: ParameterAddTarget, contextGeneration: number) => boolean,
   *   isEditTargetCurrent: (target: CommandEditTarget, contextGeneration: number) => boolean,
   *   getContextGeneration: () => number,
   *   getMissingSelectionKey: () => string | null,
   *   publishAdd: (target: ParameterAddTarget, command: BuiltCommand | BuiltCommand[]) => unknown,
   *   publishEdit: (target: CommandEditTarget, command: BuiltCommand) => unknown,
   *   showToast: (message: string, type: 'warning' | 'error') => unknown
   * }} options
   */
  constructor({
    document,
    modalManager = null,
    translate,
    enrichCommand,
    buildCommand,
    captureAddTarget,
    isAddTargetCurrent,
    isEditTargetCurrent,
    getContextGeneration,
    getMissingSelectionKey,
    publishAdd,
    publishEdit,
    showToast,
  }) {
    this.document = document;
    this.modalManager = modalManager;
    this.translate = translate;
    this.enrichCommand = enrichCommand;
    this.buildCommand = buildCommand;
    this.captureAddTarget = captureAddTarget;
    this.isAddTargetCurrent = isAddTargetCurrent;
    this.isEditTargetCurrent = isEditTargetCurrent;
    this.getContextGeneration = getContextGeneration;
    this.getMissingSelectionKey = getMissingSelectionKey;
    this.publishAdd = publishAdd;
    this.publishEdit = publishEdit;
    this.showToast = showToast;

    this.generation = 0;
    this.destroyed = false;
    /** @type {ActiveParameterSession | null} */
    this.currentSession = null;
    /** @type {HTMLDivElement | null} */
    this.modalElement = null;
    this.ownsModal = false;
  }

  get currentParameterCommand() {
    return projectCurrentParameterCommand(this.currentSession?.descriptor);
  }

  /** @param {string} categoryId @param {string} commandId @param {ParameterCommandDefinition} commandDef */
  showAdd(categoryId, commandId, commandDef) {
    if (
      this.destroyed ||
      typeof categoryId !== "string" ||
      typeof commandId !== "string"
    ) {
      return false;
    }
    const session = this.begin({
      mode: "add",
      categoryId,
      commandId,
      commandDef,
    });
    if (!session) return false;
    return this.renderAndShow(session, {});
  }

  /** @param {ParameterCommandEditPayload} payload */
  async showEdit(payload) {
    if (!payload || typeof payload !== "object") return false;
    const { categoryId, commandId, commandDef, command, target } = payload;
    if (
      this.destroyed ||
      typeof categoryId !== "string" ||
      typeof commandId !== "string" ||
      !isParameterSessionRecord(command) ||
      !isParameterSessionRecord(target)
    ) {
      return false;
    }
    const session = this.begin({
      mode: "edit",
      categoryId,
      commandId,
      commandDef,
      command,
      target,
    });
    if (!session) return false;
    if (!this.isEditSessionCurrent(session)) {
      this.settleStaleEdit(session);
      return false;
    }

    const existingParameters = commandParameters(command);
    if (existingParameters) {
      return this.renderAndShow(session, existingParameters);
    }

    try {
      const enriched = await this.enrichCommand(normalizeToString(command));
      if (!this.isCurrent(session)) return false;
      if (!this.isEditSessionCurrent(session)) {
        this.settleStaleEdit(session);
        return false;
      }
      return this.renderAndShow(session, commandParameters(enriched) ?? {});
    } catch (error) {
      if (!this.isCurrent(session)) return false;
      if (!this.isEditSessionCurrent(session)) {
        this.settleStaleEdit(session);
        return false;
      }
      console.error(
        "[ParameterCommandUI] Error enriching command for editing:",
        error,
      );
      return this.renderAndShow(session, {});
    }
  }

  /** @param {ParameterCommandDescriptor} descriptor */
  begin(descriptor) {
    if (this.destroyed) return null;
    if (this.currentSession) this.finish(this.currentSession, { hide: false });
    const generation = ++this.generation;
    /** @type {ActiveParameterSession} */
    const session = {
      generation,
      descriptor,
      contextGeneration: this.getContextGeneration(),
      formRevision: 0,
      previewRevision: 0,
      saving: false,
      settled: false,
      callbackRegistered: false,
      regenerateCallback: () => this.regenerate(session),
      controlDetachers: [],
    };
    this.currentSession = session;
    try {
      const modal = this.ensureModal();
      modal.setAttribute(
        "data-command-def",
        JSON.stringify(descriptor.commandDef),
      );
    } catch (error) {
      console.error(
        "[ParameterCommandUI] Failed to create parameter modal:",
        error,
      );
      this.finish(session, { hide: false });
      return null;
    }
    return session;
  }

  ensureModal() {
    const existing = this.document.getElementById(MODAL_ID);
    if (existing?.tagName === "DIV") {
      this.modalElement = /** @type {HTMLDivElement} */ (existing);
      return this.modalElement;
    }
    const modal = createParameterModal({
      document: this.document,
      translate: this.translate,
    });
    this.document.body.appendChild(modal);
    this.modalElement = modal;
    this.ownsModal = true;
    return modal;
  }

  /** @param {ActiveParameterSession} session @param {Record<string, unknown>} draft */
  renderAndShow(session, draft) {
    if (!this.isCurrent(session)) return false;
    try {
      this.render(session, draft);
      const shown = this.modalManager?.show(MODAL_ID);
      if (shown === false) {
        this.finish(session, { hide: false });
        return false;
      }
      return true;
    } catch (error) {
      if (this.isCurrent(session)) {
        console.error(
          "[ParameterCommandUI] Failed to render parameter modal:",
          error,
        );
        this.finish(session, { hide: true });
      }
      return false;
    }
  }

  /** @param {ActiveParameterSession} session @param {Record<string, unknown>} draft */
  render(session, draft) {
    const modal = this.ensureModal();
    detachParameterControls(session, (operation, error) =>
      console.error(`[ParameterCommandUI] Failed to ${operation}:`, error),
    );
    const { container, saveButton } = renderParameterModal({
      document: this.document,
      modal,
      translate: this.translate,
      commandDef: session.descriptor.commandDef,
      editing: session.descriptor.mode === "edit",
      draft,
    });
    modal.setAttribute(
      "data-command-def",
      JSON.stringify(session.descriptor.commandDef),
    );
    if (!session.callbackRegistered) {
      this.modalManager?.registerRegenerateCallback?.(
        MODAL_ID,
        session.regenerateCallback,
      );
      session.callbackRegistered = true;
    }

    listenParameterControl(session, saveButton, "click", () => {
      void this.save(session);
    });
    listenParameterControl(session, container, "input", (event) => {
      if (!this.isCurrent(session)) return;
      normalizeBooleanParameterInput(
        event.target,
        session.descriptor.commandDef,
      );
      session.formRevision += 1;
      void this.updatePreview(session);
    });
    listenParameterControl(session, container, "change", (event) => {
      if (!this.isCurrent(session)) return;
      const target = event.target;
      if (!target || !("tagName" in target) || target.tagName !== "SELECT") {
        return;
      }
      session.formRevision += 1;
      void this.updatePreview(session);
    });
    void this.updatePreview(session);
  }

  /** @param {ActiveParameterSession | null} [session] */
  regenerate(session = this.currentSession) {
    if (!session || !this.isCurrent(session) || !this.modalElement)
      return false;
    const draft = captureParameterFormDraft(this.modalElement);
    const view = captureModalViewDraft(
      this.document,
      this.modalElement,
      VIEW_SELECTORS,
    );
    session.previewRevision += 1;
    try {
      this.render(session, draft);
      if (!this.modalElement || !this.isCurrent(session)) return false;
      restoreModalViewDraft(this.modalElement, view);
      return true;
    } catch (error) {
      if (this.isCurrent(session)) {
        console.error(
          "[ParameterCommandUI] Failed to regenerate modal:",
          error,
        );
        this.finish(session, { hide: true });
      }
      return false;
    }
  }

  /** @param {ActiveParameterSession | null} [session] */
  async updatePreview(session = this.currentSession) {
    if (!session || !this.isCurrent(session) || !this.modalElement)
      return false;
    const modal = this.modalElement;
    const previewRevision = ++session.previewRevision;
    const formRevision = session.formRevision;
    let params;
    try {
      params = readParameterFormValues(modal, session.descriptor.commandDef);
    } catch (error) {
      if (this.isPreviewCurrent(session, previewRevision, formRevision)) {
        projectParameterPreview(modal, {
          text: translateParameterValidationIssue(error, this.translate),
          error: true,
        });
      }
      return false;
    }

    try {
      const result = await this.buildCommand({
        categoryId: session.descriptor.categoryId,
        commandId: session.descriptor.commandId,
        commandDef: session.descriptor.commandDef,
        params,
      });
      if (!this.isPreviewCurrent(session, previewRevision, formRevision)) {
        return false;
      }
      const projection = projectParameterBuildPreview(result);
      if (!projection) return false;
      projectParameterPreview(modal, {
        text: projection.valid
          ? projection.text
          : this.translate("invalid_command_format"),
        error: false,
      });
      return true;
    } catch (error) {
      if (!this.isPreviewCurrent(session, previewRevision, formRevision)) {
        return false;
      }
      if (errorMessage(error) === "please_enter_a_raw_command") {
        projectParameterPreview(modal, {
          text: this.translate("please_enter_a_raw_command"),
        });
      } else {
        console.error("Error updating parameter preview:", error);
        projectParameterPreview(modal, {
          text: this.translate("error_generating_command"),
        });
      }
      return false;
    }
  }

  /** @param {ActiveParameterSession | null} [session] */
  async save(session = this.currentSession) {
    if (
      !session ||
      !this.isCurrent(session) ||
      !this.modalElement ||
      session.saving
    ) {
      return false;
    }
    const modal = this.modalElement;

    const contextGeneration =
      session.descriptor.mode === "edit"
        ? session.contextGeneration
        : this.getContextGeneration();
    const target =
      session.descriptor.mode === "edit"
        ? session.descriptor.target
        : this.captureAddTarget();
    if (!target) {
      const key = this.getMissingSelectionKey();
      if (key) this.showToast(this.translate(key), "warning");
      return false;
    }
    if (!this.isActionCurrent(session, target, contextGeneration)) {
      if (session.descriptor.mode === "edit") this.settleStaleEdit(session);
      return false;
    }

    let params;
    try {
      params = readParameterFormValues(modal, session.descriptor.commandDef);
    } catch (error) {
      this.showToast(
        translateParameterValidationIssue(error, this.translate),
        "error",
      );
      return false;
    }

    const formRevision = session.formRevision;
    session.saving = true;
    try {
      const result = await this.buildCommand({
        categoryId: session.descriptor.categoryId,
        commandId: session.descriptor.commandId,
        commandDef: session.descriptor.commandDef,
        params,
      });
      if (
        !this.isCurrent(session) ||
        session.formRevision !== formRevision ||
        !this.isActionCurrent(session, target, contextGeneration)
      ) {
        if (
          this.isCurrent(session) &&
          session.descriptor.mode === "edit" &&
          !this.isActionCurrent(session, target, contextGeneration)
        ) {
          this.settleStaleEdit(session);
        }
        return false;
      }
      const command = projectParameterMutation(result, {
        editing: session.descriptor.mode === "edit",
      });
      if (!command) return false;
      if (session.descriptor.mode === "edit") {
        if (Array.isArray(command)) return false;
        this.publishEdit(/** @type {CommandEditTarget} */ (target), command);
      } else {
        this.publishAdd(/** @type {ParameterAddTarget} */ (target), command);
      }
      this.finish(session, { hide: true });
      return true;
    } catch (error) {
      if (
        this.isCurrent(session) &&
        session.formRevision === formRevision &&
        this.isActionCurrent(session, target, contextGeneration)
      ) {
        console.error("Error building parameterized command:", error);
        if (errorMessage(error) === "please_enter_a_raw_command") {
          this.showToast(
            this.translate("please_enter_a_raw_command"),
            "warning",
          );
        } else {
          this.showToast(this.translate("error_generating_command"), "error");
        }
      }
      return false;
    } finally {
      if (this.isCurrent(session)) session.saving = false;
    }
  }

  cancel() {
    return cancelParameterSession(this);
  }

  handleContextTransition() {
    return settleStaleEditOnContextTransition(this);
  }

  /** @param {ActiveParameterSession} session */
  settleStaleEdit(session) {
    return settleStaleParameterEdit(this, session);
  }

  /** @param {{ modalId: string, success: boolean }} message */
  handleModalHidden(message) {
    return settleHiddenParameterSession(this, message, MODAL_ID);
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.currentSession) this.finish(this.currentSession, { hide: true });
    if (this.ownsModal) this.modalElement?.remove();
    this.modalElement = null;
    this.ownsModal = false;
  }

  /** @param {ActiveParameterSession} session */
  isCurrent(session) {
    return isParameterSessionCurrent(session, this);
  }

  /** @param {ActiveParameterSession} session */
  isEditSessionCurrent(session) {
    return isParameterEditSessionCurrent(
      session,
      this,
      this.isEditTargetCurrent,
    );
  }

  /** @param {ActiveParameterSession} session @param {number} previewRevision @param {number} formRevision */
  isPreviewCurrent(session, previewRevision, formRevision) {
    return isParameterPreviewCurrent(
      session,
      this,
      previewRevision,
      formRevision,
    );
  }

  /** @param {ActiveParameterSession} session @param {ParameterAddTarget | CommandEditTarget} target @param {number} contextGeneration */
  isActionCurrent(session, target, contextGeneration) {
    return isParameterActionCurrent(session, this, target, contextGeneration, {
      isAddTargetCurrent: this.isAddTargetCurrent,
      isEditTargetCurrent: this.isEditTargetCurrent,
    });
  }

  /** @param {ActiveParameterSession} session @param {{ hide: boolean }} options */
  finish(session, { hide }) {
    if (session.settled) return;
    session.settled = true;
    if (this.currentSession === session) this.currentSession = null;
    releaseParameterSessionResources({
      session,
      modalManager: this.modalManager,
      modalId: MODAL_ID,
      hide,
      onError: (operation, error) =>
        console.error(`[ParameterCommandUI] Failed to ${operation}:`, error),
    });
  }
}
