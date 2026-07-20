/** @typedef {'non-trayexec' | 'palindromic' | 'pivot'} CommandGroupType */
/** @typedef {'up' | 'down'} CommandMoveDirection */
/**
 * @typedef {{ index: number }} IndexedCommand
 * @typedef {{ commands: readonly IndexedCommand[] }} CommandGroupSource
 * @typedef {Partial<Record<CommandGroupType, CommandGroupSource>>} CommandGroupSources
 * @typedef {{
 *   renderToken: string,
 *   commandIndices: readonly number[],
 *   groupIndices: Readonly<Record<CommandGroupType, readonly number[]>> | null
 * }} CommandChainInteractionState
 * @typedef {{
 *   type: 'none'
 * } | {
 *   type: 'edit',
 *   index: number,
 *   renderToken: string,
 *   consumeEvent: boolean
 * } | {
 *   type: 'delete',
 *   index: number,
 *   renderToken: string,
 *   consumeEvent: boolean
 * } | {
 *   type: 'toggle-palindromic',
 *   index: number,
 *   renderToken: string,
 *   consumeEvent: boolean
 * } | {
 *   type: 'toggle-placement',
 *   index: number,
 *   renderToken: string,
 *   consumeEvent: boolean
 * } | {
 *   type: 'move',
 *   fromIndex: number,
 *   toIndex: number,
 *   renderToken: string,
 *   consumeEvent: boolean
 * } | {
 *   type: 'toggle-group',
 *   groupType: CommandGroupType,
 *   renderToken: string,
 *   consumeEvent: boolean
 * }} CommandChainInteraction
 * @typedef {{
 *   closest: (selector: string) => unknown
 * }} ClosestTarget
 * @typedef {{
 *   dataset: Record<string, string | undefined> | DOMStringMap
 * }} DatasetTarget
 */

/** @type {CommandChainInteraction} */
const NO_INTERACTION = Object.freeze({ type: "none" });

/**
 * @param {unknown} value
 * @returns {value is ClosestTarget}
 */
function isClosestTarget(value) {
  return (
    typeof value === "object" &&
    value !== null &&
    "closest" in value &&
    typeof value.closest === "function"
  );
}

/**
 * @param {unknown} value
 * @returns {value is DatasetTarget}
 */
function isDatasetTarget(value) {
  return (
    typeof value === "object" &&
    value !== null &&
    "dataset" in value &&
    typeof value.dataset === "object" &&
    value.dataset !== null
  );
}

/**
 * @param {unknown} value
 * @returns {value is ClosestTarget & { disabled: false }}
 */
function isEnabledButton(value) {
  return (
    isClosestTarget(value) && "disabled" in value && value.disabled === false
  );
}

/**
 * Dataset indices cross a delegated DOM decoding boundary. Accept only the canonical
 * non-negative decimal representation instead of parseInt's partial matches.
 * @param {unknown} value
 * @returns {number | null}
 */
function parseCommandIndex(value) {
  if (typeof value !== "string" || !/^(0|[1-9]\d*)$/.test(value)) {
    return null;
  }
  const index = Number(value);
  return Number.isSafeInteger(index) ? index : null;
}

/**
 * @param {unknown} value
 * @returns {CommandGroupType | null}
 */
export function normalizeCommandGroupType(value) {
  return value === "non-trayexec" ||
    value === "palindromic" ||
    value === "pivot"
    ? value
    : null;
}

/**
 * Capture the command indices authorized by one render. The returned value is
 * detached from mutable UI grouping data so later cache changes cannot alter
 * the meaning of already-materialized rows.
 *
 * @param {{
 *   renderToken: string | number,
 *   commandCount: number,
 *   groups?: CommandGroupSources | null
 * }} input
 * @returns {CommandChainInteractionState}
 */
export function createCommandChainInteractionState({
  renderToken,
  commandCount,
  groups = null,
}) {
  const count =
    Number.isSafeInteger(commandCount) && commandCount >= 0 ? commandCount : 0;
  const commandIndices = Object.freeze(
    Array.from({ length: count }, (_, index) => index),
  );

  let groupIndices = null;
  if (groups) {
    const assignedIndices = new Set();
    /** @type {Record<CommandGroupType, readonly number[]>} */
    const capturedGroups = {
      "non-trayexec": Object.freeze(
        captureGroupIndices(groups["non-trayexec"], count, assignedIndices),
      ),
      palindromic: Object.freeze(
        captureGroupIndices(groups.palindromic, count, assignedIndices),
      ),
      pivot: Object.freeze(
        captureGroupIndices(groups.pivot, count, assignedIndices),
      ),
    };
    groupIndices = Object.freeze(capturedGroups);
  }

  return Object.freeze({
    renderToken: String(renderToken),
    commandIndices,
    groupIndices,
  });
}

/**
 * @param {CommandGroupSource | undefined} group
 * @param {number} commandCount
 * @param {Set<number>} assignedIndices
 */
function captureGroupIndices(group, commandCount, assignedIndices) {
  if (!group || !Array.isArray(group.commands)) return [];
  return group.commands.flatMap(({ index }) => {
    if (
      !Number.isSafeInteger(index) ||
      index < 0 ||
      index >= commandCount ||
      assignedIndices.has(index)
    ) {
      return [];
    }
    assignedIndices.add(index);
    return [index];
  });
}

/**
 * @param {CommandChainInteractionState | null | undefined} state
 * @param {string | number} currentRenderToken
 * @param {unknown} candidateRenderToken
 */
export function isCommandChainInteractionCurrent(
  state,
  currentRenderToken,
  candidateRenderToken,
) {
  return Boolean(
    state &&
      state.renderToken === String(currentRenderToken) &&
      candidateRenderToken === state.renderToken,
  );
}

/**
 * @param {CommandChainInteractionState} state
 * @param {number} index
 * @param {CommandGroupType | null} groupType
 * @param {CommandMoveDirection} direction
 * @returns {number | null}
 */
export function getCommandMoveTarget(state, index, groupType, direction) {
  if (!state.commandIndices.includes(index)) return null;

  let orderedIndices = state.commandIndices;
  if (state.groupIndices) {
    if (!groupType) return null;
    orderedIndices = state.groupIndices[groupType];
  } else if (groupType) {
    return null;
  }

  const position = orderedIndices.indexOf(index);
  if (position < 0) return null;
  const targetPosition = direction === "up" ? position - 1 : position + 1;
  return orderedIndices[targetPosition] ?? null;
}

/**
 * Decode one delegated command-list click without causing side effects.
 * @param {unknown} target
 * @param {CommandChainInteractionState | null | undefined} state
 * @param {string | number} currentRenderToken
 * @returns {CommandChainInteraction}
 */
export function decodeCommandChainClick(target, state, currentRenderToken) {
  if (!isClosestTarget(target) || !state) return NO_INTERACTION;

  const editButton = target.closest(".btn-edit:not(.btn-placeholder)");
  if (isEnabledButton(editButton)) {
    return decodeRowAction("edit", editButton, state, currentRenderToken, true);
  }

  const deleteButton = target.closest(".btn-delete");
  if (isEnabledButton(deleteButton)) {
    return decodeRowAction(
      "delete",
      deleteButton,
      state,
      currentRenderToken,
      true,
    );
  }

  const upButton = target.closest(".btn-up");
  if (isEnabledButton(upButton)) {
    return decodeMoveAction(upButton, "up", state, currentRenderToken);
  }

  const downButton = target.closest(".btn-down");
  if (isEnabledButton(downButton)) {
    return decodeMoveAction(downButton, "down", state, currentRenderToken);
  }

  const palindromicButton = target.closest(".btn-palindromic-toggle");
  if (isEnabledButton(palindromicButton)) {
    return decodeRowAction(
      "toggle-palindromic",
      palindromicButton,
      state,
      currentRenderToken,
      true,
    );
  }

  const placementButton = target.closest(".btn-placement-toggle");
  if (isEnabledButton(placementButton)) {
    return decodeRowAction(
      "toggle-placement",
      placementButton,
      state,
      currentRenderToken,
      true,
    );
  }

  return decodeGroupAction(target, state, currentRenderToken);
}

/**
 * @param {unknown} target
 * @param {CommandChainInteractionState | null | undefined} state
 * @param {string | number} currentRenderToken
 * @returns {CommandChainInteraction}
 */
export function decodeCommandChainDoubleClick(
  target,
  state,
  currentRenderToken,
) {
  if (!isClosestTarget(target) || !state) return NO_INTERACTION;
  const row = target.closest(".command-item-row.customizable");
  return decodeAuthorizedRow("edit", row, state, currentRenderToken, false);
}

/**
 * @param {unknown} dragElement
 * @param {unknown} dropZone
 * @param {CommandChainInteractionState | null | undefined} state
 * @param {string | number} currentRenderToken
 * @returns {CommandChainInteraction}
 */
export function decodeCommandChainDrop(
  dragElement,
  dropZone,
  state,
  currentRenderToken,
) {
  if (!state) return NO_INTERACTION;
  const from = readAuthorizedRow(dragElement, state, currentRenderToken);
  const to = readAuthorizedRow(dropZone, state, currentRenderToken);
  if (!from || !to || from.index === to.index) return NO_INTERACTION;
  if (state.groupIndices && from.groupType !== to.groupType)
    return NO_INTERACTION;
  return {
    type: "move",
    fromIndex: from.index,
    toIndex: to.index,
    renderToken: state.renderToken,
    consumeEvent: false,
  };
}

/**
 * @param {'edit' | 'delete' | 'toggle-palindromic' | 'toggle-placement'} type
 * @param {ClosestTarget} button
 * @param {CommandChainInteractionState} state
 * @param {string | number} currentRenderToken
 * @param {boolean} consumeEvent
 * @returns {CommandChainInteraction}
 */
function decodeRowAction(
  type,
  button,
  state,
  currentRenderToken,
  consumeEvent,
) {
  return decodeAuthorizedRow(
    type,
    button.closest(".command-item-row"),
    state,
    currentRenderToken,
    consumeEvent,
  );
}

/**
 * @param {ClosestTarget} button
 * @param {CommandMoveDirection} direction
 * @param {CommandChainInteractionState} state
 * @param {string | number} currentRenderToken
 * @returns {CommandChainInteraction}
 */
function decodeMoveAction(button, direction, state, currentRenderToken) {
  const row = readAuthorizedRow(
    button.closest(".command-item-row"),
    state,
    currentRenderToken,
  );
  if (!row) return NO_INTERACTION;
  const toIndex = getCommandMoveTarget(
    state,
    row.index,
    row.groupType,
    direction,
  );
  if (toIndex === null || toIndex === row.index) return NO_INTERACTION;
  return {
    type: "move",
    fromIndex: row.index,
    toIndex,
    renderToken: state.renderToken,
    consumeEvent: false,
  };
}

/**
 * @param {'edit' | 'delete' | 'toggle-palindromic' | 'toggle-placement'} type
 * @param {unknown} row
 * @param {CommandChainInteractionState} state
 * @param {string | number} currentRenderToken
 * @param {boolean} consumeEvent
 * @returns {CommandChainInteraction}
 */
function decodeAuthorizedRow(
  type,
  row,
  state,
  currentRenderToken,
  consumeEvent,
) {
  const authorized = readAuthorizedRow(row, state, currentRenderToken);
  if (!authorized) return NO_INTERACTION;
  return {
    type,
    index: authorized.index,
    renderToken: state.renderToken,
    consumeEvent,
  };
}

/**
 * @param {unknown} row
 * @param {CommandChainInteractionState} state
 * @param {string | number} currentRenderToken
 */
function readAuthorizedRow(row, state, currentRenderToken) {
  if (!isDatasetTarget(row)) return null;
  if (
    !isCommandChainInteractionCurrent(
      state,
      currentRenderToken,
      row.dataset.renderToken,
    )
  ) {
    return null;
  }

  const index = parseCommandIndex(row.dataset.index);
  if (index === null || !state.commandIndices.includes(index)) return null;

  const rawGroupType = row.dataset.group;
  const groupType = normalizeCommandGroupType(rawGroupType);
  if (state.groupIndices) {
    if (!groupType || !state.groupIndices[groupType].includes(index))
      return null;
  } else if (rawGroupType !== undefined) {
    return null;
  }

  return { index, groupType };
}

/**
 * @param {ClosestTarget} target
 * @param {CommandChainInteractionState} state
 * @param {string | number} currentRenderToken
 * @returns {CommandChainInteraction}
 */
function decodeGroupAction(target, state, currentRenderToken) {
  const header = target.closest(".group-header");
  if (!isDatasetTarget(header)) return NO_INTERACTION;
  if (
    !isCommandChainInteractionCurrent(
      state,
      currentRenderToken,
      header.dataset.renderToken,
    )
  ) {
    return NO_INTERACTION;
  }
  const groupType = normalizeCommandGroupType(header.dataset.group);
  if (!groupType || !state.groupIndices?.[groupType]?.length) {
    return NO_INTERACTION;
  }
  return {
    type: "toggle-group",
    groupType,
    renderToken: state.renderToken,
    consumeEvent: false,
  };
}
