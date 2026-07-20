import { selectionCacheFromProfile } from "./selectionState.js";

/** @typedef {import('./serviceTypes.js').ProfileData} SelectionProfile */
/** @typedef {import('./serviceTypes.js').AliasDefinition} AliasDefinition */
/** @typedef {import('./serviceTypes.js').StoredCommand} StoredCommand */

/**
 * @typedef {
 *   | { kind: 'unavailable' }
 *   | { kind: 'none' }
 *   | { kind: 'select', target: 'alias' | 'key', environment: string, selection: string, bindset: string | null }
 *   | { kind: 'clear', target: 'alias' | 'key', environment: string, selection: null, bindset: null }
 * } AutomaticSelectionPlan
 */

/**
 * @typedef {
 *   | { kind: 'unavailable' }
 *   | { kind: 'publish-empty', target: 'alias' | 'key', environment: string }
 *   | { kind: 'auto-select', environment: string, fallback: AutomaticSelectionPlan }
 *   | { kind: 'restore', target: 'alias' | 'key', environment: string, selection: string, bindset: string | null, skipPersistence: boolean }
 *   | { kind: 'replace-invalid', target: 'alias' | 'key', environment: string, invalidSelection: string, clearCached: true, clearActive: boolean, fallback: AutomaticSelectionPlan }
 * } SelectionRestorationPlan
 */

/**
 * @typedef {Object} AutomaticSelectionOptions
 * @property {boolean} profileAvailable
 * @property {string} environment
 * @property {string} activeEnvironment
 * @property {Record<string, AliasDefinition> | null | undefined} aliases
 * @property {Record<string, AliasDefinition> | null | undefined} profileAliases
 * @property {Record<string, StoredCommand[]> | null | undefined} primaryKeys
 * @property {string | null | undefined} excludedKey
 * @property {string | null | undefined} excludedAlias
 */

/**
 * @typedef {Object} SelectionRestorationOptions
 * @property {'auto' | 'restore' | 'profile-update'} reason
 * @property {boolean} profileAvailable
 * @property {string} environment
 * @property {string} activeEnvironment
 * @property {string | null | undefined} cachedSelection
 * @property {SelectionProfile | null | undefined} profile
 * @property {Record<string, AliasDefinition> | null | undefined} aliases
 * @property {Record<string, AliasDefinition> | null | undefined} profileAliases
 * @property {Record<string, StoredCommand[]> | null | undefined} primaryKeys
 * @property {string | null | undefined} excludedKey
 * @property {string | null | undefined} excludedAlias
 * @property {boolean} [skipPersistence]
 */

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** @param {string} environment */
function targetForEnvironment(environment) {
  return environment === "alias" ? "alias" : "key";
}

/**
 * Test one cached selection against the canonical profile and alias
 * projections. This function deliberately does not consult EventBus state or
 * compatibility globals.
 *
 * @param {{
 *   profile?: SelectionProfile | null,
 *   aliases?: Record<string, AliasDefinition> | null,
 *   environment: string,
 *   selection?: string | null
 * }} options
 */
export function selectionExists({
  profile = null,
  aliases = null,
  environment,
  selection = null,
}) {
  if (!selection) return false;
  if (environment === "alias") {
    if (!aliases || !isRecord(aliases)) return false;
    const definition = aliases[selection];
    return (
      Object.prototype.hasOwnProperty.call(aliases, selection) &&
      isRecord(definition) &&
      definition.type !== "vfx-alias"
    );
  }
  return Array.isArray(profile?.builds?.[environment]?.keys?.[selection]);
}

/**
 * Select the deterministic insertion-order fallback without performing any
 * state mutation or publication.
 *
 * @param {AutomaticSelectionOptions} options
 * @returns {AutomaticSelectionPlan}
 */
export function planAutomaticSelection({
  profileAvailable,
  environment,
  activeEnvironment,
  aliases,
  profileAliases,
  primaryKeys,
  excludedKey,
  excludedAlias,
}) {
  if (!profileAvailable) return { kind: "unavailable" };

  if (environment === "alias") {
    const cachedAliases = aliases || {};
    const hydratedAliases = profileAliases || {};
    const source =
      Object.keys(cachedAliases).length > 0 ? cachedAliases : hydratedAliases;
    const selection = Object.entries(source).find(
      ([name, definition]) =>
        name !== excludedAlias &&
        isRecord(definition) &&
        definition.type !== "vfx-alias",
    )?.[0];
    return selection
      ? {
          kind: "select",
          target: "alias",
          environment,
          selection,
          bindset: null,
        }
      : { kind: "none" };
  }

  const keys = primaryKeys || {};
  const selection = Object.keys(keys).find((name) => name !== excludedKey);
  if (selection) {
    return {
      kind: "select",
      target: "key",
      environment,
      selection,
      bindset: "Primary Bindset",
    };
  }

  return {
    kind: "clear",
    target: targetForEnvironment(activeEnvironment),
    environment: activeEnvironment,
    selection: null,
    bindset: null,
  };
}

/**
 * Describe restoration, validation, and fallback behavior without invoking a
 * selection action. The facade executes this plan under its current lifecycle
 * and profile guard.
 *
 * @param {SelectionRestorationOptions} options
 * @returns {SelectionRestorationPlan}
 */
export function planSelectionRestoration(options) {
  const {
    reason,
    profileAvailable,
    environment,
    activeEnvironment,
    cachedSelection,
    profile,
    aliases,
    skipPersistence = false,
  } = options;
  if (!profileAvailable) return { kind: "unavailable" };

  if (!cachedSelection) {
    if (reason === "profile-update") {
      return {
        kind: "publish-empty",
        target: targetForEnvironment(environment),
        environment,
      };
    }
    return {
      kind: "auto-select",
      environment,
      fallback: planAutomaticSelection(options),
    };
  }

  const target = targetForEnvironment(environment);
  if (
    selectionExists({
      profile,
      aliases,
      environment,
      selection: cachedSelection,
    })
  ) {
    return {
      kind: "restore",
      target,
      environment,
      selection: cachedSelection,
      bindset: null,
      skipPersistence,
    };
  }

  return {
    kind: "replace-invalid",
    target,
    environment,
    invalidSelection: cachedSelection,
    clearCached: true,
    clearActive: activeEnvironment === environment,
    fallback: planAutomaticSelection(options),
  };
}

/**
 * @param {{
 *   profile?: SelectionProfile | null,
 *   eventEnvironment?: string | null
 * }} options
 */
export function planProfileSelectionTransition({
  profile = null,
  eventEnvironment = null,
}) {
  const environment =
    eventEnvironment ||
    profile?.environment ||
    profile?.currentEnvironment ||
    "space";
  const cachedSelections = /** @type {Record<string, string | null>} */ (
    selectionCacheFromProfile(profile)
  );
  return {
    hasProfile: Boolean(profile),
    environment,
    cachedSelections,
    cachedSelection: cachedSelections[environment] ?? null,
  };
}

/**
 * @param {{
 *   newEnvironment: string,
 *   previousEnvironment?: string | null,
 *   activeEnvironment: string,
 *   selectedKey?: string | null,
 *   selectedAlias?: string | null,
 *   cachedSelections: Record<string, string | null | undefined>,
 *   profileSelections?: Record<string, string | null> | null,
 *   builds?: Record<string, { keys?: Record<string, StoredCommand[]> }> | null,
 *   profileKeys?: Record<string, StoredCommand[]> | null,
 *   hasPendingPreviousIntent: boolean
 * }} options
 */
export function planEnvironmentSelectionTransition({
  newEnvironment,
  previousEnvironment = null,
  activeEnvironment,
  selectedKey = null,
  selectedAlias = null,
  cachedSelections,
  profileSelections = null,
  builds = null,
  profileKeys = null,
  hasPendingPreviousIntent,
}) {
  const resolvedPreviousEnvironment = previousEnvironment ?? activeEnvironment;
  const previousSelection =
    resolvedPreviousEnvironment === "alias" ? selectedAlias : selectedKey;
  const cachedTarget = cachedSelections[newEnvironment];
  const shouldRememberTarget = cachedTarget === undefined;
  const targetSelection = shouldRememberTarget
    ? (profileSelections?.[newEnvironment] ?? null)
    : (cachedTarget ?? null);
  const targetKeys = builds?.[newEnvironment]?.keys || profileKeys || {};

  return {
    previousEnvironment: resolvedPreviousEnvironment,
    previousSelection: previousSelection ?? null,
    shouldRememberPrevious:
      !hasPendingPreviousIntent && Boolean(previousSelection),
    shouldRememberTarget,
    targetEnvironment: newEnvironment,
    targetSelection,
    target: targetForEnvironment(newEnvironment),
    targetKeys,
  };
}
