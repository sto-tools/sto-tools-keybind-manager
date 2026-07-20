import { describe, expect, it, vi } from "vitest";

import {
  commandDataEqual,
  commandEditTargetMatches,
} from "../../../src/js/components/services/commandEditTargetCas.js";
import { planCommandMutation } from "../../../src/js/components/services/commandMutationPlanner.js";

function profile() {
  return {
    name: "Captain",
    builds: {
      space: {
        keys: {
          F1: ["One", "Two", "Three"],
          Rich: [
            {
              command: "RichOriginal",
              parameters: { first: 1, second: 2 },
            },
          ],
        },
      },
      ground: { keys: { G1: ["GroundOne"] } },
    },
    aliases: {
      Alpha: {
        commands: ["AliasOne", "AliasTwo", "AliasThree"],
        description: "Preserve alias",
      },
    },
    bindsets: {
      Weapons: {
        space: { keys: { F2: ["WeaponOne", "WeaponTwo", "WeaponThree"] } },
      },
    },
  };
}

function normalizers() {
  return {
    normalizeCommand: vi.fn((command) =>
      typeof command === "string"
        ? command.trim()
        : (command?.command || command?.text || "").trim(),
    ),
    normalizeCommands: vi.fn(() => {
      throw new Error("edit CAS must not normalize command arrays");
    }),
  };
}

function plan(mutation, overrides = {}) {
  return planCommandMutation({
    profile: profile(),
    profileId: "captain",
    environment: "space",
    authorityEpoch: 40,
    revision: 7,
    mutation,
    ...normalizers(),
    ...overrides,
  });
}

function editTarget(overrides = {}) {
  return Object.freeze({
    authorityEpoch: 40,
    revision: 7,
    profileId: "captain",
    environment: "space",
    name: "F1",
    bindset: null,
    index: 0,
    originalEntry: "One",
    ...overrides,
  });
}

function successful(result) {
  if (!result.valid) throw new Error(`Expected valid plan: ${result.reason}`);
  return result;
}

describe("command edit target compare-and-swap", () => {
  it("compares canonical command data without identity or property-order coupling", () => {
    const canonical = {
      command: "RichOriginal",
      parameters: { first: 1, second: [2, { nested: true }] },
    };
    const reordered = {
      parameters: { second: [2, { nested: true }], first: 1 },
      command: "RichOriginal",
    };

    expect(commandDataEqual(canonical, reordered)).toBe(true);
    expect(commandDataEqual(canonical, structuredClone(canonical))).toBe(true);
    expect(
      commandDataEqual(canonical, {
        ...reordered,
        parameters: { second: [2, { nested: false }], first: 1 },
      }),
    ).toBe(false);
  });

  it("matches the exact accepted owner version and canonical location", () => {
    expect(
      commandEditTargetMatches(editTarget(), {
        authorityEpoch: 40,
        revision: 7,
        profileId: "captain",
        environment: "space",
        name: "F1",
        bindset: null,
        index: 0,
        originalEntry: "One",
      }),
    ).toBe(true);
  });

  it("accepts a fresh primary target without changing the planned edit", () => {
    const result = successful(
      plan({
        type: "edit",
        key: "F1",
        index: 0,
        updatedCommand: "Changed",
        target: editTarget(),
      }),
    );

    expect(result.nextCommands).toEqual(["Changed", "Two", "Three"]);
    expect(result.updateProfileRequest).toEqual({
      profileId: "captain",
      modify: {
        builds: { space: { keys: { F1: ["Changed", "Two", "Three"] } } },
      },
    });
  });

  it("accepts a canonical primary target selected by its UI bindset name", () => {
    const result = successful(
      plan({
        type: "edit",
        key: "F1",
        index: 0,
        updatedCommand: "Changed",
        bindset: "Primary Bindset",
        target: editTarget(),
      }),
    );

    expect(result.target).toEqual({
      kind: "primary",
      environment: "space",
      key: "F1",
      bindset: null,
    });
    expect(result.nextCommands).toEqual(["Changed", "Two", "Three"]);
  });

  it.each([
    {
      label: "alias",
      environment: "alias",
      mutation: { key: "Alpha", bindset: null },
      target: {
        environment: "alias",
        name: "Alpha",
        bindset: null,
        originalEntry: "AliasOne",
      },
      expected: ["Changed", "AliasTwo", "AliasThree"],
    },
    {
      label: "named bindset",
      environment: "space",
      mutation: { key: "F2", bindset: "Weapons" },
      target: {
        environment: "space",
        name: "F2",
        bindset: "Weapons",
        originalEntry: "WeaponOne",
      },
      expected: ["Changed", "WeaponTwo", "WeaponThree"],
    },
  ])(
    "accepts an exact $label effective target",
    ({ environment, mutation, target, expected }) => {
      const result = successful(
        plan(
          {
            type: "edit",
            ...mutation,
            index: 0,
            updatedCommand: "Changed",
            target: editTarget(target),
          },
          { environment },
        ),
      );

      expect(result.nextCommands).toEqual(expected);
    },
  );

  it("accepts a semantically equal rich original entry", () => {
    const result = successful(
      plan({
        type: "edit",
        key: "Rich",
        index: 0,
        updatedCommand: "Changed",
        target: editTarget({
          name: "Rich",
          originalEntry: {
            parameters: { second: 2, first: 1 },
            command: "RichOriginal",
          },
        }),
      }),
    );

    expect(result.nextCommands).toEqual(["Changed"]);
  });

  it.each([
    ["authority epoch", {}, { authorityEpoch: 41 }],
    ["revision", {}, { revision: 8 }],
    ["profile", {}, { profileId: "first-officer" }],
    ["environment", {}, { environment: "ground" }],
    ["key", { key: "Missing" }, {}],
    ["effective bindset", { bindset: "Weapons" }, {}],
    ["index", { index: 1 }, {}],
    ["original entry", {}, { profile: changedOriginalProfile() }],
  ])(
    "rejects a stale target when the accepted %s changed",
    (_label, mutationOverrides, planOverrides) => {
      const capabilities = normalizers();
      const result = plan(
        {
          type: "edit",
          key: "F1",
          index: 0,
          updatedCommand: "Changed",
          target: editTarget(),
          ...mutationOverrides,
        },
        { ...planOverrides, ...capabilities },
      );

      expect(result).toEqual({
        valid: false,
        reason: "stale_edit_target",
        updateProfileRequest: null,
      });
      expect(capabilities.normalizeCommand).not.toHaveBeenCalled();
      expect(capabilities.normalizeCommands).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["missing original entry", { originalEntry: undefined }],
    ["fractional authority", { authorityEpoch: 1.5 }],
    ["fractional revision", { revision: 2.5 }],
  ])("rejects malformed target metadata: %s", (_label, targetOverrides) => {
    expect(
      plan({
        type: "edit",
        key: "F1",
        index: 0,
        updatedCommand: "Changed",
        target: editTarget(targetOverrides),
      }),
    ).toEqual({
      valid: false,
      reason: "stale_edit_target",
      updateProfileRequest: null,
    });
  });

  it("preserves targetless direct-edit behavior without owner version metadata", () => {
    const result = successful(
      plan(
        { type: "edit", key: "F1", index: 0, updatedCommand: "Changed" },
        { authorityEpoch: undefined, revision: undefined },
      ),
    );

    expect(result.nextCommands).toEqual(["Changed", "Two", "Three"]);
  });
});

function changedOriginalProfile() {
  const changed = profile();
  changed.builds.space.keys.F1 = ["Other", "Two", "Three"];
  return changed;
}
