import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import CommandLibraryService from "../../src/js/components/services/CommandLibraryService.js";
import DataCoordinator from "../../src/js/components/services/DataCoordinator.js";
import VFXManagerService from "../../src/js/components/services/VFXManagerService.js";
import CommandLibraryUI from "../../src/js/components/ui/CommandLibraryUI.js";
import { respond } from "../../src/js/core/requestResponse.js";
import { createServiceFixture } from "../fixtures/index.js";
import { createDataCoordinatorState } from "../fixtures/core/componentState.js";

const i18n = {
  t: (key, options = {}) =>
    options.environment ? `${key}:${options.environment}` : key,
};

function profile(id, aliasName, effect) {
  return {
    id,
    name: id,
    currentEnvironment: "space",
    builds: { space: { keys: {} }, ground: { keys: {} } },
    aliases: {
      [aliasName]: {
        commands: ["FireAll"],
        description: `${aliasName} description`,
      },
    },
    vertigoSettings: {
      selectedEffects: { space: [effect], ground: [] },
      showPlayerSay: false,
    },
  };
}

describe("VFX virtual alias projection flow", () => {
  let fixture;
  let commandLibraryService;
  let vfxManagerService;
  let commandLibraryUI;
  let dataCoordinator;
  let detachResponders;

  beforeEach(() => {
    dataCoordinator = null;
    document.body.innerHTML = `
      <input id="commandSearch" value="">
      <div id="commandCategoriesList"></div>
      <div id="aliasCategoriesList"></div>
    `;
    localStorage.clear();

    fixture = createServiceFixture();
    detachResponders = [
      respond(
        fixture.eventBus,
        "parser:parse-command-string",
        ({ commandString }) => ({
          commands: [{ displayText: commandString }],
        }),
      ),
    ];
  });

  afterEach(() => {
    commandLibraryUI?.destroy();
    commandLibraryService?.destroy();
    vfxManagerService?.destroy();
    dataCoordinator?.destroy();
    detachResponders.splice(0).forEach((detach) => detach());
    fixture.destroy();
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  function initApplicationOwners() {
    vfxManagerService = new VFXManagerService(fixture.eventBus, i18n);
    commandLibraryService = new CommandLibraryService({
      eventBus: fixture.eventBus,
      i18n,
    });
    commandLibraryUI = new CommandLibraryUI({
      eventBus: fixture.eventBus,
      document,
      i18n,
    });

    vfxManagerService.init();
    commandLibraryService.init();
    commandLibraryUI.init();
  }

  it("hydrates saved VFX aliases on first paint and reprojects them after a real coordinator save", async () => {
    const alpha = {
      ...profile("alpha", "UserAlias", "Bloom"),
      migrationVersion: "2.1.1",
      bindsets: {},
      keybindMetadata: { space: {}, ground: {} },
      aliasMetadata: {},
      bindsetMetadata: {},
    };
    fixture.storageFixture.setData("sto_keybind_manager", {
      currentProfile: "alpha",
      profiles: { alpha },
      settings: {},
      version: "1.0.0",
      lastModified: "2026-07-16T00:00:00.000Z",
    });

    dataCoordinator = new DataCoordinator({
      eventBus: fixture.eventBus,
      storage: fixture.storage,
      i18n,
    });
    dataCoordinator.init();
    await vi.waitFor(() => {
      expect(dataCoordinator.getCurrentState()).toMatchObject({
        ready: true,
        currentProfile: "alpha",
      });
    });

    vfxManagerService = new VFXManagerService(fixture.eventBus, i18n);
    commandLibraryService = new CommandLibraryService({
      eventBus: fixture.eventBus,
      i18n,
    });
    commandLibraryUI = new CommandLibraryUI({
      eventBus: fixture.eventBus,
      document,
      i18n,
    });
    const categorySpy = vi.spyOn(
      commandLibraryUI,
      "createAliasCategoryElement",
    );

    vfxManagerService.init();
    commandLibraryService.init();
    commandLibraryUI.init();

    const projectedAlias = (name) => {
      const category = categorySpy.mock.calls
        .filter((call) => call[1] === "vertigo-aliases")
        .at(-1);
      return category?.[0].find(([aliasName]) => aliasName === name)?.[1];
    };

    await vi.waitFor(() => {
      expect(document.querySelector('[data-alias="UserAlias"]')).toBeTruthy();
      expect(document.querySelectorAll(".vertigo-alias-item")).toHaveLength(3);
      expect(projectedAlias("dynFxSetFXExclusionList_Space")?.commands).toEqual(
        ["dynFxSetFXExlusionList Bloom"],
      );
      expect(
        projectedAlias("dynFxSetFXExclusionList_Combined")?.commands,
      ).toEqual(["dynFxSetFXExlusionList Bloom"]);
    });
    expect(vfxManagerService.cache.dataState).toBe(
      dataCoordinator.getCurrentState(),
    );
    expect(commandLibraryUI.cache.dataState).toBe(
      dataCoordinator.getCurrentState(),
    );

    const initialRevision = dataCoordinator.getCurrentState().revision;
    vfxManagerService.toggleEffect("space", "FX_A");
    await vfxManagerService.saveEffects();

    await vi.waitFor(() => {
      expect(dataCoordinator.getCurrentState().revision).toBe(
        initialRevision + 1,
      );
      expect(
        dataCoordinator.getCurrentState().profiles.alpha.vertigoSettings,
      ).toEqual({
        selectedEffects: { space: ["Bloom", "FX_A"], ground: [] },
        showPlayerSay: false,
      });
      expect(projectedAlias("dynFxSetFXExclusionList_Space")?.commands).toEqual(
        ["dynFxSetFXExlusionList Bloom,FX_A"],
      );
      expect(
        projectedAlias("dynFxSetFXExclusionList_Combined")?.commands,
      ).toEqual(["dynFxSetFXExlusionList Bloom,FX_A"]);
    });
    expect(commandLibraryUI.cache.dataState).toBe(
      dataCoordinator.getCurrentState(),
    );
    expect(vfxManagerService.cache.dataState).toBe(
      dataCoordinator.getCurrentState(),
    );
    expect(
      fixture.eventBus.hasListeners("rpc:command:get-combined-aliases"),
    ).toBe(false);
    expect(fixture.eventBus.hasListeners("rpc:vfx:get-virtual-aliases")).toBe(
      false,
    );
  });

  it("renders one accepted profile revision and clears it for a replacement authority", async () => {
    initApplicationOwners();
    const categorySpy = vi.spyOn(
      commandLibraryUI,
      "createAliasCategoryElement",
    );
    const alpha = profile("alpha", "OldAlias", "Bloom");

    fixture.eventBus.emit("data:state-changed", {
      reason: "initial-load",
      state: createDataCoordinatorState({
        authorityEpoch: 60,
        revision: 1,
        currentProfileData: alpha,
        profiles: { alpha },
      }),
    });

    await vi.waitFor(() => {
      expect(document.querySelector('[data-alias="OldAlias"]')).toBeTruthy();
      expect(document.querySelectorAll(".vertigo-alias-item")).toHaveLength(3);
    });

    const beta = profile("beta", "NewAlias", "FX_A");
    fixture.eventBus.emit("data:state-changed", {
      reason: "profile-updated",
      state: createDataCoordinatorState({
        authorityEpoch: 60,
        revision: 2,
        currentProfileData: beta,
        profiles: { alpha, beta },
      }),
    });

    await vi.waitFor(() => {
      expect(document.querySelector('[data-alias="NewAlias"]')).toBeTruthy();
      expect(document.querySelector('[data-alias="OldAlias"]')).toBeNull();
      const latestVFXCategory = categorySpy.mock.calls
        .filter((call) => call[1] === "vertigo-aliases")
        .at(-1);
      const spaceAlias = latestVFXCategory?.[0].find(
        ([name]) => name === "dynFxSetFXExclusionList_Space",
      );
      expect(spaceAlias?.[1].commands).toEqual(["dynFxSetFXExlusionList FX_A"]);
    });

    // A delayed predecessor cannot restore either half of the old projection.
    fixture.eventBus.emit("data:state-changed", {
      reason: "profile-updated",
      state: createDataCoordinatorState({
        authorityEpoch: 59,
        revision: 100,
        currentProfileData: alpha,
        profiles: { alpha },
      }),
    });
    await Promise.resolve();
    expect(document.querySelector('[data-alias="NewAlias"]')).toBeTruthy();
    expect(document.querySelector('[data-alias="OldAlias"]')).toBeNull();

    fixture.eventBus.emit("data:state-changed", {
      reason: "initial-load",
      state: createDataCoordinatorState({
        authorityEpoch: 61,
        ready: false,
        revision: 0,
      }),
    });

    await vi.waitFor(() => {
      expect(
        document.getElementById("aliasCategoriesList")?.children,
      ).toHaveLength(0);
    });
    expect(
      fixture.eventBus.hasListeners("rpc:command:get-combined-aliases"),
    ).toBe(false);
    expect(fixture.eventBus.hasListeners("rpc:vfx:get-virtual-aliases")).toBe(
      false,
    );
  });

  it("prevents a delayed parser result from committing an older profile", async () => {
    detachResponders.at(-1)?.();
    detachResponders.pop();

    /** @type {Record<string, Array<() => void>>} */
    const releases = { alpha: [], beta: [] };
    let phase = "alpha";
    detachResponders.push(
      respond(
        fixture.eventBus,
        "parser:parse-command-string",
        ({ commandString }) =>
          new Promise((resolve) => {
            releases[phase].push(() =>
              resolve({ commands: [{ displayText: commandString }] }),
            );
          }),
      ),
    );
    initApplicationOwners();

    const alpha = profile("alpha", "OldAlias", "Bloom");
    fixture.eventBus.emit("data:state-changed", {
      reason: "initial-load",
      state: createDataCoordinatorState({
        authorityEpoch: 70,
        revision: 1,
        currentProfileData: alpha,
        profiles: { alpha },
      }),
    });
    expect(releases.alpha).toHaveLength(3);

    phase = "beta";
    const beta = profile("beta", "NewAlias", "FX_A");
    fixture.eventBus.emit("data:state-changed", {
      reason: "profile-updated",
      state: createDataCoordinatorState({
        authorityEpoch: 70,
        revision: 2,
        currentProfileData: beta,
        profiles: { alpha, beta },
      }),
    });
    expect(releases.beta).toHaveLength(3);

    releases.beta.forEach((release) => release());
    await vi.waitFor(() => {
      expect(document.querySelector('[data-alias="NewAlias"]')).toBeTruthy();
    });

    releases.alpha.forEach((release) => release());
    await Promise.resolve();
    await Promise.resolve();

    expect(document.querySelector('[data-alias="NewAlias"]')).toBeTruthy();
    expect(document.querySelector('[data-alias="OldAlias"]')).toBeNull();
  });
});
