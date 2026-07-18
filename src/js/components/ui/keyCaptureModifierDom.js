/** @typedef {'ctrl' | 'alt' | 'shift'} KeyCaptureModifierType */
/** @typedef {'L' | 'R'} KeyCaptureModifierSide */
/** @typedef {'ControlLeft' | 'ControlRight' | 'AltLeft' | 'AltRight' | 'ShiftLeft' | 'ShiftRight'} KeyCaptureModifierCode */
/** @typedef {'LCTRL' | 'RCTRL' | 'LALT' | 'RALT' | 'LSHIFT' | 'RSHIFT'} KeyCaptureSpecificModifierName */
/** @typedef {{ ctrl: KeyCaptureModifierSide, alt: KeyCaptureModifierSide, shift: KeyCaptureModifierSide }} KeyCaptureModifierSides */
/**
 * @typedef {{
 *   code: KeyCaptureModifierCode,
 *   type: KeyCaptureModifierType,
 *   side: KeyCaptureModifierSide,
 *   specificName: KeyCaptureSpecificModifierName
 * }} KeyCaptureModifierDescriptor
 */

/** @type {readonly KeyCaptureModifierType[]} */
const MODIFIER_TYPE_ORDER = Object.freeze(["ctrl", "alt", "shift"]);

/** @type {readonly KeyCaptureModifierCode[]} */
const MODIFIER_CODE_ORDER = Object.freeze([
  "ControlLeft",
  "ControlRight",
  "AltLeft",
  "AltRight",
  "ShiftLeft",
  "ShiftRight",
]);

/** @type {Readonly<Record<KeyCaptureModifierType, Readonly<Record<KeyCaptureModifierSide, KeyCaptureModifierCode>>>>} */
const MODIFIER_CODES = Object.freeze({
  ctrl: Object.freeze({ L: "ControlLeft", R: "ControlRight" }),
  alt: Object.freeze({ L: "AltLeft", R: "AltRight" }),
  shift: Object.freeze({ L: "ShiftLeft", R: "ShiftRight" }),
});

/** @type {Readonly<Record<KeyCaptureModifierCode, Readonly<KeyCaptureModifierDescriptor>>>} */
const MODIFIER_DESCRIPTORS = Object.freeze({
  ControlLeft: Object.freeze({
    code: "ControlLeft",
    type: "ctrl",
    side: "L",
    specificName: "LCTRL",
  }),
  ControlRight: Object.freeze({
    code: "ControlRight",
    type: "ctrl",
    side: "R",
    specificName: "RCTRL",
  }),
  AltLeft: Object.freeze({
    code: "AltLeft",
    type: "alt",
    side: "L",
    specificName: "LALT",
  }),
  AltRight: Object.freeze({
    code: "AltRight",
    type: "alt",
    side: "R",
    specificName: "RALT",
  }),
  ShiftLeft: Object.freeze({
    code: "ShiftLeft",
    type: "shift",
    side: "L",
    specificName: "LSHIFT",
  }),
  ShiftRight: Object.freeze({
    code: "ShiftRight",
    type: "shift",
    side: "R",
    specificName: "RSHIFT",
  }),
});

/** @param {unknown} value @returns {Readonly<KeyCaptureModifierDescriptor> | null} */
function descriptorForCode(value) {
  switch (value) {
    case "ControlLeft":
    case "ControlRight":
    case "AltLeft":
    case "AltRight":
    case "ShiftLeft":
    case "ShiftRight":
      return MODIFIER_DESCRIPTORS[value];
    default:
      return null;
  }
}

/** @param {unknown} value @returns {Readonly<KeyCaptureModifierDescriptor> | null} */
function descriptorForSpecificName(value) {
  switch (value) {
    case "LCTRL":
      return MODIFIER_DESCRIPTORS.ControlLeft;
    case "RCTRL":
      return MODIFIER_DESCRIPTORS.ControlRight;
    case "LALT":
      return MODIFIER_DESCRIPTORS.AltLeft;
    case "RALT":
      return MODIFIER_DESCRIPTORS.AltRight;
    case "LSHIFT":
      return MODIFIER_DESCRIPTORS.ShiftLeft;
    case "RSHIFT":
      return MODIFIER_DESCRIPTORS.ShiftRight;
    default:
      return null;
  }
}

/** @param {unknown} value @returns {value is KeyCaptureModifierType} */
function isModifierType(value) {
  return value === "ctrl" || value === "alt" || value === "shift";
}

/** @param {unknown} value @returns {value is KeyCaptureModifierSide} */
function isModifierSide(value) {
  return value === "L" || value === "R";
}

/**
 * Resolve only the six supported DOM codes. The returned descriptor is detached
 * from the module's closed table.
 *
 * @param {unknown} keyCode
 * @returns {KeyCaptureModifierDescriptor | null}
 */
export function getKeyCaptureModifierDescriptor(keyCode) {
  const descriptor = descriptorForCode(keyCode);
  return descriptor ? { ...descriptor } : null;
}

/**
 * @param {unknown} type
 * @param {unknown} side
 * @returns {KeyCaptureModifierCode | null}
 */
export function getKeyCaptureModifierCode(type, side) {
  if (!isModifierType(type) || !isModifierSide(side)) return null;
  return MODIFIER_CODES[type][side];
}

/** @param {Document | null | undefined} document @param {KeyCaptureModifierCode} keyCode */
function modifierElement(document, keyCode) {
  return document?.querySelector(`[data-key-code="${keyCode}"]`) || null;
}

/**
 * Remove only the virtual modifier activity class. Selected/pressed projection
 * remains owned by the injected keyboard-highlighting path.
 *
 * @param {Document | null | undefined} document
 * @returns {KeyCaptureModifierCode[]} codes that were active before clearing
 */
export function clearKeyCaptureModifierActive(document) {
  /** @type {KeyCaptureModifierCode[]} */
  const activeCodes = [];
  for (const keyCode of MODIFIER_CODE_ORDER) {
    const element = modifierElement(document, keyCode);
    if (element?.classList.contains("modifier-active")) {
      activeCodes.push(keyCode);
    }
    element?.classList.remove("modifier-active");
  }
  return activeCodes;
}

/**
 * Read active modifiers in stable Ctrl, Alt, Shift order. Side-specific mode
 * retains left-before-right ordering; generic mode emits each type once.
 *
 * @param {Document | null | undefined} document
 * @param {boolean} distinguishSides
 * @param {(key: KeyCaptureModifierType) => string} translate
 * @returns {string[]}
 */
export function readActiveKeyCaptureModifiers(
  document,
  distinguishSides,
  translate,
) {
  /** @type {string[]} */
  const names = [];
  for (const type of MODIFIER_TYPE_ORDER) {
    const left = MODIFIER_CODES[type].L;
    const right = MODIFIER_CODES[type].R;
    const leftActive = modifierElement(document, left)?.classList.contains(
      "modifier-active",
    );
    const rightActive = modifierElement(document, right)?.classList.contains(
      "modifier-active",
    );

    if (distinguishSides) {
      if (leftActive) names.push(MODIFIER_DESCRIPTORS[left].specificName);
      if (rightActive) names.push(MODIFIER_DESCRIPTORS[right].specificName);
    } else if (leftActive || rightActive) {
      names.push(translate(type));
    }
  }
  return names;
}

/**
 * Toggle one closed modifier code. Clearing every type before activation
 * preserves the legacy invariant that only one modifier type can be active.
 *
 * @param {Document | null | undefined} document
 * @param {unknown} keyCode
 * @param {boolean} distinguishSides
 * @returns {{ handled: boolean, active: boolean, type: KeyCaptureModifierType | null, side: KeyCaptureModifierSide | null, activeCodes: KeyCaptureModifierCode[] }}
 */
export function toggleKeyCaptureModifier(document, keyCode, distinguishSides) {
  const descriptor = descriptorForCode(keyCode);
  if (!descriptor) {
    return {
      handled: false,
      active: false,
      type: null,
      side: null,
      activeCodes: [],
    };
  }

  const wasActive = Boolean(
    modifierElement(document, descriptor.code)?.classList.contains(
      "modifier-active",
    ),
  );
  clearKeyCaptureModifierActive(document);

  /** @type {KeyCaptureModifierCode[]} */
  const activeCodes = [];
  if (!wasActive) {
    const targets = distinguishSides
      ? [descriptor.code]
      : [MODIFIER_CODES[descriptor.type].L, MODIFIER_CODES[descriptor.type].R];
    for (const target of targets) {
      const element = modifierElement(document, target);
      if (!element) continue;
      element.classList.add("modifier-active");
      activeCodes.push(target);
    }
  }

  return {
    handled: true,
    active: activeCodes.length > 0,
    type: descriptor.type,
    side: descriptor.side,
    activeCodes,
  };
}

/** @param {unknown} part */
function isChordModifier(part) {
  return (
    part === "Ctrl" ||
    part === "Alt" ||
    part === "Shift" ||
    descriptorForSpecificName(part) !== null
  );
}

/**
 * Exact preview guard used by modifier toggling and reprojection.
 *
 * @param {unknown} chord
 * @returns {boolean}
 */
export function keyCaptureChordHasNonModifier(chord) {
  return (
    typeof chord === "string" &&
    chord.split("+").some((part) => part.length > 0 && !isChordModifier(part))
  );
}

/** @param {unknown} candidate @returns {KeyCaptureModifierSides} */
export function cloneKeyCaptureModifierSides(candidate) {
  if (!candidate || typeof candidate !== "object") {
    return { ctrl: "L", alt: "L", shift: "L" };
  }

  /** @type {Record<string, unknown>} */
  const record = /** @type {Record<string, unknown>} */ (candidate);
  /** @param {KeyCaptureModifierType} type */
  const readSide = (type) => {
    try {
      const value = Object.hasOwn(record, type) ? record[type] : undefined;
      return isModifierSide(value) ? value : "L";
    } catch {
      return "L";
    }
  };
  return {
    ctrl: readSide("ctrl"),
    alt: readSide("alt"),
    shift: readSide("shift"),
  };
}

/**
 * Remember a virtual-key click without retaining or mutating the prior record.
 *
 * @param {unknown} priorSides
 * @param {unknown} keyCode
 * @returns {KeyCaptureModifierSides}
 */
export function rememberKeyCaptureModifierSide(priorSides, keyCode) {
  const next = cloneKeyCaptureModifierSides(priorSides);
  const descriptor = descriptorForCode(keyCode);
  if (descriptor) next[descriptor.type] = descriptor.side;
  return next;
}

/**
 * Remember every exact location-specific chord part in source order. If both
 * sides of one type occur, the last part retains the shipped last-wins rule.
 *
 * @param {unknown} priorSides
 * @param {unknown} chord
 * @returns {KeyCaptureModifierSides}
 */
export function rememberKeyCaptureModifierSidesFromChord(priorSides, chord) {
  const next = cloneKeyCaptureModifierSides(priorSides);
  if (typeof chord !== "string") return next;
  for (const part of chord.split("+")) {
    const descriptor = descriptorForSpecificName(part);
    if (descriptor) next[descriptor.type] = descriptor.side;
  }
  return next;
}

/**
 * Convert between the exact generic and STO location-specific chord spellings.
 *
 * @param {unknown} chord
 * @param {boolean} useLocationSpecific
 * @param {unknown} lastModifierSides
 * @returns {string}
 */
export function convertKeyCaptureChordModifiers(
  chord,
  useLocationSpecific,
  lastModifierSides,
) {
  if (typeof chord !== "string") return "";
  const sides = cloneKeyCaptureModifierSides(lastModifierSides);
  if (useLocationSpecific) {
    return chord
      .replace(/\bCtrl\b/g, sides.ctrl === "R" ? "RCTRL" : "LCTRL")
      .replace(/\bAlt\b/g, sides.alt === "R" ? "RALT" : "LALT")
      .replace(/\bShift\b/g, sides.shift === "R" ? "RSHIFT" : "LSHIFT");
  }
  return chord
    .replace(/\bLCTRL\b/g, "Ctrl")
    .replace(/\bRCTRL\b/g, "Ctrl")
    .replace(/\bLALT\b/g, "Alt")
    .replace(/\bRALT\b/g, "Alt")
    .replace(/\bLSHIFT\b/g, "Shift")
    .replace(/\bRSHIFT\b/g, "Shift");
}

/**
 * Reproject the active DOM snapshot after the side-distinction option changes.
 * Side-specific mode delegates the chosen side to the existing selected-key
 * highlighter; generic mode restores `modifier-active` on both sides.
 *
 * @param {{
 *   document: Document | null | undefined,
 *   distinguishSides: boolean,
 *   lastModifierSides: unknown,
 *   highlightKey: (keyCode: KeyCaptureModifierCode) => unknown
 * }} options
 * @returns {{ activeBefore: KeyCaptureModifierCode[], projected: KeyCaptureModifierCode[] }}
 */
export function reprojectKeyCaptureModifierHighlighting({
  document,
  distinguishSides,
  lastModifierSides,
  highlightKey,
}) {
  const activeBefore = clearKeyCaptureModifierActive(document);
  /** @type {KeyCaptureModifierCode[]} */
  const projected = [];
  if (activeBefore.length === 0) return { activeBefore, projected };

  const activeSet = new Set(activeBefore);
  const sides = cloneKeyCaptureModifierSides(lastModifierSides);
  if (distinguishSides) {
    /** @type {Set<KeyCaptureModifierType>} */
    const handledTypes = new Set();
    for (const activeCode of activeBefore) {
      const descriptor = MODIFIER_DESCRIPTORS[activeCode];
      if (handledTypes.has(descriptor.type)) continue;

      const preferred = MODIFIER_CODES[descriptor.type][sides[descriptor.type]];
      const alternate =
        MODIFIER_CODES[descriptor.type][
          sides[descriptor.type] === "L" ? "R" : "L"
        ];
      const chosen = activeSet.has(preferred) ? preferred : alternate;
      const other =
        chosen === MODIFIER_CODES[descriptor.type].L
          ? MODIFIER_CODES[descriptor.type].R
          : MODIFIER_CODES[descriptor.type].L;
      modifierElement(document, other)?.classList.remove("selected");
      highlightKey(chosen);
      projected.push(chosen);
      handledTypes.add(descriptor.type);
    }
  } else {
    /** @type {Set<KeyCaptureModifierType>} */
    const activeTypes = new Set();
    for (const activeCode of activeBefore) {
      activeTypes.add(MODIFIER_DESCRIPTORS[activeCode].type);
    }
    for (const type of MODIFIER_TYPE_ORDER) {
      if (!activeTypes.has(type)) continue;
      for (const side of /** @type {const} */ (["L", "R"])) {
        const keyCode = MODIFIER_CODES[type][side];
        const element = modifierElement(document, keyCode);
        if (!element) continue;
        element.classList.add("modifier-active");
        projected.push(keyCode);
      }
    }
  }

  return { activeBefore, projected };
}
