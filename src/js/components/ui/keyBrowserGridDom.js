import { escapeHtml } from "../../lib/htmlEscape.js";
import {
  isKeyCategoryCollapsed,
  projectBindsetSections,
} from "../services/keyBrowserViewState.js";

/** @typedef {import('../services/serviceTypes.js').StoredCommand} StoredCommand */
/** @typedef {import('../services/serviceTypes.js').ProfileData} KeyProfile */
/** @typedef {import('../../types/events/component-state.js').KeyBrowserViewStateSnapshot} KeyBrowserViewStateSnapshot */
/** @typedef {import('../../types/events/base.js').KeyViewMode} KeyViewMode */
/** @typedef {Record<string, StoredCommand[]>} KeyMap */
/**
 * @typedef {{
 *   name: string,
 *   icon: string,
 *   keys: string[],
 *   priority?: number
 * }} KeyCategory
 */
/** @typedef {Record<string, KeyCategory>} KeyCategories */
/**
 * @typedef {{
 *   document: Document,
 *   i18n: { t: (key: string) => string },
 *   mode: KeyViewMode,
 *   profile: KeyProfile,
 *   environment: string,
 *   primaryKeyMap: KeyMap,
 *   viewState: KeyBrowserViewStateSnapshot,
 *   showBindsetSections: boolean,
 *   selectedKey: string | null,
 *   activeBindset: string | null | undefined,
 *   sortKeys: (keys: string[]) => string[] | Promise<string[]>,
 *   categorizeByCommand: (keysWithCommands: KeyMap, allKeys: string[]) => KeyCategories | Promise<KeyCategories>,
 *   categorizeByType: (keysWithCommands: KeyMap, allKeys: string[]) => KeyCategories | Promise<KeyCategories>
 * }} KeyBrowserGridInput
 */

const primaryBindset = "Primary Bindset";

/** @param {string} keyName */
function formatKeyName(keyName) {
  return escapeHtml(keyName).replace(/\+/g, "<br>+");
}

/** @param {StoredCommand} command */
function hasCommandText(command) {
  if (typeof command === "string") return command.trim() !== "";
  return Boolean(command && command.command?.trim());
}

/**
 * @param {Document} document
 * @param {{ t: (key: string) => string }} i18n
 * @param {string} keyName
 * @param {StoredCommand[]} commands
 * @param {boolean} selected
 */
export function createKeyBrowserKeyElement(
  document,
  i18n,
  keyName,
  commands,
  selected,
) {
  const nonBlank = commands.filter(hasCommandText);
  const element = document.createElement("div");
  element.className = `key-item ${selected ? "active" : ""}`;
  element.dataset.action = "select-key";
  element.dataset.key = keyName;
  element.title = `${keyName}: ${nonBlank.length} ${i18n.t(
    nonBlank.length === 1 ? "command_singular" : "commands",
  )}`;

  const keyLength = keyName.length;
  element.dataset.length =
    keyLength <= 3
      ? "short"
      : keyLength <= 5
        ? "medium"
        : keyLength <= 8
          ? "long"
          : "extra-long";

  const label = document.createElement("div");
  label.className = "key-label";
  label.innerHTML = formatKeyName(keyName);
  element.appendChild(label);

  if (nonBlank.length > 0) {
    const activity = document.createElement("div");
    activity.className = "activity-bar";
    activity.style.width = `${Math.min(nonBlank.length * 15, 100)}%`;
    element.appendChild(activity);

    const count = document.createElement("div");
    count.className = "command-count-badge";
    count.textContent = String(nonBlank.length);
    element.appendChild(count);
  }

  return element;
}

/**
 * @param {KeyBrowserGridInput} input
 * @param {string} keyName
 * @param {KeyMap} keyMap
 * @param {string | null} bindsetName
 */
function keyElementFor(input, keyName, keyMap, bindsetName) {
  const selected =
    keyName === input.selectedKey &&
    (bindsetName === null || input.activeBindset === bindsetName);
  return createKeyBrowserKeyElement(
    input.document,
    input.i18n,
    keyName,
    keyMap[keyName] || [],
    selected,
  );
}

/**
 * @param {KeyBrowserGridInput} input
 * @param {string} categoryId
 * @param {KeyCategory} category
 * @param {string} mode
 * @param {KeyMap} keyMap
 * @param {string | null} bindsetName
 */
export function createKeyBrowserCategoryElement(
  input,
  categoryId,
  category,
  mode,
  keyMap,
  bindsetName,
) {
  const collapsed = isKeyCategoryCollapsed(input.viewState, categoryId, mode);
  const element = input.document.createElement("div");
  element.className = "category";
  element.dataset.category = categoryId;

  const header = input.document.createElement("h4");
  header.classList.toggle("collapsed", collapsed);
  header.dataset.action = "toggle-category";
  header.dataset.category = categoryId;
  header.dataset.mode = mode;

  const chevron = input.document.createElement("i");
  chevron.className = "fas fa-chevron-right category-chevron";
  header.appendChild(chevron);

  const icon = input.document.createElement("i");
  icon.className = category.icon;
  header.appendChild(icon);
  header.appendChild(input.document.createTextNode(category.name));

  const count = input.document.createElement("span");
  count.className = "key-count";
  count.textContent = `(${category.keys.length})`;
  header.appendChild(count);
  element.appendChild(header);

  const commands = input.document.createElement("div");
  commands.className = `category-commands ${collapsed ? "collapsed" : ""}`;
  for (const keyName of category.keys) {
    commands.appendChild(keyElementFor(input, keyName, keyMap, bindsetName));
  }
  element.appendChild(commands);
  return element;
}

/**
 * @param {Document} document
 * @param {'create' | 'clone' | 'rename' | 'delete'} action
 * @param {string} iconClass
 * @param {string} text
 * @param {string} bindsetName
 * @param {boolean} [dangerous]
 */
function createMenuItem(
  document,
  action,
  iconClass,
  text,
  bindsetName,
  dangerous = false,
) {
  const item = document.createElement("div");
  item.className = `bindset-menu-item ${dangerous ? "dangerous" : ""}`;
  item.dataset.action = action;
  item.dataset.bindset = bindsetName;

  const icon = document.createElement("i");
  icon.className = iconClass;
  item.appendChild(icon);
  const label = document.createElement("span");
  label.textContent = text;
  item.appendChild(label);
  return item;
}

/**
 * @param {KeyBrowserGridInput} input
 * @param {HTMLElement} menu
 * @param {string} bindsetName
 */
function appendManagementItems(input, menu, bindsetName) {
  /**
   * @param {'create' | 'clone' | 'rename' | 'delete'} action
   * @param {string} icon
   * @param {string} key
   * @param {boolean} [dangerous]
   */
  const item = (action, icon, key, dangerous = false) =>
    createMenuItem(
      input.document,
      action,
      icon,
      input.i18n.t(key),
      bindsetName,
      dangerous,
    );

  if (bindsetName === primaryBindset) {
    menu.append(
      item("create", "fas fa-plus", "create_bindset"),
      item("clone", "fas fa-copy", "clone_bindset"),
    );
    return;
  }

  menu.append(
    item("clone", "fas fa-copy", "clone_bindset"),
    item("rename", "fas fa-edit", "rename_bindset"),
    item("delete", "fas fa-trash", "delete_bindset", true),
  );
}

/**
 * @param {KeyBrowserGridInput} input
 * @param {HTMLElement} content
 * @param {KeyMap} keyMap
 * @param {string[]} keys
 * @param {string} bindsetName
 */
async function appendBindsetKeys(input, content, keyMap, keys, bindsetName) {
  if (input.mode === "key-types") {
    const categories = await input.categorizeByType(keyMap, keys);
    const categoryOrder = [
      "standard",
      "weapon",
      "system",
      "movement",
      "social",
    ];
    const sorted = Object.entries(categories).sort(([left], [right]) => {
      const leftIndex = categoryOrder.indexOf(left.toLowerCase());
      const rightIndex = categoryOrder.indexOf(right.toLowerCase());
      if (leftIndex === -1 && rightIndex === -1)
        return left.localeCompare(right);
      if (leftIndex === -1) return 1;
      if (rightIndex === -1) return -1;
      return leftIndex - rightIndex;
    });
    for (const [categoryId, category] of sorted) {
      if (category.keys.length === 0) continue;
      content.appendChild(
        createKeyBrowserCategoryElement(
          input,
          categoryId,
          category,
          "type",
          keyMap,
          bindsetName,
        ),
      );
    }
    return;
  }

  if (input.mode === "categorized") {
    const categories = await input.categorizeByCommand(keyMap, keys);
    for (const categoryId of Object.keys(categories).sort()) {
      const category = categories[categoryId];
      if (category.keys.length === 0) continue;
      content.appendChild(
        createKeyBrowserCategoryElement(
          input,
          categoryId,
          {
            name: input.i18n.t(categoryId),
            icon: "fas fa-folder",
            keys: category.keys,
          },
          "command",
          keyMap,
          bindsetName,
        ),
      );
    }
    return;
  }

  const grid = input.document.createElement("div");
  grid.className = "key-grid-subsection";
  for (const keyName of keys) {
    grid.appendChild(keyElementFor(input, keyName, keyMap, bindsetName));
  }
  content.appendChild(grid);
}

/**
 * @param {KeyBrowserGridInput} input
 * @param {string} bindsetName
 * @param {{ keys: string[], isCollapsed: boolean }} section
 * @param {KeyMap} keyMap
 */
export async function createKeyBrowserBindsetSection(
  input,
  bindsetName,
  section,
  keyMap,
) {
  const element = input.document.createElement("div");
  element.className = "bindset-section";
  element.dataset.bindset = bindsetName;

  const header = input.document.createElement("div");
  header.className = "bindset-header command-group-separator";
  header.dataset.action = "toggle-bindset";
  header.dataset.bindset = bindsetName;

  const info = input.document.createElement("div");
  info.className = "bindset-info group-info";
  const twisty = input.document.createElement("i");
  twisty.className = `fas fa-chevron-right twisty ${section.isCollapsed ? "collapsed" : ""}`;
  info.appendChild(twisty);
  const name = input.document.createElement("span");
  name.className = "bindset-name group-title";
  name.textContent = bindsetName;
  info.appendChild(name);
  const count = input.document.createElement("span");
  count.className = "bindset-count";
  count.textContent = `(${section.keys.length})`;
  info.appendChild(count);
  header.appendChild(info);

  const actions = input.document.createElement("div");
  actions.className = "bindset-actions";
  const menuButton = input.document.createElement("button");
  menuButton.className = "control-btn bindset-menu-btn";
  menuButton.dataset.action = "bindset-menu";
  menuButton.dataset.bindset = bindsetName;
  menuButton.title = input.i18n.t("bindset_actions");
  const menuIcon = input.document.createElement("i");
  menuIcon.className = "fas fa-ellipsis-v";
  menuButton.appendChild(menuIcon);
  actions.appendChild(menuButton);

  const menu = input.document.createElement("div");
  menu.className = "bindset-menu-dropdown";
  menu.dataset.bindset = bindsetName;
  appendManagementItems(input, menu, bindsetName);
  actions.appendChild(menu);
  header.appendChild(actions);
  element.appendChild(header);

  const content = input.document.createElement("div");
  content.className = `bindset-content ${section.isCollapsed ? "collapsed" : ""}`;
  if (section.keys.length === 0) {
    const empty = input.document.createElement("div");
    empty.className = "empty-section";
    empty.textContent = input.i18n.t("no_keys_in_bindset");
    content.appendChild(empty);
  } else {
    await appendBindsetKeys(input, content, keyMap, section.keys, bindsetName);
  }
  element.appendChild(content);
  return element;
}

/**
 * Build one detached key-browser graph from captured state. The returned graph
 * is inert: callers own listener registration, action dispatch, and commitment.
 *
 * @param {KeyBrowserGridInput} input
 * @returns {Promise<{ fragment: DocumentFragment, categorized: boolean }>}
 */
export async function renderKeyBrowserGrid(input) {
  const fragment = input.document.createDocumentFragment();
  const allKeys = Object.keys(input.primaryKeyMap);
  const keysWithCommands = Object.fromEntries(
    Object.entries(input.primaryKeyMap).filter(([, commands]) =>
      Boolean(commands?.length),
    ),
  );

  if (input.showBindsetSections) {
    const sections = projectBindsetSections(
      input.profile,
      input.primaryKeyMap,
      input.environment,
      input.viewState,
    );
    for (const [bindsetName, section] of Object.entries(sections)) {
      const keyMap =
        bindsetName === primaryBindset
          ? input.primaryKeyMap
          : input.profile.bindsets?.[bindsetName]?.[input.environment]?.keys ||
            {};
      fragment.appendChild(
        await createKeyBrowserBindsetSection(
          input,
          bindsetName,
          section,
          keyMap,
        ),
      );
    }
    return { fragment, categorized: true };
  }

  if (input.mode === "grid") {
    const sortedKeys = await input.sortKeys(allKeys);
    for (const keyName of sortedKeys) {
      fragment.appendChild(
        keyElementFor(input, keyName, input.primaryKeyMap, null),
      );
    }
    return { fragment, categorized: false };
  }

  const categories =
    input.mode === "key-types"
      ? await input.categorizeByType(input.primaryKeyMap, allKeys)
      : await input.categorizeByCommand(keysWithCommands, allKeys);
  const sortedCategories = Object.entries(categories).sort(
    ([, left], [, right]) => {
      if (left.priority !== right.priority)
        return (left.priority ?? 0) - (right.priority ?? 0);
      return left.name.localeCompare(right.name);
    },
  );
  const categoryMode = input.mode === "key-types" ? "key-type" : "command";
  for (const [categoryId, category] of sortedCategories) {
    fragment.appendChild(
      createKeyBrowserCategoryElement(
        input,
        categoryId,
        category,
        categoryMode,
        input.primaryKeyMap,
        null,
      ),
    );
  }
  return { fragment, categorized: true };
}
