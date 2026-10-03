import ComponentBase from "../ComponentBase.js";
import { orchestrateApplicationReset } from "./applicationResetOrchestrator.js";
import {
  createApplicationResetCheckpoint,
  applicationResetCheckpointState,
} from "./applicationResetCheckpoint.js";
import { materializeMutationRequest } from "./mutationRequestBoundary.js";

export default class ApplicationResetService extends ComponentBase {
  /** @type {import('../../types/storage-contracts.js').ApplicationResetCheckpoint | undefined} */
  #pendingReset;
  /** @type {Promise<import('../../types/rpc/application.js').ApplicationResetResult> | null} */
  #inFlight = null;
  #resetGeneration = 0;
  /**
   * @param {{
   *   eventBus?: import('./serviceTypes.js').EventBus | null,
   *   runPreferencesResetTransition?: import('../../types/storage-contracts.js').ApplicationPreferencesResetTransitionRunner | null,
   *   runDataResetTransition?: import('../../types/storage-contracts.js').ApplicationDataResetTransitionRunner | null
   * }} [options]
   */
  constructor({
    eventBus = null,
    runPreferencesResetTransition = null,
    runDataResetTransition = null,
  } = {}) {
    super(eventBus);
    this.componentName = "ApplicationResetService";
    this.runPreferencesResetTransition = runPreferencesResetTransition;
    this.runDataResetTransition = runDataResetTransition;
    this._detachResetResponder = null;
  }

  onInit() {
    if (this._detachResetResponder || !this.eventBus) return;
    this._detachResetResponder = this.respond(
      "application:reset",
      (payload = {}) => this.reset(payload),
    );
  }

  onDestroy() {
    this._detachResetResponder?.();
    this._detachResetResponder = null;
    this.#resetGeneration += 1;
    const saga = applicationResetCheckpointState(this.#pendingReset);
    if (saga) saga.active = false;
    this.#pendingReset = undefined;
    this.#inFlight = null;
  }

  /** @param {unknown} payload */
  reset(payload) {
    if (this.destroyed)
      return orchestrateApplicationReset({
        payload,
        runPreferencesResetTransition: async () => {
          throw new Error("operation_cancelled");
        },
        runDataResetTransition: async () => {
          throw new Error("operation_cancelled");
        },
      });
    // Invalid callers cannot inspect, join, replace or resume the private saga.
    try {
      materializeMutationRequest(payload, []);
    } catch {
      return orchestrateApplicationReset({
        payload,
        runPreferencesResetTransition: this.runPreferencesResetTransition,
        runDataResetTransition: this.runDataResetTransition,
      });
    }
    // A joining action starts no publications, so it inherits the business
    // outcome, never the initiating action's listener-settled reply.
    if (this.#inFlight)
      return this.#inFlight.then((result) => structuredClone(result));
    this.#pendingReset ??= createApplicationResetCheckpoint();
    const generation = this.#resetGeneration;
    /** @type {(result: import('../../types/rpc/application.js').ApplicationResetResult) => void} */
    let recordWorkCompletion = () => {};
    /** @type {(reason: unknown) => void} */
    let rejectWork = () => {};
    /** @type {Promise<import('../../types/rpc/application.js').ApplicationResetResult>} */
    const work = new Promise((resolve, reject) => {
      recordWorkCompletion = resolve;
      rejectWork = reject;
    });
    // Install admission before invoking even a synchronous owner capability.
    this.#inFlight = work;
    // The initiating caller observes exceptional rejection via operation;
    // this private promise may have no joining caller to observe it.
    void work.catch(() => {});
    const operation = orchestrateApplicationReset({
      payload,
      checkpoint: this.#pendingReset,
      runPreferencesResetTransition: this.runPreferencesResetTransition,
      runDataResetTransition: this.runDataResetTransition,
      recordWorkCompletion,
      recordWorkFailure: rejectWork,
    });
    void operation.then(
      (result) => {
        // Early unavailable outcomes and exceptional pre-work exits cannot
        // strand a follower. Resolving twice leaves the fixed work result intact.
        recordWorkCompletion(result);
        if (generation !== this.#resetGeneration) return;
        this.#inFlight = null;
        if (result.success) this.#pendingReset = undefined;
      },
      (error) => {
        rejectWork(error);
        if (generation === this.#resetGeneration) this.#inFlight = null;
      },
    );
    return operation;
  }
}
