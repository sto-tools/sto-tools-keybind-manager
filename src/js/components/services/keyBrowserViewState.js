import { sortKeyNames } from "./keySorting.js";

/** @typedef {import('../../types/events/component-state.js').KeyBrowserViewStateSnapshot} KeyBrowserViewStateSnapshot */
/** @typedef {import('./serviceTypes.js').ProfileData} ProfileData */
/** @typedef {import('./serviceTypes.js').StoredCommand} StoredCommand */
/**
 * @typedef {{
 *   readonly length: number,
 *   key: (index: number) => string | null,
 *   getItem: (key: string) => string | null,
 *   setItem: (key: string, value: string) => void
 * }} KeyBrowserStorage
 */
/** @typedef {{ name: string, keys: string[], isCollapsed: boolean, keyCount: number }} BindsetSection */

const collapsedSuffix = "_collapsed";
const commandCategoryPrefix = "keyCategory_";
const keyTypeCategoryPrefix = "keyTypeCategory_";
const bindsetPrefix = "bindsetSection_";

let latestAuthorityEpoch = 0;

/** @returns {number} */
export function nextKeyBrowserAuthorityEpoch() {
  latestAuthorityEpoch += 1;
  return latestAuthorityEpoch;
}

/**
 * @param {string} key
 * @param {string} prefix
 * @returns {string | null}
 */
function collapsedName(key, prefix) {
  if (!key.startsWith(prefix) || !key.endsWith(collapsedSuffix)) return null;
  return key.slice(prefix.length, -collapsedSuffix.length);
}

/**
 * Read a complete detached view-state snapshot from the injected persistence
 * capability. Arrays keep dynamic names such as `__proto__` data-only.
 *
 * @param {KeyBrowserStorage} storage
 * @param {{ authorityEpoch: number, revision: number }} identity
 * @returns {KeyBrowserViewStateSnapshot}
 */
export function readKeyBrowserViewState(storage, { authorityEpoch, revision }) {
  /** @type {string[]} */
  const command = [];
  /** @type {string[]} */
  const keyType = [];
  /** @type {string[]} */
  const collapsedBindsets = [];

  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key === null || storage.getItem(key) !== "true") continue;

    const commandName = collapsedName(key, commandCategoryPrefix);
    if (commandName !== null) {
      command.push(commandName);
      continue;
    }

    const keyTypeName = collapsedName(key, keyTypeCategoryPrefix);
    if (keyTypeName !== null) {
      keyType.push(keyTypeName);
      continue;
    }

    const bindsetName = collapsedName(key, bindsetPrefix);
    if (bindsetName !== null) collapsedBindsets.push(bindsetName);
  }

  return {
    authorityEpoch,
    revision,
    collapsedCategories: {
      command: command.sort(),
      keyType: keyType.sort(),
    },
    collapsedBindsets: collapsedBindsets.sort(),
  };
}

/**
 * @param {KeyBrowserViewStateSnapshot} state
 * @returns {KeyBrowserViewStateSnapshot}
 */
export function cloneKeyBrowserViewState(state) {
  return {
    authorityEpoch: state.authorityEpoch,
    revision: state.revision,
    collapsedCategories: {
      command: [...state.collapsedCategories.command],
      keyType: [...state.collapsedCategories.keyType],
    },
    collapsedBindsets: [...state.collapsedBindsets],
  };
}

/**
 * Adopt only a valid snapshot from a newer owner generation or a strictly
 * newer revision of the current owner.
 *
 * @param {KeyBrowserViewStateSnapshot} candidate
 * @param {KeyBrowserViewStateSnapshot | null | undefined} current
 * @returns {KeyBrowserViewStateSnapshot | null}
 */
export function adoptKeyBrowserViewState(candidate, current) {
  const { authorityEpoch, revision } = candidate;
  if (
    !Number.isSafeInteger(authorityEpoch) ||
    authorityEpoch < 1 ||
    !Number.isSafeInteger(revision) ||
    revision < 0
  ) {
    return null;
  }
  if (
    current &&
    (authorityEpoch < current.authorityEpoch ||
      (authorityEpoch === current.authorityEpoch &&
        revision <= current.revision))
  ) {
    return null;
  }
  return cloneKeyBrowserViewState(candidate);
}

/**
 * @param {readonly string[]} names
 * @param {string} name
 * @param {boolean} isCollapsed
 */
function withCollapsedName(names, name, isCollapsed) {
  const next = names.filter((candidate) => candidate !== name);
  if (isCollapsed) next.push(name);
  return next.sort();
}

/**
 * Return the next owner revision after applying one durable category state.
 * Only the exact legacy `key-type` mode selects that namespace.
 *
 * @param {KeyBrowserViewStateSnapshot} state
 * @param {string} categoryId
 * @param {string} mode
 * @param {boolean} isCollapsed
 * @returns {KeyBrowserViewStateSnapshot}
 */
export function applyKeyCategoryCollapse(state, categoryId, mode, isCollapsed) {
  const keyType = mode === "key-type";
  return {
    authorityEpoch: state.authorityEpoch,
    revision: state.revision + 1,
    collapsedCategories: {
      command: keyType
        ? [...state.collapsedCategories.command]
        : withCollapsedName(
            state.collapsedCategories.command,
            categoryId,
            isCollapsed,
          ),
      keyType: keyType
        ? withCollapsedName(
            state.collapsedCategories.keyType,
            categoryId,
            isCollapsed,
          )
        : [...state.collapsedCategories.keyType],
    },
    collapsedBindsets: [...state.collapsedBindsets],
  };
}

/**
 * Return the next owner revision after applying one durable bindset state.
 *
 * @param {KeyBrowserViewStateSnapshot} state
 * @param {string} bindsetName
 * @param {boolean} isCollapsed
 * @returns {KeyBrowserViewStateSnapshot}
 */
export function applyBindsetCollapse(state, bindsetName, isCollapsed) {
  return {
    authorityEpoch: state.authorityEpoch,
    revision: state.revision + 1,
    collapsedCategories: {
      command: [...state.collapsedCategories.command],
      keyType: [...state.collapsedCategories.keyType],
    },
    collapsedBindsets: withCollapsedName(
      state.collapsedBindsets,
      bindsetName,
      isCollapsed,
    ),
  };
}

/**
 * @param {KeyBrowserViewStateSnapshot | null | undefined} state
 * @param {string} categoryId
 * @param {string} [mode]
 */
export function isKeyCategoryCollapsed(state, categoryId, mode = "command") {
  if (!state || !categoryId) return false;
  const categories =
    mode === "key-type"
      ? state.collapsedCategories.keyType
      : state.collapsedCategories.command;
  return categories.includes(categoryId);
}

/**
 * @param {KeyBrowserViewStateSnapshot | null | undefined} state
 * @param {string | undefined} bindsetName
 */
export function isBindsetCollapsed(state, bindsetName) {
  return Boolean(bindsetName && state?.collapsedBindsets.includes(bindsetName));
}

/** @param {string} categoryId @param {string} mode */
function categoryStorageKey(categoryId, mode) {
  const prefix =
    mode === "key-type" ? keyTypeCategoryPrefix : commandCategoryPrefix;
  return `${prefix}${categoryId}${collapsedSuffix}`;
}

/**
 * @param {KeyBrowserStorage} storage
 * @param {string} categoryId
 * @param {string} [mode]
 */
export function readNextKeyCategoryCollapse(
  storage,
  categoryId,
  mode = "command",
) {
  if (!categoryId) return false;
  return storage.getItem(categoryStorageKey(categoryId, mode)) !== "true";
}

/**
 * @param {KeyBrowserStorage} storage
 * @param {string} categoryId
 * @param {string} mode
 * @param {boolean} isCollapsed
 */
export function writeKeyCategoryCollapse(
  storage,
  categoryId,
  mode,
  isCollapsed,
) {
  if (!categoryId) return false;
  storage.setItem(categoryStorageKey(categoryId, mode), String(isCollapsed));
  return isCollapsed;
}

/** @param {KeyBrowserStorage} storage @param {string | undefined} bindsetName */
export function readNextBindsetCollapse(storage, bindsetName) {
  if (!bindsetName) return false;
  return (
    storage.getItem(`${bindsetPrefix}${bindsetName}${collapsedSuffix}`) !==
    "true"
  );
}

/**
 * @param {KeyBrowserStorage} storage
 * @param {string | undefined} bindsetName
 * @param {boolean} isCollapsed
 */
export function writeBindsetCollapse(storage, bindsetName, isCollapsed) {
  if (!bindsetName) return false;
  storage.setItem(
    `${bindsetPrefix}${bindsetName}${collapsedSuffix}`,
    String(isCollapsed),
  );
  return isCollapsed;
}

/**
 * Project insertion-ordered sections from one captured profile revision.
 * Primary is always first; named bindsets are alphabetical and every key list
 * retains the existing natural key ordering.
 *
 * @param {ProfileData | null | undefined} profile
 * @param {Record<string, StoredCommand[]>} primaryKeyMap
 * @param {string} environment
 * @param {KeyBrowserViewStateSnapshot | null | undefined} state
 * @returns {Record<string, BindsetSection>}
 */
export function projectBindsetSections(
  profile,
  primaryKeyMap,
  environment,
  state,
) {
  const namedBindsets = Object.keys(profile?.bindsets || {})
    .filter((name) => name !== "Primary Bindset")
    .sort((left, right) => left.localeCompare(right));
  const sectionNames = ["Primary Bindset", ...namedBindsets];

  return Object.fromEntries(
    sectionNames.map((name) => {
      const keyMap =
        name === "Primary Bindset"
          ? primaryKeyMap
          : profile?.bindsets?.[name]?.[environment]?.keys || {};
      const keys = sortKeyNames(Object.keys(keyMap));
      return [
        name,
        {
          name,
          keys,
          isCollapsed: isBindsetCollapsed(state, name),
          keyCount: keys.length,
        },
      ];
    }),
  );
}
