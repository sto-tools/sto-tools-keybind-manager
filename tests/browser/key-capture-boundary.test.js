import { describe, expect, it, vi } from "vitest";

import { request } from "../../src/js/core/requestResponse.js";

/** @param {typeof window.eventBus} bus */
async function readKeyCaptureState(bus) {
  const replyTopic = `component:registered:reply:browser-key-capture:${Date.now()}-${Math.random()}`;
  /** @type {import('../../src/js/types/events/component-state.js').KeyCaptureStateSnapshot | undefined} */
  let captureState;
  const detach = bus.on(replyTopic, ({ sender, state }) => {
    if (sender === "KeyCaptureService") captureState = structuredClone(state);
  });
  try {
    bus.emit("component:register", {
      name: "BrowserKeyCaptureProbe",
      replyTopic,
    });
    await vi.waitFor(() => {
      expect(captureState).toBeTruthy();
    });
    return captureState;
  } finally {
    detach();
  }
}

function dispatchPhysicalKey(code) {
  const event = new KeyboardEvent("keydown", {
    key: code,
    code,
    bubbles: true,
    cancelable: true,
  });
  document.dispatchEvent(event);
  return event;
}

function button(id) {
  const element = document.getElementById(id);
  expect(element).toBeInstanceOf(HTMLButtonElement);
  return element instanceof HTMLButtonElement ? element : null;
}

describe("Key-capture checked-bundle boundary", () => {
  it("captures, confirms, persists, cancels, and reopens through the checked bundle", async () => {
    const bus = window.eventBus;
    const coordinator = window.dataCoordinator;
    const storage = window.storageService;
    const chainUi = window.commandChainUI;
    const addKey = button("addKeyBtn");
    const modal = document.getElementById("keySelectionModal");

    expect(bus).toBeTruthy();
    expect(coordinator?.getCurrentState?.().ready).toBe(true);
    expect(storage).toBeTruthy();
    expect(chainUi?.isInitialized?.()).toBe(true);
    expect(modal).toBeInstanceOf(HTMLElement);
    expect(bus?.hasListeners("key-capture:state-changed")).toBe(true);
    expect(bus?.hasListeners("keycapture:start")).toBe(true);
    expect(bus?.hasListeners("keycapture:stop")).toBe(true);
    if (!bus || !coordinator || !storage || !chainUi || !addKey || !modal) {
      return;
    }

    const startingState = coordinator.getCurrentState();
    const profileId = startingState.currentProfile;
    const originalEnvironment = startingState.currentEnvironment;
    const originalSelection = {
      selectedKey: chainUi.cache.selectedKey,
      selectedAlias: chainUi.cache.selectedAlias,
    };
    expect(profileId).toBeTruthy();
    if (!profileId) return;

    const environment = ["space", "ground"].includes(originalEnvironment)
      ? originalEnvironment
      : "space";
    if (environment !== originalEnvironment) {
      await request(bus, "environment:switch", { mode: environment });
      await vi.waitFor(() => {
        expect(coordinator.getCurrentState().currentEnvironment).toBe(
          environment,
        );
      });
    }

    const profile = coordinator.getCurrentState().profiles[profileId];
    const keys = profile.builds?.[environment]?.keys || {};
    const probeKey = [
      "F24",
      "F23",
      "F22",
      "F21",
      "F20",
      "F19",
      "F18",
      "F17",
      "F16",
      "F15",
      "F14",
      "F13",
    ].find((candidate) => !Object.hasOwn(keys, candidate));
    expect(probeKey).toBeTruthy();
    if (!probeKey) return;

    let captureState = await readKeyCaptureState(bus);
    const detachState = bus.on("key-capture:state-changed", (state) => {
      captureState = structuredClone(state);
    });

    try {
      if (captureState?.isCapturing) {
        await bus.emit("keycapture:stop");
        await vi.waitFor(() => {
          expect(captureState?.isCapturing).toBe(false);
        });
      }

      addKey.click();
      await vi.waitFor(() => {
        expect(modal.classList).toContain("active");
        expect(captureState?.isCapturing).toBe(true);
        expect(
          document.getElementById("captureIndicator")?.classList,
        ).toContain("active");
      });

      const keydown = dispatchPhysicalKey(probeKey);
      await vi.waitFor(() => {
        expect(
          document.getElementById("keyPreviewDisplay")?.textContent,
        ).toContain(probeKey);
        expect(captureState?.capturedChord).toBe(probeKey);
        expect(button("confirm-key-selection")?.disabled).toBe(false);
      });
      expect(keydown.defaultPrevented).toBe(true);
      button("confirm-key-selection")?.click();

      await vi.waitFor(() => {
        expect(
          coordinator.getCurrentState().profiles[profileId].builds?.[
            environment
          ]?.keys?.[probeKey],
        ).toEqual([]);
        expect(
          storage.getProfile(profileId)?.builds?.[environment]?.keys?.[
            probeKey
          ],
        ).toEqual([]);
        expect(chainUi.cache.dataState).toEqual(coordinator.getCurrentState());
        expect(captureState?.isCapturing).toBe(false);
        expect(modal.classList).not.toContain("active");
      });

      addKey.click();
      await vi.waitFor(() => {
        expect(captureState?.isCapturing).toBe(true);
        expect(modal.classList).toContain("active");
      });
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(captureState?.isCapturing).toBe(true);
      expect(
        document.getElementById("keyPreviewDisplay")?.textContent,
      ).not.toContain(probeKey);

      button("cancel-key-selection")?.click();
      await vi.waitFor(() => {
        expect(captureState?.isCapturing).toBe(false);
        expect(modal.classList).not.toContain("active");
      });
      const canceledState = structuredClone(captureState);
      dispatchPhysicalKey(probeKey === "F24" ? "F23" : "F24");
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(captureState).toEqual(canceledState);

      addKey.click();
      await vi.waitFor(() => {
        expect(captureState?.isCapturing).toBe(true);
        expect(modal.classList).toContain("active");
      });
      button("cancel-key-selection")?.click();
      await vi.waitFor(() => {
        expect(captureState?.isCapturing).toBe(false);
        expect(modal.classList).not.toContain("active");
      });
    } finally {
      if (modal.classList.contains("active")) {
        button("cancel-key-selection")?.click();
      }
      if (captureState?.isCapturing) await bus.emit("keycapture:stop");
      await request(bus, "data:update-profile", {
        profileId,
        delete: {
          builds: { [environment]: { keys: [probeKey] } },
        },
      });
      if (environment === originalEnvironment) {
        await request(bus, "selection:select-key", {
          keyName: originalSelection.selectedKey,
          environment,
          bindset: "Primary Bindset",
          skipPersistence: true,
        });
      } else {
        await request(bus, "environment:switch", {
          mode: originalEnvironment,
        });
      }
      detachState();
    }

    expect(
      Object.hasOwn(
        coordinator.getCurrentState().profiles[profileId].builds?.[environment]
          ?.keys || {},
        probeKey,
      ),
    ).toBe(false);
    expect(
      Object.hasOwn(
        storage.getProfile(profileId)?.builds?.[environment]?.keys || {},
        probeKey,
      ),
    ).toBe(false);
    expect(coordinator.getCurrentState().currentEnvironment).toBe(
      originalEnvironment,
    );
    if (originalEnvironment !== "alias") {
      expect(chainUi.cache.selectedKey).toBe(originalSelection.selectedKey);
    } else {
      expect(chainUi.cache.selectedAlias).toBe(originalSelection.selectedAlias);
    }
  });
});
