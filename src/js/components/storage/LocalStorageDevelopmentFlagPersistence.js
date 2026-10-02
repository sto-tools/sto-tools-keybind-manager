import ScopedLocalStorage from "./scopedLocalStorage.js";

/** @typedef {import('./DevelopmentFlagPort.js').DevelopmentFlagPort} DevelopmentFlagPort */
/** @implements {DevelopmentFlagPort} */
export default class LocalStorageDevelopmentFlagPersistence {
  #storage;

  /** @param {{storage: import('./scopedLocalStorage.js').ScalarStorageCapability}} options */
  constructor({ storage }) {
    this.#storage = new ScopedLocalStorage({
      storage,
      exactKeys: ["dev-mode"],
      readOnly: true,
    });
  }

  isEnabled() {
    return this.#storage.getItem("dev-mode") === "true";
  }
}
