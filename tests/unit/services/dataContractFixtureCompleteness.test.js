import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  decodeLegacyStoredApplicationJson,
  decodeStoredApplicationJson,
} from "../../../src/js/components/services/storedApplicationDataBoundary.js";
import { decodeProjectSettings } from "../../../src/js/components/services/settingsDataBoundary.js";

const fixtureDirectory = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../fixtures/storage",
);

function readFixture(fileName) {
  return JSON.parse(readFileSync(join(fixtureDirectory, fileName), "utf8"));
}

function fixtureText(fileName) {
  return readFileSync(join(fixtureDirectory, fileName), "utf8");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

const rootFields = [
  "version",
  "created",
  "lastModified",
  "lastBackup",
  "currentProfile",
  "profiles",
  "globalAliases",
];

const profileFields = [
  "id",
  "name",
  "description",
  "currentEnvironment",
  "environment",
  "builds",
  "aliases",
  "bindsets",
  "keybindMetadata",
  "aliasMetadata",
  "bindsetMetadata",
  "keys",
  "keybinds",
  "selections",
  "created",
  "lastModified",
  "migrationVersion",
  "vertigoSettings",
];

const richCommandFields = [
  "command",
  "text",
  "id",
  "type",
  "category",
  "categoryId",
  "commandId",
  "name",
  "description",
  "icon",
  "environment",
  "warning",
  "customizable",
  "custom",
  "palindromicGeneration",
  "placement",
  "parameters",
];

const aliasFields = [
  "description",
  "commands",
  "type",
  "name",
  "isGenerated",
  "isLoader",
  "category",
  "metadata",
];

const settingsFields = [
  "theme",
  "autoSave",
  "showTooltips",
  "confirmDeletes",
  "maxUndoSteps",
  "defaultMode",
  "compactView",
  "language",
  "syncFolderName",
  "syncFolderPath",
  "autoSync",
  "autoSyncInterval",
  "bindToAliasMode",
  "bindsetsEnabled",
  "translateGeneratedMessages",
  "syncFolderFallback",
  "currentProfile",
  "version",
  "firstRun",
];

function expectOwnFields(value, fields) {
  for (const field of fields) expect(value).toHaveProperty(field);
}

describe("complete persisted-data contract fixture", () => {
  it("preserves the executable Tranche 0 source, bundle, coverage, and call-ledger record", () => {
    const baseline = readFixture("tranche-0-baseline.json");

    expect(baseline).toMatchObject({
      schemaVersion: 1,
      startingSourceSha: "8bc8655219e47dce1bcdf7f4738e26f49838a5db",
      productionBundle: {
        path: "src/dist/bundle.js",
        sha256:
          "57bcaa28bb5152143122beb438200ad613982bac23d4fd6a618601bdd828f68b",
      },
      coverage: {
        acceptedSnapshot: {
          statements: 85.53,
          branches: 76.88,
          functions: 84.21,
          lines: 87.49,
        },
        floor: {
          statements: 85.39,
          branches: 76.76,
          functions: 84.06,
          lines: 87.33,
        },
      },
      ledgerCounts: {
        directScalarStorageCalls: 34,
        indexedDbBoundaryBlocks: 8,
        storageServiceNamedMethodCalls: 49,
        storageServiceExternalCalls: 33,
        storageWritesNamedMethodCalls: 6,
        storageServiceInternalDelegations: 10,
        storageWritesImplementationCallsIncludingHelperDelegation: 7,
        activeRepositoryAdapters: 0,
        routineStateQueryRpcTopics: 0,
      },
      testDisposition: {
        retired: [
          {
            path: "tests/integration/profile-management.test.js",
            tranche: 4,
            removedRequirement:
              "The fixture-only StorageService save/load facade and fake profile:switch/query RPC contracts are not production protocols; query RPC state access is prohibited.",
            equivalentCoverage: [
              "tests/unit/storage/LocalStorageProjectRepository.test.js",
              "tests/unit/services/dataCoordinatorRepositoryCutover.test.js",
              "tests/integration/project-repository-owner-chain.test.js",
            ],
          },
        ],
        rule: "A frozen baseline test may retire only with its removed requirement and named equivalent coverage.",
      },
    });
  });

  it("reproduces the exact four persisted rollback strings", () => {
    const baseline = readFixture("tranche-0-baseline.json");
    const root = JSON.stringify(readFixture("complete-current-root.json"));
    const settings = JSON.stringify(
      readFixture("complete-current-settings.json"),
    );
    const backup = JSON.stringify({
      data: root,
      timestamp: baseline.persistedStrings.previousRootBackup.timestamp,
      version: baseline.persistedStrings.previousRootBackup.version,
    });
    const sentinel = baseline.persistedStrings.resetSentinel.value;

    const materialized = {
      projectRoot: {
        key: "sto_keybind_manager",
        bytes: Buffer.byteLength(root),
        sha256: sha256(root),
      },
      previousRootBackup: {
        key: "sto_keybind_manager_backup",
        bytes: Buffer.byteLength(backup),
        sha256: sha256(backup),
      },
      settings: {
        key: "sto_keybind_settings",
        bytes: Buffer.byteLength(settings),
        sha256: sha256(settings),
      },
      resetSentinel: {
        key: "sto_app_reset",
        value: sentinel,
        bytes: Buffer.byteLength(sentinel),
        sha256: sha256(sentinel),
      },
    };

    expect(materialized).toEqual(
      Object.fromEntries(
        Object.entries(baseline.persistedStrings).map(([name, value]) => [
          name,
          Object.fromEntries(
            Object.entries(value).filter(([field]) =>
              ["key", "value", "bytes", "sha256"].includes(field),
            ),
          ),
        ]),
      ),
    );
  });

  it("freezes every accepted, legacy, recovery, and rejected storage fixture", () => {
    const baseline = readFixture("tranche-0-baseline.json");
    const evidenceFiles = new Set([
      "tranche-0-active-tests.txt",
      "tranche-0-baseline.json",
    ]);
    const registeredFixtureNames = Object.keys(baseline.fixtureFingerprints);
    const currentFixtureNames = readdirSync(fixtureDirectory)
      .filter((fileName) => !evidenceFiles.has(fileName))
      .sort();
    const actualFingerprints = Object.fromEntries(
      registeredFixtureNames.map((fileName) => [
        fileName,
        sha256(fixtureText(fileName)),
      ]),
    );

    expect(currentFixtureNames).toEqual([...registeredFixtureNames].sort());
    expect(actualFingerprints).toEqual(baseline.fixtureFingerprints);
    expect(
      Object.fromEntries(
        Object.keys(baseline.artifactFixtureFingerprints).map((fileName) => [
          fileName,
          sha256(fixtureText(fileName)),
        ]),
      ),
    ).toEqual(baseline.artifactFixtureFingerprints);
  });

  it("preserves every active baseline test until it receives a disposition", () => {
    const baseline = readFixture("tranche-0-baseline.json");
    const pathList = fixtureText(baseline.activeTests.pathList);
    const testPaths = pathList.trimEnd().split("\n");
    const retiredPaths = new Set(
      baseline.testDisposition.retired.map(({ path }) => path),
    );
    const categories = {
      unit: testPaths.filter((path) => path.startsWith("tests/unit/")).length,
      integration: testPaths.filter((path) =>
        path.startsWith("tests/integration/"),
      ).length,
      browser: testPaths.filter((path) => path.startsWith("tests/browser/"))
        .length,
      types: testPaths.filter((path) => path.startsWith("tests/types/")).length,
      total: testPaths.length,
    };

    expect(sha256(pathList)).toBe(baseline.activeTests.sha256);
    expect(categories).toEqual(baseline.activeTests.counts);
    expect(
      testPaths.filter(
        (path) =>
          !retiredPaths.has(path) && !existsSync(join(process.cwd(), path)),
      ),
    ).toEqual([]);
    expect([...retiredPaths].every((path) => testPaths.includes(path))).toBe(
      true,
    );
    for (const disposition of baseline.testDisposition.retired) {
      expect(existsSync(join(process.cwd(), disposition.path))).toBe(false);
      expect(disposition.removedRequirement).not.toBe("");
      expect(disposition.equivalentCoverage.length).toBeGreaterThan(0);
      expect(
        disposition.equivalentCoverage.every((path) =>
          existsSync(join(process.cwd(), path)),
        ),
      ).toBe(true);
    }
  });

  it("materializes every known legacy root, profile, command, alias, and embedded settings field", () => {
    const root = readFixture("complete-current-root.json");
    const profile = root.profiles["complete-profile"];
    const command = profile.builds.space.keys.F1[1];
    const alias = profile.aliases.CompleteAlias;

    // This immutable fixture remains a rollback checkpoint, not a canonical
    // owner-port root. Task 9 retires only ongoing embedded-field persistence.
    expectOwnFields(root, [...rootFields, "settings"]);
    expectOwnFields(profile, profileFields);
    expectOwnFields(command, richCommandFields);
    expectOwnFields(alias, aliasFields);
    expectOwnFields(root.settings, settingsFields);
  });

  it("migrates the immutable legacy fixture and round-trips detached canonical extensions", () => {
    const root = readFixture("complete-current-root.json");
    const canonical = structuredClone(root);
    delete canonical.settings;
    const decoded = decodeLegacyStoredApplicationJson(JSON.stringify(root), {
      defaults: canonical,
      version: root.version,
    });

    expect(decoded).toMatchObject({
      success: true,
      changed: true,
      migrated: true,
      value: canonical,
    });
    if (!decoded.success) throw new Error("expected a decoded root");
    expectOwnFields(decoded.value, rootFields);
    expect(decoded.value).not.toHaveProperty("settings");
    expect(
      decodeStoredApplicationJson(JSON.stringify(root), {
        defaults: canonical,
        version: root.version,
      }),
    ).toEqual({ success: false, error: "invalid_data", path: "$.settings" });
    expect(
      decodeStoredApplicationJson(JSON.stringify(decoded.value), {
        defaults: canonical,
        version: root.version,
      }),
    ).toEqual({
      success: true,
      changed: false,
      migrated: false,
      value: canonical,
    });

    const profile = decoded.value.profiles["complete-profile"];
    expect(decoded.value.rootExtension).toEqual({ retained: true });
    expect(profile.profileExtension).toEqual({
      panels: ["commands", "aliases"],
    });
    expect(profile.builds.space.environmentExtension).toEqual({
      layout: "space",
    });
    expect(profile.builds.space.keys.F1[1].commandExtension).toEqual({
      source: "complete-fixture",
    });
    expect(profile.aliases.CompleteAlias.aliasExtension).toEqual(["retained"]);
    root.rootExtension.retained = false;
    root.profiles["complete-profile"].profileExtension.panels.length = 0;
    expect(decoded.value.rootExtension).toEqual({ retained: true });
    expect(profile.profileExtension).toEqual({
      panels: ["commands", "aliases"],
    });
  });

  it("round-trips and detaches standalone settings extensions independently of legacy roots", () => {
    // The retired embedded-settings extension assertion maps to this standalone
    // boundary row, the portable envelope row below, and
    // storageSchemaMigration.activation.test.js's exact-backup/crash matrix.
    const settings = readFixture("complete-current-settings.json");
    const decoded = decodeProjectSettings(settings);
    expectOwnFields(decoded, settingsFields);
    expect(decoded).toEqual(settings);
    expect(decoded).not.toBe(settings);
    expect(decoded["plugin:layout"]).toEqual({ density: "compact" });
    settings["plugin:layout"].density = "changed";
    expect(decoded["plugin:layout"]).toEqual({ density: "compact" });
  });

  it("covers the complete imported project envelope and rich-command shape", () => {
    const project = readFixture("../sync/sync-project-golden.json");
    const profile = project.data.profiles["canonical-profile"];
    const command = profile.builds.space.keys.F1[1];

    expectOwnFields(project, ["version", "exported", "type", "data"]);
    expectOwnFields(project.data, ["profiles", "settings", "currentProfile"]);
    expectOwnFields(
      profile,
      profileFields.filter((field) => field !== "keys" && field !== "keybinds"),
    );
    expect(profile).not.toHaveProperty("keys");
    expect(profile).not.toHaveProperty("keybinds");
    expect(profile.builds.space.keys).toHaveProperty("F1");
    expect(profile.builds.ground.keys).toHaveProperty("F2");
    expectOwnFields(command, richCommandFields);
    expectOwnFields(project.data.settings, settingsFields.slice(0, 16));
    expect(command.commandExtension).toEqual({
      source: "artifact-fixture",
    });
    expect(profile.profileExtension).toEqual({
      source: "artifact-fixture",
    });
    expect(project.data.settings["plugin:layout"]).toEqual({
      density: "compact",
    });
  });
});
