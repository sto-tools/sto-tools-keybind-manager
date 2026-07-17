import {
  hasOwnDataField,
  isDataRecord,
  setOwnDataField,
} from "./jsonDataBoundary.js";

/** @param {Record<string, unknown>} commands */
function repairNullableCommandMap(commands) {
  let changed = false;
  for (const [key, commandList] of Object.entries(commands)) {
    if (commandList !== null) continue;
    setOwnDataField(commands, key, []);
    changed = true;
  }
  return changed;
}

/**
 * Repair only malformed nullable command containers in an otherwise validated
 * stored alias map. Supported string, array, and object representations remain
 * equivalent after JSON serialization.
 * @param {Record<string, unknown>} aliases
 */
export function repairNullableAliasCommands(aliases) {
  let changed = false;
  for (const alias of Object.values(aliases)) {
    if (
      isDataRecord(alias) &&
      hasOwnDataField(alias, "commands") &&
      alias.commands === null
    ) {
      alias.commands = [];
      changed = true;
    }
  }
  return changed;
}

/** @param {unknown} binding */
function repairEnvironmentBinding(binding) {
  if (!isDataRecord(binding)) return false;
  let changed = false;
  if (isDataRecord(binding.keys)) {
    changed = repairNullableCommandMap(binding.keys) || changed;
  }
  if (isDataRecord(binding.aliases)) {
    changed = repairNullableAliasCommands(binding.aliases) || changed;
  }
  return changed;
}

/** @param {unknown} environments */
function repairEnvironmentMap(environments) {
  if (!isDataRecord(environments)) return false;
  let changed = false;
  for (const binding of Object.values(environments)) {
    changed = repairEnvironmentBinding(binding) || changed;
  }
  return changed;
}

/**
 * Repair nullable command containers in a validated build-based/hybrid stored
 * profile without rewriting any supported string, array, or rich-command form.
 * @param {Record<string, unknown>} profile
 */
export function repairStoredProfileCommandNulls(profile) {
  let changed = false;
  if (isDataRecord(profile.keys)) {
    changed = repairNullableCommandMap(profile.keys) || changed;
  }
  if (isDataRecord(profile.keybinds)) {
    for (const commands of Object.values(profile.keybinds)) {
      if (!isDataRecord(commands)) continue;
      changed = repairNullableCommandMap(commands) || changed;
    }
  }
  if (isDataRecord(profile.aliases)) {
    changed = repairNullableAliasCommands(profile.aliases) || changed;
  }
  if (isDataRecord(profile.builds)) {
    changed = repairEnvironmentMap(profile.builds) || changed;
  }
  if (isDataRecord(profile.bindsets)) {
    for (const environments of Object.values(profile.bindsets)) {
      changed = repairEnvironmentMap(environments) || changed;
    }
  }
  return changed;
}
