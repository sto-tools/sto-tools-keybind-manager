import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createAliasStrategyModal,
  createEnvironmentImportModal,
  createOverwriteConfirmationModal,
} from "../../../src/js/components/ui/importDecisionModalDom.js";
import ImportDecisionModalSession from "../../../src/js/components/ui/importDecisionModalSession.js";

/** @typedef {(message: { modalId: string, success: boolean }) => void} HiddenHandler */

/** @param {boolean | undefined} [showResult] */
function createManager(showResult) {
  /** @type {Map<string, () => boolean>} */
  const callbacks = new Map();
  return {
    callbacks,
    show: vi.fn(() => showResult),
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

/** @param {() => void} callback */
function immediateFrame(callback) {
  callback();
  return vi.fn();
}

/**
 * @param {{
 *   manager?: ReturnType<typeof createManager>,
 *   scheduleFrame?: (callback: () => void) => () => void,
 *   createEnvironmentModal?: ConstructorParameters<typeof ImportDecisionModalSession>[0]['createEnvironmentModal'],
 *   createAliasModal?: ConstructorParameters<typeof ImportDecisionModalSession>[0]['createAliasModal']
 * }} [options]
 */
function createHarness(options = {}) {
  const manager = options.manager ?? createManager();
  /** @type {Set<HiddenHandler>} */
  const hiddenHandlers = new Set();
  const hiddenDetachers = [];
  const translate = (key) => key;
  const createEnvironmentModal = vi.fn(
    options.createEnvironmentModal ??
      ((modalOptions, draft) =>
        createEnvironmentImportModal({
          document,
          translate,
          ...modalOptions,
          draft,
        })),
  );
  const createAliasModal = vi.fn(
    options.createAliasModal ??
      ((draft) => createAliasStrategyModal({ document, translate, draft })),
  );
  const createOverwriteModal = vi.fn((modalOptions) =>
    createOverwriteConfirmationModal({
      document,
      translate,
      ...modalOptions,
    }),
  );
  const subscribeModalHidden = vi.fn((handler) => {
    hiddenHandlers.add(handler);
    const detach = vi.fn(() => hiddenHandlers.delete(handler));
    hiddenDetachers.push(detach);
    return detach;
  });
  const scheduleFrame = vi.fn(options.scheduleFrame ?? immediateFrame);
  const session = new ImportDecisionModalSession({
    document,
    modalManager: manager,
    translate,
    subscribeModalHidden,
    scheduleFrame,
    createEnvironmentModal,
    createAliasModal,
    createOverwriteModal,
  });
  return {
    session,
    manager,
    hiddenHandlers,
    hiddenDetachers,
    createEnvironmentModal,
    createAliasModal,
    createOverwriteModal,
  };
}

/** @param {Promise<unknown>} promise */
async function immediateSettlement(promise) {
  const pending = Symbol("pending");
  const value = await Promise.race([promise, Promise.resolve(pending)]);
  return value === pending ? { settled: false } : { settled: true, value };
}

/** @param {ParentNode} modal @param {string} name @param {string} value */
function selectStrategy(modal, name, value) {
  const input = /** @type {HTMLInputElement | null} */ (
    modal.querySelector(`input[name="${name}"][value="${value}"]`)
  );
  if (!input) throw new Error(`Missing ${name} strategy ${value}`);
  input.checked = true;
  return input;
}

describe("ImportDecisionModalSession", () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("returns canonical environment, alias, and overwrite decisions", async () => {
    const harness = createHarness();
    const environment = harness.session.promptEnvironment("ground", "kbf", {
      bindsetsEnabled: false,
    });
    const environmentModal = document.getElementById("importModal");
    selectStrategy(environmentModal, "import-strategy", "overwrite_all");
    environmentModal?.querySelector(".import-ground")?.click();
    await expect(environment).resolves.toEqual({
      environment: "ground",
      strategy: "overwrite_all",
    });

    const alias = harness.session.promptAliasStrategy();
    const aliasModal = document.getElementById("aliasStrategyModal");
    selectStrategy(aliasModal, "alias-import-strategy", "merge_overwrite");
    aliasModal?.querySelector(".alias-strategy-confirm")?.click();
    await expect(alias).resolves.toBe("merge_overwrite");

    const confirmed = harness.session.showOverwriteConfirmation(
      "keys",
      4,
      2,
      "space",
    );
    document
      .getElementById("overwriteConfirmModal")
      ?.querySelector(".overwrite-confirm-yes")
      ?.click();
    await expect(confirmed).resolves.toBe(true);

    const declined = harness.session.showOverwriteConfirmation("aliases", 4, 2);
    document
      .getElementById("overwriteConfirmModal")
      ?.querySelector(".overwrite-confirm-no")
      ?.click();
    await expect(declined).resolves.toBe(false);
  });

  it("preserves environment draft, active state, focus, selection, and scroll across regeneration", async () => {
    const createEnvironmentModal = (modalOptions, draft) => {
      const modal = createEnvironmentImportModal({
        document,
        translate: (key) => key,
        ...modalOptions,
        draft,
      });
      const selectionInput = document.createElement("input");
      selectionInput.name = "import-strategy";
      selectionInput.type = "text";
      selectionInput.value = "selection source";
      modal.querySelector(".modal-body")?.prepend(selectionInput);
      return modal;
    };
    const harness = createHarness({ createEnvironmentModal });
    const result = harness.session.promptEnvironment("space", "aliases");
    const predecessor = /** @type {HTMLDivElement} */ (
      document.getElementById("importModal")
    );
    predecessor.classList.add("active");
    selectStrategy(predecessor, "import-strategy", "merge_overwrite");
    const body = /** @type {HTMLElement} */ (
      predecessor.querySelector(".modal-body")
    );
    body.scrollTop = 31;
    body.scrollLeft = 7;
    const selectionInput = /** @type {HTMLInputElement} */ (
      predecessor.querySelector('input[type="text"]')
    );
    selectionInput.focus();
    selectionInput.setSelectionRange(2, 9, "backward");
    const staleGround = predecessor.querySelector(".import-ground");
    const callback = harness.manager.callbacks.get("importModal");

    expect(callback?.()).toBe(true);
    const replacement = /** @type {HTMLDivElement} */ (
      document.getElementById("importModal")
    );
    const replacementInput = /** @type {HTMLInputElement} */ (
      replacement.querySelector('input[type="text"]')
    );
    expect(replacement).not.toBe(predecessor);
    expect(replacement.classList).toContain("active");
    expect(
      replacement.querySelector('input[value="merge_overwrite"]:checked'),
    ).not.toBeNull();
    expect(replacement.querySelector(".modal-body")?.scrollTop).toBe(31);
    expect(replacement.querySelector(".modal-body")?.scrollLeft).toBe(7);
    expect(document.activeElement).toBe(replacementInput);
    expect(replacementInput.selectionStart).toBe(2);
    expect(replacementInput.selectionEnd).toBe(9);
    expect(replacementInput.selectionDirection).toBe("backward");

    staleGround?.click();
    expect(await immediateSettlement(result)).toEqual({ settled: false });
    replacement.querySelector(".import-space")?.click();
    await expect(result).resolves.toEqual({
      environment: "space",
      strategy: "merge_overwrite",
    });
  });

  it("preserves a non-default alias strategy across regeneration", async () => {
    const harness = createHarness();
    const result = harness.session.promptAliasStrategy();
    const predecessor = /** @type {HTMLDivElement} */ (
      document.getElementById("aliasStrategyModal")
    );
    const staleConfirm = predecessor.querySelector(".alias-strategy-confirm");
    selectStrategy(predecessor, "alias-import-strategy", "overwrite_all");

    expect(harness.manager.callbacks.get("aliasStrategyModal")?.()).toBe(true);
    const replacement = document.getElementById("aliasStrategyModal");
    expect(
      replacement?.querySelector('input[value="overwrite_all"]:checked'),
    ).not.toBeNull();
    staleConfirm?.click();
    expect(await immediateSettlement(result)).toEqual({ settled: false });
    replacement?.querySelector(".alias-strategy-confirm")?.click();
    await expect(result).resolves.toBe("overwrite_all");
  });

  it("regenerates an active overwrite prompt with its custom message intact", async () => {
    const harness = createHarness();
    const customMessage = "Keep this exact overwrite warning";
    const result = harness.session.showOverwriteConfirmation(
      "keys",
      8,
      3,
      "ground",
      customMessage,
    );
    const predecessor = /** @type {HTMLDivElement} */ (
      document.getElementById("overwriteConfirmModal")
    );
    predecessor.classList.add("active");
    const staleConfirm = predecessor.querySelector(".overwrite-confirm-yes");

    expect(harness.manager.callbacks.get("overwriteConfirmModal")?.()).toBe(
      true,
    );
    const replacement = document.getElementById("overwriteConfirmModal");
    expect(replacement).not.toBe(predecessor);
    expect(replacement?.classList).toContain("active");
    expect(replacement?.querySelector(".modal-body p")?.textContent).toBe(
      customMessage,
    );
    expect(replacement?.querySelector(".modal-body strong")).toBeNull();

    staleConfirm?.click();
    expect(await immediateSettlement(result)).toEqual({ settled: false });
    replacement?.querySelector(".overwrite-confirm-yes")?.click();
    await expect(result).resolves.toBe(true);
  });

  it("removes every owned DOM listener and unregisters the exact callback once", async () => {
    const nativeAdd = EventTarget.prototype.addEventListener;
    const nativeRemove = EventTarget.prototype.removeEventListener;
    const added = [];
    const removed = [];
    vi.spyOn(EventTarget.prototype, "addEventListener").mockImplementation(
      function (type, listener, options) {
        added.push({ target: this, type, listener });
        nativeAdd.call(this, type, listener, options);
      },
    );
    vi.spyOn(EventTarget.prototype, "removeEventListener").mockImplementation(
      function (type, listener, options) {
        removed.push({ target: this, type, listener });
        nativeRemove.call(this, type, listener, options);
      },
    );
    const harness = createHarness();
    const result = harness.session.promptEnvironment();
    const modal = document.getElementById("importModal");
    const callback = harness.manager.callbacks.get("importModal");
    const registrations = added.filter(
      ({ target }) => target === modal || target === document,
    );
    const staleCancel = modal?.querySelector(".import-cancel");

    expect(registrations.map(({ type }) => type).sort()).toEqual([
      "click",
      "keydown",
    ]);
    staleCancel?.click();
    await expect(result).resolves.toBeNull();
    for (const registration of registrations) {
      expect(
        removed.filter(
          (candidate) =>
            candidate.target === registration.target &&
            candidate.type === registration.type &&
            candidate.listener === registration.listener,
        ),
      ).toHaveLength(1);
    }
    expect(harness.hiddenDetachers[0]).toHaveBeenCalledOnce();
    expect(harness.manager.unregisterRegenerateCallback).toHaveBeenCalledWith(
      "importModal",
      callback,
    );
    expect(harness.manager.unregisterRegenerateCallback).toHaveBeenCalledOnce();
    expect(harness.manager.hide).toHaveBeenCalledOnce();

    staleCancel?.click();
    expect(harness.manager.hide).toHaveBeenCalledOnce();
    expect(harness.manager.unregisterRegenerateCallback).toHaveBeenCalledOnce();
  });

  it("ignores unsuccessful hidden notices and consumes a successful one", async () => {
    const harness = createHarness();
    const result = harness.session.showOverwriteConfirmation("aliases", 2, 3);
    const handler = [...harness.hiddenHandlers][0];

    handler?.({ modalId: "overwriteConfirmModal", success: false });
    expect(await immediateSettlement(result)).toEqual({ settled: false });
    expect(document.getElementById("overwriteConfirmModal")).not.toBeNull();

    handler?.({ modalId: "overwriteConfirmModal", success: true });
    await expect(result).resolves.toBe(false);
    expect(harness.manager.hide).not.toHaveBeenCalled();
    expect(harness.hiddenHandlers.size).toBe(0);
    expect(harness.manager.callbacks.size).toBe(0);
  });

  it("settles from Escape and makes destroy idempotent", async () => {
    const harness = createHarness();
    const escaped = harness.session.promptEnvironment();

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(await immediateSettlement(escaped)).toEqual({ settled: false });
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await expect(escaped).resolves.toBeNull();

    const destroyed = harness.session.showOverwriteConfirmation(
      "aliases",
      1,
      1,
    );
    harness.session.destroy();
    harness.session.destroy();
    await expect(destroyed).resolves.toBe(false);
    expect(harness.manager.hide).toHaveBeenCalledTimes(2);
    expect(harness.manager.unregisterRegenerateCallback).toHaveBeenCalledTimes(
      2,
    );
  });

  it("settles an overlapping predecessor and makes its node and callback inert", async () => {
    const harness = createHarness();
    const predecessor = harness.session.promptEnvironment();
    const predecessorModal = document.getElementById("importModal");
    const predecessorCallback = harness.manager.callbacks.get("importModal");
    const staleGround = predecessorModal?.querySelector(".import-ground");
    const replacement = harness.session.promptAliasStrategy();
    const replacementModal = document.getElementById("aliasStrategyModal");

    await expect(predecessor).resolves.toBeNull();
    expect(predecessorModal?.isConnected).toBe(false);
    expect(predecessorCallback?.()).toBe(false);
    staleGround?.click();
    expect(document.getElementById("aliasStrategyModal")).toBe(
      replacementModal,
    );
    expect(await immediateSettlement(replacement)).toEqual({ settled: false });

    replacementModal?.querySelector(".alias-strategy-cancel")?.click();
    await expect(replacement).resolves.toBeNull();
  });

  it.each([
    ["environment", null],
    ["alias", null],
    ["overwrite", false],
  ])(
    "settles a failed %s show with its cancellation value",
    async (kind, value) => {
      const manager = createManager(false);
      const harness = createHarness({ manager });
      const result =
        kind === "environment"
          ? harness.session.promptEnvironment()
          : kind === "alias"
            ? harness.session.promptAliasStrategy()
            : harness.session.showOverwriteConfirmation("aliases", 1, 2);

      await expect(result).resolves.toBe(value);
      expect(manager.show).toHaveBeenCalledOnce();
      expect(manager.hide).not.toHaveBeenCalled();
      expect(manager.callbacks.size).toBe(0);
      expect(harness.hiddenHandlers.size).toBe(0);
    },
  );

  it("cancels a scheduled show and keeps its late callback inert", async () => {
    let scheduledCallback = () => {};
    const cancelScheduled = vi.fn();
    const scheduleFrame = vi.fn((callback) => {
      scheduledCallback = callback;
      return cancelScheduled;
    });
    const harness = createHarness({ scheduleFrame });
    const result = harness.session.promptAliasStrategy();

    expect(harness.manager.show).not.toHaveBeenCalled();
    expect(harness.session.cancelActiveSession()).toBe(true);
    await expect(result).resolves.toBeNull();
    expect(cancelScheduled).toHaveBeenCalledOnce();

    scheduledCallback();
    expect(harness.manager.show).not.toHaveBeenCalled();
    expect(document.getElementById("aliasStrategyModal")).toBeNull();
  });
});
