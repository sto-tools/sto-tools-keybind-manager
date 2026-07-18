import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import KeyCaptureUI from "../../../src/js/components/ui/KeyCaptureUI.js";
import { createServiceFixture } from "../../fixtures/index.js";

const ownerState = (overrides = {}) => ({
  authorityEpoch: 41,
  revision: 0,
  isCapturing: false,
  context: "keySelectionModal",
  locationSpecific: false,
  pressedCodes: [],
  currentChord: "",
  capturedChord: null,
  ...overrides,
});

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("KeyCaptureUI", () => {
  let fixture;
  let ui;
  let modalManager;

  beforeEach(() => {
    document.body.innerHTML = `
      <div id="keySelectionModal" tabindex="-1">
        <div class="modal-body"></div>
      </div>
    `;
    fixture = createServiceFixture();
    modalManager = { show: vi.fn(), hide: vi.fn() };
    ui = new KeyCaptureUI({
      eventBus: fixture.eventBus,
      modalManager,
      document,
      i18n: {
        language: "en",
        t: vi.fn((key, params = {}) => {
          if (key === "key_added") return `key_added:${params.keyName}`;
          if (key === "key_duplicated") {
            return `key_duplicated:${params.from}->${params.to}`;
          }
          if (params.keyName) return `${key}:${params.keyName}`;
          return key;
        }),
      },
    });
    ui.init();
  });

  afterEach(() => {
    if (ui && !ui.destroyed) ui.destroy();
    fixture?.destroy();
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  function beginDraft(chord, options = {}) {
    ui.session.begin(options);
    expect(ui.selectKey(chord)).toBe(true);
  }

  it("waits for accepted owner state before projecting capture start and stop", () => {
    ui.initializeModal();

    const captureIndicator = document.getElementById("captureIndicator");
    const virtualKeyboard = document.getElementById("virtualKeyboard");
    const confirmButton = document.getElementById("confirm-key-selection");
    expect(ui.session.active).toBe(true);
    expect(ui.session.capturing).toBe(true);
    expect(captureIndicator?.classList).not.toContain("active");
    expect(virtualKeyboard?.classList).not.toContain("disabled");
    expect(confirmButton?.disabled).toBe(true);
    fixture.expectEvent("keycapture:start", {
      context: "keySelectionModal",
    });

    expect(ui.acceptCaptureState(ownerState({ isCapturing: true }))).toBe(true);
    expect(captureIndicator?.classList).toContain("active");
    expect(virtualKeyboard?.classList).toContain("disabled");

    expect(
      ui.acceptCaptureState(ownerState({ revision: 1, isCapturing: false })),
    ).toBe(true);
    expect(captureIndicator?.classList).not.toContain("active");
    expect(virtualKeyboard?.classList).not.toContain("disabled");
    expect(document.getElementById("toggleCaptureMode")?.textContent).toBe(
      "start_capture",
    );
  });

  it("projects selector metacharacters from an accepted owner snapshot safely", () => {
    ui.initializeModal();
    const keyCode = 'Quote"]\\#';
    const key = document.createElement("button");
    key.setAttribute("data-key-code", keyCode);
    document.getElementById("virtualKeyboard")?.appendChild(key);
    const state = ownerState({
      isCapturing: true,
      pressedCodes: [keyCode],
      currentChord: keyCode,
    });

    expect(() => ui.acceptCaptureState(state)).not.toThrow();
    expect(ui.captureState).toEqual(state);
    expect(key.classList).toContain("pressed");
  });

  describe("confirmSelection", () => {
    it("uses the modal draft and target bindset for a successful add", async () => {
      beginDraft("K1", { targetBindset: "Away Team" });
      ui.request = vi.fn().mockResolvedValue({ success: true });
      const reset = vi.spyOn(ui, "resetState");
      const toast = vi.spyOn(ui, "showToast");

      await ui.confirmSelection();

      expect(ui.request).toHaveBeenCalledWith("key:add", {
        key: "K1",
        bindset: "Away Team",
      });
      expect(toast).toHaveBeenCalledWith("key_added:K1", "success");
      expect(modalManager.hide).toHaveBeenCalledWith("keySelectionModal");
      expect(reset).toHaveBeenCalledOnce();
    });

    it("keeps the draft and modal open when add fails", async () => {
      beginDraft("K2");
      ui.request = vi.fn().mockResolvedValue({
        success: false,
        error: "key_already_exists",
        params: { keyName: "K2" },
      });
      const reset = vi.spyOn(ui, "resetState");
      const toast = vi.spyOn(ui, "showToast");

      await ui.confirmSelection();

      expect(toast).toHaveBeenCalledWith("key_already_exists:K2", "error");
      expect(modalManager.hide).not.toHaveBeenCalled();
      expect(reset).not.toHaveBeenCalled();
      expect(ui.session.selectedChord).toBe("K2");
    });

    it("uses the session-owned duplication intent on success", async () => {
      beginDraft("F7", {
        duplicationMode: true,
        sourceKey: "F1",
      });
      ui.request = vi.fn().mockResolvedValue({
        success: true,
        sourceKey: "F1",
        newKey: "F7",
      });
      const toast = vi.spyOn(ui, "showToast");

      await ui.confirmSelection();

      expect(ui.request).toHaveBeenCalledWith("key:duplicate-with-name", {
        sourceKey: "F1",
        newKey: "F7",
      });
      expect(toast).toHaveBeenCalledWith("key_duplicated:F1->F7", "success");
      expect(modalManager.hide).toHaveBeenCalledWith("keySelectionModal");
    });

    it.each([
      ["legacy structured", { success: true, data: { from: "F1", to: "F7" } }],
      ["local draft", { success: true }],
    ])(
      "uses %s duplication names when canonical fields are absent",
      async (_source, response) => {
        beginDraft("F7", {
          duplicationMode: true,
          sourceKey: "F1",
        });
        ui.request = vi.fn().mockResolvedValue(response);
        const toast = vi.spyOn(ui, "showToast");

        await ui.confirmSelection();

        expect(toast).toHaveBeenCalledWith("key_duplicated:F1->F7", "success");
      },
    );

    it("keeps a failed duplication draft active", async () => {
      beginDraft("F7", {
        duplicationMode: true,
        sourceKey: "F1",
      });
      ui.request = vi.fn().mockResolvedValue({
        success: false,
        error: "failed_to_duplicate_key",
      });
      const toast = vi.spyOn(ui, "showToast");

      await ui.confirmSelection();

      expect(toast).toHaveBeenCalledWith("failed_to_duplicate_key", "error");
      expect(modalManager.hide).not.toHaveBeenCalled();
      expect(ui.session).toMatchObject({
        active: true,
        duplicationMode: true,
        sourceKey: "F1",
        selectedChord: "F7",
      });
    });

    it("ignores a successful awaited add after the draft revision changes", async () => {
      beginDraft("F5");
      const result = deferred();
      ui.request = vi.fn(() => result.promise);
      const toast = vi.spyOn(ui, "showToast");

      const confirmation = ui.confirmSelection();
      expect(ui.request).toHaveBeenCalledOnce();
      ui.session.selectChord("F6");
      result.resolve({ success: true });
      await confirmation;

      expect(toast).not.toHaveBeenCalled();
      expect(modalManager.hide).not.toHaveBeenCalled();
      expect(ui.session.selectedChord).toBe("F6");
    });

    it("ignores a rejected awaited duplication after session replacement", async () => {
      beginDraft("F7", {
        duplicationMode: true,
        sourceKey: "F1",
      });
      const result = deferred();
      ui.request = vi.fn(() => result.promise);
      const toast = vi.spyOn(ui, "showToast");
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const confirmation = ui.confirmSelection();
      ui.session.end();
      ui.session.begin();
      result.reject(new Error("stale failure"));
      await confirmation;

      expect(toast).not.toHaveBeenCalled();
      expect(modalManager.hide).not.toHaveBeenCalled();
      expect(consoleError).not.toHaveBeenCalled();
    });
  });

  it("keeps the modal draft isolated from common selection broadcasts", async () => {
    beginDraft("F8");
    fixture.eventBus.emit("key-selected", {
      key: "G",
      environment: "ground",
      source: "SelectionService",
    });
    fixture.eventBus.emit("alias-selected", {
      name: "EmergencyPower",
      source: "SelectionService",
    });
    fixture.eventBus.emit("selection:state-changed", {
      selectedKey: "H",
      selectedAlias: null,
      editingContext: null,
      cachedSelections: { space: "F1", ground: "H", alias: null },
      currentEnvironment: "ground",
    });

    expect(ui.cache).toMatchObject({
      selectedKey: "H",
      selectedAlias: null,
      currentEnvironment: "ground",
    });
    expect(ui.session.selectedChord).toBe("F8");

    ui.request = vi.fn().mockResolvedValue({
      success: false,
      error: "expected_test_failure",
    });
    await ui.confirmSelection();
    expect(ui.request).toHaveBeenCalledWith("key:add", {
      key: "F8",
      bindset: "Primary Bindset",
    });
  });
});
