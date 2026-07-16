import {
  assertSafeProfileIdentifier,
  assertSafeProfileOperations,
  cloneValidatedProfileOperationValue,
} from "./profileOperations.js";

/**
 * Register DataCoordinator's action and compatibility responders as one
 * lifecycle-owned group.
 *
 * @param {import('./DataCoordinator.js').default} coordinator
 * @returns {Array<() => void>}
 */
export function registerDataCoordinatorResponders(coordinator) {
  return [
    coordinator.respond("data:switch-profile", ({ profileId }) =>
      coordinator.switchProfile(profileId),
    ),
    coordinator.respond("data:create-profile", ({ name, description, mode }) =>
      coordinator.createProfile(name, description, mode),
    ),
    coordinator.respond("data:clone-profile", ({ sourceId, newName }) =>
      coordinator.cloneProfile(sourceId, newName),
    ),
    coordinator.respond(
      "data:rename-profile",
      ({ profileId, newName, description }) =>
        coordinator.renameProfile(profileId, newName, description),
    ),
    coordinator.respond("data:delete-profile", ({ profileId }) =>
      coordinator.deleteProfile(profileId),
    ),
    coordinator.respond("data:update-profile", (payload) => {
      const safePayload = cloneValidatedProfileOperationValue(
        payload,
        "data:update-profile payload",
      );
      const { profileId, updates, createIfMissing } = safePayload;
      assertSafeProfileIdentifier(profileId, "data:update-profile profileId");
      if (createIfMissing !== undefined && createIfMissing !== true) {
        throw new TypeError("createIfMissing must be true when supplied");
      }
      let normalizedUpdates = updates;
      if (!normalizedUpdates) {
        const {
          add,
          delete: del,
          modify,
          properties,
          replacement,
        } = safePayload;
        if (add || del || modify || properties || replacement) {
          normalizedUpdates = {
            add,
            delete: del,
            modify,
            properties,
            replacement,
          };
        }
      }

      if (
        safePayload.updateSource &&
        (!normalizedUpdates || !normalizedUpdates.updateSource)
      ) {
        if (!normalizedUpdates) normalizedUpdates = {};
        normalizedUpdates.updateSource = safePayload.updateSource;
      }

      if (normalizedUpdates) {
        assertSafeProfileOperations(normalizedUpdates);
      }

      return coordinator.updateProfile(profileId, normalizedUpdates, {
        createIfMissing,
      });
    }),
    coordinator.respond("data:set-environment", ({ environment }) =>
      coordinator.setEnvironment(environment),
    ),
    coordinator.respond("data:update-settings", ({ settings }) =>
      coordinator.updateSettings(settings),
    ),
    coordinator.respond("data:load-default-data", () =>
      coordinator.loadDefaultData(),
    ),
    coordinator.respond("data:reload-state", () => coordinator.reloadState()),
  ];
}
