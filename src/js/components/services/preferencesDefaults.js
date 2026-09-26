/** @typedef {import('../../types/events/base.js').PreferencesSettings} PreferencesSettings */

/** @param {string} [language] @returns {PreferencesSettings} */
export function createDefaultPreferencesSettings(language = "en") {
  return {
    theme: "default",
    autoSave: true,
    showTooltips: true,
    confirmDeletes: true,
    maxUndoSteps: 50,
    defaultMode: "space",
    compactView: false,
    language: ["en", "de", "es", "fr"].includes(language) ? language : "en",
    syncFolderName: null,
    syncFolderPath: null,
    autoSync: false,
    autoSyncInterval: "change",
    bindToAliasMode: false,
    bindsetsEnabled: false,
    translateGeneratedMessages: false,
  };
}

/** @param {Pick<Navigator, 'languages' | 'language'> | undefined} browser */
export function detectPreferencesLanguage(browser) {
  try {
    const candidate = browser?.languages?.[0] || browser?.language;
    const language = candidate?.toLowerCase().split(/[-_]/)[0];
    return language && ["en", "de", "es", "fr"].includes(language)
      ? language
      : "en";
  } catch {
    return "en";
  }
}
