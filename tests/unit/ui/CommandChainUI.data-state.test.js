import { afterEach, describe, expect, it, vi } from "vitest";

import CommandChainUI from "../../../src/js/components/ui/CommandChainUI.js";
import { createDataCoordinatorState } from "../../fixtures/core/componentState.js";
import { createEventBusFixture } from "../../fixtures/core/eventBus.js";

const documentStub = () => ({
  getElementById: vi.fn(),
  querySelector: vi.fn(),
  createElement: vi.fn(() => ({
    classList: { add: vi.fn(), remove: vi.fn(), toggle: vi.fn() },
    replaceChildren: vi.fn(),
    style: {},
  })),
});

describe("CommandChainUI accepted data state", () => {
  let fixture;
  let ui;

  afterEach(() => {
    if (ui && !ui.destroyed) ui.destroy();
    fixture?.destroy();
    vi.restoreAllMocks();
  });

  it("projects primary commands without a retired state query", async () => {
    fixture = createEventBusFixture();
    ui = new CommandChainUI({
      eventBus: fixture.eventBus,
      document: documentStub(),
      i18n: { t: (key) => key },
      ui: { showToast: vi.fn() },
    });
    const currentProfileData = {
      id: "captain",
      name: "Captain",
      currentEnvironment: "space",
      environment: "space",
      builds: {
        space: { keys: { F1: ["FireAll", { command: "Target_Enemy_Near" }] } },
        ground: { keys: {} },
      },
      bindsets: {
        Tactical: {
          space: { keys: { F1: ["Target_Enemy_Near"] } },
          ground: { keys: {} },
        },
      },
      aliases: {},
    };
    ui._cacheDataState(
      createDataCoordinatorState({
        authorityEpoch: 30,
        currentProfile: "captain",
        currentProfileData,
        profiles: { captain: currentProfileData },
      }),
    );
    ui.cache.selectedKey = "F1";
    ui.cache.activeBindset = "Primary Bindset";
    ui.cache.preferences.bindsetsEnabled = true;
    ui.request = vi.fn(async (topic) => {
      throw new Error(`Unexpected request: ${topic}`);
    });

    const commands = await ui.getCommandsForCurrentSelection();

    expect(commands).toEqual(["FireAll", { command: "Target_Enemy_Near" }]);
    expect(ui.request).not.toHaveBeenCalled();

    ui.cache.activeBindset = "Tactical";

    await expect(ui.getCommandsForCurrentSelection()).resolves.toEqual([
      "Target_Enemy_Near",
    ]);
    ui.cache.preferences.bindsetsEnabled = false;
    await expect(ui.getCommandsForCurrentSelection()).resolves.toEqual([
      "FireAll",
      { command: "Target_Enemy_Near" },
    ]);
    expect(ui.request).not.toHaveBeenCalled();
  });

  it("returns the pre-ready primary fallback without querying state", async () => {
    fixture = createEventBusFixture();
    ui = new CommandChainUI({
      eventBus: fixture.eventBus,
      document: documentStub(),
      i18n: { t: (key) => key },
      ui: { showToast: vi.fn() },
    });
    ui.cache.selectedKey = "F1";
    ui.cache.activeBindset = "Primary Bindset";
    ui.request = vi.fn(async (topic) => {
      throw new Error(`Unexpected request: ${topic}`);
    });

    await expect(ui.getCommandsForCurrentSelection()).resolves.toEqual([]);
    expect(ui.request).not.toHaveBeenCalled();
  });

  it("uses commands and stabilization from an accepted replacement authority", async () => {
    fixture = createEventBusFixture();
    const stabilizeButton = {
      disabled: false,
      classList: { toggle: vi.fn(), remove: vi.fn() },
    };
    const document = documentStub();
    document.getElementById.mockImplementation((id) =>
      id === "stabilizeExecutionOrderBtn" ? stabilizeButton : null,
    );
    ui = new CommandChainUI({
      eventBus: fixture.eventBus,
      document,
      i18n: { t: (key) => key },
      ui: { showToast: vi.fn() },
    });
    const originalProfile = {
      name: "Captain",
      currentEnvironment: "space",
      builds: { space: { keys: { F1: ["OldCommand"] } }, ground: { keys: {} } },
      aliases: {},
      keybindMetadata: { space: { F1: { stabilizeExecutionOrder: false } } },
    };
    ui._cacheDataState(
      createDataCoordinatorState({
        authorityEpoch: 40,
        revision: 8,
        currentProfile: "captain",
        currentProfileData: originalProfile,
        profiles: { captain: originalProfile },
      }),
    );
    ui.cache.selectedKey = "F1";
    ui.cache.activeBindset = "Primary Bindset";
    ui.cache.preferences.bindsetsEnabled = true;
    ui.request = vi.fn(async (topic) => {
      throw new Error(`Unexpected request: ${topic}`);
    });

    await expect(ui.getCommandsForCurrentSelection()).resolves.toEqual([
      "OldCommand",
    ]);
    await ui.updateChainActions();
    expect(stabilizeButton.classList.toggle).toHaveBeenLastCalledWith(
      "active",
      false,
    );

    const replacementProfile = {
      ...originalProfile,
      builds: {
        space: { keys: { F1: ["ReplacementCommand"] } },
        ground: { keys: {} },
      },
      keybindMetadata: { space: { F1: { stabilizeExecutionOrder: true } } },
    };
    ui._cacheDataState(
      createDataCoordinatorState({
        authorityEpoch: 41,
        revision: 0,
        currentProfile: "captain",
        currentProfileData: replacementProfile,
        profiles: { captain: replacementProfile },
      }),
    );

    await expect(ui.getCommandsForCurrentSelection()).resolves.toEqual([
      "ReplacementCommand",
    ]);
    await ui.updateChainActions();
    expect(stabilizeButton.classList.toggle).toHaveBeenLastCalledWith(
      "active",
      true,
    );
    expect(ui.request).not.toHaveBeenCalled();
  });

  it("toggles accepted primary metadata without rewriting disabled-bindset commands", async () => {
    fixture = createEventBusFixture();
    const stabilizeButton = {
      disabled: false,
      classList: {
        contains: vi.fn(() => false),
        toggle: vi.fn(),
        remove: vi.fn(),
      },
    };
    const bindsetBanner = { remove: vi.fn() };
    const document = documentStub();
    document.querySelector.mockReturnValue({ style: {} });
    document.getElementById.mockImplementation((id) => {
      if (id === "stabilizeExecutionOrderBtn") return stabilizeButton;
      return id === "bindsetBanner" ? bindsetBanner : null;
    });
    ui = new CommandChainUI({
      eventBus: fixture.eventBus,
      document,
      i18n: { t: (key) => key },
      ui: { showToast: vi.fn() },
    });
    const profile = {
      name: "Captain",
      currentEnvironment: "space",
      builds: {
        space: {
          keys: {
            F1: ["TrayExecByTray 0 0", "FireAll", "TrayExecByTray 1 0"],
          },
        },
        ground: { keys: {} },
      },
      bindsets: {
        Tactical: {
          space: { keys: { F1: ["named"] } },
          ground: { keys: {} },
        },
      },
      aliases: {},
      keybindMetadata: { space: { F1: { stabilizeExecutionOrder: true } } },
      bindsetMetadata: {
        Tactical: {
          space: { F1: { stabilizeExecutionOrder: false } },
        },
      },
    };
    ui._cacheDataState(
      createDataCoordinatorState({
        authorityEpoch: 42,
        revision: 1,
        currentProfile: "captain",
        currentProfileData: profile,
        profiles: { captain: profile },
      }),
    );
    ui.cache.selectedKey = "F1";
    ui.cache.activeBindset = "Tactical";
    ui.cache.preferences.bindsetsEnabled = false;
    ui.request = vi.fn().mockResolvedValue({ success: true });
    ui.render = vi.fn();
    ui.updateChainActions = vi.fn(ui.updateChainActions.bind(ui));

    await ui.updateChainActions();
    expect(stabilizeButton.classList.toggle).toHaveBeenLastCalledWith(
      "active",
      true,
    );
    ui.updateBindsetBanner();
    expect(bindsetBanner.remove).toHaveBeenCalledOnce();

    await ui.toggleStabilize();

    expect(ui.request).toHaveBeenCalledOnce();
    expect(ui.request).toHaveBeenCalledWith("command:set-stabilize", {
      name: "F1",
      stabilize: false,
      bindset: null,
    });
    expect(stabilizeButton.classList.contains).not.toHaveBeenCalled();
    expect(ui.updateChainActions).toHaveBeenCalledOnce();
    expect(ui.render).not.toHaveBeenCalled();
    await expect(ui.getCommandsForCurrentSelection()).resolves.toEqual([
      "TrayExecByTray 0 0",
      "FireAll",
      "TrayExecByTray 1 0",
    ]);
  });

  it("waits for selection and owner environments to converge before toggling", async () => {
    fixture = createEventBusFixture();
    ui = new CommandChainUI({
      eventBus: fixture.eventBus,
      document: documentStub(),
      i18n: { t: (key) => key },
      ui: { showToast: vi.fn() },
    });
    const profile = {
      name: "Captain",
      currentEnvironment: "space",
      builds: {
        space: { keys: { F1: ["SpaceCommand"] } },
        ground: { keys: { F1: ["GroundCommand"] } },
      },
      aliases: {},
      keybindMetadata: {
        space: { F1: { stabilizeExecutionOrder: true } },
        ground: { F1: { stabilizeExecutionOrder: false } },
      },
    };
    ui._cacheDataState(
      createDataCoordinatorState({
        authorityEpoch: 43,
        revision: 1,
        currentProfile: "captain",
        currentEnvironment: "space",
        currentProfileData: profile,
        profiles: { captain: profile },
      }),
    );
    ui.cache.selectedKey = "F1";
    ui.cache.activeBindset = "Primary Bindset";
    ui.cache.preferences.bindsetsEnabled = false;
    ui.cache.currentEnvironment = "ground";
    ui.request = vi.fn().mockResolvedValue({ success: true });

    await ui.toggleStabilize();
    expect(ui.request).not.toHaveBeenCalled();

    ui.cache.currentEnvironment = "space";
    await ui.toggleStabilize();
    expect(ui.request).toHaveBeenCalledOnce();
    expect(ui.request).toHaveBeenCalledWith("command:set-stabilize", {
      name: "F1",
      stabilize: false,
      bindset: null,
    });
  });
});
