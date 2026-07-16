/** @param {unknown} result @param {import('./serviceTypes.js').I18n | null | undefined} i18n */
function requireSuccess(result, i18n) {
  if (result === false) {
    throw new Error(
      i18n?.t?.("storage_write_failed") ?? "storage_write_failed",
    );
  }
}

const storageWrites = {
  /** @param {import('./serviceTypes.js').Storage} storage @param {any} data @param {import('./serviceTypes.js').I18n | null | undefined} i18n */
  async all(storage, data, i18n) {
    requireSuccess(await storage.saveAllData(data), i18n);
  },

  /** @param {import('./serviceTypes.js').Storage} storage @param {string} profileId @param {import('./serviceTypes.js').ProfileData} profile @param {import('./serviceTypes.js').I18n | null | undefined} i18n @returns {Promise<import('./serviceTypes.js').ProfileData>} */
  async profile(storage, profileId, profile, i18n) {
    requireSuccess(await storage.saveProfile(profileId, profile), i18n);
    return structuredClone(storage.getProfile(profileId) || profile);
  },

  /** @param {import('./serviceTypes.js').Storage} storage @param {string} profileId @param {import('./serviceTypes.js').I18n | null | undefined} i18n */
  async currentProfile(storage, profileId, i18n) {
    const data = { ...storage.getAllData(), currentProfile: profileId };
    await storageWrites.all(storage, data, i18n);
  },

  /** @param {import('./serviceTypes.js').Storage} storage @param {string} profileId @param {import('./serviceTypes.js').I18n | null | undefined} i18n */
  async deleteProfile(storage, profileId, i18n) {
    requireSuccess(await storage.deleteProfile(profileId), i18n);
  },

  /** @param {import('./serviceTypes.js').Storage} storage @param {Record<string, unknown>} settings @param {import('./serviceTypes.js').I18n | null | undefined} i18n */
  async settings(storage, settings, i18n) {
    requireSuccess(await storage.saveSettings(settings), i18n);
  },
};

export default storageWrites;
