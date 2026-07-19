import { describe, expect, it, vi } from "vitest";

import {
  captureAliasStrategyModalDraft,
  captureEnvironmentImportModalDraft,
  createAliasStrategyModal,
  createEnvironmentImportModal,
  createOverwriteConfirmationModal,
} from "../../../src/js/components/ui/importDecisionModalDom.js";

const translations = {
  alias_file_too_large: "Alias file too large",
  cancel: "Cancel",
  ground: "Ground",
  import: "Import",
  import_environment: "Import Environment",
  import_environment_question: "Where should this import be applied?",
  import_strategy: "Import Strategy",
  merge_keep_existing: "Keep existing",
  merge_overwrite_existing: "Replace conflicts",
  overwrite_all: "Replace everything",
  overwrite_all_action: "Overwrite all",
  overwrite_all_description_aliases: "Replace all aliases",
  overwrite_all_description_kbf_bindsets: "Replace selected bindsets",
  overwrite_all_description_kbf_primary: "Replace the primary bindset",
  overwrite_all_description_keybinds: "Replace environment keybinds",
  overwrite_confirm_body_aliases: "Replace all existing aliases?",
  overwrite_confirm_body_keys: "Replace existing keybinds?",
  overwrite_confirm_title: "Confirm overwrite",
  space: "Space",
};

/** @param {string} key @param {Record<string, unknown>} [params] */
function translate(key, params) {
  if (key === "overwrite_counts") {
    return `Current: ${params?.current}; incoming: ${params?.incoming}`;
  }
  return translations[key] ?? `missing:${key}`;
}

/** @param {ParentNode} modal @param {string} name */
function strategies(modal, name) {
  return /** @type {HTMLInputElement[]} */ (
    Array.from(modal.querySelectorAll(`input[name="${name}"]`))
  );
}

describe("importDecisionModalDom", () => {
  it.each([
    ["keybinds", {}, "Replace environment keybinds"],
    ["aliases", {}, "Replace all aliases"],
    ["kbf", { bindsetsEnabled: true }, "Replace selected bindsets"],
    ["kbf", { bindsetsEnabled: false }, "Replace the primary bindset"],
  ])(
    "builds the %s environment prompt with its contextual warning",
    (importType, additionalContext, warning) => {
      const modal = createEnvironmentImportModal({
        document,
        translate,
        defaultEnv: "ground",
        importType,
        additionalContext,
      });
      const choices = strategies(modal, "import-strategy");

      expect(modal.className).toBe("modal import-modal");
      expect(modal.querySelector(".modal-content")?.children).toHaveLength(3);
      expect(modal.querySelector(".modal-header h3")?.textContent).toContain(
        "Import Environment",
      );
      expect(choices.map(({ value }) => value)).toEqual([
        "merge_keep",
        "merge_overwrite",
        "overwrite_all",
      ]);
      expect(choices.filter(({ checked }) => checked)).toHaveLength(1);
      expect(choices.find(({ checked }) => checked)?.value).toBe("merge_keep");
      expect(modal.querySelector(".strategy-description")?.textContent).toBe(
        warning,
      );
      expect(modal.querySelector(".import-space")?.className).toBe(
        "btn btn-primary import-space btn-secondary",
      );
      expect(modal.querySelector(".import-ground")?.className).toBe(
        "btn btn-primary import-ground btn-primary",
      );
      expect(modal.querySelector(".import-cancel")?.textContent).toBe("Cancel");
    },
  );

  it("restores and captures a non-default environment strategy", () => {
    const modal = createEnvironmentImportModal({
      document,
      translate,
      defaultEnv: "space",
      draft: { selectedStrategy: "merge_overwrite" },
    });
    const choices = strategies(modal, "import-strategy");

    expect(choices.find(({ checked }) => checked)?.value).toBe(
      "merge_overwrite",
    );
    choices.find(({ value }) => value === "overwrite_all").checked = true;
    expect(captureEnvironmentImportModalDraft(modal)).toEqual({
      selectedStrategy: "overwrite_all",
    });
  });

  it("builds, restores, and captures the alias strategy prompt", () => {
    const defaultModal = createAliasStrategyModal({ document, translate });
    expect(
      strategies(defaultModal, "alias-import-strategy").find(
        ({ checked }) => checked,
      )?.value,
    ).toBe("merge_keep");

    const modal = createAliasStrategyModal({
      document,
      translate,
      draft: { selectedStrategy: "overwrite_all" },
    });
    const choices = strategies(modal, "alias-import-strategy");

    expect(modal.className).toBe("modal import-modal");
    expect(modal.querySelector(".modal-header h3")?.textContent).toContain(
      "Import Strategy",
    );
    expect(choices.map(({ value }) => value)).toEqual([
      "merge_keep",
      "merge_overwrite",
      "overwrite_all",
    ]);
    expect(choices.find(({ checked }) => checked)?.value).toBe("overwrite_all");
    expect(modal.querySelector(".alias-strategy-confirm")?.textContent).toBe(
      "Import",
    );
    choices.find(({ value }) => value === "merge_overwrite").checked = true;
    expect(captureAliasStrategyModalDraft(modal)).toEqual({
      selectedStrategy: "merge_overwrite",
    });
  });

  it.each([
    ["keys", "space", "Replace existing keybinds?"],
    ["aliases", null, "Replace all existing aliases?"],
  ])(
    "projects the %s overwrite warning and counts",
    (type, environment, body) => {
      const modal = createOverwriteConfirmationModal({
        document,
        translate,
        type,
        current: 5,
        incoming: 3,
        environment,
      });

      expect(modal.className).toBe("modal import-modal");
      expect(modal.querySelector(".modal-header h3")?.textContent).toContain(
        "Confirm overwrite",
      );
      expect(modal.querySelector(".modal-body p")?.textContent).toBe(body);
      expect(modal.querySelector(".modal-body strong")?.textContent).toBe(
        "Current: 5; incoming: 3",
      );
      expect(modal.querySelector(".overwrite-confirm-yes")?.textContent).toBe(
        "Overwrite all",
      );
    },
  );

  it("keeps custom messages and translated copy inert", () => {
    const customMessage = '<img id="custom-message-payload" src="x">';
    const hostileTranslate = vi.fn((key, params) =>
      key === "overwrite_confirm_title"
        ? '<svg id="translation-payload"></svg>'
        : translate(key, params),
    );
    const modal = createOverwriteConfirmationModal({
      document,
      translate: hostileTranslate,
      type: "aliases",
      current: 9,
      incoming: 1,
      customMessage,
    });

    expect(modal.querySelector("img")).toBeNull();
    expect(modal.querySelector("svg")).toBeNull();
    expect(modal.querySelector(".modal-header h3")?.textContent).toContain(
      '<svg id="translation-payload"></svg>',
    );
    expect(modal.querySelector(".modal-body p")?.textContent).toBe(
      customMessage,
    );
    expect(modal.querySelector(".modal-body strong")).toBeNull();
    expect(hostileTranslate).not.toHaveBeenCalledWith(
      "overwrite_counts",
      expect.anything(),
    );
  });

  it("keeps hostile strategy translations inert in every prompt", () => {
    const payload = '<img id="strategy-translation-payload" src="x">';
    const hostileTranslate = (key, params) =>
      key === "merge_keep_existing" ? payload : translate(key, params);
    const environment = createEnvironmentImportModal({
      document,
      translate: hostileTranslate,
      defaultEnv: "space",
    });
    const alias = createAliasStrategyModal({
      document,
      translate: hostileTranslate,
    });

    expect(environment.querySelector("img")).toBeNull();
    expect(alias.querySelector("img")).toBeNull();
    expect(
      environment.querySelector(".import-strategy-option span")?.textContent,
    ).toBe(payload);
    expect(
      alias.querySelector(".import-strategy-option span")?.textContent,
    ).toBe(payload);
  });
});
