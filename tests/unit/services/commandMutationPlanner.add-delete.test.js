import { describe, expect, it, vi } from "vitest";

import { planCommandMutation } from "../../../src/js/components/services/commandMutationPlanner.js";
import { applyProfileOperations } from "../../../src/js/components/services/profileOperations.js";

function profile() {
  return {
    name: "Captain",
    builds: {
      space: {
        keys: {
          F1: ["One", "Two"],
          Collision: ["PrimaryCollision"],
          EmptyValue: [""],
          toString: ["OwnPrototypeName"],
        },
      },
      ground: { keys: { G: ["Ground"] } },
    },
    aliases: {
      Alpha: {
        commands: ["AliasOne", "AliasTwo"],
        description: "Preserve alias",
        metadata: { nested: true },
      },
      Collision: { commands: ["AliasCollision"] },
      EmptyAlias: { commands: [""], description: "Empty command" },
    },
    bindsets: {
      Weapons: {
        space: { keys: { F2: ["WeaponOne", "WeaponTwo"] } },
        ground: { keys: { G2: ["GroundWeapon"] } },
      },
      SpaceOnly: {
        space: { keys: { F3: ["SpaceSibling"] } },
      },
    },
    extension: { retained: true },
  };
}

function normalizers() {
  return {
    normalizeCommand: vi.fn((command) =>
      typeof command === "string"
        ? command.trim()
        : (command?.command || command?.text || "").trim(),
    ),
    normalizeCommands: vi.fn((commands) =>
      commands
        .map((command) =>
          typeof command === "string"
            ? command.trim()
            : (command?.command || command?.text || "").trim(),
        )
        .filter(Boolean),
    ),
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

describe("command mutation add planning", () => {
  it.each([
    {
      label: "existing primary key",
      mutation: { type: "add", key: "F1", command: { command: " Three " } },
      operation: "modify",
      target: {
        kind: "primary",
        environment: "space",
        key: "F1",
        bindset: null,
      },
      commands: ["One", "Two", "Three"],
    },
    {
      label: "new primary key",
      mutation: { type: "add", key: "F4", command: " New " },
      operation: "add",
      target: {
        kind: "primary",
        environment: "space",
        key: "F4",
        bindset: null,
      },
      commands: ["New"],
    },
    {
      label: "Primary Bindset primary key",
      mutation: {
        type: "add",
        key: "F4",
        command: "New",
        bindset: "Primary Bindset",
      },
      operation: "add",
      target: {
        kind: "primary",
        environment: "space",
        key: "F4",
        bindset: null,
      },
      commands: ["New"],
    },
  ])(
    "constructs the exact $label request",
    ({ mutation, operation, target, commands }) => {
      const source = profile();
      const before = structuredClone(source);
      const capabilities = normalizers();

      const result = successful(
        plan(mutation, { profile: source, ...capabilities }),
      );

      expect(result).toEqual({
        valid: true,
        noOp: false,
        target,
        updateProfileRequest: {
          profileId: "captain",
          [operation]: {
            builds: { space: { keys: { [mutation.key]: commands } } },
          },
        },
        nextCommands: commands,
        event: {
          topic: "command-added",
          payload: { key: mutation.key, command: mutation.command },
        },
      });
      expect(source).toEqual(before);
    },
  );

  it.each([
    {
      label: "existing alias",
      key: "Alpha",
      expectedOperation: "modify",
      expectedAlias: {
        commands: ["AliasOne", "AliasTwo", "Three", "Four"],
        description: "Preserve alias",
        metadata: { nested: true },
      },
    },
    {
      label: "new alias",
      key: "Fresh",
      expectedOperation: "add",
      expectedAlias: {
        commands: ["Three", "Four"],
        description: "",
        type: "alias",
      },
    },
  ])("plans an $label with detached original event data", (scenario) => {
    const command = [{ command: " Three " }, { text: "Four" }, { command: "" }];
    const capabilities = normalizers();
    const result = successful(
      plan(
        { type: "add", key: scenario.key, command, bindset: "Ignored" },
        { environment: "alias", ...capabilities },
      ),
    );

    expect(result.target).toEqual({
      kind: "alias",
      environment: "alias",
      key: scenario.key,
      bindset: null,
    });
    expect(result.updateProfileRequest).toEqual({
      profileId: "captain",
      [scenario.expectedOperation]: {
        aliases: { [scenario.key]: scenario.expectedAlias },
      },
    });
    expect(result.event.payload.command).toEqual(command);
    expect(result.event.payload.command).not.toBe(command);
    command[0].command = "caller mutation";
    expect(result.event.payload.command[0]).toEqual({ command: " Three " });
    expect(capabilities.normalizeCommands).toHaveBeenCalledWith(command);
    expect(capabilities.normalizeCommand).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: "existing bindset environment",
      bindset: "Weapons",
      environment: "space",
      key: "F2",
      operation: "modify",
      commands: ["WeaponOne", "WeaponTwo", "Added"],
    },
    {
      label: "missing environment on an existing bindset",
      bindset: "SpaceOnly",
      environment: "ground",
      key: "G3",
      operation: "modify",
      commands: ["Added"],
    },
    {
      label: "new bindset",
      bindset: "Engineering",
      environment: "ground",
      key: "G3",
      operation: "add",
      commands: ["Added"],
    },
  ])("plans a non-destructive $label update", (scenario) => {
    const source = profile();
    const result = successful(
      plan(
        {
          type: "add",
          key: scenario.key,
          command: "Added",
          bindset: scenario.bindset,
        },
        { profile: source, environment: scenario.environment },
      ),
    );

    expect(result.updateProfileRequest).toEqual({
      profileId: "captain",
      [scenario.operation]: {
        bindsets: {
          [scenario.bindset]: {
            [scenario.environment]: {
              keys: { [scenario.key]: scenario.commands },
            },
          },
        },
      },
    });
    const updated = applyProfileOperations(source, result.updateProfileRequest);
    if (scenario.bindset === "SpaceOnly") {
      expect(updated.bindsets.SpaceOnly).toEqual({
        space: { keys: { F3: ["SpaceSibling"] } },
        ground: { keys: { G3: ["Added"] } },
      });
    }
  });

  it("rejects empty normalized input without constructing a request", () => {
    const capabilities = normalizers();
    const result = plan(
      { type: "add", key: "F1", command: [{ command: " " }] },
      { ...capabilities },
    );

    expect(result).toEqual({
      valid: false,
      reason: "no_valid_commands",
      updateProfileRequest: null,
    });
    expect(capabilities.normalizeCommands).toHaveBeenCalledOnce();
  });

  it.each(["", null, undefined])(
    "rejects the invalid key %s before normalization",
    (key) => {
      const capabilities = normalizers();
      const result = plan(
        // @ts-expect-error Runtime boundary probe.
        { type: "add", key, command: "Bad" },
        { ...capabilities },
      );

      expect(result).toEqual({
        valid: false,
        reason: "missing_key",
        updateProfileRequest: null,
      });
      expect(capabilities.normalizeCommand).not.toHaveBeenCalled();
    },
  );

  it("reads prototype-named keys as own data and rejects dangerous identifiers", () => {
    const ownName = successful(
      plan({ type: "add", key: "toString", command: "Added" }),
    );
    expect(ownName.updateProfileRequest.modify?.builds?.space?.keys).toEqual({
      toString: ["OwnPrototypeName", "Added"],
    });

    for (const overrides of [
      { mutation: { type: "add", key: "__proto__", command: "Bad" } },
      { profileId: "constructor" },
      { environment: "prototype" },
      {
        mutation: {
          type: "add",
          key: "F1",
          command: "Bad",
          bindset: "constructor",
        },
      },
    ]) {
      expect(
        plan({ type: "add", key: "F1", command: "Bad" }, overrides),
      ).toEqual({
        valid: false,
        reason: "unsafe_identifier",
        updateProfileRequest: null,
      });
    }
    expect(Object.prototype).not.toHaveProperty("Bad");
  });
});

describe("command mutation delete planning", () => {
  it.each([
    {
      label: "primary key",
      environment: "space",
      mutation: { type: "delete", key: "F1", index: 0 },
      target: {
        kind: "primary",
        environment: "space",
        key: "F1",
        bindset: null,
      },
      operations: { modify: { builds: { space: { keys: { F1: ["Two"] } } } } },
      commands: ["Two"],
    },
    {
      label: "alias in alias mode",
      environment: "alias",
      mutation: { type: "delete", key: "Alpha", index: 1 },
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
              commands: ["AliasOne"],
              description: "Preserve alias",
              metadata: { nested: true },
            },
          },
        },
      },
      commands: ["AliasOne"],
    },
    {
      label: "named bindset key",
      environment: "space",
      mutation: { type: "delete", key: "F2", index: 0, bindset: "Weapons" },
      target: {
        kind: "bindset",
        environment: "space",
        key: "F2",
        bindset: "Weapons",
      },
      operations: {
        modify: {
          bindsets: { Weapons: { space: { keys: { F2: ["WeaponTwo"] } } } },
        },
      },
      commands: ["WeaponTwo"],
    },
  ])("constructs an exact $label deletion", (scenario) => {
    const result = successful(
      plan(scenario.mutation, { environment: scenario.environment }),
    );

    expect(result).toEqual({
      valid: true,
      noOp: false,
      target: scenario.target,
      updateProfileRequest: { profileId: "captain", ...scenario.operations },
      nextCommands: scenario.commands,
      event: {
        topic: "command-deleted",
        payload: {
          key: scenario.mutation.key,
          index: scenario.mutation.index,
          commands: scenario.commands,
        },
      },
    });
  });

  it("preserves the historical cross-context alias collision route", () => {
    const result = successful(
      plan({ type: "delete", key: "Collision", index: 0 }),
    );

    expect(result.target.kind).toBe("alias");
    expect(result.updateProfileRequest.modify?.aliases).toEqual({
      Collision: { commands: [] },
    });
    expect(result.updateProfileRequest.modify).not.toHaveProperty("builds");
  });

  it("retains empty aliases but keeps the historical primary empty-command rejection", () => {
    const alias = successful(
      plan(
        { type: "delete", key: "EmptyAlias", index: 0 },
        { environment: "alias" },
      ),
    );
    expect(alias.updateProfileRequest.modify?.aliases).toEqual({
      EmptyAlias: { commands: [], description: "Empty command" },
    });
    expect(plan({ type: "delete", key: "EmptyValue", index: 0 })).toEqual({
      valid: false,
      reason: "missing_command_at_index",
      updateProfileRequest: null,
    });
  });

  it("preserves string index coercion and rejects unsafe keys", () => {
    const coerced = successful(
      plan(
        // @ts-expect-error Runtime compatibility probe.
        { type: "delete", key: "F1", index: "1" },
      ),
    );
    expect(coerced.nextCommands).toEqual(["One"]);
    expect(plan({ type: "delete", key: "__proto__", index: 0 })).toEqual({
      valid: false,
      reason: "unsafe_identifier",
      updateProfileRequest: null,
    });
  });
});
