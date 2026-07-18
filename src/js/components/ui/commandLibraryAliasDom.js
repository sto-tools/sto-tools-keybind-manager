import {
  adoptCommandPresentationState,
  isCommandCategoryCollapsed,
} from "../services/commandPresentationState.js";

/** @typedef {import('../../types/events/component-state.js').CommandPresentationStateSnapshot} CommandPresentationStateSnapshot */
/**
 * @typedef {import('../services/serviceTypes.js').AliasDefinition & {
 *   displayName?: string,
 *   _displayName?: string,
 *   virtual?: boolean
 * }} LibraryAlias
 * @typedef {[string, LibraryAlias]} LibraryAliasEntry
 */

/** @param {string} [name] */
export function sanitizeCommandLibraryBindsetName(name = "") {
  let sanitized = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (/^[0-9]/.test(sanitized)) sanitized = `bs_${sanitized}`;
  return sanitized;
}

/**
 * @param {import('../services/serviceTypes.js').ProfileData} profile
 * @param {import('../services/serviceTypes.js').ServicePreferences} preferences
 * @param {(key: string) => string} translate
 * @returns {LibraryAliasEntry[]}
 */
export function projectCommandLibraryBindsetAliases(
  profile,
  preferences,
  translate,
) {
  if (!preferences.bindsetsEnabled || !preferences.bindToAliasMode) return [];

  try {
    const aliases = /** @type {LibraryAliasEntry[]} */ ([]);
    const bindsets = profile.bindsets || {};
    for (const environment of ["space", "ground"]) {
      for (const bindsetName of ["Primary Bindset", ...Object.keys(bindsets)]) {
        const aliasName = `sto_kb_bindset_enable_${environment}_${sanitizeCommandLibraryBindsetName(bindsetName)}`;
        const translatedBindsetName =
          bindsetName === "Primary Bindset"
            ? translate("primary_bindset")
            : bindsetName;
        const displayName = `${translate("bindsets")}: ${translate(environment)} - ${translate("bindset_enable")} ${translatedBindsetName}`;
        aliases.push([
          aliasName,
          {
            type: "bindset-alias",
            description: displayName,
            commands: aliasName,
            displayName,
          },
        ]);
      }
    }
    return aliases;
  } catch {
    return [];
  }
}

/**
 * Build one alias category without interpreting profile-owned strings as HTML.
 *
 * @param {{
 *   document: Document,
 *   translate: (key: string) => string,
 *   aliases: LibraryAliasEntry[],
 *   categoryType: string,
 *   titleKey: string,
 *   iconClass: string,
 *   collapsed: boolean
 * }} options
 * @returns {HTMLElement}
 */
export function createCommandLibraryAliasCategory({
  document,
  translate,
  aliases,
  categoryType,
  titleKey,
  iconClass,
  collapsed,
}) {
  const element = document.createElement("div");
  element.className = "category";
  element.dataset.category = categoryType;

  const isVertigo = categoryType === "vertigo-aliases";
  const isBindset = categoryType === "bindset-aliases";
  const itemIcon = isVertigo ? "👁️" : isBindset ? "🔧" : "🎭";
  const itemClass = isVertigo
    ? "command-item vertigo-alias-item"
    : isBindset
      ? "command-item bindset-alias-item"
      : "command-item alias-item";

  const header = document.createElement("h4");
  header.className = collapsed ? "collapsed" : "";
  header.dataset.category = categoryType;

  const chevron = document.createElement("i");
  chevron.className = "fas fa-chevron-right category-chevron";
  header.appendChild(chevron);

  const categoryIcon = document.createElement("i");
  categoryIcon.className = iconClass;
  header.appendChild(categoryIcon);
  header.appendChild(document.createTextNode(` ${translate(titleKey)} `));

  const count = document.createElement("span");
  count.className = "command-count";
  count.textContent = `(${aliases.length})`;
  header.appendChild(count);

  const commands = document.createElement("div");
  commands.className = `category-commands${collapsed ? " collapsed" : ""}`;
  for (const [name, alias] of aliases) {
    const item = document.createElement("div");
    item.className = itemClass;
    item.dataset.alias = name;
    item.title = String(alias.description || alias.commands || "");
    item.textContent = `${itemIcon} ${alias.displayName || alias._displayName || name}`;
    commands.appendChild(item);
  }

  element.appendChild(header);
  element.appendChild(commands);
  projectCommandLibraryCategoryCollapse(element, collapsed);
  return element;
}

/**
 * Project an accepted owner value into one static or alias category.
 *
 * @param {Element} element
 * @param {boolean} collapsed
 */
export function projectCommandLibraryCategoryCollapse(element, collapsed) {
  const header = element.querySelector("h4");
  const commands = element.querySelector(".category-commands");
  const chevron = header?.querySelector(".category-chevron");
  header?.classList.toggle("collapsed", collapsed);
  commands?.classList.toggle("collapsed", collapsed);
  if (chevron && "style" in chevron) {
    /** @type {HTMLElement} */ (chevron).style.transform = collapsed
      ? "rotate(0deg)"
      : "rotate(90deg)";
  }
}

/**
 * @param {{
 *   cache: { commandPresentationState: CommandPresentationStateSnapshot | null },
 *   document: Document,
 *   eventListenersSetup: boolean,
 *   pendingInitialRender: boolean,
 *   hasRequiredData: () => boolean,
 *   performInitialRender: () => void
 * }} consumer
 */
export function reconcileCommandLibraryPresentation(consumer) {
  const state = consumer.cache.commandPresentationState;
  if (!state) return;

  /** @type {Set<Element>} */
  const categories = new Set();
  for (const id of [
    "commandCategoriesList",
    "aliasCategoriesList",
    "commandCategories",
  ]) {
    const container = consumer.document.getElementById(id);
    container
      ?.querySelectorAll(".category[data-category]")
      .forEach((category) => categories.add(category));
  }
  for (const category of categories) {
    const categoryId = category.getAttribute("data-category");
    if (!categoryId) continue;
    projectCommandLibraryCategoryCollapse(
      category,
      isCommandCategoryCollapsed(state, categoryId),
    );
  }
}

/**
 * Accept one complete owner snapshot for both live and late-join delivery.
 *
 * @param {Parameters<typeof reconcileCommandLibraryPresentation>[0]} consumer
 * @param {unknown} candidate
 */
export function acceptCommandLibraryPresentation(consumer, candidate) {
  const predecessor = consumer.cache.commandPresentationState;
  const accepted = adoptCommandPresentationState(candidate, predecessor);
  if (!accepted) return false;
  consumer.cache.commandPresentationState = accepted;

  if (!consumer.eventListenersSetup) return true;
  if (consumer.pendingInitialRender && consumer.hasRequiredData()) {
    consumer.pendingInitialRender = false;
    consumer.performInitialRender();
  } else if (predecessor) {
    reconcileCommandLibraryPresentation(consumer);
  }
  return true;
}
