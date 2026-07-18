import { escapeHtml } from "../../lib/htmlEscape.js";

/**
 * @typedef {{
 *   document: Document,
 *   translate: (key: string) => string,
 *   showBindsetPicker: boolean,
 *   bindsetNames: readonly string[],
 *   targetBindset: string
 * }} KeyCaptureModalOptions
 */

const KEYBOARD_LAYOUT_OPTIONS = Object.freeze([
  ["en", "QWERTY (English)"],
  ["de", "QWERTZ (German)"],
  ["fr", "AZERTY (French)"],
  ["es", "QWERTY (Spanish)"],
]);

/**
 * Preserve the shipped bindset selector while treating profile-owned bindset
 * names as text rather than markup.
 *
 * @param {Pick<KeyCaptureModalOptions, 'translate' | 'showBindsetPicker' | 'bindsetNames' | 'targetBindset'>} options
 * @returns {string}
 */
export function buildKeyCaptureBindsetPickerHtml({
  translate,
  showBindsetPicker,
  bindsetNames,
  targetBindset,
}) {
  if (!showBindsetPicker) return "";

  const names = bindsetNames.length > 0 ? bindsetNames : ["Primary Bindset"];
  const options = names
    .map((name) => {
      const selected = name === targetBindset ? " selected" : "";
      return `<option value="${escapeHtml(name)}"${selected}>${escapeHtml(name)}</option>`;
    })
    .join("");

  return `
    <div class="bindset-target">
      <label for="bindsetTargetSelector">${translate("select_bindset")}</label>
      <select id="bindsetTargetSelector" class="form-select">
        ${options}
      </select>
    </div>
  `;
}

/**
 * Build the modal shell from explicit state. The returned markup contains no
 * listeners or retained state; the lifecycle facade owns both.
 *
 * @param {Omit<KeyCaptureModalOptions, 'document'>} options
 * @returns {string}
 */
export function buildKeyCaptureModalHtml({
  translate,
  showBindsetPicker,
  bindsetNames,
  targetBindset,
}) {
  const bindsetPicker = buildKeyCaptureBindsetPickerHtml({
    translate,
    showBindsetPicker,
    bindsetNames,
    targetBindset,
  });
  const layoutOptions = KEYBOARD_LAYOUT_OPTIONS.map(
    ([value, label]) => `<option value="${value}">${label}</option>`,
  ).join("");

  return `
    <div class="hybrid-key-capture">
      <div class="capture-header">
        <div class="capture-zone" id="captureZone">
          <div class="capture-indicator" id="captureIndicator">
            <div class="pulse-ring"></div>
            <i class="fas fa-keyboard"></i>
          </div>
          <div class="capture-instructions">
            <h3 data-i18n="press_any_key_combination">${translate("press_any_key_combination")}</h3>
            <p data-i18n="capture_instructions">${translate("capture_instructions")}</p>
          </div>
        </div>
        <button class="btn btn-secondary toggle-mode" id="toggleCaptureMode" data-i18n="switch_to_manual">
          ${translate("switch_to_manual")}
        </button>
      </div>

      <div class="selection-preview">
        <div class="preview-display">
          <label data-i18n="selected_key">${translate("selected_key")}:</label>
          <div class="key-preview-display" id="keyPreviewDisplay">
            <span class="no-selection" data-i18n="no_key_selected">${translate("no_key_selected")}</span>
          </div>
        </div>
        <div class="preview-controls">
          <label class="location-specific-toggle">
            <input type="checkbox" id="distinguishModifierSide" />
            <span data-i18n="distinguish_left_right_modifiers">${translate("distinguish_left_right_modifiers")}</span>
          </label>
          ${bindsetPicker}
        </div>
      </div>

      <div class="capture-content">
        <div class="virtual-keyboard-section">
          <div class="section-header">
            <select id="keyboardLayoutSelector" class="form-select">
              ${layoutOptions}
            </select>
          </div>
          <div class="virtual-keyboard" id="virtualKeyboard"></div>
        </div>
      </div>

      <div class="capture-footer">
        <div class="action-buttons">
          <button class="btn btn-primary" id="confirm-key-selection" disabled data-i18n="confirm_selection">
            ${translate("confirm_selection")}
          </button>
          <button class="btn btn-secondary" id="cancel-key-selection" data-i18n="cancel">
            ${translate("cancel")}
          </button>
        </div>
      </div>
    </div>
  `;
}

/**
 * @param {KeyCaptureModalOptions} options
 * @returns {boolean}
 */
export function renderKeyCaptureModal({ document, ...options }) {
  const modalBody = document
    .getElementById("keySelectionModal")
    ?.querySelector(".modal-body");
  if (!modalBody) return false;
  modalBody.innerHTML = buildKeyCaptureModalHtml(options);
  return true;
}

/**
 * @param {Document} document
 * @param {(key: string) => string} translate
 * @param {boolean} capturing
 */
export function projectKeyCaptureState(document, translate, capturing) {
  document
    .getElementById("captureIndicator")
    ?.classList.toggle("active", capturing);

  const toggle = document.getElementById("toggleCaptureMode");
  if (toggle) {
    const labelKey = capturing ? "switch_to_manual" : "start_capture";
    toggle.setAttribute("data-i18n", labelKey);
    toggle.textContent = translate(labelKey);
  }

  document
    .getElementById("virtualKeyboard")
    ?.classList.toggle("disabled", capturing);
}

/**
 * Materialize a chord with text nodes so even an unexpected producer cannot
 * turn a captured value into modal markup.
 *
 * @param {Document} document
 * @param {(key: string) => string} translate
 * @param {string} chord
 */
export function projectKeyCapturePreview(document, translate, chord) {
  const preview = document.getElementById("keyPreviewDisplay");
  if (!preview) return;

  if (!chord) {
    const empty = document.createElement("span");
    empty.className = "no-selection";
    empty.dataset.i18n = "no_key_selected";
    empty.textContent = translate("no_key_selected");
    preview.replaceChildren(empty);
    return;
  }

  const combination = document.createElement("span");
  combination.className = "key-combination";
  chord
    .split("+")
    .filter(Boolean)
    .forEach((part, index) => {
      if (index > 0) {
        const plus = document.createElement("span");
        plus.className = "plus";
        plus.textContent = "+";
        combination.appendChild(plus);
      }
      const key = document.createElement("kbd");
      key.textContent = part;
      combination.appendChild(key);
    });
  preview.replaceChildren(combination);
}

/** @param {Document} document @param {boolean} enabled */
export function projectKeyCaptureConfirmEnabled(document, enabled) {
  const button = document.getElementById("confirm-key-selection");
  if (button && "disabled" in button) {
    /** @type {HTMLButtonElement} */ (button).disabled = !enabled;
  }
}

/** @param {Document} document @param {string} id @param {string} value */
export function syncKeyCaptureSelect(document, id, value) {
  const select = document.getElementById(id);
  if (select && "value" in select) {
    /** @type {HTMLSelectElement} */ (select).value = value;
  }
}
