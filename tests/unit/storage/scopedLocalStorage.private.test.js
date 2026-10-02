import { describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import * as internalModule from "../../../src/js/components/storage/scopedLocalStorage.js";

const ScopedLocalStorage = internalModule.default;

function setup(options = {}) {
  const entries = [
    "sto_keybind_manager",
    "owned_a_end",
    "dev-mode",
    "owned_bad",
    "owned__end",
    "single",
  ];
  const storage = {
    length: entries.length,
    key: vi.fn((index) => entries[index] ?? null),
    getItem: vi.fn(() => "true"),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  };
  const scoped = new ScopedLocalStorage({
    storage,
    exactKeys: ["single"],
    prefixes: [{ prefix: "owned_", suffix: "_end" }],
    ...options,
  });
  return { storage, scoped };
}

describe("scopedLocalStorage private scalar implementation", () => {
  it("has only internal default linkage, with exactly four concrete production importers and no public re-export", () => {
    expect(Object.keys(internalModule)).toEqual(["default"]);
    const root = resolve("src/js");
    const importers = readdirSync(root, { recursive: true }).filter((path) => {
      if (!path.endsWith(".js") || path.endsWith("scopedLocalStorage.js"))
        return false;
      return readFileSync(resolve(root, path), "utf8").includes(
        "scopedLocalStorage.js",
      );
    });
    expect(importers.sort()).toEqual([
      "components/storage/LocalStorageCommandPresentationPersistence.js",
      "components/storage/LocalStorageDevelopmentFlagPersistence.js",
      "components/storage/LocalStorageKeyBrowserPersistence.js",
      "components/storage/LocalStorageVisitedStatePersistence.js",
    ]);
  });

  it("enumerates allowed exact/suffixed-prefix keys without reading foreign values", () => {
    const { scoped, storage } = setup();
    expect(scoped.keys()).toEqual(["owned_a_end", "single"]);
    expect(storage.getItem).not.toHaveBeenCalled();
    expect(Object.keys(scoped)).toEqual([]);
  });

  it("captures a detached immutable policy", () => {
    const exactKeys = ["single"];
    const prefixes = [
      { prefix: "owned_", suffix: "_end", allowEmptyName: false },
    ];
    const { scoped, storage } = setup({ exactKeys, prefixes });
    exactKeys.push("dev-mode");
    prefixes[0].prefix = "sto_";
    prefixes[0].allowEmptyName = true;
    expect(scoped.keys()).toEqual(["owned_a_end", "single"]);
    expect(() => scoped.getItem("dev-mode")).toThrow("invalid_scalar_key");
    expect(storage.getItem).not.toHaveBeenCalled();
  });

  it.each([
    "dev-mode",
    "sto_keybind_manager",
    "owned_bad",
    "owned__end",
    "single_extra",
    null,
    {},
    new String("single"),
  ])("rejects wrong keys before every storage operation %#", (key) => {
    const { scoped, storage } = setup();
    expect(() => scoped.getItem(key)).toThrow("invalid_scalar_key");
    expect(() => scoped.setItem(key, "true")).toThrow("invalid_scalar_key");
    expect(() => scoped.removeItem(key)).toThrow("invalid_scalar_key");
    for (const method of ["key", "getItem", "setItem", "removeItem"])
      expect(storage[method]).not.toHaveBeenCalled();
  });

  it.each([null, undefined, true, 1, {}, [], new String("true")])(
    "rejects nonscalar writes before storage access %#",
    (value) => {
      const { scoped, storage } = setup();
      expect(() => scoped.setItem("single", value)).toThrow(
        "invalid_scalar_value",
      );
      expect(storage.setItem).not.toHaveBeenCalled();
    },
  );

  it.each([null, "", "false", "arbitrary exact scalar"])(
    "permits only string/null reads without canonicalizing (%s)",
    (value) => {
      const { scoped, storage } = setup();
      storage.getItem.mockReturnValue(value);
      expect(scoped.getItem("single")).toBe(value);
    },
  );

  it("enforces read-only policy even when the underlying capability can mutate", () => {
    const { scoped, storage } = setup({ readOnly: true });
    expect(scoped.getItem("single")).toBe("true");
    expect(() => scoped.setItem("single", "false")).toThrow(
      "scalar_storage_read_only",
    );
    expect(() => scoped.removeItem("single")).toThrow(
      "scalar_storage_read_only",
    );
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.removeItem).not.toHaveBeenCalled();
  });

  it.each([undefined, -1, 1.5, Infinity, "2"])(
    "rejects invalid enumeration lengths %#",
    (length) => {
      const { scoped, storage } = setup();
      storage.length = length;
      expect(() => scoped.keys()).toThrow("invalid_storage_length");
      expect(storage.key).not.toHaveBeenCalled();
    },
  );

  it("skips malformed enumeration results without coercion or reads", () => {
    const { scoped, storage } = setup();
    const coercion = vi.fn(() => "owned_a_end");
    storage.key.mockImplementation(() => ({ toString: coercion }));
    expect(scoped.keys()).toEqual([]);
    expect(storage.getItem).not.toHaveBeenCalled();
    expect(coercion).not.toHaveBeenCalled();
  });
});
