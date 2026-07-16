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
 *   iconClass: string
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
}) {
  const element = document.createElement("div");
  element.className = "category";
  element.dataset.category = categoryType;

  const storageKey = `commandCategory_${categoryType}_collapsed`;
  const storage = document.defaultView?.localStorage;
  const isCollapsed = storage?.getItem(storageKey) === "true";

  const isVertigo = categoryType === "vertigo-aliases";
  const isBindset = categoryType === "bindset-aliases";
  const itemIcon = isVertigo ? "👁️" : isBindset ? "🔧" : "🎭";
  const itemClass = isVertigo
    ? "command-item vertigo-alias-item"
    : isBindset
      ? "command-item bindset-alias-item"
      : "command-item alias-item";

  const header = document.createElement("h4");
  header.className = isCollapsed ? "collapsed" : "";
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
  commands.className = `category-commands${isCollapsed ? " collapsed" : ""}`;
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
  return element;
}
