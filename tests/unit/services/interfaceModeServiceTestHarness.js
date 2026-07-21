import { vi } from "vitest";

import InterfaceModeService from "../../../src/js/components/services/InterfaceModeService.js";
import { createDataCoordinatorState } from "../../fixtures/core/componentState.js";
import { createServiceFixture } from "../../fixtures/index.js";

export function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((complete, fail) => {
    resolve = complete;
    reject = fail;
  });
  return { promise, resolve, reject };
}

export const profile = (id, currentEnvironment) => ({
  id,
  name: id,
  currentEnvironment,
  builds: { space: { keys: {} }, ground: { keys: {} } },
  aliases: {},
});

export function createInterfaceModeServiceHarness() {
  const fixture = createServiceFixture();
  const service = new InterfaceModeService({ eventBus: fixture.eventBus });
  let revision = 0;

  const publishCoordinatorState = ({
    profileId = "captain",
    environment = "space",
    reason = "profile-switched",
    authorityEpoch = 1,
    changedProfileId = profileId,
  } = {}) => {
    const selectedProfile = profileId ? profile(profileId, environment) : null;
    revision += 1;
    fixture.eventBus.emit("data:state-changed", {
      reason,
      ...(reason === "profile-replaced" ? { profileId: changedProfileId } : {}),
      state: createDataCoordinatorState({
        authorityEpoch,
        revision,
        currentProfile: profileId,
        currentEnvironment: environment,
        currentProfileData: selectedProfile,
        profiles:
          profileId && selectedProfile ? { [profileId]: selectedProfile } : {},
      }),
    });
    return selectedProfile;
  };

  const publishProfile = (
    profileId = "captain",
    environment = "space",
    overrides = {},
  ) => {
    const selectedProfile = publishCoordinatorState({
      profileId,
      environment,
      reason: "profile-switched",
    });
    fixture.eventBus.emit("profile:switched", {
      fromProfile: null,
      toProfile: profileId,
      profileId,
      profile: selectedProfile,
      environment,
      timestamp: Date.now(),
      ...overrides,
    });
    return selectedProfile;
  };

  const profileUpdateResponder = (handler = () => ({ success: true })) => {
    const update = vi.fn(handler);
    fixture.eventBus.mockResponse("data:update-profile", update);
    return update;
  };

  const environmentEvents = () =>
    fixture.eventBusFixture
      .getEventsOfType("environment:changed")
      .map(({ data }) => data);

  service.init();

  return {
    fixture,
    service,
    publishCoordinatorState,
    publishProfile,
    profileUpdateResponder,
    environmentEvents,
    destroy() {
      if (!service.destroyed) service.destroy();
      fixture.destroy();
      vi.restoreAllMocks();
    },
  };
}
