import { describe, it, expect, beforeEach, vi } from "vitest";
import CommandChainService from "../../../src/js/components/services/CommandChainService.js";
import { createDataCoordinatorState } from "../../fixtures/core/componentState.js";
import { eventBus } from "../../fixtures/core/eventBus.js";

describe("CommandChainService - Bindset Stabilization", () => {
  let service;
  let mockProfile;

  beforeEach(async () => {
    service = new CommandChainService({ eventBus, i18n: { t: (key) => key } });

    mockProfile = {
      id: "test_profile",
      name: "Test Profile",
      currentEnvironment: "space",
      aliases: {
        TestAlias: {
          commands: ["FirePhasers", "FireTorpedos"],
          description: "Test alias",
        },
      },
      keybindMetadata: {
        space: {
          F1: { stabilizeExecutionOrder: true },
        },
      },
      bindsetMetadata: {
        "Custom Bindset": {
          space: {
            F2: { stabilizeExecutionOrder: true },
          },
        },
      },
      aliasMetadata: {
        TestAlias: { stabilizeExecutionOrder: true },
      },
      builds: {
        space: {
          keys: {
            F1: ["FirePhasers", "FireTorpedos"],
            F3: ["SingleCommand"],
          },
        },
        ground: { keys: {} },
      },
      bindsets: {
        "Custom Bindset": {
          space: {
            keys: {
              F2: ["TrayExec1", "TrayExec2"],
              F4: ["NonStabilizedCommand"],
            },
          },
          ground: { keys: {} },
        },
      },
    };

    await service.init();

    // Set up service cache
    service.cache.profile = mockProfile;
    service.cache.currentProfile = "test_profile";
    service.currentEnvironment = "space";
    service.cache.currentEnvironment = "space";
    service._cacheDataState(
      createDataCoordinatorState({
        currentProfile: "test_profile",
        currentEnvironment: "space",
        currentProfileData: mockProfile,
        profiles: { test_profile: mockProfile },
      }),
    );
  });

  describe("isStabilized with bindset parameter", () => {
    it("should check primary bindset stabilization when no bindset specified", () => {
      expect(service.isStabilized("F1")).toBe(true);
      expect(service.isStabilized("F3")).toBe(false);
    });

    it("should check primary bindset stabilization when Primary Bindset specified", () => {
      expect(service.isStabilized("F1", "Primary Bindset")).toBe(true);
      expect(service.isStabilized("F3", "Primary Bindset")).toBe(false);
    });

    it("should check bindset-specific stabilization when bindset specified", () => {
      expect(service.isStabilized("F2", "Custom Bindset")).toBe(true);
      expect(service.isStabilized("F4", "Custom Bindset")).toBe(false);
    });

    it("should check alias stabilization regardless of bindset parameter", () => {
      expect(service.isStabilized("TestAlias")).toBe(true);
      expect(service.isStabilized("TestAlias", "Custom Bindset")).toBe(true);
      expect(service.isStabilized("TestAlias", "Primary Bindset")).toBe(true);
    });

    it("should return false for non-existent keys", () => {
      expect(service.isStabilized("NonExistent")).toBe(false);
      expect(service.isStabilized("NonExistent", "Custom Bindset")).toBe(false);
    });

    it("should return false for non-existent bindsets", () => {
      expect(service.isStabilized("F1", "NonExistent Bindset")).toBe(false);
    });
  });

  describe("setStabilize with bindset parameter", () => {
    beforeEach(() => {
      service.request = vi.fn().mockResolvedValue({
        success: true,
        profile: mockProfile,
      });
      service.emit = vi.fn();
    });

    it("should set primary bindset stabilization when no bindset specified", async () => {
      const result = await service.setStabilize("F3", true);

      expect(result.success).toBe(true);
      expect(service.request).toHaveBeenCalledWith("data:update-profile", {
        profileId: "test_profile",
        modify: {
          keybindMetadata: {
            space: {
              F3: { stabilizeExecutionOrder: true },
            },
          },
        },
      });
      expect(service.emit).toHaveBeenCalledWith("profile:updated", {
        profileId: "test_profile",
        profile: mockProfile,
      });
    });

    it("should set primary bindset stabilization when Primary Bindset specified", async () => {
      const result = await service.setStabilize("F3", true, "Primary Bindset");

      expect(result.success).toBe(true);
      expect(service.request).toHaveBeenCalledWith("data:update-profile", {
        profileId: "test_profile",
        modify: {
          keybindMetadata: {
            space: {
              F3: { stabilizeExecutionOrder: true },
            },
          },
        },
      });
    });

    it("should set bindset-specific stabilization when bindset specified", async () => {
      const result = await service.setStabilize("F4", true, "Custom Bindset");

      expect(result.success).toBe(true);
      expect(service.request).toHaveBeenCalledWith("data:update-profile", {
        profileId: "test_profile",
        modify: {
          bindsetMetadata: {
            "Custom Bindset": {
              space: {
                F4: { stabilizeExecutionOrder: true },
              },
            },
          },
        },
      });
    });

    it("should unset primary bindset stabilization", async () => {
      const result = await service.setStabilize("F1", false);

      expect(result.success).toBe(true);
      expect(service.request).toHaveBeenCalledWith("data:update-profile", {
        profileId: "test_profile",
        modify: {
          keybindMetadata: {
            space: {
              F1: { stabilizeExecutionOrder: false },
            },
          },
        },
      });
    });

    it("should unset bindset-specific stabilization", async () => {
      const result = await service.setStabilize("F2", false, "Custom Bindset");

      expect(result.success).toBe(true);
      expect(service.request).toHaveBeenCalledWith("data:update-profile", {
        profileId: "test_profile",
        modify: {
          bindsetMetadata: {
            "Custom Bindset": {
              space: {
                F2: { stabilizeExecutionOrder: false },
              },
            },
          },
        },
      });
    });

    it("should set alias stabilization regardless of bindset parameter", async () => {
      // Add the alias to the profile first so it's recognized as an alias
      mockProfile.aliases["NewAlias"] = {
        commands: ["test"],
        description: "test",
      };
      service._cacheDataState(
        createDataCoordinatorState({
          revision: 2,
          currentProfile: "test_profile",
          currentEnvironment: "space",
          currentProfileData: mockProfile,
          profiles: { test_profile: mockProfile },
        }),
      );

      const result = await service.setStabilize(
        "NewAlias",
        true,
        "Custom Bindset",
      );

      expect(result.success).toBe(true);
      expect(service.request).toHaveBeenCalledWith("data:update-profile", {
        profileId: "test_profile",
        modify: {
          aliasMetadata: {
            NewAlias: { stabilizeExecutionOrder: true },
          },
        },
      });
    });
  });

  describe("projection and action handlers with bindset parameter", () => {
    beforeEach(() => {
      service.onInit();
    });

    it("projects bindset stabilization from accepted state", () => {
      const result = service.isStabilized("F2", "Custom Bindset");
      expect(result).toBe(true);
    });

    it("should handle command:set-stabilize with bindset parameter", async () => {
      service.request = vi
        .fn()
        .mockResolvedValue({ success: true, profile: mockProfile });

      const result = await service.setStabilize("F4", true, "Custom Bindset");
      expect(result.success).toBe(true);
    });
  });

  describe("environment handling", () => {
    it("should check correct environment metadata for bindsets", () => {
      // Switch to ground environment in cache
      service.cache.currentEnvironment = "ground";

      // Add ground metadata for testing
      mockProfile.bindsetMetadata["Custom Bindset"].ground = {
        G1: { stabilizeExecutionOrder: true },
      };
      service._cacheDataState(
        createDataCoordinatorState({
          authorityEpoch: 2,
          revision: 1,
          currentProfile: "test_profile",
          currentEnvironment: "ground",
          currentProfileData: mockProfile,
          profiles: { test_profile: mockProfile },
        }),
      );

      expect(service.isStabilized("G1", "Custom Bindset")).toBe(true);
      expect(service.isStabilized("F2", "Custom Bindset")).toBe(false); // F2 is in space
    });
  });
});
