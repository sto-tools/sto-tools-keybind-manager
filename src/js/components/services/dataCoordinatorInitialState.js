import persist from "./storageWrites.js";
import { publishDataCoordinatorState } from "./dataCoordinatorPublication.js";

/** @param {unknown} error */
const getErrorMessage = (error) =>
  error instanceof Error ? error.message : String(error);

/** @param {object} value @param {PropertyKey} key */
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

/**
 * Queue one requested initial load behind all prior lifecycle attempts. Ready
 * retains the current attempt's rejection while the private tail and public
 * settlement barrier always resolve, allowing later lifecycles to proceed.
 *
 * @param {import('./DataCoordinator.js').default} coordinator
 * @returns {Promise<void>}
 */
export function beginInitialCoordinatorStateLoad(coordinator) {
  const operation = coordinator._captureOperationGeneration();
  const initialLoad = coordinator._initialStateTail.then(() => {
    coordinator._assertCurrentOperation(operation);
    return loadInitialCoordinatorState(coordinator);
  });
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
    const data = coordinator.storage.getAllData();
    const nextState = {
      currentProfile: data.currentProfile || null,
      currentEnvironment: "space",
      profiles: structuredClone(data.profiles || {}),
      settings: structuredClone(data.settings || {}),
      metadata: { lastModified: data.lastModified, version: "1.0.0" },
    };

    await coordinator.normalizeAllProfiles(nextState.profiles, {
      rootData: data,
    });
    coordinator._assertCurrentOperation(operation);

    let needsDefaultProfiles = false;
    if (Object.keys(nextState.profiles).length === 0) {
      const isFirstTime = !localStorage.getItem("sto_keybind_manager_visited");
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

    if (
      !nextState.currentProfile &&
      Object.keys(nextState.profiles).length > 0
    ) {
      const firstProfileId = Object.keys(nextState.profiles)[0];
      await persist.currentProfile(
        coordinator.storage,
        firstProfileId,
        coordinator.i18n,
      );
      coordinator._assertCurrentOperation(operation);
      nextState.currentProfile = firstProfileId;
    }

    if (
      nextState.currentProfile &&
      hasOwn(nextState.profiles, nextState.currentProfile)
    ) {
      nextState.currentEnvironment =
        nextState.profiles[nextState.currentProfile].currentEnvironment ||
        "space";
    }

    const durableData = coordinator.storage.getAllData();
    nextState.metadata = {
      lastModified: durableData.lastModified,
      version: durableData.version || "1.0.0",
    };
    coordinator._assertCurrentOperation(operation);

    coordinator.state = nextState;
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
      defaultProfilesReady = coordinator.tryCreateDefaultProfiles();
    }
    await Promise.all([initialStatePublication.settled, defaultProfilesReady]);
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
