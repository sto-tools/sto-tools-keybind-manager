/** @typedef {import('../../types/events/base.js').PreferencesSettings} PreferencesSettings */

/** @returns {PreferencesSettings} */
export function createDefaultPreferencesSettings() {
  return {
    theme: "default",
    autoSave: true,
    showTooltips: true,
    confirmDeletes: true,
    maxUndoSteps: 50,
    defaultMode: "space",
    compactView: false,
    language: "en",
    syncFolderName: null,
    syncFolderPath: null,
    autoSync: false,
    autoSyncInterval: "change",
    bindToAliasMode: false,
    bindsetsEnabled: false,
    translateGeneratedMessages: false,
  };
}
