import {
  adoptKeyBrowserViewState,
  isBindsetCollapsed,
  isKeyCategoryCollapsed,
} from "../services/keyBrowserViewState.js";

/** @typedef {import('../../types/events/component-state.js').KeyBrowserViewStateSnapshot} KeyBrowserViewStateSnapshot */
/**
 * @typedef {{
 *   cache: { keyBrowserViewState: KeyBrowserViewStateSnapshot | null },
 *   pendingInitialRender: boolean,
 *   document: Document,
 *   hasRequiredData: () => boolean,
 *   performInitialRender: () => void,
 *   cacheKeyBrowserViewState: (state: KeyBrowserViewStateSnapshot) => boolean,
 *   reconcileKeyBrowserViewState: () => void
 * }} KeyBrowserViewConsumer
 */

/**
 * @param {KeyBrowserViewConsumer} consumer
 * @param {KeyBrowserViewStateSnapshot} candidate
 */
export function cacheViewState(consumer, candidate) {
  const accepted = adoptKeyBrowserViewState(
    candidate,
    consumer.cache.keyBrowserViewState,
  );
  if (!accepted) return false;
  consumer.cache.keyBrowserViewState = accepted;
  return true;
}

/** @param {KeyBrowserViewConsumer} consumer */
export function completeInitialRender(consumer) {
  if (!consumer.pendingInitialRender || !consumer.hasRequiredData()) return;
  consumer.pendingInitialRender = false;
  consumer.performInitialRender();
}

/**
 * One adoption path for live broadcasts and late-join replies. Existing DOM is
 * reconciled only after a predecessor snapshot has already enabled a paint.
 *
 * @param {KeyBrowserViewConsumer} consumer
 * @param {KeyBrowserViewStateSnapshot} candidate
 */
export function acceptViewState(consumer, candidate) {
  const hadState = consumer.cache.keyBrowserViewState !== null;
  if (!consumer.cacheKeyBrowserViewState(candidate)) return false;
  if (hadState && !consumer.pendingInitialRender) {
    consumer.reconcileKeyBrowserViewState();
  } else {
    completeInitialRender(consumer);
  }
  return true;
}

/**
 * Reconcile collapse state without replacing the rendered key-browser graph.
 *
 * @param {KeyBrowserViewConsumer} consumer
 */
export function reconcileViewStateDom(consumer) {
  const grid = consumer.document.getElementById("keyGrid");
  const state = consumer.cache.keyBrowserViewState;
  if (!grid || !state) return;

  for (const category of grid.querySelectorAll(".category")) {
    const header = category.querySelector("h4[data-category]");
    if (!(header instanceof HTMLElement)) continue;
    const categoryId = header.dataset.category;
    if (!categoryId) continue;
    const isCollapsed = isKeyCategoryCollapsed(
      state,
      categoryId,
      header.dataset.mode || "command",
    );
    header.classList.toggle("collapsed", isCollapsed);
    category
      .querySelector(".category-commands")
      ?.classList.toggle("collapsed", isCollapsed);
  }

  for (const section of grid.querySelectorAll(".bindset-section")) {
    if (!(section instanceof HTMLElement)) continue;
    const bindsetName = section.dataset.bindset;
    if (!bindsetName) continue;
    const isCollapsed = isBindsetCollapsed(state, bindsetName);
    for (const selector of [".bindset-header", ".bindset-content", ".twisty"]) {
      section
        .querySelector(selector)
        ?.classList.toggle("collapsed", isCollapsed);
    }
  }
}
