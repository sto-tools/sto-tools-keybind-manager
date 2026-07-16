import { describe, it, beforeEach, afterEach, expect, vi } from "vitest";
import { createServiceFixture } from "../../fixtures/index.js";
import { createDataCoordinatorState } from "../../fixtures/core/componentState.js";
import DataCoordinator from "../../../src/js/components/services/DataCoordinator.js";
import VFXManagerService from "../../../src/js/components/services/VFXManagerService.js";
import CommandLibraryService from "../../../src/js/components/services/CommandLibraryService.js";

// Mock VFX_EFFECTS data for testing
const VFX_EFFECTS = {
  space: [{ effect: "Bloom" }, { effect: "FX_A" }, { effect: "engine_glow" }],
  ground: [
    { effect: "FX_GreenSmoke" },
    { effect: "FX_B" },
    { effect: "ground_sparkles" },
  ],
};

describe("VFXManagerService", () => {
  let fixture, service, eventBusFixture, coordinator, commandLibraryService;

  const profileWithVFX = (
    effect,
    showPlayerSay = false,
    id = "test-profile",
    aliases = {},
  ) => ({
    id,
    name: id,
    currentEnvironment: "space",
    builds: { space: { keys: {} }, ground: { keys: {} } },
    aliases,
    vertigoSettings: {
      selectedEffects: { space: effect ? [effect] : [], ground: [] },
      showPlayerSay,
    },
  });

  const emitDataState = (state, reason = "profile-updated") =>
    eventBusFixture.eventBus.emit(
      "data:state-changed",
      { reason, state },
      { synchronous: true },
    );

  beforeEach(() => {
    // Set up VFX_EFFECTS on window object for testing
    window.VFX_EFFECTS = VFX_EFFECTS;

    fixture = createServiceFixture();
    eventBusFixture = fixture.eventBusFixture;
    service = new VFXManagerService(eventBusFixture.eventBus, {
      t: (key) => key,
    });
    service.init();
  });

  afterEach(() => {
    commandLibraryService?.destroy();
    coordinator?.destroy();
    if (service && !service.destroyed) service.destroy();
    fixture.destroy();
    // Clean up window.VFX_EFFECTS to avoid test interference
    delete window.VFX_EFFECTS;
  });

  it("should toggle effect selection", () => {
    service.toggleEffect("space", "Bloom");
    expect(service.selectedEffects.space.has("Bloom")).toBe(true);

    service.toggleEffect("space", "Bloom");
    expect(service.selectedEffects.space.has("Bloom")).toBe(false);
  });

  it("should generate alias command with and without PlayerSay", () => {
    service.toggleEffect("ground", "FX_GreenSmoke");

    let cmd = service.generateAliasCommand("ground");
    expect(cmd).toEqual(["dynFxSetFXExlusionList FX_GreenSmoke"]);

    service.showPlayerSay = true;
    cmd = service.generateAliasCommand("ground");
    expect(cmd).toEqual([
      "dynFxSetFXExlusionList FX_GreenSmoke",
      "PlayerSay VFX Suppression Loaded",
    ]);
  });

  it("should combine effects across environments", () => {
    service.toggleEffect("space", "FX_A");
    service.toggleEffect("ground", "FX_B");

    const combined = service.generateCombinedAliasCommand(["space", "ground"]);
    expect(combined).toEqual(["dynFxSetFXExlusionList FX_A,FX_B"]);
  });

  it("should emit modal:hide after saveEffects", async () => {
    await emitDataState(
      createDataCoordinatorState({
        currentProfileData: profileWithVFX(null),
      }),
      "initial-load",
    );
    service.toggleEffect("space", "Bloom");
    eventBusFixture.clearEventHistory();

    // Only the update remains an action RPC; profile state comes from the cache.
    service.request = vi.fn(async (topic) => {
      if (topic === "data:update-profile") {
        return { success: true };
      }
      return null;
    });

    await service.saveEffects();

    // Verify modal:hide event was emitted
    eventBusFixture.expectEvent("modal:hide", { modalId: "vertigoModal" });
    expect(service.request).toHaveBeenCalledOnce();
    expect(service.request).toHaveBeenCalledWith("data:update-profile", {
      profileId: "test-profile",
      properties: {
        vertigoSettings: {
          selectedEffects: { space: ["Bloom"], ground: [] },
          showPlayerSay: false,
        },
      },
      updateSource: "VFXManagerService",
    });
  });

  it("publishes one derived VFX event for a real coordinator save", async () => {
    const storedProfile = {
      ...profileWithVFX(null),
      migrationVersion: "2.1.1",
    };
    fixture.storage.saveAllData({
      currentProfile: "test-profile",
      profiles: { "test-profile": storedProfile },
      settings: {},
      version: "1.0.0",
      lastModified: "2026-07-16T00:00:00.000Z",
    });
    coordinator = new DataCoordinator({
      eventBus: fixture.eventBus,
      storage: fixture.storage,
      i18n: { t: (key) => key },
    });
    coordinator.init();
    await vi.waitFor(() => {
      expect(service.cache.dataState?.ready).toBe(true);
    });
    service.toggleEffect("space", "Bloom");
    eventBusFixture.clearEventHistory();

    await service.saveEffects();

    eventBusFixture.expectEvent("vfx:settings-changed", {
      selectedEffects: { space: ["Bloom"], ground: [] },
      showPlayerSay: false,
    });
    eventBusFixture.expectEventCount("vfx:settings-changed", 1);
    expect(
      coordinator.getCurrentState().currentProfileData?.vertigoSettings,
    ).toEqual({
      selectedEffects: { space: ["Bloom"], ground: [] },
      showPlayerSay: false,
    });
  });

  it("does not publish saved VFX settings when the authoritative update fails", async () => {
    await emitDataState(
      createDataCoordinatorState({
        currentProfileData: profileWithVFX(null),
      }),
      "initial-load",
    );
    service.toggleEffect("space", "Bloom");
    eventBusFixture.clearEventHistory();
    service.request = vi.fn().mockRejectedValue(new Error("write failed"));

    await service.saveEffects();

    eventBusFixture.expectNoEvent("vfx:settings-changed");
    eventBusFixture.expectEvent("modal:hide", { modalId: "vertigoModal" });
  });

  it("derives VFX state from accepted revisions and a replacement authority", async () => {
    const first = createDataCoordinatorState({
      authorityEpoch: 30,
      revision: 1,
      currentProfileData: profileWithVFX("Bloom"),
    });
    await emitDataState(first, "initial-load");
    expect(Array.from(service.selectedEffects.space)).toEqual(["Bloom"]);

    const propertyCommit = createDataCoordinatorState({
      authorityEpoch: 30,
      revision: 2,
      currentProfileData: profileWithVFX("FX_A", true),
    });
    await emitDataState(propertyCommit);
    expect(Array.from(service.selectedEffects.space)).toEqual(["FX_A"]);
    expect(service.showPlayerSay).toBe(true);

    eventBusFixture.clearEventHistory();
    const unrelatedCommit = createDataCoordinatorState({
      authorityEpoch: 30,
      revision: 3,
      currentProfileData: profileWithVFX("FX_A", true),
      settings: { theme: "light" },
    });
    await emitDataState(unrelatedCommit, "settings-updated");
    eventBusFixture.expectNoEvent("vfx:settings-changed");

    const replacement = createDataCoordinatorState({
      authorityEpoch: 31,
      revision: 1,
      currentProfileData: profileWithVFX("engine_glow"),
    });
    await emitDataState(replacement, "initial-load");
    expect(Array.from(service.selectedEffects.space)).toEqual(["engine_glow"]);
    expect(service.showPlayerSay).toBe(false);

    const stalePredecessor = createDataCoordinatorState({
      authorityEpoch: 30,
      revision: 100,
      currentProfileData: profileWithVFX("Bloom", true),
    });
    await emitDataState(stalePredecessor);
    expect(service.cache.dataState.authorityEpoch).toBe(31);
    expect(Array.from(service.selectedEffects.space)).toEqual(["engine_glow"]);
    expect(service.showPlayerSay).toBe(false);
  });

  it("resets unsaved effects when profiles have identical saved VFX settings", async () => {
    const alpha = profileWithVFX(null, false, "alpha");
    await emitDataState(
      createDataCoordinatorState({
        authorityEpoch: 40,
        revision: 1,
        currentProfile: "alpha",
        currentProfileData: alpha,
        profiles: { alpha },
      }),
      "initial-load",
    );
    service.toggleEffect("space", "Bloom");
    eventBusFixture.clearEventHistory();

    const beta = profileWithVFX(null, false, "beta");
    await emitDataState(
      createDataCoordinatorState({
        authorityEpoch: 40,
        revision: 2,
        currentProfile: "beta",
        currentProfileData: beta,
        profiles: { alpha, beta },
      }),
      "profile-switched",
    );

    expect(service.cache.currentProfile).toBe("beta");
    expect(Array.from(service.selectedEffects.space)).toEqual([]);
    eventBusFixture.expectEvent("vfx:settings-changed", {
      selectedEffects: { space: [], ground: [] },
      showPlayerSay: false,
    });
    eventBusFixture.expectEventCount("vfx:settings-changed", 1);
  });

  it("clears predecessor VFX state for pre-ready replacement authority", async () => {
    const alpha = profileWithVFX("Bloom", true, "alpha");
    await emitDataState(
      createDataCoordinatorState({
        authorityEpoch: 50,
        revision: 7,
        currentProfile: "alpha",
        currentProfileData: alpha,
        profiles: { alpha },
      }),
      "initial-load",
    );
    eventBusFixture.clearEventHistory();

    await emitDataState(
      createDataCoordinatorState({
        authorityEpoch: 51,
        ready: false,
        revision: 0,
      }),
      "initial-load",
    );

    expect(service.cache.dataState).toMatchObject({
      authorityEpoch: 51,
      ready: false,
      revision: 0,
    });
    expect(service._vfxDataAuthorityEpoch).toBe(51);
    expect(service._vfxDataRevision).toBe(0);
    expect(Array.from(service.selectedEffects.space)).toEqual([]);
    expect(service.showPlayerSay).toBe(false);
    eventBusFixture.expectEvent("vfx:settings-changed", {
      selectedEffects: { space: [], ground: [] },
      showPlayerSay: false,
    });

    const beta = profileWithVFX("FX_A", false, "beta");
    await emitDataState(
      createDataCoordinatorState({
        authorityEpoch: 51,
        ready: true,
        revision: 1,
        currentProfile: "beta",
        currentProfileData: beta,
        profiles: { beta },
      }),
      "initial-load",
    );

    expect(service._vfxDataRevision).toBe(1);
    expect(Array.from(service.selectedEffects.space)).toEqual(["FX_A"]);
    eventBusFixture.expectEventCount("vfx:settings-changed", 2);
  });

  it("publishes VFX-derived aliases after profile consumers adopt the same revision", async () => {
    commandLibraryService = new CommandLibraryService({
      eventBus: fixture.eventBus,
      i18n: { t: (key) => key },
    });
    commandLibraryService.init();
    const combinedAliasEvents = [];
    fixture.eventBus.on("aliases-changed", ({ aliases }) => {
      combinedAliasEvents.push(aliases);
    });

    const alpha = profileWithVFX("Bloom", false, "alpha", {
      OldAlias: { commands: ["FireAll"] },
    });
    await emitDataState(
      createDataCoordinatorState({
        authorityEpoch: 60,
        revision: 1,
        currentProfile: "alpha",
        currentProfileData: alpha,
        profiles: { alpha },
      }),
      "initial-load",
    );
    await vi.waitFor(() => {
      expect(commandLibraryService.cache.combinedAliases).toHaveProperty(
        "OldAlias",
      );
    });
    combinedAliasEvents.length = 0;

    const beta = profileWithVFX("FX_A", false, "beta", {
      NewAlias: { commands: ["Target_Enemy_Near"] },
    });
    await emitDataState(
      createDataCoordinatorState({
        authorityEpoch: 60,
        revision: 2,
        currentProfile: "beta",
        currentProfileData: beta,
        profiles: { alpha, beta },
      }),
      "profile-switched",
    );

    await vi.waitFor(() => {
      const aliases = combinedAliasEvents.at(-1);
      expect(aliases).toHaveProperty("NewAlias");
      expect(aliases).not.toHaveProperty("OldAlias");
      expect(aliases.dynFxSetFXExclusionList_Space.commands).toEqual([
        "dynFxSetFXExlusionList FX_A",
      ]);
    });
  });

  it("transfers virtual-alias responder ownership across destroy and reinit", async () => {
    const retiredService = service;
    const retiredResponder = vi.spyOn(retiredService, "getVirtualVFXAliases");
    expect(fixture.eventBus.hasListeners("rpc:vfx:get-virtual-aliases")).toBe(
      true,
    );

    retiredService.destroy();
    expect(fixture.eventBus.hasListeners("rpc:vfx:get-virtual-aliases")).toBe(
      false,
    );

    service = new VFXManagerService(fixture.eventBus, {
      t: (key) => key,
    });
    const replacementResponder = vi.spyOn(service, "getVirtualVFXAliases");
    service.init();

    await expect(
      service.request("vfx:get-virtual-aliases"),
    ).resolves.toHaveProperty("dynFxSetFXExclusionList_Combined");
    expect(retiredResponder).not.toHaveBeenCalled();
    expect(replacementResponder).toHaveBeenCalledOnce();

    service.destroy();
    service.init();
    await service.request("vfx:get-virtual-aliases");

    expect(replacementResponder).toHaveBeenCalledTimes(2);
    expect(fixture.eventBus.hasListeners("rpc:vfx:get-virtual-aliases")).toBe(
      true,
    );
  });

  it("loads modal state from the accepted snapshot without a state query", async () => {
    await emitDataState(
      createDataCoordinatorState({
        currentProfileData: profileWithVFX("FX_A", true),
      }),
      "initial-load",
    );
    service.selectedEffects.space.clear();
    service.showPlayerSay = false;
    service.request = vi.fn();

    await service.showModal();

    expect(service.request).not.toHaveBeenCalled();
    expect(Array.from(service.selectedEffects.space)).toEqual(["FX_A"]);
    expect(service.showPlayerSay).toBe(true);
    eventBusFixture.expectEvent("vfx:modal-populate");
  });

  it("should select all effects for an environment using window.VFX_EFFECTS", () => {
    // Test that selectAllEffects works with explicit window.VFX_EFFECTS access
    // Regression test for: VFX_MANAGER_UNDEFINED_REFERENCE bug
    service.selectAllEffects("space");
    const selectedSpaceEffects = Array.from(service.selectedEffects.space);
    expect(selectedSpaceEffects.length).toBeGreaterThan(0);
    expect(selectedSpaceEffects).toContain("Bloom");
    expect(selectedSpaceEffects).toContain("FX_A");

    // Test ground environment
    service.selectAllEffects("ground");
    const selectedGroundEffects = Array.from(service.selectedEffects.ground);
    expect(selectedGroundEffects.length).toBeGreaterThan(0);
    expect(selectedGroundEffects).toContain("FX_GreenSmoke");
    expect(selectedGroundEffects).toContain("FX_B");
  });

  it("should handle invalid environment errors in selectAllEffects", () => {
    // Test error handling for invalid environments
    expect(() => service.selectAllEffects("invalid")).toThrow(
      "Invalid environment: invalid",
    );
  });
});
