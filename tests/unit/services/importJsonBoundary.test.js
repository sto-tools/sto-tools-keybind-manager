import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { decodeProjectJson } from "../../../src/js/components/services/importJsonBoundary.js";
import {
  MAX_PROJECT_JSON_BYTES,
  MAX_PROJECT_JSON_DEPTH,
} from "../../../src/js/components/services/jsonDataBoundary.js";

const syncProjectGolden = JSON.parse(
  readFileSync(
    join(process.cwd(), "tests/fixtures/sync/sync-project-golden.json"),
    "utf8",
  ),
);
const syncProjectGoldenText = JSON.stringify(syncProjectGolden);
const dangerousKeys = ["__proto__", "prototype", "constructor"];

function minimalProfile(name = "Boundary Profile") {
  return {
    name,
    builds: {
      space: { keys: {} },
      ground: { keys: {} },
    },
  };
}

function projectText(data, metadata = {}) {
  return JSON.stringify({ ...metadata, type: "project", data });
}

function ownRecord(entries) {
  const record = {};
  for (const [key, value] of entries) {
    Object.defineProperty(record, key, {
      value,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  return record;
}

function expectSchemaFailure(content, path) {
  expect(decodeProjectJson(content)).toEqual({
    success: false,
    error: "invalid_project_file",
    params: { path },
  });
}

function nestedValue(objectCount) {
  let value = "leaf";
  for (let index = 0; index < objectCount; index += 1) {
    value = { next: value };
  }
  return value;
}

const sizedProjectPrefix = '{"version":"';
const sizedProjectSuffix = '","type":"project","data":{}}';
const sizedProjectOverhead = new TextEncoder().encode(
  sizedProjectPrefix + sizedProjectSuffix,
).byteLength;

function projectWithUtf8ByteLength(byteLength) {
  const payloadBytes = byteLength - sizedProjectOverhead;
  if (payloadBytes < 0) throw new RangeError("Project size is too small");
  const doubleByteCharacters = Math.floor(payloadBytes / 2);
  const singleByteCharacters = payloadBytes % 2;
  return (
    sizedProjectPrefix +
    "é".repeat(doubleByteCharacters) +
    "x".repeat(singleByteCharacters) +
    sizedProjectSuffix
  );
}

describe("decodeProjectJson", () => {
  describe("canonical and legacy envelopes", () => {
    it("decodes the exact synchronized project golden", () => {
      expect(decodeProjectJson(syncProjectGoldenText)).toEqual({
        success: true,
        value: syncProjectGolden,
      });
    });

    it("accepts the historical empty project data envelope", () => {
      expect(decodeProjectJson(projectText({}))).toEqual({
        success: true,
        value: { type: "project", data: {} },
      });
    });

    it("keeps version and exported metadata optional and string-valued", () => {
      expect(
        decodeProjectJson(
          projectText({}, { version: "legacy-version", exported: "" }),
        ),
      ).toEqual({
        success: true,
        value: {
          version: "legacy-version",
          exported: "",
          type: "project",
          data: {},
        },
      });

      for (const [field, value] of [
        ["version", 1],
        ["exported", false],
      ]) {
        expectSchemaFailure(projectText({}, { [field]: value }), `$.${field}`);
      }
    });
  });

  describe("syntax and schema failures", () => {
    it("distinguishes malformed JSON from a valid JSON schema failure", () => {
      expect(decodeProjectJson('{"type":"project","data":{}')).toEqual({
        success: false,
        error: "import_failed_invalid_json",
      });
      expectSchemaFailure(
        JSON.stringify({ type: "other", data: {} }),
        "$.type",
      );
    });

    it.each([
      ["missing", { type: "project" }],
      ["null", { type: "project", data: null }],
      ["array", { type: "project", data: [] }],
      ["string", { type: "project", data: "data" }],
      ["number", { type: "project", data: 1 }],
      ["boolean", { type: "project", data: true }],
    ])("rejects a %s data member", (_label, envelope) => {
      expectSchemaFailure(JSON.stringify(envelope), "$.data");
    });

    it.each([
      ["null", null],
      ["array", []],
      ["string", "profiles"],
      ["number", 1],
      ["boolean", true],
    ])("rejects a %s profiles member", (_label, profiles) => {
      expectSchemaFailure(projectText({ profiles }), "$.data.profiles");
    });

    it.each([
      ["null", null],
      ["array", []],
      ["string", "settings"],
      ["number", 1],
      ["boolean", true],
    ])("rejects a %s settings member", (_label, settings) => {
      expectSchemaFailure(projectText({ settings }), "$.data.settings");
    });

    it("accepts string and null currentProfile values", () => {
      expect(
        decodeProjectJson(projectText({ currentProfile: "alpha" })),
      ).toEqual({
        success: true,
        value: {
          type: "project",
          data: { currentProfile: "alpha" },
        },
      });
      expect(decodeProjectJson(projectText({ currentProfile: null }))).toEqual({
        success: true,
        value: { type: "project", data: { currentProfile: null } },
      });
    });

    it.each([
      ["array", []],
      ["object", {}],
      ["number", 1],
      ["boolean", true],
    ])("rejects a %s currentProfile member", (_label, currentProfile) => {
      expectSchemaFailure(
        projectText({ currentProfile }),
        "$.data.currentProfile",
      );
    });

    it("preserves both current-profile locations for service-level precedence", () => {
      const decoded = decodeProjectJson(
        projectText({
          profiles: {
            canonical: minimalProfile("Canonical"),
            legacy: minimalProfile("Legacy"),
          },
          currentProfile: "canonical",
          settings: { currentProfile: "legacy" },
        }),
      );

      expect(decoded).toMatchObject({
        success: true,
        value: {
          data: {
            currentProfile: "canonical",
            settings: { currentProfile: "legacy" },
          },
        },
      });
    });

    it("validates every profile before returning a decoded project", () => {
      expectSchemaFailure(
        projectText({
          profiles: {
            first: minimalProfile("First"),
            second: {
              ...minimalProfile("Second"),
              name: 42,
            },
            third: minimalProfile("Third"),
          },
        }),
        "$.data.profiles.second.name",
      );
    });
  });

  describe("detachment and dynamic-key safety", () => {
    it("does not mutate its source and returns independently detached values", () => {
      const source = {
        version: "1.0.0",
        type: "project",
        data: {
          profiles: {
            alpha: {
              ...minimalProfile("Alpha"),
              builds: {
                space: { keys: { F1: ["FireAll"] } },
                ground: { keys: {} },
              },
            },
          },
          settings: { "plugin:layout": { density: "compact" } },
          currentProfile: "alpha",
        },
      };
      const sourceSnapshot = structuredClone(source);
      const content = JSON.stringify(source);
      const first = decodeProjectJson(content);
      const second = decodeProjectJson(content);

      expect(first.success).toBe(true);
      expect(second.success).toBe(true);
      if (!first.success || !second.success) return;

      expect(source).toEqual(sourceSnapshot);
      expect(first.value).not.toBe(source);
      expect(first.value.data).not.toBe(source.data);
      expect(first.value.data.profiles.alpha).not.toBe(
        source.data.profiles.alpha,
      );
      expect(first.value.data.profiles.alpha).not.toBe(
        second.value.data.profiles.alpha,
      );

      first.value.data.profiles.alpha.builds.space.keys.F1.push("FireTorps");
      first.value.data.settings["plugin:layout"].density = "comfortable";

      expect(source).toEqual(sourceSnapshot);
      expect(second.value.data.profiles.alpha.builds.space.keys.F1).toEqual([
        "FireAll",
      ]);
      expect(second.value.data.settings["plugin:layout"]).toEqual({
        density: "compact",
      });
    });

    it.each(dangerousKeys)("rejects the unsafe profile ID %s", (key) => {
      const profiles = ownRecord([[key, minimalProfile(key)]]);
      expectSchemaFailure(projectText({ profiles }), `$.data.profiles.${key}`);
    });

    it.each(dangerousKeys)("rejects the unsafe stored profile id %s", (key) => {
      expectSchemaFailure(
        projectText({
          profiles: {
            alpha: { ...minimalProfile("Alpha"), id: key },
          },
        }),
        "$.data.profiles.alpha.id",
      );
    });

    it.each(dangerousKeys)("rejects the unsafe currentProfile %s", (key) => {
      expectSchemaFailure(
        projectText({ currentProfile: key }),
        "$.data.currentProfile",
      );
    });

    it.each([
      [
        "key",
        (key) => ({
          profiles: {
            alpha: {
              ...minimalProfile("Alpha"),
              builds: {
                space: { keys: ownRecord([[key, []]]) },
                ground: { keys: {} },
              },
            },
          },
        }),
        "$.data.profiles.alpha.builds.space.keys",
      ],
      [
        "alias",
        (key) => ({
          profiles: {
            alpha: {
              ...minimalProfile("Alpha"),
              aliases: ownRecord([[key, { commands: [] }]]),
            },
          },
        }),
        "$.data.profiles.alpha.aliases",
      ],
      [
        "bindset",
        (key) => ({
          profiles: {
            alpha: {
              ...minimalProfile("Alpha"),
              bindsets: ownRecord([[key, {}]]),
            },
          },
        }),
        "$.data.profiles.alpha.bindsets",
      ],
      [
        "settings extension",
        (key) => ({
          settings: ownRecord([[key, "unsafe"]]),
        }),
        "$.data.settings",
      ],
    ])("rejects unsafe keys nested in a %s map", (_label, createData, path) => {
      for (const key of dangerousKeys) {
        expectSchemaFailure(projectText(createData(key)), `${path}.${key}`);
      }
    });

    it("allows toString and valueOf as ordinary dynamic identifiers", () => {
      const profiles = ownRecord([
        [
          "toString",
          {
            ...minimalProfile("toString"),
            builds: {
              space: {
                keys: ownRecord([
                  ["toString", ["FireAll"]],
                  ["valueOf", ["FireTorps"]],
                ]),
              },
              ground: { keys: {} },
            },
            aliases: ownRecord([
              ["toString", { commands: ["FireAll"] }],
              ["valueOf", { commands: ["FireTorps"] }],
            ]),
          },
        ],
        ["valueOf", minimalProfile("valueOf")],
      ]);
      const settings = ownRecord([
        ["toString", "allowed"],
        ["valueOf", 42],
      ]);

      const decoded = decodeProjectJson(
        projectText({ profiles, settings, currentProfile: "toString" }),
      );

      expect(decoded.success).toBe(true);
      if (!decoded.success) return;
      expect(Object.hasOwn(decoded.value.data.profiles, "toString")).toBe(true);
      expect(Object.hasOwn(decoded.value.data.profiles, "valueOf")).toBe(true);
      expect(
        Object.hasOwn(
          decoded.value.data.profiles.toString.builds.space.keys,
          "valueOf",
        ),
      ).toBe(true);
      expect(
        Object.hasOwn(decoded.value.data.profiles.toString.aliases, "toString"),
      ).toBe(true);
      expect(decoded.value.data.settings).toMatchObject({
        toString: "allowed",
        valueOf: 42,
      });
      expect(decoded.value.data.currentProfile).toBe("toString");
    });
  });

  describe("resource boundaries", () => {
    it("accepts the exact UTF-8 byte limit and rejects the next byte", () => {
      const exact = projectWithUtf8ByteLength(MAX_PROJECT_JSON_BYTES);
      const oversized = projectWithUtf8ByteLength(MAX_PROJECT_JSON_BYTES + 1);
      const encoder = new TextEncoder();

      expect(exact.length).toBeLessThan(MAX_PROJECT_JSON_BYTES);
      expect(encoder.encode(exact)).toHaveLength(MAX_PROJECT_JSON_BYTES);
      expect(decodeProjectJson(exact)).toMatchObject({ success: true });

      expect(oversized.length).toBeLessThan(MAX_PROJECT_JSON_BYTES);
      expect(encoder.encode(oversized)).toHaveLength(
        MAX_PROJECT_JSON_BYTES + 1,
      );
      expectSchemaFailure(oversized, "$");
    });

    it("accepts the exact nesting limit and rejects one deeper", () => {
      const fixedDepthToSettingValue = 3;
      const exact = projectText({
        settings: {
          "plugin:nested": nestedValue(
            MAX_PROJECT_JSON_DEPTH - fixedDepthToSettingValue,
          ),
        },
      });
      const tooDeep = projectText({
        settings: {
          "plugin:nested": nestedValue(
            MAX_PROJECT_JSON_DEPTH - fixedDepthToSettingValue + 1,
          ),
        },
      });

      expect(decodeProjectJson(exact)).toMatchObject({ success: true });
      expect(decodeProjectJson(tooDeep)).toMatchObject({
        success: false,
        error: "invalid_project_file",
        params: {
          path: expect.stringMatching(/^\$\.data\.settings\.plugin:nested/),
        },
      });
    });
  });
});
