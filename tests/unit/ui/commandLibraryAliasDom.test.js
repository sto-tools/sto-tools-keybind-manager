import { beforeEach, describe, expect, it } from "vitest";

import {
  createCommandLibraryAliasCategory,
  projectCommandLibraryBindsetAliases,
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

  it("applies persisted collapsed state to the category header and commands", () => {
    localStorage.setItem("commandCategory_vertigo-aliases_collapsed", "true");

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
    });

    expect(element.querySelector("h4")?.classList).toContain("collapsed");
    expect(element.querySelector(".category-commands")?.classList).toContain(
      "collapsed",
    );
    expect(
      localStorage.getItem("commandCategory_vertigo-aliases_collapsed"),
    ).toBe("true");
  });
});
