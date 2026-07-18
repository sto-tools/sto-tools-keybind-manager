import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearKeyCaptureModifierActive,
  cloneKeyCaptureModifierSides,
  convertKeyCaptureChordModifiers,
  getKeyCaptureModifierCode,
  getKeyCaptureModifierDescriptor,
  keyCaptureChordHasNonModifier,
  readActiveKeyCaptureModifiers,
  rememberKeyCaptureModifierSide,
  rememberKeyCaptureModifierSidesFromChord,
  reprojectKeyCaptureModifierHighlighting,
  toggleKeyCaptureModifier,
} from "../../../src/js/components/ui/keyCaptureModifierDom.js";

const modifierCodes = [
  "ControlLeft",
  "ControlRight",
  "AltLeft",
  "AltRight",
  "ShiftLeft",
  "ShiftRight",
];

function installModifierDom() {
  document.body.innerHTML = modifierCodes
    .map((code) => `<button data-key-code="${code}"></button>`)
    .join("");
}

/** @param {string} code */
function modifier(code) {
  return document.querySelector(`[data-key-code="${code}"]`);
}

/** @param {string[]} codes */
function activate(...codes) {
  for (const code of codes) modifier(code)?.classList.add("modifier-active");
}

function activeCodes() {
  return modifierCodes.filter((code) =>
    modifier(code)?.classList.contains("modifier-active"),
  );
}

describe("keyCaptureModifierDom", () => {
  beforeEach(() => {
    installModifierDom();
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("maps only the closed modifier code, type, and side vocabulary", () => {
    const descriptor = getKeyCaptureModifierDescriptor("ControlRight");
    expect(descriptor).toEqual({
      code: "ControlRight",
      type: "ctrl",
      side: "R",
      specificName: "RCTRL",
    });
    descriptor.side = "L";
    expect(getKeyCaptureModifierDescriptor("ControlRight")?.side).toBe("R");

    expect(getKeyCaptureModifierCode("shift", "L")).toBe("ShiftLeft");
    expect(getKeyCaptureModifierDescriptor("ControlCenter")).toBeNull();
    expect(getKeyCaptureModifierCode("meta", "L")).toBeNull();
    expect(getKeyCaptureModifierCode("ctrl", "left")).toBeNull();
  });

  it("reads left and right names in stable type order", () => {
    activate("ControlLeft", "AltRight", "ShiftLeft", "ShiftRight");

    expect(readActiveKeyCaptureModifiers(document, true, vi.fn())).toEqual([
      "LCTRL",
      "RALT",
      "LSHIFT",
      "RSHIFT",
    ]);
  });

  it("collapses both active sides to one translated generic name", () => {
    activate(
      "ControlLeft",
      "ControlRight",
      "AltRight",
      "ShiftLeft",
      "ShiftRight",
    );
    const translate = vi.fn(
      (type) => ({ ctrl: "Ctrl", alt: "Alt", shift: "Shift" })[type],
    );

    expect(readActiveKeyCaptureModifiers(document, false, translate)).toEqual([
      "Ctrl",
      "Alt",
      "Shift",
    ]);
    expect(translate.mock.calls.map(([type]) => type)).toEqual([
      "ctrl",
      "alt",
      "shift",
    ]);
  });

  it("clears every modifier-active class without disturbing selected state", () => {
    activate(...modifierCodes);
    modifier("ControlLeft")?.classList.add("selected");

    expect(clearKeyCaptureModifierActive(document)).toEqual(modifierCodes);
    expect(activeCodes()).toEqual([]);
    expect(modifier("ControlLeft")?.classList).toContain("selected");
  });

  it("toggles one location-specific modifier on and back off", () => {
    const activated = toggleKeyCaptureModifier(document, "ControlRight", true);
    expect(activated).toEqual({
      handled: true,
      active: true,
      type: "ctrl",
      side: "R",
      activeCodes: ["ControlRight"],
    });
    expect(activeCodes()).toEqual(["ControlRight"]);

    const deactivated = toggleKeyCaptureModifier(
      document,
      "ControlRight",
      true,
    );
    expect(deactivated).toMatchObject({ handled: true, active: false });
    expect(deactivated.activeCodes).toEqual([]);
    expect(activeCodes()).toEqual([]);
  });

  it("activates both generic sides and clears every other modifier type", () => {
    activate("ControlLeft", "ControlRight", "ShiftLeft");

    const result = toggleKeyCaptureModifier(document, "AltLeft", false);

    expect(result.activeCodes).toEqual(["AltLeft", "AltRight"]);
    expect(activeCodes()).toEqual(["AltLeft", "AltRight"]);
  });

  it("ignores unknown codes without disturbing active state", () => {
    activate("ShiftLeft");

    expect(toggleKeyCaptureModifier(document, "MetaLeft", false)).toEqual({
      handled: false,
      active: false,
      type: null,
      side: null,
      activeCodes: [],
    });
    expect(activeCodes()).toEqual(["ShiftLeft"]);
  });

  it.each([
    [null, false],
    ["", false],
    ["Ctrl+Alt+", false],
    ["LCTRL+RALT+LSHIFT", false],
    ["Ctrl+G", true],
    ["LCTRL+Space", true],
    ["ctrl", true],
  ])("detects non-modifier content in %j", (chord, expected) => {
    expect(keyCaptureChordHasNonModifier(chord)).toBe(expected);
  });

  it("clones and remembers sides without retaining caller records", () => {
    const inherited = Object.create({ ctrl: "R" });
    inherited.alt = "R";
    inherited.shift = "invalid";
    expect(cloneKeyCaptureModifierSides(inherited)).toEqual({
      ctrl: "L",
      alt: "R",
      shift: "L",
    });

    const prior = { ctrl: "R", alt: "L", shift: "R" };
    const fromClick = rememberKeyCaptureModifierSide(prior, "ControlLeft");
    const fromChord = rememberKeyCaptureModifierSidesFromChord(
      prior,
      "LCTRL+RCTRL+RALT+LSHIFT+G",
    );

    expect(fromClick).toEqual({ ctrl: "L", alt: "L", shift: "R" });
    expect(fromChord).toEqual({ ctrl: "R", alt: "R", shift: "L" });
    expect(fromClick).not.toBe(prior);
    expect(fromChord).not.toBe(prior);
    fromClick.alt = "R";
    expect(prior).toEqual({ ctrl: "R", alt: "L", shift: "R" });
  });

  it("round-trips generic and location-specific modifier spellings", () => {
    const generic = "Ctrl+Alt+Shift+G";
    const specific = convertKeyCaptureChordModifiers(generic, true, {
      ctrl: "R",
      alt: "L",
      shift: "R",
    });

    expect(specific).toBe("RCTRL+LALT+RSHIFT+G");
    expect(convertKeyCaptureChordModifiers(specific, false, null)).toBe(
      generic,
    );
    expect(convertKeyCaptureChordModifiers("LCTRL+RCTRL+F1", false, null)).toBe(
      "Ctrl+Ctrl+F1",
    );
    expect(convertKeyCaptureChordModifiers(null, true, null)).toBe("");
  });

  it("reprojects a preferred side through the injected selected highlighter", () => {
    activate("ControlLeft", "ControlRight");
    modifier("ControlLeft")?.classList.add("selected");
    modifier("ControlRight")?.classList.add("selected");
    const highlightKey = vi.fn((keyCode) => {
      modifier(keyCode)?.classList.add("selected");
    });

    const result = reprojectKeyCaptureModifierHighlighting({
      document,
      distinguishSides: true,
      lastModifierSides: { ctrl: "R", alt: "L", shift: "L" },
      highlightKey,
    });

    expect(result).toEqual({
      activeBefore: ["ControlLeft", "ControlRight"],
      projected: ["ControlRight"],
    });
    expect(highlightKey).toHaveBeenCalledWith("ControlRight");
    expect(activeCodes()).toEqual([]);
    expect(modifier("ControlLeft")?.classList).not.toContain("selected");
    expect(modifier("ControlRight")?.classList).toContain("selected");
  });

  it("falls back to the active side when the remembered side was unavailable", () => {
    activate("ShiftLeft");
    const highlightKey = vi.fn();

    expect(
      reprojectKeyCaptureModifierHighlighting({
        document,
        distinguishSides: true,
        lastModifierSides: { ctrl: "L", alt: "L", shift: "R" },
        highlightKey,
      }).projected,
    ).toEqual(["ShiftLeft"]);
    expect(highlightKey).toHaveBeenCalledWith("ShiftLeft");
  });

  it("reprojects generic modifiers with modifier-active on both sides", () => {
    activate("AltRight");
    modifier("AltRight")?.classList.add("selected");
    const highlightKey = vi.fn();

    const result = reprojectKeyCaptureModifierHighlighting({
      document,
      distinguishSides: false,
      lastModifierSides: { ctrl: "L", alt: "R", shift: "L" },
      highlightKey,
    });

    expect(result.projected).toEqual(["AltLeft", "AltRight"]);
    expect(activeCodes()).toEqual(["AltLeft", "AltRight"]);
    expect(highlightKey).not.toHaveBeenCalled();
    expect(modifier("AltRight")?.classList).toContain("selected");
  });

  it("clears and reads safely when modifier DOM is missing", () => {
    document.body.innerHTML = "";
    const highlightKey = vi.fn();

    expect(clearKeyCaptureModifierActive(document)).toEqual([]);
    expect(
      readActiveKeyCaptureModifiers(document, false, (type) => type),
    ).toEqual([]);
    expect(toggleKeyCaptureModifier(document, "ControlLeft", false)).toEqual({
      handled: true,
      active: false,
      type: "ctrl",
      side: "L",
      activeCodes: [],
    });
    expect(
      reprojectKeyCaptureModifierHighlighting({
        document: null,
        distinguishSides: true,
        lastModifierSides: null,
        highlightKey,
      }),
    ).toEqual({ activeBefore: [], projected: [] });
    expect(highlightKey).not.toHaveBeenCalled();
  });
});
