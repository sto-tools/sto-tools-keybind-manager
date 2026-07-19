/** @typedef {import('./serviceTypes.js').StoredCommand} StoredCommand */

/**
 * @typedef {Object} MirroredCommandOptions
 * @property {boolean} [stabilize]
 * @property {boolean} [includePostPivot]
 */

/**
 * Materialize the canonical TrayExec-aware execution sequence without owning
 * parsing, persistence, EventBus, DOM, or application-global concerns.
 *
 * Plain commands and TrayExec commands excluded from palindromic generation
 * stay before the generated palindrome. An explicitly configured pivot group
 * replaces the implicit final TrayExec pivot.
 *
 * @param {StoredCommand[]} commands
 * @param {MirroredCommandOptions} [options]
 * @returns {string[]}
 */
export function planMirroredCommandSequence(
  commands,
  { stabilize = true, includePostPivot = true } = {},
) {
  if (!Array.isArray(commands)) return [];

  const entries = commands.flatMap((command) => {
    if (typeof command === "string") {
      return command
        ? [{ command, excluded: false, placement: undefined }]
        : [];
    }
    if (!command || typeof command.command !== "string" || !command.command) {
      return [];
    }
    return [
      {
        command: command.command,
        excluded: command.palindromicGeneration === false,
        placement: command.placement,
      },
    ];
  });

  if (!stabilize || entries.length <= 1) {
    return entries.map(({ command }) => command);
  }

  /** @type {string[]} */
  const beforePrePivot = [];
  /** @type {string[]} */
  const palindromic = [];
  /** @type {string[]} */
  const pivotGroup = [];

  for (const entry of entries) {
    const isTrayExec = /^(?:\+)?TrayExecByTray/.test(entry.command);
    if (!isTrayExec) {
      beforePrePivot.push(entry.command);
    } else if (entry.excluded) {
      if (entry.placement === "in-pivot-group") {
        pivotGroup.push(entry.command);
      } else {
        beforePrePivot.push(entry.command);
      }
    } else {
      palindromic.push(entry.command);
    }
  }

  let pivot = pivotGroup;
  let prePivot = palindromic;
  if (pivot.length === 0 && palindromic.length > 0) {
    pivot = [palindromic[palindromic.length - 1]];
    prePivot = palindromic.slice(0, -1);
  }

  const sequence = [...beforePrePivot, ...prePivot, ...pivot];
  return includePostPivot
    ? [...sequence, ...[...prePivot].reverse()]
    : sequence;
}
