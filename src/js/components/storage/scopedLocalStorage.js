/**
 * Private implementation shared only by the four concrete scalar adapters.
 * This is not an owner-facing persistence port or a public storage helper.
 * @typedef {{getItem: (key: string) => string | null, setItem?: (key: string, value: string) => void, removeItem?: (key: string) => void, readonly length?: number, key?: (index: number) => string | null}} ScalarStorageCapability
 * @typedef {{prefix: string, suffix: string, allowEmptyName?: boolean}} PrefixPolicy
 */
export default class ScopedLocalStorage {
  /** @type {ScalarStorageCapability} */
  #storage;
  /** @type {readonly string[]} */
  #exactKeys;
  /** @type {readonly Readonly<PrefixPolicy>[]} */
  #prefixes;
  /** @type {boolean} */
  #readOnly;

  /** @param {{storage: ScalarStorageCapability, exactKeys?: string[], prefixes?: PrefixPolicy[], readOnly?: boolean}} options */
  constructor({ storage, exactKeys = [], prefixes = [], readOnly = false }) {
    if (
      !storage ||
      typeof storage.getItem !== "function" ||
      (!readOnly &&
        (typeof storage.setItem !== "function" ||
          typeof storage.removeItem !== "function")) ||
      (prefixes.length > 0 && typeof storage.key !== "function")
    ) {
      throw new TypeError("invalid_storage_capability");
    }
    if (
      typeof readOnly !== "boolean" ||
      !exactKeys.every((key) => typeof key === "string" && key.length > 0) ||
      !prefixes.every(
        (policy) =>
          typeof policy.prefix === "string" &&
          policy.prefix.length > 0 &&
          typeof policy.suffix === "string" &&
          (policy.allowEmptyName === undefined ||
            typeof policy.allowEmptyName === "boolean"),
      )
    ) {
      throw new TypeError("invalid_scalar_key_policy");
    }
    this.#storage = storage;
    this.#exactKeys = Object.freeze([...exactKeys]);
    this.#prefixes = Object.freeze(
      prefixes.map((policy) => Object.freeze({ ...policy })),
    );
    this.#readOnly = readOnly;
  }

  /** @param {unknown} key @returns {key is string} */
  #allows(key) {
    return (
      typeof key === "string" &&
      (this.#exactKeys.includes(key) ||
        this.#prefixes.some(
          ({ prefix, suffix, allowEmptyName }) =>
            key.startsWith(prefix) &&
            key.endsWith(suffix) &&
            key.length >=
              prefix.length + suffix.length + (allowEmptyName ? 0 : 1),
        ))
    );
  }

  /** @param {unknown} key @returns {asserts key is string} */
  #assertKey(key) {
    if (!this.#allows(key)) throw new TypeError("invalid_scalar_key");
  }

  /** @returns {string[]} */
  keys() {
    const length = this.#storage.length;
    if (!Number.isSafeInteger(length) || Number(length) < 0) {
      throw new TypeError("invalid_storage_length");
    }
    if (typeof this.#storage.key !== "function") {
      throw new TypeError("invalid_storage_capability");
    }
    const keys = [];
    for (let index = 0; index < Number(length); index += 1) {
      const key = this.#storage.key(index);
      if (this.#allows(key)) keys.push(key);
    }
    return keys;
  }

  /** @param {string} key @returns {string | null} */
  getItem(key) {
    this.#assertKey(key);
    const value = this.#storage.getItem(key);
    if (value !== null && typeof value !== "string") {
      throw new TypeError("invalid_scalar_value");
    }
    return value;
  }

  /** @param {string} key @param {string} value */
  setItem(key, value) {
    this.#assertKey(key);
    if (typeof value !== "string") throw new TypeError("invalid_scalar_value");
    if (this.#readOnly) throw new TypeError("scalar_storage_read_only");
    if (typeof this.#storage.setItem !== "function") {
      throw new TypeError("invalid_storage_capability");
    }
    this.#storage.setItem(key, value);
  }

  /** @param {string} key */
  removeItem(key) {
    this.#assertKey(key);
    if (this.#readOnly) throw new TypeError("scalar_storage_read_only");
    if (typeof this.#storage.removeItem !== "function") {
      throw new TypeError("invalid_storage_capability");
    }
    this.#storage.removeItem(key);
  }
}
