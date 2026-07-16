import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ParameterCommandUI from "../../../src/js/components/ui/ParameterCommandUI.js";
import { createServiceFixture } from "../../fixtures/index.js";

describe("ParameterCommandUI bindset context", () => {
  let fixture;
  let ui;

  beforeEach(() => {
    fixture = createServiceFixture();
    ui = new ParameterCommandUI({
      eventBus: fixture.eventBus,
      modalManager: {
        hide: vi.fn(),
        unregisterRegenerateCallback: vi.fn(),
      },
      i18n: { t: (key) => key },
      ui: { showToast: vi.fn() },
      document: { getElementById: vi.fn(() => null) },
    });
    ui.init();
    ui.cache.currentEnvironment = "space";
    ui.cache.selectedKey = "F1";
    ui.cache.activeBindset = "Tactical";
    vi.spyOn(ui, "getParameterValues").mockReturnValue({});
    ui.request = vi.fn().mockResolvedValue("Target_Enemy_Near");
  });

  afterEach(() => {
    fixture.destroy();
    vi.restoreAllMocks();
  });

  const setCommand = (editing = false) => {
    ui.currentParameterCommand = {
      categoryId: "targeting",
      commandId: "target-nearest",
      commandDef: { command: "Target_Enemy_Near" },
      isEditing: editing,
      editIndex: editing ? 2 : undefined,
    };
  };

  it("adds to Primary when a disabled named bindset remains cached", async () => {
    ui.cache.preferences.bindsetsEnabled = false;
    setCommand();

    await ui.saveParameterCommand();

    expect(
      fixture.eventBusFixture.getEventsOfType("command:add").at(-1)?.data,
    ).toEqual({
      command: "Target_Enemy_Near",
      key: "F1",
      bindset: null,
    });
  });

  it("edits Primary when a disabled named bindset remains cached", async () => {
    ui.cache.preferences.bindsetsEnabled = false;
    setCommand(true);

    await ui.saveParameterCommand();

    expect(
      fixture.eventBusFixture.getEventsOfType("command:edit").at(-1)?.data,
    ).toEqual({
      key: "F1",
      index: 2,
      updatedCommand: "Target_Enemy_Near",
      bindset: null,
    });
  });

  it("preserves a named bindset while bindsets are enabled", async () => {
    ui.cache.preferences.bindsetsEnabled = true;
    setCommand();

    await ui.saveParameterCommand();

    expect(
      fixture.eventBusFixture.getEventsOfType("command:add").at(-1)?.data
        ?.bindset,
    ).toBe("Tactical");
  });
});
