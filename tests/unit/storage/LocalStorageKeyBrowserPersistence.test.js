import { describe, expect, it } from "vitest";
import LocalStorageKeyBrowserPersistence from "../../../src/js/components/storage/LocalStorageKeyBrowserPersistence.js";
import {
  scalarCapabilityTests,
  storageFixture,
} from "../../fixtures/persistence/scalarPersistence.js";

scalarCapabilityTests(
  LocalStorageKeyBrowserPersistence,
  "load",
  "keyViewMode",
  "replaceMode",
  ["categorized"],
);

describe("LocalStorageKeyBrowserPersistence", () => {
  it("loads exact booleans, preserves empty/prototype names, normalizes mode without eager writes, and skips foreign reads", () => {
    const { storage, data } = storageFixture([
      ["keyViewMode", "bindset-sections"],
      ["keyCategory_z_collapsed", "true"],
      ["keyCategory__collapsed", "true"],
      ["keyTypeCategory___proto___collapsed", "true"],
      ["bindsetSection___proto___collapsed", "true"],
      ["bindsetSection__collapsed", "true"],
      ["keyCategory_a_collapsed", "false"],
      ["keyCategory_bad", "true"],
      ["bindsetSection_false_collapsed", "TRUE"],
      ["commandCategory_x_collapsed", "true"],
      ["sto_keybind_manager", "root"],
      ["sto_keybind_settings", "settings"],
      ["dev-mode", "true"],
    ]);
    const adapter = new LocalStorageKeyBrowserPersistence({ storage });
    const expected = {
      mode: "grid",
      collapsedCategories: { command: ["", "z"], keyType: ["__proto__"] },
      collapsedBindsets: ["", "__proto__"],
    };
    const loaded = adapter.load();
    expect(loaded).toEqual(expected);
    loaded.collapsedCategories.command.push("mutated");
    loaded.collapsedCategories.keyType.length = 0;
    loaded.collapsedBindsets.length = 0;
    expect(adapter.load()).toEqual(expected);
    for (const key of [
      "keyCategory_bad",
      "commandCategory_x_collapsed",
      "sto_keybind_manager",
      "sto_keybind_settings",
      "dev-mode",
    ]) {
      expect(storage.getItem).not.toHaveBeenCalledWith(key);
    }
    expect(storage.setItem).not.toHaveBeenCalled();
    data.set("keyViewMode", "key-types");
    expect(adapter.load().mode).toBe("key-types");
  });

  it.each([null, "", "unknown", "grid", "categorized", "key-types"])(
    "decodes mode %s without writing",
    (mode) => {
      const { storage } = storageFixture(
        mode === null ? [] : [["keyViewMode", mode]],
      );
      const adapter = new LocalStorageKeyBrowserPersistence({ storage });
      expect(adapter.load().mode).toBe(
        mode === "categorized" || mode === "key-types" ? mode : "grid",
      );
      expect(storage.setItem).not.toHaveBeenCalled();
    },
  );

  it("uses exact legacy category mode and literal boolean strings for both collapse namespaces", () => {
    const { storage } = storageFixture();
    const adapter = new LocalStorageKeyBrowserPersistence({ storage });
    for (const mode of ["grid", "categorized", "key-types"])
      adapter.replaceMode(mode);
    adapter.replaceCategory("a", "key-type", true);
    adapter.replaceCategory("a", "key-types", false);
    adapter.replaceCategory("dev-mode", "arbitrary-legacy-mode", true);
    adapter.replaceBindset("__proto__", true);
    adapter.replaceBindset("__proto__", false);
    expect(storage.setItem.mock.calls).toEqual([
      ["keyViewMode", "grid"],
      ["keyViewMode", "categorized"],
      ["keyViewMode", "key-types"],
      ["keyTypeCategory_a_collapsed", "true"],
      ["keyCategory_a_collapsed", "false"],
      ["keyCategory_dev-mode_collapsed", "true"],
      ["bindsetSection___proto___collapsed", "true"],
      ["bindsetSection___proto___collapsed", "false"],
    ]);
    expect(storage.removeItem).not.toHaveBeenCalled();
  });

  it("fresh reads observe external collapse changes while empty names remain storage-free no-ops", () => {
    const { storage, data } = storageFixture();
    const adapter = new LocalStorageKeyBrowserPersistence({ storage });
    adapter.replaceCategory("", "key-type", true);
    adapter.replaceBindset("", true);
    expect(adapter.isCategoryCollapsed("", "command")).toBe(false);
    expect(adapter.isBindsetCollapsed("")).toBe(false);
    expect(storage.getItem).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(adapter.isCategoryCollapsed("a", "key-type")).toBe(false);
    expect(adapter.isBindsetCollapsed("b")).toBe(false);
    data.set("keyTypeCategory_a_collapsed", "true");
    data.set("bindsetSection_b_collapsed", "true");
    expect(adapter.isCategoryCollapsed("a", "key-type")).toBe(true);
    expect(adapter.isCategoryCollapsed("a", "key-types")).toBe(false);
    expect(adapter.isBindsetCollapsed("b")).toBe(true);
  });

  it.each([
    ["replaceMode", ["dev-mode"]],
    ["replaceMode", [new String("grid")]],
    ["replaceCategory", [null, "command", true]],
    ["replaceCategory", ["a", {}, true]],
    ["replaceCategory", ["a", "command", "true"]],
    ["replaceBindset", [undefined, true]],
    ["replaceBindset", ["a", null]],
    ["replaceBindset", ["", {}]],
    ["isCategoryCollapsed", [{}, "command"]],
    ["isCategoryCollapsed", ["a", null]],
    ["isBindsetCollapsed", [1]],
  ])(
    "rejects invalid primitives before storage access: %s %#",
    (method, args) => {
      const { storage } = storageFixture();
      const adapter = new LocalStorageKeyBrowserPersistence({ storage });
      expect(() => adapter[method](...args)).toThrow(TypeError);
      for (const method of ["key", "getItem", "setItem", "removeItem"])
        expect(storage[method]).not.toHaveBeenCalled();
    },
  );
});
