import { describe, expect, it } from "vitest";

import {
  KeyCaptureSession,
  PRIMARY_BINDSET,
} from "../../../src/js/components/ui/keyCaptureSession.js";

function expectInactiveDefaults(session) {
  expect(session).toMatchObject({
    revision: 0,
    active: false,
    selectedChord: null,
    duplicationMode: false,
    sourceKey: null,
    capturing: false,
    ignoreNextChord: false,
    targetBindset: PRIMARY_BINDSET,
    lastModifierSide: { ctrl: "L", alt: "L", shift: "L" },
  });
}

describe("KeyCaptureSession", () => {
  it("starts inactive with detached default state", () => {
    const session = new KeyCaptureSession();

    expect(session.generation).toBe(0);
    expectInactiveDefaults(session);

    const sides = session.lastModifierSide;
    expect(Object.isFrozen(sides)).toBe(true);
    expect(() => {
      sides.ctrl = "R";
    }).toThrow(TypeError);
    expect(session.lastModifierSide.ctrl).toBe("L");
  });

  it("begins with explicit duplication and target state without retaining options", () => {
    const options = {
      duplicationMode: true,
      sourceKey: "F1",
      targetBindset: "Away Team",
    };
    const session = new KeyCaptureSession();
    const token = session.begin(options);

    options.duplicationMode = false;
    options.sourceKey = "F2";
    options.targetBindset = "Changed";

    expect(session).toMatchObject({
      generation: 1,
      revision: 0,
      active: true,
      selectedChord: null,
      duplicationMode: true,
      sourceKey: "F1",
      capturing: false,
      ignoreNextChord: false,
      targetBindset: "Away Team",
      lastModifierSide: { ctrl: "L", alt: "L", shift: "L" },
    });
    expect(token).toEqual({ generation: 1, revision: 0 });
    expect(session.isCurrent(token)).toBe(true);
  });

  it("resets every draft field and advances generation when reused", () => {
    const session = new KeyCaptureSession();
    const first = session.begin({
      duplicationMode: true,
      sourceKey: "F1",
      targetBindset: "Away Team",
    });
    session.selectChord("LCTRL+F2");
    session.startCapture();
    session.markIgnoreNextChord();
    session.setModifierSide("ctrl", "R");

    const second = session.begin();

    expect(second).toEqual({ generation: 2, revision: 0 });
    expect(session).toMatchObject({
      active: true,
      selectedChord: null,
      duplicationMode: false,
      sourceKey: null,
      capturing: false,
      ignoreNextChord: false,
      targetBindset: PRIMARY_BINDSET,
      lastModifierSide: { ctrl: "L", alt: "L", shift: "L" },
    });
    expect(session.isCurrent(first)).toBe(false);
    expect(session.isCurrent(second)).toBe(true);
  });

  it("ends by invalidating tokens and restoring inactive defaults", () => {
    const session = new KeyCaptureSession();
    const activeToken = session.begin({
      duplicationMode: true,
      sourceKey: "F1",
      targetBindset: "Away Team",
    });
    session.selectChord("F2");
    session.startCapture();
    session.markIgnoreNextChord();
    session.setModifierSide("shift", "R");

    session.end();

    expect(session.generation).toBe(2);
    expectInactiveDefaults(session);
    expect(session.isCurrent(activeToken)).toBe(false);
    expect(session.isCurrent(session.token())).toBe(false);
  });

  it("rejects stale generations after end and a later begin", () => {
    const session = new KeyCaptureSession();
    const first = session.begin();
    session.end();
    const second = session.begin();

    expect(second).toEqual({ generation: 3, revision: 0 });
    expect(session.isCurrent(first)).toBe(false);
    expect(session.isCurrent(second)).toBe(true);
  });

  it("invalidates only changed chord revisions and can clear a selection", () => {
    const session = new KeyCaptureSession();
    const initial = session.begin();

    expect(session.selectChord("LCTRL+F1")).toBe(true);
    const selected = session.token();
    expect(session.revision).toBe(1);
    expect(session.isCurrent(initial)).toBe(false);
    expect(session.isCurrent(selected)).toBe(true);

    expect(session.selectChord("LCTRL+F1")).toBe(false);
    expect(session.revision).toBe(1);
    expect(session.selectChord(42)).toBe(true);
    expect(session.selectedChord).toBeNull();
    expect(session.revision).toBe(2);
    expect(session.selectChord("   ")).toBe(false);
  });

  it("invalidates only changed target revisions and defaults invalid targets", () => {
    const session = new KeyCaptureSession();
    const initial = session.begin({ targetBindset: "Away Team" });

    expect(session.setTargetBindset("Away Team")).toBe(false);
    expect(session.revision).toBe(0);
    expect(session.setTargetBindset("Ground Team")).toBe(true);
    expect(session.targetBindset).toBe("Ground Team");
    expect(session.revision).toBe(1);
    expect(session.isCurrent(initial)).toBe(false);

    const changed = session.token();
    expect(session.setTargetBindset(null)).toBe(true);
    expect(session.targetBindset).toBe(PRIMARY_BINDSET);
    expect(session.revision).toBe(2);
    expect(session.isCurrent(changed)).toBe(false);
    expect(session.setTargetBindset(42)).toBe(false);
  });

  it("returns detached frozen tokens and rejects malformed token input", () => {
    const session = new KeyCaptureSession();
    session.begin();
    const token = session.token();

    expect(Object.isFrozen(token)).toBe(true);
    expect(() => {
      token.revision = 99;
    }).toThrow(TypeError);
    expect(session.token()).toEqual({ generation: 1, revision: 0 });
    expect(session.token()).not.toBe(token);
    expect(session.isCurrent(null)).toBe(false);
    expect(session.isCurrent({ generation: 1 })).toBe(false);
    expect(session.isCurrent({ generation: "1", revision: 0 })).toBe(false);
  });

  it("resets duplication state whenever a non-duplication session begins", () => {
    const session = new KeyCaptureSession();
    session.begin({ duplicationMode: true, sourceKey: "F1" });
    expect(session.duplicationMode).toBe(true);
    expect(session.sourceKey).toBe("F1");

    session.begin({ duplicationMode: false, sourceKey: "F2" });
    expect(session.duplicationMode).toBe(false);
    expect(session.sourceKey).toBeNull();
  });

  it("marks and consumes one ignored chord", () => {
    const session = new KeyCaptureSession();
    session.begin();

    expect(session.markIgnoreNextChord()).toBe(true);
    expect(session.markIgnoreNextChord()).toBe(false);
    expect(session.ignoreNextChord).toBe(true);
    expect(session.consumeIgnoreNextChord()).toBe(true);
    expect(session.ignoreNextChord).toBe(false);
    expect(session.consumeIgnoreNextChord()).toBe(false);
  });

  it("starts and stops capture only in an active session", () => {
    const session = new KeyCaptureSession();

    expect(session.startCapture()).toBe(false);
    session.begin();
    expect(session.startCapture()).toBe(true);
    expect(session.startCapture()).toBe(false);
    expect(session.capturing).toBe(true);
    expect(session.stopCapture()).toBe(true);
    expect(session.stopCapture()).toBe(false);
    expect(session.capturing).toBe(false);
    session.end();
    expect(session.startCapture()).toBe(false);
  });

  it("accepts only closed modifier and side values and returns detached sides", () => {
    const session = new KeyCaptureSession();
    session.begin();

    expect(session.setModifierSide("ctrl", "R")).toBe(true);
    expect(session.setModifierSide("alt", "R")).toBe(true);
    expect(session.setModifierSide("shift", "R")).toBe(true);
    expect(session.setModifierSide("ctrl", "R")).toBe(false);
    expect(session.setModifierSide("meta", "L")).toBe(false);
    expect(session.setModifierSide("ctrl", "left")).toBe(false);
    expect(session.setModifierSide(null, "L")).toBe(false);
    expect(session.lastModifierSide).toEqual({
      ctrl: "R",
      alt: "R",
      shift: "R",
    });

    const sides = session.lastModifierSide;
    expect(sides).not.toBe(session.lastModifierSide);
    expect(() => {
      sides.shift = "L";
    }).toThrow(TypeError);
    expect(session.lastModifierSide.shift).toBe("R");
  });

  it.each([undefined, null, [], "invalid", 42])(
    "defaults invalid begin options %#",
    (options) => {
      const session = new KeyCaptureSession();
      session.begin(options);

      expect(session).toMatchObject({
        active: true,
        duplicationMode: false,
        sourceKey: null,
        targetBindset: PRIMARY_BINDSET,
      });
    },
  );

  it("defaults invalid option fields and ignores draft operations while inactive", () => {
    const session = new KeyCaptureSession();
    session.begin({
      duplicationMode: "true",
      sourceKey: "F1",
      targetBindset: "   ",
    });

    expect(session.duplicationMode).toBe(false);
    expect(session.sourceKey).toBeNull();
    expect(session.targetBindset).toBe(PRIMARY_BINDSET);
    session.end();

    expect(session.selectChord("F2")).toBe(false);
    expect(session.setTargetBindset("Away Team")).toBe(false);
    expect(session.markIgnoreNextChord()).toBe(false);
    expect(session.consumeIgnoreNextChord()).toBe(false);
    expect(session.setModifierSide("ctrl", "R")).toBe(false);
    expectInactiveDefaults(session);
  });
});
