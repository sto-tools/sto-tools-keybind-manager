import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ModalManagerService from "../../../src/js/components/services/ModalManagerService.js";
import { createServiceFixture } from "../../fixtures/index.js";

function createDomFixture() {
  const overlay = document.createElement("div");
  overlay.id = "modalOverlay";
  document.body.appendChild(overlay);

  const modal = document.createElement("div");
  modal.id = "testModal";
  modal.className = "modal";
  modal.innerHTML = '<button data-modal="testModal">Close</button>';
  document.body.appendChild(modal);

  return {
    cleanup: () => {
      document.body.classList.remove("modal-open");
      overlay.remove();
      modal.remove();
    },
  };
}

function createI18nFixture() {
  const languageChangedListeners = new Set();
  const i18n = {
    on: vi.fn((event, listener) => {
      if (event === "languageChanged") languageChangedListeners.add(listener);
    }),
    off: vi.fn((event, listener) => {
      if (event === "languageChanged") {
        languageChangedListeners.delete(listener);
      }
    }),
  };

  return {
    i18n,
    emitLanguageChanged() {
      for (const listener of languageChangedListeners) listener();
    },
    get listenerCount() {
      return languageChangedListeners.size;
    },
  };
}

describe("ModalManagerService", () => {
  let fixture, eventBusFixture, service, dom, i18nFixture;

  function expectSingleLifecycleEvent(topic, payload) {
    expect(
      eventBusFixture
        .getEventsOfType(topic)
        .map(({ data: eventPayload }) => eventPayload),
    ).toEqual([payload]);
  }

  function showAndClearLifecycleHistory() {
    expect(service.show("testModal")).toBe(true);
    eventBusFixture.clearEventHistory();
  }

  beforeEach(() => {
    dom = createDomFixture();
    fixture = createServiceFixture();
    eventBusFixture = fixture.eventBusFixture;
    eventBusFixture.eventBus.onDom = vi.fn((target, event, handler) => {
      target.addEventListener(event, handler);
      return () => target.removeEventListener(event, handler);
    });
    i18nFixture = createI18nFixture();
    service = new ModalManagerService({
      eventBus: eventBusFixture.eventBus,
      i18n: i18nFixture.i18n,
    });
    service.init();
  });

  afterEach(() => {
    if (service && !service.destroyed) service.destroy();
    dom.cleanup();
    fixture.destroy();
  });

  it("should show and hide modal via event bus", () => {
    eventBusFixture.eventBus.emit("modal:show", { modalId: "testModal" });

    const modal = document.getElementById("testModal");
    const overlay = document.getElementById("modalOverlay");
    expect(modal.classList.contains("active")).toBe(true);
    expect(overlay.classList.contains("active")).toBe(true);

    eventBusFixture.eventBus.emit("modal:hide", { modalId: "testModal" });
    expect(modal.classList.contains("active")).toBe(false);
    expect(overlay.classList.contains("active")).toBe(false);
  });

  it("publishes each successful action-route lifecycle exactly once", () => {
    eventBusFixture.clearEventHistory();

    eventBusFixture.eventBus.emit("modal:show", { modalId: "testModal" });

    expectSingleLifecycleEvent("modal:shown", {
      modalId: "testModal",
      success: true,
    });
    expect(eventBusFixture.getEventsOfType("modal:hidden")).toEqual([]);

    eventBusFixture.clearEventHistory();
    eventBusFixture.eventBus.emit("modal:hide", { modalId: "testModal" });

    expectSingleLifecycleEvent("modal:hidden", {
      modalId: "testModal",
      success: true,
    });
    expect(eventBusFixture.getEventsOfType("modal:shown")).toEqual([]);
  });

  it("publishes each failed action-route lifecycle exactly once", () => {
    eventBusFixture.clearEventHistory();

    eventBusFixture.eventBus.emit("modal:show", {
      modalId: "missingModal",
    });

    expectSingleLifecycleEvent("modal:shown", {
      modalId: "missingModal",
      success: false,
    });
    expect(eventBusFixture.getEventsOfType("modal:hidden")).toEqual([]);

    eventBusFixture.clearEventHistory();
    eventBusFixture.eventBus.emit("modal:hide", {
      modalId: "missingModal",
    });

    expectSingleLifecycleEvent("modal:hidden", {
      modalId: "missingModal",
      success: false,
    });
    expect(eventBusFixture.getEventsOfType("modal:shown")).toEqual([]);
  });

  it("publishes each successful direct-API lifecycle exactly once", () => {
    eventBusFixture.clearEventHistory();

    expect(service.show("testModal")).toBe(true);

    expectSingleLifecycleEvent("modal:shown", {
      modalId: "testModal",
      success: true,
    });
    expect(eventBusFixture.getEventsOfType("modal:hidden")).toEqual([]);

    eventBusFixture.clearEventHistory();
    expect(service.hide("testModal")).toBe(true);

    expectSingleLifecycleEvent("modal:hidden", {
      modalId: "testModal",
      success: true,
    });
    expect(eventBusFixture.getEventsOfType("modal:shown")).toEqual([]);
  });

  it("publishes each failed direct-API lifecycle exactly once", () => {
    eventBusFixture.clearEventHistory();

    expect(service.show("missingModal")).toBe(false);

    expectSingleLifecycleEvent("modal:shown", {
      modalId: "missingModal",
      success: false,
    });
    expect(eventBusFixture.getEventsOfType("modal:hidden")).toEqual([]);

    eventBusFixture.clearEventHistory();
    expect(service.hide("missingModal")).toBe(false);

    expectSingleLifecycleEvent("modal:hidden", {
      modalId: "missingModal",
      success: false,
    });
    expect(eventBusFixture.getEventsOfType("modal:shown")).toEqual([]);
  });

  it("should preserve the inherited component lifecycle API", () => {
    expect(service.isInitialized).toBeTypeOf("function");
    expect(service.isInitialized()).toBe(true);

    service.destroy();

    expect(service.isInitialized()).toBe(false);
    expect(i18nFixture.listenerCount).toBe(0);
    expect(service.domEventListeners).toHaveLength(0);
  });

  it("should toggle modal via click on data-modal element", () => {
    // Show first
    service.show("testModal");
    const modal = document.getElementById("testModal");
    expect(modal.classList.contains("active")).toBe(true);

    // Click close button (has data-modal attr)
    modal.querySelector('[data-modal="testModal"]').click();
    expect(modal.classList.contains("active")).toBe(false);
  });

  it("publishes modal:hidden success exactly once for a close-button path", () => {
    showAndClearLifecycleHistory();
    const modal = document.getElementById("testModal");

    modal.querySelector('[data-modal="testModal"]').click();

    expect(modal.classList.contains("active")).toBe(false);
    expectSingleLifecycleEvent("modal:hidden", {
      modalId: "testModal",
      success: true,
    });
  });

  it("publishes modal:hidden success exactly once for an Escape path", () => {
    showAndClearLifecycleHistory();

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    expect(
      document.getElementById("testModal").classList.contains("active"),
    ).toBe(false);
    expectSingleLifecycleEvent("modal:hidden", {
      modalId: "testModal",
      success: true,
    });
  });

  it("publishes modal:hidden success exactly once for an overlay path", () => {
    showAndClearLifecycleHistory();

    document.getElementById("modalOverlay").click();

    expect(
      document.getElementById("testModal").classList.contains("active"),
    ).toBe(false);
    expectSingleLifecycleEvent("modal:hidden", {
      modalId: "testModal",
      success: true,
    });
  });

  it("lifecycle-owns language, modal, and document listeners across re-init", () => {
    const regenerate = vi.fn();
    service.registerRegenerateCallback("testModal", regenerate);
    service.show("testModal");

    expect(i18nFixture.listenerCount).toBe(1);
    expect(service.domEventListeners).toHaveLength(3);
    expect(eventBusFixture.eventBus.getListenerCount("modal:show")).toBe(1);

    i18nFixture.emitLanguageChanged();
    expect(regenerate).toHaveBeenCalledOnce();
    eventBusFixture.expectEvent("modal:regenerated", {
      modalId: "testModal",
    });

    service.destroy();
    expect(i18nFixture.listenerCount).toBe(0);
    expect(service.domEventListeners).toHaveLength(0);
    expect(eventBusFixture.eventBus.getListenerCount("modal:show")).toBe(0);

    i18nFixture.emitLanguageChanged();
    expect(regenerate).toHaveBeenCalledOnce();

    service.init();
    expect(i18nFixture.listenerCount).toBe(1);
    expect(service.domEventListeners).toHaveLength(3);
    expect(eventBusFixture.eventBus.getListenerCount("modal:show")).toBe(1);

    i18nFixture.emitLanguageChanged();
    expect(regenerate).toHaveBeenCalledTimes(2);
    expect(i18nFixture.i18n.on).toHaveBeenCalledTimes(2);
    expect(i18nFixture.i18n.off).toHaveBeenCalledOnce();
  });

  it("does not let a stale owner unregister its replacement", () => {
    const staleCallback = vi.fn();
    const replacementCallback = vi.fn();
    service.registerRegenerateCallback("testModal", staleCallback);
    service.registerRegenerateCallback("testModal", replacementCallback);

    service.unregisterRegenerateCallback("testModal", staleCallback);

    expect(service.regenerateCallbacks.testModal).toBe(replacementCallback);
  });

  it("preserves direct modal close behavior without an event bus", () => {
    service.destroy();
    service = new ModalManagerService({ i18n: i18nFixture.i18n });
    service.init();
    service.show("testModal");
    const hide = vi.spyOn(service, "hide");

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    expect(hide).toHaveBeenCalledWith("testModal");
    expect(document.getElementById("testModal")?.classList).not.toContain(
      "active",
    );
    expect(service.fallbackDocumentListeners).toHaveLength(3);
    service.destroy();
    expect(service.fallbackDocumentListeners).toHaveLength(0);
  });
});
