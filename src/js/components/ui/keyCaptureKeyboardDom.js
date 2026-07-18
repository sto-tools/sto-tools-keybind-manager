import {
  getKeyboardLayout,
  KEY_POSITIONS,
  MOUSE_GESTURES,
} from "../../lib/keyboardLayouts.js";
import { escapeHtml } from "../../lib/htmlEscape.js";

/** @typedef {{ primary: string, secondary?: string, name?: string }} KeyboardKey */
/** @typedef {{ name: string, languages: string[], keys: Record<string, KeyboardKey> }} KeyboardLayout */
/** @typedef {{ keyCode: string, row: number, col: number, width: number }} PositionedKey */
/** @typedef {Record<number, PositionedKey[]>} KeyboardRows */

const mouseGestures =
  /** @type {Readonly<Record<string, { name: string, description: string }>>} */ (
    MOUSE_GESTURES
  );

/** @type {Readonly<Record<string, string>>} */
const COMMON_CHORD_KEY_CODES = Object.freeze({
  1: "Digit1",
  2: "Digit2",
  3: "Digit3",
  4: "Digit4",
  5: "Digit5",
  6: "Digit6",
  7: "Digit7",
  8: "Digit8",
  9: "Digit9",
  0: "Digit0",
  numpad0: "Numpad0",
  numpad1: "Numpad1",
  numpad2: "Numpad2",
  numpad3: "Numpad3",
  numpad4: "Numpad4",
  numpad5: "Numpad5",
  numpad6: "Numpad6",
  numpad7: "Numpad7",
  numpad8: "Numpad8",
  numpad9: "Numpad9",
  Add: "NumpadAdd",
  Subtract: "NumpadSubtract",
  Multiply: "NumpadMultiply",
  Divide: "NumpadDivide",
  Decimal: "NumpadDecimal",
  numpadenter: "NumpadEnter",
  A: "KeyA",
  B: "KeyB",
  C: "KeyC",
  D: "KeyD",
  E: "KeyE",
  F: "KeyF",
  G: "KeyG",
  H: "KeyH",
  I: "KeyI",
  J: "KeyJ",
  K: "KeyK",
  L: "KeyL",
  M: "KeyM",
  N: "KeyN",
  O: "KeyO",
  P: "KeyP",
  Q: "KeyQ",
  R: "KeyR",
  S: "KeyS",
  T: "KeyT",
  U: "KeyU",
  V: "KeyV",
  W: "KeyW",
  X: "KeyX",
  Y: "KeyY",
  Z: "KeyZ",
  Space: "Space",
  Tab: "Tab",
  Escape: "Escape",
  F1: "F1",
  F2: "F2",
  F3: "F3",
  F4: "F4",
  F5: "F5",
  F6: "F6",
  F7: "F7",
  F8: "F8",
  F9: "F9",
  F10: "F10",
  F11: "F11",
  F12: "F12",
});

/**
 * Match owner-provided codes as attribute data, never as selector syntax. The
 * structural lookup also works when the injected document belongs to another
 * Window realm.
 *
 * @param {Document} document
 * @param {string} keyCode
 * @returns {Element | null}
 */
function findKeyCaptureElement(document, keyCode) {
  for (const element of document.querySelectorAll("[data-key-code]")) {
    if (element.getAttribute("data-key-code") === keyCode) return element;
  }
  return null;
}

/** @param {string} layoutName @returns {KeyboardLayout} */
export function loadKeyCaptureKeyboard(layoutName) {
  return structuredClone(getKeyboardLayout(layoutName || "en"));
}

/**
 * @param {PositionedKey} key
 * @param {KeyboardLayout} keyboard
 */
function renderKey(key, keyboard) {
  let keyInfo = keyboard.keys[key.keyCode];
  if (!keyInfo && mouseGestures[key.keyCode]) {
    keyInfo = { primary: mouseGestures[key.keyCode].name, secondary: "" };
  }
  if (!keyInfo) keyInfo = { primary: key.keyCode, secondary: "" };

  return `
    <button class="vkey" data-key-code="${escapeHtml(key.keyCode)}" data-row="${key.row}" data-col="${key.col}">
      <span class="key-primary">${escapeHtml(keyInfo.primary)}</span>
      ${keyInfo.secondary ? `<span class="key-secondary">${escapeHtml(keyInfo.secondary)}</span>` : ""}
    </button>
  `;
}

/**
 * @param {KeyboardRows} rows
 * @param {KeyboardLayout} keyboard
 * @param {number} maxRow
 * @param {'main' | 'nav' | 'numpad' | 'mouse'} type
 */
function renderColumn(rows, keyboard, maxRow, type) {
  const expectedMouseColumns = [22, 23, 24, 25, 26, 27];
  let html = "";

  for (let rowIndex = 0; rowIndex <= maxRow; rowIndex += 1) {
    const keys = [...(rows[rowIndex] || [])].sort(
      (left, right) => left.col - right.col,
    );
    let rowHtml = "";

    if (type === "numpad") {
      if (rowIndex === 1) {
        rowHtml +=
          '<div class="vkey placeholder" style="flex:0 0 2.5rem; height:2.5rem;"></div>';
        for (const key of keys) rowHtml += renderKey(key, keyboard);
      } else {
        for (let column = 17; column <= 20; column += 1) {
          const key = keys.find((candidate) => candidate.col === column);
          if (!key) {
            rowHtml += '<div class="vkey placeholder"></div>';
            continue;
          }
          rowHtml += renderKey(key, keyboard);
          if (key.width > 1) column += key.width - 1;
        }
      }
    } else if (type === "mouse") {
      rowHtml = expectedMouseColumns
        .map((column) => {
          const key = keys.find((candidate) => candidate.col === column);
          return key
            ? renderKey(key, keyboard)
            : '<div class="vkey placeholder"></div>';
        })
        .join("");
    } else if (type === "nav") {
      if (rowIndex === 4) {
        rowHtml +=
          '<div class="vkey placeholder" style="flex:0 0 2.5rem; height:2.5rem;"></div>';
      }
      for (const key of keys) rowHtml += renderKey(key, keyboard);
    } else if (keys.length > 0) {
      let column = keys[0].col;
      for (const key of keys) {
        if (key.col > column) {
          const gapWidth = (key.col - column) * 2.5;
          rowHtml += `<div class="vkey placeholder" style="flex:0 0 ${gapWidth}rem; height:2.5rem;"></div>`;
        }
        rowHtml += renderKey(key, keyboard);
        column = key.col + (key.width || 1);
      }
    }

    html += `<div class="keyboard-row">${rowHtml}</div>`;
  }
  return html;
}

/**
 * @param {Document} document
 * @param {KeyboardLayout | null} keyboard
 * @returns {boolean}
 */
export function renderKeyCaptureKeyboard(document, keyboard) {
  const container = document.getElementById("virtualKeyboard");
  if (!container || !keyboard) return false;

  /** @type {KeyboardRows} */
  const mainRows = {};
  /** @type {KeyboardRows} */
  const navigationRows = {};
  /** @type {KeyboardRows} */
  const numpadRows = {};
  /** @type {KeyboardRows} */
  const mouseRows = {};

  for (const [keyCode, position] of Object.entries(KEY_POSITIONS)) {
    const rows =
      position.col >= 22
        ? mouseRows
        : position.col >= 17
          ? numpadRows
          : position.col >= 14
            ? navigationRows
            : mainRows;
    (rows[position.row] ||= []).push({ keyCode, ...position });
  }

  const maxRow = Math.max(
    ...Object.values(KEY_POSITIONS).map(({ row }) => row),
  );
  container.innerHTML = `
    <div class="keyboard-columns">
      <div class="keyboard-column main">${renderColumn(mainRows, keyboard, maxRow, "main")}</div>
      <div class="keyboard-column nav">${renderColumn(navigationRows, keyboard, maxRow, "nav")}</div>
      <div class="keyboard-column numpad">${renderColumn(numpadRows, keyboard, maxRow, "numpad")}</div>
      <div class="keyboard-column mouse">${renderColumn(mouseRows, keyboard, maxRow, "mouse")}</div>
    </div>
  `;
  return true;
}

/**
 * @param {string} keyCode
 * @param {KeyboardLayout | null} keyboard
 * @returns {string}
 */
export function keyCaptureDisplayName(keyCode, keyboard) {
  if (keyCode.startsWith("Numpad")) {
    const digit = keyCode.match(/^Numpad(\d)$/);
    if (digit) return `numpad${digit[1]}`;
    /** @type {Record<string, string>} */
    const names = {
      Add: "Add",
      Subtract: "Subtract",
      Multiply: "Multiply",
      Divide: "Divide",
      Decimal: "Decimal",
      Enter: "numpadenter",
    };
    const suffix = keyCode.slice("Numpad".length);
    return names[suffix] || keyCode;
  }

  const key = keyboard?.keys[keyCode];
  return key ? key.name || key.primary : keyCode.replace(/^Key|^Digit/, "");
}

/** @param {Document} document @param {Set<string>} highlightedKeys */
export function clearKeyCaptureHighlights(document, highlightedKeys) {
  for (const keyCode of highlightedKeys) {
    findKeyCaptureElement(document, keyCode)?.classList.remove(
      "pressed",
      "selected",
    );
  }
  highlightedKeys.clear();
}

/**
 * @param {Document} document
 * @param {Set<string>} highlightedKeys
 * @param {string} keyCode
 * @param {'pressed' | 'selected'} className
 */
export function highlightKeyCaptureKey(
  document,
  highlightedKeys,
  keyCode,
  className = "selected",
) {
  const element = findKeyCaptureElement(document, keyCode);
  if (!element) return false;
  element.classList.add(className);
  highlightedKeys.add(keyCode);
  return true;
}

/**
 * @param {Document} document
 * @param {Set<string>} highlightedKeys
 * @param {readonly string[]} codes
 */
export function projectPressedKeyCaptureKeys(document, highlightedKeys, codes) {
  clearKeyCaptureHighlights(document, highlightedKeys);
  for (const code of codes || []) {
    highlightKeyCaptureKey(document, highlightedKeys, code, "pressed");
  }
}

/**
 * @param {{
 *   document: Document,
 *   highlightedKeys: Set<string>,
 *   chord: string,
 *   keyboard: KeyboardLayout | null,
 *   distinguishSides: boolean
 * }} options
 */
export function projectSelectedKeyCaptureChord({
  document,
  highlightedKeys,
  chord,
  keyboard,
  distinguishSides,
}) {
  clearKeyCaptureHighlights(document, highlightedKeys);
  if (!chord) return;

  for (const part of chord.split("+")) {
    if (part === "Ctrl" && !distinguishSides) {
      highlightKeyCaptureKey(document, highlightedKeys, "ControlLeft");
      highlightKeyCaptureKey(document, highlightedKeys, "ControlRight");
      continue;
    }
    if (part === "Alt" && !distinguishSides) {
      highlightKeyCaptureKey(document, highlightedKeys, "AltLeft");
      highlightKeyCaptureKey(document, highlightedKeys, "AltRight");
      continue;
    }
    if (part === "Shift" && !distinguishSides) {
      highlightKeyCaptureKey(document, highlightedKeys, "ShiftLeft");
      highlightKeyCaptureKey(document, highlightedKeys, "ShiftRight");
      continue;
    }

    /** @type {Record<string, string>} */
    const modifierCodes = {
      LCTRL: "ControlLeft",
      RCTRL: "ControlRight",
      LALT: "AltLeft",
      RALT: "AltRight",
      LSHIFT: "ShiftLeft",
      RSHIFT: "ShiftRight",
      Ctrl: "ControlLeft",
      Alt: "AltLeft",
      Shift: "ShiftLeft",
    };
    const modifierCode = modifierCodes[part];
    if (modifierCode) {
      highlightKeyCaptureKey(document, highlightedKeys, modifierCode);
      continue;
    }

    let targetCode = null;
    for (const [code, key] of Object.entries(keyboard?.keys || {})) {
      if (key.primary === part || key.secondary === part) {
        targetCode = code;
        break;
      }
    }
    targetCode ||= COMMON_CHORD_KEY_CODES[part] || null;
    if (targetCode) {
      highlightKeyCaptureKey(document, highlightedKeys, targetCode);
    }
  }
}
