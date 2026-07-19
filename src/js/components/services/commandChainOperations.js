import { hasOwnDataField, isDataRecord } from "./jsonDataBoundary.js";
import {
  assertSafeProfileIdentifier,
  cloneValidatedProfileOperationValue,
} from "./profileOperations.js";

/** @typedef {import('./serviceTypes.js').ProfileData} ProfileData */
/** @typedef {import('../../types/rpc/index.js').RpcRequest<'data:update-profile'>} ProfileUpdateRequest */

/**
 * @typedef {Object} CommandChainClearPlanOptions
 * @property {ProfileData} profile
 * @property {string} profileId
 * @property {string} key
 * @property {string | null | undefined} [bindset]
 * @property {string | null | undefined} [environment]
 */

/**
 * @typedef {Object} CommandChainClearPlanFailure
 * @property {false} valid
 * @property {'invalid_options' | 'invalid_profile' | 'missing_profile_id' | 'missing_key' | 'invalid_environment' | 'invalid_bindset' | 'unsafe_identifier' | 'missing_alias' | 'invalid_alias' | 'invalid_payload'} reason
 * @property {null} updateProfileRequest
 */

/**
 * @typedef {Object} CommandChainClearTarget
 * @property {'primary' | 'alias' | 'bindset'} kind
 * @property {string} environment
 * @property {string} key
 * @property {string | null} bindset
 */

/**
 * @typedef {Object} CommandChainClearPlanSuccess
 * @property {true} valid
 * @property {boolean} noOp Describes the projected data change only. Every valid plan must still be persisted.
 * @property {CommandChainClearTarget} target
 * @property {ProfileUpdateRequest} updateProfileRequest Exact payload for the data:update-profile request.
 */

/** @typedef {CommandChainClearPlanFailure | CommandChainClearPlanSuccess} CommandChainClearPlan */

/**
 * @param {CommandChainClearPlanFailure['reason']} reason
 * @returns {CommandChainClearPlanFailure}
 */
function invalidPlan(reason) {
  return {
    valid: false,
    reason,
    updateProfileRequest: null,
  };
}

/** @param {unknown} value @returns {value is string} */
function isNonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}

/**
 * @param {unknown[]} identifiers
 * @returns {boolean}
 */
function identifiersAreSafe(identifiers) {
  try {
    for (const identifier of identifiers) {
      assertSafeProfileIdentifier(identifier, "command chain clear");
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {unknown} record
 * @param {string} key
 * @returns {unknown}
 */
function ownValue(record, key) {
  return isDataRecord(record) && hasOwnDataField(record, key)
    ? record[key]
    : undefined;
}

/** @param {unknown} commands */
function isEmptyCommandList(commands) {
  return Array.isArray(commands) && commands.length === 0;
}

/**
 * Clone and validate the complete request exactly where it crosses into the
 * DataCoordinator action. This keeps nested alias metadata detached and
 * applies the same reserved-key rules as the coordinator responder.
 *
 * @param {ProfileUpdateRequest} request
 * @returns {ProfileUpdateRequest | null}
 */
function detachRequest(request) {
  try {
    return cloneValidatedProfileOperationValue(
      request,
      "command chain clear update",
    );
  } catch {
    return null;
  }
}

/**
 * Plan one command-chain clear without mutating profile state or creating a
 * second state owner. A valid plan always carries the exact update request the
 * facade must send, even when `noOp` is true; DataCoordinator remains the only
 * component that applies and publishes the update.
 *
 * @param {CommandChainClearPlanOptions | unknown} options
 * @returns {CommandChainClearPlan}
 */
export function planCommandChainClear(options) {
  if (!isDataRecord(options)) return invalidPlan("invalid_options");

  const { profile, profileId, key, bindset, environment } = options;
  if (!isDataRecord(profile)) return invalidPlan("invalid_profile");
  if (!isNonEmptyString(profileId)) return invalidPlan("missing_profile_id");
  if (!isNonEmptyString(key)) return invalidPlan("missing_key");

  const currentEnvironment = environment || "space";
  if (!isNonEmptyString(currentEnvironment)) {
    return invalidPlan("invalid_environment");
  }
  if (
    bindset !== undefined &&
    bindset !== null &&
    typeof bindset !== "string"
  ) {
    return invalidPlan("invalid_bindset");
  }

  const normalizedBindset = bindset || null;
  if (
    !identifiersAreSafe([
      profileId,
      key,
      currentEnvironment,
      ...(normalizedBindset ? [normalizedBindset] : []),
    ])
  ) {
    return invalidPlan("unsafe_identifier");
  }

  /** @type {CommandChainClearTarget} */
  let target;
  /** @type {ProfileUpdateRequest} */
  let updateProfileRequest;
  let noOp;

  if (currentEnvironment === "alias") {
    const alias = ownValue(profile.aliases, key);
    if (alias === undefined) return invalidPlan("missing_alias");
    if (!isDataRecord(alias)) return invalidPlan("invalid_alias");

    let detachedAlias;
    try {
      detachedAlias = cloneValidatedProfileOperationValue(
        alias,
        "command chain clear alias",
      );
    } catch {
      return invalidPlan("invalid_payload");
    }
    noOp = isEmptyCommandList(detachedAlias.commands);
    detachedAlias.commands = [];
    target = {
      kind: "alias",
      environment: currentEnvironment,
      key,
      bindset: null,
    };
    updateProfileRequest = {
      profileId,
      modify: {
        aliases: {
          [key]: detachedAlias,
        },
      },
    };
  } else if (normalizedBindset !== "Primary Bindset" && normalizedBindset) {
    const bindsets = profile.bindsets;
    if (bindsets !== undefined && !isDataRecord(bindsets)) {
      return invalidPlan("invalid_profile");
    }
    const bindsetData = ownValue(bindsets, normalizedBindset);
    if (bindsetData !== undefined && !isDataRecord(bindsetData)) {
      return invalidPlan("invalid_profile");
    }
    const environmentData = ownValue(bindsetData, currentEnvironment);
    if (environmentData !== undefined && !isDataRecord(environmentData)) {
      return invalidPlan("invalid_profile");
    }
    const keys = ownValue(environmentData, "keys");
    if (keys !== undefined && !isDataRecord(keys)) {
      return invalidPlan("invalid_profile");
    }

    noOp = isEmptyCommandList(ownValue(keys, key));
    target = {
      kind: "bindset",
      environment: currentEnvironment,
      key,
      bindset: normalizedBindset,
    };
    updateProfileRequest = {
      profileId,
      modify: {
        bindsets: {
          [normalizedBindset]: {
            [currentEnvironment]: {
              keys: {
                [key]: [],
              },
            },
          },
        },
      },
    };
  } else {
    const builds = profile.builds;
    if (builds !== undefined && !isDataRecord(builds)) {
      return invalidPlan("invalid_profile");
    }
    const build = ownValue(builds, currentEnvironment);
    if (build !== undefined && !isDataRecord(build)) {
      return invalidPlan("invalid_profile");
    }
    const keys = ownValue(build, "keys");
    if (keys !== undefined && !isDataRecord(keys)) {
      return invalidPlan("invalid_profile");
    }

    const currentCommands = ownValue(keys, key);
    noOp = currentCommands === undefined || isEmptyCommandList(currentCommands);
    target = {
      kind: "primary",
      environment: currentEnvironment,
      key,
      bindset: null,
    };
    updateProfileRequest = {
      profileId,
      modify: {
        builds: {
          [currentEnvironment]: {
            keys: {
              [key]: [],
            },
          },
        },
      },
    };
  }

  const detachedRequest = detachRequest(updateProfileRequest);
  if (!detachedRequest) return invalidPlan("invalid_payload");

  return {
    valid: true,
    noOp,
    target,
    updateProfileRequest: detachedRequest,
  };
}

/** @typedef {import('./serviceTypes.js').BindsetKeyMetadata & Record<string, unknown>} StabilizationMetadata */

/**
 * @typedef {Object} CommandStabilizationPlanOptions
 * @property {ProfileData} profile
 * @property {string} profileId
 * @property {string} name
 * @property {string} environment
 * @property {boolean} stabilize
 * @property {string | null | undefined} [bindset]
 */

/**
 * @typedef {Object} CommandStabilizationPlanFailure
 * @property {false} valid
 * @property {'invalid_options' | 'invalid_profile' | 'missing_profile_id' | 'missing_name' | 'invalid_environment' | 'invalid_stabilize' | 'invalid_bindset' | 'unsafe_identifier' | 'invalid_payload'} reason
 * @property {null} updateProfileRequest
 */

/**
 * @typedef {Object} CommandStabilizationTarget
 * @property {'primary' | 'alias' | 'bindset'} kind
 * @property {string} environment
 * @property {string} name
 * @property {string | null} bindset
 */

/**
 * @typedef {Object} CommandStabilizationPlanSuccess
 * @property {true} valid
 * @property {boolean} noOp Describes the projected metadata change only. Valid no-op plans must still be persisted.
 * @property {CommandStabilizationTarget} target
 * @property {ProfileUpdateRequest} updateProfileRequest
 */

/** @typedef {CommandStabilizationPlanFailure | CommandStabilizationPlanSuccess} CommandStabilizationPlan */

/** @param {CommandStabilizationPlanFailure['reason']} reason */
function invalidStabilizationPlan(reason) {
  return /** @type {CommandStabilizationPlanFailure} */ ({
    valid: false,
    reason,
    updateProfileRequest: null,
  });
}

/**
 * Read one optional nested data record without treating Object.prototype
 * members as profile data.
 *
 * @param {unknown} record
 * @param {string} key
 * @returns {{ valid: true, value: Record<string, unknown> | null } | { valid: false, value: null }}
 */
function readOptionalOwnRecord(record, key) {
  if (record === undefined || record === null) {
    return { valid: true, value: null };
  }
  if (!isDataRecord(record)) return { valid: false, value: null };

  const value = ownValue(record, key);
  if (value === undefined || value === null) {
    return { valid: true, value: null };
  }
  return isDataRecord(value)
    ? { valid: true, value }
    : { valid: false, value: null };
}

/** @param {StabilizationMetadata} metadata @param {boolean} stabilize */
function metadataAlreadyStabilized(metadata, stabilize) {
  return (
    hasOwnDataField(metadata, "stabilizeExecutionOrder") &&
    metadata.stabilizeExecutionOrder === stabilize
  );
}

/**
 * Plan one stabilization metadata write without touching storage, an event
 * bus, DOM state, globals, or the accepted profile snapshot. Alias targeting
 * takes precedence over bindsets, matching the historical facade behavior.
 *
 * @param {CommandStabilizationPlanOptions | unknown} options
 * @returns {CommandStabilizationPlan}
 */
export function planCommandStabilization(options) {
  if (!isDataRecord(options)) {
    return invalidStabilizationPlan("invalid_options");
  }

  const { profile, profileId, name, environment, stabilize, bindset } = options;
  if (!isDataRecord(profile)) {
    return invalidStabilizationPlan("invalid_profile");
  }
  if (!isNonEmptyString(profileId)) {
    return invalidStabilizationPlan("missing_profile_id");
  }
  if (!isNonEmptyString(name)) {
    return invalidStabilizationPlan("missing_name");
  }
  if (!isNonEmptyString(environment)) {
    return invalidStabilizationPlan("invalid_environment");
  }
  if (typeof stabilize !== "boolean") {
    return invalidStabilizationPlan("invalid_stabilize");
  }
  if (
    bindset !== undefined &&
    bindset !== null &&
    typeof bindset !== "string"
  ) {
    return invalidStabilizationPlan("invalid_bindset");
  }

  const normalizedBindset = bindset || null;
  if (
    !identifiersAreSafe([
      profileId,
      name,
      environment,
      ...(normalizedBindset ? [normalizedBindset] : []),
    ])
  ) {
    return invalidStabilizationPlan("unsafe_identifier");
  }

  let isAlias = environment === "alias";
  if (!isAlias && profile.aliases !== undefined && profile.aliases !== null) {
    if (!isDataRecord(profile.aliases)) {
      return invalidStabilizationPlan("invalid_profile");
    }
    isAlias = Boolean(ownValue(profile.aliases, name));
  }

  /** @type {CommandStabilizationTarget} */
  let target;
  /** @type {StabilizationMetadata} */
  let currentMetadata;
  /** @type {ProfileUpdateRequest} */
  let updateProfileRequest;

  if (isAlias) {
    const metadata = readOptionalOwnRecord(profile.aliasMetadata, name);
    if (!metadata.valid) return invalidStabilizationPlan("invalid_profile");
    currentMetadata = /** @type {StabilizationMetadata} */ (
      metadata.value || {}
    );
    target = { kind: "alias", environment, name, bindset: null };
    updateProfileRequest = {
      profileId,
      modify: {
        aliasMetadata: {
          [name]: { ...currentMetadata, stabilizeExecutionOrder: stabilize },
        },
      },
    };
  } else if (!normalizedBindset || normalizedBindset === "Primary Bindset") {
    const environmentMetadata = readOptionalOwnRecord(
      profile.keybindMetadata,
      environment,
    );
    if (!environmentMetadata.valid) {
      return invalidStabilizationPlan("invalid_profile");
    }
    const metadata = readOptionalOwnRecord(environmentMetadata.value, name);
    if (!metadata.valid) return invalidStabilizationPlan("invalid_profile");
    currentMetadata = /** @type {StabilizationMetadata} */ (
      metadata.value || {}
    );
    target = { kind: "primary", environment, name, bindset: null };
    updateProfileRequest = {
      profileId,
      modify: {
        keybindMetadata: {
          [environment]: {
            [name]: { ...currentMetadata, stabilizeExecutionOrder: stabilize },
          },
        },
      },
    };
  } else {
    const bindsetMetadata = readOptionalOwnRecord(
      profile.bindsetMetadata,
      normalizedBindset,
    );
    if (!bindsetMetadata.valid) {
      return invalidStabilizationPlan("invalid_profile");
    }
    const environmentMetadata = readOptionalOwnRecord(
      bindsetMetadata.value,
      environment,
    );
    if (!environmentMetadata.valid) {
      return invalidStabilizationPlan("invalid_profile");
    }
    const metadata = readOptionalOwnRecord(environmentMetadata.value, name);
    if (!metadata.valid) return invalidStabilizationPlan("invalid_profile");
    currentMetadata = /** @type {StabilizationMetadata} */ (
      metadata.value || {}
    );
    target = {
      kind: "bindset",
      environment,
      name,
      bindset: normalizedBindset,
    };
    updateProfileRequest = {
      profileId,
      modify: {
        bindsetMetadata: {
          [normalizedBindset]: {
            [environment]: {
              [name]: {
                ...currentMetadata,
                stabilizeExecutionOrder: stabilize,
              },
            },
          },
        },
      },
    };
  }

  const detachedRequest = detachRequest(updateProfileRequest);
  if (!detachedRequest) return invalidStabilizationPlan("invalid_payload");

  return {
    valid: true,
    noOp: metadataAlreadyStabilized(currentMetadata, stabilize),
    target,
    updateProfileRequest: detachedRequest,
  };
}
