import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createEnhancedKBFImportModal,
  createSingleKBFImportModal,
} from "../../../src/js/components/ui/kbfImportModalDom.js";
import KBFImportModalSession from "../../../src/js/components/ui/kbfImportModalSession.js";

const modalId = "enhancedBindsetSelectionModal";

function makeParseResult() {
  return {
    valid: true,
    bindsets: {},
    bindsetNames: ["Master", "Science"],
    bindsetKeyCounts: { Master: 3, Science: 2 },
    hasMasterBindset: true,
    masterDisplayName: "Master",
    metadata: { totalBindsets: 2, estimatedSize: 5, hasAliases: false },
    validation: { valid: true, errors: [], warnings: [] },
    singleBindsetFile: {
      isSingleBindset: false,
      onlyBindsetIsMaster: false,
      requiresBindsetSelection: true,
    },
    requiresBindsetSelection: true,
  };
}

/** @param {boolean | undefined} [showResult] */
function createManager(showResult) {
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
 *   scheduleFrame?: (callback: () => void) => () => void
 * }} [options]
 */
function createHarness(options = {}) {
  const manager = options.manager ?? createManager();
  const hiddenHandlers = new Set();
  const hiddenDetachers = [];
  const createEnhancedModal = vi.fn((parseResult, draft) =>
    createEnhancedKBFImportModal({
      document,
      translate: (key) => key,
      parseResult,
      draft,
    }),
  );
  const createSingleModal = vi.fn((parseResult, draft) =>
    createSingleKBFImportModal({
      document,
      translate: (key) => key,
      parseResult,
      draft,
    }),
  );
  const subscribeModalHidden = vi.fn((handler) => {
    hiddenHandlers.add(handler);
    const detach = vi.fn(() => hiddenHandlers.delete(handler));
    hiddenDetachers.push(detach);
    return detach;
  });
  const scheduleFrame = vi.fn(options.scheduleFrame ?? immediateFrame);
  const session = new KBFImportModalSession({
    document,
    modalManager: manager,
    translate: (key) => key,
    createEnhancedModal,
    createSingleModal,
    subscribeModalHidden,
    scheduleFrame,
  });
  return {
    session,
    manager,
    hiddenHandlers,
    hiddenDetachers,
    createEnhancedModal,
    createSingleModal,
    scheduleFrame,
  };
}

/** @param {Promise<unknown>} promise */
async function immediateSettlement(promise) {
  const pending = Symbol("pending");
  const value = await Promise.race([promise, Promise.resolve(pending)]);
  return value === pending ? { settled: false } : { settled: true, value };
}

describe("KBFImportModalSession", () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("removes every owned DOM listener and exact callback once", async () => {
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
    const result = harness.session.prompt(makeParseResult(), true);
    const modal = document.getElementById(modalId);
    const callback = harness.manager.callbacks.get(modalId);
    const registrations = added.filter(
      ({ target }) => target === modal || target === document,
    );
    const staleCancel = modal?.querySelector(".enhanced-bindset-cancel");

    expect(registrations.map(({ type }) => type).sort()).toEqual([
      "change",
      "click",
      "input",
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
    expect(harness.manager.unregisterRegenerateCallback).toHaveBeenCalledOnce();
    expect(harness.manager.unregisterRegenerateCallback).toHaveBeenCalledWith(
      modalId,
      callback,
    );
    expect(harness.manager.hide).toHaveBeenCalledOnce();
    expect(modal?.isConnected).toBe(false);

    staleCancel?.click();
    expect(harness.manager.hide).toHaveBeenCalledOnce();
    expect(harness.manager.unregisterRegenerateCallback).toHaveBeenCalledOnce();
  });

  it("ignores unsuccessful hidden notices and consumes a successful one", async () => {
    const harness = createHarness();
    const result = harness.session.prompt(makeParseResult(), true);
    const handler = [...harness.hiddenHandlers][0];

    handler?.({ modalId, success: false });
    expect(await immediateSettlement(result)).toEqual({ settled: false });
    expect(document.getElementById(modalId)).not.toBeNull();

    handler?.({ modalId, success: true });
    await expect(result).resolves.toBeNull();
    expect(harness.manager.hide).not.toHaveBeenCalled();
    expect(harness.hiddenHandlers.size).toBe(0);
    expect(harness.manager.callbacks.size).toBe(0);
  });

  it("settles from Escape and removes the key listener", async () => {
    const harness = createHarness();
    const result = harness.session.prompt(makeParseResult(), true);

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(await immediateSettlement(result)).toEqual({ settled: false });
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    await expect(result).resolves.toBeNull();
    expect(document.getElementById(modalId)).toBeNull();
    expect(harness.manager.hide).toHaveBeenCalledOnce();
  });

  it("settles from destroy and makes repeated teardown idempotent", async () => {
    const harness = createHarness();
    const result = harness.session.prompt(makeParseResult(), false);

    harness.session.destroy();
    harness.session.destroy();

    await expect(result).resolves.toBeNull();
    expect(harness.manager.hide).toHaveBeenCalledOnce();
    expect(harness.hiddenDetachers[0]).toHaveBeenCalledOnce();
    expect(harness.manager.unregisterRegenerateCallback).toHaveBeenCalledOnce();
  });

  it("settles an overlapping predecessor and makes its callback inert", async () => {
    const harness = createHarness();
    const predecessor = harness.session.prompt(makeParseResult(), true);
    const predecessorModal = document.getElementById(modalId);
    const predecessorCallback = harness.manager.callbacks.get(modalId);
    const replacement = harness.session.prompt(makeParseResult(), false);
    const replacementModal = document.getElementById(modalId);

    await expect(predecessor).resolves.toBeNull();
    expect(predecessorModal?.isConnected).toBe(false);
    expect(replacementModal?.classList).toContain("single-bindset-selection");
    expect(predecessorCallback?.()).toBe(false);
    expect(document.getElementById(modalId)).toBe(replacementModal);

    harness.session.cancelActiveSession();
    await expect(replacement).resolves.toBeNull();
  });

  it("settles without hiding when the modal manager cannot show", async () => {
    const manager = createManager(false);
    const harness = createHarness({ manager });
    const result = harness.session.prompt(makeParseResult(), true);

    await expect(result).resolves.toBeNull();
    expect(manager.show).toHaveBeenCalledWith(modalId);
    expect(manager.hide).not.toHaveBeenCalled();
    expect(manager.callbacks.size).toBe(0);
    expect(document.getElementById(modalId)).toBeNull();
    expect(harness.hiddenDetachers[0]).toHaveBeenCalledOnce();
  });

  it("cancels a scheduled show and keeps a late callback inert", async () => {
    let scheduledCallback = () => {};
    const cancelScheduled = vi.fn();
    const scheduleFrame = vi.fn((callback) => {
      scheduledCallback = callback;
      return cancelScheduled;
    });
    const harness = createHarness({ scheduleFrame });
    const result = harness.session.prompt(makeParseResult(), true);

    expect(harness.manager.show).not.toHaveBeenCalled();
    harness.session.cancelActiveSession();
    await expect(result).resolves.toBeNull();
    expect(cancelScheduled).toHaveBeenCalledOnce();

    scheduledCallback();
    expect(harness.manager.show).not.toHaveBeenCalled();
    expect(document.getElementById(modalId)).toBeNull();
  });
});
