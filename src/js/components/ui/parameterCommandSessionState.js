/** @typedef {import('../../types/rpc/parameters-preferences.js').ParameterCommandDefinition} ParameterCommandDefinition */
/**
 * @typedef {{
 *   mode: 'add',
 *   categoryId: string,
 *   commandId: string,
 *   commandDef: ParameterCommandDefinition
 * } | {
 *   mode: 'edit',
 *   categoryId: string,
 *   commandId: string,
 *   commandDef: ParameterCommandDefinition,
 *   command: Record<string, unknown>,
 *   target: import('../../types/events/commands.js').CommandEditTarget
 * }} ParameterCommandDescriptor
 */

/** @param {unknown} value @returns {value is Record<string, unknown>} */
export function isParameterSessionRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** @param {unknown} value @returns {Record<string, unknown> | null} */
export function commandParameters(value) {
  if (
    !isParameterSessionRecord(value) ||
    !isParameterSessionRecord(value.parameters)
  ) {
    return null;
  }
  return value.parameters;
}

/** @param {ParameterCommandDescriptor | null | undefined} descriptor */
export function projectCurrentParameterCommand(descriptor) {
  if (!descriptor) return null;
  return descriptor.mode === "edit"
    ? {
        categoryId: descriptor.categoryId,
        commandId: descriptor.commandId,
        commandDef: descriptor.commandDef,
        editIndex: descriptor.target.index,
        originalCommand: descriptor.command,
        isEditing: true,
      }
    : {
        categoryId: descriptor.categoryId,
        commandId: descriptor.commandId,
        commandDef: descriptor.commandDef,
      };
}
