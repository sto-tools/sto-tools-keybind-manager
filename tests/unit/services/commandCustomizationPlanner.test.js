import { describe, expect, it } from "vitest";

import {
  captureCommandCustomizationTarget,
  isCommandCustomizationTargetCurrent,
  planCommandCustomization,
} from "../../../src/js/components/services/commandCustomizationPlanner.js";
import { applyProfileOperations } from "../../../src/js/components/services/profileOperations.js";
import { createDataCoordinatorState } from "../../fixtures/core/componentState.js";

function sourceCommands() {
  return [
    "+TrayExecByTray 1 0",
    {
      command: "+TrayExecByTray 1 1",
      palindromicGeneration: false,
      placement: "before-pre-pivot",
      extension: { nested: { preserved: true } },
    },
    "Target_Enemy_Near",
  ];
}

function createProfile(commands = sourceCommands()) {
  return {
    id: "captain",
    name: "Captain",
    currentEnvironment: "space",
    builds: {
      space: {
        keys: {
          F1: structuredClone(commands),
          F2: ["SecondTarget"],
        },
      },
      ground: { keys: { G1: ["GroundTarget"] } },
    },
    aliases: {
      Alpha: {
        commands: structuredClone(commands),
        description: "Preserve description",
        metadata: { nested: true },
      },
    },
    bindsets: {
      Weapons: {
        space: { keys: { F1: structuredClone(commands) } },
        ground: { keys: {} },
      },
    },
  };
}

function createSnapshot({
  authorityEpoch = 10,
  revision = 1,
  environment = "space",
  profile = createProfile(),
} = {}) {
  return createDataCoordinatorState({
    authorityEpoch,
    revision,
    currentProfile: profile.id,
    currentEnvironment: environment,
    currentProfileData: profile,
    profiles: { [profile.id]: profile },
  });
}

function createContext(overrides = {}) {
  return {
    snapshot: createSnapshot(),
    currentEnvironment: "space",
    selectedKey: "F1",
    selectedAlias: null,
    activeBindset: "Primary Bindset",
    bindsetsEnabled: false,
    index: 0,
    ...overrides,
  };
}

function requireTarget(context = createContext()) {
  const target = captureCommandCustomizationTarget(context);
  expect(target).not.toBeNull();
  if (!target) throw new Error("Expected command customization target");
  return target;
}

function requirePlan(target, action = { type: "toggle-palindromic" }) {
  const plan = planCommandCustomization({ target, action });
  if (!plan.valid) throw new Error(`Expected valid plan: ${plan.reason}`);
  return plan;
}

function currentContext(context) {
  const current = { ...context };
  delete current.index;
  return current;
}

describe("command customization target", () => {
  it("captures a deeply immutable detached primary target", () => {
    const profile = createProfile();
    const snapshot = createSnapshot({ profile });
    const target = requireTarget(createContext({ snapshot }));

    expect(target).toEqual({
      authorityEpoch: 10,
      revision: 1,
      profileId: "captain",
      kind: "primary",
      environment: "space",
      name: "F1",
      bindset: null,
      index: 0,
      originalEntry: "+TrayExecByTray 1 0",
      commands: sourceCommands(),
    });
    expect(Object.isFrozen(target)).toBe(true);
    expect(Object.isFrozen(target.commands)).toBe(true);
    expect(Object.isFrozen(target.commands[1])).toBe(true);
    expect(Object.isFrozen(target.commands[1].extension)).toBe(true);
    expect(target.commands).not.toBe(
      snapshot.profiles.captain.builds.space.keys.F1,
    );

    profile.builds.space.keys.F1[1].extension.nested.preserved = false;
    expect(target.commands[1].extension.nested.preserved).toBe(true);
  });

  it.each([
    {
      label: "alias",
      context: {
        snapshot: createSnapshot({ environment: "alias" }),
        currentEnvironment: "alias",
        selectedKey: null,
        selectedAlias: "Alpha",
        activeBindset: "Weapons",
        bindsetsEnabled: true,
      },
      expected: {
        kind: "alias",
        environment: "alias",
        name: "Alpha",
        bindset: null,
      },
    },
    {
      label: "named bindset",
      context: { activeBindset: "Weapons", bindsetsEnabled: true },
      expected: {
        kind: "bindset",
        environment: "space",
        name: "F1",
        bindset: "Weapons",
      },
    },
    {
      label: "disabled bindset",
      context: { activeBindset: "Weapons", bindsetsEnabled: false },
      expected: {
        kind: "primary",
        environment: "space",
        name: "F1",
        bindset: null,
      },
    },
  ])("captures the canonical $label path", ({ context, expected }) => {
    expect(requireTarget(createContext(context))).toMatchObject(expected);
  });

  it.each([
    ["pre-ready state", { snapshot: createSnapshot() }],
    ["environment mismatch", { currentEnvironment: "ground" }],
    ["missing selection", { selectedKey: null }],
    ["negative index", { index: -1 }],
    ["fractional index", { index: 0.5 }],
    ["NaN index", { index: Number.NaN }],
    ["string index", { index: "0" }],
    ["unsafe index", { index: Number.MAX_SAFE_INTEGER + 1 }],
    ["missing command", { index: 99 }],
  ])("rejects %s", (label, overrides) => {
    if (label === "pre-ready state") overrides.snapshot.ready = false;
    expect(captureCommandCustomizationTarget(createContext(overrides))).toBe(
      null,
    );
  });

  it.each([
    [
      "profile",
      {
        snapshot: {
          ...createSnapshot(),
          currentProfile: "constructor",
        },
      },
    ],
    ["selection", { selectedKey: "__proto__" }],
    [
      "environment",
      {
        snapshot: {
          ...createSnapshot(),
          currentEnvironment: "prototype",
        },
        currentEnvironment: "prototype",
      },
    ],
    ["bindset", { activeBindset: "constructor", bindsetsEnabled: true }],
  ])("rejects an unsafe %s identifier", (_label, overrides) => {
    expect(captureCommandCustomizationTarget(createContext(overrides))).toBe(
      null,
    );
  });

  it("rejects malformed, dangerous, and uncloneable command data", () => {
    const uncloneable = createProfile(["Placeholder"]);
    uncloneable.builds.space.keys.F1 = [{ command: "Bad", callback: () => {} }];
    const cases = [
      createProfile([{}]),
      createProfile([
        JSON.parse('{"command":"Bad","metadata":{"constructor":1}}'),
      ]),
      uncloneable,
    ];
    for (const profile of cases) {
      expect(
        captureCommandCustomizationTarget(
          createContext({ snapshot: createSnapshot({ profile }) }),
        ),
      ).toBeNull();
    }
  });

  it("requires the exact accepted authority, revision, selection, and path", () => {
    const context = createContext();
    const target = requireTarget(context);
    expect(
      isCommandCustomizationTargetCurrent(target, currentContext(context)),
    ).toBe(true);

    const replacement = createProfile(["Replacement"]);
    const staleContexts = [
      createContext({ snapshot: createSnapshot({ authorityEpoch: 11 }) }),
      createContext({ snapshot: createSnapshot({ revision: 2 }) }),
      createContext({ selectedKey: "F2" }),
      createContext({ activeBindset: "Weapons", bindsetsEnabled: true }),
      createContext({
        snapshot: createSnapshot({ revision: 1, profile: replacement }),
      }),
      createContext({
        snapshot: createSnapshot({ environment: "ground" }),
        currentEnvironment: "ground",
      }),
    ];
    for (const stale of staleContexts) {
      expect(
        isCommandCustomizationTargetCurrent(target, currentContext(stale)),
      ).toBe(false);
    }
  });
});

describe("command customization planning", () => {
  it.each([
    {
      label: "primary key",
      context: {},
      target: { kind: "primary", bindset: null },
      modify: {
        builds: {
          space: {
            keys: {
              F1: [
                {
                  command: "+TrayExecByTray 1 0",
                  palindromicGeneration: false,
                },
                sourceCommands()[1],
                "Target_Enemy_Near",
              ],
            },
          },
        },
      },
    },
    {
      label: "alias",
      context: {
        snapshot: createSnapshot({ environment: "alias" }),
        currentEnvironment: "alias",
        selectedKey: null,
        selectedAlias: "Alpha",
        activeBindset: "Weapons",
        bindsetsEnabled: true,
      },
      target: { kind: "alias", bindset: null },
      modify: {
        aliases: {
          Alpha: {
            commands: [
              {
                command: "+TrayExecByTray 1 0",
                palindromicGeneration: false,
              },
              sourceCommands()[1],
              "Target_Enemy_Near",
            ],
          },
        },
      },
    },
    {
      label: "named bindset key",
      context: { activeBindset: "Weapons", bindsetsEnabled: true },
      target: { kind: "bindset", bindset: "Weapons" },
      modify: {
        bindsets: {
          Weapons: {
            space: {
              keys: {
                F1: [
                  {
                    command: "+TrayExecByTray 1 0",
                    palindromicGeneration: false,
                  },
                  sourceCommands()[1],
                  "Target_Enemy_Near",
                ],
              },
            },
          },
        },
      },
    },
  ])("builds the exact $label owner request", (scenario) => {
    const target = requireTarget(createContext(scenario.context));
    const plan = requirePlan(target);

    expect(plan.target).toMatchObject(scenario.target);
    expect(plan.updateProfileRequest).toEqual({
      profileId: "captain",
      modify: scenario.modify,
    });
  });

  it("routes a disabled cached named bindset through the exact primary request", () => {
    const primary = requirePlan(requireTarget());
    const disabled = requirePlan(
      requireTarget(
        createContext({ activeBindset: "Weapons", bindsetsEnabled: false }),
      ),
    );

    expect(disabled.target).toMatchObject({ kind: "primary", bindset: null });
    expect(disabled.updateProfileRequest).toEqual(primary.updateProfileRequest);
  });

  it.each([
    [
      "string inclusion",
      "+TrayExecByTray 1 0",
      "toggle-palindromic",
      { setting: "palindromicGeneration", value: false },
      { command: "+TrayExecByTray 1 0", palindromicGeneration: false },
    ],
    [
      "excluded inclusion",
      { command: "Rich", palindromicGeneration: false },
      "toggle-palindromic",
      { setting: "palindromicGeneration", value: true },
      { command: "Rich", palindromicGeneration: true },
    ],
    [
      "default placement",
      { command: "Rich", placement: "before-pre-pivot" },
      "toggle-placement",
      { setting: "placement", value: "in-pivot-group" },
      { command: "Rich", placement: "in-pivot-group" },
    ],
    [
      "pivot placement",
      { command: "Rich", placement: "in-pivot-group" },
      "toggle-placement",
      { setting: "placement", value: "before-pre-pivot" },
      { command: "Rich", placement: "before-pre-pivot" },
    ],
  ])("projects the %s action", (_label, command, type, expected, updated) => {
    const profile = createProfile([command]);
    const target = requireTarget(
      createContext({ snapshot: createSnapshot({ profile }) }),
    );
    const plan = requirePlan(target, { type });

    expect(plan.customization).toEqual(expected);
    expect(plan.nextCommands).toEqual([updated]);
  });

  it("preserves rich metadata and detaches target, plan, and request graphs", () => {
    const profile = createProfile();
    const snapshot = createSnapshot({ profile });
    const target = requireTarget(createContext({ snapshot, index: 1 }));
    const plan = requirePlan(target, { type: "toggle-placement" });

    expect(plan.nextCommands[1]).toEqual({
      ...sourceCommands()[1],
      placement: "in-pivot-group",
    });
    expect(plan.nextCommands[1]).not.toBe(target.commands[1]);
    expect(plan.updateProfileRequest.modify.builds.space.keys.F1[1]).not.toBe(
      plan.nextCommands[1],
    );

    profile.builds.space.keys.F1[1].extension.nested.preserved = false;
    plan.nextCommands[1].extension.nested.preserved = "changed plan";
    expect(target.commands[1].extension.nested.preserved).toBe(true);
    expect(
      plan.updateProfileRequest.modify.builds.space.keys.F1[1].extension.nested
        .preserved,
    ).toBe(true);
  });

  it("preserves alias definition metadata through the canonical owner operation", () => {
    const profile = createProfile();
    const context = createContext({
      snapshot: createSnapshot({ environment: "alias", profile }),
      currentEnvironment: "alias",
      selectedKey: null,
      selectedAlias: "Alpha",
    });
    const plan = requirePlan(requireTarget(context));

    const updated = applyProfileOperations(profile, plan.updateProfileRequest);
    expect(updated.aliases.Alpha).toEqual({
      commands: plan.nextCommands,
      description: "Preserve description",
      metadata: { nested: true },
    });
  });

  it.each([
    ["non-object options", null, "invalid_options"],
    [
      "missing target",
      { target: null, action: { type: "toggle-placement" } },
      "invalid_target",
    ],
    ["fractional target index", { index: 0.5 }, "invalid_target"],
    ["mismatched target kind", { kind: "alias" }, "invalid_target"],
    [
      "malformed target command",
      { commands: [{}], originalEntry: {} },
      "invalid_target",
    ],
  ])("rejects %s", (_label, input, reason) => {
    const options =
      input === null
        ? null
        : Object.hasOwn(input, "target")
          ? input
          : {
              target: { ...requireTarget(), ...input },
              action: { type: "toggle-palindromic" },
            };
    expect(planCommandCustomization(options)).toEqual({
      valid: false,
      reason,
      nextCommands: null,
      updateProfileRequest: null,
    });
  });

  it.each([
    null,
    "toggle-placement",
    {},
    { type: "unknown" },
    { type: "toggle-placement", value: "in-pivot-group" },
  ])("rejects invalid or over-specified actions %#", (action) => {
    expect(
      planCommandCustomization({ target: requireTarget(), action }),
    ).toMatchObject({ valid: false, reason: "invalid_action" });
  });

  it("rejects unsafe identifiers and dangerous command metadata", () => {
    const target = requireTarget();
    expect(
      planCommandCustomization({
        target: { ...target, profileId: "constructor" },
        action: { type: "toggle-palindromic" },
      }),
    ).toMatchObject({ valid: false, reason: "unsafe_identifier" });

    const dangerous = JSON.parse(
      '{"command":"Bad","metadata":{"constructor":1}}',
    );
    expect(
      planCommandCustomization({
        target: {
          ...target,
          originalEntry: dangerous,
          commands: [dangerous],
          index: 0,
        },
        action: { type: "toggle-palindromic" },
      }),
    ).toMatchObject({ valid: false, reason: "invalid_payload" });
  });
});
