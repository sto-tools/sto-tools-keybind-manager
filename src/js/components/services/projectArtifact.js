/** @typedef {import('../../types/data-contracts.js').CurrentProjectArtifactEnvelope} CurrentProjectArtifactEnvelope */
/** @typedef {import('../../types/data-contracts.js').SettingsData} SettingsData */
/** @typedef {import('../../types/data-contracts.js').StoredApplicationData} StoredApplicationData */

/**
 * Serialize the one current project artifact shared by downloaded backups and
 * sync-folder project.json writes.
 *
 * @param {Pick<StoredApplicationData, 'profiles' | 'settings' | 'currentProfile'>} root
 * @param {SettingsData | null | undefined} settings
 * @param {{ version?: string | null, exported: string }} options
 * @returns {string}
 */
export function serializeProjectArtifact(root, settings, options) {
  /** @type {CurrentProjectArtifactEnvelope} */
  const data = {
    version: options.version || "1.0.0",
    exported: options.exported,
    type: "project",
    data: {
      profiles: root.profiles || {},
      settings: settings || root.settings || {},
      currentProfile: root.currentProfile,
    },
  };

  return JSON.stringify(data, null, 2);
}
