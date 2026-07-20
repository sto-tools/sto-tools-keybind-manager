import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import CommandChainService from "../../../src/js/components/services/CommandChainService.js";
import { createDataCoordinatorState } from "../../fixtures/core/componentState.js";
import { createServiceFixture } from "../../fixtures/index.js";

function createProfile() {
  return {
    id: "captain",
    name: "Captain",
    currentEnvironment: "space",
    builds: {
      space: {
        keys: {
          F1: [
            'Target "Alpha"',
            {
              command: "RawExplicit",
              type: "custom",
              parameters: { rawCommand: "RawExplicit" },
            },
            "UnknownRawCommand",
            "CamReset",
          ],
        },
      },
      ground: { keys: {} },
    },
    aliases: {},
    bindsets: {},
  };
}

function parserResult(category, parameters = undefined) {
  return { commands: [{ category, parameters }] };
}

describe("CommandChainService production edit listener", () => {
  let fixture;
  let service;
  let i18n;

  beforeEach(() => {
    fixture = createServiceFixture();
    i18n = {
      t: vi.fn((key, options) => options?.defaultValue || `translated:${key}`),
    };
    service = new CommandChainService({
      eventBus: fixture.eventBus,
      i18n,
    });
    service.init();

    const profile = createProfile();
    fixture.eventBus.emit("data:state-changed", {
      reason: "test-owner",
      state: createDataCoordinatorState({
        authorityEpoch: 30,
        revision: 1,
        currentProfile: "captain",
        currentEnvironment: "space",
        currentProfileData: profile,
        profiles: { captain: profile },
      }),
    });
    fixture.eventBus.emit("selection:state-changed", {
      selectedKey: "F1",
      selectedAlias: null,
      editingContext: null,
      cachedSelections: { space: "F1", ground: null, alias: null },
      currentEnvironment: "space",
    });
    fixture.eventBusFixture.clearEventHistory();
  });

  afterEach(() => {
    if (!service.destroyed) service.destroy();
    fixture.destroy();
    vi.restoreAllMocks();
  });

  function editEvents() {
    return fixture
      .getEventHistory()
      .filter(({ event }) => event === "parameter-command:edit");
  }

  function toastEvents() {
    return fixture
      .getEventHistory()
      .filter(({ event }) => event === "toast:show");
  }

  it("opens the catalog editor with derived parameters through the real listener", async () => {
    service.request = vi
      .fn()
      .mockResolvedValue(parserResult("targeting", { entityName: "Alpha" }));

    fixture.eventBus.emit("commandchain:edit", { index: 0 });

    await vi.waitFor(() => expect(editEvents()).toHaveLength(1));
    expect(service.request.mock.calls).toEqual([
      [
        "parser:parse-command-string",
        {
          commandString: 'Target "Alpha"',
          options: { generateDisplayText: false },
        },
      ],
      [
        "parser:parse-command-string",
        {
          commandString: 'Target "Alpha"',
          options: { generateDisplayText: false },
        },
      ],
    ]);
    expect(editEvents()[0].data).toMatchObject({
      target: {
        authorityEpoch: 30,
        revision: 1,
        profileId: "captain",
        environment: "space",
        name: "F1",
        bindset: null,
        index: 0,
        originalEntry: 'Target "Alpha"',
      },
      index: 0,
      command: {
        command: 'Target "Alpha"',
        parameters: { entityName: "Alpha" },
      },
      commandDef: { customizable: true },
      categoryId: "targeting",
      commandId: "target",
    });
    expect(Object.isFrozen(editEvents()[0].data.target)).toBe(true);
    expect(toastEvents()).toEqual([]);
  });

  it("opens the translated raw editor for an explicit custom rich command", async () => {
    service.request = vi.fn();

    fixture.eventBus.emit("commandchain:edit", { index: 1 });

    await vi.waitFor(() => expect(editEvents()).toHaveLength(1));
    expect(service.request).not.toHaveBeenCalled();
    expect(editEvents()[0].data).toMatchObject({
      index: 1,
      command: {
        command: "RawExplicit",
        type: "custom",
        parameters: { rawCommand: "RawExplicit" },
      },
      commandDef: {
        name: "Edit Custom Command",
        categoryId: "custom",
        commandId: "add_custom_command",
        parameters: {
          rawCommand: {
            default: "RawExplicit",
            placeholder: "Enter any STO command",
            label: "Command:",
          },
        },
      },
      categoryId: "custom",
      commandId: "add_custom_command",
    });
    expect(i18n.t).toHaveBeenCalledWith("edit_custom_command", {
      defaultValue: "Edit Custom Command",
    });
    expect(i18n.t).toHaveBeenCalledWith("enter_any_sto_command", {
      defaultValue: "Enter any STO command",
    });
    expect(i18n.t).toHaveBeenCalledWith("command_label_colon", {
      defaultValue: "Command:",
    });
  });

  it("retains raw-edit fallback for an unrecognized canonical string", async () => {
    service.request = vi
      .fn()
      .mockResolvedValue(parserResult("custom", undefined));

    fixture.eventBus.emit("commandchain:edit", { index: 2 });

    await vi.waitFor(() => expect(editEvents()).toHaveLength(1));
    expect(service.request).toHaveBeenCalledTimes(2);
    expect(editEvents()[0].data).toMatchObject({
      index: 2,
      command: { command: "UnknownRawCommand" },
      categoryId: "custom",
      commandId: "add_custom_command",
    });
  });

  it("falls back to raw editing after parser rejection and records the derivation diagnostic", async () => {
    const error = new Error("parser failed");
    service.request = vi.fn().mockRejectedValue(error);
    vi.spyOn(console, "warn").mockImplementation(() => {});

    fixture.eventBus.emit("commandchain:edit", { index: 2 });

    await vi.waitFor(() => expect(editEvents()).toHaveLength(1));
    expect(service.request).toHaveBeenCalledTimes(2);
    expect(console.warn).toHaveBeenCalledWith(
      "[CommandChainService] Failed to derive parameters from command:",
      error,
    );
    expect(editEvents()[0].data).toMatchObject({
      categoryId: "custom",
      commandId: "add_custom_command",
    });
  });

  it("uses the typed toast topic for a non-customizable command", async () => {
    service.request = vi.fn().mockResolvedValue(parserResult("camera"));

    fixture.eventBus.emit("commandchain:edit", { index: 3 });
    await vi.waitFor(() => expect(toastEvents()).toHaveLength(1));

    expect(editEvents()).toEqual([]);
    expect(toastEvents()[0].data).toEqual({
      message: "CamReset",
      type: "info",
    });
  });

  it.each([-1, 0.5, 99])("keeps invalid index %s inert", async (index) => {
    service.request = vi.fn();

    fixture.eventBus.emit("commandchain:edit", { index });
    await Promise.resolve();

    expect(service.request).not.toHaveBeenCalled();
    expect(editEvents()).toEqual([]);
    expect(toastEvents()).toEqual([]);
  });
});
