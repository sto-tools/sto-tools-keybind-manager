import { describe, expect, it, vi } from "vitest";

import {
  adoptKeyBrowserViewState,
  applyBindsetCollapse,
  applyKeyCategoryCollapse,
  isBindsetCollapsed,
  isKeyCategoryCollapsed,
  projectBindsetSections,
  readNextBindsetCollapse,
  readNextKeyCategoryCollapse,
  readKeyBrowserViewState,
  writeBindsetCollapse,
  writeKeyCategoryCollapse,
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

const emptyState = ({ authorityEpoch = 1, revision = 0 } = {}) => ({
  authorityEpoch,
  revision,
  collapsedCategories: { command: [], keyType: [] },
  collapsedBindsets: [],
});

const readState = (storage, identity = { authorityEpoch: 7, revision: 0 }) =>
  readKeyBrowserViewState(storage, identity);

const persistNextCategory = (storage, categoryId, mode) => {
  const next = readNextKeyCategoryCollapse(storage, categoryId, mode);
  return {
    next,
    written: writeKeyCategoryCollapse(storage, categoryId, mode, next),
  };
};

const persistNextBindset = (storage, bindsetName) => {
  const next = readNextBindsetCollapse(storage, bindsetName);
  return {
    next,
    written: writeBindsetCollapse(storage, bindsetName, next),
  };
};

describe("keyBrowserViewState", () => {
  it("scans the three persisted collapse namespaces into a detached snapshot", () => {
    const storage = createStorage({
      keyCategory_system_collapsed: "true",
      keyCategory_social_collapsed: "false",
      keyTypeCategory_function_collapsed: "true",
      bindsetSection_PrimaryBindset_collapsed: "true",
      unrelated: "true",
    });

    const state = readState(storage);

    expect(state).toEqual({
      authorityEpoch: 7,
      revision: 0,
      collapsedCategories: {
        command: ["system"],
        keyType: ["function"],
      },
      collapsedBindsets: ["PrimaryBindset"],
    });
    expect(state.collapsedCategories.command).not.toBe(
      state.collapsedCategories.keyType,
    );

    state.collapsedCategories.command.push("local-only");
    expect(readState(storage).collapsedCategories.command).toEqual(["system"]);
  });

  it("selects category and bindset collapse with command and key-type isolation", () => {
    const state = {
      ...emptyState(),
      collapsedCategories: {
        command: ["system"],
        keyType: ["function"],
      },
      collapsedBindsets: ["Tactical"],
    };

    expect(isKeyCategoryCollapsed(state, "system", "command")).toBe(true);
    expect(isKeyCategoryCollapsed(state, "system", "key-type")).toBe(false);
    expect(isKeyCategoryCollapsed(state, "function", "key-type")).toBe(true);
    expect(isKeyCategoryCollapsed(state, "function", "command")).toBe(false);
    expect(isKeyCategoryCollapsed(null, "system", "command")).toBe(false);
    expect(isKeyCategoryCollapsed(state, "", "command")).toBe(false);
    expect(isBindsetCollapsed(state, "Tactical")).toBe(true);
    expect(isBindsetCollapsed(state, "Primary Bindset")).toBe(false);
    expect(isBindsetCollapsed(null, "Tactical")).toBe(false);
  });

  it('uses the key-type namespace only for the exact "key-type" mode', () => {
    const state = {
      ...emptyState(),
      collapsedCategories: {
        command: ["function"],
        keyType: ["navigation"],
      },
    };

    expect(isKeyCategoryCollapsed(state, "function", "type")).toBe(true);
    expect(isKeyCategoryCollapsed(state, "navigation", "type")).toBe(false);
    expect(isKeyCategoryCollapsed(state, "navigation", "key-type")).toBe(true);

    const storage = createStorage();
    expect(persistNextCategory(storage, "function", "type")).toEqual({
      next: true,
      written: true,
    });
    expect(storage.setItem).toHaveBeenLastCalledWith(
      "keyCategory_function_collapsed",
      "true",
    );
    expect(persistNextCategory(storage, "navigation", "key-type")).toEqual({
      next: true,
      written: true,
    });
    expect(storage.setItem).toHaveBeenLastCalledWith(
      "keyTypeCategory_navigation_collapsed",
      "true",
    );
  });

  it("keeps prototype-like category, bindset, and key identifiers data-only", () => {
    const storage = createStorage({
      keyCategory_constructor_collapsed: "true",
      keyTypeCategory___proto___collapsed: "true",
      bindsetSection_constructor_collapsed: "true",
      bindsetSection___proto___collapsed: "true",
    });
    const state = readState(storage);

    expect(state).toEqual({
      authorityEpoch: 7,
      revision: 0,
      collapsedCategories: {
        command: ["constructor"],
        keyType: ["__proto__"],
      },
      collapsedBindsets: ["__proto__", "constructor"],
    });
    expect(isKeyCategoryCollapsed(state, "constructor", "type")).toBe(true);
    expect(isKeyCategoryCollapsed(state, "__proto__", "key-type")).toBe(true);
    expect(isBindsetCollapsed(state, "constructor")).toBe(true);
    expect(isBindsetCollapsed(state, "__proto__")).toBe(true);

    const primary = Object.fromEntries([
      ["constructor", ["PrimaryConstructor"]],
      ["__proto__", ["PrimaryPrototype"]],
    ]);
    const bindsets = Object.fromEntries([
      [
        "constructor",
        {
          space: {
            keys: Object.fromEntries([["constructor", ["NamedConstructor"]]]),
          },
        },
      ],
      [
        "__proto__",
        {
          space: {
            keys: Object.fromEntries([["__proto__", ["NamedPrototype"]]]),
          },
        },
      ],
    ]);

    const sections = projectBindsetSections(
      { bindsets },
      primary,
      "space",
      state,
    );

    expect(Object.getPrototypeOf(sections)).toBe(Object.prototype);
    expect(Object.hasOwn(sections, "constructor")).toBe(true);
    expect(Object.hasOwn(sections, "__proto__")).toBe(true);
    expect(sections.constructor).toMatchObject({
      name: "constructor",
      keys: ["constructor"],
      isCollapsed: true,
    });
    expect(sections.__proto__).toMatchObject({
      name: "__proto__",
      keys: ["__proto__"],
      isCollapsed: true,
    });
  });

  it("applies immutable category and bindset transitions one revision at a time", () => {
    const initial = emptyState({ authorityEpoch: 44, revision: 7 });

    const commandCollapsed = applyKeyCategoryCollapse(
      initial,
      "system",
      "command",
      true,
    );
    expect(commandCollapsed).toEqual({
      authorityEpoch: 44,
      revision: 8,
      collapsedCategories: { command: ["system"], keyType: [] },
      collapsedBindsets: [],
    });
    expect(initial).toEqual(emptyState({ authorityEpoch: 44, revision: 7 }));
    expect(commandCollapsed.collapsedCategories.command).not.toBe(
      initial.collapsedCategories.command,
    );

    const legacyTypeCollapsed = applyKeyCategoryCollapse(
      commandCollapsed,
      "function",
      "type",
      true,
    );
    expect(legacyTypeCollapsed).toMatchObject({
      authorityEpoch: 44,
      revision: 9,
      collapsedCategories: {
        command: ["function", "system"],
        keyType: [],
      },
    });

    const keyTypeCollapsed = applyKeyCategoryCollapse(
      legacyTypeCollapsed,
      "function",
      "key-type",
      true,
    );
    expect(keyTypeCollapsed).toMatchObject({
      authorityEpoch: 44,
      revision: 10,
      collapsedCategories: {
        command: ["function", "system"],
        keyType: ["function"],
      },
    });

    const bindsetCollapsed = applyBindsetCollapse(
      keyTypeCollapsed,
      "Tactical",
      true,
    );
    expect(bindsetCollapsed).toMatchObject({
      authorityEpoch: 44,
      revision: 11,
      collapsedBindsets: ["Tactical"],
    });
    expect(bindsetCollapsed.collapsedCategories.command).not.toBe(
      keyTypeCollapsed.collapsedCategories.command,
    );

    const bindsetExpanded = applyBindsetCollapse(
      bindsetCollapsed,
      "Tactical",
      false,
    );
    expect(bindsetExpanded).toMatchObject({
      authorityEpoch: 44,
      revision: 12,
      collapsedBindsets: [],
    });
    expect(bindsetCollapsed.collapsedBindsets).toEqual(["Tactical"]);
  });

  it("adopts only valid newer snapshots and detaches accepted state", () => {
    const current = {
      ...emptyState({ authorityEpoch: 10, revision: 4 }),
      collapsedCategories: { command: ["system"], keyType: [] },
    };

    expect(
      adoptKeyBrowserViewState(
        { ...emptyState({ authorityEpoch: 10, revision: 4 }) },
        current,
      ),
    ).toBeNull();
    expect(
      adoptKeyBrowserViewState(
        { ...emptyState({ authorityEpoch: 10, revision: 3 }) },
        current,
      ),
    ).toBeNull();
    expect(
      adoptKeyBrowserViewState(
        { ...emptyState({ authorityEpoch: 9, revision: 999 }) },
        current,
      ),
    ).toBeNull();

    const higherRevision = emptyState({ authorityEpoch: 10, revision: 5 });
    const acceptedRevision = adoptKeyBrowserViewState(higherRevision, current);
    expect(acceptedRevision).toEqual(higherRevision);
    expect(acceptedRevision).not.toBe(higherRevision);
    expect(acceptedRevision?.collapsedCategories.command).not.toBe(
      higherRevision.collapsedCategories.command,
    );

    const replacement = emptyState({ authorityEpoch: 11, revision: 0 });
    expect(adoptKeyBrowserViewState(replacement, current)).toEqual(replacement);

    for (const invalid of [
      emptyState({ authorityEpoch: 0, revision: 0 }),
      emptyState({ authorityEpoch: 1.5, revision: 0 }),
      emptyState({ authorityEpoch: 1, revision: -1 }),
      emptyState({ authorityEpoch: 1, revision: 1.5 }),
    ]) {
      expect(adoptKeyBrowserViewState(invalid, null)).toBeNull();
    }
  });

  it("reads and writes category collapse persistence independently", () => {
    const storage = createStorage();

    expect(persistNextCategory(storage, "system", "command")).toEqual({
      next: true,
      written: true,
    });
    expect(storage.setItem).toHaveBeenLastCalledWith(
      "keyCategory_system_collapsed",
      "true",
    );
    expect(readState(storage).collapsedCategories.command).toEqual(["system"]);

    expect(persistNextCategory(storage, "function", "key-type")).toEqual({
      next: true,
      written: true,
    });
    expect(storage.setItem).toHaveBeenLastCalledWith(
      "keyTypeCategory_function_collapsed",
      "true",
    );
    expect(persistNextCategory(storage, "system", "command")).toEqual({
      next: false,
      written: false,
    });
    expect(storage.setItem).toHaveBeenLastCalledWith(
      "keyCategory_system_collapsed",
      "false",
    );

    storage.setItem.mockClear();
    expect(readNextKeyCategoryCollapse(storage, "", "command")).toBe(false);
    expect(writeKeyCategoryCollapse(storage, "", "command", true)).toBe(false);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("reads and writes bindset collapse persistence and propagates failures", () => {
    const storage = createStorage();

    expect(persistNextBindset(storage, "Tactical")).toEqual({
      next: true,
      written: true,
    });
    expect(storage.setItem).toHaveBeenLastCalledWith(
      "bindsetSection_Tactical_collapsed",
      "true",
    );
    expect(readState(storage).collapsedBindsets).toEqual(["Tactical"]);
    expect(persistNextBindset(storage, "Tactical")).toEqual({
      next: false,
      written: false,
    });

    storage.setItem.mockClear();
    expect(readNextBindsetCollapse(storage, "")).toBe(false);
    expect(writeBindsetCollapse(storage, "", true)).toBe(false);
    expect(storage.setItem).not.toHaveBeenCalled();

    const failingStorage = createStorage();
    failingStorage.setItem.mockImplementation(() => {
      throw new Error("quota exceeded");
    });
    expect(() =>
      writeKeyCategoryCollapse(failingStorage, "system", "command", true),
    ).toThrow("quota exceeded");
    expect(() =>
      writeBindsetCollapse(failingStorage, "Tactical", true),
    ).toThrow("quota exceeded");
  });

  it("propagates bootstrap scan failures instead of publishing invented state", () => {
    const keyFailure = createStorage();
    keyFailure.key.mockImplementation(() => {
      throw new Error("key scan denied");
    });
    Object.defineProperty(keyFailure, "length", { value: 1 });
    expect(() => readState(keyFailure)).toThrow("key scan denied");

    const readFailure = createStorage({ keyCategory_system_collapsed: "true" });
    readFailure.getItem.mockImplementation(() => {
      throw new Error("read denied");
    });
    expect(() => readState(readFailure)).toThrow("read denied");
  });

  it("projects Primary first, named bindsets alphabetically, and keys naturally", () => {
    const primary = {
      F10: ["Tenth"],
      F2: ["Second"],
      F1: [{ command: "FireAll", placement: "before-pre-pivot" }],
    };
    const profile = {
      bindsets: {
        Zulu: {
          space: { keys: { F12: ["ZuluTwelve"], F3: ["ZuluThree"] } },
        },
        Alpha: {
          space: { keys: { F11: ["AlphaEleven"], F2: ["AlphaTwo"] } },
        },
      },
    };
    const state = {
      ...emptyState(),
      collapsedBindsets: ["Primary Bindset", "Zulu"],
    };

    const sections = projectBindsetSections(profile, primary, "space", state);

    expect(Object.keys(sections)).toEqual(["Primary Bindset", "Alpha", "Zulu"]);
    expect(sections).toEqual({
      "Primary Bindset": {
        name: "Primary Bindset",
        keys: ["F1", "F2", "F10"],
        keyCount: 3,
        isCollapsed: true,
      },
      Alpha: {
        name: "Alpha",
        keys: ["F2", "F11"],
        keyCount: 2,
        isCollapsed: false,
      },
      Zulu: {
        name: "Zulu",
        keys: ["F3", "F12"],
        keyCount: 2,
        isCollapsed: true,
      },
    });

    sections["Primary Bindset"].keys.push("local-only");
    expect(primary).not.toHaveProperty("local-only");
  });

  it("projects the pre-ready fallback and captured environment without overlays", () => {
    const profile = {
      bindsets: {
        Tactical: {
          space: { keys: { F1: ["Space"] } },
          ground: { keys: { G1: ["Ground"] } },
        },
      },
    };

    expect(projectBindsetSections(null, {}, "space", emptyState())).toEqual({
      "Primary Bindset": {
        name: "Primary Bindset",
        keys: [],
        keyCount: 0,
        isCollapsed: false,
      },
    });
    expect(
      projectBindsetSections(profile, { F7: ["Primary"] }, "ground", null),
    ).toEqual({
      "Primary Bindset": {
        name: "Primary Bindset",
        keys: ["F7"],
        keyCount: 1,
        isCollapsed: false,
      },
      Tactical: {
        name: "Tactical",
        keys: ["G1"],
        keyCount: 1,
        isCollapsed: false,
      },
    });
  });
});
