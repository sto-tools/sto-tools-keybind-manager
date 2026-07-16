const componentStateOwners = Object.freeze(
  /** @satisfies {Record<import('../types/events/component-state.js').ComponentStateSender, true>} */ ({
    BindsetSelectorService: true,
    BindsetService: true,
    CommandChainService: true,
    CommandLibraryUI: true,
    DataCoordinator: true,
    DataService: true,
    ExportService: true,
    InterfaceModeService: true,
    ParameterCommandService: true,
    PreferencesService: true,
    ProfileUI: true,
    SelectionService: true,
    StorageService: true,
    VFXManagerService: true,
  }),
);

/**
 * Immutable runtime view used by protocol inventory checks. The source object
 * remains the membership authority so its Record annotation enforces that
 * every typed sender is represented exactly once.
 */
export const componentStateOwnerNames = Object.freeze(
  /** @type {import('../types/events/component-state.js').ComponentStateSender[]} */ (
    Object.keys(componentStateOwners)
  ),
);

let replySequence = 0;

/**
 * Create an isolated reply topic even when same-class components initialize in
 * the same millisecond.
 *
 * @param {string} componentName
 * @returns {import('../types/events/dynamic.js').ComponentReplyTopic}
 */
export function nextComponentReplyTopic(componentName) {
  replySequence += 1;
  return /** @type {import('../types/events/dynamic.js').ComponentReplyTopic} */ (
    `component:registered:reply:${componentName}:${Date.now()}-${replySequence}`
  );
}

/**
 * The polymorphic base class cannot express the relationship between a
 * component's runtime name and its getCurrentState() override. The exhaustive
 * owner table and explicit override return annotations guard this one erasure.
 * Stateless components do not send null replies.
 *
 * @param {string} sender
 * @param {unknown} state
 * @returns {import('../types/events/component-state.js').ComponentStateReply | null}
 */
export function createComponentStateReply(sender, state) {
  if (
    state == null ||
    !Object.prototype.hasOwnProperty.call(componentStateOwners, sender)
  ) {
    return null;
  }

  return /** @type {import('../types/events/component-state.js').ComponentStateReply} */ ({
    sender,
    state,
  });
}
