import {
  getEffectiveCommandBindset,
  getSnapshotCommands,
  getSnapshotProfile,
  isSnapshotCommandStabilized,
} from "./dataState.js";

/** @typedef {import('../../types/events/component-state.js').DataCoordinatorStateSnapshot} DataStateSnapshot */
/**
 * @typedef {'before-pre-pivot' | 'in-pivot-group'} CommandPlacement
 * @typedef {{
 *   command: string,
 *   palindromicGeneration?: boolean,
 *   placement?: CommandPlacement,
 *   [metadata: string]: unknown
 * }} RichChainCommand
 * @typedef {string | RichChainCommand} ChainCommand
 * @typedef {'unavailable' | 'no-selection' | 'stale-selection' | 'empty' | 'populated'} CommandChainViewStatus
 * @typedef {{
 *   snapshot: DataStateSnapshot | null | undefined,
 *   environment?: string | null,
 *   selectedName?: string | null,
 *   activeBindset?: string | null,
 *   bindsetsEnabled?: boolean | null,
 * }} CommandChainViewStateInput
 * @typedef {{
 *   status: CommandChainViewStatus,
 *   environment: string,
 *   selectedName: string | null,
 *   bindset: string | null,
 *   commands: ChainCommand[],
 *   commandCount: number,
 *   stabilized: boolean,
 * }} CommandChainViewState
 */

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** @param {object} value @param {PropertyKey} key */
function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

/**
 * Recognize the structured command shape rendered by CommandChainUI. The
 * command field must be owned by the record so a prototype property cannot
 * turn malformed persisted data into a command.
 *
 * @param {unknown} value
 * @returns {value is RichChainCommand}
 */
export function isRichChainCommand(value) {
  return (
    isRecord(value) &&
    hasOwn(value, "command") &&
    typeof value.command === "string"
  );
}

/**
 * Normalize persisted command data at the view projection boundary. Returned
 * records are detached so a UI cannot mutate either the accepted snapshot or
 * a caller-owned compatibility payload.
 *
 * @param {unknown} value
 * @returns {ChainCommand[]}
 */
export function normalizeCommandList(value) {
  if (!Array.isArray(value)) return [];

  /** @type {ChainCommand[]} */
  const normalized = [];
  for (const command of value) {
    if (typeof command === "string") {
      normalized.push(command);
    } else if (isRichChainCommand(command)) {
      normalized.push(structuredClone(command));
    }
  }
  return normalized;
}

/**
 * Test whether one key is an own entry in a profile command map.
 *
 * @param {unknown} container
 * @param {string} environment
 * @param {string} selectedName
 * @returns {boolean}
 */
function hasEnvironmentKey(container, environment, selectedName) {
  if (!isRecord(container) || !hasOwn(container, environment)) return false;
  const environmentData = container[environment];
  if (
    !isRecord(environmentData) ||
    !hasOwn(environmentData, "keys") ||
    !isRecord(environmentData.keys)
  ) {
    return false;
  }
  return hasOwn(environmentData.keys, selectedName);
}

/**
 * Resolve selection existence exclusively from the accepted DataCoordinator
 * snapshot. Primary keys remain selectable while a named bindset is active;
 * named-only keys join that set only while bindsets are enabled. Aliases never
 * inherit key-bindset state.
 *
 * @param {DataStateSnapshot | null | undefined} snapshot
 * @param {string | null | undefined} environment
 * @param {string | null | undefined} selectedName
 * @param {string | null | undefined} activeBindset
 * @param {boolean | null | undefined} bindsetsEnabled
 * @returns {boolean}
 */
export function hasCommandChainSelection(
  snapshot,
  environment,
  selectedName,
  activeBindset,
  bindsetsEnabled,
) {
  if (!selectedName) return false;
  const profile = getSnapshotProfile(snapshot);
  if (!profile) return false;

  const resolvedEnvironment = environment || snapshot?.currentEnvironment;
  if (resolvedEnvironment === "alias") {
    return (
      hasOwn(profile, "aliases") &&
      isRecord(profile.aliases) &&
      hasOwn(profile.aliases, selectedName)
    );
  }
  if (!resolvedEnvironment) return false;

  if (
    hasOwn(profile, "builds") &&
    hasEnvironmentKey(profile.builds, resolvedEnvironment, selectedName)
  ) {
    return true;
  }

  if (
    bindsetsEnabled !== true ||
    !activeBindset ||
    activeBindset === "Primary Bindset" ||
    !hasOwn(profile, "bindsets") ||
    !isRecord(profile.bindsets) ||
    !hasOwn(profile.bindsets, activeBindset)
  ) {
    return false;
  }

  return hasEnvironmentKey(
    profile.bindsets[activeBindset],
    resolvedEnvironment,
    selectedName,
  );
}

/**
 * Project the complete command-list state needed by CommandChainUI from one
 * accepted DataCoordinator revision and local selection preferences.
 *
 * @param {CommandChainViewStateInput} input
 * @returns {CommandChainViewState}
 */
export function projectCommandChainViewState({
  snapshot,
  environment = null,
  selectedName = null,
  activeBindset = null,
  bindsetsEnabled = null,
}) {
  const resolvedEnvironment =
    environment || snapshot?.currentEnvironment || "space";
  const resolvedSelectedName = selectedName || null;
  const bindset = getEffectiveCommandBindset(
    resolvedEnvironment,
    activeBindset,
    bindsetsEnabled,
  );

  /**
   * @param {CommandChainViewStatus} status
   * @returns {CommandChainViewState}
   */
  const emptyProjection = (status) => ({
    status,
    environment: resolvedEnvironment,
    selectedName: resolvedSelectedName,
    bindset,
    commands: [],
    commandCount: 0,
    stabilized: false,
  });

  if (!getSnapshotProfile(snapshot)) return emptyProjection("unavailable");
  if (!resolvedSelectedName) return emptyProjection("no-selection");
  if (
    !hasCommandChainSelection(
      snapshot,
      resolvedEnvironment,
      resolvedSelectedName,
      activeBindset,
      bindsetsEnabled,
    )
  ) {
    return emptyProjection("stale-selection");
  }

  const commands = normalizeCommandList(
    getSnapshotCommands(
      snapshot,
      resolvedEnvironment,
      resolvedSelectedName,
      bindset,
    ),
  );

  return {
    status: commands.length === 0 ? "empty" : "populated",
    environment: resolvedEnvironment,
    selectedName: resolvedSelectedName,
    bindset,
    commands,
    commandCount: commands.length,
    stabilized: isSnapshotCommandStabilized(
      snapshot,
      resolvedEnvironment,
      resolvedSelectedName,
      bindset,
    ),
  };
}
