// Test to verify Phase 1a state ownership fixes
import { describe, it, expect, beforeEach } from "vitest";
import { createServiceFixture } from "../../fixtures/services/harness.js";

// Import the services we fixed
import KeyService from "../../../src/js/components/services/KeyService.js";
import KeyBrowserService from "../../../src/js/components/services/KeyBrowserService.js";
import CommandService from "../../../src/js/components/services/CommandService.js";
import ParameterCommandService from "../../../src/js/components/services/ParameterCommandService.js";
import VFXManagerService from "../../../src/js/components/services/VFXManagerService.js";
import AliasBrowserService from "../../../src/js/components/services/AliasBrowserService.js";

const createEmptyKeyBrowserStorage = () => ({
  length: 0,
  key: () => null,
  getItem: () => null,
  setItem: () => {},
});

const emptyKeyBrowserViewState = () => ({
  authorityEpoch: expect.any(Number),
  revision: 0,
  collapsedCategories: {
    command: [],
    keyType: [],
  },
  collapsedBindsets: [],
});

describe("Phase 1a: State Ownership Fixes", () => {
  let harness;

  beforeEach(async () => {
    harness = createServiceFixture();
  });

  describe("KeyService getCurrentState()", () => {
    it("should return empty state (no longer owns selection)", async () => {
      const service = new KeyService({
        storage: harness.storage,
        eventBus: harness.eventBus,
        i18n: { t: (key) => key },
        ui: { showToast: () => {} },
      });
      await service.init();

      const state = service.getCurrentState();

      // Should return null (uses ComponentBase default implementation)
      expect(state).toBe(null);
    });
  });

  describe("KeyBrowserService getCurrentState()", () => {
    it("should return only its owned view-collapse state", async () => {
      const service = new KeyBrowserService({
        eventBus: harness.eventBus,
        localStorage: createEmptyKeyBrowserStorage(),
      });
      await service.init();

      const state = service.getCurrentState();

      expect(state).toEqual(emptyKeyBrowserViewState());
      expect(state.authorityEpoch).toBeGreaterThanOrEqual(1);

      // Selection, profile, environment, and key data remain with their owners.
      expect(state).not.toHaveProperty("selectedKey");
      expect(state).not.toHaveProperty("selectedAlias");
      expect(state).not.toHaveProperty("currentProfile");
      expect(state).not.toHaveProperty("currentEnvironment");
      expect(state).not.toHaveProperty("profiles");
      expect(state).not.toHaveProperty("keys");
      expect(state).not.toHaveProperty("aliases");
    });
  });

  describe("CommandService getCurrentState()", () => {
    it("should return empty state (no longer owns selection)", async () => {
      const service = new CommandService({
        storage: harness.storage,
        eventBus: harness.eventBus,
        i18n: { t: (key) => key },
      });
      await service.init();

      const state = service.getCurrentState();

      // Should return null (uses ComponentBase default implementation)
      expect(state).toBe(null);
    });
  });

  describe("ParameterCommandService getCurrentState()", () => {
    it("should return null after editing state moved to its live owners", async () => {
      const service = new ParameterCommandService({
        eventBus: harness.eventBus,
      });
      await service.init();

      const state = service.getCurrentState();

      expect(state).toBeNull();
    });
  });

  describe("VFXManagerService getCurrentState()", () => {
    it("should only return owned state (VFX effects)", async () => {
      const service = new VFXManagerService(harness.eventBus);
      await service.init();

      const state = service.getCurrentState();

      // Should only contain owned state
      expect(state).toHaveProperty("selectedEffects");
      expect(state).toHaveProperty("showPlayerSay");

      // Should NOT contain non-owned state
      expect(state).not.toHaveProperty("currentProfile");
    });
  });

  describe("AliasBrowserService getCurrentState()", () => {
    it("should only return owned state (selection cache)", async () => {
      const service = new AliasBrowserService({
        storage: harness.storage,
        eventBus: harness.eventBus,
        ui: { showToast: () => {} },
      });
      await service.init();

      const state = service.getCurrentState();

      // Should return null (uses ComponentBase default implementation)
      expect(state).toBe(null);
    });
  });

  describe("All Services State Ownership Compliance", () => {
    it("should not return profile/environment context from non-owning services", async () => {
      const services = [
        new KeyService({
          storage: harness.storage,
          eventBus: harness.eventBus,
          i18n: { t: (key) => key },
          ui: { showToast: () => {} },
        }),
        new KeyBrowserService({
          eventBus: harness.eventBus,
          localStorage: createEmptyKeyBrowserStorage(),
        }),
        new CommandService({
          storage: harness.storage,
          eventBus: harness.eventBus,
          i18n: { t: (key) => key },
        }),
        new ParameterCommandService({ eventBus: harness.eventBus }),
        new VFXManagerService(harness.eventBus),
        new AliasBrowserService({
          storage: harness.storage,
          eventBus: harness.eventBus,
          ui: { showToast: () => {} },
        }),
      ];

      for (const service of services) {
        await service.init();
        const state = service.getCurrentState();

        // If state is null, it's compliant (using ComponentBase default)
        if (state === null) {
          continue;
        }

        if (service instanceof KeyBrowserService) {
          expect(state).toEqual(emptyKeyBrowserViewState());
        }

        // For services that return non-null state, ensure they don't return non-owned properties
        expect(state).not.toHaveProperty(
          "currentProfile",
          `${service.componentName} should not return currentProfile`,
        );
        expect(state).not.toHaveProperty(
          "currentEnvironment",
          `${service.componentName} should not return currentEnvironment`,
        );
        expect(state).not.toHaveProperty(
          "profiles",
          `${service.componentName} should not return profiles`,
        );
        expect(state).not.toHaveProperty(
          "keys",
          `${service.componentName} should not return keys`,
        );
        expect(state).not.toHaveProperty(
          "aliases",
          `${service.componentName} should not return aliases`,
        );
      }
    });
  });
});
