import { describe, expect, it, vi } from "vitest";

import OwnedComponentStack from "../../../src/js/core/ownedComponentStack.js";

describe("OwnedComponentStack", () => {
  it("clears aliases and reverse-destroys every owner despite cleanup errors", async () => {
    const order = [];
    const cleanupError = new Error("cleanup failed");
    const injected = { destroy: vi.fn() };
    const owner = { injected, first: null, second: null, secondAlias: null };
    const stack = new OwnedComponentStack(owner);
    const first = {
      destroy: vi.fn(() => order.push("first")),
    };
    const second = {
      destroy: vi.fn(() => {
        order.push("second");
        throw cleanupError;
      }),
    };
    owner.first = stack.own(first);
    owner.second = stack.own(second);
    owner.secondAlias = second;
    const reportError = vi.fn();

    await stack.destroyAll(reportError);

    expect(order).toEqual(["second", "first"]);
    expect(owner).toEqual({
      injected,
      first: null,
      second: null,
      secondAlias: null,
    });
    expect(injected.destroy).not.toHaveBeenCalled();
    expect(reportError).toHaveBeenCalledOnce();
    expect(reportError).toHaveBeenCalledWith(cleanupError, "second");
    expect(stack.entries).toEqual([]);

    const replacement = { destroy: vi.fn() };
    owner.first = stack.own(replacement);
    await stack.destroyAll();
    expect(replacement.destroy).toHaveBeenCalledOnce();
    expect(owner.first).toBeNull();
  });

  it("constructs, owns, and destroys a component through one operation", async () => {
    class Component {
      constructor(value) {
        this.value = value;
        this.destroy = vi.fn();
      }
    }
    const owner = { component: null };
    const stack = new OwnedComponentStack(owner);

    const component = stack.create(Component, "ready");
    owner.component = component;
    await stack.destroyAll();

    expect(component.value).toBe("ready");
    expect(component.destroy).toHaveBeenCalledOnce();
    expect(owner.component).toBeNull();
  });
});
