import { describe, expect, it, vi } from "vitest";
import LocalStorageProjectRepository from "../../../src/js/components/storage/LocalStorageProjectRepository.js";
import {
  createProjectRepositoryDefaults,
  prepareProjectMigrationCommit,
  prepareProjectRepositoryCommit,
} from "../../../src/js/components/storage/projectRepositoryBoundary.js";
import { serializeProjectArtifact } from "../../../src/js/components/services/projectArtifact.js";
import { embeddedSettingsOperations } from "../../fixtures/tooling/storageArchitectureScanner.js";
import { sourceEntries } from "../../fixtures/tooling/persistenceScanner.js";
import {
  BACKUP,
  ROOT,
  SETTINGS,
  TIMESTAMP,
  legacyRoot,
  migrationFixture,
} from "../../fixtures/persistence/storageMigration.js";

const version = "2.0.0";
const canonicalRoot = () => ({
  ...createProjectRepositoryDefaults({ version, timestamp: TIMESTAMP }),
  extension: { settings: { nested: "preserved" } },
});
const options = () => ({
  version,
  timestamp: TIMESTAMP,
  defaults: canonicalRoot(),
});

describe("canonical root embedded-settings absence", () => {
  it("permits only privileged deletion, never a settings read or materialization, in root boundaries", () => {
    const files = [
      "components/storage/LocalStorageProjectRepository.js",
      "components/storage/projectRepositoryBoundary.js",
      "components/storage/projectSchemaMigrationPersistence.js",
      "components/storage/storageSchemaMigration.js",
      "components/services/storedApplicationDataBoundary.js",
    ];
    const entries = sourceEntries().filter(([file]) => files.includes(file));
    expect(entries).toHaveLength(files.length);
    expect(embeddedSettingsOperations(entries)).toEqual([
      {
        file: "components/services/storedApplicationDataBoundary.js",
        kind: "delete",
        expression: "parsed.settings",
      },
    ]);
  });

  it.each([
    "const settings = root.settings || defaults;",
    'const settings = root?.["settings"] ?? defaults;',
    'const settings = root["set" + "tings"];',
    "root.settings = preferences;",
    "const root = { settings: preferences };",
    "const root = { settings };",
    'const root = { ["settings"]: preferences };',
    "const { settings } = root;",
    'const { ["settings"]: preferences } = root;',
  ])("detects reintroduced fallback/materialization syntax: %s", (source) => {
    expect(
      embeddedSettingsOperations([["probe.js", source]]).filter(
        (row) => row.kind !== "delete",
      ),
    ).not.toHaveLength(0);
  });

  it.each([
    null,
    false,
    undefined,
    "hostile",
    { theme: "embedded-never-wins" },
  ])(
    "rejects own embedded settings %j before either canonical writer can write",
    (settings) => {
      const root = { ...canonicalRoot(), settings };
      expect(prepareProjectRepositoryCommit(root, options()).success).toBe(
        false,
      );
      expect(prepareProjectMigrationCommit(root, options()).success).toBe(
        false,
      );
      const storage = {
        getItem: vi.fn(() => null),
        setItem: vi.fn(),
        removeItem: vi.fn(),
      };
      const repository = new LocalStorageProjectRepository({
        storage,
        version,
        now: () => TIMESTAMP,
      });
      expect(repository.commit(root).status).toBe("rejected");
      expect(
        repository
          .createSchemaMigrationPort()
          .commitMigratedRoot("prior-root", root).status,
      ).toBe("rejected");
      expect(storage.setItem).not.toHaveBeenCalled();
    },
  );

  it("both ordinary preparation and physical commit preserve nested extension.settings", () => {
    const root = canonicalRoot();
    const ordinary = prepareProjectRepositoryCommit(root, options());
    const privileged = prepareProjectMigrationCommit(root, options());
    expect(ordinary.success).toBe(true);
    expect(privileged.success).toBe(true);
    for (const result of [ordinary, privileged]) {
      expect(Object.hasOwn(result.value, "settings")).toBe(false);
      expect(JSON.parse(result.json).extension).toEqual(root.extension);
    }
    const fixture = migrationFixture([[ROOT, JSON.stringify(root)]]);
    expect(
      fixture.projectRepository.commit(root, { verification: "required" })
        .status,
    ).toBe("committed");
    expect(
      Object.hasOwn(JSON.parse(fixture.durable.get(ROOT)), "settings"),
    ).toBe(false);
    expect(JSON.parse(fixture.durable.get(ROOT)).extension).toEqual(
      root.extension,
    );
  });

  it.each([undefined, "{broken", "null"])(
    "privileged migration writes standalone defaults without embedded fallback (%j)",
    (standalone) => {
      const exactLegacy = JSON.stringify(legacyRoot, null, 2);
      const entries = [[ROOT, exactLegacy]];
      if (standalone !== undefined) entries.push([SETTINGS, standalone]);
      const fixture = migrationFixture(entries);
      expect(fixture.run().status).toBe("complete");
      const written = fixture.storage.setItem.mock.calls.filter(
        ([key]) => key === ROOT,
      );
      expect(written).toHaveLength(1);
      expect(Object.hasOwn(JSON.parse(written[0][1]), "settings")).toBe(false);
      expect(JSON.parse(written[0][1]).extension).toEqual(legacyRoot.extension);
      expect(JSON.parse(fixture.durable.get(SETTINGS))).toEqual(
        fixture.defaults,
      );
      // Historical backup is an exact prior-root artifact, intentionally not
      // rewritten into a settings-free canonical runtime root.
      expect(JSON.parse(fixture.durable.get(BACKUP)).data).toBe(exactLegacy);
    },
  );

  it("portable artifact settings come only from explicit canonical settings", () => {
    const fixture = migrationFixture();
    const root = canonicalRoot();
    const getter = vi.fn(() => {
      throw new Error("embedded_settings_access");
    });
    Object.defineProperty(root, "settings", { enumerable: true, get: getter });
    const artifact = JSON.parse(
      serializeProjectArtifact(root, fixture.defaults, {
        version,
        exported: TIMESTAMP,
      }),
    );
    expect(artifact.data.settings).toEqual(fixture.defaults);
    expect(() =>
      serializeProjectArtifact(root, undefined, {
        version,
        exported: TIMESTAMP,
      }),
    ).toThrow("canonical_settings_required");
    expect(getter).not.toHaveBeenCalled();
  });
});
