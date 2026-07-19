import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import DataCoordinator from "../../src/js/components/services/DataCoordinator.js";
import ImportService from "../../src/js/components/services/ImportService.js";
import ModalManagerService from "../../src/js/components/services/ModalManagerService.js";
import PreferencesService from "../../src/js/components/services/PreferencesService.js";
import StorageService from "../../src/js/components/services/StorageService.js";
import ImportUI from "../../src/js/components/ui/ImportUI.js";
import { STOCommandParser } from "../../src/js/lib/STOCommandParser.js";
import { createRealEventBusFixture } from "../fixtures/core/eventBus.js";
import { createLocalStorageFixture } from "../fixtures/core/storage.js";

const profileId = "captain";
const keysetKBF = readFileSync(
  join(process.cwd(), "tests/fixtures/kbf/keyset.KBF"),
  "utf8",
);
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

function createI18nFixture() {
  const languageListeners = new Set();
  const i18n = {
    language: "en",
    t: (key) => key,
    on(event, listener) {
      if (event === "languageChanged") languageListeners.add(listener);
    },
    off(event, listener) {
      if (event === "languageChanged") languageListeners.delete(listener);
    },
    async changeLanguage(language) {
      i18n.language = language;
      for (const listener of languageListeners) listener();
    },
  };
  return { i18n };
}

describe("ImportUI workflow integration", () => {
  let eventBusFixture;
  let localStorageFixture;
  let storage;
  let coordinator;
  let importService;
  let preferences;
  let modalManager;
  let importUI;
  let i18nFixture;

  beforeEach(async () => {
    document.body.innerHTML = '<div id="modalOverlay"></div>';
    eventBusFixture = await createRealEventBusFixture();
    i18nFixture = createI18nFixture();
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
        sto_keybind_settings: {
          bindsetsEnabled: true,
          language: "en",
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
      i18n: i18nFixture.i18n,
    });
    importService = new ImportService({
      eventBus: eventBusFixture.eventBus,
      storage,
      i18n: i18nFixture.i18n,
    });
    preferences = new PreferencesService({
      eventBus: eventBusFixture.eventBus,
      storage,
      i18n: i18nFixture.i18n,
    });
    new STOCommandParser(eventBusFixture.eventBus);

    storage.init();
    coordinator.init();
    importService.init();
    preferences.init();

    await vi.waitFor(() => {
      expect(coordinator.getCurrentState().ready).toBe(true);
      expect(importService.cache.dataState?.ready).toBe(true);
      expect(importService.cache.preferences.bindsetsEnabled).toBe(true);
    });

    importUI = new ImportUI({
      eventBus: eventBusFixture.eventBus,
      document,
      i18n: i18nFixture.i18n,
    });
    importUI.init();
    await vi.waitFor(() => {
      expect(importUI.cache.dataState?.ready).toBe(true);
      expect(importUI.cache.preferences.bindsetsEnabled).toBe(true);
    });
  });

  afterEach(() => {
    importUI?.destroy();
    modalManager?.destroy();
    preferences?.destroy();
    importService?.destroy();
    coordinator?.destroy();
    storage?.destroy();
    eventBusFixture?.destroy();
    localStorageFixture?.destroy();
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  async function selectImportFile(type, content, name) {
    await importUI.openFileDialog(type);
    const input = document.querySelector('input[type="file"]');
    expect(input).toBeInstanceOf(HTMLInputElement);
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [new File([content], name, { type: "text/plain" })],
    });
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return input;
  }

  const selectKeybindFile = (content) =>
    selectImportFile("keybinds", content, "keybinds.txt");

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

  it("preserves an enhanced KBF draft through regeneration and commits its canonical configuration", async () => {
    importUI.destroy();
    modalManager = new ModalManagerService({
      eventBus: eventBusFixture.eventBus,
      i18n: i18nFixture.i18n,
    });
    modalManager.init();
    importUI = new ImportUI({
      eventBus: eventBusFixture.eventBus,
      document,
      i18n: i18nFixture.i18n,
      modalManager,
    });
    importUI.init();
    await vi.waitFor(() => {
      expect(importUI.cache.dataState?.ready).toBe(true);
      expect(importUI.cache.preferences.bindsetsEnabled).toBe(true);
    });

    const importRequests = [];
    const toasts = [];
    const detachRequest = eventBusFixture.eventBus.on(
      "rpc:import:kbf-file",
      ({ payload }) => importRequests.push(payload),
    );
    const detachToast = eventBusFixture.eventBus.on("toast:show", (toast) =>
      toasts.push(toast),
    );
    const beforeRevision = coordinator.getCurrentState().revision;
    const destination = "Regenerated Master";

    const input = await selectImportFile("kbf", keysetKBF, "keyset.KBF");
    await vi.waitFor(() => {
      const modal = document.getElementById("importModal");
      expect(modal).toBeInstanceOf(HTMLDivElement);
      expect(modal?.classList).toContain("active");
    });
    document.querySelector(".import-space").click();

    await vi.waitFor(() => {
      const modal = document.getElementById("enhancedBindsetSelectionModal");
      expect(modal).toBeInstanceOf(HTMLDivElement);
      expect(modal?.classList).toContain("active");
    });
    expect(
      document.querySelectorAll("#enhancedBindsetSelectionModal"),
    ).toHaveLength(1);
    const predecessor = importUI.kbfImportSession.modalElement;
    expect(predecessor).toBe(
      document.getElementById("enhancedBindsetSelectionModal"),
    );
    expect(predecessor?.classList).toContain("active");
    const predecessorRow = predecessor.querySelector(".bindset-row");
    const sourceName = predecessorRow.dataset.bindset;
    const mapping = predecessorRow.querySelector(".bindset-mapping-select");
    expect(predecessor.classList).toContain("active");
    mapping.value = "mapped";
    mapping.dispatchEvent(new Event("change", { bubbles: true }));
    expect(predecessor.classList).toContain("active");
    const rename = predecessorRow.querySelector(".bindset-custom-input");
    rename.value = destination;
    rename.dispatchEvent(new Event("input", { bubbles: true }));
    const excludedMapping = predecessor
      .querySelectorAll(".bindset-row")[1]
      .querySelector(".bindset-mapping-select");
    excludedMapping.value = "none";
    excludedMapping.dispatchEvent(new Event("change", { bubbles: true }));
    expect(predecessor.classList).toContain("active");

    expect(modalManager.languageChangedHandler).toBeTypeOf("function");
    expect(modalManager.regenerateCallbacks.enhancedBindsetSelectionModal).toBe(
      importUI.kbfImportSession.currentSession.regenerateCallback,
    );
    expect(
      Array.from(document.querySelectorAll(".modal")).filter((modal) =>
        modal.classList.contains("active"),
      ),
    ).toEqual([predecessor]);
    await i18nFixture.i18n.changeLanguage("de");

    const regenerated = document.querySelector(
      "#enhancedBindsetSelectionModal",
    );
    expect(regenerated).not.toBe(predecessor);
    expect(predecessor.isConnected).toBe(false);
    expect(regenerated.classList).toContain("active");
    const regeneratedRow = regenerated.querySelector(".bindset-row");
    expect(regeneratedRow.dataset.bindset).toBe(sourceName);
    expect(regeneratedRow.querySelector(".bindset-mapping-select").value).toBe(
      "mapped",
    );
    expect(regeneratedRow.querySelector(".bindset-custom-input").value).toBe(
      destination,
    );
    expect(
      regenerated
        .querySelectorAll(".bindset-row")[1]
        .querySelector(".bindset-mapping-select").value,
    ).toBe("none");
    regenerated.querySelector(".enhanced-bindset-confirm").click();

    await vi.waitFor(() => {
      expect(input.isConnected).toBe(false);
      expect(
        coordinator.getCurrentState().profiles[profileId].bindsets[destination]
          .space.keys.Space,
      ).toContain("+TrayExecByTray 0 0");
    });

    expect(importRequests).toHaveLength(1);
    expect(importRequests[0]).toMatchObject({
      content: keysetKBF,
      profileId,
      environment: "space",
      strategy: "merge_keep",
    });
    expect(importRequests[0].configuration).toEqual({
      selectedBindsets: [sourceName],
      bindsetMappings: { [sourceName]: "custom" },
      bindsetRenames: { [sourceName]: destination },
    });
    const committed = storage.getProfile(profileId);
    expect(committed.bindsets[destination].space.keys.Space).toContain(
      "+TrayExecByTray 0 0",
    );
    expect(
      importUI.cache.dataState.profiles[profileId].bindsets[destination].space
        .keys.Space,
    ).toEqual(committed.bindsets[destination].space.keys.Space);
    const durable = JSON.parse(localStorage.getItem("sto_keybind_manager"))
      .profiles[profileId];
    expect(durable.bindsets[destination].space.keys.Space).toEqual(
      committed.bindsets[destination].space.keys.Space,
    );
    expect(importUI.cache.dataState.revision).toBe(beforeRevision + 1);
    expect(coordinator.getCurrentState().revision).toBe(beforeRevision + 1);
    expect(toasts).toEqual([expect.objectContaining({ type: "success" })]);

    expect(importUI.kbfImportSession.currentSession).toBeNull();
    expect(
      modalManager.regenerateCallbacks.enhancedBindsetSelectionModal,
    ).toBeUndefined();
    expect(document.querySelector("#importModal")).toBeNull();
    expect(document.querySelector("#enhancedBindsetSelectionModal")).toBeNull();
    expect(document.getElementById("modalOverlay").classList).not.toContain(
      "active",
    );
    expect(document.body.classList).not.toContain("modal-open");

    detachRequest();
    detachToast();
  });
});
