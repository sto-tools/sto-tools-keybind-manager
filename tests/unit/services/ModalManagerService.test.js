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
      overlay.remove();
      modal.remove();
    },
  };
}

describe("ModalManagerService", () => {
  let fixture, eventBusFixture, service, dom;

  beforeEach(() => {
    dom = createDomFixture();
    fixture = createServiceFixture();
    eventBusFixture = fixture.eventBusFixture;
    service = new ModalManagerService({
      eventBus: eventBusFixture.eventBus,
      i18n: { on: vi.fn() },
    });
    service.init();
  });

  afterEach(() => {
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

  it("should preserve the inherited component lifecycle API", () => {
    expect(service.isInitialized).toBeTypeOf("function");
    expect(service.isInitialized()).toBe(true);

    service.destroy();

    expect(service.isInitialized()).toBe(false);
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
});
