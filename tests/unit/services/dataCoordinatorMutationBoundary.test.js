import { describe, expect, it, vi } from "vitest";
import {
  materializeProfileUpdateRequest,
  materializeProfileMap,
  validateProfileCloneName,
  validateProfileCreation,
  validatePlannedProfileRoot,
  validatePlannedProjectRoot,
} from "../../../src/js/components/services/dataCoordinatorMutationBoundary.js";
import { MAX_PROJECT_JSON_BYTES } from "../../../src/js/components/services/jsonDataBoundary.js";

const profile = () => ({
  name: "Captain",
  currentEnvironment: "space",
  builds: { space: { keys: {} }, ground: { keys: {} } },
  aliases: {},
});
const root = () => ({
  version: "1.0.0",
  currentProfile: "captain",
  profiles: { captain: profile() },
  globalAliases: {},
  settings: {},
  lastModified: "2026-09-26T00:00:00.000Z",
});
const options = { version: "1.0.0" };

describe("DataCoordinator complete mutation validation", () => {
  it("validates each profile-map entry and detaches known and extension fields", () => {
    const profiles = { captain: { ...profile(), extension: { value: 1 } } };
    const detached = materializeProfileMap(profiles);
    profiles.captain.extension.value = 2;
    expect(detached.captain.extension.value).toBe(1);
    for (const invalid of [
      null,
      [],
      { captain: { name: 7 } },
      JSON.parse('{"constructor":{}}'),
    ]) {
      expect(() => materializeProfileMap(invalid)).toThrow();
    }
  });
  it.each([
    { properties: 7 },
    { add: { aliases: { Broken: { commands: 7 } } } },
    { delete: { aliases: [7] } },
    { modify: { aliases: { Broken: { description: false } } } },
    { replacement: { name: 7 } },
    { updateSource: 7 },
  ])("rejects malformed ignored flat fields %#", (flat) => {
    expect(() =>
      materializeProfileUpdateRequest({
        profileId: "captain",
        updates: {
          properties: { description: "inner" },
          updateSource: "inner",
        },
        ...flat,
      }),
    ).toThrow();
  });

  it("rejects present-null updates even when flat operations are valid", () => {
    expect(() =>
      materializeProfileUpdateRequest({
        profileId: "captain",
        updates: null,
        properties: { description: "flat" },
      }),
    ).toThrow();
  });

  it("preserves valid nested precedence and source fallback without retaining inputs", () => {
    const input = {
      profileId: "captain",
      updates: { properties: { description: "inner" }, updateSource: "" },
      properties: { description: "flat" },
      updateSource: "outer",
    };
    const result = materializeProfileUpdateRequest(input);
    expect(result.updates).toEqual({
      properties: { description: "inner" },
      updateSource: "outer",
    });
    input.updates.properties.description = "changed";
    expect(result.updates.properties.description).toBe("inner");
  });

  it.each(["add", "delete", "modify", "properties", "replacement"])(
    "rejects flat %s on replacement-only creation",
    (field) => {
      expect(() =>
        materializeProfileUpdateRequest({
          profileId: "new",
          createIfMissing: true,
          updates: { replacement: profile() },
          [field]: field === "replacement" ? profile() : {},
        }),
      ).toThrow();
    },
  );

  it("requires nested replacement for creation and allows outer updateSource", () => {
    expect(() =>
      materializeProfileUpdateRequest({
        profileId: "new",
        createIfMissing: true,
        replacement: profile(),
      }),
    ).toThrow();
    expect(
      materializeProfileUpdateRequest({
        profileId: "new",
        createIfMissing: true,
        updates: { replacement: profile() },
        updateSource: "ImportService",
      }).updates.updateSource,
    ).toBe("ImportService");
  });

  it.each(["Constructor", "Prototype", "!!!", " ", "", null, 8])(
    "rejects invalid or unsafe generated profile IDs %#",
    (name) => {
      expect(() => validateProfileCreation(name)).toThrow();
      expect(() => validateProfileCloneName(name)).toThrow();
    },
  );

  it.each(["constructor", "prototype", "__proto__", "", null, 8])(
    "rejects unsafe or malformed creation environments %#",
    (mode) => {
      expect(() => validateProfileCreation("Captain", mode)).toThrow();
    },
  );

  it("retains valid display names and extensible safe environments", () => {
    expect(
      validateProfileCreation(" Captain One ", "custom-environment"),
    ).toEqual({
      name: " Captain One ",
      profileId: "_captain_one_",
      mode: "custom-environment",
    });
    expect(validateProfileCreation("Captain")).toEqual({
      name: "Captain",
      profileId: "captain",
      mode: "space",
    });
  });
});

describe("DataCoordinator planned persistence envelope", () => {
  it("validates compatibility shapes and extensions without normalizing or mutating them", () => {
    const candidate = profile();
    candidate.aliases.Greeting = {
      commands: "say hello$$say goodbye",
      extension: { theme: 42 },
    };
    candidate.extension = { values: [null, true, "ok"] };
    const current = root();
    current.extension = { retained: true };
    const before = structuredClone({ candidate, current });
    validatePlannedProfileRoot("captain", candidate, current, options);
    expect({ candidate, current }).toEqual(before);
  });

  it.each([
    { name: 7 },
    { ...profile(), builds: { space: { keys: { F1: [7] } } } },
    { ...profile(), currentEnvironment: "constructor" },
  ])("rejects invalid planned profile schema %#", (candidate) => {
    expect(() =>
      validatePlannedProfileRoot("captain", candidate, root(), options),
    ).toThrow();
  });

  it("rejects profile accessors without invoking them", () => {
    const getter = vi.fn(() => "Captain");
    const candidate = Object.defineProperty({}, "name", {
      enumerable: true,
      get: getter,
    });
    expect(() =>
      validatePlannedProfileRoot("captain", candidate, root(), options),
    ).toThrow();
    expect(getter).not.toHaveBeenCalled();
  });

  it("rejects a merged oversized profile even though each input fragment fits", () => {
    const current = root();
    current.profiles.captain.extension = "x".repeat(8 * 1024 * 1024);
    const candidate = {
      ...current.profiles.captain,
      description: "y".repeat(8 * 1024 * 1024),
    };
    expect(() =>
      validatePlannedProfileRoot("captain", candidate, current, options),
    ).toThrow();
  });

  it("bounds the aggregate root even when individual profiles fit", () => {
    const current = root();
    current.profiles.other = {
      ...profile(),
      extension: "x".repeat(8 * 1024 * 1024),
    };
    const candidate = { ...profile(), extension: "y".repeat(8 * 1024 * 1024) };
    expect(() =>
      validatePlannedProfileRoot("captain", candidate, current, options),
    ).toThrow();
  });

  it("reserves metadata capacity rather than admitting an exact-limit root", () => {
    const current = { ...root(), extension: "" };
    const size = JSON.stringify(current).length;
    current.extension = "x".repeat(MAX_PROJECT_JSON_BYTES - size - 20);
    expect(JSON.stringify(current).length).toBeLessThan(MAX_PROJECT_JSON_BYTES);
    expect(() => validatePlannedProjectRoot(current, options)).toThrow();
    current.extension = current.extension.slice(0, -1024);
    expect(() => validatePlannedProjectRoot(current, options)).not.toThrow();
  });

  it("counts UTF-8 bytes and expanded shared DAG occurrences", () => {
    const current = root();
    current.extension = "é".repeat(8 * 1024 * 1024);
    expect(() => validatePlannedProjectRoot(current, options)).toThrow();
    let shared = { text: "x".repeat(1024) };
    for (let index = 0; index < 15; index += 1)
      shared = { a: shared, b: shared };
    current.extension = shared;
    expect(() => validatePlannedProjectRoot(current, options)).toThrow();
  });

  it("checks depth in the full root and rejects unreadable root schemas", () => {
    let extension = {};
    for (let index = 0; index < 99; index += 1)
      extension = { child: extension };
    expect(() =>
      validatePlannedProfileRoot(
        "captain",
        { ...profile(), extension },
        root(),
        options,
      ),
    ).toThrow();
    for (const current of [
      {},
      { ...root(), profiles: [] },
      { ...root(), currentProfile: 7 },
    ]) {
      expect(() => validatePlannedProjectRoot(current, options)).toThrow();
    }
  });
});
