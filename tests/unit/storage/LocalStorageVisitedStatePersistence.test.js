import { describe, expect, it } from "vitest";
import LocalStorageVisitedStatePersistence from "../../../src/js/components/storage/LocalStorageVisitedStatePersistence.js";
import {
  scalarCapabilityTests,
  storageFixture,
} from "../../fixtures/persistence/scalarPersistence.js";

scalarCapabilityTests(
  LocalStorageVisitedStatePersistence,
  "loadExact",
  "sto_keybind_manager_visited",
  "markVisited",
  [],
);

describe("LocalStorageVisitedStatePersistence", () => {
  const key = "sto_keybind_manager_visited";
  it.each([null, "", "false", "0", "true", "legacy visited"])(
    "preserves exact prior value %s during compare-current compensation",
    (prior) => {
      const { storage, data } = storageFixture(
        prior === null ? [] : [[key, prior]],
      );
      data.set("dev-mode", "true");
      data.set("sto_keybind_manager", "root");
      const adapter = new LocalStorageVisitedStatePersistence({ storage });
      expect(adapter.loadExact()).toBe(prior);
      adapter.markVisited();
      expect(data.get(key)).toBe("true");
      expect(adapter.compensate("true", prior)).toBe(true);
      expect(adapter.loadExact()).toBe(prior);
      expect(data.has(key)).toBe(prior !== null);
      expect(data.get("dev-mode")).toBe("true");
      expect(data.get("sto_keybind_manager")).toBe("root");
      expect(
        new Set(storage.getItem.mock.calls.map(([readKey]) => readKey)),
      ).toEqual(new Set([key]));
      expect(storage.key).not.toHaveBeenCalled();
    },
  );

  it("does not overwrite a marker changed by a later writer", () => {
    const { storage, data } = storageFixture([[key, "later"]]);
    const adapter = new LocalStorageVisitedStatePersistence({ storage });
    expect(adapter.compensate("true", "")).toBe(false);
    expect(data.get(key)).toBe("later");
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.removeItem).not.toHaveBeenCalled();
  });

  it.each([
    [null, null],
    [true, ""],
    ["true", false],
    ["true", undefined],
    [new String("true"), ""],
  ])(
    "rejects nonscalar compensation arguments before reading %#",
    (expected, prior) => {
      const { storage } = storageFixture();
      const adapter = new LocalStorageVisitedStatePersistence({ storage });
      expect(() => adapter.compensate(expected, prior)).toThrow(TypeError);
      expect(storage.getItem).not.toHaveBeenCalled();
      expect(storage.setItem).not.toHaveBeenCalled();
      expect(storage.removeItem).not.toHaveBeenCalled();
    },
  );

  it.each([null, ""])(
    "propagates compensation mutation failure for prior %s",
    (prior) => {
      const { storage } = storageFixture([[key, "true"]]);
      const adapter = new LocalStorageVisitedStatePersistence({ storage });
      const error = new Error("restore failed");
      storage[prior === null ? "removeItem" : "setItem"].mockImplementation(
        () => {
          throw error;
        },
      );
      expect(() => adapter.compensate("true", prior)).toThrow(error);
    },
  );
});
