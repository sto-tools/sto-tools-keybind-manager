import { respond } from "../../../src/js/core/requestResponse.js";

/**
 * Unit-test responder for ImportService's full-profile commit seam. Integration
 * tests pair ImportService with the real DataCoordinator instead.
 *
 * @param {import('../../../src/js/components/services/serviceTypes.js').EventBus} eventBus
 * @param {import('../../../src/js/components/services/serviceTypes.js').Storage} storage
 * @returns {() => void}
 */
export function respondWithImportedProfileCommits(eventBus, storage) {
  return respond(eventBus, "data:update-profile", async (payload) => {
    const updates = payload.updates || payload;
    const profile = structuredClone(
      updates.replacement ?? updates.properties ?? {},
    );
    profile.lastModified = new Date().toISOString();

    const saved = await storage.saveProfile(payload.profileId, profile);
    if (saved === false) throw new Error("storage_write_failed");

    return { success: true, profile };
  });
}
