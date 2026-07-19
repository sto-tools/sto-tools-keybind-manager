/** @typedef {'keybinds' | 'aliases' | 'kbf'} ImportType */
/** @typedef {'space' | 'ground'} ImportEnvironment */
/** @typedef {'merge_keep' | 'merge_overwrite' | 'overwrite_all'} ImportStrategy */
/** @typedef {{ bindsetsEnabled?: boolean }} ImportContext */
/** @typedef {{ selectedStrategy?: ImportStrategy | null }} ImportStrategyDraft */
/** @typedef {(key: string, params?: Record<string, unknown>) => string} Translate */

const STRATEGIES = Object.freeze([
  ["merge_keep", "merge_keep_existing"],
  ["merge_overwrite", "merge_overwrite_existing"],
  ["overwrite_all", "overwrite_all"],
]);

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
 * @param {string} iconClass
 * @param {string} title
 */
function createHeading(document, iconClass, title) {
  const heading = document.createElement("h3");
  heading.append(
    createElement(document, "i", iconClass),
    document.createTextNode(` ${title}`),
  );
  return heading;
}

/**
 * @param {Document} document
 * @param {string} title
 * @param {string} iconClass
 */
function createModalShell(document, title, iconClass) {
  const modal = createElement(document, "div", "modal import-modal");
  const content = createElement(document, "div", "modal-content");
  const header = createElement(document, "div", "modal-header");
  const body = createElement(document, "div", "modal-body");
  const footer = createElement(document, "div", "modal-footer");
  header.appendChild(createHeading(document, iconClass, title));
  content.append(header, body, footer);
  modal.appendChild(content);
  return { modal, body, footer };
}

/**
 * @param {Document} document
 * @param {string} className
 * @param {string} text
 */
function createButton(document, className, text) {
  const button = createElement(document, "button", className);
  button.textContent = text;
  return button;
}

/** @param {unknown} candidate @returns {ImportStrategy} */
function normalizeDraftStrategy(candidate) {
  return candidate === "merge_overwrite" || candidate === "overwrite_all"
    ? candidate
    : "merge_keep";
}

/**
 * @param {Document} document
 * @param {Translate} translate
 * @param {string} inputName
 * @param {ImportStrategy} strategy
 * @param {string} labelKey
 * @param {ImportStrategy} selectedStrategy
 * @param {string} [description]
 */
function createStrategyOption(
  document,
  translate,
  inputName,
  strategy,
  labelKey,
  selectedStrategy,
  description = "",
) {
  const label = createElement(document, "label", "import-strategy-option");
  const input = document.createElement("input");
  input.type = "radio";
  input.name = inputName;
  input.value = strategy;
  input.checked = strategy === selectedStrategy;
  const text = document.createElement("span");
  text.textContent = translate(labelKey);
  label.append(input, text);
  if (description) {
    const detail = createElement(document, "div", "strategy-description");
    detail.textContent = description;
    label.appendChild(detail);
  }
  return label;
}

/**
 * @param {Document} document
 * @param {Translate} translate
 * @param {HTMLElement} parent
 * @param {string} inputName
 * @param {ImportStrategyDraft | undefined} draft
 * @param {string} [overwriteDescription]
 */
function appendStrategyOptions(
  document,
  translate,
  parent,
  inputName,
  draft,
  overwriteDescription = "",
) {
  const selectedStrategy = normalizeDraftStrategy(draft?.selectedStrategy);
  for (const [strategy, labelKey] of STRATEGIES) {
    parent.appendChild(
      createStrategyOption(
        document,
        translate,
        inputName,
        /** @type {ImportStrategy} */ (strategy),
        labelKey,
        selectedStrategy,
        strategy === "overwrite_all" ? overwriteDescription : "",
      ),
    );
  }
}

/**
 * @param {Translate} translate
 * @param {ImportType} importType
 * @param {ImportContext} additionalContext
 */
function environmentOverwriteDescription(
  translate,
  importType,
  additionalContext,
) {
  if (importType === "keybinds") {
    return translate("overwrite_all_description_keybinds");
  }
  if (importType === "aliases") {
    return translate("overwrite_all_description_aliases");
  }
  return translate(
    additionalContext.bindsetsEnabled === false
      ? "overwrite_all_description_kbf_primary"
      : "overwrite_all_description_kbf_bindsets",
  );
}

/**
 * @param {{
 *   document: Document,
 *   translate: Translate,
 *   defaultEnv: string,
 *   importType?: ImportType,
 *   additionalContext?: ImportContext,
 *   draft?: ImportStrategyDraft
 * }} options
 */
export function createEnvironmentImportModal({
  document,
  translate,
  defaultEnv,
  importType = "keybinds",
  additionalContext = {},
  draft,
}) {
  const { modal, body, footer } = createModalShell(
    document,
    translate("import_environment"),
    "fas fa-file-import",
  );
  const message = document.createElement("p");
  message.textContent = translate("import_environment_question");
  body.appendChild(message);

  const section = createElement(document, "div", "import-strategy-section");
  const label = createElement(document, "label", "import-strategy-label");
  label.textContent = translate("import_strategy");
  const choices = createElement(document, "div", "import-strategy-options");
  appendStrategyOptions(
    document,
    translate,
    choices,
    "import-strategy",
    draft,
    environmentOverwriteDescription(translate, importType, additionalContext),
  );
  section.append(label, choices);
  body.appendChild(section);

  footer.append(
    createButton(
      document,
      `btn btn-primary import-space ${
        defaultEnv === "space" ? "btn-primary" : "btn-secondary"
      }`,
      translate("space"),
    ),
    createButton(
      document,
      `btn btn-primary import-ground ${
        defaultEnv === "ground" ? "btn-primary" : "btn-secondary"
      }`,
      translate("ground"),
    ),
    createButton(
      document,
      "btn btn-secondary import-cancel",
      translate("cancel"),
    ),
  );
  return modal;
}

/**
 * @param {{
 *   document: Document,
 *   translate: Translate,
 *   draft?: ImportStrategyDraft
 * }} options
 */
export function createAliasStrategyModal({ document, translate, draft }) {
  const { modal, body, footer } = createModalShell(
    document,
    translate("import_strategy"),
    "fas fa-file-import",
  );
  const label = createElement(document, "label", "import-strategy-label");
  label.textContent = translate("import_strategy");
  const choices = createElement(document, "div", "import-strategy-options");
  appendStrategyOptions(
    document,
    translate,
    choices,
    "alias-import-strategy",
    draft,
    translate("overwrite_all_description_aliases"),
  );
  body.append(label, choices);
  footer.append(
    createButton(
      document,
      "btn btn-primary alias-strategy-confirm",
      translate("import"),
    ),
    createButton(
      document,
      "btn btn-secondary alias-strategy-cancel",
      translate("cancel"),
    ),
  );
  return modal;
}

/**
 * @param {{
 *   document: Document,
 *   translate: Translate,
 *   type: 'keys' | 'aliases',
 *   current: number,
 *   incoming: number,
 *   environment?: ImportEnvironment | null,
 *   customMessage?: string | null
 * }} options
 */
export function createOverwriteConfirmationModal({
  document,
  translate,
  type,
  current,
  incoming,
  environment = null,
  customMessage = null,
}) {
  const { modal, body, footer } = createModalShell(
    document,
    translate("overwrite_confirm_title"),
    "fas fa-exclamation-triangle",
  );
  const bodyText = customMessage
    ? customMessage
    : type === "keys" && environment
      ? translate("overwrite_confirm_body_keys", { environment })
      : translate("overwrite_confirm_body_aliases");
  const message = document.createElement("p");
  message.textContent = bodyText;
  body.appendChild(message);
  if (!customMessage) {
    const counts = document.createElement("p");
    const strong = document.createElement("strong");
    strong.textContent = translate("overwrite_counts", { current, incoming });
    counts.appendChild(strong);
    body.appendChild(counts);
  }
  footer.append(
    createButton(
      document,
      "btn btn-danger overwrite-confirm-yes",
      translate("overwrite_all_action"),
    ),
    createButton(
      document,
      "btn btn-secondary overwrite-confirm-no",
      translate("cancel"),
    ),
  );
  return modal;
}

/**
 * @param {ParentNode} modal
 * @param {string} inputName
 * @returns {ImportStrategyDraft}
 */
function captureStrategyDraft(modal, inputName) {
  const selected = /** @type {HTMLInputElement | null} */ (
    modal.querySelector(`input[name="${inputName}"]:checked`)
  );
  return {
    selectedStrategy: selected
      ? normalizeDraftStrategy(selected.value)
      : "merge_keep",
  };
}

/** @param {ParentNode} modal */
export function captureEnvironmentImportModalDraft(modal) {
  return captureStrategyDraft(modal, "import-strategy");
}

/** @param {ParentNode} modal */
export function captureAliasStrategyModalDraft(modal) {
  return captureStrategyDraft(modal, "alias-import-strategy");
}
