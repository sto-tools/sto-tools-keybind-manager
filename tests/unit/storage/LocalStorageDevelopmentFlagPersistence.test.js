import { describe, expect, it, vi } from "vitest";
import LocalStorageDevelopmentFlagPersistence from "../../../src/js/components/storage/LocalStorageDevelopmentFlagPersistence.js";
import { scalarCapabilityTests } from "../../fixtures/persistence/scalarPersistence.js";

scalarCapabilityTests(
  LocalStorageDevelopmentFlagPersistence,
  "isEnabled",
  "dev-mode",
);

describe("LocalStorageDevelopmentFlagPersistence", () => {
  it.each([null, "", "false", "TRUE", "1", "true"])(
    "reads only the exact true sentinel (%s) using a read-only capability",
    (value) => {
      const storage = { getItem: vi.fn(() => value) };
      const adapter = new LocalStorageDevelopmentFlagPersistence({ storage });
      expect(adapter.isEnabled()).toBe(value === "true");
      expect(storage.getItem).toHaveBeenCalledExactlyOnceWith("dev-mode");
      expect(
        Object.getOwnPropertyNames(Object.getPrototypeOf(adapter)),
      ).toEqual(["constructor", "isEnabled"]);
    },
  );
});
