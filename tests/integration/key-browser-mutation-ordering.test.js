import { afterEach, describe, expect, it, vi } from "vitest";

import BindsetService from "../../src/js/components/services/BindsetService.js";
import DataCoordinator from "../../src/js/components/services/DataCoordinator.js";
import KeyService from "../../src/js/components/services/KeyService.js";
import KeyBrowserUI from "../../src/js/components/ui/KeyBrowserUI.js";
import {
  createRealServiceFixture,
  createServiceFixture,
} from "../fixtures/index.js";

const profileId = "captain";

const profile = {
  id: profileId,
  name: "Captain",
  description: "Key browser mutation ordering fixture",
  currentEnvironment: "space",
  migrationVersion: "2.1.1",
  builds: {
    space: { keys: { F1: ["FireAll"] } },
    ground: { keys: {} },
  },
  aliases: {},
  bindsets: {
    Tactical: {
      space: { keys: {} },
      ground: { keys: {} },
    },
  },
  keybindMetadata: {},
  aliasMetadata: {},
  bindsetMetadata: {},
};

const root = {
  version: "1.0.0",
  created: "2026-01-01T00:00:00.000Z",
  lastModified: "2026-01-01T00:00:00.000Z",
  currentProfile: profileId,
  profiles: { [profileId]: profile },
  settings: {},
};

describe("Integration: KeyBrowserUI mutation result ordering", () => {
  let fixture;
  let coordinator;
  let bindsetService;
  let keyService;
  let ui;
  let confirmDialog;
  let inputDialog;

  async function startHarness({ realBus = false } = {}) {
    localStorage.setItem("sto_keybind_manager_visited", "true");
    document.body.innerHTML = `
      <div id="keyGrid"></div>
      <div id="bindsetError"></div>
    `;
    const fixtureOptions = {
      initialStorageData: { sto_keybind_manager: root },
    };
    fixture = realBus
      ? await createRealServiceFixture(fixtureOptions)
      : createServiceFixture(fixtureOptions);
    const i18n = {
      t: (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key),
    };
    confirmDialog = { confirm: vi.fn().mockResolvedValue(true) };
    inputDialog = { prompt: vi.fn() };
    coordinator = new DataCoordinator({
      eventBus: fixture.eventBus,
      storage: fixture.storage,
      i18n,
      defaultProfiles: {},
    });
    bindsetService = new BindsetService({ eventBus: fixture.eventBus });
    keyService = new KeyService({ eventBus: fixture.eventBus, i18n });
    ui = new KeyBrowserUI({
      eventBus: fixture.eventBus,
      document,
      i18n,
      confirmDialog,
      inputDialog,
      bindsetDeleteConfirm: {
        confirm: vi.fn().mockResolvedValue(true),
        cancelActiveConfirmation: vi.fn(),
      },
    });

    coordinator.init();
    await vi.waitFor(() => {
      expect(coordinator.getCurrentState().ready).toBe(true);
    });
    bindsetService.init();
    keyService.init();
    ui.init();

    await vi.waitFor(() => {
      expect(ui.cache.dataState?.currentProfile).toBe(profileId);
      expect(bindsetService.cache.currentProfile).toBe(profileId);
      expect(keyService.cache.currentProfile).toBe(profileId);
    });
  }

  afterEach(() => {
    if (ui && !ui.destroyed) ui.destroy();
    if (keyService && !keyService.destroyed) keyService.destroy();
    if (bindsetService && !bindsetService.destroyed) bindsetService.destroy();
    if (coordinator && !coordinator.destroyed) coordinator.destroy();
    fixture?.destroy();
    localStorage.removeItem("sto_keybind_manager_visited");
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("reports key deletion success after the owner publishes its successor snapshot", async () => {
    await startHarness();
    const toast = vi.spyOn(ui, "showToast");
    const before = ui.cache.dataState;

    await expect(ui.confirmDeleteKey("F1")).resolves.toBe(true);

    expect(ui.cache.dataState).not.toBe(before);
    expect(
      coordinator.getCurrentState().currentProfileData?.builds.space.keys,
    ).not.toHaveProperty("F1");
    expect(toast).toHaveBeenCalledWith(
      'key_deleted:{"keyName":"F1"}',
      "success",
    );
  });

  it("reports every bindset mutation result after each owner snapshot publication", async () => {
    await startHarness();
    const toast = vi.spyOn(ui, "showToast");

    inputDialog.prompt.mockResolvedValueOnce("Science");
    await expect(ui.handleCreateBindset()).resolves.toBe(true);
    expect(
      coordinator.getCurrentState().currentProfileData?.bindsets,
    ).toHaveProperty("Science");

    inputDialog.prompt.mockResolvedValueOnce("Science Copy");
    await expect(ui.handleCloneBindset("Science")).resolves.toBe(true);
    expect(
      coordinator.getCurrentState().currentProfileData?.bindsets,
    ).toHaveProperty("Science Copy");

    inputDialog.prompt.mockResolvedValueOnce("Engineering");
    await expect(ui.handleRenameBindset("Science Copy")).resolves.toBe(true);
    expect(
      coordinator.getCurrentState().currentProfileData?.bindsets,
    ).not.toHaveProperty("Science Copy");
    expect(
      coordinator.getCurrentState().currentProfileData?.bindsets,
    ).toHaveProperty("Engineering");

    await expect(ui.confirmDeleteBindset("Engineering")).resolves.toBe(true);
    expect(
      coordinator.getCurrentState().currentProfileData?.bindsets,
    ).not.toHaveProperty("Engineering");
    expect(toast).toHaveBeenCalledWith(
      'bindset_deleted:{"name":"Engineering"}',
      "success",
    );
  });

  it("keeps the committed grid actionable when cloning a non-current profile advances owner state", async () => {
    await startHarness({ realBus: true });
    ui.cache.keyBrowserViewState = {
      authorityEpoch: 1,
      revision: 0,
      mode: "grid",
      collapsedCategories: { command: [], keyType: [] },
      collapsedBindsets: [],
    };
    const originalRequest = ui.request.bind(ui);
    const request = vi
      .spyOn(ui, "request")
      .mockImplementation((topic, payload) => {
        if (topic === "key:sort") return Promise.resolve([...payload.keys]);
        if (topic === "key:select") return Promise.resolve(payload.keyName);
        return originalRequest(topic, payload);
      });

    await ui.render();
    const key = document.querySelector('#keyGrid [data-key="F1"]');
    expect(key).toBeInstanceOf(HTMLElement);
    expect(ui._committedGridContext?.dataState).toBe(ui.cache.dataState);
    const predecessor = ui.cache.dataState;

    await expect(
      coordinator.cloneProfile(profileId, "Captain Clone"),
    ).resolves.toMatchObject({ success: true });

    expect(coordinator.getCurrentState().currentProfile).toBe(profileId);
    expect(ui.cache.dataState).not.toBe(predecessor);
    await vi.waitFor(() => {
      expect(ui._committedGridContext?.dataState).toBe(ui.cache.dataState);
    });
    const currentKey = document.querySelector('#keyGrid [data-key="F1"]');
    expect(currentKey).toBeInstanceOf(HTMLElement);
    expect(currentKey).not.toBe(key);
    expect(key.isConnected).toBe(false);
    expect(currentKey.isConnected).toBe(true);
    request.mockClear();
    currentKey.click();

    await vi.waitFor(() => {
      expect(request).toHaveBeenCalledWith("key:select", {
        keyName: "F1",
        environment: "space",
        bindset: null,
      });
    });
  });
});
