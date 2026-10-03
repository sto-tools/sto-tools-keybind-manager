import { materializeStorageSchemaMigrationReceipt } from "./storageSchemaMigrationReceipt.js";

const NativePromise = Promise;
const nativePromisePrototype = NativePromise.prototype;
const nativeSpecies = Object.getOwnPropertyDescriptor(
  NativePromise,
  Symbol.species,
)?.get;

/** Pure descriptor inspection; no callbacks, thenables, or species are invoked.
 * @param {unknown} result @returns {'native' | 'skip' | 'sync'} */
export function storagePromiseObservationMode(result) {
  if (typeof result !== "object" || result === null) return "sync";
  let prototype = Object.getPrototypeOf(result);
  if (prototype !== nativePromisePrototype) {
    for (let depth = 0; prototype && depth < 4; depth++) {
      if (prototype === nativePromisePrototype) return "skip";
      prototype = Object.getPrototypeOf(prototype);
    }
    return "sync";
  }
  const ownConstructor = Object.getOwnPropertyDescriptor(result, "constructor");
  const inheritedConstructor = Object.getOwnPropertyDescriptor(
    nativePromisePrototype,
    "constructor",
  );
  const species = Object.getOwnPropertyDescriptor(
    NativePromise,
    Symbol.species,
  );
  if (
    (ownConstructor &&
      (!("value" in ownConstructor) ||
        ownConstructor.value !== NativePromise)) ||
    inheritedConstructor?.value !== NativePromise ||
    species?.get !== nativeSpecies ||
    !nativeSpecies ||
    !species ||
    "value" in species ||
    species.set !== undefined
  )
    return "skip";
  return "native";
}

/** Static identities, never discovered through repositories or service lookup. */
export const STORAGE_DIAGNOSTIC_REGISTRATIONS = Object.freeze(
  /** @type {const} */ ([
    {
      domain: "project",
      owner: "DataCoordinator",
      port: "ProjectRepositoryPort",
      adapter: "LocalStorageProjectRepository",
    },
    {
      domain: "settings",
      owner: "PreferencesService",
      port: "SettingsRepositoryPort",
      adapter: "LocalStorageSettingsRepository",
    },
    {
      domain: "presentation",
      owner: "CommandPresentationService",
      port: "CommandPresentationPersistencePort",
      adapter: "LocalStorageCommandPresentationPersistence",
    },
    {
      domain: "key-browser",
      owner: "KeyBrowserService",
      port: "KeyBrowserPersistencePort",
      adapter: "LocalStorageKeyBrowserPersistence",
    },
    {
      domain: "welcome",
      owner: "StartupWelcomeTransaction",
      port: "VisitedStatePort",
      adapter: "LocalStorageVisitedStatePersistence",
    },
    {
      domain: "diagnostic",
      owner: "DevMonitor",
      port: "DevelopmentFlagPort",
      adapter: "LocalStorageDevelopmentFlagPersistence",
    },
    {
      domain: "sync-capability",
      owner: "FileSystemService",
      port: "SyncDirectoryPersistencePort",
      adapter: "FileSystemService",
    },
  ]).map((row) => Object.freeze(row)),
);

export const DIAGNOSTIC_STATUSES = Object.freeze([
  "current",
  "repair_required",
  "read_failed",
  "committed",
  "rejected",
  "write_failed",
  "verification_failed",
  "sentinel_failed",
  "reset",
  "reset_failed",
  "cleared",
  "clear_failed",
  "acknowledged",
  "skipped",
  "failed",
  "complete",
  "pending",
  "not_attempted",
  "not_requested",
  "verified",
  "indeterminate",
  "preparation_failed",
  "changed",
  "succeeded",
  "invalid_observation",
]);
export const DIAGNOSTIC_ERRORS = Object.freeze([
  "invalid_json",
  "invalid_data",
  "serialization_failed",
  "storage_read_failed",
  "storage_write_failed",
  "backup_write_failed",
  "verification_failed",
  "operation_cancelled",
  "reset_sentinel_consumption_failed",
  "reset_sentinel_changed",
  "preferences_activation_failed",
  "invalid_project_file",
  "invalid_project_activation",
  "sync_folder_load_failed",
  "sync_folder_transition_incomplete",
  "sync_folder_capability_invalid",
]);
export const DIAGNOSTIC_REASONS = Object.freeze([
  "missing",
  "invalid_json",
  "invalid_data",
  "legacy",
  "repaired",
  "reset_pending",
  "read_failed",
  "value_mismatch",
  "already_current",
]);
export const DIAGNOSTIC_STAGE_NAMES = Object.freeze(
  /** @type {const} */ ([
    "backup",
    "rootWrite",
    "verification",
    "resetSentinel",
    "rootRemoval",
    "backupRemoval",
    "sentinelWrite",
    "write",
    "removal",
    "rootClear",
    "backupClear",
    "settingsClear",
    "settingsDefaults",
    "dataOwnerAdoption",
    "preferencesOwnerAdoption",
    "validation",
    "settings",
    "project",
    "preferencesActivation",
    "dataActivation",
  ]),
);
const operations = Object.freeze({
  project: ["load", "commit", "reset", "restore", "activation"],
  settings: ["load", "replace", "clear", "reset", "restore", "activation"],
  presentation: ["load", "replaceCategory", "replaceGroup"],
  "key-browser": [
    "load",
    "replaceMode",
    "replaceCategory",
    "replaceBindset",
    "isCategoryCollapsed",
    "isBindsetCollapsed",
  ],
  welcome: ["loadExact", "markVisited", "compensate"],
  diagnostic: ["isEnabled"],
  "sync-capability": [
    "getSyncDirectoryState",
    "beginSyncDirectoryTransition",
    "completeSyncDirectoryTransition",
    "restoreSyncDirectoryState",
    "folder-selection",
  ],
});
const layouts = Object.freeze({
  project: [
    "not-observed",
    "settings-free",
    "repair-required",
    "missing",
    "invalid",
  ],
  settings: [
    "not-observed",
    "standalone-settings",
    "repair-required",
    "missing",
    "invalid",
  ],
  presentation: ["not-observed", "scalar-namespace"],
  "key-browser": ["not-observed", "scalar-namespace"],
  welcome: ["not-observed", "scalar-namespace", "missing"],
  diagnostic: ["not-observed", "scalar-namespace"],
  "sync-capability": [
    "not-observed",
    "missing",
    "capability-present",
    "transition-pending",
    "transition-clean",
  ],
});
const statuses = new Set(DIAGNOSTIC_STATUSES);
const reasons = new Set(DIAGNOSTIC_REASONS);

/** @param {unknown} input @param {readonly string[]} keys @returns {Record<string, unknown> | null} */
function ownRecord(input, keys) {
  if (typeof input !== "object" || input === null || Array.isArray(input))
    return null;
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) return null;
  const actual = Reflect.ownKeys(input);
  if (
    actual.length !== keys.length ||
    actual.some((key) => typeof key !== "string" || !keys.includes(key))
  )
    return null;
  /** @type {Record<string, unknown>} */
  const output = {};
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (!descriptor?.enumerable || !("value" in descriptor)) return null;
    output[key] = descriptor.value;
  }
  return output;
}

/** @param {unknown} input @param {number} max @returns {unknown[] | null} */
function ownArray(input, max) {
  if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype)
    return null;
  const length = Object.getOwnPropertyDescriptor(input, "length")?.value;
  if (!Number.isInteger(length) || length < 0 || length > max) return null;
  if (Reflect.ownKeys(input).length !== length + 1) return null;
  const values = [];
  for (let index = 0; index < length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(input, String(index));
    if (!descriptor?.enumerable || !("value" in descriptor)) return null;
    values.push(descriptor.value);
  }
  return values;
}

/** @param {unknown} value @param {ReadonlySet<string>} allowed @param {boolean} [nullable] */
function code(value, allowed, nullable = false) {
  return (
    (nullable && value === null) ||
    (typeof value === "string" && allowed.has(value))
  );
}
/** @param {unknown} value */
function committed(value) {
  return (
    value === null ||
    value === true ||
    value === false ||
    value === "indeterminate"
  );
}
const categories = new Set(["quota", "security", "unknown"]);
const safeErrors = new Set([...DIAGNOSTIC_ERRORS, "unknown"]);

/** Strictly re-materialize provider output before exposing it on DevMonitor.
 * No user getters, toJSON, service handles, or arbitrary provider fields survive.
 * @param {unknown} input
 * @returns {import('../../types/storage-diagnostics.js').StorageDiagnosticSnapshot | null} */
export function materializeStorageDiagnosticSnapshot(input) {
  try {
    const root = ownRecord(input, ["domains"]);
    const rows =
      root && ownArray(root.domains, STORAGE_DIAGNOSTIC_REGISTRATIONS.length);
    if (!rows || rows.length !== STORAGE_DIAGNOSTIC_REGISTRATIONS.length)
      return null;
    const result = [];
    for (let index = 0; index < rows.length; index++) {
      const registration = STORAGE_DIAGNOSTIC_REGISTRATIONS[index];
      if (!registration) return null;
      const row = ownRecord(rows[index], [
        "domain",
        "owner",
        "port",
        "adapter",
        "portRegistered",
        "structuralLayout",
        "lastOperation",
        "lastMigration",
      ]);
      if (
        !row ||
        row.domain !== registration.domain ||
        row.owner !== registration.owner ||
        row.port !== registration.port ||
        row.adapter !== registration.adapter ||
        typeof row.portRegistered !== "boolean" ||
        typeof row.structuralLayout !== "string" ||
        !layouts[registration.domain].includes(row.structuralLayout)
      )
        return null;
      let lastOperation = null;
      if (row.lastOperation !== null) {
        if (!row.portRegistered) return null;
        const operation = ownRecord(row.lastOperation, [
          "operation",
          "status",
          "error",
          "category",
          "committed",
          "reason",
          "stages",
        ]);
        if (
          !operation ||
          typeof operation.operation !== "string" ||
          !operations[registration.domain].includes(operation.operation) ||
          !code(operation.status, statuses) ||
          !code(operation.error, safeErrors, true) ||
          !code(operation.category, categories, true) ||
          !committed(operation.committed) ||
          !code(operation.reason, reasons, true)
        )
          return null;
        const details = ownArray(
          operation.stages,
          DIAGNOSTIC_STAGE_NAMES.length,
        );
        if (!details) return null;
        const stages = [];
        const seen = new Set();
        for (const detail of details) {
          const stage = ownRecord(detail, [
            "stage",
            "status",
            "committed",
            "error",
            "category",
          ]);
          if (
            !stage ||
            typeof stage.stage !== "string" ||
            !DIAGNOSTIC_STAGE_NAMES.some((name) => name === stage.stage) ||
            seen.has(stage.stage) ||
            !code(stage.status, statuses) ||
            !committed(stage.committed) ||
            !code(stage.error, safeErrors, true) ||
            !code(stage.category, categories, true)
          )
            return null;
          seen.add(stage.stage);
          stages.push(Object.freeze(stage));
        }
        lastOperation = Object.freeze({
          ...operation,
          stages: Object.freeze(stages),
        });
      }
      const lastMigration =
        row.lastMigration === null
          ? null
          : materializeStorageSchemaMigrationReceipt(row.lastMigration);
      if (
        row.lastMigration !== null &&
        (!lastMigration ||
          (registration.domain !== "project" &&
            registration.domain !== "settings"))
      )
        return null;
      result.push(
        Object.freeze({
          ...registration,
          portRegistered: row.portRegistered,
          structuralLayout: row.structuralLayout,
          lastOperation,
          lastMigration: lastMigration ? Object.freeze(lastMigration) : null,
        }),
      );
    }
    return /** @type {import('../../types/storage-diagnostics.js').StorageDiagnosticSnapshot} */ (
      Object.freeze({ domains: Object.freeze(result) })
    );
  } catch {
    return null;
  }
}
