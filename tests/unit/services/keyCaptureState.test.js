import { describe, expect, it } from "vitest";

import {
  adoptKeyCaptureState,
  advanceKeyCaptureState,
  cloneKeyCaptureState,
  createKeyCaptureState,
  nextKeyCaptureAuthorityEpoch,
} from "../../../src/js/components/services/keyCaptureState.js";

const plainState = (overrides = {}) => ({
  authorityEpoch: 7,
  revision: 3,
  isCapturing: true,
  context: "keySelectionModal",
  locationSpecific: false,
  pressedCodes: ["ControlLeft", "KeyA"],
  currentChord: "Control+A",
  capturedChord: null,
  ...overrides,
});

describe("key-capture owner state", () => {
  it("allocates safe positive monotonically increasing owner epochs", () => {
    const first = nextKeyCaptureAuthorityEpoch();
    const second = nextKeyCaptureAuthorityEpoch();

    expect(Number.isSafeInteger(first)).toBe(true);
    expect(first).toBeGreaterThan(0);
    expect(second).toBe(first + 1);
  });

  it("creates a complete detached and frozen default owner snapshot", () => {
    const state = createKeyCaptureState({ authorityEpoch: 4 });

    expect(state).toEqual({
      authorityEpoch: 4,
      revision: 0,
      isCapturing: false,
      context: "keySelectionModal",
      locationSpecific: false,
      pressedCodes: [],
      currentChord: "",
      capturedChord: null,
    });
    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(state.pressedCodes)).toBe(true);
  });

  it("creates configured state without retaining caller-owned arrays", () => {
    const pressedCodes = ["__proto__", "constructor"];
    const state = createKeyCaptureState(
      { authorityEpoch: 5, revision: 8 },
      {
        isCapturing: true,
        context: "__proto__",
        locationSpecific: true,
        pressedCodes,
        currentChord: "constructor",
        capturedChord: "__proto__",
      },
    );

    expect(state).toEqual({
      authorityEpoch: 5,
      revision: 8,
      isCapturing: true,
      context: "__proto__",
      locationSpecific: true,
      pressedCodes: ["__proto__", "constructor"],
      currentChord: "constructor",
      capturedChord: "__proto__",
    });
    expect(state.pressedCodes).not.toBe(pressedCodes);

    pressedCodes.push("KeyA");
    expect(state.pressedCodes).toEqual(["__proto__", "constructor"]);
    expect(Object.prototype.KeyA).toBeUndefined();
  });

  it.each([
    [{ authorityEpoch: 0 }, {}],
    [{ authorityEpoch: -1 }, {}],
    [{ authorityEpoch: 1.5 }, {}],
    [{ authorityEpoch: Number.MAX_SAFE_INTEGER + 1 }, {}],
    [{ authorityEpoch: 1, revision: -1 }, {}],
    [{ authorityEpoch: 1, revision: 1.5 }, {}],
    [{ authorityEpoch: 1 }, { isCapturing: "false" }],
    [{ authorityEpoch: 1 }, { context: "" }],
    [{ authorityEpoch: 1 }, { locationSpecific: 1 }],
    [{ authorityEpoch: 1 }, { pressedCodes: "KeyA" }],
    [{ authorityEpoch: 1 }, { pressedCodes: [""] }],
    [{ authorityEpoch: 1 }, { pressedCodes: ["KeyA", "KeyA"] }],
    [{ authorityEpoch: 1 }, { pressedCodes: [42] }],
    [{ authorityEpoch: 1 }, { currentChord: null }],
    [{ authorityEpoch: 1 }, { capturedChord: 42 }],
    [{ authorityEpoch: 1 }, { capturedChord: undefined }],
    [{ authorityEpoch: 1 }, { unknown: true }],
  ])("rejects malformed creation input %#", (identity, options) => {
    expect(() => createKeyCaptureState(identity, options)).toThrow(TypeError);
  });

  it("clones without sharing either mutable direction", () => {
    const source = plainState();
    const cloned = cloneKeyCaptureState(source);

    expect(cloned).toEqual(source);
    expect(cloned).not.toBe(source);
    expect(cloned.pressedCodes).not.toBe(source.pressedCodes);

    source.pressedCodes.push("ShiftLeft");
    source.currentChord = "changed by caller";
    expect(cloned.pressedCodes).toEqual(["ControlLeft", "KeyA"]);
    expect(cloned.currentChord).toBe("Control+A");

    expect(() => cloned.pressedCodes.push("AltLeft")).toThrow(TypeError);
    expect(() => {
      cloned.currentChord = "cannot mutate clone";
    }).toThrow(TypeError);
    expect(source.pressedCodes).not.toContain("AltLeft");
  });

  it("advances exactly one revision with only the explicit state patch", () => {
    const predecessor = createKeyCaptureState(
      { authorityEpoch: 20, revision: 9 },
      {
        isCapturing: true,
        context: "capture-one",
        locationSpecific: false,
        pressedCodes: ["ControlLeft"],
        currentChord: "Control",
        capturedChord: null,
      },
    );
    const patchCodes = ["AltRight", "KeyB"];
    const next = advanceKeyCaptureState(predecessor, {
      context: "capture-two",
      locationSpecific: true,
      pressedCodes: patchCodes,
      currentChord: "RALT+B",
      capturedChord: "RALT+B",
    });

    expect(next).toEqual({
      authorityEpoch: 20,
      revision: 10,
      isCapturing: true,
      context: "capture-two",
      locationSpecific: true,
      pressedCodes: ["AltRight", "KeyB"],
      currentChord: "RALT+B",
      capturedChord: "RALT+B",
    });
    expect(predecessor).toMatchObject({
      revision: 9,
      context: "capture-one",
      locationSpecific: false,
      currentChord: "Control",
      capturedChord: null,
    });
    expect(next.pressedCodes).not.toBe(patchCodes);
    expect(next.pressedCodes).not.toBe(predecessor.pressedCodes);

    patchCodes.push("ShiftLeft");
    expect(next.pressedCodes).toEqual(["AltRight", "KeyB"]);
  });

  it.each([
    null,
    {},
    { revision: 10 },
    { authorityEpoch: 21 },
    { unknown: true },
    { pressedCodes: ["KeyA", "KeyA"] },
    { context: "" },
  ])("rejects empty, identity, unknown, or invalid patch %#", (patch) => {
    expect(() => advanceKeyCaptureState(plainState(), patch)).toThrow(
      TypeError,
    );
  });

  it("rejects symbol and inherited patch fields", () => {
    const symbolPatch = { isCapturing: false, [Symbol("hidden")]: true };
    const inheritedPatch = Object.create({ isCapturing: false });

    expect(() => advanceKeyCaptureState(plainState(), symbolPatch)).toThrow(
      TypeError,
    );
    expect(() => advanceKeyCaptureState(plainState(), inheritedPatch)).toThrow(
      TypeError,
    );
  });

  it("refuses to advance beyond the safe revision range", () => {
    expect(() =>
      advanceKeyCaptureState(
        plainState({ revision: Number.MAX_SAFE_INTEGER }),
        { isCapturing: false },
      ),
    ).toThrow(RangeError);
  });

  it.each([
    null,
    {},
    plainState({ authorityEpoch: 0 }),
    plainState({ authorityEpoch: 1.5 }),
    plainState({ revision: -1 }),
    plainState({ revision: 1.5 }),
    plainState({ isCapturing: 1 }),
    plainState({ context: "" }),
    plainState({ locationSpecific: "false" }),
    plainState({ pressedCodes: "KeyA" }),
    plainState({ pressedCodes: [""] }),
    plainState({ pressedCodes: ["KeyA", "KeyA"] }),
    plainState({ pressedCodes: ["KeyA", 42] }),
    plainState({ currentChord: null }),
    plainState({ capturedChord: undefined }),
    plainState({ capturedChord: 42 }),
  ])("rejects malformed adoption candidate %#", (candidate) => {
    expect(adoptKeyCaptureState(candidate, null)).toBeNull();
  });

  it("accepts a valid late-join snapshot without a predecessor", () => {
    const candidate = plainState({ authorityEpoch: 30, revision: 27 });
    const accepted = adoptKeyCaptureState(candidate, null);

    expect(accepted).toEqual(candidate);
    expect(accepted).not.toBe(candidate);
    expect(accepted?.pressedCodes).not.toBe(candidate.pressedCodes);
  });

  it("orders same-owner revisions and requires replacement owners to start at zero", () => {
    const current = plainState({ authorityEpoch: 40, revision: 5 });

    expect(
      adoptKeyCaptureState(
        plainState({ authorityEpoch: 40, revision: 5 }),
        current,
      ),
    ).toBeNull();
    expect(
      adoptKeyCaptureState(
        plainState({ authorityEpoch: 40, revision: 4 }),
        current,
      ),
    ).toBeNull();
    expect(
      adoptKeyCaptureState(
        plainState({ authorityEpoch: 39, revision: 999 }),
        current,
      ),
    ).toBeNull();
    expect(
      adoptKeyCaptureState(
        plainState({ authorityEpoch: 41, revision: 1 }),
        current,
      ),
    ).toBeNull();

    expect(
      adoptKeyCaptureState(
        plainState({ authorityEpoch: 40, revision: 6 }),
        current,
      ),
    ).toMatchObject({ authorityEpoch: 40, revision: 6 });
    expect(
      adoptKeyCaptureState(
        plainState({ authorityEpoch: 41, revision: 0 }),
        current,
      ),
    ).toMatchObject({ authorityEpoch: 41, revision: 0 });
  });

  it("adopts a detached frozen snapshot immune to later caller mutation", () => {
    const candidate = plainState({
      authorityEpoch: 51,
      revision: 0,
      context: "constructor",
      pressedCodes: ["__proto__"],
      currentChord: "__proto__",
      capturedChord: "constructor",
    });
    const accepted = adoptKeyCaptureState(
      candidate,
      plainState({ authorityEpoch: 50, revision: 100 }),
    );

    candidate.pressedCodes.push("KeyA");
    candidate.context = "caller mutation";

    expect(accepted).toMatchObject({
      context: "constructor",
      pressedCodes: ["__proto__"],
      currentChord: "__proto__",
      capturedChord: "constructor",
    });
    expect(Object.isFrozen(accepted)).toBe(true);
    expect(Object.isFrozen(accepted?.pressedCodes)).toBe(true);
    expect(() => accepted?.pressedCodes.push("KeyB")).toThrow(TypeError);
  });

  it("does not order a candidate against a malformed predecessor", () => {
    expect(
      adoptKeyCaptureState(plainState({ revision: 4 }), {
        ...plainState({ revision: 3 }),
        pressedCodes: ["KeyA", "KeyA"],
      }),
    ).toBeNull();
  });
});
