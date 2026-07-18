import UIComponentBase from "../UIComponentBase.js";
import { UNSAFE_KEYBINDS } from "../../core/constants.js";
import { adoptKeyCaptureState } from "../services/keyCaptureState.js";
import { eventElement, resolveDocument, resolveI18n } from "./uiTypes.js";
import {
  clearKeyCaptureHighlights,
  highlightKeyCaptureKey,
  keyCaptureDisplayName,
  loadKeyCaptureKeyboard,
  projectPressedKeyCaptureKeys,
  projectSelectedKeyCaptureChord,
  renderKeyCaptureKeyboard,
} from "./keyCaptureKeyboardDom.js";
import {
  projectKeyCaptureConfirmEnabled,
  projectKeyCapturePreview,
  projectKeyCaptureState,
  renderKeyCaptureModal,
  syncKeyCaptureSelect,
} from "./keyCaptureModalDom.js";
import {
  clearKeyCaptureModifierActive,
  convertKeyCaptureChordModifiers,
  getKeyCaptureModifierDescriptor,
  keyCaptureChordHasNonModifier,
  readActiveKeyCaptureModifiers,
  rememberKeyCaptureModifierSidesFromChord,
  reprojectKeyCaptureModifierHighlighting,
  toggleKeyCaptureModifier,
} from "./keyCaptureModifierDom.js";
import { KeyCaptureSession, PRIMARY_BINDSET } from "./keyCaptureSession.js";

/** @typedef {import('../../types/events/component-state.js').KeyCaptureStateSnapshot} KeyCaptureStateSnapshot */
/** @typedef {{ chord: string, context?: string }} CapturedChord */
/** @typedef {{ data?: { from?: string, to?: string } }} LegacyDuplicateResult */
/** @typedef {{ sourceKey: string | null }} PendingDuplicationIntent */

/**
 * KeyCaptureUI owns modal lifecycle, action requests, and one modal-local draft.
 * Stateless modules own modal, keyboard, and modifier projection; capture state
 * is accepted only from KeyCaptureService's complete owner snapshot.
 */
export default class KeyCaptureUI extends UIComponentBase {
  /**
   * @param {{
   *   eventBus?: import('./uiTypes.js').EventBus,
   *   modalManager?: import('./uiTypes.js').ModalManagerLike | null,
   *   document?: Document,
   *   i18n?: import('./uiTypes.js').I18nLike
   * }} [options]
   */
  constructor({ eventBus, modalManager = null, document, i18n } = {}) {
    super(eventBus);
    this.componentName = "KeyCaptureUI";
    this.modalManager = modalManager;
    this.document = resolveDocument(document);
    this.i18n = resolveI18n(i18n);

    this.session = new KeyCaptureSession();
    /** @type {KeyCaptureStateSnapshot | null} */
    this.captureState = null;
    /** @type {PendingDuplicationIntent | null} */
    this.pendingDuplicationIntent = null;
    /** @type {ReturnType<typeof setTimeout> | null} */
    this.autoStopTimer = null;
    this.eventListenersSetup = false;

    this.selectedLayout = "en";
    this.currentKeyboard = null;
    /** @type {Set<string>} */
    this.highlightedKeys = new Set();
    this._unsafeSet = new Set(UNSAFE_KEYBINDS.map((key) => key.toUpperCase()));
  }

  onInit() {
    this.addEventListener("key-capture:state-changed", (state) => {
      this.acceptCaptureState(state);
    });
    this.addEventListener("chord-captured", (captured) => {
      this.handleChordCaptured(captured);
    });
    this.addEventListener("key:duplicate", ({ key }) => {
      this.handleKeyDuplication(key);
    });
    this.addEventListener("modal:shown", ({ modalId, success }) => {
      if (modalId === "keySelectionModal" && success) this.initializeModal();
    });
    this.addEventListener("modal:hidden", ({ modalId, success }) => {
      if (modalId === "keySelectionModal" && success && this.session.active) {
        this.resetState();
      }
    });
    this.setupEventListeners();
  }

  onDestroy() {
    if (this.session.active) this.resetState();
    else this.cancelAutoStop();
    this.eventListenersSetup = false;
    this.captureState = null;
    this.pendingDuplicationIntent = null;
  }

  /** @param {import('../../types/events/component-state.js').ComponentStateReply} reply */
  handleInitialState(reply) {
    super.handleInitialState(reply);
    const { sender, state } = reply;
    if (sender === "KeyCaptureService") this.acceptCaptureState(state);
  }

  /** @param {unknown} candidate */
  acceptCaptureState(candidate) {
    const predecessor = this.captureState;
    const accepted = adoptKeyCaptureState(candidate, predecessor);
    if (!accepted) return false;
    this.captureState = accepted;
    this.projectAcceptedCaptureState();

    const newAuthority =
      !predecessor || accepted.authorityEpoch > predecessor.authorityEpoch;
    if (
      newAuthority &&
      this.session.active &&
      this.session.capturing &&
      !accepted.isCapturing
    ) {
      this.emit("keycapture:start", { context: "keySelectionModal" });
    }

    if (
      this.session.active &&
      accepted.capturedChord &&
      accepted.capturedChord !== predecessor?.capturedChord
    ) {
      this.handleChordCaptured({
        chord: accepted.capturedChord,
        context: accepted.context,
      });
    }
    return true;
  }

  projectAcceptedCaptureState() {
    const state = this.captureState;
    if (!state) return;
    projectKeyCaptureState(
      this.document,
      (key) => this.i18n.t(key),
      state.isCapturing,
    );
    if (!this.session.active || this.session.selectedChord) return;
    projectPressedKeyCaptureKeys(
      this.document,
      this.highlightedKeys,
      state.pressedCodes,
    );
    projectKeyCapturePreview(
      this.document,
      (key) => this.i18n.t(key),
      state.currentChord,
    );
  }

  setupEventListeners() {
    if (this.eventListenersSetup) return;
    this.eventListenersSetup = true;

    this.onDom("toggleCaptureMode", "click", () => this.toggleCaptureMode());
    this.onDom("confirm-key-selection", "click", () => {
      void this.confirmSelection();
    });
    this.onDom("cancel-key-selection", "click", () => this.cancelSelection());
    this.onDom(".vkey", "click", (event) => {
      if (this.captureState?.isCapturing) return;
      const button = eventElement(event)?.closest(".vkey");
      const keyCode = button?.getAttribute("data-key-code");
      if (keyCode) this.selectKeyFromVirtualKeyboard(keyCode);
    });
    this.onDom("keyboardLayoutSelector", "change", (event) => {
      const target = eventElement(event);
      if (target && "value" in target) {
        this.changeKeyboardLayout(String(target.value));
      }
    });
    this.onDom("bindsetTargetSelector", "change", (event) => {
      const target = eventElement(event);
      if (target && "value" in target) {
        this.session.setTargetBindset(String(target.value));
      }
    });
    this.onDom("distinguishModifierSide", "change", (event) => {
      const target = eventElement(event);
      if (!target || !("checked" in target)) return;
      const checked = Boolean(target.checked);
      this.emit("keycapture:set-location-specific", { value: checked });
      if (this.session.selectedChord) {
        this.updateChordWithLocationSpecific(checked);
      }
      this.updateModifierHighlighting();
    });
  }

  initializeModal() {
    const intent = this.pendingDuplicationIntent;
    this.pendingDuplicationIntent = null;
    if (this.session.active) this.resetState();
    this.session.begin({
      duplicationMode: intent !== null,
      sourceKey: intent?.sourceKey ?? null,
      targetBindset: this.resolveDefaultBindset(),
    });

    this.buildModalContent();
    syncKeyCaptureSelect(
      this.document,
      "keyboardLayoutSelector",
      this.selectedLayout,
    );
    this.updateKeyboardLayout();
    this.emit("keycapture:set-location-specific", { value: false });
    this.startCaptureMode();
    this.syncBindsetSelector();
  }

  /** @param {string | undefined} sourceKey */
  handleKeyDuplication(sourceKey) {
    this.pendingDuplicationIntent = { sourceKey: sourceKey ?? null };
    this.showKeySelectionModal();
  }

  showKeySelectionModal() {
    this.modalManager?.show("keySelectionModal");
  }

  startCaptureMode() {
    this.cancelAutoStop();
    if (!this.session.active) return;
    const requested = this.session.startCapture();
    if (requested || !this.captureState?.isCapturing) {
      this.emit("keycapture:start", { context: "keySelectionModal" });
    }
    this.projectAcceptedCaptureState();
  }

  stopCaptureMode() {
    this.cancelAutoStop();
    const requested = this.session.stopCapture();
    if (requested || this.captureState?.isCapturing) {
      this.emit("keycapture:stop");
    }
    if (!this.captureState) {
      projectKeyCaptureState(this.document, (key) => this.i18n.t(key), false);
    }
  }

  toggleCaptureMode() {
    const capturing = this.captureState?.isCapturing ?? this.session.capturing;
    if (!capturing) {
      this.startCaptureMode();
      return;
    }

    this.session.markIgnoreNextChord();
    this.stopCaptureMode();
    this.session.selectChord(null);
    clearKeyCaptureModifierActive(this.document);
    projectKeyCapturePreview(this.document, (key) => this.i18n.t(key), "");
    projectKeyCaptureConfirmEnabled(this.document, false);
  }

  /** @param {CapturedChord} captured */
  handleChordCaptured({ chord, context }) {
    if (context && context !== "keySelectionModal") return;
    if (this.session.consumeIgnoreNextChord()) return;
    if (!this.selectKey(chord)) return;

    this.cancelAutoStop();
    const generation = this.session.generation;
    const selectedChord = this.session.selectedChord;
    this.autoStopTimer = setTimeout(() => {
      this.autoStopTimer = null;
      if (
        !this.destroyed &&
        this.session.active &&
        this.session.generation === generation &&
        this.session.selectedChord === selectedChord
      ) {
        this.stopCaptureMode();
      }
    }, 100);
  }

  cancelAutoStop() {
    if (this.autoStopTimer !== null) clearTimeout(this.autoStopTimer);
    this.autoStopTimer = null;
  }

  /** @param {string} chord */
  selectKey(chord) {
    if (!this.session.active) return false;
    if (this.isUnsafeChord(chord)) {
      this.handleUnsafeChord(chord);
      return false;
    }

    if (!this.session.selectChord(chord)) return false;
    this.rememberModifierSides(chord);
    projectKeyCapturePreview(this.document, (key) => this.i18n.t(key), chord);
    projectKeyCaptureConfirmEnabled(this.document, true);
    this.highlightSelectedKeyOnKeyboard(chord);
    return true;
  }

  /** @param {string} keyCode */
  selectKeyFromVirtualKeyboard(keyCode) {
    if (getKeyCaptureModifierDescriptor(keyCode)) {
      this.toggleVirtualModifier(keyCode);
      return;
    }

    const activeModifiers = this.getActiveVirtualModifiers();
    const keyName = keyCaptureDisplayName(keyCode, this.currentKeyboard);
    const chord =
      activeModifiers.length > 0
        ? `${activeModifiers.join("+")}+${keyName}`
        : keyName;
    this.selectKey(chord);
    if (activeModifiers.length > 0) this.clearVirtualModifiers(true);
  }

  /** @param {string} keyCode */
  toggleVirtualModifier(keyCode) {
    const result = toggleKeyCaptureModifier(
      this.document,
      keyCode,
      this.distinguishModifierSides(),
    );
    if (!result.handled) return;
    if (result.type && result.side) {
      this.session.setModifierSide(result.type, result.side);
    }
    if (!keyCaptureChordHasNonModifier(this.session.selectedChord)) {
      this.updatePreviewWithCurrentModifiers();
    }
  }

  getActiveVirtualModifiers() {
    return readActiveKeyCaptureModifiers(
      this.document,
      this.distinguishModifierSides(),
      (key) => this.i18n.t(key),
    );
  }

  /** @param {boolean} [skipPreviewUpdate] */
  clearVirtualModifiers(skipPreviewUpdate = false) {
    clearKeyCaptureModifierActive(this.document);
    if (!skipPreviewUpdate) this.updatePreviewWithCurrentModifiers();
  }

  updatePreviewWithCurrentModifiers() {
    const modifiers = this.getActiveVirtualModifiers();
    let preview = this.session.selectedChord || "";
    if (modifiers.length > 0) {
      preview = modifiers.join("+");
      if (this.session.selectedChord) {
        if (!keyCaptureChordHasNonModifier(this.session.selectedChord)) return;
        preview += `+${this.session.selectedChord}`;
      } else {
        preview += "+";
      }
    }
    projectKeyCapturePreview(this.document, (key) => this.i18n.t(key), preview);
  }

  async confirmSelection() {
    const selectedChord = this.session.selectedChord;
    if (!selectedChord) return;
    const token = this.session.token();

    try {
      if (this.session.duplicationMode) {
        const sourceKey = this.session.sourceKey;
        const result = await this.request("key:duplicate-with-name", {
          sourceKey,
          newKey: selectedChord,
        });
        if (!this.session.isCurrent(token)) return;
        if (!result?.success) {
          const failure =
            /** @type {{ error?: string, params?: Record<string, unknown> }} */ (
              result || {}
            );
          this.showToast(
            this.i18n.t(
              failure.error || "key_selection_failed",
              failure.params,
            ),
            "error",
          );
          return;
        }
        const legacy = /** @type {LegacyDuplicateResult} */ (result);
        const from = result.sourceKey || legacy.data?.from || sourceKey;
        const to = result.newKey || legacy.data?.to || selectedChord;
        this.showToast(this.i18n.t("key_duplicated", { from, to }), "success");
      } else {
        const result = await this.request("key:add", {
          key: selectedChord,
          bindset: this.session.targetBindset,
        });
        if (!this.session.isCurrent(token)) return;
        if (!result?.success) {
          const failure =
            /** @type {{ error?: string, params?: Record<string, unknown> }} */ (
              result || {}
            );
          this.showToast(
            this.i18n.t(
              failure.error || "key_selection_failed",
              failure.params,
            ),
            "error",
          );
          return;
        }
        this.showToast(
          this.i18n.t("key_added", { keyName: selectedChord }),
          "success",
        );
      }

      this.modalManager?.hide("keySelectionModal");
      if (this.session.active) this.resetState();
    } catch (error) {
      if (!this.session.isCurrent(token)) return;
      console.error("Failed to confirm key selection:", error);
      this.showToast(this.i18n.t("key_selection_failed"), "error");
    }
  }

  cancelSelection() {
    this.modalManager?.hide("keySelectionModal");
    if (this.session.active) this.resetState();
  }

  resetState() {
    this.cancelAutoStop();
    this.stopCaptureMode();
    this.session.end();
    this.pendingDuplicationIntent = null;
    clearKeyCaptureHighlights(this.document, this.highlightedKeys);
    clearKeyCaptureModifierActive(this.document);
    projectKeyCapturePreview(this.document, (key) => this.i18n.t(key), "");
    projectKeyCaptureConfirmEnabled(this.document, false);
    this.emit("keycapture:set-location-specific", { value: false });
  }

  shouldShowBindsetPicker() {
    return Boolean(
      this.cache.preferences.bindsetsEnabled &&
        this.cache.preferences.bindToAliasMode &&
        this.cache.currentEnvironment !== "alias",
    );
  }

  resolveDefaultBindset() {
    return this.shouldShowBindsetPicker()
      ? this.cache.activeBindset || PRIMARY_BINDSET
      : PRIMARY_BINDSET;
  }

  syncBindsetSelector() {
    syncKeyCaptureSelect(
      this.document,
      "bindsetTargetSelector",
      this.session.targetBindset,
    );
  }

  buildModalContent() {
    return renderKeyCaptureModal({
      document: this.document,
      translate: (key) => this.i18n.t(key),
      showBindsetPicker: this.shouldShowBindsetPicker(),
      bindsetNames: this.cache.bindsetNames || [PRIMARY_BINDSET],
      targetBindset: this.session.active
        ? this.session.targetBindset
        : this.resolveDefaultBindset(),
    });
  }

  updateKeyboardLayout() {
    this.currentKeyboard = loadKeyCaptureKeyboard(this.selectedLayout);
    renderKeyCaptureKeyboard(this.document, this.currentKeyboard);
  }

  /** @param {string} language */
  changeKeyboardLayout(language) {
    this.selectedLayout = language || "en";
    this.updateKeyboardLayout();
  }

  distinguishModifierSides() {
    const checkbox = this.document.getElementById("distinguishModifierSide");
    return Boolean(checkbox && "checked" in checkbox && checkbox.checked);
  }

  updateModifierHighlighting() {
    reprojectKeyCaptureModifierHighlighting({
      document: this.document,
      distinguishSides: this.distinguishModifierSides(),
      lastModifierSides: this.session.lastModifierSide,
      highlightKey: (keyCode) => {
        highlightKeyCaptureKey(
          this.document,
          this.highlightedKeys,
          keyCode,
          "selected",
        );
      },
    });
    if (!keyCaptureChordHasNonModifier(this.session.selectedChord)) {
      this.updatePreviewWithCurrentModifiers();
    }
  }

  /** @param {string} chord */
  highlightSelectedKeyOnKeyboard(chord) {
    projectSelectedKeyCaptureChord({
      document: this.document,
      highlightedKeys: this.highlightedKeys,
      chord,
      keyboard: this.currentKeyboard,
      distinguishSides: this.distinguishModifierSides(),
    });
  }

  /** @param {boolean} useLocationSpecific */
  updateChordWithLocationSpecific(useLocationSpecific) {
    const chord = this.session.selectedChord;
    if (!chord) return;
    const updated = convertKeyCaptureChordModifiers(
      chord,
      useLocationSpecific,
      this.session.lastModifierSide,
    );
    if (updated !== chord) this.selectKey(updated);
  }

  /** @param {string} chord */
  rememberModifierSides(chord) {
    const sides = rememberKeyCaptureModifierSidesFromChord(
      this.session.lastModifierSide,
      chord,
    );
    for (const type of /** @type {const} */ (["ctrl", "alt", "shift"])) {
      this.session.setModifierSide(type, sides[type]);
    }
  }

  /** @param {string} chord */
  isUnsafeChord(chord) {
    return Boolean(chord && this._unsafeSet.has(chord.toUpperCase()));
  }

  /** @param {string} chord */
  handleUnsafeChord(chord) {
    this.showToast(this.i18n.t("unsafe_keybind", { key: chord }), "error");
    this.session.selectChord(null);
    projectKeyCapturePreview(this.document, (key) => this.i18n.t(key), "");
    projectKeyCaptureConfirmEnabled(this.document, false);
  }
}
