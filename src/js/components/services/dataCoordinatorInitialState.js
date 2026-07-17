import persist from "./storageWrites.js";

/** @param {unknown} error */
const getErrorMessage = (error) =>
  error instanceof Error ? error.message : String(error);

/** @param {object} value @param {PropertyKey} key */
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

/**
 * Load, normalize, and atomically adopt DataCoordinator's initial owner state.
 * The draft remains local across every await, so a destroyed authority cannot
 * expose a partially loaded state graph.
 *
 * @param {import('./DataCoordinator.js').default} coordinator
 * @returns {Promise<void>}
 */
export async function loadInitialCoordinatorState(coordinator) {
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
    coordinator._publishState("initial-load");
    if (needsDefaultProfiles) void coordinator.tryCreateDefaultProfiles();
  } catch (error) {
    if (!coordinator._isCurrentOperation(operation)) return;
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
