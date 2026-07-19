import { describe, expect, it, vi } from "vitest";

import {
  captureEnhancedKBFImportModalDraft,
  captureSingleKBFImportModalDraft,
  createEnhancedKBFImportModal,
  createSingleKBFImportModal,
  projectEnhancedKBFImportModalRow,
  projectSingleKBFImportModalSelection,
} from "../../../src/js/components/ui/kbfImportModalDom.js";

/** @typedef {Extract<import('../../../src/js/types/rpc/import-export.js').KBFParseForUiResult, { valid: true }>} ValidKBFParseResult */

const translations = {
  cancel: "Cancel",
  configure_kbf_import: "Configure KBF Import",
  configure_kbf_import_question: "Configure imported bindsets",
  enable_full_bindset_functionality: "Enable bindsets for all options",
  import_configured: "Import Configured",
  import_preview: "Import Preview",
  import_selected: "Import Selected",
  key_count: "Key Count",
  keys: "translated keys",
  mapping_destination: "Mapping Destination",
  mapping_type: "Mapping Type",
  maps_to: "Maps To",
  maps_to_primary_bindset: "Maps to Primary Bindset",
  not_mapped: "Not Imported",
  original_bindset_name: "Original Bindset",
  primary_label: "Primary",
  reduced_bindset_functionality: "Single Bindset Import Mode",
  reduced_bindset_functionality_description: "Reduced behavior",
  select_bindset_import_question: "Choose one bindset",
  select_bindset_to_import: "Select Bindset to Import",
  select_bindsets_for_preview: "Select bindsets for preview",
  single_bindset_import_note: "The selection maps to primary",
};

const hostileName = 'Alpha"><img id="owned-name-probe">';
const selectorName = '"] .attacker, [data-bindset="';

/** @returns {ValidKBFParseResult} */
function parseResult() {
  /** @type {Record<string, number>} */
  const bindsetKeyCounts = Object.create(null);
  bindsetKeyCounts[hostileName] = 4;
  Object.defineProperty(bindsetKeyCounts, "__proto__", {
    value: 7,
    enumerable: true,
  });
  bindsetKeyCounts.Master = 2;
  bindsetKeyCounts[selectorName] = 3;

  return {
    valid: true,
    bindsets: {},
    bindsetNames: [hostileName, "__proto__", "Master", selectorName],
    bindsetKeyCounts,
    hasMasterBindset: true,
    masterDisplayName: "Master",
    metadata: { totalBindsets: 4, estimatedSize: 16, hasAliases: false },
    validation: { valid: true, errors: [], warnings: [] },
    singleBindsetFile: {
      isSingleBindset: false,
      onlyBindsetIsMaster: false,
      requiresBindsetSelection: true,
    },
    requiresBindsetSelection: true,
  };
}

/** @param {string} key */
function translate(key) {
  return translations[key] ?? `missing:${key}`;
}

describe("kbfImportModalDom", () => {
  it("builds the enhanced CSS structure and applies the shipped defaults", () => {
    const modal = createEnhancedKBFImportModal({
      document,
      translate,
      parseResult: parseResult(),
    });
    const rows = [...modal.querySelectorAll(".bindset-row")];
    const selects = /** @type {HTMLSelectElement[]} */ ([
      ...modal.querySelectorAll(".bindset-mapping-select"),
    ]);

    expect(modal.className).toBe(
      "modal import-modal enhanced-bindset-selection large-modal",
    );
    expect(modal.querySelectorAll(".bindset-header")).toHaveLength(4);
    expect(rows).toHaveLength(4);
    expect(selects.map((select) => select.value)).toEqual([
      "mapped",
      "mapped",
      "primary",
      "mapped",
    ]);
    expect(
      rows.map((row) => row.querySelector(".bindset-type-cell")?.colSpan),
    ).toEqual([2, 2, 2, 2]);
    expect(
      rows.map((row) => row.querySelector(".key-count")?.textContent),
    ).toEqual(["4", "7", "2", "3"]);
    expect(modal.querySelector(".bindset-indicator")?.textContent).toBe(
      "Primary",
    );
    expect(modal.querySelector("#preview_content")?.textContent).toBe(
      "Select bindsets for preview",
    );
  });

  it("keeps every imported name inert in text, data, placeholder, and value", () => {
    const modal = createEnhancedKBFImportModal({
      document,
      translate,
      parseResult: parseResult(),
    });
    const rows = [...modal.querySelectorAll(".bindset-row")];

    expect(rows.map((row) => row.dataset.bindset)).toEqual([
      hostileName,
      "__proto__",
      "Master",
      selectorName,
    ]);
    expect(
      rows.map((row) => row.querySelector(".bindset-name")?.textContent),
    ).toEqual([hostileName, "__proto__", "Master", selectorName]);
    expect(
      rows.map(
        (row) =>
          /** @type {HTMLInputElement | null} */ (
            row.querySelector(".bindset-custom-input")
          )?.value,
      ),
    ).toEqual([hostileName, "__proto__", "Master", selectorName]);
    expect(modal.querySelector("img")).toBeNull();
    expect(modal.querySelector(".attacker")).toBeNull();
  });

  it("restores enhanced mapping and custom-name drafts exactly", () => {
    const modal = createEnhancedKBFImportModal({
      document,
      translate,
      parseResult: parseResult(),
      draft: {
        mappings: [
          {
            bindsetName: hostileName,
            mappingType: "none",
            customName: '<svg id="draft-probe">',
          },
          {
            bindsetName: "Master",
            mappingType: "mapped",
            customName: "",
          },
          {
            bindsetName: "__proto__",
            mappingType: "primary",
            customName: "Prototype-safe",
          },
        ],
      },
    });
    const rows = [...modal.querySelectorAll(".bindset-row")];
    const byName = (name) => rows.find((row) => row.dataset.bindset === name);

    expect(
      /** @type {HTMLSelectElement | null} */ (
        byName(hostileName)?.querySelector(".bindset-mapping-select")
      )?.value,
    ).toBe("none");
    expect(
      /** @type {HTMLInputElement | null} */ (
        byName(hostileName)?.querySelector(".bindset-custom-input")
      )?.value,
    ).toBe('<svg id="draft-probe">');
    expect(
      /** @type {HTMLSelectElement | null} */ (
        byName("Master")?.querySelector(".bindset-mapping-select")
      )?.value,
    ).toBe("mapped");
    expect(
      /** @type {HTMLInputElement | null} */ (
        byName("Master")?.querySelector(".bindset-custom-input")
      )?.value,
    ).toBe("");
    expect(modal.querySelector("svg")).toBeNull();
  });

  it("captures ordered enhanced drafts through static row-relative queries", () => {
    const modal = createEnhancedKBFImportModal({
      document,
      translate,
      parseResult: parseResult(),
    });
    const rows = [...modal.querySelectorAll(".bindset-row")];
    const hostileRow = rows.find((row) => row.dataset.bindset === hostileName);
    const select = /** @type {HTMLSelectElement} */ (
      hostileRow?.querySelector(".bindset-mapping-select")
    );
    const input = /** @type {HTMLInputElement} */ (
      hostileRow?.querySelector(".bindset-custom-input")
    );
    select.value = "none";
    input.value = "changed";

    const draft = captureEnhancedKBFImportModalDraft(modal);

    expect(draft.mappings).toHaveLength(4);
    expect(draft.mappings?.[0]).toEqual({
      bindsetName: hostileName,
      mappingType: "none",
      customName: "changed",
    });
    expect(draft.mappings?.[1]?.bindsetName).toBe("__proto__");
  });

  it("moves the same custom input through row-local mapping transitions", () => {
    const modal = createEnhancedKBFImportModal({
      document,
      translate,
      parseResult: parseResult(),
    });
    const row = [...modal.querySelectorAll(".bindset-row")].find(
      (candidate) => candidate.dataset.bindset === hostileName,
    );
    const input = /** @type {HTMLInputElement} */ (
      row?.querySelector(".bindset-custom-input")
    );
    input.value = '<input id="value-probe">';
    const inputListener = vi.fn();
    input.addEventListener("input", inputListener);

    const select = /** @type {HTMLSelectElement} */ (
      row?.querySelector(".bindset-mapping-select")
    );
    select.value = "mapped";
    expect(
      projectEnhancedKBFImportModalRow(
        /** @type {HTMLTableRowElement} */ (row),
      ),
    ).toBe(true);
    const moved = row?.querySelector(
      ".bindset-custom-cell .bindset-custom-input",
    );
    expect(moved).toBe(input);
    expect(/** @type {HTMLInputElement} */ (moved).value).toBe(
      '<input id="value-probe">',
    );
    expect(
      row?.querySelector(".bindset-type-cell")?.getAttribute("colspan"),
    ).toBeNull();
    expect(row?.querySelector(".bindset-custom-cell")?.dataset.bindset).toBe(
      hostileName,
    );
    moved?.dispatchEvent(new Event("input"));
    expect(inputListener).toHaveBeenCalledOnce();
    expect(captureEnhancedKBFImportModalDraft(modal).mappings?.[0]).toEqual({
      bindsetName: hostileName,
      mappingType: "mapped",
      customName: '<input id="value-probe">',
    });

    select.value = "primary";
    expect(
      projectEnhancedKBFImportModalRow(
        /** @type {HTMLTableRowElement} */ (row),
      ),
    ).toBe(true);
    expect(row?.querySelector(".bindset-custom-cell")).toBeNull();
    expect(row?.querySelector(".bindset-custom-container input")).toBe(input);
    expect(
      row?.querySelector(".bindset-type-cell")?.getAttribute("colspan"),
    ).toBe("2");
    expect(modal.querySelector("#value-probe")).toBeNull();
  });

  it("defaults the single modal to Master and translates both badge and keys", () => {
    const translateSpy = vi.fn(translate);
    const modal = createSingleKBFImportModal({
      document,
      translate: translateSpy,
      parseResult: parseResult(),
    });
    const checked = /** @type {HTMLInputElement | null} */ (
      modal.querySelector(".single-bindset-radio:checked")
    );
    const selected = modal.querySelectorAll(".single-bindset-option.selected");

    expect(modal.className).toBe(
      "modal import-modal single-bindset-selection medium-modal",
    );
    expect(checked?.value).toBe("Master");
    expect(selected).toHaveLength(1);
    expect(selected[0]?.dataset.bindset).toBe("Master");
    expect(modal.querySelector(".single-bindset-badge")?.textContent).toBe(
      "Primary",
    );
    expect(modal.querySelector(".single-bindset-count")?.textContent).toBe(
      "4 translated keys",
    );
    expect(translateSpy).toHaveBeenCalledWith("primary_label");
    expect(translateSpy).toHaveBeenCalledWith("keys");
    expect(modal.querySelector("img")).toBeNull();
  });

  it("restores and captures a hostile single-bindset selection", () => {
    const modal = createSingleKBFImportModal({
      document,
      translate,
      parseResult: parseResult(),
      draft: { selectedBindsetName: hostileName },
    });
    const radios = /** @type {HTMLInputElement[]} */ ([
      ...modal.querySelectorAll(".single-bindset-radio"),
    ]);

    expect(radios.find((radio) => radio.checked)?.value).toBe(hostileName);
    expect(captureSingleKBFImportModalDraft(modal)).toEqual({
      selectedBindsetName: hostileName,
    });

    radios[0].checked = false;
    radios[1].checked = true;
    projectSingleKBFImportModalSelection(modal);

    expect(captureSingleKBFImportModalDraft(modal)).toEqual({
      selectedBindsetName: "__proto__",
    });
    expect(
      [...modal.querySelectorAll(".single-bindset-option.selected")].map(
        (option) => option.dataset.bindset,
      ),
    ).toEqual(["__proto__"]);
  });

  it("uses the first bindset when neither a valid draft nor Master exists", () => {
    const result = parseResult();
    result.bindsetNames = [hostileName, selectorName];
    const modal = createSingleKBFImportModal({
      document,
      translate,
      parseResult: result,
      draft: { selectedBindsetName: "missing" },
    });

    expect(
      /** @type {HTMLInputElement | null} */ (
        modal.querySelector(".single-bindset-radio:checked")
      )?.value,
    ).toBe(hostileName);
  });
});
