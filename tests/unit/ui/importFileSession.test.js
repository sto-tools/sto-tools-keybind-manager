import { afterEach, describe, expect, it, vi } from "vitest";

import ImportFileSession from "../../../src/js/components/ui/importFileSession.js";

class ControlledFileReader extends EventTarget {
  constructor() {
    super();
    this.result = null;
    this.readyState = 0;
    this.readAsText = vi.fn(() => {
      this.readyState = 1;
    });
    this.abort = vi.fn(() => {
      this.readyState = 2;
      this.dispatchEvent(new Event("abort"));
    });
    vi.spyOn(this, "addEventListener");
    vi.spyOn(this, "removeEventListener");
  }

  complete(content) {
    this.result = content;
    this.readyState = 2;
    this.dispatchEvent(new Event("load"));
  }

  fail(eventName) {
    this.readyState = 2;
    this.dispatchEvent(new Event(eventName));
  }
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

function expectDetached(target, eventName) {
  const handler = target.addEventListener.mock.calls.find(
    ([name]) => name === eventName,
  )?.[1];
  expect(handler).toEqual(expect.any(Function));
  expect(target.removeEventListener).toHaveBeenCalledWith(eventName, handler);
}

function select(session, file) {
  const input = session.inputElement;
  Object.defineProperty(input, "files", {
    configurable: true,
    value: file ? [file] : [],
  });
  input.dispatchEvent(new Event("change"));
  return input;
}

function createHarness({ readerFactory, inputClick } = {}) {
  const inputs = [];
  const readers = [];
  const controllers = [];
  const documentFacade = {
    body: document.body,
    defaultView: window,
    createElement: vi.fn(() => {
      const input = document.createElement("input");
      vi.spyOn(input, "addEventListener");
      vi.spyOn(input, "removeEventListener");
      vi.spyOn(input, "click").mockImplementation(inputClick ?? (() => {}));
      inputs.push(input);
      return input;
    }),
  };
  const createFileReader = vi.fn(() => {
    const reader = readerFactory ? readerFactory() : new ControlledFileReader();
    readers.push(reader);
    return reader;
  });
  const createAbortController = vi.fn(() => {
    const controller = new AbortController();
    controllers.push(controller);
    return controller;
  });
  const session = new ImportFileSession({
    document: documentFacade,
    createFileReader,
    createAbortController,
  });
  const context = { snapshot: "accepted" };
  const outcome = { status: "completed" };
  const callbacks = {
    captureContext: vi.fn(() => context),
    runWorkflow: vi.fn(() => outcome),
    projectOutcome: vi.fn(),
    onTooLarge: vi.fn(),
    onError: vi.fn(),
  };
  const open = (type = "keybinds", overrides = {}) =>
    session.open({
      type,
      maxBytes: 100,
      tooLargeErrorKey: `${type}_too_large`,
      ...callbacks,
      ...overrides,
    });
  return {
    callbacks,
    context,
    controllers,
    createFileReader,
    inputs,
    open,
    outcome,
    readers,
    session,
  };
}

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("ImportFileSession", () => {
  it.each([
    ["keybinds", ".txt"],
    ["aliases", ".txt"],
    ["kbf", ".kbf,.txt"],
  ])("opens the %s picker immediately with accept %s", (type, accept) => {
    const harness = createHarness();

    expect(harness.open(type)).toBe(1);

    const [input] = harness.inputs;
    expect(input.type).toBe("file");
    expect(input.accept).toBe(accept);
    expect(input.style.display).toBe("none");
    expect(document.body.contains(input)).toBe(true);
    expect(input.click).toHaveBeenCalledTimes(1);

    input.dispatchEvent(new Event("cancel"));
    expect(harness.session.isActive).toBe(false);
    expect(document.body.contains(input)).toBe(false);
    expectDetached(input, "cancel");
    expectDetached(input, "change");
  });

  it.each(["change", "cancel"])(
    "cleans up an empty picker after %s",
    (eventName) => {
      const harness = createHarness();
      harness.open();
      const input = harness.session.inputElement;
      Object.defineProperty(input, "files", { value: [] });

      input.dispatchEvent(new Event(eventName));

      expect(harness.createFileReader).not.toHaveBeenCalled();
      expect(harness.callbacks.captureContext).not.toHaveBeenCalled();
      expect(harness.session.inputElement).toBeNull();
      expect(document.body.contains(input)).toBe(false);
    },
  );

  it.each([
    ["keybinds", "keybind_file_too_large"],
    ["aliases", "alias_file_too_large"],
    ["kbf", "kbf_file_too_large"],
  ])("rejects oversized %s input with its supplied error key", (type, key) => {
    const harness = createHarness();
    harness.open(type, { maxBytes: 4, tooLargeErrorKey: key });
    const file = new File(["12345"], `${type}.txt`);

    const input = select(harness.session, file);

    expect(harness.callbacks.onTooLarge).toHaveBeenCalledWith({
      type,
      file,
      errorKey: key,
      size: 5,
      limit: 4,
    });
    expect(harness.createFileReader).not.toHaveBeenCalled();
    expect(harness.callbacks.captureContext).not.toHaveBeenCalled();
    expect(document.body.contains(input)).toBe(false);
  });

  it("captures one accepted snapshot and projects the completed workflow", async () => {
    const pending = deferred();
    const harness = createHarness();
    harness.open("aliases", { runWorkflow: vi.fn(() => pending.promise) });
    const file = new File(["alias content"], "aliases.txt");
    const input = select(harness.session, file);
    const [reader] = harness.readers;

    reader.complete("alias content");

    expect(harness.callbacks.captureContext).toHaveBeenCalledTimes(1);
    const capture = harness.callbacks.captureContext.mock.calls[0][0];
    expect(capture).toMatchObject({
      type: "aliases",
      file,
      context: undefined,
    });
    expect(capture.signal.aborted).toBe(false);
    expect(capture.isCurrent()).toBe(true);
    const workflow = harness.session.currentSession.options.runWorkflow;
    expect(workflow).toHaveBeenCalledWith({
      type: "aliases",
      file,
      content: "alias content",
      context: harness.context,
      signal: capture.signal,
      isCurrent: capture.isCurrent,
    });
    expect(document.body.contains(input)).toBe(true);

    pending.resolve(harness.outcome);
    await vi.waitFor(() =>
      expect(harness.callbacks.projectOutcome).toHaveBeenCalledTimes(1),
    );

    expect(harness.callbacks.projectOutcome).toHaveBeenCalledWith({
      type: "aliases",
      file,
      context: harness.context,
      outcome: harness.outcome,
      signal: capture.signal,
      isCurrent: capture.isCurrent,
    });
    expect(capture.isCurrent()).toBe(false);
    expect(capture.signal.aborted).toBe(false);
    expect(document.body.contains(input)).toBe(false);
    for (const eventName of ["load", "error", "abort"]) {
      expectDetached(reader, eventName);
    }
  });

  it.each(["error", "abort"])(
    "cleans up when the reader emits %s",
    (eventName) => {
      const harness = createHarness();
      harness.open();
      const input = select(harness.session, new File(["content"], "binds.txt"));

      harness.readers[0].fail(eventName);

      expect(harness.callbacks.captureContext).not.toHaveBeenCalled();
      expect(harness.callbacks.onError).not.toHaveBeenCalled();
      expect(document.body.contains(input)).toBe(false);
      expect(harness.controllers[0].signal.aborted).toBe(true);
    },
  );

  it("reports construction failure and removes the accepted input", () => {
    const failure = new Error("construction failed");
    const harness = createHarness({
      readerFactory: () => {
        throw failure;
      },
    });
    harness.open("keybinds");
    const file = new File(["content"], "binds.txt");

    const input = select(harness.session, file);

    expect(harness.callbacks.onError).toHaveBeenCalledWith({
      type: "keybinds",
      file,
      error: failure,
      stage: "reader",
    });
    expect(document.body.contains(input)).toBe(false);
  });

  it("aborts and reports a synchronous read failure", () => {
    const failure = new Error("read failed");
    const reader = new ControlledFileReader();
    reader.readAsText.mockImplementation(() => {
      reader.readyState = 1;
      throw failure;
    });
    const harness = createHarness({ readerFactory: () => reader });
    harness.open();
    const file = new File(["content"], "binds.txt");

    select(harness.session, file);

    expect(harness.callbacks.onError).toHaveBeenCalledWith(
      expect.objectContaining({ error: failure, file, stage: "reader" }),
    );
    expect(reader.abort).toHaveBeenCalledTimes(1);
    expect(harness.controllers[0].signal.aborted).toBe(true);
    expect(harness.session.isActive).toBe(false);
  });

  it.each([
    ["capture", "captureContext"],
    ["workflow", "runWorkflow"],
    ["projection", "projectOutcome"],
  ])("reports a synchronous %s callback failure", async (stage, callback) => {
    const failure = new Error(`${stage} failed`);
    const harness = createHarness();
    harness.open("keybinds", {
      [callback]: vi.fn(() => {
        throw failure;
      }),
    });
    const file = new File(["content"], "binds.txt");
    select(harness.session, file);

    harness.readers[0].complete("content");

    await vi.waitFor(() =>
      expect(harness.callbacks.onError).toHaveBeenCalledWith({
        type: "keybinds",
        file,
        error: failure,
        stage,
      }),
    );
    expect(harness.session.isActive).toBe(false);
  });

  it("reports a rejected workflow without projecting it", async () => {
    const failure = new Error("workflow rejected");
    const harness = createHarness();
    harness.open("keybinds", {
      runWorkflow: vi.fn(() => Promise.reject(failure)),
    });
    const file = new File(["content"], "binds.txt");
    select(harness.session, file);

    harness.readers[0].complete("content");

    await vi.waitFor(() =>
      expect(harness.callbacks.onError).toHaveBeenCalledWith(
        expect.objectContaining({ error: failure, stage: "workflow" }),
      ),
    );
    expect(harness.callbacks.projectOutcome).not.toHaveBeenCalled();
    expect(harness.controllers[0].signal.aborted).toBe(true);
  });

  it("reports picker failure and leaves no hidden input", () => {
    const failure = new Error("click failed");
    const harness = createHarness({
      inputClick: () => {
        throw failure;
      },
    });

    expect(harness.open("kbf")).toBe(1);

    expect(harness.callbacks.onError).toHaveBeenCalledWith({
      type: "kbf",
      file: null,
      error: failure,
      stage: "picker",
    });
    expect(harness.session.isActive).toBe(false);
    expect(document.body.contains(harness.inputs[0])).toBe(false);
  });

  it("cancels the previous loading reader when a new picker opens", () => {
    const harness = createHarness();
    harness.open();
    const firstInput = select(
      harness.session,
      new File(["first"], "first.txt"),
    );
    const firstReader = harness.readers[0];

    expect(harness.open("aliases")).toBe(2);

    expect(firstReader.abort).toHaveBeenCalledTimes(1);
    expect(harness.controllers[0].signal.aborted).toBe(true);
    expect(document.body.contains(firstInput)).toBe(false);
    firstReader.complete("stale");
    expect(harness.callbacks.captureContext).not.toHaveBeenCalled();
    expect(harness.session.inputElement).toBe(harness.inputs[1]);
  });

  it("suppresses stale projection after overlap while a workflow is pending", async () => {
    const pending = deferred();
    const harness = createHarness();
    const runWorkflow = vi
      .fn()
      .mockReturnValueOnce(pending.promise)
      .mockReturnValueOnce(harness.outcome);
    harness.open("keybinds", { runWorkflow });
    select(harness.session, new File(["first"], "first.txt"));
    harness.readers[0].complete("first");
    const firstCapture = harness.callbacks.captureContext.mock.calls[0][0];

    harness.open("aliases", { runWorkflow });
    select(harness.session, new File(["second"], "second.txt"));
    harness.readers[1].complete("second");
    pending.resolve({ status: "stale" });

    await vi.waitFor(() =>
      expect(harness.callbacks.projectOutcome).toHaveBeenCalledTimes(1),
    );
    expect(firstCapture.signal.aborted).toBe(true);
    expect(firstCapture.isCurrent()).toBe(false);
    expect(harness.callbacks.projectOutcome.mock.calls[0][0].file.name).toBe(
      "second.txt",
    );
    expect(harness.callbacks.onError).not.toHaveBeenCalled();
  });

  it("suppresses a stale workflow rejection after destruction", async () => {
    const pending = deferred();
    const harness = createHarness();
    harness.open("keybinds", {
      runWorkflow: vi.fn(() => pending.promise),
    });
    select(harness.session, new File(["content"], "binds.txt"));
    harness.readers[0].complete("content");
    const capture = harness.callbacks.captureContext.mock.calls[0][0];

    harness.session.destroy();
    pending.reject(new Error("stale rejection"));

    await vi.waitFor(() => expect(capture.signal.aborted).toBe(true));
    expect(capture.isCurrent()).toBe(false);
    expect(harness.callbacks.projectOutcome).not.toHaveBeenCalled();
    expect(harness.callbacks.onError).not.toHaveBeenCalled();
    expect(harness.session.isActive).toBe(false);
  });

  it("destroy aborts once, is idempotent, and prevents reopening", () => {
    const harness = createHarness();
    harness.open();
    select(harness.session, new File(["content"], "binds.txt"));
    const [reader] = harness.readers;

    harness.session.destroy();
    harness.session.destroy();

    expect(reader.abort).toHaveBeenCalledTimes(1);
    expect(harness.controllers[0].signal.aborted).toBe(true);
    expect(harness.session.inputElement).toBeNull();
    expect(harness.open()).toBeNull();
    expect(harness.inputs).toHaveLength(1);
  });

  it("validates the import contract without cancelling active work", () => {
    const harness = createHarness();
    harness.open();
    const activeInput = harness.session.inputElement;

    expect(() => harness.session.open({ type: "unsupported" })).toThrow(
      "A supported import type is required",
    );
    expect(() =>
      harness.session.open({
        type: "keybinds",
        captureContext: () => ({}),
      }),
    ).toThrow("Import file callbacks are required");
    expect(harness.session.inputElement).toBe(activeInput);
  });
});
