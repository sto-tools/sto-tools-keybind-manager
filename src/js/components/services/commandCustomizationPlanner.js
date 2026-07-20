import {
  getEffectiveCommandBindset,
  getSnapshotCommands,
} from "./dataState.js";
import { commandDataEqual } from "./commandEditTargetCas.js";
import {
  isRichChainCommand,
  normalizeCommandList,
} from "./commandChainViewState.js";
import { isDataRecord } from "./jsonDataBoundary.js";
import {
  assertSafeProfileIdentifier,
  cloneValidatedProfileOperationValue,
} from "./profileOperations.js";

/** @typedef {import('./serviceTypes.js').StoredCommand} StoredCommand */
/** @typedef {import('../../types/events/component-state.js').DataCoordinatorStateSnapshot} DataStateSnapshot */
/** @typedef {'before-pre-pivot' | 'in-pivot-group'} CommandPlacement */
/**
 * @typedef {
 *   | Readonly<{ type: 'toggle-palindromic' }>
 *   | Readonly<{ type: 'toggle-placement' }>
 * } CommandCustomizationAction
 * @typedef {
 *   | Readonly<{ setting: 'palindromicGeneration', value: boolean }>
 *   | Readonly<{ setting: 'placement', value: CommandPlacement }>
 * } CommandCustomization
 * @typedef {Readonly<{
 *   authorityEpoch: number,
 *   revision: number,
 *   profileId: string,
 *   name: string,
 *   index: number,
 *   originalEntry: StoredCommand,
 *   commands: readonly StoredCommand[]
 * }> & (
 *   | Readonly<{ kind: 'primary', environment: string, bindset: null }>
 *   | Readonly<{ kind: 'alias', environment: 'alias', bindset: null }>
 *   | Readonly<{ kind: 'bindset', environment: string, bindset: string }>
 * )} CommandCustomizationTarget
 * @typedef {{
 *   snapshot: DataStateSnapshot | null | undefined,
 *   currentEnvironment: string | null | undefined,
 *   selectedKey: string | null | undefined,
 *   selectedAlias: string | null | undefined,
 *   activeBindset: string | null | undefined,
 *   bindsetsEnabled: boolean | null | undefined,
 *   index: number
 * }} CommandCustomizationContext
 * @typedef {{
 *   valid: false,
 *   reason: 'invalid_options' | 'invalid_target' | 'invalid_action' | 'unsafe_identifier' | 'invalid_payload',
 *   nextCommands: null,
 *   updateProfileRequest: null
 * }} CommandCustomizationPlanFailure
 * @typedef {{
 *   valid: true,
 *   target: CommandCustomizationTarget,
 *   action: CommandCustomizationAction,
 *   customization: CommandCustomization,
 *   nextCommands: StoredCommand[],
 *   updateProfileRequest: import('../../types/rpc/index.js').RpcRequest<'data:update-profile'>
 * }} CommandCustomizationPlanSuccess
 * @typedef {CommandCustomizationPlanFailure | CommandCustomizationPlanSuccess} CommandCustomizationPlan
 */

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

/** @param {CommandCustomizationPlanFailure['reason']} reason */
function invalidPlan(reason) {
  return /** @type {CommandCustomizationPlanFailure} */ ({
    valid: false,
    reason,
    nextCommands: null,
    updateProfileRequest: null,
  });
}

/**
 * Command mutations represent the primary storage path with a null bindset.
 * Keep customization targets on that same canonical vocabulary.
 *
 * @param {string | null | undefined} environment
 * @param {string | null | undefined} activeBindset
 * @param {boolean | null | undefined} bindsetsEnabled
 * @returns {string | null}
 */
function canonicalBindset(environment, activeBindset, bindsetsEnabled) {
  const effective = getEffectiveCommandBindset(
    environment,
    activeBindset,
    bindsetsEnabled,
  );
  return effective === "Primary Bindset" ? null : effective;
}

/**
 * @param {string} profileId
 * @param {string} environment
 * @param {string} name
 * @param {string | null} bindset
 * @returns {boolean}
 */
function identifiersAreSafe(profileId, environment, name, bindset) {
  try {
    assertSafeProfileIdentifier(profileId, "command customization profile");
    assertSafeProfileIdentifier(name, "command customization name");
    if (environment !== "alias") {
      assertSafeProfileIdentifier(
        environment,
        "command customization environment",
      );
    }
    if (bindset !== null) {
      assertSafeProfileIdentifier(bindset, "command customization bindset");
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Capture one immutable customization target from the exact accepted owner
 * revision rendered by CommandChainUI. No compatibility profile cache, RPC,
 * DOM state, or application global is consulted.
 *
 * @param {CommandCustomizationContext} context
 * @returns {CommandCustomizationTarget | null}
 */
export function captureCommandCustomizationTarget(context) {
  if (!isDataRecord(context)) return null;
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
    typeof snapshot.authorityEpoch !== "number" ||
    !Number.isSafeInteger(snapshot.authorityEpoch) ||
    typeof snapshot.revision !== "number" ||
    !Number.isSafeInteger(snapshot.revision) ||
    typeof snapshot.currentProfile !== "string" ||
    snapshot.currentProfile.length === 0 ||
    typeof currentEnvironment !== "string" ||
    currentEnvironment !== snapshot.currentEnvironment ||
    !Number.isSafeInteger(index) ||
    index < 0
  ) {
    return null;
  }

  const name = currentEnvironment === "alias" ? selectedAlias : selectedKey;
  if (typeof name !== "string" || name.length === 0) return null;
  const bindset = canonicalBindset(
    currentEnvironment,
    activeBindset,
    bindsetsEnabled,
  );
  if (
    !identifiersAreSafe(
      snapshot.currentProfile,
      currentEnvironment,
      name,
      bindset,
    )
  ) {
    return null;
  }

  try {
    const commands = cloneValidatedProfileOperationValue(
      normalizeCommandList(
        getSnapshotCommands(snapshot, currentEnvironment, name, bindset),
      ),
      "command customization commands",
    );
    if (index >= commands.length) return null;
    const location =
      currentEnvironment === "alias"
        ? /** @type {const} */ ({
            kind: "alias",
            environment: "alias",
            bindset: null,
          })
        : bindset === null
          ? /** @type {const} */ ({
              kind: "primary",
              environment: currentEnvironment,
              bindset: null,
            })
          : /** @type {const} */ ({
              kind: "bindset",
              environment: currentEnvironment,
              bindset,
            });
    return deepFreeze({
      authorityEpoch: snapshot.authorityEpoch,
      revision: snapshot.revision,
      profileId: snapshot.currentProfile,
      name,
      index,
      originalEntry: commands[index],
      commands,
      ...location,
    });
  } catch {
    return null;
  }
}

/**
 * Confirm that a captured target still belongs to the exact accepted owner,
 * selection, command path, and revision.
 *
 * @param {CommandCustomizationTarget} target
 * @param {Omit<CommandCustomizationContext, 'index'>} context
 * @returns {boolean}
 */
export function isCommandCustomizationTargetCurrent(target, context) {
  if (!isDataRecord(target) || !isDataRecord(context)) return false;
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
  if (
    name !== target.name ||
    canonicalBindset(currentEnvironment, activeBindset, bindsetsEnabled) !==
      target.bindset
  ) {
    return false;
  }

  try {
    const commands = normalizeCommandList(
      getSnapshotCommands(
        snapshot,
        target.environment,
        target.name,
        target.bindset,
      ),
    );
    return (
      commandDataEqual(commands, target.commands) &&
      commandDataEqual(commands[target.index], target.originalEntry)
    );
  } catch {
    return false;
  }
}

/** @param {unknown} action @returns {action is CommandCustomizationAction} */
function isCustomizationAction(action) {
  if (!isDataRecord(action) || Object.keys(action).length !== 1) return false;
  return (
    action.type === "toggle-palindromic" || action.type === "toggle-placement"
  );
}

/** @param {unknown} target @returns {target is CommandCustomizationTarget} */
function isCustomizationTarget(target) {
  if (!isDataRecord(target)) return false;
  const {
    authorityEpoch,
    revision,
    profileId,
    kind,
    environment,
    name,
    bindset,
    index,
    originalEntry,
    commands,
  } = target;
  if (
    typeof authorityEpoch !== "number" ||
    !Number.isSafeInteger(authorityEpoch) ||
    authorityEpoch < 0 ||
    typeof revision !== "number" ||
    !Number.isSafeInteger(revision) ||
    revision < 0 ||
    typeof profileId !== "string" ||
    profileId.length === 0 ||
    typeof environment !== "string" ||
    environment.length === 0 ||
    typeof name !== "string" ||
    name.length === 0 ||
    typeof index !== "number" ||
    !Number.isSafeInteger(index) ||
    index < 0 ||
    !Array.isArray(commands) ||
    index >= commands.length ||
    !commands.every(
      (command) => typeof command === "string" || isRichChainCommand(command),
    ) ||
    !commandDataEqual(commands[index], originalEntry)
  ) {
    return false;
  }
  if (kind === "alias") {
    return environment === "alias" && bindset === null;
  }
  if (kind === "primary") {
    return environment !== "alias" && bindset === null;
  }
  return (
    kind === "bindset" &&
    environment !== "alias" &&
    typeof bindset === "string" &&
    bindset.length > 0 &&
    bindset !== "Primary Bindset"
  );
}

/**
 * @param {StoredCommand} command
 * @param {CommandCustomizationAction} action
 * @returns {CommandCustomization}
 */
function projectCustomization(command, action) {
  if (action.type === "toggle-palindromic") {
    const included =
      typeof command === "string" || command.palindromicGeneration !== false;
    return { setting: "palindromicGeneration", value: !included };
  }
  const placement =
    typeof command === "object" && command.placement === "in-pivot-group"
      ? "in-pivot-group"
      : "before-pre-pivot";
  return {
    setting: "placement",
    value:
      placement === "in-pivot-group" ? "before-pre-pivot" : "in-pivot-group",
  };
}

/**
 * @param {CommandCustomizationTarget} target
 * @param {StoredCommand[]} commands
 * @returns {import('../../types/rpc/index.js').RpcRequest<'data:update-profile'>}
 */
function buildUpdateProfileRequest(target, commands) {
  if (target.kind === "alias") {
    return {
      profileId: target.profileId,
      modify: { aliases: { [target.name]: { commands } } },
    };
  }
  if (target.kind === "bindset") {
    return {
      profileId: target.profileId,
      modify: {
        bindsets: {
          [target.bindset]: {
            [target.environment]: { keys: { [target.name]: commands } },
          },
        },
      },
    };
  }
  return {
    profileId: target.profileId,
    modify: {
      builds: {
        [target.environment]: { keys: { [target.name]: commands } },
      },
    },
  };
}

/**
 * Plan one lazy rich-command customization from an immutable accepted-state
 * target. The action union determines its value, so mismatched setting/value
 * combinations cannot enter the owner request.
 *
 * @param {{ target: CommandCustomizationTarget, action: CommandCustomizationAction } | unknown} options
 * @returns {CommandCustomizationPlan}
 */
export function planCommandCustomization(options) {
  if (!isDataRecord(options)) return invalidPlan("invalid_options");
  const { target, action } = options;
  if (!isCustomizationTarget(target)) return invalidPlan("invalid_target");
  if (!isCustomizationAction(action)) return invalidPlan("invalid_action");
  if (
    !identifiersAreSafe(
      target.profileId,
      target.environment,
      target.name,
      target.bindset,
    )
  ) {
    return invalidPlan("unsafe_identifier");
  }

  try {
    const nextCommands = cloneValidatedProfileOperationValue(
      [...target.commands],
      "command customization target commands",
    );
    const customization = projectCustomization(
      nextCommands[target.index],
      action,
    );
    const current = nextCommands[target.index];
    const richCommand =
      typeof current === "string" ? { command: current } : { ...current };
    if (customization.setting === "palindromicGeneration") {
      richCommand.palindromicGeneration = customization.value;
    } else {
      richCommand.placement = customization.value;
    }
    nextCommands[target.index] = richCommand;

    return {
      valid: true,
      target,
      action: Object.freeze({ ...action }),
      customization: Object.freeze({ ...customization }),
      nextCommands: cloneValidatedProfileOperationValue(
        nextCommands,
        "command customization result commands",
      ),
      updateProfileRequest: cloneValidatedProfileOperationValue(
        buildUpdateProfileRequest(target, nextCommands),
        "command customization update",
      ),
    };
  } catch {
    return invalidPlan("invalid_payload");
  }
}
