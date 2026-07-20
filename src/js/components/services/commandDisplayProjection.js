/**
 * Project one parser result back to the exact command text used by mirrored
 * previews. Only TrayExec commands are rewritten; every other result keeps the
 * original command string.
 *
 * @param {string} commandString
 * @param {unknown} parseResult
 * @returns {string}
 */
export function normalizeParsedCommandForDisplay(commandString, parseResult) {
  const commands = /** @type {{ commands?: { 0?: unknown } }} */ (parseResult)
    .commands;
  const parsedCommand = commands && commands[0];
  if (!parsedCommand) return commandString;

  const { signature, parameters } = /** @type {{
   *   signature?: string,
   *   parameters?: Record<string, unknown>
   * }} */ (Object(parsedCommand));
  if (
    !signature ||
    (!signature.includes("TrayExecByTray") &&
      !signature.includes("TrayExecByTrayWithBackup")) ||
    !parameters
  ) {
    return commandString;
  }

  const params = parameters;
  const active = params.active !== undefined ? params.active : 1;
  const withBackup = signature.includes("TrayExecByTrayWithBackup");
  const fallbackCommand = withBackup
    ? "TrayExecByTrayWithBackup"
    : "TrayExecByTray";
  const baseCommand =
    typeof params.baseCommand === "string"
      ? params.baseCommand
      : fallbackCommand;
  const commandType = baseCommand.replace(/^\+/, "");
  const argumentsText = withBackup
    ? `${params.tray} ${params.slot} ${params.backup_tray} ${params.backup_slot}`
    : `${params.tray} ${params.slot}`;

  return active === 1
    ? `+${commandType} ${argumentsText}`
    : `${commandType} ${active} ${argumentsText}`;
}

/**
 * Format the legacy keybind preview used by chain-length validation. Its
 * stabilization rule intentionally mirrors every command and is distinct from
 * the TrayExec-aware execution-order planner.
 *
 * @param {string} key
 * @param {unknown} commands
 * @param {boolean} [stabilize]
 * @returns {string}
 */
export function formatCommandValidationPreview(
  key,
  commands,
  stabilize = false,
) {
  if (!Array.isArray(commands) || commands.length === 0) {
    return `${key} ""`;
  }

  let commandString;
  if (stabilize && commands.length > 1) {
    const strings = commands.map((command) =>
      typeof command === "string" ? command : command.command,
    );
    commandString = [...strings, ...strings.slice(0, -1).reverse()].join(
      " $$ ",
    );
  } else {
    commandString = commands
      .map((command) =>
        typeof command === "string"
          ? command
          : command.command || String(command),
      )
      .join(" $$ ");
  }

  return `${key} "${commandString}"`;
}
