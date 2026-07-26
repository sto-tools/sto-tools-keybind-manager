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
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("rejects acknowledgement when an async saved listener replaces the owner", async () => {
    preferencesService = new PreferencesService({
      eventBus: fixture.eventBus,
      storage: fixture.storage,
    });
    preferencesService.init();
    await preferencesService.initialStateReady;

    let markListenerStarted = () => {};
    const listenerStarted = new Promise((resolve) => {
      markListenerStarted = resolve;
    });
    let releaseListener = () => {};
    const listenerPending = new Promise((resolve) => {
      releaseListener = resolve;
    });
    let successorReady;
    const detach = fixture.eventBus.on("preferences:saved", async () => {
      markListenerStarted();
      await listenerPending;
      preferencesService.destroy();
      preferencesService.init();
      successorReady = preferencesService.initialStateReady;
    });

    const mutation = preferencesService.setSetting("theme", "dark");
    let settled = false;
    void mutation.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    await listenerStarted;
    expect(settled).toBe(false);

    releaseListener();
    await expect(mutation).rejects.toThrow("operation_cancelled");
    expect(successorReady).toBeDefined();
    await expect(successorReady).resolves.toMatchObject({
      ready: true,
      revision: 1,
      settings: { theme: "dark" },
    });
    detach();
  });

  it("keeps a real save pending past the default deadline, then settles and exports once", async () => {
    vi.useFakeTimers();
    const directoryHandle =
      /** @type {import("../../src/js/types/sync-boundary.js").SyncDirectoryHandle} */ (
        /** @type {unknown} */ ({
          kind: "directory",
          name: "Keybinds",
          getFileHandle: vi.fn(),
          getDirectoryHandle: vi.fn(),
          queryPermission: vi.fn().mockResolvedValue("granted"),
          requestPermission: vi.fn().mockResolvedValue("granted"),
        })
      );
    /** @type {(handle: import("../../src/js/types/sync-boundary.js").SyncDirectoryHandle) => void} */
    let releaseDirectoryHandle = () => {};
    const directoryHandleReady = new Promise((resolve) => {
      releaseDirectoryHandle = resolve;
    });
    const getDirectoryHandle = vi.fn(() => directoryHandleReady);
    const getSyncDirectoryState = vi.fn(async () => ({
      handle: await getDirectoryHandle(),
      transitionPending: false,
    }));
    const fs =
      /** @type {import("../../src/js/components/services/FileSystemService.js").default} */ (
        /** @type {unknown} */ ({ getDirectoryHandle, getSyncDirectoryState })
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
    await preferencesService.initialStateReady;
    fixture.storage.saveSettings.mockClear();

    syncService.awaitingSyncDecisionApply = true;
    syncService.pendingSyncAction = "overwrite";
    syncService.invokeRequest = vi.fn(async () => undefined);
    preferencesUI.init();
    preferencesUI.pendingSettings = { bindToAliasMode: true };

    const save = preferencesUI.saveAllSettings(false);
    let settlementCount = 0;
    void save.then(
      () => {
        settlementCount += 1;
      },
      () => {
        settlementCount += 1;
      },
    );

    await vi.waitFor(() => {
      expect(getDirectoryHandle).toHaveBeenCalledOnce();
    });

    await vi.advanceTimersByTimeAsync(5_001);
    expect(settlementCount).toBe(0);
    expect(document.getElementById("preferencesModal")?.classList).toContain(
      "active",
    );
    expect(syncService.pendingSyncAction).toBe("overwrite");
    expect(syncService.invokeRequest).not.toHaveBeenCalled();

    releaseDirectoryHandle(directoryHandle);

    await expect(save).resolves.toBe(true);
    expect(settlementCount).toBe(1);
    expect(syncService.invokeRequest).toHaveBeenCalledOnce();
    expect(syncService.invokeRequest).toHaveBeenCalledWith(
      "export:sync-to-folder",
      { dirHandle: directoryHandle },
      0,
    );
    expect(syncService.pendingSyncAction).toBeNull();
    expect(syncService.awaitingSyncDecisionApply).toBe(false);
    expect(
      document.getElementById("preferencesModal")?.classList,
    ).not.toContain("active");
    expect(fixture.storage.saveSettings).toHaveBeenCalledOnce();
  });
});
