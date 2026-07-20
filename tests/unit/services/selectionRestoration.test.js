import { describe, expect, it } from "vitest";

import {
  planAutomaticSelection,
  planEnvironmentSelectionTransition,
  planProfileSelectionTransition,
  planSelectionRestoration,
  selectionExists,
} from "../../../src/js/components/services/selectionRestoration.js";

function profile({
  environment = "space",
  currentEnvironment = environment,
  selections = {},
  spaceKeys = {},
  groundKeys = {},
  aliases = {},
} = {}) {
  return {
    id: "captain",
    environment,
    currentEnvironment,
    selections,
    builds: {
      space: { keys: spaceKeys },
      ground: { keys: groundKeys },
    },
    aliases,
  };
}

function automaticOptions(overrides = {}) {
  return {
    profileAvailable: true,
    environment: "space",
    activeEnvironment: "space",
    aliases: {},
    profileAliases: {},
    primaryKeys: {},
    excludedKey: null,
    excludedAlias: null,
    ...overrides,
  };
}

function restorationOptions(overrides = {}) {
  const currentProfile = profile({
    spaceKeys: { F1: [], F2: [] },
    aliases: {
      UserAlias: { type: "alias" },
      GeneratedAlias: { type: "vfx-alias" },
    },
  });
  return {
    reason: "restore",
    profileAvailable: true,
    environment: "space",
    activeEnvironment: "space",
    cachedSelection: "F1",
    profile: currentProfile,
    aliases: currentProfile.aliases,
    profileAliases: currentProfile.aliases,
    primaryKeys: currentProfile.builds.space.keys,
    excludedKey: null,
    excludedAlias: null,
    skipPersistence: true,
    ...overrides,
  };
}

describe("selection restoration domain plans", () => {
  describe("selection existence", () => {
    it("requires an array-backed key in the requested environment", () => {
      const currentProfile = profile({
        spaceKeys: { F1: [], Broken: "FireAll" },
        groundKeys: { G1: [] },
      });

      expect(
        selectionExists({
          profile: currentProfile,
          environment: "space",
          selection: "F1",
        }),
      ).toBe(true);
      expect(
        selectionExists({
          profile: currentProfile,
          environment: "ground",
          selection: "F1",
        }),
      ).toBe(false);
      expect(
        selectionExists({
          profile: currentProfile,
          environment: "space",
          selection: "Broken",
        }),
      ).toBe(false);
    });

    it("accepts user and legacy aliases while excluding generated VFX aliases", () => {
      const aliases = {
        User: { type: "alias" },
        Legacy: {},
        Generated: { type: "vfx-alias" },
      };

      for (const selection of ["User", "Legacy"]) {
        expect(
          selectionExists({ aliases, environment: "alias", selection }),
        ).toBe(true);
      }
      expect(
        selectionExists({
          aliases,
          environment: "alias",
          selection: "Generated",
        }),
      ).toBe(false);
      expect(
        selectionExists({
          aliases: null,
          environment: "alias",
          selection: "User",
        }),
      ).toBe(false);
    });
  });

  describe("automatic fallback", () => {
    it("uses insertion order and excludes the last deleted key", () => {
      expect(
        planAutomaticSelection(
          automaticOptions({
            primaryKeys: { Deleted: [], Second: [], Third: [] },
            excludedKey: "Deleted",
          }),
        ),
      ).toEqual({
        kind: "select",
        target: "key",
        environment: "space",
        selection: "Second",
        bindset: "Primary Bindset",
      });
    });

    it("uses the nonempty accepted alias cache without falling through to the profile", () => {
      expect(
        planAutomaticSelection(
          automaticOptions({
            environment: "alias",
            activeEnvironment: "alias",
            aliases: { Generated: { type: "vfx-alias" } },
            profileAliases: { ProfileUser: { type: "alias" } },
          }),
        ),
      ).toEqual({ kind: "none" });
    });

    it("falls back to hydrated aliases and preserves insertion order", () => {
      expect(
        planAutomaticSelection(
          automaticOptions({
            environment: "alias",
            activeEnvironment: "alias",
            aliases: {},
            profileAliases: {
              Generated: { type: "vfx-alias" },
              Deleted: { type: "alias" },
              Selected: {},
            },
            excludedAlias: "Deleted",
          }),
        ),
      ).toEqual({
        kind: "select",
        target: "alias",
        environment: "alias",
        selection: "Selected",
        bindset: null,
      });
    });

    it("preserves the active-environment clear used by the empty key fallback", () => {
      expect(
        planAutomaticSelection(
          automaticOptions({
            environment: "ground",
            activeEnvironment: "alias",
          }),
        ),
      ).toEqual({
        kind: "clear",
        target: "alias",
        environment: "alias",
        selection: null,
        bindset: null,
      });
      expect(
        planAutomaticSelection(automaticOptions({ profileAvailable: false })),
      ).toEqual({ kind: "unavailable" });
    });
  });

  describe("restoration disposition", () => {
    it("restores valid key and alias selections without persistence when requested", () => {
      expect(planSelectionRestoration(restorationOptions())).toEqual({
        kind: "restore",
        target: "key",
        environment: "space",
        selection: "F1",
        bindset: null,
        skipPersistence: true,
      });
      expect(
        planSelectionRestoration(
          restorationOptions({
            environment: "alias",
            activeEnvironment: "alias",
            cachedSelection: "UserAlias",
          }),
        ),
      ).toMatchObject({
        kind: "restore",
        target: "alias",
        selection: "UserAlias",
      });
    });

    it("distinguishes empty profile updates from restoration auto-selection", () => {
      expect(
        planSelectionRestoration(
          restorationOptions({
            reason: "profile-update",
            cachedSelection: null,
          }),
        ),
      ).toEqual({
        kind: "publish-empty",
        target: "key",
        environment: "space",
      });
      expect(
        planSelectionRestoration(restorationOptions({ cachedSelection: null })),
      ).toMatchObject({
        kind: "auto-select",
        environment: "space",
        fallback: { kind: "select", selection: "F1" },
      });
    });

    it("clears an invalid active selection before insertion-order fallback", () => {
      expect(
        planSelectionRestoration(
          restorationOptions({ cachedSelection: "Missing" }),
        ),
      ).toMatchObject({
        kind: "replace-invalid",
        target: "key",
        environment: "space",
        invalidSelection: "Missing",
        clearCached: true,
        clearActive: true,
        fallback: { kind: "select", selection: "F1" },
      });
    });

    it("clears only the durable slot for an invalid inactive environment", () => {
      expect(
        planSelectionRestoration(
          restorationOptions({
            environment: "ground",
            activeEnvironment: "space",
            cachedSelection: "Missing",
            primaryKeys: { G1: [] },
          }),
        ),
      ).toMatchObject({
        kind: "replace-invalid",
        environment: "ground",
        clearActive: false,
        fallback: { kind: "select", environment: "ground", selection: "G1" },
      });
    });
  });

  describe("profile and environment transitions", () => {
    it("uses event, profile environment, current environment, then space precedence", () => {
      const currentProfile = profile({
        environment: "ground",
        currentEnvironment: "alias",
        selections: { ground: "G1", custom: "C1" },
      });
      expect(
        planProfileSelectionTransition({
          profile: currentProfile,
          eventEnvironment: "custom",
        }),
      ).toMatchObject({
        hasProfile: true,
        environment: "custom",
        cachedSelection: "C1",
        cachedSelections: {
          space: null,
          ground: "G1",
          alias: null,
          custom: "C1",
        },
      });
      expect(
        planProfileSelectionTransition({ profile: currentProfile }),
      ).toMatchObject({ environment: "ground", cachedSelection: "G1" });
      expect(planProfileSelectionTransition({ profile: null })).toEqual({
        hasProfile: false,
        environment: "space",
        cachedSelections: { space: null, ground: null, alias: null },
        cachedSelection: null,
      });
    });

    it("captures previous alias intent and resolves an undefined custom target from profile data", () => {
      expect(
        planEnvironmentSelectionTransition({
          newEnvironment: "custom",
          previousEnvironment: "alias",
          activeEnvironment: "alias",
          selectedKey: "F1",
          selectedAlias: "Alpha",
          cachedSelections: { space: "F1", ground: null, alias: "Alpha" },
          profileSelections: { custom: "C1" },
          builds: { custom: { keys: { C1: [] } } },
          profileKeys: { Legacy: [] },
          hasPendingPreviousIntent: true,
        }),
      ).toEqual({
        previousEnvironment: "alias",
        previousSelection: "Alpha",
        shouldRememberPrevious: false,
        shouldRememberTarget: true,
        targetEnvironment: "custom",
        targetSelection: "C1",
        target: "key",
        targetKeys: { C1: [] },
      });
    });

    it("keeps an explicit null target and remembers an unqueued previous key", () => {
      expect(
        planEnvironmentSelectionTransition({
          newEnvironment: "ground",
          activeEnvironment: "space",
          selectedKey: "F1",
          selectedAlias: null,
          cachedSelections: { space: "F1", ground: null, alias: null },
          profileSelections: { ground: "Ignored" },
          builds: {},
          profileKeys: { Legacy: [] },
          hasPendingPreviousIntent: false,
        }),
      ).toEqual({
        previousEnvironment: "space",
        previousSelection: "F1",
        shouldRememberPrevious: true,
        shouldRememberTarget: false,
        targetEnvironment: "ground",
        targetSelection: null,
        target: "key",
        targetKeys: { Legacy: [] },
      });
    });
  });
});
