import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProfileUI from "../../../src/js/components/ui/ProfileUI.js";
import { createDataCoordinatorState } from "../../fixtures/core/componentState.js";
import { createEventBusFixture } from "../../fixtures/core/eventBus.js";

function deferred() {
  let resolve;
  const promise = new Promise((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

describe("ProfileUI mutation lifecycle", () => {
  let fixture, ui, toast;
  let revision;
  const profile = (name) => ({
    name,
    builds: { space: { keys: {} } },
    aliases: {},
  });
  function select(profileId = "alpha", authorityEpoch = 1) {
    const profiles = { alpha: profile("Alpha"), beta: profile("Beta") };
    fixture.eventBus.emit("data:state-changed", {
      reason: "profile-switched",
      state: createDataCoordinatorState({
        authorityEpoch,
        revision: ++revision,
        currentProfile: profileId,
        currentProfileData: profiles[profileId],
        profiles,
      }),
    });
  }
  beforeEach(() => {
    revision = 0;
    document.body.innerHTML =
      '<input id="profileName" value="Created"/><textarea id="profileDescription">description</textarea>';
    fixture = createEventBusFixture();
    ui = new ProfileUI({
      eventBus: fixture.eventBus,
      document,
      i18n: { t: (key) => key },
      modalManager: { show: vi.fn(), hide: vi.fn() },
    });
    toast = vi.spyOn(ui, "showToast").mockImplementation(() => {});
    ui.init();
    select();
  });
  afterEach(() => {
    if (!ui.destroyed) ui.destroy();
    fixture.destroy();
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it.each(["profile", "authority", "lifecycle"])(
    "does not delete a different intent after pending confirmation and %s change",
    async (change) => {
      const confirmation = deferred();
      ui.confirmDialog = { confirm: vi.fn(() => confirmation.promise) };
      const request = vi.spyOn(ui, "request");
      const pending = ui.confirmDeleteProfile();
      if (change === "profile") select("beta");
      if (change === "authority") select("alpha", 2);
      if (change === "lifecycle") {
        ui.destroy();
        ui.init();
        select();
      }
      confirmation.resolve(true);
      await pending;
      expect(request).not.toHaveBeenCalled();
    },
  );

  it("does not auto-select a created profile after the user switches elsewhere", async () => {
    const acknowledgement = deferred();
    ui.currentModal = "new";
    const request = vi
      .spyOn(ui, "request")
      .mockReturnValue(acknowledgement.promise);
    const pending = ui.handleProfileSave();
    expect(request).toHaveBeenCalledWith("data:create-profile", {
      name: "Created",
      description: "description",
    });
    select("beta");
    acknowledgement.resolve({
      success: true,
      profileId: "created",
      message: "created",
    });
    await pending;
    expect(request).toHaveBeenCalledOnce();
    expect(ui.cache.currentProfile).toBe("beta");
    expect(toast).not.toHaveBeenCalled();
  });

  it.each(["switch", "delete", "save"])(
    "suppresses late %s presentation after destroy and reinitialize",
    async (action) => {
      const acknowledgement = deferred();
      vi.spyOn(ui, "request").mockReturnValue(acknowledgement.promise);
      ui.currentModal = "clone";
      const pending =
        action === "switch"
          ? ui.handleProfileSwitch("beta")
          : action === "delete"
            ? ui.deleteCurrentProfile()
            : ui.handleProfileSave();
      ui.destroy();
      ui.init();
      select();
      acknowledgement.resolve({
        success: true,
        switched: true,
        switchedProfile: true,
        message: "accepted",
      });
      await pending;
      expect(toast).not.toHaveBeenCalled();
      expect(ui.modalManager.hide).not.toHaveBeenCalled();
    },
  );

  it("rejects a forbidden profile identifier before dispatch", async () => {
    const request = vi.spyOn(ui, "request");
    await ui.handleProfileSwitch("constructor");
    expect(request).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith("unsafe_profile_operation_key", "error");
  });
});
