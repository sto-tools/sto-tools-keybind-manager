/** @typedef {import('../../types/events/component-state.js').CommandPresentationStateSnapshot} CommandPresentationStateSnapshot */
/** @typedef {import('../../types/events/base.js').CommandGroupType} CommandGroupType */

const COMMAND_PRESENTATION_GROUPS = Object.freeze(
  /** @type {CommandGroupType[]} */ (["non-trayexec", "palindromic", "pivot"]),
);

let latestAuthorityEpoch = 0;

/** @returns {number} */
export function nextCommandPresentationAuthorityEpoch() {
  latestAuthorityEpoch += 1;
  return latestAuthorityEpoch;
}

/** @param {unknown} value @returns {value is CommandGroupType} */
function isCommandGroupType(value) {
  return (
    value === "non-trayexec" || value === "palindromic" || value === "pivot"
  );
}

/** @param {unknown} value @returns {value is string} */
function isCategoryId(value) {
  return typeof value === "string" && value.length > 0;
}

/** @param {Iterable<string>} names @returns {string[]} */
function orderedCategories(names) {
  return [...names].sort();
}

/** @param {Iterable<CommandGroupType>} groups @returns {CommandGroupType[]} */
function orderedGroups(groups) {
  const selected = new Set(groups);
  return COMMAND_PRESENTATION_GROUPS.filter((group) => selected.has(group));
}

/**
 * Attach owner identity to detached canonical persistence data. This pure
 * helper has no knowledge of storage keys or capabilities.
 *
 * @param {Omit<CommandPresentationStateSnapshot, 'authorityEpoch' | 'revision'>} data
 * @param {{ authorityEpoch: number, revision: number }} identity
 * @returns {CommandPresentationStateSnapshot}
 */
export function readCommandPresentationState(
  data,
  { authorityEpoch, revision },
) {
  return {
    authorityEpoch,
    revision,
    collapsedCategories: orderedCategories(data.collapsedCategories),
    collapsedGroups: orderedGroups(data.collapsedGroups),
  };
}

/**
 * @param {CommandPresentationStateSnapshot} state
 * @returns {CommandPresentationStateSnapshot}
 */
export function cloneCommandPresentationState(state) {
  return {
    authorityEpoch: state.authorityEpoch,
    revision: state.revision,
    collapsedCategories: orderedCategories(state.collapsedCategories),
    collapsedGroups: orderedGroups(state.collapsedGroups),
  };
}

/** @param {unknown[]} values @param {(value: unknown) => boolean} guard */
function hasUniqueValidValues(values, guard) {
  return values.every(guard) && new Set(values).size === values.length;
}

/**
 * Adopt only a structurally valid snapshot from a newer owner generation or a
 * strictly newer revision of the current owner. Returned arrays are detached
 * and canonicalized deterministically.
 *
 * @param {unknown} candidate
 * @param {CommandPresentationStateSnapshot | null | undefined} current
 * @returns {CommandPresentationStateSnapshot | null}
 */
export function adoptCommandPresentationState(candidate, current) {
  if (typeof candidate !== "object" || candidate === null) return null;

  const value = /** @type {Record<string, unknown>} */ (candidate);
  const { authorityEpoch, revision, collapsedCategories, collapsedGroups } =
    value;
  if (
    !Number.isSafeInteger(authorityEpoch) ||
    Number(authorityEpoch) < 1 ||
    !Number.isSafeInteger(revision) ||
    Number(revision) < 0 ||
    !Array.isArray(collapsedCategories) ||
    !Array.isArray(collapsedGroups) ||
    !hasUniqueValidValues(collapsedCategories, isCategoryId) ||
    !hasUniqueValidValues(collapsedGroups, isCommandGroupType)
  ) {
    return null;
  }

  const typedAuthorityEpoch = /** @type {number} */ (authorityEpoch);
  const typedRevision = /** @type {number} */ (revision);
  if (
    current &&
    (typedAuthorityEpoch < current.authorityEpoch ||
      (typedAuthorityEpoch === current.authorityEpoch &&
        typedRevision <= current.revision))
  ) {
    return null;
  }

  return {
    authorityEpoch: typedAuthorityEpoch,
    revision: typedRevision,
    collapsedCategories: orderedCategories(
      /** @type {string[]} */ (collapsedCategories),
    ),
    collapsedGroups: orderedGroups(
      /** @type {CommandGroupType[]} */ (collapsedGroups),
    ),
  };
}

/**
 * @param {readonly string[]} names
 * @param {string} name
 * @param {boolean} isCollapsed
 */
function withCollapsedName(names, name, isCollapsed) {
  const next = names.filter((candidate) => candidate !== name);
  if (isCollapsed) next.push(name);
  return orderedCategories(next);
}

/**
 * @param {CommandPresentationStateSnapshot} state
 * @param {string} categoryId
 * @param {boolean} isCollapsed
 * @returns {CommandPresentationStateSnapshot}
 */
export function applyCommandCategoryCollapse(state, categoryId, isCollapsed) {
  if (!isCategoryId(categoryId)) {
    throw new TypeError("Command category ID must be a non-empty string");
  }
  if (typeof isCollapsed !== "boolean") {
    throw new TypeError("Command category collapse state must be boolean");
  }

  return {
    authorityEpoch: state.authorityEpoch,
    revision: state.revision + 1,
    collapsedCategories: withCollapsedName(
      state.collapsedCategories,
      categoryId,
      isCollapsed,
    ),
    collapsedGroups: orderedGroups(state.collapsedGroups),
  };
}

/**
 * @param {CommandPresentationStateSnapshot} state
 * @param {CommandGroupType} groupType
 * @param {boolean} isCollapsed
 * @returns {CommandPresentationStateSnapshot}
 */
export function applyCommandGroupCollapse(state, groupType, isCollapsed) {
  if (!isCommandGroupType(groupType)) {
    throw new TypeError("Command group type is not supported");
  }
  if (typeof isCollapsed !== "boolean") {
    throw new TypeError("Command group collapse state must be boolean");
  }

  const nextGroups = state.collapsedGroups.filter(
    (candidate) => candidate !== groupType,
  );
  if (isCollapsed) nextGroups.push(groupType);
  return {
    authorityEpoch: state.authorityEpoch,
    revision: state.revision + 1,
    collapsedCategories: orderedCategories(state.collapsedCategories),
    collapsedGroups: orderedGroups(nextGroups),
  };
}

/**
 * @param {CommandPresentationStateSnapshot | null | undefined} state
 * @param {string} categoryId
 */
export function isCommandCategoryCollapsed(state, categoryId) {
  return Boolean(
    isCategoryId(categoryId) && state?.collapsedCategories.includes(categoryId),
  );
}

/**
 * @param {CommandPresentationStateSnapshot | null | undefined} state
 * @param {unknown} groupType
 */
export function isCommandGroupCollapsed(state, groupType) {
  return Boolean(
    isCommandGroupType(groupType) && state?.collapsedGroups.includes(groupType),
  );
}
