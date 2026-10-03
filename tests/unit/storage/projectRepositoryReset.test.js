import { describe, expect, it, vi } from "vitest";
import LocalStorageProjectRepository from "../../../src/js/components/storage/LocalStorageProjectRepository.js";
import { createProjectResetCheckpoint } from "../../../src/js/core/projectResetCheckpoint.js";
const ROOT = "sto_keybind_manager";
const BACKUP = "sto_keybind_manager_backup";
const RESET = "sto_app_reset";

describe("LocalStorageProjectRepository", () => {
  it.each([ROOT, BACKUP, RESET])(
    "verifies indeterminate %s already at target without replay",
    (key) => {
      const values = new Map([[RESET, "true"]]);
      const storage = {
        getItem: vi.fn((requested) => values.get(requested) ?? null),
        setItem: vi.fn((requested, value) => values.set(requested, value)),
        removeItem: vi.fn((requested) => values.delete(requested)),
      };
      const repository = new LocalStorageProjectRepository({
        storage,
        now: () => "2026-10-03T00:00:00.000Z",
        version: "2.0.0",
      });
      const checkpoint = createProjectResetCheckpoint();
      const method = key === RESET ? storage.setItem : storage.removeItem;
      const original = method.getMockImplementation();
      let fail = true;
      method.mockImplementation((requested, value) => {
        if (requested === key && fail) {
          fail = false;
          throw new Error("unacknowledged already-at-target write");
        }
        return original(requested, value);
      });
      expect(repository.reset(checkpoint).status).toBe("reset_failed");
      const calls = method.mock.calls.filter(
        ([requested]) => requested === key,
      ).length;
      const resumed = repository.reset(checkpoint);
      expect(resumed.status).toBe("reset");
      expect(
        resumed[
          {
            [ROOT]: "rootRemoval",
            [BACKUP]: "backupRemoval",
            [RESET]: "sentinelWrite",
          }[key]
        ],
      ).toEqual({ status: "verified" });
      expect(
        method.mock.calls.filter(([requested]) => requested === key),
      ).toHaveLength(calls);
    },
  );
});
