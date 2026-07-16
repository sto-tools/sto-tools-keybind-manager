import { describe, expect, it } from "vitest";

import {
  createDataStateSnapshot,
  createVirtualProfile,
  getBindsetKeyCommands,
  getPrimaryKeyCommands,
  getPrimaryKeys,
  getSnapshotBindsetKeyCommands,
  getSnapshotPrimaryKeyCommands,
  getSnapshotPrimaryKeys,
  getSnapshotProfile,
  getSnapshotProfiles,
  immutableDataStateSnapshot,
} from "../../../src/js/components/services/dataState.js";

function expectRecursivelyFrozen(value, seen = new WeakSet()) {
  if (value === null || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  expect(Object.isFrozen(value)).toBe(true);
  for (const key of Reflect.ownKeys(value)) {
    expectRecursivelyFrozen(Reflect.get(value, key), seen);
  }
}

function createProfile() {
  return {
    name: "Captain",
    currentEnvironment: "space",
    builds: {
      space: {
        keys: {
          F1: ["FireAll", { command: "Target_Enemy_Near", parameters: {} }],
        },
      },
      ground: { keys: { G: ["Target_Enemy_Near"] } },
    },
    bindsets: {
      Weapons: {
        space: {
          keys: {
            F1: ["FirePhasers"],
            F2: ["FireTorps"],
          },
        },
      },
    },
    aliases: { engage: { commands: ["FireAll"] } },
    keybindMetadata: { space: { F1: { stabilizeExecutionOrder: true } } },
    aliasMetadata: {},
  };
}

function createCoordinatorState() {
  return {
    currentProfile: "captain",
    currentEnvironment: "space",
    profiles: {
      captain: createProfile(),
      engineer: {
        name: "Engineer",
        builds: { space: { keys: {} }, ground: { keys: {} } },
      },
    },
    settings: { theme: "dark", extension: { enabled: true } },
    metadata: {
      lastModified: "2026-07-16T00:00:00.000Z",
      version: "1.0.0",
    },
  };
}

describe("data-state projections", () => {
  it("creates a complete detached immutable state snapshot and active projection", () => {
    const state = createCoordinatorState();
    const original = structuredClone(state);

    const snapshot = createDataStateSnapshot(state, {
      authorityEpoch: 7,
      ready: true,
      revision: 7,
    });

    expect(snapshot).toMatchObject({
      authorityEpoch: 7,
      ready: true,
      revision: 7,
      currentProfile: "captain",
      currentEnvironment: "space",
      currentProfileData: {
        id: "captain",
        environment: "space",
        keys: { F1: expect.any(Array) },
      },
    });
    expect(snapshot.profiles).toEqual(state.profiles);
    expect(snapshot.profiles).not.toBe(state.profiles);
    expect(snapshot.currentProfileData).not.toBe(snapshot.profiles.captain);
    expectRecursivelyFrozen(snapshot);

    expect(() => {
      snapshot.profiles.captain.name = "Mutated snapshot";
    }).toThrow(TypeError);
    expect(() => {
      snapshot.settings.extension.enabled = false;
    }).toThrow(TypeError);
    expect(() => {
      snapshot.currentProfileData.keys.F1.push("FireTorps");
    }).toThrow(TypeError);

    expect(state).toEqual(original);
  });

  it("reuses trusted snapshots and isolates unfrozen compatibility inputs", () => {
    const trusted = createDataStateSnapshot(createCoordinatorState(), {
      authorityEpoch: 1,
      ready: true,
      revision: 1,
    });
    const compatibilityInput = structuredClone(trusted);

    expect(immutableDataStateSnapshot(trusted)).toBe(trusted);

    const adopted = immutableDataStateSnapshot(compatibilityInput);
    expect(adopted).toEqual(compatibilityInput);
    expect(adopted).not.toBe(compatibilityInput);
    expectRecursivelyFrozen(adopted);

    compatibilityInput.profiles.captain.name = "Producer mutation";
    expect(adopted.profiles.captain.name).toBe("Captain");
  });

  it("represents loading, empty, and stale current-profile state explicitly", () => {
    const state = createCoordinatorState();
    state.currentProfile = null;

    const loading = createDataStateSnapshot(state, {
      authorityEpoch: 1,
      ready: false,
      revision: 0,
    });
    expect(loading).toMatchObject({
      ready: false,
      revision: 0,
      currentProfile: null,
      currentProfileData: null,
    });

    state.currentProfile = "missing";
    const stale = createDataStateSnapshot(state, {
      authorityEpoch: 1,
      ready: true,
      revision: 1,
    });
    expect(stale.currentProfile).toBe("missing");
    expect(stale.currentProfileData).toBeNull();
  });

  it("creates virtual build scaffolding without mutating a sparse profile", () => {
    const profile = {
      name: "Sparse",
      aliases: { test: { commands: ["say hello"] } },
    };
    const original = structuredClone(profile);

    const projected = createVirtualProfile("sparse", profile, "ground");

    expect(projected).toMatchObject({
      id: "sparse",
      environment: "ground",
      builds: {
        space: { keys: {} },
        ground: { keys: {} },
      },
      keys: {},
      aliases: profile.aliases,
      keybindMetadata: {},
      aliasMetadata: {},
    });
    expect(profile).toEqual(original);

    projected.aliases.test.commands.push("FireAll");
    expect(profile.aliases.test.commands).toEqual(["say hello"]);
  });

  it("adds only the requested missing build to an existing build map", () => {
    const profile = {
      builds: { space: { keys: { F1: ["FireAll"] } } },
    };

    const projected = createVirtualProfile("captain", profile, "ground");

    expect(projected.builds).toEqual({
      space: { keys: { F1: ["FireAll"] } },
      ground: { keys: {} },
    });
    expect(profile.builds).not.toHaveProperty("ground");
  });

  it("rejects inherited profile and environment keys without prototype mutation", () => {
    const profile = { builds: {} };

    const projected = createVirtualProfile("captain", profile, "__proto__");

    expect(projected.keys).toEqual({});
    expect(Object.prototype).not.toHaveProperty("keys");
    expect(
      Object.prototype.hasOwnProperty.call(projected.builds, "__proto__"),
    ).toBe(false);

    const state = createCoordinatorState();
    state.currentProfile = "__proto__";
    const snapshot = createDataStateSnapshot(state, {
      authorityEpoch: 1,
      ready: true,
      revision: 1,
    });
    expect(snapshot.currentProfileData).toBeNull();
    expect(getSnapshotProfile(snapshot, "__proto__")).toBeNull();
    expect(getPrimaryKeys(profile, "__proto__")).toEqual({});
    expect(
      getBindsetKeyCommands(createProfile(), "__proto__", "space", "F1"),
    ).toEqual([]);
  });

  it("reads current or explicit canonical profiles as detached values", () => {
    const snapshot = createDataStateSnapshot(createCoordinatorState(), {
      authorityEpoch: 1,
      ready: true,
      revision: 1,
    });

    const current = getSnapshotProfile(snapshot);
    const engineer = getSnapshotProfile(snapshot, "engineer");

    expect(current?.name).toBe("Captain");
    expect(engineer?.name).toBe("Engineer");
    expect(getSnapshotProfile(snapshot, "missing")).toBeNull();
    expect(getSnapshotProfile(snapshot, null)).toBeNull();

    current.name = "Changed locally";
    expect(snapshot.profiles.captain.name).toBe("Captain");
  });

  it("projects only ready profile state and returns detached maps", () => {
    const state = createCoordinatorState();
    const loading = createDataStateSnapshot(state, {
      authorityEpoch: 1,
      ready: false,
      revision: 0,
    });
    const ready = createDataStateSnapshot(state, {
      authorityEpoch: 1,
      ready: true,
      revision: 1,
    });

    expect(getSnapshotProfiles(null)).toEqual({});
    expect(getSnapshotProfiles(loading)).toEqual({});
    expect(getSnapshotProfile(loading)).toBeNull();

    const profiles = getSnapshotProfiles(ready);
    expect(profiles).toEqual(ready.profiles);
    expect(profiles).not.toBe(ready.profiles);
    profiles.captain.name = "Local change";
    expect(ready.profiles.captain.name).toBe("Captain");
  });

  it("projects detached primary keys without applying a named bindset", () => {
    const profile = createProfile();

    const keys = getPrimaryKeys(profile, "space");

    expect(keys).toEqual(profile.builds.space.keys);
    expect(keys).not.toBe(profile.builds.space.keys);
    expect(keys).not.toHaveProperty("F2");
    keys.F1[1].command = "Changed locally";
    expect(profile.builds.space.keys.F1[1].command).toBe("Target_Enemy_Near");
    expect(getPrimaryKeys(profile, "missing")).toEqual({});
    expect(getPrimaryKeys(null, "space")).toEqual({});
  });

  it("returns detached primary command arrays and rejects legacy scalars", () => {
    const profile = createProfile();

    const commands = getPrimaryKeyCommands(profile, "space", "F1");

    expect(commands).toEqual(profile.builds.space.keys.F1);
    commands[1].command = "Changed locally";
    expect(profile.builds.space.keys.F1[1].command).toBe("Target_Enemy_Near");
    expect(getPrimaryKeyCommands(profile, "space", "missing")).toEqual([]);

    profile.builds.space.keys.Legacy = "FireAll";
    expect(getPrimaryKeyCommands(profile, "space", "Legacy")).toEqual([]);
  });

  it("projects explicit bindset commands without a primary overlay", () => {
    const profile = createProfile();

    expect(
      getBindsetKeyCommands(profile, "Primary Bindset", "space", "F1"),
    ).toEqual(profile.builds.space.keys.F1);
    expect(getBindsetKeyCommands(profile, "Weapons", "space", "F1")).toEqual([
      "FirePhasers",
    ]);
    expect(getBindsetKeyCommands(profile, "Weapons", "space", "F2")).toEqual([
      "FireTorps",
    ]);
    expect(getBindsetKeyCommands(profile, "Missing", "space", "F1")).toEqual(
      [],
    );

    const commands = getBindsetKeyCommands(profile, "Weapons", "space", "F1");
    commands.push("Changed locally");
    expect(profile.bindsets.Weapons.space.keys.F1).toEqual(["FirePhasers"]);
  });

  it("projects detached primary and named-bindset data from accepted snapshots", () => {
    const state = createCoordinatorState();
    state.profiles.captain.builds.space.keys.Legacy = "FireAll";
    const snapshot = createDataStateSnapshot(state, {
      authorityEpoch: 4,
      ready: true,
      revision: 9,
    });

    const keys = getSnapshotPrimaryKeys(snapshot, "space");
    const primary = getSnapshotPrimaryKeyCommands(snapshot, "space", "F1");
    const named = getSnapshotBindsetKeyCommands(
      snapshot,
      "Weapons",
      "space",
      "F1",
    );

    expect(keys).toEqual(snapshot.profiles.captain.builds.space.keys);
    expect(primary).toEqual(snapshot.profiles.captain.builds.space.keys.F1);
    expect(named).toEqual(["FirePhasers"]);
    expect(
      getSnapshotBindsetKeyCommands(snapshot, "Weapons", undefined, "F1"),
    ).toEqual(["FirePhasers"]);
    expect(getSnapshotPrimaryKeyCommands(snapshot, "space", "Legacy")).toEqual(
      [],
    );
    expect(
      getSnapshotBindsetKeyCommands(snapshot, "Missing", "space", "F1"),
    ).toEqual([]);
    expect(getSnapshotPrimaryKeys(null, "space")).toEqual({});
    expect(getSnapshotPrimaryKeyCommands(null, "space", "F1")).toEqual([]);
    expect(
      getSnapshotBindsetKeyCommands(null, "Weapons", "space", "F1"),
    ).toEqual([]);

    primary[1].command = "Local change";
    named.push("Local change");
    expect(snapshot.profiles.captain.builds.space.keys.F1[1].command).toBe(
      "Target_Enemy_Near",
    );
    expect(snapshot.profiles.captain.bindsets.Weapons.space.keys.F1).toEqual([
      "FirePhasers",
    ]);
  });
});
