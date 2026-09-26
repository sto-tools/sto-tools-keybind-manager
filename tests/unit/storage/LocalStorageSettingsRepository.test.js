import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import LocalStorageSettingsRepository from "../../../src/js/components/storage/LocalStorageSettingsRepository.js";
import {
  MAX_PROJECT_JSON_BYTES,
  MAX_PROJECT_JSON_DEPTH,
} from "../../../src/js/components/services/jsonDataBoundary.js";

const KEY = "sto_keybind_settings";

function defaults() {
  return JSON.parse(
    readFileSync(
      "tests/fixtures/storage/complete-current-settings.json",
      "utf8",
    ),
  );
}

function setup(initial = null, initialDefaults = defaults()) {
  const data = new Map(initial === null ? [] : [[KEY, initial]]);
  const storage = {
    getItem: vi.fn((key) => data.get(key) ?? null),
    setItem: vi.fn((key, value) => {
      data.set(key, value);
    }),
    removeItem: vi.fn((key) => {
      data.delete(key);
    }),
  };
  const repository = new LocalStorageSettingsRepository({
    storage,
    defaults: initialDefaults,
  });
  return { data, storage, repository };
}

describe("LocalStorageSettingsRepository", () => {
  it("offers a frozen least-authority facade with fresh exact settings reads", () => {
    const { repository, storage, data } = setup();
    const load = vi.spyOn(repository, "load");
    const port = repository.createMigrationInspectionPort();
    expect(Reflect.ownKeys(port)).toEqual(["inspectRaw", "verify"]);
    expect(Object.isFrozen(port)).toBe(true);
    expect(storage.getItem).not.toHaveBeenCalled();
    const { inspectRaw } = port;
    for (const raw of [
      null,
      "",
      " {\n private malformed settings",
      JSON.stringify(defaults()),
    ]) {
      if (raw === null) data.delete(KEY);
      else data.set(KEY, raw);
      const result = inspectRaw();
      expect(result).toEqual({ status: "read", raw });
      result.raw = "caller mutation";
      expect(inspectRaw()).toEqual({ status: "read", raw });
    }
    expect(storage.getItem.mock.calls.every(([key]) => key === KEY)).toBe(true);
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.removeItem).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
  });

  it("verifies exact current serialized settings without claiming a write", () => {
    const value = defaults();
    const { repository, storage, data } = setup(JSON.stringify(value));
    const { verify } = repository.createMigrationInspectionPort();
    expect(verify(value)).toEqual({ status: "verified" });
    expect(storage.getItem).toHaveBeenCalledExactlyOnceWith(KEY);
    for (const changed of [
      null,
      JSON.stringify(value, null, 2),
      "{",
      JSON.stringify({
        ...value,
        language: value.language === "de" ? "fr" : "de",
      }),
    ]) {
      if (changed === null) data.delete(KEY);
      else data.set(KEY, changed);
      expect(verify(value)).toEqual({
        status: "failed",
        error: "verification_failed",
        reason: "value_mismatch",
      });
    }
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.removeItem).not.toHaveBeenCalled();
  });

  it("rejects hostile or incomplete expected settings before any storage read", () => {
    const { repository, storage } = setup();
    const getter = vi.fn(() => "dark");
    const accessor = Object.defineProperty(defaults(), "theme", {
      enumerable: true,
      get: getter,
    });
    const cyclic = defaults();
    cyclic.loop = cyclic;
    const proxy = new Proxy(defaults(), {
      ownKeys() {
        throw new Error("private proxy details");
      },
    });
    for (const expected of [
      null,
      false,
      {},
      { theme: "dark" },
      accessor,
      cyclic,
      proxy,
      { ...defaults(), oversized: "x".repeat(MAX_PROJECT_JSON_BYTES) },
    ]) {
      expect(
        repository.createMigrationInspectionPort().verify(expected),
      ).toEqual({
        status: "failed",
        error: "verification_failed",
        reason: "invalid_data",
      });
    }
    expect(getter).not.toHaveBeenCalled();
    expect(storage.getItem).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.removeItem).not.toHaveBeenCalled();
  });

  it("redacts inspection and verification read failures", () => {
    const value = defaults();
    const { repository, storage } = setup(JSON.stringify(value));
    storage.getItem.mockImplementation(() => {
      throw new DOMException("private standalone settings", "SecurityError");
    });
    const port = repository.createMigrationInspectionPort();
    expect(port.inspectRaw()).toEqual({
      status: "read_failed",
      error: "storage_read_failed",
      category: "security",
    });
    expect(port.verify(value)).toEqual({
      status: "failed",
      error: "verification_failed",
      reason: "read_failed",
    });
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.removeItem).not.toHaveBeenCalled();
  });

  it.each(["throw", "invalid"])(
    "rejects a %s strict readback decode",
    (mode) => {
      const value = defaults();
      const { repository, storage } = setup(JSON.stringify(value));
      const original = JSON.parse;
      const parse = vi
        .spyOn(JSON, "parse")
        .mockImplementationOnce(original)
        .mockImplementationOnce(() => {
          if (mode === "throw") throw new Error("private decoder failure");
          return { theme: "invalid incomplete data" };
        });
      try {
        expect(
          repository.createMigrationInspectionPort().verify(value),
        ).toEqual({
          status: "failed",
          error: "verification_failed",
          reason: "invalid_data",
        });
        expect(storage.getItem).toHaveBeenCalledExactlyOnceWith(KEY);
        expect(storage.setItem).not.toHaveBeenCalled();
        expect(storage.removeItem).not.toHaveBeenCalled();
      } finally {
        parse.mockRestore();
      }
    },
  );

  it.each([undefined, null, {}, { getItem() {}, setItem() {} }])(
    "requires an explicit complete storage capability %#",
    (storage) => {
      expect(
        () =>
          new LocalStorageSettingsRepository({ storage, defaults: defaults() }),
      ).toThrow("invalid_storage_capability");
    },
  );

  it.each([undefined, null, {}, { theme: "dark" }])(
    "requires complete defaults %#",
    (value) => {
      const { storage } = setup();
      expect(
        () => new LocalStorageSettingsRepository({ storage, defaults: value }),
      ).toThrow("invalid_settings_defaults");
      expect(storage.getItem).not.toHaveBeenCalled();
      expect(storage.setItem).not.toHaveBeenCalled();
    },
  );

  it("detaches construction defaults once and returns independent load snapshots", () => {
    const input = defaults();
    const expected = defaults();
    const { repository, storage } = setup(null, input);
    input.theme = "mutated";
    input["plugin:layout"].density = "mutated";
    const first = repository.load();
    expect(first).toEqual({
      status: "repair_required",
      reason: "missing",
      value: expected,
    });
    first.value["plugin:layout"].density = "returned-mutation";
    expect(repository.load().value).toEqual(expected);
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.removeItem).not.toHaveBeenCalled();
  });

  it("rejects invalid construction defaults without invoking their accessors", () => {
    const { storage } = setup();
    const getter = vi.fn(() => "dark");
    const value = defaults();
    Object.defineProperty(value, "theme", { get: getter, enumerable: true });
    expect(
      () => new LocalStorageSettingsRepository({ storage, defaults: value }),
    ).toThrow("invalid_settings_defaults");
    expect(getter).not.toHaveBeenCalled();
    expect(storage.getItem).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it.each([
    ["{", "invalid_json"],
    ["[]", "invalid_data"],
    ['{"theme":"dark"}', "repaired"],
  ])("recovers readable storage failures without writing %#", (raw, reason) => {
    const { repository, storage, data } = setup(raw);
    const result = repository.load();
    expect(result.status).toBe("repair_required");
    expect(result.reason).toBe(reason);
    expect(result.value.autoSave).toBe(defaults().autoSave);
    expect(storage.getItem).toHaveBeenCalledExactlyOnceWith(KEY);
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.removeItem).not.toHaveBeenCalled();
    expect(data.get(KEY)).toBe(raw);
  });

  it("loads the latest complete record without a cache or unrelated reads", () => {
    const first = defaults();
    const { repository, storage, data } = setup(JSON.stringify(first));
    expect(repository.load()).toEqual({ status: "current", value: first });
    const second = { ...first, theme: "dark" };
    data.set(KEY, JSON.stringify(second));
    expect(repository.load()).toEqual({ status: "current", value: second });
    expect(storage.getItem.mock.calls).toEqual([[KEY], [KEY]]);
  });

  it.each([
    ["SecurityError", "security"],
    ["QuotaExceededError", "quota"],
    ["Error", "unknown"],
  ])("fails closed on read exceptions (%s)", (name, category) => {
    const { repository, storage } = setup();
    storage.getItem.mockImplementation(() => {
      throw Object.assign(new Error("private contents"), { name });
    });
    expect(repository.load()).toEqual({
      status: "read_failed",
      error: "storage_read_failed",
      category,
    });
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.removeItem).not.toHaveBeenCalled();
  });

  it("replaces only the fixed settings key, verifies, and detaches both directions", () => {
    const { repository, storage, data } = setup();
    data.set("sto_keybind_manager", "untouched-root");
    const input = defaults();
    const expected = JSON.stringify(input);
    const result = repository.replace(input);
    expect(result).toEqual({
      status: "committed",
      value: input,
      write: { status: "acknowledged" },
      verification: { status: "verified" },
    });
    expect(storage.setItem).toHaveBeenCalledExactlyOnceWith(KEY, expected);
    expect(storage.getItem).toHaveBeenCalledExactlyOnceWith(KEY);
    input["plugin:layout"].density = "input-mutated";
    expect(result.value["plugin:layout"].density).toBe("compact");
    result.value["plugin:layout"].density = "output-mutated";
    expect(data.get(KEY)).toBe(expected);
    expect(data.get("sto_keybind_manager")).toBe("untouched-root");
    expect(repository.load().value["plugin:layout"].density).toBe("compact");
  });

  it("never merges partial replacement into stored settings or defaults", () => {
    const original = JSON.stringify(defaults());
    const { repository, storage, data } = setup(original);
    expect(repository.replace({ theme: "dark" })).toEqual({
      status: "rejected",
      error: "invalid_data",
      write: { status: "not_attempted" },
      verification: { status: "not_attempted" },
    });
    expect(storage.getItem).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(data.get(KEY)).toBe(original);
  });

  it("does not merge obsolete stored extensions into a complete replacement", () => {
    const { repository, data } = setup(
      JSON.stringify({ ...defaults(), obsolete: true }),
    );
    expect(repository.replace(defaults()).status).toBe("committed");
    expect(JSON.parse(data.get(KEY))).not.toHaveProperty("obsolete");
  });

  it("rejects cycles, deep nesting, and oversized replacements before storage access", () => {
    const { repository, storage } = setup();
    const cyclic = {};
    cyclic.self = cyclic;
    let deep = "leaf";
    for (let level = 0; level < MAX_PROJECT_JSON_DEPTH; level++)
      deep = { next: deep };
    for (const extension of [
      cyclic,
      deep,
      "a".repeat(MAX_PROJECT_JSON_BYTES),
    ]) {
      expect(repository.replace({ ...defaults(), extension })).toMatchObject({
        status: "rejected",
        error: "invalid_data",
        write: { status: "not_attempted" },
      });
    }
    expect(storage.getItem).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("returns a closed serialization failure before any write", () => {
    const { repository, storage } = setup();
    const input = defaults();
    const parse = vi.spyOn(JSON, "parse").mockImplementationOnce(() => {
      throw new Error("private serialization failure");
    });
    try {
      expect(repository.replace(input)).toEqual({
        status: "rejected",
        error: "serialization_failed",
        write: { status: "not_attempted" },
        verification: { status: "not_attempted" },
      });
      expect(storage.getItem).not.toHaveBeenCalled();
      expect(storage.setItem).not.toHaveBeenCalled();
    } finally {
      parse.mockRestore();
    }
  });

  it("rejects malformed known, compatibility, and extension values before any storage operation", () => {
    const { repository, storage } = setup();
    const getter = vi.fn(() => "dark");
    const accessor = defaults();
    Object.defineProperty(accessor, "theme", { get: getter, enumerable: true });
    for (const input of [
      accessor,
      { ...defaults(), theme: 1 },
      { ...defaults(), firstRun: "true" },
      { ...defaults(), extension: new Date() },
    ]) {
      expect(repository.replace(input)).toMatchObject({
        status: "rejected",
        error: "invalid_data",
        write: { status: "not_attempted" },
      });
    }
    expect(getter).not.toHaveBeenCalled();
    expect(storage.getItem).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it.each([
    ["QuotaExceededError", "quota"],
    ["SecurityError", "security"],
    ["Error", "unknown"],
  ])(
    "reports indeterminate durability when setItem throws (%s)",
    (name, category) => {
      const { repository, storage, data } = setup("old");
      storage.setItem.mockImplementation((key, value) => {
        data.set(key, value);
        throw Object.assign(new Error("private contents"), { name });
      });
      expect(repository.replace(defaults())).toEqual({
        status: "write_failed",
        error: "storage_write_failed",
        write: {
          status: "indeterminate",
          error: "storage_write_failed",
          category,
        },
        verification: { status: "not_attempted" },
      });
      expect(data.get(KEY)).toBe(JSON.stringify(defaults()));
      expect(storage.getItem).not.toHaveBeenCalled();
    },
  );

  it("distinguishes an acknowledged write from throwing readback verification", () => {
    const { repository, storage, data } = setup();
    storage.getItem.mockImplementation(() => {
      throw new Error("private read failure");
    });
    expect(repository.replace(defaults())).toEqual({
      status: "verification_failed",
      error: "verification_failed",
      write: { status: "acknowledged" },
      verification: {
        status: "failed",
        error: "verification_failed",
        reason: "read_failed",
      },
    });
    expect(data.get(KEY)).toBe(JSON.stringify(defaults()));
  });

  it.each(["throws", "partial"])(
    "requires strict canonical decoding after exact readback (%s)",
    (failure) => {
      const { repository, storage, data } = setup();
      const input = defaults();
      let parse;
      storage.setItem.mockImplementation((key, value) => {
        data.set(key, value);
        parse = vi.spyOn(JSON, "parse").mockImplementationOnce(() => {
          if (failure === "throws") throw new Error("private decoder failure");
          return { theme: "dark" };
        });
      });
      try {
        expect(repository.replace(input)).toEqual({
          status: "verification_failed",
          error: "verification_failed",
          write: { status: "acknowledged" },
          verification: {
            status: "failed",
            error: "verification_failed",
            reason: "invalid_data",
          },
        });
      } finally {
        parse?.mockRestore();
      }
    },
  );

  it.each([null, "{}", JSON.stringify(defaults(), null, 2)])(
    "requires exact-string readback equality %#",
    (actual) => {
      const { repository, storage } = setup();
      storage.getItem.mockReturnValue(actual);
      expect(repository.replace(defaults())).toMatchObject({
        status: "verification_failed",
        write: { status: "acknowledged" },
        verification: { status: "failed", reason: "value_mismatch" },
      });
      expect(storage.setItem).toHaveBeenCalledTimes(1);
    },
  );

  it("clears only settings and reports removal acknowledgement without claiming verification", () => {
    const { repository, storage, data } = setup("old");
    data.set("sto_app_reset", "true");
    data.set("sto_keybind_manager", "root");
    expect(repository.clear()).toEqual({
      status: "cleared",
      removal: { status: "acknowledged" },
    });
    expect(storage.removeItem).toHaveBeenCalledExactlyOnceWith(KEY);
    expect(storage.getItem).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
    expect([...data.entries()]).toEqual([
      ["sto_app_reset", "true"],
      ["sto_keybind_manager", "root"],
    ]);
  });

  it.each([false, true])(
    "reports indeterminate clear even if failure follows mutation (%s)",
    (mutate) => {
      const { repository, storage, data } = setup("old");
      storage.removeItem.mockImplementation((key) => {
        if (mutate) data.delete(key);
        throw new DOMException("private contents", "SecurityError");
      });
      expect(repository.clear()).toEqual({
        status: "clear_failed",
        removal: {
          status: "indeterminate",
          error: "storage_write_failed",
          category: "security",
        },
      });
      expect(data.has(KEY)).toBe(!mutate);
      expect(storage.getItem).not.toHaveBeenCalled();
    },
  );
});
