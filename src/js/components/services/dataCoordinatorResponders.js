import {
  materializeMutationRequest,
  requireMutationString,
} from "./mutationRequestBoundary.js";
import {
  materializeProfileUpdateRequest,
  requireProfileIdentifier,
} from "./dataCoordinatorMutationBoundary.js";

/**
 * Register DataCoordinator's action and compatibility responders as one
 * lifecycle-owned group.
 *
 * @param {import('./DataCoordinator.js').default} coordinator
 * @returns {Array<() => void>}
 */
export function registerDataCoordinatorResponders(coordinator) {
  return [
    coordinator.respond("data:switch-profile", (payload) => {
      const request = materializeMutationRequest(payload, ["profileId"]);
      return coordinator.switchProfile(
        requireProfileIdentifier(request.profileId),
      );
    }),
    coordinator.respond("data:create-profile", (payload) => {
      const request = materializeMutationRequest(payload, [
        "name",
        "description",
        "mode",
      ]);
      return coordinator.createProfile(
        requireMutationString(request.name, { allowEmpty: true }),
        requireMutationString(request.description, {
          optional: true,
          allowEmpty: true,
        }),
        requireMutationString(request.mode, {
          optional: true,
          allowEmpty: true,
        }),
      );
    }),
    coordinator.respond("data:clone-profile", (payload) => {
      const request = materializeMutationRequest(payload, [
        "sourceId",
        "newName",
      ]);
      return coordinator.cloneProfile(
        requireProfileIdentifier(request.sourceId),
        requireMutationString(request.newName, { allowEmpty: true }),
      );
    }),
    coordinator.respond("data:rename-profile", (payload) => {
      const request = materializeMutationRequest(payload, [
        "profileId",
        "newName",
        "description",
      ]);
      return coordinator.renameProfile(
        requireProfileIdentifier(request.profileId),
        requireMutationString(request.newName, { allowEmpty: true }),
        requireMutationString(request.description, {
          optional: true,
          allowEmpty: true,
        }),
      );
    }),
    coordinator.respond("data:delete-profile", (payload) => {
      const request = materializeMutationRequest(payload, ["profileId"]);
      return coordinator.deleteProfile(
        requireProfileIdentifier(request.profileId),
      );
    }),
    coordinator.respond("data:update-profile", (payload) => {
      const request = materializeProfileUpdateRequest(payload);
      return coordinator.updateProfile(request.profileId, request.updates, {
        createIfMissing: request.createIfMissing,
        precondition: request.precondition,
      });
    }),
    coordinator.respond(
      "data:reload-state",
      (/** @type {unknown} */ payload = {}) => {
        materializeMutationRequest(payload, []);
        return coordinator.reloadState();
      },
    ),
  ];
}
