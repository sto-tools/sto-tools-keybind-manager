/**
 * @typedef {'before-pre-pivot' | 'in-pivot-group'} CommandPlacement
 * @typedef {{
 *   command: string,
 *   placement?: CommandPlacement,
 *   palindromicGeneration?: boolean,
 * }} RichPreviewCommand
 */

/**
 * Format one bind-to-alias preview without consulting service, UI, or storage
 * state. Malformed command entries retain the historical empty-chain fallback.
 *
 * @param {string | null | undefined} aliasName
 * @param {unknown} commands
 * @returns {string}
 */
export function formatCommandChainAliasPreview(aliasName, commands) {
  if (!aliasName) return "";

  const emptyPreview = `alias ${aliasName} <&  &>`;
  try {
    if (!Array.isArray(commands)) return emptyPreview;

    const commandStrings = commands
      .map((command) => {
        if (command === null || command === undefined) return "";
        if (typeof command === "string") return command;
        return (
          /** @type {{ command?: unknown }} */ (Object(command)).command || ""
        );
      })
      .filter(Boolean);

    if (commandStrings.length === 0) return emptyPreview;
    return `alias ${aliasName} <& ${commandStrings.join(" $$ ")} &>`;
  } catch {
    return emptyPreview;
  }
}

/**
 * Preserve the exact command fields accepted by the retained mirroring RPC.
 * Sparse entries are removed by the historical filter step.
 *
 * @param {Array<string | RichPreviewCommand>} commands
 * @returns {RichPreviewCommand[]}
 */
export function projectMirroringCommands(commands) {
  return commands
    .map((command) =>
      typeof command === "string"
        ? { command }
        : {
            command: command.command,
            placement: command.placement,
            palindromicGeneration: command.palindromicGeneration,
          },
    )
    .filter(Boolean);
}
