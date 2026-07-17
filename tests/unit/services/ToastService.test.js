import { describe, it, beforeEach, afterEach, expect, vi } from "vitest";
import { createServiceFixture } from "../../fixtures/index.js";
import ToastService from "../../../src/js/components/services/ToastService.js";

describe("ToastService", () => {
  let fixture, service, eventBusFixture;

  beforeEach(() => {
    // Provide a container element in the JSDOM
    document.body.innerHTML = '<div id="toastContainer"></div>';

    fixture = createServiceFixture();
    eventBusFixture = fixture.eventBusFixture;
    service = new ToastService({ eventBus: eventBusFixture.eventBus });

    vi.useFakeTimers();
  });

  afterEach(() => {
    if (!service.destroyed) service.destroy();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    document.body.innerHTML = "";
    fixture.destroy();
  });

  it("should create and display a toast in the container", () => {
    service.showToast("Hello World", "success", 1000);
    const toast = document.querySelector(
      "#toastContainer .toast.toast-success",
    );
    expect(toast).toBeTruthy();
  });

  it("should automatically remove a toast after the specified duration", () => {
    service.showToast("Goodbye", "info", 500);
    expect(document.querySelector("#toastContainer .toast")).toBeTruthy();

    // Advance timers: 500ms display duration + 300ms removal animation
    vi.advanceTimersByTime(800);
    expect(document.querySelector("#toastContainer .toast")).toBeNull();
  });

  it("owns toast event delivery across teardown, reinitialization, and replacement without restoring the retired RPC", () => {
    const eventTopic = "toast:show";
    const retiredRpcTopic = "rpc:ui:show-toast";
    const predecessorShowToast = vi.spyOn(service, "showToast");

    expect(eventBusFixture.eventBus.getListenerCount(eventTopic)).toBe(0);
    expect(eventBusFixture.eventBus.getListenerCount(retiredRpcTopic)).toBe(0);

    service.init();
    service.init();

    expect(eventBusFixture.eventBus.getListenerCount(eventTopic)).toBe(1);
    expect(eventBusFixture.eventBus.getListenerCount(retiredRpcTopic)).toBe(0);

    eventBusFixture.eventBus.emit(eventTopic, {
      message: "Event toast",
      type: "success",
      duration: 1000,
    });
    expect(predecessorShowToast).toHaveBeenCalledWith(
      "Event toast",
      "success",
      1000,
    );
    expect(
      document.querySelector("#toastContainer .toast-success .toast-message")
        ?.textContent,
    ).toBe("Event toast");

    service.destroy();
    expect(eventBusFixture.eventBus.getListenerCount(eventTopic)).toBe(0);
    expect(eventBusFixture.eventBus.getListenerCount(retiredRpcTopic)).toBe(0);

    document.getElementById("toastContainer").replaceChildren();
    eventBusFixture.eventBus.emit(eventTopic, {
      message: "After destroy",
      type: "error",
    });
    expect(predecessorShowToast).not.toHaveBeenCalledWith(
      "After destroy",
      "error",
      3000,
    );
    expect(document.querySelector("#toastContainer .toast")).toBeNull();

    service.init();
    expect(eventBusFixture.eventBus.getListenerCount(eventTopic)).toBe(1);
    eventBusFixture.eventBus.emit(eventTopic, {
      message: "After reinit",
      type: "warning",
      duration: 2000,
    });
    expect(predecessorShowToast).toHaveBeenCalledWith(
      "After reinit",
      "warning",
      2000,
    );

    service.destroy();
    const predecessorCallCount = predecessorShowToast.mock.calls.length;
    document.getElementById("toastContainer").replaceChildren();

    const replacement = new ToastService({
      eventBus: eventBusFixture.eventBus,
    });
    service = replacement;
    const replacementShowToast = vi.spyOn(replacement, "showToast");
    replacement.init();

    expect(eventBusFixture.eventBus.getListenerCount(eventTopic)).toBe(1);
    expect(eventBusFixture.eventBus.getListenerCount(retiredRpcTopic)).toBe(0);

    eventBusFixture.eventBus.emit(eventTopic, {
      message: "Replacement toast",
      type: "info",
      duration: 1500,
    });
    expect(replacementShowToast).toHaveBeenCalledOnce();
    expect(replacementShowToast).toHaveBeenCalledWith(
      "Replacement toast",
      "info",
      1500,
    );
    expect(predecessorShowToast).toHaveBeenCalledTimes(predecessorCallCount);
    expect(
      document.querySelector("#toastContainer .toast-info .toast-message")
        ?.textContent,
    ).toBe("Replacement toast");
  });
});
