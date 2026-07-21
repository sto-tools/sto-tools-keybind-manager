/** @param {unknown} result @param {import('./serviceTypes.js').I18n | null | undefined} i18n */
function requireSuccess(result, i18n) {
  if (result === false) {
    throw new Error(
      i18n?.t?.("storage_write_failed") ?? "storage_write_failed",
    );
  }
}

const storageWrites = {
  /** @param {import('./serviceTypes.js').Storage} storage @param {any} data @param {import('./serviceTypes.js').I18n | null | undefined} i18n @param {{ preserveBackup?: boolean }} [options] */
  async all(storage, data, i18n, options) {
    const result =
      options === undefined
        ? await storage.saveAllData(data)
        : await storage.saveAllData(data, options);
    requireSuccess(result, i18n);
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
};

export default storageWrites;
