import ValidatorBase from "./ValidatorBase.js";

export default class MaxLengthRule extends ValidatorBase {
  constructor() {
    super({
      id: "maxLength",
      defaultSeverity: "warning",
      messageKey: "command_chain_near_limit",
      tags: ["length", "performance"],
    });
  }

  /**
   * @param {import('./ValidatorBase.js').ValidationContext} ctx – { length, stabilized }
   * @returns {import('./ValidatorBase.js').ValidationResult | null}
   */
  validate(ctx) {
    const length = ctx.length ?? 0;
    if (length >= 990) {
      return {
        severity: "error",
        key: "command_chain_too_long",
        params: { length },
        defaultMessage: `Command chain exceeds safe length (${length}/999). It may fail in game.`,
      };
    }
    if (length >= 900) {
      return {
        params: { length },
        defaultMessage: `Command chain is ${length} characters; consider shortening (limit 999).`,
      };
    }
    return null;
  }
}
