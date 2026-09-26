import { describe, expect, it, vi } from "vitest";
import {
  materializeMutationRequest,
  materializeMutationValue,
  materializeProfilePrecondition,
  requireMutationBoolean,
  requireMutationCommand,
  requireMutationIdentifier,
  requireMutationIndex,
  requireMutationString,
  requireProfileUpdateResult,
} from "../../../src/js/components/services/mutationRequestBoundary.js";
import { MAX_PROJECT_JSON_BYTES } from "../../../src/js/components/services/jsonDataBoundary.js";

describe("mutation request ingress", () => {
  it("bounds standalone strings as well as structured envelopes", () => {
    expect(() =>
      requireMutationString("x".repeat(MAX_PROJECT_JSON_BYTES)),
    ).toThrow("invalid_mutation_request");
  });
  it("detaches allowed fields and omits only declared outer undefined fields", () => {
    const shared = { commands: ["FireAll"] };
    const source = { name: "Captain", options: shared, unused: undefined };
    const result = materializeMutationRequest(source, [
      "name",
      "options",
      "unused",
    ]);
    shared.commands.push("Jump");
    expect(result).toEqual({
      name: "Captain",
      options: { commands: ["FireAll"] },
    });
    expect(() =>
      materializeMutationRequest({ options: { nested: undefined } }, [
        "options",
      ]),
    ).toThrow();
  });

  it.each([
    null,
    [],
    "text",
    7,
    new Date(),
    Object.create({ name: "inherited" }),
  ])("rejects non-own-data envelopes: %s", (value) => {
    expect(() => materializeMutationRequest(value, ["name"])).toThrow(
      "invalid_mutation_request",
    );
  });

  it("rejects getters at every depth without invoking them", () => {
    const getter = vi.fn(() => "Captain");
    const value = Object.defineProperty({}, "name", {
      enumerable: true,
      get: getter,
    });
    expect(() => materializeMutationRequest(value, ["name"])).toThrow();
    expect(() =>
      materializeMutationRequest({ payload: value }, ["payload"]),
    ).toThrow();
    expect(getter).not.toHaveBeenCalled();
  });

  it("rejects unknown, symbolic, hidden, dangerous and throwing reflected fields", () => {
    for (const value of [
      { extra: "value" },
      { [Symbol("name")]: "Captain" },
      Object.defineProperty({}, "name", { value: "Captain" }),
      JSON.parse('{"name":{"__proto__":{}}}'),
      new Proxy(
        {},
        {
          ownKeys() {
            throw new Error("reflection");
          },
        },
      ),
    ])
      expect(() => materializeMutationRequest(value, ["name"])).toThrow();
  });

  it("rejects cycles, sparse arrays, non-finite numbers and excessive depth", () => {
    const cycle = {};
    cycle.self = cycle;
    let deep = {};
    for (let index = 0; index < 105; index += 1) deep = { child: deep };
    for (const value of [
      cycle,
      Object.assign(new Array(2), { 1: "gap" }),
      Infinity,
      NaN,
      () => {},
      deep,
    ]) {
      expect(() => materializeMutationValue(value)).toThrow();
    }
  });

  it("bounds expanded JSON size including shared DAG occurrences", () => {
    let shared = { text: "x".repeat(1024) };
    for (let index = 0; index < 15; index += 1)
      shared = { a: shared, b: shared };
    expect(() => materializeMutationValue(shared)).toThrow();
    expect(() =>
      materializeMutationValue("x".repeat(MAX_PROJECT_JSON_BYTES)),
    ).toThrow();
    expect(
      materializeMutationValue({ theme: 42, nested: { language: false } }),
    ).toEqual({ theme: 42, nested: { language: false } });
  });

  it("validates exact authority/revision preconditions", () => {
    expect(
      materializeProfilePrecondition({ authorityEpoch: 0, revision: 2 }),
    ).toEqual({ authorityEpoch: 0, revision: 2 });
    for (const value of [
      {},
      { authorityEpoch: 1 },
      { authorityEpoch: 1, revision: -1 },
      { authorityEpoch: "1", revision: 2 },
      { authorityEpoch: 1, revision: 0.1 },
      { authorityEpoch: 1, revision: 2, extra: true },
    ])
      expect(() => materializeProfilePrecondition(value)).toThrow();
  });

  it("keeps string optionality separate from identifier safety", () => {
    expect(requireMutationString("constructor")).toBe("constructor");
    expect(
      requireMutationString(undefined, { optional: true }),
    ).toBeUndefined();
    expect(requireMutationString(null, { nullable: true })).toBeNull();
    expect(requireMutationString("", { allowEmpty: true })).toBe("");
    for (const value of [null, undefined, 7, ""])
      expect(() => requireMutationString(value)).toThrow();
    expect(requireMutationIdentifier("F1")).toBe("F1");
    for (const value of ["constructor", "prototype", "__proto__"])
      expect(() => requireMutationIdentifier(value)).toThrow(
        "unsafe_profile_operation_key",
      );
  });

  it("requires exact booleans and non-negative integer indexes", () => {
    expect(requireMutationBoolean(false)).toBe(false);
    expect(requireMutationBoolean(true)).toBe(true);
    expect(requireMutationIndex(0)).toBe(0);
    expect(requireMutationIndex(5)).toBe(5);
    for (const value of ["false", 0, null])
      expect(() => requireMutationBoolean(value)).toThrow();
    for (const value of [-1, 1.5, "1", Infinity])
      expect(() => requireMutationIndex(value)).toThrow();
  });

  it("validates rich-command fields without dropping extension data", () => {
    const command = { command: "FireAll", extension: { supported: true } };
    expect(requireMutationCommand(command)).toEqual(command);
    expect(requireMutationCommand(command)).not.toBe(command);
    expect(requireMutationCommand("FireAll")).toBe("FireAll");
    for (const value of [null, [], 7, { command: 8 }, { custom: "yes" }])
      expect(() => requireMutationCommand(value)).toThrow();
  });

  it("requires a valid detached profile acknowledgement", () => {
    const receipt = {
      success: true,
      profile: { name: "Captain", builds: { space: { keys: {} } } },
    };
    const detached = requireProfileUpdateResult(receipt);
    expect(detached).toEqual(receipt);
    expect(detached.profile).not.toBe(receipt.profile);
    for (const value of [
      false,
      { success: true },
      { success: false, profile: {} },
      { success: true, profile: [] },
      { success: true, profile: { name: 7 } },
    ]) {
      expect(() => requireProfileUpdateResult(value)).toThrow();
    }
  });
});
