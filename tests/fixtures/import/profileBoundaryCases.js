/** @param {Record<string, unknown>} [overrides] */
const profile = (overrides = {}) => ({
  name: "Boundary Profile",
  ...overrides,
});

export const invalidProfileCases = [
  ["null profile", null, "data.profiles.invalid"],
  ["array profile", [], "data.profiles.invalid"],
  ["missing name", {}, "data.profiles.invalid.name"],
  ["blank name", { name: "   " }, "data.profiles.invalid.name"],
  ["non-string name", { name: 42 }, "data.profiles.invalid.name"],
  [
    "non-string description",
    profile({ description: 42 }),
    "data.profiles.invalid.description",
  ],
  ["object legacy mode", profile({ mode: {} }), "data.profiles.invalid.mode"],
  [
    "non-string current environment",
    profile({ currentEnvironment: 42 }),
    "data.profiles.invalid.currentEnvironment",
  ],
  ["array builds", profile({ builds: [] }), "data.profiles.invalid.builds"],
  [
    "null build",
    profile({ builds: { space: null } }),
    "data.profiles.invalid.builds.space",
  ],
  [
    "array key map",
    profile({ builds: { space: { keys: [] } } }),
    "data.profiles.invalid.builds.space.keys",
  ],
  [
    "numeric key command",
    profile({ builds: { space: { keys: { F1: 42 } } } }),
    "data.profiles.invalid.builds.space.keys.F1",
  ],
  [
    "invalid rich-command field",
    profile({ builds: { space: { keys: { F1: [{ command: 42 }] } } } }),
    "data.profiles.invalid.builds.space.keys.F1[0].command",
  ],
  [
    "array rich-command parameters",
    profile({
      builds: {
        space: {
          keys: { F1: [{ command: "FireAll", parameters: [] }] },
        },
      },
    }),
    "data.profiles.invalid.builds.space.keys.F1[0].parameters",
  ],
  ["array aliases", profile({ aliases: [] }), "data.profiles.invalid.aliases"],
  [
    "invalid alias description",
    profile({ aliases: { Alpha: { description: 42 } } }),
    "data.profiles.invalid.aliases.Alpha.description",
  ],
  [
    "invalid alias command",
    profile({ aliases: { Alpha: { commands: [42] } } }),
    "data.profiles.invalid.aliases.Alpha.commands[0]",
  ],
  [
    "array alias metadata",
    profile({ aliases: { Alpha: { metadata: [] } } }),
    "data.profiles.invalid.aliases.Alpha.metadata",
  ],
  [
    "array bindset environment map",
    profile({ bindsets: { Alternate: [] } }),
    "data.profiles.invalid.bindsets.Alternate",
  ],
  [
    "invalid key metadata flag",
    profile({
      keybindMetadata: {
        space: { F1: { stabilizeExecutionOrder: "yes" } },
      },
    }),
    "data.profiles.invalid.keybindMetadata.space.F1.stabilizeExecutionOrder",
  ],
  [
    "array alias metadata record",
    profile({ aliasMetadata: { Alpha: [] } }),
    "data.profiles.invalid.aliasMetadata.Alpha",
  ],
  [
    "null bindset key metadata",
    profile({ bindsetMetadata: { Alternate: { space: { F1: null } } } }),
    "data.profiles.invalid.bindsetMetadata.Alternate.space.F1",
  ],
  [
    "numeric selection",
    profile({ selections: { space: 42 } }),
    "data.profiles.invalid.selections.space",
  ],
  [
    "numeric lifecycle field",
    profile({ created: 42 }),
    "data.profiles.invalid.created",
  ],
  [
    "invalid VFX boolean",
    profile({ vertigoSettings: { showPlayerSay: "yes" } }),
    "data.profiles.invalid.vertigoSettings.showPlayerSay",
  ],
  [
    "invalid VFX effect list",
    profile({
      vertigoSettings: { selectedEffects: { space: ["Bloom", 42] } },
    }),
    "data.profiles.invalid.vertigoSettings.selectedEffects.space",
  ],
  [
    "non-finite extension number",
    profile({ extension: Number.POSITIVE_INFINITY }),
    "data.profiles.invalid.extension",
  ],
];

export const unsafeOwnKeyCases = [
  [
    "top-level extension",
    '{"name":"Unsafe","__proto__":{"polluted":true}}',
    "data.profiles.unsafe.__proto__",
  ],
  [
    "build environment",
    '{"name":"Unsafe","builds":{"constructor":{"keys":{}}}}',
    "data.profiles.unsafe.builds.constructor",
  ],
  [
    "key name",
    '{"name":"Unsafe","builds":{"space":{"keys":{"prototype":["FireAll"]}}}}',
    "data.profiles.unsafe.builds.space.keys.prototype",
  ],
  [
    "alias name",
    '{"name":"Unsafe","aliases":{"__proto__":{"commands":["FireAll"]}}}',
    "data.profiles.unsafe.aliases.__proto__",
  ],
  [
    "bindset name",
    '{"name":"Unsafe","bindsets":{"constructor":{"space":{"keys":{}}}}}',
    "data.profiles.unsafe.bindsets.constructor",
  ],
  [
    "metadata key",
    '{"name":"Unsafe","keybindMetadata":{"space":{"prototype":{}}}}',
    "data.profiles.unsafe.keybindMetadata.space.prototype",
  ],
];
