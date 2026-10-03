import ComponentBase from "../ComponentBase.js";
import { ScalarOwnerProtocol } from "./scalarOwnerProtocol.js";
import {
  materializeCommandCategoryRequest,
  materializeCommandGroupRequest,
} from "./scalarMutationBoundary.js";
import {
  applyCommandCategoryCollapse,
  applyCommandGroupCollapse,
  cloneCommandPresentationState,
  isCommandCategoryCollapsed,
  isCommandGroupCollapsed,
  nextCommandPresentationAuthorityEpoch,
  readCommandPresentationState,
} from "./commandPresentationState.js";

/**
 * Owns the durable presentation preferences shared by the command library and
 * stabilized command-chain groups. UIs consume one complete broadcast/cache
 * snapshot and use RPC only to request state transitions.
 */
export default class CommandPresentationService extends ComponentBase {
  /** @type {import('../storage/CommandPresentationPersistencePort.js').CommandPresentationPersistencePort} */
  #persistence;
  /** @type {ScalarOwnerProtocol} */
  #protocol;
  /** @type {Promise<void>} */
  initialStateReady = Promise.resolve();

  /**
   * @param {{
   *   eventBus?: import('./serviceTypes.js').EventBus,
   *   persistence: import('../storage/CommandPresentationPersistencePort.js').CommandPresentationPersistencePort
   * }} options
   */
  constructor({ eventBus, persistence }) {
    super(eventBus);
    this.componentName = "CommandPresentationService";
    this.#persistence = persistence;
    this.presentationState = readCommandPresentationState(
      { collapsedCategories: [], collapsedGroups: [] },
      {
        authorityEpoch: 0,
        revision: 0,
      },
    );

    /** @type {Array<() => void>} */
    this._responseDetachFunctions = [];
    this.#protocol = new ScalarOwnerProtocol(
      this,
      this.componentName,
      eventBus ?? persistence,
    );
    this.#hydrate();
  }

  setupRequestHandlers() {
    if (
      !this.eventBus ||
      !this.#protocol.ready ||
      this._responseDetachFunctions.length > 0
    )
      return;

    this._responseDetachFunctions.push(
      this.respond("command-presentation:toggle-category", (payload) => {
        const categoryId = materializeCommandCategoryRequest(payload);
        return this.#protocol.enqueue((assertCurrent) =>
          this.#toggleCategory(categoryId, assertCurrent),
        );
      }),
      this.respond("command-presentation:toggle-group", (payload) => {
        const groupType = materializeCommandGroupRequest(payload);
        return this.#protocol.enqueue((assertCurrent) =>
          this.#toggleGroup(groupType, assertCurrent),
        );
      }),
    );
  }

  onInit() {
    this.#hydrate(() => {
      this.setupRequestHandlers();
      this.publishState();
    });
  }

  onDestroy() {
    this.#protocol.cancel();
  }

  /** @param {() => void} [afterLoad] */
  #hydrate(afterLoad) {
    const loading = this.#protocol.activate((assertCurrent) => {
      const data = this.#persistence.load();
      assertCurrent();
      const nextState = readCommandPresentationState(data, {
        authorityEpoch: nextCommandPresentationAuthorityEpoch(),
        revision: 0,
      });
      assertCurrent();
      this.presentationState = nextState;
    }, afterLoad);
    this.initialStateReady = Promise.resolve(loading);
    void this.initialStateReady.catch(() => undefined);
  }

  /** @param {{name?: string, replyTopic?: import('../../types/events/dynamic.js').ComponentReplyTopic}} registration */
  _onComponentRegister(registration) {
    if (this.#protocol.ready) super._onComponentRegister(registration);
  }

  /**
   * @param {import('../../types/events/component-state.js').CommandPresentationStateSnapshot} [state]
   */
  publishState(state = this.getCurrentState()) {
    return this.emit("command-presentation:state-changed", state, {
      synchronous: true,
    });
  }

  /** @returns {import('../../types/events/component-state.js').ComponentState<'CommandPresentationService'>} */
  getCurrentState() {
    return cloneCommandPresentationState(this.presentationState);
  }

  /** @param {string} categoryId */
  toggleCategory(categoryId) {
    const safeCategory = materializeCommandCategoryRequest({ categoryId });
    return this.#protocol.runDirect((assertCurrent) =>
      this.#toggleCategory(safeCategory, assertCurrent),
    );
  }

  /** @param {string} categoryId @param {() => void} assertCurrent */
  #toggleCategory(categoryId, assertCurrent) {
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

    this.#persistence.replaceCategory(categoryId, isCollapsed);
    assertCurrent();
    this.presentationState = nextState;
    return {
      result: isCollapsed,
      settlement: this.publishState(publishedState),
    };
  }

  /** @param {import('../../types/events/base.js').CommandGroupType} groupType */
  toggleGroup(groupType) {
    const safeGroup = materializeCommandGroupRequest({ groupType });
    return this.#protocol.runDirect((assertCurrent) =>
      this.#toggleGroup(safeGroup, assertCurrent),
    );
  }

  /** @param {import('../../types/events/base.js').CommandGroupType} groupType @param {() => void} assertCurrent */
  #toggleGroup(groupType, assertCurrent) {
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

    this.#persistence.replaceGroup(groupType, isCollapsed);
    assertCurrent();
    this.presentationState = nextState;
    return {
      result: isCollapsed,
      settlement: this.publishState(publishedState),
    };
  }
}
