/** @typedef {import('../../types/events/component-state.js').CommandPresentationStateSnapshot} CommandPresentationStateSnapshot */
/** @typedef {import('../../types/events/base.js').CommandGroupType} CommandGroupType */

/**
 * The narrow persistence capability required by command presentation state.
 *
 * @typedef {{
 *   readonly length: number,
 *   key: (index: number) => string | null,
 *   getItem: (key: string) => string | null,
 *   setItem: (key: string, value: string) => void,
 *   removeItem: (key: string) => void
 * }} CommandPresentationStorage
 */

const collapsedSuffix = "_collapsed";
const commandCategoryPrefix = "commandCategory_";
const commandGroupPrefix = "commandGroup_";

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

/**
 * @param {string} key
 * @param {string} prefix
 * @returns {string | null}
 */
function collapsedName(key, prefix) {
  if (!key.startsWith(prefix) || !key.endsWith(collapsedSuffix)) return null;
  const name = key.slice(prefix.length, -collapsedSuffix.length);
  return name.length > 0 ? name : null;
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
 * Hydrate the complete command-presentation state without repairing or
 * rewriting any legacy value. Only the exact string `true` is collapsed.
 *
 * @param {CommandPresentationStorage} storage
 * @param {{ authorityEpoch: number, revision: number }} identity
 * @returns {CommandPresentationStateSnapshot}
 */
export function readCommandPresentationState(
  storage,
  { authorityEpoch, revision },
) {
  /** @type {Set<string>} */
  const collapsedCategories = new Set();
  /** @type {Set<CommandGroupType>} */
  const collapsedGroups = new Set();

  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (typeof key !== "string") continue;

    const categoryId = collapsedName(key, commandCategoryPrefix);
    if (categoryId !== null) {
      if (storage.getItem(key) === "true") collapsedCategories.add(categoryId);
      continue;
    }

    const groupType = collapsedName(key, commandGroupPrefix);
    if (
      groupType !== null &&
      isCommandGroupType(groupType) &&
      storage.getItem(key) === "true"
    ) {
      collapsedGroups.add(groupType);
    }
  }

  return {
    authorityEpoch,
    revision,
    collapsedCategories: orderedCategories(collapsedCategories),
    collapsedGroups: orderedGroups(collapsedGroups),
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

/**
 * Preserve the shipped category format: expansion writes the literal `false`
 * rather than removing the key.
 *
 * @param {CommandPresentationStorage} storage
 * @param {string} categoryId
 * @param {boolean} isCollapsed
 */
export function writeCommandCategoryCollapse(storage, categoryId, isCollapsed) {
  if (!isCategoryId(categoryId)) {
    throw new TypeError("Command category ID must be a non-empty string");
  }
  if (typeof isCollapsed !== "boolean") {
    throw new TypeError("Command category collapse state must be boolean");
  }
  storage.setItem(
    `${commandCategoryPrefix}${categoryId}${collapsedSuffix}`,
    String(isCollapsed),
  );
  return isCollapsed;
}

/**
 * Preserve the shipped group format: expansion removes the key.
 *
 * @param {CommandPresentationStorage} storage
 * @param {CommandGroupType} groupType
 * @param {boolean} isCollapsed
 */
export function writeCommandGroupCollapse(storage, groupType, isCollapsed) {
  if (!isCommandGroupType(groupType)) {
    throw new TypeError("Command group type is not supported");
  }
  if (typeof isCollapsed !== "boolean") {
    throw new TypeError("Command group collapse state must be boolean");
  }

  const key = `${commandGroupPrefix}${groupType}${collapsedSuffix}`;
  if (isCollapsed) storage.setItem(key, "true");
  else storage.removeItem(key);
  return isCollapsed;
}
