import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { decodeProfileData } from "../../../src/js/components/services/profileDataBoundary.js";
import {
  invalidProfileCases,
  unsafeOwnKeyCases,
} from "../../fixtures/import/profileBoundaryCases.js";

const FIXTURE_ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../fixtures",
);

/** @param {string} relativePath */
function readFixture(relativePath) {
  return JSON.parse(readFileSync(join(FIXTURE_ROOT, relativePath), "utf8"));
}

/** @param {Record<string, unknown>} [overrides] */
function profile(overrides = {}) {
  return { name: "Boundary Profile", ...overrides };
}

/**
 * @param {() => unknown} action
 * @param {string} [path]
 */
function expectInvalid(action, path) {
  let thrown;
  try {
    action();
  } catch (error) {
    thrown = error;
  }

  expect(thrown).toBeInstanceOf(TypeError);
  expect(thrown).toMatchObject({ message: "invalid_project_file" });
  if (path !== undefined) {
    expect(/** @type {Error} */ (thrown).cause).toEqual({ path });
  }
}

describe("profileDataBoundary", () => {
  it("preserves the complete canonical sync-golden profile exactly", () => {
    const project = readFixture("sync/sync-project-golden.json");
    const source = project.data.profiles["canonical-profile"];

    const decoded = decodeProfileData(source, "canonical-profile");

    expect(decoded).toEqual(source);
    expect(decoded).not.toBe(source);
    expect(decoded.builds).not.toBe(source.builds);
    expect(decoded.aliases).not.toBe(source.aliases);
    expect(decoded.vertigoSettings).not.toBe(source.vertigoSettings);
  });

  it("preserves every rich-command field and JSON-safe extensions while deeply detaching", () => {
    const richCommand = {
      command: "+TrayExecByTray 0 0",
      text: "Tray slot",
      id: "rich-command",
      type: "tray",
      category: "combat",
      categoryId: "combat-category",
      commandId: "tray-command",
      name: "Execute tray slot",
      description: "Executes one tray slot",
      icon: "pickaxe",
      environment: "space",
      warning: "careful",
      customizable: true,
      custom: true,
      palindromicGeneration: true,
      placement: "pivot",
      parameters: { tray: 0, slot: 0, nested: { enabled: true } },
      commandExtension: { future: ["value"] },
    };
    const source = profile({
      currentEnvironment: "space",
      builds: {
        space: {
          keys: { F1: [richCommand] },
          aliases: {
            Scoped: {
              commands: ["FireAll"],
              metadata: { source: "fixture" },
              aliasExtension: { retained: true },
            },
          },
          bindingExtension: { retained: [1, 2, 3] },
        },
      },
      aliases: {},
      keybindMetadata: {
        space: {
          F1: {
            stabilizeExecutionOrder: true,
            metadataExtension: { retained: true },
          },
        },
      },
      vertigoSettings: {
        selectedEffects: { space: ["Bloom"], ground: [] },
        showPlayerSay: true,
        vertigoExtension: { retained: true },
      },
      profileExtension: { nested: { values: ["retained"] } },
    });
    const snapshot = structuredClone(source);

    const decoded = decodeProfileData(source, "extensions");

    expect(decoded.builds.space.keys.F1[0]).toEqual(richCommand);
    expect(decoded.builds.space.bindingExtension).toEqual({
      retained: [1, 2, 3],
    });
    expect(decoded.builds.space.aliases.Scoped.aliasExtension).toEqual({
      retained: true,
    });
    expect(decoded.keybindMetadata.space.F1.metadataExtension).toEqual({
      retained: true,
    });
    expect(decoded.vertigoSettings.vertigoExtension).toEqual({
      retained: true,
    });
    expect(decoded.profileExtension).toEqual({
      nested: { values: ["retained"] },
    });

    richCommand.parameters.nested.enabled = false;
    source.profileExtension.nested.values.push("caller mutation");
    expect(decoded.builds.space.keys.F1[0].parameters.nested.enabled).toBe(
      true,
    );
    expect(decoded.profileExtension.nested.values).toEqual(["retained"]);

    decoded.profileExtension.nested.values.push("decoded mutation");
    expect(source.profileExtension.nested.values).toEqual([
      "retained",
      "caller mutation",
    ]);
    expect(snapshot.profileExtension.nested.values).toEqual(["retained"]);
  });

  it("preserves alias and additional build environments while scaffolding space and ground", () => {
    const decoded = decodeProfileData(
      profile({
        currentEnvironment: "alias",
        builds: {
          alias: { keys: { A: ["AliasBuildCommand"] } },
          pvp: {
            keys: { P: ["PvpCommand"] },
            aliases: { PvpAlias: { commands: ["PvpAliasCommand"] } },
          },
        },
      }),
      "additional-environments",
    );

    expect(decoded.currentEnvironment).toBe("alias");
    expect(decoded.builds).toEqual({
      alias: { keys: { A: ["AliasBuildCommand"] } },
      pvp: {
        keys: { P: ["PvpCommand"] },
        aliases: { PvpAlias: { commands: ["PvpAliasCommand"] } },
      },
      space: { keys: {} },
      ground: { keys: {} },
    });
  });

  it("preserves metadata scoped to an additional build environment", () => {
    const decoded = decodeProfileData(
      profile({
        currentEnvironment: "pvp",
        builds: {
          pvp: { keys: { P: ["PvpCommand"] } },
        },
        keybindMetadata: {
          pvp: {
            P: { stabilizeExecutionOrder: true },
          },
        },
      }),
      "additional-environment-metadata",
    );

    expect(decoded.keybindMetadata).toEqual({
      pvp: {
        P: { stabilizeExecutionOrder: true },
      },
    });
  });

  it.each([
    ["storage/legacy-space-root.json", "legacy-space", "space", "F1"],
    ["storage/legacy-ground-root.json", "legacy-ground", "ground", "G"],
  ])(
    "normalizes the %s mode-and-keys profile without dropping compatible fields",
    (fixturePath, profileId, environment, representativeKey) => {
      const root = readFixture(fixturePath);
      const source = root.profiles[profileId];

      const decoded = decodeProfileData(source, profileId);

      expect(decoded).not.toHaveProperty("mode");
      expect(decoded).not.toHaveProperty("keys");
      expect(decoded).not.toHaveProperty("keybinds");
      expect(decoded.currentEnvironment).toBe(environment);
      expect(decoded.builds[environment].keys).toHaveProperty(
        representativeKey,
      );
      expect(decoded.builds.space).toBeDefined();
      expect(decoded.builds.ground).toBeDefined();

      if (profileId === "legacy-space") {
        expect(decoded.builds.space.keys.F2).toEqual(["FireTorps"]);
        expect(decoded.aliases.LegacyAttack.commands).toEqual([
          "Target_Enemy_Near",
          "FireAll",
        ]);
        expect(decoded.keybindMetadata).toEqual({
          space: {
            F1: { stabilizeExecutionOrder: true },
          },
        });
        expect(decoded.bindsets).toEqual(source.bindsets);
        expect(decoded.aliasMetadata).toEqual(source.aliasMetadata);
        expect(decoded.bindsetMetadata).toEqual(source.bindsetMetadata);
        expect(decoded.selections).toEqual(source.selections);
        expect(decoded.migrationVersion).toBe(source.migrationVersion);
        expect(decoded.vertigoSettings).toEqual(source.vertigoSettings);
        expect(decoded.legacyExtension).toEqual(source.legacyExtension);
      }
    },
  );

  it("merges keybinds, flat keys, and canonical builds in increasing precedence order", () => {
    const decoded = decodeProfileData(
      profile({
        mode: "Ground Mode",
        currentEnvironment: "space",
        keybinds: {
          space: {
            F1: "keybind-space",
            F2: ["keybind-only"],
          },
          ground: { G: ["keybind-ground"] },
          pvp: { P: ["keybind-pvp"] },
        },
        keys: {
          F1: "flat-space",
          F3: "flat-only",
        },
        builds: {
          space: {
            keys: {
              F1: ["build-space"],
              F4: ["build-only"],
            },
            aliases: { BuildAlias: { commands: "One $$ Two" } },
          },
          ground: { keys: { G: ["build-ground"] } },
          alias: { keys: { A: ["alias-build"] } },
        },
      }),
      "combined-precedence",
    );

    expect(decoded.currentEnvironment).toBe("space");
    expect(decoded.builds.space.keys).toEqual({
      F1: ["build-space"],
      F2: ["keybind-only"],
      F3: ["flat-only"],
      F4: ["build-only"],
    });
    expect(decoded.builds.space.aliases.BuildAlias.commands).toEqual([
      "One",
      "Two",
    ]);
    expect(decoded.builds.ground.keys).toEqual({ G: ["build-ground"] });
    expect(decoded.builds.pvp.keys).toEqual({ P: ["keybind-pvp"] });
    expect(decoded.builds.alias.keys).toEqual({ A: ["alias-build"] });
  });

  it.each([
    ["Ground Mode", undefined, "ground"],
    ["Space Mode", undefined, "space"],
    ["Ground Mode", "space", "space"],
  ])(
    "scopes flat key metadata using mode %j and current environment %j",
    (mode, currentEnvironment, expectedEnvironment) => {
      const decoded = decodeProfileData(
        profile({
          mode,
          ...(currentEnvironment === undefined ? {} : { currentEnvironment }),
          keybindMetadata: {
            F1: {
              stabilizeExecutionOrder: true,
              metadataExtension: { retained: true },
            },
          },
        }),
        "flat-metadata",
      );

      expect(decoded.keybindMetadata).toEqual({
        [expectedEnvironment]: {
          F1: {
            stabilizeExecutionOrder: true,
            metadataExtension: { retained: true },
          },
        },
      });
    },
  );

  it("normalizes every supported legacy alias command form", () => {
    const rich = {
      command: "Target_Enemy_Near",
      parameters: { arc: 90 },
      richExtension: { retained: true },
    };
    const decoded = decodeProfileData(
      profile({
        aliases: {
          StringAlias: "One $$ Two",
          ArrayAlias: ["One", rich],
          ObjectStringAlias: {
            description: "legacy string commands",
            commands: "One $$ Two",
          },
          ObjectRichAlias: {
            commands: rich,
            metadata: { retained: true },
          },
          MissingCommandsAlias: { description: "still valid" },
        },
      }),
      "legacy-aliases",
    );

    expect(decoded.aliases.StringAlias).toEqual({ commands: ["One", "Two"] });
    expect(decoded.aliases.ArrayAlias).toEqual({ commands: ["One", rich] });
    expect(decoded.aliases.ObjectStringAlias).toEqual({
      description: "legacy string commands",
      commands: ["One", "Two"],
    });
    expect(decoded.aliases.ObjectRichAlias).toEqual({
      commands: [rich],
      metadata: { retained: true },
    });
    expect(decoded.aliases.MissingCommandsAlias).toEqual({
      description: "still valid",
    });
  });

  it.each(invalidProfileCases)(
    "rejects %s at its exact path",
    (_case, value, path) => {
      expectInvalid(() => decodeProfileData(value, "invalid"), path);
    },
  );

  it.each(["__proto__", "prototype", "constructor"])(
    "rejects unsafe profile id %s",
    (profileId) => {
      expectInvalid(
        () => decodeProfileData(profile(), profileId),
        `data.profiles.${profileId}`,
      );
    },
  );

  it.each(unsafeOwnKeyCases)(
    "rejects unsafe own %s without prototype mutation",
    (_case, json, path) => {
      const objectPrototype = Object.getPrototypeOf({});
      const pollutedBefore = Object.getOwnPropertyDescriptor(
        objectPrototype,
        "polluted",
      );

      expectInvalid(() => decodeProfileData(JSON.parse(json), "unsafe"), path);

      expect(
        Object.getOwnPropertyDescriptor(objectPrototype, "polluted"),
      ).toEqual(pollutedBefore);
    },
  );

  it.each([
    ["currentEnvironment", "__proto__"],
    ["environment", "prototype"],
    ["id", "constructor"],
  ])("rejects unsafe dynamic %s value", (field, value) => {
    expectInvalid(
      () => decodeProfileData(profile({ [field]: value }), "unsafe-value"),
      `data.profiles.unsafe-value.${field}`,
    );
  });

  it.each(["__proto__", "prototype", "constructor"])(
    "rejects unsafe dynamic selection value %s",
    (selection) => {
      expectInvalid(
        () =>
          decodeProfileData(
            profile({ selections: { space: selection } }),
            "unsafe-selection",
          ),
        "data.profiles.unsafe-selection.selections.space",
      );
    },
  );

  it("allows safe identifiers that collide with inherited Object members", () => {
    const builds = Object.fromEntries([
      [
        "toString",
        {
          keys: Object.fromEntries([["valueOf", ["SafeCommand"]]]),
          aliases: Object.fromEntries([
            ["toString", { commands: ["SafeAliasCommand"] }],
          ]),
        },
      ],
    ]);
    const bindsets = Object.fromEntries([
      [
        "valueOf",
        Object.fromEntries([
          [
            "toString",
            { keys: Object.fromEntries([["valueOf", ["BindsetCommand"]]]) },
          ],
        ]),
      ],
    ]);
    const decoded = decodeProfileData(
      profile({
        currentEnvironment: "valueOf",
        builds,
        bindsets,
        selections: Object.fromEntries([["toString", "valueOf"]]),
      }),
      "toString",
    );

    expect(Object.hasOwn(decoded.builds, "toString")).toBe(true);
    expect(Object.hasOwn(decoded.builds.toString.keys, "valueOf")).toBe(true);
    expect(decoded.builds.toString.keys.valueOf).toEqual(["SafeCommand"]);
    expect(Object.hasOwn(decoded.builds.toString.aliases, "toString")).toBe(
      true,
    );
    expect(Object.hasOwn(decoded.bindsets, "valueOf")).toBe(true);
    expect(decoded.bindsets.valueOf.toString.keys.valueOf).toEqual([
      "BindsetCommand",
    ]);
    expect(Object.hasOwn(decoded.selections, "toString")).toBe(true);
    expect(decoded.selections.toString).toBe("valueOf");
    expect(decoded.currentEnvironment).toBe("valueOf");
  });
});
