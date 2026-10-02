import { describe, expect, it, vi } from "vitest";

export function storageFixture(entries = []) {
  const data = new Map(entries);
  const storage = {
    get length() {
      return data.size;
    },
    key: vi.fn((index) => [...data.keys()][index] ?? null),
    getItem: vi.fn((key) => data.get(key) ?? null),
    setItem: vi.fn((key, value) => data.set(key, value)),
    removeItem: vi.fn((key) => data.delete(key)),
  };
  return { data, storage };
}

export function scalarCapabilityTests(
  Adapter,
  load,
  key,
  mutation = null,
  args = [],
) {
  describe(`${Adapter.name} scalar capability boundary`, () => {
    it("uses only explicit storage under a poisoned ambient getter", () => {
      const prior = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
      const ambient = vi.fn(() => {
        throw new Error("ambient storage forbidden");
      });
      Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        get: ambient,
      });
      try {
        const { storage } = storageFixture([[key, "true"]]);
        const adapter = new Adapter({ storage });
        adapter[load]();
        if (mutation) adapter[mutation](...args);
        expect(ambient).not.toHaveBeenCalled();
      } finally {
        if (prior) Object.defineProperty(globalThis, "localStorage", prior);
        else delete globalThis.localStorage;
      }
    });

    it("retains no public capability or generic key access", () => {
      const { storage } = storageFixture();
      const adapter = new Adapter({ storage });
      expect(Object.keys(adapter)).toEqual([]);
      for (const method of [
        "getItem",
        "setItem",
        "removeItem",
        "key",
        "keys",
        "createMigrationInspectionPort",
      ]) {
        expect(adapter[method]).toBeUndefined();
      }
      const foreign = storageFixture().storage;
      adapter.storage = foreign;
      adapter[load]();
      expect(foreign.getItem).not.toHaveBeenCalled();
    });

    it.each([undefined, null, {}, { getItem: 1 }])(
      "rejects incomplete injected capability %#",
      (storage) => {
        expect(() => new Adapter({ storage })).toThrow(TypeError);
      },
    );

    it.each([undefined, 1, false, {}, []])(
      "rejects nonscalar persisted data %#",
      (value) => {
        const { storage } = storageFixture([[key, "true"]]);
        storage.getItem.mockReturnValue(value);
        expect(() => new Adapter({ storage })[load]()).toThrow(
          "invalid_scalar_value",
        );
        expect(storage.setItem).not.toHaveBeenCalled();
        expect(storage.removeItem).not.toHaveBeenCalled();
      },
    );

    it("propagates read errors without mutation", () => {
      const { storage } = storageFixture([[key, "true"]]);
      const error = new DOMException("blocked", "SecurityError");
      storage.getItem.mockImplementation(() => {
        throw error;
      });
      expect(() => new Adapter({ storage })[load]()).toThrow(error);
      expect(storage.setItem).not.toHaveBeenCalled();
      expect(storage.removeItem).not.toHaveBeenCalled();
    });

    if (mutation) {
      it("propagates mutation errors without swallowing owner failures", () => {
        const { storage } = storageFixture();
        const error = new DOMException("full", "QuotaExceededError");
        storage.setItem.mockImplementation(() => {
          throw error;
        });
        expect(() => new Adapter({ storage })[mutation](...args)).toThrow(
          error,
        );
      });
    }
  });
}
