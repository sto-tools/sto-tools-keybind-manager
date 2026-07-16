import { describe, expect, it, vi } from "vitest";

import {
  generateVFXAliasCommands,
  normalizeVFXSettings,
  projectCombinedAliases,
  projectVirtualVFXAliases,
} from "../../../src/js/components/services/vfxAliasProjection.js";

const EMPTY_VFX_SETTINGS = {
  selectedEffects: { space: [], ground: [] },
  showPlayerSay: false,
};

const VIRTUAL_ALIAS_NAMES = [
  "dynFxSetFXExclusionList_Space",
  "dynFxSetFXExclusionList_Ground",
  "dynFxSetFXExclusionList_Combined",
];

describe("VFX alias projection", () => {
  describe("normalizeVFXSettings", () => {
    it.each([
      ["missing", undefined],
      ["null", null],
      ["boolean", false],
      ["number", 42],
      ["string", "invalid"],
      ["array", []],
      ["missing selected effects", { showPlayerSay: "true" }],
      ["null selected effects", { selectedEffects: null }],
      [
        "malformed environment collections",
        { selectedEffects: { space: "Bloom", ground: {} } },
      ],
    ])("normalizes %s input to an empty complete snapshot", (_label, input) => {
      expect(normalizeVFXSettings(input)).toEqual(EMPTY_VFX_SETTINGS);
    });

    it("filters malformed effects, de-duplicates per environment, and accepts only a literal true flag", () => {
      const input = {
        selectedEffects: {
          space: ["Bloom", "Bloom", "", null, 42, "FX_A"],
          ground: ["Bloom", "FX_B", "FX_B", undefined],
        },
        showPlayerSay: true,
      };

      expect(normalizeVFXSettings(input)).toEqual({
        selectedEffects: {
          space: ["Bloom", "FX_A"],
          ground: ["Bloom", "FX_B"],
        },
        showPlayerSay: true,
      });
      expect(
        normalizeVFXSettings({
          selectedEffects: { space: [], ground: [] },
          showPlayerSay: 1,
        }).showPlayerSay,
      ).toBe(false);
    });

    it("returns a detached snapshot without changing its input", () => {
      const input = {
        selectedEffects: {
          space: ["Bloom", "Bloom"],
          ground: ["FX_B"],
        },
        showPlayerSay: true,
      };
      const original = structuredClone(input);

      const normalized = normalizeVFXSettings(input);
      normalized.selectedEffects.space.push("LocalOnly");
      input.selectedEffects.ground.push("InputOnly");

      expect(input).toEqual({
        ...original,
        selectedEffects: {
          ...original.selectedEffects,
          ground: ["FX_B", "InputOnly"],
        },
      });
      expect(normalized.selectedEffects.ground).toEqual(["FX_B"]);
      expect(normalized.selectedEffects.space).toEqual(["Bloom", "LocalOnly"]);
    });
  });

  describe("generateVFXAliasCommands", () => {
    const settings = {
      selectedEffects: {
        space: ["Shared", "SpaceOnly", "Shared"],
        ground: ["Shared", "GroundOnly", "GroundOnly"],
      },
      showPlayerSay: false,
    };

    it("preserves environment order and cross-environment duplicates", () => {
      expect(generateVFXAliasCommands(settings, "space")).toEqual([
        "dynFxSetFXExlusionList Shared,SpaceOnly",
      ]);
      expect(generateVFXAliasCommands(settings, "ground")).toEqual([
        "dynFxSetFXExlusionList Shared,GroundOnly",
      ]);
      expect(generateVFXAliasCommands(settings, ["space", "ground"])).toEqual([
        "dynFxSetFXExlusionList Shared,SpaceOnly,Shared,GroundOnly",
      ]);
      expect(generateVFXAliasCommands(settings, ["ground", "space"])).toEqual([
        "dynFxSetFXExlusionList Shared,GroundOnly,Shared,SpaceOnly",
      ]);
      expect(generateVFXAliasCommands(settings, "alias")).toEqual([]);
    });

    it("uses the stable English PlayerSay message unless generated-message translation is enabled", () => {
      const translate = vi.fn(() => "Unterdrueckung geladen");
      const speakingSettings = {
        selectedEffects: { space: ["Bloom"], ground: [] },
        showPlayerSay: true,
      };

      expect(
        generateVFXAliasCommands(speakingSettings, "space", { translate }),
      ).toEqual([
        "dynFxSetFXExlusionList Bloom",
        "PlayerSay VFX Suppression Loaded",
      ]);
      expect(translate).not.toHaveBeenCalled();

      expect(
        generateVFXAliasCommands(speakingSettings, "space", {
          translate,
          translateGeneratedMessages: true,
        }),
      ).toEqual([
        "dynFxSetFXExlusionList Bloom",
        "PlayerSay Unterdrueckung geladen",
      ]);
      expect(translate).toHaveBeenCalledOnce();
      expect(translate).toHaveBeenCalledWith("vfx_suppression_loaded");
    });

    it("does not generate a standalone PlayerSay command without effects", () => {
      const translate = vi.fn(() => "translated");

      expect(
        generateVFXAliasCommands(
          {
            selectedEffects: { space: [], ground: [] },
            showPlayerSay: true,
          },
          ["space", "ground"],
          { translate, translateGeneratedMessages: true },
        ),
      ).toEqual([]);
      expect(translate).not.toHaveBeenCalled();
    });
  });

  describe("projectVirtualVFXAliases", () => {
    it("always projects the exact three aliases, including for empty state", () => {
      const aliases = projectVirtualVFXAliases(undefined);

      expect(Object.keys(aliases)).toEqual(VIRTUAL_ALIAS_NAMES);
      expect(aliases).toEqual({
        dynFxSetFXExclusionList_Space: {
          commands: [],
          description: "vfx_suppression_for_environment",
          type: "vfx-alias",
          virtual: true,
        },
        dynFxSetFXExclusionList_Ground: {
          commands: [],
          description: "vfx_suppression_for_environment",
          type: "vfx-alias",
          virtual: true,
        },
        dynFxSetFXExclusionList_Combined: {
          commands: [],
          description: "vfx_suppression_for_all_environments",
          type: "vfx-alias",
          virtual: true,
        },
      });
    });

    it("translates descriptions with the established keys and interpolation payloads", () => {
      const translate = vi.fn((key, options) =>
        options?.environment ? `${key}:${options.environment}` : `${key}:all`,
      );

      const aliases = projectVirtualVFXAliases(
        {
          selectedEffects: { space: ["Bloom"], ground: ["Smoke"] },
          showPlayerSay: false,
        },
        { translate },
      );

      expect(aliases.dynFxSetFXExclusionList_Space).toMatchObject({
        commands: ["dynFxSetFXExlusionList Bloom"],
        description: "vfx_suppression_for_environment:space",
      });
      expect(aliases.dynFxSetFXExclusionList_Ground).toMatchObject({
        commands: ["dynFxSetFXExlusionList Smoke"],
        description: "vfx_suppression_for_environment:ground",
      });
      expect(aliases.dynFxSetFXExclusionList_Combined).toMatchObject({
        commands: ["dynFxSetFXExlusionList Bloom,Smoke"],
        description: "vfx_suppression_for_all_environments:all",
      });
      expect(translate).toHaveBeenNthCalledWith(
        1,
        "vfx_suppression_for_environment",
        { environment: "space" },
      );
      expect(translate).toHaveBeenNthCalledWith(
        2,
        "vfx_suppression_for_environment",
        { environment: "ground" },
      );
      expect(translate).toHaveBeenNthCalledWith(
        3,
        "vfx_suppression_for_all_environments",
      );
    });

    it("returns fresh aliases and command arrays detached from settings", () => {
      const settings = {
        selectedEffects: { space: ["Bloom"], ground: [] },
        showPlayerSay: false,
      };
      const first = projectVirtualVFXAliases(settings);
      settings.selectedEffects.space.push("InputOnly");
      first.dynFxSetFXExclusionList_Space.commands.push("OutputOnly");
      const second = projectVirtualVFXAliases({
        selectedEffects: { space: ["Bloom"], ground: [] },
        showPlayerSay: false,
      });

      expect(first.dynFxSetFXExclusionList_Space.commands).toEqual([
        "dynFxSetFXExlusionList Bloom",
        "OutputOnly",
      ]);
      expect(second.dynFxSetFXExclusionList_Space.commands).toEqual([
        "dynFxSetFXExlusionList Bloom",
      ]);
      expect(first.dynFxSetFXExclusionList_Space.commands).not.toBe(
        second.dynFxSetFXExclusionList_Space.commands,
      );
    });
  });

  describe("projectCombinedAliases", () => {
    it("lets generated aliases replace every colliding reserved user alias", () => {
      const userAliases = Object.fromEntries([
        [
          "dynFxSetFXExclusionList_Space",
          { commands: ["UserSpace"], description: "reserved collision" },
        ],
        [
          "dynFxSetFXExclusionList_Ground",
          { commands: ["UserGround"], description: "reserved collision" },
        ],
        [
          "dynFxSetFXExclusionList_Combined",
          { commands: ["UserCombined"], description: "reserved collision" },
        ],
        ["UserAlias", { commands: ["FireAll"], description: "kept" }],
      ]);

      const aliases = projectCombinedAliases(userAliases, {
        selectedEffects: { space: ["Bloom"], ground: ["Smoke"] },
        showPlayerSay: false,
      });

      expect(aliases.UserAlias).toEqual({
        commands: ["FireAll"],
        description: "kept",
      });
      expect(aliases.dynFxSetFXExclusionList_Space).toMatchObject({
        commands: ["dynFxSetFXExlusionList Bloom"],
        type: "vfx-alias",
        virtual: true,
      });
      expect(aliases.dynFxSetFXExclusionList_Ground).toMatchObject({
        commands: ["dynFxSetFXExlusionList Smoke"],
        type: "vfx-alias",
        virtual: true,
      });
      expect(aliases.dynFxSetFXExclusionList_Combined).toMatchObject({
        commands: ["dynFxSetFXExlusionList Bloom,Smoke"],
        type: "vfx-alias",
        virtual: true,
      });
      expect(userAliases.dynFxSetFXExclusionList_Space.commands).toEqual([
        "UserSpace",
      ]);
    });

    it("preserves prototype-like own names without changing the result prototype", () => {
      const userAliases = Object.fromEntries([
        ["__proto__", { commands: ["ProtoCommand"] }],
        ["constructor", { commands: ["ConstructorCommand"] }],
        ["toString", { commands: ["ToStringCommand"] }],
      ]);

      const aliases = projectCombinedAliases(userAliases, undefined);

      expect(Object.getPrototypeOf(aliases)).toBe(Object.prototype);
      expect(Object.hasOwn(aliases, "__proto__")).toBe(true);
      expect(Object.hasOwn(aliases, "constructor")).toBe(true);
      expect(Object.hasOwn(aliases, "toString")).toBe(true);
      expect(aliases.__proto__).toEqual({ commands: ["ProtoCommand"] });
      expect(aliases.constructor).toEqual({
        commands: ["ConstructorCommand"],
      });
      expect(aliases.toString).toEqual({ commands: ["ToStringCommand"] });
    });

    it("deeply detaches user aliases and virtual output from all inputs", () => {
      const userAliases = {
        Engage: {
          commands: [
            "FireAll",
            { command: "Target_Enemy_Near", parameters: { arc: 90 } },
          ],
          metadata: { source: { kind: "user" } },
        },
      };
      const settings = {
        selectedEffects: { space: ["Bloom"], ground: [] },
        showPlayerSay: false,
      };
      const originalUsers = structuredClone(userAliases);
      const originalSettings = structuredClone(settings);

      const aliases = projectCombinedAliases(userAliases, settings);

      expect(aliases.Engage).not.toBe(userAliases.Engage);
      expect(aliases.Engage.commands).not.toBe(userAliases.Engage.commands);
      expect(aliases.Engage.commands[1]).not.toBe(
        userAliases.Engage.commands[1],
      );
      expect(aliases.Engage.metadata).not.toBe(userAliases.Engage.metadata);

      aliases.Engage.commands[1].parameters.arc = 180;
      aliases.Engage.metadata.source.kind = "projected";
      aliases.dynFxSetFXExclusionList_Space.commands.push("OutputOnly");

      expect(userAliases).toEqual(originalUsers);
      expect(settings).toEqual(originalSettings);
      expect(
        projectCombinedAliases(userAliases, settings)
          .dynFxSetFXExclusionList_Space.commands,
      ).toEqual(["dynFxSetFXExlusionList Bloom"]);
    });
  });
});
