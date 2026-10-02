import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import LocalStorageProjectRepository from "../../../src/js/components/storage/LocalStorageProjectRepository.js";
import { MAX_PROJECT_JSON_BYTES } from "../../../src/js/components/services/jsonDataBoundary.js";

const ROOT = "sto_keybind_manager";
const BACKUP = "sto_keybind_manager_backup";
const RESET = "sto_app_reset";
const SETTINGS = "sto_keybind_settings";
const time = "2026-07-15T12:00:00.000Z";
const fixtureDirectory = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../fixtures/storage",
);
const fixture = (name) => {
  const raw = readFileSync(join(fixtureDirectory, name), "utf8").trim();
  if (name !== "complete-current-root.json") return raw;
  const canonical = JSON.parse(raw);
  delete canonical.settings;
  return JSON.stringify(canonical);
};
const root = () => JSON.parse(fixture("complete-current-root.json"));

function setup(initial = {}, overrides = {}) {
  const data = new Map(Object.entries(initial));
  const operations = [];
  const storage = {
    getItem: vi.fn((key) => {
      operations.push(["get", key]);
      return data.get(key) ?? null;
    }),
    setItem: vi.fn((key, value) => {
      operations.push(["set", key]);
      data.set(key, value);
    }),
    removeItem: vi.fn((key) => {
      operations.push(["remove", key]);
      data.delete(key);
    }),
  };
  const now = vi.fn(() => time);
  const repository = new LocalStorageProjectRepository({
    storage,
    now,
    version: "2.0.0",
    ...overrides,
  });
  return { data, operations, storage, now, repository };
}

afterEach(() => vi.restoreAllMocks());

describe("LocalStorageProjectRepository", () => {
  it("uses only its injected capability and rejects missing dependencies", () => {
    const globalRead = vi.spyOn(globalThis.localStorage, "getItem");
    const { repository, storage } = setup();
    expect(repository.load().status).toBe("repair_required");
    expect(globalRead).not.toHaveBeenCalled();
    expect(storage.getItem).toHaveBeenCalledTimes(2);
    expect(() => setup({}, { storage: undefined })).toThrow();
    expect(() => setup({}, { now: undefined })).toThrow();
    expect(() => setup({}, { version: 3 })).toThrow();
    expect(repository).not.toHaveProperty("getProfile");
    expect(repository).not.toHaveProperty("emit");
    expect(Object.keys(repository.createMigrationInspectionPort())).toEqual([
      "inspectRaw",
    ]);
  });

  it("loads repeatedly without cache, writes, or shared references", () => {
    const raw = fixture("complete-current-root.json");
    const { repository, storage, data } = setup({ [ROOT]: raw });
    const first = repository.load();
    first.value.profiles["complete-profile"].name = "mutated-result";
    expect(repository.load()).toEqual({
      status: "current",
      value: JSON.parse(raw),
    });
    data.set(
      ROOT,
      JSON.stringify({ ...root(), extension: "new external value" }),
    );
    expect(repository.load().value.extension).toBe("new external value");
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.removeItem).not.toHaveBeenCalled();
  });

  it("creates detached settings-free recovery defaults for each load", () => {
    const { repository } = setup();
    const first = repository.load();
    expect(first.value).not.toHaveProperty("settings");
    first.value.profiles.caller = { name: "mutation" };
    expect(repository.load().value.profiles).toEqual({});
  });

  it.each([ROOT, RESET])("fails closed when loading %s throws", (key) => {
    const { repository, storage } = setup();
    storage.getItem.mockImplementation((requested) => {
      if (requested === key)
        throw new DOMException("private details", "SecurityError");
      return null;
    });
    expect(repository.load()).toEqual({
      status: "read_failed",
      error: "storage_read_failed",
      category: "security",
    });
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.removeItem).not.toHaveBeenCalled();
  });

  it.each([null, "", "false", "true", "token"])(
    "keeps reset sentinel %j unchanged during load",
    (sentinel) => {
      const { repository, data, storage } = setup(
        sentinel === null ? {} : { [RESET]: sentinel },
      );
      expect(repository.load().resetSentinel).toEqual(
        sentinel
          ? { status: "pending_consumption", expectedValue: sentinel }
          : { status: "not_applicable" },
      );
      expect(data.get(RESET) ?? null).toBe(sentinel);
      expect(storage.removeItem).not.toHaveBeenCalled();
    },
  );

  it("backs up the exact prior string then stamps and writes one complete root", () => {
    const raw = ` \n${fixture("complete-current-root.json")} \n`;
    const { repository, data, operations, now } = setup({ [ROOT]: raw });
    const input = root();
    const original = structuredClone(input);
    const result = repository.commit(input);
    expect(result).toMatchObject({
      status: "committed",
      backup: { status: "acknowledged" },
      rootWrite: { status: "acknowledged" },
      verification: { status: "not_requested" },
      resetSentinel: { status: "not_requested" },
    });
    expect(operations).toEqual([
      ["get", ROOT],
      ["set", BACKUP],
      ["set", ROOT],
    ]);
    expect(JSON.parse(data.get(BACKUP))).toEqual({
      data: raw,
      timestamp: time,
      version: "2.0.0",
    });
    expect(result.value).toEqual(JSON.parse(data.get(ROOT)));
    expect(input).toEqual(original);
    expect(now).toHaveBeenCalledTimes(1);
    result.value.profiles["complete-profile"].name = "result-change";
    input.profiles["complete-profile"].name = "input-change";
    expect(repository.load().value.profiles["complete-profile"].name).toBe(
      original.profiles["complete-profile"].name,
    );
  });

  it.each(["space", "ground"])(
    "does not authorize embedded-settings %s roots through ordinary load",
    (mode) => {
      const raw = fixture(`legacy-${mode}-root.json`);
      const { repository, data } = setup({ [ROOT]: raw });
      const loaded = repository.load();
      expect(loaded).toMatchObject({
        status: "repair_required",
        reason: "invalid_data",
      });
      expect(loaded.value).not.toHaveProperty("settings");
      const result = repository.commit(loaded.value, {
        verification: "required",
      });
      expect(result.status).toBe("committed");
      expect(result.value.profiles).toEqual({});
      expect(JSON.parse(data.get(BACKUP)).data).toBe(raw);
    },
  );

  it.each([null, ""])("skips backup for falsy prior root %j", (prior) => {
    const { repository, storage } = setup(
      prior === null ? {} : { [ROOT]: prior },
    );
    expect(repository.commit(root()).backup).toEqual({
      status: "skipped",
      reason: "missing",
    });
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(storage.setItem.mock.calls[0][0]).toBe(ROOT);
  });

  it("treats backup read failure as advisory without claiming backup was written", () => {
    const { repository, storage, data } = setup();
    storage.getItem.mockImplementation(() => {
      throw new Error("read failed");
    });
    const result = repository.commit(root());
    expect(result.status).toBe("committed");
    expect(result.backup).toEqual({
      status: "read_failed",
      error: "storage_read_failed",
      category: "unknown",
    });
    expect(data.has(BACKUP)).toBe(false);
    expect(data.has(ROOT)).toBe(true);
  });

  it("treats backup quota failure as advisory and retains the primary acknowledgement", () => {
    const { repository, storage, data } = setup({ [ROOT]: "previous bytes" });
    storage.setItem.mockImplementation((key, value) => {
      if (key === BACKUP) throw new DOMException("quota", "QuotaExceededError");
      data.set(key, value);
    });
    const result = repository.commit(root());
    expect(result.status).toBe("committed");
    expect(result.backup).toEqual({
      status: "indeterminate",
      error: "backup_write_failed",
      category: "quota",
    });
    expect(result.rootWrite.status).toBe("acknowledged");
  });

  it("reports backup preparation failure without attempting its write", () => {
    const { repository, storage } = setup({ [ROOT]: "previous" });
    const stringify = JSON.stringify;
    vi.spyOn(JSON, "stringify").mockImplementation((value, ...args) => {
      if (typeof value === "object" && value !== null && "data" in value) {
        throw new Error("backup envelope serialization failed");
      }
      return stringify(value, ...args);
    });
    const result = repository.commit(root());
    expect(result.status).toBe("committed");
    expect(result.backup).toEqual({
      status: "preparation_failed",
      error: "serialization_failed",
    });
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(storage.setItem.mock.calls[0][0]).toBe(ROOT);
  });

  it("preserves an escaped backup envelope even when the wrapper exceeds the root byte cap", () => {
    const previous = '"'.repeat(MAX_PROJECT_JSON_BYTES / 2 + 1);
    const { repository, data } = setup({ [ROOT]: previous });
    expect(repository.commit(root()).backup.status).toBe("acknowledged");
    expect(data.get(BACKUP).length).toBeGreaterThan(MAX_PROJECT_JSON_BYTES);
    expect(JSON.parse(data.get(BACKUP)).data).toBe(previous);
  });

  it.each([false, true])(
    "marks a throwing primary write indeterminate even if mutation happened: %s",
    (mutate) => {
      const { repository, storage, data } = setup({ [ROOT]: "prior" });
      storage.setItem.mockImplementation((key, value) => {
        if (key !== ROOT || mutate) data.set(key, value);
        if (key === ROOT) throw new DOMException("quota", "QuotaExceededError");
      });
      const result = repository.commit(root(), { verification: "required" });
      expect(result).toEqual({
        status: "write_failed",
        error: "storage_write_failed",
        backup: { status: "acknowledged" },
        rootWrite: {
          status: "indeterminate",
          error: "storage_write_failed",
          category: "quota",
        },
        verification: { status: "not_attempted" },
        resetSentinel: { status: "not_attempted" },
      });
      expect(storage.getItem).toHaveBeenCalledTimes(1);
    },
  );

  it("verifies the exact primary string only when requested", () => {
    const { repository, operations } = setup();
    const result = repository.commit(root(), { verification: "required" });
    expect(result.status).toBe("committed");
    expect(result.verification).toEqual({ status: "verified" });
    expect(operations).toEqual([
      ["get", ROOT],
      ["set", ROOT],
      ["get", ROOT],
    ]);
  });

  it.each(["throw", "different", "missing", "invalid"])(
    "retains acknowledged root when readback is %s",
    (mode) => {
      const { repository, storage } = setup({ [RESET]: "true" });
      storage.getItem.mockReturnValueOnce(null).mockImplementation(() => {
        if (mode === "throw") throw new Error("readback private details");
        if (mode === "missing") return null;
        return mode === "invalid" ? "{" : "{}";
      });
      const result = repository.commit(root(), {
        verification: "required",
        consumeResetSentinel: "true",
      });
      expect(result.status).toBe("verification_failed");
      expect(result.rootWrite.status).toBe("acknowledged");
      expect(result.verification.reason).toBe(
        mode === "throw" ? "read_failed" : "value_mismatch",
      );
      expect(result.resetSentinel.status).toBe("not_attempted");
      expect(storage.removeItem).not.toHaveBeenCalled();
    },
  );

  it("consumes the exact captured sentinel only after acknowledged verified recovery", () => {
    const { repository, data, operations } = setup({ [RESET]: "false" });
    const loaded = repository.load();
    operations.length = 0;
    const result = repository.commit(loaded.value, {
      verification: "required",
      consumeResetSentinel: loaded.resetSentinel.expectedValue,
    });
    expect(result.status).toBe("committed");
    expect(result.resetSentinel).toEqual({ status: "acknowledged" });
    expect(operations).toEqual([
      ["get", ROOT],
      ["set", ROOT],
      ["get", ROOT],
      ["get", RESET],
      ["remove", RESET],
    ]);
    expect(data.has(RESET)).toBe(false);
    expect(repository.load().status).toBe("current");
  });

  it.each(["changed", "missing", "read_failed", "remove_failed"])(
    "retains root evidence for %s sentinel consumption",
    (mode) => {
      const { repository, storage, data } = setup({ [RESET]: "expected" });
      if (mode === "changed") data.set(RESET, "other");
      if (mode === "missing") data.delete(RESET);
      const originalGet = storage.getItem.getMockImplementation();
      storage.getItem.mockImplementation((key) => {
        if (key === RESET && mode === "read_failed") throw new Error("private");
        return originalGet(key);
      });
      if (mode === "remove_failed")
        storage.removeItem.mockImplementation(() => {
          throw new Error("private");
        });
      const result = repository.commit(root(), {
        verification: "required",
        consumeResetSentinel: "expected",
      });
      expect(result.status).toBe("sentinel_failed");
      expect(result.rootWrite.status).toBe("acknowledged");
      expect(result.verification.status).toBe("verified");
      expect(result.resetSentinel.status).toBe(
        mode === "remove_failed"
          ? "indeterminate"
          : mode === "read_failed"
            ? "read_failed"
            : "changed",
      );
      expect(data.has(ROOT)).toBe(true);
      if (mode === "remove_failed") {
        expect(repository.load()).toMatchObject({
          status: "repair_required",
          reason: "reset_pending",
          resetSentinel: {
            status: "pending_consumption",
            expectedValue: "expected",
          },
        });
      }
      if (mode !== "remove_failed")
        expect(storage.removeItem).not.toHaveBeenCalled();
    },
  );

  it.each(
    [
      null,
      [],
      { verification: "yes" },
      { verification: null },
      { preserveBackup: true },
      { purpose: "startup_recovery" },
      { purpose: "startup_recovery", verification: "not_requested" },
      { consumeResetSentinel: "true" },
      { verification: "required", consumeResetSentinel: "" },
      { verification: "required", consumeResetSentinel: false },
    ].map((options) => [options]),
  )("rejects invalid options before any storage access: %j", (options) => {
    const { repository, operations } = setup();
    expect(repository.commit(root(), options).status).toBe("rejected");
    expect(operations).toEqual([]);
  });

  it("rejects option accessors without executing them", () => {
    const { repository, operations } = setup();
    const get = vi.fn(() => "required");
    const options = Object.defineProperty({}, "verification", {
      enumerable: true,
      get,
    });
    expect(repository.commit(root(), options).status).toBe("rejected");
    expect(get).not.toHaveBeenCalled();
    expect(operations).toEqual([]);
  });

  it("rejects invalid roots before backup or primary mutation", () => {
    const { repository, operations } = setup({ [ROOT]: "previous" });
    const cycle = root();
    cycle.self = cycle;
    const invalid = [null, {}, { ...root(), settings: { theme: 99 } }, cycle];
    for (const candidate of invalid) {
      const result = repository.commit(candidate);
      expect(result).toEqual({
        status: "rejected",
        error: "invalid_data",
        backup: { status: "not_attempted" },
        rootWrite: { status: "not_attempted" },
        verification: { status: "not_attempted" },
        resetSentinel: { status: "not_attempted" },
      });
    }
    expect(operations).toEqual([]);
  });

  it("rejects an oversized root before attempting even the advisory backup", () => {
    const { repository, operations } = setup({ [ROOT]: "previous" });
    expect(
      repository.commit({ ...root(), huge: "x".repeat(MAX_PROJECT_JSON_BYTES) })
        .status,
    ).toBe("rejected");
    expect(operations).toEqual([]);
  });

  it("rejects incomplete or repair-requiring candidates before storage access", () => {
    const { repository, operations } = setup({ [ROOT]: "previous" });
    const missingVersion = root();
    delete missingVersion.version;
    const missingTimestamp = root();
    delete missingTimestamp.lastModified;
    const inputs = [
      missingVersion,
      missingTimestamp,
      { ...root(), currentProfile: null },
      { ...root(), currentProfile: "missing-profile" },
      JSON.parse(fixture("legacy-space-root.json")),
    ];
    for (const input of inputs) {
      expect(repository.commit(input).status).toBe("rejected");
    }
    expect(operations).toEqual([]);
  });

  it("resets only root, backup, and sentinel in the established order", () => {
    const { repository, data, operations } = setup({
      [ROOT]: "root",
      [BACKUP]: "backup",
      [SETTINGS]: "settings",
      keyViewMode: "grid",
    });
    expect(repository.reset()).toEqual({
      status: "reset",
      rootRemoval: { status: "acknowledged" },
      backupRemoval: { status: "acknowledged" },
      sentinelWrite: { status: "acknowledged" },
    });
    expect(operations).toEqual([
      ["remove", ROOT],
      ["remove", BACKUP],
      ["set", RESET],
    ]);
    expect(Object.fromEntries(data)).toEqual({
      [SETTINGS]: "settings",
      keyViewMode: "grid",
      [RESET]: "true",
    });
    expect(repository.reset().status).toBe("reset");
  });

  it.each([ROOT, BACKUP, RESET])(
    "reports exact partial reset receipts when %s throws",
    (failedKey) => {
      const { repository, storage, data } = setup({
        [ROOT]: "root",
        [BACKUP]: "backup",
        [SETTINGS]: "settings",
      });
      storage.removeItem.mockImplementation((key) => {
        if (key === failedKey) throw new Error("remove failed");
        data.delete(key);
      });
      storage.setItem.mockImplementation((key, value) => {
        if (key === failedKey) throw new Error("write failed");
        data.set(key, value);
      });
      const result = repository.reset();
      expect(result.status).toBe("reset_failed");
      const receipts = [
        result.rootRemoval,
        result.backupRemoval,
        result.sentinelWrite,
      ];
      const failedIndex = [ROOT, BACKUP, RESET].indexOf(failedKey);
      expect(receipts.map((receipt) => receipt.status)).toEqual(
        [0, 1, 2].map((index) =>
          index < failedIndex
            ? "acknowledged"
            : index === failedIndex
              ? "indeterminate"
              : "not_attempted",
        ),
      );
      expect(data.get(SETTINGS)).toBe("settings");
      expect(repository.load().status).not.toBe("current");
    },
  );
});
