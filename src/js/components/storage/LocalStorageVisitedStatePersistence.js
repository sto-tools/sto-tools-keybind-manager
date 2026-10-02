import ScopedLocalStorage from "./scopedLocalStorage.js";

const VISITED_KEY = "sto_keybind_manager_visited";

/** @typedef {import('./VisitedStatePort.js').VisitedStatePort} VisitedStatePort */
/** @implements {VisitedStatePort} */
export default class LocalStorageVisitedStatePersistence {
  #storage;

  /** @param {{storage: import('./scopedLocalStorage.js').ScalarStorageCapability}} options */
  constructor({ storage }) {
    this.#storage = new ScopedLocalStorage({
      storage,
      exactKeys: [VISITED_KEY],
    });
  }

  loadExact() {
    return this.#storage.getItem(VISITED_KEY);
  }

  markVisited() {
    this.#storage.setItem(VISITED_KEY, "true");
  }

  /** @param {string} expected @param {string | null} prior */
  compensate(expected, prior) {
    if (
      typeof expected !== "string" ||
      (prior !== null && typeof prior !== "string")
    ) {
      throw new TypeError("invalid_visited_compensation");
    }
    if (this.loadExact() !== expected) return false;
    if (prior === null) this.#storage.removeItem(VISITED_KEY);
    else this.#storage.setItem(VISITED_KEY, prior);
    return true;
  }
}
