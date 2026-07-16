import { describe, expect, it } from "vitest";

import {
  hasCommandChainSelection,
  isRichChainCommand,
  normalizeCommandList,
  projectCommandChainViewState,
} from "../../../src/js/components/services/commandChainViewState.js";
import { createDataStateSnapshot } from "../../../src/js/components/services/dataState.js";

// These projection rows preserve the bindset-validity requirements from the
// retired CommandService.bindset-aware-key-validation suite at their new pure
// accepted-state boundary.

function createState() {
  return {
    currentProfile: "captain",
    currentEnvironment: "space",
    profiles: {
      captain: {
        builds: {
          space: {
            keys: {
              EmptyPrimary: [],
              PrimaryOnly: ["PrimaryCommand"],
              Both: ["PrimaryCommand"],
              Rich: [
                "StringCommand",
                {
                  command: "RichCommand",
                  parameters: { target: "enemy" },
                },
              ],
              Malformed: [
                "ValidString",
                { command: "ValidRecord", placement: "before-pre-pivot" },
                null,
                17,
                {},
                { command: 17 },
                ["nested-array"],
              ],
              constructor: [],
            },
          },
          ground: { keys: {} },
        },
        bindsets: {
          Weapons: {
            space: {
              keys: {
                NamedOnly: ["NamedCommand"],
                Both: ["NamedOverride"],
              },
            },
          },
        },
        aliases: {
          engage: { commands: ["AliasCommand"] },
          quiet: { commands: [] },
        },
        keybindMetadata: {
          space: { EmptyPrimary: { stabilizeExecutionOrder: true } },
        },
        bindsetMetadata: {
          Weapons: {
            space: { NamedOnly: { stabilizeExecutionOrder: true } },
          },
        },
        aliasMetadata: {
          engage: { stabilizeExecutionOrder: true },
        },
      },
    },
    settings: {},
    metadata: { lastModified: null, version: "1.0.0" },
  };
}

function createSnapshot({ ready = true } = {}) {
  return createDataStateSnapshot(createState(), {
    authorityEpoch: 1,
    ready,
    revision: ready ? 1 : 0,
  });
}

function project(snapshot, overrides = {}) {
  return projectCommandChainViewState({
    snapshot,
    environment: "space",
    selectedName: null,
    activeBindset: "Primary Bindset",
    bindsetsEnabled: false,
    ...overrides,
  });
}

describe("command-chain view-state projection", () => {
  it("distinguishes unavailable accepted state from an available state with no selection", () => {
    expect(project(null)).toEqual({
      status: "unavailable",
      environment: "space",
      selectedName: null,
      bindset: null,
      commands: [],
      commandCount: 0,
      stabilized: false,
    });
    expect(project(createSnapshot({ ready: false })).status).toBe(
      "unavailable",
    );
    expect(project(createSnapshot()).status).toBe("no-selection");
  });

  it("projects an existing empty primary key and its stabilization metadata", () => {
    const state = project(createSnapshot(), { selectedName: "EmptyPrimary" });

    expect(state).toMatchObject({
      status: "empty",
      selectedName: "EmptyPrimary",
      bindset: null,
      commands: [],
      commandCount: 0,
      stabilized: true,
    });
  });

  it("admits and projects a named-only key while that active bindset is enabled", () => {
    const snapshot = createSnapshot();
    const state = project(snapshot, {
      selectedName: "NamedOnly",
      activeBindset: "Weapons",
      bindsetsEnabled: true,
    });

    expect(
      hasCommandChainSelection(snapshot, "space", "NamedOnly", "Weapons", true),
    ).toBe(true);
    expect(state).toMatchObject({
      status: "populated",
      bindset: "Weapons",
      commands: ["NamedCommand"],
      commandCount: 1,
      stabilized: true,
    });
  });

  it("keeps a primary-only key valid while a named bindset is active", () => {
    const state = project(createSnapshot(), {
      selectedName: "PrimaryOnly",
      activeBindset: "Weapons",
      bindsetsEnabled: true,
    });

    expect(state).toMatchObject({
      status: "empty",
      bindset: "Weapons",
      commands: [],
      commandCount: 0,
    });
  });

  it("treats a cached named-only selection as stale when bindsets are disabled", () => {
    const state = project(createSnapshot(), {
      selectedName: "NamedOnly",
      activeBindset: "Weapons",
      bindsetsEnabled: false,
    });

    expect(state).toMatchObject({
      status: "stale-selection",
      bindset: null,
      commands: [],
      stabilized: false,
    });
  });

  it("marks a selection missing from primary and the enabled active bindset as stale", () => {
    const state = project(createSnapshot(), {
      selectedName: "Missing",
      activeBindset: "Weapons",
      bindsetsEnabled: true,
    });

    expect(state.status).toBe("stale-selection");
  });

  it("projects aliases independently of active bindset state", () => {
    const snapshot = createSnapshot();
    const populated = project(snapshot, {
      environment: "alias",
      selectedName: "engage",
      activeBindset: "Weapons",
      bindsetsEnabled: true,
    });
    const empty = project(snapshot, {
      environment: "alias",
      selectedName: "quiet",
      activeBindset: "Weapons",
      bindsetsEnabled: true,
    });

    expect(populated).toMatchObject({
      status: "populated",
      bindset: null,
      commands: ["AliasCommand"],
      stabilized: true,
    });
    expect(empty).toMatchObject({
      status: "empty",
      bindset: null,
      commands: [],
      stabilized: false,
    });
  });

  it("uses own properties for prototype-like selection names", () => {
    const snapshot = createSnapshot();

    expect(project(snapshot, { selectedName: "toString" }).status).toBe(
      "stale-selection",
    );
    expect(project(snapshot, { selectedName: "constructor" }).status).toBe(
      "empty",
    );
    expect(
      project(snapshot, {
        environment: "alias",
        selectedName: "toString",
      }).status,
    ).toBe("stale-selection");
  });

  it("returns detached command records from the accepted snapshot", () => {
    const snapshot = createSnapshot();
    const state = project(snapshot, { selectedName: "Rich" });

    expect(state.status).toBe("populated");
    expect(state.commands).toEqual([
      "StringCommand",
      { command: "RichCommand", parameters: { target: "enemy" } },
    ]);

    state.commands[1].command = "LocalMutation";
    state.commands[1].parameters.target = "friend";

    expect(snapshot.profiles.captain.builds.space.keys.Rich[1].command).toBe(
      "RichCommand",
    );
    expect(
      snapshot.profiles.captain.builds.space.keys.Rich[1].parameters.target,
    ).toBe("enemy");
  });

  it("filters malformed persisted commands without losing valid entries", () => {
    const state = project(createSnapshot(), { selectedName: "Malformed" });

    expect(state).toMatchObject({
      status: "populated",
      commands: [
        "ValidString",
        { command: "ValidRecord", placement: "before-pre-pivot" },
      ],
      commandCount: 2,
    });
  });
});

describe("command-list normalization", () => {
  it("recognizes only records with an own string command field", () => {
    const inherited = Object.create({ command: "InheritedCommand" });

    expect(isRichChainCommand({ command: "OwnedCommand" })).toBe(true);
    expect(isRichChainCommand(inherited)).toBe(false);
    expect(isRichChainCommand({ command: 1 })).toBe(false);
    expect(isRichChainCommand(["Command"])).toBe(false);
  });

  it("returns a detached normalized list for compatibility callers", () => {
    const rich = { command: "OwnedCommand", metadata: { order: 1 } };
    const normalized = normalizeCommandList(["StringCommand", rich, null]);

    expect(normalized).toEqual(["StringCommand", rich]);
    expect(normalized[1]).not.toBe(rich);
    normalized[1].metadata.order = 2;
    expect(rich.metadata.order).toBe(1);
    expect(normalizeCommandList({ commands: [] })).toEqual([]);
  });
});
