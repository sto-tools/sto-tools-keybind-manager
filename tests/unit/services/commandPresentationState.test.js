import { describe, expect, it, vi } from "vitest";

import {
  applyCommandCategoryCollapse,
  applyCommandGroupCollapse,
  adoptCommandPresentationState,
  cloneCommandPresentationState,
  isCommandCategoryCollapsed,
  isCommandGroupCollapsed,
  readCommandPresentationState,
  writeCommandCategoryCollapse,
  writeCommandGroupCollapse,
} from "../../../src/js/components/services/commandPresentationState.js";

function createStorage(initial = {}) {
  const entries = new Map(Object.entries(initial));
  return {
    key: vi.fn((index) => [...entries.keys()][index] ?? null),
    getItem: vi.fn((key) => entries.get(key) ?? null),
    setItem: vi.fn((key, value) => entries.set(key, String(value))),
    removeItem: vi.fn((key) => entries.delete(key)),
    get length() {
      return entries.size;
    },
  };
}

const state = (overrides = {}) => ({
  authorityEpoch: 4,
  revision: 2,
  collapsedCategories: ["system"],
  collapsedGroups: ["pivot"],
  ...overrides,
});

describe("command presentation state boundary", () => {
  it("hydrates exact true values into deterministic prototype-safe arrays without repair", () => {
    const storage = createStorage({
      commandGroup_pivot_collapsed: "true",
      commandCategory_system_collapsed: "true",
      commandCategory_aliases_collapsed: "false",
      commandGroup_palindromic_collapsed: "true",
      commandCategory___proto___collapsed: "true",
      commandCategory_constructor_collapsed: "TRUE",
      commandCategory__collapsed: "true",
      commandGroup_non_trayexec_collapsed: "true",
      commandGroup_unknown_collapsed: "true",
      unrelated: "true",
    });

    expect(
      readCommandPresentationState(storage, {
        authorityEpoch: 7,
        revision: 0,
      }),
    ).toEqual({
      authorityEpoch: 7,
      revision: 0,
      collapsedCategories: ["__proto__", "system"],
      collapsedGroups: ["palindromic", "pivot"],
    });
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.removeItem).not.toHaveBeenCalled();
  });

  it("clones and adopts valid replacements as detached canonical snapshots", () => {
    const candidate = state({
      authorityEpoch: 8,
      revision: 0,
      collapsedCategories: ["system", "__proto__", "aliases"],
      collapsedGroups: ["pivot", "non-trayexec"],
    });
    const accepted = adoptCommandPresentationState(candidate, state());

    expect(accepted).toEqual({
      authorityEpoch: 8,
      revision: 0,
      collapsedCategories: ["__proto__", "aliases", "system"],
      collapsedGroups: ["non-trayexec", "pivot"],
    });
    expect(accepted).not.toBe(candidate);
    expect(accepted.collapsedCategories).not.toBe(
      candidate.collapsedCategories,
    );
    expect(accepted.collapsedGroups).not.toBe(candidate.collapsedGroups);

    const cloned = cloneCommandPresentationState(accepted);
    cloned.collapsedCategories.push("local-only");
    cloned.collapsedGroups.push("palindromic");
    expect(accepted.collapsedCategories).not.toContain("local-only");
    expect(accepted.collapsedGroups).not.toContain("palindromic");
  });

  it.each([
    null,
    {},
    state({ authorityEpoch: 0 }),
    state({ revision: -1 }),
    state({ collapsedCategories: "system" }),
    state({ collapsedCategories: [""] }),
    state({ collapsedCategories: ["system", "system"] }),
    state({ collapsedCategories: [42] }),
    state({ collapsedGroups: "pivot" }),
    state({ collapsedGroups: ["unknown"] }),
    state({ collapsedGroups: ["pivot", "pivot"] }),
  ])("rejects malformed snapshot %#", (candidate) => {
    expect(adoptCommandPresentationState(candidate, null)).toBeNull();
  });

  it("rejects duplicate and predecessor revisions while allowing a newer epoch restart", () => {
    const current = state({ authorityEpoch: 9, revision: 5 });
    expect(
      adoptCommandPresentationState(
        state({ authorityEpoch: 9, revision: 5 }),
        current,
      ),
    ).toBeNull();
    expect(
      adoptCommandPresentationState(
        state({ authorityEpoch: 9, revision: 4 }),
        current,
      ),
    ).toBeNull();
    expect(
      adoptCommandPresentationState(
        state({ authorityEpoch: 8, revision: 99 }),
        current,
      ),
    ).toBeNull();
    expect(
      adoptCommandPresentationState(
        state({ authorityEpoch: 10, revision: 0 }),
        current,
      ),
    ).toMatchObject({ authorityEpoch: 10, revision: 0 });
  });

  it("applies detached category and closed-group transitions independently", () => {
    const initial = state();
    const category = applyCommandCategoryCollapse(initial, "__proto__", true);
    const group = applyCommandGroupCollapse(category, "non-trayexec", true);
    const expandedCategory = applyCommandCategoryCollapse(
      group,
      "system",
      false,
    );
    const expandedGroup = applyCommandGroupCollapse(
      expandedCategory,
      "pivot",
      false,
    );

    expect(initial).toEqual(state());
    expect(category).toEqual({
      authorityEpoch: 4,
      revision: 3,
      collapsedCategories: ["__proto__", "system"],
      collapsedGroups: ["pivot"],
    });
    expect(expandedGroup).toEqual({
      authorityEpoch: 4,
      revision: 6,
      collapsedCategories: ["__proto__"],
      collapsedGroups: ["non-trayexec"],
    });
    expect(category.collapsedCategories).not.toBe(initial.collapsedCategories);
    expect(group.collapsedGroups).not.toBe(category.collapsedGroups);
  });

  it("selects category and group state without accepting invalid names", () => {
    expect(isCommandCategoryCollapsed(state(), "system")).toBe(true);
    expect(isCommandCategoryCollapsed(state(), "")).toBe(false);
    expect(isCommandCategoryCollapsed(null, "system")).toBe(false);
    expect(isCommandGroupCollapsed(state(), "pivot")).toBe(true);
    expect(isCommandGroupCollapsed(state(), "unknown")).toBe(false);
    expect(isCommandGroupCollapsed(null, "pivot")).toBe(false);
  });

  it("preserves category false writes and group removal-on-expand exactly", () => {
    const storage = createStorage({
      commandGroup_pivot_collapsed: "true",
    });

    expect(writeCommandCategoryCollapse(storage, "aliases", true)).toBe(true);
    expect(writeCommandCategoryCollapse(storage, "aliases", false)).toBe(false);
    expect(writeCommandGroupCollapse(storage, "pivot", false)).toBe(false);
    expect(writeCommandGroupCollapse(storage, "palindromic", true)).toBe(true);

    expect(storage.setItem.mock.calls).toEqual([
      ["commandCategory_aliases_collapsed", "true"],
      ["commandCategory_aliases_collapsed", "false"],
      ["commandGroup_palindromic_collapsed", "true"],
    ]);
    expect(storage.removeItem).toHaveBeenCalledExactlyOnceWith(
      "commandGroup_pivot_collapsed",
    );
  });

  it("rejects invalid transition names before persistence", () => {
    const storage = createStorage();

    expect(() => applyCommandCategoryCollapse(state(), "", true)).toThrow(
      TypeError,
    );
    expect(() => applyCommandGroupCollapse(state(), "unknown", true)).toThrow(
      TypeError,
    );
    expect(() => writeCommandCategoryCollapse(storage, "", true)).toThrow(
      TypeError,
    );
    expect(() => writeCommandGroupCollapse(storage, "unknown", true)).toThrow(
      TypeError,
    );
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.removeItem).not.toHaveBeenCalled();
  });
});
