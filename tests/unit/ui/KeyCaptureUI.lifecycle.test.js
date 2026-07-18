import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import KeyCaptureUI from "../../../src/js/components/ui/KeyCaptureUI.js";
import { createServiceFixture } from "../../fixtures/index.js";

const ownerState = (overrides = {}) => ({
  authorityEpoch: 71,
  revision: 0,
  isCapturing: false,
  context: "keySelectionModal",
  locationSpecific: false,
  pressedCodes: [],
  currentChord: "",
  capturedChord: null,
  ...overrides,
});

const delegatedDomRegistrations = [
  ["toggleCaptureMode", "click"],
  ["confirm-key-selection", "click"],
  ["cancel-key-selection", "click"],
  [".vkey", "click"],
  ["keyboardLayoutSelector", "change"],
  ["bindsetTargetSelector", "change"],
  ["distinguishModifierSide", "change"],
];

describe("KeyCaptureUI lifecycle", () => {
  let fixture;
  let ui;
  let replacement;
  let modalManager;

  beforeEach(() => {
    document.body.innerHTML = `
      <div id="keySelectionModal">
        <div class="modal-body"></div>
      </div>
    `;
    fixture = createServiceFixture();
    modalManager = { show: vi.fn(), hide: vi.fn() };
    ui = new KeyCaptureUI({
      eventBus: fixture.eventBus,
      modalManager,
      document,
      i18n: { t: (key) => key, language: "en" },
    });
    ui.init();
  });

  afterEach(() => {
    vi.useRealTimers();
    if (replacement && !replacement.destroyed) replacement.destroy();
    if (ui && !ui.destroyed) ui.destroy();
    fixture?.destroy();
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("owns all seven delegated DOM registrations across teardown and reinit", () => {
    expect(
      fixture.eventBus.onDom.mock.calls.map(([target, event]) => [
        target,
        event,
      ]),
    ).toEqual(delegatedDomRegistrations);
    expect(ui.domEventListeners).toHaveLength(7);
    const firstDetachers = fixture.eventBus.onDom.mock.results.map(
      ({ value }) => value,
    );

    ui.destroy();

    for (const detach of firstDetachers) expect(detach).toHaveBeenCalledOnce();
    expect(ui.domEventListeners).toHaveLength(0);
    for (const topic of [
      "key-capture:state-changed",
      "chord-captured",
      "key:duplicate",
      "modal:shown",
      "modal:hidden",
    ]) {
      expect(fixture.eventBus.getListenerCount(topic)).toBe(0);
    }

    ui.init();

    expect(ui.domEventListeners).toHaveLength(7);
    expect(fixture.eventBus.onDom).toHaveBeenCalledTimes(14);
    expect(
      fixture.eventBus.onDom.mock.calls
        .slice(7)
        .map(([target, event]) => [target, event]),
    ).toEqual(delegatedDomRegistrations);
    for (const topic of [
      "key-capture:state-changed",
      "chord-captured",
      "key:duplicate",
      "modal:shown",
      "modal:hidden",
    ]) {
      expect(fixture.eventBus.getListenerCount(topic)).toBe(1);
    }
  });

  it("transfers event ownership to one live replacement instance", () => {
    const predecessorHandler = vi.spyOn(ui, "handleKeyDuplication");
    ui.destroy();

    const replacementModal = { show: vi.fn(), hide: vi.fn() };
    replacement = new KeyCaptureUI({
      eventBus: fixture.eventBus,
      modalManager: replacementModal,
      document,
      i18n: { t: (key) => key, language: "en" },
    });
    const replacementHandler = vi.spyOn(replacement, "handleKeyDuplication");
    replacement.init();

    fixture.eventBus.emit("key:duplicate", { key: "F5" });

    expect(predecessorHandler).not.toHaveBeenCalled();
    expect(replacementHandler).toHaveBeenCalledOnce();
    expect(replacement.pendingDuplicationIntent).toEqual({ sourceKey: "F5" });
    expect(replacementModal.show).toHaveBeenCalledWith("keySelectionModal");
    expect(fixture.eventBus.getListenerCount("key:duplicate")).toBe(1);
  });

  it("guards auto-stop against changed chords and replacement generations", () => {
    vi.useFakeTimers();
    ui.session.begin();
    ui.session.startCapture();
    const stop = vi.spyOn(ui, "stopCaptureMode");

    ui.handleChordCaptured({ chord: "F1", context: "keySelectionModal" });
    ui.session.selectChord("F2");
    vi.advanceTimersByTime(100);
    expect(stop).not.toHaveBeenCalled();

    ui.handleChordCaptured({ chord: "F3", context: "keySelectionModal" });
    ui.session.end();
    ui.session.begin();
    ui.session.startCapture();
    vi.advanceTimersByTime(100);
    expect(stop).not.toHaveBeenCalled();

    ui.handleChordCaptured({ chord: "F4", context: "keySelectionModal" });
    vi.advanceTimersByTime(99);
    expect(stop).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(stop).toHaveBeenCalledOnce();
    expect(ui.autoStopTimer).toBeNull();
  });

  it("cancels a pending auto-stop and stops capture when cancelled", () => {
    vi.useFakeTimers();
    ui.session.begin();
    ui.session.startCapture();
    ui.handleChordCaptured({ chord: "F2", context: "keySelectionModal" });
    fixture.eventBusFixture.clearEventHistory();

    ui.cancelSelection();

    expect(modalManager.hide).toHaveBeenCalledWith("keySelectionModal");
    expect(ui.session.active).toBe(false);
    expect(ui.autoStopTimer).toBeNull();
    fixture.expectEvent("keycapture:stop", null);
    vi.runAllTimers();
    fixture.eventBusFixture.expectEventCount("keycapture:stop", 1);
  });

  it("cancels a pending auto-stop and stops capture when the modal is hidden", () => {
    vi.useFakeTimers();
    ui.session.begin();
    ui.session.startCapture();
    ui.handleChordCaptured({ chord: "F3", context: "keySelectionModal" });
    fixture.eventBusFixture.clearEventHistory();

    fixture.eventBus.emit("modal:hidden", {
      modalId: "keySelectionModal",
      success: true,
    });

    expect(ui.session.active).toBe(false);
    expect(ui.autoStopTimer).toBeNull();
    fixture.expectEvent("keycapture:stop", null);
    vi.runAllTimers();
    fixture.eventBusFixture.expectEventCount("keycapture:stop", 1);
  });

  it("retries capture when a UI-first session meets a stopped owner", () => {
    ui.session.begin();
    ui.startCaptureMode();
    fixture.eventBusFixture.clearEventHistory();
    const initialOwner = ownerState();

    fixture.eventBus.emit("key-capture:state-changed", initialOwner);

    fixture.expectEvent("keycapture:start", { context: "keySelectionModal" });
    fixture.eventBusFixture.expectEventCount("keycapture:start", 1);
    expect(ui.captureState).toEqual(initialOwner);

    fixture.eventBus.emit("key-capture:state-changed", initialOwner);
    fixture.eventBusFixture.expectEventCount("keycapture:start", 1);

    fixture.eventBus.emit(
      "key-capture:state-changed",
      ownerState({ authorityEpoch: 72 }),
    );
    fixture.eventBusFixture.expectEventCount("keycapture:start", 2);
  });

  it("does not discover application or UI instances from runtime globals", () => {
    const appDescriptor = Object.getOwnPropertyDescriptor(globalThis, "app");
    const uiDescriptor = Object.getOwnPropertyDescriptor(globalThis, "stoUI");
    Object.defineProperty(globalThis, "app", {
      configurable: true,
      get() {
        throw new Error("runtime app fallback read");
      },
    });
    Object.defineProperty(globalThis, "stoUI", {
      configurable: true,
      get() {
        throw new Error("runtime UI fallback read");
      },
    });

    let isolated;
    try {
      expect(() => {
        isolated = new KeyCaptureUI({
          eventBus: fixture.eventBus,
          document,
          i18n: { t: (key) => key, language: "en" },
          app: { forbidden: true },
          ui: { forbidden: true },
        });
      }).not.toThrow();
      expect(Object.hasOwn(isolated, "app")).toBe(false);
      expect(Object.hasOwn(isolated, "ui")).toBe(false);
      isolated.destroy();
    } finally {
      if (appDescriptor)
        Object.defineProperty(globalThis, "app", appDescriptor);
      else delete globalThis.app;
      if (uiDescriptor)
        Object.defineProperty(globalThis, "stoUI", uiDescriptor);
      else delete globalThis.stoUI;
    }
  });
});
