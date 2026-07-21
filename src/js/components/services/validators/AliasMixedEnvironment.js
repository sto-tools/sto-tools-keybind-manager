import ValidatorBase from "./ValidatorBase.js";
import { flattenedCommands } from "../../../data.js";

/** @param {string} cmdString */
function getEnvironmentForCommand(cmdString) {
  if (!cmdString) return null;
  const token = cmdString.trim().split(/\s+/)[0].toLowerCase();
  for (const key in flattenedCommands) {
    const def = flattenedCommands[key];
    if (def && def.command && def.command.toLowerCase() === token) {
      return def.environment || null;
    }
  }
  return null;
}

export default class AliasMixedEnvironmentRule extends ValidatorBase {
  constructor() {
    super({
      id: "aliasMixedEnvironment",
      defaultSeverity: "warning",
      messageKey: "alias_mixed_environment_warning",
    });
  }

  /**
   * @param {import('./ValidatorBase.js').ValidationContext} ctx
   * @returns {import('./ValidatorBase.js').ValidationResult | null}
   */
  validate(ctx) {
    const { isAlias, commands } = ctx;
    if (!isAlias || !Array.isArray(commands)) return null;

    let hasSpace = false;
    let hasGround = false;

    for (const c of commands) {
      const str = typeof c === "string" ? c : c.command || "";
      const env = getEnvironmentForCommand(str);
      if (env === "space") hasSpace = true;
      else if (env === "ground") hasGround = true;
      if (hasSpace && hasGround) break;
    }

    if (hasSpace && hasGround) {
      return {
        severity: "warning",
        key: "alias_mixed_environment_warning",
        defaultMessage:
          "Alias contains both space-only and ground-only commands; consider splitting for reliability.",
      };
    }
    return null;
  }
}
