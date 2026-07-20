import { describe, expect, it, vi } from "vitest";

describe("Bundled VFX catalog boundary", () => {
  it("renders and selects the imported catalog without publishing a global", async () => {
    expect("VFX_EFFECTS" in window).toBe(false);

    const vertigoButton = document.getElementById("vertigoBtn");
    const modal = document.getElementById("vertigoModal");
    const selectAll = document.getElementById("spaceSelectAll");
    const clearAll = document.getElementById("spaceClearAll");
    expect(vertigoButton).toBeInstanceOf(HTMLButtonElement);
    expect(modal).toBeInstanceOf(HTMLElement);
    expect(selectAll).toBeInstanceOf(HTMLButtonElement);
    expect(clearAll).toBeInstanceOf(HTMLButtonElement);
    if (
      !(vertigoButton instanceof HTMLButtonElement) ||
      !(modal instanceof HTMLElement) ||
      !(selectAll instanceof HTMLButtonElement) ||
      !(clearAll instanceof HTMLButtonElement)
    ) {
      return;
    }

    /** @type {HTMLInputElement[]} */
    let spaceCheckboxes = [];
    const initiallySelected = new Set();

    try {
      vertigoButton.click();
      await vi.waitFor(() => {
        expect(modal.classList).toContain("active");
        expect(
          document.querySelectorAll(
            '#spaceEffectsList input[data-environment="space"]',
          ),
        ).toHaveLength(233);
        expect(
          document.querySelectorAll(
            '#groundEffectsList input[data-environment="ground"]',
          ),
        ).toHaveLength(129);
      });

      spaceCheckboxes = /** @type {HTMLInputElement[]} */ (
        Array.from(
          document.querySelectorAll(
            '#spaceEffectsList input[data-environment="space"]',
          ),
        )
      );
      for (const checkbox of spaceCheckboxes) {
        if (checkbox.checked && checkbox.dataset.effect) {
          initiallySelected.add(checkbox.dataset.effect);
        }
      }

      selectAll.click();
      await vi.waitFor(() => {
        expect(spaceCheckboxes.every((checkbox) => checkbox.checked)).toBe(
          true,
        );
        expect(
          document.getElementById("spaceEffectCount")?.textContent,
        ).toContain("233");
      });
      expect("VFX_EFFECTS" in window).toBe(false);
    } finally {
      if (spaceCheckboxes.length > 0) {
        clearAll.click();
        for (const checkbox of spaceCheckboxes) {
          if (
            checkbox.dataset.effect &&
            initiallySelected.has(checkbox.dataset.effect)
          ) {
            checkbox.click();
          }
        }
      }
      document
        .querySelector('[data-modal="vertigoModal"].modal-close')
        ?.click();
    }
  });
});
