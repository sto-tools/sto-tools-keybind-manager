import { describe, expect, it } from "vitest";

import { planCommandChainClear } from "../../../src/js/components/services/commandChainOperations.js";

function createProfile() {
  return {
    name: "Captain",
    description: "Detached clear planning",
    currentEnvironment: "space",
    builds: {
      space: {
        keys: {
          F1: ["FireAll"],
          Empty: [],
        },
      },
      ground: {
        keys: {
          G: ["TargetEnemyNear"],
        },
      },
    },
    aliases: {
      Alpha: {
        commands: ["FirePhasers"],
        description: "Preserve me",
        metadata: { source: "profile", nested: { layer: 1 } },
      },
      EmptyAlias: {
        commands: [],
        description: "Already empty",
      },
    },
    bindsets: {
      Weapons: {
        space: {
          keys: {
            F2: ["FireTorps"],
            Empty: [],
          },
        },
        ground: { keys: { G2: ["TrayExecByTray 0 0"] } },
      },
      SpaceOnly: {
        space: { keys: { F3: ["TargetFriendNear"] } },
      },
    },
    keybindMetadata: {
      space: { F1: { stabilizeExecutionOrder: true, source: "profile" } },
    },
    aliasMetadata: {
      Alpha: { stabilizeExecutionOrder: true },
    },
    bindsetMetadata: {
      Weapons: {
        space: { F2: { stabilizeExecutionOrder: true } },
      },
    },
    selections: { space: "F1", ground: "G", alias: "Alpha" },
  };
}

function plan(profile, overrides = {}) {
  return planCommandChainClear({
    profile,
    profileId: "captain",
    key: "F1",
    environment: "space",
    bindset: null,
    ...overrides,
  });
}

function successful(result) {
  if (!result.valid) throw new Error(`Expected valid plan: ${result.reason}`);
  return result;
}

describe("planCommandChainClear", () => {
  it.each([
    {
      environment: "space",
      key: "F1",
      expectedCommands: ["FireAll"],
    },
    {
      environment: "ground",
      key: "G",
      expectedCommands: ["TargetEnemyNear"],
    },
  ])(
    "plans an exact primary $environment update without touching the profile",
    ({ environment, key, expectedCommands }) => {
      const profile = createProfile();
      const before = structuredClone(profile);

      const result = successful(plan(profile, { environment, key }));

      expect(result).toEqual({
        valid: true,
        noOp: false,
        target: {
          kind: "primary",
          environment,
          key,
          bindset: null,
        },
        updateProfileRequest: {
          profileId: "captain",
          modify: {
            builds: {
              [environment]: {
                keys: { [key]: [] },
              },
            },
          },
        },
      });
      expect(profile).toEqual(before);
      expect(profile.builds[environment].keys[key]).toEqual(expectedCommands);
    },
  );

  it("keeps the absent-primary request even though its projected data change is a no-op", () => {
    const result = successful(plan(createProfile(), { key: "Missing" }));

    expect(result.noOp).toBe(true);
    expect(result.updateProfileRequest).toEqual({
      profileId: "captain",
      modify: {
        builds: {
          space: {
            keys: { Missing: [] },
          },
        },
      },
    });
  });

  it("keeps the request for an already-empty primary chain", () => {
    const result = successful(plan(createProfile(), { key: "Empty" }));

    expect(result.noOp).toBe(true);
    expect(result.updateProfileRequest.modify?.builds?.space?.keys).toEqual({
      Empty: [],
    });
  });

  it("treats Primary Bindset as the primary build", () => {
    const result = successful(
      plan(createProfile(), {
        key: "F1",
        bindset: "Primary Bindset",
      }),
    );

    expect(result.target).toEqual({
      kind: "primary",
      environment: "space",
      key: "F1",
      bindset: null,
    });
    expect(result.updateProfileRequest).toEqual({
      profileId: "captain",
      modify: {
        builds: { space: { keys: { F1: [] } } },
      },
    });
  });

  it("plans a present alias with its complete definition and metadata", () => {
    const profile = createProfile();
    const before = structuredClone(profile);

    const result = successful(
      plan(profile, {
        environment: "alias",
        key: "Alpha",
        bindset: "Weapons",
      }),
    );

    expect(result).toEqual({
      valid: true,
      noOp: false,
      target: {
        kind: "alias",
        environment: "alias",
        key: "Alpha",
        bindset: null,
      },
      updateProfileRequest: {
        profileId: "captain",
        modify: {
          aliases: {
            Alpha: {
              commands: [],
              description: "Preserve me",
              metadata: { source: "profile", nested: { layer: 1 } },
            },
          },
        },
      },
    });
    expect(profile).toEqual(before);
  });

  it("describes an already-empty alias as a no-op while retaining its request", () => {
    const result = successful(
      plan(createProfile(), {
        environment: "alias",
        key: "EmptyAlias",
      }),
    );

    expect(result.noOp).toBe(true);
    expect(result.updateProfileRequest.modify?.aliases).toEqual({
      EmptyAlias: {
        commands: [],
        description: "Already empty",
      },
    });
  });

  it("rejects an absent alias before constructing an update request", () => {
    const result = plan(createProfile(), {
      environment: "alias",
      key: "Missing",
    });

    expect(result).toEqual({
      valid: false,
      reason: "missing_alias",
      updateProfileRequest: null,
    });
  });

  it.each([
    { environment: "space", key: "F2", noOp: false },
    { environment: "ground", key: "G2", noOp: false },
    { environment: "space", key: "Empty", noOp: true },
  ])(
    "plans an exact existing named-bindset $environment update for $key",
    ({ environment, key, noOp }) => {
      const result = successful(
        plan(createProfile(), {
          environment,
          key,
          bindset: "Weapons",
        }),
      );

      expect(result.noOp).toBe(noOp);
      expect(result.target).toEqual({
        kind: "bindset",
        environment,
        key,
        bindset: "Weapons",
      });
      expect(result.updateProfileRequest).toEqual({
        profileId: "captain",
        modify: {
          bindsets: {
            Weapons: {
              [environment]: { keys: { [key]: [] } },
            },
          },
        },
      });
    },
  );

  it.each([
    {
      bindset: "Missing",
      environment: "space",
      key: "F8",
    },
    {
      bindset: "SpaceOnly",
      environment: "ground",
      key: "G8",
    },
  ])(
    "upserts missing named-bindset structure for $bindset/$environment",
    ({ bindset, environment, key }) => {
      const result = successful(
        plan(createProfile(), { bindset, environment, key }),
      );

      expect(result.noOp).toBe(false);
      expect(result.updateProfileRequest).toEqual({
        profileId: "captain",
        modify: {
          bindsets: {
            [bindset]: {
              [environment]: { keys: { [key]: [] } },
            },
          },
        },
      });
    },
  );

  it("does not include or alter key, alias, or bindset metadata patches", () => {
    const profile = createProfile();
    const before = structuredClone(profile);

    const primary = successful(plan(profile));
    const bindset = successful(
      plan(profile, { bindset: "Weapons", key: "F2" }),
    );
    const alias = successful(
      plan(profile, { environment: "alias", key: "Alpha" }),
    );

    expect(primary.updateProfileRequest.modify).not.toHaveProperty(
      "keybindMetadata",
    );
    expect(bindset.updateProfileRequest.modify).not.toHaveProperty(
      "bindsetMetadata",
    );
    expect(alias.updateProfileRequest.modify).not.toHaveProperty(
      "aliasMetadata",
    );
    expect(profile).toEqual(before);
  });

  it("returns detached alias payloads in both directions", () => {
    const profile = createProfile();
    const result = successful(
      plan(profile, { environment: "alias", key: "Alpha" }),
    );
    const alias = result.updateProfileRequest.modify?.aliases?.Alpha;
    if (!alias) throw new Error("Expected detached alias update");

    alias.metadata.nested.layer = 9;
    alias.description = "Changed plan";
    expect(profile.aliases.Alpha).toEqual({
      commands: ["FirePhasers"],
      description: "Preserve me",
      metadata: { source: "profile", nested: { layer: 1 } },
    });

    profile.aliases.Alpha.metadata.nested.layer = 7;
    expect(alias.metadata.nested.layer).toBe(9);
    expect(alias.description).toBe("Changed plan");
  });

  it.each([
    [undefined, "invalid_options"],
    [null, "invalid_options"],
    [{}, "invalid_profile"],
    [{ profile: [] }, "invalid_profile"],
  ])("rejects invalid top-level input %#", (input, reason) => {
    expect(planCommandChainClear(input)).toEqual({
      valid: false,
      reason,
      updateProfileRequest: null,
    });
  });

  it.each([
    ["missing profile ID", { profileId: "" }, "missing_profile_id"],
    ["non-string profile ID", { profileId: 7 }, "missing_profile_id"],
    ["missing key", { key: "" }, "missing_key"],
    ["non-string key", { key: {} }, "missing_key"],
    ["invalid environment", { environment: 7 }, "invalid_environment"],
    ["invalid bindset", { bindset: {} }, "invalid_bindset"],
  ])("rejects %s", (_label, overrides, reason) => {
    expect(plan(createProfile(), overrides)).toEqual({
      valid: false,
      reason,
      updateProfileRequest: null,
    });
  });

  it("defaults a missing environment and empty bindset exactly like the facade", () => {
    const result = successful(
      plan(createProfile(), { environment: null, bindset: "" }),
    );

    expect(result.target).toEqual({
      kind: "primary",
      environment: "space",
      key: "F1",
      bindset: null,
    });
  });

  it.each(["__proto__", "prototype", "constructor"])(
    "rejects reserved dynamic identifier %s in every request position",
    (reserved) => {
      const profile = createProfile();
      const requests = [
        { profileId: reserved },
        { key: reserved },
        { environment: reserved },
        { bindset: reserved },
      ];

      for (const overrides of requests) {
        expect(plan(profile, overrides)).toEqual({
          valid: false,
          reason: "unsafe_identifier",
          updateProfileRequest: null,
        });
      }
      expect(Object.prototype).not.toHaveProperty("F1");
    },
  );

  it("supports safe own names that collide with Object.prototype members", () => {
    const profile = createProfile();
    profile.bindsets = Object.fromEntries([
      [
        "toString",
        {
          valueOf: {
            keys: Object.fromEntries([["hasOwnProperty", ["SafeCommand"]]]),
          },
        },
      ],
    ]);

    const result = successful(
      plan(profile, {
        profileId: "toString",
        bindset: "toString",
        environment: "valueOf",
        key: "hasOwnProperty",
      }),
    );

    expect(result.noOp).toBe(false);
    const modify = result.updateProfileRequest.modify?.bindsets;
    expect(Object.hasOwn(modify, "toString")).toBe(true);
    expect(Object.hasOwn(modify.toString, "valueOf")).toBe(true);
    expect(Object.hasOwn(modify.toString.valueOf.keys, "hasOwnProperty")).toBe(
      true,
    );
    expect(modify.toString.valueOf.keys.hasOwnProperty).toEqual([]);
    expect(Object.prototype).not.toHaveProperty("SafeCommand");
  });

  it("requires prototype-sensitive aliases to be own profile data", () => {
    const profile = createProfile();

    expect(plan(profile, { environment: "alias", key: "toString" })).toEqual({
      valid: false,
      reason: "missing_alias",
      updateProfileRequest: null,
    });

    Object.defineProperty(profile.aliases, "toString", {
      value: {
        commands: ["SafeAlias"],
        metadata: { source: "own-data" },
      },
      enumerable: true,
      configurable: true,
      writable: true,
    });
    const result = successful(
      plan(profile, { environment: "alias", key: "toString" }),
    );

    expect(
      Object.hasOwn(result.updateProfileRequest.modify?.aliases, "toString"),
    ).toBe(true);
    expect(result.updateProfileRequest.modify?.aliases?.toString).toEqual({
      commands: [],
      metadata: { source: "own-data" },
    });
  });

  it("rejects unsafe nested alias metadata without mutating either prototype", () => {
    const profile = createProfile();
    profile.aliases.Alpha.metadata = JSON.parse(
      '{"extension":{"constructor":{"polluted":true}}}',
    );

    expect(() =>
      plan(profile, { environment: "alias", key: "Alpha" }),
    ).not.toThrow();
    expect(plan(profile, { environment: "alias", key: "Alpha" })).toEqual({
      valid: false,
      reason: "invalid_payload",
      updateProfileRequest: null,
    });
    expect(Object.prototype).not.toHaveProperty("polluted");
  });
});
