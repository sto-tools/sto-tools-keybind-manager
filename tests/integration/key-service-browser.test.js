import { describe, it, beforeEach, afterEach, expect, vi } from "vitest";
import { createRealServiceFixture } from "../fixtures";
import KeyService from "../../src/js/components/services/KeyService.js";
import KeyBrowserService from "../../src/js/components/services/KeyBrowserService.js";
import LocalStorageKeyBrowserPersistence from "../../src/js/components/storage/LocalStorageKeyBrowserPersistence.js";
import { respond } from "../../src/js/core/requestResponse.js";
import { createDataCoordinatorState } from "../fixtures/core/componentState.js";

/** Helper to clone deep */
const deepClone = (obj) => JSON.parse(JSON.stringify(obj));

describe("Integration: KeyService ↔ KeyBrowserService", () => {
  let fixture,
    eventBus,
    keyService,
    keyBrowserService,
    profile,
    detachUpdateProfile;

  beforeEach(async () => {
    fixture = await createRealServiceFixture();
    eventBus = fixture.eventBus;

    // Base profile with two keys
    profile = {
      id: "testProfile",
      name: "Test Profile",
      builds: {
        space: {
          keys: {
            F1: [{ command: "FireAll", id: "c1" }],
            F2: [{ command: "Target_Enemy_Near", id: "c2" }],
          },
        },
        ground: { keys: {} },
      },
      aliases: {},
    };
    let revision = 1;

    // Stub DataCoordinator update-profile handler – mutates in-memory profile and emits broadcast
    detachUpdateProfile = respond(
      eventBus,
      "data:update-profile",
      async ({ profileId, add, delete: delParam }) => {
        if (profileId !== profile.id) return { success: false };

        // Handle additions
        if (add?.builds?.space?.keys) {
          const newKeys = add.builds.space.keys;
          Object.assign(profile.builds.space.keys, deepClone(newKeys));
        }
        // Handle deletions (array of key names)
        if (delParam?.builds?.space?.keys) {
          for (const k of delParam.builds.space.keys) {
            delete profile.builds.space.keys[k];
          }
        }

        revision += 1;
        eventBus.emit("data:state-changed", {
          reason: "profile-updated",
          state: createDataCoordinatorState({
            authorityEpoch: 1,
            revision,
            currentProfile: profile.id,
            currentEnvironment: "space",
            currentProfileData: deepClone(profile),
          }),
        });
        eventBus.emit("profile:updated", {
          profileId: profile.id,
          profile: deepClone(profile),
        });
        return { success: true, profile: deepClone(profile) };
      },
    );

    // Instantiate services
    keyService = new KeyService({ eventBus, ui: { showToast: vi.fn() } });
    await keyService.init();
    keyBrowserService = new KeyBrowserService({
      persistence: new LocalStorageKeyBrowserPersistence({
        storage: localStorage,
      }),
      eventBus,
    });
    await keyBrowserService.init();

    eventBus.emit("data:state-changed", {
      reason: "initial-load",
      state: createDataCoordinatorState({
        authorityEpoch: 1,
        revision,
        currentProfile: profile.id,
        currentEnvironment: "space",
        currentProfileData: deepClone(profile),
      }),
    });
  });

  afterEach(() => {
    detachUpdateProfile && detachUpdateProfile();
    fixture.destroy();
  });

  it("deleteKey should remove key and KeyBrowserService reflects change", async () => {
    const result = await keyService.deleteKey("F2");
    expect(result).toEqual({ success: true, key: "F2", environment: "space" });

    // Wait a tick for canonical state broadcast handling
    await new Promise((r) => setTimeout(r, 0));

    const keys = keyBrowserService.getKeys();
    expect(keys).not.toHaveProperty("F2");
    expect(keys).toHaveProperty("F1");
  });

  it("duplicateKey should create new key and KeyBrowserService reflects change", async () => {
    const result = await keyService.duplicateKey("F1");
    expect(result.success).toBe(true);
    expect(result.sourceKey).toBe("F1");
    expect(result.newKey).toContain("F1_copy");

    await new Promise((r) => setTimeout(r, 0));

    const keys = keyBrowserService.getKeys();
    const duplicatedKeyName = Object.keys(keys).find((k) =>
      k.startsWith("F1_copy"),
    );
    expect(duplicatedKeyName).toBeDefined();
    expect(keys).toHaveProperty(duplicatedKeyName);
  });
});
