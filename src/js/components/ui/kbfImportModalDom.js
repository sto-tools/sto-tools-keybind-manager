/** @typedef {Extract<import('../../types/rpc/import-export.js').KBFParseForUiResult, { valid: true }>} ValidKBFParseResult */

/** @typedef {'primary' | 'mapped' | 'none'} KBFMappingType */
/**
 * @typedef {{
 *   bindsetName: string,
 *   mappingType: KBFMappingType,
 *   customName: string
 * }} KBFEnhancedModalDraftRow
 */
/** @typedef {{ mappings?: readonly KBFEnhancedModalDraftRow[] }} KBFEnhancedModalDraft */
/** @typedef {{ selectedBindsetName?: string | null }} KBFSingleModalDraft */
/**
 * @typedef {{
 *   document: Document,
 *   translate: (key: string) => string,
 *   parseResult: ValidKBFParseResult,
 *   draft?: KBFEnhancedModalDraft
 * }} KBFEnhancedModalOptions
 */
/**
 * @typedef {{
 *   document: Document,
 *   translate: (key: string) => string,
 *   parseResult: ValidKBFParseResult,
 *   draft?: KBFSingleModalDraft
 * }} KBFSingleModalOptions
 */

const MAPPING_TYPES = new Set(["primary", "mapped", "none"]);

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
 * @param {string} className
 * @param {string} title
 */
function createModalShell(document, className, title) {
  const modal = createElement(document, "div", className);
  const content = createElement(document, "div", "modal-content");
  const header = createElement(document, "div", "modal-header");
  const heading = document.createElement("h3");
  const icon = createElement(document, "i", "fas fa-layer-group");
  heading.append(icon, document.createTextNode(` ${title}`));
  header.appendChild(heading);

  const body = createElement(document, "div", "modal-body");
  const footer = createElement(document, "div", "modal-footer");
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
  button.type = "button";
  button.textContent = text;
  return button;
}

/**
 * Read a count without allowing special imported names such as `__proto__` to
 * fall through to an inherited property.
 *
 * @param {Record<string, number>} counts
 * @param {string} name
 */
function readKeyCount(counts, name) {
  return Object.prototype.hasOwnProperty.call(counts, name) ? counts[name] : 0;
}

/** @param {string} name */
function isMasterBindset(name) {
  return name.toLowerCase() === "master";
}

/**
 * @param {KBFEnhancedModalDraft | undefined} draft
 * @param {string} bindsetName
 * @param {boolean} isMaster
 */
function resolveEnhancedDraft(draft, bindsetName, isMaster) {
  const candidate = draft?.mappings?.find(
    (mapping) => mapping.bindsetName === bindsetName,
  );
  const mappingType = MAPPING_TYPES.has(candidate?.mappingType ?? "")
    ? /** @type {KBFMappingType} */ (candidate?.mappingType)
    : isMaster
      ? "primary"
      : "mapped";
  return {
    mappingType,
    customName: candidate?.customName ?? bindsetName,
  };
}

/**
 * @param {Document} document
 * @param {(key: string) => string} translate
 * @param {string} name
 * @param {number} keyCount
 * @param {KBFEnhancedModalDraft | undefined} draft
 */
function createEnhancedRow(document, translate, name, keyCount, draft) {
  const isMaster = isMasterBindset(name);
  const rowDraft = resolveEnhancedDraft(draft, name, isMaster);
  const row = createElement(document, "tr", "bindset-row");
  row.dataset.bindset = name;

  const nameCell = createElement(document, "td", "bindset-name-cell");
  const nameLabel = createElement(document, "span", "bindset-name");
  nameLabel.textContent = name;
  nameCell.appendChild(nameLabel);
  if (isMaster) {
    const badge = createElement(document, "span", "bindset-indicator primary");
    badge.textContent = translate("primary_label");
    nameCell.appendChild(badge);
  }

  const countCell = createElement(document, "td", "bindset-count-cell");
  const count = createElement(document, "span", "key-count");
  count.textContent = String(keyCount);
  countCell.appendChild(count);

  const typeCell = createElement(document, "td", "bindset-type-cell");
  typeCell.colSpan = 2;
  const select = createElement(document, "select", "bindset-mapping-select");
  select.dataset.bindset = name;
  for (const [value, labelKey] of [
    ["primary", "maps_to_primary_bindset"],
    ["mapped", "maps_to"],
    ["none", "not_mapped"],
  ]) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = translate(labelKey);
    select.appendChild(option);
  }
  select.value = rowDraft.mappingType;

  const customContainer = createElement(
    document,
    "div",
    "bindset-custom-container",
  );
  customContainer.style.display = "none";
  const input = createElement(document, "input", "bindset-custom-input");
  input.type = "text";
  input.dataset.bindset = name;
  input.placeholder = name;
  input.value = rowDraft.customName;
  customContainer.appendChild(input);
  typeCell.append(select, customContainer);

  row.append(nameCell, countCell, typeCell);
  return row;
}

/**
 * Build the multi-bindset KBF configuration modal. Imported names and counts
 * are assigned only through DOM properties, so they cannot become markup or
 * selectors. Listener ownership remains with the modal session controller.
 *
 * @param {KBFEnhancedModalOptions} options
 * @returns {HTMLDivElement}
 */
export function createEnhancedKBFImportModal({
  document,
  translate,
  parseResult,
  draft,
}) {
  const { modal, body, footer } = createModalShell(
    document,
    "modal import-modal enhanced-bindset-selection large-modal",
    translate("configure_kbf_import"),
  );

  const message = document.createElement("p");
  message.textContent = translate("configure_kbf_import_question");
  body.appendChild(message);

  const grid = createElement(document, "div", "enhanced-bindset-grid");
  const table = createElement(document, "table", "bindset-table");
  const head = document.createElement("thead");
  const headerRow = document.createElement("tr");
  for (const labelKey of [
    "original_bindset_name",
    "key_count",
    "mapping_type",
    "mapping_destination",
  ]) {
    const header = createElement(document, "th", "bindset-header");
    header.textContent = translate(labelKey);
    headerRow.appendChild(header);
  }
  head.appendChild(headerRow);

  const tableBody = document.createElement("tbody");
  for (const name of parseResult.bindsetNames) {
    tableBody.appendChild(
      createEnhancedRow(
        document,
        translate,
        name,
        readKeyCount(parseResult.bindsetKeyCounts, name),
        draft,
      ),
    );
  }
  table.append(head, tableBody);
  grid.appendChild(table);
  body.appendChild(grid);

  const preview = createElement(document, "div", "enhanced-preview-section");
  const previewHeading = document.createElement("h4");
  previewHeading.textContent = translate("import_preview");
  const previewContent = createElement(document, "div", "preview-content");
  previewContent.id = "preview_content";
  const placeholder = createElement(document, "p", "preview-placeholder");
  placeholder.textContent = translate("select_bindsets_for_preview");
  previewContent.appendChild(placeholder);
  preview.append(previewHeading, previewContent);
  body.appendChild(preview);

  footer.append(
    createButton(
      document,
      "btn btn-primary enhanced-bindset-confirm",
      translate("import_configured"),
    ),
    createButton(
      document,
      "btn btn-secondary enhanced-bindset-cancel",
      translate("cancel"),
    ),
  );
  return modal;
}

/**
 * Capture enhanced controls as ordered rows. The array representation keeps
 * imported names opaque, including names meaningful on Object.prototype.
 *
 * @param {ParentNode} modal
 * @returns {KBFEnhancedModalDraft}
 */
export function captureEnhancedKBFImportModalDraft(modal) {
  const selects = /** @type {NodeListOf<HTMLSelectElement>} */ (
    modal.querySelectorAll(".bindset-mapping-select")
  );
  return {
    mappings: Array.from(selects, (select) => {
      const row = select.closest(".bindset-row");
      const input = /** @type {HTMLInputElement | null} */ (
        row?.querySelector(".bindset-custom-cell .bindset-custom-input") ??
          row?.querySelector(".bindset-custom-input") ??
          null
      );
      return {
        bindsetName: select.dataset.bindset ?? "",
        mappingType: MAPPING_TYPES.has(select.value)
          ? /** @type {KBFMappingType} */ (select.value)
          : "none",
        customName: input?.value ?? "",
      };
    }),
  };
}

/**
 * Apply one enhanced mapping control through row-local static queries. The
 * existing input is moved instead of cloned, preserving its value, identity,
 * and any lifecycle-owned input listener across mapping changes.
 *
 * @param {HTMLTableRowElement} row
 */
export function projectEnhancedKBFImportModalRow(row) {
  const typeCell = /** @type {HTMLTableCellElement | null} */ (
    row.querySelector(".bindset-type-cell")
  );
  const select = /** @type {HTMLSelectElement | null} */ (
    row.querySelector(".bindset-mapping-select")
  );
  const container = /** @type {HTMLElement | null} */ (
    row.querySelector(".bindset-custom-container")
  );
  const customCell = /** @type {HTMLTableCellElement | null} */ (
    row.querySelector(".bindset-custom-cell")
  );
  const input = /** @type {HTMLInputElement | null} */ (
    customCell?.querySelector(".bindset-custom-input") ??
      container?.querySelector(".bindset-custom-input") ??
      null
  );
  if (!typeCell || !select || !container || !input) return false;

  if (select.value === "mapped") {
    typeCell.removeAttribute("colspan");
    const destinationCell =
      customCell ??
      createElement(row.ownerDocument, "td", "bindset-custom-cell");
    destinationCell.dataset.bindset = row.dataset.bindset ?? "";
    input.style.display = "block";
    destinationCell.appendChild(input);
    if (!customCell) row.appendChild(destinationCell);
  } else {
    input.style.display = "";
    container.appendChild(input);
    customCell?.remove();
    typeCell.colSpan = 2;
  }
  container.style.display = "none";
  return true;
}

/**
 * @param {Document} document
 * @param {(key: string) => string} translate
 * @param {string} name
 * @param {number} keyCount
 * @param {boolean} selected
 */
function createSingleOption(document, translate, name, keyCount, selected) {
  const option = createElement(
    document,
    "div",
    `single-bindset-option${selected ? " selected" : ""}`,
  );
  option.dataset.bindset = name;
  const label = createElement(document, "label", "single-bindset-label");
  const radio = createElement(document, "input", "single-bindset-radio");
  radio.type = "radio";
  radio.name = "selectedBindset";
  radio.value = name;
  radio.dataset.bindset = name;
  radio.checked = selected;

  const content = createElement(document, "div", "single-bindset-content");
  const main = createElement(document, "div", "single-bindset-main");
  const nameLabel = createElement(document, "span", "single-bindset-name");
  nameLabel.textContent = name;
  main.appendChild(nameLabel);
  if (isMasterBindset(name)) {
    const badge = createElement(
      document,
      "span",
      "single-bindset-badge primary",
    );
    badge.textContent = translate("primary_label");
    main.appendChild(badge);
  }

  const meta = createElement(document, "div", "single-bindset-meta");
  const count = createElement(document, "span", "single-bindset-count");
  count.textContent = `${String(keyCount)} ${translate("keys")}`;
  meta.appendChild(count);
  content.append(main, meta);
  label.append(radio, content);
  option.appendChild(label);
  return option;
}

/**
 * Build the reduced-functionality single-bindset KBF modal. A valid draft wins;
 * otherwise Master is selected when present, followed by the first bindset.
 *
 * @param {KBFSingleModalOptions} options
 * @returns {HTMLDivElement}
 */
export function createSingleKBFImportModal({
  document,
  translate,
  parseResult,
  draft,
}) {
  const { modal, body, footer } = createModalShell(
    document,
    "modal import-modal single-bindset-selection medium-modal",
    translate("select_bindset_to_import"),
  );
  const message = document.createElement("p");
  message.textContent = translate("select_bindset_import_question");
  body.appendChild(message);

  const names = parseResult.bindsetNames;
  const draftedIndex = names.findIndex(
    (name) => name === draft?.selectedBindsetName,
  );
  const masterIndex = names.findIndex(isMasterBindset);
  const selectedIndex = draftedIndex >= 0 ? draftedIndex : masterIndex;
  const container = createElement(document, "div", "single-bindset-container");
  names.forEach((name, index) => {
    container.appendChild(
      createSingleOption(
        document,
        translate,
        name,
        readKeyCount(parseResult.bindsetKeyCounts, name),
        index === (selectedIndex >= 0 ? selectedIndex : 0),
      ),
    );
  });
  body.appendChild(container);

  const info = createElement(document, "div", "bindset-functionality-info");
  const infoHeader = createElement(document, "div", "info-header");
  infoHeader.appendChild(createElement(document, "i", "fas fa-info-circle"));
  const infoTitle = document.createElement("span");
  infoTitle.textContent = translate("reduced_bindset_functionality");
  infoHeader.appendChild(infoTitle);
  const infoContent = createElement(document, "div", "info-content");
  const infoDescription = document.createElement("p");
  infoDescription.textContent = translate(
    "reduced_bindset_functionality_description",
  );
  const enableParagraph = document.createElement("p");
  const enableText = document.createElement("strong");
  enableText.textContent = translate("enable_full_bindset_functionality");
  enableParagraph.appendChild(enableText);
  infoContent.append(infoDescription, enableParagraph);
  info.append(infoHeader, infoContent);
  body.appendChild(info);

  const note = createElement(document, "div", "single-bindset-note");
  note.append(
    createElement(document, "i", "fas fa-info-circle"),
    document.createTextNode(` ${translate("single_bindset_import_note")}`),
  );
  body.appendChild(note);

  footer.append(
    createButton(
      document,
      "btn btn-primary single-bindset-confirm",
      translate("import_selected"),
    ),
    createButton(
      document,
      "btn btn-secondary single-bindset-cancel",
      translate("cancel"),
    ),
  );
  return modal;
}

/** @param {ParentNode} modal */
export function captureSingleKBFImportModalDraft(modal) {
  const selected = /** @type {HTMLInputElement | null} */ (
    modal.querySelector(".single-bindset-radio:checked")
  );
  return { selectedBindsetName: selected?.value ?? null };
}

/**
 * Synchronize the selected styling after native radio activation without
 * deriving a selector from the imported bindset name.
 *
 * @param {ParentNode} modal
 */
export function projectSingleKBFImportModalSelection(modal) {
  for (const option of modal.querySelectorAll(".single-bindset-option")) {
    const radio = /** @type {HTMLInputElement | null} */ (
      option.querySelector(".single-bindset-radio")
    );
    option.classList.toggle("selected", radio?.checked === true);
  }
}
