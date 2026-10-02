import LocalStorageCommandPresentationPersistence from "../../../src/js/components/storage/LocalStorageCommandPresentationPersistence.js";
import LocalStorageKeyBrowserPersistence from "../../../src/js/components/storage/LocalStorageKeyBrowserPersistence.js";
import LocalStorageVisitedStatePersistence from "../../../src/js/components/storage/LocalStorageVisitedStatePersistence.js";

/** Production domain adapters over an explicitly replaceable test capability. */
export function createScalarPersistence(storage = localStorage) {
  return {
    commandPresentationPersistence:
      new LocalStorageCommandPresentationPersistence({ storage }),
    keyBrowserPersistence: new LocalStorageKeyBrowserPersistence({ storage }),
    visitedState: new LocalStorageVisitedStatePersistence({ storage }),
  };
}
