/**
 * @typedef {{
 *   generatedAlias: HTMLElement | null,
 *   aliasPreview: HTMLElement | null,
 *   commandPreview: HTMLElement,
 *   label: HTMLLabelElement | null,
 * }} CommandChainPreviewElements
 *
 * @typedef {{ type: 'literal', text: string } | {
 *   type: 'translation',
 *   key: string,
 *   options: { defaultValue: string },
 * }} CommandChainGeneratedAliasContent
 *
 * @typedef {{
 *   labelKey: string,
 *   commandPreview: string,
 *   generatedAlias: {
 *     visible: boolean,
 *     content: CommandChainGeneratedAliasContent,
 *   },
 * }} CommandChainPreviewProjection
 */

/**
 * Capture the preview boundary from an injected document. Interactive preview
 * updates require both alias nodes by default. Accepted empty-state renders may
 * opt into the historical partial boundary, where the command preview remains
 * writable even when an optional alias node is absent.
 *
 * @param {Document} document
 * @param {{ allowPartialAlias?: boolean }} [options]
 * @returns {CommandChainPreviewElements | null}
 */
export function captureCommandChainPreviewElements(document, options = {}) {
  const generatedAlias = document.getElementById("generatedAlias");
  const aliasPreview = document.getElementById("aliasPreview");
  const commandPreview = document.getElementById("commandPreview");

  if (
    !commandPreview ||
    (!options.allowPartialAlias && (!generatedAlias || !aliasPreview))
  ) {
    return null;
  }

  const label = /** @type {HTMLLabelElement | null} */ (
    document.querySelector(".generated-command label[data-i18n]")
  );

  return { generatedAlias, aliasPreview, commandPreview, label };
}

/**
 * @param {{
 *   t: (key: string, options?: { defaultValue?: string }) => string,
 * }} i18n
 * @param {CommandChainGeneratedAliasContent} content
 * @returns {string}
 */
function materializeGeneratedAliasContent(i18n, content) {
  if (content.type === "literal") return content.text;
  return i18n.t(content.key, content.options);
}

/**
 * Commit a fully projected preview without parsing dynamic content as markup or
 * consulting ambient document/global state. All values that can fail are read
 * before the first DOM write so a translation failure cannot partially update
 * the required preview elements.
 *
 * @param {CommandChainPreviewElements | null} elements
 * @param {{
 *   t: (key: string, options?: { defaultValue?: string }) => string,
 * }} i18n
 * @param {CommandChainPreviewProjection} projection
 * @returns {boolean}
 */
export function commitCommandChainPreview(elements, i18n, projection) {
  if (!elements) return false;

  const commandPreview = projection.commandPreview;
  const aliasContent = materializeGeneratedAliasContent(
    i18n,
    projection.generatedAlias.content,
  );
  const aliasDisplay = projection.generatedAlias.visible ? "" : "none";
  const labelKey = projection.labelKey;
  const labelText = elements.label ? i18n.t(labelKey) : null;

  elements.commandPreview.textContent = commandPreview;
  if (elements.aliasPreview) elements.aliasPreview.textContent = aliasContent;
  if (elements.generatedAlias) {
    elements.generatedAlias.style.display = aliasDisplay;
  }

  if (elements.label) {
    elements.label.dataset.i18n = labelKey;
    elements.label.textContent = labelText;
  }

  return true;
}
