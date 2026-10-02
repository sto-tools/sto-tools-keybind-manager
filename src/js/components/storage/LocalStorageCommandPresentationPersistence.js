import ScopedLocalStorage from "./scopedLocalStorage.js";

const CATEGORY_PREFIX = "commandCategory_";
const SUFFIX = "_collapsed";
const GROUPS = Object.freeze(
  /** @type {import('./CommandPresentationPersistencePort.js').CommandGroupType[]} */ ([
    "non-trayexec",
    "palindromic",
    "pivot",
  ]),
);

/** @typedef {import('./CommandPresentationPersistencePort.js').CommandPresentationPersistencePort} CommandPresentationPersistencePort */
/** @implements {CommandPresentationPersistencePort} */
export default class LocalStorageCommandPresentationPersistence {
  #storage;

  /** @param {{storage: import('./scopedLocalStorage.js').ScalarStorageCapability}} options */
  constructor({ storage }) {
    this.#storage = new ScopedLocalStorage({
      storage,
      exactKeys: GROUPS.map((group) => `commandGroup_${group}${SUFFIX}`),
      prefixes: [{ prefix: CATEGORY_PREFIX, suffix: SUFFIX }],
    });
  }

  /** @returns {import('./CommandPresentationPersistencePort.js').CommandPresentationPersistenceSnapshot} */
  load() {
    const categories = new Set();
    const groups = new Set();
    for (const key of this.#storage.keys()) {
      if (this.#storage.getItem(key) !== "true") continue;
      if (key.startsWith(CATEGORY_PREFIX)) {
        categories.add(key.slice(CATEGORY_PREFIX.length, -SUFFIX.length));
      } else {
        groups.add(key.slice("commandGroup_".length, -SUFFIX.length));
      }
    }
    const collapsedCategories = [...categories].sort();
    const collapsedGroups = GROUPS.filter((group) => groups.has(group));
    return { collapsedCategories, collapsedGroups };
  }

  /** @param {string} categoryId @param {boolean} collapsed */
  replaceCategory(categoryId, collapsed) {
    if (typeof categoryId !== "string" || categoryId.length === 0) {
      throw new TypeError("Command category ID must be a non-empty string");
    }
    if (typeof collapsed !== "boolean") {
      throw new TypeError("Command category collapse state must be boolean");
    }
    this.#storage.setItem(
      `${CATEGORY_PREFIX}${categoryId}${SUFFIX}`,
      String(collapsed),
    );
  }

  /** @param {import('./CommandPresentationPersistencePort.js').CommandGroupType} group @param {boolean} collapsed */
  replaceGroup(group, collapsed) {
    if (!GROUPS.includes(group)) {
      throw new TypeError("Command group type is not supported");
    }
    if (typeof collapsed !== "boolean") {
      throw new TypeError("Command group collapse state must be boolean");
    }
    const key = `commandGroup_${group}${SUFFIX}`;
    if (collapsed) this.#storage.setItem(key, "true");
    else this.#storage.removeItem(key);
  }
}
