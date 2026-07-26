import { describe, it, beforeEach, afterEach, expect, vi } from "vitest";
import ConfirmDialogUI from "../../../src/js/components/ui/ConfirmDialogUI.js";
import { createServiceFixture } from "../../fixtures/index.js";

// Simple stub for modalManager with show/hide tracking
function createModalManagerStub() {
  return {
    show: vi.fn(),
    hide: vi.fn(),
    registerRegenerateCallback: vi.fn(),
    unregisterRegenerateCallback: vi.fn(),
  };
}

describe("ConfirmDialogUI", () => {
  let fixture, modalStub, ui;

  beforeEach(() => {
    // Provide global requestAnimationFrame stub for immediate execution
    vi.stubGlobal("requestAnimationFrame", (cb) => cb());

    fixture = createServiceFixture();
    fixture.eventBus.onDom.mockImplementation((target, event, handler) => {
      target.addEventListener(event, handler);
      return () => target.removeEventListener(event, handler);
    });
    modalStub = createModalManagerStub();
    ui = new ConfirmDialogUI({
      modalManager: modalStub,
      eventBus: fixture.eventBus,
    });
  });

  afterEach(() => {
    if (!ui.destroyed) ui.destroy();
    fixture.destroy();
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("owns both dialog responders only while initialized and restores one set on reinit", async () => {
    const topics = ["ui:confirm", "ui:inform"];
    const confirm = vi.spyOn(ui, "confirm").mockResolvedValue(false);
    const inform = vi.spyOn(ui, "inform").mockResolvedValue(true);
    const request = {
      message: "Proceed?",
      title: "Confirm Test",
      type: "warning",
      context: "testOperation",
    };

    for (const topic of topics) {
      expect(fixture.eventBus.hasListeners(`rpc:${topic}`), topic).toBe(false);
    }

    ui.init();

    for (const topic of topics) {
      expect(fixture.eventBus.getListenerCount(`rpc:${topic}`), topic).toBe(1);
    }
    await expect(ui.request("ui:confirm", request, 0)).resolves.toBe(false);
    await expect(
      ui.request("ui:inform", { ...request, type: "info" }, 0),
    ).resolves.toBe(true);
    expect(confirm).toHaveBeenCalledWith(
      "Proceed?",
      "Confirm Test",
      "warning",
      "testOperation",
    );
    expect(inform).toHaveBeenCalledWith(
      "Proceed?",
      "Confirm Test",
      "info",
      "testOperation",
    );

    ui.destroy();
    for (const topic of topics) {
      expect(fixture.eventBus.hasListeners(`rpc:${topic}`), topic).toBe(false);
    }

    ui.init();
    expect(ui._responseDetachFunctions).toHaveLength(topics.length);
    for (const topic of topics) {
      expect(fixture.eventBus.getListenerCount(`rpc:${topic}`), topic).toBe(1);
    }
  });

  it("rejects invalid RPC payloads before opening a dialog", async () => {
    const confirm = vi.spyOn(ui, "confirm").mockResolvedValue(true);
    ui.init();

    await expect(
      ui.request(
        "ui:confirm",
        {
          message: "Proceed?",
          title: "Confirm Test",
          type: "warning",
          context: "testOperation",
          extra: true,
        },
        0,
      ),
    ).rejects.toThrow("invalid_ui_dialog_request");
    expect(confirm).not.toHaveBeenCalled();
  });

  it("settles pending RPC dialogs and removes their DOM during teardown", async () => {
    ui.init();
    const request = {
      message: "Proceed?",
      title: "Confirm Test",
      type: "warning",
      context: "testOperation",
    };

    const confirmation = ui.request("ui:confirm", request, 0);
    await vi.waitFor(() => {
      expect(document.querySelector(".confirm-modal")).toBeTruthy();
    });

    ui.destroy();

    await expect(confirmation).resolves.toBe(false);
    expect(document.querySelector(".confirm-modal")).toBeNull();
    expect(fixture.eventBus.hasListeners("rpc:ui:confirm")).toBe(false);
  });

  it("should resolve true when user clicks yes", async () => {
    const promise = ui.confirm("Proceed?", "Confirm Test");

    // Modal should be appended to body
    const modalElement = document.querySelector(".confirm-modal");
    expect(modalElement).toBeTruthy();

    // Simulate click on yes button
    modalElement
      .querySelector(".confirm-yes")
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));

    const result = await promise;
    expect(result).toBe(true);
    expect(modalStub.hide).toHaveBeenCalled();
  });

  it("should resolve false when user clicks no", async () => {
    const promise = ui.confirm("Proceed?", "Confirm Test");

    const modalElement = document.querySelector(".confirm-modal");
    expect(modalElement).toBeTruthy();

    // Simulate click on no button
    modalElement
      .querySelector(".confirm-no")
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));

    const result = await promise;
    expect(result).toBe(false);
    expect(modalStub.hide).toHaveBeenCalled();
  });

  it("should handle safe DOM removal when modal already removed from DOM (confirm)", async () => {
    const promise = ui.confirm("Proceed?", "Confirm Test");

    const modalElement = document.querySelector(".confirm-modal");
    expect(modalElement).toBeTruthy();

    // Simulate external process removing the modal from DOM
    document.body.removeChild(modalElement);

    // Verify modal is no longer in DOM
    expect(document.querySelector(".confirm-modal")).toBeNull();

    // Simulate click on yes button - should not throw DOMException
    expect(() => {
      modalElement
        .querySelector(".confirm-yes")
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    }).not.toThrow();

    const result = await promise;
    expect(result).toBe(true);
    expect(modalStub.hide).toHaveBeenCalled();
  });

  it("should handle safe DOM removal when modal already removed from DOM (inform)", async () => {
    const promise = ui.inform("Information message", "Info Test");

    const modalElement = document.querySelector(".inform-modal");
    expect(modalElement).toBeTruthy();

    // Simulate external process removing the modal from DOM
    document.body.removeChild(modalElement);

    // Verify modal is no longer in DOM
    expect(document.querySelector(".inform-modal")).toBeNull();

    // Simulate click on OK button - should not throw DOMException
    expect(() => {
      modalElement
        .querySelector(".inform-ok")
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    }).not.toThrow();

    const result = await promise;
    expect(result).toBe(true);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(modalStub.hide).toHaveBeenCalledOnce();
  });

  it("should handle safe DOM removal when modal parent is null", async () => {
    const promise = ui.confirm("Proceed?", "Confirm Test");

    const modalElement = document.querySelector(".confirm-modal");
    expect(modalElement).toBeTruthy();

    // Simulate modal being removed by setting parentNode to null
    modalElement.parentNode?.removeChild(modalElement);

    // Simulate click on yes button - should not throw DOMException
    expect(() => {
      modalElement
        .querySelector(".confirm-yes")
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    }).not.toThrow();

    const result = await promise;
    expect(result).toBe(true);
    expect(modalStub.hide).toHaveBeenCalled();
  });
});
