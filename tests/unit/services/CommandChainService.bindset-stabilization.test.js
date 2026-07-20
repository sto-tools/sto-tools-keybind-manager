import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CommandChainService from "../../../src/js/components/services/CommandChainService.js";
import { createDataCoordinatorState } from "../../fixtures/core/componentState.js";
import { createServiceFixture } from "../../fixtures/index.js";

describe("CommandChainService bindset stabilization action", () => {
  let fixture;
  let service;
  let mockProfile;

  beforeEach(async () => {
    fixture = createServiceFixture();
    service = new CommandChainService({
      eventBus: fixture.eventBus,
      i18n: { t: (key) => key },
    });

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

  afterEach(() => {
    if (!service.destroyed) service.destroy();
    fixture.destroy();
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
      expect(service.emit).not.toHaveBeenCalled();
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
});
