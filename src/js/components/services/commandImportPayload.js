/**
 * Build the canonical DataCoordinator update used to clear an import target.
 *
 * @param {import('./serviceTypes.js').ServiceCache} cache
 * @param {string} environment
 * @param {string} targetKey
 * @returns {{ profileId: string, modify: import('./serviceTypes.js').ProfileOperationPatch } | null}
 */
function clearTargetUpdate(cache, environment, targetKey) {
  const { currentProfile: profileId, profile } = cache;
  if (!profileId || !profile || !targetKey) return null;

  if (environment === "alias") {
    const alias = profile.aliases?.[targetKey];
    if (!alias) return null;

    return {
      profileId,
      modify: {
        aliases: { [targetKey]: { commands: [] } },
      },
    };
  }

  const keys = profile.builds?.[environment]?.keys;
  if (!keys || !Object.prototype.hasOwnProperty.call(keys, targetKey)) {
    return null;
  }

  return {
    profileId,
    modify: {
      builds: { [environment]: { keys: { [targetKey]: [] } } },
    },
  };
}

/**
 * Persist a clear operation through CommandService's canonical coordinator RPC.
 *
 * @typedef {{ profileId: string, modify: import('./serviceTypes.js').ProfileOperationPatch }} ClearTargetUpdate
 * @typedef {{ success?: boolean }} UpdateProfileResult
 * @param {{ cache: import('./serviceTypes.js').ServiceCache, i18n: import('./serviceTypes.js').I18n, request: (topic: 'data:update-profile', payload: ClearTargetUpdate) => Promise<UpdateProfileResult> }} service
 * @param {string} environment
 * @param {string} targetKey
 */
export async function clearImportTarget(service, environment, targetKey) {
  const update = clearTargetUpdate(service.cache, environment, targetKey);
  if (!update) throw new Error(service.i18n.t("not_found"));

  const result = await service.request("data:update-profile", update);
  if (!result?.success) {
    throw new Error(service.i18n.t("storage_write_failed"));
  }
}
