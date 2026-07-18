import { escapeHtml } from "../../lib/htmlEscape.js";

/**
 * @typedef {{
 *   selectedBindsets: string[],
 *   bindsetMappings: Record<string, 'primary' | 'custom'>,
 *   bindsetRenames: Record<string, string>
 * }} KBFPreviewConfiguration
 */

/**
 * Build the KBF mapping preview without interpreting imported bindset names as
 * markup. Translated copy remains authoritative and is materialized on every
 * update so language changes retain the existing behavior.
 *
 * @param {KBFPreviewConfiguration | null} configuration
 * @param {(key: string) => string} translate
 * @returns {string}
 */
export function buildKBFPreviewHtml(configuration, translate) {
  if (!configuration || configuration.selectedBindsets.length === 0) {
    return `<p class="preview-placeholder">${translate("select_bindsets_for_preview")}</p>`;
  }

  const rows = configuration.selectedBindsets.map((bindsetName) => {
    const mapping = configuration.bindsetMappings[bindsetName];
    const finalName = configuration.bindsetRenames[bindsetName];
    let mappingDisplay = "";

    if (mapping === "primary") {
      mappingDisplay = `<span class="mapping-indicator primary">${translate("maps_to_primary_bindset")}</span>`;
    } else if (mapping === "custom") {
      const hasConflict =
        finalName !==
        (configuration.bindsetRenames[bindsetName] || bindsetName);
      mappingDisplay = `<span class="mapping-indicator custom ${hasConflict ? "conflict" : ""}">${translate("maps_to")}: ${escapeHtml(finalName)}</span>`;
    }

    return `
            <div class="preview-row">
              <span class="preview-original">${escapeHtml(bindsetName)}</span>
              <span class="preview-arrow">→</span>
              ${mappingDisplay}
            </div>
          `;
  });

  return `<div class="preview-table">${rows.join("")}</div>`;
}
