import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ParameterCommandEditSession from "../../../src/js/components/ui/parameterCommandEditSession.js";

const MODAL_ID = "parameterModal";
const translations = {
  please_enter_a_raw_command: "Please enter a raw command",
  please_select_a_key_first: "Please select a key first",
};

function translate(key, options = {}) {
  if (key === "invalid_parameter_number") {
    return `Invalid number for ${options.parameter}: '${options.value}' is not a valid number`;
  }
  if (key === "invalid_parameter_boolean") {
    return `Invalid boolean for ${options.parameter}: '${options.value}' is not a valid number`;
  }
  return translations[key] ?? key;
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

function commandDef(parameters = {}) {
  return {
    name: "Target",
    parameters: {
      value: { type: "text", default: "alpha" },
      ...parameters,
    },
  };
}

function editTarget(index = 0) {
  return Object.freeze({
    authorityEpoch: 4,
    revision: 7,
    profileId: "captain",
    environment: "space",
    name: "F1",
    bindset: null,
    index,
    originalEntry: { command: "Target old" },
  });
}

function editPayload(overrides = {}) {
  return {
    target: editTarget(),
    index: 0,
    categoryId: "targeting",
    commandId: "target",
    commandDef: commandDef(),
    command: { command: "Target old", parameters: { value: "old" } },
    ...overrides,
  };
}

function createManager(showResult = true) {
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

const liveSessions = [];

function createHarness(options = {}) {
  const manager = options.manager ?? createManager();
  const state = {
    contextGeneration: 9,
    addCurrent: true,
    editCurrent: true,
    addTarget: Object.freeze({
      authorityEpoch: 4,
      revision: 7,
      profileId: "captain",
      environment: "space",
      name: "F1",
      selectedKey: "F1",
      selectedAlias: null,
      bindset: null,
    }),
  };
  const buildCommand =
    options.buildCommand ?? vi.fn().mockResolvedValue("Preview");
  const enrichCommand =
    options.enrichCommand ??
    vi.fn().mockResolvedValue({ parameters: { value: "enriched" } });
  const publishAdd = vi.fn();
  const publishEdit = vi.fn();
  const showToast = vi.fn();
  const session = new ParameterCommandEditSession({
    document: options.document ?? document,
    modalManager: manager,
    translate,
    enrichCommand,
    buildCommand,
    captureAddTarget: () => state.addTarget,
    isAddTargetCurrent: (_target, generation) =>
      state.addCurrent && generation === state.contextGeneration,
    isEditTargetCurrent: (_target, generation) =>
      state.editCurrent && generation === state.contextGeneration,
    getContextGeneration: () => state.contextGeneration,
    getMissingSelectionKey: () => "please_select_a_key_first",
    publishAdd,
    publishEdit,
    showToast,
  });
  liveSessions.push(session);
  return {
    session,
    manager,
    state,
    buildCommand,
    enrichCommand,
    publishAdd,
    publishEdit,
    showToast,
  };
}

function modal(root = document) {
  return root.getElementById(MODAL_ID);
}

function input(root = document) {
  return root.getElementById("param_value");
}

function preview(root = document) {
  return root.getElementById("parameterCommandPreview");
}

beforeEach(() => {
  document.body.replaceChildren();
});

afterEach(() => {
  for (const session of liveSessions.splice(0)) session.destroy();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("ParameterCommandEditSession asynchronous authority", () => {
  it("keeps the newest preview when build completions arrive in reverse", async () => {
    const first = deferred();
    const second = deferred();
    const buildCommand = vi
      .fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    const { session } = createHarness({ buildCommand });

    expect(session.showAdd("targeting", "target", commandDef())).toBe(true);
    input().value = "new";
    input().dispatchEvent(new Event("input", { bubbles: true }));
    second.resolve({ command: "Target new", source: "latest" });
    await flushPromises();
    expect(preview().textContent).toBe("Target new");

    first.resolve("Target stale");
    await flushPromises();
    expect(preview().textContent).toBe("Target new");
  });

  it("does not let an older preview replace newer validation state", async () => {
    const stale = deferred();
    const corrected = deferred();
    const buildCommand = vi
      .fn()
      .mockImplementationOnce(() => stale.promise)
      .mockImplementationOnce(() => corrected.promise);
    const definition = commandDef({
      value: { type: "number", label: "Value", default: 1 },
    });
    const { session } = createHarness({ buildCommand });
    session.showAdd("targeting", "target", definition);
    const value = input();
    Object.defineProperty(value, "value", {
      configurable: true,
      value: "invalid",
      writable: true,
    });
    value.dispatchEvent(new Event("input", { bubbles: true }));

    expect(preview().textContent).toContain("Invalid number for value");
    expect(preview().style.color).toBe("rgb(214, 48, 49)");
    stale.resolve("Target stale");
    await flushPromises();
    expect(preview().textContent).toContain("Invalid number for value");

    value.value = "2";
    value.dispatchEvent(new Event("input", { bubbles: true }));
    corrected.resolve("Target corrected");
    await flushPromises();
    expect(preview().textContent).toBe("Target corrected");
    expect(preview().style.color).toBe("");
  });

  it("silences stale expected and unexpected preview failures", async () => {
    const expected = deferred();
    const unexpected = deferred();
    const buildCommand = vi
      .fn()
      .mockImplementationOnce(() => expected.promise)
      .mockImplementationOnce(() => unexpected.promise);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { session } = createHarness({ buildCommand });

    session.showAdd("targeting", "first", commandDef());
    session.showAdd("targeting", "second", commandDef());
    session.cancel();
    expected.reject(new Error("please_enter_a_raw_command"));
    unexpected.reject(new Error("network failed"));
    await flushPromises();

    expect(error).not.toHaveBeenCalled();
    expect(session.currentParameterCommand).toBeNull();
  });

  it("allows only the successor edit enrichment to render", async () => {
    const predecessor = deferred();
    const successor = deferred();
    const enrichCommand = vi
      .fn()
      .mockImplementationOnce(() => predecessor.promise)
      .mockImplementationOnce(() => successor.promise);
    const { session, manager } = createHarness({ enrichCommand });
    const first = session.showEdit(
      editPayload({ command: { command: "Target first" } }),
    );
    const secondPayload = editPayload({
      target: editTarget(1),
      index: 1,
      command: { command: "Target second" },
    });
    const second = session.showEdit(secondPayload);

    successor.resolve({ parameters: { value: "successor" } });
    await expect(second).resolves.toBe(true);
    expect(input().value).toBe("successor");
    predecessor.resolve({ parameters: { value: "predecessor" } });
    await expect(first).resolves.toBe(false);

    expect(input().value).toBe("successor");
    expect(session.currentParameterCommand?.originalCommand).toBe(
      secondPayload.command,
    );
    expect(manager.show).toHaveBeenCalledOnce();
  });
});

describe("ParameterCommandEditSession save admission", () => {
  it("claims one save and suppresses a concurrent duplicate", async () => {
    const saving = deferred();
    const buildCommand = vi
      .fn()
      .mockResolvedValueOnce("Preview")
      .mockImplementationOnce(() => saving.promise);
    const { session, state, publishAdd } = createHarness({ buildCommand });
    session.showAdd("targeting", "target", commandDef());
    await flushPromises();

    const first = session.save();
    await expect(session.save()).resolves.toBe(false);
    expect(buildCommand).toHaveBeenCalledTimes(2);
    saving.resolve({ command: "Target beta", parameters: { value: "beta" } });
    await expect(first).resolves.toBe(true);

    expect(publishAdd).toHaveBeenCalledOnce();
    expect(publishAdd).toHaveBeenCalledWith(
      state.addTarget,
      expect.objectContaining({ command: "Target beta" }),
    );
    expect(session.currentParameterCommand).toBeNull();
  });

  it("rejects a delayed save after the form changes", async () => {
    const saving = deferred();
    const buildCommand = vi
      .fn()
      .mockResolvedValueOnce("Preview")
      .mockImplementationOnce(() => saving.promise)
      .mockResolvedValueOnce("Preview changed");
    const { session, publishAdd } = createHarness({ buildCommand });
    session.showAdd("targeting", "target", commandDef());
    await flushPromises();

    const result = session.save();
    input().value = "changed";
    input().dispatchEvent(new Event("input", { bubbles: true }));
    saving.resolve("Target stale");
    await expect(result).resolves.toBe(false);
    await flushPromises();

    expect(publishAdd).not.toHaveBeenCalled();
    expect(session.currentParameterCommand).not.toBeNull();
    expect(preview().textContent).toBe("Preview changed");
  });

  it("publishes filtered batches for add and rejects arrays for edit", async () => {
    const batch = ["First", null, { command: "Second", source: "rich" }];
    const add = createHarness({
      buildCommand: vi
        .fn()
        .mockResolvedValueOnce("Preview")
        .mockResolvedValueOnce(batch),
    });
    add.session.showAdd("targeting", "target", commandDef());
    await flushPromises();
    await expect(add.session.save()).resolves.toBe(true);
    expect(add.publishAdd).toHaveBeenCalledWith(add.state.addTarget, [
      "First",
      { command: "Second", source: "rich" },
    ]);

    const edit = createHarness({
      buildCommand: vi
        .fn()
        .mockResolvedValueOnce("Preview")
        .mockResolvedValueOnce(batch),
    });
    await expect(edit.session.showEdit(editPayload())).resolves.toBe(true);
    await flushPromises();
    await expect(edit.session.save()).resolves.toBe(false);
    expect(edit.publishEdit).not.toHaveBeenCalled();
    expect(edit.session.currentParameterCommand?.isEditing).toBe(true);
  });

  it("uses the dedicated raw-command preview and save warning", async () => {
    const buildCommand = vi
      .fn()
      .mockRejectedValue(new Error("please_enter_a_raw_command"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { session, showToast } = createHarness({ buildCommand });
    session.showAdd("raw", "raw", commandDef());
    await flushPromises();

    expect(preview().textContent).toBe("Please enter a raw command");
    expect(error).not.toHaveBeenCalled();
    await expect(session.save()).resolves.toBe(false);
    expect(showToast).toHaveBeenCalledWith(
      "Please enter a raw command",
      "warning",
    );
    expect(error).toHaveBeenCalledOnce();
  });
});

describe("ParameterCommandEditSession modal lifecycle", () => {
  it("consumes external hidden success without hiding twice and cancels locally", async () => {
    const { session, manager } = createHarness();
    session.showAdd("targeting", "target", commandDef());
    await flushPromises();
    const callback = manager.callbacks.get(MODAL_ID);

    expect(session.handleModalHidden({ modalId: "other", success: true })).toBe(
      false,
    );
    expect(
      session.handleModalHidden({ modalId: MODAL_ID, success: false }),
    ).toBe(false);
    expect(
      session.handleModalHidden({ modalId: MODAL_ID, success: true }),
    ).toBe(true);
    expect(manager.hide).not.toHaveBeenCalled();
    expect(manager.unregisterRegenerateCallback).toHaveBeenCalledWith(
      MODAL_ID,
      callback,
    );
    expect(callback()).toBe(false);

    session.showAdd("targeting", "replacement", commandDef());
    expect(session.cancel()).toBe(true);
    expect(session.cancel()).toBe(false);
    expect(manager.hide).toHaveBeenCalledOnce();
  });

  it("makes replaced controls and callbacks inert, then destroys its modal", async () => {
    const { session, manager, buildCommand } = createHarness();
    session.showAdd("targeting", "first", commandDef());
    await flushPromises();
    const staleCallback = manager.callbacks.get(MODAL_ID);
    const staleSave = document.getElementById("saveParameterCommandBtn");
    const callsBeforeReplacement = buildCommand.mock.calls.length;

    session.showAdd("targeting", "second", commandDef());
    await flushPromises();
    expect(manager.unregisterRegenerateCallback).toHaveBeenCalledWith(
      MODAL_ID,
      staleCallback,
    );
    expect(staleCallback()).toBe(false);
    staleSave.click();
    await flushPromises();
    expect(buildCommand).toHaveBeenCalledTimes(callsBeforeReplacement + 1);

    session.destroy();
    session.destroy();
    expect(modal()).toBeNull();
    expect(session.showAdd("targeting", "third", commandDef())).toBe(false);
    expect(manager.hide).toHaveBeenCalledOnce();
  });

  it("removes every exact control listener across repeated regeneration", async () => {
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
    const { session, manager, buildCommand } = createHarness();
    session.showAdd("targeting", "target", commandDef());
    await flushPromises();
    const callback = manager.callbacks.get(MODAL_ID);
    const staleSave = document.getElementById("saveParameterCommandBtn");

    expect(callback()).toBe(true);
    expect(callback()).toBe(true);
    await flushPromises();
    const previewCalls = buildCommand.mock.calls.length;
    staleSave.click();
    await flushPromises();
    expect(buildCommand).toHaveBeenCalledTimes(previewCalls);
    expect(manager.registerRegenerateCallback).toHaveBeenCalledOnce();

    session.cancel();
    expect(added).toHaveLength(9);
    for (const registration of added) {
      expect(
        removed.filter(
          (candidate) =>
            candidate.target === registration.target &&
            candidate.type === registration.type &&
            candidate.listener === registration.listener,
        ),
      ).toHaveLength(1);
    }
    expect(manager.unregisterRegenerateCallback).toHaveBeenCalledWith(
      MODAL_ID,
      callback,
    );
  });

  it("releases the exact callback when regeneration fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { session, manager } = createHarness();
    session.showAdd("targeting", "target", commandDef());
    await flushPromises();
    const callback = manager.callbacks.get(MODAL_ID);
    modal().replaceChildren = vi.fn(() => {
      throw new Error("render failed");
    });

    expect(callback()).toBe(false);
    expect(session.currentParameterCommand).toBeNull();
    expect(manager.unregisterRegenerateCallback).toHaveBeenCalledWith(
      MODAL_ID,
      callback,
    );
    expect(manager.hide).toHaveBeenCalledWith(MODAL_ID);
    expect(error).toHaveBeenCalledWith(
      "[ParameterCommandUI] Failed to regenerate modal:",
      expect.objectContaining({ message: "render failed" }),
    );
  });

  it.each([
    ["a string", "Target one", "Target one"],
    ["a rich command", { command: "Target two", icon: "target" }, "Target two"],
    [
      "a filtered array",
      ["Target three", null, { command: "Target four" }, { command: 4 }],
      "Target three $$ Target four",
    ],
  ])(
    "projects %s build through the live modal",
    async (_label, result, text) => {
      const { session } = createHarness({
        buildCommand: vi.fn().mockResolvedValue(result),
      });
      session.showAdd("targeting", "target", commandDef());
      await flushPromises();
      expect(preview().textContent).toBe(text);
    },
  );

  it("creates and drives the modal only in the injected document realm", async () => {
    const foreignWindow = new JSDOM("<!doctype html><html><body></body></html>")
      .window;
    const foreignDocument = foreignWindow.document;
    const { session, buildCommand } = createHarness({
      document: foreignDocument,
    });

    expect(session.showAdd("targeting", "target", commandDef())).toBe(true);
    await flushPromises();
    expect(modal(document)).toBeNull();
    expect(modal(foreignDocument)?.ownerDocument).toBe(foreignDocument);
    input(foreignDocument).value = "foreign";
    input(foreignDocument).dispatchEvent(
      new foreignWindow.Event("input", { bubbles: true }),
    );
    await flushPromises();
    expect(buildCommand).toHaveBeenLastCalledWith(
      expect.objectContaining({ params: { value: "foreign" } }),
    );

    session.destroy();
    expect(modal(foreignDocument)).toBeNull();
    foreignWindow.close();
  });
});
