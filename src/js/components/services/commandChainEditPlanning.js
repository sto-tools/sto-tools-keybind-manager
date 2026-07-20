import {
  getEffectiveCommandBindset,
  getSnapshotCommands,
} from "./dataState.js";

/** @typedef {import('./serviceTypes.js').StoredCommand} StoredCommand */
/** @typedef {import('./serviceTypes.js').RichCommand} RichCommand */
/** @typedef {import('./serviceTypes.js').CommandDefinition & { categoryId?: string, commandId?: string }} ResolvedCommandDefinition */
/** @typedef {import('../../types/events/component-state.js').DataCoordinatorStateSnapshot} DataStateSnapshot */

/**
 * @typedef {Readonly<{
 *   authorityEpoch: number,
 *   revision: number,
 *   profileId: string,
 *   environment: string,
 *   name: string,
 *   bindset: string | null,
 *   index: number,
 *   originalEntry: StoredCommand
 * }>} CommandEditTarget
 */

/**
 * @typedef {{
 *   snapshot: DataStateSnapshot | null | undefined,
 *   currentEnvironment: string | null | undefined,
 *   selectedKey: string | null | undefined,
 *   selectedAlias: string | null | undefined,
 *   activeBindset: string | null | undefined,
 *   bindsetsEnabled: boolean | null | undefined,
 *   index: number
 * }} CommandEditContext
 */

/**
 * @typedef {{
 *   index: number,
 *   command: RichCommand,
 *   commandDef: ResolvedCommandDefinition,
 *   categoryId: string | undefined,
 *   commandId: string | undefined
 * }} CommandEditPayload
 */

/**
 * @typedef {{
 *   kind: 'edit',
 *   payload: CommandEditPayload,
 *   parameterDerivationError: unknown
 * } | {
 *   kind: 'inform',
 *   message: string,
 *   parameterDerivationError: unknown
 * }} CommandEditPlan
 */

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** @template Value @param {Value} value @returns {Value} */
function clone(value) {
  return structuredClone(value);
}

/** @template Value @param {Value} value @param {WeakSet<object>} [seen] @returns {Value} */
function deepFreeze(value, seen = new WeakSet()) {
  if (value === null || typeof value !== "object") return value;
  const object = /** @type {object} */ (value);
  if (seen.has(object)) return value;
  seen.add(object);
  for (const key of Reflect.ownKeys(object)) {
    deepFreeze(Reflect.get(object, key), seen);
  }
  return Object.freeze(value);
}

/**
 * Compare canonical JSON-like command data without depending on object identity
 * or property insertion order.
 *
 * @param {unknown} left
 * @param {unknown} right
 * @returns {boolean}
 */
function commandDataEqual(left, right) {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => commandDataEqual(value, right[index]))
    );
  }
  if (!isRecord(left) || !isRecord(right)) return false;
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key) =>
        Object.prototype.hasOwnProperty.call(right, key) &&
        commandDataEqual(left[key], right[key]),
    )
  );
}

/**
 * Capture one immutable command-edit target from an environment-coherent,
 * accepted DataCoordinator snapshot. Compatibility profile caches are never
 * consulted.
 *
 * @param {CommandEditContext} context
 * @returns {CommandEditTarget | null}
 */
export function captureCommandEditTarget(context) {
  const {
    snapshot,
    currentEnvironment,
    selectedKey,
    selectedAlias,
    activeBindset,
    bindsetsEnabled,
    index,
  } = context;
  if (
    !snapshot?.ready ||
    currentEnvironment !== snapshot.currentEnvironment ||
    !snapshot.currentProfile ||
    !Number.isSafeInteger(index) ||
    index < 0
  ) {
    return null;
  }

  const name = currentEnvironment === "alias" ? selectedAlias : selectedKey;
  if (!name) return null;

  const bindset = getEffectiveCommandBindset(
    currentEnvironment,
    activeBindset,
    bindsetsEnabled,
  );
  const originalEntry = getSnapshotCommands(
    snapshot,
    currentEnvironment,
    name,
    bindset,
  )[index];
  if (!originalEntry) return null;

  return deepFreeze({
    authorityEpoch: snapshot.authorityEpoch,
    revision: snapshot.revision,
    profileId: snapshot.currentProfile,
    environment: currentEnvironment,
    name,
    bindset,
    index,
    originalEntry: clone(originalEntry),
  });
}

/**
 * Confirm that a delayed edit plan still belongs to the same live owner and
 * exact accepted snapshot and command location.
 *
 * @param {CommandEditTarget} target
 * @param {Omit<CommandEditContext, 'index'>} context
 * @returns {boolean}
 */
export function isCommandEditTargetCurrent(target, context) {
  const {
    snapshot,
    currentEnvironment,
    selectedKey,
    selectedAlias,
    activeBindset,
    bindsetsEnabled,
  } = context;
  if (
    !snapshot?.ready ||
    snapshot.authorityEpoch !== target.authorityEpoch ||
    snapshot.revision !== target.revision ||
    snapshot.currentProfile !== target.profileId ||
    snapshot.currentEnvironment !== target.environment ||
    currentEnvironment !== target.environment
  ) {
    return false;
  }

  const name = target.environment === "alias" ? selectedAlias : selectedKey;
  if (name !== target.name) return false;
  if (
    getEffectiveCommandBindset(
      currentEnvironment,
      activeBindset,
      bindsetsEnabled,
    ) !== target.bindset
  ) {
    return false;
  }

  const currentEntry = getSnapshotCommands(
    snapshot,
    target.environment,
    target.name,
    target.bindset,
  )[target.index];
  return commandDataEqual(currentEntry, target.originalEntry);
}

/**
 * @param {StoredCommand} entry
 * @returns {RichCommand}
 */
function editableCommand(entry) {
  return typeof entry === "string" ? { command: entry } : clone(entry);
}

/**
 * @param {(key: string, defaultValue: string) => string} translate
 * @param {string} key
 * @param {string} defaultValue
 */
function translated(translate, key, defaultValue) {
  const value = translate(key, defaultValue);
  return typeof value === "string" ? value : defaultValue;
}

/**
 * Build the editable-command disposition without reading the EventBus, DOM,
 * storage, or application globals. Parser, catalog, and translation
 * capabilities are supplied by the lifecycle facade.
 *
 * @param {{
 *   target: CommandEditTarget,
 *   parseCommandString: (command: string) => Promise<{ commands?: Array<{ category?: string, parameters?: Record<string, unknown> }> }>,
 *   resolveDefinition: (command: RichCommand) => ResolvedCommandDefinition | null | Promise<ResolvedCommandDefinition | null>,
 *   translate: (key: string, defaultValue: string) => string
 * }} options
 * @returns {Promise<CommandEditPlan>}
 */
export async function planCommandEdit({
  target,
  parseCommandString,
  resolveDefinition,
  translate,
}) {
  const command = editableCommand(target.originalEntry);
  let parameterDerivationError = null;

  if (!command.parameters && typeof command.command === "string") {
    try {
      const parsed = await parseCommandString(command.command);
      const parameters = parsed?.commands?.[0]?.parameters;
      if (parameters) command.parameters = clone(parameters);
    } catch (error) {
      parameterDerivationError = error;
    }
  }

  const matchedDefinition = await resolveDefinition(command);
  const definition = matchedDefinition ? clone(matchedDefinition) : null;
  const isCustomizable = definition?.customizable === true;

  let isCustom = command.type === "custom" || command.category === "custom";
  if (!isCustom && typeof command.command === "string" && command.command) {
    try {
      const parsed = await parseCommandString(command.command);
      const firstCommand = parsed?.commands?.[0];
      isCustom = !firstCommand || firstCommand.category === "custom";
    } catch {
      isCustom = true;
    }
  }

  if (isCustomizable && definition) {
    return {
      kind: "edit",
      payload: {
        index: target.index,
        command,
        commandDef: definition,
        categoryId:
          typeof definition.categoryId === "string"
            ? definition.categoryId
            : command.type,
        commandId:
          typeof definition.commandId === "string"
            ? definition.commandId
            : undefined,
      },
      parameterDerivationError,
    };
  }

  if (isCustom) {
    const commandDef = {
      name: translated(translate, "edit_custom_command", "Edit Custom Command"),
      customizable: true,
      categoryId: "custom",
      commandId: "add_custom_command",
      parameters: {
        rawCommand: {
          type: "text",
          default: command.command || "",
          placeholder: translated(
            translate,
            "enter_any_sto_command",
            "Enter any STO command",
          ),
          label: translated(translate, "command_label_colon", "Command:"),
        },
      },
    };
    return {
      kind: "edit",
      payload: {
        index: target.index,
        command,
        commandDef,
        categoryId: "custom",
        commandId: "add_custom_command",
      },
      parameterDerivationError,
    };
  }

  return {
    kind: "inform",
    message:
      command.command ||
      command.text ||
      (typeof target.originalEntry === "string" ? target.originalEntry : ""),
    parameterDerivationError,
  };
}
