import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import defaultProfiles, {
  getDefaultProfiles,
} from "../../src/js/data/defaultProfiles.js";
import "../../src/js/data.js";

describe("default profile catalog", () => {
  it("pins the complete ordered built-in profile contract", () => {
    const fingerprint = createHash("sha256")
      .update(JSON.stringify(defaultProfiles))
      .digest("hex");

    expect(Object.keys(defaultProfiles)).toEqual(["default"]);
    expect(defaultProfiles.default.id).toBe("default_space");
    expect(fingerprint).toBe(
      "5108461a2b21812af97ecefe3cf85a2b9a4172171a4da6d74ad2370f8cbec502",
    );
    expect(window.STO_DATA.defaultProfiles).toBe(defaultProfiles);
  });

  it("preserves the shallow validation contract without mutating its source", () => {
    const validProfile = {
      name: "Validated",
      description: "Valid default",
      currentEnvironment: "ground",
      builds: { ground: { keys: {} } },
    };
    const nameOnlyProfile = { name: "Name only" };
    const source = {
      valid: validProfile,
      nameOnly: nameOnlyProfile,
      array: [],
      missingName: { builds: {} },
      blankName: { name: "   " },
      invalidDescription: { name: "Bad description", description: 42 },
      invalidEnvironment: { name: "Bad environment", currentEnvironment: 42 },
      invalidBuilds: { name: "Bad builds", builds: [] },
      primitive: "not a profile",
      absent: null,
    };
    const sourceSnapshot = structuredClone(source);

    const selected = getDefaultProfiles(source);

    expect(Object.keys(selected)).toEqual(["valid", "nameOnly"]);
    expect(selected.valid).toBe(validProfile);
    expect(selected.nameOnly).toBe(nameOnlyProfile);
    expect(source).toEqual(sourceSnapshot);
  });

  it("returns a fresh ordered wrapper and handles an absent source", () => {
    const first = getDefaultProfiles();
    const second = getDefaultProfiles();

    expect(first).not.toBe(second);
    expect(first.default).toBe(defaultProfiles.default);
    expect(second.default).toBe(defaultProfiles.default);
    expect(getDefaultProfiles(null)).toEqual({});
    expect(getDefaultProfiles(undefined)).toEqual({});
  });
});
