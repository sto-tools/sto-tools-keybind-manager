import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  decodeAliasMap,
  decodeProfileData,
  decodeStoredProfileData,
} from "../../../src/js/components/services/profileDataBoundary.js";

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

describe("stored profile data boundary", () => {
  it("validates build-based hybrid profiles without rewriting their representation", () => {
    const source = profile({
      mode: "Ground Mode",
      currentEnvironment: "pvp",
      keys: { G: "FlatOne $$ FlatTwo" },
      keybinds: {
        pvp: {
          P: [
            {
              command: "HybridCommand",
              parameters: { nested: { retained: true } },
            },
          ],
        },
      },
      builds: {
        space: { keys: {} },
        pvp: {
          keys: { P: "BuildOne $$ BuildTwo" },
          aliases: { HybridAlias: "AliasOne $$ AliasTwo" },
          bindingExtension: { retained: [1, 2, 3] },
        },
      },
      aliases: { TopLevelAlias: "TopOne $$ TopTwo" },
      bindsets: {
        Alternate: {
          pvp: { keys: { P: ["AlternateCommand"] } },
        },
      },
      keybindMetadata: {
        pvp: { P: { stabilizeExecutionOrder: true } },
      },
      aliasMetadata: {
        TopLevelAlias: { stabilizeExecutionOrder: false },
      },
      bindsetMetadata: {
        Alternate: {
          pvp: { P: { stabilizeExecutionOrder: true } },
        },
      },
      selections: { pvp: "P", alias: "TopLevelAlias" },
      vertigoSettings: {
        selectedEffects: { pvp: ["FutureEffect"] },
        showPlayerSay: true,
      },
      profileExtension: { nested: { retained: true } },
    });
    const snapshot = structuredClone(source);

    const decoded = decodeStoredProfileData(source, "hybrid-profile");

    expect(decoded).toEqual({
      profile: snapshot,
      migrated: false,
      changed: false,
    });
    expect(decoded.profile).not.toBe(source);
    expect(decoded.profile.builds).not.toBe(source.builds);
    expect(decoded.profile.keys.G).toBe("FlatOne $$ FlatTwo");
    expect(decoded.profile.builds.pvp.keys.P).toBe("BuildOne $$ BuildTwo");
    expect(decoded.profile.builds.pvp.aliases.HybridAlias).toBe(
      "AliasOne $$ AliasTwo",
    );
    expect(decoded.profile).not.toHaveProperty("description");
    expect(decoded.profile).not.toHaveProperty("migrationVersion");

    source.keybinds.pvp.P[0].parameters.nested.retained = false;
    source.profileExtension.nested.retained = false;
    expect(decoded.profile.keybinds.pvp.P[0].parameters.nested.retained).toBe(
      true,
    );
    expect(decoded.profile.profileExtension.nested.retained).toBe(true);
  });

  it("losslessly migrates a pure mode-and-keys profile and reports the structural change", () => {
    const root = readFixture("storage/legacy-space-root.json");
    const source = root.profiles["legacy-space"];
    const snapshot = structuredClone(source);

    const decoded = decodeStoredProfileData(source, "legacy-space");

    expect(decoded.migrated).toBe(true);
    expect(decoded.changed).toBe(true);
    expect(decoded.profile).toEqual(
      decodeProfileData(snapshot, "legacy-space"),
    );
    expect(decoded.profile).not.toHaveProperty("mode");
    expect(decoded.profile).not.toHaveProperty("keys");
    expect(decoded.profile).not.toHaveProperty("keybinds");
    expect(decoded.profile.bindsets).toEqual(source.bindsets);
    expect(decoded.profile.aliasMetadata).toEqual(source.aliasMetadata);
    expect(decoded.profile.bindsetMetadata).toEqual(source.bindsetMetadata);
    expect(decoded.profile.selections).toEqual(source.selections);
    expect(decoded.profile.migrationVersion).toBe(source.migrationVersion);
    expect(decoded.profile.vertigoSettings).toEqual(source.vertigoSettings);
    expect(decoded.profile.legacyExtension).toEqual(source.legacyExtension);
    expect(source).toEqual(snapshot);
  });

  it("merges legacy keybinds before flat keys without stamping a migration version", () => {
    const source = profile({
      mode: "Ground Mode",
      keybinds: {
        ground: { G: ["KeybindCommand"], H: ["KeybindOnly"] },
        pvp: { P: ["PvpCommand"] },
      },
      keys: { G: ["FlatCommand"], F: ["FlatOnly"] },
      lifecycleExtension: { retained: true },
    });

    const decoded = decodeStoredProfileData(source, "legacy-precedence");

    expect(decoded.migrated).toBe(true);
    expect(decoded.changed).toBe(true);
    expect(decoded.profile.builds.ground.keys).toEqual({
      G: ["FlatCommand"],
      H: ["KeybindOnly"],
      F: ["FlatOnly"],
    });
    expect(decoded.profile.builds.pvp.keys).toEqual({ P: ["PvpCommand"] });
    expect(decoded.profile.lifecycleExtension).toEqual({ retained: true });
    expect(decoded.profile).not.toHaveProperty("migrationVersion");
  });

  it("repairs nullable command containers without rewriting valid compatibility forms", () => {
    const source = profile({
      keys: { FlatEmpty: null, FlatString: "FireAll" },
      keybinds: { pvp: { P: null, Q: "FireTorps" } },
      builds: {
        space: {
          keys: { F1: null, F2: "FirePhasers $$ FireTorps" },
          aliases: {
            EmptyBuildAlias: { commands: null },
            StringBuildAlias: "FireAll $$ FireTorps",
          },
        },
      },
      aliases: {
        EmptyAlias: { commands: null },
        StringAlias: "FireAll $$ FireTorps",
      },
      bindsets: {
        Alternate: { space: { keys: { F3: null, F4: "FireMines" } } },
      },
    });

    const decoded = decodeStoredProfileData(source, "nullable-commands");

    expect(decoded).toMatchObject({ migrated: false, changed: true });
    expect(decoded.profile).toMatchObject({
      keys: { FlatEmpty: [], FlatString: "FireAll" },
      keybinds: { pvp: { P: [], Q: "FireTorps" } },
      builds: {
        space: {
          keys: { F1: [], F2: "FirePhasers $$ FireTorps" },
          aliases: {
            EmptyBuildAlias: { commands: [] },
            StringBuildAlias: "FireAll $$ FireTorps",
          },
        },
      },
      aliases: {
        EmptyAlias: { commands: [] },
        StringAlias: "FireAll $$ FireTorps",
      },
      bindsets: {
        Alternate: { space: { keys: { F3: [], F4: "FireMines" } } },
      },
    });
    expect(source.builds.space.keys.F1).toBeNull();
    expect(source.aliases.EmptyAlias.commands).toBeNull();
  });

  it.each([
    [
      "blank profile name",
      profile({ name: "   ", builds: { space: { keys: {} } } }),
      "data.profiles.invalid-stored.name",
    ],
    [
      "extra build environment",
      profile({
        builds: {
          space: { keys: {} },
          pvp: { keys: { P: [42] } },
        },
      }),
      "data.profiles.invalid-stored.builds.pvp.keys.P[0]",
    ],
    [
      "hybrid flat keys",
      profile({
        builds: { space: { keys: {} } },
        keys: { F1: Symbol("not-json") },
      }),
      "data.profiles.invalid-stored.keys.F1",
    ],
    [
      "hybrid keybinds",
      profile({
        builds: { ground: { keys: {} } },
        keybinds: { pvp: { P: 42 } },
      }),
      "data.profiles.invalid-stored.keybinds.pvp.keys.P",
    ],
    [
      "profile extension",
      profile({
        builds: { space: { keys: {} } },
        extension: Number.POSITIVE_INFINITY,
      }),
      "data.profiles.invalid-stored.extension",
    ],
  ])("rejects invalid %s data", (_case, value, path) => {
    expectInvalid(() => decodeStoredProfileData(value, "invalid-stored"), path);
  });

  it.each([
    ["no usable representation", profile(), "data.profiles.unusable.builds"],
    [
      "only an extra build environment",
      profile({ builds: { pvp: { keys: {} } } }),
      "data.profiles.unusable.builds",
    ],
  ])("rejects a profile with %s", (_case, value, path) => {
    expectInvalid(() => decodeStoredProfileData(value, "unusable"), path);
  });

  it("rejects reserved extension keys without prototype mutation", () => {
    const source = JSON.parse(
      '{"name":"Unsafe","builds":{"space":{"keys":{}}},"__proto__":{"polluted":true}}',
    );
    const objectPrototype = Object.getPrototypeOf({});
    const pollutedBefore = Object.getOwnPropertyDescriptor(
      objectPrototype,
      "polluted",
    );

    expectInvalid(
      () => decodeStoredProfileData(source, "unsafe-stored"),
      "data.profiles.unsafe-stored.__proto__",
    );
    expect(
      Object.getOwnPropertyDescriptor(objectPrototype, "polluted"),
    ).toEqual(pollutedBefore);
  });

  it("rejects extensions beyond the JSON boundary depth limit", () => {
    /** @type {Record<string, unknown>} */
    let extension = { leaf: true };
    for (let depth = 0; depth < 102; depth += 1) {
      extension = { nested: extension };
    }

    expectInvalid(() =>
      decodeStoredProfileData(
        profile({ builds: { space: { keys: {} } }, extension }),
        "too-deep",
      ),
    );
  });

  it("exports the detached canonical alias-map decoder", () => {
    const source = {
      Attack: {
        commands: "Target_Enemy_Near $$ FireAll",
        metadata: { nested: { retained: true } },
      },
    };

    const decoded = decodeAliasMap(source, "data.globalAliases");

    expect(decoded).toEqual({
      Attack: {
        commands: ["Target_Enemy_Near", "FireAll"],
        metadata: { nested: { retained: true } },
      },
    });
    source.Attack.metadata.nested.retained = false;
    expect(decoded.Attack.metadata.nested.retained).toBe(true);
  });
});
