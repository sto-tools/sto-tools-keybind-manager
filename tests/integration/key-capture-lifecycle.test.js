import { afterEach, describe, expect, it, vi } from "vitest";

import DataCoordinator from "../../src/js/components/services/DataCoordinator.js";
import KeyCaptureService from "../../src/js/components/services/KeyCaptureService.js";
import KeyService from "../../src/js/components/services/KeyService.js";
import ModalManagerService from "../../src/js/components/services/ModalManagerService.js";
import SelectionService from "../../src/js/components/services/SelectionService.js";
import KeyCaptureUI from "../../src/js/components/ui/KeyCaptureUI.js";
import { createRealServiceFixture } from "../fixtures/index.js";

const profileId = "captain";
const capturedKey = "F8";

const root = {
  version: "1.0.0",
  created: "2026-01-01T00:00:00.000Z",
  lastModified: "2026-01-01T00:00:00.000Z",
  currentProfile: profileId,
  profiles: {
    [profileId]: {
      name: "Captain",
      description: "Key-capture integration fixture",
      currentEnvironment: "space",
      migrationVersion: "2.1.1",
      builds: {
        space: { keys: { F1: [{ command: "FireAll" }] } },
        ground: { keys: {} },
      },
      aliases: {},
      bindsets: {},
      selections: { space: "F1", ground: null, alias: null },
    },
  },
  globalAliases: {},
  settings: { theme: "default", autoSave: true },
};

function mountCaptureModal() {
  document.body.innerHTML = `
    <div id="modalOverlay" class="modal-overlay"></div>
    <div id="keySelectionModal" class="modal">
      <div class="modal-content">
        <div class="modal-body"></div>
      </div>
    </div>
  `;
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

function clickButton(id) {
  const button = document.getElementById(id);
  expect(button).toBeInstanceOf(HTMLButtonElement);
  button?.click();
  return button;
}

describe("Integration: key-capture lifecycle and owner flow", () => {
  let fixture;
  let coordinator;
  let selectionService;
  let keyService;
  let modalManager;
  let captureService;
  let replacementCaptureService;
  let captureUi;

  async function startHarness(startupOrder = "owner-first") {
    mountCaptureModal();
    vi.spyOn(console, "log").mockImplementation(() => {});

    fixture = await createRealServiceFixture({
      initialStorageData: { sto_keybind_manager: root },
    });
    coordinator = new DataCoordinator({
      eventBus: fixture.eventBus,
      storage: fixture.storage,
      i18n: { t: (key) => key },
      defaultProfiles: {},
    });
    selectionService = new SelectionService({ eventBus: fixture.eventBus });
    keyService = new KeyService({
      eventBus: fixture.eventBus,
      i18n: { t: (key) => key },
    });
    const i18n = {
      t: (key) => key,
      on: vi.fn(),
      off: vi.fn(),
    };
    modalManager = new ModalManagerService({
      eventBus: fixture.eventBus,
      i18n,
    });
    captureService = new KeyCaptureService({
      eventBus: fixture.eventBus,
      document,
      i18n,
    });
    captureUi = new KeyCaptureUI({
      eventBus: fixture.eventBus,
      modalManager,
      document,
      i18n,
    });

    coordinator.init();
    await vi.waitFor(() => {
      expect(coordinator.getCurrentState().ready).toBe(true);
    });
    selectionService.init();
    keyService.init();
    modalManager.init();
    await vi.waitFor(() => {
      expect(selectionService.cache.currentProfile).toBe(profileId);
      expect(keyService.cache.currentProfile).toBe(profileId);
    });

    if (startupOrder === "owner-first") {
      captureService.init();
      captureUi.init();
    } else {
      captureUi.init();
      captureService.init();
    }

    await vi.waitFor(() => {
      expect(captureUi.captureState).toEqual(captureService.getCurrentState());
    });
  }

  async function showCaptureModal() {
    expect(modalManager.show("keySelectionModal")).toBe(true);
    await vi.waitFor(() => {
      const owner = replacementCaptureService || captureService;
      expect(captureUi.session.active).toBe(true);
      expect(owner.getCurrentState().isCapturing).toBe(true);
      expect(captureUi.captureState).toEqual(owner.getCurrentState());
    });
  }

  afterEach(() => {
    if (captureUi && !captureUi.destroyed) captureUi.destroy();
    if (replacementCaptureService && !replacementCaptureService.destroyed) {
      replacementCaptureService.destroy();
    }
    if (captureService && !captureService.destroyed) captureService.destroy();
    if (modalManager && !modalManager.destroyed) modalManager.destroy();
    if (keyService && !keyService.destroyed) keyService.destroy();
    if (selectionService && !selectionService.destroyed) {
      selectionService.destroy();
    }
    if (coordinator && !coordinator.destroyed) coordinator.destroy();
    fixture?.destroy();
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it.each(["owner-first", "ui-first"])(
    "late-joins the complete capture owner in %s startup order",
    async (startupOrder) => {
      await startHarness(startupOrder);

      expect(captureService.getCurrentState()).toMatchObject({
        revision: 0,
        isCapturing: false,
        context: "keySelectionModal",
        pressedCodes: [],
        currentChord: "",
        capturedChord: null,
      });
      expect(captureUi.captureState).toEqual(captureService.getCurrentState());

      await showCaptureModal();
      expect(document.getElementById("captureIndicator")?.classList).toContain(
        "active",
      );

      clickButton("cancel-key-selection");
      await vi.waitFor(() => {
        expect(captureService.getCurrentState().isCapturing).toBe(false);
        expect(captureUi.session.active).toBe(false);
      });
      expect(
        document.getElementById("keySelectionModal")?.classList,
      ).not.toContain("active");
    },
  );

  it("captures a physical key through preview and confirm into the authoritative owner", async () => {
    await startHarness();
    await showCaptureModal();
    const beforeRevision = coordinator.getCurrentState().revision;

    const keydown = dispatchPhysicalKey(capturedKey);
    await vi.waitFor(() => {
      expect(
        document.getElementById("keyPreviewDisplay")?.textContent,
      ).toContain(capturedKey);
      expect(captureUi.session.selectedChord).toBe(capturedKey);
      expect(captureService.getCurrentState()).toMatchObject({
        capturedChord: capturedKey,
        currentChord: capturedKey,
      });
    });
    expect(keydown.defaultPrevented).toBe(true);
    const confirm = document.getElementById("confirm-key-selection");
    expect(confirm).toBeInstanceOf(HTMLButtonElement);
    expect(confirm?.disabled).toBe(false);
    confirm?.click();

    await vi.waitFor(() => {
      const ownerState = coordinator.getCurrentState();
      expect(ownerState.revision).toBeGreaterThan(beforeRevision);
      expect(
        ownerState.profiles[profileId].builds.space.keys[capturedKey],
      ).toEqual([]);
      expect(
        fixture.storage.getProfile(profileId).builds.space.keys[capturedKey],
      ).toEqual([]);
      expect(captureUi.cache.dataState).toEqual(ownerState);
      expect(captureService.getCurrentState().isCapturing).toBe(false);
      expect(captureUi.session.active).toBe(false);
    });
    expect(
      document.getElementById("keySelectionModal")?.classList,
    ).not.toContain("active");
  });

  it("cancels delayed work and safely adopts a replacement capture owner", async () => {
    await startHarness();
    await showCaptureModal();
    dispatchPhysicalKey("F9");
    await vi.waitFor(() => {
      expect(captureUi.session.selectedChord).toBe("F9");
    });

    clickButton("cancel-key-selection");
    await vi.waitFor(() => {
      expect(captureUi.session.active).toBe(false);
      expect(captureService.getCurrentState().isCapturing).toBe(false);
    });
    const canceledState = captureService.getCurrentState();
    dispatchPhysicalKey("F10");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(captureService.getCurrentState()).toEqual(canceledState);

    await showCaptureModal();
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(captureService.getCurrentState().isCapturing).toBe(true);
    expect(captureUi.session.selectedChord).toBeNull();

    captureService.destroy();
    const retiredOwnerState = captureService.getCurrentState();
    replacementCaptureService = new KeyCaptureService({
      eventBus: fixture.eventBus,
      document,
      i18n: { t: (key) => key },
    });
    replacementCaptureService.init();

    await vi.waitFor(() => {
      expect(replacementCaptureService.getCurrentState().isCapturing).toBe(
        true,
      );
      expect(captureUi.captureState).toEqual(
        replacementCaptureService.getCurrentState(),
      );
    });
    const replacementState = replacementCaptureService.getCurrentState();
    expect(replacementState.authorityEpoch).toBeGreaterThan(
      retiredOwnerState.authorityEpoch,
    );

    await fixture.eventBus.emit("key-capture:state-changed", {
      ...retiredOwnerState,
      revision: replacementState.revision + 100,
    });
    expect(captureUi.captureState).toEqual(replacementState);

    clickButton("cancel-key-selection");
    await vi.waitFor(() => {
      expect(replacementCaptureService.getCurrentState().isCapturing).toBe(
        false,
      );
    });

    captureUi.destroy();
    captureUi.init();
    const starts = vi.fn();
    const stops = vi.fn();
    const detachStart = fixture.eventBus.on("keycapture:start", starts);
    const detachStop = fixture.eventBus.on("keycapture:stop", stops);
    try {
      await showCaptureModal();
      expect(starts).toHaveBeenCalledOnce();
      clickButton("cancel-key-selection");
      await vi.waitFor(() => {
        expect(replacementCaptureService.getCurrentState().isCapturing).toBe(
          false,
        );
      });
      expect(stops).toHaveBeenCalledOnce();
    } finally {
      detachStart();
      detachStop();
    }
  });
});
