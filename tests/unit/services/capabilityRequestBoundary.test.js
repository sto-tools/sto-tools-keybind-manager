import { describe, expect, it, vi } from "vitest";
import { requireCapabilityRequest } from "../../../src/js/components/services/capabilityRequestBoundary.js";

describe("capability request own-data envelope", () => {
  it("preserves the capability identity without invoking its getters", () => {
    const getter = vi.fn();
    const capability = Object.defineProperty({}, "kind", { get: getter });
    expect(
      requireCapabilityRequest({ dirHandle: capability }, "dirHandle"),
    ).toBe(capability);
    expect(getter).not.toHaveBeenCalled();
  });

  it("rejects envelope accessors without invoking them", () => {
    const getter = vi.fn();
    const payload = Object.defineProperty({}, "dirHandle", {
      get: getter,
      enumerable: true,
    });
    expect(() => requireCapabilityRequest(payload, "dirHandle")).toThrow(
      "invalid_mutation_request",
    );
    expect(getter).not.toHaveBeenCalled();
  });

  it.each([
    undefined,
    null,
    [],
    {},
    Object.create({ dirHandle: {} }),
    { dirHandle: {}, extra: true },
    { dirHandle: {}, [Symbol("hidden")]: true },
    Object.defineProperty({}, "dirHandle", { value: {} }),
    new Proxy(
      {},
      {
        ownKeys() {
          throw new Error("reflection failed");
        },
      },
    ),
  ])("rejects malformed envelope %#", (payload) => {
    expect(() => requireCapabilityRequest(payload, "dirHandle")).toThrow(
      "invalid_mutation_request",
    );
  });
});
