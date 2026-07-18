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
 *   i18n: { t: (key: string) => string },
 *   hasRequiredData: () => boolean,
 *   performInitialRender: () => void,
 *   render: () => Promise<void>,
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
 * Project the accepted owner mode without reading persistence or maintaining a
 * second UI-owned mode value.
 *
 * @param {KeyBrowserViewConsumer} consumer
 * @param {KeyBrowserViewStateSnapshot['mode']} mode
 */
export function projectViewModeButton(consumer, mode) {
  const toggleButton = consumer.document.getElementById("toggleKeyViewBtn");
  if (!toggleButton) return;

  const icon = toggleButton.querySelector("i") || toggleButton;
  if (mode === "categorized") {
    icon.className = "fas fa-sitemap";
    toggleButton.title = consumer.i18n.t("switch_to_key_type_view");
  } else if (mode === "key-types") {
    icon.className = "fas fa-th";
    toggleButton.title = consumer.i18n.t("switch_to_grid_view");
  } else {
    icon.className = "fas fa-list";
    toggleButton.title = consumer.i18n.t("switch_to_categorized_view");
  }
}

/**
 * One adoption path for live broadcasts and late-join replies. Existing DOM is
 * reconciled only after a predecessor snapshot has already enabled a paint.
 *
 * @param {KeyBrowserViewConsumer} consumer
 * @param {KeyBrowserViewStateSnapshot} candidate
 */
export function acceptViewState(consumer, candidate) {
  const predecessor = consumer.cache.keyBrowserViewState;
  const hadState = predecessor !== null;
  if (!consumer.cacheKeyBrowserViewState(candidate)) return false;
  const accepted = consumer.cache.keyBrowserViewState;
  if (!accepted) return false;

  const modeChanged = predecessor?.mode !== accepted.mode;
  if (modeChanged) projectViewModeButton(consumer, accepted.mode);

  if (hadState && !consumer.pendingInitialRender) {
    if (modeChanged) {
      void consumer.render();
    } else {
      consumer.reconcileKeyBrowserViewState();
    }
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
