import { sortKeyNames } from "./keySorting.js";

/** @typedef {import('../../types/events/component-state.js').KeyBrowserViewStateSnapshot} KeyBrowserViewStateSnapshot */
/** @typedef {import('../../types/events/base.js').KeyViewMode} KeyViewMode */
/** @typedef {import('./serviceTypes.js').ProfileData} ProfileData */
/** @typedef {import('./serviceTypes.js').StoredCommand} StoredCommand */
/** @typedef {{ name: string, keys: string[], isCollapsed: boolean, keyCount: number }} BindsetSection */

let latestAuthorityEpoch = 0;

/** @returns {number} */
export function nextKeyBrowserAuthorityEpoch() {
  latestAuthorityEpoch += 1;
  return latestAuthorityEpoch;
}

/**
 * Decode the only three supported view modes. The shipped
 * `bindset-sections` value represented an overlay rather than a distinct view,
 * so it and every absent or unknown persisted value use the grid default.
 *
 * @param {unknown} value
 * @returns {KeyViewMode}
 */
export function decodeKeyViewMode(value) {
  if (value === "categorized" || value === "key-types") return value;
  return "grid";
}

/** @param {unknown} value @returns {value is KeyViewMode} */
function isKeyViewMode(value) {
  return value === "grid" || value === "categorized" || value === "key-types";
}

/**
 * Attach owner identity to detached persistence data without accessing any
 * capability. Arrays keep dynamic names such as `__proto__` data-only.
 *
 * @param {Omit<KeyBrowserViewStateSnapshot, 'authorityEpoch' | 'revision'>} data
 * @param {{ authorityEpoch: number, revision: number }} identity
 * @returns {KeyBrowserViewStateSnapshot}
 */
export function readKeyBrowserViewState(data, { authorityEpoch, revision }) {
  return {
    authorityEpoch,
    revision,
    mode: decodeKeyViewMode(data.mode),
    collapsedCategories: {
      command: [...data.collapsedCategories.command].sort(),
      keyType: [...data.collapsedCategories.keyType].sort(),
    },
    collapsedBindsets: [...data.collapsedBindsets].sort(),
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
    mode: state.mode,
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
    revision < 0 ||
    !isKeyViewMode(candidate.mode)
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
    mode: state.mode,
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
    mode: state.mode,
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
 * Compute a detached next owner snapshot without touching persistence.
 *
 * @param {KeyBrowserViewStateSnapshot} state
 * @returns {KeyBrowserViewStateSnapshot}
 */
export function applyNextKeyViewMode(state) {
  /** @type {KeyViewMode} */
  let mode = "grid";
  if (state.mode === "grid") mode = "categorized";
  else if (state.mode === "categorized") mode = "key-types";

  return {
    authorityEpoch: state.authorityEpoch,
    revision: state.revision + 1,
    mode,
    collapsedCategories: {
      command: [...state.collapsedCategories.command],
      keyType: [...state.collapsedCategories.keyType],
    },
    collapsedBindsets: [...state.collapsedBindsets],
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
