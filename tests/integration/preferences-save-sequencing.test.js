import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ModalManagerService from "../../src/js/components/services/ModalManagerService.js";
import PreferencesService from "../../src/js/components/services/PreferencesService.js";
import SyncService from "../../src/js/components/services/SyncService.js";
import PreferencesUI from "../../src/js/components/ui/PreferencesUI.js";
import { createRealServiceFixture } from "../fixtures/index.js";

describe("preferences save sequencing", () => {
  let fixture;
  let modalManager;
  let preferencesService;
  let preferencesUI;
  let syncService;

  beforeEach(async () => {
    fixture = await createRealServiceFixture();
    document.body.innerHTML = `
      <div id="modalOverlay" class="active"></div>
      <div id="preferencesModal" class="modal active"></div>
    `;
  });

  afterEach(() => {
    if (preferencesUI && !preferencesUI.destroyed) preferencesUI.destroy();
    if (preferencesService && !preferencesService.destroyed) {
      preferencesService.destroy();
    }
    if (syncService && !syncService.destroyed) syncService.destroy();
    if (modalManager && !modalManager.destroyed) modalManager.destroy();
    fixture?.destroy();
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("finishes a delayed saved consumer before replying and closing the modal", async () => {
    const directoryHandle = /** @type {FileSystemDirectoryHandle} */ (
      /** @type {unknown} */ ({ name: "Keybinds" })
    );
    /** @type {(handle: FileSystemDirectoryHandle) => void} */
    let releaseDirectoryHandle = () => {};
    const directoryHandleReady = new Promise((resolve) => {
      releaseDirectoryHandle = resolve;
    });
    const getDirectoryHandle = vi.fn(() => directoryHandleReady);
    const fs =
      /** @type {import("../../src/js/components/services/FileSystemService.js").default} */ (
        /** @type {unknown} */ ({ getDirectoryHandle })
      );

    modalManager = new ModalManagerService({ eventBus: fixture.eventBus });
    syncService = new SyncService({
      eventBus: fixture.eventBus,
      fs,
      i18n: { t: (key) => key },
    });
    preferencesService = new PreferencesService({
      eventBus: fixture.eventBus,
      storage: fixture.storage,
    });
    preferencesUI = new PreferencesUI({
      eventBus: fixture.eventBus,
      document,
    });

    modalManager.init();
    syncService.init();
    preferencesService.init();
    fixture.storage.saveSettings.mockClear();

    syncService.awaitingSyncDecisionApply = true;
    syncService.pendingSyncAction = "overwrite";
    syncService.invokeRequest = vi.fn(async () => undefined);
    preferencesUI.cache.preferences = preferencesService.getSettings();
    preferencesUI.pendingSettings = { bindToAliasMode: true };

    const save = preferencesUI.saveAllSettings(false);
    let settled = false;
    void save.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );

    await vi.waitFor(() => {
      expect(getDirectoryHandle).toHaveBeenCalledOnce();
    });

    try {
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(settled).toBe(false);
      expect(document.getElementById("preferencesModal")?.classList).toContain(
        "active",
      );
      expect(syncService.pendingSyncAction).toBe("overwrite");
    } finally {
      releaseDirectoryHandle(directoryHandle);
    }

    await expect(save).resolves.toBe(true);
    expect(syncService.invokeRequest).toHaveBeenCalledOnce();
    expect(syncService.invokeRequest).toHaveBeenCalledWith(
      "export:sync-to-folder",
      { dirHandle: directoryHandle },
    );
    expect(syncService.pendingSyncAction).toBeNull();
    expect(syncService.awaitingSyncDecisionApply).toBe(false);
    expect(
      document.getElementById("preferencesModal")?.classList,
    ).not.toContain("active");
    expect(fixture.storage.saveSettings).toHaveBeenCalledOnce();
  });
});
