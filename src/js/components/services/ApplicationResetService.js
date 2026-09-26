import ComponentBase from "../ComponentBase.js";
import { orchestrateApplicationReset } from "./applicationResetOrchestrator.js";

export default class ApplicationResetService extends ComponentBase {
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
      (payload = {}) =>
        orchestrateApplicationReset({
          payload,
          runPreferencesResetTransition: this.runPreferencesResetTransition,
          runDataResetTransition: this.runDataResetTransition,
        }),
    );
  }

  onDestroy() {
    this._detachResetResponder?.();
    this._detachResetResponder = null;
  }
}
