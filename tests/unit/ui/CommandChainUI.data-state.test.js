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
});
