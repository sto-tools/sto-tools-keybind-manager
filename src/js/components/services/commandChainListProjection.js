import { isCommandGroupCollapsed } from "./commandPresentationState.js";

/** @typedef {'before-pre-pivot' | 'in-pivot-group'} CommandPlacement */
/**
 * @typedef {{
 *   command: string,
 *   palindromicGeneration?: boolean,
 *   placement?: CommandPlacement,
 *   [metadata: string]: unknown
 * }} RichChainCommand
 * @typedef {string | RichChainCommand} ChainCommand
 * @typedef {import('../../types/events/base.js').CommandGroupType} CommandGroupType
 * @typedef {{ command: ChainCommand, index: number }} GroupedCommand
 * @typedef {{
 *   titleKey: string,
 *   hintKey: string,
 *   commands: readonly GroupedCommand[],
 *   isCollapsed: boolean
 * }} CommandGroupProjection
 * @typedef {Readonly<Record<CommandGroupType, CommandGroupProjection>>} CommandGroupsProjection
 * @typedef {{
 *   renderToken: string,
 *   commandIndices: readonly number[],
 *   groupIndices: Readonly<Record<CommandGroupType, readonly number[]>> | null
 * }} CommandChainInteractionState
 * @typedef {{
 *   t: (key: string | string[], params?: import('i18next').TOptions) => string
 * }} I18nLike
 * @typedef {{
 *   key?: string,
 *   params?: import('i18next').TOptions,
 *   fallback?: string,
 *   text?: string,
 *   name?: string,
 *   displayText?: string
 * }} DisplayTextRecord
 * @typedef {{
 *   displayText?: string | DisplayTextRecord | null,
 *   text?: unknown,
 *   icon?: unknown,
 *   type?: unknown,
 *   category?: unknown
 * }} EnrichedCommand
 * @typedef {{
 *   customizable?: unknown,
 *   categoryId?: unknown
 * }} CommandDefinition
 * @typedef {{
 *   kind: 'edit' | 'delete' | 'toggle-palindromic' | 'toggle-placement' | 'move-up' | 'move-down',
 *   title: string,
 *   iconClass: string,
 *   disabled?: boolean,
 *   placeholder?: boolean,
 *   active?: boolean,
 *   commandIndex?: number,
 *   dataAction?: string,
 *   danger?: boolean
 * }} CommandRowAction
 * @typedef {{
 *   index: number,
 *   renderToken: string,
 *   groupType: CommandGroupType | null,
 *   number: string,
 *   displayName: string,
 *   displayIcon: string,
 *   commandType: string,
 *   commandTypeClass: string | null,
 *   customizable: boolean,
 *   parameterTitle: string,
 *   warning: Readonly<{ key: string, text: string }> | null,
 *   actions: readonly Readonly<CommandRowAction>[]
 * }} CommandChainRowProjection
 */

export const COMMAND_CHAIN_GROUP_ORDER = Object.freeze(
  /** @type {CommandGroupType[]} */ (["non-trayexec", "palindromic", "pivot"]),
);

const GROUP_COPY_KEYS = Object.freeze({
  "non-trayexec": Object.freeze({
    titleKey: "command_group_non_trayexec",
    hintKey: "command_group_hint_fixed_order",
  }),
  palindromic: Object.freeze({
    titleKey: "command_group_palindromic",
    hintKey: "command_group_hint_palindromic",
  }),
  pivot: Object.freeze({
    titleKey: "command_group_pivot",
    hintKey: "command_group_hint_pivot",
  }),
});

const TRAY_EXEC_PATTERN = /^(?:\+)?TrayExecByTray/;
const SAFE_COMMAND_TYPE_CLASS = /^[A-Za-z0-9_-]+$/;

/**
 * Resolve one adjacent move exclusively within the indices authorized by the
 * current render and, when stabilized, the current command group.
 *
 * @param {CommandChainInteractionState} state
 * @param {number} index
 * @param {CommandGroupType | null} groupType
 * @param {'up' | 'down'} direction
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
 * Classify one accepted command snapshot without consulting persistence or UI
 * state. Group membership and indices are captured before any asynchronous row
 * enrichment starts.
 *
 * @param {{
 *   commands: readonly ChainCommand[],
 *   presentationState?: import('../../types/events/component-state.js').CommandPresentationStateSnapshot | null
 * }} input
 * @returns {CommandGroupsProjection}
 */
export function projectCommandChainGroups({
  commands,
  presentationState = null,
}) {
  const hasExplicitPivotGroup = commands.some(
    (command) =>
      typeof command === "object" && command.placement === "in-pivot-group",
  );
  /** @type {Record<CommandGroupType, GroupedCommand[]>} */
  const grouped = {
    "non-trayexec": [],
    palindromic: [],
    pivot: [],
  };

  commands.forEach((command, index) => {
    const commandString =
      typeof command === "string" ? command : command.command;
    const isTrayExec = TRAY_EXEC_PATTERN.test(commandString);
    const isExcluded =
      typeof command === "object" && command.palindromicGeneration === false;
    const isInPivotGroup =
      typeof command === "object" && command.placement === "in-pivot-group";

    /** @type {CommandGroupType} */
    let groupType = "palindromic";
    if (!isTrayExec || (isExcluded && !isInPivotGroup)) {
      groupType = "non-trayexec";
    } else if (isExcluded && hasExplicitPivotGroup) {
      groupType = "pivot";
    }
    grouped[groupType].push(Object.freeze({ command, index }));
  });

  /** @type {Record<CommandGroupType, CommandGroupProjection>} */
  const result = /** @type {any} */ ({});
  for (const groupType of COMMAND_CHAIN_GROUP_ORDER) {
    result[groupType] = Object.freeze({
      ...GROUP_COPY_KEYS[groupType],
      commands: Object.freeze(grouped[groupType]),
      isCollapsed: isCommandGroupCollapsed(presentationState, groupType),
    });
  }
  return Object.freeze(result);
}

/**
 * @param {I18nLike} i18n
 * @param {string | DisplayTextRecord | null | undefined} displayText
 * @param {string} fallback
 */
function materializeDisplayName(i18n, displayText, fallback) {
  if (typeof displayText === "string") return displayText;
  if (displayText && typeof displayText === "object") {
    if (displayText.key && displayText.fallback) {
      const translated = i18n.t(displayText.key, displayText.params || {});
      if (translated && translated !== displayText.key) return translated;
      return displayText.fallback;
    }
    const value =
      displayText.fallback ||
      displayText.text ||
      displayText.name ||
      displayText.displayText;
    if (value) return String(value);
  }
  return fallback;
}

/**
 * @param {I18nLike} i18n
 * @param {string | null | undefined} warningKey
 */
function materializeWarning(i18n, warningKey) {
  if (!warningKey) return null;
  const translated = i18n.t(warningKey);
  return Object.freeze({
    key: warningKey,
    text: translated && translated !== warningKey ? translated : warningKey,
  });
}

/**
 * Project an already-enriched command into a detached, listener-free row
 * description. The projector may translate copy but owns no DOM, cache, RPC,
 * catalog, event, persistence, or global capability.
 *
 * @param {{
 *   command: ChainCommand,
 *   commandString: string,
 *   index: number,
 *   displayIndex?: number | null,
 *   stabilized: boolean,
 *   groupType?: CommandGroupType | null,
 *   interactionState: CommandChainInteractionState,
 *   enrichedCommand: EnrichedCommand,
 *   commandDefinition?: CommandDefinition | null,
 *   warningKey?: string | null,
 *   i18n: I18nLike
 * }} input
 * @returns {CommandChainRowProjection}
 */
export function projectCommandChainRow({
  command,
  commandString,
  index,
  displayIndex = null,
  stabilized,
  groupType = null,
  interactionState,
  enrichedCommand,
  commandDefinition = null,
  warningKey = null,
  i18n,
}) {
  const isCustom =
    enrichedCommand.type === "custom" || enrichedCommand.category === "custom";
  const customizable = Boolean(commandDefinition?.customizable || isCustom);
  const isTrayExec = TRAY_EXEC_PATTERN.test(commandString);
  const isIncluded =
    typeof command !== "object" || command.palindromicGeneration !== false;
  const isInPivotGroup =
    typeof command === "object" && command.placement === "in-pivot-group";
  const displayName =
    materializeDisplayName(i18n, enrichedCommand.displayText, commandString) ||
    (enrichedCommand.text ? String(enrichedCommand.text) : "") ||
    commandString;

  let rawCommandType = enrichedCommand.type || enrichedCommand.category || "";
  if (
    commandDefinition?.categoryId &&
    !["vfx-alias", "alias"].includes(String(enrichedCommand.type)) &&
    !["vfx-alias", "alias"].includes(String(enrichedCommand.category))
  ) {
    rawCommandType = commandDefinition.categoryId;
  }
  const commandType = String(rawCommandType);
  /** @type {CommandRowAction[]} */
  const actions = [
    {
      kind: "edit",
      title: customizable ? i18n.t("edit_command") : "",
      iconClass: "fas fa-edit",
      disabled: !customizable,
      placeholder: !customizable,
    },
    {
      kind: "delete",
      title: i18n.t("delete_command"),
      iconClass: "fas fa-times",
      danger: true,
    },
  ];

  if (stabilized && isTrayExec) {
    actions.push({
      kind: "toggle-palindromic",
      title: i18n.t(
        isIncluded
          ? "palindromic_included_tooltip"
          : "palindromic_excluded_tooltip",
      ),
      iconClass: "fas fa-balance-scale",
      active: isIncluded,
      commandIndex: index,
      dataAction: "commandchain-palindromic-toggle",
    });
  }
  if (stabilized && isTrayExec && !isIncluded) {
    actions.push({
      kind: "toggle-placement",
      title: i18n.t(
        isInPivotGroup
          ? "placement_in_pivot_group_tooltip"
          : "placement_before_palindromes_tooltip",
      ),
      iconClass: "fas fa-arrows-left-right-to-line",
      active: isInPivotGroup,
      commandIndex: index,
      dataAction: "commandchain-placement-toggle",
    });
  }

  for (const direction of /** @type {const} */ (["up", "down"])) {
    actions.push({
      kind: `move-${direction}`,
      title: i18n.t(
        direction === "up" ? "move_command_up" : "move_command_down",
      ),
      iconClass: `fas fa-chevron-${direction}`,
      disabled:
        getCommandMoveTarget(interactionState, index, groupType, direction) ===
        null,
    });
  }

  return Object.freeze({
    index,
    renderToken: interactionState.renderToken,
    groupType,
    number: String(displayIndex ?? index + 1),
    displayName,
    displayIcon: String(enrichedCommand.icon ?? ""),
    commandType,
    commandTypeClass: SAFE_COMMAND_TYPE_CLASS.test(commandType)
      ? commandType
      : null,
    customizable,
    parameterTitle: customizable ? i18n.t("editable_parameters") : "",
    warning: materializeWarning(i18n, warningKey),
    actions: Object.freeze(actions.map((action) => Object.freeze(action))),
  });
}
