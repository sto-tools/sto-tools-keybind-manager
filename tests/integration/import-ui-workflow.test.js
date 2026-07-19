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

  async function recreateImportUIWithModalManager() {
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
  }

  async function waitForModal(modalId, active = false) {
    await vi.waitFor(() => {
      const modal = document.getElementById(modalId);
      expect(modal).toBeInstanceOf(HTMLDivElement);
      if (active) expect(modal?.classList).toContain("active");
    });
    return /** @type {HTMLDivElement} */ (document.getElementById(modalId));
  }

  it("imports a selected file through ImportUI and the real RPC owner chain", async () => {
    const requests = [];
    const toasts = [];
    eventBusFixture.eventBus.on("rpc:import:keybind-file", ({ payload }) => {
      requests.push(payload);
    });
    eventBusFixture.eventBus.on("toast:show", (toast) => toasts.push(toast));

    const input = await selectKeybindFile('F1 "FireAll"');
    await waitForModal("importModal");
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

  it("settles a real overlay cancellation and removes every transient UI node", async () => {
    await recreateImportUIWithModalManager();
    const requests = [];
    const toasts = [];
    eventBusFixture.eventBus.on("rpc:import:keybind-file", ({ payload }) => {
      requests.push(payload);
    });
    eventBusFixture.eventBus.on("toast:show", (toast) => toasts.push(toast));

    const beforeProfile = structuredClone(storage.getProfile(profileId));
    const beforeRevision = coordinator.getCurrentState().revision;
    const input = await selectKeybindFile('F2 "Target_Enemy_Near"');
    await waitForModal("importModal", true);
    document.getElementById("modalOverlay").click();

    await vi.waitFor(() => {
      expect(input.isConnected).toBe(false);
      expect(document.querySelector("#importModal")).toBeNull();
    });

    expect(modalManager.regenerateCallbacks.importModal).toBeUndefined();
    expect(document.getElementById("modalOverlay").classList).not.toContain(
      "active",
    );
    expect(document.body.classList).not.toContain("modal-open");
    expect(requests).toEqual([]);
    expect(toasts).toEqual([]);
    expect(coordinator.getCurrentState().revision).toBe(beforeRevision);
    expect(storage.getProfile(profileId)).toEqual(beforeProfile);
    expect(coordinator.getCurrentState().profiles[profileId]).toEqual(
      beforeProfile,
    );
  });

  it("makes a superseded decision modal and its regeneration callback inert", async () => {
    await recreateImportUIWithModalManager();
    const requests = [];
    const detachRequest = eventBusFixture.eventBus.on(
      "rpc:import:keybind-file",
      ({ payload }) => requests.push(payload),
    );
    const beforeRevision = coordinator.getCurrentState().revision;
    const beforeProfile = structuredClone(storage.getProfile(profileId));
    const predecessorInput = await selectKeybindFile('F3 "FireAll"');

    const predecessor = await waitForModal("importModal", true);
    const staleButton = predecessor.querySelector(".import-space");
    const staleRegenerate = modalManager.regenerateCallbacks.importModal;

    await importUI.openFileDialog("aliases");

    const replacementInput = document.querySelector(
      'input[type="file"][accept=".txt"]',
    );
    expect(replacementInput).toBeInstanceOf(HTMLInputElement);
    expect(replacementInput).not.toBe(predecessorInput);
    expect(predecessorInput.isConnected).toBe(false);
    expect(predecessor.isConnected).toBe(false);
    expect(document.getElementById("importModal")).toBeNull();
    expect(modalManager.regenerateCallbacks.importModal).toBeUndefined();

    staleButton.click();
    staleRegenerate();
    expect(document.getElementById("importModal")).toBeNull();
    expect(requests).toEqual([]);
    replacementInput.dispatchEvent(new Event("cancel"));
    expect(replacementInput.isConnected).toBe(false);
    expect(coordinator.getCurrentState().revision).toBe(beforeRevision);
    expect(storage.getProfile(profileId)).toEqual(beforeProfile);
    detachRequest();
  });

  it("supersedes an active KBF modal with a cancellable replacement picker", async () => {
    await recreateImportUIWithModalManager();
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
    const beforeProfile = structuredClone(storage.getProfile(profileId));
    const beforeDurable = localStorage.getItem("sto_keybind_manager");

    const predecessorInput = await selectImportFile(
      "kbf",
      keysetKBF,
      "keyset.KBF",
    );
    await waitForModal("importModal");
    document
      .getElementById("importModal")
      ?.querySelector(".import-space")
      ?.click();
    const predecessor = await waitForModal(
      "enhancedBindsetSelectionModal",
      true,
    );
    const staleConfirm = /** @type {HTMLButtonElement} */ (
      predecessor.querySelector(".enhanced-bindset-confirm")
    );
    const staleRow = /** @type {HTMLTableRowElement} */ (
      predecessor.querySelector(".bindset-row")
    );
    const staleMapping = /** @type {HTMLSelectElement} */ (
      staleRow.querySelector(".bindset-mapping-select")
    );
    const staleRegenerate =
      modalManager.regenerateCallbacks.enhancedBindsetSelectionModal;
    expect(staleConfirm).toBeInstanceOf(HTMLButtonElement);
    expect(staleMapping).toBeInstanceOf(HTMLSelectElement);
    expect(staleRegenerate).toBeTypeOf("function");
    expect(staleRow.querySelector(".bindset-custom-cell")).toBeNull();

    await importUI.openFileDialog("aliases");

    const replacementInput = importUI.importFileSession.inputElement;
    expect(replacementInput).toBeInstanceOf(HTMLInputElement);
    expect(replacementInput?.accept).toBe(".txt");
    expect(replacementInput).not.toBe(predecessorInput);
    expect(predecessorInput.isConnected).toBe(false);
    expect(predecessor.isConnected).toBe(false);
    expect(importUI.kbfImportSession.currentSession).toBeNull();
    expect(
      modalManager.regenerateCallbacks.enhancedBindsetSelectionModal,
    ).toBeUndefined();
    expect(document.getElementById("modalOverlay").classList).not.toContain(
      "active",
    );
    expect(document.body.classList).not.toContain("modal-open");

    staleMapping.value = "mapped";
    staleMapping.dispatchEvent(new Event("change", { bubbles: true }));
    staleConfirm.click();
    expect(staleRegenerate()).toBe(false);
    await Promise.resolve();
    await Promise.resolve();

    expect(staleRow.querySelector(".bindset-custom-cell")).toBeNull();
    expect(document.getElementById("enhancedBindsetSelectionModal")).toBeNull();
    expect(importRequests).toEqual([]);
    expect(toasts).toEqual([]);
    expect(importUI.importFileSession.inputElement).toBe(replacementInput);
    expect(importUI.importFileSession.isActive).toBe(true);
    expect(replacementInput?.isConnected).toBe(true);
    expect(document.querySelectorAll('input[type="file"]')).toHaveLength(1);

    replacementInput?.dispatchEvent(new Event("cancel"));

    expect(importUI.importFileSession.isActive).toBe(false);
    expect(importUI.importFileSession.inputElement).toBeNull();
    expect(replacementInput?.isConnected).toBe(false);
    expect(document.querySelectorAll('input[type="file"]')).toHaveLength(0);
    expect(coordinator.getCurrentState().revision).toBe(beforeRevision);
    expect(storage.getProfile(profileId)).toEqual(beforeProfile);
    expect(coordinator.getCurrentState().profiles[profileId]).toEqual(
      beforeProfile,
    );
    expect(importUI.cache.dataState.profiles[profileId]).toEqual(beforeProfile);
    expect(localStorage.getItem("sto_keybind_manager")).toBe(beforeDurable);

    detachRequest();
    detachToast();
  });

  it("preserves decision and KBF drafts through regeneration and commits their canonical configuration", async () => {
    await recreateImportUIWithModalManager();

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
    const decisionPredecessor = await waitForModal("importModal", true);
    const decisionPredecessorButton =
      decisionPredecessor.querySelector(".import-space");
    const overwrite = decisionPredecessor.querySelector(
      'input[name="import-strategy"][value="merge_overwrite"]',
    );
    overwrite.checked = true;
    const decisionRegenerate = modalManager.regenerateCallbacks.importModal;
    expect(decisionRegenerate).toBeTypeOf("function");

    await i18nFixture.i18n.changeLanguage("de");

    const decisionReplacement = document.getElementById("importModal");
    expect(decisionReplacement).not.toBe(decisionPredecessor);
    expect(decisionPredecessor.isConnected).toBe(false);
    expect(decisionReplacement.classList).toContain("active");
    expect(
      decisionReplacement.querySelector(
        'input[name="import-strategy"][value="merge_overwrite"]',
      ).checked,
    ).toBe(true);
    decisionPredecessorButton.click();
    expect(document.getElementById("importModal")).toBe(decisionReplacement);
    expect(document.getElementById("enhancedBindsetSelectionModal")).toBeNull();
    decisionReplacement.querySelector(".import-space").click();

    await waitForModal("enhancedBindsetSelectionModal", true);
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
    await i18nFixture.i18n.changeLanguage("fr");

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
      strategy: "merge_overwrite",
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
    expect(modalManager.regenerateCallbacks.importModal).toBeUndefined();
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
