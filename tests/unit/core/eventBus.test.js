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

  it("emits the raw DOM event on the configured mirror topic", () => {
    document.body.innerHTML = '<button id="mirrored-button"></button>';
    const domHandler = vi.fn();
    const busHandler = vi.fn();
    const detachBus = eventBus.on("mirrored-click", busHandler);
    const detachDom = eventBus.onDom(
      "mirrored-button",
      "click",
      "mirrored-click",
      domHandler,
    );

    document.getElementById("mirrored-button").click();

    expect(domHandler).toHaveBeenCalledOnce();
    expect(busHandler).toHaveBeenCalledOnce();
    expect(busHandler.mock.calls[0][0]).toBe(domHandler.mock.calls[0][0]);
    expect(busHandler.mock.calls[0][0]).toBeInstanceOf(MouseEvent);

    detachDom();
    detachBus();
    document.getElementById("mirrored-button").click();

    expect(domHandler).toHaveBeenCalledOnce();
    expect(busHandler).toHaveBeenCalledOnce();
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

  it("mirrors debounced DOM events immediately and cancels the local callback on detach", () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<input id="debounced-mirror-input" />';
    const localHandler = vi.fn();
    const busHandler = vi.fn();
    eventBus.on("debounced-mirror", busHandler);
    const detach = eventBus.onDomDebounced(
      "debounced-mirror-input",
      "input",
      "debounced-mirror",
      localHandler,
      100,
    );

    document
      .getElementById("debounced-mirror-input")
      .dispatchEvent(new Event("input", { bubbles: true }));

    expect(busHandler).toHaveBeenCalledOnce();
    expect(localHandler).not.toHaveBeenCalled();

    detach();
    vi.advanceTimersByTime(100);

    expect(localHandler).not.toHaveBeenCalled();
    expect(busHandler).toHaveBeenCalledOnce();
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
