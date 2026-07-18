import {
  adoptKeyBrowserViewState,
  isBindsetCollapsed,
  isKeyCategoryCollapsed,
} from "../services/keyBrowserViewState.js";
import { asHTMLElement, asHTMLInputElement, isElement } from "./uiTypes.js";

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
 * @typedef {{
 *   document: Document,
 *   _errorTimer: ReturnType<typeof setTimeout> | null
 * }} KeyBrowserErrorConsumer
 */

/** @param {KeyBrowserErrorConsumer} consumer */
export function clearKeyBrowserError(consumer) {
  if (consumer._errorTimer !== null) clearTimeout(consumer._errorTimer);
  consumer._errorTimer = null;
  const errorElement = consumer.document.getElementById("bindsetError");
  if (!errorElement) return;
  errorElement.textContent = "";
  errorElement.style.display = "none";
}

/**
 * @param {KeyBrowserErrorConsumer} consumer
 * @param {string} message
 */
export function showKeyBrowserError(consumer, message) {
  const errorElement = consumer.document.getElementById("bindsetError");
  if (!errorElement) return;
  errorElement.textContent = message;
  errorElement.style.display = "";
  if (consumer._errorTimer !== null) clearTimeout(consumer._errorTimer);
  consumer._errorTimer = setTimeout(() => {
    errorElement.style.display = "none";
    consumer._errorTimer = null;
  }, 4000);
}

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
    const header = asHTMLElement(category.querySelector("h4[data-category]"));
    if (!header) continue;
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
    const sectionElement = asHTMLElement(section);
    if (!sectionElement) continue;
    const bindsetName = sectionElement.dataset.bindset;
    if (!bindsetName) continue;
    const isCollapsed = isBindsetCollapsed(state, bindsetName);
    for (const selector of [".bindset-header", ".bindset-content", ".twisty"]) {
      sectionElement
        .querySelector(selector)
        ?.classList.toggle("collapsed", isCollapsed);
    }
  }
}

/**
 * Convert a click inside the regenerated key grid into one controller action.
 * The renderer owns inert data attributes; the lifecycle controller owns the
 * single delegated listener and every resulting RPC/workflow.
 *
 * @param {EventTarget | null} target
 * @param {HTMLElement} grid
 * @returns {
 *   | { type: 'select-key', keyName: string, bindsetName: string | null }
 *   | { type: 'toggle-category', categoryId: string, mode: string }
 *   | { type: 'toggle-bindset', bindsetName: string }
 *   | { type: 'toggle-bindset-menu', menu: HTMLElement }
 *   | { type: 'manage-bindset', operation: 'create' | 'clone' | 'rename' | 'delete', bindsetName: string }
 *   | null
 * }
 */
export function readKeyGridAction(target, grid) {
  if (!isElement(target)) return null;
  const actionElement = target.closest("[data-action]");
  const actionHtmlElement = asHTMLElement(actionElement);
  if (!actionHtmlElement || !grid.contains(actionHtmlElement)) return null;

  const action = actionHtmlElement.dataset.action;
  if (action === "select-key") {
    const keyName = actionHtmlElement.dataset.key;
    if (!keyName) return null;
    const section = asHTMLElement(
      actionHtmlElement.closest(".bindset-section"),
    );
    return {
      type: "select-key",
      keyName,
      bindsetName: section?.dataset.bindset || null,
    };
  }

  if (action === "toggle-category") {
    const categoryId = actionHtmlElement.dataset.category;
    if (!categoryId) return null;
    return {
      type: "toggle-category",
      categoryId,
      mode: actionHtmlElement.dataset.mode || "command",
    };
  }

  if (action === "toggle-bindset") {
    const bindsetName = actionHtmlElement.dataset.bindset;
    return bindsetName ? { type: "toggle-bindset", bindsetName } : null;
  }

  if (action === "bindset-menu") {
    const section = actionHtmlElement.closest(".bindset-section");
    const menu = asHTMLElement(
      section?.querySelector(".bindset-menu-dropdown"),
    );
    return menu ? { type: "toggle-bindset-menu", menu } : null;
  }

  if (
    action === "create" ||
    action === "clone" ||
    action === "rename" ||
    action === "delete"
  ) {
    const bindsetName = actionHtmlElement.dataset.bindset;
    return bindsetName
      ? { type: "manage-bindset", operation: action, bindsetName }
      : null;
  }

  return null;
}

/** @param {Document} document */
export function closeBindsetMenus(document) {
  for (const menu of document.querySelectorAll(".bindset-menu-dropdown.open")) {
    menu.classList.remove("open");
  }
}

/**
 * @param {Document} document
 * @param {HTMLElement} menu
 */
export function toggleBindsetMenu(document, menu) {
  const shouldOpen = !menu.classList.contains("open");
  closeBindsetMenus(document);
  menu.classList.toggle("open", shouldOpen);
}

/**
 * Apply filtering to the already-rendered graph without making the DOM a
 * second source of key-browser state.
 *
 * @param {Document} document
 * @param {string} [filter]
 */
export function filterKeyGrid(document, filter = "") {
  const filterLower = String(filter || "").toLowerCase();
  const grid = document.getElementById("keyGrid");
  if (!grid) return;

  for (const item of grid.querySelectorAll(".key-item[data-key]")) {
    const itemElement = asHTMLElement(item);
    if (!itemElement) continue;
    const keyName = itemElement.dataset.key || "";
    itemElement.style.display =
      !filterLower || keyName.toLowerCase().includes(filterLower)
        ? "flex"
        : "none";
  }

  for (const item of grid.querySelectorAll(".command-item[data-key]")) {
    const itemElement = asHTMLElement(item);
    if (!itemElement) continue;
    const keyName = itemElement.dataset.key || "";
    itemElement.style.display =
      !filterLower || keyName.toLowerCase().includes(filterLower)
        ? "flex"
        : "none";
  }

  for (const category of grid.querySelectorAll(".category")) {
    const categoryElement = asHTMLElement(category);
    if (!categoryElement) continue;
    const matchingKey = Array.from(
      categoryElement.querySelectorAll(".key-item[data-key]"),
    ).some((item) => asHTMLElement(item)?.style.display !== "none");
    categoryElement.style.display =
      !filterLower || matchingKey ? "block" : "none";
  }

  const searchButton = document.getElementById("keySearchBtn");
  if (searchButton) {
    const active = Boolean(filterLower);
    searchButton.classList.toggle("active", active);
    searchButton.setAttribute("aria-pressed", String(active));
  }
}

/** @param {Document} document */
export function showAllKeyGridItems(document) {
  filterKeyGrid(document, "");
  const input = asHTMLInputElement(document.getElementById("keyFilter"));
  if (input) input.value = "";
}

/** @param {Document} document */
export function toggleKeySearchInput(document) {
  const input = asHTMLInputElement(document.getElementById("keyFilter"));
  if (!input) return false;
  const expanded = input.classList.toggle("expanded");
  if (expanded) input.focus();
  else input.blur();
  return expanded;
}

/**
 * @param {Document} document
 * @param {string} environment
 * @param {(callback: FrameRequestCallback) => number | void} schedule
 */
export function scheduleKeyBrowserVisibility(document, environment, schedule) {
  schedule(() => {
    const container = document.querySelector(".key-selector-container");
    const containerElement = asHTMLElement(container);
    if (!containerElement) {
      console.warn("[KeyBrowserUI] Key selector container not found in DOM");
      return;
    }
    if (environment === "alias") {
      containerElement.style.setProperty("display", "none", "important");
    } else {
      containerElement.style.removeProperty("display");
    }
  });
}
