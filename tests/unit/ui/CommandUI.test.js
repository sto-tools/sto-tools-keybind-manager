import { describe, it, beforeEach, afterEach, expect, vi } from "vitest";
import { createServiceFixture } from "../../fixtures/index.js";
import { createDataCoordinatorState } from "../../fixtures/core/componentState.js";
import CommandUI from "../../../src/js/components/ui/CommandUI.js";
import { JSDOM } from "jsdom";

function createStubUI() {
  return {
    showToast: vi.fn(),
  };
}

describe("CommandUI", () => {
  let fixture, busFixture, eventBus, uiStub, commandUI, dom, document;

  beforeEach(async () => {
    dom = new JSDOM("<!doctype html><html><body></body></html>");
    document = dom.window.document;
    fixture = createServiceFixture();
    busFixture = fixture.eventBusFixture;
    eventBus = fixture.eventBus;
    uiStub = createStubUI();
    const i18n = {
      t: vi.fn((key) => {
        const defaults = {
          please_select_a_key_first: "Please select a key first",
        };
        return defaults[key] || key;
      }),
    };
    commandUI = new CommandUI({
      eventBus,
      ui: uiStub,
      modalManager: { show: vi.fn() },
      i18n,
      document,
    });
    commandUI.init();
  });

  afterEach(() => {
    document.body.innerHTML = "";
    dom.window.close();
    fixture.destroy();
    vi.restoreAllMocks();
  });

  it("projects an empty import-source list before data is ready", async () => {
    document.body.innerHTML = '<select id="importSourceSelect"></select>';
    commandUI.cache.selectedKey = "F1";
    commandUI.request = vi.fn(async (topic) => {
      throw new Error(`Unexpected request: ${topic}`);
    });

    await commandUI.populateImportSources();

    const select = document.getElementById("importSourceSelect");
    expect(Array.from(select.options, (option) => option.value)).toEqual([""]);
    expect(select.options[0].textContent).toBe("no_sources_available");
    expect(commandUI.request).not.toHaveBeenCalled();
  });

  it("waits without a transport deadline for a source import to settle", async () => {
    document.body.innerHTML = `
      <select id="importSourceSelect">
        <option value="space:F1" selected>F1</option>
      </select>
      <input id="clearDestinationBeforeImport" type="checkbox" checked>
    `;
    commandUI.cache.selectedKey = "F2";
    commandUI.cache.currentEnvironment = "space";
    commandUI.modalManager.hide = vi.fn();
    commandUI.request = vi.fn().mockResolvedValue({
      success: true,
      droppedCount: 0,
      importedCount: 1,
      sourceName: "F1",
      sourceType: "space",
    });

    await commandUI.performImport();

    expect(commandUI.request).toHaveBeenCalledExactlyOnceWith(
      "command:import-from-source",
      {
        sourceValue: "space:F1",
        targetKey: "F2",
        clearDestination: true,
        currentEnvironment: "space",
      },
      0,
    );
  });

  it("projects import sources and stabilization from a replacement authority", async () => {
    document.body.innerHTML = '<select id="importSourceSelect"></select>';
    const adoptProfile = (profile, { authorityEpoch, revision }) => {
      commandUI._cacheDataState(
        createDataCoordinatorState({
          authorityEpoch,
          revision,
          currentProfile: "captain",
          currentEnvironment: "space",
          currentProfileData: profile,
          profiles: { captain: profile },
        }),
      );
      commandUI.cache.selectedKey = "F1";
    };
    const original = {
      name: "Captain",
      currentEnvironment: "space",
      builds: {
        space: { keys: { F1: ["Current"], F2: ["OldSource"] } },
        ground: { keys: {} },
      },
      aliases: { oldAlias: { commands: ["OldAliasCommand"] } },
      keybindMetadata: { space: { F1: { stabilizeExecutionOrder: false } } },
    };
    adoptProfile(original, { authorityEpoch: 50, revision: 4 });
    commandUI.request = vi.fn(async (topic) => {
      throw new Error(`Unexpected request: ${topic}`);
    });

    await commandUI.populateImportSources();
    expect(
      Array.from(
        document.getElementById("importSourceSelect").options,
        (option) => option.value,
      ),
    ).toEqual(expect.arrayContaining(["space:F2", "alias:oldAlias"]));

    const replacement = {
      ...original,
      builds: {
        space: { keys: { F1: ["Current"], F3: ["NewSource"] } },
        ground: { keys: {} },
      },
      aliases: { newAlias: { commands: ["NewAliasCommand"] } },
      keybindMetadata: { space: { F1: { stabilizeExecutionOrder: true } } },
      bindsetMetadata: {
        Tactical: {
          space: { F1: { stabilizeExecutionOrder: false } },
        },
      },
    };
    adoptProfile(replacement, { authorityEpoch: 51, revision: 0 });
    await commandUI.populateImportSources();

    const values = Array.from(
      document.getElementById("importSourceSelect").options,
      (option) => option.value,
    );
    expect(values).toEqual(
      expect.arrayContaining(["space:F3", "alias:newAlias"]),
    );
    expect(values).not.toContain("space:F2");
    expect(values).not.toContain("alias:oldAlias");

    const validationEvents = [];
    eventBus.on("command-chain:validate", (event) =>
      validationEvents.push(event),
    );
    commandUI._activeBindset = "Tactical";
    await commandUI.validateCurrentChain("F1");
    expect(validationEvents.at(-1)).toEqual({
      key: "F1",
      stabilized: true,
      isAlias: false,
    });
    expect(commandUI.request).not.toHaveBeenCalled();
  });

  it("should show warning toast when adding static command without key selected", async () => {
    // Spy on the showToast method
    const showToastSpy = vi.spyOn(commandUI, "showToast");

    eventBus.emit("command-add", {
      commandDef: { command: "FireAll", name: "Fire All" },
    });

    // microtask queue flush
    await new Promise((r) => setTimeout(r, 0));

    expect(showToastSpy).toHaveBeenCalled();
  });

  it("should emit command:add event when key is selected", async () => {
    // Select a key first
    eventBus.emit("key-selected", { key: "F1" });

    const cmdDef = { command: "FireAll", name: "Fire All" };
    eventBus.emit("command-add", { commandDef: cmdDef });

    await new Promise((r) => setTimeout(r, 0));

    // showToast should not be called this time
    expect(uiStub.showToast).not.toHaveBeenCalledWith(
      expect.stringMatching(/select.*key/i),
      "warning",
    );

    // Verify command:add emitted with correct payload
    const events = busFixture.getEventsOfType("command:add");
    const match = events.find(
      (e) => e.data?.key === "F1" && e.data?.command?.command === "FireAll",
    );
    expect(match).toBeDefined();
  });

  describe("bindset integration", () => {
    it("should include active bindset when adding commands to non-primary bindset", async () => {
      const mockCommand = { command: "FireAll", type: "basic" };

      // Set up UI state using the cache mechanism
      commandUI.cache = {
        selectedKey: "F1",
        currentEnvironment: "space",
        preferences: { bindsetsEnabled: true },
      };
      commandUI._activeBindset = "Custom Bindset";

      // Trigger command add
      eventBus.emit("command-add", { commandDef: mockCommand });

      // Wait for async processing
      await new Promise((resolve) => setTimeout(resolve, 0));

      // Verify command:add emitted with correct payload including bindset
      const events = busFixture.getEventsOfType("command:add");
      const match = events.find(
        (e) => e.data?.key === "F1" && e.data?.bindset === "Custom Bindset",
      );
      expect(match).toBeDefined();
      expect(match.data.command).toEqual(mockCommand);
    });

    it("uses the primary location when a disabled named bindset remains cached", async () => {
      const mockCommand = { command: "FireAll", type: "basic" };
      commandUI.cache = {
        selectedKey: "F1",
        currentEnvironment: "space",
        preferences: { bindsetsEnabled: false },
      };
      commandUI._activeBindset = "Custom Bindset";

      eventBus.emit("command-add", { commandDef: mockCommand });
      await new Promise((resolve) => setTimeout(resolve, 0));

      const events = busFixture.getEventsOfType("command:add");
      const match = events.find(
        (event) =>
          event.data?.key === "F1" && event.data?.command === mockCommand,
      );
      expect(match?.data.bindset).toBeNull();
    });

    it("should not include bindset when in alias mode", async () => {
      const mockCommand = { command: "FireAll", type: "basic" };

      // Set up UI state for alias mode using the cache mechanism
      commandUI.cache = {
        selectedAlias: "myalias",
        currentEnvironment: "alias",
      };
      commandUI._activeBindset = "Custom Bindset";

      // Trigger command add
      eventBus.emit("command-add", { commandDef: mockCommand });

      // Wait for async processing
      await new Promise((resolve) => setTimeout(resolve, 0));

      // Verify command:add emitted with null bindset for alias mode
      const events = busFixture.getEventsOfType("command:add");
      const match = events.find(
        (e) => e.data?.key === "myalias" && e.data?.bindset === null,
      );
      expect(match).toBeDefined();
      expect(match.data.command).toEqual(mockCommand);
    });

    it("should cache active bindset from bindset-selector:active-changed events", () => {
      expect(commandUI._activeBindset).toBe("Primary Bindset"); // default

      eventBus.emit("bindset-selector:active-changed", {
        bindset: "Test Bindset",
      });

      expect(commandUI._activeBindset).toBe("Test Bindset");
    });

    it("should cache the legacy active bindset payload", () => {
      eventBus.emit("bindset-selector:active-changed", {
        name: "Legacy Bindset",
      });

      expect(commandUI._activeBindset).toBe("Legacy Bindset");
    });
  });
});
