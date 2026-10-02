import {
  publishCommittedCoordinatorProject,
  publishDataCoordinatorState,
} from "./dataCoordinatorPublication.js";
import {
  adoptCoordinatorProjectRoot,
  commitCoordinatorProjectRoot,
  loadCoordinatorProjectRoot,
} from "./dataCoordinatorProjectPersistence.js";
import {
  activateDataCoordinatorOwner,
  enqueueDataCoordinatorMutation,
  recordDataCoordinatorPublication,
} from "./dataCoordinatorMutationQueue.js";

/** @param {unknown} error */
const getErrorMessage = (error) =>
  error instanceof Error ? error.message : String(error);

/** @param {object} value @param {PropertyKey} key */
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

/**
 * The shared writer queue orders initial adoption behind prior writes. Keep a
 * separate adoption barrier so a publication listener may await a reload
 * without waiting on its own settlement. Public readiness still includes all
 * initial/default publications and responder installation.
 *
 * @param {import('./DataCoordinator.js').default} coordinator
 * @returns {Promise<void>}
 */
export function beginInitialCoordinatorStateLoad(coordinator) {
  /** @type {() => void} */
  let adopted;
  /** @type {(reason: unknown) => void} */
  let failed;
  coordinator._initialStateCommitted = new Promise((resolve, reject) => {
    adopted = resolve;
    failed = reject;
  });
  void coordinator._initialStateCommitted.catch(() => undefined);
  const initialLoad = enqueueDataCoordinatorMutation(coordinator, async () => {
    await loadInitialCoordinatorState(coordinator);
    adopted();
  });
  void initialLoad.catch((error) => failed(error));
  return ownInitialCoordinatorStateReady(coordinator, initialLoad);
}

/** @param {import('./DataCoordinator.js').default} coordinator @param {Promise<void>} ready */
function ownInitialCoordinatorStateReady(coordinator, ready) {
  coordinator.initialStateReady = ready;
  coordinator._initialStateTail = ready.then(
    () => undefined,
    () => undefined,
  );
  coordinator.initialStateSettled = coordinator._initialStateTail;
  return ready;
}

/** @param {import('./DataCoordinator.js').default} coordinator */
export function initializeDataCoordinatorState(coordinator) {
  activateDataCoordinatorOwner(coordinator);
  console.log(`[${coordinator.componentName}] Initializing...`);
  const operation = coordinator._captureOperationGeneration();
  coordinator._stateReady = false;
  coordinator._currentStateSnapshot = null;

  const ready = coordinator.loadInitialState().then(() => {
    coordinator._assertCurrentOperation(operation);
    coordinator.setupRequestHandlers();
    coordinator.setupEventListeners();
    console.log(`[${coordinator.componentName}] Initialization complete`);
  });
  ownInitialCoordinatorStateReady(coordinator, ready);
  void ready.catch(() => undefined);
}

/**
 * Load, normalize, and atomically adopt DataCoordinator's initial owner state.
 * The draft remains local across every await, so a destroyed authority cannot
 * expose a partially loaded state graph.
 *
 * @param {import('./DataCoordinator.js').default} coordinator
 * @returns {Promise<void>}
 */
async function loadInitialCoordinatorState(coordinator) {
  const operation = coordinator._captureOperationGeneration();
  try {
    const loaded = loadCoordinatorProjectRoot(coordinator);
    const data = loaded.root;
    const nextState = {
      currentProfile: data.currentProfile || null,
      currentEnvironment: "space",
      profiles: structuredClone(data.profiles || {}),
      metadata: { lastModified: data.lastModified, version: "1.0.0" },
    };

    const profilesNormalized = await coordinator._normalizeAllProfiles(
      nextState.profiles,
      {
        rootData: data,
        persist: false,
      },
    );
    coordinator._assertCurrentOperation(operation);

    let needsDefaultProfiles = false;
    if (Object.keys(nextState.profiles).length === 0) {
      const isFirstTime = coordinator._isFirstVisit();
      if (isFirstTime) {
        needsDefaultProfiles = true;
        console.log(
          `[${coordinator.componentName}] First time run - no profiles found, will create built-in defaults`,
        );
      } else {
        console.log(
          `[${coordinator.componentName}] No profiles found, but not first run - leaving empty (user may have reset)`,
        );
      }
    }

    let selectionChanged = false;
    if (
      !nextState.currentProfile &&
      Object.keys(nextState.profiles).length > 0
    ) {
      const firstProfileId = Object.keys(nextState.profiles)[0];
      nextState.currentProfile = firstProfileId;
      selectionChanged = true;
    }

    if (
      nextState.currentProfile &&
      hasOwn(nextState.profiles, nextState.currentProfile)
    ) {
      nextState.currentEnvironment =
        nextState.profiles[nextState.currentProfile].currentEnvironment ||
        "space";
    }

    const candidate = structuredClone(data);
    candidate.profiles = structuredClone(nextState.profiles);
    candidate.currentProfile = nextState.currentProfile;
    const requiresCommit =
      loaded.repairRequired || profilesNormalized > 0 || selectionChanged;
    coordinator._assertCurrentOperation(operation);
    const durableData = requiresCommit
      ? commitCoordinatorProjectRoot(coordinator, candidate, {
          verification: "required",
          consumeResetSentinel: loaded.resetSentinel,
        })
      : data;
    adoptCoordinatorProjectRoot(coordinator, durableData, operation);
    if (requiresCommit) {
      publishCommittedCoordinatorProject(coordinator, durableData);
    }
    coordinator.needsDefaultProfiles = needsDefaultProfiles;
    console.log(`[${coordinator.componentName}] Loaded initial state:`, {
      currentProfile: nextState.currentProfile,
      environment: nextState.currentEnvironment,
      profileCount: Object.keys(nextState.profiles).length,
    });

    coordinator._stateReady = true;
    const initialStatePublication = publishDataCoordinatorState(
      coordinator,
      "initial-load",
    );
    coordinator._assertCurrentOperation(operation);
    /** @type {Promise<void>} */
    let defaultProfilesReady = Promise.resolve();
    if (needsDefaultProfiles) {
      defaultProfilesReady = coordinator._tryCreateDefaultProfiles();
    }
    await defaultProfilesReady;
    recordDataCoordinatorPublication(
      coordinator,
      initialStatePublication.settled,
    );
    coordinator._assertCurrentOperation(operation);
  } catch (error) {
    if (!coordinator._isCurrentOperation(operation)) {
      throw new Error("operation_cancelled");
    }
    console.error(
      `[${coordinator.componentName}] Failed to load initial state:`,
      error,
    );
    const message = coordinator.i18n.t("failed_to_load_profile_data", {
      error: getErrorMessage(error),
    });
    throw new Error(message);
  }
}
