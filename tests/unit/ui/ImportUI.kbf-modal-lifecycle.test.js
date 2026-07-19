import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ImportUI from "../../../src/js/components/ui/ImportUI.js";
import { createRealEventBusFixture } from "../../fixtures/core/eventBus.js";

const modalId = "enhancedBindsetSelectionModal";

/** @param {string[]} [names] */
function makeParseResult(names = ["Master", "Science"]) {
  return {
    valid: true,
    bindsets: {},
    bindsetNames: names,
    bindsetKeyCounts: Object.fromEntries(
      names.map((name, index) => [name, index + 2]),
    ),
    hasMasterBindset: names.includes("Master"),
    masterDisplayName: names.includes("Master") ? "Master" : "",
    metadata: {
      totalBindsets: names.length,
      estimatedSize: names.length * 2,
      hasAliases: false,
    },
    validation: { valid: true, errors: [], warnings: [] },
    singleBindsetFile: {
      isSingleBindset: names.length === 1,
      onlyBindsetIsMaster: names.length === 1 && names[0] === "Master",
      requiresBindsetSelection: names.length > 1,
    },
    requiresBindsetSelection: names.length > 1,
  };
}

function createModalManager() {
  const callbacks = new Map();
  return {
    callbacks,
    show: vi.fn(),
    hide: vi.fn(),
    registerRegenerateCallback: vi.fn((id, callback) => {
      callbacks.set(id, callback);
    }),
    unregisterRegenerateCallback: vi.fn((id, expectedCallback) => {
      if (expectedCallback && callbacks.get(id) !== expectedCallback) return;
      callbacks.delete(id);
    }),
  };
}

/** @param {HTMLElement} modal @param {string} name */
function bindsetRow(modal, name) {
  return [...modal.querySelectorAll(".bindset-row")].find(
    (row) => row.dataset.bindset === name,
  );
}

/**
 * @param {HTMLElement} modal
 * @param {string} name
 * @param {'primary' | 'mapped' | 'none'} mapping
 * @param {string} [destination]
 */
function setMapping(modal, name, mapping, destination) {
  const row = bindsetRow(modal, name);
  const select = row?.querySelector(".bindset-mapping-select");
  if (!(select instanceof HTMLSelectElement)) {
    throw new Error(`Missing mapping control for ${name}`);
  }
  select.value = mapping;
  select.dispatchEvent(new Event("change", { bubbles: true }));
  if (destination === undefined) return;
  const input = row?.querySelector(".bindset-custom-input");
  if (!(input instanceof HTMLInputElement)) {
    throw new Error(`Missing destination control for ${name}`);
  }
  input.value = destination;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

/** @param {Promise<unknown>} promise */
async function immediateSettlement(promise) {
  const pending = Symbol("pending");
  const value = await Promise.race([promise, Promise.resolve(pending)]);
  return value === pending ? { settled: false } : { settled: true, value };
}

describe("ImportUI KBF modal lifecycle", () => {
  let fixture;
  let manager;
  let ui;

  beforeEach(async () => {
    vi.stubGlobal("requestAnimationFrame", (callback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    document.body.replaceChildren();
    fixture = await createRealEventBusFixture();
    manager = createModalManager();
    ui = new ImportUI({
      eventBus: fixture.eventBus,
      document,
      modalManager: manager,
      i18n: { t: (key) => key },
    });
  });

  afterEach(() => {
    if (ui && !ui.destroyed) ui.destroy();
    fixture?.destroy();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.body.replaceChildren();
  });

  it("returns the exact enhanced configuration projected in the preview", async () => {
    const result = ui.promptEnhancedBindsetSelection(makeParseResult(), true);
    const modal = document.getElementById(modalId);
    if (!modal) throw new Error("Expected enhanced KBF modal");

    setMapping(modal, "Master", "none");
    setMapping(modal, "Science", "mapped", "Research");

    expect(modal.querySelector("#preview_content")?.textContent).toContain(
      "Research",
    );
    modal.querySelector(".enhanced-bindset-confirm")?.click();

    await expect(result).resolves.toEqual({
      selectedBindsets: ["Science"],
      bindsetMappings: { Science: "custom" },
      bindsetRenames: { Science: "Research" },
    });
  });

  it("keeps hostile enhanced names inert and confirms them selector-free", async () => {
    const injected = 'Science"><img id="enhanced-kbf-payload" src="x">';
    const selectorBreaker = 'Tactical"]:not(*)';
    const names = [injected, selectorBreaker];
    const result = ui.promptEnhancedBindsetSelection(
      makeParseResult(names),
      true,
    );
    const modal = document.getElementById(modalId);
    if (!modal) throw new Error("Expected enhanced KBF modal");

    expect(modal.querySelector("#enhanced-kbf-payload")).toBeNull();
    expect(
      [...modal.querySelectorAll(".bindset-name")].map(
        (element) => element.textContent,
      ),
    ).toEqual(names);
    expect(
      [...modal.querySelectorAll(".bindset-row")].map(
        (element) => element.dataset.bindset,
      ),
    ).toEqual(names);

    setMapping(modal, injected, "none");
    setMapping(modal, selectorBreaker, "mapped", "Safe destination");
    modal.querySelector(".enhanced-bindset-confirm")?.click();

    await expect(result).resolves.toEqual({
      selectedBindsets: [selectorBreaker],
      bindsetMappings: { [selectorBreaker]: "custom" },
      bindsetRenames: { [selectorBreaker]: "Safe destination" },
    });
  });

  it("keeps hostile single-mode names inert and confirms one canonical choice", async () => {
    const injected = 'Science"><img id="single-kbf-payload" src="x">';
    const selectorBreaker = "Tactical\\";
    const names = [injected, selectorBreaker];
    const result = ui.promptEnhancedBindsetSelection(
      makeParseResult(names),
      false,
    );
    const modal = document.getElementById(modalId);
    if (!modal) throw new Error("Expected single KBF modal");

    expect(modal.querySelector("#single-kbf-payload")).toBeNull();
    expect(
      [...modal.querySelectorAll(".single-bindset-name")].map(
        (element) => element.textContent,
      ),
    ).toEqual(names);
    modal.querySelectorAll(".single-bindset-option")[1]?.click();
    modal.querySelector(".single-bindset-confirm")?.click();

    await expect(result).resolves.toEqual({
      selectedBindsets: [selectorBreaker],
      bindsetMappings: { [selectorBreaker]: "primary" },
      bindsetRenames: {},
      singleBindsetMode: true,
    });
  });

  it("preserves draft and view state across repeated regeneration", async () => {
    const result = ui.promptEnhancedBindsetSelection(makeParseResult(), true);
    const predecessor = document.getElementById(modalId);
    if (!predecessor) throw new Error("Expected predecessor modal");
    predecessor.classList.add("active");
    setMapping(predecessor, "Master", "none");
    setMapping(predecessor, "Science", "mapped", "Draft destination");
    const firstInput = bindsetRow(predecessor, "Science")?.querySelector(
      ".bindset-custom-input",
    );
    const firstBody = predecessor.querySelector(".modal-body");
    if (!(firstInput instanceof HTMLInputElement) || !firstBody) {
      throw new Error("Expected predecessor view controls");
    }
    firstBody.scrollTop = 61;
    firstBody.scrollLeft = 7;
    firstInput.focus();
    firstInput.setSelectionRange(2, 7, "forward");
    const predecessorConfirm = predecessor.querySelector(
      ".enhanced-bindset-confirm",
    );
    const regenerate = manager.callbacks.get(modalId);
    if (!regenerate) throw new Error("Expected regeneration callback");

    regenerate();
    const replacement = document.getElementById(modalId);
    if (!replacement) throw new Error("Expected replacement modal");
    const replacementInput = bindsetRow(replacement, "Science")?.querySelector(
      ".bindset-custom-input",
    );
    const replacementBody = replacement.querySelector(".modal-body");
    expect(replacement).not.toBe(predecessor);
    expect(replacement.classList).toContain("active");
    expect(replacementInput).toBe(document.activeElement);
    expect(replacementInput?.value).toBe("Draft destination");
    expect(replacementInput?.selectionStart).toBe(2);
    expect(replacementInput?.selectionEnd).toBe(7);
    expect(replacementBody?.scrollTop).toBe(61);
    expect(replacementBody?.scrollLeft).toBe(7);

    predecessorConfirm?.click();
    expect(await immediateSettlement(result)).toEqual({ settled: false });
    if (!(replacementInput instanceof HTMLInputElement) || !replacementBody) {
      throw new Error("Expected replacement view controls");
    }
    replacementInput.value = "Final destination";
    replacementInput.dispatchEvent(new Event("input", { bubbles: true }));
    replacementInput.focus();
    replacementInput.setSelectionRange(1, 5, "backward");
    replacementBody.scrollTop = 83;
    replacementBody.scrollLeft = 11;
    const replacementConfirm = replacement.querySelector(
      ".enhanced-bindset-confirm",
    );

    regenerate();
    const successor = document.getElementById(modalId);
    const successorInput = successor
      ? bindsetRow(successor, "Science")?.querySelector(".bindset-custom-input")
      : null;
    expect(successor).not.toBe(replacement);
    expect(successor?.classList).toContain("active");
    expect(successorInput?.value).toBe("Final destination");
    expect(successorInput).toBe(document.activeElement);
    expect(successorInput?.selectionStart).toBe(1);
    expect(successorInput?.selectionEnd).toBe(5);
    expect(successorInput?.selectionDirection).toBe("backward");
    expect(successor?.querySelector(".modal-body")?.scrollTop).toBe(83);
    expect(successor?.querySelector(".modal-body")?.scrollLeft).toBe(11);

    replacementConfirm?.click();
    expect(await immediateSettlement(result)).toEqual({ settled: false });
    successor?.querySelector(".enhanced-bindset-confirm")?.click();
    await expect(result).resolves.toEqual({
      selectedBindsets: ["Science"],
      bindsetMappings: { Science: "custom" },
      bindsetRenames: { Science: "Final destination" },
    });
    expect(manager.registerRegenerateCallback).toHaveBeenCalledOnce();
    expect(manager.unregisterRegenerateCallback).toHaveBeenCalledWith(
      modalId,
      regenerate,
    );
  });

  it("ignores unsuccessful hidden notices and settles on a successful hide", async () => {
    const result = ui.promptEnhancedBindsetSelection(makeParseResult(), true);
    const regenerate = manager.callbacks.get(modalId);

    await fixture.eventBus.emit("modal:hidden", { modalId, success: false });
    expect(await immediateSettlement(result)).toEqual({ settled: false });
    expect(document.getElementById(modalId)).not.toBeNull();

    await fixture.eventBus.emit("modal:hidden", { modalId, success: true });
    await expect(result).resolves.toBeNull();
    expect(document.getElementById(modalId)).toBeNull();
    expect(manager.hide).not.toHaveBeenCalled();
    expect(manager.callbacks.size).toBe(0);
    expect(manager.unregisterRegenerateCallback).toHaveBeenCalledWith(
      modalId,
      regenerate,
    );
    expect(fixture.eventBus.hasListeners("modal:hidden")).toBe(false);
  });

  it("settles the active prompt on Escape and on component destruction", async () => {
    const escaped = ui.promptEnhancedBindsetSelection(makeParseResult(), true);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await expect(escaped).resolves.toBeNull();
    expect(document.getElementById(modalId)).toBeNull();

    const destroyed = ui.promptEnhancedBindsetSelection(
      makeParseResult(),
      true,
    );
    ui.destroy();
    await expect(destroyed).resolves.toBeNull();
    expect(document.getElementById(modalId)).toBeNull();
    expect(manager.callbacks.size).toBe(0);
  });

  it("cancels an overlapping predecessor and leaves its callback inert", async () => {
    const predecessor = ui.promptEnhancedBindsetSelection(
      makeParseResult(),
      true,
    );
    const predecessorModal = document.getElementById(modalId);
    const predecessorCallback = manager.callbacks.get(modalId);
    const replacement = ui.promptEnhancedBindsetSelection(
      makeParseResult(),
      true,
    );
    const replacementModal = document.getElementById(modalId);

    await expect(predecessor).resolves.toBeNull();
    expect(predecessorModal?.isConnected).toBe(false);
    expect(document.querySelectorAll(`#${modalId}`)).toHaveLength(1);
    predecessorCallback?.();
    expect(document.getElementById(modalId)).toBe(replacementModal);

    replacementModal?.querySelector(".enhanced-bindset-cancel")?.click();
    await expect(replacement).resolves.toBeNull();
  });
});
