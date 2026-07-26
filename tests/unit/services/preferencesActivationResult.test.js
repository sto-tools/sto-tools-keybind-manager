import { describe, expect, it, vi } from "vitest";

import {
  classifyPreferencesActivationResult,
  materializePreferencesActivationResult,
} from "../../../src/js/components/services/preferencesActivationResult.js";

describe("preferences activation result boundary", () => {
  it("materializes a detached exact success result", () => {
    const source = {
      success: true,
      changed: false,
      revision: 7,
      effects: "degraded",
    };

    const result = materializePreferencesActivationResult(source);

    expect(result).toEqual(source);
    expect(result).not.toBe(source);
    expect(Object.isFrozen(result)).toBe(true);
    expect(classifyPreferencesActivationResult(source)).toEqual({
      kind: "success",
      result: source,
    });
  });

  it("materializes and deeply detaches an exact failure result", () => {
    const params = { reason: "settings read unavailable" };
    const source = {
      success: false,
      error: "preferences_activation_failed",
      params,
      retryable: true,
    };

    const result = materializePreferencesActivationResult(source);

    expect(result).toEqual(source);
    expect(result).not.toBe(source);
    expect(result?.params).not.toBe(params);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result?.params)).toBe(true);
    params.reason = "mutated";
    expect(result?.params.reason).toBe("settings read unavailable");
    expect(classifyPreferencesActivationResult(source)).toEqual({
      kind: "failure",
      result: {
        ...source,
        params: { reason: "mutated" },
      },
    });
  });

  it.each([
    null,
    [],
    {},
    { success: true, changed: false, revision: 0, effects: "applied" },
    { success: true, changed: false, revision: 1.5, effects: "applied" },
    { success: true, changed: false, revision: 2, effects: "unknown" },
    {
      success: true,
      changed: false,
      revision: 2,
      effects: "applied",
      extra: true,
    },
    {
      success: false,
      error: "preferences_activation_failed",
      params: { reason: 42 },
      retryable: true,
    },
    {
      success: false,
      error: "unknown",
      params: { reason: "failed" },
      retryable: true,
    },
    {
      success: false,
      error: "operation_cancelled",
      params: { reason: "operation_cancelled", extra: true },
      retryable: true,
    },
    Object.create({
      success: true,
      changed: false,
      revision: 2,
      effects: "applied",
    }),
  ])("classifies malformed reply %# as malformed", (value) => {
    expect(materializePreferencesActivationResult(value)).toBeNull();
    expect(classifyPreferencesActivationResult(value)).toEqual({
      kind: "malformed",
    });
  });

  it("never invokes reply accessors or leaks hostile proxy reflection", () => {
    const successGetter = vi.fn(() => {
      throw new Error("success getter must not run");
    });
    const accessorReply = {
      changed: false,
      revision: 2,
      effects: "applied",
    };
    Object.defineProperty(accessorReply, "success", {
      enumerable: true,
      get: successGetter,
    });
    const hostileReply = new Proxy(
      {
        success: true,
        changed: false,
        revision: 2,
        effects: "applied",
      },
      {
        ownKeys() {
          throw new Error("ownKeys trap");
        },
      },
    );

    expect(() =>
      materializePreferencesActivationResult(accessorReply),
    ).not.toThrow();
    expect(materializePreferencesActivationResult(accessorReply)).toBeNull();
    expect(successGetter).not.toHaveBeenCalled();
    expect(() =>
      classifyPreferencesActivationResult(hostileReply),
    ).not.toThrow();
    expect(classifyPreferencesActivationResult(hostileReply)).toEqual({
      kind: "malformed",
    });
  });
});
