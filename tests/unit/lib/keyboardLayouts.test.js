import { describe, expect, it } from "vitest";
import {
  AZERTY_LAYOUT,
  QWERTY_LAYOUT,
  QWERTZ_LAYOUT,
  SMART_SUGGESTIONS,
  getKeyboardLayout,
  getLayoutName,
} from "../../../src/js/lib/keyboardLayouts.js";

const isLetterKey = (keyCode) => /^Key[A-Z]$/.test(keyCode);

function getLetterKeyOrder(layout) {
  return Object.keys(layout.keys).filter(isLetterKey);
}

function expectOnlyLetterDifferences(layout, expectedDifferences) {
  const actualDifferences = Object.keys(QWERTY_LAYOUT.keys).filter(
    (keyCode) =>
      JSON.stringify(layout.keys[keyCode]) !==
      JSON.stringify(QWERTY_LAYOUT.keys[keyCode]),
  );

  expect(actualDifferences).toEqual(expectedDifferences);

  Object.keys(QWERTY_LAYOUT.keys)
    .filter((keyCode) => !expectedDifferences.includes(keyCode))
    .forEach((keyCode) => {
      expect(layout.keys[keyCode]).toEqual(QWERTY_LAYOUT.keys[keyCode]);
      expect(layout.keys[keyCode]).not.toBe(QWERTY_LAYOUT.keys[keyCode]);
    });
}

describe("keyboard layouts", () => {
  it("constructs the German layout from shared keys with only Y and Z remapped", () => {
    expect(QWERTZ_LAYOUT.name).toBe("QWERTZ");
    expect(QWERTZ_LAYOUT.languages).toEqual(["de"]);
    expect(getLetterKeyOrder(QWERTZ_LAYOUT)).toEqual(
      Array.from("QWERTZUIOPASDFGHJKLYXCVBNM", (letter) => `Key${letter}`),
    );
    expectOnlyLetterDifferences(QWERTZ_LAYOUT, ["KeyY", "KeyZ"]);
    expect(QWERTZ_LAYOUT.keys.KeyZ).toEqual({ primary: "Y", secondary: "" });
    expect(QWERTZ_LAYOUT.keys.KeyY).toEqual({ primary: "Z", secondary: "" });
  });

  it("constructs the French layout from shared keys with A/Q and W/Z remapped", () => {
    expect(AZERTY_LAYOUT.name).toBe("AZERTY");
    expect(AZERTY_LAYOUT.languages).toEqual(["fr"]);
    expect(getLetterKeyOrder(AZERTY_LAYOUT)).toEqual(
      Array.from("AQZWERTYUIOPSDFGHJKLXCVBNM", (letter) => `Key${letter}`),
    );
    expectOnlyLetterDifferences(AZERTY_LAYOUT, [
      "KeyQ",
      "KeyW",
      "KeyA",
      "KeyZ",
    ]);
    expect(AZERTY_LAYOUT.keys.KeyA).toEqual({ primary: "Q", secondary: "" });
    expect(AZERTY_LAYOUT.keys.KeyQ).toEqual({ primary: "A", secondary: "" });
    expect(AZERTY_LAYOUT.keys.KeyZ).toEqual({ primary: "W", secondary: "" });
    expect(AZERTY_LAYOUT.keys.KeyW).toEqual({ primary: "Z", secondary: "" });
  });

  it("keeps language lookup and fallback behavior unchanged", () => {
    expect(getKeyboardLayout("de")).toBe(QWERTZ_LAYOUT);
    expect(getKeyboardLayout("fr")).toBe(AZERTY_LAYOUT);
    expect(getKeyboardLayout("en")).toBe(QWERTY_LAYOUT);
    expect(getKeyboardLayout("es")).toBe(QWERTY_LAYOUT);
    expect(getKeyboardLayout("unknown")).toBe(QWERTY_LAYOUT);
    expect(getLayoutName("de")).toBe("QWERTZ");
    expect(getLayoutName("fr")).toBe("AZERTY");
  });

  it("keeps smart key suggestions unchanged", () => {
    expect(SMART_SUGGESTIONS).toEqual({
      common: {
        category: "Common Keys",
        keys: ["Space", "F1", "F2", "F3", "F4", "Tab", "Enter", "Escape"],
      },
      movement: {
        category: "Movement",
        keys: [
          "KeyW",
          "KeyA",
          "KeyS",
          "KeyD",
          "Shift+KeyW",
          "Shift+KeyA",
          "Shift+KeyS",
          "Shift+KeyD",
        ],
      },
    });
  });
});
