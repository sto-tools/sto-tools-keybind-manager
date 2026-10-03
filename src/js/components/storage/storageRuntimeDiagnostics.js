import { materializeStorageSchemaMigrationReceipt } from "./storageSchemaMigrationReceipt.js";
import {
  STORAGE_DIAGNOSTIC_REGISTRATIONS as registrations,
  DIAGNOSTIC_STATUSES,
  DIAGNOSTIC_ERRORS,
  DIAGNOSTIC_REASONS,
  DIAGNOSTIC_STAGE_NAMES as stageNames,
  storagePromiseObservationMode as promiseObservationMode,
} from "./storageDiagnosticSnapshot.js";
const statuses = new Set(DIAGNOSTIC_STATUSES);
const errors = new Set(DIAGNOSTIC_ERRORS);
const reasons = new Set(DIAGNOSTIC_REASONS);
const NativePromise = Promise;
const nativeThen = NativePromise.prototype.then;

/** @typedef {import('../../types/storage-diagnostics.js').StorageDiagnosticDomain} Domain */
/** @typedef {import('../../types/storage-diagnostics.js').StorageDiagnosticOperation} Operation */
/** @typedef {import('../../types/storage-diagnostics.js').StorageDiagnosticObservation} Observation */
/** @typedef {import('../../types/storage-diagnostics.js').StorageDiagnosticLayout} Layout */

/** Read only one allowlisted own data field, never user contents or accessors.
 * @param {unknown} value @param {string} key @param {boolean} [nonEnumerable] @returns {unknown} */
function field(value, key, nonEnumerable = false) {
  try {
    if (typeof value !== "object" || value === null) return undefined;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor &&
      (descriptor.enumerable || nonEnumerable) &&
      "value" in descriptor
      ? descriptor.value
      : undefined;
  } catch {
    return undefined;
  }
}

/** @param {unknown} value @returns {import('../../types/storage-diagnostics.js').StorageDiagnosticError | null} */
function errorCode(value) {
  if (value === undefined || value === null) return null;
  return typeof value === "string" && errors.has(value)
    ? /** @type {import('../../types/storage-diagnostics.js').StorageDiagnosticError} */ (
        value
      )
    : "unknown";
}

/** @param {unknown} value @returns {'quota' | 'security' | 'unknown' | null} */
function category(value) {
  if (value === undefined || value === null) return null;
  return value === "quota" || value === "security" ? value : "unknown";
}

/** No overridden error accessors are evaluated, including DOMException.name.
 * @param {unknown} error @returns {'quota' | 'security' | 'unknown'} */
function thrownCategory(error) {
  let name = field(error, "name", true);
  if (name === undefined && typeof DOMException !== "undefined") {
    try {
      name = Object.getOwnPropertyDescriptor(
        DOMException.prototype,
        "name",
      )?.get?.call(error);
    } catch {
      /* Not a DOMException; no exception text is retained. */
    }
  }
  return name === "QuotaExceededError"
    ? "quota"
    : name === "SecurityError"
      ? "security"
      : "unknown";
}

/** @param {unknown} status @returns {import('../../types/storage-diagnostics.js').StorageDiagnosticStatus} */
function statusCode(status) {
  return typeof status === "string" && statuses.has(status)
    ? /** @type {import('../../types/storage-diagnostics.js').StorageDiagnosticStatus} */ (
        status
      )
    : "invalid_observation";
}

/** @param {unknown} value @returns {boolean | 'indeterminate' | null} */
function durability(value) {
  return value === true || value === false || value === "indeterminate"
    ? value
    : null;
}

/** @param {Operation} operation @param {unknown} result @returns {Observation} */
function projectResult(operation, result) {
  const receipt = field(result, "receipt");
  const stages = [];
  for (const stage of stageNames) {
    const detail = field(receipt, stage) ?? field(result, stage);
    if (detail === undefined) continue;
    const status = statusCode(field(detail, "status"));
    stages.push({
      stage,
      status,
      committed:
        durability(field(detail, "committed")) ??
        (status === "indeterminate"
          ? "indeterminate"
          : status === "acknowledged"
            ? true
            : null),
      error: errorCode(field(detail, "error")),
      category: category(field(detail, "category")),
    });
  }
  const success = field(result, "success");
  const status = field(result, "status");
  const reason = field(result, "reason");
  const issue = stages.find((stage) => stage.error !== null);
  const root = stages.find(
    (stage) => stage.stage === "rootWrite" || stage.stage === "write",
  );
  return {
    operation,
    status:
      status !== undefined
        ? statusCode(status)
        : success === true
          ? "succeeded"
          : success === false
            ? "failed"
            : "invalid_observation",
    error: errorCode(field(result, "error")) ?? issue?.error ?? null,
    category: category(field(result, "category")) ?? issue?.category ?? null,
    committed:
      durability(field(result, "durable")) ??
      root?.committed ??
      (status === "committed" || status === "reset" || status === "cleared"
        ? true
        : null),
    reason:
      typeof reason === "string" && reasons.has(reason)
        ? /** @type {import('../../types/storage-diagnostics.js').StorageDiagnosticReason} */ (
            reason
          )
        : null,
    stages,
  };
}

/** Composition-only recorder: no persistence reads, state queries, publications,
 * retained results, or public mutation capability in its detached snapshots. */
export function createStorageRuntimeDiagnostics() {
  /** @type {Map<Domain, {registered: boolean, layout: Layout, observation: Observation | null, migration: import('../../types/storage-migration-contracts.js').EmbeddedSettingsMigrationReceipt | null}>} */
  const records = new Map(
    registrations.map(({ domain }) => [
      domain,
      {
        registered: false,
        layout: "not-observed",
        observation: null,
        migration: null,
      },
    ]),
  );

  /** A composed port is not a ready owner; never retain the facade here.
   * @template {object} Port @param {Domain} domain @param {Port} port @returns {Readonly<Port>} */
  function registerFacade(domain, port) {
    const state = records.get(domain);
    if (state) state.registered = true;
    return Object.freeze(port);
  }

  /** @param {Domain} domain @param {Operation} operation @param {unknown} result */
  function record(domain, operation, result) {
    const state = records.get(domain);
    if (!state) return;
    if (domain === "project" || domain === "settings") {
      const observation = projectResult(operation, result);
      state.observation = observation;
      if (
        observation.status === "current" ||
        observation.status === "committed"
      ) {
        state.layout =
          domain === "project" ? "settings-free" : "standalone-settings";
      } else if (observation.status === "repair_required") {
        state.layout =
          observation.reason === "missing"
            ? "missing"
            : observation.reason === "invalid_json" ||
                observation.reason === "invalid_data"
              ? "invalid"
              : "repair-required";
      } else if (
        observation.status === "cleared" ||
        observation.status === "reset"
      ) {
        state.layout = "missing";
      }
      if (
        domain === "project" &&
        operation === "reset" &&
        observation.stages.some(
          (stage) =>
            stage.stage === "rootRemoval" && stage.status === "acknowledged",
        )
      )
        state.layout = "missing";
      return;
    }
    state.observation = {
      operation,
      status: "succeeded",
      error: null,
      category: null,
      committed:
        operation.startsWith("replace") || operation === "markVisited"
          ? true
          : null,
      reason: null,
      stages: [],
    };
    if (domain !== "sync-capability") {
      state.layout =
        domain === "welcome" && operation === "loadExact" && result === null
          ? "missing"
          : "scalar-namespace";
    } else if (operation === "getSyncDirectoryState") {
      if (field(result, "transitionPending") === true)
        state.layout = "transition-pending";
      else if (field(result, "transitionPending") === false) {
        const handle = field(result, "handle");
        if (handle === null) state.layout = "missing";
        else if (handle !== undefined) state.layout = "capability-present";
      }
    } else if (operation === "beginSyncDirectoryTransition") {
      state.layout = "transition-pending";
      state.observation = { ...state.observation, committed: true };
    } else if (operation === "completeSyncDirectoryTransition") {
      state.layout = "transition-clean";
      state.observation = { ...state.observation, committed: true };
    }
    // Compensation deliberately leaves layout unknown: its user arguments are
    // never inspected and no extra read is made to discover restored state.
    if (operation === "restoreSyncDirectoryState")
      state.layout = "not-observed";
  }

  /** @param {Domain} domain @param {Operation} operation @param {unknown} error @param {boolean} [workflow] */
  function recordThrown(domain, operation, error, workflow = false) {
    const state = records.get(domain);
    if (!state) return;
    const read =
      operation === "load" ||
      operation === "loadExact" ||
      operation === "isEnabled" ||
      operation.startsWith("is") ||
      operation === "getSyncDirectoryState";
    const cancelled =
      field(error, "message", true) === "operation_cancelled" ||
      field(error, "code", true) === "operation_cancelled";
    state.observation = {
      operation,
      status: workflow ? "failed" : read ? "read_failed" : "write_failed",
      error: cancelled
        ? "operation_cancelled"
        : workflow
          ? "unknown"
          : read
            ? "storage_read_failed"
            : "storage_write_failed",
      category: thrownCategory(error),
      committed: workflow || read ? null : "indeterminate",
      reason: null,
      stages: [],
    };
  }

  /** Diagnostics must never change caller completion, even on hostile metadata.
   * @param {() => void} observe */
  function safely(observe) {
    try {
      observe();
    } catch {
      /* Observation only. */
    }
  }

  /** @template Result @param {Domain} domain @param {Operation} operation
   * @param {() => Result} call @param {boolean} [asynchronous] @param {boolean} [workflow] @returns {Result} */
  function invoke(
    domain,
    operation,
    call,
    asynchronous = false,
    workflow = false,
  ) {
    let result;
    try {
      result = call();
    } catch (error) {
      safely(() => recordThrown(domain, operation, error, workflow));
      throw error;
    }
    const observe = (/** @type {unknown} */ value) => {
      if (workflow) {
        const state = records.get(domain);
        if (state?.registered)
          state.observation = projectResult(
            operation,
            field(value, "result") ?? value,
          );
      } else record(domain, operation, value);
    };
    let asynchronouslyObserved = asynchronous;
    if (asynchronous || workflow) {
      safely(() => {
        // Observe the native promise without returning a replacement, consuming
        // user thenables, or retaining its result beyond these callbacks.
        const mode = promiseObservationMode(result);
        if (mode !== "native") {
          asynchronouslyObserved = asynchronous || mode === "skip";
          return;
        }
        nativeThen.call(
          result,
          (value) => safely(() => observe(value)),
          (error) =>
            safely(() => recordThrown(domain, operation, error, workflow)),
        );
        asynchronouslyObserved = true;
      });
    }
    if (!asynchronouslyObserved) safely(() => observe(result));
    return result;
  }

  /** Only explicit, bound narrow-port methods use this forwarding primitive.
   * @template {(...args: any[]) => any} Action
   * @param {Domain} domain @param {Operation} operation @param {Action} action
   * @param {boolean} [asynchronous] @returns {Action} */
  function observeAction(domain, operation, action, asynchronous = false) {
    return /** @type {Action} */ (
      (...args) =>
        invoke(domain, operation, () => action(...args), asynchronous)
    );
  }

  return Object.freeze({
    /** @param {import('./ProjectRepository.js').ProjectRepositoryPort} port */
    observeProjectRepository: (port) =>
      registerFacade("project", {
        load: observeAction("project", "load", port.load.bind(port)),
        commit: observeAction("project", "commit", port.commit.bind(port)),
        reset: observeAction("project", "reset", port.reset.bind(port)),
      }),
    /** @param {import('./SettingsRepository.js').SettingsRepositoryPort} port */
    observeSettingsRepository: (port) =>
      registerFacade("settings", {
        load: observeAction("settings", "load", port.load.bind(port)),
        replace: observeAction("settings", "replace", port.replace.bind(port)),
        clear: observeAction("settings", "clear", port.clear.bind(port)),
      }),
    /** @param {import('./CommandPresentationPersistencePort.js').CommandPresentationPersistencePort} port */
    observeCommandPresentation: (port) =>
      registerFacade("presentation", {
        load: observeAction("presentation", "load", port.load.bind(port)),
        replaceCategory: observeAction(
          "presentation",
          "replaceCategory",
          port.replaceCategory.bind(port),
        ),
        replaceGroup: observeAction(
          "presentation",
          "replaceGroup",
          port.replaceGroup.bind(port),
        ),
      }),
    /** @param {import('./KeyBrowserPersistencePort.js').KeyBrowserPersistencePort} port */
    observeKeyBrowser: (port) =>
      registerFacade("key-browser", {
        load: observeAction("key-browser", "load", port.load.bind(port)),
        replaceMode: observeAction(
          "key-browser",
          "replaceMode",
          port.replaceMode.bind(port),
        ),
        replaceCategory: observeAction(
          "key-browser",
          "replaceCategory",
          port.replaceCategory.bind(port),
        ),
        replaceBindset: observeAction(
          "key-browser",
          "replaceBindset",
          port.replaceBindset.bind(port),
        ),
        isCategoryCollapsed: observeAction(
          "key-browser",
          "isCategoryCollapsed",
          port.isCategoryCollapsed.bind(port),
        ),
        isBindsetCollapsed: observeAction(
          "key-browser",
          "isBindsetCollapsed",
          port.isBindsetCollapsed.bind(port),
        ),
      }),
    /** @param {import('./VisitedStatePort.js').VisitedStatePort} port */
    observeVisitedState: (port) =>
      registerFacade("welcome", {
        loadExact: observeAction(
          "welcome",
          "loadExact",
          port.loadExact.bind(port),
        ),
        markVisited: observeAction(
          "welcome",
          "markVisited",
          port.markVisited.bind(port),
        ),
        compensate: observeAction(
          "welcome",
          "compensate",
          port.compensate.bind(port),
        ),
      }),
    /** @param {import('./DevelopmentFlagPort.js').DevelopmentFlagPort} port */
    observeDevelopmentFlag: (port) =>
      registerFacade("diagnostic", {
        isEnabled: observeAction(
          "diagnostic",
          "isEnabled",
          port.isEnabled.bind(port),
        ),
      }),
    /** @param {import('../services/serviceTypes.js').FileSystem} port */
    observeFileSystem: (port) =>
      registerFacade("sync-capability", {
        getSyncDirectoryState: observeAction(
          "sync-capability",
          "getSyncDirectoryState",
          port.getSyncDirectoryState.bind(port),
          true,
        ),
        beginSyncDirectoryTransition: observeAction(
          "sync-capability",
          "beginSyncDirectoryTransition",
          port.beginSyncDirectoryTransition.bind(port),
          true,
        ),
        completeSyncDirectoryTransition: observeAction(
          "sync-capability",
          "completeSyncDirectoryTransition",
          port.completeSyncDirectoryTransition.bind(port),
          true,
        ),
        restoreSyncDirectoryState: observeAction(
          "sync-capability",
          "restoreSyncDirectoryState",
          port.restoreSyncDirectoryState.bind(port),
          true,
        ),
      }),
    /** @param {unknown} receipt */
    recordMigrationReceipt(receipt) {
      safely(() => {
        const safe = materializeStorageSchemaMigrationReceipt(receipt);
        if (!safe) return;
        for (const domain of /** @type {const} */ (["project", "settings"])) {
          const state = records.get(domain);
          if (!state) continue;
          state.migration = safe;
          if (domain === "settings" && safe.settingsVerified)
            state.layout = "standalone-settings";
          if (domain === "project" && safe.status === "complete")
            state.layout = "settings-free";
        }
      });
    },
    /** @param {'project' | 'settings' | 'sync-capability'} domain
     * @param {'reset' | 'restore' | 'activation' | 'folder-selection'} operation @param {unknown} result */
    recordWorkflowReceipt(domain, operation, result) {
      safely(() => {
        if (
          domain !== "project" &&
          domain !== "settings" &&
          domain !== "sync-capability"
        )
          return;
        if (
          !["reset", "restore", "activation", "folder-selection"].includes(
            operation,
          )
        )
          return;
        const state = records.get(domain);
        if (state?.registered)
          state.observation = projectResult(
            operation,
            field(result, "result") ?? result,
          );
      });
    },
    /** @overload
     * @param {'project'} domain @param {'reset'} operation
     * @param {import('../../types/storage-contracts.js').ApplicationDataResetTransitionRunner} action
     * @returns {import('../../types/storage-contracts.js').ApplicationDataResetTransitionRunner} */
    /** @template {(...args: any[]) => any} Action
     * @overload
     * @param {'project' | 'settings' | 'sync-capability'} domain
     * @param {'reset' | 'restore' | 'activation' | 'folder-selection'} operation
     * @param {Action} action @returns {Action} */
    /** Only bound existing owner actions are observed; no new action entrypoint.
     * @template {(...args: any[]) => any} Action
     * @param {'project' | 'settings' | 'sync-capability'} domain
     * @param {'reset' | 'restore' | 'activation' | 'folder-selection'} operation
     * @param {Action} action @returns {Action} */
    observeWorkflowAction(domain, operation, action) {
      return /** @type {Action} */ (
        (...args) =>
          invoke(domain, operation, () => action(...args), false, true)
      );
    },
    /** @returns {import('../../types/storage-diagnostics.js').StorageRuntimeDiagnosticSnapshot} */
    snapshot() {
      return Object.freeze({
        domains: Object.freeze(
          registrations.map(({ domain, owner, port, adapter }) => {
            const state = records.get(domain);
            const observation = state?.observation;
            return Object.freeze({
              domain,
              owner,
              port,
              adapter,
              portRegistered: state?.registered ?? false,
              structuralLayout: state?.layout ?? "not-observed",
              lastOperation: observation
                ? Object.freeze({
                    ...observation,
                    stages: Object.freeze(
                      observation.stages.map((stage) =>
                        Object.freeze({ ...stage }),
                      ),
                    ),
                  })
                : null,
              lastMigration: state?.migration
                ? Object.freeze({ ...state.migration })
                : null,
            });
          }),
        ),
      });
    },
  });
}
