import { afterEach, describe, expect, it, vi } from "vitest";

import eventBus from "../../../src/js/core/eventBus.js";

describe("eventBus", () => {
  afterEach(() => {
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
});
