/**
 * Complete standalone settings persistence only; no merge or owner authority.
 * `clear()` acknowledges only removal of the standalone record. The
 * Preferences owner remains responsible for verified defaults, live adoption,
 * effects, and publications during application reset.
 * @typedef {import('../../types/storage-contracts.js').SettingsRepositoryPort} SettingsRepositoryPort
 * @typedef {import('../../types/storage-contracts.js').SettingsMigrationInspectionPort} SettingsMigrationInspectionPort
 */
export {};
