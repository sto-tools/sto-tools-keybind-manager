import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import CommandChainService from "../../src/js/components/services/CommandChainService.js";
import CommandService from "../../src/js/components/services/CommandService.js";
import DataCoordinator from "../../src/js/components/services/DataCoordinator.js";
import ParameterCommandService from "../../src/js/components/services/ParameterCommandService.js";
import ParameterCommandUI from "../../src/js/components/ui/ParameterCommandUI.js";
import { request } from "../../src/js/core/requestResponse.js";
import { getCommandCategories } from "../../src/js/data/commandCatalog.js";
import { STOCommandParser } from "../../src/js/lib/STOCommandParser.js";
import {
  createPreferencesState,
  createSelectionState,
} from "../fixtures/core/componentState.js";
import { createRealServiceFixture } from "../fixtures/index.js";

const profile = {
  name: "Captain",
  description: "Parameter command owner pipeline fixture",
  currentEnvironment: "space",
  builds: {
    space: {
      keys: {
        F1: ['Target "Alpha"', 'Target "Second"'],
        F2: ["PrimaryExisting"],
      },
    },
    ground: { keys: {} },
  },
  aliases: {},
  bindsets: {
    Tactical: {
      space: { keys: { F2: ["TacticalExisting"] } },
      ground: { keys: {} },
    },
  },
  keybindMetadata: { space: {} },
  migrationVersion: "2.1.1",
};

const root = {
  version: "1.0.0",
  created: "2026-01-01T00:00:00.000Z",
  lastModified: "2026-01-01T00:00:00.000Z",
  currentProfile: "captain",
  profiles: { captain: profile },
  globalAliases: {},
  settings: { bindsetsEnabled: false },
};

function deferred() {
  let resolve;
  const promise = new Promise((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

function createModalManager(eventBus) {
  const callbacks = new Map();
  return {
    show(modalId) {
      const modal = document.getElementById(modalId);
      if (!modal) return false;
      modal.classList.add("active");
      return true;
    },
    hide(modalId) {
      const modal = document.getElementById(modalId);
      if (!modal) return false;
      modal.classList.remove("active");
      eventBus.emit("modal:hidden", { modalId, success: true });
      return true;
    },
    registerRegenerateCallback(modalId, callback) {
      callbacks.set(modalId, callback);
    },
    unregisterRegenerateCallback(modalId, expectedCallback) {
      if (
        expectedCallback === undefined ||
        callbacks.get(modalId) === expectedCallback
      ) {
        callbacks.delete(modalId);
      }
    },
  };
}

function targetDefinition() {
  return getCommandCategories().targeting.commands.target;
}

describe("Parameter command EventBus owner pipeline", () => {
  let fixture;
  let eventBus;
  let coordinator;
  let parameterService;
  let commandService;
  let chainService;
  let parameterUI;
  let toastUI;
  let detachers;

  function listen(topic, handler) {
    const detach = eventBus.on(topic, handler);
    detachers.push(detach);
  }

  async function publishContext({
    selectedKey = "F1",
    bindsetsEnabled = false,
    activeBindset = "Tactical",
  } = {}) {
    await eventBus.emit(
      "selection:state-changed",
      createSelectionState({
        selectedKey,
        currentEnvironment: "space",
        cachedSelections: {
          space: selectedKey,
          ground: null,
          alias: null,
        },
      }),
      { synchronous: true },
    );
    await eventBus.emit(
      "preferences:loaded",
      createPreferencesState({ bindsetsEnabled }),
      { synchronous: true },
    );
    await eventBus.emit(
      "bindset-selector:active-changed",
      { bindset: activeBindset },
      { synchronous: true },
    );
  }

  async function openAdd(definition) {
    expect(
      parameterUI.showParameterModal("targeting", "target", definition),
    ).toBe(true);
    await vi.waitFor(() => {
      expect(
        document.getElementById("parameterCommandPreview")?.textContent,
      ).toBe('Target "EntityName"');
    });
  }

  async function openEdit(index = 0) {
    await eventBus.emit("commandchain:edit", { index }, { synchronous: true });
    await vi.waitFor(() => {
      expect(parameterUI.currentParameterCommand?.isEditing).toBe(true);
      expect(
        document.getElementById("parameterCommandPreview")?.textContent,
      ).toBe('Target "Alpha"');
    });
  }

  function setEntityName(value) {
    const input = document.getElementById("param_entityName");
    if (!(input instanceof HTMLInputElement)) {
      throw new Error("Expected parameter entity-name input");
    }
    input.value = value;
  }

  beforeEach(async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    document.body.innerHTML = '<div id="modalOverlay"></div>';
    fixture = await createRealServiceFixture({
      initialStorageData: { sto_keybind_manager: root },
    });
    eventBus = fixture.eventBus;
    detachers = [];
    const i18n = {
      t: (key, options) => options?.defaultValue || key,
    };
    toastUI = { showToast: vi.fn() };

    coordinator = new DataCoordinator({
      eventBus,
      storage: fixture.storage,
      i18n,
    });
    coordinator.init();
    await vi.waitFor(() => {
      expect(coordinator.getCurrentState().ready).toBe(true);
    });

    new STOCommandParser(eventBus);
    parameterService = new ParameterCommandService({ eventBus });
    commandService = new CommandService({ eventBus, i18n, ui: toastUI });
    chainService = new CommandChainService({ eventBus, i18n });
    parameterUI = new ParameterCommandUI({
      eventBus,
      modalManager: createModalManager(eventBus),
      i18n,
      document,
    });

    parameterService.init();
    commandService.init();
    chainService.init();
    parameterUI.init();
    await vi.waitFor(() => {
      expect(parameterUI.cache.dataState?.ready).toBe(true);
      expect(commandService.cache.dataState?.ready).toBe(true);
      expect(chainService.cache.dataState?.ready).toBe(true);
    });
    await publishContext();
    fixture.storage.saveProfile.mockClear();
  });

  afterEach(() => {
    for (const detach of detachers.reverse()) detach();
    if (!parameterUI.destroyed) parameterUI.destroy();
    if (!chainService.destroyed) chainService.destroy();
    if (!commandService.destroyed) commandService.destroy();
    if (!parameterService.destroyed) parameterService.destroy();
    if (!coordinator.destroyed) coordinator.destroy();
    fixture.destroy();
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("builds an add through RPC and commits it to the exact selected bindset target", async () => {
    const buildRequests = [];
    const addRequests = [];
    const addedEvents = [];
    listen("rpc:parameter-command:build", ({ payload }) => {
      buildRequests.push(structuredClone(payload));
    });
    listen("command:add", (payload) => addRequests.push(payload));
    listen("command-added", (payload) => addedEvents.push(payload));
    await publishContext({ selectedKey: "F2", bindsetsEnabled: true });
    const definition = targetDefinition();
    await openAdd(definition);
    buildRequests.length = 0;
    const revisionBefore = coordinator.getCurrentState().revision;
    setEntityName("Borg Queen");

    await expect(parameterUI.saveParameterCommand()).resolves.toBe(true);
    await vi.waitFor(() => {
      expect(coordinator.getCurrentState().revision).toBe(revisionBefore + 1);
    });

    expect(buildRequests).toEqual([
      {
        categoryId: "targeting",
        commandId: "target",
        commandDef: definition,
        params: { entityName: "Borg Queen" },
      },
    ]);
    expect(addRequests).toHaveLength(1);
    expect(addRequests[0]).toEqual({
      command: expect.objectContaining({
        command: 'Target "Borg Queen"',
        type: "targeting",
        parameters: { entityName: "Borg Queen" },
      }),
      key: "F2",
      bindset: "Tactical",
    });
    expect(addedEvents).toEqual([
      { key: "F2", command: addRequests[0].command },
    ]);
    const persisted = fixture.storage.getProfile("captain");
    expect(persisted.builds.space.keys.F2).toEqual(["PrimaryExisting"]);
    expect(persisted.bindsets.Tactical.space.keys.F2).toEqual([
      "TacticalExisting",
      'Target "Borg Queen"',
    ]);
  });

  it("carries a real immutable chain target through UI build and the owner precondition", async () => {
    const parameterEdits = [];
    const buildRequests = [];
    const editRequests = [];
    const editedEvents = [];
    listen("parameter-command:edit", (payload) => parameterEdits.push(payload));
    listen("rpc:parameter-command:build", ({ payload }) => {
      buildRequests.push(structuredClone(payload));
    });
    listen("command:edit", (payload) => editRequests.push(payload));
    listen("command-edited", (payload) => editedEvents.push(payload));
    await publishContext({
      bindsetsEnabled: true,
      activeBindset: "Primary Bindset",
    });
    await openEdit();
    buildRequests.length = 0;
    const revisionBefore = coordinator.getCurrentState().revision;
    setEntityName("Beta");

    await expect(parameterUI.saveParameterCommand()).resolves.toBe(true);
    await vi.waitFor(() => {
      expect(coordinator.getCurrentState().revision).toBe(revisionBefore + 1);
    });

    expect(parameterEdits).toHaveLength(1);
    const target = parameterEdits[0].target;
    expect(Object.isFrozen(target)).toBe(true);
    expect(target).toMatchObject({
      authorityEpoch: coordinator.getCurrentState().authorityEpoch,
      revision: revisionBefore,
      profileId: "captain",
      environment: "space",
      name: "F1",
      bindset: null,
      index: 0,
      originalEntry: 'Target "Alpha"',
    });
    expect(buildRequests).toEqual([
      {
        categoryId: "targeting",
        commandId: "target",
        commandDef: parameterEdits[0].commandDef,
        params: { entityName: "Beta" },
      },
    ]);
    expect(editRequests).toHaveLength(1);
    expect(editRequests[0]).toMatchObject({
      key: "F1",
      index: 0,
      updatedCommand: { command: 'Target "Beta"' },
      bindset: null,
    });
    expect(editRequests[0].target).toBe(target);
    expect(editedEvents).toHaveLength(1);
    expect(toastUI.showToast).not.toHaveBeenCalled();
    expect(editedEvents[0]).toMatchObject({
      key: "F1",
      index: 0,
      updatedCommand: { command: 'Target "Beta"' },
      commands: ['Target "Beta"', 'Target "Second"'],
    });
    expect(fixture.storage.getProfile("captain").builds.space.keys.F1).toEqual([
      'Target "Beta"',
      'Target "Second"',
    ]);
  });

  it("rejects a parameter edit queued behind an owner revision that shifts its index", async () => {
    const parameterEdits = [];
    const editRequests = [];
    const editedEvents = [];
    listen("parameter-command:edit", (payload) => parameterEdits.push(payload));
    listen("command:edit", (payload) => editRequests.push(payload));
    listen("command-edited", (payload) => editedEvents.push(payload));
    await openEdit();
    const target = parameterEdits[0].target;
    setEntityName("Stale Replacement");

    const writeStarted = deferred();
    const releaseWrite = deferred();
    const saveProfile = fixture.storage.saveProfile.getMockImplementation();
    if (!saveProfile) throw new Error("Expected storage fixture writer");
    fixture.storage.saveProfile.mockImplementationOnce(async (...args) => {
      writeStarted.resolve();
      await releaseWrite.promise;
      return saveProfile(...args);
    });
    const editCommand = vi.spyOn(commandService, "editCommand");
    const deleting = request(eventBus, "command:delete", {
      key: "F1",
      index: 0,
      bindset: null,
    });
    await writeStarted.promise;

    let uiAccepted;
    try {
      uiAccepted = await parameterUI.saveParameterCommand();
      await vi.waitFor(() => expect(editCommand).toHaveBeenCalledOnce());
    } finally {
      releaseWrite.resolve();
    }
    const staleEdit = editCommand.mock.results[0].value;

    await expect(deleting).resolves.toBe(true);
    await expect(staleEdit).resolves.toBe(false);
    expect(uiAccepted).toBe(true);
    expect(coordinator.getCurrentState().revision).toBe(target.revision + 1);
    expect(editRequests).toHaveLength(1);
    expect(editRequests[0].target).toBe(target);
    expect(editedEvents).toEqual([]);
    expect(toastUI.showToast).toHaveBeenCalledOnce();
    expect(toastUI.showToast).toHaveBeenCalledWith(
      "command_edit_target_changed",
      "warning",
    );
    expect(fixture.storage.saveProfile).toHaveBeenCalledOnce();
    expect(fixture.storage.getProfile("captain").builds.space.keys.F1).toEqual([
      'Target "Second"',
    ]);
    expect(
      coordinator.getCurrentState().profiles.captain.builds.space.keys.F1,
    ).toEqual(['Target "Second"']);
  });
});
