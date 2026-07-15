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
});
