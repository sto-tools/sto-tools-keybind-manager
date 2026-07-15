import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import InputDialogUI from "../../../src/js/components/ui/InputDialogUI.js";
import eventBus from "../../../src/js/core/eventBus.js";

describe("InputDialogUI", () => {
  let modalManager;
  let ui;

  beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", (callback) => callback());
    eventBus.clear();
    modalManager = {
      show: vi.fn(),
      hide: vi.fn(),
      registerRegenerateCallback: vi.fn(),
      unregisterRegenerateCallback: vi.fn(),
    };
    ui = new InputDialogUI({
      eventBus,
      modalManager,
      i18n: { t: (key) => (key === "invalid_input" ? "Invalid input" : key) },
    });
  });

  afterEach(() => {
    ui.destroy();
    eventBus.clear();
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("submits a valid value through the shared modal controls", async () => {
    const resultPromise = ui.prompt("Choose a name", {
      validate: (value) => value.length > 0 || "Name is required",
    });
    const input = /** @type {HTMLInputElement} */ (
      document.querySelector(".input-field")
    );
    const submit = /** @type {HTMLButtonElement} */ (
      document.querySelector(".input-submit")
    );

    input.value = "Enterprise";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    submit.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    await expect(resultPromise).resolves.toBe("Enterprise");
    expect(modalManager.hide).toHaveBeenCalledWith("inputModal");
  });

  it("shows validation errors without closing the modal", async () => {
    const resultPromise = ui.prompt("Choose a name", {
      defaultValue: "bad",
      validate: () => "Name is unavailable",
    });
    const submit = /** @type {HTMLButtonElement} */ (
      document.querySelector(".input-submit")
    );
    const cancel = /** @type {HTMLButtonElement} */ (
      document.querySelector(".input-cancel")
    );
    const error = /** @type {HTMLElement} */ (
      document.querySelector(".input-error")
    );

    submit.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(error.textContent).toBe("Name is unavailable");
    expect(error.style.display).toBe("block");
    expect(modalManager.hide).not.toHaveBeenCalled();

    cancel.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await expect(resultPromise).resolves.toBeNull();
  });

  it("preserves the current value and behavior when regenerated", async () => {
    const resultPromise = ui.prompt("Choose a name", {
      defaultValue: "Initial",
    });
    const currentInput = /** @type {HTMLInputElement} */ (
      document.querySelector(".input-field")
    );
    currentInput.value = "Regenerated";

    ui.regenerateInputModal();

    const regeneratedInput = /** @type {HTMLInputElement} */ (
      document.querySelector(".input-field")
    );
    const regeneratedSubmit = /** @type {HTMLButtonElement} */ (
      document.querySelector(".input-submit")
    );
    expect(regeneratedInput.value).toBe("Regenerated");

    regeneratedSubmit.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await expect(resultPromise).resolves.toBe("Regenerated");
  });
});
