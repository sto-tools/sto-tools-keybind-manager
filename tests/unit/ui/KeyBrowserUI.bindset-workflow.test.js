import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import KeyBrowserUI from "../../../src/js/components/ui/KeyBrowserUI.js";
import { createDataCoordinatorState } from "../../fixtures/core/componentState.js";
import { createEventBusFixture } from "../../fixtures/core/eventBus.js";

const profileWithBindset = (keys = {}) => ({
  id: "captain",
  name: "Captain",
  builds: { space: { keys: {} }, ground: { keys: {} } },
  bindsets: {
    Tactical: {
      space: { keys },
      ground: { keys: {} },
    },
  },
  aliases: {},
});

const stateFor = (profile, revision = 1) =>
  createDataCoordinatorState({
    authorityEpoch: 10,
    revision,
    currentProfile: profile.id,
    currentProfileData: profile,
    profiles: { [profile.id]: profile },
  });

describe("KeyBrowserUI bindset workflow ownership", () => {
  let fixture;
  let ui;
  let confirmDialog;
  let bindsetDeleteConfirm;

  beforeEach(() => {
    document.body.innerHTML = '<div id="bindsetError"></div>';
    fixture = createEventBusFixture();
    confirmDialog = { confirm: vi.fn() };
    bindsetDeleteConfirm = {
      confirm: vi.fn(),
      cancelActiveConfirmation: vi.fn(),
    };
    ui = new KeyBrowserUI({
      eventBus: fixture.eventBus,
      document,
      i18n: { t: (key) => key },
      confirmDialog,
      bindsetDeleteConfirm,
    });
    ui.request = vi.fn().mockResolvedValue({ success: true });
  });

  afterEach(() => {
    if (ui && !ui.destroyed) ui.destroy();
    fixture.destroy();
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("never issues a delete request while counting an empty bindset", async () => {
    ui._cacheDataState(stateFor(profileWithBindset()));
    confirmDialog.confirm.mockResolvedValue(false);

    await expect(ui.confirmDeleteBindset("Tactical")).resolves.toBe(false);

    expect(confirmDialog.confirm).toHaveBeenCalledOnce();
    expect(bindsetDeleteConfirm.confirm).not.toHaveBeenCalled();
    expect(ui.request).not.toHaveBeenCalled();

    confirmDialog.confirm.mockResolvedValue(true);
    await expect(ui.confirmDeleteBindset("Tactical")).resolves.toBe(true);

    expect(ui.request).toHaveBeenCalledOnce();
    expect(ui.request).toHaveBeenCalledWith("bindset:delete", {
      name: "Tactical",
    });
  });

  it("uses the destructive workflow and exact RPC for a nonempty bindset", async () => {
    ui._cacheDataState(stateFor(profileWithBindset({ F1: ["FireAll"] })));
    bindsetDeleteConfirm.confirm.mockResolvedValue(true);

    await expect(ui.confirmDeleteBindset("Tactical")).resolves.toBe(true);

    expect(confirmDialog.confirm).not.toHaveBeenCalled();
    expect(bindsetDeleteConfirm.confirm).toHaveBeenCalledWith(
      "Tactical",
      1,
      "bindsetDelete",
    );
    expect(ui.request).toHaveBeenCalledWith("bindset:delete-with-keys", {
      name: "Tactical",
    });
  });

  it("makes a confirmation completion inert after accepted state replacement", async () => {
    const profile = profileWithBindset();
    ui._cacheDataState(stateFor(profile, 1));
    /** @type {(confirmed: boolean) => void} */
    let resolveConfirmation = () => {};
    confirmDialog.confirm.mockReturnValue(
      new Promise((resolve) => {
        resolveConfirmation = resolve;
      }),
    );

    const deletion = ui.confirmDeleteBindset("Tactical");
    ui._cacheDataState(stateFor(profile, 2));
    resolveConfirmation(true);

    await expect(deletion).resolves.toBe(false);
    expect(ui.request).not.toHaveBeenCalled();
  });

  it("does not discover dialog dependencies from application globals", () => {
    const globalConfirm = { confirm: vi.fn() };
    const globalInput = { prompt: vi.fn() };
    vi.stubGlobal("confirmDialog", globalConfirm);
    vi.stubGlobal("inputDialog", globalInput);

    const isolated = new KeyBrowserUI({
      eventBus: fixture.eventBus,
      document,
      i18n: { t: (key) => key },
      bindsetDeleteConfirm,
    });

    expect(isolated.confirmDialog).toBeNull();
    expect(isolated.inputDialog).toBeNull();
    isolated.destroy();
  });

  it("cancels the owned destructive confirmation during owner cleanup", () => {
    ui.destroy();

    expect(
      bindsetDeleteConfirm.cancelActiveConfirmation,
    ).toHaveBeenCalledOnce();
  });

  it("clears a visible bindset error across destroy and reinitialization", () => {
    vi.useFakeTimers();
    try {
      const errorElement = /** @type {HTMLElement} */ (
        document.getElementById("bindsetError")
      );
      ui.showError("invalid_name");

      expect(errorElement.textContent).not.toBe("");
      expect(errorElement.style.display).toBe("");
      expect(ui._errorTimer).not.toBeNull();

      ui.destroy();

      expect(ui._errorTimer).toBeNull();
      expect(errorElement.textContent).toBe("");
      expect(errorElement.style.display).toBe("none");

      ui.init();
      vi.advanceTimersByTime(4000);

      expect(errorElement.textContent).toBe("");
      expect(errorElement.style.display).toBe("none");
    } finally {
      vi.useRealTimers();
    }
  });
});
