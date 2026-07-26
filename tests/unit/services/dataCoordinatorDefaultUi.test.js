import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import DataCoordinator from "../../../src/js/components/services/DataCoordinator.js";
import { createServiceFixture } from "../../fixtures/index.js";

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
      value: undefined,
      writable: true,
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

  it("publishes the no-overwrite warning without consulting ambient UI", async () => {
    coordinator.state.profiles.default = { name: "Default" };
    const loadDefaultData = vi.spyOn(coordinator, "loadDefaultData");

    await coordinator.handleLoadDefaultData();

    expect(loadDefaultData).not.toHaveBeenCalled();
    expect(toastEvents).toEqual([
      {
        message: "default_profile_exists_no_overwrite",
        type: "warning",
      },
    ]);
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
