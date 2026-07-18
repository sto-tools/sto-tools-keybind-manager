import ComponentBase from "../ComponentBase.js";
import {
  applyCommandCategoryCollapse,
  applyCommandGroupCollapse,
  cloneCommandPresentationState,
  isCommandCategoryCollapsed,
  isCommandGroupCollapsed,
  nextCommandPresentationAuthorityEpoch,
  readCommandPresentationState,
  writeCommandCategoryCollapse,
  writeCommandGroupCollapse,
} from "./commandPresentationState.js";

/**
 * Owns the durable presentation preferences shared by the command library and
 * stabilized command-chain groups. UIs consume one complete broadcast/cache
 * snapshot and use RPC only to request state transitions.
 */
export default class CommandPresentationService extends ComponentBase {
  /**
   * @param {{
   *   eventBus?: import('./serviceTypes.js').EventBus,
   *   localStorage?: import('./commandPresentationState.js').CommandPresentationStorage
   * }} [options]
   */
  constructor({ eventBus, localStorage = globalThis.localStorage } = {}) {
    super(eventBus);
    this.componentName = "CommandPresentationService";
    this.localStorage = localStorage;
    this.presentationState = readCommandPresentationState(this.localStorage, {
      authorityEpoch: nextCommandPresentationAuthorityEpoch(),
      revision: 0,
    });

    /** @type {Array<() => void>} */
    this._responseDetachFunctions = [];
    this.setupRequestHandlers();
  }

  setupRequestHandlers() {
    if (!this.eventBus || this._responseDetachFunctions.length > 0) return;

    this._responseDetachFunctions.push(
      this.respond("command-presentation:toggle-category", ({ categoryId }) =>
        this.toggleCategory(categoryId),
      ),
      this.respond("command-presentation:toggle-group", ({ groupType }) =>
        this.toggleGroup(groupType),
      ),
    );
  }

  onInit() {
    this.presentationState = readCommandPresentationState(this.localStorage, {
      authorityEpoch: nextCommandPresentationAuthorityEpoch(),
      revision: 0,
    });
    this.setupRequestHandlers();
    this.publishState();
  }

  onDestroy() {
    for (const detach of this._responseDetachFunctions) detach();
    this._responseDetachFunctions = [];
  }

  /**
   * @param {import('../../types/events/component-state.js').CommandPresentationStateSnapshot} [state]
   */
  publishState(state = this.getCurrentState()) {
    this.emit("command-presentation:state-changed", state);
  }

  /** @returns {import('../../types/events/component-state.js').ComponentState<'CommandPresentationService'>} */
  getCurrentState() {
    return cloneCommandPresentationState(this.presentationState);
  }

  /** @param {string} categoryId */
  toggleCategory(categoryId) {
    const isCollapsed = !isCommandCategoryCollapsed(
      this.presentationState,
      categoryId,
    );
    const nextState = applyCommandCategoryCollapse(
      this.presentationState,
      categoryId,
      isCollapsed,
    );
    const publishedState = cloneCommandPresentationState(nextState);

    writeCommandCategoryCollapse(this.localStorage, categoryId, isCollapsed);
    this.presentationState = nextState;
    this.publishState(publishedState);
    return isCollapsed;
  }

  /** @param {import('../../types/events/base.js').CommandGroupType} groupType */
  toggleGroup(groupType) {
    const isCollapsed = !isCommandGroupCollapsed(
      this.presentationState,
      groupType,
    );
    const nextState = applyCommandGroupCollapse(
      this.presentationState,
      groupType,
      isCollapsed,
    );
    const publishedState = cloneCommandPresentationState(nextState);

    writeCommandGroupCollapse(this.localStorage, groupType, isCollapsed);
    this.presentationState = nextState;
    this.publishState(publishedState);
    return isCollapsed;
  }
}
