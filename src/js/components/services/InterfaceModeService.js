import ComponentBase from "../ComponentBase.js";

/**
 * InterfaceModeService - Handles mode switching logic and state management
 * Manages space/ground/alias mode transitions and profile environment updates
 */
export default class InterfaceModeService extends ComponentBase {
  /** @param {{ eventBus: import('./serviceTypes.js').EventBus, storage?: import('./serviceTypes.js').Storage, app?: unknown }} options */
  constructor({ eventBus, storage, app }) {
    super(eventBus);
    this.componentName = "InterfaceModeService";
    this.storage = storage;
    this.app = app;

    // Internal state
    this._currentMode = "space";
    this._modeListenersSetup = false;

    // Store handler references for proper cleanup
    /** @type {((data: import('../../types/events/profiles.js').ProfileSwitchedPayload) => void) | null} */
    this._profileSwitchedHandler = null;
    /** @type {(() => void) | null} */
    this._responseDetachFunction = null;

    // Register Request/Response handlers for environment switching
    if (this.eventBus) {
      this._responseDetachFunction = this.respond(
        "environment:switch",
        async ({ mode } = /** @type {{ mode?: string }} */ ({})) => {
          if (mode) {
            await this.switchMode(mode);
            return { success: true, mode: this._currentMode };
          }
          return { success: false, error: "No mode provided" };
        },
      );
    }
  }

  onInit() {
    this.setupEventListeners();
  }

  // Get current mode
  get currentMode() {
    return this._currentMode;
  }

  // Set current mode (triggers mode switch)
  /** @param {string} mode */
  set currentMode(mode) {
    this.switchMode(mode).catch((error) => {
      console.error(
        "[InterfaceModeService] Error in currentMode setter:",
        error,
      );
    });
  }

  // Get current environment (alias for currentMode)
  get currentEnvironment() {
    return this._currentMode;
  }

  // Set current environment (alias for currentMode)
  /** @param {string} mode */
  set currentEnvironment(mode) {
    this.switchMode(mode).catch((error) => {
      console.error(
        "[InterfaceModeService] Error in currentEnvironment setter:",
        error,
      );
    });
  }

  // Setup event listeners for mode changes
  setupEventListeners() {
    if (this._modeListenersSetup) {
      return;
    }

    // Create handler functions and store references for cleanup
    this._profileSwitchedHandler = (data) => {
      // ComponentBase handles profile ID caching automatically
      if (data.profileId && typeof window !== "undefined") {
        console.log(
          `[InterfaceModeService] Profile switched to: ${data.profileId}`,
        );
      }

      if (data.environment) {
        this.switchMode(data.environment).catch((error) => {
          console.error(
            "[InterfaceModeService] Error in profile switched handler:",
            error,
          );
        });
      }
    };

    // Listen for profile switches to update mode
    this.eventBus?.on("profile:switched", this._profileSwitchedHandler);

    this._modeListenersSetup = true;
  }

  // Switch to a new mode
  /** @param {string} mode */
  async switchMode(mode) {
    if (mode === this._currentMode) {
      return;
    }

    if (typeof window !== "undefined") {
      console.log(
        `[InterfaceModeService] switchMode from ${this._currentMode} to ${mode}`,
      );
    }

    const oldMode = this._currentMode;
    this._currentMode = mode;

    // Update profile data and wait for storage completion to prevent race conditions
    try {
      await this.updateProfileMode(mode);
    } catch (error) {
      console.error(
        "[InterfaceModeService] Failed to persist environment change:",
        error,
      );
    }

    // Emit environment change synchronously AFTER storage operation completes
    this.emit(
      "environment:changed",
      {
        environment: mode,
        toEnvironment: mode,
        fromEnvironment: oldMode,
      },
      { synchronous: true },
    );
  }

  // Update profile mode in storage and profile service
  /** @param {string} mode */
  async updateProfileMode(mode) {
    const profileId = this.cache?.currentProfile;
    if (!profileId) {
      console.warn(
        "[InterfaceModeService] Cannot update profile mode: no current profile ID",
      );
      return;
    }

    console.log(
      `[InterfaceModeService] updateProfileMode called with mode: ${mode}`,
    );
    console.log(`[InterfaceModeService] Current profile ID: ${profileId}`);

    try {
      // Update profile with new environment using explicit operations API
      const result = await this.request("data:update-profile", {
        profileId,
        properties: {
          currentEnvironment: mode,
        },
      });

      if (
        result &&
        typeof result === "object" &&
        "success" in result &&
        result.success
      ) {
        console.log(
          `[InterfaceModeService] Environment persisted to storage: ${mode} for profile: ${profileId}`,
        );
      } else {
        console.error(
          "[InterfaceModeService] Failed to persist environment:",
          result,
        );
      }
    } catch (error) {
      console.error(
        "[InterfaceModeService] Error updating profile mode:",
        error,
      );
    }
  }

  // Cleanup event listeners
  onDestroy() {
    if (this._modeListenersSetup && this._profileSwitchedHandler) {
      // Properly remove event listeners using stored handler references
      this.eventBus?.off("profile:switched", this._profileSwitchedHandler);
      this._modeListenersSetup = false;
    }

    // Clean up request/response handler
    if (this._responseDetachFunction) {
      this._responseDetachFunction();
      this._responseDetachFunction = null;
    }
  }

  // Provide serialisable snapshot representing current mode
  getCurrentState() {
    return {
      currentMode: this._currentMode,
      environment: this._currentMode,
      currentEnvironment: this._currentMode, // Add both keys for compatibility
    };
  }

  // Handle initial state from other components during late-join handshake
  /**
   * @param {string} sender
   * @param {{ currentEnvironment?: string, currentProfileData?: { currentEnvironment?: string } } | null | undefined} state
   */
  handleInitialState(sender, state) {
    if (!state) return;

    // Initialize mode from DataCoordinator environment data
    if (sender === "DataCoordinator") {
      // Extract environment from profile data or state
      const env =
        state.currentEnvironment ||
        (state.currentProfileData &&
          state.currentProfileData.currentEnvironment);
      if (env) {
        const previousMode = this._currentMode;
        this._currentMode = env;

        // Emit environment change synchronously if mode actually changed
        if (previousMode !== this._currentMode) {
          this.emit(
            "environment:changed",
            {
              environment: this._currentMode,
              isInitialization: true,
            },
            { synchronous: true },
          );
        }
      }
    }
  }
}
