import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { renderKeyBrowserGrid } from "../../../src/js/components/ui/keyBrowserGridDom.js";

/** @returns {import('../../../src/js/types/events/component-state.js').KeyBrowserViewStateSnapshot} */
function viewState({ command = [], keyType = [], bindsets = [] } = {}) {
  return {
    authorityEpoch: 1,
    revision: 0,
    mode: "grid",
    collapsedCategories: { command, keyType },
    collapsedBindsets: bindsets,
  };
}

/** @returns {import('../../../src/js/components/services/serviceTypes.js').ProfileData} */
function profile(bindsets = {}) {
  return {
    id: "captain",
    builds: { space: { keys: {} }, ground: { keys: {} } },
    bindsets,
    aliases: {},
  };
}

function category(name, keys, priority = 1) {
  return { name, icon: "fas fa-folder", keys, priority };
}

function createInput(overrides = {}) {
  return {
    document,
    i18n: { t: (key) => `translated:${key}` },
    mode: "grid",
    profile: profile(),
    environment: "space",
    primaryKeyMap: {},
    viewState: viewState(),
    showBindsetSections: false,
    selectedKey: null,
    activeBindset: "Primary Bindset",
    sortKeys: vi.fn(async (keys) => [...keys].sort()),
    categorizeByCommand: vi.fn(async () => ({})),
    categorizeByType: vi.fn(async () => ({})),
    ...overrides,
  };
}

describe("keyBrowserGridDom", () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders selected grid keys and command counts from injected data", async () => {
    const sortKeys = vi.fn(async (keys) => [...keys].reverse());
    const input = createInput({
      primaryKeyMap: {
        F1: ["FireAll", "", { command: "Target_Enemy_Near" }],
        A: [],
      },
      selectedKey: "F1",
      activeBindset: "Tactical",
      sortKeys,
    });

    const result = await renderKeyBrowserGrid(input);
    const keys = [...result.fragment.querySelectorAll(".key-item")];

    expect(result.categorized).toBe(false);
    expect(sortKeys).toHaveBeenCalledOnce();
    expect(sortKeys).toHaveBeenCalledWith(["F1", "A"]);
    expect(input.categorizeByCommand).not.toHaveBeenCalled();
    expect(input.categorizeByType).not.toHaveBeenCalled();
    expect(keys.map((element) => element.dataset.key)).toEqual(["A", "F1"]);

    const selected = result.fragment.querySelector('[data-key="F1"]');
    const unselected = result.fragment.querySelector('[data-key="A"]');
    expect(selected?.classList).toContain("active");
    expect(unselected?.classList).not.toContain("active");
    expect(selected?.dataset.action).toBe("select-key");
    expect(selected?.title).toBe("F1: 2 translated:commands");
    expect(selected?.querySelector(".command-count-badge")?.textContent).toBe(
      "2",
    );
    expect(selected?.querySelector(".activity-bar")?.style.width).toBe("30%");
  });

  it("isolates selected keys and command maps between bindset sections", async () => {
    const tacticalKeys = {
      F1: ["TacticalOne", "TacticalTwo"],
      F3: [],
    };
    const input = createInput({
      profile: profile({
        Tactical: {
          space: { keys: tacticalKeys },
          ground: { keys: {} },
        },
      }),
      primaryKeyMap: { F1: ["PrimaryOnly"], F2: [] },
      showBindsetSections: true,
      selectedKey: "F1",
      activeBindset: "Tactical",
    });

    const { fragment, categorized } = await renderKeyBrowserGrid(input);
    const primary = fragment.querySelector(
      '.bindset-section[data-bindset="Primary Bindset"]',
    );
    const tactical = fragment.querySelector(
      '.bindset-section[data-bindset="Tactical"]',
    );
    const primaryF1 = primary?.querySelector('[data-key="F1"]');
    const primaryF2 = primary?.querySelector('[data-key="F2"]');
    const tacticalF1 = tactical?.querySelector('[data-key="F1"]');
    const tacticalF3 = tactical?.querySelector('[data-key="F3"]');

    expect(categorized).toBe(true);
    expect(primaryF1?.classList).not.toContain("active");
    expect(primaryF2?.classList).not.toContain("active");
    expect(tacticalF1?.classList).toContain("active");
    expect(tacticalF3?.classList).not.toContain("active");
    expect(primaryF1?.title).toBe("F1: 1 translated:command_singular");
    expect(tacticalF1?.title).toBe("F1: 2 translated:commands");
    expect(primary?.querySelector(".bindset-count")?.textContent).toBe("(2)");
    expect(tactical?.querySelector(".bindset-count")?.textContent).toBe("(2)");
  });

  it("leaves every bindset key inactive for null selection or bindset context", async () => {
    const overrides = {
      profile: profile({
        Tactical: {
          space: { keys: { F1: ["TacticalOnly"] } },
          ground: { keys: {} },
        },
      }),
      primaryKeyMap: { F1: ["PrimaryOnly"] },
      showBindsetSections: true,
    };

    const nullSelection = await renderKeyBrowserGrid(
      createInput({
        ...overrides,
        selectedKey: null,
        activeBindset: "Tactical",
      }),
    );
    expect(
      nullSelection.fragment.querySelectorAll(".key-item.active"),
    ).toHaveLength(0);

    const nullBindset = await renderKeyBrowserGrid(
      createInput({
        ...overrides,
        selectedKey: "F1",
        activeBindset: null,
      }),
    );
    expect(
      nullBindset.fragment.querySelectorAll(".key-item.active"),
    ).toHaveLength(0);
  });

  it("renders the exact primary and named bindset management actions", async () => {
    const input = createInput({
      profile: profile({
        Tactical: {
          space: { keys: {} },
          ground: { keys: {} },
        },
      }),
      showBindsetSections: true,
    });

    const { fragment } = await renderKeyBrowserGrid(input);
    const primary = fragment.querySelector(
      '.bindset-section[data-bindset="Primary Bindset"]',
    );
    const tactical = fragment.querySelector(
      '.bindset-section[data-bindset="Tactical"]',
    );
    const actions = (section) =>
      [...section.querySelectorAll(".bindset-menu-item")].map(
        (element) => element.dataset.action,
      );

    expect(actions(primary)).toEqual(["create", "clone"]);
    expect(actions(tactical)).toEqual(["clone", "rename", "delete"]);
    expect(
      tactical.querySelector('[data-action="delete"]')?.classList,
    ).toContain("dangerous");
    for (const item of tactical.querySelectorAll(".bindset-menu-item")) {
      expect(item.dataset.bindset).toBe("Tactical");
    }
    expect(tactical.querySelector('[data-action="bindset-menu"]')?.title).toBe(
      "translated:bindset_actions",
    );
  });

  it("projects category and bindset collapse state into inert action markup", async () => {
    const categorizedInput = createInput({
      mode: "categorized",
      primaryKeyMap: { F1: ["FireAll"] },
      viewState: viewState({ command: ["combat"] }),
      categorizeByCommand: vi.fn(async () => ({
        combat: category("Combat", ["F1"]),
      })),
    });

    const categoryResult = await renderKeyBrowserGrid(categorizedInput);
    const header = categoryResult.fragment.querySelector(
      'h4[data-category="combat"]',
    );
    expect(header?.dataset.action).toBe("toggle-category");
    expect(header?.dataset.mode).toBe("command");
    expect(header?.classList).toContain("collapsed");
    expect(
      categoryResult.fragment.querySelector(".category-commands")?.classList,
    ).toContain("collapsed");

    const bindsetInput = createInput({
      profile: profile({
        Tactical: {
          space: { keys: { F2: ["Target_Enemy_Near"] } },
          ground: { keys: {} },
        },
      }),
      showBindsetSections: true,
      viewState: viewState({ bindsets: ["Tactical"] }),
    });
    const bindsetResult = await renderKeyBrowserGrid(bindsetInput);
    const tactical = bindsetResult.fragment.querySelector(
      '.bindset-section[data-bindset="Tactical"]',
    );
    expect(tactical?.querySelector(".bindset-header")?.dataset.action).toBe(
      "toggle-bindset",
    );
    expect(tactical?.querySelector(".bindset-content")?.classList).toContain(
      "collapsed",
    );
    expect(tactical?.querySelector(".twisty")?.classList).toContain(
      "collapsed",
    );
  });

  it("renders translated empty bindsets without requesting computations", async () => {
    const input = createInput({
      profile: profile({
        Empty: { space: { keys: {} }, ground: { keys: {} } },
      }),
      showBindsetSections: true,
    });

    const { fragment } = await renderKeyBrowserGrid(input);
    const empty = fragment.querySelector(
      '.bindset-section[data-bindset="Empty"]',
    );

    expect(empty?.querySelector(".empty-section")?.textContent).toBe(
      "translated:no_keys_in_bindset",
    );
    expect(empty?.querySelector(".bindset-count")?.textContent).toBe("(0)");
    expect(input.sortKeys).not.toHaveBeenCalled();
    expect(input.categorizeByCommand).not.toHaveBeenCalled();
    expect(input.categorizeByType).not.toHaveBeenCalled();
  });

  it("passes each captured section map to the injected categorizer", async () => {
    const namedMap = { F9: ["NamedOnly", "NamedSecond"] };
    const categorizeByCommand = vi.fn(async (keyMap, keys) => ({
      [`category-${keys[0]}`]: category("ignored", keys),
    }));
    const input = createInput({
      mode: "categorized",
      profile: profile({
        Tactical: {
          space: { keys: namedMap },
          ground: { keys: {} },
        },
      }),
      primaryKeyMap: { F1: ["PrimaryOnly"] },
      showBindsetSections: true,
      categorizeByCommand,
    });

    const { fragment } = await renderKeyBrowserGrid(input);

    expect(categorizeByCommand.mock.calls).toEqual([
      [{ F1: ["PrimaryOnly"] }, ["F1"]],
      [namedMap, ["F9"]],
    ]);
    expect(
      fragment
        .querySelector('.bindset-section[data-bindset="Tactical"] [data-key]')
        ?.getAttribute("title"),
    ).toBe("F9: 2 translated:commands");
  });

  it("uses only the injected document and leaves returned nodes listener-free", async () => {
    const injectedDocument = document.implementation.createHTMLDocument();
    const addDocumentListener = vi.spyOn(injectedDocument, "addEventListener");
    const input = createInput({
      document: injectedDocument,
      primaryKeyMap: { F1: ["FireAll"] },
    });
    vi.stubGlobal("document", undefined);

    const { fragment } = await renderKeyBrowserGrid(input);

    expect(fragment.ownerDocument).toBe(injectedDocument);
    expect(fragment.querySelector('[data-action="select-key"]')).not.toBeNull();
    expect(addDocumentListener).not.toHaveBeenCalled();
  });
});
