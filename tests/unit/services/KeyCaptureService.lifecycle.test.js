import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import KeyCaptureService from "../../../src/js/components/services/KeyCaptureService.js";
import { createServiceFixture } from "../../fixtures/index.js";

const ACTION_TOPICS = [
  "keycapture:start",
  "keycapture:stop",
  "keycapture:set-location-specific",
];
const RETIRED_FRAGMENT_TOPICS = ["capture-start", "capture-stop", "update"];
const DOCUMENT_TOPICS = [
  "keydown",
  "keyup",
  "mousedown",
  "mouseup",
  "mousemove",
  "wheel",
  "dblclick",
];
const SNAPSHOT_FIELDS = [
  "authorityEpoch",
  "revision",
  "isCapturing",
  "context",
  "locationSpecific",
  "pressedCodes",
  "currentChord",
  "capturedChord",
].sort();

function createDocumentHarness() {
  const listeners = new Map();
  const document = {
    addEventListener: vi.fn((topic, handler) => {
      let topicListeners = listeners.get(topic);
      if (!topicListeners) {
        topicListeners = new Set();
        listeners.set(topic, topicListeners);
      }
      topicListeners.add(handler);
    }),
    removeEventListener: vi.fn((topic, handler) => {
      listeners.get(topic)?.delete(handler);
    }),
  };

  return {
    document,
    listenerCount: (topic) => listeners.get(topic)?.size ?? 0,
  };
}

function expectActionListenerCount(eventBus, expected) {
  for (const topic of ACTION_TOPICS) {
    expect(eventBus.getListenerCount(topic), topic).toBe(expected);
  }
}

function expectDocumentListenerCount(documentHarness, expected) {
  for (const topic of DOCUMENT_TOPICS) {
    expect(documentHarness.listenerCount(topic), topic).toBe(expected);
  }
}

function expectCompleteSnapshot(state, expected = {}) {
  expect(Object.keys(state).sort()).toEqual(SNAPSHOT_FIELDS);
  expect(state).toMatchObject(expected);
  expect(Number.isSafeInteger(state.authorityEpoch)).toBe(true);
  expect(state.authorityEpoch).toBeGreaterThan(0);
  expect(Number.isSafeInteger(state.revision)).toBe(true);
  expect(state.revision).toBeGreaterThanOrEqual(0);
  expect(typeof state.isCapturing).toBe("boolean");
  expect(state.context.length).toBeGreaterThan(0);
  expect(typeof state.locationSpecific).toBe("boolean");
  expect(new Set(state.pressedCodes).size).toBe(state.pressedCodes.length);
  expect(state.pressedCodes.every((code) => code.length > 0)).toBe(true);
  expect(typeof state.currentChord).toBe("string");
  expect(
    state.capturedChord === null || typeof state.capturedChord === "string",
  ).toBe(true);
  expect(Object.isFrozen(state)).toBe(true);
  expect(Object.isFrozen(state.pressedCodes)).toBe(true);
}

function mouseEvent(overrides = {}) {
  return {
    button: 0,
    clientX: 10,
    clientY: 20,
    preventDefault: vi.fn(),
    ...overrides,
  };
}

describe("KeyCaptureService lifecycle and owner state", () => {
  let fixture;
  let services;

  beforeEach(() => {
    fixture = createServiceFixture();
    services = [];
  });

  afterEach(() => {
    for (const service of services.reverse()) {
      if (!service.destroyed) service.destroy();
    }
    fixture.destroy();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function createService(documentHarness = createDocumentHarness()) {
    const service = new KeyCaptureService({
      eventBus: fixture.eventBus,
      document: documentHarness.document,
    });
    services.push(service);
    return { service, documentHarness };
  }

  it("owns exactly one action-listener set across init, destroy, and same-instance reinit", () => {
    const { service, documentHarness } = createService();
    const startCapture = vi.spyOn(service, "startCapture");

    expectActionListenerCount(fixture.eventBus, 0);
    service.init();
    const firstAuthority = service.getCurrentState().authorityEpoch;
    expectActionListenerCount(fixture.eventBus, 1);

    service.init();
    expectActionListenerCount(fixture.eventBus, 1);

    service.destroy();
    expectActionListenerCount(fixture.eventBus, 0);

    service.init();
    expectActionListenerCount(fixture.eventBus, 1);
    expect(service.getCurrentState()).toMatchObject({ revision: 0 });
    expect(service.getCurrentState().authorityEpoch).toBeGreaterThan(
      firstAuthority,
    );

    fixture.eventBus.emit("keycapture:start", {
      context: "keySelectionModal",
    });
    expect(startCapture).toHaveBeenCalledOnce();
    expectDocumentListenerCount(documentHarness, 1);
  });

  it("transfers action and document ownership to a replacement instance", () => {
    vi.useFakeTimers();
    const predecessorDocument = createDocumentHarness();
    const replacementDocument = createDocumentHarness();
    const { service: predecessor } = createService(predecessorDocument);
    const predecessorStart = vi.spyOn(predecessor, "startCapture");
    const predecessorCapture = vi.spyOn(predecessor, "captureMouseGesture");

    predecessor.init();
    predecessor.startCapture("keySelectionModal");
    predecessor.handleMouseDown(mouseEvent());
    predecessor.handleMouseUp(mouseEvent());
    expect(predecessor.mouseState.pendingClickTimer).not.toBeNull();

    predecessor.destroy();
    expectActionListenerCount(fixture.eventBus, 0);
    expectDocumentListenerCount(predecessorDocument, 0);

    const { service: replacement } = createService(replacementDocument);
    const replacementStart = vi.spyOn(replacement, "startCapture");
    replacement.init();
    expectActionListenerCount(fixture.eventBus, 1);

    fixture.eventBus.emit("keycapture:start", {
      context: "keySelectionModal",
    });
    vi.advanceTimersByTime(500);

    expect(predecessorStart).toHaveBeenCalledOnce();
    expect(predecessorCapture).not.toHaveBeenCalled();
    expect(replacementStart).toHaveBeenCalledOnce();
    expectDocumentListenerCount(predecessorDocument, 0);
    expectDocumentListenerCount(replacementDocument, 1);
    expect(replacement.getCurrentState().isCapturing).toBe(true);
  });

  it("adds and removes exactly seven document listeners idempotently", () => {
    const { service, documentHarness } = createService();
    service.init();

    service.startCapture("capture-context");
    expect(documentHarness.document.addEventListener.mock.calls).toEqual([
      ["keydown", service.boundHandleKeyDown],
      ["keyup", service.boundHandleKeyUp],
      ["mousedown", service.boundHandleMouseDown],
      ["mouseup", service.boundHandleMouseUp],
      ["mousemove", service.boundHandleMouseMove],
      ["wheel", service.boundHandleWheel, { passive: false }],
      ["dblclick", service.boundHandleDblClick],
    ]);
    expectDocumentListenerCount(documentHarness, 1);
    expect(service.getCurrentState()).toMatchObject({
      revision: 1,
      isCapturing: true,
      context: "capture-context",
    });

    service.startCapture("ignored-context");
    expect(documentHarness.document.addEventListener).toHaveBeenCalledTimes(7);
    expect(service.getCurrentState().revision).toBe(1);

    service.stopCapture();
    expect(documentHarness.document.removeEventListener.mock.calls).toEqual([
      ["keydown", service.boundHandleKeyDown],
      ["keyup", service.boundHandleKeyUp],
      ["mousedown", service.boundHandleMouseDown],
      ["mouseup", service.boundHandleMouseUp],
      ["mousemove", service.boundHandleMouseMove],
      ["wheel", service.boundHandleWheel],
      ["dblclick", service.boundHandleDblClick],
    ]);
    expectDocumentListenerCount(documentHarness, 0);
    expect(service.getCurrentState()).toMatchObject({
      revision: 2,
      isCapturing: false,
      context: "capture-context",
      pressedCodes: [],
      currentChord: "",
    });

    service.stopCapture();
    expect(documentHarness.document.removeEventListener).toHaveBeenCalledTimes(
      7,
    );
    expect(service.getCurrentState().revision).toBe(2);
  });

  it("actively destroys capture, cancels pending input, and can reinitialize cleanly", () => {
    vi.useFakeTimers();
    const { service, documentHarness } = createService();
    const captureMouseGesture = vi.spyOn(service, "captureMouseGesture");

    service.init();
    const firstAuthority = service.getCurrentState().authorityEpoch;
    service.startCapture("active-destroy");
    service.handleMouseDown(mouseEvent());
    service.handleMouseUp(mouseEvent());
    expect(service.mouseState.pendingClickTimer).not.toBeNull();

    service.destroy();

    expect(service.isCapturing).toBe(false);
    expect(service.mouseState.pendingClickTimer).toBeNull();
    expectDocumentListenerCount(documentHarness, 0);
    expectActionListenerCount(fixture.eventBus, 0);
    expect(service.getCurrentState()).toMatchObject({
      revision: 2,
      isCapturing: false,
      context: "active-destroy",
      pressedCodes: [],
      currentChord: "",
    });

    vi.advanceTimersByTime(500);
    expect(captureMouseGesture).not.toHaveBeenCalled();

    documentHarness.document.addEventListener.mockClear();
    documentHarness.document.removeEventListener.mockClear();
    service.init();
    expect(service.getCurrentState()).toMatchObject({ revision: 0 });
    expect(service.getCurrentState().authorityEpoch).toBeGreaterThan(
      firstAuthority,
    );
    expectActionListenerCount(fixture.eventBus, 1);

    service.startCapture("after-reinit");
    expect(documentHarness.document.addEventListener).toHaveBeenCalledTimes(7);
    expectDocumentListenerCount(documentHarness, 1);
  });

  it("cancels a pending mouse click when capture stops", () => {
    vi.useFakeTimers();
    const { service } = createService();
    const captureMouseGesture = vi.spyOn(service, "captureMouseGesture");
    service.init();
    service.startCapture();
    service.handleMouseDown(mouseEvent());
    service.handleMouseUp(mouseEvent());

    expect(service.mouseState.pendingClickGesture).toBe("Lclick");
    expect(service.mouseState.pendingClickTimer).not.toBeNull();

    service.stopCapture();
    vi.advanceTimersByTime(500);

    expect(service.mouseState.pendingClickTimer).toBeNull();
    expect(service.mouseState.pendingClickGesture).toBeNull();
    expect(captureMouseGesture).not.toHaveBeenCalled();
  });

  it("publishes detached complete snapshots and retains no consumer mutation", () => {
    const states = [];
    fixture.eventBus.on("key-capture:state-changed", (state) => {
      states.push(state);
    });
    const { service } = createService();
    service.init();

    const firstRead = service.getCurrentState();
    const secondRead = service.getCurrentState();
    expectCompleteSnapshot(states[0], { revision: 0, isCapturing: false });
    expect(firstRead).toEqual(states[0]);
    expect(firstRead).not.toBe(states[0]);
    expect(secondRead).not.toBe(firstRead);
    expect(secondRead.pressedCodes).not.toBe(firstRead.pressedCodes);

    expect(() => firstRead.pressedCodes.push("ControlLeft")).toThrow(TypeError);
    expect(() => {
      firstRead.context = "consumer-owned";
    }).toThrow(TypeError);
    expect(service.getCurrentState()).toEqual(states[0]);

    service.startCapture("new-session");
    expect(states).toHaveLength(2);
    expect(states[0]).toMatchObject({
      revision: 0,
      isCapturing: false,
      context: "keySelectionModal",
    });
    expectCompleteSnapshot(states[1], {
      revision: 1,
      isCapturing: true,
      context: "new-session",
    });
  });

  it("publishes every capture transition as one complete revision and retires state fragments", async () => {
    const states = [];
    const chords = [];
    fixture.eventBus.on("key-capture:state-changed", (state) => {
      states.push(state);
    });
    fixture.eventBus.on("chord-captured", (payload) => {
      chords.push(payload);
    });
    const { service } = createService();
    service.init();
    const authorityEpoch = service.getCurrentState().authorityEpoch;
    fixture.eventBusFixture.clearEventHistory();

    service.setLocationSpecific(true);
    service.setLocationSpecific(true);
    service.startCapture("keySelectionModal");
    await service.handleKeyDown({
      code: "ControlLeft",
      preventDefault: vi.fn(),
    });
    await service.handleKeyDown({ code: "KeyA", preventDefault: vi.fn() });
    service.stopCapture();

    expect(states.map(({ revision }) => revision)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(
      states.every((state) => state.authorityEpoch === authorityEpoch),
    ).toBe(true);
    for (const state of states) expectCompleteSnapshot(state);
    expect(states[0]).toMatchObject({
      revision: 0,
      isCapturing: false,
      locationSpecific: false,
      pressedCodes: [],
      currentChord: "",
      capturedChord: null,
    });
    expect(states[1]).toMatchObject({
      revision: 1,
      locationSpecific: true,
      currentChord: "",
    });
    expect(states[2]).toMatchObject({
      revision: 2,
      isCapturing: true,
      pressedCodes: [],
      capturedChord: null,
    });
    expect(states[3]).toMatchObject({
      revision: 3,
      pressedCodes: ["ControlLeft"],
      currentChord: "LCTRL",
      capturedChord: null,
    });
    expect(states[4]).toMatchObject({
      revision: 4,
      pressedCodes: ["ControlLeft", "KeyA"],
      currentChord: "LCTRL+A",
      capturedChord: "LCTRL+A",
    });
    expect(states[5]).toMatchObject({
      revision: 5,
      isCapturing: false,
      pressedCodes: [],
      currentChord: "",
      capturedChord: "LCTRL+A",
    });
    expect(chords).toEqual([
      { chord: "LCTRL+A", context: "keySelectionModal" },
    ]);

    for (const topic of RETIRED_FRAGMENT_TOPICS) {
      expect(fixture.eventBusFixture.getEventsOfType(topic), topic).toEqual([]);
    }
  });

  it("answers late joiners with the current detached owner snapshot only while active", async () => {
    const { service } = createService();
    service.init();
    service.startCapture("late-join");
    await service.handleKeyDown({
      code: "ShiftLeft",
      preventDefault: vi.fn(),
    });
    const ownerState = service.getCurrentState();
    const replies = [];
    const replyTopic = "component:registered:reply:LifecycleProbe:test";
    fixture.eventBus.on(replyTopic, (reply) => replies.push(reply));

    fixture.eventBus.emit("component:register", {
      name: "LifecycleProbe",
      replyTopic,
    });

    expect(replies).toHaveLength(1);
    expect(replies[0]).toEqual({
      sender: "KeyCaptureService",
      state: ownerState,
    });
    expect(replies[0].state).not.toBe(ownerState);
    expect(replies[0].state.pressedCodes).not.toBe(ownerState.pressedCodes);
    expectCompleteSnapshot(replies[0].state, {
      revision: 2,
      isCapturing: true,
      context: "late-join",
      pressedCodes: ["ShiftLeft"],
      currentChord: "Shift",
    });

    service.destroy();
    fixture.eventBus.emit("component:register", {
      name: "LifecycleProbe",
      replyTopic,
    });
    expect(replies).toHaveLength(1);
  });

  it("starts a fresh revision-zero authority for each initialized owner generation", () => {
    const states = [];
    fixture.eventBus.on("key-capture:state-changed", (state) => {
      states.push(state);
    });
    const { service } = createService();
    const constructionAuthority = service.getCurrentState().authorityEpoch;

    service.init();
    const firstAuthority = service.getCurrentState().authorityEpoch;
    expect(firstAuthority).toBeGreaterThan(constructionAuthority);
    expect(service.getCurrentState().revision).toBe(0);
    service.setLocationSpecific(true);
    expect(service.getCurrentState().revision).toBe(1);

    service.destroy();
    service.init();
    const secondAuthority = service.getCurrentState().authorityEpoch;

    expect(secondAuthority).toBeGreaterThan(firstAuthority);
    expect(service.getCurrentState()).toMatchObject({
      revision: 0,
      isCapturing: false,
      context: "keySelectionModal",
      locationSpecific: false,
      pressedCodes: [],
      currentChord: "",
      capturedChord: null,
    });
    expect(states.at(-1)).toEqual(service.getCurrentState());
  });
});
