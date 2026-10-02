import { describe, expect, it } from "vitest";
import LocalStorageCommandPresentationPersistence from "../../../src/js/components/storage/LocalStorageCommandPresentationPersistence.js";
import {
  scalarCapabilityTests,
  storageFixture,
} from "../../fixtures/persistence/scalarPersistence.js";

scalarCapabilityTests(
  LocalStorageCommandPresentationPersistence,
  "load",
  "commandCategory_test_collapsed",
  "replaceCategory",
  ["test", true],
);

describe("LocalStorageCommandPresentationPersistence", () => {
  it("loads sorted detached exact-true state and skips foreign or malformed keys without reading them", () => {
    const { storage } = storageFixture([
      ["commandCategory_z_collapsed", "true"],
      ["commandCategory___proto___collapsed", "true"],
      ["commandCategory_a_collapsed", "false"],
      ["commandGroup_pivot_collapsed", "true"],
      ["commandGroup_non-trayexec_collapsed", "true"],
      ["commandGroup_palindromic_collapsed", "TRUE"],
      ["commandGroup_unknown_collapsed", "true"],
      ["commandCategory__collapsed", "true"],
      ["commandCategory_other", "true"],
      ["keyCategory_x_collapsed", "true"],
      ["sto_keybind_manager", "private root"],
      ["sto_keybind_settings", "private settings"],
    ]);
    const adapter = new LocalStorageCommandPresentationPersistence({ storage });
    const expected = {
      collapsedCategories: ["__proto__", "z"],
      collapsedGroups: ["non-trayexec", "pivot"],
    };
    const loaded = adapter.load();
    expect(loaded).toEqual(expected);
    loaded.collapsedCategories.push("mutated");
    loaded.collapsedGroups.length = 0;
    expect(adapter.load()).toEqual(expected);
    expect(new Set(storage.getItem.mock.calls.map(([key]) => key))).toEqual(
      new Set([
        "commandCategory_z_collapsed",
        "commandCategory___proto___collapsed",
        "commandCategory_a_collapsed",
        "commandGroup_pivot_collapsed",
        "commandGroup_non-trayexec_collapsed",
        "commandGroup_palindromic_collapsed",
      ]),
    );
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.removeItem).not.toHaveBeenCalled();
  });

  it("keeps category literal-false expansion and group removal encoding", () => {
    const { storage, data } = storageFixture([["sto_keybind_manager", "root"]]);
    const adapter = new LocalStorageCommandPresentationPersistence({ storage });
    adapter.replaceCategory("__proto__", true);
    adapter.replaceCategory("__proto__", false);
    adapter.replaceGroup("pivot", true);
    adapter.replaceGroup("pivot", false);
    expect(storage.setItem.mock.calls).toEqual([
      ["commandCategory___proto___collapsed", "true"],
      ["commandCategory___proto___collapsed", "false"],
      ["commandGroup_pivot_collapsed", "true"],
    ]);
    expect(storage.removeItem).toHaveBeenCalledExactlyOnceWith(
      "commandGroup_pivot_collapsed",
    );
    expect(data.get("sto_keybind_manager")).toBe("root");
    expect(storage.getItem).not.toHaveBeenCalled();
  });

  it.each([
    ["replaceCategory", ["", true]],
    ["replaceCategory", [null, true]],
    [
      "replaceCategory",
      [
        {
          toString() {
            throw new Error("coercion");
          },
        },
        true,
      ],
    ],
    ["replaceCategory", ["x", "true"]],
    ["replaceGroup", ["dev-mode", true]],
    ["replaceGroup", ["pivot", 1]],
    ["replaceGroup", [new String("pivot"), true]],
  ])(
    "rejects invalid domain arguments before any storage access: %s %#",
    (method, args) => {
      const { storage } = storageFixture();
      const adapter = new LocalStorageCommandPresentationPersistence({
        storage,
      });
      expect(() => adapter[method](...args)).toThrow(TypeError);
      for (const method of ["key", "getItem", "setItem", "removeItem"])
        expect(storage[method]).not.toHaveBeenCalled();
    },
  );

  it("propagates group removal and key enumeration failures", () => {
    const { storage } = storageFixture();
    const adapter = new LocalStorageCommandPresentationPersistence({ storage });
    storage.removeItem.mockImplementation(() => {
      throw new Error("remove failed");
    });
    expect(() => adapter.replaceGroup("pivot", false)).toThrow("remove failed");
    storage.key.mockImplementation(() => {
      throw new Error("enumeration failed");
    });
    Object.defineProperty(storage, "length", { value: 1 });
    expect(() => adapter.load()).toThrow("enumeration failed");
  });
});
