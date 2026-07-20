import { hasOwnDataField, isDataRecord } from "./jsonDataBoundary.js";
import { commandEditTargetMatches } from "./commandEditTargetCas.js";
import {
  assertSafeProfileIdentifier,
  cloneValidatedProfileOperationValue,
} from "./profileOperations.js";

/** @typedef {import('./serviceTypes.js').AliasDefinition} AliasDefinition */
/** @typedef {import('./serviceTypes.js').ProfileData} ProfileData */
/** @typedef {import('./serviceTypes.js').ProfileOperations} ProfileOperations */
/** @typedef {import('./serviceTypes.js').StoredCommand} StoredCommand */
/** @typedef {import('../../types/events/commands.js').CommandEditTarget} CommandEditTarget */
/** @typedef {import('../../types/rpc/index.js').RpcRequest<'data:update-profile'>} ProfileUpdateRequest */
/** @typedef {{ authorityEpoch: unknown, revision: unknown, profileId: string, environment: string }} CommandMutationOwner */

/**
 * @typedef {
 *   | { type: 'add', key: string, command: StoredCommand | StoredCommand[], bindset?: string | null }
 *   | { type: 'delete', key: string, index: number, bindset?: string | null }
 *   | { type: 'move', key: string, fromIndex: number, toIndex: number, bindset?: string | null }
 *   | { type: 'edit', key: string, index: number, updatedCommand: StoredCommand, bindset?: string | null, target?: CommandEditTarget }
 * } CommandMutation
 */

/**
 * @typedef {
 *   | { kind: 'primary', environment: string, key: string, bindset: null }
 *   | { kind: 'alias', environment: string, key: string, bindset: null }
 *   | { kind: 'bindset', environment: string, key: string, bindset: string }
 * } CommandMutationTarget
 */

/**
 * @typedef {
 *   | { topic: 'command-added', payload: import('../../types/events/commands.js').CommandEventProtocol['command-added'] }
 *   | { topic: 'command-deleted', payload: import('../../types/events/commands.js').CommandEventProtocol['command-deleted'] }
 *   | { topic: 'command-moved', payload: import('../../types/events/commands.js').CommandEventProtocol['command-moved'] }
 *   | { topic: 'command-edited', payload: import('../../types/events/commands.js').CommandEventProtocol['command-edited'] }
 * } CommandMutationEvent
 */

/**
 * @typedef {Object} CommandMutationPlanFailure
 * @property {false} valid
 * @property {'invalid_options' | 'invalid_profile' | 'missing_profile_id' | 'invalid_environment' | 'missing_key' | 'missing_command' | 'invalid_bindset' | 'invalid_mutation' | 'no_valid_commands' | 'invalid_alias' | 'invalid_index' | 'missing_command_at_index' | 'stale_edit_target' | 'unsafe_identifier' | 'invalid_payload'} reason
 * @property {null} updateProfileRequest
 */

/**
 * @typedef {Object} CommandMutationPlanSuccess
 * @property {true} valid
 * @property {boolean} noOp Valid no-op plans are still persisted and published.
 * @property {CommandMutationTarget} target
 * @property {ProfileUpdateRequest} updateProfileRequest
 * @property {StoredCommand[]} nextCommands
 * @property {CommandMutationEvent} event
 */

/** @typedef {CommandMutationPlanFailure | CommandMutationPlanSuccess} CommandMutationPlan */

/** @param {CommandMutationPlanFailure['reason']} reason */
function invalidPlan(reason) {
  return /** @type {CommandMutationPlanFailure} */ ({
    valid: false,
    reason,
    updateProfileRequest: null,
  });
}

/**
 * Read only own data fields so accepted profile maps never fall through to
 * Object.prototype members.
 *
 * @param {unknown} record
 * @param {string} key
 * @returns {unknown}
 */
function ownValue(record, key) {
  return isDataRecord(record) && hasOwnDataField(record, key)
    ? record[key]
    : undefined;
}

/** @param {unknown} value @returns {value is AliasDefinition & Record<string, unknown>} */
function isAliasDefinition(value) {
  return isDataRecord(value);
}

/**
 * @param {ProfileData} profile
 * @param {string} environment
 * @param {string} key
 * @returns {StoredCommand[]}
 */
function primaryCommands(profile, environment, key) {
  const build = ownValue(profile.builds, environment);
  const keys = isDataRecord(build) ? ownValue(build, "keys") : undefined;
  const commands = ownValue(keys, key);
  return Array.isArray(commands) ? structuredClone(commands) : [];
}

/**
 * @param {ProfileData} profile
 * @param {string} bindset
 * @param {string} environment
 * @param {string} key
 * @returns {StoredCommand[]}
 */
function bindsetCommands(profile, bindset, environment, key) {
  const bindsetData = ownValue(profile.bindsets, bindset);
  const build = isDataRecord(bindsetData)
    ? ownValue(bindsetData, environment)
    : undefined;
  const keys = isDataRecord(build) ? ownValue(build, "keys") : undefined;
  const commands = ownValue(keys, key);
  return Array.isArray(commands) ? structuredClone(commands) : [];
}

/**
 * @param {ProfileData} profile
 * @param {string} key
 * @returns {AliasDefinition | undefined}
 */
function ownAlias(profile, key) {
  const alias = ownValue(profile.aliases, key);
  return isAliasDefinition(alias) ? alias : undefined;
}

/**
 * @param {ProfileData} profile
 * @param {string} environment
 * @param {string} key
 * @param {string | null} bindset
 * @param {boolean} aliasByPresence
 * @returns {CommandMutationTarget}
 */
function resolveTarget(profile, environment, key, bindset, aliasByPresence) {
  const aliases = profile.aliases;
  const isAlias =
    environment === "alias" ||
    (aliasByPresence && isDataRecord(aliases) && hasOwnDataField(aliases, key));
  if (isAlias) {
    return { kind: "alias", environment, key, bindset: null };
  }
  if (bindset && bindset !== "Primary Bindset") {
    return { kind: "bindset", environment, key, bindset };
  }
  return { kind: "primary", environment, key, bindset: null };
}

/**
 * Validate identifiers before reading or constructing dynamic profile keys.
 * Alias targets deliberately ignore a supplied bindset exactly as the facade
 * historically did.
 *
 * @param {string} profileId
 * @param {CommandMutationTarget} target
 * @returns {boolean}
 */
function identifiersAreSafe(profileId, target) {
  try {
    assertSafeProfileIdentifier(profileId, "command mutation profile");
    assertSafeProfileIdentifier(target.key, "command mutation key");
    if (target.kind !== "alias") {
      assertSafeProfileIdentifier(
        target.environment,
        "command mutation environment",
      );
    }
    if (target.kind === "bindset") {
      assertSafeProfileIdentifier(target.bindset, "command mutation bindset");
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {string} profileId
 * @param {CommandMutationTarget} target
 * @param {ProfileOperations} operations
 * @returns {ProfileUpdateRequest | null}
 */
function detachedRequest(profileId, target, operations) {
  if (!identifiersAreSafe(profileId, target)) return null;
  try {
    return cloneValidatedProfileOperationValue(
      { profileId, ...operations },
      "command mutation update",
    );
  } catch {
    return null;
  }
}

/**
 * @param {string} profileId
 * @param {CommandMutationTarget} target
 * @param {ProfileOperations} operations
 * @param {StoredCommand[]} nextCommands
 * @param {boolean} noOp
 * @param {CommandMutationEvent} event
 * @returns {CommandMutationPlan}
 */
function completePlan(
  profileId,
  target,
  operations,
  nextCommands,
  noOp,
  event,
) {
  const updateProfileRequest = detachedRequest(profileId, target, operations);
  if (!updateProfileRequest) {
    return invalidPlan(
      identifiersAreSafe(profileId, target)
        ? "invalid_payload"
        : "unsafe_identifier",
    );
  }
  let detachedEvent;
  try {
    detachedEvent = cloneValidatedProfileOperationValue(
      event,
      "command mutation event",
    );
  } catch {
    return invalidPlan("invalid_payload");
  }
  return {
    valid: true,
    noOp,
    target,
    updateProfileRequest,
    nextCommands: structuredClone(nextCommands),
    event: detachedEvent,
  };
}

/**
 * @param {ProfileData} profile
 * @param {string} profileId
 * @param {string} environment
 * @param {Extract<CommandMutation, { type: 'add' }>} mutation
 * @param {(command: StoredCommand) => string} normalizeCommand
 * @param {(commands: StoredCommand[]) => string[]} normalizeCommands
 * @returns {CommandMutationPlan}
 */
function planAdd(
  profile,
  profileId,
  environment,
  mutation,
  normalizeCommand,
  normalizeCommands,
) {
  const commandsToAdd = Array.isArray(mutation.command)
    ? normalizeCommands(mutation.command)
    : [normalizeCommand(mutation.command)];
  const validCommands = commandsToAdd.filter((command) => command.length > 0);
  if (validCommands.length === 0) return invalidPlan("no_valid_commands");

  const target = resolveTarget(
    profile,
    environment,
    mutation.key,
    mutation.bindset || null,
    false,
  );
  if (!identifiersAreSafe(profileId, target)) {
    return invalidPlan("unsafe_identifier");
  }

  /** @type {ProfileOperations} */
  let operations;
  /** @type {StoredCommand[]} */
  let nextCommands;

  if (target.kind === "alias") {
    const existingAlias = ownAlias(profile, mutation.key);
    const currentCommands = Array.isArray(existingAlias?.commands)
      ? structuredClone(existingAlias.commands)
      : [];
    nextCommands = [...currentCommands, ...validCommands];
    operations = existingAlias
      ? {
          modify: {
            aliases: {
              [mutation.key]: { ...existingAlias, commands: nextCommands },
            },
          },
        }
      : {
          add: {
            aliases: {
              [mutation.key]: {
                commands: nextCommands,
                description: "",
                type: "alias",
              },
            },
          },
        };
  } else if (target.kind === "bindset") {
    nextCommands = [
      ...bindsetCommands(profile, target.bindset, environment, mutation.key),
      ...validCommands,
    ];
    const bindsetExists =
      ownValue(profile.bindsets, target.bindset) !== undefined;
    const patch = {
      bindsets: {
        [target.bindset]: {
          [environment]: { keys: { [mutation.key]: nextCommands } },
        },
      },
    };
    // An existing bindset must use modify/upsert even when this environment is
    // missing; add.bindsets replaces the complete bindset and loses siblings.
    operations = bindsetExists ? { modify: patch } : { add: patch };
  } else {
    nextCommands = [
      ...primaryCommands(profile, environment, mutation.key),
      ...validCommands,
    ];
    const build = ownValue(profile.builds, environment);
    const keys = isDataRecord(build) ? ownValue(build, "keys") : undefined;
    const keyExists = ownValue(keys, mutation.key) !== undefined;
    const patch = {
      builds: {
        [environment]: { keys: { [mutation.key]: nextCommands } },
      },
    };
    operations = keyExists ? { modify: patch } : { add: patch };
  }

  return completePlan(profileId, target, operations, nextCommands, false, {
    topic: "command-added",
    payload: { key: mutation.key, command: mutation.command },
  });
}

/**
 * @param {ProfileData} profile
 * @param {string} profileId
 * @param {string} environment
 * @param {Extract<CommandMutation, { type: 'delete' }>} mutation
 * @returns {CommandMutationPlan}
 */
function planDelete(profile, profileId, environment, mutation) {
  if (!mutation.key) return invalidPlan("missing_key");
  if (mutation.index === undefined) return invalidPlan("invalid_index");
  const target = resolveTarget(
    profile,
    environment,
    mutation.key,
    mutation.bindset || null,
    true,
  );
  if (!identifiersAreSafe(profileId, target)) {
    return invalidPlan("unsafe_identifier");
  }

  /** @type {ProfileOperations} */
  let operations;
  /** @type {StoredCommand[]} */
  let nextCommands;

  if (target.kind === "alias") {
    const alias = ownAlias(profile, mutation.key);
    if (!alias || !Array.isArray(alias.commands)) {
      return invalidPlan("invalid_alias");
    }
    nextCommands = structuredClone(alias.commands);
    if (mutation.index < 0 || mutation.index >= nextCommands.length) {
      return invalidPlan("invalid_index");
    }
    nextCommands.splice(mutation.index, 1);
    operations = {
      modify: {
        aliases: { [mutation.key]: { ...alias, commands: nextCommands } },
      },
    };
  } else {
    const currentCommands =
      target.kind === "bindset"
        ? bindsetCommands(profile, target.bindset, environment, mutation.key)
        : primaryCommands(profile, environment, mutation.key);
    if (!currentCommands[mutation.index]) {
      return invalidPlan("missing_command_at_index");
    }
    nextCommands = [...currentCommands];
    nextCommands.splice(mutation.index, 1);
    operations =
      target.kind === "bindset"
        ? {
            modify: {
              bindsets: {
                [target.bindset]: {
                  [environment]: { keys: { [mutation.key]: nextCommands } },
                },
              },
            },
          }
        : {
            modify: {
              builds: {
                [environment]: { keys: { [mutation.key]: nextCommands } },
              },
            },
          };
  }

  return completePlan(profileId, target, operations, nextCommands, false, {
    topic: "command-deleted",
    payload: {
      key: mutation.key,
      index: mutation.index,
      commands: structuredClone(nextCommands),
    },
  });
}

/**
 * Resolve the shared move/edit target from one profile snapshot.
 *
 * @param {ProfileData} profile
 * @param {string} profileId
 * @param {string} environment
 * @param {string} key
 * @param {string | null | undefined} bindset
 * @returns {CommandMutationPlanFailure | { valid: true, target: CommandMutationTarget, aliasDefinition: AliasDefinition | undefined, currentCommands: StoredCommand[] }}
 */
function resolveSequenceMutationTarget(
  profile,
  profileId,
  environment,
  key,
  bindset,
) {
  const target = resolveTarget(
    profile,
    environment,
    key,
    bindset || null,
    false,
  );
  if (!identifiersAreSafe(profileId, target)) {
    return invalidPlan("unsafe_identifier");
  }

  if (target.kind === "alias") {
    const aliasDefinition = ownAlias(profile, key);
    if (!Array.isArray(aliasDefinition?.commands)) {
      return invalidPlan("invalid_alias");
    }
    return {
      valid: true,
      target,
      aliasDefinition,
      currentCommands: structuredClone(aliasDefinition.commands),
    };
  }

  const currentCommands =
    target.kind === "bindset"
      ? bindsetCommands(profile, target.bindset, environment, key)
      : primaryCommands(profile, environment, key);
  return { valid: true, target, aliasDefinition: undefined, currentCommands };
}

/**
 * @param {CommandMutationTarget} target
 * @param {AliasDefinition | undefined} aliasDefinition
 * @param {StoredCommand[]} nextCommands
 * @returns {ProfileOperations}
 */
function sequenceModificationOperations(target, aliasDefinition, nextCommands) {
  if (target.kind === "alias") {
    const alias = /** @type {AliasDefinition} */ (aliasDefinition);
    return {
      modify: {
        aliases: {
          [target.key]: { ...alias, commands: nextCommands },
        },
      },
    };
  }
  if (target.kind === "bindset") {
    return {
      modify: {
        bindsets: {
          [target.bindset]: {
            [target.environment]: {
              keys: { [target.key]: nextCommands },
            },
          },
        },
      },
    };
  }
  return {
    modify: {
      builds: {
        [target.environment]: { keys: { [target.key]: nextCommands } },
      },
    },
  };
}

/**
 * @param {ProfileData} profile
 * @param {string} profileId
 * @param {string} environment
 * @param {Extract<CommandMutation, { type: 'move' }>} mutation
 * @returns {CommandMutationPlan}
 */
function planMove(profile, profileId, environment, mutation) {
  const resolution = resolveSequenceMutationTarget(
    profile,
    profileId,
    environment,
    mutation.key,
    mutation.bindset || null,
  );
  if (!resolution.valid) return resolution;
  const { target, aliasDefinition, currentCommands } = resolution;
  if (
    mutation.fromIndex < 0 ||
    mutation.fromIndex >= currentCommands.length ||
    mutation.toIndex < 0 ||
    mutation.toIndex >= currentCommands.length
  ) {
    return invalidPlan("invalid_index");
  }

  const nextCommands = [...currentCommands];
  const [moved] = nextCommands.splice(mutation.fromIndex, 1);
  nextCommands.splice(mutation.toIndex, 0, moved);
  const operations = sequenceModificationOperations(
    target,
    aliasDefinition,
    nextCommands,
  );

  return completePlan(
    profileId,
    target,
    operations,
    nextCommands,
    mutation.fromIndex === mutation.toIndex,
    {
      topic: "command-moved",
      payload: {
        key: mutation.key,
        fromIndex: mutation.fromIndex,
        toIndex: mutation.toIndex,
        commands: structuredClone(nextCommands),
      },
    },
  );
}

/**
 * @param {ProfileData} profile
 * @param {Extract<CommandMutation, { type: 'edit' }>} mutation
 * @param {(command: StoredCommand) => string} normalizeCommand
 * @param {CommandMutationOwner} owner
 * @returns {CommandMutationPlan}
 */
function planEdit(profile, mutation, normalizeCommand, owner) {
  if (!mutation.key) return invalidPlan("missing_key");
  if (mutation.index === undefined) return invalidPlan("invalid_index");
  if (!mutation.updatedCommand) return invalidPlan("missing_command");
  const resolution = resolveSequenceMutationTarget(
    profile,
    owner.profileId,
    owner.environment,
    mutation.key,
    mutation.bindset || null,
  );
  if (!resolution.valid) return resolution;
  const { target, aliasDefinition, currentCommands } = resolution;
  if (
    mutation.target !== undefined &&
    !commandEditTargetMatches(mutation.target, {
      ...owner,
      name: target.key,
      bindset: target.bindset,
      index: mutation.index,
      originalEntry: currentCommands[mutation.index],
    })
  )
    return invalidPlan("stale_edit_target");
  if (mutation.index < 0 || mutation.index >= currentCommands.length) {
    return invalidPlan("invalid_index");
  }

  const nextCommands = [...currentCommands];
  const normalizedCommand = normalizeCommand(mutation.updatedCommand);
  const noOp =
    typeof nextCommands[mutation.index] === "string" &&
    nextCommands[mutation.index] === normalizedCommand;
  nextCommands[mutation.index] = normalizedCommand;
  const operations = sequenceModificationOperations(
    target,
    aliasDefinition,
    nextCommands,
  );

  return completePlan(owner.profileId, target, operations, nextCommands, noOp, {
    topic: "command-edited",
    payload: {
      key: mutation.key,
      index: mutation.index,
      updatedCommand: mutation.updatedCommand,
      commands: structuredClone(nextCommands),
    },
  });
}

/**
 * Construct one complete command mutation from a single accepted profile
 * snapshot. This module performs no EventBus, persistence, lifecycle, DOM,
 * localStorage, parser, optimizer, or application-global work.
 *
 * @param {{
 *   profile: ProfileData | null,
 *   profileId: string | null,
 *   environment: string,
 *   authorityEpoch?: number | null,
 *   revision?: number | null,
 *   mutation: CommandMutation,
 *   normalizeCommand: (command: StoredCommand) => string,
 *   normalizeCommands: (commands: StoredCommand[]) => string[],
 * } | unknown} options
 * @returns {CommandMutationPlan}
 */
export function planCommandMutation(options) {
  if (!isDataRecord(options)) return invalidPlan("invalid_options");
  const {
    profile,
    profileId,
    environment,
    authorityEpoch,
    revision,
    mutation,
    normalizeCommand,
    normalizeCommands,
  } = options;
  if (!isDataRecord(profile)) return invalidPlan("invalid_profile");
  if (typeof profileId !== "string" || !profileId) {
    return invalidPlan("missing_profile_id");
  }
  if (typeof environment !== "string" || !environment) {
    return invalidPlan("invalid_environment");
  }
  if (!isDataRecord(mutation) || typeof mutation.type !== "string") {
    return invalidPlan("invalid_mutation");
  }
  if (typeof mutation.key !== "string" || !mutation.key) {
    return invalidPlan("missing_key");
  }
  if (
    typeof normalizeCommand !== "function" ||
    typeof normalizeCommands !== "function"
  ) {
    return invalidPlan("invalid_options");
  }
  const normalizeOne = /** @type {(command: StoredCommand) => string} */ (
    normalizeCommand
  );
  const normalizeMany = /** @type {(commands: StoredCommand[]) => string[]} */ (
    normalizeCommands
  );
  if (
    mutation.bindset !== undefined &&
    mutation.bindset !== null &&
    typeof mutation.bindset !== "string"
  ) {
    return invalidPlan("invalid_bindset");
  }

  if (mutation.type === "add") {
    return planAdd(
      profile,
      profileId,
      environment,
      mutation,
      normalizeOne,
      normalizeMany,
    );
  }
  if (mutation.type === "delete") {
    return planDelete(profile, profileId, environment, mutation);
  }
  if (mutation.type === "move") {
    return planMove(profile, profileId, environment, mutation);
  }
  if (mutation.type === "edit") {
    return planEdit(profile, mutation, normalizeOne, {
      profileId,
      environment,
      authorityEpoch,
      revision,
    });
  }
  return invalidPlan("invalid_mutation");
}
