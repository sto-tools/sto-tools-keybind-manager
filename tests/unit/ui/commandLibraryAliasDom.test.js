import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  acceptCommandLibraryPresentation,
  createCommandLibraryAliasCategory,
  projectCommandLibraryCategoryCollapse,
  projectCommandLibraryBindsetAliases,
  reconcileCommandLibraryPresentation,
  sanitizeCommandLibraryBindsetName,
} from "../../../src/js/components/ui/commandLibraryAliasDom.js";

describe("commandLibraryAliasDom", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("sanitizeCommandLibraryBindsetName", () => {
    it.each([
      ["", ""],
      ["Primary Bindset", "primary_bindset"],
      ["  Tactical / Alpha ++ Team  ", "tactical_alpha_team"],
      ["Already___Separated", "already_separated"],
      ["42nd Fleet", "bs_42nd_fleet"],
    ])("sanitizes %j to %j", (name, expected) => {
      expect(sanitizeCommandLibraryBindsetName(name)).toBe(expected);
    });
  });

  describe("projectCommandLibraryBindsetAliases", () => {
    const profile = {
      bindsets: { "42nd Fleet": {} },
    };
    const translate = (key) => `translated:${key}`;

    it("projects primary and profile bindsets for both environments", () => {
      const aliases = projectCommandLibraryBindsetAliases(
        profile,
        { bindsetsEnabled: true, bindToAliasMode: true },
        translate,
      );

      expect(aliases).toHaveLength(4);
      expect(aliases[0]).toEqual([
        "sto_kb_bindset_enable_space_primary_bindset",
        {
          type: "bindset-alias",
          description:
            "translated:bindsets: translated:space - translated:bindset_enable translated:primary_bindset",
          commands: "sto_kb_bindset_enable_space_primary_bindset",
          displayName:
            "translated:bindsets: translated:space - translated:bindset_enable translated:primary_bindset",
        },
      ]);
      expect(aliases.at(-1)?.[0]).toBe(
        "sto_kb_bindset_enable_ground_bs_42nd_fleet",
      );
    });

    it.each([
      { bindsetsEnabled: false, bindToAliasMode: true },
      { bindsetsEnabled: true, bindToAliasMode: false },
    ])("returns no aliases when the feature is disabled", (preferences) => {
      expect(
        projectCommandLibraryBindsetAliases(profile, preferences, translate),
      ).toEqual([]);
    });

    it("preserves the UI fallback when translation fails", () => {
      expect(
        projectCommandLibraryBindsetAliases(
          profile,
          { bindsetsEnabled: true, bindToAliasMode: true },
          () => {
            throw new Error("translation unavailable");
          },
        ),
      ).toEqual([]);
    });
  });

  it.each([
    {
      categoryType: "aliases",
      itemClass: "alias-item",
      itemIcon: "🎭",
      alias: {
        commands: ["FireAll"],
        description: '"><img id="regular-description-probe">',
        displayName: 'Regular <probe data-owned="true">',
      },
    },
    {
      categoryType: "vertigo-aliases",
      itemClass: "vertigo-alias-item",
      itemIcon: "👁️",
      alias: {
        commands: ["dynFxSetFXExlusionList Bloom"],
        description: '"><img id="vfx-description-probe">',
        type: "vfx-alias",
        _displayName: 'VFX <probe data-owned="true">',
        virtual: true,
      },
    },
  ])(
    "constructs safe $categoryType item text and data",
    ({ categoryType, itemClass, itemIcon, alias }) => {
      const aliasName = 'A&B <alias data-owned="true">';
      const element = createCommandLibraryAliasCategory({
        document,
        translate: (key) => `Translated <${key}>`,
        aliases: [[aliasName, alias]],
        categoryType,
        titleKey: "unsafe-title",
        iconClass: "fas fa-mask unsafe-icon",
        collapsed: false,
      });

      const header = element.querySelector("h4");
      const item = element.querySelector(`.${itemClass}`);

      expect(element.dataset.category).toBe(categoryType);
      expect(header?.textContent).toContain("Translated <unsafe-title>");
      expect(header?.querySelector(".command-count")?.textContent).toBe("(1)");
      expect(header?.querySelector(".unsafe-icon")).toBeTruthy();
      expect(item?.classList).toContain("command-item");
      expect(item?.dataset.alias).toBe(aliasName);
      expect(item?.title).toBe(alias.description);
      expect(item?.textContent).toBe(
        `${itemIcon} ${alias.displayName || alias._displayName}`,
      );

      expect(element.querySelector("alias")).toBeNull();
      expect(element.querySelector("probe")).toBeNull();
      expect(element.querySelector("img")).toBeNull();
    },
  );

  it("applies the explicit accepted collapse value without reading persistence", () => {
    localStorage.setItem("commandCategory_vertigo-aliases_collapsed", "false");
    const element = createCommandLibraryAliasCategory({
      document,
      translate: (key) => key,
      aliases: [
        [
          "dynFxSetFXExclusionList_Space",
          {
            commands: ["dynFxSetFXExlusionList Bloom"],
            type: "vfx-alias",
          },
        ],
      ],
      categoryType: "vertigo-aliases",
      titleKey: "vfx_aliases",
      iconClass: "fas fa-eye-slash",
      collapsed: true,
    });

    expect(element.querySelector("h4")?.classList).toContain("collapsed");
    expect(element.querySelector(".category-commands")?.classList).toContain(
      "collapsed",
    );
    expect(
      localStorage.getItem("commandCategory_vertigo-aliases_collapsed"),
    ).toBe("false");
  });

  it("projects and reconciles every existing static and alias category", () => {
    document.body.innerHTML = `
      <div id="commandCategoriesList">
        <div class="category" data-category="movement">
          <h4><i class="category-chevron"></i></h4>
          <div class="category-commands"></div>
        </div>
      </div>
      <div id="aliasCategoriesList">
        <div class="category" data-category="aliases">
          <h4><i class="category-chevron"></i></h4>
          <div class="category-commands"></div>
        </div>
      </div>
    `;
    const movement = document.querySelector('[data-category="movement"]');
    const aliases = document.querySelector('[data-category="aliases"]');

    projectCommandLibraryCategoryCollapse(movement, true);
    expect(movement.querySelector("h4")?.classList).toContain("collapsed");

    const consumer = {
      cache: {
        commandPresentationState: {
          authorityEpoch: 1,
          revision: 1,
          collapsedCategories: ["aliases"],
          collapsedGroups: [],
        },
      },
      document,
      eventListenersSetup: true,
      pendingInitialRender: false,
      hasRequiredData: () => true,
      performInitialRender: vi.fn(),
    };
    reconcileCommandLibraryPresentation(consumer);

    expect(movement.querySelector("h4")?.classList).not.toContain("collapsed");
    expect(aliases.querySelector("h4")?.classList).toContain("collapsed");
    expect(aliases.querySelector(".category-chevron")?.style.transform).toBe(
      "rotate(0deg)",
    );
  });

  it("accepts only newer complete owner snapshots", () => {
    const consumer = {
      cache: { commandPresentationState: null },
      document,
      eventListenersSetup: true,
      pendingInitialRender: true,
      hasRequiredData: () => true,
      performInitialRender: vi.fn(),
    };
    const initial = {
      authorityEpoch: 5,
      revision: 2,
      collapsedCategories: ["aliases"],
      collapsedGroups: [],
    };

    expect(acceptCommandLibraryPresentation(consumer, initial)).toBe(true);
    expect(consumer.performInitialRender).toHaveBeenCalledOnce();
    expect(acceptCommandLibraryPresentation(consumer, initial)).toBe(false);
    expect(
      acceptCommandLibraryPresentation(consumer, {
        ...initial,
        authorityEpoch: 6,
        revision: 0,
        collapsedCategories: [],
      }),
    ).toBe(true);
    expect(consumer.cache.commandPresentationState).toMatchObject({
      authorityEpoch: 6,
      revision: 0,
      collapsedCategories: [],
    });
  });
});
