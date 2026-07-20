import { STOError } from "../../core/errors.js";
import { getEffectiveCommandBindset } from "../services/dataState.js";

/** @typedef {import('../../types/events/component-state.js').DataCoordinatorStateSnapshot} DataStateSnapshot */
/** @typedef {string | number | undefined} ParameterValue */
/**
 * @typedef {{
 *   type?: string,
 *   label?: string,
 *   help?: string,
 *   default?: ParameterValue,
 *   options?: string[],
 *   placeholder?: string,
 *   min?: string | number,
 *   max?: string | number,
 *   step?: string | number
 * }} ParameterDefinition
 */
/**
 * @typedef {{
 *   name: string,
 *   parameters: Record<string, ParameterDefinition>,
 *   categoryId?: string,
 *   commandId?: string,
 *   [field: string]: unknown
 * }} ParameterCommandDefinition
 */
/** @typedef {string | { command: string, [field: string]: unknown }} BuiltParameterCommand */
/**
 * @typedef {{
 *   snapshot: DataStateSnapshot | null | undefined,
 *   currentEnvironment: string | null | undefined,
 *   selectedKey: string | null | undefined,
 *   selectedAlias: string | null | undefined,
 *   activeBindset: string | null | undefined,
 *   bindsetsEnabled: boolean | null | undefined
 * }} ParameterAddContext
 */
/**
 * @typedef {Readonly<{
 *   authorityEpoch: number,
 *   revision: number,
 *   profileId: string,
 *   environment: string,
 *   name: string,
 *   selectedKey: string | null,
 *   selectedAlias: string | null,
 *   bindset: string | null
 * }>} ParameterAddTarget
 */

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** @param {object} value @param {PropertyKey} key */
function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

/**
 * @param {unknown} value
 * @returns {value is ParameterCommandDefinition}
 */
export function isParameterDef(value) {
  return (
    isRecord(value) &&
    typeof value.name === "string" &&
    isRecord(value.parameters)
  );
}

/**
 * Preserve the parameter editor's empty-value and Number conversion semantics.
 *
 * @param {string | null | undefined} value
 * @param {string} paramName
 * @returns {number | undefined}
 */
export function parseParameterNumber(value, paramName) {
  if (value === "" || value === undefined || value === null) return undefined;

  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    throw Object.assign(
      new STOError(
        `Invalid number for ${paramName}: '${value}' is not a valid number`,
        "INVALID_PARAMETER_NUMBER",
      ),
      { parameterName: paramName, parameterValue: value },
    );
  }
  return parsed;
}

/**
 * Parse the numeric representation used by boolean command parameters.
 * Every non-zero numeric value becomes one, while zero remains zero.
 *
 * @param {string | null | undefined} value
 * @param {string} paramName
 * @returns {0 | 1 | undefined}
 */
export function parseParameterBoolean(value, paramName) {
  if (value === "" || value === undefined || value === null) return undefined;

  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    throw Object.assign(
      new STOError(
        `Invalid boolean for ${paramName}: '${value}' is not a valid number`,
        "INVALID_PARAMETER_BOOLEAN",
      ),
      { parameterName: paramName, parameterValue: value },
    );
  }
  return parsed !== 0 ? 1 : 0;
}

/**
 * @param {unknown} value
 * @returns {value is BuiltParameterCommand}
 */
function isBuiltCommand(value) {
  return (
    typeof value === "string" ||
    (isRecord(value) && typeof value.command === "string")
  );
}

/**
 * Project a parameter-build result into the exact text/status understood by
 * the existing preview. Arrays remain valid even when filtering leaves them
 * empty. A malformed non-array result is marked invalid without embedding
 * user-facing copy; the lifecycle owner translates that presentation.
 *
 * @param {unknown} value
 * @returns {{ valid: boolean, text: string } | null}
 */
export function projectParameterBuildPreview(value) {
  if (!value) return null;

  if (Array.isArray(value)) {
    return {
      valid: true,
      text: value
        .filter(isBuiltCommand)
        .map((command) =>
          typeof command === "string" ? command : command.command,
        )
        .join(" $$ "),
    };
  }
  if (isBuiltCommand(value)) {
    return {
      valid: true,
      text: typeof value === "string" ? value : value.command,
    };
  }
  return { valid: false, text: "" };
}

/**
 * Accept only command values the mutation protocol can represent. Edit mode
 * retains its single-command rule; add mode preserves the filtered array as
 * one batch so downstream ordering remains atomic.
 *
 * @param {unknown} value
 * @param {{ editing: boolean }} options
 * @returns {BuiltParameterCommand | BuiltParameterCommand[] | null}
 */
export function projectParameterMutation(value, { editing }) {
  if (!value) return null;

  if (Array.isArray(value)) {
    const commands = value.filter(isBuiltCommand);
    return editing || commands.length === 0 ? null : commands;
  }
  return isBuiltCommand(value) ? value : null;
}

/**
 * @param {DataStateSnapshot | null | undefined} snapshot
 * @param {string | null | undefined} currentEnvironment
 * @returns {snapshot is DataStateSnapshot & { currentProfile: string }}
 */
function hasCoherentSnapshot(snapshot, currentEnvironment) {
  if (
    snapshot?.ready !== true ||
    !Number.isSafeInteger(snapshot.authorityEpoch) ||
    snapshot.authorityEpoch < 1 ||
    !Number.isSafeInteger(snapshot.revision) ||
    snapshot.revision < 0 ||
    typeof snapshot.currentProfile !== "string" ||
    snapshot.currentProfile.length === 0 ||
    snapshot.currentEnvironment !== currentEnvironment ||
    !isRecord(snapshot.profiles) ||
    !hasOwn(snapshot.profiles, snapshot.currentProfile)
  ) {
    return false;
  }
  return isRecord(snapshot.profiles[snapshot.currentProfile]);
}

/**
 * @param {ParameterAddContext} context
 * @returns {{ environment: string, name: string, selectedKey: string | null, selectedAlias: string | null } | null}
 */
function coherentSelection(context) {
  const { currentEnvironment, selectedKey, selectedAlias } = context;
  if (typeof currentEnvironment !== "string" || !currentEnvironment) {
    return null;
  }

  if (currentEnvironment === "alias") {
    if (
      typeof selectedAlias !== "string" ||
      !selectedAlias ||
      selectedKey !== null
    ) {
      return null;
    }
    return {
      environment: currentEnvironment,
      name: selectedAlias,
      selectedKey: null,
      selectedAlias,
    };
  }

  if (
    typeof selectedKey !== "string" ||
    !selectedKey ||
    selectedAlias !== null
  ) {
    return null;
  }
  return {
    environment: currentEnvironment,
    name: selectedKey,
    selectedKey,
    selectedAlias: null,
  };
}

/**
 * Capture the exact accepted owner, profile, environment, selection, and
 * effective bindset that an asynchronous parameter build may later mutate.
 *
 * @param {ParameterAddContext} context
 * @returns {ParameterAddTarget | null}
 */
export function captureParameterAddTarget(context) {
  const selection = coherentSelection(context);
  if (
    !selection ||
    !hasCoherentSnapshot(context.snapshot, selection.environment)
  ) {
    return null;
  }

  const snapshot = context.snapshot;
  return Object.freeze({
    authorityEpoch: snapshot.authorityEpoch,
    revision: snapshot.revision,
    profileId: snapshot.currentProfile,
    environment: selection.environment,
    name: selection.name,
    selectedKey: selection.selectedKey,
    selectedAlias: selection.selectedAlias,
    bindset: getEffectiveCommandBindset(
      selection.environment,
      context.activeBindset,
      context.bindsetsEnabled,
    ),
  });
}

/**
 * Admit a delayed parameter addition only while every captured authority and
 * location dimension still describes the exact accepted state.
 *
 * @param {ParameterAddTarget} target
 * @param {ParameterAddContext} context
 * @returns {boolean}
 */
export function isParameterAddTargetCurrent(target, context) {
  const selection = coherentSelection(context);
  const snapshot = context.snapshot;
  if (
    !selection ||
    !hasCoherentSnapshot(snapshot, selection.environment) ||
    snapshot.authorityEpoch !== target.authorityEpoch ||
    snapshot.revision !== target.revision ||
    snapshot.currentProfile !== target.profileId ||
    selection.environment !== target.environment ||
    selection.name !== target.name ||
    selection.selectedKey !== target.selectedKey ||
    selection.selectedAlias !== target.selectedAlias
  ) {
    return false;
  }

  return (
    getEffectiveCommandBindset(
      selection.environment,
      context.activeBindset,
      context.bindsetsEnabled,
    ) === target.bindset
  );
}
