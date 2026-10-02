import { describe, expect, it } from "vitest";

import {
  MAX_PROJECT_JSON_BYTES,
  MAX_PROJECT_JSON_DEPTH,
} from "../../../src/js/components/services/jsonDataBoundary.js";
import {
  decodeLegacyStoredApplicationJson,
  decodeStoredApplicationJson,
} from "../../../src/js/components/services/storedApplicationDataBoundary.js";

const defaults = Object.freeze({
  version: "2.0.0",
  created: "2026-07-17T00:00:00.000Z",
  lastModified: "2026-07-17T00:00:00.000Z",
  currentProfile: null,
  profiles: {},
  globalAliases: {},
});

function profile(overrides = {}) {
  return {
    name: "Stored Profile",
    currentEnvironment: "space",
    builds: {
      space: { keys: { F1: ["FireAll"] } },
      ground: { keys: {} },
    },
    aliases: {},
    ...overrides,
  };
}

function root(overrides = {}) {
  return {
    version: "2.0.0",
    created: "2025-01-01T00:00:00.000Z",
    lastModified: "2025-01-02T00:00:00.000Z",
    currentProfile: "captain",
    profiles: { captain: profile() },
    globalAliases: {},
    ...overrides,
  };
}

function decode(value, version = "2.0.0") {
  return decodeStoredApplicationJson(JSON.stringify(value), {
    defaults,
    version,
  });
}

describe("storedApplicationDataBoundary", () => {
  it("preserves and deeply detaches an already-structured hybrid root", () => {
    const source = root({
      profiles: {
        captain: profile({
          keys: { F2: "LegacyFlat" },
          keybinds: { ground: { G: ["LegacyScoped"] } },
          extension: { panels: [{ id: "commands", visible: true }] },
        }),
      },
      extension: { source: "localStorage" },
    });
    const content = JSON.stringify(source);

    const decoded = decodeStoredApplicationJson(content, {
      defaults,
      version: "2.0.0",
    });

    expect(decoded).toMatchObject({
      success: true,
      changed: false,
      migrated: false,
      value: source,
    });
    if (!decoded.success) throw new Error("expected a decoded root");
    expect(decoded.value).not.toBe(source);
    expect(decoded.value.profiles.captain).not.toBe(source.profiles.captain);
    expect(decoded.value.profiles.captain.keys).toEqual({ F2: "LegacyFlat" });
    expect(decoded.value.profiles.captain.keybinds).toEqual({
      ground: { G: ["LegacyScoped"] },
    });

    source.profiles.captain.extension.panels[0].visible = false;
    expect(decoded.value.profiles.captain.extension.panels[0].visible).toBe(
      true,
    );
  });

  it("migrates pure mode+keys data without dropping optional fields", () => {
    const legacy = profile({
      description: "Legacy",
      mode: "Ground Mode",
      builds: undefined,
      keys: { G: "Sprint", H: ["Aim"] },
      keybinds: { ground: { G: ["Lower priority"] }, space: { F: "Jump" } },
      aliases: { Attack: { commands: "Target $$ FireAll" } },
      bindsets: { Alternate: { ground: { keys: { J: "Crouch" } } } },
      aliasMetadata: { Attack: { stabilizeExecutionOrder: true } },
      bindsetMetadata: {
        Alternate: { ground: { J: { stabilizeExecutionOrder: true } } },
      },
      selections: { ground: "G", alias: "Attack" },
      migrationVersion: "2.0.0",
      vertigoSettings: { showPlayerSay: true },
      extension: { retained: true },
    });
    delete legacy.builds;
    delete legacy.currentEnvironment;

    const decoded = decode(root({ profiles: { captain: legacy } }));

    expect(decoded).toMatchObject({
      success: true,
      changed: true,
      migrated: true,
    });
    if (!decoded.success) throw new Error("expected a decoded root");
    const migrated = decoded.value.profiles.captain;
    expect(migrated).not.toHaveProperty("mode");
    expect(migrated).not.toHaveProperty("keys");
    expect(migrated).not.toHaveProperty("keybinds");
    expect(migrated.builds).toMatchObject({
      space: { keys: { F: ["Jump"] } },
      ground: { keys: { G: ["Sprint"], H: ["Aim"] } },
    });
    expect(migrated.aliases.Attack.commands).toEqual(["Target", "FireAll"]);
    expect(migrated.bindsets.Alternate.ground.keys.J).toEqual(["Crouch"]);
    expect(migrated).toMatchObject({
      aliasMetadata: { Attack: { stabilizeExecutionOrder: true } },
      bindsetMetadata: {
        Alternate: { ground: { J: { stabilizeExecutionOrder: true } } },
      },
      selections: { ground: "G", alias: "Attack" },
      migrationVersion: "2.0.0",
      vertigoSettings: { showPlayerSay: true },
      extension: { retained: true },
    });
  });

  // Embedded-field preservation/recovery is retired by Task 9. Migration
  // preserves project data while standalone settings remain independent.
  it.each([null, false, 0, "ignored", [], {}, { theme: "dark" }])(
    "rejects any own settings property in canonical roots: %j",
    (settings) => {
      expect(decode(root({ settings }))).toEqual({
        success: false,
        error: "invalid_data",
        path: "$.settings",
      });
    },
  );

  it.each([
    null,
    true,
    [],
    { theme: 42, language: "fr" },
    JSON.parse('{"__proto__":{"polluted":true},"constructor":{}}'),
  ])(
    "ignores legacy embedded settings %j and preserves project extensions",
    (settings) => {
      const canonical = root({ extension: { source: ["preserved"] } });
      const decoded = decodeLegacyStoredApplicationJson(
        JSON.stringify({ ...canonical, settings }),
        { defaults, version: "2.0.0" },
      );
      expect(decoded).toEqual({
        success: true,
        changed: true,
        migrated: true,
        value: canonical,
      });
      canonical.extension.source[0] = "changed";
      expect(decoded.value.extension.source).toEqual(["preserved"]);
      expect(decoded.value).not.toHaveProperty("settings");
      expect({}.polluted).toBeUndefined();
    },
  );

  it("removes hostile over-depth embedded settings before cloning the root", () => {
    let settings = { leaf: true };
    for (let depth = 0; depth < MAX_PROJECT_JSON_DEPTH + 2; depth++) {
      settings = { nested: settings };
    }
    const canonical = root({ extension: { retained: true } });
    const decoded = decodeLegacyStoredApplicationJson(
      JSON.stringify({ ...canonical, settings }),
      { defaults, version: "2.0.0" },
    );
    expect(decoded).toMatchObject({ success: true, value: canonical });
    expect(decoded.value).not.toHaveProperty("settings");
  });

  it("accepts canonical input through migration without manufacturing changes", () => {
    const canonical = root();
    expect(
      decodeLegacyStoredApplicationJson(JSON.stringify(canonical), {
        defaults,
        version: "2.0.0",
      }),
    ).toEqual({
      success: true,
      changed: false,
      migrated: false,
      value: canonical,
    });
  });

  it("preserves nested extension settings and colliding discriminator-like keys", () => {
    const canonical = root({
      storageSchemaVersion: { userExtension: true },
      extension: { settings: { retained: true } },
    });
    const decoded = decodeLegacyStoredApplicationJson(
      JSON.stringify({ ...canonical, settings: { ignored: true } }),
      { defaults, version: "2.0.0" },
    );
    expect(decoded).toMatchObject({ success: true, value: canonical });
    expect(decoded.value).not.toHaveProperty("settings");
  });

  it("never reads embedded settings from decoder defaults", () => {
    const hostileDefaults = { ...defaults };
    Object.defineProperty(hostileDefaults, "settings", {
      get() {
        throw new Error("embedded defaults must not be consulted");
      },
    });
    for (const decoder of [
      decodeStoredApplicationJson,
      decodeLegacyStoredApplicationJson,
    ]) {
      const decoded = decoder(JSON.stringify(root()), {
        defaults: hostileDefaults,
        version: "2.0.0",
      });
      expect(decoded).toMatchObject({ success: true, value: root() });
      expect(decoded.value).not.toHaveProperty("settings");
    }
  });

  it("applies the byte cap to discarded embedded settings too", () => {
    const content = JSON.stringify(
      root({
        settings: "é".repeat(MAX_PROJECT_JSON_BYTES / 2),
      }),
    );
    expect(
      decodeLegacyStoredApplicationJson(content, {
        defaults,
        version: "2.0.0",
      }),
    ).toEqual({ success: false, error: "invalid_data", path: "$" });
  });

  it("still rejects unsafe project extensions after ignoring embedded settings", () => {
    expect(
      decodeLegacyStoredApplicationJson(
        JSON.stringify(
          root({
            settings: { ignored: true },
            extension: JSON.parse('{"constructor":{}}'),
          }),
        ),
        { defaults, version: "2.0.0" },
      ),
    ).toEqual({
      success: false,
      error: "invalid_data",
      path: "$.extension.constructor",
    });
  });

  it.each([
    [null, "captain"],
    ["missing", "captain"],
  ])(
    "repairs currentProfile %# to the first profile %#",
    (currentProfile, expected) => {
      const decoded = decode(root({ currentProfile }));

      expect(decoded).toMatchObject({ success: true, changed: true });
      if (!decoded.success) throw new Error("expected a decoded root");
      expect(decoded.value.currentProfile).toBe(expected);
    },
  );

  it("clears a dangling currentProfile when the profile map is empty", () => {
    const decoded = decode(root({ profiles: {}, currentProfile: "missing" }));

    expect(decoded).toMatchObject({ success: true, changed: true });
    if (!decoded.success) throw new Error("expected a decoded root");
    expect(decoded.value.currentProfile).toBeNull();
  });

  it("adds historically repaired missing root sections from trusted defaults", () => {
    const value = root();
    delete value.globalAliases;

    const decoded = decode(value);

    expect(decoded).toMatchObject({ success: true, changed: true });
    if (!decoded.success) throw new Error("expected a decoded root");
    expect(decoded.value.globalAliases).toEqual({});
    expect(decoded.value).not.toHaveProperty("settings");
  });

  it("validates and detaches supported global aliases without rewriting them", () => {
    const globalAliases = {
      LegacyString: "Target_Enemy_Near $$ FireAll",
      LegacyArray: ["FireAll"],
      LegacyObject: { commands: "FirePhasers $$ FireTorps" },
    };
    const decoded = decode(
      root({
        globalAliases,
      }),
    );

    expect(decoded).toMatchObject({
      success: true,
      changed: false,
      migrated: false,
    });
    if (!decoded.success) throw new Error("expected a decoded root");
    expect(decoded.value.globalAliases).toEqual(globalAliases);
    expect(decoded.value.globalAliases).not.toBe(globalAliases);
    expect(decoded.value.globalAliases.LegacyArray).not.toBe(
      globalAliases.LegacyArray,
    );
  });

  it("repairs only nullable global-alias commands", () => {
    const decoded = decode(
      root({ globalAliases: { Empty: { commands: null } } }),
    );

    expect(decoded).toMatchObject({ success: true, changed: true });
    if (!decoded.success) throw new Error("expected a decoded root");
    expect(decoded.value.globalAliases).toEqual({ Empty: { commands: [] } });
  });

  it("fills required canonical metadata omitted by a tolerated legacy root", () => {
    const value = root();
    delete value.version;
    delete value.lastModified;

    const decoded = decode(value);

    expect(decoded).toMatchObject({ success: true, changed: true });
    if (!decoded.success) throw new Error("expected a decoded root");
    expect(decoded.value.version).toBe("2.0.0");
    expect(decoded.value.lastModified).toBe(defaults.lastModified);
  });

  it.each([
    ["root array", [], "$"],
    ["missing profiles", { currentProfile: null }, "$.profiles"],
    ["missing current profile", { profiles: {} }, "$.currentProfile"],
    ["profiles array", { profiles: [], currentProfile: null }, "$.profiles"],
    [
      "invalid current profile",
      { profiles: {}, currentProfile: 7 },
      "$.currentProfile",
    ],
    ["invalid timestamp", root({ lastModified: 7 }), "$.lastModified"],
    [
      "profile without a usable structure",
      root({ profiles: { captain: { name: "No builds" } } }),
      "$.profiles.captain.builds",
    ],
    [
      "malformed additional environment",
      root({
        profiles: {
          captain: profile({ builds: { space: { keys: {} }, shuttle: [] } }),
        },
      }),
      "$.profiles.captain.builds.shuttle",
    ],
    ["invalid global aliases", root({ globalAliases: [] }), "$.globalAliases"],
    ["invalid embedded settings", root({ settings: true }), "$.settings"],
  ])("rejects %s as a whole-root failure", (_label, value, path) => {
    expect(decode(value)).toEqual({
      success: false,
      error: "invalid_data",
      path,
    });
  });

  it.each(["__proto__", "prototype", "constructor"])(
    "rejects reserved key %s anywhere in the root",
    (key) => {
      const value = JSON.parse(JSON.stringify(root()));
      value.extension = JSON.parse(
        `{"safe":[{${JSON.stringify(key)}:{"polluted":true}}]}`,
      );

      const decoded = decode(value);

      expect(decoded).toEqual({
        success: false,
        error: "invalid_data",
        path: `$.extension.safe[0].${key}`,
      });
      expect({}.polluted).toBeUndefined();
    },
  );

  it("distinguishes malformed JSON from structurally invalid data", () => {
    const malformed = decodeStoredApplicationJson("{broken", {
      defaults,
      version: "2.0.0",
    });

    expect(malformed).toMatchObject({
      success: false,
      error: "invalid_json",
      cause: expect.any(SyntaxError),
    });
    expect(
      decodeStoredApplicationJson(JSON.stringify([]), {
        defaults,
        version: "2.0.0",
      }),
    ).toEqual({ success: false, error: "invalid_data", path: "$" });
  });

  it("rejects oversized UTF-8 input before parsing", () => {
    const oversized = `"${"a".repeat(MAX_PROJECT_JSON_BYTES)}"`;

    expect(
      decodeStoredApplicationJson(oversized, {
        defaults,
        version: "2.0.0",
      }),
    ).toEqual({ success: false, error: "invalid_data", path: "$" });
    expect(
      decodeLegacyStoredApplicationJson(oversized, {
        defaults,
        version: "2.0.0",
      }),
    ).toEqual({ success: false, error: "invalid_data", path: "$" });
  });

  it("enforces the UTF-8 byte limit independently of JavaScript string length", () => {
    const marker = "__MULTIBYTE_PAYLOAD__";
    const template = JSON.stringify(root({ extension: marker }));
    const [prefix, suffix] = template.split(marker);
    const overheadBytes = new TextEncoder().encode(`${prefix}${suffix}`).length;
    const multibytePayload = "é".repeat(
      Math.floor((MAX_PROJECT_JSON_BYTES - overheadBytes) / 2) + 1,
    );
    const oversized = `${prefix}${multibytePayload}${suffix}`;

    expect(oversized.length).toBeLessThan(MAX_PROJECT_JSON_BYTES);
    expect(new TextEncoder().encode(oversized).length).toBeGreaterThan(
      MAX_PROJECT_JSON_BYTES,
    );
    expect(
      decodeStoredApplicationJson(oversized, {
        defaults,
        version: "2.0.0",
      }),
    ).toEqual({ success: false, error: "invalid_data", path: "$" });
  });

  it("rejects unsafe depth in otherwise JSON-valid root extensions", () => {
    let nested = { leaf: true };
    for (let index = 0; index < 102; index += 1) nested = { next: nested };

    const decoded = decode(root({ extension: nested }));

    expect(decoded).toMatchObject({ success: false, error: "invalid_data" });
    if (decoded.success || decoded.error !== "invalid_data") {
      throw new Error("expected invalid data");
    }
    expect(decoded.path).toMatch(/^\$\.extension(?:\.next)+$/);
    expect(
      decodeLegacyStoredApplicationJson(
        JSON.stringify(root({ settings: null, extension: nested })),
        { defaults, version: "2.0.0" },
      ),
    ).toMatchObject({ success: false, error: "invalid_data" });
  });

  it("marks an accepted storage-version mismatch for repair", () => {
    const decoded = decode(root({ version: "future-version" }), "2.0.0");

    expect(decoded).toMatchObject({
      success: true,
      changed: true,
      migrated: false,
    });
    if (!decoded.success) throw new Error("expected a decoded root");
    expect(decoded.value.version).toBe("future-version");
  });
});
