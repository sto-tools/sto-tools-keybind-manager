/** @typedef {import('./serviceTypes.js').ProfileData} ProfileData */
/** @typedef {import('./serviceTypes.js').ProfileOperations} ProfileOperations */

const dangerousKeys = new Set(["__proto__", "prototype", "constructor"]);
const unsafeProfileOperationKey = "unsafe_profile_operation_key";

/** @param {object} value @param {PropertyKey} key */
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

/**
 * Define a dynamic own property without consulting an inherited setter.
 *
 * @param {Record<string, any>} target
 * @param {string} key
 * @param {any} value
 * @returns {any}
 */
function setOwn(target, key, value) {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    configurable: true,
    writable: true,
  });
  return value;
}

/**
 * @param {Record<string, any>} target
 * @param {string} key
 * @param {() => Record<string, any>} create
 * @returns {Record<string, any>}
 */
function ensureOwnRecord(target, key, create) {
  const existing = hasOwn(target, key) ? target[key] : null;
  if (existing && typeof existing === "object" && !Array.isArray(existing)) {
    return existing;
  }
  return setOwn(target, key, create());
}

/**
 * @param {unknown} key
 * @param {string} path
 * @returns {void}
 */
export function assertSafeProfileIdentifier(key, path) {
  if (typeof key === "string" && dangerousKeys.has(key)) {
    const error = new TypeError(unsafeProfileOperationKey);
    Object.defineProperty(error, "cause", {
      value: { key, path },
      enumerable: false,
    });
    throw error;
  }
}

/**
 * Reject dangerous own keys at every depth without confusing inherited
 * Object.prototype members with payload data.
 *
 * @param {unknown} value
 * @param {string} path
 * @param {WeakSet<object>} [seen]
 * @returns {void}
 */
function assertNoDangerousOwnKeys(value, path, seen = new WeakSet()) {
  if (value === null || typeof value !== "object") return;
  if (seen.has(value)) return;
  seen.add(value);

  for (const key of Reflect.ownKeys(value)) {
    if (typeof key === "string") {
      assertSafeProfileIdentifier(key, path);
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor && "value" in descriptor) {
      const segment =
        typeof key === "string" ? JSON.stringify(key) : String(key);
      assertNoDangerousOwnKeys(descriptor.value, `${path}[${segment}]`, seen);
    }
  }
}

/**
 * Clone an untrusted operation value once, then validate the detached graph.
 * Getter results materialized by structuredClone are therefore inspected too.
 *
 * @template Value
 * @param {Value} value
 * @param {string} path
 * @returns {Value}
 */
export function cloneValidatedProfileOperationValue(value, path) {
  const detached = structuredClone(value);
  assertNoDangerousOwnKeys(detached, path);
  return detached;
}

/**
 * @param {unknown[] | undefined} values
 * @param {string} path
 * @returns {void}
 */
function assertSafeIdentifierList(values, path) {
  if (!Array.isArray(values)) return;
  values.forEach((value, index) =>
    assertSafeProfileIdentifier(value, `${path}[${index}]`),
  );
}

/**
 * Validate dangerous object keys plus string values that later become dynamic
 * map indexes (delete lists, environment, and selection identifiers).
 *
 * @param {ProfileOperations} operations
 * @returns {void}
 */
export function assertSafeProfileOperations(operations) {
  assertNoDangerousOwnKeys(operations, "profile operations");
  assertSafeIdentifierList(operations.delete?.aliases, "delete.aliases");
  assertSafeIdentifierList(operations.delete?.bindsets, "delete.bindsets");
  assertSafeIdentifierList(
    operations.delete?.bindsetMetadata,
    "delete.bindsetMetadata",
  );
  for (const [environment, environmentData] of Object.entries(
    operations.delete?.builds || {},
  )) {
    assertSafeProfileIdentifier(environment, "delete.builds");
    assertSafeIdentifierList(
      environmentData.keys,
      `delete.builds[${JSON.stringify(environment)}].keys`,
    );
  }
  assertSafeProfileIdentifier(
    operations.properties?.currentEnvironment,
    "properties.currentEnvironment",
  );
  for (const [selection, identifier] of Object.entries(
    operations.properties?.selections || {},
  )) {
    assertSafeProfileIdentifier(
      identifier,
      `properties.selections[${JSON.stringify(selection)}]`,
    );
  }
}

/**
 * Apply one explicit profile-operation patch without mutating or retaining
 * references to either input. An optional complete replacement establishes the
 * base; deletions then run before additions and modifications so a caller can
 * replace an item in one logical operation.
 *
 * @param {ProfileData} currentProfile
 * @param {ProfileOperations} operations
 * @returns {ProfileData}
 */
export function applyProfileOperations(currentProfile, operations) {
  const detachedOperations = cloneValidatedProfileOperationValue(
    operations,
    "profile operations",
  );
  assertSafeProfileOperations(detachedOperations);
  return applyDetachedProfileOperations(currentProfile, detachedOperations);
}

/**
 * @param {ProfileData} currentProfile
 * @param {ProfileOperations} operations
 * @returns {ProfileData}
 */
function applyDetachedProfileOperations(currentProfile, operations) {
  const result = structuredClone(operations.replacement ?? currentProfile);

  if (operations.delete) {
    if (operations.delete.aliases) {
      operations.delete.aliases.forEach((aliasName) => {
        if (result.aliases) delete result.aliases[aliasName];
      });
    }

    if (operations.delete.builds) {
      for (const [environment, environmentData] of Object.entries(
        operations.delete.builds,
      )) {
        const build =
          result.builds && hasOwn(result.builds, environment)
            ? result.builds[environment]
            : null;
        const keys = build && hasOwn(build, "keys") ? build.keys : null;
        if (keys && environmentData.keys) {
          environmentData.keys.forEach((keyName) => delete keys[keyName]);
        }
      }
    }

    if (Array.isArray(operations.delete.bindsets)) {
      operations.delete.bindsets.forEach((bindsetName) => {
        if (result.bindsets) delete result.bindsets[bindsetName];
      });
    }

    if (Array.isArray(operations.delete.bindsetMetadata)) {
      operations.delete.bindsetMetadata.forEach((bindsetName) => {
        if (result.bindsetMetadata) {
          delete result.bindsetMetadata[bindsetName];
        }
      });
    }
  }

  if (operations.add) {
    if (operations.add.aliases) {
      result.aliases = {
        ...(result.aliases || {}),
        ...operations.add.aliases,
      };
    }

    if (operations.add.builds) {
      result.builds ||= {
        space: { keys: {} },
        ground: { keys: {} },
      };
      for (const [environment, environmentData] of Object.entries(
        operations.add.builds,
      )) {
        const build = ensureOwnRecord(result.builds, environment, () => ({
          keys: {},
        }));
        if (environmentData.keys) {
          const keys = ensureOwnRecord(build, "keys", () => ({}));
          setOwn(build, "keys", {
            ...keys,
            ...environmentData.keys,
          });
        }
      }
    }

    if (operations.add.bindsets) {
      result.bindsets = {
        ...(result.bindsets || {}),
        ...operations.add.bindsets,
      };
    }

    if (operations.add.bindsetMetadata) {
      result.bindsetMetadata = {
        ...(result.bindsetMetadata || {}),
        ...operations.add.bindsetMetadata,
      };
    }
  }

  if (operations.modify) {
    if (operations.modify.aliases) {
      result.aliases ||= {};
      for (const [aliasName, aliasData] of Object.entries(
        operations.modify.aliases,
      )) {
        if (hasOwn(result.aliases, aliasName)) {
          setOwn(result.aliases, aliasName, {
            ...result.aliases[aliasName],
            ...aliasData,
          });
        }
      }
    }

    if (operations.modify.keybindMetadata) {
      result.keybindMetadata ||= {};
      for (const [environment, environmentData] of Object.entries(
        operations.modify.keybindMetadata,
      )) {
        const environmentMetadata = ensureOwnRecord(
          result.keybindMetadata,
          environment,
          () => ({}),
        );
        for (const [keyName, keyData] of Object.entries(environmentData)) {
          if (Object.keys(keyData).length === 0) {
            delete environmentMetadata[keyName];
          } else {
            setOwn(environmentMetadata, keyName, keyData);
          }
        }
      }
    }

    if (operations.modify.aliasMetadata) {
      result.aliasMetadata ||= {};
      for (const [aliasName, aliasData] of Object.entries(
        operations.modify.aliasMetadata,
      )) {
        if (Object.keys(aliasData).length === 0) {
          delete result.aliasMetadata[aliasName];
        } else {
          setOwn(result.aliasMetadata, aliasName, aliasData);
        }
      }
    }

    if (operations.modify.builds) {
      result.builds ||= {
        space: { keys: {} },
        ground: { keys: {} },
      };
      for (const [environment, environmentData] of Object.entries(
        operations.modify.builds,
      )) {
        const build = ensureOwnRecord(result.builds, environment, () => ({
          keys: {},
        }));
        if (environmentData.keys) {
          const keys = ensureOwnRecord(build, "keys", () => ({}));
          for (const [keyName, keyData] of Object.entries(
            environmentData.keys,
          )) {
            if (hasOwn(keys, keyName)) {
              setOwn(keys, keyName, keyData);
            }
          }
        }
      }
    }

    if (operations.modify.bindsets) {
      result.bindsets ||= {};
      for (const [bindsetName, bindsetData] of Object.entries(
        operations.modify.bindsets,
      )) {
        const bindset = ensureOwnRecord(result.bindsets, bindsetName, () => ({
          space: { keys: {} },
          ground: { keys: {} },
        }));

        for (const [environment, environmentData] of Object.entries(
          bindsetData,
        )) {
          const build = ensureOwnRecord(bindset, environment, () => ({
            keys: {},
          }));
          if (!environmentData.keys) continue;

          const keys = ensureOwnRecord(build, "keys", () => ({}));
          for (const [keyName, keyData] of Object.entries(
            environmentData.keys,
          )) {
            if (keyData === null) {
              delete keys[keyName];
            } else {
              setOwn(keys, keyName, keyData);
            }
          }
        }
      }
    }

    if (operations.modify.bindsetMetadata) {
      result.bindsetMetadata ||= {};
      for (const [bindsetName, bindsetData] of Object.entries(
        operations.modify.bindsetMetadata,
      )) {
        const bindsetMetadata = ensureOwnRecord(
          result.bindsetMetadata,
          bindsetName,
          () => ({}),
        );
        for (const [environment, environmentData] of Object.entries(
          bindsetData,
        )) {
          const environmentMetadata = ensureOwnRecord(
            bindsetMetadata,
            environment,
            () => ({}),
          );
          for (const [keyName, keyMetadata] of Object.entries(
            environmentData,
          )) {
            if (Object.keys(keyMetadata).length === 0) {
              delete environmentMetadata[keyName];
            } else {
              const existing = hasOwn(environmentMetadata, keyName)
                ? environmentMetadata[keyName]
                : {};
              setOwn(environmentMetadata, keyName, {
                ...(existing || {}),
                ...keyMetadata,
              });
            }
          }
        }
      }
    }
  }

  if (operations.properties) {
    Object.assign(result, operations.properties);
  }

  return result;
}
