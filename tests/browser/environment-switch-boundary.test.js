import { describe, expect, it, vi } from "vitest";

import { request } from "../../src/js/core/requestResponse.js";

async function readEnvironmentOwners(bus) {
  const replyTopic = `component:registered:reply:browser-environment:${Date.now()}-${Math.random()}`;
  let interfaceMode;
  let selection;
  const detach = bus.on(replyTopic, ({ sender, state }) => {
    if (sender === "InterfaceModeService")
      interfaceMode = structuredClone(state);
    if (sender === "SelectionService") selection = structuredClone(state);
  });

  try {
    bus.emit("component:register", {
      name: "BrowserEnvironmentProbe",
      replyTopic,
    });
    await vi.waitFor(() => {
      expect(interfaceMode).toBeTruthy();
      expect(selection).toBeTruthy();
    });
    return { interfaceMode, selection };
  } finally {
    detach();
  }
}

function readModeDom() {
  const keySelector = document.querySelector(".key-selector-container");
  const aliasSelector = document.getElementById("aliasSelectorContainer");
  return {
    activeMode:
      document.querySelector(".mode-btn.active")?.getAttribute("data-mode") ??
      null,
    spaceActive:
      document
        .querySelector('[data-mode="space"]')
        ?.classList.contains("active") ?? false,
    groundActive:
      document
        .querySelector('[data-mode="ground"]')
        ?.classList.contains("active") ?? false,
    aliasActive:
      document
        .querySelector('[data-mode="alias"]')
        ?.classList.contains("active") ?? false,
    keySelectorDisplay:
      keySelector instanceof HTMLElement ? keySelector.style.display : null,
    aliasSelectorDisplay: aliasSelector?.style.display ?? null,
  };
}

function readSelectionProjection(commandChainUI) {
  return structuredClone({
    currentEnvironment: commandChainUI.cache.currentEnvironment,
    selectedKey: commandChainUI.cache.selectedKey,
    selectedAlias: commandChainUI.cache.selectedAlias,
    cachedSelections: commandChainUI.cache.cachedSelections,
  });
}

function captureStorage() {
  const snapshot = new Map();
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key !== null) snapshot.set(key, localStorage.getItem(key));
  }
  return snapshot;
}

function restoreStorage(snapshot) {
  localStorage.clear();
  for (const [key, value] of snapshot) {
    if (value !== null) localStorage.setItem(key, value);
  }
}

describe("Environment switch checked-bundle boundary", () => {
  it("publishes only a durably accepted environment and leaves failed attempts invisible", async () => {
    const bus = window.eventBus;
    const coordinator = window.dataCoordinator;
    const storage = window.storageService;
    const commandChainUI = window.commandChainUI;

    expect(bus?.hasListeners("rpc:environment:switch")).toBe(true);
    expect(coordinator?.getCurrentState?.().ready).toBe(true);
    expect(storage).toBeTruthy();
    expect(commandChainUI?.isInitialized?.()).toBe(true);
    if (!bus || !coordinator || !storage || !commandChainUI) return;

    const ownerBefore = coordinator.getCurrentState();
    const profileId = ownerBefore.currentProfile;
    expect(profileId).toBeTruthy();
    if (!profileId) return;

    const savedBrowserStorage = captureStorage();
    const persistedBefore = structuredClone(storage.getProfile(profileId));
    const ownersBefore = await readEnvironmentOwners(bus);
    const modeBefore = ownersBefore.interfaceMode.currentMode;
    const targetMode = modeBefore === "ground" ? "space" : "ground";
    const targetButton = document.querySelector(`[data-mode="${targetMode}"]`);
    expect(targetButton).toBeInstanceOf(HTMLButtonElement);
    if (!(targetButton instanceof HTMLButtonElement)) return;
    expect(targetButton.disabled).toBe(false);
    const acceptedSelectionBefore = structuredClone({
      currentEnvironment: ownersBefore.selection.currentEnvironment,
      selectedKey: ownersBefore.selection.selectedKey,
      selectedAlias: ownersBefore.selection.selectedAlias,
      cachedSelections: ownersBefore.selection.cachedSelections,
    });
    await vi.waitFor(() => {
      expect(readSelectionProjection(commandChainUI)).toEqual(
        acceptedSelectionBefore,
      );
    });
    const selectionProjectionBefore = readSelectionProjection(commandChainUI);
    const domBefore = readModeDom();
    expect(domBefore.activeMode).toBe(modeBefore);
    const publications = {
      data: [],
      environment: [],
      selection: [],
      key: [],
      alias: [],
      keyList: [],
    };
    const detachers = [
      bus.on("data:state-changed", (payload) =>
        publications.data.push(payload),
      ),
      bus.on("environment:changed", (payload) =>
        publications.environment.push(payload),
      ),
      bus.on("selection:state-changed", (payload) =>
        publications.selection.push(payload),
      ),
      bus.on("key-selected", (payload) => publications.key.push(payload)),
      bus.on("alias-selected", (payload) => publications.alias.push(payload)),
      bus.on("key:list-changed", (payload) =>
        publications.keyList.push(payload),
      ),
    ];
    const saveProfile = vi
      .spyOn(storage, "saveProfile")
      .mockReturnValueOnce(false)
      .mockRejectedValueOnce(new Error("browser storage unavailable"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      for (const [index] of ["resolved false", "rejection"].entries()) {
        targetButton.click();
        await vi.waitFor(() => {
          expect(saveProfile).toHaveBeenCalledTimes(index + 1);
        });
        // A same-mode request is a non-writing queue barrier: it settles only
        // after the button-initiated persistence attempt has completed.
        await expect(
          request(bus, "environment:switch", { mode: modeBefore }),
        ).resolves.toEqual({ success: true, mode: modeBefore });

        expect(coordinator.getCurrentState()).toBe(ownerBefore);
        expect(coordinator.getCurrentState().revision).toBe(
          ownerBefore.revision,
        );
        expect(storage.getProfile(profileId)).toEqual(persistedBefore);
        expect(await readEnvironmentOwners(bus)).toEqual(ownersBefore);
        expect(readSelectionProjection(commandChainUI)).toEqual(
          selectionProjectionBefore,
        );
        expect(readModeDom()).toEqual(domBefore);
        expect(publications).toEqual({
          data: [],
          environment: [],
          selection: [],
          key: [],
          alias: [],
          keyList: [],
        });
      }

      targetButton.click();

      await vi.waitFor(() => {
        expect(coordinator.getCurrentState().revision).toBeGreaterThan(
          ownerBefore.revision,
        );
        expect(coordinator.getCurrentState()).toMatchObject({
          currentEnvironment: targetMode,
          currentProfileData: { currentEnvironment: targetMode },
        });
        expect(storage.getProfile(profileId).currentEnvironment).toBe(
          targetMode,
        );
        expect(readSelectionProjection(commandChainUI).currentEnvironment).toBe(
          targetMode,
        );
        expect(readModeDom().activeMode).toBe(targetMode);
      });

      const ownersAfter = await readEnvironmentOwners(bus);
      expect(ownersAfter.interfaceMode).toMatchObject({
        currentMode: targetMode,
        environment: targetMode,
        currentEnvironment: targetMode,
      });
      expect(ownersAfter.selection.currentEnvironment).toBe(targetMode);
      expect(publications.data.length).toBeGreaterThan(0);
      expect(publications.environment).toHaveLength(1);
      expect(publications.environment[0]).toMatchObject({
        fromEnvironment: modeBefore,
        toEnvironment: targetMode,
        environment: targetMode,
      });
      expect(publications.selection.length).toBeGreaterThan(0);
    } finally {
      saveProfile.mockRestore();
      error.mockRestore();
      for (const detach of detachers) detach();

      restoreStorage(savedBrowserStorage);
      storage.getAllData(true);
      await request(bus, "data:reload-state");
      await vi.waitFor(() => {
        expect(coordinator.getCurrentState()).toMatchObject({
          currentProfile: ownerBefore.currentProfile,
          currentEnvironment: ownerBefore.currentEnvironment,
        });
        expect(readSelectionProjection(commandChainUI).currentEnvironment).toBe(
          modeBefore,
        );
        expect(readModeDom()).toEqual(domBefore);
      });
    }
  });
});
