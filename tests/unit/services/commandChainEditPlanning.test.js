import { describe, expect, it, vi } from "vitest";

import {
  captureCommandEditTarget,
  isCommandEditTargetCurrent,
  planCommandEdit,
} from "../../../src/js/components/services/commandChainEditPlanning.js";
import { createDataCoordinatorState } from "../../fixtures/core/componentState.js";

function createProfile(commands = ['Target "Alpha"', "CamReset"]) {
  return {
    id: "captain",
    name: "Captain",
    currentEnvironment: "space",
    builds: {
      space: { keys: { F1: commands, F2: ["SecondTarget"] } },
      ground: { keys: { G1: ["GroundTarget"] } },
    },
    aliases: {
      Alpha: { commands: ["AliasTarget"] },
    },
    bindsets: {
      Weapons: {
        space: { keys: { F1: ["NamedTarget"] } },
        ground: { keys: {} },
      },
    },
  };
}

function createSnapshot({
  authorityEpoch = 10,
  revision = 1,
  profile = createProfile(),
  currentEnvironment = "space",
} = {}) {
  return createDataCoordinatorState({
    authorityEpoch,
    revision,
    currentProfile: "captain",
    currentEnvironment,
    currentProfileData: profile,
    profiles: { captain: profile },
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
  const target = captureCommandEditTarget(context);
  expect(target).not.toBeNull();
  if (!target) throw new Error("Expected a command edit target");
  return target;
}

const translatedValues = {
  edit_custom_command: "Translated custom edit",
  enter_any_sto_command: "Translated raw placeholder",
  command_label_colon: "Translated raw label:",
};
const translate = (key, defaultValue) => translatedValues[key] || defaultValue;

describe("command-chain edit target", () => {
  it("captures an immutable detached primary target from accepted state", () => {
    const profile = createProfile([
      { command: 'Target "Alpha"', parameters: { name: "Alpha" } },
    ]);
    const snapshot = createSnapshot({ profile });
    const target = requireTarget(createContext({ snapshot }));

    expect(target).toEqual({
      authorityEpoch: 10,
      revision: 1,
      profileId: "captain",
      environment: "space",
      name: "F1",
      bindset: null,
      index: 0,
      originalEntry: {
        command: 'Target "Alpha"',
        parameters: { name: "Alpha" },
      },
    });
    expect(Object.isFrozen(target)).toBe(true);
    expect(Object.isFrozen(target.originalEntry)).toBe(true);
    expect(Object.isFrozen(target.originalEntry.parameters)).toBe(true);
    expect(target.originalEntry).not.toBe(
      snapshot.profiles.captain.builds.space.keys.F1[0],
    );
  });

  it.each([
    ["pre-ready state", { snapshot: createSnapshot({ revision: 0 }) }],
    ["environment mismatch", { currentEnvironment: "ground" }],
    ["missing selection", { selectedKey: null }],
    ["negative index", { index: -1 }],
    ["fractional index", { index: 0.5 }],
    ["missing command", { index: 99 }],
  ])("rejects %s", (_label, overrides) => {
    if (_label === "pre-ready state") overrides.snapshot.ready = false;
    expect(captureCommandEditTarget(createContext(overrides))).toBeNull();
  });

  it("captures aliases and named bindsets at their exact canonical paths", () => {
    expect(
      requireTarget(
        createContext({
          snapshot: createSnapshot({ currentEnvironment: "alias" }),
          currentEnvironment: "alias",
          selectedKey: null,
          selectedAlias: "Alpha",
          activeBindset: "Weapons",
          bindsetsEnabled: true,
        }),
      ),
    ).toMatchObject({
      environment: "alias",
      name: "Alpha",
      bindset: null,
      originalEntry: "AliasTarget",
    });

    expect(
      requireTarget(
        createContext({ activeBindset: "Weapons", bindsetsEnabled: true }),
      ),
    ).toMatchObject({ bindset: "Weapons", originalEntry: "NamedTarget" });
  });

  it("canonicalizes an enabled Primary Bindset target to the primary path", () => {
    const context = createContext({ bindsetsEnabled: true });
    const target = requireTarget(context);

    expect(target).toMatchObject({
      environment: "space",
      name: "F1",
      bindset: null,
      originalEntry: 'Target "Alpha"',
    });
    const current = { ...context };
    delete current.index;
    expect(isCommandEditTargetCurrent(target, current)).toBe(true);
  });

  it("requires the exact accepted revision and rejects stale targets", () => {
    const target = requireTarget();
    const unchangedSuccessor = createSnapshot({ revision: 2 });
    const current = {
      ...createContext({ snapshot: unchangedSuccessor }),
    };
    delete current.index;
    expect(isCommandEditTargetCurrent(target, current)).toBe(false);

    const exact = { ...current, snapshot: createSnapshot() };
    expect(isCommandEditTargetCurrent(target, exact)).toBe(true);

    const changedProfile = createProfile(["Replacement"]);
    const cases = [
      { ...current, snapshot: createSnapshot({ authorityEpoch: 11 }) },
      { ...exact, snapshot: createSnapshot({ revision: 0 }) },
      { ...exact, selectedKey: "F2" },
      { ...exact, activeBindset: "Weapons", bindsetsEnabled: true },
      {
        ...exact,
        snapshot: createSnapshot({ revision: 1, profile: changedProfile }),
      },
    ];
    for (const context of cases) {
      expect(isCommandEditTargetCurrent(target, context)).toBe(false);
    }
  });
});

describe("command-chain edit planning", () => {
  it("derives parameters, preserves parser call parity, and detaches a customizable definition", async () => {
    const target = requireTarget();
    const parseCommandString = vi
      .fn()
      .mockResolvedValueOnce({
        commands: [{ category: "targeting", parameters: { name: "Alpha" } }],
      })
      .mockResolvedValueOnce({ commands: [{ category: "targeting" }] });
    const definition = {
      name: "Target",
      customizable: true,
      categoryId: "targeting",
      commandId: "target_by_name",
      parameters: { name: { type: "text" } },
    };

    const plan = await planCommandEdit({
      target,
      parseCommandString,
      resolveDefinition: vi.fn(() => definition),
      translate,
    });

    expect(parseCommandString.mock.calls).toEqual([
      ['Target "Alpha"'],
      ['Target "Alpha"'],
    ]);
    expect(plan).toMatchObject({
      kind: "edit",
      payload: {
        target,
        index: 0,
        command: {
          command: 'Target "Alpha"',
          parameters: { name: "Alpha" },
        },
        commandDef: definition,
        categoryId: "targeting",
        commandId: "target_by_name",
      },
      parameterDerivationError: null,
    });
    if (plan.kind !== "edit") throw new Error("Expected edit plan");
    expect(plan.payload.target).toBe(target);
    expect(plan.payload.commandDef).not.toBe(definition);
    expect(plan.payload.commandDef.parameters).not.toBe(definition.parameters);
  });

  it("lets a customizable catalog definition win over custom classification", async () => {
    const target = requireTarget(
      createContext({
        snapshot: createSnapshot({
          profile: createProfile([
            {
              command: "CatalogCommand",
              type: "custom",
              parameters: { value: "kept" },
            },
          ]),
        }),
      }),
    );
    const parseCommandString = vi.fn();

    const plan = await planCommandEdit({
      target,
      parseCommandString,
      resolveDefinition: () => ({
        name: "Catalog editor",
        customizable: true,
        categoryId: "system",
        commandId: "catalog_command",
      }),
      translate,
    });

    expect(parseCommandString).not.toHaveBeenCalled();
    expect(plan).toMatchObject({
      kind: "edit",
      payload: {
        categoryId: "system",
        commandId: "catalog_command",
      },
    });
  });

  it.each([
    ["explicit type", { command: "RawOne", type: "custom", parameters: {} }],
    [
      "explicit category",
      { command: "RawTwo", category: "custom", parameters: {} },
    ],
  ])("builds an internationalized raw editor for %s", async (_label, entry) => {
    const target = requireTarget(
      createContext({
        snapshot: createSnapshot({ profile: createProfile([entry]) }),
      }),
    );
    const parseCommandString = vi.fn();

    const plan = await planCommandEdit({
      target,
      parseCommandString,
      resolveDefinition: () => null,
      translate,
    });

    expect(parseCommandString).not.toHaveBeenCalled();
    expect(plan).toMatchObject({
      kind: "edit",
      payload: {
        target,
        commandDef: {
          name: "Translated custom edit",
          categoryId: "custom",
          commandId: "add_custom_command",
          parameters: {
            rawCommand: {
              default: entry.command,
              placeholder: "Translated raw placeholder",
              label: "Translated raw label:",
            },
          },
        },
        categoryId: "custom",
        commandId: "add_custom_command",
      },
    });
    if (plan.kind !== "edit") throw new Error("Expected edit plan");
    expect(plan.payload.target).toBe(target);
  });

  it("falls back to raw editing when parsing fails", async () => {
    const parseError = new Error("parser unavailable");
    const plan = await planCommandEdit({
      target: requireTarget(),
      parseCommandString: vi.fn().mockRejectedValue(parseError),
      resolveDefinition: () => null,
      translate,
    });

    expect(plan).toMatchObject({
      kind: "edit",
      payload: { categoryId: "custom", commandId: "add_custom_command" },
      parameterDerivationError: parseError,
    });
  });

  it("returns an informational disposition for a known non-customizable command", async () => {
    const parseCommandString = vi
      .fn()
      .mockResolvedValue({ commands: [{ category: "camera" }] });
    const plan = await planCommandEdit({
      target: requireTarget(
        createContext({
          snapshot: createSnapshot({ profile: createProfile(["CamReset"]) }),
        }),
      ),
      parseCommandString,
      resolveDefinition: () => ({
        name: "Reset Camera",
        customizable: false,
        categoryId: "camera",
        commandId: "camera_reset",
      }),
      translate,
    });

    expect(parseCommandString).toHaveBeenCalledTimes(2);
    expect(plan).toEqual({
      kind: "inform",
      message: "CamReset",
      parameterDerivationError: null,
    });
  });
});
