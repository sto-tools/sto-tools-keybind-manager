import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ImportUI from "../../../src/js/components/ui/ImportUI.js";

const translations = {
  overwrite_confirm_title: "Confirm overwrite",
  overwrite_confirm_body_keys: "Replace the space keybinds",
  overwrite_confirm_body_aliases: "Replace all aliases",
  overwrite_all_action: "Overwrite all",
  cancel: "Cancel",
};

describe("ImportUI strategy modal factories", () => {
  let ui;

  beforeEach(() => {
    vi.useFakeTimers();
    ui = new ImportUI({
      document,
      i18n: {
        t: (key, params) => {
          if (key === "overwrite_counts") {
            return `Current: ${params.current} · Incoming: ${params.incoming}`;
          }
          return translations[key] ?? key;
        },
      },
    });
  });

  afterEach(() => {
    ui?.destroy();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("creates the environment prompt with all strategies and merge-safe default", () => {
    const modal = ui.createImportModal("space", "keybinds");
    const strategies = Array.from(
      modal.querySelectorAll('input[name="import-strategy"]'),
    );

    expect(strategies.map((input) => input.value)).toEqual([
      "merge_keep",
      "merge_overwrite",
      "overwrite_all",
    ]);
    expect(strategies.filter((input) => input.checked)).toHaveLength(1);
    expect(strategies.find((input) => input.checked)?.value).toBe("merge_keep");
  });

  it("creates the alias prompt with all strategies and merge-safe default", () => {
    const modal = ui.createAliasStrategyModal();
    const strategies = Array.from(
      modal.querySelectorAll('input[name="alias-import-strategy"]'),
    );

    expect(strategies.map((input) => input.value)).toEqual([
      "merge_keep",
      "merge_overwrite",
      "overwrite_all",
    ]);
    expect(strategies.filter((input) => input.checked)).toHaveLength(1);
    expect(strategies.find((input) => input.checked)?.value).toBe("merge_keep");
  });

  it.each([
    ["keys", "space", "Replace the space keybinds"],
    ["aliases", null, "Replace all aliases"],
  ])(
    "projects the %s overwrite warning and counts",
    (type, environment, body) => {
      const modal = ui.createOverwriteConfirmationModal(
        type,
        5,
        3,
        environment,
      );

      expect(modal.textContent).toContain("Confirm overwrite");
      expect(modal.textContent).toContain(body);
      expect(modal.textContent).toContain("Current: 5 · Incoming: 3");
      expect(modal.textContent).toContain("Overwrite all");
    },
  );

  it("retains the large enhanced KBF configuration view", () => {
    const modal = ui.createEnhancedBindsetSelectionModal({
      valid: true,
      bindsetNames: ["Master", "Ground"],
      bindsetKeyCounts: { Master: 5, Ground: 3 },
    });

    expect(modal.classList.contains("enhanced-bindset-selection")).toBe(true);
    expect(modal.classList.contains("large-modal")).toBe(true);
  });

  it("keeps retired progress and basic bindset modal APIs absent", () => {
    for (const method of [
      "showProgressModal",
      "hideProgressModal",
      "createProgressModal",
      "regenerateProgressModal",
      "promptBindsetSelection",
      "createBindsetSelectionModal",
      "regenerateBindsetSelectionModal",
    ]) {
      expect(
        /** @type {Record<string, unknown>} */ (ui)[method],
      ).toBeUndefined();
    }
  });
});
