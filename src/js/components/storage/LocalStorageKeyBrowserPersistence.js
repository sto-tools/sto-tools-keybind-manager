import ScopedLocalStorage from "./scopedLocalStorage.js";
import { decodeKeyViewMode } from "../services/keyBrowserViewState.js";

const SUFFIX = "_collapsed";
const MODE_KEY = "keyViewMode";

/** @typedef {import('./KeyBrowserPersistencePort.js').KeyBrowserPersistencePort} KeyBrowserPersistencePort */
/** @implements {KeyBrowserPersistencePort} */
export default class LocalStorageKeyBrowserPersistence {
  #storage;

  /** @param {{storage: import('./scopedLocalStorage.js').ScalarStorageCapability}} options */
  constructor({ storage }) {
    this.#storage = new ScopedLocalStorage({
      storage,
      exactKeys: [MODE_KEY],
      prefixes: ["keyCategory_", "keyTypeCategory_", "bindsetSection_"].map(
        (prefix) => ({ prefix, suffix: "_collapsed", allowEmptyName: true }),
      ),
    });
  }

  /** @returns {import('./KeyBrowserPersistencePort.js').KeyBrowserPersistenceSnapshot} */
  load() {
    /** @type {string[]} */
    const command = [];
    /** @type {string[]} */
    const keyType = [];
    /** @type {string[]} */
    const collapsedBindsets = [];
    for (const key of this.#storage.keys()) {
      if (key === MODE_KEY || this.#storage.getItem(key) !== "true") continue;
      if (key.startsWith("keyCategory_")) {
        command.push(key.slice("keyCategory_".length, -SUFFIX.length));
      } else if (key.startsWith("keyTypeCategory_")) {
        keyType.push(key.slice("keyTypeCategory_".length, -SUFFIX.length));
      } else {
        collapsedBindsets.push(
          key.slice("bindsetSection_".length, -SUFFIX.length),
        );
      }
    }
    const mode = decodeKeyViewMode(this.#storage.getItem(MODE_KEY));
    const collapsedCategories = {
      command: command.sort(),
      keyType: keyType.sort(),
    };
    collapsedBindsets.sort();
    return { mode, collapsedCategories, collapsedBindsets };
  }

  /** @param {import('./KeyBrowserPersistencePort.js').KeyViewMode} mode */
  replaceMode(mode) {
    if (mode !== "grid" && mode !== "categorized" && mode !== "key-types") {
      throw new TypeError("invalid_key_view_mode");
    }
    this.#storage.setItem(MODE_KEY, mode);
  }

  /** @param {string} categoryId @param {string} mode @param {boolean} collapsed */
  replaceCategory(categoryId, mode, collapsed) {
    this.#assertCategory(categoryId, mode);
    this.#assertCollapsed(collapsed);
    if (categoryId === "") return;
    this.#storage.setItem(
      this.#categoryKey(categoryId, mode),
      String(collapsed),
    );
  }

  /** @param {string} bindsetName @param {boolean} collapsed */
  replaceBindset(bindsetName, collapsed) {
    this.#assertName(bindsetName);
    this.#assertCollapsed(collapsed);
    if (bindsetName === "") return;
    this.#storage.setItem(
      `bindsetSection_${bindsetName}${SUFFIX}`,
      String(collapsed),
    );
  }

  /** @param {string} categoryId @param {string} mode */
  isCategoryCollapsed(categoryId, mode) {
    this.#assertCategory(categoryId, mode);
    return (
      categoryId !== "" &&
      this.#storage.getItem(this.#categoryKey(categoryId, mode)) === "true"
    );
  }

  /** @param {string} bindsetName */
  isBindsetCollapsed(bindsetName) {
    this.#assertName(bindsetName);
    return (
      bindsetName !== "" &&
      this.#storage.getItem(`bindsetSection_${bindsetName}${SUFFIX}`) === "true"
    );
  }

  /** @param {unknown} name */
  #assertName(name) {
    if (typeof name !== "string")
      throw new TypeError("invalid_key_browser_name");
  }

  /** @param {string} categoryId @param {string} mode */
  #categoryKey(categoryId, mode) {
    const prefix = mode === "key-type" ? "keyTypeCategory_" : "keyCategory_";
    return `${prefix}${categoryId}${SUFFIX}`;
  }

  /** @param {unknown} categoryId @param {unknown} mode */
  #assertCategory(categoryId, mode) {
    this.#assertName(categoryId);
    if (typeof mode !== "string") throw new TypeError("invalid_category_mode");
  }

  /** @param {unknown} collapsed */
  #assertCollapsed(collapsed) {
    if (typeof collapsed !== "boolean") {
      throw new TypeError("invalid_key_browser_collapse");
    }
  }
}
