export const PRIMARY_BINDSET = "Primary Bindset";

/** @typedef {"ctrl" | "alt" | "shift"} ModifierType */
/** @typedef {"L" | "R"} ModifierSide */
/** @typedef {Readonly<{ generation: number, revision: number }>} KeyCaptureSessionToken */

const MODIFIER_TYPES = new Set(["ctrl", "alt", "shift"]);
const MODIFIER_SIDES = new Set(["L", "R"]);

/** @returns {Record<ModifierType, ModifierSide>} */
function defaultModifierSides() {
  return { ctrl: "L", alt: "L", shift: "L" };
}

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** @param {unknown} value @returns {string | null} */
function optionalString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

/** @param {unknown} value @returns {string} */
function bindsetName(value) {
  return optionalString(value) ?? PRIMARY_BINDSET;
}

/** @param {unknown} value @returns {value is ModifierType} */
function isModifierType(value) {
  return typeof value === "string" && MODIFIER_TYPES.has(value);
}

/** @param {unknown} value @returns {value is ModifierSide} */
function isModifierSide(value) {
  return typeof value === "string" && MODIFIER_SIDES.has(value);
}

/**
 * Owns one key-capture modal draft without retaining transport, DOM, or caller
 * state. A generation identifies a modal session; revisions identify the exact
 * selected chord and destination within that session.
 */
export class KeyCaptureSession {
  #generation = 0;
  #revision = 0;
  #active = false;
  /** @type {string | null} */
  #selectedChord = null;
  #duplicationMode = false;
  /** @type {string | null} */
  #sourceKey = null;
  #capturing = false;
  #ignoreNextChord = false;
  #targetBindset = PRIMARY_BINDSET;
  /** @type {Record<ModifierType, ModifierSide>} */
  #lastModifierSide = defaultModifierSides();

  get generation() {
    return this.#generation;
  }

  get revision() {
    return this.#revision;
  }

  get active() {
    return this.#active;
  }

  get selectedChord() {
    return this.#selectedChord;
  }

  get duplicationMode() {
    return this.#duplicationMode;
  }

  get sourceKey() {
    return this.#sourceKey;
  }

  get capturing() {
    return this.#capturing;
  }

  get ignoreNextChord() {
    return this.#ignoreNextChord;
  }

  get targetBindset() {
    return this.#targetBindset;
  }

  /** @returns {Readonly<Record<ModifierType, ModifierSide>>} */
  get lastModifierSide() {
    return Object.freeze({ ...this.#lastModifierSide });
  }

  /**
   * @param {unknown} [options]
   * @returns {KeyCaptureSessionToken}
   */
  begin(options = {}) {
    const value = isRecord(options) ? options : {};
    const duplicationMode = value.duplicationMode === true;

    this.#generation += 1;
    this.#revision = 0;
    this.#active = true;
    this.#selectedChord = null;
    this.#duplicationMode = duplicationMode;
    this.#sourceKey = duplicationMode ? optionalString(value.sourceKey) : null;
    this.#capturing = false;
    this.#ignoreNextChord = false;
    this.#targetBindset = bindsetName(value.targetBindset);
    this.#lastModifierSide = defaultModifierSides();

    return this.token();
  }

  end() {
    this.#generation += 1;
    this.#revision = 0;
    this.#active = false;
    this.#selectedChord = null;
    this.#duplicationMode = false;
    this.#sourceKey = null;
    this.#capturing = false;
    this.#ignoreNextChord = false;
    this.#targetBindset = PRIMARY_BINDSET;
    this.#lastModifierSide = defaultModifierSides();
  }

  /** @returns {KeyCaptureSessionToken} */
  token() {
    return Object.freeze({
      generation: this.#generation,
      revision: this.#revision,
    });
  }

  /** @param {unknown} token */
  isCurrent(token) {
    if (!this.#active || !isRecord(token)) return false;
    return (
      token.generation === this.#generation && token.revision === this.#revision
    );
  }

  /** @param {unknown} chord */
  selectChord(chord) {
    if (!this.#active) return false;
    const selectedChord = optionalString(chord);
    if (selectedChord === this.#selectedChord) return false;

    this.#selectedChord = selectedChord;
    this.#revision += 1;
    return true;
  }

  /** @param {unknown} targetBindset */
  setTargetBindset(targetBindset) {
    if (!this.#active) return false;
    const nextTarget = bindsetName(targetBindset);
    if (nextTarget === this.#targetBindset) return false;

    this.#targetBindset = nextTarget;
    this.#revision += 1;
    return true;
  }

  startCapture() {
    if (!this.#active || this.#capturing) return false;
    this.#capturing = true;
    return true;
  }

  stopCapture() {
    if (!this.#active || !this.#capturing) return false;
    this.#capturing = false;
    return true;
  }

  markIgnoreNextChord() {
    if (!this.#active || this.#ignoreNextChord) return false;
    this.#ignoreNextChord = true;
    return true;
  }

  consumeIgnoreNextChord() {
    if (!this.#active || !this.#ignoreNextChord) return false;
    this.#ignoreNextChord = false;
    return true;
  }

  /** @param {unknown} modifier @param {unknown} side */
  setModifierSide(modifier, side) {
    if (
      !this.#active ||
      !isModifierType(modifier) ||
      !isModifierSide(side) ||
      this.#lastModifierSide[modifier] === side
    ) {
      return false;
    }

    this.#lastModifierSide = {
      ...this.#lastModifierSide,
      [modifier]: side,
    };
    return true;
  }
}
