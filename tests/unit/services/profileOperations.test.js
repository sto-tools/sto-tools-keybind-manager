import { describe, expect, it } from "vitest";

import { applyProfileOperations } from "../../../src/js/components/services/profileOperations.js";

const baseProfile = () => ({
  name: "Captain",
  currentEnvironment: "space",
  builds: {
    space: { keys: { F1: ["old-command"] } },
    ground: { keys: {} },
  },
  aliases: { old: { commands: ["old-alias"] } },
  bindsets: {
    Tactical: {
      space: { keys: { F2: ["old-bindset-command"] } },
      ground: { keys: {} },
    },
  },
  keybindMetadata: {
    space: { F1: { stabilizeExecutionOrder: true } },
  },
  aliasMetadata: { old: { stabilizeExecutionOrder: true } },
  bindsetMetadata: {
    Tactical: {
      space: { F2: { stabilizeExecutionOrder: true } },
    },
  },
});

describe("applyProfileOperations", () => {
  it("applies deletions before replacements without retaining input references", () => {
    const current = baseProfile();
    const operations = {
      delete: {
        aliases: ["old"],
        builds: { space: { keys: ["F1"] } },
      },
      add: {
        aliases: { old: { commands: ["new-alias"] } },
        builds: { space: { keys: { F1: ["new-command"] } } },
      },
      properties: { selections: { space: "F1" } },
    };

    const result = applyProfileOperations(current, operations);

    expect(result.aliases.old.commands).toEqual(["new-alias"]);
    expect(result.builds.space.keys.F1).toEqual(["new-command"]);
    expect(result.selections).toEqual({ space: "F1" });
    expect(current).toEqual(baseProfile());

    operations.add.aliases.old.commands.push("caller-alias");
    operations.add.builds.space.keys.F1.push("caller-command");
    operations.properties.selections.space = "F9";

    expect(result.aliases.old.commands).toEqual(["new-alias"]);
    expect(result.builds.space.keys.F1).toEqual(["new-command"]);
    expect(result.selections).toEqual({ space: "F1" });
  });

  it("supports metadata clearing and null bindset-key deletion", () => {
    const result = applyProfileOperations(baseProfile(), {
      modify: {
        keybindMetadata: { space: { F1: {} } },
        aliasMetadata: { old: {} },
        bindsets: { Tactical: { space: { keys: { F2: null } } } },
        bindsetMetadata: { Tactical: { space: { F2: {} } } },
      },
    });

    expect(result.keybindMetadata.space).not.toHaveProperty("F1");
    expect(result.aliasMetadata).not.toHaveProperty("old");
    expect(result.bindsets.Tactical.space.keys).not.toHaveProperty("F2");
    expect(result.bindsetMetadata.Tactical.space).not.toHaveProperty("F2");
  });

  it("replaces a complete profile through the typed operation without retaining it", () => {
    const replacement = {
      name: "Imported Captain",
      currentEnvironment: "ground",
      builds: {
        space: { keys: {} },
        ground: { keys: { F9: ["imported-command"] } },
      },
      aliases: { imported: { commands: ["imported-alias"] } },
      bindsets: {},
      keybindMetadata: {},
      aliasMetadata: {},
      bindsetMetadata: {},
    };

    const result = applyProfileOperations(baseProfile(), {
      replacement,
      properties: { description: "committed replacement" },
    });

    expect(result).toMatchObject({
      name: "Imported Captain",
      description: "committed replacement",
      currentEnvironment: "ground",
      builds: { ground: { keys: { F9: ["imported-command"] } } },
      aliases: { imported: { commands: ["imported-alias"] } },
    });
    expect(result.aliases).not.toHaveProperty("old");

    replacement.builds.ground.keys.F9.push("caller-mutation");
    replacement.aliases.imported.commands.push("caller-mutation");
    expect(result.builds.ground.keys.F9).toEqual(["imported-command"]);
    expect(result.aliases.imported.commands).toEqual(["imported-alias"]);
  });

  it("rejects dangerous JSON keys and dynamic delete identifiers without prototype mutation", () => {
    const prototypeKeys = Object.getOwnPropertyDescriptor(
      Object.prototype,
      "keys",
    );
    const objectKeys = Object.getOwnPropertyDescriptor(Object, "keys");
    const objectSpace = Object.getOwnPropertyDescriptor(Object, "space");
    const prototypePolluted = Object.getOwnPropertyDescriptor(
      Object.prototype,
      "polluted",
    );
    const attacks = [
      JSON.parse(
        '{"add":{"builds":{"__proto__":{"keys":{"F9":["polluted"]}}}}}',
      ),
      JSON.parse(
        '{"modify":{"bindsets":{"constructor":{"space":{"keys":{"F9":["polluted"]}}}}}}',
      ),
      JSON.parse(
        '{"replacement":{"builds":{"prototype":{"keys":{"F9":["polluted"]}}}}}',
      ),
      JSON.parse('{"properties":{"nested":{"prototype":{"polluted":true}}}}'),
      { delete: { aliases: ["constructor"] } },
    ];

    try {
      for (const operations of attacks) {
        expect(() => applyProfileOperations(baseProfile(), operations)).toThrow(
          "unsafe_profile_operation_key",
        );
      }

      expect(Object.getOwnPropertyDescriptor(Object.prototype, "keys")).toEqual(
        prototypeKeys,
      );
      expect(Object.getOwnPropertyDescriptor(Object, "keys")).toEqual(
        objectKeys,
      );
      expect(Object.getOwnPropertyDescriptor(Object, "space")).toEqual(
        objectSpace,
      );
      expect(Object.prototype).not.toHaveProperty("polluted");
    } finally {
      if (prototypeKeys) {
        Object.defineProperty(Object.prototype, "keys", prototypeKeys);
      } else {
        delete Object.prototype.keys;
      }
      if (objectKeys) Object.defineProperty(Object, "keys", objectKeys);
      if (objectSpace) {
        Object.defineProperty(Object, "space", objectSpace);
      } else {
        delete Object.space;
      }
      if (prototypePolluted) {
        Object.defineProperty(Object.prototype, "polluted", prototypePolluted);
      } else {
        delete Object.prototype.polluted;
      }
    }
  });

  it("supports safe names that collide with inherited Object.prototype members", () => {
    const objectToString = Object.prototype.toString;
    const operations = JSON.parse(
      '{"add":{"aliases":{"toString":{"commands":["safe-alias"]}},"builds":{"toString":{"keys":{"valueOf":["safe-key"]}}},"bindsets":{"valueOf":{"space":{"keys":{}}}}},"modify":{"bindsets":{"toString":{"space":{"keys":{"valueOf":["safe-bindset-key"]}}}}}}',
    );

    const result = applyProfileOperations(baseProfile(), operations);

    expect(Object.hasOwn(result.aliases, "toString")).toBe(true);
    expect(result.aliases.toString.commands).toEqual(["safe-alias"]);
    expect(Object.hasOwn(result.builds, "toString")).toBe(true);
    expect(result.builds.toString.keys.valueOf).toEqual(["safe-key"]);
    expect(Object.hasOwn(result.bindsets, "toString")).toBe(true);
    expect(result.bindsets.toString.space.keys.valueOf).toEqual([
      "safe-bindset-key",
    ]);
    expect(Object.prototype.toString).toBe(objectToString);
    expect(Object.prototype).not.toHaveProperty("keys");
  });
});
