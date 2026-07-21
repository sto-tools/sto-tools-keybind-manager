import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ExportService from "../../src/js/components/services/ExportService.js";
import { createCommittedTreeFileSystem } from "../fixtures/index.js";

const golden = JSON.parse(
  readFileSync(
    join(process.cwd(), "tests/fixtures/sync/sync-directory-tree-golden.json"),
    "utf8",
  ),
);

const SETTINGS = {
  theme: "dark",
  language: "en",
  autoSync: false,
};

/** @param {string[]} names @param {string} prefix */
function createKeys(names, prefix) {
  return Object.fromEntries(names.map((name) => [name, [`${prefix}-${name}`]]));
}

/**
 * @param {string} id
 * @param {string} name
 * @param {{ space?: string[], ground?: string[], aliases?: string[] }} [options]
 */
function createProfile(
  id,
  name,
  { space = [], ground = [], aliases = [] } = {},
) {
  return {
    id,
    name,
    currentEnvironment: "space",
    builds: {
      space: { keys: createKeys(space, `${id}-space`) },
      ground: { keys: createKeys(ground, `${id}-ground`) },
    },
    aliases: Object.fromEntries(
      aliases.map((alias) => [alias, { commands: [`${id}-${alias}`] }]),
    ),
  };
}

function createInitialState() {
  return {
    version: "1.0.0",
    currentProfile: "fleet",
    profiles: {
      fleet: createProfile("fleet", "Fleet Main", {
        space: ["F1"],
        ground: ["G1"],
        aliases: ["FleetAlias"],
      }),
      "collision-first": createProfile("collision-first", "Collision/A", {
        space: ["C1"],
        aliases: ["FirstAlias"],
      }),
      "collision-last": createProfile("collision-last", "Collision?A", {
        space: ["C2"],
        aliases: ["LastAlias"],
      }),
      rename: createProfile("rename", "Rename Me", {
        ground: ["R1"],
        aliases: ["RenameAlias"],
      }),
      deleted: createProfile("deleted", "Delete Me", {
        space: ["D1"],
        aliases: ["DeleteAlias"],
      }),
      environment: createProfile("environment", "Environment Pilot", {
        space: ["E1"],
        ground: ["E2"],
        aliases: ["EnvironmentAlias"],
      }),
    },
    settings: { embeddedSetting: "retained-in-root-only" },
  };
}

/** @param {ReturnType<typeof createInitialState>} initial */
function createSuccessorState(initial) {
  const successor = structuredClone(initial);
  successor.profiles.fleet.builds.space.keys = createKeys(
    ["F2"],
    "fleet-successor-space",
  );
  successor.profiles.rename.name = "Renamed Pilot";
  delete successor.profiles.deleted;
  successor.profiles.environment.builds.ground.keys = {};
  return successor;
}

/** @param {ReturnType<typeof createInitialState>} initial */
function createHarness(initial) {
  let state = structuredClone(initial);
  const fileSystem = createCommittedTreeFileSystem();
  const storage = {
    getAllData: vi.fn(() => structuredClone(state)),
    getSettings: vi.fn(() => structuredClone(SETTINGS)),
  };
  const exporter = new ExportService({
    storage,
    i18n: { t: (key) => key },
  });

  vi.spyOn(exporter, "generateSTOKeybindFile").mockImplementation(
    async (profile, { environment = "space" } = {}) => {
      const keys = profile.builds?.[environment]?.keys || {};
      return JSON.stringify({ profile: profile.id, environment, keys });
    },
  );
  vi.spyOn(exporter, "generateAliasFile").mockImplementation(async (profile) =>
    JSON.stringify({
      profile: profile.id,
      aliases: Object.keys(profile.aliases || {}),
    }),
  );

  return {
    exporter,
    fileSystem,
    setState(next) {
      state = structuredClone(next);
    },
    sync() {
      return exporter.syncToFolder(fileSystem.root);
    },
  };
}

/** @param {ReturnType<typeof createCommittedTreeFileSystem>} fileSystem */
function committedPaths(fileSystem) {
  return fileSystem.getCommits().map(({ path }) => path);
}

describe("sync directory tree characterization", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-07-21T01:02:03.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("pins the full initial tree, source-order collisions, and repeatable fixed-state output", async () => {
    const harness = createHarness(createInitialState());

    await harness.sync();

    // This is the current object-source traversal, not a canonical sort order.
    expect(committedPaths(harness.fileSystem)).toEqual(
      golden.initial.commitOrder,
    );
    expect(harness.fileSystem.getPaths()).toEqual(golden.initial.tree);
    expect(committedPaths(harness.fileSystem).at(-1)).toBe("project.json");

    const collisionSpaceCommits = harness.fileSystem
      .getCommits()
      .filter(({ path }) => path === golden.collision.spacePath)
      .map(({ contents }) => JSON.parse(contents).profile);
    const collisionAliasCommits = harness.fileSystem
      .getCommits()
      .filter(({ path }) => path === golden.collision.aliasPath)
      .map(({ contents }) => JSON.parse(contents).profile);
    expect(collisionSpaceCommits).toEqual(golden.collision.sourceOrder);
    expect(collisionAliasCommits).toEqual(golden.collision.sourceOrder);
    expect(
      JSON.parse(await harness.fileSystem.readText(golden.collision.spacePath))
        .profile,
    ).toBe(golden.collision.winner);
    expect(
      JSON.parse(await harness.fileSystem.readText(golden.collision.aliasPath))
        .profile,
    ).toBe(golden.collision.winner);

    const firstSnapshot = harness.fileSystem.snapshot();
    harness.fileSystem.clearHistory();

    await harness.sync();

    expect(committedPaths(harness.fileSystem)).toEqual(
      golden.initial.commitOrder,
    );
    expect(harness.fileSystem.snapshot()).toEqual(firstSnapshot);
  });

  it("retains stale files after a successor deletes, renames, and empties profiles", async () => {
    const initial = createInitialState();
    const successor = createSuccessorState(initial);
    const harness = createHarness(initial);
    await harness.sync();
    const initialSnapshot = harness.fileSystem.snapshot();
    harness.fileSystem.clearHistory();
    harness.setState(successor);

    await harness.sync();

    expect(committedPaths(harness.fileSystem)).toEqual(
      golden.successor.commitOrder,
    );
    expect(committedPaths(harness.fileSystem).at(-1)).toBe("project.json");
    expect(harness.fileSystem.getPaths()).toEqual(golden.successor.tree);
    for (const stalePath of golden.successor.stalePaths) {
      expect(await harness.fileSystem.readText(stalePath)).toBe(
        initialSnapshot[stalePath],
      );
    }

    const project = JSON.parse(
      await harness.fileSystem.readText("project.json"),
    );
    expect(project.data.profiles).not.toHaveProperty("deleted");
    expect(project.data.profiles.rename.name).toBe("Renamed Pilot");
    expect(project.data.profiles.environment.builds.ground.keys).toEqual({});
  });

  it("leaves only closed projections visible when a mid-projection close fails", async () => {
    const initial = createInitialState();
    const harness = createHarness(initial);
    await harness.sync();
    const priorSnapshot = harness.fileSystem.snapshot();
    const priorProject = priorSnapshot["project.json"];
    const failure = new Error("projection close failed");
    const failedPath = golden.midProjectionFailure.path;
    harness.fileSystem.clearHistory();
    harness.setState(createSuccessorState(initial));
    harness.fileSystem.failNext("close", failedPath, failure);

    await expect(harness.sync()).rejects.toBe(failure);

    expect(committedPaths(harness.fileSystem)).toEqual(
      golden.midProjectionFailure.committedBeforeFailure,
    );
    expect(await harness.fileSystem.readText("project.json")).toBe(
      priorProject,
    );
    expect(await harness.fileSystem.readText(failedPath)).toBe(
      priorSnapshot[failedPath],
    );
    expect(
      await harness.fileSystem.readText(
        golden.midProjectionFailure.committedBeforeFailure[0],
      ),
    ).not.toBe(
      priorSnapshot[golden.midProjectionFailure.committedBeforeFailure[0]],
    );
    expect(harness.fileSystem.getEffects()).toContainEqual({
      phase: "abort",
      path: failedPath,
      reason: failure,
    });
  });

  it("retains the prior root when the final project close fails", async () => {
    const initial = createInitialState();
    const harness = createHarness(initial);
    await harness.sync();
    const priorProject = await harness.fileSystem.readText("project.json");
    const successor = createSuccessorState(initial);
    harness.fileSystem.clearHistory();
    harness.setState(successor);
    const failure = new Error("project close failed");
    harness.fileSystem.failNext(
      "close",
      golden.finalProjectFailure.path,
      failure,
    );

    await expect(harness.sync()).rejects.toBe(failure);

    expect(committedPaths(harness.fileSystem)).toEqual(
      golden.successor.commitOrder.slice(0, -1),
    );
    expect(harness.fileSystem.getPaths()).toEqual(golden.successor.tree);
    expect(await harness.fileSystem.readText("project.json")).toBe(
      priorProject,
    );
    expect(
      JSON.parse(
        await harness.fileSystem.readText("Fleet_Main/Fleet_Main_space.txt"),
      ).keys,
    ).toHaveProperty("F2");
  });
});
