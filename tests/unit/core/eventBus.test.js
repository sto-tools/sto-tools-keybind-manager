import { afterEach, describe, expect, it, vi } from "vitest";

import eventBus from "../../../src/js/core/eventBus.js";

describe("eventBus", () => {
  afterEach(() => {
    vi.useRealTimers();
    eventBus.clear();
  });

  it("returns a detach function for a pending once handler", () => {
    const handler = vi.fn();
    const detach = eventBus.once("detached-once-event", handler);

    expect(detach).toBeTypeOf("function");
    detach();
    eventBus.emit("detached-once-event");

    expect(handler).not.toHaveBeenCalled();
  });

  it("delivers null when a nullable event payload is omitted", () => {
    const handler = vi.fn();
    eventBus.on("about:show", handler);

    eventBus.emit("about:show");

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith(null);
  });

  it("dispatches ordinary events immediately without awaiting async listeners", async () => {
    let releaseListener;
    const listenerFinished = new Promise((resolve) => {
      releaseListener = resolve;
    });
    const calls = [];

    eventBus.on("async-event", async (payload) => {
      calls.push(["started", payload]);
      await listenerFinished;
      calls.push(["finished", payload]);
    });

    await eventBus.emit("async-event", { value: 42 });

    expect(calls).toEqual([["started", { value: 42 }]]);

    releaseListener();
    await listenerFinished;
    await Promise.resolve();

    expect(calls).toEqual([
      ["started", { value: 42 }],
      ["finished", { value: 42 }],
    ]);
  });

  it("awaits async listeners when synchronous dispatch is requested", async () => {
    const calls = [];

    eventBus.on("synchronous-event", async (payload) => {
      await Promise.resolve();
      calls.push(["async", payload]);
      return "completed";
    });
    eventBus.on("synchronous-event", (payload) => {
      calls.push(["sync", payload]);
    });

    const results = await eventBus.emit(
      "synchronous-event",
      { value: 7 },
      { synchronous: true },
    );

    expect(calls).toEqual([
      ["sync", { value: 7 }],
      ["async", { value: 7 }],
    ]);
    expect(results).toEqual([{ status: "fulfilled", value: "completed" }]);
  });

  it("keeps delegated DOM events local through descendants and replacement", () => {
    document.body.innerHTML =
      '<button id="mirrored-button"><span class="child"></span></button>';
    const domHandler = vi.fn();
    const busHandler = vi.fn();
    const genericBusHandler = vi.fn();
    const detachBus = eventBus.on("mirrored-click", busHandler);
    const detachGenericBus = eventBus.on("click", genericBusHandler);
    const detachDom = eventBus.onDom("mirrored-button", "click", domHandler);
    document
      .getElementById("mirrored-button")
      .addEventListener("click", (event) => event.stopPropagation());

    document
      .querySelector("#mirrored-button .child")
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(domHandler).toHaveBeenCalledOnce();
    expect(domHandler.mock.calls[0][0]).toBeInstanceOf(MouseEvent);
    expect(busHandler).not.toHaveBeenCalled();
    expect(genericBusHandler).not.toHaveBeenCalled();

    document.getElementById("mirrored-button").outerHTML =
      '<button id="mirrored-button"><span class="replacement-child"></span></button>';
    document
      .querySelector("#mirrored-button .replacement-child")
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(domHandler).toHaveBeenCalledTimes(2);
    expect(busHandler).not.toHaveBeenCalled();
    expect(genericBusHandler).not.toHaveBeenCalled();

    detachDom();
    detachBus();
    detachGenericBus();
    document.getElementById("mirrored-button").click();

    expect(domHandler).toHaveBeenCalledTimes(2);
    expect(busHandler).not.toHaveBeenCalled();
    expect(genericBusHandler).not.toHaveBeenCalled();
  });

  it("isolates exceptions thrown by delegated DOM handlers", () => {
    document.body.innerHTML = '<button id="throwing-delegated"></button>';
    const button = document.getElementById("throwing-delegated");
    const error = new Error("expected delegated DOM handler failure");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const nextHandler = vi.fn();
    button.addEventListener("click", nextHandler);
    const detachDom = eventBus.onDom("throwing-delegated", "click", () => {
      throw error;
    });

    expect(() => button.click()).not.toThrow();
    expect(errorSpy).toHaveBeenCalledWith(error);
    expect(nextHandler).toHaveBeenCalledOnce();

    detachDom();
    button.removeEventListener("click", nextHandler);
    errorSpy.mockRestore();
  });

  it("keeps direct-target DOM events local to their registered handler", () => {
    document.body.innerHTML = '<button id="direct-button"></button>';
    const button = document.getElementById("direct-button");
    const domHandler = vi.fn();
    const busHandler = vi.fn();
    const genericBusHandler = vi.fn();
    const detachBus = eventBus.on("direct-click", busHandler);
    const detachGenericBus = eventBus.on("click", genericBusHandler);
    const detachDom = eventBus.onDom(button, "click", domHandler);

    button.click();

    expect(domHandler).toHaveBeenCalledOnce();
    expect(domHandler.mock.calls[0][0]).toBeInstanceOf(MouseEvent);
    expect(busHandler).not.toHaveBeenCalled();
    expect(genericBusHandler).not.toHaveBeenCalled();

    detachDom();
    detachBus();
    detachGenericBus();
    button.click();

    expect(domHandler).toHaveBeenCalledOnce();
    expect(busHandler).not.toHaveBeenCalled();
    expect(genericBusHandler).not.toHaveBeenCalled();
  });

  it("isolates exceptions thrown by local DOM handlers", () => {
    document.body.innerHTML = '<button id="throwing-button"></button>';
    const button = document.getElementById("throwing-button");
    const error = new Error("expected DOM handler failure");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const nextHandler = vi.fn();
    button.addEventListener("click", nextHandler);
    const detachDom = eventBus.onDom(button, "click", () => {
      throw error;
    });

    expect(() => button.click()).not.toThrow();
    expect(errorSpy).toHaveBeenCalledWith(error);
    expect(nextHandler).toHaveBeenCalledOnce();

    detachDom();
    button.removeEventListener("click", nextHandler);
    errorSpy.mockRestore();
  });

  it("rejects the retired DOM mirror signature", () => {
    expect(() =>
      eventBus.onDom(
        document,
        "click",
        "mirrored-click",
        /** @type {(event: Event) => void} */ (() => {}),
      ),
    ).toThrow("DOM event handler must be a function");
  });

  it("debounces the handler-only onDomDebounced signature", () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<input id="debounced-input" />';
    const handler = vi.fn();
    const detach = eventBus.onDomDebounced(
      "debounced-input",
      "input",
      handler,
      100,
    );

    const input = document.getElementById("debounced-input");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(handler).not.toHaveBeenCalled();

    vi.advanceTimersByTime(99);
    expect(handler).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0][0]).toBeInstanceOf(Event);

    detach();
  });

  it("keeps debounced DOM events local and cancels the callback on detach", () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<input id="debounced-mirror-input" />';
    const localHandler = vi.fn();
    const busHandler = vi.fn();
    const genericBusHandler = vi.fn();
    eventBus.on("debounced-mirror", busHandler);
    eventBus.on("input", genericBusHandler);
    const detach = eventBus.onDomDebounced(
      "debounced-mirror-input",
      "input",
      localHandler,
      100,
    );

    document
      .getElementById("debounced-mirror-input")
      .dispatchEvent(new Event("input", { bubbles: true }));

    expect(busHandler).not.toHaveBeenCalled();
    expect(genericBusHandler).not.toHaveBeenCalled();
    expect(localHandler).not.toHaveBeenCalled();

    detach();
    vi.advanceTimersByTime(100);

    expect(localHandler).not.toHaveBeenCalled();
    expect(busHandler).not.toHaveBeenCalled();
    expect(genericBusHandler).not.toHaveBeenCalled();
  });

  it("cancels pending debounced DOM callbacks when the bus is cleared", () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<input id="clear-debounced-input" />';
    const handler = vi.fn();
    eventBus.onDomDebounced("clear-debounced-input", "input", handler, 100);

    document
      .getElementById("clear-debounced-input")
      .dispatchEvent(new Event("input", { bubbles: true }));
    eventBus.clear();
    vi.advanceTimersByTime(100);

    expect(handler).not.toHaveBeenCalled();
  });
});
