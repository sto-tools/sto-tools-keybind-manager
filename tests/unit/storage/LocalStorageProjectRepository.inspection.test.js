import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import LocalStorageProjectRepository from "../../../src/js/components/storage/LocalStorageProjectRepository.js";

const ROOT = "sto_keybind_manager";
const fixture = (name) =>
  readFileSync(`tests/fixtures/storage/${name}`, "utf8").trim();

function setup() {
  const data = new Map();
  const storage = {
    getItem: vi.fn((key) => data.get(key) ?? null),
    setItem: vi.fn((key, value) => data.set(key, value)),
    removeItem: vi.fn((key) => data.delete(key)),
  };
  const now = vi.fn(() => "2026-07-15T12:00:00.000Z");
  const repository = new LocalStorageProjectRepository({
    storage,
    now,
    version: "2.0.0",
  });
  return { repository, storage, data, now };
}

afterEach(() => vi.restoreAllMocks());

describe("Project repository read-only migration inspection", () => {
  it("offers only fresh exact root reads through a frozen migration facade", () => {
    const { repository, storage, data, now } = setup();
    const load = vi.spyOn(repository, "load");
    const port = repository.createMigrationInspectionPort();
    expect(Reflect.ownKeys(port)).toEqual(["inspectRaw"]);
    expect(Object.isFrozen(port)).toBe(true);
    expect(storage.getItem).not.toHaveBeenCalled();
    const { inspectRaw } = port;
    for (const raw of [
      null,
      "",
      " {\n  malformed private root",
      fixture("complete-current-root.json"),
    ]) {
      if (raw === null) data.delete(ROOT);
      else data.set(ROOT, raw);
      const result = inspectRaw();
      expect(result).toEqual({ status: "read", raw });
      result.raw = "caller mutation";
      expect(inspectRaw()).toEqual({ status: "read", raw });
    }
    expect(storage.getItem.mock.calls.every(([key]) => key === ROOT)).toBe(
      true,
    );
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.removeItem).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
    expect(now).not.toHaveBeenCalled();
  });

  it("redacts raw-inspection failures without consulting backup or reset state", () => {
    const { repository, storage } = setup();
    storage.getItem.mockImplementationOnce(() => {
      throw new DOMException("private root payload", "SecurityError");
    });
    expect(repository.createMigrationInspectionPort().inspectRaw()).toEqual({
      status: "read_failed",
      error: "storage_read_failed",
      category: "security",
    });
    expect(storage.getItem).toHaveBeenCalledExactlyOnceWith(ROOT);
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.removeItem).not.toHaveBeenCalled();
  });
});
