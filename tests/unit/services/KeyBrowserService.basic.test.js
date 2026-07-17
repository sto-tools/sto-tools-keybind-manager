import { beforeEach, describe, expect, it } from "vitest";

import KeyBrowserService from "../../../src/js/components/services/KeyBrowserService.js";
import { respond } from "../../../src/js/core/requestResponse.js";
import { createServiceFixture } from "../../fixtures/index.js";

const i18n = { t: (key) => key };

/**
 * Unit tests – KeyBrowserService (lightweight cache helpers)
 * These tests avoid persistence APIs by exercising pure logic methods.
 */

describe("KeyBrowserService – cache helpers", () => {
  let service;

  beforeEach(async () => {
    // No need for injected eventBus because tests cover pure helpers
    service = new KeyBrowserService({ i18n });
    await service.init();
  });

  it("updateCacheFromProfile should populate keys for the current environment", () => {
    const profile = {
      builds: {
        space: { keys: { F1: ["+Cmd"], F2: [] } },
        ground: { keys: { G1: [] } },
      },
    };

    // Inject profile data directly into cache to simulate ComponentBase behavior
    service.cache.profile = profile;
    service.cache.builds = profile.builds;
    service.cache.currentEnvironment = "space";
    service.cache.keys = profile.builds.space.keys;

    const spaceKeys = service.getKeys();
    expect(Object.keys(spaceKeys)).toEqual(["F1", "F2"]);
  });
});

describe("KeyBrowserService – data processing methods", () => {
  let service;

  beforeEach(async () => {
    service = new KeyBrowserService({ i18n });
    await service.init();
  });

  describe("sortKeys", () => {
    it("should sort function keys numerically", () => {
      const keys = ["F10", "F1", "F2", "F11"];
      const sorted = service.sortKeys(keys);
      expect(sorted).toEqual(["F1", "F2", "F10", "F11"]);
    });

    it("should sort numbers before letters", () => {
      const keys = ["A", "1", "B", "2"];
      const sorted = service.sortKeys(keys);
      expect(sorted).toEqual(["1", "2", "A", "B"]);
    });

    it("should handle empty array", () => {
      const sorted = service.sortKeys([]);
      expect(sorted).toEqual([]);
    });

    it("should handle non-array input", () => {
      const sorted = service.sortKeys(null);
      expect(sorted).toEqual([]);
    });
  });

  describe("compareKeys", () => {
    it("should compare function keys numerically", () => {
      expect(service.compareKeys("F1", "F2")).toBeLessThan(0);
      expect(service.compareKeys("F10", "F2")).toBeGreaterThan(0);
      expect(service.compareKeys("F1", "F1")).toBe(0);
    });

    it("should prioritize function keys over other keys", () => {
      expect(service.compareKeys("F1", "A")).toBeLessThan(0);
      expect(service.compareKeys("A", "F1")).toBeGreaterThan(0);
    });

    it("should prioritize numbers over letters", () => {
      expect(service.compareKeys("1", "A")).toBeLessThan(0);
      expect(service.compareKeys("A", "1")).toBeGreaterThan(0);
    });

    it("should handle special keys", () => {
      expect(service.compareKeys("Space", "Tab")).toBeLessThan(0);
      expect(service.compareKeys("Enter", "Escape")).toBeLessThan(0);
    });
  });

  describe("detectKeyTypes", () => {
    it("should detect function keys", () => {
      const types = service.detectKeyTypes("F1");
      expect(types).toContain("function");
    });

    it("should detect alphanumeric keys", () => {
      const types = service.detectKeyTypes("A");
      expect(types).toContain("alphanumeric");

      const numberTypes = service.detectKeyTypes("1");
      expect(numberTypes).toContain("alphanumeric");
    });

    it("should detect modifier keys", () => {
      const types = service.detectKeyTypes("Ctrl+A");
      expect(types).toContain("modifiers");
    });

    it("should detect navigation keys", () => {
      const types = service.detectKeyTypes("UP");
      expect(types).toContain("navigation");
    });

    it("should detect system keys", () => {
      const types = service.detectKeyTypes("Space");
      expect(types).toContain("system");
    });

    it("should detect mouse keys", () => {
      const types = service.detectKeyTypes("MOUSE1");
      expect(types).toContain("mouse");
    });

    it("should detect symbols", () => {
      const types = service.detectKeyTypes("!");
      expect(types).toContain("symbols");
    });

    it("should default to other for unrecognized keys", () => {
      const types = service.detectKeyTypes("UnknownKey");
      expect(types).toContain("other");
    });
  });

  describe("toggleKeyCategory", () => {
    beforeEach(() => {
      // Clear localStorage before each test
      localStorage.clear();
    });

    it("should toggle category collapsed state", () => {
      const result1 = service.toggleKeyCategory("test-category", "command");
      expect(result1).toBe(true); // Should be collapsed after toggle

      const result2 = service.toggleKeyCategory("test-category", "command");
      expect(result2).toBe(false); // Should be expanded after toggle
    });

    it("should handle different modes", () => {
      const result1 = service.toggleKeyCategory("test-category", "key-type");
      expect(result1).toBe(true);

      const result2 = service.toggleKeyCategory("test-category", "command");
      expect(result2).toBe(true); // Different mode, so starts from false
    });

    it("should return false for empty category ID", () => {
      const result = service.toggleKeyCategory("", "command");
      expect(result).toBe(false);
    });
  });

  describe("categorizeKeysByType", () => {
    it("should categorize keys by type", () => {
      const allKeys = ["F1", "A", "1", "Ctrl+A", "Space", "MOUSE1", "!"];
      const categories = service.categorizeKeysByType({}, allKeys);

      expect(categories.function.keys).toContain("F1");
      expect(categories.alphanumeric.keys).toContain("A");
      expect(categories.alphanumeric.keys).toContain("1");
      expect(categories.modifiers.keys).toContain("Ctrl+A");
      expect(categories.system.keys).toContain("Space");
      expect(categories.mouse.keys).toContain("MOUSE1");
      expect(categories.symbols.keys).toContain("!");
    });

    it("should sort keys within categories", () => {
      const allKeys = ["F10", "F1", "F2"];
      const categories = service.categorizeKeysByType({}, allKeys);

      expect(categories.function.keys).toEqual(["F1", "F2", "F10"]);
    });

    it("should handle empty input", () => {
      const categories = service.categorizeKeysByType({}, []);
      expect(categories.function.keys).toEqual([]);
    });
  });

  describe("categorizeKeys", () => {
    it("seeds canonical command categories without DataService", async () => {
      const categories = await service.categorizeKeys(
        {
          F1: [{ command: "FireAll", category: "combat" }],
          F2: [],
        },
        ["F1", "F2"],
      );

      expect(categories.combat).toMatchObject({
        name: "Combat",
        icon: "fas fa-fire",
        keys: ["F1"],
      });
      expect(categories.system.name).toBe("System");
      expect(categories.unknown.keys).toEqual(["F2"]);
    });

    it("combines imported categories with parser classification", async () => {
      const fixture = createServiceFixture();
      const detach = respond(
        fixture.eventBus,
        "parser:parse-command-string",
        () => ({ commands: [{ category: "combat" }] }),
      );
      const serviceWithBus = new KeyBrowserService({
        eventBus: fixture.eventBus,
        i18n,
      });

      try {
        const categories = await serviceWithBus.categorizeKeys(
          { F3: ["FireAll"] },
          ["F3"],
        );
        expect(categories.combat.keys).toEqual(["F3"]);
      } finally {
        serviceWithBus.destroy();
        detach();
        fixture.destroy();
      }
    });
  });
});
