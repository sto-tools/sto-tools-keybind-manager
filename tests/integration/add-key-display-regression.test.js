/**
 * Regression test for command chain display bug when adding new keys/aliases
 *
 * BUG: When adding a new key (e.g., F7) while another key (e.g., Space) is selected,
 * CommandChainService unnecessarily re-renders the OLD key's commands, which then
 * overwrites the NEW key's correct empty state.
 *
 * Historical root cause: CommandChainService refreshed the selected key from a
 * profile:updated handler. When adding F7:
 * 1. key:add updates profile → profile:updated emitted
 * 2. CommandChainService receives profile:updated → refreshCommands() for Space
 * 3. Space's commands fetched & chain-data-changed emitted (10 commands)
 * 4. CommandChainUI renders Space (UNNECESSARY!)
 * 5. key:add auto-selects F7 → selection:select-key
 * 6. F7's commands fetched & chain-data-changed emitted (0 commands)
 * 7. CommandChainUI renders F7 correctly
 * 8. Space's slow async work (parsing, mirroring) completes
 * 9. Space's render completes, overwriting F7's UI (BUG!)
 *
 * The shared ComponentBase listener now adopts the compatibility cache while
 * CommandChainService publishes only for explicit selection/command events.
 * This regression protects that ownership split.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createRealServiceFixture } from "../fixtures";
import CommandChainService from "../../src/js/components/services/CommandChainService.js";

describe("Integration: Add Key/Alias Display Regression", () => {
  let fixture, eventBus, chainService;
  let currentProfile;

  beforeEach(async () => {
    // Profile that will be mutated during tests
    currentProfile = {
      name: "Default",
      currentEnvironment: "space",
      builds: {
        space: {
          keys: {
            Space: [
              "+TrayExecByTray 8 0",
              "+TrayExecByTray 8 1",
              "+TrayExecByTray 8 2",
              "+TrayExecByTray 8 3",
              "+TrayExecByTray 8 4",
            ],
          },
        },
        ground: { keys: {} },
      },
      aliases: {},
    };

    fixture = await createRealServiceFixture({
      initialStorageData: {
        profiles: {
          default: currentProfile,
        },
        currentProfile: "default",
      },
    });
    eventBus = fixture.eventBus;

    // Create CommandChainService
    chainService = new CommandChainService({ eventBus });
    await chainService.init();

    // Switch to the initial profile so ComponentBase owns and populates the
    // compatibility cache before incremental updates arrive.
    eventBus.emit("profile:switched", {
      profileId: "default",
      environment: "space",
      profile: {
        name: "Default",
        currentEnvironment: "space",
        builds: {
          space: {
            keys: {
              Space: [
                "+TrayExecByTray 8 0",
                "+TrayExecByTray 8 1",
                "+TrayExecByTray 8 2",
                "+TrayExecByTray 8 3",
                "+TrayExecByTray 8 4",
              ],
            },
          },
          ground: { keys: {} },
        },
        aliases: {},
      },
    });

    // Select Space
    eventBus.emit("key-selected", { key: "Space" });
    await new Promise((resolve) => setTimeout(resolve, 10));
  });

  afterEach(() => {
    chainService?.destroy?.();
    fixture?.destroy?.();
  });

  it("FIXED: adding new key does NOT trigger unnecessary render of old key", async () => {
    // Track chain-data-changed emissions
    const chainDataEmissions = [];
    eventBus.on("chain-data-changed", ({ commands }) => {
      chainDataEmissions.push({
        commandCount: commands?.length ?? 0,
        timestamp: Date.now(),
      });
    });

    // Verify initial state: Space is selected
    expect(chainService.cache.selectedKey).toBe("Space");

    // Add a new key F7 (simulates what happens when user adds a key)
    // This should NOT trigger a render of Space's commands

    // Update profile to add F7
    currentProfile.builds.space.keys.F7 = [];

    eventBus.emit("profile:updated", {
      profileId: "default",
      profile: JSON.parse(JSON.stringify(currentProfile)),
    });

    // Wait for any potential async operations
    await new Promise((resolve) => setTimeout(resolve, 50));

    // FIXED: No chain-data-changed emission when adding F7
    expect(chainDataEmissions.length).toBe(0);
    expect(chainService.cache.profile.builds.space.keys).toHaveProperty(
      "F7",
      [],
    );

    // ComponentBase updates the profile cache, but UI refresh will happen when:
    // - key-selected event fires (when F7 is auto-selected after adding)
    // - User manually selects F7
  });

  it("profile:updated only updates cache, does not trigger UI refresh", async () => {
    // ComponentBase should update the cache without a service-specific refresh.
    // UI refreshes are triggered by specific events such as key-selected and
    // command-added.

    const chainDataEmissions = [];
    eventBus.on("chain-data-changed", ({ commands }) => {
      chainDataEmissions.push({
        commandCount: commands?.length ?? 0,
      });
    });

    // Modify Space's commands (currently selected key)
    currentProfile.builds.space.keys.Space = ["+TrayExecByTray 8 0"]; // Reduced from 5 to 1

    // Emit profile:updated - this should ONLY update the cache
    eventBus.emit("profile:updated", {
      profileId: "default",
      profile: JSON.parse(JSON.stringify(currentProfile)),
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    // No chain-data-changed emission from profile:updated
    expect(chainDataEmissions.length).toBe(0);
    expect(chainService.cache.profile.builds.space.keys.Space).toEqual([
      "+TrayExecByTray 8 0",
    ]);

    // The cache is updated internally, but UI refresh doesn't happen automatically.
    // UI refresh happens through explicit events:
    // - When CommandService.editCommand() is called, it emits command-edited
    // - When key selection changes, key-selected event is emitted
    // - When environment changes, environment:changed is emitted
    // These events trigger refreshCommands(), not profile:updated
  });
});
