/**
 * Materialize translated copy from a pure command-chain projection. Copy is
 * rebuilt on every render so language changes remain authoritative.
 *
 * @param {import('./uiTypes.js').I18nLike} i18n
 * @param {{
 *   status: string,
 *   environment: string,
 *   selectedName: string | null,
 *   commandCount: number
 * }} view
 */
export function materializeCommandChainViewCopy(i18n, view) {
  const isAlias = view.environment === "alias";
  const hasSelection = view.status === "empty" || view.status === "populated";

  if (!hasSelection || !view.selectedName) {
    return {
      title: i18n.t(
        isAlias ? "select_an_alias_to_edit" : "select_a_key_to_edit",
      ),
      preview: i18n.t(
        isAlias
          ? "select_an_alias_to_see_the_generated_command"
          : "select_a_key_to_see_the_generated_command",
      ),
      count: "0",
      empty: {
        icon: isAlias ? "fas fa-mask" : "fas fa-keyboard",
        title: i18n.t(isAlias ? "no_alias_selected" : "no_key_selected"),
        description: i18n.t(
          isAlias
            ? "select_alias_from_left_panel"
            : "select_key_from_left_panel",
        ),
      },
    };
  }

  const chainType = i18n.t(isAlias ? "alias_chain" : "command_chain");
  const title = i18n.t("chain_for_key", {
    chainType,
    key: view.selectedName,
    interpolation: { escapeValue: false },
  });
  const emptyPrefix = i18n.t(
    isAlias
      ? "click_add_command_to_start_building_your_alias_chain"
      : "click_add_command_to_start_building_your_command_chain",
  );

  return {
    title,
    preview: "",
    count: String(view.commandCount),
    empty:
      view.status === "empty"
        ? {
            icon: "fas fa-plus-circle",
            title: i18n.t("no_commands"),
            description: `${emptyPrefix} ${view.selectedName}.`,
          }
        : null,
  };
}

/**
 * Build the command-chain empty card without parsing profile-owned names or
 * translated copy as HTML.
 *
 * @param {Document} document
 * @param {{ icon: string, title: string, description: string }} content
 * @returns {HTMLElement}
 */
export function createCommandChainEmptyState(
  document,
  { icon, title, description },
) {
  const emptyState = document.createElement("div");
  emptyState.id = "emptyState";
  emptyState.className = "empty-state show";

  const iconElement = document.createElement("i");
  iconElement.className = icon;

  const titleElement = document.createElement("h4");
  titleElement.textContent = title;

  const descriptionElement = document.createElement("p");
  descriptionElement.textContent = description;

  emptyState.replaceChildren(iconElement, titleElement, descriptionElement);
  return emptyState;
}
