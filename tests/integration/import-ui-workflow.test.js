import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import DataCoordinator from "../../src/js/components/services/DataCoordinator.js";
import ImportService from "../../src/js/components/services/ImportService.js";
import StorageService from "../../src/js/components/services/StorageService.js";
import ImportUI from "../../src/js/components/ui/ImportUI.js";
import { STOCommandParser } from "../../src/js/lib/STOCommandParser.js";
import { createRealEventBusFixture } from "../fixtures/core/eventBus.js";
import { createLocalStorageFixture } from "../fixtures/core/storage.js";

const profileId = "captain";
const initialProfile = {
  name: "Captain",
  currentEnvironment: "space",
  migrationVersion: "2.1.1",
  builds: {
    space: { keys: {} },
    ground: { keys: {} },
  },
  aliases: {},
  bindsets: {},
  keybindMetadata: {},
  aliasMetadata: {},
  bindsetMetadata: {},
};

describe("ImportUI workflow integration", () => {
  let eventBusFixture;
  let localStorageFixture;
  let storage;
  let coordinator;
  let importService;
  let importUI;

  beforeEach(async () => {
    document.body.replaceChildren();
    eventBusFixture = await createRealEventBusFixture();
    localStorageFixture = createLocalStorageFixture({
      initialData: {
        sto_keybind_manager: {
          currentProfile: profileId,
          profiles: { [profileId]: initialProfile },
          globalAliases: {},
          settings: {},
          version: "1.0.0",
          created: "2026-01-01T00:00:00.000Z",
          lastModified: "2026-01-01T00:00:00.000Z",
        },
      },
    });

    storage = new StorageService({
      eventBus: eventBusFixture.eventBus,
      version: "1.0.0",
    });
    coordinator = new DataCoordinator({
      eventBus: eventBusFixture.eventBus,
      storage,
      i18n: { t: (key) => key },
    });
    importService = new ImportService({
      eventBus: eventBusFixture.eventBus,
      storage,
      i18n: { t: (key) => key },
    });
    new STOCommandParser(eventBusFixture.eventBus);

    storage.init();
    coordinator.init();
    importService.init();

    await vi.waitFor(() => {
      expect(coordinator.getCurrentState().ready).toBe(true);
      expect(importService.cache.dataState?.ready).toBe(true);
    });

    importUI = new ImportUI({
      eventBus: eventBusFixture.eventBus,
      document,
      i18n: { t: (key) => key },
    });
    importUI.init();
    await vi.waitFor(() => {
      expect(importUI.cache.dataState?.ready).toBe(true);
    });
  });

  afterEach(() => {
    importUI?.destroy();
    importService?.destroy();
    coordinator?.destroy();
    storage?.destroy();
    eventBusFixture?.destroy();
    localStorageFixture?.destroy();
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  async function selectKeybindFile(content) {
    await importUI.openFileDialog("keybinds");
    const input = document.querySelector('input[type="file"]');
    expect(input).toBeInstanceOf(HTMLInputElement);
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [new File([content], "keybinds.txt", { type: "text/plain" })],
    });
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return input;
  }

  it("imports a selected file through ImportUI and the real RPC owner chain", async () => {
    const requests = [];
    const toasts = [];
    eventBusFixture.eventBus.on("rpc:import:keybind-file", ({ payload }) => {
      requests.push(payload);
    });
    eventBusFixture.eventBus.on("toast:show", (toast) => toasts.push(toast));

    const input = await selectKeybindFile('F1 "FireAll"');
    await vi.waitFor(() => {
      expect(document.querySelector("#importModal")).toBeInstanceOf(
        HTMLDivElement,
      );
    });
    document.querySelector(".import-ground").click();

    await vi.waitFor(() => {
      expect(input.isConnected).toBe(false);
      expect(
        coordinator.getCurrentState().profiles[profileId].builds.ground.keys.F1,
      ).toEqual(["FireAll"]);
    });

    expect(requests).toEqual([
      {
        content: 'F1 "FireAll"',
        profileId,
        environment: "ground",
        strategy: "merge_keep",
      },
    ]);
    expect(storage.getProfile(profileId).builds.ground.keys.F1).toEqual([
      "FireAll",
    ]);
    expect(
      importUI.cache.dataState.profiles[profileId].builds.ground.keys.F1,
    ).toEqual(["FireAll"]);
    expect(toasts).toEqual([
      { message: "import_completed_keybinds", type: "success" },
    ]);
  });

  it("cancels at the decision modal and removes every transient UI node", async () => {
    const requests = [];
    const toasts = [];
    eventBusFixture.eventBus.on("rpc:import:keybind-file", ({ payload }) => {
      requests.push(payload);
    });
    eventBusFixture.eventBus.on("toast:show", (toast) => toasts.push(toast));

    const beforeProfile = structuredClone(storage.getProfile(profileId));
    const input = await selectKeybindFile('F2 "Target_Enemy_Near"');
    await vi.waitFor(() => {
      expect(document.querySelector("#importModal")).toBeInstanceOf(
        HTMLDivElement,
      );
    });
    document.querySelector(".import-cancel").click();

    await vi.waitFor(() => {
      expect(input.isConnected).toBe(false);
      expect(document.querySelector("#importModal")).toBeNull();
    });

    expect(importUI.currentImportModal).toBeNull();
    expect(requests).toEqual([]);
    expect(toasts).toEqual([]);
    expect(storage.getProfile(profileId)).toEqual(beforeProfile);
    expect(coordinator.getCurrentState().profiles[profileId]).toEqual(
      beforeProfile,
    );
  });
});
