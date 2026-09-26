import ComponentBase from "../ComponentBase.js";
import eventBus from "../../core/eventBus.js";

/**
 * Retirement-bound compatibility shell.
 *
 * Project-root ownership, reads, writes, repair, backup, caching, and
 * publication belong exclusively to DataCoordinator and ProjectRepository.
 * The export remains until the compatibility surface is removed in Task 10.
 */
export default class StorageService extends ComponentBase {
  /** @param {{eventBus?: import('./serviceTypes.js').EventBus}} [options] */
  constructor({ eventBus: bus = eventBus } = {}) {
    super(bus);
    this.componentName = "StorageService";
  }

  /**
   * Preserve the typed late-join component contract until Task 10 removes the
   * compatibility shell. This exposes lifecycle state only, never project data
   * or a persistence capability.
   * @returns {import('../../types/events/component-state.js').ComponentState<'StorageService'>}
   */
  getCurrentState() {
    return { service: this, isReady: this.isInitialized() };
  }
}
