import { describe, expect, it, vi } from "vitest";

import {
  applyNextKeyViewMode,
  decodeKeyViewMode,
  readKeyBrowserViewState,
  writeKeyViewMode,
} from "../../../src/js/components/services/keyBrowserViewState.js";

const createStorage = (initial = {}) => {
  const entries = new Map(
    Object.entries(initial).map(([key, value]) => [key, String(value)]),
  );
  return {
    getItem: vi.fn((key) => entries.get(key) ?? null),
    setItem: vi.fn((key, value) => entries.set(key, String(value))),
    key: vi.fn((index) => [...entries.keys()][index] ?? null),
    get length() {
      return entries.size;
    },
  };
};

const state = (mode = "grid") => ({
  authorityEpoch: 55,
  revision: 3,
  mode,
  collapsedCategories: { command: ["system"], keyType: ["function"] },
  collapsedBindsets: ["Tactical"],
});

describe("keyBrowserViewState mode boundary", () => {
  it.each([
    ["grid", "grid"],
    ["categorized", "categorized"],
    ["key-types", "key-types"],
    ["bindset-sections", "grid"],
    [null, "grid"],
    [undefined, "grid"],
    ["", "grid"],
    ["unknown", "grid"],
    [42, "grid"],
    [false, "grid"],
    [{ mode: "categorized" }, "grid"],
  ])("decodes runtime input %j as %s", (raw, expected) => {
    expect(decodeKeyViewMode(raw)).toBe(expected);
  });

  it.each([
    [undefined, "grid"],
    ["grid", "grid"],
    ["categorized", "categorized"],
    ["key-types", "key-types"],
    ["bindset-sections", "grid"],
    ["", "grid"],
    ["unknown", "grid"],
  ])("reads persisted %j as %s without an eager migration", (raw, expected) => {
    const storage = createStorage(
      raw === undefined ? {} : { keyViewMode: raw },
    );

    expect(
      readKeyBrowserViewState(storage, {
        authorityEpoch: 7,
        revision: 0,
      }).mode,
    ).toBe(expected);
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.getItem("keyViewMode")).toBe(raw ?? null);
  });

  it("cycles detached snapshots through the closed sequence", () => {
    const initial = state();
    const categorized = applyNextKeyViewMode(initial);
    const keyTypes = applyNextKeyViewMode(categorized);
    const grid = applyNextKeyViewMode(keyTypes);

    expect([categorized.mode, keyTypes.mode, grid.mode]).toEqual([
      "categorized",
      "key-types",
      "grid",
    ]);
    expect([categorized.revision, keyTypes.revision, grid.revision]).toEqual([
      4, 5, 6,
    ]);
    expect(categorized).toMatchObject({
      authorityEpoch: 55,
      collapsedCategories: initial.collapsedCategories,
      collapsedBindsets: initial.collapsedBindsets,
    });
    expect(categorized).not.toBe(initial);
    expect(categorized.collapsedCategories.command).not.toBe(
      initial.collapsedCategories.command,
    );
    expect(categorized.collapsedBindsets).not.toBe(initial.collapsedBindsets);
    expect(initial).toEqual(state());
  });

  it("writes the candidate without consulting storage and propagates failure", () => {
    const storage = createStorage({ keyViewMode: "grid" });
    storage.getItem.mockImplementation(() => {
      throw new Error("read denied");
    });

    expect(writeKeyViewMode(storage, "categorized")).toBe("categorized");
    expect(storage.setItem).toHaveBeenLastCalledWith(
      "keyViewMode",
      "categorized",
    );

    storage.setItem.mockImplementation(() => {
      throw new Error("quota exceeded");
    });
    expect(() => writeKeyViewMode(storage, "key-types")).toThrow(
      "quota exceeded",
    );
  });
});
