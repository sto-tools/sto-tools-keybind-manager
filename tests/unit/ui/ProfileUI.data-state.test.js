import { afterEach, describe, expect, it, vi } from "vitest";

import ProfileUI from "../../../src/js/components/ui/ProfileUI.js";
import { createDataCoordinatorState } from "../../fixtures/core/componentState.js";
import { createEventBusFixture } from "../../fixtures/core/eventBus.js";

const profile = (id, name) => ({
  id,
  name,
  currentEnvironment: "space",
  environment: "space",
  builds: { space: { keys: {} }, ground: { keys: {} } },
  aliases: {},
});

const mountProfileControls = () => {
  document.body.innerHTML = `
    <select id="profileSelect"></select>
    <span id="keyCount"></span>
    <span id="aliasCount"></span>
    <button class="mode-btn" data-mode="space"></button>
    <button class="mode-btn" data-mode="ground"></button>
    <input id="profileName" />
    <textarea id="profileDescription"></textarea>
  `;
};

describe("ProfileUI accepted data state", () => {
  let fixture;
  let ui;

  afterEach(() => {
    if (ui && !ui.destroyed) ui.destroy();
    fixture?.destroy();
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("renders pre-ready, initial-ready, and replacement authority snapshots", async () => {
    mountProfileControls();
    fixture = createEventBusFixture();
    ui = new ProfileUI({
      eventBus: fixture.eventBus,
      document,
      i18n: { t: (key) => key },
    });
    ui.request = vi.fn(async (topic) => {
      throw new Error(`Unexpected request: ${topic}`);
    });
    ui.init();
    expect(ui.getCurrentState()).not.toHaveProperty("modified");

    const select = /** @type {HTMLSelectElement} */ (
      document.getElementById("profileSelect")
    );
    expect([...select.options].map(({ textContent }) => textContent)).toEqual([
      "no_profiles_available",
    ]);

    const alpha = profile("alpha", "Alpha");
    const beta = profile("beta", "Beta");
    fixture.eventBus.emit("data:state-changed", {
      reason: "initial-load",
      state: createDataCoordinatorState({
        authorityEpoch: 20,
        currentProfile: "alpha",
        currentProfileData: alpha,
        profiles: { alpha, beta },
      }),
    });

    await vi.waitFor(() => {
      expect([...select.options].map(({ value }) => value)).toEqual([
        "alpha",
        "beta",
      ]);
    });
    expect(select.value).toBe("alpha");

    fixture.eventBus.emit("data:state-changed", {
      reason: "initial-load",
      state: createDataCoordinatorState({
        authorityEpoch: 21,
        ready: false,
        revision: 0,
      }),
    });
    await vi.waitFor(() => {
      expect([...select.options].map(({ textContent }) => textContent)).toEqual(
        ["no_profiles_available"],
      );
    });
    expect(ui.cache.dataState).toMatchObject({
      authorityEpoch: 21,
      ready: false,
      revision: 0,
    });

    const gamma = profile("gamma", "Gamma");
    fixture.eventBus.emit("data:state-changed", {
      reason: "initial-load",
      state: createDataCoordinatorState({
        authorityEpoch: 21,
        revision: 1,
        currentProfile: "gamma",
        currentProfileData: gamma,
        profiles: { gamma },
      }),
    });
    await vi.waitFor(() => {
      expect([...select.options].map(({ value }) => value)).toEqual(["gamma"]);
    });
    expect(select.value).toBe("gamma");

    fixture.eventBus.emit("data:state-changed", {
      reason: "profile-updated",
      state: createDataCoordinatorState({
        authorityEpoch: 20,
        revision: 999,
        currentProfile: "alpha",
        currentProfileData: alpha,
        profiles: { alpha },
      }),
    });

    expect([...select.options].map(({ value }) => value)).toEqual(["gamma"]);
    expect(ui.request).not.toHaveBeenCalled();
  });

  it("renders one authoritative profile switch", async () => {
    mountProfileControls();
    fixture = createEventBusFixture();
    ui = new ProfileUI({
      eventBus: fixture.eventBus,
      document,
      i18n: { t: (key) => key },
    });
    ui.init();
    const renderProfiles = vi.spyOn(ui, "renderProfiles");
    const beta = profile("beta", "Beta");

    fixture.eventBus.emit("data:state-changed", {
      reason: "profile-switched",
      state: createDataCoordinatorState({
        authorityEpoch: 30,
        revision: 1,
        currentProfile: "beta",
        currentProfileData: beta,
        profiles: { beta },
      }),
    });
    fixture.eventBus.emit("profile:switched", {
      fromProfile: "alpha",
      toProfile: "beta",
      profileId: "beta",
      profile: beta,
      environment: "space",
      timestamp: Date.now(),
    });

    await vi.waitFor(() => {
      expect(document.querySelector("option")?.textContent).toBe("Beta");
    });
    expect(renderProfiles).toHaveBeenCalledOnce();
  });

  it("repaints profile actions once per accepted state revision", async () => {
    mountProfileControls();
    fixture = createEventBusFixture();
    ui = new ProfileUI({
      eventBus: fixture.eventBus,
      document,
      i18n: { t: (key) => key },
    });
    ui.init();

    let revision = 1;
    let currentProfile = "alpha";
    /** @type {Record<string, ReturnType<typeof profile>>} */
    let profiles = { alpha: profile("alpha", "Alpha") };
    /** @param {import('../../../src/js/types/events/data.js').DataStateChangeReason} reason */
    const publish = (reason) => {
      const currentProfileData = profiles[currentProfile] ?? null;
      fixture.eventBus.emit("data:state-changed", {
        reason,
        state: createDataCoordinatorState({
          authorityEpoch: 35,
          revision,
          currentProfile,
          currentProfileData,
          profiles,
        }),
      });
      revision += 1;
    };
    publish("initial-load");

    const renderProfiles = vi.spyOn(ui, "renderProfiles");
    const showToast = vi.spyOn(ui, "showToast");
    ui.request = vi.fn(async (topic, payload) => {
      if (topic === "data:create-profile") {
        profiles = { ...profiles, beta: profile("beta", payload.name) };
        publish("profile-created");
        return { success: true, profileId: "beta", message: "created" };
      }
      if (topic === "data:switch-profile") {
        currentProfile = payload.profileId;
        publish("profile-switched");
        return { success: true, switched: true, message: "switched" };
      }
      if (topic === "data:clone-profile") {
        profiles = { ...profiles, clone: profile("clone", payload.newName) };
        publish("profile-cloned");
        return { success: true, profileId: "clone", message: "cloned" };
      }
      if (topic === "data:rename-profile") {
        profiles = {
          ...profiles,
          [payload.profileId]: profile(payload.profileId, payload.newName),
        };
        publish("profile-renamed");
        return { success: true, message: "renamed" };
      }
      if (topic === "data:delete-profile") {
        const remaining = { ...profiles };
        delete remaining[payload.profileId];
        profiles = remaining;
        currentProfile = "alpha";
        publish("profile-deleted");
        return {
          success: true,
          switchedProfile: profiles.alpha,
          message: "deleted",
        };
      }
      throw new Error(`Unexpected request: ${topic}`);
    });

    const nameInput = /** @type {HTMLInputElement} */ (
      document.getElementById("profileName")
    );
    nameInput.value = "Beta";
    ui.currentModal = "new";
    await ui.handleProfileSave();
    expect(renderProfiles).toHaveBeenCalledTimes(2);
    expect(showToast).toHaveBeenCalledWith("created", "success");

    renderProfiles.mockClear();
    nameInput.value = "Beta Copy";
    ui.currentModal = "clone";
    await ui.handleProfileSave();
    expect(renderProfiles).toHaveBeenCalledOnce();
    expect(showToast).toHaveBeenCalledWith("cloned", "success");

    renderProfiles.mockClear();
    nameInput.value = "Beta Renamed";
    ui.currentModal = "rename";
    await ui.handleProfileSave();
    expect(renderProfiles).toHaveBeenCalledOnce();
    expect(showToast).toHaveBeenCalledWith("renamed", "success");

    renderProfiles.mockClear();
    await ui.deleteCurrentProfile();
    expect(renderProfiles).toHaveBeenCalledOnce();
    expect(showToast).toHaveBeenCalledWith("deleted", "success");
  });

  it("re-registers its profile-state listener and skips environment-only revisions", async () => {
    mountProfileControls();
    fixture = createEventBusFixture();
    ui = new ProfileUI({
      eventBus: fixture.eventBus,
      document,
      i18n: { t: (key) => key },
    });
    ui.init();
    const renderProfiles = vi.spyOn(ui, "renderProfiles");
    const alpha = profile("alpha", "Alpha");
    const state = (revision, overrides = {}) =>
      createDataCoordinatorState({
        authorityEpoch: 40,
        revision,
        currentProfile: "alpha",
        currentProfileData: alpha,
        profiles: { alpha },
        ...overrides,
      });

    fixture.eventBus.emit("data:state-changed", {
      reason: "initial-load",
      state: state(1),
    });
    expect(renderProfiles).toHaveBeenCalledTimes(1);
    renderProfiles.mockClear();

    fixture.eventBus.emit("data:state-changed", {
      reason: "environment-changed",
      state: state(2, { currentEnvironment: "ground" }),
    });
    expect(ui.cache.dataState?.revision).toBe(2);
    expect(renderProfiles).not.toHaveBeenCalled();

    ui.destroy();
    ui.init();
    renderProfiles.mockClear();
    const renamed = profile("alpha", "Alpha Renamed");
    fixture.eventBus.emit("data:state-changed", {
      reason: "profile-renamed",
      state: state(3, {
        currentProfileData: renamed,
        profiles: { alpha: renamed },
      }),
    });

    await vi.waitFor(() => {
      expect(document.querySelector("option")?.textContent).toBe(
        "Alpha Renamed",
      );
    });
    expect(renderProfiles).toHaveBeenCalledTimes(1);
  });
});
