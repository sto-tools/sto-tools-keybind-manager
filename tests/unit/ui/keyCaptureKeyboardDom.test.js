import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  clearKeyCaptureHighlights,
  highlightKeyCaptureKey,
  keyCaptureDisplayName,
  loadKeyCaptureKeyboard,
  projectPressedKeyCaptureKeys,
  projectSelectedKeyCaptureChord,
  renderKeyCaptureKeyboard,
} from "../../../src/js/components/ui/keyCaptureKeyboardDom.js";

describe("keyCaptureKeyboardDom", () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="virtualKeyboard"></div>';
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("loads detached keyboard layouts and defaults absent names", () => {
    const first = loadKeyCaptureKeyboard("de");
    const second = loadKeyCaptureKeyboard("de");
    first.keys.KeyY.primary = "changed";

    expect(second.keys.KeyY.primary).not.toBe("changed");
    expect(loadKeyCaptureKeyboard("").keys.KeyQ.primary).toBe("Q");
  });

  it("renders the four shipped keyboard columns without listeners", () => {
    const keyboard = loadKeyCaptureKeyboard("en");

    expect(renderKeyCaptureKeyboard(document, keyboard)).toBe(true);

    const columns = document.querySelectorAll(".keyboard-column");
    expect(columns).toHaveLength(4);
    expect(
      document.querySelector('[data-key-code="KeyA"] .key-primary')
        ?.textContent,
    ).toBe("A");
    expect(document.querySelector('[data-key-code="Numpad1"]')).not.toBeNull();
    expect(document.querySelector('[data-key-code="lclick"]')).not.toBeNull();
    expect(document.querySelectorAll(".keyboard-row").length).toBeGreaterThan(
      4,
    );
  });

  it("reports an absent container or keyboard without mutating the document", () => {
    expect(renderKeyCaptureKeyboard(document, null)).toBe(false);
    document.getElementById("virtualKeyboard").remove();
    expect(
      renderKeyCaptureKeyboard(document, loadKeyCaptureKeyboard("en")),
    ).toBe(false);
  });

  it.each([
    ["Numpad7", "numpad7"],
    ["NumpadAdd", "Add"],
    ["NumpadEnter", "numpadenter"],
    ["NumpadUnknown", "NumpadUnknown"],
    ["KeyQ", "Q"],
    ["Digit4", "4"],
    ["CustomCode", "CustomCode"],
  ])("maps %s to its STO display name", (keyCode, expected) => {
    expect(keyCaptureDisplayName(keyCode, loadKeyCaptureKeyboard("en"))).toBe(
      expected,
    );
  });

  it("projects pressed keys after clearing the predecessor projection", () => {
    const keyboard = loadKeyCaptureKeyboard("en");
    renderKeyCaptureKeyboard(document, keyboard);
    const highlighted = new Set();

    projectPressedKeyCaptureKeys(document, highlighted, [
      "ControlLeft",
      "KeyA",
    ]);
    expect(
      document.querySelector('[data-key-code="ControlLeft"]').classList,
    ).toContain("pressed");
    expect(
      document.querySelector('[data-key-code="KeyA"]').classList,
    ).toContain("pressed");

    projectPressedKeyCaptureKeys(document, highlighted, ["KeyB"]);
    expect(
      document.querySelector('[data-key-code="ControlLeft"]').classList,
    ).not.toContain("pressed");
    expect(
      document.querySelector('[data-key-code="KeyA"]').classList,
    ).not.toContain("pressed");
    expect(
      document.querySelector('[data-key-code="KeyB"]').classList,
    ).toContain("pressed");
    expect([...highlighted]).toEqual(["KeyB"]);
  });

  it("treats selector metacharacters in owner codes as exact attribute data", () => {
    const keyCode = 'Quote"]\\#';
    const key = document.createElement("button");
    key.setAttribute("data-key-code", keyCode);
    document.getElementById("virtualKeyboard").appendChild(key);
    const highlighted = new Set();

    expect(() =>
      projectPressedKeyCaptureKeys(document, highlighted, [keyCode]),
    ).not.toThrow();
    expect(key.classList).toContain("pressed");
    expect([...highlighted]).toEqual([keyCode]);

    expect(() =>
      projectPressedKeyCaptureKeys(document, highlighted, []),
    ).not.toThrow();
    expect(key.classList).not.toContain("pressed");
    expect(highlighted.size).toBe(0);
  });

  it("projects generic modifiers on both sides and maps a regular key", () => {
    const keyboard = loadKeyCaptureKeyboard("en");
    renderKeyCaptureKeyboard(document, keyboard);
    const highlighted = new Set();

    projectSelectedKeyCaptureChord({
      document,
      highlightedKeys: highlighted,
      chord: "Ctrl+Shift+A",
      keyboard,
      distinguishSides: false,
    });

    for (const code of [
      "ControlLeft",
      "ControlRight",
      "ShiftLeft",
      "ShiftRight",
      "KeyA",
    ]) {
      expect(
        document.querySelector(`[data-key-code="${code}"]`).classList,
      ).toContain("selected");
    }
  });

  it("projects exact modifier sides, numpad names, and layout labels", () => {
    const keyboard = loadKeyCaptureKeyboard("fr");
    renderKeyCaptureKeyboard(document, keyboard);
    const highlighted = new Set();

    projectSelectedKeyCaptureChord({
      document,
      highlightedKeys: highlighted,
      chord: "RCTRL+Q+numpad2",
      keyboard,
      distinguishSides: true,
    });

    expect(
      document.querySelector('[data-key-code="ControlRight"]').classList,
    ).toContain("selected");
    expect(
      document.querySelector('[data-key-code="ControlLeft"]').classList,
    ).not.toContain("selected");
    expect(
      document.querySelector('[data-key-code="KeyA"]').classList,
    ).toContain("selected");
    expect(
      document.querySelector('[data-key-code="Numpad2"]').classList,
    ).toContain("selected");
  });

  it("clears tracked classes and tolerates keys absent from the current layout", () => {
    const keyboard = loadKeyCaptureKeyboard("en");
    renderKeyCaptureKeyboard(document, keyboard);
    const highlighted = new Set(["Missing"]);

    expect(
      highlightKeyCaptureKey(document, highlighted, "KeyC", "selected"),
    ).toBe(true);
    expect(
      highlightKeyCaptureKey(document, highlighted, "NotRendered", "pressed"),
    ).toBe(false);
    clearKeyCaptureHighlights(document, highlighted);

    expect(
      document.querySelector('[data-key-code="KeyC"]').classList,
    ).not.toContain("selected");
    expect(highlighted.size).toBe(0);
  });

  it("clears predecessor highlights for an empty selected chord", () => {
    const keyboard = loadKeyCaptureKeyboard("en");
    renderKeyCaptureKeyboard(document, keyboard);
    const highlighted = new Set();
    highlightKeyCaptureKey(document, highlighted, "KeyF", "selected");

    projectSelectedKeyCaptureChord({
      document,
      highlightedKeys: highlighted,
      chord: "",
      keyboard,
      distinguishSides: false,
    });

    expect(highlighted.size).toBe(0);
    expect(
      document.querySelector('[data-key-code="KeyF"]').classList,
    ).not.toContain("selected");
  });
});
