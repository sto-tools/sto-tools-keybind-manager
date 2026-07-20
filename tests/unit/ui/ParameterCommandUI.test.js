import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ParameterCommandUI from "../../../src/js/components/ui/ParameterCommandUI.js";
import { captureCommandEditTarget } from "../../../src/js/components/services/commandChainEditPlanning.js";
import {
  createDataCoordinatorState,
  createSelectionState,
} from "../../fixtures/core/componentState.js";
import { createServiceFixture } from "../../fixtures/index.js";

const commandDef = {
  name: "Target by Name",
  categoryId: "definition-category",
  commandId: "definition-command",
  parameters: {
    entityName: { type: "text", default: "Alpha" },
  },
};

function createProfile() {
  return {
    id: "captain",
    name: "Captain",
    currentEnvironment: "space",
    builds: {
      space: { keys: { F1: ['Target "Alpha"'], F2: ["FireAll"] } },
      ground: { keys: { G1: ["Jump"] } },
    },
    aliases: { Alpha: { commands: ["FireAll"] } },
    bindsets: {
      Tactical: {
        space: { keys: { F1: ['Target "Alpha"'] } },
        ground: { keys: {} },
      },
    },
  };
}

function deferred() {
  let resolve;
  const promise = new Promise((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

describe("ParameterCommandUI lifecycle facade", () => {
  let fixture;
  let modalManager;
  let callbacks;
  let toastUI;
  let ui;
  let profile;
  let snapshot;

  function publishData({
    authorityEpoch = 7,
    revision = 1,
    currentEnvironment = "space",
    nextProfile = profile,
  } = {}) {
    snapshot = createDataCoordinatorState({
      authorityEpoch,
      revision,
      currentProfile: "captain",
      currentEnvironment,
      currentProfileData: nextProfile,
      profiles: { captain: nextProfile },
    });
    fixture.eventBus.emit("data:state-changed", {
      reason: "test-context",
      state: snapshot,
    });
  }

  function publishSelection({
    selectedKey = "F1",
    selectedAlias = null,
    currentEnvironment = "space",
  } = {}) {
    fixture.eventBus.emit(
      "selection:state-changed",
      createSelectionState({
        selectedKey,
        selectedAlias,
        currentEnvironment,
        cachedSelections: {
          space: selectedKey,
          ground: currentEnvironment === "ground" ? selectedKey : null,
          alias: selectedAlias,
        },
      }),
    );
  }

  function publishPreferences(bindsetsEnabled) {
    fixture.eventBus.emit("preferences:loaded", {
      settings: { bindsetsEnabled },
    });
  }

  async function openAdd() {
    expect(ui.showParameterModal("targeting", "target", commandDef)).toBe(true);
    await vi.waitFor(() => expect(ui.request).toHaveBeenCalled());
    ui.request.mockClear();
  }

  function requireEditTarget() {
    const target = captureCommandEditTarget({
      snapshot: ui.cache.dataState,
      currentEnvironment: ui.cache.currentEnvironment,
      selectedKey: ui.cache.selectedKey,
      selectedAlias: ui.cache.selectedAlias,
      activeBindset: ui.cache.activeBindset,
      bindsetsEnabled: ui.cache.preferences.bindsetsEnabled,
      index: 0,
    });
    expect(target).not.toBeNull();
    if (!target) throw new Error("Expected command edit target");
    return target;
  }

  async function openEdit() {
    const target = requireEditTarget();
    fixture.eventBus.emit("parameter-command:edit", {
      target,
      index: 0,
      command: {
        command: 'Target "Alpha"',
        parameters: { entityName: "Alpha" },
      },
      commandDef,
      categoryId: "payload-category",
      commandId: "payload-command",
    });
    await vi.waitFor(() => expect(ui.request).toHaveBeenCalled());
    ui.request.mockClear();
    return target;
  }

  beforeEach(() => {
    document.body.innerHTML = '<div id="modalOverlay"></div>';
    fixture = createServiceFixture();
    callbacks = new Map();
    modalManager = {
      show: vi.fn((id) => {
        document.getElementById(id)?.classList.add("active");
        return true;
      }),
      hide: vi.fn((id) => {
        document.getElementById(id)?.classList.remove("active");
        return true;
      }),
      registerRegenerateCallback: vi.fn((id, callback) => {
        callbacks.set(id, callback);
      }),
      unregisterRegenerateCallback: vi.fn((id, expected) => {
        if (!expected || callbacks.get(id) === expected) callbacks.delete(id);
      }),
    };
    toastUI = { showToast: vi.fn() };
    profile = createProfile();
    ui = new ParameterCommandUI({
      eventBus: fixture.eventBus,
      modalManager,
      i18n: { t: (key) => key },
      ui: toastUI,
      document,
    });
    ui.request = vi.fn().mockResolvedValue({ command: 'Target "Alpha"' });
    ui.init();
    publishData();
    publishSelection();
    publishPreferences(false);
    fixture.eventBus.emit("bindset-selector:active-changed", {
      bindset: "Tactical",
    });
    fixture.eventBusFixture.clearEventHistory();
  });

  afterEach(() => {
    if (!ui.destroyed) ui.destroy();
    fixture.destroy();
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("owns its listeners and modal session across destroy and reinitialization", async () => {
    expect(fixture.eventBus.getListenerCount("parameter-command:edit")).toBe(1);
    expect(fixture.eventBus.getListenerCount("modal:hidden")).toBe(1);
    expect(fixture.eventBus.getListenerCount("language:changed")).toBe(0);

    ui.destroy();
    expect(fixture.eventBus.getListenerCount("parameter-command:edit")).toBe(0);
    expect(fixture.eventBus.getListenerCount("modal:hidden")).toBe(0);

    ui.init();
    expect(fixture.eventBus.getListenerCount("parameter-command:edit")).toBe(1);
    expect(ui.showParameterModal("targeting", "target", commandDef)).toBe(true);
    await vi.waitFor(() => expect(modalManager.show).toHaveBeenCalledOnce());
  });

  it("rehydrates the active bindset before routing a post-reinit add", async () => {
    publishPreferences(true);
    ui.destroy();
    const detach = fixture.eventBus.on(
      "component:register",
      ({ name, replyTopic }) => {
        if (name !== "ParameterCommandUI" || !replyTopic) return;
        fixture.eventBus.emit(replyTopic, {
          sender: "BindsetSelectorService",
          state: {
            selectedKey: "F1",
            activeBindset: "Primary Bindset",
            bindsetNames: ["Primary Bindset", "Tactical"],
            keyBindsetMembership: new Map(),
            shouldDisplay: true,
            preferences: { bindsetsEnabled: true },
          },
        });
      },
    );

    ui.init();
    detach();
    expect(ui.cache.activeBindset).toBe("Primary Bindset");
    await openAdd();
    ui.request.mockResolvedValueOnce({ command: "FireAll" });

    await expect(ui.saveParameterCommand()).resolves.toBe(true);
    expect(
      fixture.eventBusFixture.getEventsOfType("command:add").at(-1)?.data,
    ).toMatchObject({ key: "F1", bindset: "Primary Bindset" });
  });

  it("ignores invalid definitions without creating modal state", () => {
    expect(
      ui.showParameterModal("targeting", "target", { name: "Target" }),
    ).toBe(false);
    expect(document.getElementById("parameterModal")).toBeNull();
  });

  it("does not advance context for a rejected stale coordinator snapshot", () => {
    publishData({ revision: 2 });
    const acceptedGeneration = ui.contextGeneration;
    publishData({ revision: 1 });
    expect(ui.contextGeneration).toBe(acceptedGeneration);
    expect(ui.cache.dataState?.revision).toBe(2);
  });

  it("adds against the exact accepted primary selection and effective bindset", async () => {
    await openAdd();
    ui.request.mockResolvedValueOnce({ command: "FireAll" });

    await expect(ui.saveParameterCommand()).resolves.toBe(true);

    expect(
      fixture.eventBusFixture.getEventsOfType("command:add").at(-1)?.data,
    ).toEqual({ command: { command: "FireAll" }, key: "F1", bindset: null });
  });

  it("preserves an enabled named bindset captured at save invocation", async () => {
    publishPreferences(true);
    await openAdd();
    ui.request.mockResolvedValueOnce({ command: "FireAll" });

    await expect(ui.saveParameterCommand()).resolves.toBe(true);

    expect(
      fixture.eventBusFixture.getEventsOfType("command:add").at(-1)?.data,
    ).toMatchObject({ key: "F1", bindset: "Tactical" });
  });

  it("uses the immutable edit target and payload identifiers for replacement", async () => {
    const target = await openEdit();
    ui.request.mockResolvedValueOnce({ command: 'Target "Beta"' });

    await expect(ui.saveParameterCommand()).resolves.toBe(true);

    expect(ui.request).toHaveBeenCalledWith("parameter-command:build", {
      categoryId: "payload-category",
      commandId: "payload-command",
      commandDef,
      params: { entityName: "Alpha" },
    });
    expect(
      fixture.eventBusFixture.getEventsOfType("command:edit").at(-1)?.data,
    ).toEqual({
      key: "F1",
      index: 0,
      updatedCommand: { command: 'Target "Beta"' },
      bindset: null,
      target,
    });
  });

  it("warns through the injected UI when no authoritative selection exists", async () => {
    publishSelection({ selectedKey: null });
    await openAdd();

    await expect(ui.saveParameterCommand()).resolves.toBe(false);

    expect(toastUI.showToast).toHaveBeenCalledWith(
      "please_select_a_key_first",
      "warning",
    );
    expect(fixture.eventBusFixture.getEventsOfType("command:add")).toEqual([]);
  });

  it.each([
    [
      "selection away and back",
      () => {
        publishSelection({ selectedKey: "F2" });
        publishSelection({ selectedKey: "F1" });
      },
    ],
    [
      "environment away and back",
      () => {
        publishSelection({ selectedKey: "G1", currentEnvironment: "ground" });
        publishSelection({ selectedKey: "F1", currentEnvironment: "space" });
      },
    ],
    [
      "bindset away and back",
      () => {
        fixture.eventBus.emit("bindset-selector:active-changed", {
          bindset: "Primary Bindset",
        });
        fixture.eventBus.emit("bindset-selector:active-changed", {
          bindset: "Tactical",
        });
      },
    ],
    [
      "preference away and back",
      () => {
        publishPreferences(true);
        publishPreferences(false);
      },
    ],
    ["accepted owner revision", () => publishData({ revision: 2 })],
  ])(
    "suppresses an add after %s during its build",
    async (_label, transition) => {
      await openAdd();
      const build = deferred();
      ui.request.mockReturnValueOnce(build.promise);

      const saving = ui.saveParameterCommand();
      await vi.waitFor(() => expect(ui.request).toHaveBeenCalledOnce());
      transition();
      build.resolve({ command: "FireAll" });

      await expect(saving).resolves.toBe(false);
      expect(fixture.eventBusFixture.getEventsOfType("command:add")).toEqual(
        [],
      );
    },
  );

  it("suppresses an edit after its selection moves away and back during build", async () => {
    await openEdit();
    const build = deferred();
    ui.request.mockReturnValueOnce(build.promise);

    const saving = ui.saveParameterCommand();
    await vi.waitFor(() => expect(ui.request).toHaveBeenCalledOnce());
    publishSelection({ selectedKey: "F2" });
    publishSelection({ selectedKey: "F1" });
    build.resolve({ command: 'Target "Beta"' });

    await expect(saving).resolves.toBe(false);
    expect(fixture.eventBusFixture.getEventsOfType("command:edit")).toEqual([]);
    expect(ui.currentParameterCommand).toBeNull();
    expect(modalManager.hide).toHaveBeenCalledWith("parameterModal");
    expect(toastUI.showToast).toHaveBeenCalledWith(
      "command_edit_target_changed",
      "warning",
    );
  });

  it("settles an edit when external modal ownership hides it", async () => {
    await openEdit();
    expect(ui.currentParameterCommand?.isEditing).toBe(true);

    fixture.eventBus.emit("modal:hidden", {
      modalId: "parameterModal",
      success: true,
    });

    expect(ui.currentParameterCommand).toBeNull();
    await expect(ui.saveParameterCommand()).resolves.toBe(false);
  });
});
