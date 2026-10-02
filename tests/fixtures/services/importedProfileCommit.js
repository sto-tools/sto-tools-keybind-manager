import { respond } from "../../../src/js/core/requestResponse.js";

/**
 * Unit-test responder for ImportService's full-profile commit seam. Integration
 * tests pair ImportService with the real DataCoordinator instead.
 *
 * @param {import('../../../src/js/components/services/serviceTypes.js').EventBus} eventBus
 * @param {Object} fixture - project repository and detached persisted-root reader
 * @returns {() => void}
 */
export function respondWithImportedProfileCommits(eventBus, fixture) {
  return respond(eventBus, "data:update-profile", async (payload) => {
    const updates = payload.updates || payload;
    const profile = structuredClone(
      updates.replacement ?? updates.properties ?? {},
    );
    profile.lastModified = new Date().toISOString();

    const destination = fixture.readProjectRoot();
    const saved = await fixture.projectRepository.commit({
      ...destination,
      profiles: { ...destination.profiles, [payload.profileId]: profile },
    });
    if (saved.status !== "committed") throw new Error("storage_write_failed");

    return { success: true, profile: saved.value.profiles[payload.profileId] };
  });
}
