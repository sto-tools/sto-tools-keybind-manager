import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import BindsetDeleteConfirmUI from "../../../src/js/components/ui/BindsetDeleteConfirmUI.js";
import BindsetManagerUI from "../../../src/js/components/ui/BindsetManagerUI.js";
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
      const resolvedTarget =
        typeof target === "string" ? document.getElementById(target) : target;
      if (!resolvedTarget) return () => {};
      resolvedTarget.addEventListener(eventName, handler);
      return () => resolvedTarget.removeEventListener(eventName, handler);
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
    vi.unstubAllGlobals();
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

  it("uses only the injected input dialog for bindset create and rename", async () => {
    document.body.innerHTML = `
      <button id="createBindsetBtn"></button>
      <button id="renameBindsetBtn"></button>
    `;
    const ambientInputDialog = { prompt: vi.fn() };
    const injectedInputDialog = { prompt: vi.fn() };
    vi.stubGlobal("inputDialog", ambientInputDialog);

    const isolated = new BindsetManagerUI({
      document,
      eventBus: createEventBus(),
      i18n,
    });
    expect(isolated.inputDialog).toBeNull();

    const ui = new BindsetManagerUI({
      document,
      eventBus: createEventBus(),
      i18n,
      inputDialog: injectedInputDialog,
    });
    vi.spyOn(ui, "render").mockImplementation(() => {});
    ui.request = vi.fn().mockResolvedValue({ success: true });
    ui.init();
    ui.cache.bindsetNames = ["Primary Bindset", "Tactical"];

    injectedInputDialog.prompt.mockResolvedValueOnce(" Science ");
    document.getElementById("createBindsetBtn").click();
    await vi.waitFor(() => {
      expect(ui.request).toHaveBeenCalledWith("bindset:create", {
        name: "Science",
      });
    });
    const createOptions = injectedInputDialog.prompt.mock.calls[0][1];
    expect(injectedInputDialog.prompt.mock.calls[0][0]).toBe(
      "enter_bindset_name",
    );
    expect(createOptions).toMatchObject({
      title: "create_bindset",
      placeholder: "bindset_name",
    });
    expect(createOptions.validate(" ")).toBe("name_required");
    expect(createOptions.validate("Tactical")).toBe("name_exists");
    expect(createOptions.validate("Science")).toBe(true);

    ui.selectedBindset = "Science";
    injectedInputDialog.prompt.mockResolvedValueOnce(" Operations ");
    document.getElementById("renameBindsetBtn").click();
    await vi.waitFor(() => {
      expect(ui.request).toHaveBeenCalledWith("bindset:rename", {
        oldName: "Science",
        newName: "Operations",
      });
    });
    const renameOptions = injectedInputDialog.prompt.mock.calls[1][1];
    expect(injectedInputDialog.prompt.mock.calls[1][0]).toBe("enter_new_name");
    expect(renameOptions).toMatchObject({
      title: "rename_bindset",
      defaultValue: "Science",
      placeholder: "bindset_name",
    });
    expect(renameOptions.validate("Science")).toBe("name_unchanged");
    expect(ambientInputDialog.prompt).not.toHaveBeenCalled();

    ui.destroy();
    isolated.destroy();
  });

  it("detaches and reinstalls bindset manager listeners across reinitialization", () => {
    document.body.innerHTML = '<button id="createBindsetBtn"></button>';
    const eventBus = createEventBus();
    const inputDialog = { prompt: vi.fn().mockResolvedValue(null) };
    const ui = new BindsetManagerUI({
      document,
      eventBus,
      i18n,
      inputDialog,
    });
    const render = vi.spyOn(ui, "render").mockImplementation(() => {});

    ui.init();
    const firstRegistrations = eventBus.on.mock.calls.filter(
      ([topic]) => topic === "bindsets:changed",
    );
    expect(firstRegistrations).toHaveLength(2);
    const firstRenderListener = firstRegistrations[1][1];
    firstRenderListener({ names: ["Primary Bindset"] });
    expect(render).toHaveBeenCalledTimes(2);

    ui.destroy();
    expect(eventBus.off).toHaveBeenCalledWith(
      "bindsets:changed",
      firstRenderListener,
    );
    document.getElementById("createBindsetBtn").click();
    expect(inputDialog.prompt).not.toHaveBeenCalled();

    ui.init();
    const allRegistrations = eventBus.on.mock.calls.filter(
      ([topic]) => topic === "bindsets:changed",
    );
    expect(allRegistrations).toHaveLength(4);
    const secondRenderListener = allRegistrations[3][1];
    expect(secondRenderListener).not.toBe(firstRenderListener);
    secondRenderListener({ names: ["Primary Bindset", "Science"] });
    expect(render).toHaveBeenCalledTimes(4);

    document.getElementById("createBindsetBtn").click();
    expect(inputDialog.prompt).toHaveBeenCalledOnce();
    ui.destroy();
  });

  it("keeps failed and cancelled bindset actions behind injected dialog boundaries", async () => {
    document.body.innerHTML = `
      <button id="createBindsetBtn"></button>
      <button id="renameBindsetBtn"></button>
      <button id="deleteBindsetBtn"></button>
    `;
    const inputDialog = { prompt: vi.fn() };
    const confirmDialog = { confirm: vi.fn() };
    const ui = new BindsetManagerUI({
      document,
      eventBus: createEventBus(),
      i18n,
      confirmDialog,
      inputDialog,
    });
    ui.request = vi.fn();
    const showError = vi.spyOn(ui, "showError").mockImplementation(() => {});
    ui.init();
    ui.cache.bindsetNames = ["Primary Bindset", "Science"];

    inputDialog.prompt.mockResolvedValueOnce(null);
    document.getElementById("createBindsetBtn").click();
    await vi.waitFor(() => expect(inputDialog.prompt).toHaveBeenCalledOnce());
    expect(ui.request).not.toHaveBeenCalled();

    inputDialog.prompt.mockResolvedValueOnce(" Science ");
    ui.request.mockResolvedValueOnce({ success: false, error: "name_exists" });
    document.getElementById("createBindsetBtn").click();
    await vi.waitFor(() =>
      expect(showError).toHaveBeenLastCalledWith("name_exists"),
    );

    document.getElementById("renameBindsetBtn").click();
    expect(inputDialog.prompt).toHaveBeenCalledTimes(2);

    ui.selectedBindset = "Science";
    inputDialog.prompt.mockResolvedValueOnce("Science");
    document.getElementById("renameBindsetBtn").click();
    await vi.waitFor(() => expect(inputDialog.prompt).toHaveBeenCalledTimes(3));
    expect(ui.request).toHaveBeenCalledTimes(1);

    inputDialog.prompt.mockResolvedValueOnce(" Operations ");
    ui.request.mockResolvedValueOnce({ success: false, error: "not_found" });
    document.getElementById("renameBindsetBtn").click();
    await vi.waitFor(() =>
      expect(showError).toHaveBeenLastCalledWith("not_found"),
    );

    confirmDialog.confirm.mockResolvedValueOnce(false);
    document.getElementById("deleteBindsetBtn").click();
    await vi.waitFor(() =>
      expect(confirmDialog.confirm).toHaveBeenCalledOnce(),
    );
    expect(ui.request).toHaveBeenCalledTimes(2);

    confirmDialog.confirm.mockResolvedValueOnce(true);
    ui.request.mockResolvedValueOnce({ success: false, error: "not_empty" });
    document.getElementById("deleteBindsetBtn").click();
    await vi.waitFor(() =>
      expect(ui.request).toHaveBeenLastCalledWith("bindset:delete", {
        name: "Science",
      }),
    );
    expect(confirmDialog.confirm).toHaveBeenLastCalledWith(
      "confirm_delete_bindset",
      "confirm_delete",
      "danger",
      "bindsetDelete",
    );
    expect(showError).toHaveBeenLastCalledWith("not_empty");
    ui.destroy();
  });

  it("renders bindset selection state and action availability", async () => {
    document.body.innerHTML = `
      <ul id="bindsetList"></ul>
      <button id="renameBindsetBtn"></button>
      <button id="deleteBindsetBtn"></button>
    `;
    const ui = new BindsetManagerUI({
      document,
      eventBus: createEventBus(),
      i18n,
    });
    ui.cache.bindsetNames = ["Primary Bindset", "Science"];

    await ui.render();
    expect(document.querySelectorAll("#bindsetList li")).toHaveLength(2);
    expect(document.getElementById("renameBindsetBtn").disabled).toBe(true);
    expect(document.getElementById("deleteBindsetBtn").disabled).toBe(true);

    document.querySelectorAll("#bindsetList li")[1].click();
    expect(ui.selectedBindset).toBe("Science");
    expect(document.querySelector("#bindsetList .selected").textContent).toBe(
      "Science",
    );
    expect(document.getElementById("renameBindsetBtn").disabled).toBe(false);
    expect(document.getElementById("deleteBindsetBtn").disabled).toBe(false);

    document.querySelector("#bindsetList .selected").click();
    expect(ui.selectedBindset).toBeNull();
    expect(document.getElementById("renameBindsetBtn").disabled).toBe(true);

    ui.selectedBindset = "Primary Bindset";
    await ui.render();
    expect(document.getElementById("renameBindsetBtn").disabled).toBe(true);

    document.getElementById("renameBindsetBtn").remove();
    document.getElementById("deleteBindsetBtn").remove();
    await ui.render();
    document.getElementById("bindsetList").remove();
    await ui.render();
    ui.destroy();
  });

  it("renders translated bindset errors and repaints only live late joiners", () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<div id="bindsetError"></div>';
    const ui = new BindsetManagerUI({
      document,
      eventBus: createEventBus(),
      i18n,
    });
    const render = vi.spyOn(ui, "render").mockImplementation(() => {});

    ui.showError("name_exists");
    const errorElement = document.getElementById("bindsetError");
    expect(errorElement.textContent).toBe("bindset_name_in_use");
    expect(errorElement.style.display).toBe("");
    vi.runOnlyPendingTimers();
    expect(errorElement.style.display).toBe("none");

    ui.showError(undefined);
    expect(errorElement.textContent).toBe("error");
    errorElement.remove();
    expect(() => ui.showError("not_found")).not.toThrow();

    ui.handleInitialState({
      sender: "BindsetService",
      state: { bindsets: ["Primary Bindset"] },
    });
    expect(render).not.toHaveBeenCalled();

    ui.init();
    render.mockClear();
    ui.handleInitialState({
      sender: "BindsetService",
      state: { bindsets: ["Primary Bindset", "Science"] },
    });
    expect(render).toHaveBeenCalledOnce();
    ui.handleInitialState({
      sender: "InterfaceModeService",
      state: {
        currentMode: "space",
        environment: "space",
        currentEnvironment: "space",
      },
    });
    expect(render).toHaveBeenCalledOnce();
    ui.destroy();
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

  it("caches a DataCoordinator late join but waits for presentation ownership before first paint", () => {
    const ui = new CommandLibraryUI({
      document,
      eventBus: createEventBus(),
      i18n,
    });
    const setupCommandLibrary = vi
      .spyOn(ui, "setupCommandLibrary")
      .mockResolvedValue(undefined);
    const updateCommandLibrary = vi
      .spyOn(ui, "updateCommandLibrary")
      .mockResolvedValue(undefined);
    ui.init();

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
    expect(setupCommandLibrary).not.toHaveBeenCalled();

    ui._onInitialState({
      sender: "CommandPresentationService",
      state: {
        authorityEpoch: 2,
        revision: 0,
        collapsedCategories: ["system"],
        collapsedGroups: [],
      },
    });

    expect(ui.cache.commandPresentationState).toMatchObject({
      authorityEpoch: 2,
      collapsedCategories: ["system"],
    });
    expect(setupCommandLibrary).toHaveBeenCalledOnce();
    ui.destroy();
  });
});
