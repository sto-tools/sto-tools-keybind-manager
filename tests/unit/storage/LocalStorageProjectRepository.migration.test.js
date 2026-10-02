import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import LocalStorageProjectRepository from "../../../src/js/components/storage/LocalStorageProjectRepository.js";
import { decodeLegacyStoredApplicationJson } from "../../../src/js/components/services/storedApplicationDataBoundary.js";
import { createProjectRepositoryDefaults } from "../../../src/js/components/storage/projectRepositoryBoundary.js";

const ROOT = "sto_keybind_manager";
const BACKUP = "sto_keybind_manager_backup";
const RESET = "sto_app_reset";
const version = "2.0.0";
const timestamp = "2026-10-02T10:00:00.000Z";
const metadata = { timestamp, version };
const legacy = () =>
  ` \n${readFileSync("tests/fixtures/storage/complete-current-root.json", "utf8")} \n`;

function migrated(raw) {
  const defaults = createProjectRepositoryDefaults({ version, timestamp });
  const decoded = decodeLegacyStoredApplicationJson(raw, { defaults, version });
  const root = decoded.success ? decoded.value : defaults;
  delete root.settings;
  root.version = version;
  return root;
}

function setup(raw = legacy()) {
  const data = new Map([[ROOT, raw]]);
  const storage = {
    getItem: vi.fn((key) => data.get(key) ?? null),
    setItem: vi.fn((key, value) => data.set(key, value)),
    removeItem: vi.fn((key) => data.delete(key)),
  };
  const now = vi.fn(() => timestamp);
  const makeRepository = () =>
    new LocalStorageProjectRepository({
      storage,
      version,
      now,
    });
  const repository = makeRepository();
  return {
    repository,
    port: repository.createSchemaMigrationPort(),
    storage,
    data,
    raw,
    makeRepository,
    now,
  };
}

afterEach(() => vi.restoreAllMocks());

describe("privileged project schema migration persistence", () => {
  it.each(["space", "ground"])(
    "preserves established legacy %s normalization through migration-only persistence",
    (mode) => {
      const source = readFileSync(
        `tests/fixtures/storage/legacy-${mode}-root.json`,
        "utf8",
      );
      const expected = JSON.parse(
        readFileSync(
          `tests/fixtures/storage/legacy-${mode}-expected-root.json`,
          "utf8",
        ),
      );
      const before = JSON.parse(source);
      delete expected.settings;
      expected.lastModified = before.lastModified;
      if (Object.hasOwn(before, "lastBackup"))
        expected.lastBackup = before.lastBackup;
      else delete expected.lastBackup;
      const { port, raw, data } = setup(source);
      port.preserveExactBackup(raw, metadata);
      expect(port.commitMigratedRoot(raw, migrated(raw))).toMatchObject({
        status: "committed",
        value: expected,
      });
      expect(JSON.parse(data.get(BACKUP)).data).toBe(source);
      expect(JSON.parse(data.get(ROOT))).toEqual(expected);
    },
  );

  it("provides only the frozen startup capability, separately from diagnostic inspection", () => {
    const { repository, port, storage, raw } = setup();
    expect(Object.isFrozen(port)).toBe(true);
    expect(Object.keys(port)).toEqual([
      "inspectRaw",
      "preserveExactBackup",
      "commitMigratedRoot",
    ]);
    expect(Object.keys(repository.createMigrationInspectionPort())).toEqual([
      "inspectRaw",
    ]);
    expect(repository).not.toHaveProperty("preserveExactBackup");
    expect(storage.getItem).not.toHaveBeenCalled();
    const { inspectRaw } = port;
    expect(inspectRaw()).toEqual({ status: "read", raw });
  });

  it("verifies exact whitespace-preserving backup and reuses it on same-source retry", () => {
    const { port, raw, data, storage, makeRepository } = setup();
    expect(port.preserveExactBackup(raw, metadata)).toEqual({
      status: "verified",
    });
    const exactEnvelope = data.get(BACKUP);
    expect(JSON.parse(exactEnvelope)).toEqual({ data: raw, ...metadata });
    storage.setItem.mockClear();
    expect(
      makeRepository().createSchemaMigrationPort().preserveExactBackup(raw, {
        timestamp: "later retry",
        version: "different envelope version",
      }),
    ).toEqual({ status: "verified" });
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(data.get(BACKUP)).toBe(exactEnvelope);
  });

  it("commits only after durable exact-backup proof, without timestamp changes or backup replacement", () => {
    const { port, raw, data, storage } = setup();
    const root = migrated(raw);
    const original = structuredClone(root);
    expect(port.commitMigratedRoot(raw, root)).toMatchObject({
      status: "rejected",
      error: "verification_failed",
    });
    expect(storage.setItem).not.toHaveBeenCalled();
    port.preserveExactBackup(raw, metadata);
    const backup = data.get(BACKUP);
    storage.setItem.mockClear();
    const result = port.commitMigratedRoot(raw, root);
    expect(result).toMatchObject({
      status: "committed",
      verification: { status: "verified" },
    });
    expect(result.value).toEqual(original);
    expect(root).toEqual(original);
    expect(JSON.parse(data.get(ROOT))).toEqual(original);
    expect(data.get(BACKUP)).toBe(backup);
    expect(storage.setItem).toHaveBeenCalledExactlyOnceWith(
      ROOT,
      data.get(ROOT),
    );
    result.value.profiles["complete-profile"].name = "caller mutation";
    expect(JSON.parse(data.get(ROOT))).toEqual(original);
  });

  it.each(["preserveExactBackup", "commitMigratedRoot"])(
    "guards changed captured roots in %s",
    (method) => {
      const { port, raw, data, storage } = setup();
      port.preserveExactBackup(raw, metadata);
      data.set(ROOT, "external writer");
      storage.setItem.mockClear();
      expect(
        port[method](
          raw,
          method === "preserveExactBackup" ? metadata : migrated(raw),
        ),
      ).toMatchObject({ error: "operation_cancelled" });
      expect(storage.setItem).not.toHaveBeenCalled();
      expect(data.get(ROOT)).toBe("external writer");
    },
  );

  it("rechecks the captured root after backup proof before replacement", () => {
    const { port, raw, data, storage } = setup();
    port.preserveExactBackup(raw, metadata);
    const get = storage.getItem.getMockImplementation();
    storage.getItem.mockImplementation((key) => {
      const value = get(key);
      if (key === BACKUP) data.set(ROOT, "changed during proof");
      return value;
    });
    storage.setItem.mockClear();
    expect(port.commitMigratedRoot(raw, migrated(raw))).toMatchObject({
      error: "operation_cancelled",
    });
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it.each([
    null,
    {},
    [],
    { timestamp, version: 3 },
    { timestamp, version, extra: true },
  ])("rejects metadata %j before storage", (badMetadata) => {
    const { port, raw, storage } = setup();
    expect(port.preserveExactBackup(raw, badMetadata)).toEqual({
      status: "failed",
      error: "invalid_data",
    });
    expect(storage.getItem).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("never invokes metadata or root accessors and rejects settings-bearing migration drafts", () => {
    const { port, raw, storage } = setup();
    const get = vi.fn(() => timestamp);
    const badMetadata = Object.defineProperty({ version }, "timestamp", {
      enumerable: true,
      get,
    });
    expect(port.preserveExactBackup(raw, badMetadata).error).toBe(
      "invalid_data",
    );
    const accessor = Object.defineProperty(migrated(raw), "extension", {
      enumerable: true,
      get,
    });
    const cycle = migrated(raw);
    cycle.cycle = cycle;
    for (const root of [
      accessor,
      cycle,
      { ...migrated(raw), settings: {} },
      null,
    ]) {
      expect(port.commitMigratedRoot(raw, root)).toMatchObject({
        status: "rejected",
        error: "invalid_data",
      });
    }
    expect(get).not.toHaveBeenCalled();
    expect(storage.getItem).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it.each([ROOT, BACKUP])("fails closed on initial %s reads", (failedKey) => {
    const { port, raw, storage } = setup();
    storage.getItem.mockImplementation((key) => {
      if (key === failedKey) throw new Error("private details");
      return raw;
    });
    expect(port.preserveExactBackup(raw, metadata)).toEqual({
      status: "failed",
      error: "storage_read_failed",
    });
    expect(port.commitMigratedRoot(raw, migrated(raw))).toMatchObject({
      status: "rejected",
      error: "storage_read_failed",
    });
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("fails closed on quota backup writes while ordinary commits remain advisory", () => {
    const { port, raw, storage, data, repository } = setup();
    storage.setItem.mockImplementation((key, value) => {
      if (key === BACKUP)
        throw new DOMException("private quota", "QuotaExceededError");
      data.set(key, value);
    });
    expect(port.preserveExactBackup(raw, metadata)).toEqual({
      status: "failed",
      error: "backup_write_failed",
    });
    expect(data.get(ROOT)).toBe(raw);
    expect(repository.commit(migrated(raw))).toMatchObject({
      status: "committed",
      backup: { status: "indeterminate", category: "quota" },
    });
  });

  it.each(["read_failed", "value_mismatch"])(
    "rejects backup %s verification",
    (mode) => {
      const { port, raw, storage, data } = setup();
      storage.getItem.mockImplementation((key) => {
        if (key === BACKUP && data.has(BACKUP)) {
          if (mode === "read_failed") throw new Error("private backup");
          return JSON.stringify({ data: "not captured", ...metadata });
        }
        return data.get(key) ?? null;
      });
      expect(port.preserveExactBackup(raw, metadata)).toEqual({
        status: "failed",
        error:
          mode === "read_failed"
            ? "storage_read_failed"
            : "verification_failed",
      });
      expect(data.get(ROOT)).toBe(raw);
    },
  );

  it.each(["throw", "read_failed", "value_mismatch"])(
    "retains checkpoint when root %s fails",
    (mode) => {
      const { port, raw, storage, data } = setup();
      port.preserveExactBackup(raw, metadata);
      const backup = data.get(BACKUP);
      let rootWritten = false;
      storage.setItem.mockImplementation((key, value) => {
        if (key === ROOT && mode === "throw") throw new Error("private write");
        data.set(key, value);
        if (key === ROOT) rootWritten = true;
      });
      storage.getItem.mockImplementation((key) => {
        if (key === ROOT && rootWritten) {
          if (mode === "read_failed") throw new Error("private read");
          return "unexpected readback";
        }
        return data.get(key) ?? null;
      });
      const result = port.commitMigratedRoot(raw, migrated(raw));
      expect(result.status).toBe(
        mode === "throw" ? "write_failed" : "verification_failed",
      );
      expect(data.get(BACKUP)).toBe(backup);
      expect(storage.removeItem).not.toHaveBeenCalled();
    },
  );

  it("never adds absent migration backup timestamps and preserves nested extensions", () => {
    const source = JSON.parse(legacy());
    delete source.lastBackup;
    source.extension = { nested: [true, { value: "preserved" }] };
    const { port, raw, data } = setup(JSON.stringify(source));
    port.preserveExactBackup(raw, metadata);
    const result = port.commitMigratedRoot(raw, migrated(raw));
    expect(result.value).not.toHaveProperty("lastBackup");
    const expected = { ...source };
    delete expected.settings;
    expect(JSON.parse(data.get(ROOT))).toEqual(expected);
  });
});

describe("startup-only migration checkpoint preservation proof", () => {
  it.each(["legacy", "invalid", "no-created"])(
    "keeps %s migration metadata, then uses verified backup metadata across failed-sentinel restart",
    (source) => {
      const input = JSON.parse(legacy());
      if (source === "no-created") delete input.created;
      const { port, raw, data, repository, storage, makeRepository, now } =
        setup(
          source === "invalid"
            ? "{invalid exact checkpoint"
            : JSON.stringify(input),
        );
      const original = migrated(raw);
      port.preserveExactBackup(raw, metadata);
      expect(port.commitMigratedRoot(raw, original).status).toBe("committed");
      expect(JSON.parse(data.get(ROOT)).lastBackup).toBe(original.lastBackup);
      expect(JSON.parse(data.get(ROOT)).lastModified).toBe(
        original.lastModified,
      );
      const backup = data.get(BACKUP);
      data.set(RESET, "retry sentinel");
      storage.removeItem.mockImplementationOnce(() => {
        throw new Error("blocked sentinel");
      });
      now.mockReturnValue("2026-10-03T10:00:00.000Z");
      expect(
        repository.commit(
          {
            ...repository.load().value,
            startupExtension: "repaired domain value",
          },
          {
            verification: "required",
            consumeResetSentinel: "retry sentinel",
            purpose: "startup_recovery",
          },
        ).status,
      ).toBe("sentinel_failed");
      expect(JSON.parse(data.get(ROOT))).toEqual({
        ...original,
        startupExtension: "repaired domain value",
        lastModified: "2026-10-03T10:00:00.000Z",
        lastBackup: timestamp,
      });
      expect(data.get(BACKUP)).toBe(backup);
      now.mockReturnValue("2026-10-04T10:00:00.000Z");
      const restarted = makeRepository();
      expect(
        restarted.commit(restarted.load().value, {
          verification: "required",
          consumeResetSentinel: "retry sentinel",
          purpose: "startup_recovery",
        }).status,
      ).toBe("committed");
      expect(data.get(BACKUP)).toBe(backup);
      expect(JSON.parse(data.get(ROOT)).lastModified).toBe(
        "2026-10-03T10:00:00.000Z",
      );
      expect(JSON.parse(data.get(ROOT)).lastBackup).toBe(timestamp);
      expect(data.has(RESET)).toBe(false);
    },
  );

  it.each(["created", "profile-timestamp", "extension-timestamp"])(
    "does not ignore unrelated graph fields named like writer metadata: %s",
    (field) => {
      const { port, raw, data, repository } = setup();
      const root = migrated(raw);
      port.preserveExactBackup(raw, metadata);
      port.commitMigratedRoot(raw, root);
      if (field === "created") root.created = "changed root origin";
      if (field === "profile-timestamp")
        root.profiles["complete-profile"].lastModified =
          "changed domain timestamp";
      if (field === "extension-timestamp")
        root.extension = {
          lastModified: "changed extension timestamp",
          lastBackup: timestamp,
        };
      data.set(ROOT, JSON.stringify(root));
      const currentRaw = data.get(ROOT);
      expect(
        repository.commit(root, {
          verification: "required",
          purpose: "startup_recovery",
        }).status,
      ).toBe("committed");
      expect(JSON.parse(data.get(BACKUP)).data).toBe(currentRaw);
    },
  );

  it.each(["legacy", "invalid", "no-created"])(
    "rederives %s checkpoint proof after restart for initial owner repair",
    (source) => {
      const legacyRoot = JSON.parse(legacy());
      if (source === "no-created") delete legacyRoot.created;
      const { port, raw, data, makeRepository } = setup(
        source === "invalid"
          ? "{bad raw checkpoint"
          : JSON.stringify(legacyRoot),
      );
      const root = migrated(raw);
      if (source === "no-created") expect(root).not.toHaveProperty("created");
      port.preserveExactBackup(raw, metadata);
      expect(port.commitMigratedRoot(raw, root).status).toBe("committed");
      const backup = data.get(BACKUP);
      data.set(RESET, "retry startup sentinel");
      const restarted = makeRepository();
      const loaded = restarted.load();
      expect(loaded.status).toBe("repair_required");
      expect(
        restarted.commit(loaded.value, {
          verification: "required",
          consumeResetSentinel: "retry startup sentinel",
          purpose: "startup_recovery",
        }).status,
      ).toBe("committed");
      expect(data.get(BACKUP)).toBe(backup);
      expect(data.has(RESET)).toBe(false);
    },
  );

  it.each(["ordinary", "different-root", "invalid-envelope"])(
    "backs up exact current root when checkpoint proof is unavailable: %s",
    (mode) => {
      const { port, raw, data, repository } = setup();
      const root = migrated(raw);
      port.preserveExactBackup(raw, metadata);
      port.commitMigratedRoot(raw, root);
      if (mode === "different-root") root.extension = "changed after migration";
      data.set(ROOT, JSON.stringify(root));
      if (mode === "invalid-envelope")
        data.set(BACKUP, JSON.stringify({ data: raw, timestamp, version: 9 }));
      const before = data.get(ROOT);
      expect(
        repository.commit(
          root,
          mode === "ordinary"
            ? undefined
            : { purpose: "startup_recovery", verification: "required" },
        ).status,
      ).toBe("committed");
      expect(JSON.parse(data.get(BACKUP)).data).toBe(before);
    },
  );
});
