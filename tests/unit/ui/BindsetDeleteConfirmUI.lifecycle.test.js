import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ModalManagerService from "../../../src/js/components/services/ModalManagerService.js";
import BindsetDeleteConfirmUI from "../../../src/js/components/ui/BindsetDeleteConfirmUI.js";
import { createRealEventBusFixture } from "../../fixtures/core/eventBus.js";

function createModalManager() {
  const callbacks = new Map();
  return {
    callbacks,
    show: vi.fn(),
    hide: vi.fn(),
    registerRegenerateCallback: vi.fn((modalId, callback) => {
      callbacks.set(modalId, callback);
    }),
    unregisterRegenerateCallback: vi.fn((modalId, expectedCallback) => {
      if (expectedCallback && callbacks.get(modalId) !== expectedCallback) {
        return;
      }
      callbacks.delete(modalId);
    }),
  };
}

function createUi(options = {}) {
  return new BindsetDeleteConfirmUI({
    document,
    i18n: {
      t: (key, params) =>
        params ? `${key}:${JSON.stringify(params)}` : `translated:${key}`,
    },
    modalManager: createModalManager(),
    ...options,
  });
}

function currentModal(targetDocument = document) {
  return targetDocument.getElementById("bindsetDeleteConfirmModal");
}

function enterConfirmation(modal) {
  const checkbox = modal.querySelector("#bindset-delete-confirm-checkbox");
  const input = modal.querySelector("#bindset-delete-confirm-input");
  checkbox.checked = true;
  checkbox.dispatchEvent(new Event("change", { bubbles: true }));
  input.value = "DELETE";
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("BindsetDeleteConfirmUI session lifecycle", () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.body.replaceChildren();
  });

  it.each([
    ["confirm", true],
    ["cancel", false],
    ["Escape", false],
  ])(
    "settles once and detaches every listener on %s",
    async (action, result) => {
      const addListener = vi.spyOn(document, "addEventListener");
      const removeListener = vi.spyOn(document, "removeEventListener");
      const ui = createUi();
      const manager = ui.modalManager;
      const resultPromise = ui.confirm("Tactical", 3);
      const modal = currentModal();
      const registeredCallback =
        manager.registerRegenerateCallback.mock.calls[0][1];
      const keydownHandler = addListener.mock.calls.find(
        ([eventName]) => eventName === "keydown",
      )[1];

      if (action === "confirm") {
        enterConfirmation(modal);
        modal.querySelector(".bindset-delete-confirm-btn").click();
      } else if (action === "cancel") {
        modal.querySelector(".bindset-delete-cancel-btn").click();
      } else {
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      }

      await expect(resultPromise).resolves.toBe(result);
      expect(ui.currentModal).toBeNull();
      expect(currentModal()).toBeNull();
      expect(manager.hide).toHaveBeenCalledOnce();
      expect(manager.hide).toHaveBeenCalledWith("bindsetDeleteConfirmModal");
      expect(manager.unregisterRegenerateCallback).toHaveBeenCalledWith(
        "bindsetDeleteConfirmModal",
        registeredCallback,
      );
      expect(removeListener).toHaveBeenCalledWith("keydown", keydownHandler);
      expect(manager.callbacks.size).toBe(0);

      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      modal.querySelector(".bindset-delete-cancel-btn").click();
      expect(manager.hide).toHaveBeenCalledOnce();
    },
  );

  it("preserves draft across regeneration without rebinding session listeners", async () => {
    const addListener = vi.spyOn(document, "addEventListener");
    const ui = createUi();
    const manager = ui.modalManager;
    const resultPromise = ui.confirm("Tactical", 5);
    const firstModal = currentModal();
    const oldCancel = firstModal.querySelector(".bindset-delete-cancel-btn");
    const checkbox = firstModal.querySelector(
      "#bindset-delete-confirm-checkbox",
    );
    const input = firstModal.querySelector("#bindset-delete-confirm-input");
    checkbox.checked = true;
    input.value = "DELETE";

    const regenerate = manager.callbacks.get("bindsetDeleteConfirmModal");
    regenerate();

    const replacement = currentModal();
    const replacementCheckbox = replacement.querySelector(
      "#bindset-delete-confirm-checkbox",
    );
    const replacementInput = replacement.querySelector(
      "#bindset-delete-confirm-input",
    );
    const replacementDelete = replacement.querySelector(
      ".bindset-delete-confirm-btn",
    );
    expect(replacement).not.toBe(firstModal);
    expect(replacementCheckbox.checked).toBe(true);
    expect(replacementInput.value).toBe("DELETE");
    expect(replacementInput.disabled).toBe(false);
    expect(replacementDelete.disabled).toBe(false);
    expect(manager.registerRegenerateCallback).toHaveBeenCalledOnce();
    expect(
      addListener.mock.calls.filter(([eventName]) => eventName === "keydown"),
    ).toHaveLength(1);

    oldCancel.click();
    expect(ui.currentModal?.modalElement).toBe(replacement);
    expect(manager.hide).not.toHaveBeenCalled();

    replacementDelete.click();
    await expect(resultPromise).resolves.toBe(true);
    expect(manager.hide).toHaveBeenCalledOnce();
  });

  it("cancels the predecessor before starting a replacement session", async () => {
    const addListener = vi.spyOn(document, "addEventListener");
    const removeListener = vi.spyOn(document, "removeEventListener");
    const ui = createUi();
    const manager = ui.modalManager;
    const predecessor = ui.confirm("First", 1);
    const firstModal = currentModal();
    const firstCallback = manager.callbacks.get("bindsetDeleteConfirmModal");
    const firstKeydown = addListener.mock.calls.find(
      ([eventName]) => eventName === "keydown",
    )[1];

    const replacement = ui.confirm("Second", 2);

    await expect(predecessor).resolves.toBe(false);
    expect(firstModal.isConnected).toBe(false);
    expect(removeListener).toHaveBeenCalledWith("keydown", firstKeydown);
    expect(manager.unregisterRegenerateCallback).toHaveBeenCalledWith(
      "bindsetDeleteConfirmModal",
      firstCallback,
    );
    expect(manager.callbacks.get("bindsetDeleteConfirmModal")).not.toBe(
      firstCallback,
    );
    expect(currentModal()?.textContent).toContain("Second");

    const replacementModal = currentModal();
    firstCallback();
    expect(currentModal()).toBe(replacementModal);

    expect(ui.cancelActiveConfirmation()).toBe(true);
    await expect(replacement).resolves.toBe(false);
    expect(manager.callbacks.size).toBe(0);
    expect(
      addListener.mock.calls.filter(([eventName]) => eventName === "keydown"),
    ).toHaveLength(2);
    expect(
      removeListener.mock.calls.filter(
        ([eventName]) => eventName === "keydown",
      ),
    ).toHaveLength(2);
  });

  it("supports owner cleanup followed by reuse without destroying the helper", async () => {
    const ui = createUi();
    const first = ui.confirm("First", 1);

    expect(ui.cancelActiveConfirmation()).toBe(true);
    await expect(first).resolves.toBe(false);
    expect(ui.cancelActiveConfirmation()).toBe(false);

    const second = ui.confirm("Second", 2);
    const modal = currentModal();
    enterConfirmation(modal);
    modal.querySelector(".bindset-delete-confirm-btn").click();
    await expect(second).resolves.toBe(true);
  });

  it("settles and releases the active session when destroyed", async () => {
    const removeListener = vi.spyOn(document, "removeEventListener");
    const ui = createUi();
    const manager = ui.modalManager;
    const resultPromise = ui.confirm("Tactical", 4);

    ui.destroy();

    await expect(resultPromise).resolves.toBe(false);
    expect(currentModal()).toBeNull();
    expect(manager.callbacks.size).toBe(0);
    expect(
      removeListener.mock.calls.some(([eventName]) => eventName === "keydown"),
    ).toBe(true);
  });

  it("settles when the shared modal manager dismisses it from the overlay", async () => {
    document.body.innerHTML =
      '<div id="modalOverlay" class="modal-overlay"></div>';
    const fixture = await createRealEventBusFixture();
    const i18n = {
      t: (key) => `translated:${key}`,
      on: vi.fn(),
      off: vi.fn(),
    };
    const manager = new ModalManagerService({
      eventBus: fixture.eventBus,
      i18n,
    });
    const ui = new BindsetDeleteConfirmUI({
      eventBus: fixture.eventBus,
      document,
      i18n,
      modalManager: manager,
    });

    try {
      manager.init();
      const result = ui.confirm("Tactical", 4);
      const modal = currentModal();
      const overlay = document.getElementById("modalOverlay");
      expect(modal?.classList).toContain("active");
      expect(overlay).toBeInstanceOf(HTMLElement);

      overlay?.click();

      await vi.waitFor(() => {
        expect(ui.currentModal).toBeNull();
      });
      await expect(result).resolves.toBe(false);
      expect(currentModal()).toBeNull();
      expect(
        manager.regenerateCallbacks.bindsetDeleteConfirmModal,
      ).toBeUndefined();
    } finally {
      ui.cancelActiveConfirmation();
      if (!ui.destroyed) ui.destroy();
      if (!manager.destroyed) manager.destroy();
      fixture.destroy();
    }
  });

  it("uses its injected document and preserves translated accessible markup", async () => {
    const injectedDocument = document.implementation.createHTMLDocument();
    const manager = createModalManager();
    const i18n = {
      t: vi.fn((key, params) =>
        params ? `${key}:${params.name}:${params.count}` : `translated:${key}`,
      ),
    };
    vi.stubGlobal("document", undefined);
    const ui = new BindsetDeleteConfirmUI({
      document: injectedDocument,
      i18n,
      modalManager: manager,
    });
    const resultPromise = ui.confirm("Tactical", 4);
    const modal = currentModal(injectedDocument);

    expect(modal.ownerDocument).toBe(injectedDocument);
    expect(
      modal.querySelector('label[for="bindset-delete-confirm-input"]'),
    ).not.toBeNull();
    expect(
      modal
        .querySelector("#bindset-delete-confirm-input")
        ?.getAttribute("placeholder"),
    ).toBe("DELETE");
    expect(
      modal.querySelector(".bindset-delete-confirm-btn")?.textContent,
    ).toContain("translated:delete");
    expect(i18n.t).toHaveBeenCalledWith("bindset_delete_warning", {
      name: "Tactical",
      count: 4,
    });

    ui.cancelActiveConfirmation();
    await expect(resultPromise).resolves.toBe(false);
  });
});
