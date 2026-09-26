import ComponentBase from "../ComponentBase.js";
import {
  materializeMutationRequest,
  requireProfileUpdateResult,
} from "./mutationRequestBoundary.js";

/** @typedef {'space' | 'ground' | 'alias'} InterfaceMode */
/** @typedef {import('../../types/rpc/index.js').RpcResult<'environment:switch'>} EnvironmentSwitchResult */
/**
 * @typedef {{
 *   lifecycleGeneration: number,
 *   profileContextGeneration: number,
 *   authorityEpoch: number | null,
 *   profileId: string | null
 * }} ModeSwitchContext
 */
/** @typedef {{
 *   mode: InterfaceMode,
 *   context: ModeSwitchContext,
 *   startingRevision: number | null,
 *   ownerAdvanced: boolean,
 *   targetObserved: boolean,
 *   publication: Promise<unknown> | null,
 *   releaseAdmission: () => void
 * }} ModeSwitchAction */

/** @type {ReadonlySet<string>} */
const INTERFACE_MODES = new Set(["space", "ground", "alias"]);

/** @type {ReadonlySet<import('../../types/events/data.js').DataStateChangeReason>} */
const PROFILE_CONTEXT_REPLACEMENT_REASONS = new Set([
  "initial-load",
  "storage-reset",
  "state-reloaded",
]);

/** @type {ReadonlySet<import('../../types/events/data.js').DataStateChangeReason>} */
const OWNER_PUBLISHED_ENVIRONMENT_REASONS = new Set([
  "environment-changed",
  "state-reloaded",
]);

/** @param {unknown} mode @returns {mode is InterfaceMode} */
function isInterfaceMode(mode) {
  return typeof mode === "string" && INTERFACE_MODES.has(mode);
}

/**
 * InterfaceModeService - Handles mode switching logic and state management
 * Manages space/ground/alias mode transitions and profile environment updates
 */
export default class InterfaceModeService extends ComponentBase {
  /** @param {{ eventBus: import('./serviceTypes.js').EventBus }} options */
  constructor({ eventBus }) {
    super(eventBus);
    this.componentName = "InterfaceModeService";
    /** @type {InterfaceMode} */
    this._currentMode = "space";
    this._modeListenersSetup = false;
    this._lifecycleGeneration = 0;
    this._profileContextGeneration = 0;
    this._acceptedAuthorityEpoch = null;
    this._acceptedProfileId = null;
    /** @type {Promise<void>} */
    this._switchQueue = Promise.resolve();
    this._activeModeSwitch = /** @type {ModeSwitchAction | null} */ (null);
    this._modePublication = /** @type {Promise<unknown>} */ (Promise.resolve());
    /** @type {InterfaceMode} */
    this._modePublicationMode = this._currentMode;

    /** @type {((data: import('../../types/events/profiles.js').ProfileSwitchedPayload) => unknown) | null} */
    this._profileSwitchedHandler = null;
    /** @type {((data: import('../../types/events/data.js').DataStateChangedPayload) => unknown) | null} */
    this._dataStateChangedHandler = null;
    /** @type {(() => void) | null} */
    this._responseDetachFunction = null;

    // Preserve the existing constructor-time RPC availability. onInit restores
    // the responder after a destroy/reinitialize cycle.
    this.setupRequestHandler();
  }

  onInit() {
    this._lifecycleGeneration += 1;
    this._switchQueue = Promise.resolve();
    this.setupRequestHandler();
    this.setupEventListeners();
  }

  setupRequestHandler() {
    if (!this.eventBus || this._responseDetachFunction) return;

    this._responseDetachFunction = this.respond(
      "environment:switch",
      (payload) => {
        try {
          const request = materializeMutationRequest(payload, ["mode"]);
          return this.switchMode(request.mode);
        } catch {
          return { success: false, error: "invalid_environment" };
        }
      },
    );
  }

  // Get current mode
  get currentMode() {
    return this._currentMode;
  }

  // Set current mode (triggers mode switch)
  /** @param {string} mode */
  set currentMode(mode) {
    void this.switchMode(mode).then((result) => {
      if (!result.success) {
        console.warn(
          `[InterfaceModeService] currentMode setter rejected: ${result.error}`,
        );
      }
    });
  }

  // Get current environment (alias for currentMode)
  get currentEnvironment() {
    return this._currentMode;
  }

  // Set current environment (alias for currentMode)
  /** @param {string} mode */
  set currentEnvironment(mode) {
    void this.switchMode(mode).then((result) => {
      if (!result.success) {
        console.warn(
          `[InterfaceModeService] currentEnvironment setter rejected: ${result.error}`,
        );
      }
    });
  }

  // Setup event listeners for accepted profile changes.
  setupEventListeners() {
    if (this._modeListenersSetup) return;

    this._profileSwitchedHandler = (data) => {
      this._profileContextGeneration += 1;
      if (data.profileId && typeof window !== "undefined") {
        console.log(
          `[InterfaceModeService] Profile switched to: ${data.profileId}`,
        );
      }

      return this.adoptAcceptedMode(data.environment, {
        isInitialization: data.updateSource === "DataCoordinator-Reset",
      });
    };

    this._dataStateChangedHandler = ({ reason, state, profileId }) => {
      const accepted = this.cache.dataState;
      if (
        !state.ready ||
        !accepted ||
        accepted.authorityEpoch !== state.authorityEpoch ||
        accepted.revision !== state.revision
      ) {
        return;
      }

      if (
        PROFILE_CONTEXT_REPLACEMENT_REASONS.has(reason) ||
        (reason === "profile-replaced" && profileId === state.currentProfile)
      ) {
        this._profileContextGeneration += 1;
      } else if (
        this._acceptedAuthorityEpoch !== state.authorityEpoch ||
        this._acceptedProfileId !== state.currentProfile
      ) {
        this._profileContextGeneration += 1;
      }
      this._acceptedAuthorityEpoch = state.authorityEpoch;
      this._acceptedProfileId = state.currentProfile;
      const observedAction = this._observeActiveSwitch(
        state,
        reason,
        profileId,
      );
      /** @type {Promise<unknown> | null} */
      let publication = null;
      // The pending publication may itself await a selection write that produced
      // this snapshot, so joining it here would create an acknowledgement cycle.
      if (state.currentEnvironment !== this._currentMode) {
        publication = this.adoptAcceptedMode(state.currentEnvironment, {
          isInitialization:
            reason === "initial-load" || reason === "storage-reset",
          publish: !OWNER_PUBLISHED_ENVIRONMENT_REASONS.has(reason),
        });
      }
      if (observedAction?.targetObserved)
        observedAction.publication = publication ?? Promise.resolve();
      return publication ?? undefined;
    };

    this.eventBus?.on("profile:switched", this._profileSwitchedHandler);
    this.eventBus?.on("data:state-changed", this._dataStateChangedHandler);
    this._modeListenersSetup = true;
  }

  _captureSwitchContext() {
    const snapshot = this.cache.dataState;
    return {
      lifecycleGeneration: this._lifecycleGeneration,
      profileContextGeneration: this._profileContextGeneration,
      authorityEpoch: snapshot?.ready ? snapshot.authorityEpoch : null,
      profileId: snapshot?.ready ? snapshot.currentProfile : null,
    };
  }

  /** @param {ModeSwitchContext} context */
  _isCurrentLifecycle(context) {
    return (
      this.initialized &&
      !this.destroyed &&
      context.lifecycleGeneration === this._lifecycleGeneration
    );
  }

  /** @param {ModeSwitchContext} context */
  _isCurrentSwitchContext(context) {
    const snapshot = this.cache.dataState;
    if (
      !this._isCurrentLifecycle(context) ||
      context.profileContextGeneration !== this._profileContextGeneration
    ) {
      return false;
    }

    if (context.authorityEpoch === null) {
      return !snapshot?.ready && context.profileId === null;
    }

    return Boolean(
      snapshot?.ready &&
        snapshot.authorityEpoch === context.authorityEpoch &&
        snapshot.currentProfile === context.profileId,
    );
  }

  /** Release admission on exact-CAS supersession; retain matching settlement.
   * @param {import('../../types/events/component-state.js').DataCoordinatorStateSnapshot} state
   * @param {import('../../types/events/data.js').DataStateChangeReason} reason
   * @param {string | undefined} changedProfileId
   * @returns {ModeSwitchAction | null}
   */
  _observeActiveSwitch(state, reason, changedProfileId) {
    const action = this._activeModeSwitch;
    if (!action || action.startingRevision === null) return null;
    const { context } = action;
    const replacement =
      PROFILE_CONTEXT_REPLACEMENT_REASONS.has(reason) ||
      (reason === "profile-replaced" &&
        changedProfileId === state.currentProfile);
    const sameAuthority = state.authorityEpoch === context.authorityEpoch;
    const superseded =
      !sameAuthority || state.revision > action.startingRevision;
    if (!superseded) return null;

    action.ownerAdvanced = true;
    if (
      !replacement &&
      sameAuthority &&
      state.currentProfile === context.profileId &&
      state.currentEnvironment === action.mode
    ) {
      action.targetObserved = true;
    }
    action.releaseAdmission();
    return action;
  }

  /** Queue valid switches; fulfilment and rejection both advance the tail.
   * @param {InterfaceMode} mode
   * @param {ModeSwitchContext} context
   * @returns {Promise<EnvironmentSwitchResult>}
   */
  _enqueueModeSwitch(mode, context) {
    let released = false;
    let release = () => {};
    /** @type {Promise<void>} */
    const admitted = new Promise((resolve) => {
      release = () => resolve();
    });
    const action = /** @type {ModeSwitchAction} */ ({
      mode,
      context,
      startingRevision: null,
      ownerAdvanced: false,
      targetObserved: false,
      publication: null,
      releaseAdmission: () => {
        if (released) return;
        released = true;
        release();
      },
    });
    const predecessor = this._switchQueue;
    const started = predecessor.then(
      () => ({ result: this._runModeSwitch(action) }),
      () => ({ result: this._runModeSwitch(action) }),
    );
    this._switchQueue = started
      .then(
        () => admitted,
        () => admitted,
      )
      .then(() => undefined);
    return started.then(({ result }) => result);
  }

  /** @param {ModeSwitchAction} action
   * @returns {Promise<EnvironmentSwitchResult>}
   */
  async _runModeSwitch(action) {
    const { mode, context } = action;
    try {
      if (!this._isCurrentLifecycle(context)) {
        return { success: false, error: "operation_cancelled" };
      }

      if (!this._isCurrentSwitchContext(context)) {
        return { success: false, error: "operation_cancelled" };
      }

      // Evaluate this only after preceding requests have committed or become
      // irrevocably stale. Listener settlement remains private to each reply.
      if (mode === this._currentMode) {
        return { success: true, mode };
      }

      if (!context.profileId) {
        return { success: false, error: "no_profile_selected" };
      }

      const startingSnapshot = this.cache.dataState;
      if (!startingSnapshot?.ready) {
        return { success: false, error: "operation_cancelled" };
      }
      action.startingRevision = startingSnapshot.revision;
      this._activeModeSwitch = action;

      try {
        const result = await this.request("data:update-profile", {
          profileId: context.profileId,
          precondition: {
            authorityEpoch: startingSnapshot.authorityEpoch,
            revision: startingSnapshot.revision,
          },
          properties: {
            currentEnvironment: mode,
          },
        });
        requireProfileUpdateResult(result);
      } catch (error) {
        if (!this._isCurrentSwitchContext(context)) {
          return { success: false, error: "operation_cancelled" };
        }
        console.error(
          "[InterfaceModeService] Failed to persist environment change:",
          error,
        );
        return { success: false, error: "failed_to_save_profile" };
      }

      if (action.targetObserved) {
        await action.publication;
        return { success: true, mode };
      }
      if (!this._isCurrentSwitchContext(context) || action.ownerAdvanced) {
        return { success: true, mode };
      }

      // Test doubles and compatibility responders may acknowledge without a
      // state publication. Invoke the local projection before releasing the
      // admission tail, then await only this action's listener settlement.
      action.publication = this.adoptAcceptedMode(mode);
      action.targetObserved = true;
      action.releaseAdmission();
      await action.publication;
      return { success: true, mode };
    } finally {
      action.releaseAdmission();
      if (this._activeModeSwitch === action) this._activeModeSwitch = null;
    }
  }

  /** Switch to a new mode through the durable DataCoordinator boundary.
   * @param {unknown} mode
   * @returns {Promise<EnvironmentSwitchResult>}
   */
  switchMode(mode) {
    if (!isInterfaceMode(mode)) {
      return Promise.resolve({
        success: false,
        error: "invalid_environment",
      });
    }

    return this._enqueueModeSwitch(mode, this._captureSwitchContext());
  }

  /** Adopt an environment already accepted by DataCoordinator without writing
   * it back through the persistence boundary.
   *
   * @param {unknown} mode
   * @param {{ isInitialization?: boolean, publish?: boolean }} [options]
   * @returns {Promise<unknown>}
   */
  adoptAcceptedMode(mode, { isInitialization = false, publish = true } = {}) {
    if (!isInterfaceMode(mode)) {
      return Promise.resolve();
    }
    if (mode === this._currentMode) {
      return this._modePublicationMode === mode
        ? this._modePublication
        : Promise.resolve();
    }

    const previousMode = this._currentMode;
    this._currentMode = mode;

    if (!publish) {
      this._modePublicationMode = mode;
      this._modePublication = Promise.resolve();
      return this._modePublication;
    }

    const payload = isInitialization
      ? { environment: mode, isInitialization: /** @type {const} */ (true) }
      : {
          environment: mode,
          toEnvironment: mode,
          fromEnvironment: previousMode,
        };
    this._modePublicationMode = mode;
    this._modePublication = this.emit("environment:changed", payload, {
      synchronous: true,
    });
    return this._modePublication;
  }

  // Cleanup event listeners and invalidate queued/in-flight work.
  onDestroy() {
    this._lifecycleGeneration += 1;
    this._activeModeSwitch?.releaseAdmission();
    this._activeModeSwitch = null;
    this._switchQueue = Promise.resolve();
    this._modePublication = Promise.resolve();
    this._modePublicationMode = this._currentMode;
    if (this._modeListenersSetup && this._profileSwitchedHandler) {
      this.eventBus?.off("profile:switched", this._profileSwitchedHandler);
    }
    if (this._modeListenersSetup && this._dataStateChangedHandler) {
      this.eventBus?.off("data:state-changed", this._dataStateChangedHandler);
    }
    this._profileSwitchedHandler = null;
    this._dataStateChangedHandler = null;
    this._modeListenersSetup = false;

    if (this._responseDetachFunction) {
      this._responseDetachFunction();
      this._responseDetachFunction = null;
    }
  }

  // Provide serialisable snapshot representing current mode
  /** @returns {import('../../types/events/component-state.js').ComponentState<'InterfaceModeService'>} */
  getCurrentState() {
    return {
      currentMode: this._currentMode,
      environment: this._currentMode,
      currentEnvironment: this._currentMode,
    };
  }

  // Handle accepted DataCoordinator state during the late-join handshake.
  /** @param {import('../../types/events/component-state.js').ComponentStateReply} reply */
  handleInitialState(reply) {
    if (reply.sender !== "DataCoordinator" || !reply.state.ready) return;

    this._profileContextGeneration += 1;
    this._acceptedAuthorityEpoch = reply.state.authorityEpoch;
    this._acceptedProfileId = reply.state.currentProfile;
    const environment =
      reply.state.currentEnvironment ||
      reply.state.currentProfileData?.currentEnvironment;
    void this.adoptAcceptedMode(environment, { isInitialization: true });
  }
}
