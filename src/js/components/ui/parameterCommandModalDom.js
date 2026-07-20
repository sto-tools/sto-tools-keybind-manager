import {
  parseParameterBoolean,
  parseParameterNumber,
} from "./parameterCommandModel.js";

/** @typedef {import('../../types/rpc/parameters-preferences.js').ParameterBuildParameters} ParameterBuildParameters */
/** @typedef {import('../../types/rpc/parameters-preferences.js').ParameterCommandDefinition} ParameterCommandDefinition */
/** @typedef {string | number | undefined} ParameterValue */
/**
 * @typedef {{
 *   type?: string,
 *   label?: string,
 *   help?: string,
 *   default?: ParameterValue,
 *   options?: string[],
 *   placeholder?: string,
 *   min?: string | number,
 *   max?: string | number,
 *   step?: string | number
 * }} ParameterDefinition
 */
/** @typedef {Record<string, unknown>} ParameterFormDraft */

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Structural form-control guard that remains valid for injected documents from
 * another realm.
 *
 * @param {unknown} value
 * @returns {value is HTMLInputElement | HTMLSelectElement}
 */
function isFormControl(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    "name" in value &&
    typeof value.name === "string" &&
    "value" in value &&
    typeof value.value === "string" &&
    "type" in value &&
    typeof value.type === "string"
  );
}

/**
 * @template {keyof HTMLElementTagNameMap} Tag
 * @param {Document} document
 * @param {Tag} tagName
 * @param {string} [className]
 * @returns {HTMLElementTagNameMap[Tag]}
 */
function createElement(document, tagName, className = "") {
  const element = document.createElement(tagName);
  element.className = className;
  return element;
}

/**
 * @param {Document} document
 * @param {(key: string) => string} translate
 * @param {HTMLDivElement} modal
 */
function renderModalShell(document, translate, modal) {
  const content = createElement(document, "div", "modal-content");

  const header = createElement(document, "div", "modal-header");
  const title = document.createElement("h3");
  title.id = "parameterModalTitle";
  title.dataset.i18n = "parameter_configuration";
  title.textContent = translate("parameter_configuration");
  const closeButton = createElement(document, "button", "modal-close");
  closeButton.dataset.modal = "parameterModal";
  const closeIcon = createElement(document, "i", "fas fa-times");
  closeButton.appendChild(closeIcon);
  header.append(title, closeButton);

  const body = createElement(document, "div", "modal-body");
  const inputs = document.createElement("div");
  inputs.id = "parameterInputs";
  const previewGroup = createElement(document, "div", "command-preview-modal");
  const previewLabel = document.createElement("label");
  previewLabel.dataset.i18n = "generated_command";
  previewLabel.textContent = translate("generated_command");
  const preview = createElement(document, "div", "command-preview");
  preview.id = "parameterCommandPreview";
  previewGroup.append(previewLabel, preview);
  body.append(inputs, previewGroup);

  const footer = createElement(document, "div", "modal-footer");
  const saveButton = createElement(document, "button", "btn btn-primary");
  saveButton.id = "saveParameterCommandBtn";
  saveButton.textContent = translate("add_command");
  const cancelButton = createElement(document, "button", "btn btn-secondary");
  cancelButton.dataset.modal = "parameterModal";
  cancelButton.textContent = translate("cancel");
  footer.append(saveButton, cancelButton);

  content.append(header, body, footer);
  modal.replaceChildren(content);
  return { container: inputs, saveButton, preview, title };
}

/**
 * Create the shipped parameter modal shell without attaching it or retaining
 * listeners. The lifecycle owner decides when it joins the document.
 *
 * @param {{ document: Document, translate: (key: string) => string }} options
 * @returns {HTMLDivElement}
 */
export function createParameterModal({ document, translate }) {
  const modal = createElement(document, "div", "modal");
  modal.id = "parameterModal";
  renderModalShell(document, translate, modal);
  return modal;
}

/** @param {string} name */
function formatParameterName(name) {
  return name
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/**
 * @param {(key: string) => string} translate
 * @param {string} paramName
 * @param {ParameterDefinition} definition
 */
function parameterLabel(translate, paramName, definition) {
  return (
    definition.label ||
    translate(`command_parameters.${paramName}.label`) ||
    translate(paramName) ||
    formatParameterName(paramName)
  );
}

/**
 * @param {(key: string) => string} translate
 * @param {string} paramName
 * @param {ParameterDefinition} definition
 */
function parameterHelp(translate, paramName, definition) {
  return (
    definition.help ||
    translate(`command_parameters.${paramName}.help`) ||
    translate("parameter_value")
  );
}

/**
 * @param {(key: string) => string} translate
 * @param {string} paramName
 * @param {string} value
 */
function optionLabel(translate, paramName, value) {
  if (paramName === "verb") return translate(`verb.${value}`);
  if (value === "STOTrayExecByTray") {
    return translate("stotrayexecbytray_description");
  }
  if (value === "TrayExecByTray") {
    return translate("trayexecbytray_description");
  }
  return value;
}

/**
 * @param {(key: string) => string} translate
 * @param {ParameterDefinition} definition
 */
function parameterPlaceholder(translate, definition) {
  const placeholder = definition.placeholder;
  if (!placeholder) return "";
  if (placeholder.startsWith("command_definitions.")) {
    return translate(placeholder) || placeholder;
  }
  return placeholder;
}

/**
 * @param {Document} document
 * @param {(key: string) => string} translate
 * @param {string} paramName
 * @param {ParameterDefinition} definition
 * @param {unknown} selectedValue
 */
function createParameterInput(
  document,
  translate,
  paramName,
  definition,
  selectedValue,
) {
  if (definition.type === "select") {
    const select = document.createElement("select");
    select.id = `param_${paramName}`;
    select.name = paramName;
    for (const value of definition.options || []) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = optionLabel(translate, paramName, value);
      if (value === selectedValue) option.selected = true;
      select.appendChild(option);
    }
    return select;
  }

  const input = document.createElement("input");
  input.type =
    definition.type === "number" || definition.type === "boolean"
      ? "number"
      : "text";
  input.id = `param_${paramName}`;
  input.name = paramName;
  input.value = String(selectedValue ?? "");
  if (definition.placeholder) {
    input.placeholder = parameterPlaceholder(translate, definition);
  }
  if (definition.type === "number" || definition.type === "boolean") {
    if (definition.min !== undefined) input.min = String(definition.min);
    if (definition.max !== undefined) input.max = String(definition.max);
    if (definition.step !== undefined) input.step = String(definition.step);
  }
  return input;
}

/**
 * @param {Document} document
 * @param {(key: string) => string} translate
 * @param {HTMLElement} container
 * @param {Record<string, unknown>} parameters
 * @param {ParameterFormDraft} draft
 */
function renderParameterInputs(
  document,
  translate,
  container,
  parameters,
  draft,
) {
  for (const [paramName, candidate] of Object.entries(parameters)) {
    const definition = /** @type {ParameterDefinition} */ (
      isRecord(candidate) ? candidate : {}
    );
    const group = createElement(document, "div", "form-group");
    const label = document.createElement("label");
    label.textContent = parameterLabel(translate, paramName, definition);
    label.setAttribute("for", `param_${paramName}`);

    const selectedValue = draft[paramName] ?? definition.default;
    const input = createParameterInput(
      document,
      translate,
      paramName,
      definition,
      selectedValue,
    );
    const help = document.createElement("small");
    help.textContent = parameterHelp(translate, paramName, definition);

    group.append(label, input, help);
    container.appendChild(group);
  }
}

/**
 * Render one add/edit generation and return the exact controls to which the
 * lifecycle owner may attach listeners.
 *
 * @param {{
 *   document: Document,
 *   modal: HTMLDivElement,
 *   translate: (key: string) => string,
 *   commandDef: ParameterCommandDefinition,
 *   editing: boolean,
 *   draft?: ParameterFormDraft
 * }} options
 * @returns {{ container: HTMLDivElement, saveButton: HTMLButtonElement, preview: HTMLDivElement }}
 */
export function renderParameterModal({
  document,
  modal,
  translate,
  commandDef,
  editing,
  draft = {},
}) {
  const { container, saveButton, preview, title } = renderModalShell(
    document,
    translate,
    modal,
  );
  const titleKey = editing ? "edit_colon" : "configure_colon";
  title.textContent = `${translate(titleKey)} ${String(commandDef.name ?? "")}`;
  saveButton.textContent = translate(editing ? "save" : "add_command");

  /** @type {Record<string, unknown>} */
  const parameters = isRecord(commandDef.parameters)
    ? commandDef.parameters
    : {};
  renderParameterInputs(document, translate, container, parameters, draft);
  return { container, saveButton, preview };
}

/**
 * Capture string control values for language regeneration without consulting
 * application state.
 *
 * @param {ParentNode} modal
 * @returns {ParameterFormDraft}
 */
export function captureParameterFormDraft(modal) {
  /** @type {ParameterFormDraft} */
  const draft = {};
  const controls = modal.querySelectorAll(
    "#parameterInputs input, #parameterInputs select",
  );
  for (const control of controls) {
    if (!isFormControl(control) || !control.name) continue;
    draft[control.name] = control.value;
  }
  return draft;
}

/**
 * Read and type the currently rendered parameter values using the command
 * definition that produced the form.
 *
 * @param {ParentNode} modal
 * @param {ParameterCommandDefinition} commandDef
 * @returns {ParameterBuildParameters}
 */
export function readParameterFormValues(modal, commandDef) {
  /** @type {ParameterBuildParameters} */
  const values = {};
  const parameters = isRecord(commandDef.parameters)
    ? commandDef.parameters
    : {};
  const controls = modal.querySelectorAll(
    "#parameterInputs input, #parameterInputs select",
  );

  for (const control of controls) {
    if (!isFormControl(control) || !control.name) continue;
    const candidate = parameters[control.name];
    const definition = isRecord(candidate) ? candidate : null;
    if (control.type === "number") {
      values[control.name] =
        definition?.type === "boolean"
          ? parseParameterBoolean(control.value, control.name)
          : parseParameterNumber(control.value, control.name);
    } else {
      values[control.name] = control.value;
    }
  }
  return values;
}

/**
 * Apply the legacy live boolean normalization to one delegated input target.
 *
 * @param {EventTarget | null} target
 * @param {ParameterCommandDefinition} commandDef
 * @returns {boolean}
 */
export function normalizeBooleanParameterInput(target, commandDef) {
  const parameters = commandDef.parameters;
  const definition =
    isFormControl(target) && isRecord(parameters)
      ? parameters[target.name]
      : null;
  if (
    !isFormControl(target) ||
    !isRecord(definition) ||
    definition.type !== "boolean"
  ) {
    return false;
  }

  const parsed = Number(target.value);
  if (!Number.isNaN(parsed)) {
    const normalized = parsed !== 0 ? 1 : 0;
    if (parsed !== normalized) target.value = String(normalized);
  }
  return true;
}

/**
 * @param {ParentNode} modal
 * @param {{ text: string, error?: boolean }} projection
 * @returns {boolean}
 */
export function projectParameterPreview(modal, { text, error }) {
  const preview = modal.querySelector("#parameterCommandPreview");
  if (!preview || !("style" in preview)) return false;
  const previewElement = /** @type {HTMLElement} */ (preview);
  previewElement.textContent = text;
  if (error === true) previewElement.style.color = "#d63031";
  if (error === false) previewElement.style.color = "";
  return true;
}
