import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import BindsetDeleteConfirmUI from "../../../src/js/components/ui/BindsetDeleteConfirmUI.js";
import CommandLibraryUI from "../../../src/js/components/ui/CommandLibraryUI.js";
import InputDialogUI from "../../../src/js/components/ui/InputDialogUI.js";
import KeyBrowserUI from "../../../src/js/components/ui/KeyBrowserUI.js";
import { createDataCoordinatorState } from "../../fixtures/core/componentState.js";

function createEventBus() {
  return {
    emit: vi.fn(() => Promise.resolve()),
    off: vi.fn(),
    on: vi.fn(() => () => {}),
    onDom: vi.fn((target, eventName, handler) => {
      target.addEventListener(eventName, handler);
      return () => target.removeEventListener(eventName, handler);
    }),
  };
}

function createModalManager() {
  return {
    hide: vi.fn(),
    registerRegenerateCallback: vi.fn(),
    show: vi.fn(),
    unregisterRegenerateCallback: vi.fn(),
  };
}

const i18n = { t: (key) => key };

describe("UI typecheck runtime regressions", () => {
  beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", (callback) => callback());
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("resolves regenerated input dialogs for submit and cancel actions", async () => {
    for (const action of ["submit", "cancel"]) {
      const ui = new InputDialogUI({
        eventBus: createEventBus(),
        i18n,
        modalManager: createModalManager(),
      });
      const resultPromise = ui.prompt("Profile name");

      ui.regenerateInputModal();

      const modal = document.getElementById("inputModal");
      expect(modal).toBeTruthy();

      if (action === "submit") {
        const input = modal.querySelector(".input-field");
        input.value = "Regenerated value";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        modal.querySelector(".input-submit").click();
        await expect(resultPromise).resolves.toBe("Regenerated value");
      } else {
        modal.querySelector(".input-cancel").click();
        await expect(resultPromise).resolves.toBeNull();
      }

      ui.destroy();
    }
  });

  it("resolves regenerated bindset deletion dialogs for confirm and cancel", async () => {
    for (const expectedResult of [true, false]) {
      const ui = new BindsetDeleteConfirmUI({
        eventBus: createEventBus(),
        i18n,
        modalManager: createModalManager(),
      });
      const resultPromise = ui.confirm("Secondary", 3);

      ui.regenerateModal();

      const modal = document.getElementById("bindsetDeleteConfirmModal");
      expect(modal).toBeTruthy();

      if (expectedResult) {
        const checkbox = modal.querySelector(
          "#bindset-delete-confirm-checkbox",
        );
        const input = modal.querySelector("#bindset-delete-confirm-input");
        checkbox.checked = true;
        checkbox.dispatchEvent(new Event("change", { bubbles: true }));
        input.value = "DELETE";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        modal.querySelector(".bindset-delete-confirm-btn").click();
      } else {
        modal.querySelector(".bindset-delete-cancel-btn").click();
      }

      await expect(resultPromise).resolves.toBe(expectedResult);
      ui.destroy();
    }
  });

  it("renders bindset action failures through the injected i18n service", () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<div id="bindsetError" hidden></div>';
    const ui = new KeyBrowserUI({
      document,
      eventBus: createEventBus(),
      i18n,
    });

    ui.showError("name_exists");

    const errorElement = document.getElementById("bindsetError");
    expect(errorElement.textContent).toBe("bindset_name_in_use");
    expect(errorElement.style.display).toBe("");

    vi.runAllTimers();
    expect(errorElement.style.display).toBe("none");
    ui.destroy();
  });

  it("refreshes the command library after a DataCoordinator late join", () => {
    const ui = new CommandLibraryUI({
      document,
      eventBus: createEventBus(),
      i18n,
    });
    const updateCommandLibrary = vi
      .spyOn(ui, "updateCommandLibrary")
      .mockResolvedValue(undefined);

    const profile = {
      id: "profile-1",
      environment: "space",
    };

    ui._onInitialState({
      sender: "DataCoordinator",
      state: createDataCoordinatorState({
        authorityEpoch: 1,
        ready: true,
        revision: 1,
        currentProfile: "profile-1",
        currentEnvironment: "space",
        currentProfileData: profile,
        profiles: { "profile-1": profile },
      }),
    });

    expect(ui.cache.currentProfile).toBe("profile-1");
    expect(updateCommandLibrary).toHaveBeenCalledOnce();
    ui.destroy();
  });
});
