/** @typedef {import('../../types/events/base.js').PreferencesSettings} PreferencesSettings */
/** @typedef {import('./serviceTypes.js').I18n} I18n */

export class PreferencesApplicationEffectsError extends AggregateError {
  /** @param {unknown[]} errors @param {boolean} languageActivationFailed */
  constructor(errors, languageActivationFailed) {
    super(errors, "Failed to apply preference effects");
    this.name = "PreferencesApplicationEffectsError";
    this.languageActivationFailed = languageActivationFailed;
  }
}

/**
 * @param {boolean} changed
 * @param {boolean} dirty
 * @param {string | undefined} currentLanguage
 * @param {string} nextLanguage
 */
export function needsLanguageActivation(
  changed,
  dirty,
  currentLanguage,
  nextLanguage,
) {
  return (
    changed ||
    dirty ||
    (typeof currentLanguage === "string" && currentLanguage !== nextLanguage)
  );
}

/** @param {unknown} error */
export function reportPreferencesActivationError(error) {
  if (!error) return;
  console.error(
    "[PreferencesService] Durable settings accepted with activation degradation",
    error,
  );
}

/** @param {string} lang */
function updatePreferenceLanguageFlag(lang) {
  if (typeof document === "undefined") return;
  const flag = document.getElementById("languageFlag");
  /** @type {Record<string, string>} */
  const flagClasses = {
    en: "fi fi-gb",
    de: "fi fi-de",
    es: "fi fi-es",
    fr: "fi fi-fr",
  };
  if (flag) flag.className = flagClasses[lang] || "fi fi-gb";
}

/**
 * @param {PreferencesSettings} settings
 * @param {I18n | undefined} i18n
 * @param {() => void} assertCurrent
 * @param {<Result>(capability: () => Result) => Result} [invokeCollaborator]
 */
async function applyPreferenceLanguage(
  settings,
  i18n,
  assertCurrent,
  invokeCollaborator = (capability) => capability(),
) {
  const language = settings.language || "en";
  if (i18n && i18n.language !== language) {
    const change = invokeCollaborator(() => i18n.changeLanguage(language));
    await change;
    assertCurrent();
  }
  assertCurrent();
  updatePreferenceLanguageFlag(language);
}

/** @param {string} theme @param {I18n | undefined} i18n */
export function updatePreferenceThemeToggle(theme, i18n) {
  if (typeof document === "undefined") return;
  const button = document.getElementById("themeToggleBtn");
  const text = document.getElementById("themeToggleText");
  const icon = button?.querySelector("i");
  if (!button || !text || !icon) return;

  if (theme === "dark") {
    icon.className = "fas fa-sun";
    text.setAttribute("data-i18n", "light_mode");
    text.textContent = i18n?.t("light_mode") ?? "light_mode";
  } else {
    icon.className = "fas fa-moon";
    text.setAttribute("data-i18n", "dark_mode");
    text.textContent = i18n?.t("dark_mode") ?? "dark_mode";
  }
}

/** @param {PreferencesSettings} settings @param {I18n | undefined} i18n */
function applyPreferenceTheme(settings, i18n) {
  if (typeof document === "undefined") return;
  const theme = settings.theme || "default";
  if (theme === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
  updatePreferenceThemeToggle(theme, i18n);
}

/** @param {PreferencesSettings} settings */
export function applyOtherPreferences(settings) {
  if (typeof document === "undefined") return;
  document.body.classList.toggle("compact-view", Boolean(settings.compactView));
}

/**
 * @param {() => unknown} effect
 * @param {<Result>(capability: () => Result) => Result} invokeCollaborator
 * @param {string} capabilityName
 */
function applySynchronously(effect, invokeCollaborator, capabilityName) {
  const result = /** @type {unknown} */ (invokeCollaborator(effect));
  if (
    result !== null &&
    (typeof result === "object" || typeof result === "function") &&
    "then" in result &&
    typeof result.then === "function"
  ) {
    void Promise.resolve(result).catch(() => undefined);
    throw new TypeError(`${capabilityName} must be synchronous`);
  }
}

/**
 * Run every activation effect so one degraded capability does not strand an
 * unrelated theme or layout update. Lifecycle cancellation still aborts the
 * sequence immediately through assertCurrent.
 * @param {{
 *   settings: PreferencesSettings,
 *   i18n?: I18n,
 *   localizeCommands: (i18n?: I18n) => void,
 *   applyTranslations: (root?: Document | Element | null) => void,
 *   localizeCommandCatalog: boolean,
 *   assertCurrent: () => void,
 *   invokeCollaborator?: <Result>(capability: () => Result) => Result
 * }} options
 */
export async function applyPreferenceEffects({
  settings,
  i18n,
  localizeCommands,
  applyTranslations,
  localizeCommandCatalog,
  assertCurrent,
  invokeCollaborator = (capability) => capability(),
}) {
  /** @type {unknown[]} */
  const errors = [];
  let languageActivationFailed = false;
  /**
   * @param {() => unknown | Promise<unknown>} effect
   * @param {boolean} [languageEffect]
   */
  const attempt = async (effect, languageEffect = false) => {
    try {
      await effect();
      assertCurrent();
      return true;
    } catch (error) {
      assertCurrent();
      errors.push(error);
      if (languageEffect) languageActivationFailed = true;
      return false;
    }
  };

  const languageReady = await attempt(
    () =>
      applyPreferenceLanguage(
        settings,
        i18n,
        assertCurrent,
        invokeCollaborator,
      ),
    true,
  );
  if (languageReady) {
    if (localizeCommandCatalog) {
      await attempt(
        () =>
          applySynchronously(
            () => localizeCommands(i18n),
            invokeCollaborator,
            "localizeCommands",
          ),
        true,
      );
    }
    await attempt(
      () =>
        applySynchronously(
          () => applyTranslations(),
          invokeCollaborator,
          "applyTranslations",
        ),
      localizeCommandCatalog,
    );
  }
  await attempt(() =>
    invokeCollaborator(() => applyPreferenceTheme(settings, i18n)),
  );
  await attempt(() => applyOtherPreferences(settings));

  if (errors.length > 0) {
    throw new PreferencesApplicationEffectsError(
      errors,
      languageActivationFailed,
    );
  }
}
