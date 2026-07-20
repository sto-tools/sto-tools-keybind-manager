/** @typedef {import('../services/commandChainListProjection.js').CommandChainRowProjection} CommandChainRowProjection */

/**
 * Build one inert, keyboard-operable group separator. All translated and
 * profile-derived copy is assigned as text rather than parsed as markup.
 *
 * @param {Document} document
 * @param {{
 *   groupType: import('../../types/events/base.js').CommandGroupType,
 *   title: string,
 *   hint: string,
 *   count: number,
 *   collapsed: boolean,
 *   renderToken: string
 * }} view
 * @returns {HTMLElement}
 */
export function createCommandGroupSeparator(
  document,
  { groupType, title, hint, count, collapsed, renderToken },
) {
  const separator = document.createElement("div");
  separator.className = "command-group-separator";
  separator.dataset.group = groupType;

  const header = document.createElement("button");
  header.type = "button";
  header.className = "group-header";
  header.dataset.group = groupType;
  header.dataset.renderToken = renderToken;
  header.dataset.action = "commandchain-group-header";
  header.setAttribute("aria-expanded", String(!collapsed));

  const groupInfo = document.createElement("span");
  groupInfo.className = "group-info";

  const twisty = document.createElement("i");
  twisty.className = `fas fa-chevron-right twisty${collapsed ? " collapsed" : ""}`;
  twisty.setAttribute("aria-hidden", "true");

  const titleElement = document.createElement("span");
  titleElement.className = "group-title";
  titleElement.textContent = title;

  const countElement = document.createElement("span");
  countElement.className = "group-count";
  countElement.textContent = `(${count})`;

  groupInfo.append(twisty, titleElement, countElement);
  header.append(groupInfo);

  if (hint) {
    const hintElement = document.createElement("span");
    hintElement.className = "group-hint";
    hintElement.textContent = hint;
    header.append(hintElement);
  }

  separator.append(header);
  return separator;
}

/**
 * @param {Document} document
 * @param {Readonly<import('../services/commandChainListProjection.js').CommandRowAction>} action
 */
function createCommandActionButton(document, action) {
  const button = document.createElement("button");
  button.type = "button";
  button.classList.add("command-action-btn");

  switch (action.kind) {
    case "edit":
      button.classList.add("btn-edit");
      break;
    case "delete":
      button.classList.add("btn-delete");
      break;
    case "toggle-palindromic":
      button.classList.add("toolbar-toggle", "btn-palindromic-toggle");
      break;
    case "toggle-placement":
      button.classList.add("toolbar-toggle", "btn-placement-toggle");
      break;
    case "move-up":
      button.classList.add("btn-up");
      break;
    case "move-down":
      button.classList.add("btn-down");
      break;
  }

  if (action.danger) button.classList.add("command-action-btn-danger");
  if (action.active) button.classList.add("active");
  if (action.title) {
    button.title = action.title;
    button.setAttribute("aria-label", action.title);
  }
  if (action.disabled) button.disabled = true;
  if (action.commandIndex !== undefined) {
    button.dataset.commandIndex = String(action.commandIndex);
  }
  if (action.dataAction) button.dataset.action = action.dataAction;

  if (
    action.kind === "toggle-palindromic" ||
    action.kind === "toggle-placement"
  ) {
    button.setAttribute("aria-pressed", String(action.active === true));
  }
  if (action.placeholder) {
    button.classList.add("btn-placeholder");
    button.disabled = true;
    button.setAttribute("aria-hidden", "true");
    button.style.visibility = "hidden";
  }

  const icon = document.createElement("i");
  icon.className = action.iconClass;
  icon.setAttribute("aria-hidden", "true");
  button.append(icon);
  return button;
}

/**
 * Materialize one detached command row without parsing any dynamic value as
 * HTML or attaching listeners. Delegated interactions consume only its typed
 * dataset fields after the facade commits the matching render token.
 *
 * @param {Document} document
 * @param {CommandChainRowProjection} view
 * @returns {HTMLElement}
 */
export function createCommandChainRow(document, view) {
  const row = document.createElement("div");
  row.className = "command-item-row";
  row.dataset.index = String(view.index);
  row.dataset.renderToken = view.renderToken;
  row.draggable = true;
  if (view.groupType) row.dataset.group = view.groupType;
  if (view.customizable) {
    row.dataset.parameters = "true";
    row.classList.add("customizable");
  }

  const number = document.createElement("div");
  number.className = "command-number";
  number.textContent = view.number;

  const content = document.createElement("div");
  content.className = "command-content";

  const icon = document.createElement("span");
  icon.className = "command-icon";
  icon.textContent = view.displayIcon;

  const text = document.createElement("span");
  text.className = "command-text";
  text.textContent = view.displayName;
  if (view.customizable) {
    const parameterIndicator = document.createElement("span");
    parameterIndicator.className = "param-indicator";
    parameterIndicator.title = view.parameterTitle;
    parameterIndicator.textContent = "⚙️";
    text.append(" ", parameterIndicator);
  }

  content.append(icon, text);
  if (view.warning) {
    const warning = document.createElement("span");
    warning.className = "command-warning-icon";
    warning.title = view.warning.text;
    warning.dataset.i18nTitle = view.warning.key;
    const warningIcon = document.createElement("i");
    warningIcon.className = "fas fa-exclamation-triangle";
    warningIcon.setAttribute("aria-hidden", "true");
    warning.append(warningIcon);
    content.append(warning);
  }

  const commandType = document.createElement("span");
  commandType.className = "command-type";
  if (view.commandTypeClass) commandType.classList.add(view.commandTypeClass);
  commandType.textContent = view.commandType;

  const actions = document.createElement("div");
  actions.className = "command-actions";
  actions.append(
    ...view.actions.map((action) =>
      createCommandActionButton(document, action),
    ),
  );

  row.replaceChildren(number, content, commandType, actions);
  return row;
}
