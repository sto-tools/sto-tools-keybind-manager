import { describe, expect, it, vi } from "vitest";

import { planCommandMutation } from "../../../src/js/components/services/commandMutationPlanner.js";

function profile() {
  return {
    name: "Captain",
    builds: {
      space: {
        keys: {
          F1: ["One", "Two", "Three"],
          Collision: ["PrimaryOne", "PrimaryTwo"],
        },
      },
      ground: { keys: { G: ["GroundOne", "GroundTwo"] } },
    },
    aliases: {
      Alpha: {
        commands: ["AliasOne", "AliasTwo", "AliasThree"],
        description: "Preserve alias",
        metadata: { nested: true },
      },
      Collision: { commands: ["AliasCollision"] },
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
      throw new Error("move/edit must not normalize command arrays");
    }),
  };
}

function plan(mutation, overrides = {}) {
  return planCommandMutation({
    profile: profile(),
    profileId: "captain",
    environment: "space",
    mutation,
    ...normalizers(),
    ...overrides,
  });
}

function successful(result) {
  if (!result.valid) throw new Error(`Expected valid plan: ${result.reason}`);
  return result;
}

describe("command mutation move planning", () => {
  it.each([
    {
      label: "primary key",
      environment: "space",
      mutation: { type: "move", key: "F1", fromIndex: 0, toIndex: 2 },
      target: {
        kind: "primary",
        environment: "space",
        key: "F1",
        bindset: null,
      },
      operations: {
        modify: {
          builds: { space: { keys: { F1: ["Two", "Three", "One"] } } },
        },
      },
      commands: ["Two", "Three", "One"],
    },
    {
      label: "alias",
      environment: "alias",
      mutation: { type: "move", key: "Alpha", fromIndex: 2, toIndex: 0 },
      target: {
        kind: "alias",
        environment: "alias",
        key: "Alpha",
        bindset: null,
      },
      operations: {
        modify: {
          aliases: {
            Alpha: {
              commands: ["AliasThree", "AliasOne", "AliasTwo"],
              description: "Preserve alias",
              metadata: { nested: true },
            },
          },
        },
      },
      commands: ["AliasThree", "AliasOne", "AliasTwo"],
    },
    {
      label: "named bindset key",
      environment: "space",
      mutation: {
        type: "move",
        key: "F2",
        fromIndex: 0,
        toIndex: 1,
        bindset: "Weapons",
      },
      target: {
        kind: "bindset",
        environment: "space",
        key: "F2",
        bindset: "Weapons",
      },
      operations: {
        modify: {
          bindsets: {
            Weapons: {
              space: {
                keys: { F2: ["WeaponTwo", "WeaponOne", "WeaponThree"] },
              },
            },
          },
        },
      },
      commands: ["WeaponTwo", "WeaponOne", "WeaponThree"],
    },
  ])("constructs an exact $label move", (scenario) => {
    const source = profile();
    const before = structuredClone(source);
    const result = successful(
      plan(scenario.mutation, {
        profile: source,
        environment: scenario.environment,
      }),
    );

    expect(result).toEqual({
      valid: true,
      noOp: false,
      target: scenario.target,
      updateProfileRequest: { profileId: "captain", ...scenario.operations },
      nextCommands: scenario.commands,
      event: {
        topic: "command-moved",
        payload: {
          key: scenario.mutation.key,
          fromIndex: scenario.mutation.fromIndex,
          toIndex: scenario.mutation.toIndex,
          commands: scenario.commands,
        },
      },
    });
    expect(source).toEqual(before);
  });

  it("routes an alias-name collision to the primary key outside alias mode", () => {
    const result = successful(
      plan({ type: "move", key: "Collision", fromIndex: 0, toIndex: 1 }),
    );

    expect(result.target.kind).toBe("primary");
    expect(result.nextCommands).toEqual(["PrimaryTwo", "PrimaryOne"]);
    expect(result.updateProfileRequest.modify).not.toHaveProperty("aliases");
  });

  it("persists and publishes a same-index no-op", () => {
    const result = successful(
      plan({ type: "move", key: "F1", fromIndex: 1, toIndex: 1 }),
    );

    expect(result.noOp).toBe(true);
    expect(result.nextCommands).toEqual(["One", "Two", "Three"]);
    expect(result.updateProfileRequest.modify?.builds?.space?.keys).toEqual({
      F1: ["One", "Two", "Three"],
    });
  });

  it("preserves coercive string and NaN index behavior", () => {
    const stringIndex = successful(
      plan(
        // @ts-expect-error Runtime compatibility probe.
        { type: "move", key: "F1", fromIndex: "0", toIndex: "2" },
      ),
    );
    expect(stringIndex.nextCommands).toEqual(["Two", "Three", "One"]);

    const nanIndex = successful(
      plan({
        type: "move",
        key: "F1",
        fromIndex: Number.NaN,
        toIndex: Number.NaN,
      }),
    );
    expect(nanIndex.nextCommands).toEqual(["One", "Two", "Three"]);
    expect(nanIndex.noOp).toBe(false);
  });

  it.each([
    { type: "move", key: "", fromIndex: 0, toIndex: 0 },
    { type: "move", key: "F1", fromIndex: -1, toIndex: 0 },
    { type: "move", key: "F1", fromIndex: 0, toIndex: 3 },
  ])("rejects invalid move input %# before a request exists", (mutation) => {
    expect(plan(mutation)).toMatchObject({
      valid: false,
      updateProfileRequest: null,
    });
  });
});

describe("command mutation edit planning", () => {
  it.each([
    {
      label: "primary key",
      environment: "space",
      mutation: {
        type: "edit",
        key: "F1",
        index: 1,
        updatedCommand: { command: " Changed " },
      },
      target: {
        kind: "primary",
        environment: "space",
        key: "F1",
        bindset: null,
      },
      operations: {
        modify: {
          builds: { space: { keys: { F1: ["One", "Changed", "Three"] } } },
        },
      },
      commands: ["One", "Changed", "Three"],
    },
    {
      label: "alias",
      environment: "alias",
      mutation: {
        type: "edit",
        key: "Alpha",
        index: 0,
        updatedCommand: { text: " Changed " },
      },
      target: {
        kind: "alias",
        environment: "alias",
        key: "Alpha",
        bindset: null,
      },
      operations: {
        modify: {
          aliases: {
            Alpha: {
              commands: ["Changed", "AliasTwo", "AliasThree"],
              description: "Preserve alias",
              metadata: { nested: true },
            },
          },
        },
      },
      commands: ["Changed", "AliasTwo", "AliasThree"],
    },
    {
      label: "named bindset key",
      environment: "space",
      mutation: {
        type: "edit",
        key: "F2",
        index: 2,
        updatedCommand: " Changed ",
        bindset: "Weapons",
      },
      target: {
        kind: "bindset",
        environment: "space",
        key: "F2",
        bindset: "Weapons",
      },
      operations: {
        modify: {
          bindsets: {
            Weapons: {
              space: {
                keys: { F2: ["WeaponOne", "WeaponTwo", "Changed"] },
              },
            },
          },
        },
      },
      commands: ["WeaponOne", "WeaponTwo", "Changed"],
    },
  ])("constructs an exact $label edit", (scenario) => {
    const capabilities = normalizers();
    const result = successful(
      plan(scenario.mutation, {
        environment: scenario.environment,
        ...capabilities,
      }),
    );

    expect(result.target).toEqual(scenario.target);
    expect(result.updateProfileRequest).toEqual({
      profileId: "captain",
      ...scenario.operations,
    });
    expect(result.nextCommands).toEqual(scenario.commands);
    expect(result.event).toEqual({
      topic: "command-edited",
      payload: {
        key: scenario.mutation.key,
        index: scenario.mutation.index,
        updatedCommand: scenario.mutation.updatedCommand,
        commands: scenario.commands,
      },
    });
    if (typeof scenario.mutation.updatedCommand === "object") {
      expect(result.event.payload.updatedCommand).not.toBe(
        scenario.mutation.updatedCommand,
      );
    }
    expect(capabilities.normalizeCommand).toHaveBeenCalledOnce();
    expect(capabilities.normalizeCommands).not.toHaveBeenCalled();
  });

  it("detaches original rich event input and remains stable after caller mutation", () => {
    const updatedCommand = {
      command: "Changed",
      metadata: { source: "caller" },
    };
    const result = successful(
      plan({ type: "edit", key: "F1", index: 0, updatedCommand }),
    );

    updatedCommand.command = "mutated";
    updatedCommand.metadata.source = "mutated";
    expect(result.event.payload.updatedCommand).toEqual({
      command: "Changed",
      metadata: { source: "caller" },
    });
    expect(result.updateProfileRequest.modify?.builds?.space?.keys?.F1).toEqual(
      ["Changed", "Two", "Three"],
    );
  });

  it("routes collisions to primary, and persists same-value and empty normalized edits", () => {
    const collision = successful(
      plan({
        type: "edit",
        key: "Collision",
        index: 0,
        updatedCommand: "Changed",
      }),
    );
    expect(collision.target.kind).toBe("primary");

    const same = successful(
      plan({ type: "edit", key: "F1", index: 0, updatedCommand: "One" }),
    );
    expect(same.noOp).toBe(true);
    expect(same.updateProfileRequest).not.toBeNull();

    const empty = successful(
      plan({ type: "edit", key: "F1", index: 0, updatedCommand: {} }),
    );
    expect(empty.nextCommands[0]).toBe("");
  });

  it("rejects invalid, unsafe, and uncloneable edit data", () => {
    expect(
      plan({ type: "edit", key: "F1", index: 3, updatedCommand: "Changed" }),
    ).toMatchObject({ valid: false, reason: "invalid_index" });
    expect(
      plan({
        type: "edit",
        key: "constructor",
        index: 0,
        updatedCommand: "Bad",
      }),
    ).toEqual({
      valid: false,
      reason: "unsafe_identifier",
      updateProfileRequest: null,
    });
    expect(
      plan({
        type: "edit",
        key: "F1",
        index: 0,
        updatedCommand: { command: "Bad", callback: () => {} },
      }),
    ).toEqual({
      valid: false,
      reason: "invalid_payload",
      updateProfileRequest: null,
    });
  });
});
