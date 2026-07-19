import { describe, expect, it } from "vitest";

import { planCommandStabilization } from "../../../src/js/components/services/commandChainOperations.js";

function createProfile() {
  return {
    name: "Captain",
    currentEnvironment: "space",
    aliases: {
      Alpha: { commands: ["FireAll"] },
    },
    keybindMetadata: {
      space: {
        F1: {
          stabilizeExecutionOrder: true,
          source: "primary",
          extension: { nested: 1 },
        },
      },
    },
    aliasMetadata: {
      Alpha: {
        stabilizeExecutionOrder: true,
        source: "alias",
        extension: { nested: 2 },
      },
    },
    bindsetMetadata: {
      Weapons: {
        space: {
          F2: {
            stabilizeExecutionOrder: false,
            source: "bindset",
            extension: { nested: 3 },
          },
        },
      },
    },
  };
}

function plan(profile, overrides = {}) {
  return planCommandStabilization({
    profile,
    profileId: "captain",
    name: "F1",
    environment: "space",
    stabilize: false,
    bindset: null,
    ...overrides,
  });
}

function successful(result) {
  if (!result.valid) throw new Error(`Expected valid plan: ${result.reason}`);
  return result;
}

describe("planCommandStabilization", () => {
  it("plans an exact primary metadata write and preserves extensions", () => {
    const profile = createProfile();
    const before = structuredClone(profile);

    const result = successful(plan(profile));

    expect(result).toEqual({
      valid: true,
      noOp: false,
      target: {
        kind: "primary",
        environment: "space",
        name: "F1",
        bindset: null,
      },
      updateProfileRequest: {
        profileId: "captain",
        modify: {
          keybindMetadata: {
            space: {
              F1: {
                stabilizeExecutionOrder: false,
                source: "primary",
                extension: { nested: 1 },
              },
            },
          },
        },
      },
    });
    expect(profile).toEqual(before);
  });

  it.each([null, "", "Primary Bindset"])(
    "treats bindset %j as primary metadata",
    (bindset) => {
      const result = successful(plan(createProfile(), { bindset }));

      expect(result.target).toEqual({
        kind: "primary",
        environment: "space",
        name: "F1",
        bindset: null,
      });
      expect(result.updateProfileRequest.modify).toHaveProperty(
        "keybindMetadata.space.F1.stabilizeExecutionOrder",
        false,
      );
    },
  );

  it("plans named-bindset metadata and retains an explicit false", () => {
    const result = successful(
      plan(createProfile(), {
        name: "F2",
        bindset: "Weapons",
        stabilize: false,
      }),
    );

    expect(result.noOp).toBe(true);
    expect(result.target).toEqual({
      kind: "bindset",
      environment: "space",
      name: "F2",
      bindset: "Weapons",
    });
    expect(result.updateProfileRequest).toEqual({
      profileId: "captain",
      modify: {
        bindsetMetadata: {
          Weapons: {
            space: {
              F2: {
                stabilizeExecutionOrder: false,
                source: "bindset",
                extension: { nested: 3 },
              },
            },
          },
        },
      },
    });
  });

  it("upserts absent named-bindset metadata structure", () => {
    const profile = createProfile();
    delete profile.bindsetMetadata;

    const result = successful(
      plan(profile, {
        name: "G8",
        environment: "ground",
        bindset: "Engineering",
        stabilize: true,
      }),
    );

    expect(result.noOp).toBe(false);
    expect(result.updateProfileRequest).toEqual({
      profileId: "captain",
      modify: {
        bindsetMetadata: {
          Engineering: {
            ground: {
              G8: { stabilizeExecutionOrder: true },
            },
          },
        },
      },
    });
  });

  it("keeps a complete request for a historical no-op write", () => {
    const result = successful(
      plan(createProfile(), { stabilize: true, name: "F1" }),
    );

    expect(result.noOp).toBe(true);
    expect(
      result.updateProfileRequest.modify?.keybindMetadata?.space?.F1,
    ).toEqual({
      stabilizeExecutionOrder: true,
      source: "primary",
      extension: { nested: 1 },
    });
  });

  it("adds explicit false metadata when no flag existed", () => {
    const profile = createProfile();
    profile.keybindMetadata.space.F3 = { source: "new flag" };

    const result = successful(plan(profile, { name: "F3" }));

    expect(result.noOp).toBe(false);
    expect(
      result.updateProfileRequest.modify?.keybindMetadata?.space?.F3,
    ).toEqual({
      source: "new flag",
      stabilizeExecutionOrder: false,
    });
  });

  it("gives an own alias precedence over both primary and named bindsets", () => {
    const result = successful(
      plan(createProfile(), {
        name: "Alpha",
        bindset: "Weapons",
        stabilize: false,
      }),
    );

    expect(result.target).toEqual({
      kind: "alias",
      environment: "space",
      name: "Alpha",
      bindset: null,
    });
    expect(result.updateProfileRequest.modify).toEqual({
      aliasMetadata: {
        Alpha: {
          stabilizeExecutionOrder: false,
          source: "alias",
          extension: { nested: 2 },
        },
      },
    });
  });

  it("targets alias metadata in alias environment even without a definition", () => {
    const result = successful(
      plan(createProfile(), {
        environment: "alias",
        name: "MissingAlias",
        bindset: "Weapons",
        stabilize: true,
      }),
    );

    expect(result.target).toEqual({
      kind: "alias",
      environment: "alias",
      name: "MissingAlias",
      bindset: null,
    });
    expect(result.updateProfileRequest.modify).toEqual({
      aliasMetadata: {
        MissingAlias: { stabilizeExecutionOrder: true },
      },
    });
  });

  it("detaches nested metadata in both directions", () => {
    const profile = createProfile();
    const result = successful(plan(profile));
    const planned =
      result.updateProfileRequest.modify?.keybindMetadata?.space?.F1;
    if (!planned?.extension) throw new Error("Expected metadata extension");

    planned.extension.nested = 9;
    expect(profile.keybindMetadata.space.F1.extension.nested).toBe(1);

    profile.keybindMetadata.space.F1.extension.nested = 7;
    expect(planned.extension.nested).toBe(9);
  });

  it.each([
    [undefined, "invalid_options"],
    [null, "invalid_options"],
    [{}, "invalid_profile"],
    [{ profile: [] }, "invalid_profile"],
  ])("rejects invalid top-level input %#", (input, reason) => {
    expect(planCommandStabilization(input)).toEqual({
      valid: false,
      reason,
      updateProfileRequest: null,
    });
  });

  it.each([
    ["missing profile ID", { profileId: "" }, "missing_profile_id"],
    ["missing name", { name: "" }, "missing_name"],
    ["invalid environment", { environment: null }, "invalid_environment"],
    ["invalid stabilize", { stabilize: 1 }, "invalid_stabilize"],
    ["invalid bindset", { bindset: {} }, "invalid_bindset"],
  ])("rejects %s", (_label, overrides, reason) => {
    expect(plan(createProfile(), overrides)).toEqual({
      valid: false,
      reason,
      updateProfileRequest: null,
    });
  });

  it.each(["__proto__", "prototype", "constructor"])(
    "rejects reserved identifier %s in every dynamic position",
    (reserved) => {
      for (const overrides of [
        { profileId: reserved },
        { name: reserved },
        { environment: reserved },
        { bindset: reserved },
      ]) {
        expect(plan(createProfile(), overrides)).toEqual({
          valid: false,
          reason: "unsafe_identifier",
          updateProfileRequest: null,
        });
      }
      expect(Object.prototype).not.toHaveProperty("polluted");
    },
  );

  it("supports safe own names that collide with Object.prototype", () => {
    const profile = createProfile();
    profile.aliases = {};
    profile.bindsetMetadata = Object.fromEntries([
      [
        "toString",
        Object.fromEntries([
          [
            "valueOf",
            Object.fromEntries([
              ["hasOwnProperty", { source: "safe own metadata" }],
            ]),
          ],
        ]),
      ],
    ]);

    const result = successful(
      plan(profile, {
        profileId: "valueOf",
        name: "hasOwnProperty",
        environment: "valueOf",
        bindset: "toString",
        stabilize: true,
      }),
    );
    const metadata =
      result.updateProfileRequest.modify?.bindsetMetadata?.toString?.valueOf;

    expect(Object.hasOwn(metadata, "hasOwnProperty")).toBe(true);
    expect(metadata.hasOwnProperty).toEqual({
      source: "safe own metadata",
      stabilizeExecutionOrder: true,
    });
  });

  it("does not mistake inherited alias names for profile data", () => {
    const result = successful(
      plan(createProfile(), { name: "toString", stabilize: true }),
    );

    expect(result.target.kind).toBe("primary");
    expect(
      Object.hasOwn(
        result.updateProfileRequest.modify?.keybindMetadata?.space,
        "toString",
      ),
    ).toBe(true);
  });

  it("recognizes a safe prototype-collision alias only when it is own data", () => {
    const profile = createProfile();
    Object.defineProperty(profile.aliases, "toString", {
      value: { commands: ["SafeAlias"] },
      enumerable: true,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(profile.aliasMetadata, "toString", {
      value: { source: "own alias metadata" },
      enumerable: true,
      configurable: true,
      writable: true,
    });

    const result = successful(
      plan(profile, { name: "toString", stabilize: true }),
    );

    expect(result.target.kind).toBe("alias");
    expect(
      Object.hasOwn(
        result.updateProfileRequest.modify?.aliasMetadata,
        "toString",
      ),
    ).toBe(true);
    expect(result.updateProfileRequest.modify?.aliasMetadata?.toString).toEqual(
      {
        source: "own alias metadata",
        stabilizeExecutionOrder: true,
      },
    );
  });

  it.each([
    [
      "alias metadata container",
      (value) => {
        value.aliasMetadata = [];
      },
      { name: "Alpha" },
    ],
    [
      "primary environment metadata",
      (value) => {
        value.keybindMetadata.space = "invalid";
      },
      {},
    ],
    [
      "named-bindset target metadata",
      (value) => {
        value.bindsetMetadata.Weapons.space.F2 = "invalid";
      },
      { name: "F2", bindset: "Weapons" },
    ],
  ])("rejects malformed %s", (_label, mutate, overrides) => {
    const profile = createProfile();
    mutate(profile);

    expect(() => plan(profile, overrides)).not.toThrow();
    expect(plan(profile, overrides)).toEqual({
      valid: false,
      reason: "invalid_profile",
      updateProfileRequest: null,
    });
  });

  it("rejects unsafe nested metadata without throwing or mutating prototypes", () => {
    const profile = createProfile();
    profile.keybindMetadata.space.F1 = JSON.parse(
      '{"extension":{"constructor":{"polluted":true}}}',
    );

    expect(() => plan(profile)).not.toThrow();
    expect(plan(profile)).toEqual({
      valid: false,
      reason: "invalid_payload",
      updateProfileRequest: null,
    });
    expect(Object.prototype).not.toHaveProperty("polluted");
  });
});
