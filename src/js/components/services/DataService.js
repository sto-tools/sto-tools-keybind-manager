import ComponentBase from "../ComponentBase.js";
import { getDefaultProfiles } from "../../data/defaultProfiles.js";

/**
 * DataService - retirement-bound compatibility view over module-owned data.
 * Runtime static-data consumers use direct module imports; this shell remains
 * a late-join snapshot owner until its protocol requirement is explicitly
 * retired.
 */
export default class DataService extends ComponentBase {
  /** @param {{ eventBus?: import('./serviceTypes.js').EventBus, data?: import('./serviceTypes.js').STOData | null }} [options] */
  constructor({ eventBus, data = null } = {}) {
    super(eventBus);
    this.componentName = "DataService";

    /** @type {import('./serviceTypes.js').STOData} */
    this.data = data || {};
  }

  // Provide current state for late-join handshake
  /** @returns {import('../../types/events/component-state.js').ComponentState<'DataService'>} */
  getCurrentState() {
    return {
      defaultProfiles: getDefaultProfiles(this.data.defaultProfiles),
      hasCommands: !!(this.data && this.data.commands),
      dataAvailable: Object.keys(this.data).length > 0,
    };
  }
}
