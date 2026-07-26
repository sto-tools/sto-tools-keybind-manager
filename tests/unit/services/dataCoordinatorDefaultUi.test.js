import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import DataCoordinator from "../../../src/js/components/services/DataCoordinator.js";
import { createServiceFixture } from "../../fixtures/index.js";

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("DataCoordinator default-data UI boundary", () => {
  let fixture;
  let coordinator;
  let detachToast;
  let toastEvents;
  let confirmDialogDescriptor;
  let stoUiDescriptor;

  beforeEach(() => {
    confirmDialogDescriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      "confirmDialog",
    );
    stoUiDescriptor = Object.getOwnPropertyDescriptor(globalThis, "stoUI");
    Object.defineProperty(globalThis, "confirmDialog", {
      configurable: true,
      get() {
        throw new Error("retired ambient confirmDialog must not be read");
      },
    });
    Object.defineProperty(globalThis, "stoUI", {
      configurable: true,
      get() {
        throw new Error("retired ambient stoUI must not be read");
      },
    });

    fixture = createServiceFixture();
    coordinator = new DataCoordinator({
      eventBus: fixture.eventBus,
      storage: fixture.storage,
      i18n: { t: (key) => key },
    });
    toastEvents = [];
    detachToast = fixture.eventBus.on("toast:show", (event) =>
      toastEvents.push(event),
    );
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    detachToast();
    if (!coordinator.destroyed) coordinator.destroy();
    fixture.destroy();
    if (confirmDialogDescriptor) {
      Object.defineProperty(
        globalThis,
        "confirmDialog",
        confirmDialogDescriptor,
      );
    } else {
      delete globalThis.confirmDialog;
    }
    if (stoUiDescriptor) {
      Object.defineProperty(globalThis, "stoUI", stoUiDescriptor);
    } else {
      delete globalThis.stoUI;
    }
    vi.restoreAllMocks();
  });

  it("fails closed with a warning when the confirmation responder is absent", async () => {
    coordinator.state.profiles.default = { name: "Default" };
    const loadDefaultData = vi.spyOn(coordinator, "loadDefaultData");
    const request = vi.spyOn(coordinator, "request");

    await coordinator.handleLoadDefaultData();

    expect(request).toHaveBeenCalledWith(
      "ui:confirm",
      {
        message: "default_profile_exists_message",
        title: "default_profile_exists_title",
        type: "warning",
        context: "loadDefaultData",
      },
      0,
    );
    expect(loadDefaultData).not.toHaveBeenCalled();
    expect(toastEvents).toEqual([
      {
        message: "default_profile_exists_no_overwrite",
        type: "warning",
      },
    ]);
  });

  it("does not overwrite or publish completion when confirmation is cancelled", async () => {
    coordinator.state.profiles.default = { name: "Default" };
    fixture.eventBus.mockResponse("ui:confirm", () => false);
    const loadDefaultData = vi.spyOn(coordinator, "loadDefaultData");

    await coordinator.handleLoadDefaultData();

    expect(loadDefaultData).not.toHaveBeenCalled();
    expect(toastEvents).toEqual([]);
  });

  it("uses an unbounded user-interaction request before overwriting a default profile", async () => {
    coordinator.state.profiles.default = { name: "Default" };
    fixture.eventBus.mockResponse("ui:confirm", () => true);
    const request = vi.spyOn(coordinator, "request");
    const loadDefaultData = vi
      .spyOn(coordinator, "loadDefaultData")
      .mockResolvedValue({
        success: true,
        profilesCreated: 1,
        currentProfile: "default",
      });

    await coordinator.handleLoadDefaultData();

    expect(request).toHaveBeenCalledWith(
      "ui:confirm",
      {
        message: "default_profile_exists_message",
        title: "default_profile_exists_title",
        type: "warning",
        context: "loadDefaultData",
      },
      0,
    );
    expect(loadDefaultData).toHaveBeenCalledOnce();
    expect(toastEvents).toEqual([
      { message: "default_data_loaded_successfully", type: "success" },
    ]);
  });

  it("does not resume a confirmed overwrite after its lifecycle generation is retired", async () => {
    coordinator.state.profiles.default = { name: "Default" };
    const pendingConfirmation = deferred();
    vi.spyOn(coordinator, "request").mockReturnValue(
      pendingConfirmation.promise,
    );
    const loadDefaultData = vi.spyOn(coordinator, "loadDefaultData");

    const operation = coordinator.handleLoadDefaultData();
    await vi.waitFor(() => {
      expect(coordinator.request).toHaveBeenCalledOnce();
    });
    coordinator.destroy();
    pendingConfirmation.resolve(true);
    await operation;

    expect(loadDefaultData).not.toHaveBeenCalled();
    expect(toastEvents).toEqual([]);
  });

  it("publishes successful default-data completion through toast:show", async () => {
    vi.spyOn(coordinator, "loadDefaultData").mockResolvedValue({
      success: true,
      profilesCreated: 1,
      currentProfile: "default",
    });

    await coordinator.handleLoadDefaultData();

    expect(toastEvents).toEqual([
      { message: "default_data_loaded_successfully", type: "success" },
    ]);
  });

  it("publishes a rejected default-data result through toast:show", async () => {
    vi.spyOn(coordinator, "loadDefaultData").mockResolvedValue({
      success: false,
      error: "write failed",
    });

    await coordinator.handleLoadDefaultData();

    expect(toastEvents).toEqual([
      { message: "default_data_load_failed", type: "error" },
    ]);
  });

  it("publishes an unexpected default-data error through toast:show", async () => {
    vi.spyOn(coordinator, "loadDefaultData").mockRejectedValue(
      new Error("unexpected failure"),
    );

    await coordinator.handleLoadDefaultData();

    expect(toastEvents).toEqual([
      { message: "default_data_load_error", type: "error" },
    ]);
  });
});
