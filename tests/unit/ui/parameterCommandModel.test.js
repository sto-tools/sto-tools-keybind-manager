import { describe, expect, it } from "vitest";

import { STOError } from "../../../src/js/core/errors.js";
import {
  captureParameterAddTarget,
  isParameterAddTargetCurrent,
  isParameterDef,
  parseParameterBoolean,
  parseParameterNumber,
  projectParameterBuildPreview,
  projectParameterMutation,
} from "../../../src/js/components/ui/parameterCommandModel.js";
import { createDataCoordinatorState } from "../../fixtures/core/componentState.js";

function createProfile() {
  return {
    id: "captain",
    name: "Captain",
    currentEnvironment: "space",
    builds: {
      space: { keys: { F1: [] } },
      ground: { keys: { G1: [] } },
    },
    aliases: { Alpha: { commands: [] } },
    bindsets: {
      Weapons: {
        space: { keys: { F1: [] } },
        ground: { keys: {} },
      },
    },
  };
}

function createSnapshot(overrides = {}) {
  const profile = overrides.profile ?? createProfile();
  return createDataCoordinatorState({
    authorityEpoch: overrides.authorityEpoch ?? 7,
    revision: overrides.revision ?? 12,
    ready: overrides.ready ?? true,
    currentProfile: overrides.currentProfile ?? "captain",
    currentEnvironment: overrides.currentEnvironment ?? "space",
    currentProfileData: profile,
    profiles: overrides.profiles ?? { captain: profile },
  });
}

function createContext(overrides = {}) {
  return {
    snapshot: createSnapshot(),
    currentEnvironment: "space",
    selectedKey: "F1",
    selectedAlias: null,
    activeBindset: "Weapons",
    bindsetsEnabled: false,
    ...overrides,
  };
}

function requireTarget(context = createContext()) {
  const target = captureParameterAddTarget(context);
  expect(target).not.toBeNull();
  if (!target) throw new Error("Expected a parameter add target");
  return target;
}

describe("parameterCommandModel definitions and parsing", () => {
  it("recognizes only named parameter command definitions", () => {
    expect(isParameterDef({ name: "Target", parameters: {} })).toBe(true);
    expect(isParameterDef({ name: "", parameters: { tray: {} } })).toBe(true);

    for (const value of [
      null,
      [],
      "Target",
      {},
      { name: 1, parameters: {} },
      { name: "Target", parameters: [] },
    ]) {
      expect(isParameterDef(value)).toBe(false);
    }
  });

  it("preserves numeric conversion and empty-value semantics", () => {
    expect(parseParameterNumber("", "tray")).toBeUndefined();
    expect(parseParameterNumber(null, "tray")).toBeUndefined();
    expect(parseParameterNumber(undefined, "tray")).toBeUndefined();
    expect(parseParameterNumber("0", "tray")).toBe(0);
    expect(parseParameterNumber("-5.5", "tray")).toBe(-5.5);
    expect(parseParameterNumber("1e3", "tray")).toBe(1000);

    expect(() => parseParameterNumber("1.2.3", "tray")).toThrowError(
      expect.objectContaining({
        name: "STOError",
        code: "INVALID_PARAMETER_NUMBER",
        message: "Invalid number for tray: '1.2.3' is not a valid number",
        parameterName: "tray",
        parameterValue: "1.2.3",
      }),
    );
  });

  it("normalizes numeric booleans and reports their distinct error contract", () => {
    expect(parseParameterBoolean("", "active")).toBeUndefined();
    expect(parseParameterBoolean("0", "active")).toBe(0);
    expect(parseParameterBoolean("2", "active")).toBe(1);
    expect(parseParameterBoolean("-1", "active")).toBe(1);
    expect(parseParameterBoolean("0.5", "active")).toBe(1);

    try {
      parseParameterBoolean("truthy", "active");
      throw new Error("Expected boolean parsing to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(STOError);
      expect(error).toMatchObject({
        code: "INVALID_PARAMETER_BOOLEAN",
        message: "Invalid boolean for active: 'truthy' is not a valid number",
        parameterName: "active",
        parameterValue: "truthy",
      });
    }
  });
});

describe("parameterCommandModel build projections", () => {
  it("projects strings, rich commands, and filtered command batches", () => {
    const rich = { command: "+TrayExecByTray 1 2", icon: "tray" };
    expect(projectParameterBuildPreview("CamReset")).toEqual({
      valid: true,
      text: "CamReset",
    });
    expect(projectParameterBuildPreview(rich)).toEqual({
      valid: true,
      text: "+TrayExecByTray 1 2",
    });
    expect(
      projectParameterBuildPreview([
        "First",
        null,
        { command: "Second" },
        { command: 3 },
      ]),
    ).toEqual({ valid: true, text: "First $$ Second" });
    expect(projectParameterBuildPreview([])).toEqual({
      valid: true,
      text: "",
    });
  });

  it("distinguishes absent and malformed non-array build results", () => {
    for (const value of [null, undefined, "", 0, false]) {
      expect(projectParameterBuildPreview(value)).toBeNull();
    }
    for (const value of [{ command: 3 }, {}, 42, true]) {
      expect(projectParameterBuildPreview(value)).toEqual({
        valid: false,
        text: "",
      });
    }
  });

  it("accepts one edit command or one filtered add batch", () => {
    const rich = { command: "Second", parameters: { slot: 2 } };
    expect(projectParameterMutation("First", { editing: false })).toBe("First");
    expect(projectParameterMutation(rich, { editing: true })).toBe(rich);

    const source = ["First", null, rich, { command: 4 }];
    expect(projectParameterMutation(source, { editing: false })).toEqual([
      "First",
      rich,
    ]);
    expect(projectParameterMutation(source, { editing: true })).toBeNull();
    expect(projectParameterMutation([], { editing: false })).toBeNull();
    expect(projectParameterMutation({}, { editing: false })).toBeNull();
    expect(projectParameterMutation(null, { editing: false })).toBeNull();
  });
});

describe("parameterCommandModel exact add targets", () => {
  it("captures a frozen primary target from coherent accepted state", () => {
    const target = requireTarget();

    expect(target).toEqual({
      authorityEpoch: 7,
      revision: 12,
      profileId: "captain",
      environment: "space",
      name: "F1",
      selectedKey: "F1",
      selectedAlias: null,
      bindset: null,
    });
    expect(Object.isFrozen(target)).toBe(true);
  });

  it("captures exact named-bindset and alias locations", () => {
    expect(
      requireTarget(createContext({ bindsetsEnabled: true })),
    ).toMatchObject({ name: "F1", bindset: "Weapons" });
    expect(
      requireTarget(
        createContext({
          snapshot: createSnapshot({ currentEnvironment: "alias" }),
          currentEnvironment: "alias",
          selectedKey: null,
          selectedAlias: "Alpha",
          bindsetsEnabled: true,
        }),
      ),
    ).toEqual({
      authorityEpoch: 7,
      revision: 12,
      profileId: "captain",
      environment: "alias",
      name: "Alpha",
      selectedKey: null,
      selectedAlias: "Alpha",
      bindset: null,
    });
  });

  it.each([
    ["absent snapshot", { snapshot: null }],
    ["pre-ready snapshot", { snapshot: createSnapshot({ ready: false }) }],
    ["invalid authority", { snapshot: createSnapshot({ authorityEpoch: 0 }) }],
    ["invalid revision", { snapshot: createSnapshot({ revision: -1 }) }],
    ["missing profile", { snapshot: createSnapshot({ profiles: {} }) }],
    ["environment mismatch", { currentEnvironment: "ground" }],
    ["missing key", { selectedKey: null }],
    ["simultaneous selections", { selectedAlias: "Alpha" }],
  ])("rejects %s", (_label, overrides) => {
    expect(captureParameterAddTarget(createContext(overrides))).toBeNull();
  });

  it("requires the exact accepted owner, revision, profile, environment, selection, and effective bindset", () => {
    const target = requireTarget(createContext({ bindsetsEnabled: true }));
    expect(
      isParameterAddTargetCurrent(
        target,
        createContext({ bindsetsEnabled: true }),
      ),
    ).toBe(true);

    const otherProfile = createProfile();
    otherProfile.id = "admiral";
    const staleContexts = [
      createContext({ snapshot: null, bindsetsEnabled: true }),
      createContext({
        snapshot: createSnapshot({ ready: false }),
        bindsetsEnabled: true,
      }),
      createContext({
        snapshot: createSnapshot({ authorityEpoch: 8 }),
        bindsetsEnabled: true,
      }),
      createContext({
        snapshot: createSnapshot({ revision: 13 }),
        bindsetsEnabled: true,
      }),
      createContext({
        snapshot: createSnapshot({
          currentProfile: "admiral",
          profile: otherProfile,
          profiles: { admiral: otherProfile },
        }),
        bindsetsEnabled: true,
      }),
      createContext({
        snapshot: createSnapshot({ currentEnvironment: "ground" }),
        currentEnvironment: "ground",
        selectedKey: "G1",
        bindsetsEnabled: true,
      }),
      createContext({ selectedKey: "F2", bindsetsEnabled: true }),
      createContext({
        activeBindset: "Primary Bindset",
        bindsetsEnabled: true,
      }),
      createContext({ bindsetsEnabled: false }),
    ];
    for (const context of staleContexts) {
      expect(isParameterAddTargetCurrent(target, context)).toBe(false);
    }
  });

  it("compares the effective bindset rather than an inert cached bindset", () => {
    const target = requireTarget();
    expect(
      isParameterAddTargetCurrent(
        target,
        createContext({ activeBindset: "Other", bindsetsEnabled: false }),
      ),
    ).toBe(true);
  });

  it("keeps alias targets independent of bindset cache but exact to alias selection", () => {
    const aliasContext = createContext({
      snapshot: createSnapshot({ currentEnvironment: "alias" }),
      currentEnvironment: "alias",
      selectedKey: null,
      selectedAlias: "Alpha",
      bindsetsEnabled: true,
    });
    const target = requireTarget(aliasContext);

    expect(
      isParameterAddTargetCurrent(target, {
        ...aliasContext,
        activeBindset: "Other",
        bindsetsEnabled: false,
      }),
    ).toBe(true);
    expect(
      isParameterAddTargetCurrent(target, {
        ...aliasContext,
        selectedAlias: "Beta",
      }),
    ).toBe(false);
    expect(
      isParameterAddTargetCurrent(target, {
        ...aliasContext,
        selectedKey: "F1",
      }),
    ).toBe(false);
  });
});
